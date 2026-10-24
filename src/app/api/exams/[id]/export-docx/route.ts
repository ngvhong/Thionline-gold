import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { buildExamDocx, type ExamRawData } from '@/lib/examDocxExport';
import { hydrateTikzSvgFromUrls } from '@/lib/tikzCrop';

// GET /api/exams/[id]/export-docx?withSolutions=1
//   → tải file Word (.docx) THẬT của đề thi (công thức Toán render dạng
//   công thức Word gốc, sửa được, không phải ảnh chụp).
//   withSolutions=1  -> "Đề + lời giải" (kèm đáp án đúng/lời giải từng câu)
//   không có/khác 1  -> "Đề riêng" (chỉ câu hỏi, dùng in phát cho học sinh)
// Cùng nguyên tắc bảo mật với GET /api/exams/[id]: bắt buộc đăng nhập, chỉ
// đúng GV sở hữu đề mới tải được — tránh lộ đề (và lời giải) qua việc đoán ID.
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

    // THÊM MỚI: đề mới chỉ lưu {id, code, url} trong tikz_list (xem
    // uploadTikzSvgsForSave trong ExamBuilder.tsx) — cần tải lại nội dung
    // SVG thật từ Blob trước khi rasterize (resvg-js không đọc được url
    // suông). Đề CŨ đã có sẵn `svg` thì hàm này bỏ qua, không tải lại.
    const raw = await hydrateTikzSvgFromUrls(rawBeforeHydrate);

    const title = String((exam as any).title || 'De_thi');

    let buf: Buffer;
    try {
      buf = await buildExamDocx(raw, { title, includeSolutions: withSolutions });
    } catch (err) {
      console.error('Lỗi pandoc khi xuất Word:', err);
      return NextResponse.json(
        { error: 'Không dựng được file Word từ nội dung đề (có thể do công thức/hình lỗi). Xem chi tiết ở server log.' },
        { status: 500 }
      );
    }

    const safeTitle = title.replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const suffix = withSolutions ? 'LoiGiai' : 'De';
    const dateTag = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeTitle}_${suffix}_${dateTag}.docx"`,
      },
    });
  } catch (err) {
    console.error('Lỗi xuất đề ra Word:', err);
    return NextResponse.json(
      { error: 'Không xuất được file Word, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
