import mongoose from 'mongoose';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): 1 nhánh trong cây
// thư mục dùng chung cho toàn hệ thống (Lớp 10/11/12, Ôn tuyển 10, Ôn QG,
// Ôn HSG...). Chỉ ADMIN quản lý cấu trúc cây (thêm/sửa/xoá nhánh) — GV chỉ
// được gắn đề của mình vào 1 nhánh có sẵn (xem 00-THINKING.md mục 6: "1 cây,
// nhiều cờ lọc theo người xem là ai", không nhân bản cây theo từng GV).
const LibraryFolderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // null = nhánh gốc (cấp cao nhất, ví dụ "Lớp 10"). Có giá trị = nhánh con
  // của 1 LibraryFolder khác (ví dụ "Chương 1 - Hàm số" bên trong "Lớp 10").
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LibraryFolder', default: null, index: true },
  // Thứ tự hiển thị trong cùng 1 cấp cha — số nhỏ hơn hiện trước.
  order: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
});

export const LibraryFolder =
  mongoose.models.LibraryFolder || mongoose.model('LibraryFolder', LibraryFolderSchema);
