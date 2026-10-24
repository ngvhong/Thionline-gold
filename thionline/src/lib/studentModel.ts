import mongoose from 'mongoose';

// Học sinh — luôn thuộc về đúng 1 lớp tại 1 thời điểm (classId). Khi giáo
// viên "chuyển lớp" cho học sinh (đã nói ở kế hoạch), chỉ cần update field
// classId này sang lớp mới, không cần xóa/tạo lại học sinh.
const StudentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dob: String, // ngày sinh, lưu dạng chuỗi "dd/mm/yyyy" cho đơn giản, không cần tính toán tuổi
  gender: { type: String, enum: ['Nam', 'Nữ'], required: false },

  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },

  // XÁC NHẬN: học sinh "có tài khoản" theo nghĩa — chỉ những em ĐÃ có tên
  // trong danh sách lớp (record Student này) mới được phép làm bài; không
  // cần mật khẩu. Lúc vào link đề, học sinh CHỌN tên mình từ danh sách lớp
  // (dropdown lấy từ students theo classId của đề được giao) thay vì gõ tay
  // tự do — nhờ vậy người ngoài danh sách không tự ý "thi hộ" bằng tên bất
  // kỳ. Đây là mức chặn vừa đủ, không phải bảo mật tuyệt đối (1 em vẫn có
  // thể chọn nhầm/cố ý chọn tên bạn) — nếu sau này cần chặt hơn, có thể thêm
  // field `pin` (mã 4 số riêng từng em) mà không phải đổi cấu trúc bảng.
  //
  // THÊM MỚI (tính năng "Tự báo danh" kiểu Azota): khi GV bật
  // `selfRegisterMode` (khác 'off') cho 1 lớp (xem classModel.ts), học sinh
  // không thấy tên mình trong dropdown có thể tự gõ tên để "Xin vào lớp" —
  // record Student được tạo ra từ nhánh này đánh dấu selfRegistered=true để
  // GV phân biệt được với danh sách chính thức (import Excel/nhập tay), tiện
  // rà soát tên trùng/tên rác sau này ở tab Quản lý lớp.
  selfRegistered: { type: Boolean, default: false },

  // THÊM MỚI (chế độ "tự báo danh cần duyệt" — xem selfRegisterMode ở
  // classModel.ts): mặc định TRUE cho mọi học sinh thường (GV tự nhập/import
  // Excel, hoặc tự báo danh ở chế độ 'auto') — không ai bị chặn thi trừ khi
  // nói rõ. CHỈ khi 1 em tự báo danh lúc lớp đang ở chế độ 'approval', record
  // tạo ra mới cố ý đặt approved=false — /api/thi/[examId]/start sẽ chặn
  // những em này cho tới khi GV bấm "Duyệt" (PUT /api/students/[id] với
  // approved: true).
  approved: { type: Boolean, default: true },

  created_at: { type: Date, default: Date.now },

  // THÊM MỚI (giai đoạn 1 — tài khoản học sinh): nối 1 dòng roster (thuộc 1
  // lớp cụ thể, như field này vốn có từ trước) với 1 StudentAccount (tài
  // khoản đăng nhập sống ở cấp toàn hệ thống, độc lập lớp — xem
  // studentAccountModel.ts). null nghĩa là dòng roster này chưa có tài
  // khoản nào "vào lớp" nhận đúng tên mình — mọi hành vi cũ (chọn tên qua
  // link /thi/[examId], không cần tài khoản) hoạt động y hệt trước đây,
  // hoàn toàn không phụ thuộc field mới này.
  studentAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentAccount',
    default: null,
    index: true,
  },
});

// 1 lớp không nên có 2 học sinh trùng tên + trùng ngày sinh (tránh nhập
// trùng khi import Excel) — index này chỉ cảnh báo ở tầng ứng dụng khi cần,
// KHÔNG đặt unique cứng vì tên trùng vẫn có thể xảy ra thật (2 em cùng tên).
StudentSchema.index({ classId: 1, name: 1 });

export const StudentModel =
  mongoose.models.Student || mongoose.model('Student', StudentSchema);
