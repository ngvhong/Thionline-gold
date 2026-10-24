import { FREE_EXPIRING_SOON_DAYS, ADMIN_CONTACT } from './adminConfig';

// THÊM MỚI (gói dùng free/vĩnh viễn): NƠI DUY NHẤT tính trạng thái gói dùng
// từ dữ liệu thô của Teacher (planType + freeExpiresAt) — mọi route chặn
// (save-exam, exams/[id] PATCH) và mọi chỗ hiển thị (banner GV, tab Quản
// trị) đều PHẢI gọi qua đây, không tự so sánh ngày tháng riêng lẻ ở từng
// nơi, để tránh lệch logic (vd. quên trừ múi giờ, quên coi 'lifetime' là
// không bao giờ hết hạn...).

export type PlanStatus = {
  planType: 'free' | 'lifetime';
  isLifetime: boolean;
  // null nghĩa là "không có hạn áp dụng" — hoặc vì lifetime, hoặc vì tài
  // khoản cũ tạo trước khi có tính năng này (freeExpiresAt chưa từng được
  // set — xem ghi chú trong teacherModel.ts).
  freeExpiresAt: Date | null;
  isExpired: boolean;
  isExpiringSoon: boolean; // còn hạn nhưng <= FREE_EXPIRING_SOON_DAYS ngày
  daysRemaining: number | null; // null nếu không có hạn áp dụng
};

type TeacherPlanFields = {
  planType?: 'free' | 'lifetime' | null;
  freeExpiresAt?: Date | string | null;
};

export function computePlanStatus(teacher: TeacherPlanFields): PlanStatus {
  const planType: 'free' | 'lifetime' = teacher.planType === 'lifetime' ? 'lifetime' : 'free';
  const isLifetime = planType === 'lifetime';

  // Tài khoản lifetime hoặc chưa từng được set hạn (tài khoản cũ, xem ghi
  // chú teacherModel.ts) → coi như không có hạn áp dụng, không bao giờ bị
  // chặn bởi tính năng này.
  const freeExpiresAt = !isLifetime && teacher.freeExpiresAt ? new Date(teacher.freeExpiresAt) : null;

  if (isLifetime || !freeExpiresAt) {
    return {
      planType,
      isLifetime,
      freeExpiresAt: null,
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: null,
    };
  }

  const now = Date.now();
  const msRemaining = freeExpiresAt.getTime() - now;
  // Làm tròn LÊN theo ngày — còn vài giờ vẫn tính là "còn 1 ngày", tránh
  // hiện "còn 0 ngày" gây hiểu nhầm là đã hết hạn trong khi thực ra chưa.
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  const isExpired = msRemaining <= 0;
  const isExpiringSoon = !isExpired && daysRemaining <= FREE_EXPIRING_SOON_DAYS;

  return {
    planType,
    isLifetime,
    freeExpiresAt,
    isExpired,
    isExpiringSoon,
    daysRemaining,
  };
}

// Dùng ở các route CHẶN tạo/sửa đề (save-exam POST, exams/[id] PATCH nội
// dung) — hết hạn free thì false, mọi trường hợp khác true. Xem/thi/xuất
// điểm... KHÔNG dùng hàm này (vẫn luôn cho phép kể cả khi hết hạn, theo xác
// nhận: "vẫn xem được nhưng không tạo/sửa được đề thi mới").
export function canCreateOrEditExam(teacher: TeacherPlanFields): boolean {
  return !computePlanStatus(teacher).isExpired;
}

// Thông điệp lỗi dùng chung khi chặn — kèm thông tin liên hệ admin để GV
// biết cần làm gì tiếp theo, thay vì chỉ báo "bị từ chối" chung chung.
export function planExpiredMessage(): string {
  return (
    `Gói dùng thử miễn phí của bạn đã hết hạn nên chưa thể tạo/sửa đề thi mới. ` +
    `Vui lòng liên hệ admin qua Messenger Facebook ${ADMIN_CONTACT.facebook} hoặc email ${ADMIN_CONTACT.email} để gia hạn.`
  );
}
