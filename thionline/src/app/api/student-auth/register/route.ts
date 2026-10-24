import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import { StudentModel } from '@/lib/studentModel';
import {
  hashPin,
  normalizePhone,
  isValidVietnamPhone,
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

// THÊM MỚI (học sinh tự do quên PIN): cho phép "đăng ký lại" bằng CÙNG số
// điện thoại nếu tài khoản cũ CHƯA thuộc lớp nào (không có dòng Student nào
// trỏ tới nó) — khi đó không có giáo viên nào đủ quyền đặt lại PIN hộ, nên
// để học sinh tự đặt PIN mới. Tài khoản ĐÃ vào lớp thì vẫn chặn (409) —
// phải nhờ GV đặt lại PIN (/api/teacher/students/[id]/reset-pin), vì nếu
// không, ai biết số điện thoại của 1 HS trong lớp cũng chiếm được tài khoản
// đó và xem điểm/bài làm trong lớp.
//
// Giới hạn RIÊNG theo số điện thoại (ngoài giới hạn theo IP ở trên): tối
// đa 3 lần đặt lại/số/giờ, để người lạ khó dùng nhiều IP liên tục chiếm
// tài khoản chưa vào lớp của người khác. Cửa sổ để 1 giờ (không dài hơn 2
// giờ) vì rateLimit.ts tự xoá các lượt đếm sau 2 giờ (TTL) — cửa sổ dài hơn
// sẽ bị đếm thiếu.
const RECOVER_MAX_PER_PHONE = 3;
const RECOVER_WINDOW_SECONDS = 60 * 60;

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

    const normalizedPhone = normalizePhone(phone);
    // THÊM MỚI: chặn chuỗi không phải số điện thoại VN (vd. gõ đại 20 số,
    // chữ cái...) NGAY LÚC ĐĂNG KÝ — số điện thoại là định danh duy nhất
    // dùng để đăng nhập và để "đăng ký lại" khi quên PIN nên phải chặn từ
    // đầu, sửa sau sẽ khó (đổi được số thì lại phải xác minh chủ tài khoản).
    if (!isValidVietnamPhone(normalizedPhone)) {
      return NextResponse.json(
        { error: 'Số điện thoại không hợp lệ. Vui lòng nhập đúng số điện thoại (10 số, bắt đầu bằng 0).' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const existing = await StudentAccountModel.findOne({ phone: normalizedPhone });
    if (existing) {
      const linkedRosterCount = await StudentModel.countDocuments({
        studentAccountId: existing._id,
      });
      if (linkedRosterCount > 0) {
        return NextResponse.json(
          {
            error:
              'Số điện thoại này đã có tài khoản và đã vào lớp. Hãy đăng nhập, hoặc nhờ giáo viên đặt lại PIN nếu bạn quên.',
          },
          { status: 409 }
        );
      }

      const phoneRl = await checkRateLimit(
        `student-recover:${normalizedPhone}`,
        RECOVER_MAX_PER_PHONE,
        RECOVER_WINDOW_SECONDS
      );
      if (!phoneRl.allowed) {
        return NextResponse.json(
          {
            error: `Số điện thoại này đã đặt lại quá nhiều lần. Vui lòng thử lại sau ${formatRetryAfter(phoneRl.retryAfterSeconds)}.`,
            retryAfterSeconds: phoneRl.retryAfterSeconds,
          },
          { status: 429, headers: { 'Retry-After': String(phoneRl.retryAfterSeconds) } }
        );
      }

      // Tài khoản chưa vào lớp -> đặt PIN mới + tên mới, thu hồi mọi phiên
      // cũ (tăng sessionVersion) rồi đăng nhập luôn bằng phiên mới.
      const newPinHash = await hashPin(String(pin));
      const updated = await StudentAccountModel.findByIdAndUpdate(
        existing._id,
        { pinHash: newPinHash, name: String(name).trim(), $inc: { sessionVersion: 1 } },
        { new: true }
      );
      if (!updated) {
        return NextResponse.json({ error: 'Không đặt lại được tài khoản.' }, { status: 500 });
      }
      const recoverToken = signStudentSessionToken(
        updated._id.toString(),
        updated.sessionVersion || 0
      );
      const recoverResponse = NextResponse.json(
        { id: updated._id.toString(), name: updated.name, phone: updated.phone },
        { status: 200 }
      );
      recoverResponse.cookies.set(STUDENT_SESSION_COOKIE_NAME, recoverToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: STUDENT_SESSION_MAX_AGE_SECONDS,
        path: '/',
      });
      return recoverResponse;
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
