import { NextRequest, NextResponse } from 'next/server';
import { put } from '@/lib/storage';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { cropTikzSvgToContent, rasterizeTikzSvgToPng } from '@/lib/tikzCrop';

// POST /api/upload-tikz-svg — GV gọi lúc "Lưu"/"Xuất bản" đề, đẩy từng SVG
// TikZ đã biên dịch (đang nằm trong svgMap ở ExamBuilder.tsx, chỉ sống
// trong bộ nhớ tab hiện tại) lên Vercel Blob thành URL bền vững — thay cho
// cách cũ nhúng THẲNG chuỗi SVG vào raw_data.tikz_list mỗi lần lưu, khiến
// body của request PATCH/POST phình to dần theo số hình trong đề, gây lỗi
// 413 Payload Too Large khi đề có đủ nhiều hình.
//
// Cùng kiến trúc với /api/upload-exam-image (ảnh cứng ngoài tikz), chỉ khác
// input là 1 chuỗi SVG text (gửi JSON) thay vì file nhị phân (gửi FormData).
//
// CẦN ĐĂNG NHẬP — giống upload-exam-image, chỉ GV đã xác thực mới được tải
// lên (tránh bị lạm dụng làm nơi lưu trữ file miễn phí).
//
// KHÔNG lồng theo examId — cùng lý do với upload-exam-image: đề MỚI (chưa
// từng lưu) chưa có _id thật. Nhận draftId tạm (GV tự sinh phía client,
// Date.now()) chỉ để gom nhóm các hình trong 1 lần lưu/xuất bản.
// THÊM MỚI (26-7, "có thêm thời gian để up ảnh không"): mặc định Vercel giới
// hạn thời gian chạy 1 serverless function khá ngắn (10-15s tuỳ gói) — mạng
// chậm + hình TikZ nặng (nhiều điểm dữ liệu) cộng dồn thời gian cắt/nén SVGO
// dễ bị nền tảng NGẮT NGANG giữa chừng trước khi kịp trả lời, dù code không
// hề có lỗi logic gì. Khai báo maxDuration để xin thêm thời gian chạy cho
// route này (client vẫn tự retry ở uploadTikzSvgsForSave nếu route này vẫn
// không kịp trong thời gian mới).
export const maxDuration = 60;

