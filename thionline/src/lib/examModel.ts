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

  // THÊM MỚI (giai đoạn 3 — Kho đề chung giữa giáo viên): đề được gắn vào 1
  // nhánh của cây LibraryFolder (kho đề chung, quản lý cấu trúc bởi admin —
  // xem libraryFolderModel.ts). null = chưa gắn vào kho chung nào.
  sharedFolderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryFolder', default: null, index: true },
  // true = GV chủ đề đã bật "chia sẻ vào kho chung" — GV KHÁC mới thấy/lấy
  // được đề này trong /kho-de-chung (xem route /api/library/exams,
  // /api/library/exams/[id]/clone). false/undefined = chỉ chủ đề tự thấy,
  // giữ đúng hành vi riêng tư mặc định của mọi đề từ trước tới nay.
  shareWithTeachers: { type: Boolean, default: false },
  // THÊM MỚI: dùng ở Giai đoạn 4 (tab "Ôn luyện" cho học sinh) — thêm luôn
  // field này ở Giai đoạn 3 cho gọn, tránh phải sửa examModel.ts lần 2. true
  // = học sinh (qua tài khoản, không cần GV giao) tự vào làm được đề này ở
  // khu vực "Ôn luyện". Giai đoạn 3 CHƯA có route/UI nào đọc field này để
  // cho học sinh làm bài thật — chỉ hiện sẵn checkbox trong popup chia sẻ.
  openForStudents: { type: Boolean, default: false },
});

export const Exam = mongoose.models.Exam || mongoose.model('Exam', ExamSchema);
