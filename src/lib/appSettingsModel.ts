import mongoose from 'mongoose';

// THÊM MỚI: cấu hình chung của app lưu trong DB thay vì biến môi trường —
// bắt đầu với Gemini API key dùng cho trợ lý AI (/api/ai-assistant), để
// admin tự đổi key ngay trong trang Quản trị, không cần đụng vào hosting/
// biến môi trường mỗi lần đổi key.
//
// CHỈ ĐÚNG 1 BẢN GHI DUY NHẤT trong collection này (singleton) — luôn truy
// vấn/ghi vào đúng _id cố định SETTINGS_DOC_ID bên dưới, không tạo thêm bản
// ghi thứ 2. Cách này đơn giản hơn hẳn so với thêm hẳn 1 bảng key-value đầy
// đủ, phù hợp vì hiện tại chỉ có 1 cấu hình cần lưu.
export const SETTINGS_DOC_ID = 'app_settings_singleton';

const AppSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: SETTINGS_DOC_ID },
  geminiApiKey: { type: String, default: '' },
  // THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): số ngày dùng thử mặc
  // định cấp cho tài khoản GV đăng ký MỚI — cùng cách lưu với
  // geminiApiKey (admin tự đổi trong trang Quản trị, không cần sửa hằng
  // số FREE_TRIAL_DAYS trong adminConfig.ts rồi deploy lại). null nghĩa
  // là "chưa cấu hình riêng" — dùng fallback FREE_TRIAL_DAYS (xem
  // getFreeTrialDays trong appSettings.ts).
  freeTrialDays: { type: Number, default: null },
  // THÊM MỚI (đóng/duyệt đăng ký khi hạ tầng máy chủ không chịu tải được
  // thêm nhiều tài khoản free): admin bật 1 trong 3 chế độ ngay trong trang
  // Quản trị, không cần sửa code/deploy lại —
  //   - 'open': mặc định, ai cũng đăng ký + dùng được ngay (hành vi cũ,
  //     100% tương thích với trước khi có field này).
  //   - 'approval': vẫn cho điền form đăng ký, nhưng tài khoản tạo ra ở
  //     trạng thái 'pending' (xem TeacherModel) — phải CHỜ admin bấm
  //     "Duyệt" ở tab Quản trị mới đăng nhập được (xem route đăng ký/đăng
  //     nhập).
  //   - 'closed': tạm KHÔNG nhận đăng ký mới nào — trả lỗi ngay ở bước gửi
  //     form, kèm banner giải thích lý do (hạ tầng), không tạo tài khoản.
  registrationMode: { type: String, enum: ['open', 'approval', 'closed'], default: 'open' },
  updated_at: { type: Date, default: Date.now },
});

export const AppSettingsModel =
  mongoose.models.AppSettings || mongoose.model('AppSettings', AppSettingsSchema);
