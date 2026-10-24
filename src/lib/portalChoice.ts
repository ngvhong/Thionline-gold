'use client';

// THÊM MỚI (Giai đoạn 0 — bảng chọn vai trò): cookie NHẸ, chỉ để nhớ "lần
// gần nhất người dùng bấm vào nhánh nào" (giáo viên hay học sinh), để lần
// sau mở /login không phải bấm lại bảng chọn vai trò.
//
// QUAN TRỌNG: đây KHÔNG PHẢI cookie đăng nhập, không dùng để cấp quyền truy
// cập bất kỳ dữ liệu nào. Đăng nhập thật của giáo viên vẫn dùng
// session_token (xem src/lib/auth.ts, KHÔNG đổi gì ở đó); đăng nhập học
// sinh dùng student_session_token riêng (Giai đoạn 1, src/lib/studentAuth.ts).
// Cookie này chỉ điều hướng UI, mất/sai cũng không gây rủi ro bảo mật gì —
// cùng lắm là hiện lại bảng chọn vai trò cho người dùng bấm lại.

const COOKIE_NAME = 'last_portal_choice';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 năm

export type PortalChoiceValue = 'teacher' | 'student';

export function getPortalChoice(): PortalChoiceValue | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return value === 'teacher' || value === 'student' ? value : null;
}

export function setPortalChoice(choice: PortalChoiceValue): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=${choice}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

// Dùng cho nút "Không phải bạn? Đổi vai trò" — không xoá phiên đăng nhập
// nào, chỉ xoá "trí nhớ" để lần mở app kế tiếp hiện lại bảng chọn.
export function clearPortalChoice(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}
