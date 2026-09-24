import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import {
  verifyPassword,
  signSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth';
import { checkRateLimit, getClientIp, formatRetryAfter } from '@/lib/rateLimit';
import { isAdminEmail } from '@/lib/adminConfig';
import { sendAdminLoginAlertEmail } from '@/lib/sendEmail';

// THÊM MỚI (rate limit): giới hạn 10 lượt/IP/15 phút — chặn dò mật khẩu
// (brute-force). Cố tình giới hạn theo IP, KHÔNG theo email — nếu giới hạn
// theo email thì 1 người xấu chỉ cần biết email của ai đó là có thể cố tình
// gõ sai liên tục để KHOÁ đăng nhập của chính người đó (denial of service),
// trong khi giới hạn theo IP không có rủi ro này.
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ${formatRetryAfter(rl.retryAfterSeconds)}.`,
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Vui lòng nhập email và mật khẩu.' }, { status: 400 });
    }

    await connectToDatabase();

    const normalizedEmail = String(email).trim().toLowerCase();
    const teacher = await TeacherModel.findOne({ email: normalizedEmail });

    // Cố tình dùng chung 1 thông báo lỗi cho cả 2 trường hợp "không có email
    // này" và "sai mật khẩu" — tránh lộ thông tin email nào đã đăng ký hay
    // chưa cho người dò mật khẩu.
    if (!teacher) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, teacher.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Email hoặc mật khẩu không đúng.' }, { status: 401 });
    }

    // THÊM MỚI: tài khoản bị admin khoá (xem /api/admin/teachers/[id]) không
    // được đăng nhập lại nữa cho tới khi được mở lại. Phiên đăng nhập cũ
    // (nếu có) cũng bị chặn ngay từ lần gọi API kế tiếp — xem
    // getTeacherIdFromRequest ở auth.ts, giờ tra lại `status` trong DB mỗi
    // request thay vì chỉ tin JWT.
    if (teacher.status === 'suspended') {
      return NextResponse.json({ error: 'Tài khoản này đã bị khoá. Liên hệ quản trị viên để biết thêm chi tiết.' }, { status: 403 });
    }

    // THÊM MỚI (đóng/duyệt đăng ký): tài khoản đăng ký lúc registrationMode
    // === 'approval' (xem auth/register) chưa được admin duyệt thì chưa cho
    // đăng nhập — cùng cách chặn với 'suspended' ở trên, chỉ khác câu chữ.
    if (teacher.status === 'pending') {
      return NextResponse.json(
        { error: 'Tài khoản đang chờ quản trị viên duyệt. Quý thầy cô vui lòng chờ duyệt rồi đăng nhập lại sau.' },
        { status: 403 }
      );
    }

    const token = signSessionToken(teacher._id.toString(), teacher.sessionVersion || 0);

    // THÊM MỚI (phương án dự phòng khi admin bị chiếm tài khoản): báo ngay
    // qua email mỗi lượt đăng nhập THÀNH CÔNG vào đúng tài khoản admin —
    // Cố tình KHÔNG await (không chặn/làm chậm response đăng nhập của admin
    // vì việc gửi mail), chỉ log lỗi nếu gửi thất bại.
    if (isAdminEmail(teacher.email)) {
      sendAdminLoginAlertEmail(teacher.email, { ip, time: new Date() }).catch((err) =>
        console.error('Lỗi gửi cảnh báo đăng nhập admin:', err)
      );
    }

    const response = NextResponse.json(
      { teacher: { id: teacher._id.toString(), email: teacher.email, name: teacher.name } },
      { status: 200 }
    );
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('Lỗi đăng nhập GV:', err);
    return NextResponse.json({ error: 'Không đăng nhập được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
