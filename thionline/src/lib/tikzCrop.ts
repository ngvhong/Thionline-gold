// =====================================================================
// Cắt sát viewBox cho SVG TikZ NGAY LÚC LƯU ĐỀ (server) — tư vấn phiên
// trước: TikzImage (examRender.tsx/ExamBuilder.tsx) đã tự cắt sát bằng
// getBBox() phía TRÌNH DUYỆT, nhưng chỉ áp dụng khi XEM (soạn đề + học
// sinh làm bài). Bản xuất Word (examDocxExport.ts, dùng @resvg/resvg-js
// rasterize thẳng) và PDF KHÔNG đi qua trình duyệt nên không được cắt,
// vẫn dùng nguyên viewBox rộng do server TikZ (carot2026-tikz.hf.space)
// trả về -> đây là nơi khoảng trắng lớn "lộ" rõ nhất.
//
// Giải pháp: cắt 1 LẦN DUY NHẤT ở đây, ngay khi raw_data (chứa tikz_list)
// được lưu vào MongoDB (xem save-exam/route.ts và exams/[id]/route.ts).
// Từ đó mọi nơi tiêu thụ (xem trước, Word, PDF) đều đọc chung 1 bản SVG
// đã cắt sẵn — không cần cắt lại ở từng chỗ. Cắt bằng getBBox() phía
// trình duyệt (nếu còn chạy) coi như dự phòng, không hại gì vì idempotent
// (SVG đã sát viền thì đo lại ra kết quả gần như không đổi).
//
// QUAN TRỌNG: KHÔNG dùng resvg.cropByBBox()+toString() — cách đó yêu cầu
// resvg PARSE LẠI TOÀN BỘ rồi tự in ra 1 SVG mới (thường đổi <symbol>/
// <use> glyph thành <path> phẳng, có thể ảnh hưởng cơ chế đặt tiền tố id
// tránh trùng glyph giữa nhiều hình trên 1 trang — xem namespacedSvg
// trong examRender.tsx). Ở đây CHỈ dùng resvg để ĐO bbox, còn việc "cắt"
// là tự sửa 3 thuộc tính (viewBox/width/height/style) ngay trên chuỗi SVG
// GỐC, giữ nguyên 100% nội dung bên trong — đúng cách TikzImage đang làm
// phía trình duyệt, chỉ chuyển việc đo/ghi lên server.
// =====================================================================

import { Resvg } from '@resvg/resvg-js';
import { optimize, type Config } from 'svgo';

