import mongoose from 'mongoose';

// Submission = 1 lượt "đề X được giao cho học sinh Y". Đây là bảng trung
// tâm nối 2 tab lại với nhau:
//   - Tab Quản lý lớp (tầng 3, xem 1 học sinh) → query submissions theo studentId
//   - Tab Đề thi (đếm lượt làm + điểm TB trên mỗi card) → query submissions theo examId
//
// Vòng đời trạng thái: "chưa thi" (mới giao, học sinh chưa mở link) →
// "đang thi" (đã mở link, chưa nộp — dùng để phát hiện gian lận/thoát giữa
// chừng sau này) → "đã nộp" (có điểm).
const SubmissionSchema = new mongoose.Schema({
  // SỬA (giai đoạn 1 — tài khoản học sinh, ĐIỂM SỬA FIELD CŨ DUY NHẤT được
  // phép trong cả kế hoạch 5 giai đoạn, xem docs-moi/01-KE-HOACH-CHI-TIET.md):
  // TRƯỚC ĐÂY required: true — GIỜ required: false, vì 1 lượt nộp bài từ
  // "Ôn luyện"/"Đề được giao" qua tài khoản (giai đoạn 2/4) có thể không gắn
  // với `Student` nào (học sinh làm đề ở "Ôn luyện" mà chưa join lớp nào).
  // Toàn bộ logic cũ đọc studentId GIỮ NGUYÊN 100% — mọi Submission tạo qua
  // luồng cũ (/api/thi/[examId]/submit không có tài khoản) vẫn luôn có
  // studentId như trước, chỉ NỚI điều kiện bắt buộc ở tầng schema.
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: false },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },

  // THÊM MỚI (giai đoạn 1 — tài khoản học sinh): học sinh nào (tài khoản)
  // đã nộp lượt này, độc lập với studentId (dòng roster của 1 lớp cụ thể)
  // ở trên — 1 tài khoản có thể có studentId khác nhau ở mỗi lớp đã join,
  // nhưng studentAccountId luôn là CHÍNH tài khoản đó. null cho mọi
  // Submission tạo qua luồng cũ (không qua tài khoản đăng nhập).
  studentAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentAccount',
    default: null,
    index: true,
  },

  status: {
    type: String,
    enum: ['chưa thi', 'đang thi', 'đã nộp'],
    default: 'chưa thi',
  },

  score: { type: Number, required: false }, // số câu đúng, chỉ có khi status = 'đã nộp'
  // THÊM MỚI (Bước 3): tổng số câu của đề TẠI THỜI ĐIỂM nộp bài — lưu kèm để
  // hiện "Điểm: 7/10" mà không phải mở lại raw_data của đề mỗi lần hiển thị
  // (đề có thể bị sửa/xóa sau đó, số câu tại thời điểm làm bài mới là đúng).
  total: { type: Number, required: false },
  // THÊM MỚI: điểm theo thang điểm (0.25/1/0.5 mỗi phần theo barem THPT, GV
  // có thể chỉnh trong Cài đặt) — song song với score/total (đếm số câu) ở
  // trên, KHÔNG thay thế. scorePoints/maxScorePoints là con số hiển thị
  // chính cho học sinh & GV (ví dụ "7.75/10 điểm"), score/total (số câu) vẫn
  // giữ để không phá các chỗ đang hiển thị theo câu.
  scorePoints: { type: Number, required: false },
  maxScorePoints: { type: Number, required: false },
  // Snapshot cấu hình thang điểm ĐÃ DÙNG để chấm lượt này — lưu lại vì GV có
  // thể đổi thang điểm của đề SAU KHI học sinh đã nộp; nếu không lưu kèm,
  // lần xem lại sau sẽ không biết điểm cũ được tính theo thang nào (giống
  // triết lý total ở trên: chốt tại thời điểm nộp, không tính lại theo cấu
  // hình mới nhất).
  scoringUsed: { type: Object, required: false },
  answers: { type: Object, required: false }, // bài làm chi tiết của học sinh, để chấm lại/xem sau

  // THÊM MỚI (Bước 3.1 — Phần IV Tự luận): học sinh chụp ảnh bài làm tay,
  // KHÔNG lưu file trong Mongo — chỉ lưu URL trả về từ Vercel Blob (xem API
  // /api/thi/[examId]/upload-essay-image). Object dạng { [questionId]:
  // string[] } — mỗi câu có thể có NHIỀU ảnh (nhiều trang giấy).
  essayImages: { type: Object, required: false },
  // SỬA (chấm theo từng câu): TRƯỚC ĐÂY chỉ 1 essayScore duy nhất cho cả
  // Phần IV. BÂY GIỜ mỗi câu có điểm riêng — object dạng { [questionId]:
  // number }. Phần IV KHÔNG tự chấm được — GV nhập tay từng câu sau khi xem
  // ảnh, không cộng vào score/total ở trên (2 con số đó CHỈ tính Phần
  // I/II/III tự động) — essayScores được cộng riêng vào scorePoints khi hiện
  // TỔNG ĐIỂM cho học sinh/bảng xuất (xem submit/route.ts, scoreTable.ts).
  essayScores: { type: Object, required: false },
  // THÊM MỚI: tổng điểm TỐI ĐA Phần IV, chốt tại thời điểm nộp bài (số câu ×
  // thang điểm/câu ĐANG DÙNG lúc đó) — cùng triết lý snapshot như `total` ở
  // trên, để không đổi ngược nếu GV sửa thang điểm hoặc số câu Phần IV sau
  // khi học sinh đã nộp.
  essayMaxScore: { type: Number, required: false },
  // THÊM MỚI: ảnh bài làm SAU KHI GV đã khoanh/viết bút đỏ chấm trực tiếp
  // lên ảnh gốc (essayImages) — object dạng { [questionId]: string[] },
  // cùng thứ tự trang với essayImages[questionId]. Phần tử có thể null/thiếu
  // nếu trang đó GV chưa chấm trên ảnh (học sinh vẫn xem được ảnh gốc).
  essayAnnotatedImages: { type: Object, required: false },
  // true khi GV đã chấm ĐỦ mọi câu Phần IV của đề (essayScores có đủ key so
  // với phan_4_TuLuan tại thời điểm chấm) — dùng để quyết định có cộng
  // essayScores vào tổng điểm hiển thị/xuất Excel hay chưa.
  essayGraded: { type: Boolean, default: false },

  // XÁC NHẬN: GV được phép cho học sinh làm lại lần 2, 3... khi có sự cố
  // (mất mạng, nộp nhầm...). Vì vậy KHÔNG còn ràng buộc 1 học sinh - 1 đề =
  // 1 bản ghi duy nhất nữa. Thay vào đó mỗi lần làm là 1 document riêng,
  // đánh số bằng attemptNumber (1, 2, 3...) — giữ lại toàn bộ lịch sử các
  // lần làm trước, không ghi đè. Khi hiển thị ở tab Quản lý lớp / Đề thi,
  // mặc định chỉ lấy bản ghi có attemptNumber LỚN NHẤT của mỗi cặp
  // (studentId, examId) làm kết quả "chính thức" — các lần trước hiện dưới
  // dạng lịch sử nếu GV muốn xem lại.
  attemptNumber: { type: Number, default: 1 },

  // Học sinh KHÔNG tự tạo được lần làm mới — phải do giáo viên bấm "Cho làm
  // lại" ở tab Quản lý lớp thì mới có document attemptNumber tiếp theo. Field
  // này lưu ai đã cấp quyền làm lại, để tránh học sinh tự ý nộp nhiều lần.
  retakeGrantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: false },

  assigned_at: { type: Date, default: Date.now }, // lúc giáo viên giao đề
  started_at: Date, // lúc học sinh mở link bắt đầu làm
  submitted_at: Date, // lúc học sinh nộp bài
});

// Không đặt unique nữa (vì cho phép nhiều lần làm), nhưng vẫn cần index để
// truy vấn nhanh "tất cả lần làm của học sinh X với đề Y" và "lần làm mới
// nhất" (sort theo attemptNumber giảm dần).
SubmissionSchema.index({ studentId: 1, examId: 1, attemptNumber: -1 });

export const SubmissionModel =
  mongoose.models.Submission || mongoose.model('Submission', SubmissionSchema);
