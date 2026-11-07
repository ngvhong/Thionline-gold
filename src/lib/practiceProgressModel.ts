import mongoose from 'mongoose';

// THÊM MỚI (25-10): tiến độ tab "Ôn luyện" (tương tác) của 1 tài khoản học sinh ở
// 1 đề — MỖI (tài khoản, đề) ĐÚNG 1 BẢN GHI. "Làm lại" thì xóa sạch rồi ghi đè lại
// (chỉ tăng `attempts`), đúng yêu cầu: điểm ôn luyện được lưu, làm lại thì cập nhật.
// Khóa câu hỏi: `${part}:${questionId}` với part ∈ p1|p2|p3|p4.
const PracticeProgressSchema = new mongoose.Schema({
  studentAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentAccount', required: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  p1Answers: { type: Object, default: {} }, // qid -> chỉ số phương án (thứ tự GỐC)
  p2Answers: { type: Object, default: {} }, // qid -> { chỉ số ý: đúng/sai }
  textAnswers: { type: Object, default: {} }, // qid -> chuỗi
  checked: { type: [String], default: [] }, // các câu đã bấm kiểm tra (đáp án đã khóa, được tính điểm)
  solutionOpened: { type: [String], default: [] }, // các câu đã mở lời giải -> ghi chú "đã xem lời giải"
  // Tóm tắt (server tính lại mỗi lần lưu) — dùng cho danh sách đề, không cần tải cả đề.
  answered: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  scorePoints: { type: Number, default: 0 },
  maxScorePoints: { type: Number, default: 0 },
  solutionCount: { type: Number, default: 0 },
  attempts: { type: Number, default: 1 },
  updated_at: { type: Date, default: Date.now },
});
PracticeProgressSchema.index({ studentAccountId: 1, examId: 1 }, { unique: true });

export const PracticeProgressModel =
  mongoose.models.PracticeProgress || mongoose.model('PracticeProgress', PracticeProgressSchema);
