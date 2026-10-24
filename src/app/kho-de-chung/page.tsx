// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): route hoàn toàn
// mới, chỉ vào được khi có session GV hợp lệ (kiểm tra ở KhoDeChungClient
// qua GET /api/auth/me, cùng pattern với page.tsx dashboard GV). Không đụng
// gì tới src/app/page.tsx hay src/app/student/*.
import KhoDeChungClient from './KhoDeChungClient';

export default function KhoDeChungPage() {
  return <KhoDeChungClient />;
}
