// Email của tài khoản quản trị (Admin) DUY NHẤT hiện tại. Cố tình tách riêng
// hằng số này ra 1 file "nhẹ" (không import bcryptjs/jsonwebtoken như
// src/lib/auth.ts) để file này dùng được ở CẢ hai phía:
//   - Phía CLIENT (trong page.tsx): ẩn/hiện icon "Quản trị" — nếu import
//     thẳng từ auth.ts, Next.js sẽ cố đóng gói cả bcryptjs/jsonwebtoken (vốn
//     chỉ chạy được ở server/Node) vào bundle trình duyệt, dễ gây lỗi build.
//   - Phía SERVER (route /api/admin/*): xác minh đúng email quản trị trước
//     khi cho xem/sửa danh sách tài khoản GV đã đăng ký.
//
// LƯU Ý: đây chỉ là bước "khoá theo email" đơn giản đầu tiên như bạn yêu
// cầu ("hiện tại tôi mở cho tất cả dùng, sau này tính sau") — phía server
// LUÔN tra lại email thật từ database ứng với phiên đăng nhập, không tin bất
// cứ gì client tự gửi lên, nên đổi hằng số này ở đây là đủ, không cần sửa gì
// thêm để đổi/thêm tài khoản quản trị sau này.
export const ADMIN_EMAIL = 'ngvhong79@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL;
}

// THÊM MỚI (gói dùng free/vĩnh viễn — xem src/lib/planAccess.ts):
// Số ngày dùng thử miễn phí kể từ lúc ĐĂNG KÝ tài khoản. Chỉ áp dụng cho
// tài khoản đăng ký MỚI (xem ghi chú freeExpiresAt trong teacherModel.ts).
export const FREE_TRIAL_DAYS = 30;

// Còn lại bao nhiêu ngày thì coi là "sắp hết hạn" — dùng để: (1) hiện banner
// cảnh báo cho GV, (2) tính vào danh sách "sắp hết hạn" ở tab Quản trị.
// SỬA (khiếu nại: "đặt = 30 ngày thì trùng luôn với số ngày trial, khiến
// banner hiện suốt từ ngày đăng ký, không còn ý nghĩa 'sắp hết hạn' nữa"):
// đổi về 5 ngày — tách biệt hẳn với FREE_TRIAL_DAYS ở trên, để banner chỉ
// thật sự hiện khi GV còn 5 ngày trở xuống, đúng nghĩa "sắp hết hạn, cần
// gia hạn gấp".
export const FREE_EXPIRING_SOON_DAYS = 5;

// THÊM MỚI (đóng/duyệt đăng ký khi hạ tầng máy chủ không chịu tải được thêm
// nhiều tài khoản free — xem registrationMode trong appSettingsModel.ts):
// 2 câu thông báo DÙNG CHUNG cho cả 2 phía —
//   - Phía SERVER (route auth/register): trả nguyên câu này làm `error` khi
//     registrationMode === 'closed' (từ chối tạo tài khoản).
//   - Phía CLIENT (trang login/page.tsx): hiện làm banner phía trên form,
//     đọc registrationMode qua GET /api/auth/register (không cần đăng
//     nhập) NGAY khi vào trang, trước khi người dùng kịp bấm "Đăng ký".
// Đặt chung 1 chỗ để đổi câu chữ chỉ cần sửa đúng 1 nơi, không lệch giữa 2
// phía. File này an toàn dùng ở cả client (không import bcryptjs/jsonwebtoken).
export const REGISTRATION_CLOSED_MESSAGE =
  'Do hạ tầng máy chủ hiện chưa đáp ứng được thêm nhiều tài khoản dùng miễn phí, nhà trường tạm dừng nhận đăng ký giáo viên mới. Quý thầy cô thông cảm, vui lòng liên hệ quản trị viên nếu cần hỗ trợ.';
export const REGISTRATION_APPROVAL_MESSAGE =
  'Do hạ tầng máy chủ hiện chưa đáp ứng được thêm nhiều tài khoản dùng miễn phí, đăng ký mới cần quản trị viên duyệt trước khi dùng được. Quý thầy cô vui lòng đăng ký rồi chờ duyệt, xin thông cảm.';

// Thông tin tác giả — hiện cho GV khi hỏi "ai làm ra app này".
export const APP_AUTHOR = {
  name: 'Nguyễn Văn Hồng',
  school: 'Trường THPT An Phước',
  province: 'Tỉnh Khánh Hòa',
};

// Kênh liên hệ hỗ trợ/gia hạn DUY NHẤT hiện tại — Messenger Facebook. Đổi ở
// đây là áp dụng lại toàn bộ app (banner hết hạn, trợ lý AI, thông báo chặn
// tạo/sửa đề...), không cần sửa rải rác từng nơi.
export const ADMIN_CONTACT = {
  facebook: 'https://www.facebook.com/share/1BUZQdJ6X5/',
  email: ADMIN_EMAIL,
};