// =====================================================================
// Tối ưu (nén) chuỗi SVG bằng SVGO — SVG TikZ "thuần vector" (không ảnh
// nhúng) vẫn có thể rất nặng nếu hình có nhiều điểm dữ liệu (đồ thị vẽ
// mượt bằng lấy mẫu hàng nghìn điểm, lưới/hatching mịn, `\foreach` vẽ
// nhiều đường...) vì dvisvgm/pdf2svg xuất toạ độ với độ chính xác dư thừa
// (5-6 chữ số thập phân/điểm). SVGO gom toạ độ về ít chữ số hơn, dọn
// khoảng trắng/chú thích thừa... mà hình nhìn giống hệt — thường giảm
// 50-90% dung lượng.
//
// preset-default có plugin cleanupIds tự đổi tên id NGẮN HƠN (a, b, c...)
// và tự cập nhật mọi chỗ tham chiếu (xlink:href, url(#...)) theo — ĐÃ
// kiểm tra: tham chiếu vẫn khớp 100% sau khi đổi tên, không ảnh hưởng cơ
// chế thêm tiền tố id để tránh trùng glyph giữa nhiều hình TikZ trên cùng
// 1 trang (namespacedSvg trong examRender.tsx chỉ cộng thêm tiền tố vào
// bất kỳ id nào đang có, không quan tâm id đó tên gì).
//
// KHÔNG override removeViewBox: ở SVGO v3, plugin này nằm trong
// preset-default và có thể xoá viewBox nếu nó trùng width/height — nhưng
// cropTikzSvgToContent() đã XOÁ HẲN width/height/style trước khi gọi tới
// đây, nên removeViewBox (nếu có chạy) không có gì để so khớp và không xoá
// nhầm. Từ SVGO v4, removeViewBox đã bị bỏ hẳn khỏi preset-default (không
// còn tự xoá viewBox nữa) — cố override 1 plugin không có trong preset sẽ
// bị SVGO báo lỗi "not part of preset-default" và crash cả build. Bỏ hẳn
// override để chạy đúng trên cả 2 mốc phiên bản.
// TẮT mergeStyles/inlineStyles/minifyStyles: cả 3 plugin này xử lý thẻ
// <style> CSS bên trong SVG, dùng thư viện phụ `csso`/`css-tree` phía dưới.
// SVG TikZ (dvisvgm/pdf2svg xuất ra) KHÔNG có <style> CSS nào (toàn
// <path>/<use> glyph) nên tắt 3 plugin này không mất tối ưu gì đáng kể —
// nhưng lại né được 1 lỗi hạ tầng của Vercel: `css-tree` cần 1 file dữ
// liệu (data/patch.json) mà cơ chế "output file tracing" của Vercel không
// tự gói vào serverless function (do file đó được require bằng đường dẫn
// động), gây lỗi runtime "Cannot find module '../data/patch.json'" ở
// PRODUCTION dù chạy `next build`/`npm run dev` ở máy không hề báo lỗi gì
// (máy có đủ node_modules, Vercel thì không).
const SVGO_CONFIG: Config = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          mergeStyles: false,
          inlineStyles: false,
          minifyStyles: false,
          // THÊM MỚI (khiếu nại "hình TikZ code phức tạp thường không tải
          // lên được, quá nặng dù đã nén"): dvisvgm/pdf2svg xuất toạ độ với
          // 5-6 chữ số thập phân/điểm — dư chính xác hơn nhiều so với mức
          // mắt người phân biệt được trên màn hình. Ép floatPrecision
          // xuống 2 (mặc định SVGO là 3) giúp siết thêm dung lượng đúng ở
          // NHỮNG HÌNH NẶNG NHẤT (nhiều điểm dữ liệu) — nơi phần lớn dung
          // lượng nằm ở chữ số toạ độ, không phải cấu trúc SVG.
          convertPathData: { floatPrecision: 2 },
        },
      },
    },
  ],
};

// Tối ưu 1 chuỗi SVG bằng SVGO. KHÔNG BAO GIỜ ném lỗi ra ngoài và LUÔN trả
// về 1 chuỗi SVG hợp lệ — nếu SVGO lỗi/parse hỏng thì giữ nguyên bản gốc
// (đồng nhất với triết lý "1 hình lỗi không làm hỏng cả việc lưu đề" của
// cropTikzSvgToContent bên dưới).
export function optimizeSvg(svg: string): string {
  try {
    const result = optimize(svg, SVGO_CONFIG);
    if (result && typeof result.data === 'string' && result.data.includes('<svg')) {
      return result.data;
    }
    return svg;
  } catch (err) {
    console.error('Lỗi SVGO tối ưu SVG TikZ (giữ nguyên bản gốc):', err);
    return svg;
  }
}

// Đồng bộ với padding phía trình duyệt (examRender.tsx / ExamBuilder.tsx,
// test biên 17-7: 1.6 -> 0.5). Nếu sau này đổi 1 bên thì nhớ đổi bên kia
// theo, để "độ sát viền" giữa xem trước và Word/PDF không lệch nhau.
const CROP_PADDING = 0.5;

