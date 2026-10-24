import mongoose from 'mongoose';

// ExamAssignment = cấu hình RIÊNG cho 1 cặp (examId, classId) — tức là "1 lần
// giao đề X cho lớp Y". Vì 1 đề có thể được giao cho nhiều lớp khác nhau
// (mỗi lần giao là 1 loạt Submission riêng theo examId+classId), các cài đặt
// (thời gian mở/đóng đề, thời gian làm bài, số lần làm lại, xem lời giải...)
// cũng có thể cần tách theo đúng phạm vi này: đề A giao cho lớp 10A1 và
// 10A2 có thể cần 2 cấu hình khác nhau (ví dụ 2 khung giờ thi khác nhau).
//
// THIẾT KẾ (đã chốt lại toàn bộ, thay cho bản chỉ có openAt/closeAt trước
// đây): MẶC ĐỊNH mọi lớp dùng chung 1 bộ cài đặt duy nhất — chính là
// Exam.settings (cấu hình ở tab "Cài đặt" của đề, áp dụng đồng nhất cho mọi
// lớp được giao đề này, kể cả defaultOpenAt/defaultCloseAt — xem examModel.ts).
// CHỈ KHI giáo viên chủ động bật "Dùng cài đặt riêng cho lớp này" ở panel
// "Giao đề" và bấm Lưu, lớp đó mới có 1 bộ cài đặt RIÊNG (lưu trong
// `settings` bên dưới, chỉ cần chứa những trường GV thực sự đổi — trường nào
// không có trong `settings` vẫn lấy từ Exam.settings) — các lớp khác KHÔNG bị
// ảnh hưởng, vẫn tự động dùng đúng cài đặt mặc định của đề, kể cả khi GV sửa
// cài đặt mặc định đó SAU NÀY. Xem resolveEffectiveSettings() trong
// examAccessRules.ts — nơi DUY NHẤT tính "cài đặt áp dụng thực tế" theo đúng
// thứ tự ưu tiên này, để mọi route (start/submit/thi) đọc thống nhất 1 chỗ,
// không tự suy luận riêng lẻ.
//
// KHÔNG lưu các cài đặt này vào Submission (mỗi học sinh 1 bản ghi, lưu lặp
// lại rất tốn và khó sửa hàng loạt) — tách riêng bảng này để sửa 1 lần là áp
// dụng cho CẢ LỚP, sửa được bất cứ lúc nào (kể cả sau khi đã giao đề), không
// cần giao lại.
const ExamAssignmentSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },

  // true = lớp này ĐANG dùng cài đặt riêng (settings bên dưới), false/chưa
  // có = lớp này dùng nguyên cài đặt mặc định của đề (Exam.settings). Tách
  // hẳn 1 cờ riêng (thay vì chỉ dựa vào `settings` có rỗng hay không) để GV
  // bấm "Dùng lại cài đặt mặc định" là quay về mặc định ngay, không cần xoá
  // tay từng trường đã từng tuỳ chỉnh.
  hasCustomSettings: { type: Boolean, default: false },

  // Cài đặt RIÊNG cho lớp này — CHỈ có hiệu lực khi hasCustomSettings = true.
  // Là 1 phần (partial) của cùng cấu trúc với Exam.settings: duration,
  // shuffle, maxAttempts, showSolution, solutionOpenAt, openAt, closeAt...
  // Trường nào KHÔNG có mặt trong object này thì lấy từ Exam.settings (xem
  // resolveEffectiveSettings) — không cần GV nhập lại toàn bộ, chỉ cần đổi
  // đúng trường muốn khác so với mặc định.
  settings: { type: Object, required: false },

  // CÁC TRƯỜNG CŨ (giữ lại để KHÔNG vỡ dữ liệu đã lưu từ trước khi có
  // hasCustomSettings/settings ở trên) — trước đây openAt/closeAt là 2 field
  // top-level duy nhất, luôn coi là "giờ riêng của lớp" hễ có giá trị.
  // resolveEffectiveSettings() vẫn đọc 2 field này làm phương án dự phòng cho
  // các bản ghi cũ chưa có hasCustomSettings. Từ nay các lượt Lưu MỚI sẽ ghi
  // qua `settings.openAt`/`settings.closeAt` ở trên, không ghi thêm vào đây
  // nữa (nhưng vẫn giữ lại field cho khỏi lỗi schema với dữ liệu cũ).
  openAt: { type: Date, required: false },
  closeAt: { type: Date, required: false },

  updated_at: { type: Date, default: Date.now },
});

// Mỗi cặp (examId, classId) chỉ có 1 bản ghi cấu hình duy nhất — PATCH sau
// này luôn upsert theo đúng cặp này.
ExamAssignmentSchema.index({ examId: 1, classId: 1 }, { unique: true });

export const ExamAssignmentModel =
  mongoose.models.ExamAssignment || mongoose.model('ExamAssignment', ExamAssignmentSchema);
