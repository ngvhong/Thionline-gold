import mongoose from 'mongoose';

// Định nghĩa khung dữ liệu (Schema) DÙNG CHUNG cho mọi API route liên quan
// tới đề thi. Trước đây mỗi route tự khai báo lại schema riêng — dễ bị lệch
// nhau khi thêm field mới (ví dụ is_published, settings) vì chỉ cần 1 route
// quên cập nhật là dữ liệu ghi/đọc không khớp. Giờ tất cả import từ đây.
const ExamSchema = new mongoose.Schema({
  title: String,
  // THÊM MỚI (bảo mật): GV sở hữu đề — trước đây KHÔNG có field này nên
  // /api/exams và /api/exams/[id] không thể lọc/kiểm tra được ai là chủ đề,
  // dẫn tới việc bất kỳ ai đăng nhập (hoặc biết ID) đều xem/sửa/xoá được đề
  // của GV khác. Đề TẠO TRƯỚC khi có field này sẽ có teacherId = null —
  // coi như "chưa xác định chủ", sẽ không hiện trong danh sách/GET của bất
  // kỳ GV nào cho tới khi được gán lại thủ công (xem ghi chú ở route PATCH).
  teacherId: { type: String, default: null },
  raw_data: Object, // đề thi đã bóc tách (phan_1_TracNghiem, tikz_list...)
  // THÊM MỚI: cài đặt phòng thi (thời gian làm bài, trộn câu, chế độ xem
  // đáp án...) — cần lưu kèm để sau này link công khai load đúng cấu hình
  // giáo viên đã chọn, không phải lúc nào cũng chạy mặc định.
  settings: Object,
  // THÊM MỚI: true khi đề đã qua bước "Soát lỗi" và được Xuất bản (có link
  // công khai cho học sinh). false/undefined = chỉ là bản lưu nháp riêng tư.
  is_published: { type: Boolean, default: false },
  published_at: Date,
  created_at: { type: Date, default: Date.now },
  // THÊM MỚI: tên thư mục để gom nhóm đề trong bảng quản lý (panel dưới
  // ExamBuilder). '' / undefined = chưa xếp vào thư mục nào ("Chưa phân loại").
  folder: { type: String, default: '' },
});

export const Exam = mongoose.models.Exam || mongoose.model('Exam', ExamSchema);
