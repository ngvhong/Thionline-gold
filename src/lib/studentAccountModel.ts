import mongoose from 'mongoose';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): StudentAccount là 1 tài
// khoản đăng nhập sống ở CẤP TOÀN HỆ THỐNG, độc lập với lớp — khác hẳn
// `Student` (studentModel.ts), vốn là 1 dòng roster THUỘC VỀ 1 lớp cụ thể,
// do giáo viên nhập, không có khái niệm đăng nhập.
//
// 1 StudentAccount có thể nối tới NHIỀU `Student` (mỗi lớp học sinh đã
// join là 1 `Student` riêng, xem `Student.studentAccountId`) — việc nối
// này diễn ra khi học sinh dùng mã lớp (`inviteCode`) để "vào lớp" và chọn
// đúng tên mình trong danh sách lớp đó (xem /api/student-auth/join-class).
//
// Xem thêm lý do thiết kế ở docs-moi/00-THINKING.md mục 4 và 5.
const StudentAccountSchema = new mongoose.Schema({
  name: { type: String, required: true },

  // Dùng làm định danh đăng nhập (thay email như GV) — học sinh cấp 2/đầu
  // cấp 3 thường không có email riêng, số điện thoại dễ nhớ hơn. Chuẩn hoá
  // (bỏ khoảng trắng/gạch ngang) trước khi lưu — xem hàm normalizePhone
  // trong studentAuth.ts, dùng lại đúng 1 chỗ ở mọi route.
  phone: { type: String, required: true, unique: true, index: true },

  // bcrypt hash, cùng cách TeacherModel.passwordHash hash mật khẩu GV (xem
  // src/lib/auth.ts hashPassword) — không lưu PIN gốc bao giờ.
  pinHash: { type: String, required: true },

  // Tăng lên để "đăng xuất khỏi mọi nơi" — cùng cơ chế
  // TeacherModel.sessionVersion (xem auth.ts). Tăng khi: giáo viên đặt lại
  // PIN hộ học sinh (PIN cũ không còn dùng được nữa, mọi phiên cũ đang mở
  // trên máy khác cũng nên mất hiệu lực ngay, không đợi hết hạn 30 ngày).
  sessionVersion: { type: Number, default: 0 },

  created_at: { type: Date, default: Date.now },
});

export const StudentAccountModel =
  mongoose.models.StudentAccount || mongoose.model('StudentAccount', StudentAccountSchema);
