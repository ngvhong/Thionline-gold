import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { hashVerifyToken } from '@/lib/auth';

// POST /api/auth/verify-email — body { token }. Cùng khuôn mẫu với
// /api/auth/reset-password: hash lại token gốc rồi tìm tài khoản có
// verifyTokenHash khớp VÀ verifyTokenExpires chưa qua hạn. Xác nhận xong thì
// xoá token (dùng 1 lần, link cũ không dùng lại được).
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Liên kết xác nhận không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();

    const tokenHash = hashVerifyToken(token);
    const teacher = await TeacherModel.findOne({
      verifyTokenHash: tokenHash,
      verifyTokenExpires: { $gt: new Date() },
    });

    if (!teacher) {
      return NextResponse.json(
        { error: 'Liên kết đã hết hạn hoặc không còn hợp lệ. Vui lòng yêu cầu gửi lại email xác nhận.' },
        { status: 400 }
      );
    }

    teacher.emailVerified = true;
    teacher.verifyTokenHash = null;
    teacher.verifyTokenExpires = null;
    await teacher.save();

    return NextResponse.json({ message: 'Xác nhận email thành công.' }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xác nhận email:', err);
    return NextResponse.json({ error: 'Không xác nhận được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
