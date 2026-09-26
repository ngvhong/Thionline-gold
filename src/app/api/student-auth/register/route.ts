import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import {
  hashPin,
  normalizePhone,
  signStudentSessionToken,
  STUDENT_SESSION_COOKIE_NAME,
  STUDENT_SESSION_MAX_AGE_SECONDS,
} from '@/lib/studentAuth';
import { checkRateLimit, getClientIp, formatRetryAfter } from '@/lib/rateLimit';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): route hoàn toàn mới, không
// đụng gì tới /api/auth/register (đăng ký GV). Dùng lại checkRateLimit
// (rateLimit.ts) — helper dùng chung, không riêng cho GV.
const REGISTER_MAX_ATTEMPTS = 15;
const REGISTER_WINDOW_SECONDS = 60 * 60;

const PIN_REGEX = /^\d{4,6}$/;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(
      `student-register:${ip}`,
      REGISTER_MAX_ATTEMPTS,
      REGISTER_WINDOW_SECONDS
    );
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau ${formatRetryAfter(rl.retryAfterSeconds)}.`,
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { name, phone, pin } = await request.json();

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên của bạn.' }, { status: 400 });
    }
    if (!phone || !String(phone).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập số điện thoại.' }, { status: 400 });
    }
    if (!pin || !PIN_REGEX.test(String(pin))) {
      return NextResponse.json({ error: 'Mã PIN phải gồm 4-6 chữ số.' }, { status: 400 });
    }

    await connectToDatabase();

    const normalizedPhone = normalizePhone(phone);
    const existing = await StudentAccountModel.findOne({ phone: normalizedPhone });
    if (existing) {
      return NextResponse.json(
        { error: 'Số điện thoại này đã có tài khoản. Hãy đăng nhập thay vì đăng ký.' },
        { status: 409 }
      );
    }

    const pinHash = await hashPin(String(pin));
    const account = await StudentAccountModel.create({
      name: String(name).trim(),
      phone: normalizedPhone,
      pinHash,
    });

    // Tài khoản vừa tạo luôn có sessionVersion mặc định = 0 — truyền thẳng
    // 0, không cần đọc lại từ DB (cùng cách auth/register của GV làm).
    const token = signStudentSessionToken(account._id.toString(), 0);

    const response = NextResponse.json(
      { id: account._id.toString(), name: account.name, phone: account.phone },
      { status: 201 }
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
    console.error('Lỗi đăng ký học sinh:', err);
    return NextResponse.json({ error: 'Không đăng ký được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