// SỬA (26-7, khiếu nại "PNG chuyển từ SVG hiện to khủng khiếp trên máy
// tính, còn SVG thường thì bình thường"): NGUYÊN NHÂN — PNG rasterize luôn
// có kích thước PIXEL THẬT cố định (1600px chiều rộng) làm "kích thước tự
// nhiên" khi trình duyệt hiển thị <img>, trong khi SVG hiển thị đúng kích
// thước LOGIC nhỏ hơn nhiều (theo viewBox thật của hình TikZ, thường chỉ
// vài trăm px) — 2 loại file lệch hẳn "kích thước tự nhiên" dù cùng 1 nội
// dung hình. SỬA: trả thêm w/h = kích thước LOGIC (viewBox đã cắt, ĐÚNG
// đơn vị mà 1 bản SVG bình thường sẽ tự nhiên hiển thị) kèm theo url — nơi
// hiển thị (renderImageOrTikzToken, examRender.tsx) dùng con số này để set
// CSS width/height TƯỜNG MINH cho cả 2 loại file, không còn phụ thuộc vào
// "kích thước tự nhiên" thật của file (vốn chỉ đúng với SVG, sai với PNG).
function extractLogicalDims(svg: string): { w: number; h: number } | null {
  const tagMatch = /<svg\b[^>]*>/i.exec(svg);
  if (!tagMatch) return null;
  const tag = tagMatch[0];
  const wMatch = /\bwidth="([\d.]+)"/i.exec(tag);
  const hMatch = /\bheight="([\d.]+)"/i.exec(tag);
  if (!wMatch || !hMatch) return null;
  const w = Number(wMatch[1]);
  const h = Number(hMatch[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

const MAX_SVG_BYTES = 5 * 1024 * 1024; // 5MB — giới hạn cuối cùng cho SVG, kiểm tra SAU khi đã cắt viewBox + nén SVGO
const MAX_RAW_SVG_BYTES = 40 * 1024 * 1024; // 40MB — chặn sớm payload thô bất thường (trước khi tốn công cắt/nén), không phải giới hạn thật của tính năng
// THÊM MỚI (khiếu nại: "hình TikZ code phức tạp thường không tải lên được,
// báo lỗi quá nặng dù đã nén"): trần cho bản PNG dự phòng (xem
// rasterizeTikzSvgToPng) — ảnh raster ở độ phân giải cố định (1600px) hầu
// như luôn nhỏ hơn 5MB rất nhiều, trần 8MB ở đây chỉ để chặn trường hợp
// bất thường (SVG hỏng khiến resvg render ra ảnh rác), không phải giới hạn
// thật sẽ chạm tới trong thực tế.
const MAX_PNG_FALLBACK_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    // SỬA GỐC (26-7, khiếu nại "hình TikZ quá nặng, tải lên không được dù
    // đã có chỗ rơi về PNG"): NGUYÊN NHÂN THẬT là giới hạn CỨNG 4.5MB cho
    // body request/response của 1 Vercel Function (giới hạn hạ tầng, không
    // sửa được bằng config trong code) — SVG càng nặng càng dễ vượt ngưỡng
    // này TRƯỚC KHI route kịp chạy dòng code cắt/nén/rasterize nào (Vercel
    // chặn ở cổng vào, trả 413 thẳng). Xem giải thích đầy đủ tại
    // rasterizeSvgToPngBlobClientSide (ExamBuilder.tsx) — nơi gọi giờ tự
    // rasterize sang PNG NGAY TRONG TRÌNH DUYỆT cho các SVG có khả năng
    // chạm ngưỡng, rồi gửi PNG (luôn nhẹ) bằng multipart/FormData thay vì
    // JSON. Nhánh dưới đây nhận đúng luồng đó — chỉ lưu thẳng PNG lên Blob,
    // KHÔNG cần cắt/nén/rasterize lại lần nữa (đã làm xong ở trình duyệt).
    const contentType0 = request.headers.get('content-type') || '';
    if (contentType0.includes('multipart/form-data')) {
      const form = await request.formData().catch(() => null);
      const file = form?.get('png');
      const tikzIdField = form?.get('tikzId');
      const draftIdField = form?.get('draftId');
      // (26-7) Kích thước LOGIC mà trình duyệt đã đo trước khi rasterize —
      // xem giải thích ở extractLogicalDims phía trên. Client luôn biết sẵn
      // 2 số này (đo trước khi vẽ canvas), chỉ cần gửi kèm để route echo
      // lại nguyên văn trong response, không cần đo lại ở server.
      const wField = form?.get('w');
      const hField = form?.get('h');
      const clientW = typeof wField === 'string' ? Number(wField) : NaN;
      const clientH = typeof hField === 'string' ? Number(hField) : NaN;
      const logicalDims =
        Number.isFinite(clientW) && Number.isFinite(clientH) && clientW > 0 && clientH > 0
          ? { w: clientW, h: clientH }
          : null;
      if (!(file instanceof Blob) || typeof tikzIdField !== 'string' || !tikzIdField) {
        return NextResponse.json({ error: 'Thiếu dữ liệu ảnh PNG.' }, { status: 400 });
      }
      if (file.size > MAX_PNG_FALLBACK_BYTES) {
        return NextResponse.json(
          { error: 'Hình quá nặng dù đã rasterize sang PNG — mã TikZ có thể đang lỗi (vẽ ra nội dung bất thường).' },
          { status: 400 }
        );
      }
      const pngBuffer = Buffer.from(await file.arrayBuffer());
      const safeTikzId = tikzIdField.replace(/[^a-zA-Z0-9]/g, '_');
      const safeDraftId =
        typeof draftIdField === 'string' && draftIdField ? draftIdField.replace(/[^a-zA-Z0-9_-]/g, '') : 'noDraft';
      const pathname = `exam-tikz/${teacherId}/${safeDraftId}/${safeTikzId}-${Date.now()}.png`;
      const blob = await put(pathname, pngBuffer, { access: 'public', contentType: 'image/png' });
      return NextResponse.json(
        { url: blob.url, tikzId: tikzIdField, w: logicalDims?.w, h: logicalDims?.h },
        { status: 200 }
      );
    }

    const body = await request.json().catch(() => null);
    const svg = body?.svg;
    const tikzId = body?.tikzId;
    const draftId = body?.draftId;
    // (26-7) viewBox đã đo SẴN bằng trình duyệt lúc soạn đề (xem callback
    // onCropped trong TikzImage) — nếu có, cropTikzSvgToContent sẽ dùng
    // THẲNG, không tự đo lại bằng resvg. Kiểm tra dạng số hợp lệ ở đây,
    // không tin tưởng mù quáng dữ liệu từ client.
    const rawCropBBox = body?.cropBBox;
    const cropBBox =
      rawCropBBox &&
      typeof rawCropBBox === 'object' &&
      Number.isFinite(rawCropBBox.x) &&
      Number.isFinite(rawCropBBox.y) &&
      Number.isFinite(rawCropBBox.width) &&
      Number.isFinite(rawCropBBox.height) &&
      rawCropBBox.width > 0 &&
      rawCropBBox.height > 0
        ? { x: rawCropBBox.x, y: rawCropBBox.y, width: rawCropBBox.width, height: rawCropBBox.height }
        : undefined;

    if (typeof svg !== 'string' || !svg.trim()) {
      return NextResponse.json({ error: 'Thiếu nội dung SVG.' }, { status: 400 });
    }
    if (typeof tikzId !== 'string' || !tikzId) {
      return NextResponse.json({ error: 'Thiếu id hình.' }, { status: 400 });
    }
    if (!svg.includes('<svg')) {
      return NextResponse.json({ error: 'Nội dung không phải SVG hợp lệ.' }, { status: 400 });
    }
    // Chặn sớm payload thô BẤT THƯỜNG (vd tấn công) trước khi tốn công
    // cắt/nén — KHÔNG dùng làm giới hạn thật của tính năng (giới hạn thật
    // là MAX_SVG_BYTES, kiểm tra bên dưới trên bản ĐÃ cắt+nén).
    if (Buffer.byteLength(svg, 'utf-8') > MAX_RAW_SVG_BYTES) {
      return NextResponse.json({ error: 'Hình quá nặng, không xử lý được.' }, { status: 400 });
    }

    // Cắt sát viewBox + nén bằng SVGO NGAY LÚC UPLOAD (cropTikzSvgToContent
    // ở tikzCrop.ts đã gộp cả 2 bước) — để URL lưu lại luôn là bản gọn nhất,
    // mọi nơi tiêu thụ sau này (xem trước, Word, PDF) không cần xử lý lại.
    //
    // QUAN TRỌNG: kiểm tra 5MB PHẢI nằm SAU bước này, không phải trước —
    // hình TikZ nặng (nhiều điểm dữ liệu: đồ thị lấy mẫu mượt, lưới/hatching
    // mịn...) chính là loại hình CẦN cắt/nén nhất để lọt qua giới hạn; kiểm
    // tra trên bản THÔ (trước cắt/nén) sẽ chặn nhầm đúng những hình mà tính
    // năng này được sinh ra để cứu.
    const croppedSvg = cropTikzSvgToContent(svg, cropBBox) || svg;

    // THÊM MỚI (khiếu nại: "hình TikZ code phức tạp thường không tải lên
    // được, báo lỗi quá nặng dù đã nén"): TRƯỚC ĐÂY, nếu bản đã cắt+nén vẫn
    // vượt MAX_SVG_BYTES thì CHẶN LUÔN, báo lỗi — với hình có bản chất RẤT
    // nhiều điểm dữ liệu (đồ thị lấy mẫu mượt, lưới/hatching dày...), nén
    // vector cách nào cũng không đủ, nên hình này KHÔNG BAO GIỜ tải lên
    // được, dù nội dung hợp lệ. SỬA: rơi về PNG (rasterizeTikzSvgToPng, độ
    // phân giải cố định 1600px — luôn nhẹ, không phụ thuộc số điểm dữ liệu
    // gốc) làm phương án cuối, thay vì chặn hẳn. Đánh đổi: hình này mất khả
    // năng "phóng to không mất nét" (thành ảnh raster) — chấp nhận được vì
    // đây chỉ xảy ra với những hình quá phức tạp để hiển thị mượt ở mọi cỡ
    // dù là SVG.
    // (26-7) Đo kích thước LOGIC 1 LẦN từ bản SVG đã cắt — dùng làm w/h trả
    // về cho CẢ 2 nhánh bên dưới (SVG giữ nguyên, hoặc rơi về PNG). QUAN
    // TRỌNG: với nhánh PNG, w/h này KHÔNG PHẢI kích thước pixel thật của
    // file PNG (luôn cố định RASTER_FALLBACK_WIDTH_PX) — mà là kích thước
    // LOGIC của hình TikZ gốc, để nơi hiển thị (renderImageOrTikzToken)
    // biết hình này "đáng lẽ" to cỡ nào, không bị đánh lừa bởi độ phân giải
    // pixel cao hơn nhiều của ảnh raster.
    const logicalDims = extractLogicalDims(croppedSvg);

    let uploadBuffer: string | Buffer = croppedSvg;
    let contentType = 'image/svg+xml';
    let extension = 'svg';
    if (Buffer.byteLength(croppedSvg, 'utf-8') > MAX_SVG_BYTES) {
      const png = rasterizeTikzSvgToPng(croppedSvg);
      if (!png) {
        return NextResponse.json(
          { error: 'Hình quá nặng (trên 5MB) dù đã tối ưu, và không rasterize được sang PNG để thử phương án cuối — kiểm tra lại mã TikZ.' },
          { status: 400 }
        );
      }
      if (png.byteLength > MAX_PNG_FALLBACK_BYTES) {
        return NextResponse.json(
          { error: 'Hình quá nặng dù đã tối ưu và rasterize sang PNG — mã TikZ có thể đang lỗi (vẽ ra nội dung bất thường).' },
          { status: 400 }
        );
      }
      uploadBuffer = png;
      contentType = 'image/png';
      extension = 'png';
    }

    const safeTikzId = tikzId.replace(/[^a-zA-Z0-9]/g, '_');
    const safeDraftId = typeof draftId === 'string' && draftId ? draftId.replace(/[^a-zA-Z0-9_-]/g, '') : 'noDraft';
    const pathname = `exam-tikz/${teacherId}/${safeDraftId}/${safeTikzId}-${Date.now()}.${extension}`;

    const blob = await put(pathname, uploadBuffer, {
      access: 'public',
      contentType,
    });

    return NextResponse.json(
      { url: blob.url, tikzId, w: logicalDims?.w, h: logicalDims?.h },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi tải SVG TikZ lên (Lưu/Xuất bản đề):', err);
    return NextResponse.json(
      { error: 'Không tải hình lên được, thử lại.' },
      { status: 500 }
    );
  }
}
