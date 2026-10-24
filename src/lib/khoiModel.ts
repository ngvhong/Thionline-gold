import mongoose from 'mongoose';

// Khoi = nhóm hiển thị các lớp CÙNG khối lớp (10/11/12...) của 1 giáo viên,
// trong 1 năm học cụ thể. Ví dụ: GV dạy 7 lớp 12 (12A1..12A7) trong năm học
// 2025-2026 → tạo 1 bản ghi Khoi "Khối 12" cho năm học đó, rồi gán 7 lớp vào.
//
// QUAN TRỌNG — Khoi KHÔNG lưu bất kỳ cài đặt/cấu hình riêng nào của chính nó
// (không có "settings cấp khối" sống độc lập). Khoi chỉ phục vụ 2 việc:
//   1. Nhóm hiển thị các lớp cùng khối để chọn nhanh khi giao đề hàng loạt.
//   2. Là mốc để sinh 1 link chung (xem ExamGroupLinkModel) trỏ tới đúng tập
//      lớp đã được giao trong 1 lượt giao đề qua khối.
// Mọi cài đặt cuối cùng (thời gian làm bài, giờ mở/đóng, số lần làm lại...)
// luôn được ghi thẳng vào ExamAssignment của TỪNG LỚP đã được giao — hệt như
// giáo viên tự vào từng lớp bật "dùng cài đặt riêng", chỉ khác là làm 1 lần
// cho nhiều lớp. Xem thêm examAssignmentModel.ts và examAccessRules.ts
// (resolveEffectiveSettings) — 2 file này giữ nguyên 100%, không đổi gì.
const KhoiSchema = new mongoose.Schema({
  name: { type: String, required: true }, // ví dụ "Khối 12"

  // Số khối 6-12, dùng để nhận diện/migrate tự động từ tên lớp (xem
  // detectGrade() ở script migrate của Phần 2) và để tránh tạo trùng Khoi
  // cho cùng 1 số khối trong cùng 1 năm học của cùng 1 GV. Không bắt buộc
  // phải hiển thị nguyên số này trên UI — `name` mới là tên hiển thị chính.
  grade: { type: Number, required: true, min: 6, max: 12 },

  schoolYear: { type: String, required: true }, // ví dụ "2025 - 2026", tách khối theo từng năm học — cùng 1 số khối nhưng khác năm học là 2 Khoi khác nhau.

  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true }, // mỗi GV có Khoi riêng, giống ClassModel.ownerId — mọi truy vấn "khối của tôi" đều phải lọc theo field này.

  created_at: { type: Date, default: Date.now },
});

// Mỗi GV chỉ có đúng 1 Khoi cho 1 số khối trong 1 năm học — tránh tạo trùng
// (ví dụ bấm "Tạo khối" 2 lần cho cùng khối 12 năm 2025-2026). find-or-create
// trong script migrate (Phần 2) và API tạo khối (Phần 3) đều phải dựa vào
// đúng bộ khóa này.
KhoiSchema.index({ ownerId: 1, schoolYear: 1, grade: 1 }, { unique: true });

export const KhoiModel =
  mongoose.models.Khoi || mongoose.model('Khoi', KhoiSchema);