// SỬA LỖI (khiếu nại: "đường ngang trên cùng của khung bảng biến thiên bị
// cắt cụt"): CROP_PADDING cố định 0.5 chỉ đủ cho nét mảnh — resvg.getBBox()
// (như getBBox() của trình duyệt) đo bbox theo TÂM đường path, KHÔNG tính
// bề dày nét vẽ, nên viền/khung có line width dày nằm sát mép ngoài cùng
// của hình bị hụt mất nửa nét khi cắt sát viewBox. NHÁNH NÀY chỉ chạy khi
// KHÔNG có clientBBox (đề cũ lưu trước khi có cơ chế đo bằng trình duyệt,
// hoặc SVG tải lên thẳng qua upload-tikz-svg) — không có DOM/CTM để đo
// chính xác bằng getComputedStyle() như phía trình duyệt, nên chỉ tìm bề
// dày nét LỚN NHẤT bằng cách quét trực tiếp thuộc tính/CSS "stroke-width"
// trong chuỗi SVG gốc (dvisvgm/pdf2svg xuất ra ở CHUNG 1 hệ toạ độ phẳng,
// không lồng transform scale phức tạp như DOM CTM, nên không cần quy đổi
// thêm) — phương án gần đúng, đủ dùng để không cắt lẹm nét, KHÔNG cần
// chính xác tuyệt đối vì đây chỉ là lưới an toàn dự phòng.
function getMaxStrokeHalfWidth(svg: string): number {
  let max = 0;
  const attrRegex = /stroke-width\s*=\s*"([\d.]+)"/gi;
  const styleRegex = /stroke-width\s*:\s*([\d.]+)/gi;
  for (const re of [attrRegex, styleRegex]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(svg))) {
      const v = parseFloat(m[1]);
      if (Number.isFinite(v) && v > max) max = v;
    }
  }
  return max / 2;
}

// Tìm đúng thẻ mở <svg ...> ĐẦU TIÊN (phần tử gốc) — không đụng tới bất kỳ
// <svg> nào khác nếu có lồng bên trong (không nên xảy ra với SVG do
// pdf2svg xuất, nhưng phòng hờ vẫn chỉ khớp thẻ đầu tiên).
function findRootSvgOpenTag(svg: string): { tag: string; start: number; end: number } | null {
  const match = /<svg\b[^>]*>/i.exec(svg);
  if (!match) return null;
  return { tag: match[0], start: match.index, end: match.index + match[0].length };
}

// Ghi đè viewBox, XOÁ width/height/style cũ trên thẻ <svg> gốc — width/
// height/style cũ (do pdf2svg gắn cứng, ví dụ style="width:400.03pt;...")
// LUÔN thắng viewBox khi trình duyệt/resvg tính kích thước hiển thị, nên
// phải xoá hẳn thay vì chỉ thêm viewBox mới (giữ lại sẽ vô tác dụng).
// SỬA LỖI (khiếu nại: "hình cho trang học sinh/lời giải/xem mô phỏng to
// bất thường so với trang Xem đề" — dù cùng 1 nguồn SVG): TRƯỚC ĐÂY hàm
// này XOÁ width/height cũ nhưng KHÔNG set lại width/height MỚI, chỉ còn
// lại viewBox. Với SVG hiển thị INLINE (dangerouslySetInnerHTML, như ở tab
// "Xem đề") việc này vô hại vì TikzImage tự đo lại bằng getBBox() và set
// thẳng style.width/height bằng JS. NHƯNG những trang đã Xuất bản lại hiện
// hình qua thẻ <img src="blobUrl"> (xem nhánh isUrl trong examRender.tsx)
// — SVG này được trình duyệt tải như 1 FILE ảnh độc lập, không có DOM/JS
// nào chỉnh sửa được nữa. Theo đặc tả SVG, <svg> có viewBox nhưng KHÔNG có
// width/height sẽ được trình duyệt coi là kích thước mặc định 300x150 khi
// dùng làm ảnh ngoài (<img>) — hoàn toàn không khớp tỉ lệ viewBox thật, làm
// nội dung bị phóng to/co méo sai lệch. SỬA: luôn ghi lại width/height MỚI
// bằng đúng width/height của viewBox đã cắt (đơn vị số nguyên/thập phân,
// không kèm đơn vị pt/px, để trình duyệt hiểu là px theo đúng chuẩn SVG) —
// giữ hành vi "trần" tối đa do CSS (maxWidth) quyết định như cũ, chỉ sửa
// đúng tỉ lệ khung chiếu mặc định.
function rewriteRootSvgTag(
  oldTag: string,
  vb: { x: number; y: number; width: number; height: number }
): string {
  let tag = oldTag;
  tag = tag.replace(/\swidth="[^"]*"/i, '');
  tag = tag.replace(/\sheight="[^"]*"/i, '');
  tag = tag.replace(/\sstyle="[^"]*"/i, '');
  const vbAttr = `viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" width="${vb.width}" height="${vb.height}"`;
  if (/\sviewBox="[^"]*"/i.test(tag)) {
    tag = tag.replace(/\sviewBox="[^"]*"/i, ` ${vbAttr}`);
  } else {
    tag = tag.replace(/^<svg\b/i, `<svg ${vbAttr}`);
  }
  return tag;
}

