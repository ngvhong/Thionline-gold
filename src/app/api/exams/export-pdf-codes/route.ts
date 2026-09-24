// POST /api/exams/export-pdf-codes
//   → tải file PDF THẬT (pandoc/xelatex, không phải "in trình duyệt") gồm N
//   mã đề đã trộn + trang đáp án gộp ở cuối.
//
// KHÁC VỚI /api/exams/[id]/export-pdf: route đó xuất PDF của 1 ĐỀ ĐÃ LƯU
// trong Mongo (lấy raw_data qua examId). Route NÀY nhận thẳng dữ liệu N mã
// đề đã trộn (buildLiveExamData/generateExamCodes ở ExamBuilder.tsx) ngay
// trong body request — KHÔNG cần đề đã lưu, KHÔNG cần currentExamId, vì đây
// là tính năng in nhiều mã đề để phát giấy (trước đây làm hoàn toàn ở
// client bằng window.print() + CSS @media print).
//
// THAY THẾ window.print(): trước đây nút "In / Lưu PDF" chỉ mở hộp thoại in
// gốc của trình duyệt (chất lượng phụ thuộc render CSS của trình duyệt,
// công thức Toán là ảnh SVG có sẵn). Route này build markdown thật (giống
// export-docx/export-pdf) rồi gửi sang CÙNG Space Hugging Face chạy
// `pandoc --pdf-engine=xelatex` → PDF chất lượng LaTeX thật, tải trực tiếp
// về máy GV, không cần thao tác gì thêm ở hộp thoại in.
//
// Yêu cầu biến môi trường: giống hệt export-pdf/route.ts
//   EXPORT_PDF_SERVICE_URL, EXPORT_SERVICE_SECRET
//
// LƯU Ý: N mã đề càng nhiều + càng nhiều hình TikZ thì payload gửi lên
// (base64 PNG) càng nặng — nếu deploy trên nền tảng serverless có giới hạn
// dung lượng request (ví dụ Vercel ~4.5MB/request), xuất quá nhiều mã đề
// cùng lúc có thể lỗi. Nếu gặp lỗi 413/502 khi số mã đề lớn, cân nhắc giảm
// số mã đề mỗi lần xuất hoặc tách route để xuất từng phần rồi gộp PDF ở
// server (ngoài phạm vi sửa lần này).

import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { buildMultiCodeExamMarkdown, filesToBase64, type ExamRawData } from '@/lib/examDocxExport';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CodeEntry = { code: string; data: ExamRawData };

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    let body: { title?: string; codes?: CodeEntry[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ (không parse được JSON).' }, { status: 400 });
    }

    const codes = Array.isArray(body.codes) ? body.codes : [];
    if (codes.length === 0) {
      return NextResponse.json({ error: 'Chưa có mã đề nào để xuất — bấm "Tạo mã đề" trước.' }, { status: 400 });
    }
    for (const entry of codes) {
      if (!entry || typeof entry.code !== 'string' || !entry.data || typeof entry.data !== 'object') {
        return NextResponse.json({ error: 'Dữ liệu mã đề không hợp lệ.' }, { status: 400 });
      }
    }

    const title = String(body.title || 'De_thi');

    // ĐỊA CHỈ SPACE: cùng App 1 "carot2026-tikz" (xem ghi chú tương tự ở
    // export-pdf/route.ts). Route /export-pdf CẦN ĐƯỢC THÊM vào app.py.
    const serviceUrl = process.env.EXPORT_PDF_SERVICE_URL || 'https://carot2026-tikz.hf.space/export-pdf';
    const secret = process.env.EXPORT_SERVICE_SECRET;
    if (!serviceUrl) {
      return NextResponse.json(
        { error: 'Chưa cấu hình dịch vụ xuất PDF (EXPORT_PDF_SERVICE_URL, dạng https://<ten-space>.hf.space/export-pdf).' },
        { status: 500 }
      );
    }

    const { markdown, files } = buildMultiCodeExamMarkdown(codes, { title });
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
        // tỉnh dậy — nhiều mã đề hơn cũng lâu hơn 1 đề đơn, để timeout rộng.
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      console.error('Lỗi gọi Space export-pdf (nhiều mã đề):', err);
      return NextResponse.json({ error: 'Không kết nối được Space xuất PDF (Hugging Face).' }, { status: 502 });
    }

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => '');
      console.error('Space export-pdf báo lỗi (nhiều mã đề):', upstream.status, errBody);
      return NextResponse.json(
        { error: 'Không dựng được file PDF từ nội dung đề (có thể do công thức/hình lỗi, hoặc quá nhiều mã đề trong 1 lần xuất).' },
        { status: 500 }
      );
    }

    const pdfBuf = Buffer.from(await upstream.arrayBuffer());
    const safeTitle = title.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const dateTag = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(pdfBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeTitle}_${codes.length}MaDe_${dateTag}.pdf"`,
      },
    });
  } catch (err) {
    console.error('Lỗi xuất PDF nhiều mã đề:', err);
    return NextResponse.json({ error: 'Không xuất được file PDF, xem chi tiết ở server log.' }, { status: 500 });
  }
}
