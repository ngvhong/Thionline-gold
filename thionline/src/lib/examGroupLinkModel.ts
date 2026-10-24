import mongoose from 'mongoose';

// ExamGroupLink = đại diện cho "1 lượt giao đề qua Khối" = 1 link chung duy
// nhất mà giáo viên gửi cho nhiều lớp cùng lúc (thay vì gửi từng link riêng
// theo từng lớp như trước). Link dạng /thi/{examId}?g={code}, tồn tại song
// song với link lớp cũ /thi/{examId}?class={classId} — 2 dạng không loại
// trừ nhau, GV chọn gửi loại nào tùy đợt.
//
// QUAN TRỌNG — bản ghi này KHÔNG lưu settings/cài đặt gì cả. Settings luôn
// nằm ở ExamAssignment của TỪNG LỚP trong `classIds` bên dưới (xem
// examAssignmentModel.ts — giữ nguyên 100%, không đổi). `classIds` ở đây
// chỉ dùng để:
//   (a) biết link chung này thực tế dẫn tới những lớp nào — đây là NGUỒN SỰ
//       THẬT DUY NHẤT cho việc đó, `khoiId` bên dưới chỉ để hiển thị UI (ví
//       dụ hiện tên khối trong màn quản lý), TUYỆT ĐỐI không dùng khoiId để
//       tính quyền truy cập hay suy ra danh sách lớp — luôn phải đọc
//       classIds.
//   (b) khi giáo viên mở lại đúng lượt giao đề này để sửa (ví dụ đổi giờ
//       thi), màn hình tick sẵn đúng các lớp trong classIds, không phải tick
//       lại từ đầu.
const ExamGroupLinkSchema = new mongoose.Schema({
  // Mã ngắn, random, unique — dùng trực tiếp trên URL (?g=code). Sinh 1 lần
  // duy nhất khi tạo lượt giao đề đầu tiên qua khối này; các lần sửa lại sau
  // đó (mở lại "Giao đề" cho đúng cặp examId+khoiId) upsert vào ĐÚNG bản ghi
  // này, giữ nguyên code cũ — để link đã gửi ra cho học sinh không bao giờ
  // đổi giữa chừng.
  code: { type: String, unique: true, required: true },

  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },

  // CHỈ để hiển thị (ví dụ hiện tên khối trong danh sách link đã tạo) — xem
  // ghi chú ở đầu file, không dùng field này để tính quyền truy cập.
  khoiId: { type: mongoose.Schema.Types.ObjectId, ref: 'Khoi', required: true },

  // NGUỒN SỰ THẬT DUY NHẤT cho việc "link này dẫn tới lớp nào" — chỉ chứa
  // đúng các lớp ĐÃ ĐƯỢC TICK trong lượt giao đề gần nhất, KHÔNG tự động là
  // toàn bộ lớp trong khối (giáo viên có thể chỉ giao 3/7 lớp).
  classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],

  // ref Teacher — để kiểm tra quyền khi GV mở lại sửa lượt giao đề này,
  // giống ownerId ở các model khác trong dự án.
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Mỗi cặp (examId, khoiId) chỉ có đúng 1 lượt giao đề qua khối đang hoạt
// động — mở lại để sửa thì upsert đúng bản ghi này (không tạo mã mới, giữ
// nguyên link đã gửi ra), giống hệt cách ExamAssignmentSchema unique theo
// (examId, classId).
ExamGroupLinkSchema.index({ examId: 1, khoiId: 1 }, { unique: true });

export const ExamGroupLinkModel =
  mongoose.models.ExamGroupLink || mongoose.model('ExamGroupLink', ExamGroupLinkSchema);
