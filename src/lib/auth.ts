import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { connectToDatabase } from './mongodb';
import { TeacherModel } from './teacherModel';

// QUAN TRỌNG: đặt JWT_SECRET thật trong file .env.local (biến môi trường),
// KHÔNG commit secret thật lên git. Chuỗi dưới đây chỉ là giá trị dự phòng
// lúc code chưa có .env.local, không dùng khi deploy thật.
//
// THÊM MỚI: nếu chạy ở production mà THIẾU JWT_SECRET, trước đây app vẫn
// chạy bình thường nhưng âm thầm ký token bằng chuỗi cố định nằm sẵn trong
// code (ai đọc được mã nguồn cũng đoán ra, tự ký được token giả mạo bất kỳ
// GV/admin nào) — rất nguy hiểm nếu quên set biến môi trường lúc deploy mà
// không ai biết. Giờ chặn thẳng ngay lúc khởi động server (throw lỗi) thay
// vì để lỗi bảo mật âm thầm tồn tại. Môi trường dev/test vẫn dùng được giá
// trị dự phòng như cũ để không cần cấu hình gì mới khi mới clone code về.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error(
    '⚠️ Thiếu biến môi trường JWT_SECRET khi chạy production. Thêm vào cấu ' +
      'hình deploy (vd. .env.local hoặc biến môi trường trên hosting), ví dụ:\n' +
      'JWT_SECRET=<chuỗi ngẫu nhiên dài, giữ bí mật, không commit lên git>'
  );
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-doi-truoc-khi-deploy';

// XÁC NHẬN từ bạn: "nếu đã đăng nhập thì lần sau vào thẳng, trừ khi đã đăng
// xuất" — nghĩa là session phải SỐNG LÂU (không hết hạn sau vài giờ như
// nhiều app khác), chỉ mất khi bấm "Đăng xuất" (xóa cookie) chủ động. Đặt 30
// ngày là đủ dài để cảm giác "luôn đăng nhập sẵn", vẫn có hạn để không tồn
// tại vĩnh viễn nếu cookie bị rò rỉ.
const SESSION_DAYS = 30;

export const SESSION_COOKIE_NAME = 'session_token';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * SESSION_DAYS;

// THÊM MỚI (mạo danh — admin "Đăng nhập thay mặt" 1 GV): phiên mạo danh
// dùng CHUNG cookie SESSION_COOKIE_NAME (để mọi route/kiểm tra đăng nhập
// hiện có tự động hoạt động đúng, không phải sửa lại từng nơi), nhưng:
//   - Sống NGẮN hơn nhiều (60 phút, không phải 30 ngày) — hạn chế thiệt hại
//     nếu quên thoát hoặc bị lộ.
//   - JWT có thêm claim `impersonatedBy` (id của admin) để nhận diện đây là
//     phiên mạo danh, dùng để: (1) hiện banner cảnh báo ở giao diện, (2)
//     chặn 1 số hành động nhạy cảm trong lúc mạo danh (xem
//     /api/auth/logout-everywhere).
// Token phiên THẬT của admin (trước khi mạo danh) được cất tạm ở cookie
// riêng này, để lúc bấm "Thoát" khôi phục lại đúng phiên admin ban đầu mà
// không bắt admin đăng nhập lại từ đầu.
export const IMPERSONATE_RETURN_COOKIE_NAME = 'impersonate_return_token';
export const IMPERSONATE_SESSION_MINUTES = 60;

// THÊM MỚI (quên mật khẩu): token gửi qua email là chuỗi ngẫu nhiên 32 byte
// (64 ký tự hex) — đủ dài để không đoán/dò được. Chỉ HASH (sha256) của
// token này được lưu trong DB (xem TeacherModel.resetTokenHash), token gốc
// CHỈ tồn tại trong email gửi đi + URL, không lưu ở server. Dùng sha256
// (không phải bcrypt) vì đây không phải mật khẩu người dùng tự đặt/dùng lại
// nhiều lần — token dùng 1 lần, sống ngắn (30 phút), sha256 là đủ và nhanh
// hơn bcrypt khi tra cứu bằng findOne.
const RESET_TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MINUTES = 30;