// Cắt sát 1 chuỗi SVG TikZ theo đúng phần nội dung đã vẽ. Trả về SVG GỐC
// nguyên vẹn nếu: không parse được (SVG hỏng), không đo được bbox hợp lệ,
// hoặc không tìm thấy thẻ <svg> gốc — KHÔNG BAO GIỜ ném lỗi ra ngoài, để
// 1 hình lỗi không làm hỏng cả việc lưu đề.
export function cropTikzSvgToContent(
  svg: string | undefined,
  // (26-7, sửa khiếu nại "preview đầy đủ nhưng Lưu đề xong bị mất nửa
  // dưới"): viewBox ĐÃ ĐO SẴN bằng trình duyệt (TikzImage, getBBox() +
  // getVisibleContentBBox() thật, xem callback onCropped ở examRender.tsx/
  // ExamBuilder.tsx) — nếu có, DÙNG THẲNG, KHÔNG đo lại bằng resvg nữa.
  // Lý do: resvg (thư viện Rust) và trình duyệt (Chrome) tính bbox KHÁC
  // NHAU với SVG có <marker>/<text> (mũi tên trục, nhãn chữ) — cùng 1
  // ngưỡng, 2 bên có thể ra kết quả khác nhau, khiến server cắt sai vào
  // nội dung thật dù trình duyệt đo đúng. Chỉ khi KHÔNG có clientBBox (vd
  // hình cũ lưu từ trước khi có cơ chế này, hoặc lỗi không đo được ở
  // trình duyệt) mới rơi về cách cũ (đo bằng resvg) làm phương án dự phòng.
  clientBBox?: { x: number; y: number; width: number; height: number }
): string | undefined {
  if (!svg || typeof svg !== 'string') return svg;
  // `working` là bản sẽ được trả về (sau khi thử cắt bbox) — LUÔN chạy
  // optimizeSvg() trên nó trước khi return, dù cắt được hay không, để
  // 2 nơi gọi hàm này (crop-on-save trong applyTikzCropToRawData, và
  // upload-tikz-svg/route.ts) đều tự động được hưởng lợi nén SVGO mà
  // không cần sửa gì thêm ở phía gọi.
  let working = svg;

  // NHÁNH MỚI: có clientBBox hợp lệ -> dùng thẳng, bỏ qua toàn bộ đo bằng
  // resvg bên dưới. clientBBox đã CỘNG SẴN padding (xem TikzImage), nên
  // không cộng CROP_PADDING thêm lần nữa ở đây.
  if (
    clientBBox &&
    Number.isFinite(clientBBox.x) &&
    Number.isFinite(clientBBox.y) &&
    Number.isFinite(clientBBox.width) &&
    Number.isFinite(clientBBox.height) &&
    clientBBox.width > 0 &&
    clientBBox.height > 0
  ) {
    const rootTag = findRootSvgOpenTag(svg);
    if (rootTag) {
      const newTag = rewriteRootSvgTag(rootTag.tag, clientBBox);
      working = svg.slice(0, rootTag.start) + newTag + svg.slice(rootTag.end);
    }
    return optimizeSvg(working);
  }

  try {
    const resvg = new Resvg(svg);
    // SỬA LỖI (khiếu nại: "trang Xem đề cắt sát khoảng trống rồi, nhưng
    // trang học sinh/lời giải/xem mô phỏng (dùng SVG đã cắt ở ĐÂY, qua Blob
    // URL) lại trả về khoảng trống cũ"): resvg.getBBox() đo bbox HÌNH HỌC
    // THUẦN TUÝ — tính cả phần tử ẩn (opacity/display:none) và cả phần path
    // bị \clip trong TikZ che khuất vẽ ra rất xa (đã kiểm chứng bằng script
    // thử riêng: 1 path bị clip có thể làm bbox rộng gấp hàng chục lần vùng
    // nhìn thấy thật) — ĐÚNG loại lỗi mà phía trình duyệt (getVisibleContentBBox
    // trong examRender.tsx) đã viết cả trăm dòng để né. resvg.innerBBox() đo
    // tốt hơn nhiều (tự loại phần tử ẩn + tự áp clip-path).
    //
    // SỬA TIẾP (khiếu nại: "hình đồ thị 2 nhánh — cắt bay mất nguyên 1
    // nhánh"): LÚC ĐẦU dùng thẳng innerBBox() làm bbox cuối cùng (cả 4 phía)
    // — ĐÃ TÁI HIỆN ĐƯỢC bằng script thử riêng: với 1 số cấu trúc SVG,
    // innerBBox() tính HỤT bề ngang (trái/phải), cắt mất hẳn 1 nhánh đồ thị
    // nằm bên kia tiệm cận đứng (vd hàm phân thức bậc nhất/bậc nhất). Bên
    // trình duyệt (examRender.tsx, dòng "CHỈ áp dụng trên/dưới... không đụng
    // trái/phải") ĐÃ cố tình giới hạn y hệt lỗi này từ trước — chỉ tinh
    // chỉnh TRÊN/DƯỚI bằng bbox "nhìn thấy được", tuyệt đối giữ nguyên
    // TRÁI/PHẢI theo bbox hình học đầy đủ (an toàn hơn, chấp nhận thà dư
    // khoảng trống ngang còn hơn cắt mất nội dung). SỬA: áp dụng ĐÚNG giới
    // hạn đó ở đây — chỉ dùng innerBBox() để xét xem có "khoảng trống lớn"
    // ở đầu trên/dưới hay không (ngưỡng LARGE_GAP_THRESHOLD, cắt còn lại
    // SAFE_MARGIN đệm an toàn), x/width luôn lấy nguyên từ getBBox().
    const rawBBox = resvg.getBBox();
    const rawValid =
      rawBBox &&
      Number.isFinite(rawBBox.width) &&
      Number.isFinite(rawBBox.height) &&
      rawBBox.width > 0 &&
      rawBBox.height > 0;
    if (rawValid) {
      // Đồng bộ số với LARGE_GAP_THRESHOLD_PX/SAFE_MARGIN_PX trong
      // examRender.tsx/ExamBuilder.tsx (đơn vị viewBox gốc, không quy đổi
      // pt->px vì server không có DOM/CTM để nhân hệ số đó).
      const LARGE_GAP_THRESHOLD = 10;
      const SAFE_MARGIN = 5;
      let vTop = rawBBox.y;
      let vBottom = rawBBox.y + rawBBox.height;
      let visibleBBox: { x: number; y: number; width: number; height: number } | undefined;
      try {
        visibleBBox = resvg.innerBBox();
      } catch {
        visibleBBox = undefined;
      }
      if (
        visibleBBox &&
        Number.isFinite(visibleBBox.height) &&
        visibleBBox.height > 0
      ) {
        const extraTop = visibleBBox.y - rawBBox.y;
        const extraBottom = rawBBox.y + rawBBox.height - (visibleBBox.y + visibleBBox.height);
        if (extraTop > LARGE_GAP_THRESHOLD) vTop = visibleBBox.y - SAFE_MARGIN;
        if (extraBottom > LARGE_GAP_THRESHOLD) vBottom = visibleBBox.y + visibleBBox.height + SAFE_MARGIN;
      }
      const rootTag = findRootSvgOpenTag(svg);
      if (rootTag) {
        // Nới đệm thêm đúng bằng nửa bề dày nét dày nhất tìm được trong SVG
        // (xem getMaxStrokeHalfWidth ở trên) — hình chỉ có nét mảnh thì
        // padding gần như không đổi, chỉ hình có khung/viền dày mới được
        // nới thêm đủ để không mất nét.
        const padding = Math.max(CROP_PADDING, getMaxStrokeHalfWidth(svg) + CROP_PADDING);
        const newTag = rewriteRootSvgTag(rootTag.tag, {
          x: rawBBox.x - padding,
          y: vTop - padding,
          width: rawBBox.width + padding * 2,
          height: vBottom - vTop + padding * 2,
        });
        working = svg.slice(0, rootTag.start) + newTag + svg.slice(rootTag.end);
      }
    }
    // không đo được bbox hợp lệ, hoặc không tìm thấy thẻ <svg> gốc -> bỏ
    // qua bước cắt, giữ working = svg gốc, vẫn tiếp tục sang bước nén
  } catch {
    // SVG hỏng/resvg không parse được -> bỏ qua bước cắt, working = svg gốc
  }
  return optimizeSvg(working);
}

