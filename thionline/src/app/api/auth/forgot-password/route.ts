import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { generateResetToken, hashResetToken, RESET_TOKEN_TTL_MINUTES } from '@/lib/auth';
import { sendPasswordResetEmail } from '@/lib/sendEmail';
import { checkRateLimit, getClientIp, formatRetryAfter } from '@/lib/rateLimit';
import { getAppUrl } from '@/lib/appUrl';

// THÊM MỚI (rate limit): trước đây route này KHÔNG có giới hạn — ai đó gọi
// liên tục có thể (1) làm phiền 1 email cụ thể bằng hàng loạt mail đặt lại
// mật khẩu, (2) đốt quota Gmail SMTP (~500 mail/ngày, xem lib/sendEmail.ts).
// Giới hạn theo IP (không theo email) — cùng lý do với login: nếu giới hạn
// theo email thì kẻ xấu chỉ cần biết email ai đó là khoá được luôn khả năng
// họ tự yêu cầu reset (denial of service), giới hạn theo IP tránh được rủi
// ro này. 5 lượt/giờ là đủ thoải mái cho người dùng thật (kể cả gõ sai email
// vài lần) nhưng đủ chặt để chặn spam.
const FORGOT_PASSWORD_MAX_ATTEMPTS = 5;
const FORGOT_PASSWORD_WINDOW_SECONDS = 60 * 60;

// POST /api/auth/forgot-password — body { email }. LUÔN trả về cùng 1 thông
// báo chung chung dù email có tồn tại trong hệ thống hay không (tránh lộ
// thông tin "email này đã đăng ký chưa" cho người dò quét — cùng nguyên tắc
// với /api/auth/login). Nếu email tồn tại và tài khoản không bị khoá, tạo
// token reset (sống 30 phút) và gửi link qua email.
export async function POST(request: NextRequest) {
  const genericResponse = NextResponse.json(
    { message: 'Nếu email này đã đăng ký, chúng tôi đã gửi liên kết đặt lại mật khẩu.' },
    { status: 200 }
  );

  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(
      `forgot-password:${ip}`,
      FORGOT_PASSWORD_MAX_ATTEMPTS,
      FORGOT_PASSWORD_WINDOW_SECONDS
    );
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau ${formatRetryAfter(rl.retryAfterSeconds)}.`,
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Vui lòng nhập email.' }, { status: 400 });
    }

    await connectToDatabase();

    const normalizedEmail = email.trim().toLowerCase();
    const teacher = await TeacherModel.findOne({ email: normalizedEmail });

    // Tài khoản không tồn tại HOẶC đang bị khoá (suspended) — vẫn trả về
    // response chung chung như bình thường, không tạo token, không gửi mail.
    // Khoá thì càng không nên cho tự mở lại bằng cách đặt mật khẩu mới.
    if (!teacher || teacher.status === 'suspended') {
      return genericResponse;
    }

    const token = generateResetToken();
    teacher.resetTokenHash = hashResetToken(token);
    teacher.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
    await teacher.save();

    const resetUrl = `${getAppUrl(request.nextUrl.origin)}/reset-password?token=${token}`;
    // Cố tình KHÔNG await lỗi gửi mail làm hỏng response — sendPasswordResetEmail
    // tự nuốt lỗi bên trong (xem lib/sendEmail.ts), người dùng luôn thấy
    // thông báo chung chung như nhau dù mail gửi thành công hay thất bại.
    await sendPasswordResetEmail(teacher.email, resetUrl);

    return genericResponse;
  } catch (err) {
    console.error('Lỗi quên mật khẩu:', err);
    // Vẫn trả thông báo chung chung ngay cả khi có lỗi server, để không lộ
    // thêm thông tin gì qua sự khác biệt của response.
    return genericResponse;
  }
}
