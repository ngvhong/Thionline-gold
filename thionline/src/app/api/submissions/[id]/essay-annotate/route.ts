import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { put } from '@/lib/storage';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// POST /api/submissions/[id]/essay-annotate — GV lưu ảnh bài làm Phần IV SAU
// KHI đã khoanh/viết bút đỏ chấm trực tiếp lên ảnh (component vẽ ở client
// xuất ra data URL của canvas). Lưu như 1 ảnh MỚI trên Vercel Blob (không đè
// ảnh gốc essayImages — học sinh vẫn xem lại được ảnh gốc nếu cần), URL ghi
// vào essayAnnotatedImages[questionId][imageIndex] (đúng vị trí trang tương
// ứng với essayImages[questionId][imageIndex]).
// Body (JSON): { questionId: string, imageIndex: number, dataUrl: string }
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(
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
      return NextResponse.json({ error: 'ID lượt làm bài không hợp lệ.' }, { status: 400 });
    }

    const { questionId, imageIndex, dataUrl } = await request.json();
    if (typeof questionId !== 'string' || !questionId) {
      return NextResponse.json({ error: 'Thiếu thông tin câu hỏi.' }, { status: 400 });
    }
    if (typeof imageIndex !== 'number' || imageIndex < 0 || !Number.isInteger(imageIndex)) {
      return NextResponse.json({ error: 'Thiếu thông tin trang ảnh.' }, { status: 400 });
    }
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(png|jpeg));base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Ảnh đã chấm không hợp lệ.' }, { status: 400 });
    }
    const contentType = match[1];
    const ext = match[2] === 'png' ? 'png' : 'jpg';
    const buffer = Buffer.from(match[3], 'base64');
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Ảnh đã chấm quá nặng (trên 8MB).' }, { status: 400 });
    }

    await connectToDatabase();

    const submission: any = await SubmissionModel.findById(id).exec();
    if (!submission) {
      return NextResponse.json({ error: 'Không tìm thấy lượt làm bài này.' }, { status: 404 });
    }

    // Cùng kiểu kiểm tra quyền như /essay-score — chỉ GV sở hữu lớp của học
    // sinh này mới được chấm.
    const student = await StudentModel.findById(submission.studentId).lean();
    if (!student) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }
    const ownedClass = await ClassModel.findOne({ _id: (student as any).classId, ownerId: teacherId }).lean();
    if (!ownedClass) {
      return NextResponse.json({ error: 'Bạn không có quyền với lượt làm bài này.' }, { status: 403 });
    }

    const pathname = `essay-annotated/${String(submission.examId)}/${id}/${questionId}-${imageIndex}-${Date.now()}.${ext}`;
    const blob = await put(pathname, buffer, { access: 'public', contentType });

    const allAnnotated: Record<string, string[]> = { ...(submission.essayAnnotatedImages || {}) };
    const forQuestion = [...(allAnnotated[questionId] || [])];
    forQuestion[imageIndex] = blob.url;
    allAnnotated[questionId] = forQuestion;
    submission.essayAnnotatedImages = allAnnotated;
    await submission.save();

    return NextResponse.json({ url: blob.url, essayAnnotatedImages: submission.essayAnnotatedImages }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lưu ảnh đã chấm Phần IV:', err);
    return NextResponse.json(
      { error: 'Không lưu được ảnh đã chấm, thử lại.' },
      { status: 500 }
    );
  }
}