// THÊM MỚI (khiếu nại: "hình TikZ code phức tạp thường không tải lên
// được, báo lỗi quá nặng dù đã nén"): với hình TikZ vẽ RẤT nhiều đối tượng
// (đồ thị lấy mẫu mịn, lưới/hatching dày, nhiều \foreach lồng nhau...), cắt
// viewBox + nén SVGO (2 bước ở trên) đôi khi KHÔNG đủ — bản chất là vector
// có hàng chục nghìn điểm/toạ độ, dù nén cách nào dung lượng text vẫn còn
// rất lớn. Với NHỮNG HÌNH NÀY, ảnh raster (PNG) ở độ phân giải vừa đủ nhìn
// rõ nét thường NHẸ HƠN NHIỀU so với giữ nguyên dạng vector (đánh đổi: hết
// còn "phóng to không mất nét", nhưng đằng nào những hình quá phức tạp
// cũng thường không cần zoom sâu tới mức đó). Dùng làm PHƯƠNG ÁN CUỐI khi
// cropTikzSvgToContent() vẫn trả ra bản vượt trần dung lượng.
//
// RASTER_FALLBACK_WIDTH_PX: đủ lớn để hiện rõ nét ở cỡ hình 200% (trần
// hiện tại của thanh trượt "Cỡ hình") trên màn hình phân giải cao
// (retina/2x) mà không quá nặng — 1600px đủ dùng cho khung hiển thị rộng
// nhất hiện tại (~800px CSS) ở 2x pixel density.
const RASTER_FALLBACK_WIDTH_PX = 1600;