export function generateResetToken(): string {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// THÊM MỚI (xác nhận email lúc đăng ký): cùng nguyên tắc token với quên mật
// khẩu (random 32 byte, chỉ lưu sha256 trong DB) — tách hàm riêng (không
// dùng chung generateResetToken) để 2 loại token không thể dùng lẫn cho
// nhau dù trùng thuật toán, và để đổi TTL độc lập sau này nếu cần. TTL đặt
// 24 giờ (dài hơn 30 phút của reset-password) vì đây không phải tình huống
// khẩn cấp — GV có thể xác nhận email trễ vài giờ vẫn dùng app bình thường
// trong lúc chờ (xem register route, không chặn đăng nhập vì lý do này).
const VERIFY_TOKEN_BYTES = 32;
export const VERIFY_TOKEN_TTL_HOURS = 24;

export function generateVerifyToken(): string {
  return crypto.randomBytes(VERIFY_TOKEN_BYTES).toString('hex');
}

export function hashVerifyToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ĐỔI (phương án dự phòng khi tài khoản bị chiếm): thêm tham số bắt buộc
// `sessionVersion` — PHẢI truyền đúng giá trị hiện có trong DB
// (teacher.sessionVersion) lúc ký token. Mỗi khi tài khoản đặt lại mật khẩu
// hoặc tự bấm "Đăng xuất tất cả thiết bị", sessionVersion trong DB tăng lên
// — token ký TRƯỚC đó (mang số cũ) sẽ không khớp nữa và bị coi là hết hiệu
// lực ngay cả khi JWT về mặt kỹ thuật chưa hết hạn (xem
// getTeacherIdFromRequest). Đây là cách duy nhất "thu hồi" được 1 JWT đã
// phát ra trước khi nó tự hết hạn, vì JWT vốn không thể huỷ giữa chừng.
//
// THÊM MỚI: tham số `opts.impersonatedBy` (id admin) + `opts.expiresInMinutes`
// dùng riêng cho phiên MẠO DANH (xem IMPERSONATE_SESSION_MINUTES ở trên) —
// bỏ trống cho phiên đăng nhập bình thường (30 ngày, không có impersonatedBy).
export function signSessionToken(
  teacherId: string,
  sessionVersion: number,
  opts?: { impersonatedBy?: string; expiresInMinutes?: number }
): string {
  const payload: Record<string, unknown> = { teacherId, sessionVersion };
  if (opts?.impersonatedBy) payload.impersonatedBy = opts.impersonatedBy;
  // ÉP KIỂU: @types/jsonwebtoken mới định nghĩa expiresIn là `number | StringValue`
  // (StringValue = union các chuỗi dạng "30d", "60m",...), không phải `string`
  // chung chung. TS suy luận `expiresIn` ở trên là `string` (do template string
  // với biến số động) nên bị lỗi biên dịch dù giá trị runtime hoàn toàn hợp lệ.
  const expiresIn = (
    opts?.expiresInMinutes ? `${opts.expiresInMinutes}m` : `${SESSION_DAYS}d`
  ) as jwt.SignOptions['expiresIn'];
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

type SessionPayload = { teacherId: string; sessionVersion: number; impersonatedBy?: string };

// Trả về null nếu token thiếu/sai/hết hạn — nơi gọi hàm này tự quyết định
// coi như "chưa đăng nhập" trong mọi trường hợp đó, không phân biệt lý do.
//
// LƯU Ý: token ký TRƯỚC khi thêm sessionVersion (nếu còn sót lại đâu đó)
// không có field này trong payload — coi như sessionVersion = 0, khớp mặc
// định của field mới trong TeacherModel, để không tự nhiên đăng xuất hết
// mọi người đang dùng ngay khi vừa triển khai thay đổi này.
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload === 'object' && payload && 'teacherId' in payload) {
      const p = payload as any;
      return {
        teacherId: String(p.teacherId),
        sessionVersion: typeof p.sessionVersion === 'number' ? p.sessionVersion : 0,
        impersonatedBy: p.impersonatedBy ? String(p.impersonatedBy) : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// MỚI (Bước 1 - API Lớp/Học sinh): mọi route /api/classes và /api/students đều
// cần biết "GV nào đang gọi API này" để lọc ownerId — thay vì copy lại 3 dòng
// đọc cookie + verifySessionToken ở từng route (như auth/me đang làm), gom
// chung vào đây một lần. Trả về null nếu chưa đăng nhập/token hỏng, để route
// gọi hàm này tự quyết định trả 401.
//
// ĐỔI (thêm khoá/mở tài khoản, xem TeacherModel.status): trước đây hàm này
// CHỈ giải mã JWT, không tra DB — nghĩa là 1 tài khoản bị admin khoá vẫn
// dùng được bình thường ở MỌI route cho tới khi cookie hết hạn (30 ngày,
// xem SESSION_DAYS), chỉ riêng /api/auth/login là chặn được đăng nhập MỚI.
// Giờ tra thêm `status` trong DB mỗi lần gọi — hàm trở thành async (mọi nơi
// gọi hàm này đều nằm trong route handler async sẵn nên chỉ cần thêm
// `await`), để tài khoản bị khoá mất quyền dùng API ngay lập tức, không cần
// đợi cookie hết hạn hay đăng xuất/đăng nhập lại.
export async function getTeacherIdFromRequest(request: NextRequest): Promise<string | null> {
  const ctx = await getSessionContext(request);
  return ctx?.teacherId ?? null;
}

// THÊM MỚI (mạo danh + phương án dự phòng chiếm tài khoản): bản đầy đủ hơn
// getTeacherIdFromRequest — cũng trả về CÓ ĐANG mạo danh hay không (và admin
// nào đang mạo danh), để /api/auth/me hiện banner và để route thoát mạo
// danh biết cần khôi phục cookie nào. Mọi route cũ chỉ cần teacherId vẫn
// dùng getTeacherIdFromRequest như trước, không cần sửa gì.
export async function getSessionContext(
  request: NextRequest
): Promise<{
  teacherId: string;
  isImpersonating: boolean;
  impersonatedByAdminId?: string;
  emailVerified: boolean;
} | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session?.teacherId) return null;

  await connectToDatabase();
  const teacher: any = await TeacherModel.findById(session.teacherId)
    .select('status sessionVersion emailVerified')
    .lean();
  // SỬA (vá lỗ hổng): trước đây chỉ chặn 'suspended' ở đây — tài khoản
  // 'pending' (đang chờ duyệt, xem registrationMode trong appSettingsModel.ts)
  // không bị chặn ở TẦNG SESSION này, dù route /api/auth/login đã chặn đăng
  // nhập mới. Hệ quả: nếu 1 session hợp lệ được tạo ra cho tài khoản pending
  // bằng cách nào khác ngoài login (vd. route impersonate trước đây cũng chỉ
  // check 'suspended', xem impersonate/route.ts) thì session đó vẫn dùng
  // được bình thường ở MỌI route — phá vỡ đúng bất biến "pending = chưa
  // dùng được app" mà cả tính năng này đang xây. Giờ chặn cả 'pending' ở
  // đây để chắc chắn 100%, không phụ thuộc vào việc mọi nơi tạo session đều
  // tự nhớ chặn đúng.
  if (!teacher || teacher.status === 'suspended' || teacher.status === 'pending') return null;

  // So khớp sessionVersion — nếu tài khoản vừa đặt lại mật khẩu hoặc bấm
  // "Đăng xuất tất cả thiết bị" SAU khi token này được ký, số trong DB đã
  // tăng lên và không còn khớp số trong token nữa → coi như phiên này đã bị
  // thu hồi, dù JWT chưa hết hạn theo thời gian.
  const dbVersion = typeof teacher.sessionVersion === 'number' ? teacher.sessionVersion : 0;
  if (dbVersion !== session.sessionVersion) return null;

  return {
    teacherId: session.teacherId,
    isImpersonating: !!session.impersonatedBy,
    impersonatedByAdminId: session.impersonatedBy,
    // Tài khoản tạo TRƯỚC khi có field này không có emailVerified trong DB
    // (undefined) — coi như đã xác nhận (=== false mới coi là CHƯA), đúng
    // default: true của schema (xem teacherModel.ts), không tự nhiên khoá
    // nhầm tài khoản cũ.
    emailVerified: teacher.emailVerified !== false,
  };
}

// THÊM MỚI (bắt buộc xác nhận email): bản wrapper của getTeacherIdFromRequest
// — CHẶN THÊM tài khoản CHƯA xác nhận email. Trước đây "bắt buộc xác nhận
// email" chỉ chặn được ở TẦNG GIAO DIỆN (page.tsx — màn hình "Xác nhận
// email để tiếp tục" che hết dashboard) — gọi thẳng API nghiệp vụ (bỏ qua
// giao diện, vd Postman/devtools) vẫn tạo/sửa được dữ liệu bình thường dù
// tài khoản chưa xác nhận email, vì KHÔNG route API nào tự kiểm tra
// emailVerified cả. Giờ mọi route "nghiệp vụ" thật sự tạo/sửa dữ liệu (lớp,
// đề thi, học sinh, bài nộp, xuất file...) đổi sang gọi hàm này thay vì
// getTeacherIdFromRequest, để chặn đúng ở tầng API, không chỉ tầng giao
// diện.
//
// CỐ TÌNH KHÔNG dùng hàm này ở:
//   - /api/auth/resend-verification — tài khoản CHƯA xác nhận vẫn phải gọi
//     được route này để tự gửi lại email xác nhận, nếu chặn luôn ở đây thì
//     GV chưa xác nhận sẽ bị kẹt (không đăng nhập được để gửi lại). Route
//     đó tiếp tục dùng thẳng getTeacherIdFromRequest như cũ.
//   - Mọi route xác thực khác (login/register/verify-email/logout/me) —
//     không cần vì lúc đó chưa có session hoặc chính route đó là nơi tạo/
//     đọc trạng thái session, không phải nơi thao tác dữ liệu nghiệp vụ.
//
// BỎ QUA chặn khi admin đang mạo danh (isImpersonating = true) — cùng đúng
// logic với màn chặn ở page.tsx: admin cần vào được tài khoản GV để hỗ trợ
// dù GV đó chưa xác nhận email, không phải người tự dùng tài khoản của
// chính mình.
export async function getVerifiedTeacherIdFromRequest(request: NextRequest): Promise<string | null> {
  const ctx = await getSessionContext(request);
  if (!ctx) return null;
  if (!ctx.emailVerified && !ctx.isImpersonating) return null;
  return ctx.teacherId;
}

// THÊM MỚI: tăng sessionVersion của 1 tài khoản lên 1 — thu hồi NGAY LẬP
// TỨC mọi cookie phiên đăng nhập đã phát ra trước đó cho tài khoản này (kể
// cả cookie đang nằm trong tay kẻ xấu nếu tài khoản bị chiếm). Gọi khi: đặt
// lại mật khẩu thành công (reset-password), hoặc chủ tài khoản tự bấm "Đăng
// xuất tất cả thiết bị".
export async function bumpSessionVersion(teacherId: string): Promise<void> {
  await connectToDatabase();
  await TeacherModel.findByIdAndUpdate(teacherId, { $inc: { sessionVersion: 1 } });
}
