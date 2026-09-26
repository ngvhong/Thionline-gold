import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { getVerifiedStudentAccountIdFromRequest } from '@/lib/studentAuth';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): bắt buộc đã đăng nhập (cookie
// student_session_token) — gán studentAccountId vào ĐÚNG dòng roster
// (`Student`) mà học sinh chọn, KHÔNG tạo `Student` mới trùng. 1 tài khoản
// có thể gọi route này nhiều lần cho nhiều lớp khác nhau (join nhiều lớp).
export async function POST(request: NextRequest) {
  try {
    const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
    if (!studentAccountId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { inviteCode, studentId } = await request.json();
    if (!inviteCode || !String(inviteCode).trim()) {
      return NextResponse.json({ error: 'Thiếu mã lớp.' }, { status: 400 });
    }
    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return NextResponse.json({ error: 'Vui lòng chọn đúng tên bạn trong danh sách lớp.' }, { status: 400 });
    }

    await connectToDatabase();

    const cls = await ClassModel.findOne({ inviteCode: String(inviteCode).trim() }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp với mã này.' }, { status: 404 });
    }

    const student = await StudentModel.findOne({ _id: studentId, classId: (cls as any)._id });
    if (!student) {
      return NextResponse.json(
        { error: 'Không tìm thấy học sinh này trong lớp — vui lòng thử lại.' },
        { status: 404 }
      );
    }
    if (student.studentAccountId) {
      // Đã có tài khoản khác nhận tên này trước đó — kể cả chính tài khoản
      // đang gọi (không có ý nghĩa gì khi join lại 1 dòng roster đã claim).
      return NextResponse.json(
        { error: 'Tên này đã có tài khoản khác trong lớp. Nếu đây là bạn, hãy đăng nhập lại thay vì đăng ký mới.' },
        { status: 409 }
      );
    }

    student.studentAccountId = studentAccountId as any;
    await student.save();

    return NextResponse.json(
      {
        ok: true,
        student: {
          _id: student._id.toString(),
          name: student.name,
          classId: String(student.classId),
          className: (cls as any).name,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi vào lớp:', err);
    return NextResponse.json({ error: 'Không vào lớp được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