// Rasterize 1 chuỗi SVG (đã cắt+nén ở cropTikzSvgToContent) ra PNG bằng
// resvg-js — cùng thư viện/API đã dùng để xuất Word (examDocxExport.ts),
// chỉ đổi fitTo.value cho phù hợp khung hiển thị trên web thay vì trang
// A4. Trả về null nếu SVG hỏng/không rasterize được — nơi gọi tự quyết
// định giữ nguyên bản SVG gốc (dù vượt trần) hoặc báo lỗi, KHÔNG tự ném lỗi
// ra ngoài ở đây.
export function rasterizeTikzSvgToPng(svg: string): Buffer | null {
  try {
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: RASTER_FALLBACK_WIDTH_PX } });
    const png = resvg.render().asPng();
    return Buffer.from(png);
  } catch (err) {
    console.error('Lỗi rasterize SVG TikZ quá nặng sang PNG (phương án cuối):', err);
    return null;
  }
}

// Duyệt raw_data.tikz_list (nếu có) và cắt sát từng phần tử có field
// `svg`. KHÔNG sửa trực tiếp (mutate) raw_data truyền vào — trả về object
// MỚI, để 2 route gọi hàm này (save-exam POST, exams/[id] PATCH) không
// vô tình ảnh hưởng dữ liệu khác đang tham chiếu cùng object trong cùng
// request. Field nào không phải mảng tikz_list hợp lệ thì giữ nguyên
// raw_data như cũ, không đụng gì.
export function applyTikzCropToRawData<T>(rawData: T): T {
  if (!rawData || typeof rawData !== 'object') return rawData;

  const data = rawData as Record<string, unknown>;
  if (!Array.isArray(data.tikz_list)) return rawData;
  const croppedList = (data.tikz_list as Array<Record<string, unknown>>).map((item) => {
    if (!item || typeof item !== 'object' || typeof item.svg !== 'string') return item;
    const cb = item.cropBBox as { x: number; y: number; width: number; height: number } | undefined;
    return { ...item, svg: cropTikzSvgToContent(item.svg as string, cb) };
  });
  return { ...data, tikz_list: croppedList } as T;
}

