import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { getTeacherIdFromRequest, generateVerifyToken, hashVerifyToken, VERIFY_TOKEN_TTL_HOURS } from '@/lib/auth';
import { checkRateLimit, formatRetryAfter } from '@/lib/rateLimit';
import { sendVerificationEmail } from '@/lib/sendEmail';
import { getAppUrl } from '@/lib/appUrl';

// POST /api/auth/resend-verification — không cần body, lấy GV từ session
// hiện tại (phải đăng nhập mới gọi được, vì đăng ký đã tự đăng nhập luôn —
// xem register route). Giới hạn theo teacherId (không phải IP, vì hành
// động này gắn với 1 tài khoản cụ thể) — 3 lần/giờ là đủ cho trường hợp
// thật (lỡ email đầu vào spam, hoặc token hết hạn), vẫn chặn được spam liên
// tục vào đúng 1 hộp thư.
const RESEND_MAX_ATTEMPTS = 3;
const RESEND_WINDOW_SECONDS = 60 * 60;

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const rl = await checkRateLimit(`resend-verify:${teacherId}`, RESEND_MAX_ATTEMPTS, RESEND_WINDOW_SECONDS);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Bạn đã yêu cầu gửi lại quá nhiều lần. Vui lòng thử lại sau ${formatRetryAfter(rl.retryAfterSeconds)}.`,
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    await connectToDatabase();
    const teacher = await TeacherModel.findById(teacherId);
    if (!teacher) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
    }

    if (teacher.emailVerified) {
      return NextResponse.json({ message: 'Email này đã được xác nhận rồi.' }, { status: 200 });
    }

    const verifyToken = generateVerifyToken();
    teacher.verifyTokenHash = hashVerifyToken(verifyToken);
    teacher.verifyTokenExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000);
    await teacher.save();

    const verifyUrl = `${getAppUrl(request.nextUrl.origin)}/verify-email?token=${verifyToken}`;
    await sendVerificationEmail(teacher.email, verifyUrl);

    return NextResponse.json({ message: 'Đã gửi lại email xác nhận.' }, { status: 200 });
  } catch (err) {
    console.error('Lỗi gửi lại email xác nhận:', err);
    return NextResponse.json({ error: 'Không gửi lại được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
