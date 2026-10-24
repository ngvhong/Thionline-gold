import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/submissions/[id] — GV xem chi tiết 1 lượt làm bài: đáp án học
// sinh đã chọn + toàn bộ đề (raw_data) để trang chi tiết tự chấm lại và tô
// đúng/sai từng câu (dùng chung hàm gradeExam ở client).
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
      return NextResponse.json({ error: 'ID lượt làm bài không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();

    const submission: any = await SubmissionModel.findById(id).lean();
    if (!submission) {
      return NextResponse.json({ error: 'Không tìm thấy lượt làm bài này.' }, { status: 404 });
    }

    const student = await StudentModel.findById(submission.studentId).lean();
    if (!student) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }
    const ownedClass = await ClassModel.findOne({ _id: (student as any).classId, ownerId: teacherId }).lean();
    if (!ownedClass) {
      return NextResponse.json({ error: 'Bạn không có quyền xem lượt làm bài này.' }, { status: 403 });
    }

    const exam = await Exam.findById(submission.examId, { title: 1, raw_data: 1, settings: 1 }).lean();

    return NextResponse.json(
      {
        submission: {
          _id: String(submission._id),
          status: submission.status,
          score: submission.score ?? null,
          total: submission.total ?? null,
          // THÊM MỚI: điểm theo thang điểm đã chốt lúc nộp (song song với
          // score/total đếm số câu ở trên) + thang điểm ĐÃ DÙNG lúc chấm —
          // trả về để trang chi tiết KHÔNG tự chấm lại bằng thang điểm mặc
          // định/hiện tại của đề (có thể GV đã đổi sau đó), giữ đúng điểm
          // học sinh đã thấy lúc nộp.
          scorePoints: submission.scorePoints ?? null,
          maxScorePoints: submission.maxScorePoints ?? null,
          scoringUsed: submission.scoringUsed || null,
          attemptNumber: submission.attemptNumber,
          answers: submission.answers || null,
          essayImages: submission.essayImages || null,
          essayAnnotatedImages: submission.essayAnnotatedImages || null,
          essayScores: submission.essayScores || null,
          essayMaxScore: submission.essayMaxScore ?? null,
          essayGraded: !!submission.essayGraded,
          started_at: submission.started_at || null,
          submitted_at: submission.submitted_at || null,
        },
        studentName: (student as any).name,
        examTitle: exam ? (exam as any).title : '(Đề đã bị xóa)',
        raw_data: exam ? (exam as any).raw_data : null,
        // Thang điểm HIỆN TẠI của đề — chỉ dùng làm fallback khi lượt làm
        // này nộp TRƯỚC lượt sửa này (chưa có scoringUsed lưu kèm), để vẫn
        // chấm lại được thay vì hiện điểm rỗng.
        examScoringFallback: exam ? (exam as any).settings?.scoring || null : null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi xem chi tiết bài làm:', err);
    return NextResponse.json(
      { error: 'Không tải được chi tiết bài làm, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
