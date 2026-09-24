import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import {
  hashPassword,
  signSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  generateVerifyToken,
  hashVerifyToken,
  VERIFY_TOKEN_TTL_HOURS,
} from '@/lib/auth';
import { checkRateLimit, getClientIp, formatRetryAfter } from '@/lib/rateLimit';
import { getFreeTrialDays, getRegistrationMode } from '@/lib/appSettings';
import { sendVerificationEmail } from '@/lib/sendEmail';
import { REGISTRATION_CLOSED_MESSAGE, REGISTRATION_APPROVAL_MESSAGE } from '@/lib/adminConfig';

// THÊM MỚI (đóng/duyệt đăng ký): route công khai, KHÔNG cần đăng nhập — cho
// trang login/page.tsx biết trước chế độ đăng ký hiện tại (mở/đóng/cần
// duyệt) để hiện banner giải thích + khoá nút "Đăng ký" NGAY khi vào trang,
// trước khi người dùng điền hết form rồi mới bị từ chối ở bước POST. Lỗi gì
// cũng fallback về 'open' — không để 1 lỗi đọc DB vô tình chặn luôn trang
// đăng nhập/đăng ký hiển thị.
export async function GET() {
  try {
    const mode = await getRegistrationMode();
    return NextResponse.json({ mode }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy chế độ đăng ký:', err);
    return NextResponse.json({ mode: 'open' }, { status: 200 });
  }
}

// THÊM MỚI (rate limit): đăng ký hiện đang MỞ CHO TẤT CẢ, không duyệt —
// giới hạn 15 lượt/IP/giờ để chặn bot tạo hàng loạt tài khoản rác, trong khi
// vẫn đủ thoải mái cho trường hợp thật (vd. nhiều GV cùng trường, cùng IP
// mạng nội bộ, đăng ký trong 1 buổi tập huấn).
const REGISTER_MAX_ATTEMPTS = 15;
const REGISTER_WINDOW_SECONDS = 60 * 60;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`register:${ip}`, REGISTER_MAX_ATTEMPTS, REGISTER_WINDOW_SECONDS);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau ${formatRetryAfter(rl.retryAfterSeconds)}.`,
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    // THÊM MỚI (đóng/duyệt đăng ký): kiểm tra chế độ đăng ký NGAY, trước khi
    // đụng vào email/password của người dùng — 'closed' thì từ chối luôn,
    // không tạo tài khoản. Đặt trước bước parse body vì lý do từ chối không
    // liên quan gì tới nội dung form (đóng là đóng, dù họ điền đúng hết).
    const registrationMode = await getRegistrationMode();
    if (registrationMode === 'closed') {
      return NextResponse.json({ error: REGISTRATION_CLOSED_MESSAGE }, { status: 403 });
    }

    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Vui lòng nhập đủ email, mật khẩu và tên.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu cần ít nhất 6 ký tự.' }, { status: 400 });
    }

    await connectToDatabase();

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await TeacherModel.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json({ error: 'Email này đã đăng ký tài khoản rồi.' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    // THÊM MỚI (gói dùng free/vĩnh viễn): mọi tài khoản đăng ký MỚI được
    // cấp sẵn N ngày dùng thử, tính từ lúc đăng ký này — planType mặc định
    // 'free' (xem TeacherModel), không cần set tay.
    // SỬA (Phần 2b): N đọc từ cấu hình AppSettings (admin tự đổi trong
    // trang Quản trị, xem getFreeTrialDays trong appSettings.ts) thay vì
    // hằng số cứng FREE_TRIAL_DAYS — hàm này tự fallback về hằng số đó nếu
    // admin chưa từng vào đổi, nên không cần lo tài khoản mới bị thiếu hạn.
    const freeTrialDays = await getFreeTrialDays();
    const freeExpiresAt = new Date(Date.now() + freeTrialDays * 24 * 60 * 60 * 1000);

    // THÊM MỚI (xác nhận email): tạo token xác nhận NGAY lúc đăng ký, lưu
    // hash + hạn 24 giờ vào cùng document luôn (đỡ phải save() thêm 1 lần) —
    // emailVerified set thẳng false ở đây, ĐÈ lên default=true của schema
    // (default=true chỉ để không ảnh hưởng tài khoản cũ, xem teacherModel.ts).
    const verifyToken = generateVerifyToken();
    // THÊM MỚI (đóng/duyệt đăng ký): registrationMode === 'approval' thì
    // tài khoản tạo ra ở trạng thái 'pending' — chưa đăng nhập được cho tới
    // khi admin bấm "Duyệt" (xem PATCH /api/admin/teachers/[id]). Không ghi
    // gì khi registrationMode === 'open' (bỏ qua field status hẳn) để giữ
    // đúng default 'active' của schema, không đổi hành vi cũ.
    const teacher = await TeacherModel.create({
      email: normalizedEmail,
      passwordHash,
      name: String(name).trim(),
      freeExpiresAt,
      emailVerified: false,
      verifyTokenHash: hashVerifyToken(verifyToken),
      verifyTokenExpires: new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000),
      ...(registrationMode === 'approval' ? { status: 'pending' } : {}),
    });

    // Cố tình KHÔNG await — không làm chậm response đăng ký vì việc gửi
    // mail (cùng nguyên tắc với sendAdminLoginAlertEmail ở route login), và
    // KHÔNG chặn đăng nhập/dùng app dù email chưa xác nhận (xem ghi chú ở
    // teacherModel.ts) — chỉ nhắc xác nhận, không khoá tính năng.
    const verifyUrl = `${request.nextUrl.origin}/verify-email?token=${verifyToken}`;
    sendVerificationEmail(teacher.email, verifyUrl).catch((err) =>
      console.error('Lỗi gửi email xác nhận:', err)
    );

    // THÊM MỚI (đóng/duyệt đăng ký): tài khoản 'pending' KHÔNG được tự đăng
    // nhập luôn như trước (không set cookie session) — phải chờ admin duyệt
    // rồi tự đăng nhập lại sau, tránh vào được app trong lúc account chưa
    // "hợp lệ" theo quyết định của admin.
    if (registrationMode === 'approval') {
      return NextResponse.json(
        {
          pendingApproval: true,
          message: REGISTRATION_APPROVAL_MESSAGE,
          teacher: { id: teacher._id.toString(), email: teacher.email, name: teacher.name },
        },
        { status: 201 }
      );
    }

    // Tài khoản vừa tạo luôn có sessionVersion mặc định = 0 (xem
    // TeacherModel) — truyền thẳng 0, không cần đọc lại từ DB.
    const token = signSessionToken(teacher._id.toString(), 0);

    const response = NextResponse.json(
      {
        teacher: {
          id: teacher._id.toString(),
          email: teacher.email,
          name: teacher.name,
          emailVerified: teacher.emailVerified,
        },
      },
      { status: 201 }
    );
    // httpOnly: JS phía trình duyệt không đọc được cookie này (chống XSS lấy
    // cắp session). secure: chỉ gửi qua HTTPS khi đã deploy (production).
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('Lỗi đăng ký GV:', err);
    return NextResponse.json({ error: 'Không đăng ký được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
