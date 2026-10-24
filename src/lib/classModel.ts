import mongoose from 'mongoose';

// Lớp học do 1 giáo viên tạo và quản lý.
//
// XÁC NHẬN: mỗi GV chỉ thấy/quản lý lớp của riêng mình → ownerId giờ BẮT
// BUỘC và trỏ sang TeacherModel (thay vì String tạm như bản trước). Mọi API
// GET/POST/PUT/DELETE lớp sau này đều phải kèm điều kiện `ownerId: <GV đang
// đăng nhập>` — nếu thiếu điều kiện này, GV A sẽ thấy/sửa được lớp của GV B.
const ClassSchema = new mongoose.Schema({
  name: { type: String, required: true }, // ví dụ "12A1"
  schoolYear: { type: String, required: true }, // ví dụ "2025 - 2026"

  // Mã mời / mã lớp — để sau này học sinh tự nhập mã này vào app (không cần
  // giáo viên thêm tay từng em). Sinh ngẫu nhiên lúc tạo lớp, giữ ngắn (6 ký
  // tự chữ+số) để học sinh gõ tay dễ, giống mã lớp Google Classroom/Azota.
  inviteCode: { type: String, unique: true, sparse: true },

  // THÊM MỚI (tính năng "Tự báo danh" kiểu Azota): 3 trạng thái thay vì
  // boolean bật/tắt đơn giản như bản trước, vì GV cần phân biệt 2 nhu cầu
  // khác nhau:
  //   - 'off'      : TẮT — giữ hành vi gốc, học sinh bắt buộc có tên sẵn
  //                  trong danh sách lớp mới làm bài được.
  //   - 'auto'     : tự báo danh KHÔNG cần duyệt — học sinh tự gõ tên là
  //                  vào làm bài luôn (nhanh, hợp thi thử/lớp đông không
  //                  kịp kiểm soát).
  //   - 'approval' : tự báo danh CẦN GV duyệt — học sinh tự gõ tên xong bị
  //                  chặn ở màn chờ, phải đợi GV bấm "Duyệt" ở tab Quản lý
  //                  lớp mới bắt đầu làm bài được (chặt hơn, tránh người lạ
  //                  vào thi thật).
  // Mặc định 'off' để giữ đúng hành vi cũ với lớp có sẵn.
  selfRegisterMode: { type: String, enum: ['off', 'auto', 'approval'], default: 'off' },

  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },

  // THÊM MỚI (tính năng "Khối" — gửi 1 link chung cho nhiều lớp): mỗi lớp
  // có thể thuộc về 1 Khối (ví dụ "Khối 12"). Field HOÀN TOÀN optional,
  // default null — lớp cũ có sẵn không set field này vẫn load/lưu bình
  // thường, không breaking change. Việc gán khoiId cho lớp cũ chỉ diễn ra
  // qua script migrate riêng (Phần 2), KHÔNG tự động ở đây. Khối chỉ dùng để
  // nhóm hiển thị + giao đề hàng loạt — không phải 1 cấp cấu hình cài đặt
  // sống riêng, nên không ảnh hưởng gì tới resolveEffectiveSettings hay bất
  // kỳ logic chấm điểm/roster nào đang có.
  khoiId: { type: mongoose.Schema.Types.ObjectId, ref: 'Khoi', default: null, required: false },

  created_at: { type: Date, default: Date.now },
});

// Mọi truy vấn "danh sách lớp của tôi" đều lọc theo ownerId — đánh index để
// nhanh ngay từ đầu, tránh phải thêm sau khi dữ liệu đã nhiều.
ClassSchema.index({ ownerId: 1 });

export const ClassModel =
  mongoose.models.Class || mongoose.model('Class', ClassSchema);
