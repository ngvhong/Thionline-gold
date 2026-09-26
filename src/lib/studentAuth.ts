import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';
import { connectToDatabase } from './mongodb';
import { StudentAccountModel } from './studentAccountModel';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): file này CỐ TÌNH copy đúng
// pattern JWT + bcrypt của src/lib/auth.ts (xem 00-THINKING.md mục 2.3),
// KHÔNG import, KHÔNG sửa gì auth.ts — 2 phiên đăng nhập (GV/HS) sống hoàn
// toàn độc lập trên cùng 1 trình duyệt nhờ dùng 2 cookie khác tên.
//
// Dùng chung biến môi trường JWT_SECRET với GV (không phải "sửa" auth.ts,
// chỉ đọc lại đúng 1 biến môi trường đã có sẵn) — an toàn vì payload JWT
// của 2 loại token này khác cấu trúc hoàn toàn (teacherId vs
// studentAccountId), không thể dùng lẫn cho nhau dù chung secret ký.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error(
    '⚠️ Thiếu biến môi trường JWT_SECRET khi chạy production. Thêm vào cấu ' +
      'hình deploy (vd. .env.local hoặc biến môi trường trên hosting), ví dụ:\n' +
      'JWT_SECRET=<chuỗi ngẫu nhiên dài, giữ bí mật, không commit lên git>'
  );
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-doi-truoc-khi-deploy';

// Cùng triết lý SESSION_DAYS của GV (auth.ts) — "đăng nhập 1 lần, lần sau
// vào thẳng" cho tới khi tự bấm Đăng xuất hoặc bị GV đặt lại PIN.
const SESSION_DAYS = 30;

export const STUDENT_SESSION_COOKIE_NAME = 'student_session_token';
export const STUDENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * SESSION_DAYS;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// Chuẩn hoá số điện thoại trước khi lưu/tra cứu — bỏ khoảng trắng, dấu
// gạch ngang/chấm hay gõ khi đọc số điện thoại (vd "090 123 4567",
// "090-123-4567") để cùng 1 số không bị coi là 2 tài khoản khác nhau chỉ vì
// cách gõ khác nhau. Dùng đúng 1 hàm này ở MỌI route đọc/ghi `phone`.
export function normalizePhone(phone: string): string {
  return String(phone).replace(/[\s.-]/g, '').trim();
}

export function signStudentSessionToken(studentAccountId: string, sessionVersion: number): string {
  const payload = { studentAccountId, sessionVersion };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
}

type StudentSessionPayload = { studentAccountId: string; sessionVersion: number };

export function verifyStudentSessionToken(token: string): StudentSessionPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload === 'object' && payload && 'studentAccountId' in payload) {
      const p = payload as any;
      return {
        studentAccountId: String(p.studentAccountId),
        sessionVersion: typeof p.sessionVersion === 'number' ? p.sessionVersion : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Trả về null nếu chưa đăng nhập/token hỏng/tài khoản không còn tồn tại/
// sessionVersion không khớp (đã bị thu hồi qua "GV đặt lại PIN") — nơi gọi
// tự coi mọi trường hợp này là "chưa đăng nhập", giống hệt nguyên tắc
// getTeacherIdFromRequest của GV (auth.ts).
export async function getVerifiedStudentAccountIdFromRequest(
  request: NextRequest
): Promise<string | null> {
  const token = request.cookies.get(STUDENT_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = verifyStudentSessionToken(token);
  if (!session?.studentAccountId) return null;

  await connectToDatabase();
  const account: any = await StudentAccountModel.findById(session.studentAccountId)
    .select('sessionVersion')
    .lean();
  if (!account) return null;

  const dbVersion = typeof account.sessionVersion === 'number' ? account.sessionVersion : 0;
  if (dbVersion !== session.sessionVersion) return null;

  return session.studentAccountId;
}

// THÊM MỚI: tăng sessionVersion lên 1 — thu hồi ngay mọi cookie phiên học
// sinh đã phát ra trước đó. Gọi khi giáo viên đặt lại PIN hộ học sinh (PIN
// cũ không còn dùng được nữa, các phiên đang mở bằng PIN cũ cũng nên mất
// hiệu lực ngay, không đợi hết hạn 30 ngày) — cùng nguyên tắc
// bumpSessionVersion của GV (auth.ts).
export async function bumpStudentSessionVersion(studentAccountId: string): Promise<void> {
  await connectToDatabase();
  await StudentAccountModel.findByIdAndUpdate(studentAccountId, { $inc: { sessionVersion: 1 } });
}
