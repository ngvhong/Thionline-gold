import mongoose from 'mongoose';

// THÊM MỚI: ShortLink = rút gọn link chia sẻ đề thi (dạng /thi/{examId}?class=...
// hoặc /thi/{examId}?g=...) thành 1 link ngắn dạng /s/{code} — lý do: link gốc
// chứa 2 chuỗi Mongo ObjectId (24 ký tự hex) nên rất dài, khi dán vào Zalo/
// Messenger bị xuống dòng 5-6 dòng nhìn rối, không chuyên nghiệp.
//
// Cơ chế: /s/{code} là 1 route redirect (307) công khai, tra `code` ra
// `target` rồi chuyển hướng thẳng tới link gốc /thi/... — TOÀN BỘ logic thi
// (đọc đề, nộp bài, chấm điểm...) giữ nguyên 100% ở route gốc, ShortLink chỉ
// là 1 lớp "bí danh URL" mỏng, không đụng gì tới luồng làm bài.
const ShortLinkSchema = new mongoose.Schema({
  // Mã ngắn, random, unique — dùng trực tiếp trên URL (/s/{code}).
  code: { type: String, unique: true, required: true },

  // Link đích ĐẦY ĐỦ dạng path + query, ví dụ:
  // "/thi/507f1f77bcf86cd799439011?class=507f191e810c19729de860ea"
  // Lưu nguyên chuỗi, không parse lại — route redirect chỉ việc nối thêm
  // origin vào trước rồi chuyển hướng, không cần hiểu ý nghĩa từng phần.
  target: { type: String, required: true },

  // Tham chiếu examId — CHỈ để tiện tra cứu/dọn dẹp sau này (ví dụ xóa hết
  // short link của 1 đề khi đề bị xóa), KHÔNG dùng để tính quyền truy cập.
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },

  created_at: { type: Date, default: Date.now },
});

// Mỗi link đích chỉ có đúng 1 mã ngắn — gọi lại API tạo short link nhiều lần
// cho cùng 1 target (ví dụ giáo viên mở lại panel chia sẻ) trả về ĐÚNG code
// cũ, không sinh mã mới mỗi lần, tránh rác trong DB và giữ link đã gửi ra
// không bao giờ đổi.
ShortLinkSchema.index({ target: 1 }, { unique: true });

export const ShortLinkModel =
  mongoose.models.ShortLink || mongoose.model('ShortLink', ShortLinkSchema);
