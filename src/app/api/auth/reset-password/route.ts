import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { hashResetToken, hashPassword } from '@/lib/auth';

// POST /api/auth/reset-password — body { token, password }. Token là chuỗi
// gốc gửi qua email (xem forgot-password route) — hash lại bằng đúng thuật
// toán rồi tìm tài khoản có resetTokenHash khớp VÀ resetTokenExpires chưa
// qua hạn. Sau khi đặt mật khẩu mới thành công, xoá luôn token (dùng 1 lần,
// không cho dùng lại link cũ).
export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Liên kết đặt lại mật khẩu không hợp lệ.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu mới cần ít nhất 6 ký tự.' }, { status: 400 });
    }

    await connectToDatabase();

    const tokenHash = hashResetToken(token);
    const teacher = await TeacherModel.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpires: { $gt: new Date() },
    });

    if (!teacher) {
      return NextResponse.json(
        { error: 'Liên kết đã hết hạn hoặc không còn hợp lệ. Vui lòng yêu cầu lại.' },
        { status: 400 }
      );
    }

    teacher.passwordHash = await hashPassword(password);
    teacher.resetTokenHash = null;
    teacher.resetTokenExpires = null;
    // THÊM MỚI (phương án dự phòng khi tài khoản bị chiếm): tăng
    // sessionVersion mỗi lần đặt lại mật khẩu — huỷ NGAY mọi cookie phiên
    // đăng nhập cũ đang tồn tại (kể cả của kẻ đã chiếm được tài khoản trước
    // đó), không cần đợi 30 ngày hết hạn. Đây là lý do đặt lại mật khẩu là
    // bước ĐẦU TIÊN nên làm khi nghi ngờ tài khoản (đặc biệt tài khoản
    // admin) bị lộ.
    teacher.sessionVersion = (teacher.sessionVersion || 0) + 1;
    await teacher.save();

    // Cố tình KHÔNG tự đăng nhập luôn ở đây (không set cookie) — để GV chủ
    // động đăng nhập lại bằng mật khẩu mới, tránh trường hợp link reset lỡ
    // lọt vào tay người khác thì họ cũng không tự nhiên có sẵn phiên đăng
    // nhập, vẫn phải biết mật khẩu mới vừa đặt.
    return NextResponse.json({ message: 'Đặt lại mật khẩu thành công. Hãy đăng nhập lại.' }, { status: 200 });
  } catch (err) {
    console.error('Lỗi đặt lại mật khẩu:', err);
    return NextResponse.json({ error: 'Không đặt lại được mật khẩu, xem chi tiết ở server log.' }, { status: 500 });
  }
}
