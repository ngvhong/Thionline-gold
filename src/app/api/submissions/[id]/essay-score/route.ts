import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// PATCH /api/submissions/[id]/essay-score — GV nhập điểm Phần IV (Tự luận)
// TỪNG CÂU sau khi xem ảnh bài làm trong modal "Xem bài làm". Phần IV không
// tự chấm được nên KHÔNG đụng tới score/total (2 field đó chỉ tính Phần
// I/II/III). Gọi 1 lần cho 1 câu (questionId) — modal gọi lại mỗi lần GV bấm
// "Lưu" ở 1 câu, không cần gửi lại toàn bộ essayScores.
// Body: { questionId: string, score: number }
export async function PATCH(
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

    const { questionId, score } = await request.json();
    if (typeof questionId !== 'string' || !questionId) {
      return NextResponse.json({ error: 'Thiếu thông tin câu hỏi.' }, { status: 400 });
    }
    if (typeof score !== 'number' || Number.isNaN(score) || score < 0) {
      return NextResponse.json({ error: 'Điểm không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();

    const submission: any = await SubmissionModel.findById(id).exec();
    if (!submission) {
      return NextResponse.json({ error: 'Không tìm thấy lượt làm bài này.' }, { status: 404 });
    }

    // Cùng kiểu kiểm tra quyền như /retake — chỉ GV sở hữu lớp của học sinh
    // này mới được chấm.
    const student = await StudentModel.findById(submission.studentId).lean();
    if (!student) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }
    const ownedClass = await ClassModel.findOne({ _id: (student as any).classId, ownerId: teacherId }).lean();
    if (!ownedClass) {
      return NextResponse.json({ error: 'Bạn không có quyền với lượt làm bài này.' }, { status: 403 });
    }

    // Cần biết đề có bao nhiêu câu Phần IV để biết đã chấm ĐỦ hết chưa
    // (essayGraded) — chỉ cộng vào tổng điểm/bảng xuất khi chấm đủ mọi câu.
    const exam = await Exam.findById(submission.examId, { raw_data: 1 }).lean();
    const essayQuestionIds: string[] = ((exam as any)?.raw_data?.phan_4_TuLuan || []).map((q: any) => q.id);

    const merged: Record<string, number> = { ...(submission.essayScores || {}), [questionId]: score };
    submission.essayScores = merged;
    submission.essayGraded =
      essayQuestionIds.length > 0 && essayQuestionIds.every((qid) => typeof merged[qid] === 'number' && !Number.isNaN(merged[qid]));
    await submission.save();

    return NextResponse.json(
      { essayScores: submission.essayScores, essayGraded: submission.essayGraded },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lưu điểm Phần IV:', err);
    return NextResponse.json(
      { error: 'Không lưu được điểm, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
