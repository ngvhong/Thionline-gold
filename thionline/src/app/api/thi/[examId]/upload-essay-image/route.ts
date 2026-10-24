import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { put } from '@/lib/storage';
import { connectToDatabase } from '@/lib/mongodb';
import { SubmissionModel } from '@/lib/submissionModel';

// POST /api/thi/[examId]/upload-essay-image — CÔNG KHAI (học sinh gọi lúc
// đang làm bài, KHÔNG cần đăng nhập GV).
// Body: multipart/form-data — { file, submissionId, questionId }
//
// Chỉ trả về URL ảnh đã lưu trên Vercel Blob — KHÔNG lưu file vào MongoDB
// (tránh document quá nặng, xem bàn giao Bước 3.1). Client (StudentTakeExam)
// đã nén ảnh trước khi gửi lên, route này vẫn giới hạn dung lượng 1 lần nữa
// để phòng trường hợp bỏ qua bước nén.
const MAX_BYTES = 8 * 1024 * 1024; // 8MB — chặn phòng hờ, ảnh đã nén ở client thường chỉ ~150-400KB

// put() (storage.ts, Supabase) giờ có retry nội bộ khi gặp lỗi mạng
// thoáng qua (xem storage.ts) — cộng dồn có thể mất vài giây, nên xin
// thêm thời gian chạy để không bị nền tảng cắt ngang giữa chừng (mặc
// định 10s trên gói Hobby Vercel). Route này đông học sinh gọi cùng lúc
// trong giờ thi nên càng cần tránh false-negative do timeout quá gắt.
export const maxDuration = 30;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Link đề thi không hợp lệ.' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const submissionId = formData.get('submissionId');
    const questionId = formData.get('questionId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Thiếu file ảnh.' }, { status: 400 });
    }
    if (typeof submissionId !== 'string' || !mongoose.Types.ObjectId.isValid(submissionId)) {
      return NextResponse.json({ error: 'Thiếu thông tin bài làm.' }, { status: 400 });
    }
    if (typeof questionId !== 'string' || !questionId) {
      return NextResponse.json({ error: 'Thiếu thông tin câu hỏi.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Chỉ nhận file ảnh.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Ảnh quá nặng (trên 8MB), thử chụp lại hoặc chọn ảnh khác.' }, { status: 400 });
    }

    await connectToDatabase();

    // Xác nhận đúng bài làm này thuộc đúng đề này, và học sinh chưa nộp bài
    // xong (chặn upload sau khi đã "đã nộp", tránh sửa bài sau khi chấm).
    const submission: any = await SubmissionModel.findById(submissionId).lean();
    if (!submission || String(submission.examId) !== examId) {
      return NextResponse.json({ error: 'Không tìm thấy bài làm này.' }, { status: 404 });
    }
    if (submission.status === 'đã nộp') {
      return NextResponse.json({ error: 'Bài đã nộp rồi, không tải thêm ảnh được nữa.' }, { status: 403 });
    }

    const ext = file.type === 'image/png' ? 'png' : 'jpg';
    const pathname = `essay/${examId}/${submissionId}/${questionId}-${Date.now()}.${ext}`;

    const blob = await put(pathname, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ url: blob.url }, { status: 200 });
  } catch (err) {
    console.error('Lỗi tải ảnh bài tự luận:', err);
    return NextResponse.json(
      { error: 'Không tải ảnh lên được, thử lại (bài làm hiện tại vẫn còn, chỉ ảnh vừa chụp bị lỗi).' },
      { status: 500 }
    );
  }
}