// =====================================================================
// "Mồi" lại nội dung SVG từ url (Vercel Blob) cho những hình TikZ chỉ có
// {id, code, url} — kể từ khi ExamBuilder.tsx đổi sang tải SVG lên Blob
// thay vì nhúng thẳng chuỗi SVG vào raw_data lúc Lưu/Xuất bản (xem
// uploadTikzSvgsForSave() trong ExamBuilder.tsx — mục đích giảm dung lượng
// body request, tránh lỗi 413 khi đề có nhiều hình).
//
// Bản xuất Word/PDF (examDocxExport.ts, dùng @resvg/resvg-js rasterize
// THẲNG chuỗi SVG) cần NỘI DUNG SVG thật, không dùng được url suông — nên
// phải tải về đây TRƯỚC khi build. CHỈ áp dụng phía server (gọi từ route
// export-docx/export-pdf), KHÔNG ảnh hưởng phía trình duyệt lúc xem trước
// (buildTikzSvgMap trong examRender.tsx tự xử lý url riêng để hiện thẳng
// <img src={url}>, không cần tải nội dung về).
//
// Đề CŨ (lưu trước khi có thay đổi này) vẫn có sẵn field `svg` -> giữ
// nguyên, không tải lại (tương thích ngược 100%). Hình nào tải lỗi (Blob bị
// xoá, mạng lỗi, timeout...) thì giữ nguyên item gốc (svg vẫn rỗng) — nơi
// gọi (ImageCollector.resolve trong examDocxExport.ts) đã tự xử lý hình
// thiếu bằng 1 dòng chú thích thay vì làm hỏng cả file xuất.
// THÊM MỚI (khiếu nại: "hình TikZ code phức tạp thường không tải lên được,
// quá nặng dù đã nén"): kể từ khi /api/upload-tikz-svg có phương án cuối
// rasterize sang PNG (xem rasterizeTikzSvgToPng) cho hình quá nặng để giữ
// dạng vector, url lưu lại có thể là ẢNH PNG chứ không còn chắc là SVG nữa
// — hydrateTikzSvgFromUrls TRƯỚC ĐÂY luôn gọi res.text() rồi tìm "<svg",
// với PNG (dữ liệu nhị phân) chắc chắn không khớp -> ÂM THẦM coi như "tải
// lỗi", bỏ qua, khiến hình biến mất khỏi Word/PDF (hiện dòng "Không tìm
// thấy hình") dù url vẫn tồn tại và hợp lệ. SỬA: nhận diện qua đuôi url
// (.png, do route upload luôn đặt đúng đuôi theo định dạng thật đã lưu) để
// tải đúng cách (arrayBuffer, không phải text) và lưu vào field riêng
// `imagePngBuffer` — KHÔNG serialize sang JSON (chỉ dùng trong nội bộ 1
// request export-docx/export-pdf, không lưu DB) nên giữ nguyên dạng Buffer
// cho gọn, examDocxExport.ts đọc field này TRỰC TIẾP, không cần rasterize
// lại lần nữa.
export async function hydrateTikzSvgFromUrls<T>(rawData: T): Promise<T> {
  if (!rawData || typeof rawData !== 'object') return rawData;
  const data = rawData as Record<string, unknown>;
  if (!Array.isArray(data.tikz_list)) return rawData;
  const list = data.tikz_list as Array<Record<string, unknown>>;
  const hydrated = await Promise.all(
    list.map(async (item) => {
      if (!item || typeof item !== 'object') return item;
      const hasSvg = typeof item.svg === 'string' && (item.svg as string).trim().length > 0;
      const url = typeof item.url === 'string' ? (item.url as string) : '';
      if (hasSvg || !url) return item;
      const isPngUrl = /\.png(\?|$)/i.test(url);
      try {
        const res = await fetch(url);
        if (!res.ok) return item;
        if (isPngUrl) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (!buf.length) return item;
          return { ...item, imagePngBuffer: buf };
        }
        const svg = await res.text();
        if (!svg || !svg.includes('<svg')) return item;
        return { ...item, svg };
      } catch (err) {
        console.error(`Lỗi tải hình TikZ từ url (xuất Word/PDF), hình "${String(item.id)}":`, err);
        return item;
      }
    })
  );
  return { ...data, tikz_list: hydrated } as T;
}
