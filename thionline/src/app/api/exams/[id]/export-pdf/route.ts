// GET /api/exams/[id]/export-pdf?withSolutions=1
//   → tải file PDF của đề thi. Cùng nguyên tắc xác thực với
//   export-docx/route.ts (bắt buộc đăng nhập, chỉ đúng GV sở hữu đề mới
//   tải được).
//
// KIẾN TRÚC (ĐÃ ĐỔI — không còn gọi sang project Vercel/Puppeteer riêng):
//   Dựng Markdown + rasterize hình TikZ (SVG -> PNG) NGAY TẠI ĐÂY bằng
//   buildExamMarkdown (cùng hàm mà export-docx/examDocxExport.ts dùng), rồi
//   gửi sang MỘT SPACE HUGGING FACE KHÁC (Docker, cùng hạ tầng với Space
//   compile TikZ) chạy `pandoc ... --pdf-engine=xelatex` để xuất PDF thật —
//   xem hf_spaces/pdf_space/app.py, route POST /export-pdf. Forward nguyên
//   buffer PDF nhận được cho trình duyệt giáo viên.
//
// CẦN THÊM biến môi trường trong project Next.js (ví dụ trên Vercel):
//   EXPORT_PDF_SERVICE_URL=https://<ten-space>.hf.space/export-pdf
//   EXPORT_SERVICE_SECRET=<chuỗi bí mật, TRÙNG với biến EXPORT_SECRET đặt
//                           trong Settings > Variables and secrets của Space>
//   (Có thể dùng CHUNG giá trị EXPORT_SERVICE_SECRET với Space docx, hoặc
//   đặt secret khác cho từng Space — miễn khớp đúng từng bên.)

import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { buildExamMarkdown, filesToBase64, type ExamRawData } from '@/lib/examDocxExport';
import { hydrateTikzSvgFromUrls } from '@/lib/tikzCrop';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID đề thi không hợp lệ.' }, { status: 400 });
    }

    const withSolutions = request.nextUrl.searchParams.get('withSolutions') === '1';

    await connectToDatabase();

    const exam = await Exam.findById(id).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    if ((exam as any).teacherId !== teacherId) {
      return NextResponse.json({ error: 'Bạn không có quyền tải đề thi này.' }, { status: 403 });
    }

    const rawBeforeHydrate = ((exam as any).raw_data || {}) as ExamRawData;
    const hasAnyQuestion =
      (rawBeforeHydrate.phan_1_TracNghiem?.length || 0) +
        (rawBeforeHydrate.phan_2_DungSai?.length || 0) +
        (rawBeforeHydrate.phan_3_TraLoiNgan?.length || 0) +
        (rawBeforeHydrate.phan_4_TuLuan?.length || 0) >
      0;
    if (!hasAnyQuestion) {
      return NextResponse.json({ error: 'Đề này chưa có câu hỏi nào để xuất.' }, { status: 400 });
    }

    // THÊM MỚI: cùng lý do với export-docx — mồi lại svg thật từ url Blob
    // trước khi build markdown (buildExamMarkdown cũng rasterize bằng
    // resvg-js y hệt buildExamDocx).
    const raw = await hydrateTikzSvgFromUrls(rawBeforeHydrate);

    const title = String((exam as any).title || 'De_thi');

    // ĐỊA CHỈ SPACE: "carot2026-tikz" (App 1) và "hong-2-m2w-tikz-compiler"
    // (App 2) chạy chung 1 bản app.py — mặc định dùng App 1. Route
    // /export-pdf CẦN ĐƯỢC THÊM VÀO app.py (chưa có sẵn ở bản hiện tại,
    // xác nhận qua source code) trước khi tính năng này chạy được. Gán
    // cứng mặc định tại đây, vẫn cho phép ghi đè qua biến môi trường
    // EXPORT_PDF_SERVICE_URL nếu cần đổi Space.
    const serviceUrl = process.env.EXPORT_PDF_SERVICE_URL || 'https://carot2026-tikz.hf.space/export-pdf';
    const secret = process.env.EXPORT_SERVICE_SECRET;
    if (!serviceUrl) {
      return NextResponse.json(
        { error: 'Chưa cấu hình dịch vụ xuất PDF (EXPORT_PDF_SERVICE_URL, dạng https://<ten-space>.hf.space/export-pdf).' },
        { status: 500 }
      );
    }

    // Dựng Markdown + ảnh (đồng nhất với đường xuất Word) ngay tại đây, rồi
    // gửi sang Space Hugging Face để pandoc thật xuất PDF.
    const { markdown, files } = buildExamMarkdown(raw, { title, includeSolutions: withSolutions });
    const images = await filesToBase64(files);

    let upstream: Response;
    try {
      upstream = await fetch(serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { 'x-export-secret': secret } : {}),
        },
        body: JSON.stringify({ markdown, images, title }),
        // Space Hugging Face free tier có thể "ngủ" và mất vài chục giây để
        // tỉnh dậy trước khi chạy pandoc/xelatex — để timeout rộng.
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      console.error('Lỗi gọi Space export-pdf:', err);
      return NextResponse.json({ error: 'Không kết nối được Space xuất PDF (Hugging Face).' }, { status: 502 });
    }

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      console.error('Space export-pdf báo lỗi:', upstream.status, errBody);
      return NextResponse.json(
        { error: 'Không dựng được file PDF từ nội dung đề (có thể do công thức/hình lỗi).' },
        { status: 500 }
      );
    }

    const pdfBuf = Buffer.from(await upstream.arrayBuffer());
    const safeTitle = title.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const suffix = withSolutions ? 'LoiGiai' : 'De';
    const dateTag = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(pdfBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeTitle}_${suffix}_${dateTag}.pdf"`,
      },
    });
  } catch (err) {
    console.error('Lỗi xuất đề ra PDF:', err);
    return NextResponse.json({ error: 'Không xuất được file PDF, xem chi tiết ở server log.' }, { status: 500 });
  }
}
