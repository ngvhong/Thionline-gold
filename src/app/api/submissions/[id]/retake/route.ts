import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// POST /api/submissions/[id]/retake — GV bấm "Cho làm lại" ở tầng 3.
// Chỉ cho phép khi attempt hiện tại (mới nhất) đã "đã nộp" — tạo 1 bản ghi
// MỚI với attemptNumber+1, status='chưa thi', KHÔNG đụng tới bản ghi cũ (giữ
// nguyên làm lịch sử).
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

    await connectToDatabase();

    const submission: any = await SubmissionModel.findById(id).lean();
    if (!submission) {
      return NextResponse.json({ error: 'Không tìm thấy lượt làm bài này.' }, { status: 404 });
    }

    // Xác nhận học sinh này thuộc 1 lớp CỦA ĐÚNG GV đang đăng nhập — chặn GV
    // khác cho làm lại bài của học sinh không phải lớp mình.
    const student = await StudentModel.findById(submission.studentId).lean();
    if (!student) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }
    const ownedClass = await ClassModel.findOne({ _id: (student as any).classId, ownerId: teacherId }).lean();
    if (!ownedClass) {
      return NextResponse.json({ error: 'Bạn không có quyền với lượt làm bài này.' }, { status: 403 });
    }

    // Chỉ cho làm lại đúng attempt MỚI NHẤT của cặp (studentId, examId), và
    // chỉ khi nó đã "đã nộp" — tránh tạo nhiều attempt "chưa thi" chồng nhau.
    const latest: any = await SubmissionModel.findOne({
      studentId: submission.studentId,
      examId: submission.examId,
    })
      .sort({ attemptNumber: -1 })
      .lean();

    if (!latest || String(latest._id) !== String(submission._id)) {
      return NextResponse.json(
        { error: 'Lượt làm bài này không phải lượt mới nhất, không thể thao tác.' },
        { status: 400 }
      );
    }
    if (latest.status !== 'đã nộp') {
      return NextResponse.json(
        { error: 'Chỉ cho làm lại được khi học sinh đã nộp bài.' },
        { status: 400 }
      );
    }

    const created = await SubmissionModel.create({
      studentId: submission.studentId,
      examId: submission.examId,
      status: 'chưa thi',
      attemptNumber: latest.attemptNumber + 1,
      retakeGrantedBy: teacherId,
      assigned_at: new Date(),
    });

    return NextResponse.json(
      { submission: { _id: String(created._id), attemptNumber: created.attemptNumber, status: created.status } },
      { status: 201 }
    );
  } catch (err) {
    console.error('Lỗi cho làm lại:', err);
    return NextResponse.json(
      { error: 'Không thao tác được, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
