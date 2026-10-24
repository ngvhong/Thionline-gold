import mongoose from 'mongoose';

// THÊM MỚI (audit log tối thiểu): ghi lại "ai (admin nào) làm gì (khoá/mở),
// với tài khoản nào, lúc nào" — CHỈ ghi, không có mục đích nghiệp vụ nào
// khác, chỉ để tra cứu khi có tranh chấp/sự cố sau này ("ai khoá tài khoản
// tôi"). Cố tình KHÔNG dùng ref/populate phức tạp — lưu thẳng email/tên dạng
// snapshot tại thời điểm thao tác, để dù tài khoản liên quan có bị đổi tên/
// xoá sau này thì log vẫn đọc được nguyên vẹn, không bị mất ngữ cảnh.
const AdminAuditLogSchema = new mongoose.Schema({
  adminEmail: { type: String, required: true },
  action: { type: String, required: true }, // vd. 'suspend_teacher' | 'unsuspend_teacher'
  targetTeacherId: { type: String, required: true },
  targetEmail: { type: String, required: true },
  detail: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
});

export const AdminAuditLogModel =
  mongoose.models.AdminAuditLog || mongoose.model('AdminAuditLog', AdminAuditLogSchema);
