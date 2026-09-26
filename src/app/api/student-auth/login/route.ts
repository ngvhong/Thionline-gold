import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import {
  verifyPin,
  normalizePhone,
  signStudentSessionToken,
  STUDENT_SESSION_COOKIE_NAME,
  STUDENT_SESSION_MAX_AGE_SECONDS,
} from '@/lib/studentAuth';
import { checkRateLimit, getClientIp, formatRetryAfter } from '@/lib/rateLimit';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): giới hạn 10 lượt/IP/15 phút
// — cùng con số với đăng nhập GV (auth/login) để chặn dò PIN (chỉ 4-6 chữ
// số, dễ dò hơn mật khẩu GV nên giới hạn theo IP càng quan trọng).
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`student-login:${ip}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ${formatRetryAfter(rl.retryAfterSeconds)}.`,
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { phone, pin } = await request.json();
    if (!phone || !pin) {
      return NextResponse.json({ error: 'Vui lòng nhập số điện thoại và mã PIN.' }, { status: 400 });
    }

    await connectToDatabase();

    const normalizedPhone = normalizePhone(phone);
    const account = await StudentAccountModel.findOne({ phone: normalizedPhone });

    // Cố tình dùng chung 1 thông báo lỗi cho "không có số này" và "sai
    // PIN" — tránh lộ số điện thoại nào đã đăng ký hay chưa (cùng nguyên
    // tắc đăng nhập GV, xem auth/login).
    if (!account) {
      return NextResponse.json({ error: 'Số điện thoại hoặc mã PIN không đúng.' }, { status: 401 });
    }

    const isValid = await verifyPin(String(pin), account.pinHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Số điện thoại hoặc mã PIN không đúng.' }, { status: 401 });
    }

    const token = signStudentSessionToken(account._id.toString(), account.sessionVersion || 0);

    const response = NextResponse.json(
      { id: account._id.toString(), name: account.name, phone: account.phone },
      { status: 200 }
    );
    response.cookies.set(STUDENT_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: STUDENT_SESSION_MAX_AGE_SECONDS,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('Lỗi đăng nhập học sinh:', err);
    return NextResponse.json({ error: 'Không đăng nhập được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
