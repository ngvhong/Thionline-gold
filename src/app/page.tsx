'use client';

import { useState, useEffect, useRef, Fragment, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import ExamBuilder from './ExamBuilder';
// THÊM MỚI (Phần 3b — tính năng Khối): tách riêng component, không nhồi
// thêm vào page.tsx vốn đã dài (đúng khuyến nghị tách 3a/3b của
// GHI-CHU-PHAN-3.md gốc) — xem GHI-CHU-PHAN-3B.md để biết contract API.
import KhoiTab from './KhoiTab';
import { renderExamText, buildTikzSvgMap } from '@/lib/examRender';
import { gradeExam, computeEssayMax, round2 } from '@/lib/grading';
import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';
import { isAdminEmail, ADMIN_CONTACT } from '@/lib/adminConfig';
import EssayAnnotator from '@/components/EssayAnnotator';
import { useInAppBrowserWarning } from '@/lib/useInAppBrowserWarning';
import { AiHelpWidget } from '@/components/AiHelpWidget';

// THÊM LẠI (theo yêu cầu mới nhất): trước đây từng bỏ tab "Trang chủ" theo
// khiếu nại "chỉ nên có 2 tab", giờ GV muốn có lại — quay về đủ 3 tab.
// THÊM MỚI: tab 'admin' — CHỈ hiện trong NAV_ITEMS (xem bên dưới) khi tài
// khoản đang đăng nhập đúng là ADMIN_EMAIL, dùng để xem danh sách tài khoản
// GV đã đăng ký (xem AdminTab).
// THÊM MỚI (Phần 3b): tab 'khoi' — trang quản lý Khối, đặt cạnh tab "Quản
// lý lớp" theo đúng spec-tinh-nang-khoi.md mục 8 ("đặt cạnh trang quản lý
// Lớp hiện có, tái dùng component/style").
type MainTab = 'home' | 'classes' | 'khoi' | 'exams' | 'admin';
type CurrentTeacher = {
  id: string;
  email: string;
  name: string;
  // THÊM MỚI (bắt buộc xác nhận email): true/false xem tài khoản đã bấm
  // link xác nhận trong email hay chưa — dùng để chặn dùng app ở gate bên
  // dưới (xem "if (!teacher.emailVerified...)" sau early-return checkingSession).
  emailVerified?: boolean;
  planStatus?: {
    planType: 'free' | 'lifetime';
    isLifetime: boolean;
    freeExpiresAt: string | null;
    isExpired: boolean;
    isExpiringSoon: boolean;
    daysRemaining: number | null;
  };
};

// THÊM MỚI (mạo danh): khớp field `impersonating` mới thêm ở GET
// /api/auth/me — có giá trị khi phiên hiện tại là admin đang "xem thay mặt"
// 1 GV khác (khớp SESSION_COOKIE hiện tại = tài khoản GV đó, nhưng có
// nguồn gốc từ admin). null khi đăng nhập bình thường.
type ImpersonatingInfo = { adminEmail: string } | null;

// THÊM MỚI: dữ liệu 1 dòng trong bảng "Quản trị" — khớp với response của
// GET /api/admin/teachers (chỉ tài khoản admin gọi được, xem adminGuard.ts).
type TeacherAccountItem = {
  _id: string;
  email: string;
  name: string;
  created_at: string;
  classCount: number;
  // THÊM MỚI: khớp field status mới thêm ở TeacherModel/API — 'active' hay
  // 'suspended' (bị admin khoá).
  // THÊM MỚI (đóng/duyệt đăng ký): thêm 'pending' — tài khoản đăng ký lúc
  // registrationMode === 'approval', đang chờ admin bấm "Duyệt".
  status: 'active' | 'suspended' | 'pending';
  // THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): khớp field trả thêm ở GET
  // /api/admin/teachers (Phần 2a) — planStatus đã tính sẵn qua
  // computePlanStatus (xem src/lib/planAccess.ts), không tự tính lại ngày
  // tháng ở đây.
  planType: 'free' | 'lifetime';
  freeExpiresAt: string | null;
  // SỬA: đổi thành optional — API GET /api/admin/teachers có thể trả về
  // thiếu trường này cho một số bản ghi (vd. tài khoản cũ chưa có
  // planType), nên phía client không được giả định luôn tồn tại.
  planStatus?: {
    planType: 'free' | 'lifetime';
    isLifetime: boolean;
    freeExpiresAt: string | null;
    isExpired: boolean;
    isExpiringSoon: boolean;
    daysRemaining: number | null;
  };
};

// THÊM MỚI: 1 dòng nhật ký thao tác quản trị (khớp response của GET
// /api/admin/audit-log) — hiện chỉ có 2 loại action: khoá/mở tài khoản.
type AdminAuditLogItem = {
  _id: string;
  adminEmail: string;
  action: string;
  targetEmail: string;
  detail: string;
  created_at: string;
};

// THÊM MỚI: thống kê tổng quan hệ thống (khớp response của GET
// /api/admin/stats) — hiện ở dải thẻ số liệu đầu tab Quản trị.
type AdminStats = {
  teacherCount: number;
  activeTeacherCount: number;
  suspendedCount: number;
  // THÊM MỚI (đóng/duyệt đăng ký): khớp field trả thêm ở GET /api/admin/stats.
  pendingCount: number;
  newTeachersThisWeek: number;
  classCount: number;
  examCount: number;
  publishedExamCount: number;
  submissionCount: number;
  // THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): khớp 2 field trả thêm ở
  // GET /api/admin/stats (Phần 2a).
  expiringSoonCount: number;
  expiredFreeCount: number;
};

// THÊM MỚI: khớp response của GET/PUT /api/admin/settings — trạng thái cấu
// hình Gemini API key cho trợ lý AI (xem AiSettingsPanel bên dưới).
type AdminAiSettings = {
  geminiApiKeyConfigured: boolean;
  geminiApiKeyMasked: string;
  // THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): số ngày dùng thử mặc
  // định hiện tại, đọc/ghi cùng route /api/admin/settings (xem
  // getFreeTrialDays/setFreeTrialDays trong appSettings.ts).
  freeTrialDays: number;
  // THÊM MỚI (đóng/duyệt đăng ký): chế độ đăng ký hiện tại — 'open' (mở
  // cho tất cả), 'approval' (đăng ký được nhưng chờ admin duyệt), 'closed'
  // (tạm không nhận đăng ký mới nào), xem registrationMode trong
  // appSettingsModel.ts.
  registrationMode: 'open' | 'approval' | 'closed';
};

// THÊM MỚI: chi tiết lớp/đề thi của 1 GV, tải khi admin bấm mở rộng 1 dòng
// (khớp response của GET /api/admin/teachers/[id]/detail).
type AdminTeacherDetail = {
  classes: { _id: string; name: string; schoolYear: string; studentCount: number; created_at: string }[];
  exams: { _id: string; title: string; is_published: boolean; created_at: string }[];
  submissionCount: number;
};


// ====== Kiểu dữ liệu thật, khớp với response của /api/classes, /api/students ======
// THÊM MỚI: 'off' (tắt), 'auto' (tự báo danh, vào thi ngay không cần
// duyệt), 'approval' (tự báo danh nhưng phải chờ GV duyệt mới thi được).
type SelfRegisterMode = 'off' | 'auto' | 'approval';

// THÊM MỚI: khớp đúng shape trả về từ GET /api/submissions/live — dùng ở
// widget "Đang thi" trên Trang chủ (xem HomeTab).
type LiveStudent = {
  studentId: string;
  studentName: string;
  className: string;
  examId: string;
  examTitle: string;
  started_at: string | null;
};

type ClassItem = {
  _id: string;
  name: string;
  schoolYear: string;
  inviteCode: string | null;
  selfRegisterMode: SelfRegisterMode;
  created_at: string;
  studentCount: number;
};

type StudentItem = {
  _id: string;
  name: string;
  dob: string | null;
  gender: 'Nam' | 'Nữ' | null;
  classId: string;
  selfRegistered?: boolean;
  // Mặc định true cho học sinh thường; chỉ false khi tự báo danh ở chế độ
  // 'approval' và GV chưa bấm "Duyệt".
  approved?: boolean;
};

// Bước 2 — Giao đề: chỉ cần vài field tối thiểu từ /api/exams (không cần
// raw_data/settings nặng, panel giao đề chỉ hiện tên đề để GV chọn).
type ExamListItem = {
  _id: string;
  title: string;
  is_published?: boolean;
};

// Khớp response của GET /api/submissions?studentId=... — 1 dòng = 1 đề đã
// giao cho học sinh (đã gộp về attempt mới nhất theo quy ước ở submissionModel.ts).
type AssignedSubmission = {
  _id: string;
  examId: string;
  examTitle: string;
  status: 'chưa thi' | 'đang thi' | 'đã nộp';
  score: number | null;
  total: number | null;
  scorePoints: number | null;
  maxScorePoints: number | null;
  attemptNumber: number;
  assigned_at: string;
  submitted_at: string | null;
};

// THÊM MỚI (Lịch sử làm bài): khớp response của
// GET /api/submissions?studentId=...&examId=...&history=1 — 1 dòng = 1 LẦN
// LÀM cụ thể (không gộp về mới nhất như AssignedSubmission ở trên).
type AttemptHistoryItem = {
  _id: string;
  attemptNumber: number;
  status: 'chưa thi' | 'đang thi' | 'đã nộp';
  score: number | null;
  total: number | null;
  scorePoints: number | null;
  maxScorePoints: number | null;
  started_at: string | null;
  submitted_at: string | null;
};

// Bước 1 chỉ làm CRUD lớp + học sinh. Việc "giao đề" (Bước 2) và trang học
// sinh làm bài (Bước 3) chưa có API submissions thật, nên tầng 3 (đề đã giao
// cho 1 học sinh) tạm hiển thị trạng thái rỗng thay vì mock — tránh làm GV
// nhầm rằng đây là dữ liệu thật.
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại.');
  }
  return data as T;
}

// THÊM MỚI (giờ mở/đóng thi): input datetime-local cần chuỗi "yyyy-MM-
// ddTHH:mm" theo GIỜ ĐỊA PHƯƠNG của trình duyệt GV — new Date(iso) rồi
// toISOString() sẽ SAI (trả về giờ UTC), nên tự tính tay từng phần thay vì
// cắt chuỗi ISO.
function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1]?.[0]?.toUpperCase() || '?';
}

// Thanh breadcrumb dùng chung cho 3 tầng của tab Quản lý lớp — giúp GV luôn
// biết mình đang ở đâu, bấm vào từng mắt xích để nhảy lùi (không chỉ có nút "quay lại").
function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <div className="flex items-center flex-wrap gap-1.5 text-sm mb-5">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-gray-300">/</span>}
          {it.onClick ? (
            <button onClick={it.onClick} className="text-blue-600 hover:underline font-medium">
              {it.label}
            </button>
          ) : (
            <span className="text-gray-400 font-medium">{it.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ============================================================
// THIẾT KẾ LẠI HỆ THỐNG NÚT cho khu vực "Quản lý lớp" (khiếu nại: "nút khá
// lộn xộn, nhìn chán") — trước đây các nút phụ (Giao đề, Bảng điểm, Làm mới)
// mỗi nút 1 màu viền khác nhau (xanh dương/xanh lá/xám) + emoji, khiến hàng
// nút trông rối mắt vì không rõ nút nào quan trọng hơn nút nào. BÂY GIỜ:
// - Chỉ còn ĐÚNG 1 nút "nổi" (solid màu, có bóng nhẹ) cho hành động chính
//   trong từng màn hình — còn lại đồng loạt là nút phụ viền xám trung tính,
//   phân biệt nhau bằng icon (màu icon gợi ý ý nghĩa) thay vì viền màu.
// - Icon SVG mảnh (stroke, cùng bộ nét với AppLogoIcon/OpenBookIcon đã có)
//   thay cho emoji — emoji hiển thị khác nhau tuỳ hệ điều hành/trình duyệt,
//   trong khi SVG tự vẽ luôn đồng bộ 1 kiểu, nhìn "gọn" và chuyên nghiệp hơn.
// - Nút sửa/xoá/duyệt trong từng dòng danh sách gộp về 1 component
//   IconButton dùng chung — cùng kích thước, cùng bo góc, chỉ đổi màu hover
//   theo ý nghĩa (xanh dương = sửa, đỏ = xoá, xanh lá = duyệt).
// ============================================================

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M15.7 4.3a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5L8.5 19.5 4 20.5l1-4.5L15.7 4.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 6.5 17.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 7h14M9.5 7V5.2c0-.66.54-1.2 1.2-1.2h2.6c.66 0 1.2.54 1.2 1.2V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7 7.3 19c.06.94.85 1.7 1.8 1.7h5.8c.95 0 1.74-.76 1.8-1.7L17.5 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.2 10.5v6.5M13.8 10.5v6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M19 5.5V9h-3.5M5 18.5V15h3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.3 8.3a6.5 6.5 0 0 1 11-2.3l1.7 1.9M17.7 15.7a6.5 6.5 0 0 1-11 2.3L5 16.1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20.5 3.5 3 10.2l6.8 2.5 2.5 6.8L20.5 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20.5 3.5 9.8 12.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 20V10.5M10 20V4M16 20v-7M20 20H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 5.5 15.5 12 9 18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// THÊM MỚI: icon "ngôi nhà" nét mảnh cho tab "Trang chủ" — thay emoji 🏠 (mỗi
// hệ điều hành vẽ khác nhau) bằng SVG tự vẽ, đồng bộ nét với các icon khác.
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 11.2 12 4l8 7.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 9.8V19c0 .55.45 1 1 1h3.2v-4.8c0-.55.45-1 1-1h1.6c.55 0 1 .45 1 1V20H17c.55 0 1-.45 1-1V9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// THÊM MỚI: icon "mũ tốt nghiệp" nét mảnh — thay emoji 🎓 (từng bị tách rời
// khỏi phần người trong sequence 🧑‍🎓 do trình duyệt không ghép ZWJ) bằng
// SVG tự vẽ, không phụ thuộc font hệ thống.
function CapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 5.5 2.5 10 12 14.5 21.5 10 12 5.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6.5 12.2V16c0 1.4 2.46 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5 10v5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// THÊM MỚI: icon "con mắt" nét mảnh — thay emoji 👁️ (nhãn "Xem mô phỏng
// trang học sinh") để đồng bộ hình thức với các icon khác trong app.
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// THÊM MỚI: icon "bó hoa chào mừng" nét mảnh — thay icon bàn tay vẫy chào
// (tiêu đề chào mừng ở Trang chủ) để đồng bộ hình thức với các icon khác
// trong app.
function BouquetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Cuống hoa bó lại */}
      <path d="M12 13.5 9 21.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 13.5 12 21.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 13.5 15 21.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 18.3h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* Hoa bên trái */}
      <circle cx="6.6" cy="7.4" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9.1" cy="5.6" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.9" cy="4.9" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6.9" cy="3.1" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.7 8.9 10.2 12.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* Hoa giữa, cao nhất */}
      <circle cx="12" cy="6" r="1.9" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="3.1" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9.9" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14.1" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 8 12 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* Hoa bên phải */}
      <circle cx="17.3" cy="7.4" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15" cy="5.9" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="19" cy="5.4" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="16.9" cy="3.7" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M17.1 8.7 13.6 12.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {/* Vài chiếc lá nhỏ trên cuống */}
      <path d="M9.6 16.2c-1.1-.3-1.9-1.1-2-2.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M14.4 16.2c1.1-.3 1.9-1.1 2-2.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// THÊM MỚI: gộp các icon emoji còn lại (✕, 🔗, 🗂️, 📄, 🚪, 📱, ☰) thành SVG
// nét mảnh tự vẽ, đồng bộ 1 kiểu với các icon phía trên — không phụ thuộc
// font/emoji của từng hệ điều hành.
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10.5 13.5a3.5 3.5 0 001 2.6l-2.3 2.3a4.5 4.5 0 01-6.36-6.36l2.3-2.3a3.5 3.5 0 012.6-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 10.5a3.5 3.5 0 00-1-2.6l2.3-2.3a4.5 4.5 0 016.36 6.36l-2.3 2.3a3.5 3.5 0 01-2.6 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// THÊM MỚI: icon đồng hồ cho panel "Giờ mở/đóng thi" (kiểu Azota) ở panel
// Giao đề — cùng bộ nét mảnh (stroke) với các icon khác trong trang.
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5.5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// THÊM MỚI (Phần 3b): icon riêng cho mục nav "Khối" — khác UsersIcon (dùng
// cho "Quản lý lớp") để 2 mục không trùng icon trên thanh điều hướng.
function LayersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3.5 12 12 16.5 20.5 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 16 12 20.5 20.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2.5 8.2V6a1.5 1.5 0 011.5-1.5h4.7a1.5 1.5 0 011.06.44l1.3 1.3a1.5 1.5 0 001.06.44H20a1.5 1.5 0 011.5 1.5v1.06" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.6 9.6a1.5 1.5 0 011.47-1.2h15.86a1.5 1.5 0 011.47 1.8l-1.24 6.3a2 2 0 01-1.96 1.6H5.8a2 2 0 01-1.96-1.6l-1.24-6.3z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6.5 3h6.4L18.5 8.6V19.5a1.5 1.5 0 01-1.5 1.5H6.5A1.5 1.5 0 015 19.5v-15A1.5 1.5 0 016.5 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12.7 3v4.6a1.5 1.5 0 001.5 1.5h4.3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M15.5 8.25V6a2.25 2.25 0 00-2.25-2.25h-6A2.25 2.25 0 005 6v12a2.25 2.25 0 002.25 2.25h6A2.25 2.25 0 0015.5 18v-2.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 12h11m0 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// Icon trạng thái chấm bài (đúng/đúng 1 phần/sai/bỏ trống) — thay bộ emoji
// ✅🟡❌⬜ vốn hiển thị khác nhau tuỳ hệ điều hành, giờ tự vẽ 1 bộ đồng nhất.
function AnswerStatusIcon({ status, className = 'w-4 h-4' }: { status: 'correct' | 'partial' | 'wrong' | 'blank'; className?: string }) {
  if (status === 'correct') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" className="text-green-500" />
        <path d="M7.5 12.3 10.3 15 16.5 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-green-600" />
      </svg>
    );
  }
  if (status === 'partial') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" className="text-amber-500" />
        <path d="M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-amber-600" />
      </svg>
    );
  }
  if (status === 'wrong') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" className="text-red-500" />
        <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-red-600" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" className="text-gray-300" />
    </svg>
  );
}

// SỬA (khiếu nại: "icon lớp học nhìn gớm") — thay emoji 🏫 (toà nhà trường
// học, hiển thị hơi thô/khác nhau tuỳ máy) bằng icon SVG nét mảnh "nhóm học
// sinh" (2 người), tự vẽ nên đồng bộ 1 kiểu mọi nơi, đúng tinh thần "Quản lý
// lớp" (quản lý một NHÓM học sinh) hơn là hình toà nhà.
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="9.2" cy="8.2" r="3.1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 19c0-2.9 2.3-5.2 5.2-5.2s5.2 2.3 5.2 5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17.1" cy="9.4" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.6 19c.25-2.25 1.9-4 4.1-4.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Icon khiên (shield) — dùng cho mục "Quản trị", chỉ hiện với tài khoản admin.
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 3.5l6.75 2.7v5.1c0 4.35-2.9 8.15-6.75 9.2-3.85-1.05-6.75-4.85-6.75-9.2V6.2L12 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.2 12.1l1.9 1.9 3.7-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// THÊM MỚI (thiết kế lại trang Quản trị): vài icon còn thiếu để dùng cho
// thanh điều hướng con + ô tìm kiếm + menu "···" gộp thao tác theo dòng —
// cùng bộ nét mảnh (stroke, viewBox 24x24) với các icon phía trên cho đồng bộ.
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M19.5 19.5l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DotsVerticalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="5.2" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="18.8" r="1.7" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8" cy="15" r="3.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 12.5L18.5 4.5M15.5 7.5l2.3 2.3M18 5l1.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 15.5a8 8 0 1116 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 15.5l3.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

// Nút hành động chính (CTA) — LUÔN solid màu + bóng nhẹ, chỉ dùng cho ĐÚNG 1
// hành động quan trọng nhất trên mỗi màn hình (VD: "+ Thêm lớp", "+ Thêm học
// sinh") để mắt người dùng biết ngay đâu là việc cần làm tiếp theo.
function PrimaryButton({
  onClick,
  disabled,
  icon,
  children,
  color = 'blue',
  type = 'button',
}: {
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  color?: 'blue' | 'green';
  type?: 'button' | 'submit';
}) {
  const colorClass =
    color === 'green'
      ? 'bg-green-600 hover:bg-green-700'
      : 'bg-blue-600 hover:bg-blue-700';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 ${colorClass} disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors`}
    >
      {icon}
      {children}
    </button>
  );
}

// Nút phụ (secondary) — LUÔN viền xám trung tính giống hệt nhau, chỉ khác
// nhau ở màu icon để gợi ý ý nghĩa (xanh dương = giao đề, xanh lá = bảng
// điểm...) thay vì mỗi nút 1 màu viền như trước — đây chính là chỗ sửa cho
// hàng nút đỡ "lộn xộn, nhiều màu".
function SecondaryButton({
  onClick,
  disabled,
  icon,
  iconColorClass = 'text-gray-500',
  children,
  title,
}: {
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  iconColorClass?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
    >
      {icon && <span className={iconColorClass}>{icon}</span>}
      {children}
    </button>
  );
}

// Nút icon vuông nhỏ dùng trong từng DÒNG danh sách (sửa/xoá/duyệt/chuyển
// trang) — cùng 1 kích thước, cùng bo góc cho mọi nơi, chỉ đổi màu hover
// theo ý nghĩa thao tác thay vì mỗi chỗ tự chế 1 kiểu (emoji, cỡ chữ khác
// nhau) như trước.
function IconButton({
  onClick,
  title,
  icon,
  hoverClass = 'hover:text-blue-600 hover:bg-blue-50',
  disabled,
  className = '',
}: {
  onClick?: () => void;
  title?: string;
  icon: ReactNode;
  hoverClass?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-gray-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${hoverClass} ${className}`}
    >
      {icon}
    </button>
  );
}

// Bước 3: modal "Xem bài làm" — GV bấm mở mới xem được (học sinh không tự
// xem đáp án ngay sau khi nộp, theo quyết định đã chốt). Gọi API GV
// /api/submissions/[id] (có kiểm tra ownerId), rồi tự chấm lại bằng
// gradeExam (dùng chung với server) để tô đúng/sai từng câu.
function SubmissionDetailModal({ submissionId, onClose }: { submissionId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(null);
  // Phần IV — GV nhập điểm tay TỪNG CÂU sau khi xem ảnh. Tách state riêng
  // khỏi `detail` để gõ số mượt (không phải load lại toàn bộ modal mỗi lần
  // gõ) — key = questionId.
  const [essayScoreInputs, setEssayScoreInputs] = useState<Record<string, string>>({});
  const [savingEssayQuestion, setSavingEssayQuestion] = useState<string | null>(null);
  const [essayScoreErrors, setEssayScoreErrors] = useState<Record<string, string>>({});
  // Ảnh đang mở trong công cụ "Chấm trên ảnh" — null = đóng.
  const [annotating, setAnnotating] = useState<{ questionId: string; imageIndex: number; url: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/submissions/${submissionId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không tải được bài làm.');
        setDetail(data);
        const scores: Record<string, number> = data.submission.essayScores || {};
        setEssayScoreInputs(
          Object.fromEntries(Object.entries(scores).map(([qid, v]) => [qid, String(v)]))
        );
      } catch (err: any) {
        setError(err.message || 'Không tải được bài làm.');
      } finally {
        setLoading(false);
      }
    })();
  }, [submissionId]);

  async function handleSaveEssayScore(questionId: string) {
    const raw = essayScoreInputs[questionId] ?? '';
    const value = Number(raw);
    if (raw.trim() === '' || Number.isNaN(value) || value < 0) {
      setEssayScoreErrors((prev) => ({ ...prev, [questionId]: 'Nhập điểm hợp lệ (số ≥ 0).' }));
      return;
    }
    setSavingEssayQuestion(questionId);
    setEssayScoreErrors((prev) => ({ ...prev, [questionId]: '' }));
    try {
      const res = await fetch(`/api/submissions/${submissionId}/essay-score`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, score: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không lưu được điểm.');
      setDetail((prev: any) => ({
        ...prev,
        submission: { ...prev.submission, essayScores: data.essayScores, essayGraded: data.essayGraded },
      }));
    } catch (err: any) {
      setEssayScoreErrors((prev) => ({ ...prev, [questionId]: err.message || 'Không lưu được điểm.' }));
    } finally {
      setSavingEssayQuestion(null);
    }
  }

  async function handleSaveAnnotatedImage(dataUrl: string) {
    if (!annotating) return;
    const res = await fetch(`/api/submissions/${submissionId}/essay-annotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: annotating.questionId, imageIndex: annotating.imageIndex, dataUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không lưu được ảnh đã chấm.');
    setDetail((prev: any) => ({
      ...prev,
      submission: { ...prev.submission, essayAnnotatedImages: data.essayAnnotatedImages },
    }));
    setAnnotating(null);
  }

  const graded =
    detail?.raw_data && detail.submission.answers
      ? gradeExam(detail.raw_data, detail.submission.answers, detail.submission.scoringUsed || detail.examScoringFallback || undefined)
      : null;
  const tikzSvgMap = detail?.raw_data ? buildTikzSvgMap(detail.raw_data.tikz_list) : {};
  const essayQuestions: any[] = detail?.raw_data?.phan_4_TuLuan || [];
  // essayMaxScore: ưu tiên snapshot đã lưu lúc nộp bài; lượt làm CŨ (trước
  // khi có tính năng này) chưa có field này -> chấm lại theo thang điểm
  // hiện tại/đã dùng làm fallback, không hiện trống trơn.
  const essayMaxScore: number =
    detail?.submission?.essayMaxScore ??
    (detail?.raw_data
      ? computeEssayMax(detail.raw_data, detail.submission?.scoringUsed || detail.examScoringFallback || undefined)
      : 0);
  const essayScoresMap: Record<string, number> = detail?.submission?.essayScores || {};
  const essaySum = round2(Object.values(essayScoresMap).reduce((a: number, b: any) => a + (Number(b) || 0), 0));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{detail?.examTitle || 'Bài làm'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {loading && <p className="text-sm text-gray-400">Đang tải...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {detail && (
          <>
            <p className="text-sm text-gray-500 mb-1">
              {detail.studentName} · Lần {detail.submission.attemptNumber} · {detail.submission.status}
            </p>
            {graded && (
              <div className="mb-4">
                <p className="text-2xl font-bold text-blue-600">
                  {essayQuestions.length > 0 && detail.submission.essayGraded
                    ? `${round2(graded.scorePoints + essaySum)}/${round2(graded.maxScorePoints + essayMaxScore)} điểm`
                    : `${graded.scorePoints}/${graded.maxScorePoints} điểm`}
                  <span className="text-base font-medium text-blue-400 ml-2">
                    ({graded.correct}/{graded.total} câu)
                  </span>
                </p>
                {essayQuestions.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Trong đó Phần I-III: {graded.scorePoints}/{graded.maxScorePoints}đ · Phần IV:{' '}
                    {detail.submission.essayGraded ? `${essaySum}/${essayMaxScore}đ` : `chưa chấm xong (tối đa ${essayMaxScore}đ)`}
                  </p>
                )}
              </div>
            )}
            {!detail.submission.answers && (
              <p className="text-sm text-gray-400 italic mb-4">Học sinh chưa nộp bài này.</p>
            )}

            {graded && detail.raw_data && (
              <div className="space-y-5">
                {(['p1', 'p2', 'p3'] as const).map((part) => {
                  const list =
                    part === 'p1'
                      ? detail.raw_data.phan_1_TracNghiem
                      : part === 'p2'
                      ? detail.raw_data.phan_2_DungSai
                      : detail.raw_data.phan_3_TraLoiNgan;
                  const results = graded.details[part];
                  if (!list || list.length === 0) return null;
                  const label = part === 'p1' ? 'Phần I' : part === 'p2' ? 'Phần II' : 'Phần III';
                  return (
                    <div key={part}>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</h4>
                      <div className="space-y-2">
                        {list.map((q: any, i: number) => {
                          const r = results[i];
                          const partial = part === 'p2' && !r.correct && r.points > 0;
                          return (
                            <div
                              key={q.id}
                              className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg border ${
                                r.correct
                                  ? 'bg-green-50 border-green-200'
                                  : partial
                                  ? 'bg-amber-50 border-amber-200'
                                  : r.attempted
                                  ? 'bg-red-50 border-red-200'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <AnswerStatusIcon status={r.correct ? 'correct' : partial ? 'partial' : r.attempted ? 'wrong' : 'blank'} className="w-4 h-4 mt-0.5 shrink-0" />
                              <span className="flex-1 whitespace-pre-wrap">
                                Câu {i + 1}: {renderExamText(q.content, tikzSvgMap, `view-${part}-${q.id}`)}
                              </span>
                              <span className="text-xs font-semibold text-gray-500 shrink-0">
                                {r.points}/{r.maxPoints}đ
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {essayQuestions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Phần IV: Tự luận (GV chấm tay, từng câu)
                    </h4>
                    <div className="space-y-3">
                      {essayQuestions.map((q: any, i: number) => {
                        const urls: string[] = (detail.submission.essayImages || {})[q.id] || [];
                        const annotatedUrls: string[] = (detail.submission.essayAnnotatedImages || {})[q.id] || [];
                        const qGraded = essayScoresMap[q.id] !== undefined;
                        return (
                          <div key={q.id} className="border border-gray-200 rounded-lg px-3 py-2.5">
                            <p className="text-sm mb-2 whitespace-pre-wrap">
                              Câu {i + 1}: {renderExamText(q.content, tikzSvgMap, `view-p4-${q.id}`)}
                            </p>
                            {urls.length > 0 ? (
                              <div className="flex flex-wrap gap-2 mb-3">
                                {urls.map((url, idx) => {
                                  const displayUrl = annotatedUrls[idx] || url;
                                  return (
                                    <div key={url} className="relative">
                                      <button
                                        type="button"
                                        onClick={() => setAnnotating({ questionId: q.id, imageIndex: idx, url: displayUrl })}
                                        title="Bấm để chấm trên ảnh (bút đỏ)"
                                        className="block"
                                      >
                                        <img
                                          src={displayUrl}
                                          alt={`Ảnh bài làm câu ${i + 1} - trang ${idx + 1}`}
                                          className="w-24 h-24 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition"
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      </button>
                                      {annotatedUrls[idx] && (
                                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                                          ✓
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic mb-3">Học sinh chưa nộp ảnh câu này.</p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                              <label className="text-xs font-medium text-gray-600">Điểm câu {i + 1}:</label>
                              <input
                                type="number"
                                min={0}
                                step="0.25"
                                value={essayScoreInputs[q.id] ?? ''}
                                onChange={(e) => setEssayScoreInputs((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              />
                              <button
                                onClick={() => handleSaveEssayScore(q.id)}
                                disabled={savingEssayQuestion === q.id}
                                className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-2.5 py-1 rounded-lg transition"
                              >
                                {savingEssayQuestion === q.id ? 'Đang lưu...' : 'Lưu'}
                              </button>
                              {qGraded && savingEssayQuestion !== q.id && (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                  <CheckIcon className="w-3.5 h-3.5" /> Đã chấm
                                </span>
                              )}
                            </div>
                            {essayScoreErrors[q.id] && <p className="text-xs text-red-600 mt-1">{essayScoreErrors[q.id]}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {annotating && (
        <EssayAnnotator
          imageUrl={annotating.url}
          onSave={handleSaveAnnotatedImage}
          onClose={() => setAnnotating(null)}
        />
      )}
    </div>
  );
}

// Form thêm/sửa lớp — dùng chung cho cả 2 việc, chỉ khác initialValues +
// hàm submit truyền vào từ nơi gọi (tránh 2 form gần như giống nhau).
function ClassForm({
  initialName = '',
  initialSchoolYear = '',
  onCancel,
  onSubmit,
}: {
  initialName?: string;
  initialSchoolYear?: string;
  onCancel: () => void;
  onSubmit: (name: string, schoolYear: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [schoolYear, setSchoolYear] = useState(initialSchoolYear);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(name, schoolYear);
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 mb-5 shadow-sm space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên lớp (ví dụ 12A1)"
          className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
        <input
          value={schoolYear}
          onChange={(e) => setSchoolYear(e.target.value)}
          placeholder="Năm học (ví dụ 2025 - 2026)"
          className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-gray-500 px-3.5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Hủy
        </button>
      </div>
    </form>
  );
}

// Form thêm/sửa học sinh — có thêm dropdown "Lớp" khi đang SỬA (để chuyển
// lớp); lúc THÊM mới thì lớp đã cố định là lớp đang xem nên không cần chọn.
function StudentForm({
  initialName = '',
  initialDob = '',
  initialGender = '' as '' | 'Nam' | 'Nữ',
  showClassSelect = false,
  classes = [] as ClassItem[],
  initialClassId = '',
  onCancel,
  onSubmit,
}: {
  initialName?: string;
  initialDob?: string;
  initialGender?: '' | 'Nam' | 'Nữ';
  showClassSelect?: boolean;
  classes?: ClassItem[];
  initialClassId?: string;
  onCancel: () => void;
  onSubmit: (data: { name: string; dob: string; gender: '' | 'Nam' | 'Nữ'; classId?: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [dob, setDob] = useState(initialDob);
  const [gender, setGender] = useState<'' | 'Nam' | 'Nữ'>(initialGender);
  const [classId, setClassId] = useState(initialClassId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit({ name, dob, gender, classId: showClassSelect ? classId : undefined });
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Họ và tên *"
          className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 sm:col-span-1"
        />
        <input
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          placeholder="Ngày sinh (tuỳ chọn)"
          className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as '' | 'Nam' | 'Nữ')}
          className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        >
          <option value="">Giới tính (tuỳ chọn)...</option>
          <option value="Nam">Nam</option>
          <option value="Nữ">Nữ</option>
        </select>
      </div>
      {/* SỬA: chỉ Họ và tên là bắt buộc để thi (đúng theo cách Azota chỉ yêu
          cầu tên khi vào lớp — ngày sinh/giới tính chỉ là "thông tin bổ
          sung" GV điền nếu cần cho sổ điểm, không ảnh hưởng việc học sinh
          làm bài được hay không). */}
      <p className="text-[11px] text-gray-400">* Bắt buộc. Ngày sinh/Giới tính chỉ để GV quản lý, học sinh không cần khai khi vào thi.</p>
      {showClassSelect && (
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        >
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              Lớp {c.name} ({c.schoolYear})
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-gray-500 px-3.5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Hủy
        </button>
      </div>
    </form>
  );
}

// Panel "Nhập từ Excel" — GV tải lên 1 file .xlsx/.xls/.csv chứa danh sách
// học sinh thay vì bấm "Thêm học sinh" từng em. Chỉ cột Họ và tên là bắt
// buộc; Ngày sinh/Giới tính để trống trong file vẫn nhập được bình thường
// (khớp đúng quy tắc StudentForm — xem /api/students/import/route.ts).
function ImportStudentsPanel({
  classId,
  onCancel,
  onImported,
}: {
  classId: string;
  onCancel: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    createdCount: number;
    skippedCount: number;
    errors: { row: number; reason: string }[];
    duplicateWarnings: string[];
  } | null>(null);

  async function handleUpload() {
    if (!file) {
      setError('Vui lòng chọn 1 file trước.');
      return;
    }
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('classId', classId);
      const res = await fetch('/api/students/import', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Không nhập được danh sách.');
      }
      setResult(data);
      // KHÔNG tự đóng panel ngay — để GV kịp đọc kết quả (bao nhiêu em đã
      // thêm, có dòng nào bị bỏ qua/trùng tên không) rồi tự bấm "Xong".
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Nhập danh sách học sinh từ Excel</p>
        <p className="text-xs text-gray-400">
          File .xlsx, .xls hoặc .csv, tối đa 500 dòng. Cột đầu tiên (hoặc cột có tiêu đề "Họ và
          tên"/"Tên") là bắt buộc; có thêm cột "Ngày sinh" và/hoặc "Giới tính" thì càng tốt, không có
          cũng nhập được bình thường.
        </p>
        {/* THÊM MỚI: nút tải file Excel MẪU đúng định dạng route import
            nhận diện được — GV tải về, điền danh sách (hoặc copy-paste từ
            file lớp có sẵn), rồi tải ngược lại bằng ô chọn file bên dưới,
            đỡ phải đoán tên cột hay tự tạo file từ đầu. */}
        <a
          href="/api/students/import-template"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline mt-1.5"
        >
          <FileIcon className="w-3.5 h-3.5" /> Tải file mẫu Excel
        </a>
      </div>

      {!result && (
        <>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError('');
            }}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !file}
              className="bg-blue-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              {uploading ? 'Đang nhập...' : 'Nhập danh sách'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-sm font-medium text-gray-500 px-3.5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Hủy
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-sm text-green-700 inline-flex items-center gap-1.5">
            <CheckIcon className="w-4 h-4 shrink-0" /> Đã thêm {result.createdCount} học sinh.
          </p>
          {result.duplicateWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              <p className="font-semibold mb-1">Có {result.duplicateWarnings.length} tên trùng (đã vẫn thêm, GV kiểm tra lại nếu cần):</p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.duplicateWarnings.slice(0, 20).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              {result.duplicateWarnings.length > 20 && <p className="mt-1">... và {result.duplicateWarnings.length - 20} tên khác.</p>}
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <p className="font-semibold mb-1">Có {result.errors.length} dòng bị bỏ qua:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.errors.slice(0, 20).map((e, i) => (
                  <li key={i}>Dòng {e.row}: {e.reason}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onImported}
              className="bg-blue-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
            >
              Xong
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setFile(null);
              }}
              className="text-sm font-medium text-gray-500 px-3.5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Nhập thêm file khác
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Panel "Giao đề" — mở ra trong tầng 2 (danh sách học sinh của 1 lớp). GV
// chọn 1 đề ĐÃ XUẤT BẢN, rồi chọn giao cho cả lớp hoặc bỏ chọn từng em không
// muốn giao. Em nào đã được giao đề này rồi (query lại mỗi khi đổi đề) hiện
// ✓ "Đã giao" và bị disable — tránh GV tưởng nhầm là giao lại thành công.
function AssignExamPanel({
  classId,
  students,
  onCancel,
  onAssigned,
}: {
  classId: string;
  students: StudentItem[];
  onCancel: () => void;
  onAssigned: (message: string, link: string) => void;
}) {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [examsError, setExamsError] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');

  const [alreadyAssigned, setAlreadyAssigned] = useState<Set<string>>(new Set());
  const [checkingAssigned, setCheckingAssigned] = useState(false);

  // studentId -> có được chọn để giao hay không. Mặc định chọn hết, trừ em
  // đã được giao rồi (bị disable, không nằm trong tập chọn để khỏi giao trùng).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(students.map((s) => s._id)));
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  // Trạng thái "✓ Đã copy" riêng cho nút copy link ở box link cố định (khác
  // assignLinkCopied ở ClassesTab — box đó chỉ hiện sau khi bấm "Giao đề").
  const [linkBoxCopied, setLinkBoxCopied] = useState(false);

  // THÊM MỚI (rút gọn link chia sẻ): mã /s/{code} tương ứng với link đầy đủ
  // /thi/{examId}?class={classId} hiện tại — tự sinh (hoặc lấy lại mã cũ,
  // xem API POST /api/short-link) mỗi khi đổi đề hoặc đổi lớp. `null` nghĩa
  // là chưa có mã (đang tải, hoặc gọi API lỗi) — lúc đó các chỗ hiển thị bên
  // dưới TỰ ĐỘNG rơi về dùng lại link dài như cũ, không bao giờ để giáo viên
  // thấy ô trống hoặc link hỏng.
  const [shortCode, setShortCode] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedExamId) {
      setShortCode(null);
      return;
    }
    let cancelled = false;
    setShortCode(null);
    (async () => {
      try {
        const data = await apiFetch<{ code: string }>('/api/short-link', {
          method: 'POST',
          body: JSON.stringify({
            examId: selectedExamId,
            target: `/thi/${selectedExamId}?class=${classId}`,
          }),
        });
        if (!cancelled) setShortCode(data.code);
      } catch {
        // Lỗi tạo short link (mạng, server...) — không chặn giáo viên, chỉ
        // rơi về dùng link dài như trước khi có tính năng này.
        if (!cancelled) setShortCode(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId, classId]);

  // Link hiển thị/copy cho giáo viên: ưu tiên bản rút gọn /s/{code} nếu đã
  // có, chưa có (đang tải hoặc lỗi) thì rơi về link đầy đủ như hành vi cũ.
  function buildShareLink(origin: string) {
    if (shortCode) return `${origin}/s/${shortCode}`;
    return `${origin}/thi/${selectedExamId}?class=${classId}`;
  }

  // THÊM MỚI (cài đặt riêng theo lớp): MẶC ĐỊNH lớp này dùng nguyên cài đặt
  // của đề (examDefaultSettings, chỉ đọc để hiện tham khảo). GV bật
  // "useCustomSettings" + sửa `customSettings` + bấm Lưu thì mới ghi đè
  // RIÊNG cho đúng lớp này (examId + classId hiện tại của panel) — các lớp
  // khác không hề bị ảnh hưởng, vẫn tự động theo cài đặt mặc định của đề, kể
  // cả khi GV sửa cài đặt mặc định đó sau này.
  const [examDefaultSettings, setExamDefaultSettings] = useState<any>({});
  const [useCustomSettings, setUseCustomSettings] = useState(false);
  const [customSettings, setCustomSettings] = useState({
    duration: 45,
    shuffle: false,
    maxAttempts: 0,
    showSolution: 'after_submit' as 'after_submit' | 'never' | 'after_close' | 'custom_time',
    solutionOpenAt: '',
    openAt: '',
    closeAt: '',
  });
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    if (!selectedExamId) {
      setExamDefaultSettings({});
      setUseCustomSettings(false);
      return;
    }
    (async () => {
      setLoadingSettings(true);
      setSettingsError('');
      try {
        const data = await apiFetch<{ examSettings: any; hasCustomSettings: boolean; settings: any }>(
          `/api/exam-assignment?examId=${selectedExamId}&classId=${classId}`
        );
        setExamDefaultSettings(data.examSettings || {});
        setUseCustomSettings(!!data.hasCustomSettings);
        // Điền sẵn ô nhập bằng: giá trị riêng của lớp (nếu có trường đó)
        // hoặc rơi về giá trị mặc định của đề — để GV bật "Dùng cài đặt
        // riêng" lên là thấy ngay giá trị hợp lý, không phải điền lại từ đầu.
        const merged = { ...(data.examSettings || {}), ...(data.settings || {}) };
        setCustomSettings({
          duration: Number(merged.duration) || 45,
          shuffle: !!merged.shuffle,
          maxAttempts: Number(merged.maxAttempts) || 0,
          showSolution: merged.showSolution || 'after_submit',
          solutionOpenAt: isoToDatetimeLocal(merged.solutionOpenAt || null),
          openAt: isoToDatetimeLocal(merged.openAt || null),
          closeAt: isoToDatetimeLocal(merged.closeAt || null),
        });
      } catch {
        // Chưa cấu hình gì trước đó cũng không phải lỗi — coi như "dùng mặc
        // định của đề", để GV tự bật lên nếu muốn tuỳ chỉnh riêng.
        setExamDefaultSettings({});
        setUseCustomSettings(false);
      } finally {
        setLoadingSettings(false);
      }
    })();
  }, [selectedExamId, classId]);

  async function handleSaveSettings(nextUseCustom: boolean) {
    setSavingSettings(true);
    setSettingsError('');
    setSettingsSaved(false);
    try {
      await apiFetch('/api/exam-assignment', {
        method: 'PATCH',
        body: JSON.stringify({
          examId: selectedExamId,
          classId,
          hasCustomSettings: nextUseCustom,
          settings: nextUseCustom
            ? {
                duration: Math.max(1, Number(customSettings.duration) || 45),
                shuffle: customSettings.shuffle,
                maxAttempts: Math.max(0, Number(customSettings.maxAttempts) || 0),
                showSolution: customSettings.showSolution,
                solutionOpenAt: datetimeLocalToIso(customSettings.solutionOpenAt),
                openAt: datetimeLocalToIso(customSettings.openAt),
                closeAt: datetimeLocalToIso(customSettings.closeAt),
              }
            : undefined,
        }),
      });
      setUseCustomSettings(nextUseCustom);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (err: any) {
      setSettingsError(err.message || 'Không lưu được cài đặt.');
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoadingExams(true);
      setExamsError('');
      try {
        const data = await apiFetch<{ exams: ExamListItem[] }>('/api/exams');
        // Chỉ đề ĐÃ xuất bản mới có thể giao — đề nháp giữ riêng tư cho GV.
        setExams(data.exams.filter((e) => e.is_published));
      } catch (err: any) {
        setExamsError(err.message || 'Không tải được danh sách đề.');
      } finally {
        setLoadingExams(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedExamId) {
      setAlreadyAssigned(new Set());
      return;
    }
    (async () => {
      setCheckingAssigned(true);
      try {
        const data = await apiFetch<{ assignments: { studentId: string; status: string }[] }>(
          `/api/submissions?classId=${classId}&examId=${selectedExamId}`
        );
        const assignedSet = new Set(data.assignments.map((a) => a.studentId));
        setAlreadyAssigned(assignedSet);
        // Bỏ chọn sẵn những em đã giao rồi khỏi tập "sẽ giao" — vẫn để GV tick
        // lại nếu muốn (dù API sẽ tự bỏ qua vì đã idempotent ở backend).
        setSelectedIds(new Set(students.filter((s) => !assignedSet.has(s._id)).map((s) => s._id)));
      } catch {
        setAlreadyAssigned(new Set());
      } finally {
        setCheckingAssigned(false);
      }
    })();
  }, [selectedExamId, classId, students]);

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAssign() {
    if (!selectedExamId) {
      setError('Vui lòng chọn 1 đề để giao.');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Vui lòng chọn ít nhất 1 học sinh.');
      return;
    }
    setAssigning(true);
    setError('');
    try {
      const data = await apiFetch<{ assignedCount: number; skippedCount: number }>('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({ examId: selectedExamId, classId, studentIds: Array.from(selectedIds) }),
      });
      const parts = [`Đã giao đề cho ${data.assignedCount} học sinh.`];
      if (data.skippedCount > 0) parts.push(`${data.skippedCount} em đã được giao đề này từ trước, bỏ qua.`);
      // QUAN TRỌNG: link xuất bản (modal "Xuất bản - Lấy link") KHÔNG có
      // classId nên trang /thi báo "thiếu thông tin lớp" nếu dùng thẳng link
      // đó. Đến đây GV đã chọn xong lớp + đề, đủ dữ liệu để ghép đúng link
      // có ?class=... — đây mới là link thật sự gửi được cho học sinh.
      const link = buildShareLink(window.location.origin);
      onAssigned(parts.join(' '), link);
    } catch (err: any) {
      setError(err.message || 'Không giao được đề.');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 shadow-sm space-y-3.5">
      <h3 className="text-sm font-bold text-gray-800">Giao đề cho lớp</h3>

      {loadingExams ? (
        <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
      ) : examsError ? (
        <p className="text-sm text-red-600">{examsError}</p>
      ) : exams.length === 0 ? (
        <p className="text-sm text-gray-400">Chưa có đề nào được xuất bản. Vào tab Đề thi để xuất bản đề trước.</p>
      ) : (
        <>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          >
            <option value="">-- Chọn đề đã xuất bản --</option>
            {exams.map((e) => (
              <option key={e._id} value={e._id}>
                {e.title}
              </option>
            ))}
          </select>

          {/* THÊM MỚI: link đề cho lớp này CHỈ phụ thuộc examId + classId
              (không cần đã "Giao đề" hay chưa) — hiện NGAY khi chọn đề, để
              giáo viên mở lại panel này bất cứ lúc nào (cả vài ngày sau) là
              lấy được link cũ, không phải bấm "Giao đề" lại chỉ để xem link. */}
          {selectedExamId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-3">
              <p className="text-xs text-blue-700 font-medium mb-1.5 inline-flex items-center gap-1.5">
                <AppLogoIcon className="w-4 h-4 shrink-0" /> <LinkIcon className="w-3.5 h-3.5" /> Link đề này cho lớp này (dùng lại bất cứ lúc nào, không cần giao lại):
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={buildShareLink(typeof window !== 'undefined' ? window.location.origin : '')}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const link = buildShareLink(window.location.origin);
                    try {
                      await navigator.clipboard.writeText(link);
                      setLinkBoxCopied(true);
                      setTimeout(() => setLinkBoxCopied(false), 2000);
                    } catch {}
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  {linkBoxCopied ? (
                    <span className="inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" /> Đã copy</span>
                  ) : (
                    'Copy'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* THÊM MỚI: cài đặt RIÊNG cho lớp này (thời gian làm bài, trộn
              câu, số lần làm lại, xem lời giải, giờ mở/đóng đề...) — MẶC
              ĐỊNH tắt, lớp dùng nguyên cài đặt của đề (hiện tóm tắt bên
              dưới). Bật lên + sửa + bấm Lưu thì CHỈ lớp này đổi, các lớp
              khác được giao đề này không hề bị ảnh hưởng, vẫn tự động theo
              đúng cài đặt mặc định của đề (kể cả khi GV sửa mặc định sau
              này). Học sinh CHƯA vào làm sẽ bị chặn ngoài khung giờ mở/đóng
              đang áp dụng; em nào đã vào rồi thì không bị ảnh hưởng. */}
          {selectedExamId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3 space-y-2.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomSettings}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setUseCustomSettings(next);
                    if (!next) handleSaveSettings(false);
                  }}
                  className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                />
                <span className="text-xs text-amber-800 font-bold uppercase tracking-wide">Dùng cài đặt riêng cho lớp này</span>
              </label>

              {loadingSettings ? (
                <div className="space-y-1.5">
                  <div className="h-3 bg-amber-100 rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-amber-100 rounded w-1/2 animate-pulse" />
                </div>
              ) : !useCustomSettings ? (
                <p className="text-xs text-amber-700">
                  Đang dùng cài đặt mặc định của đề: {Number(examDefaultSettings.duration) || 45} phút làm bài,{' '}
                  {Number(examDefaultSettings.maxAttempts) || 0 ? `${examDefaultSettings.maxAttempts} lần làm bài` : 'không giới hạn số lần làm bài'},
                  {examDefaultSettings.openAt || examDefaultSettings.closeAt ? ' có giờ mở/đóng đề đặt sẵn.' : ' không giới hạn giờ mở/đóng.'} Sửa
                  cài đặt mặc định ở tab "Cài đặt" của đề (áp dụng cho mọi lớp).
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] text-amber-700 block mb-1">Thời gian làm bài (phút)</span>
                      <input
                        type="number"
                        min={1}
                        value={customSettings.duration}
                        onChange={(e) => setCustomSettings((s) => ({ ...s, duration: Number(e.target.value) }))}
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-amber-700 block mb-1">Số lần làm bài (0 = không giới hạn)</span>
                      <input
                        type="number"
                        min={0}
                        value={customSettings.maxAttempts}
                        onChange={(e) => setCustomSettings((s) => ({ ...s, maxAttempts: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customSettings.shuffle}
                      onChange={(e) => setCustomSettings((s) => ({ ...s, shuffle: e.target.checked }))}
                      className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                    />
                    <span className="text-xs text-amber-800">🔀 Tự động trộn câu hỏi &amp; đáp án</span>
                  </label>

                  <label className="block">
                    <span className="text-[11px] text-amber-700 block mb-1">Quản lý lời giải</span>
                    <select
                      value={customSettings.showSolution}
                      onChange={(e) =>
                        setCustomSettings((s) => ({
                          ...s,
                          showSolution: e.target.value as 'after_submit' | 'never' | 'after_close' | 'custom_time',
                        }))
                      }
                      className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                    >
                      <option value="after_submit">Hiện nút xem giải ngay sau khi nộp bài</option>
                      <option value="never">Ẩn hoàn toàn lời giải (Chỉ báo điểm)</option>
                      <option value="after_close">Chỉ báo điểm — tự mở lời giải khi tất cả đã thi xong</option>
                      <option value="custom_time">Chỉ báo điểm — GV tự đặt giờ mở lời giải</option>
                    </select>
                  </label>
                  {customSettings.showSolution === 'custom_time' && (
                    <input
                      type="datetime-local"
                      value={customSettings.solutionOpenAt}
                      onChange={(e) => setCustomSettings((s) => ({ ...s, solutionOpenAt: e.target.value }))}
                      className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                    />
                  )}

                  <p className="text-xs text-amber-800 font-medium inline-flex items-center gap-1.5 pt-1 border-t border-amber-200">
                    <ClockIcon className="w-3.5 h-3.5" /> Giờ mở/đóng đề riêng cho lớp này (để trống = không giới hạn giờ)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] text-amber-700 block mb-1">Mở lúc</span>
                      <input
                        type="datetime-local"
                        value={customSettings.openAt}
                        onChange={(e) => setCustomSettings((s) => ({ ...s, openAt: e.target.value }))}
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-amber-700 block mb-1">Đóng lúc</span>
                      <input
                        type="datetime-local"
                        value={customSettings.closeAt}
                        onChange={(e) => setCustomSettings((s) => ({ ...s, closeAt: e.target.value }))}
                        className="w-full border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                      />
                    </label>
                  </div>

                  {settingsError && <p className="text-xs text-red-600">{settingsError}</p>}
                  <button
                    type="button"
                    onClick={() => handleSaveSettings(true)}
                    disabled={savingSettings}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {savingSettings ? 'Đang lưu...' : settingsSaved ? '✓ Đã lưu cài đặt riêng' : 'Lưu cài đặt riêng cho lớp này'}
                  </button>
                </div>
              )}
            </div>
          )}

          {selectedExamId && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Giao cho học sinh {checkingAssigned && '(đang kiểm tra...)'}
              </p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 max-h-40 overflow-y-auto pr-1">
                {students.map((s) => {
                  const isAssigned = alreadyAssigned.has(s._id);
                  return (
                    <label
                      key={s._id}
                      className={`flex items-center gap-2 px-2 py-1 rounded-lg text-sm min-w-0 ${
                        isAssigned ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isAssigned}
                        checked={isAssigned ? true : selectedIds.has(s._id)}
                        onChange={() => toggleStudent(s._id)}
                        className="rounded border-gray-300 shrink-0"
                      />
                      <span className="truncate">{s.name}</span>
                      {isAssigned && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-green-600 font-medium shrink-0">
                          <CheckIcon className="w-3 h-3" /> Đã giao
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleAssign}
          disabled={assigning || !selectedExamId || exams.length === 0}
          className="bg-blue-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
        >
          {assigning ? 'Đang giao...' : 'Giao đề'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-medium text-gray-500 px-3.5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Hủy
        </button>
      </div>
    </div>
  );
}

function ClassesTab() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [listError, setListError] = useState('');

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [classStudents, setClassStudents] = useState<StudentItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [showAddClass, setShowAddClass] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  // THÊM MỚI: nhập danh sách học sinh từ file Excel/CSV thay vì gõ tay từng
  // em — panel bật/tắt độc lập với form "Thêm học sinh" (chỉ 1 trong 2 mở
  // tại 1 thời điểm, xem chỗ bấm nút bên dưới).
  const [showImportStudents, setShowImportStudents] = useState(false);

  // THÊM MỚI (mục 4): menu xuất bảng điểm Excel/Word (đóng/mở khi bấm nút
  // "📊 Bảng điểm" ở tầng 2 — danh sách học sinh của 1 lớp).
  const [showScoreExportMenu, setShowScoreExportMenu] = useState(false);
  // THÊM MỚI: danh sách đề đã từng giao cho lớp đang xem (lấy qua
  // format=list) + đề nào đang được chọn để lọc — cho phép GV xuất bảng
  // điểm CHỈ 1 đề thay vì luôn gộp tất cả các đề của lớp. selectedExamIds
  // rỗng = xuất tất cả (giữ hành vi mặc định như trước).
  const [scoreExportExams, setScoreExportExams] = useState<{ examId: string; title: string }[]>([]);
  const [loadingScoreExportExams, setLoadingScoreExportExams] = useState(false);
  const [selectedScoreExportExamIds, setSelectedScoreExportExamIds] = useState<string[]>([]);
  // THÊM MỚI: cách tính điểm khi 1 học sinh làm 1 đề nhiều lần — mặc định
  // 'latest' (giữ đúng hành vi cũ), GV có thể đổi sang 'highest' ngay trong
  // menu xuất trước khi bấm tải. Xem type ScoreMode trong scoreTable.ts.
  const [scoreExportMode, setScoreExportMode] = useState<'latest' | 'highest'>('latest');
  // SỬA LỖI TỐC ĐỘ (khiếu nại: "hiện danh sách cực kì chậm"): TRƯỚC ĐÂY mỗi
  // lần bấm mở menu "Bảng điểm" đều gọi lại API format=list từ đầu, kể cả
  // khi vừa mở/đóng menu này liên tục cho ĐÚNG 1 lớp — GV thấy "Đang tải
  // danh sách đề..." nhấp nháy mỗi lần bấm dù dữ liệu chẳng đổi gì. Giờ cache
  // kết quả theo classId (Map, sống suốt phiên làm việc, KHÔNG dùng
  // localStorage vì đây là component thường, không phải artifact): lần mở
  // đầu tiên của 1 lớp mới tải + hiện loading như cũ; những lần mở SAU của
  // ĐÚNG lớp đó hiện NGAY dữ liệu đã cache (không loading), đồng thời âm
  // thầm gọi lại API phía sau (revalidate) để cập nhật nếu GV vừa giao thêm
  // đề mới — người dùng không phải chờ, danh sách vẫn luôn đúng.
  const scoreExportCacheRef = useRef<Map<string, { examId: string; title: string }[]>>(new Map());

  // Gộp lại thành 1 hàm dùng chung cho: mở menu lần đầu, nút "Thử lại", và
  // revalidate ngầm — silent=true thì không bật loadingScoreExportExams
  // (dùng cho revalidate ngầm khi đã có cache, tránh nháy lại "Đang tải...").
  function loadScoreExportExams(classId: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;
    if (!silent) {
      setLoadingScoreExportExams(true);
      setScoreExportListError('');
    }
    apiFetch<{ exams: { examId: string; title: string }[] }>(
      `/api/classes/${classId}/score-export?format=list`
    )
      .then((result) => {
        const exams = result.exams || [];
        scoreExportCacheRef.current.set(classId, exams);
        setScoreExportExams(exams);
        if (silent) setScoreExportListError('');
      })
      .catch((err: any) => {
        if (!silent) {
          setScoreExportExams([]);
          setScoreExportListError(err.message || 'Không tải được danh sách đề, thử lại giúp cô/thầy.');
        }
        // Revalidate ngầm lỗi thì im lặng bỏ qua — GV vẫn đang xem dữ liệu
        // cache cũ (vẫn dùng được), không cần làm phiền bằng lỗi cho 1 lần
        // làm mới ngầm không ai yêu cầu trực tiếp.
      })
      .finally(() => {
        if (!silent) setLoadingScoreExportExams(false);
      });
  }
  // SỬA LỖI: trước đây fetch(format=list) không kiểm tra res.ok — nếu server
  // trả lỗi (401/404/500) thì res.json() vẫn parse được JSON dạng {error:...}
  // (mọi route đều trả JSON kể cả lúc lỗi), nên result.exams luôn undefined
  // -> hiện ra rỗng []. Giao diện lúc đó chỉ hiện "Lớp này chưa có đề nào
  // được giao", trông y như danh sách "không load được" mà KHÔNG có thông
  // báo lỗi thật nào cho GV biết, rất khó chẩn đoán. Thêm state lỗi riêng +
  // dùng apiFetch (đã tự throw khi !res.ok) để hiện đúng lý do khi có lỗi
  // thật (hết hạn đăng nhập, mất mạng...) thay vì im lặng coi như trống.
  const [scoreExportListError, setScoreExportListError] = useState('');

  // Bước 2 — Giao đề
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [assignMessage, setAssignMessage] = useState('');
  const [assignLink, setAssignLink] = useState('');
  const [assignLinkCopied, setAssignLinkCopied] = useState(false);
  const [assignedExams, setAssignedExams] = useState<AssignedSubmission[]>([]);
  const [loadingAssignedExams, setLoadingAssignedExams] = useState(false);
  const [assignedExamsError, setAssignedExamsError] = useState('');
  // Bước 3: "Cho làm lại" — id submission đang xử lý (khoá riêng nút đó,
  // không khoá cả danh sách) + "Xem bài làm" — id submission đang mở modal.
  const [retakingId, setRetakingId] = useState<string | null>(null);
  const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(null);
  // THÊM MỚI (Lịch sử làm bài): examId đang MỞ RỘNG lịch sử (null = đang
  // đóng hết) + cache theo examId (tránh gọi lại API mỗi lần đóng/mở cùng 1
  // đề) + loading/error riêng cho từng examId (object, không khoá cả danh
  // sách khi đang tải lịch sử của 1 đề).
  const [historyOpenExamId, setHistoryOpenExamId] = useState<string | null>(null);
  const [historyByExam, setHistoryByExam] = useState<Record<string, AttemptHistoryItem[]>>({});
  const [historyLoadingExamId, setHistoryLoadingExamId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<Record<string, string>>({});

  async function loadClasses() {
    setLoadingClasses(true);
    setListError('');
    try {
      const data = await apiFetch<{ classes: ClassItem[] }>('/api/classes');
      setClasses(data.classes);
    } catch (err: any) {
      setListError(err.message || 'Không tải được danh sách lớp.');
    } finally {
      setLoadingClasses(false);
    }
  }

  async function loadClassStudents(classId: string) {
    setLoadingDetail(true);
    setDetailError('');
    try {
      const data = await apiFetch<{ students: StudentItem[] }>(`/api/students?classId=${classId}`);
      setClassStudents(data.students);
    } catch (err: any) {
      setDetailError(err.message || 'Không tải được danh sách học sinh.');
    } finally {
      setLoadingDetail(false);
    }
  }

  async function loadAssignedExams(studentId: string) {
    setLoadingAssignedExams(true);
    setAssignedExamsError('');
    try {
      const data = await apiFetch<{ submissions: AssignedSubmission[] }>(`/api/submissions?studentId=${studentId}`);
      setAssignedExams(data.submissions);
    } catch (err: any) {
      setAssignedExamsError(err.message || 'Không tải được danh sách đề đã giao.');
    } finally {
      setLoadingAssignedExams(false);
    }
  }

  // Bước 3: GV bấm "Cho làm lại" ở 1 dòng đề đã "đã nộp" — tạo attempt mới,
  // rồi tải lại danh sách để dòng đó quay về "chưa thi".
  async function handleRetake(submissionId: string) {
    if (!selectedStudentId) return;
    setRetakingId(submissionId);
    try {
      await apiFetch(`/api/submissions/${submissionId}/retake`, { method: 'POST' });
      await loadAssignedExams(selectedStudentId);
      // Học sinh vừa được cấp lượt mới -> lịch sử cũ của đề này (nếu đang mở
      // sẵn) không còn đúng nữa (thiếu attempt mới) — xoá cache để lần sau mở
      // lại tự tải mới, không hiện lịch sử cũ/thiếu.
      const examIdOfThisRow = assignedExams.find((e) => e._id === submissionId)?.examId;
      if (examIdOfThisRow) {
        setHistoryByExam((prev) => {
          const next = { ...prev };
          delete next[examIdOfThisRow];
          return next;
        });
      }
    } catch (err: any) {
      alert(err.message || 'Không cho làm lại được.');
    } finally {
      setRetakingId(null);
    }
  }

  // THÊM MỚI (Lịch sử làm bài): GV bấm "Lịch sử làm bài (N lần)" ở 1 dòng đề
  // — mở/đóng khối liệt kê TOÀN BỘ các lần làm của đúng đề đó. Chỉ gọi API
  // lần đầu mở (cache theo examId), các lần đóng/mở lại sau dùng luôn cache.
  function toggleAttemptHistory(examId: string) {
    if (historyOpenExamId === examId) {
      setHistoryOpenExamId(null);
      return;
    }
    setHistoryOpenExamId(examId);
    if (historyByExam[examId] || !selectedStudentId) return; // đã có cache, khỏi gọi lại
    setHistoryLoadingExamId(examId);
    setHistoryError((prev) => ({ ...prev, [examId]: '' }));
    apiFetch<{ attempts: AttemptHistoryItem[] }>(
      `/api/submissions?studentId=${selectedStudentId}&examId=${examId}&history=1`
    )
      .then((data) => setHistoryByExam((prev) => ({ ...prev, [examId]: data.attempts })))
      .catch((err: any) =>
        setHistoryError((prev) => ({ ...prev, [examId]: err.message || 'Không tải được lịch sử làm bài.' }))
      )
      .finally(() => setHistoryLoadingExamId((cur) => (cur === examId ? null : cur)));
  }

  useEffect(() => {
    loadClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadClassStudents(selectedClassId);
    }
    // Đổi lớp -> danh sách đề + lựa chọn lọc của lớp cũ không còn hợp lệ nữa,
    // reset để lần bấm "Bảng điểm" tiếp theo tải lại đúng đề của lớp mới.
    setScoreExportExams([]);
    setSelectedScoreExportExamIds([]);
    setScoreExportListError('');
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedStudentId) {
      loadAssignedExams(selectedStudentId);
    }
    // Đổi học sinh -> lịch sử làm bài đang mở/cache của em trước không còn
    // hợp lệ cho em này (khác studentId hoàn toàn) — reset sạch.
    setHistoryOpenExamId(null);
    setHistoryByExam({});
    setHistoryError({});
  }, [selectedStudentId]);

  const selectedClass = classes.find((c) => c._id === selectedClassId) || null;
  const selectedStudent = classStudents.find((s) => s._id === selectedStudentId) || null;

  const goRoot = () => {
    setSelectedClassId(null);
    setSelectedStudentId(null);
    setSearch('');
    setShowAddStudent(false);
    setEditingStudentId(null);
    setShowAssignPanel(false);
    setAssignMessage('');
  };
  const goClass = () => {
    setSelectedStudentId(null);
    // SỬA LỖI: trước đây bấm breadcrumb quay lại danh sách lớp KHÔNG tải lại
    // classStudents — nếu học sinh tự báo danh/thêm tên MỚI trong lúc giáo
    // viên đang ở tầng 3 (xem 1 học sinh khác), tên mới đó không hiện ra vì
    // state cũ (lúc mới vào lớp) vẫn còn, phải rời hẳn về "Quản lý lớp" rồi
    // vào lại lớp mới thấy. Nay tải lại luôn mỗi lần quay về tầng 2.
    if (selectedClassId) {
      loadClassStudents(selectedClassId);
    }
  };

  async function handleCreateClass(name: string, schoolYear: string) {
    const data = await apiFetch<{ class: ClassItem }>('/api/classes', {
      method: 'POST',
      body: JSON.stringify({ name, schoolYear }),
    });
    setClasses((prev) => [data.class, ...prev]);
    setShowAddClass(false);
  }

  async function handleEditClass(classId: string, name: string, schoolYear: string) {
    const data = await apiFetch<{ class: ClassItem }>(`/api/classes/${classId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, schoolYear }),
    });
    setClasses((prev) =>
      prev.map((c) => (c._id === classId ? { ...c, name: data.class.name, schoolYear: data.class.schoolYear } : c))
    );
    setEditingClassId(null);
  }

  // SỬA (khiếu nại: "bấm nút gạt lâu mới đổi qua trái/phải"): TRƯỚC ĐÂY chờ
  // `await apiFetch` xong mới setClasses — nút đứng yên hoàn toàn trong lúc
  // chờ mạng, cảm giác như bấm không ăn. GIỜ đổi UI NGAY khi bấm (optimistic
  // update), gọi API ngầm phía sau; nếu API lỗi thì rollback lại giá trị cũ
  // + báo lỗi, để không "nói dối" GV là đã đổi thành công trong khi thực ra
  // chưa lưu được.
  async function handleChangeSelfRegisterMode(classId: string, next: SelfRegisterMode) {
    const prevMode = classes.find((c) => c._id === classId)?.selfRegisterMode ?? 'off';
    setClasses((prev) => prev.map((c) => (c._id === classId ? { ...c, selfRegisterMode: next } : c)));
    try {
      const data = await apiFetch<{ class: ClassItem }>(`/api/classes/${classId}`, {
        method: 'PUT',
        body: JSON.stringify({ selfRegisterMode: next }),
      });
      // Khớp lại đúng giá trị server trả về (phòng trường hợp server tự
      // chuẩn hoá khác đi) — bình thường sẽ giống hệt `next` nên không gây
      // giật hình.
      setClasses((prev) =>
        prev.map((c) => (c._id === classId ? { ...c, selfRegisterMode: data.class.selfRegisterMode } : c))
      );
    } catch (err: any) {
      // Rollback về giá trị trước khi bấm — nút gạt tự nhảy lại vị trí cũ để
      // GV biết thao tác KHÔNG thành công, không phải màn hình đứng hình.
      setClasses((prev) => prev.map((c) => (c._id === classId ? { ...c, selfRegisterMode: prevMode } : c)));
      alert(err.message || 'Không đổi được chế độ tự báo danh, thử lại nhé.');
    }
  }

  // SỬA (cùng lý do trên): "Duyệt" đổi UI ngay (nút biến mất ngay khi bấm),
  // rollback (hiện lại nút) nếu API lỗi.
  async function handleApproveStudent(studentId: string) {
    const prevApproved = classStudents.find((s) => s._id === studentId)?.approved;
    setClassStudents((prev) => prev.map((s) => (s._id === studentId ? { ...s, approved: true } : s)));
    try {
      const data = await apiFetch<{ student: StudentItem }>(`/api/students/${studentId}`, {
        method: 'PUT',
        body: JSON.stringify({ approved: true }),
      });
      setClassStudents((prev) =>
        prev.map((s) => (s._id === studentId ? { ...s, approved: data.student.approved } : s))
      );
    } catch (err: any) {
      setClassStudents((prev) => prev.map((s) => (s._id === studentId ? { ...s, approved: prevApproved } : s)));
      alert(err.message || 'Không duyệt được học sinh này, thử lại nhé.');
    }
  }

  async function handleDeleteClass(classId: string, name: string) {
    if (!window.confirm(`Xóa lớp "${name}"? Toàn bộ học sinh và dữ liệu bài làm trong lớp này sẽ bị xóa vĩnh viễn.`)) {
      return;
    }
    try {
      await apiFetch(`/api/classes/${classId}`, { method: 'DELETE' });
      setClasses((prev) => prev.filter((c) => c._id !== classId));
    } catch (err: any) {
      alert(err.message || 'Không xóa được lớp.');
    }
  }

  async function handleCreateStudent(data: { name: string; dob: string; gender: '' | 'Nam' | 'Nữ' }) {
    if (!selectedClassId) return;
    const res = await apiFetch<{ student: StudentItem }>('/api/students', {
      method: 'POST',
      body: JSON.stringify({ name: data.name, dob: data.dob, gender: data.gender || undefined, classId: selectedClassId }),
    });
    setClassStudents((prev) => [...prev, res.student].sort((a, b) => a.name.localeCompare(b.name)));
    setClasses((prev) => prev.map((c) => (c._id === selectedClassId ? { ...c, studentCount: c.studentCount + 1 } : c)));
    setShowAddStudent(false);
  }

  async function handleEditStudent(
    studentId: string,
    data: { name: string; dob: string; gender: '' | 'Nam' | 'Nữ'; classId?: string }
  ) {
    const res = await apiFetch<{ student: StudentItem }>(`/api/students/${studentId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: data.name, dob: data.dob, gender: data.gender || undefined, classId: data.classId }),
    });
    const movedToOtherClass = data.classId && data.classId !== selectedClassId;
    if (movedToOtherClass) {
      // Chuyển sang lớp khác — biến mất khỏi danh sách đang xem, cập nhật sĩ số 2 lớp.
      setClassStudents((prev) => prev.filter((s) => s._id !== studentId));
      setClasses((prev) =>
        prev.map((c) => {
          if (c._id === selectedClassId) return { ...c, studentCount: Math.max(0, c.studentCount - 1) };
          if (c._id === data.classId) return { ...c, studentCount: c.studentCount + 1 };
          return c;
        })
      );
    } else {
      setClassStudents((prev) =>
        prev.map((s) => (s._id === studentId ? res.student : s)).sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    setEditingStudentId(null);
  }

  async function handleDeleteStudent(studentId: string, name: string) {
    if (!window.confirm(`Xóa học sinh "${name}"? Dữ liệu bài làm của em này cũng sẽ bị xóa.`)) return;
    try {
      await apiFetch(`/api/students/${studentId}`, { method: 'DELETE' });
      setClassStudents((prev) => prev.filter((s) => s._id !== studentId));
      setClasses((prev) =>
        prev.map((c) => (c._id === selectedClassId ? { ...c, studentCount: Math.max(0, c.studentCount - 1) } : c))
      );
      if (selectedStudentId === studentId) setSelectedStudentId(null);
    } catch (err: any) {
      alert(err.message || 'Không xóa được học sinh.');
    }
  }

  // ---------- Tầng 3: đề thi đã giao cho 1 học sinh ----------
  if (selectedClass && selectedStudent) {
    const doneCount = assignedExams.filter((e) => e.status === 'đã nộp').length;
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Breadcrumb
          items={[
            { label: 'Quản lý lớp', onClick: goRoot },
            { label: selectedClass.name, onClick: goClass },
            { label: selectedStudent.name },
          ]}
        />

        <div className="flex items-center gap-4 mb-7 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="w-11 h-11 rounded-full border-2 border-blue-500 text-blue-600 flex items-center justify-center font-semibold text-base">
            {initials(selectedStudent.name)}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">{selectedStudent.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {selectedStudent.gender || '—'} · Sinh {selectedStudent.dob || '—'} · Lớp {selectedClass.name}
            </p>
          </div>
          {assignedExams.length > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">
                {doneCount}/{assignedExams.length}
              </p>
              <p className="text-xs text-gray-400">đã hoàn thành</p>
            </div>
          )}
        </div>

        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Danh sách đề thi đã giao</h3>
        {loadingAssignedExams ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl px-5 py-4 animate-pulse">
                <div className="h-3.5 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : assignedExamsError ? (
          <p className="text-sm text-red-600">{assignedExamsError}</p>
        ) : assignedExams.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-xl py-10 text-center">
            <FolderIcon className="w-9 h-9 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">Học sinh này chưa được giao đề thi nào.</p>
            <p className="text-xs text-gray-300 mt-1">Vào lại lớp và bấm "Giao đề" để giao đề cho em này.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {assignedExams.map((e) => (
              <div
                key={e._id}
                className="flex items-center justify-between flex-wrap bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  <p className="font-semibold text-gray-800">{e.examTitle}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Giao lúc: {new Date(e.assigned_at).toLocaleString('vi-VN')}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    {e.status !== 'chưa thi' && (
                      <button
                        onClick={() => setViewingSubmissionId(e._id)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <span className="inline-flex items-center gap-1"><EyeIcon className="w-3.5 h-3.5" /> Xem bài làm</span>
                      </button>
                    )}
                    {e.status === 'đã nộp' && (
                      <button
                        onClick={() => handleRetake(e._id)}
                        disabled={retakingId === e._id}
                        className="text-xs font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
                      >
                        {retakingId === e._id ? 'Đang xử lý...' : '↺ Cho làm lại'}
                      </button>
                    )}
                    {/* THÊM MỚI (Lịch sử làm bài): chỉ hiện khi đã làm từ lần
                        2 trở lên (attemptNumber > 1) — lần 1 duy nhất thì
                        "lịch sử" chính là dòng đang hiện sẵn, không cần nút. */}
                    {e.attemptNumber > 1 && (
                      <button
                        onClick={() => toggleAttemptHistory(e.examId)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700"
                      >
                        {historyOpenExamId === e.examId ? '▴ Ẩn lịch sử' : `▾ Lịch sử làm bài (${e.attemptNumber} lần)`}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      e.status === 'đã nộp'
                        ? 'bg-green-100 text-green-700'
                        : e.status === 'đang thi'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-orange-100 text-orange-600'
                    }`}
                  >
                    {e.status}
                  </span>
                  {e.status === 'đã nộp' && e.score !== null && (
                    <p className="text-xs text-gray-500 mt-1.5 font-medium">
                      {e.scorePoints !== null && e.maxScorePoints !== null
                        ? `${e.scorePoints}/${e.maxScorePoints}đ`
                        : `Điểm: ${e.score}${e.total !== null ? `/${e.total}` : ''}`}
                    </p>
                  )}
                </div>
                {/* THÊM MỚI (Lịch sử làm bài): khối liệt kê TOÀN BỘ các lần
                    làm của đúng đề này, mới nhất trước — dòng đang hiện ở
                    trên (attempt mới nhất) LẶP LẠI ở đây luôn (không ẩn đi)
                    để GV thấy đủ mạch "lần 3 (mới nhất, đang hiện điểm chính
                    thức) - lần 2 - lần 1" liền một bảng, dễ so sánh. */}
                {historyOpenExamId === e.examId && (
                  <div className="w-full mt-3 pt-3 border-t border-gray-100">
                    {historyLoadingExamId === e.examId ? (
                      <p className="text-xs text-gray-400">Đang tải lịch sử...</p>
                    ) : historyError[e.examId] ? (
                      <p className="text-xs text-red-600">{historyError[e.examId]}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(historyByExam[e.examId] || []).map((a) => (
                          <div
                            key={a._id}
                            className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-600">Lần {a.attemptNumber}</span>
                              <span
                                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                  a.status === 'đã nộp'
                                    ? 'bg-green-100 text-green-700'
                                    : a.status === 'đang thi'
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'bg-orange-100 text-orange-600'
                                }`}
                              >
                                {a.status}
                              </span>
                              {a.submitted_at && (
                                <span className="text-[11px] text-gray-400">
                                  Nộp lúc: {new Date(a.submitted_at).toLocaleString('vi-VN')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {a.status === 'đã nộp' && (
                                <span className="text-xs font-medium text-gray-600">
                                  {a.scorePoints !== null && a.maxScorePoints !== null
                                    ? `${a.scorePoints}/${a.maxScorePoints}đ`
                                    : a.score !== null
                                    ? `${a.score}${a.total !== null ? `/${a.total}` : ''}`
                                    : ''}
                                </span>
                              )}
                              {a.status !== 'chưa thi' && (
                                <button
                                  onClick={() => setViewingSubmissionId(a._id)}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                >
                                  Xem
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {viewingSubmissionId && (
          <SubmissionDetailModal
            submissionId={viewingSubmissionId}
            onClose={() => setViewingSubmissionId(null)}
          />
        )}
      </div>
    );
  }

  // ---------- Tầng 2: danh sách học sinh trong 1 lớp ----------
  if (selectedClass) {
    const filtered = classStudents.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Breadcrumb items={[{ label: 'Quản lý lớp', onClick: goRoot }, { label: selectedClass.name }]} />

        {/* SỬA (khiếu nại "khu vực tên Lớp gần các nút quá rối, khó dùng"):
            trước đây tiêu đề lớp + 5 nút hành động (làm mới, Giao đề, Bảng
            điểm, Nhập Excel, Thêm học sinh) chen chung 1 hàng ngang, càng
            rối hơn khi màn hẹp phải xuống dòng lộn xộn không theo nhóm nào.
            Bố trí lại theo đúng kiểu khối "Cài đặt riêng cho lớp này" ở
            panel Giao đề bên trên: tiêu đề tách hẳn 1 dòng riêng, các nút
            hành động dồn xuống 1 THANH CÔNG CỤ riêng ngay dưới, gom thành 2
            NHÓM theo đúng ý nghĩa công việc (nhóm "danh sách học sinh" và
            nhóm "đề thi/điểm") thay vì xếp ngẫu nhiên theo thứ tự code —
            mắt dễ quét, tay dễ bấm đúng nút cần. */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            Lớp {selectedClass.name}{' '}
            <span className="text-sm text-gray-400 font-normal">({classStudents.length} học sinh)</span>
          </h2>
          {/* Nút làm mới đứng riêng cạnh tiêu đề (không phải một "hành động"
              ngang hàng Giao đề/Thêm học sinh, chỉ là tiện ích phụ) — giữ
              IconButton nhỏ gọn, tách khỏi thanh công cụ chính bên dưới. */}
          <IconButton
            onClick={() => loadClassStudents(selectedClass._id)}
            disabled={loadingDetail}
            title="Tải lại danh sách học sinh"
            icon={<RefreshIcon className="w-4 h-4" />}
            hoverClass="hover:text-gray-700 hover:bg-gray-100"
            className="border border-gray-300 shrink-0"
          />
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
          {/* Nhóm 1: thao tác với DANH SÁCH HỌC SINH của lớp — việc GV làm
              đầu tiên khi vào 1 lớp, nên đặt bên trái và dùng PrimaryButton
              cho "Thêm học sinh" (hành động chính) thay vì viền xanh nhạt dễ
              nhầm là nút phụ như trước. */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">
              Danh sách
            </span>
            <PrimaryButton
              onClick={() => {
                setShowAddStudent((v) => !v);
                setShowImportStudents(false);
                setEditingStudentId(null);
                setShowAssignPanel(false);
                setShowScoreExportMenu(false);
              }}
              icon={<PlusIcon className="w-4 h-4" />}
            >
              Thêm học sinh
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                setShowImportStudents((v) => !v);
                setShowAddStudent(false);
                setEditingStudentId(null);
                setShowAssignPanel(false);
                setShowScoreExportMenu(false);
              }}
              icon={<FileIcon className="w-4 h-4" />}
            >
              Nhập từ Excel
            </SecondaryButton>
          </div>

          {/* Đường phân cách mảnh giữa 2 nhóm — chỉ hiện khi đủ chỗ (màn
              rộng), tự ẩn khi xuống dòng ở màn hẹp để không tạo 1 gạch lửng
              lơ giữa 2 hàng. */}
          <div className="hidden sm:block w-px self-stretch bg-gray-300" />

          {/* Nhóm 2: thao tác với ĐỀ THI/ĐIỂM của lớp — tách rõ khỏi nhóm 1
              vì đây là việc làm SAU KHI đã có danh sách học sinh. */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mr-0.5">
              Đề thi
            </span>
            <SecondaryButton
              onClick={() => {
                setShowAssignPanel((v) => !v);
                setAssignMessage('');
                setAssignLink('');
                setAssignLinkCopied(false);
                setShowAddStudent(false);
                setEditingStudentId(null);
                setShowScoreExportMenu(false);
              }}
              icon={<SendIcon className="w-4 h-4" />}
              iconColorClass="text-blue-600"
            >
              Giao đề
            </SecondaryButton>
            {/* THÊM MỚI (mục 4): xuất bảng điểm Excel/Word, gộp tất cả các đề
                đã giao cho lớp này thành 1 bảng — kiểu Azota. Dùng thẻ <a>
                tải trực tiếp qua GET (trình duyệt tự kèm cookie đăng nhập),
                không cần gọi fetch/blob thủ công. */}
            <div className="relative">
              <SecondaryButton
                onClick={() => {
                  const opening = !showScoreExportMenu;
                  setShowScoreExportMenu(opening);
                  if (opening) {
                    const cached = scoreExportCacheRef.current.get(selectedClass._id);
                    if (cached) {
                      // Đã có cache cho ĐÚNG lớp này — hiện ngay, không chờ,
                      // rồi âm thầm gọi lại phía sau để đồng bộ nếu GV vừa
                      // giao thêm đề mới (xem loadScoreExportExams ở trên).
                      setScoreExportExams(cached);
                      setScoreExportListError('');
                      loadScoreExportExams(selectedClass._id, { silent: true });
                    } else {
                      loadScoreExportExams(selectedClass._id);
                    }
                  }
                }}
                icon={<ChartBarIcon className="w-4 h-4" />}
                iconColorClass="text-emerald-600"
              >
                Bảng điểm
              </SecondaryButton>
              {showScoreExportMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowScoreExportMenu(false)} />
                  <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                    {/* THÊM MỚI: chọn xuất TẤT CẢ đề hay chỉ 1/vài đề cụ thể
                        — mặc định "Tất cả đề" (selectedScoreExportExamIds
                        rỗng), GV bấm vào từng đề để chỉ lọc riêng đề đó. */}
                    <div className="px-4 pt-2 pb-1.5 border-b border-gray-100">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Chọn đề muốn xuất</p>
                      {loadingScoreExportExams ? (
                        // Skeleton UI nhỏ gọn cho đúng dropdown này: vài dòng
                        // xám thay cho ô checkbox + tên đề, không cần khung to
                        // (đồng bộ với dropdown tương tự ở ClassDetailPanel.tsx).
                        <div className="space-y-1.5 py-1">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: `${70 - i * 12}%` }} />
                          ))}
                        </div>
                      ) : scoreExportListError ? (
                        <div className="py-1">
                          <p className="text-xs text-red-600">{scoreExportListError}</p>
                          <button
                            type="button"
                            onClick={() => loadScoreExportExams(selectedClass._id)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 mt-1"
                          >
                            Thử lại
                          </button>
                        </div>
                      ) : scoreExportExams.length === 0 ? (
                        <p className="text-xs text-gray-400 py-1">Lớp này chưa có đề nào được giao.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={selectedScoreExportExamIds.length === 0}
                              onChange={() => setSelectedScoreExportExamIds([])}
                            />
                            <span className="font-medium">Tất cả đề ({scoreExportExams.length})</span>
                          </label>
                          {scoreExportExams.map((ex) => (
                            <label key={ex.examId} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer py-0.5">
                              <input
                                type="checkbox"
                                checked={selectedScoreExportExamIds.includes(ex.examId)}
                                onChange={() => {
                                  setSelectedScoreExportExamIds((prev) =>
                                    prev.includes(ex.examId)
                                      ? prev.filter((id) => id !== ex.examId)
                                      : [...prev, ex.examId]
                                  );
                                }}
                              />
                              <span className="truncate">{ex.title}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <a
                      href={`/api/classes/${selectedClass._id}/score-export?format=xlsx${
                        selectedScoreExportExamIds.length > 0 ? `&examIds=${selectedScoreExportExamIds.join(',')}` : ''
                      }`}
                      onClick={() => setShowScoreExportMenu(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <FileIcon className="w-4 h-4 text-emerald-600" /> Xuất Excel (.xlsx)
                    </a>
                    <a
                      href={`/api/classes/${selectedClass._id}/score-export?format=docx${
                        selectedScoreExportExamIds.length > 0 ? `&examIds=${selectedScoreExportExamIds.join(',')}` : ''
                      }`}
                      onClick={() => setShowScoreExportMenu(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <FileIcon className="w-4 h-4 text-blue-600" /> Xuất Word (.docx)
                    </a>
                    <p className="px-4 pt-1.5 pb-0.5 text-[11px] text-gray-400 border-t border-gray-100 mt-1">
                      {selectedScoreExportExamIds.length > 0
                        ? `Chỉ gồm ${selectedScoreExportExamIds.length} đề đã chọn.`
                        : 'Gồm tất cả đề đã giao cho lớp này.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* THÊM MỚI (tự báo danh kiểu Azota): nút gạt 3 trạng thái thay vì
            checkbox bật/tắt đơn giản, vì GV cần chọn giữa 2 kiểu tự báo danh
            khác nhau — không chỉ bật/tắt. Mặc định TẮT để giữ đúng hành vi cũ
            (chỉ tên có sẵn mới thi được). */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-5">
          <span className="block text-sm font-medium text-gray-700 mb-2">Tự báo danh</span>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-xs font-semibold">
            {(
              [
                { value: 'off', label: 'Tắt' },
                { value: 'auto', label: 'Tự động' },
                { value: 'approval', label: 'Cần duyệt' },
              ] as { value: SelfRegisterMode; label: string }[]
            ).map((opt) => {
              const active = (selectedClass.selfRegisterMode || 'off') === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleChangeSelfRegisterMode(selectedClass._id, opt.value)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {selectedClass.selfRegisterMode === 'approval' ? (
              <>
                Học sinh không thấy tên mình khi vào link đề có thể tự nhập tên để "Xin vào lớp", nhưng
                phải chờ giáo viên bấm "Duyệt" trong danh sách bên dưới mới bắt đầu làm bài được.
              </>
            ) : selectedClass.selfRegisterMode === 'auto' ? (
              <>
                Học sinh không thấy tên mình khi vào link đề có thể tự nhập tên và làm bài NGAY, không cần
                giáo viên duyệt (giống Azota). Nên chỉ bật tạm thời khi cần, tắt lại sau để tránh người
                ngoài lớp tự thêm tên bừa.
              </>
            ) : (
              <>Học sinh bắt buộc có tên sẵn trong danh sách lớp mới làm bài được.</>
            )}
          </p>
        </div>

        {showAssignPanel && (
          <AssignExamPanel
            classId={selectedClass._id}
            students={classStudents}
            onCancel={() => setShowAssignPanel(false)}
            onAssigned={(message, link) => {
              setAssignMessage(message);
              setAssignLink(link);
              setAssignLinkCopied(false);
              setShowAssignPanel(false);
              // Vừa giao thêm đề mới cho lớp này — xoá cache "Bảng điểm" của
              // đúng lớp này để lần mở tiếp theo lấy đúng danh sách mới nhất
              // (không hiện thiếu đề vừa giao vì còn dính cache cũ).
              scoreExportCacheRef.current.delete(selectedClass._id);
            }}
          />
        )}
        {assignMessage && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3.5 py-2.5 mb-4">
            <p className="mb-2 inline-flex items-center gap-1.5"><CheckIcon className="w-4 h-4 shrink-0" /> {assignMessage}</p>
            {assignLink && (
              <>
                <p className="text-xs text-green-600 mb-1.5">
                  Gửi link này cho học sinh lớp {selectedClass?.name} (link "Xuất bản" ở tab Đề thi KHÔNG
                  dùng được cho học sinh — thiếu thông tin lớp):
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={assignLink}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 border border-green-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(assignLink);
                        setAssignLinkCopied(true);
                      } catch {}
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    {assignLinkCopied ? (
                      <span className="inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" /> Đã copy</span>
                    ) : (
                      'Copy'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {showAddStudent && (
          <StudentForm
            onCancel={() => setShowAddStudent(false)}
            onSubmit={(data) => handleCreateStudent(data)}
          />
        )}

        {showImportStudents && selectedClass && (
          <ImportStudentsPanel
            classId={selectedClass._id}
            onCancel={() => setShowImportStudents(false)}
            onImported={() => {
              setShowImportStudents(false);
              loadClassStudents(selectedClass._id);
            }}
          />
        )}

        {detailError && <p className="text-sm text-red-600 mb-3">{detailError}</p>}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên..."
          className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-shadow"
        />

        {loadingDetail ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 animate-pulse"
              >
                <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-3.5 bg-gray-200 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) =>
              editingStudentId === s._id ? (
                <StudentForm
                  key={s._id}
                  initialName={s.name}
                  initialDob={s.dob || ''}
                  initialGender={(s.gender as any) || ''}
                  showClassSelect
                  classes={classes}
                  initialClassId={s.classId}
                  onCancel={() => setEditingStudentId(null)}
                  onSubmit={(data) => handleEditStudent(s._id, data)}
                />
              ) : (
                <div
                  key={s._id}
                  className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:shadow-md hover:border-blue-200 transition-all"
                >
                  <button
                    onClick={() => setSelectedStudentId(s._id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-8 h-8 rounded-full border-2 border-blue-500 text-blue-600 flex items-center justify-center text-xs font-semibold shrink-0">
                      {initials(s.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                        {s.name}
                        {s.selfRegistered && s.approved === false && (
                          <span
                            title="Học sinh tự báo danh, đang chờ giáo viên duyệt — chưa thi được"
                            className="text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded shrink-0"
                          >
                            ⏳ Chờ duyệt
                          </span>
                        )}
                        {s.selfRegistered && s.approved !== false && (
                          <span
                            title="Học sinh tự nhập tên qua tính năng Tự báo danh, chưa được giáo viên xác nhận"
                            className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0"
                          >
                            Tự thêm
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.gender || '—'} · Sinh {s.dob || '—'}
                      </p>
                    </div>
                  </button>
                  {s.selfRegistered && s.approved === false && (
                    <button
                      onClick={() => handleApproveStudent(s._id)}
                      className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
                      title="Duyệt để học sinh này thi được"
                    >
                      <CheckIcon className="w-3.5 h-3.5" />
                      Duyệt
                    </button>
                  )}
                  <IconButton
                    onClick={() => {
                      setEditingStudentId(s._id);
                      setShowAddStudent(false);
                    }}
                    title="Sửa / chuyển lớp"
                    icon={<PencilIcon className="w-4 h-4" />}
                    hoverClass="hover:text-blue-600 hover:bg-blue-50"
                  />
                  <IconButton
                    onClick={() => handleDeleteStudent(s._id, s.name)}
                    title="Xóa"
                    icon={<TrashIcon className="w-4 h-4" />}
                    hoverClass="hover:text-red-600 hover:bg-red-50"
                  />
                </div>
              )
            )}
            {filtered.length === 0 && (
              <div className="border border-dashed border-gray-300 rounded-xl py-10 text-center">
                <p className="text-sm text-gray-400">Không tìm thấy học sinh nào.</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------- Tầng 1: danh sách lớp ----------
  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumb items={[{ label: 'Quản lý lớp' }]} />

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Quản lý lớp</h2>
          <p className="text-sm text-gray-400 mt-0.5">{classes.length} lớp · {totalStudents} học sinh</p>
        </div>
        <PrimaryButton
          onClick={() => {
            setShowAddClass((v) => !v);
            setEditingClassId(null);
          }}
          icon={<PlusIcon className="w-4 h-4" />}
        >
          Thêm lớp
        </PrimaryButton>
      </div>

      {showAddClass && (
        <ClassForm onCancel={() => setShowAddClass(false)} onSubmit={handleCreateClass} />
      )}

      {listError && <p className="text-sm text-red-600 mb-3">{listError}</p>}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo tên lớp..."
        className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm mb-5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-shadow"
      />

      {loadingClasses ? (
        // Skeleton UI (thay "Đang tải..." chặn trắng): hiện sẵn khung lưới
        // 4 thẻ lớp giả (đúng bố cục thẻ thật bên dưới — bo góc, viền,
        // khoảng đệm y hệt), phần tên lớp/sĩ số thì thay bằng khối xám
        // nhấp nháy. Dữ liệu về tới đâu, danh sách thật thay vào tới đó.
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/5 mb-2.5" />
              <div className="h-3 bg-gray-100 rounded w-3/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes
            .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
            .map((c) =>
              editingClassId === c._id ? (
                <ClassForm
                  key={c._id}
                  initialName={c.name}
                  initialSchoolYear={c.schoolYear}
                  onCancel={() => setEditingClassId(null)}
                  onSubmit={(name, schoolYear) => handleEditClass(c._id, name, schoolYear)}
                />
              ) : (
                <div
                  key={c._id}
                  className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:shadow-md hover:border-blue-300 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <button onClick={() => setSelectedClassId(c._id)} className="font-bold text-gray-900 text-left">
                      {c.name}
                    </button>
                    <div className="flex items-center gap-0.5">
                      <IconButton
                        onClick={() => {
                          setEditingClassId(c._id);
                          setShowAddClass(false);
                        }}
                        title="Sửa lớp"
                        icon={<PencilIcon className="w-4 h-4" />}
                        hoverClass="hover:text-blue-600 hover:bg-blue-50"
                      />
                      <IconButton
                        onClick={() => handleDeleteClass(c._id, c.name)}
                        title="Xóa lớp"
                        icon={<TrashIcon className="w-4 h-4" />}
                        hoverClass="hover:text-red-600 hover:bg-red-50"
                      />
                      <IconButton
                        onClick={() => setSelectedClassId(c._id)}
                        title="Vào lớp"
                        icon={<ChevronRightIcon className="w-4 h-4" />}
                        hoverClass="hover:text-gray-700 hover:bg-gray-100"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Sĩ số: {c.studentCount} · Năm học {c.schoolYear}
                  </p>
                </div>
              )
            )}
          {classes.length === 0 && !listError && (
            <div className="border border-dashed border-gray-300 rounded-xl py-10 text-center col-span-2">
              <p className="text-sm text-gray-400">Chưa có lớp nào. Bấm "Thêm lớp" để tạo lớp đầu tiên.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// THÊM MỚI: tab "Quản trị" — CHỈ được mount/hiện khi teacher.email đúng
// ADMIN_EMAIL (kiểm tra ở component Page bên dưới, xem NAV_ITEMS + phần
// render tab). Phía server (route /api/admin/teachers) VẪN tự kiểm tra lại
// độc lập, nên dù có ai đó cố tình sửa giao diện để lộ tab này ra, API vẫn
// chặn đúng — component này chỉ là lớp ẩn/hiện cho gọn giao diện, không phải
// lớp bảo mật duy nhất.
//
// Hiện tại đăng ký tài khoản đang MỞ CHO TẤT CẢ (chưa giới hạn) — đúng như
// bạn xác nhận "sau này tính sau". Trang này vì vậy CHƯA có nút "duyệt/từ
// chối đăng ký mới", chỉ có: xem danh sách ai đã đăng ký dùng + số lớp họ
// đang quản lý, và KHOÁ/MỞ LẠI đăng nhập 1 tài khoản nếu cần (ĐỔI từ xoá
// cứng sang đổi `status` — xem PATCH /api/admin/teachers/[id] — để có thể
// mở lại nếu cần, không mất dữ liệu) — đủ dùng cho nhu cầu "quản lý tài
// khoản đăng ký sử dụng" trước mắt.
// THÊM MỚI: khung "Cấu hình API AI" trong trang Quản trị — admin nhập/lưu
// Gemini API key dùng cho trợ lý AI (/api/ai-assistant) NGAY TẠI ĐÂY, lưu
// vào DB qua PUT /api/admin/settings (xem appSettings.ts) thay vì phải đặt
// biến môi trường GEMINI_API_KEY trên hosting. Tự tải trạng thái hiện tại
// (đã cấu hình hay chưa + bản che bớt của key) ngay khi mount.
function AiSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AdminAiSettings | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedJustNow, setSavedJustNow] = useState(false);

  // THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): state riêng cho khối
  // "số ngày dùng thử mặc định" — tách hẳn saving/error/savedJustNow khỏi
  // khối key Gemini ở trên vì 2 thao tác lưu ĐỘC LẬP (xem PUT route), lưu
  // cái này không nên hiện lỗi/trạng thái của cái kia và ngược lại.
  const [trialDaysInput, setTrialDaysInput] = useState('');
  const [trialDaysSaving, setTrialDaysSaving] = useState(false);
  const [trialDaysError, setTrialDaysError] = useState('');
  const [trialDaysSavedJustNow, setTrialDaysSavedJustNow] = useState(false);

  // THÊM MỚI (đóng/duyệt đăng ký): state riêng cho khối "chế độ đăng ký" —
  // cùng nguyên tắc tách biệt với 2 khối trên (mỗi khối lưu độc lập qua PUT
  // /api/admin/settings, xem route đó). regModeSaving dùng value đang gửi
  // (không phải state chọn hiện tại) để nút bấm nào cũng tự hiện "Đang
  // lưu..." đúng dòng đang chờ, không bị lẫn giữa 3 lựa chọn.
  const [regModeSaving, setRegModeSaving] = useState<'open' | 'approval' | 'closed' | null>(null);
  const [regModeError, setRegModeError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<AdminAiSettings>('/api/admin/settings');
      setSettings(data);
      setTrialDaysInput(String(data.freeTrialDays));
    } catch (err: any) {
      setError(err.message || 'Không tải được cấu hình.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    const key = keyInput.trim();
    if (!key || saving) return;
    setSaving(true);
    setError('');
    setSavedJustNow(false);
    try {
      const data = await apiFetch<AdminAiSettings>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ geminiApiKey: key }),
      });
      setSettings(data);
      setKeyInput('');
      setSavedJustNow(true);
      // Tự ẩn dòng "Đã lưu" sau vài giây, không cần admin tự bấm tắt.
      setTimeout(() => setSavedJustNow(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Không lưu được key, thử lại nhé.');
    } finally {
      setSaving(false);
    }
  }

  // THÊM MỚI (Phần 2b): lưu số ngày dùng thử mặc định — áp dụng cho tài
  // khoản đăng ký MỚI kể từ lúc lưu, KHÔNG ảnh hưởng hạn của tài khoản đã
  // đăng ký từ trước (xem route auth/register — chỉ đọc lúc tạo tài khoản).
  async function handleSaveTrialDays() {
    const days = Number(trialDaysInput);
    if (trialDaysSaving) return;
    if (!Number.isFinite(days) || !Number.isInteger(days) || days <= 0) {
      setTrialDaysError('Vui lòng nhập số ngày nguyên dương.');
      return;
    }
    setTrialDaysSaving(true);
    setTrialDaysError('');
    setTrialDaysSavedJustNow(false);
    try {
      const data = await apiFetch<AdminAiSettings>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ freeTrialDays: days }),
      });
      setSettings(data);
      setTrialDaysInput(String(data.freeTrialDays));
      setTrialDaysSavedJustNow(true);
      setTimeout(() => setTrialDaysSavedJustNow(false), 4000);
    } catch (err: any) {
      setTrialDaysError(err.message || 'Không lưu được số ngày dùng thử, thử lại nhé.');
    } finally {
      setTrialDaysSaving(false);
    }
  }

  // THÊM MỚI (đóng/duyệt đăng ký khi hạ tầng máy chủ không chịu tải được
  // thêm nhiều tài khoản free): đổi registrationMode ngay khi admin bấm 1
  // trong 3 nút — không cần ô nhập/nút "Lưu" riêng như 2 khối trên, vì đây
  // là lựa chọn 1-trong-3 (giống radio), bấm là áp dụng ngay cho gọn.
  async function handleSaveRegistrationMode(mode: 'open' | 'approval' | 'closed') {
    if (regModeSaving || mode === settings?.registrationMode) return;
    setRegModeSaving(mode);
    setRegModeError('');
    try {
      const data = await apiFetch<AdminAiSettings>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ registrationMode: mode }),
      });
      setSettings(data);
    } catch (err: any) {
      setRegModeError(err.message || 'Không lưu được chế độ đăng ký, thử lại nhé.');
    } finally {
      setRegModeSaving(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h3 className="font-bold text-gray-900 text-sm inline-flex items-center gap-1.5">
          <KeyIcon className="w-4 h-4 text-gray-400" /> Cấu hình API AI (Gemini)
        </h3>
        {!loading && settings && (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              settings.geminiApiKeyConfigured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
          >
            {settings.geminiApiKeyConfigured ? `Đã cấu hình — ${settings.geminiApiKeyMasked}` : 'Chưa cấu hình'}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Key dùng cho trợ lý AI hỏi-đáp về app (nút chat góc dưới-trái, model gemini-3.1-flash-lite) — lưu trong DB, không cần đặt biến môi trường.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={settings?.geminiApiKeyConfigured ? 'Nhập key mới để thay key đang dùng...' : 'Dán Gemini API key vào đây...'}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !keyInput.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          {saving ? 'Đang lưu...' : 'Lưu key'}
        </button>
      </div>
      {savedJustNow && <p className="text-xs text-emerald-600 mt-2">✓ Đã lưu key mới.</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {/* THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): khối cấu hình số
          ngày dùng thử mặc định — tách bằng đường kẻ trên, cùng khung với
          key Gemini cho gọn (2 cấu hình app đều lưu qua chung 1 route). */}
      <div className="border-t border-gray-100 mt-4 pt-4">
        <h4 className="font-bold text-gray-900 text-sm mb-1">Số ngày dùng thử miễn phí mặc định</h4>
        <p className="text-xs text-gray-500 mb-3">
          Áp dụng cho tài khoản GV đăng ký MỚI kể từ lúc lưu — không ảnh hưởng hạn của tài khoản đã đăng ký từ trước.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="number"
            min={1}
            step={1}
            value={trialDaysInput}
            onChange={(e) => setTrialDaysInput(e.target.value)}
            placeholder="Ví dụ: 30"
            className="w-full sm:w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleSaveTrialDays}
            disabled={trialDaysSaving || !trialDaysInput.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            {trialDaysSaving ? 'Đang lưu...' : 'Lưu số ngày'}
          </button>
        </div>
        {trialDaysSavedJustNow && <p className="text-xs text-emerald-600 mt-2">✓ Đã lưu số ngày dùng thử mặc định mới.</p>}
        {trialDaysError && <p className="text-xs text-red-600 mt-2">{trialDaysError}</p>}
      </div>

      {/* THÊM MỚI (đóng/duyệt đăng ký): khối chọn chế độ đăng ký tài khoản
          GV mới — dùng khi hạ tầng máy chủ không chịu tải thêm được nhiều
          tài khoản dùng free, cần tạm đóng hoặc chuyển sang duyệt tay từng
          tài khoản. Cùng khung với 2 khối trên, tách bằng đường kẻ. */}
      <div className="border-t border-gray-100 mt-4 pt-4">
        <h4 className="font-bold text-gray-900 text-sm mb-1">Chế độ đăng ký tài khoản GV mới</h4>
        <p className="text-xs text-gray-500 mb-3">
          Dùng khi hạ tầng máy chủ chưa đáp ứng được thêm nhiều tài khoản dùng miễn phí — tạm đóng hẳn hoặc chuyển sang cần admin duyệt từng tài khoản mới.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          {(
            [
              { value: 'open' as const, label: 'Mở cho tất cả', desc: 'Đăng ký xong dùng được ngay (mặc định)' },
              { value: 'approval' as const, label: 'Cần duyệt', desc: 'Đăng ký được nhưng chờ admin duyệt' },
              { value: 'closed' as const, label: 'Đóng tạm', desc: 'Không nhận đăng ký mới nào' },
            ]
          ).map((opt) => {
            const isActive = settings?.registrationMode === opt.value;
            const isSavingThis = regModeSaving === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSaveRegistrationMode(opt.value)}
                disabled={!!regModeSaving || loading}
                title={opt.desc}
                className={`flex-1 text-left border rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {isSavingThis ? 'Đang lưu...' : opt.label}
                <span className="block text-[11px] font-normal text-gray-400 mt-0.5">{opt.desc}</span>
              </button>
            );
          })}
        </div>
        {regModeError && <p className="text-xs text-red-600 mt-2">{regModeError}</p>}
      </div>
    </div>
  );
}

function AdminTab() {
  const [teachers, setTeachers] = useState<TeacherAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): id đang chờ PATCH
  // planUpdate (gia hạn/chuyển vĩnh viễn) — tách riêng với updatingId (khoá/
  // mở) vì 2 thao tác độc lập, tránh disable nhầm nút còn lại.
  const [planUpdatingId, setPlanUpdatingId] = useState<string | null>(null);

  // THÊM MỚI: nhật ký thao tác quản trị — tải song song với danh sách tài
  // khoản, nạp lại mỗi khi khoá/mở 1 tài khoản (xem handleToggleStatus) để
  // luôn thấy log mới nhất mà không cần bấm F5.
  const [logs, setLogs] = useState<AdminAuditLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  // THÊM MỚI (Phần 1 — dọn trang admin): nhật ký trước đây luôn hiện hết
  // (tối đa 50 dòng) trong 1 khối dài — giờ mặc định chỉ hiện 10 dòng gần
  // nhất, có nút "Xem thêm" để mở rộng khi cần, đỡ chiếm chỗ + dễ đọc hơn.
  const LOG_PREVIEW_COUNT = 10;
  const [showAllLogs, setShowAllLogs] = useState(false);
  // THÊM MỚI: id dòng log đang chờ xóa (disable đúng nút đó, không disable
  // cả danh sách) + trạng thái đang xóa toàn bộ (dùng chung 1 cờ vì thao
  // tác "xóa tất cả" chặn luôn cả danh sách trong lúc chờ).
  const [logDeletingId, setLogDeletingId] = useState<string | null>(null);
  const [logsClearing, setLogsClearing] = useState(false);

  // THÊM MỚI: thẻ thống kê tổng quan — tải riêng, lỗi không chặn phần bảng
  // danh sách tài khoản (thẻ chỉ mang tính tham khảo nhanh).
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // THÊM MỚI: tìm kiếm/lọc/sắp xếp danh sách GV — xử lý hoàn toàn ở client
  // vì số lượng GV còn nhỏ (không cần phân trang phía server ở quy mô này).
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'created_desc' | 'created_asc' | 'classCount_desc' | 'name_asc'>(
    'created_desc'
  );

  // THÊM MỚI: xem chi tiết 1 GV — bấm vào dòng để mở rộng, tải 1 lần rồi
  // lưu cache theo id (không tải lại nếu đã có, trừ khi admin bấm đóng/mở
  // lại sau khi có thay đổi — hiện tại không cần thiết vì lớp/đề không đổi
  // ngay trong lúc admin đang xem trang này).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, AdminTeacherDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<Record<string, string>>({});

  // THÊM MỚI (thiết kế lại trang Quản trị — khiếu nại "trang admin rối
  // kinh khủng"): trước đây mọi khối (thống kê, cấu hình AI, bảng tài
  // khoản, nhật ký) dồn hết vào 1 trang cuộn dài. Giờ tách thành các mục
  // điều hướng con kiểu trang quản trị chuyên nghiệp (Tổng quan / Tài khoản
  // GV / Cấu hình AI / Nhật ký) — mỗi lúc chỉ hiện đúng 1 mục, đỡ rối mắt.
  const [section, setSection] = useState<'overview' | 'teachers' | 'settings' | 'logs'>('overview');
  // THÊM MỚI: gộp các nút thao tác theo dòng (Gia hạn/Vĩnh viễn/Thay mặt/
  // Khoá) — trước đây xếp thành 1 hàng chữ dài trong bảng — vào 1 menu
  // "···" bấm mới hiện, chỉ 1 menu mở tại 1 thời điểm.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ teachers: TeacherAccountItem[] }>('/api/admin/teachers');
      setTeachers(data.teachers);
    } catch (err: any) {
      setError(err.message || 'Không tải được danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs() {
    setLogsLoading(true);
    try {
      const data = await apiFetch<{ logs: AdminAuditLogItem[] }>('/api/admin/audit-log');
      setLogs(data.logs);
    } catch {
      // Lỗi tải log không quan trọng bằng lỗi tải danh sách tài khoản chính
      // — im lặng bỏ qua, chỉ để mục nhật ký trống thay vì chặn cả trang.
    } finally {
      setLogsLoading(false);
    }
  }

  async function loadStats() {
    setStatsLoading(true);
    try {
      const data = await apiFetch<{ stats: AdminStats }>('/api/admin/stats');
      setStats(data.stats);
    } catch {
      // Tương tự log: lỗi thống kê không chặn phần chính của trang.
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadLogs();
    loadStats();
  }, []);

  // THÊM MỚI (Phần 1 — dọn trang admin): xóa 1 dòng nhật ký. Không cần
  // confirm — đây chỉ là log tra cứu nội bộ, xóa nhầm 1 dòng không ảnh
  // hưởng gì tới tài khoản/dữ liệu GV, khác hẳn với khóa/mở tài khoản.
  async function handleDeleteLog(id: string) {
    setLogDeletingId(id);
    const prev = logs;
    setLogs((cur) => cur.filter((l) => l._id !== id)); // xóa lạc quan, rollback nếu lỗi
    try {
      await apiFetch(`/api/admin/audit-log?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err: any) {
      setLogs(prev);
      alert(err.message || 'Không xóa được dòng nhật ký này.');
    } finally {
      setLogDeletingId(null);
    }
  }

  // THÊM MỚI: xóa toàn bộ nhật ký — có confirm vì không thể hoàn tác, nêu
  // rõ số dòng sẽ mất để admin cân nhắc trước khi bấm.
  async function handleClearAllLogs() {
    if (!window.confirm(`Xóa toàn bộ ${logs.length} dòng nhật ký thao tác? Không thể hoàn tác.`)) {
      return;
    }
    setLogsClearing(true);
    try {
      await apiFetch('/api/admin/audit-log?all=true', { method: 'DELETE' });
      setLogs([]);
      setShowAllLogs(false);
    } catch (err: any) {
      alert(err.message || 'Không xóa được nhật ký.');
    } finally {
      setLogsClearing(false);
    }
  }

  // THÊM MỚI: bấm vào 1 dòng GV để mở/đóng chi tiết lớp + đề thi của họ.
  async function handleToggleExpand(t: TeacherAccountItem) {
    if (expandedId === t._id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(t._id);
    if (detailCache[t._id]) return; // đã tải rồi, dùng lại cache
    setDetailLoadingId(t._id);
    setDetailError((prev) => ({ ...prev, [t._id]: '' }));
    try {
      const data = await apiFetch<AdminTeacherDetail>(`/api/admin/teachers/${t._id}/detail`);
      setDetailCache((prev) => ({ ...prev, [t._id]: data }));
    } catch (err: any) {
      setDetailError((prev) => ({ ...prev, [t._id]: err.message || 'Không tải được chi tiết tài khoản này.' }));
    } finally {
      setDetailLoadingId(null);
    }
  }

  // THÊM MỚI: danh sách hiển thị sau khi áp tìm kiếm + lọc trạng thái + sắp
  // xếp — tính lại mỗi lần render (danh sách GV nhỏ, không cần useMemo).
  const visibleTeachers = teachers
    .filter((t) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'created_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'classCount_desc':
          return b.classCount - a.classCount;
        case 'name_asc':
          return a.name.localeCompare(b.name, 'vi');
        case 'created_desc':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  // ĐỔI: trước đây "Thu hồi" gọi DELETE xoá cứng tài khoản (không mở lại
  // được). Giờ đổi thành khoá/mở lại (PATCH status) — giữ nguyên tài khoản
  // và lớp/đề thi họ đã tạo, chỉ chặn/gỡ chặn đăng nhập.
  async function handleToggleStatus(t: TeacherAccountItem) {
    setOpenMenuId(null);
    // THÊM MỚI (đóng/duyệt đăng ký): tài khoản 'pending' bấm nút này (khi
    // không dùng nút "Duyệt" riêng, xem handleApprove) coi như TỪ CHỐI —
    // chuyển thẳng sang 'suspended' luôn, không có trạng thái trung gian
    // nào khác để quay về 'active' ngoài việc admin tự mở lại sau.
    const wasPending = t.status === 'pending';
    const nextStatus = t.status === 'suspended' ? 'active' : 'suspended';
    const confirmMsg =
      nextStatus === 'suspended'
        ? wasPending
          ? `Từ chối tài khoản đang chờ duyệt "${t.name}" (${t.email})? Tài khoản này sẽ không đăng nhập được, có thể mở lại sau nếu cần.`
          : `Khoá tài khoản "${t.name}" (${t.email})? Tài khoản này sẽ không đăng nhập được nữa cho tới khi được mở lại. Lớp/đề thi họ đã tạo vẫn được giữ nguyên.`
        : `Mở lại tài khoản "${t.name}" (${t.email})? Tài khoản này sẽ đăng nhập được bình thường trở lại.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setUpdatingId(t._id);
    // SỬA (khiếu nại: "bấm nút gạt lâu mới đổi"): đổi nhãn nút (Khoá <->
    // Mở lại) NGAY sau khi xác nhận, không đợi API — giữ nguyên `updatingId`
    // để nút vẫn disable + hiện "Đang cập nhật..." trong lúc chờ, nhưng chữ
    // hiển thị sau khi xong không còn bị "giật" từ trạng thái cũ.
    setTeachers((prev) => prev.map((x) => (x._id === t._id ? { ...x, status: nextStatus } : x)));
    try {
      await apiFetch(`/api/admin/teachers/${t._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      // Vừa khoá/mở xong sẽ có 1 dòng log mới (xem PATCH route) — nạp lại
      // để hiện ngay, không cần đợi F5. Thẻ thống kê (số đang hoạt động/đã
      // khoá) cũng lệch đi 1 nên nạp lại luôn.
      loadLogs();
      loadStats();
    } catch (err: any) {
      // Rollback về status cũ — nút tự nhảy lại tên cũ để admin biết thao
      // tác KHÔNG thành công.
      setTeachers((prev) => prev.map((x) => (x._id === t._id ? { ...x, status: t.status } : x)));
      alert(err.message || 'Không cập nhật được trạng thái tài khoản này.');
    } finally {
      setUpdatingId(null);
    }
  }

  // THÊM MỚI (đóng/duyệt đăng ký): nút "Duyệt" riêng cho tài khoản
  // 'pending' — về API chỉ là PATCH status: 'active' giống nhánh "Mở lại
  // tài khoản" ở handleToggleStatus, nhưng tách hàm riêng để: (1) không
  // cần confirm rườm rà (duyệt là hành động tích cực, không cần cảnh báo
  // như khoá/từ chối), (2) hiện đúng chữ "Đang duyệt..." thay vì "Đang cập
  // nhật..." chung, cho rõ ràng hơn trong danh sách nhiều tài khoản chờ.
  async function handleApprove(t: TeacherAccountItem) {
    setOpenMenuId(null);
    setUpdatingId(t._id);
    setTeachers((prev) => prev.map((x) => (x._id === t._id ? { ...x, status: 'active' } : x)));
    try {
      await apiFetch(`/api/admin/teachers/${t._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      loadLogs();
      loadStats();
    } catch (err: any) {
      setTeachers((prev) => prev.map((x) => (x._id === t._id ? { ...x, status: t.status } : x)));
      alert(err.message || 'Không duyệt được tài khoản này.');
    } finally {
      setUpdatingId(null);
    }
  }

  // THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): admin gia hạn thêm 30
  // ngày hoặc chuyển hẳn sang vĩnh viễn — gọi PATCH đã hỗ trợ sẵn từ Phần
  // 2a (`planUpdate`). Cập nhật lại state danh sách trực tiếp từ response
  // trả về (planType/freeExpiresAt) thay vì gọi lại GET, cho nhanh; riêng
  // planStatus (isExpired/isExpiringSoon/daysRemaining) tính lại ở client
  // bằng cùng logic với computePlanStatus phía server, để cột "Gói dùng"
  // đổi đúng ngay lập tức không cần F5.
  function computeClientPlanStatus(
    planType: 'free' | 'lifetime',
    freeExpiresAt: string | null
  ): TeacherAccountItem['planStatus'] {
    const isLifetime = planType === 'lifetime';
    if (isLifetime || !freeExpiresAt) {
      return { planType, isLifetime, freeExpiresAt: null, isExpired: false, isExpiringSoon: false, daysRemaining: null };
    }
    const expiresAtMs = new Date(freeExpiresAt).getTime();
    const msRemaining = expiresAtMs - Date.now();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    const isExpired = msRemaining <= 0;
    // Ngưỡng "sắp hết hạn" chỉ dùng để tô màu ngay sau khi PATCH — không
    // quan trọng bằng số liệu thẻ thống kê (lấy từ loadStats(), có
    // FREE_EXPIRING_SOON_DAYS chuẩn từ server), nên dùng tạm mốc 5 ngày ở
    // đây (khớp FREE_EXPIRING_SOON_DAYS hiện tại) là đủ, sẽ được ghi đè
    // đúng lại sau lần load() kế tiếp (F5).
    const isExpiringSoon = !isExpired && daysRemaining <= 5;
    return { planType, isLifetime, freeExpiresAt, isExpired, isExpiringSoon, daysRemaining };
  }

  async function handlePlanUpdate(t: TeacherAccountItem, action: 'extend' | 'lifetime') {
    setOpenMenuId(null);
    // THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): cho nhập số ngày tùy ý
    // thay vì luôn cộng cứng 30 — API PATCH teachers/[id] (nhánh
    // planUpdate, action 'extend') đã sẵn sàng nhận `days` tùy ý từ Phần
    // 2a, chỉ còn thiếu chỗ nhập ở giao diện này. Dùng window.prompt cho
    // gọn (cùng cách window.confirm đang dùng ở nhánh 'lifetime' bên
    // dưới), không cần thêm ô input/State riêng cho từng dòng trong bảng.
    let extendDays = 30;
    if (action === 'extend') {
      const input = window.prompt(
        `Nhập số ngày muốn gia hạn cho tài khoản "${t.name}" (${t.email}):`,
        '30'
      );
      if (input === null) return; // bấm Hủy — không làm gì cả
      const parsed = Number(input.trim());
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        alert('Số ngày không hợp lệ — vui lòng nhập số nguyên dương.');
        return;
      }
      extendDays = parsed;
    }
    if (action === 'lifetime') {
      if (
        !window.confirm(
          `Chuyển tài khoản "${t.name}" (${t.email}) sang gói VĨNH VIỄN? Thao tác này không dễ đảo ngược qua giao diện.`
        )
      ) {
        return;
      }
    }
    setPlanUpdatingId(t._id);
    try {
      const body =
        action === 'extend'
          ? { planUpdate: { action: 'extend', days: extendDays } }
          : { planUpdate: { action: 'lifetime' } };
      const data = await apiFetch<{ ok: boolean; planType: 'free' | 'lifetime'; freeExpiresAt: string | null }>(
        `/api/admin/teachers/${t._id}`,
        { method: 'PATCH', body: JSON.stringify(body) }
      );
      setTeachers((prev) =>
        prev.map((x) =>
          x._id === t._id
            ? {
                ...x,
                planType: data.planType,
                freeExpiresAt: data.freeExpiresAt,
                planStatus: computeClientPlanStatus(data.planType, data.freeExpiresAt),
              }
            : x
        )
      );
      // Gia hạn/chuyển vĩnh viễn cũng sinh 1 dòng log mới (action:
      // 'update_plan', xem PATCH route) và làm lệch thẻ "Sắp hết hạn"/"Đã
      // hết hạn" — nạp lại cả hai, cùng cách handleToggleStatus đang làm.
      loadLogs();
      loadStats();
    } catch (err: any) {
      alert(err.message || 'Không cập nhật được gói dùng của tài khoản này.');
    } finally {
      setPlanUpdatingId(null);
    }
  }

  // THÊM MỚI: admin "Đăng nhập thay mặt" 1 GV — bấm xong đưa admin thẳng
  // vào giao diện của GV đó (banner cảnh báo hiện ở đầu trang, xem Page()).
  // Tải lại CẢ TRANG (window.location.href) sau khi thành công, cùng lý do
  // với handleExitImpersonation: tránh lẫn state/dữ liệu giữa 2 tài khoản.
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  async function handleImpersonate(t: TeacherAccountItem) {
    setOpenMenuId(null);
    if (
      !window.confirm(
        `Đăng nhập thay mặt "${t.name}" (${t.email})? Bạn sẽ thấy đúng giao diện của GV này trong tối đa 60 phút. Mọi thao tác được ghi vào Nhật ký.`
      )
    ) {
      return;
    }
    setImpersonatingId(t._id);
    try {
      const res = await fetch(`/api/admin/teachers/${t._id}/impersonate`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Không thực hiện được, vui lòng thử lại.');
        setImpersonatingId(null);
        return;
      }
      window.location.href = '/';
    } catch {
      alert('Không thực hiện được, vui lòng thử lại.');
      setImpersonatingId(null);
    }
  }

  // THÊM MỚI (thiết kế lại trang Quản trị): 2 thẻ tổng hợp nhanh cần chú ý
  // (sắp hết hạn / đã hết hạn) — tính từ stats đã tải, dùng cho banner nhắc
  // ở mục Tổng quan, giúp admin biết ngay cần vào tab "Tài khoản GV" xử lý.
  const attentionCount = (stats?.expiringSoonCount ?? 0) + (stats?.expiredFreeCount ?? 0);

  // THÊM MỚI (đóng/duyệt đăng ký): tương tự attentionCount ở trên nhưng
  // riêng cho tài khoản đang chờ duyệt — tách riêng vì mức độ khẩn khác
  // nhau (chờ duyệt nghĩa là có GV KHÔNG vào được app, cần xử lý sớm hơn
  // là sắp hết hạn dùng thử).
  const pendingAttentionCount = stats?.pendingCount ?? 0;

  const SECTIONS = [
    { key: 'overview' as const, label: 'Tổng quan', icon: <GaugeIcon className="w-4 h-4" /> },
    { key: 'teachers' as const, label: 'Tài khoản GV', icon: <UsersIcon className="w-4 h-4" />, count: teachers.length },
    { key: 'settings' as const, label: 'Cấu hình', icon: <KeyIcon className="w-4 h-4" /> },
    { key: 'logs' as const, label: 'Nhật ký', icon: <ClockIcon className="w-4 h-4" />, count: logs.length },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight inline-flex items-center gap-2">
          <ShieldIcon className="w-6 h-6 text-blue-600" /> Quản trị hệ thống
        </h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Số liệu tổng quan, tài khoản giáo viên đã đăng ký, cấu hình trợ lý AI và nhật ký thao tác — chế độ đăng ký hiện tại xem ở mục &quot;Cấu hình&quot;.
      </p>

      {/* THÊM MỚI: thanh điều hướng con — thay cho việc dồn hết mọi khối
          (thống kê, cấu hình AI, bảng tài khoản, nhật ký) vào 1 trang cuộn
          dài như trước, giờ mỗi lúc chỉ hiện đúng 1 mục, giống cách các
          trang quản trị chuyên nghiệp thường tổ chức. */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              section === s.key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
            }`}
          >
            {s.icon}
            {s.label}
            {typeof s.count === 'number' && s.count > 0 && (
              <span
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  section === s.key ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {s.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ===== MỤC: TỔNG QUAN ===== */}
      {section === 'overview' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: 'Giáo viên',
                value: stats?.teacherCount,
                sub: stats ? `${stats.activeTeacherCount} đang hoạt động` : undefined,
                icon: <UsersIcon className="w-5 h-5 text-blue-600" />,
              },
              { label: 'Đã khoá', value: stats?.suspendedCount, icon: <ShieldIcon className="w-5 h-5 text-red-500" /> },
              {
                label: 'Chờ duyệt',
                value: stats?.pendingCount,
                icon: <ClockIcon className="w-5 h-5 text-blue-500" />,
              },
              { label: 'GV mới (7 ngày)', value: stats?.newTeachersThisWeek, icon: <UsersIcon className="w-5 h-5 text-emerald-600" /> },
              { label: 'Lớp học', value: stats?.classCount, icon: <FolderIcon className="w-5 h-5 text-amber-500" /> },
              {
                label: 'Đề thi',
                value: stats?.examCount,
                sub: stats ? `${stats.publishedExamCount} đã xuất bản` : undefined,
                icon: <FileIcon className="w-5 h-5 text-blue-600" />,
              },
              { label: 'Bài đã nộp', value: stats?.submissionCount, icon: <ChartBarIcon className="w-5 h-5 text-blue-600" /> },
              { label: 'Sắp hết hạn', value: stats?.expiringSoonCount, icon: <ClockIcon className="w-5 h-5 text-amber-600" /> },
              { label: 'Đã hết hạn', value: stats?.expiredFreeCount, icon: <ClockIcon className="w-5 h-5 text-red-500" /> },
            ].map((card) => (
              <div key={card.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">{card.label}</p>
                  {card.icon}
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? (
                    <span className="inline-block w-8 h-6 bg-gray-100 rounded animate-pulse" />
                  ) : (
                    card.value ?? 0
                  )}
                </p>
                {card.sub && !statsLoading && <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>}
              </div>
            ))}
          </div>

          {/* THÊM MỚI (đóng/duyệt đăng ký): banner nhắc khi có tài khoản
              đang chờ duyệt — đặt TRƯỚC banner sắp hết hạn vì mức độ khẩn
              cao hơn (GV này hoàn toàn chưa vào được app, không phải chỉ
              sắp hết hạn). */}
          {!statsLoading && pendingAttentionCount > 0 && (
            <button
              onClick={() => {
                setSection('teachers');
                setStatusFilter('pending');
              }}
              className="w-full text-left bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-xl px-4 py-3 mt-3 hover:bg-blue-100 transition-colors inline-flex items-center justify-between gap-3"
            >
              <span>
                Có <b>{pendingAttentionCount}</b> tài khoản đăng ký mới đang chờ duyệt — mở mục{' '}
                <b>&quot;Tài khoản GV&quot;</b> để duyệt.
              </span>
              <ChevronRightIcon className="w-4 h-4 shrink-0" />
            </button>
          )}

          {/* THÊM MỚI: banner nhắc nhanh khi có tài khoản sắp/đã hết hạn —
              bấm để nhảy thẳng sang mục "Tài khoản GV" xử lý. */}
          {!statsLoading && attentionCount > 0 && (
            <button
              onClick={() => setSection('teachers')}
              className="w-full text-left bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mt-3 hover:bg-amber-100 transition-colors inline-flex items-center justify-between gap-3"
            >
              <span>
                Có <b>{attentionCount}</b> tài khoản sắp hoặc đã hết hạn dùng thử — mở mục{' '}
                <b>&quot;Tài khoản GV&quot;</b> để gia hạn hoặc chuyển vĩnh viễn.
              </span>
              <ChevronRightIcon className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      )}

      {/* ===== MỤC: CẤU HÌNH AI ===== */}
      {section === 'settings' && <AiSettingsPanel />}

      {/* ===== MỤC: TÀI KHOẢN GV ===== */}
      {section === 'teachers' && (
        <div>
          {/* THÊM MỚI: tìm kiếm theo tên/email + lọc theo trạng thái + sắp
              xếp — xử lý client-side (xem visibleTeachers), đủ dùng ở quy mô
              hiện tại, không cần phân trang/lọc phía server. */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc email..."
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="suspended">Đã khoá</option>
              <option value="pending">Chờ duyệt</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created_desc">Đăng ký mới nhất</option>
              <option value="created_asc">Đăng ký cũ nhất</option>
              <option value="classCount_desc">Số lớp nhiều nhất</option>
              <option value="name_asc">Tên A-Z</option>
            </select>
          </div>

          {loading && <p className="text-sm text-gray-400">Đang tải danh sách...</p>}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
          )}

          {!loading && !error && (
            // SỬA (thiết kế lại): bỏ overflow-hidden ở khung ngoài — trước
            // đây dùng để bo góc bảng, nhưng lại cắt mất menu "···" thả
            // xuống của dòng cuối cùng. Giờ bo góc trực tiếp ở 2 ô đầu/cuối
            // của hàng tiêu đề (nền xám, tương phản với khung trắng) — các
            // hàng dữ liệu vốn nền trắng giống khung ngoài nên không cần bo,
            // không bị lộ góc vuông.
            <div className="bg-white border border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
                    <th className="px-4 py-3 font-medium rounded-tl-xl">Giáo viên</th>
                    <th className="px-4 py-3 font-medium">Số lớp</th>
                    <th className="px-4 py-3 font-medium">Ngày đăng ký</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 font-medium">Gói dùng</th>
                    <th className="px-4 py-3 font-medium text-right rounded-tr-xl">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTeachers.map((t) => {
                    const isExpanded = expandedId === t._id;
                    const detail = detailCache[t._id];
                    const isMenuOpen = openMenuId === t._id;
                    return (
                      <Fragment key={t._id}>
                        <tr
                          onClick={() => handleToggleExpand(t)}
                          className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50"
                        >
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2.5">
                              <span
                                className={`inline-block text-gray-300 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                              >
                                ▶
                              </span>
                              <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                                {initials(t.name)}
                              </span>
                              <span className="min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-gray-800 font-medium truncate">{t.name}</span>
                                  {isAdminEmail(t.email) && (
                                    <span className="inline-block text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">Quản trị</span>
                                  )}
                                </span>
                                <span className="block text-xs text-gray-400 truncate">{t.email}</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{t.classCount}</td>
                          <td className="px-4 py-3 text-gray-500">{new Date(t.created_at).toLocaleDateString('vi-VN')}</td>
                          <td className="px-4 py-3">
                            {t.status === 'suspended' ? (
                              <span className="inline-block text-[11px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">Đã khoá</span>
                            ) : t.status === 'pending' ? (
                              <span className="inline-block text-[11px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">Chờ duyệt</span>
                            ) : (
                              <span className="inline-block text-[11px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">Đang hoạt động</span>
                            )}
                          </td>
                          {/* THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): đọc
                              planStatus đã tính sẵn từ GET /api/admin/teachers
                              (Phần 2a), không tự tính lại ngày tháng ở đây. */}
                          <td className="px-4 py-3">
                            {/* SỬA: planStatus có thể undefined nếu API thiếu
                                trường này cho bản ghi — dùng biến an toàn ps
                                thay vì truy cập trực tiếp t.planStatus.X để
                                tránh crash "Cannot read properties of undefined". */}
                            {(() => {
                              const ps = t.planStatus;
                              if (!ps) {
                                return <span className="text-gray-400">Không rõ</span>;
                              }
                              return ps.isLifetime ? (
                                <span className="inline-block text-[11px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                                  Vĩnh viễn
                                </span>
                              ) : ps.daysRemaining === null ? (
                                <span className="text-gray-400">Không giới hạn</span>
                              ) : ps.isExpired ? (
                                <span className="inline-block text-[11px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                                  Đã hết hạn
                                </span>
                              ) : (
                                <span
                                  className={
                                    ps.isExpiringSoon
                                      ? 'inline-block text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded'
                                      : 'text-gray-600'
                                  }
                                >
                                  Còn {ps.daysRemaining} ngày
                                </span>
                              );
                            })()}
                          </td>
                          {/* THÊM MỚI (thiết kế lại): gộp toàn bộ thao tác
                              (Gia hạn/Vĩnh viễn/Thay mặt/Khoá — trước đây xếp
                              thành 1 hàng chữ dài) vào 1 menu "···" bấm mới
                              hiện — đỡ rối mắt, đúng kiểu bảng quản trị
                              chuyên nghiệp. */}
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {!isAdminEmail(t.email) && (
                              <div className="relative inline-block text-left">
                                <IconButton
                                  onClick={() => setOpenMenuId(isMenuOpen ? null : t._id)}
                                  icon={<DotsVerticalIcon className="w-4 h-4" />}
                                  title="Thao tác"
                                  hoverClass="hover:text-gray-700 hover:bg-gray-100"
                                />
                                {isMenuOpen && (
                                  <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-20">
                                    {/* THÊM MỚI (đóng/duyệt đăng ký): nút
                                        "Duyệt" — CHỈ hiện với tài khoản
                                        'pending', đặt lên đầu menu vì đây
                                        là thao tác cần làm sớm nhất với
                                        tài khoản này. */}
                                    {t.status === 'pending' && (
                                      <button
                                        onClick={() => handleApprove(t)}
                                        disabled={updatingId === t._id}
                                        className="w-full text-left px-3.5 py-2.5 text-sm text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors font-semibold"
                                      >
                                        {updatingId === t._id ? 'Đang duyệt...' : 'Duyệt tài khoản'}
                                      </button>
                                    )}
                                    {!t.planStatus?.isLifetime && (
                                      <button
                                        onClick={() => handlePlanUpdate(t, 'extend')}
                                        disabled={planUpdatingId === t._id}
                                        className="w-full text-left px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                      >
                                        {/* SỬA (Phần 2b): bỏ số "30" cứng
                                            trong nhãn — số ngày giờ nhập tùy
                                            ý qua prompt lúc bấm (xem
                                            handlePlanUpdate). */}
                                        {planUpdatingId === t._id ? 'Đang cập nhật...' : 'Gia hạn thêm ngày...'}
                                      </button>
                                    )}
                                    {!t.planStatus?.isLifetime && (
                                      <button
                                        onClick={() => handlePlanUpdate(t, 'lifetime')}
                                        disabled={planUpdatingId === t._id}
                                        className="w-full text-left px-3.5 py-2.5 text-sm text-purple-600 hover:bg-purple-50 border-t border-gray-100 disabled:opacity-50 transition-colors"
                                      >
                                        {planUpdatingId === t._id ? 'Đang cập nhật...' : 'Chuyển vĩnh viễn'}
                                      </button>
                                    )}
                                    {/* SỬA (đóng/duyệt đăng ký): chỉ cho
                                        "Đăng nhập thay mặt" với tài khoản
                                        ĐANG hoạt động — trước đây là
                                        `!== 'suspended'` nên vô tình cũng
                                        cho phép với tài khoản 'pending' còn
                                        chưa được duyệt, không hợp lý. */}
                                    {t.status === 'active' && (
                                      <button
                                        onClick={() => handleImpersonate(t)}
                                        disabled={impersonatingId === t._id}
                                        className="w-full text-left px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-t border-gray-100 disabled:opacity-50 transition-colors"
                                      >
                                        {impersonatingId === t._id ? 'Đang vào...' : 'Đăng nhập thay mặt'}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleToggleStatus(t)}
                                      disabled={updatingId === t._id}
                                      className={`w-full text-left px-3.5 py-2.5 text-sm border-t border-gray-100 disabled:opacity-50 transition-colors ${
                                        t.status === 'suspended'
                                          ? 'text-green-600 hover:bg-green-50'
                                          : 'text-red-600 hover:bg-red-50'
                                      }`}
                                    >
                                      {/* SỬA (đóng/duyệt đăng ký): tài khoản
                                          'pending' bấm nút này là TỪ CHỐI
                                          (khoá luôn), không phải "Khoá tài
                                          khoản" như tài khoản đang hoạt
                                          động — chữ khác để admin không
                                          nhầm 2 tình huống. */}
                                      {updatingId === t._id
                                        ? 'Đang cập nhật...'
                                        : t.status === 'suspended'
                                        ? 'Mở lại tài khoản'
                                        : t.status === 'pending'
                                        ? 'Từ chối tài khoản'
                                        : 'Khoá tài khoản'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-gray-100 last:border-0 bg-gray-50/60">
                            <td colSpan={6} className="px-4 py-4">
                              {detailLoadingId === t._id && (
                                <p className="text-sm text-gray-400">Đang tải chi tiết...</p>
                              )}
                              {detailError[t._id] && (
                                <p className="text-sm text-red-600">{detailError[t._id]}</p>
                              )}
                              {detail && (
                                <div className="grid sm:grid-cols-2 gap-6">
                                  <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                                      Lớp học ({detail.classes.length})
                                    </h4>
                                    {detail.classes.length === 0 ? (
                                      <p className="text-sm text-gray-400">Chưa tạo lớp nào.</p>
                                    ) : (
                                      <ul className="space-y-1.5">
                                        {detail.classes.map((c) => (
                                          <li key={c._id} className="text-sm text-gray-700 flex items-center justify-between gap-3">
                                            <span>
                                              {c.name} <span className="text-gray-400">· {c.schoolYear}</span>
                                            </span>
                                            <span className="text-gray-500 shrink-0">{c.studentCount} học sinh</span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                                      Đề thi ({detail.exams.length}) · {detail.submissionCount} bài đã nộp
                                    </h4>
                                    {detail.exams.length === 0 ? (
                                      <p className="text-sm text-gray-400">Chưa tạo đề thi nào.</p>
                                    ) : (
                                      <ul className="space-y-1.5">
                                        {detail.exams.map((ex) => (
                                          <li key={ex._id} className="text-sm text-gray-700 flex items-center justify-between gap-3">
                                            <span className="truncate">{ex.title}</span>
                                            {ex.is_published ? (
                                              <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded shrink-0">Đã xuất bản</span>
                                            ) : (
                                              <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">Nháp</span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {teachers.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-400">Chưa có tài khoản nào đăng ký.</div>
              )}
              {teachers.length > 0 && visibleTeachers.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-400">
                  Không tìm thấy tài khoản nào khớp với bộ lọc hiện tại.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== MỤC: NHẬT KÝ ===== */}
      {section === 'logs' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Nhật ký thao tác gần đây{!logsLoading && logs.length > 0 ? ` (${logs.length})` : ''}
            </h3>
            {!logsLoading && logs.length > 0 && (
              <button
                onClick={handleClearAllLogs}
                disabled={logsClearing}
                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {logsClearing ? 'Đang xóa...' : 'Xóa tất cả'}
              </button>
            )}
          </div>
          {logsLoading && <p className="text-sm text-gray-400">Đang tải nhật ký...</p>}
          {!logsLoading && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {logs.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">Chưa có thao tác nào được ghi lại.</div>
              ) : (
                <>
                  <ul className="divide-y divide-gray-100">
                    {(showAllLogs ? logs : logs.slice(0, LOG_PREVIEW_COUNT)).map((l) => (
                      <li
                        key={l._id}
                        className="group px-4 py-2.5 text-sm text-gray-600 flex items-center gap-3"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" aria-hidden="true" />
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-gray-800">{l.adminEmail}</span> {l.detail.toLowerCase()}{' '}
                          <span className="font-medium text-gray-800">{l.targetEmail}</span>
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-gray-400">
                            {new Date(l.created_at).toLocaleString('vi-VN')}
                          </span>
                          <button
                            onClick={() => handleDeleteLog(l._id)}
                            disabled={logDeletingId === l._id}
                            title="Xóa dòng này"
                            className="text-xs text-gray-300 hover:text-red-600 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {logDeletingId === l._id ? '...' : 'Xóa'}
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {logs.length > LOG_PREVIEW_COUNT && (
                    <button
                      onClick={() => setShowAllLogs((v) => !v)}
                      className="w-full text-xs font-medium text-gray-500 hover:text-gray-700 py-2 border-t border-gray-100"
                    >
                      {showAllLogs ? 'Thu gọn' : `Xem thêm ${logs.length - LOG_PREVIEW_COUNT} dòng`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HomeTab({ onGoTo, teacher }: { onGoTo: (tab: MainTab) => void; teacher: CurrentTeacher }) {
  const [classes, setClasses] = useState<ClassItem[]>([]);

  // THÊM MỚI (GV yêu cầu 29-8: "muốn nhìn 1 danh sách biết HS nào đang
  // online để thi", thay vì phải bấm vào từng lớp/từng đề mới thấy trạng
  // thái "đang thi" của từng em). Gọi API mới /api/submissions/live, gom sẵn
  // TOÀN BỘ HS đang thi trên mọi lớp/mọi đề của GV này thành 1 danh sách
  // phẳng. Tự làm mới mỗi 20 giây (polling đơn giản, không cần WebSocket) để
  // GV không phải bấm F5 tay mới thấy cập nhật khi có em bắt đầu/nộp bài.
  const [liveStudents, setLiveStudents] = useState<LiveStudent[]>([]);
  const [liveError, setLiveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadLive() {
      try {
        const data = await apiFetch<{ liveStudents: LiveStudent[] }>('/api/submissions/live');
        if (!cancelled) {
          setLiveStudents(data.liveStudents);
          setLiveError('');
        }
      } catch {
        // Giống thống kê lớp bên dưới — lỗi ở widget phụ này không cần chặn
        // cả trang chủ, chỉ lặng lẽ giữ danh sách cũ (nếu có) tới lần thử lại
        // kế tiếp.
        if (!cancelled) setLiveError('Không tải được danh sách đang thi.');
      }
    }
    loadLive();
    const interval = setInterval(loadLive, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ classes: ClassItem[] }>('/api/classes');
        if (!cancelled) setClasses(data.classes);
      } catch {
        // Trang chủ chỉ hiện thống kê phụ — lỗi ở đây không cần chặn cả trang,
        // im lặng bỏ qua, GV vẫn thấy đủ số liệu khi vào thẳng tab Quản lý lớp.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);

  // "Lượt đã thi" cần API submissions (Bước 2/3, chưa làm) — tạm ẩn số liệu
  // này khỏi thẻ thống kê thay vì hiện số giả bằng 0 gây hiểu nhầm là "chưa
  // ai thi" trong khi thực ra tính năng giao đề còn chưa tồn tại.
  const STATS: { label: string; value: number; icon: ReactNode }[] = [
    { label: 'Lớp đang quản lý', value: classes.length, icon: <UsersIcon className="w-6 h-6 text-blue-600" /> },
    { label: 'Học sinh', value: totalStudents, icon: <CapIcon className="w-6 h-6 text-blue-600" /> },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-1 inline-flex items-center gap-2">
        Chào {teacher.name} <BouquetIcon className="w-6 h-6 text-blue-600" />
      </h2>
      <p className="text-sm text-gray-500 mb-7">Tổng quan nhanh — bấm vào 1 mục để đi tới tab tương ứng.</p>

      <div className="grid grid-cols-2 gap-3 mb-7">
        {STATS.map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xl mb-1">{s.icon}</p>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* THÊM MỚI: danh sách "đang thi" — xem ghi chú ở khai báo state
          liveStudents phía trên. Chỉ hiện khối này khi có ít nhất 1 em đang
          thi, tránh chiếm chỗ trang chủ lúc không ai làm bài. */}
      {liveStudents.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-7">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <p className="font-bold text-gray-900">Đang thi ({liveStudents.length})</p>
          </div>
          <ul className="divide-y divide-gray-100">
            {liveStudents.map((s) => (
              <li key={`${s.studentId}-${s.examId}`} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{s.studentName}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {s.className} · {s.examTitle}
                  </p>
                </div>
                {s.started_at && (
                  <p className="text-xs text-gray-400 shrink-0">
                    Bắt đầu: {new Date(s.started_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {liveError && liveStudents.length === 0 && (
        <p className="text-xs text-red-500 mb-7">{liveError}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* SỬA (Phần 7): thẻ này trước trỏ sang tab 'classes' ("Quản lý
            lớp") — tab đó đã bị ẩn khỏi menu điều hướng nên đổi đích đến
            sang 'khoi' (Khối đã thay thế đủ tính năng: danh sách lớp, học
            sinh, đề đã giao...), đồng thời đổi nhãn/icon cho khớp mục
            "Khối" ở menu để GV không bị lạc hướng khi bấm vào từ Trang chủ.
            Không xoá thẻ này, chỉ đổi đích đến — đúng nguyên tắc của Phần 7. */}
        <button
          onClick={() => onGoTo('khoi')}
          className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:shadow-md hover:border-blue-300 transition-all"
        >
          <LayersIcon className="w-7 h-7 text-blue-600 mb-2" />
          <p className="font-bold text-gray-900">Quản lí Khối-lớp</p>
          <p className="text-xs text-gray-400 mt-1">Danh sách lớp, học sinh, đề đã giao</p>
        </button>
        <button
          onClick={() => onGoTo('exams')}
          className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:shadow-md hover:border-blue-300 transition-all"
        >
          <FileIcon className="w-6 h-6 mb-2 text-blue-600" />
          <p className="font-bold text-gray-900">Đề thi</p>
          <p className="text-xs text-gray-400 mt-1">Tạo đề, soát lỗi, xuất bản lấy link</p>
        </button>
      </div>
    </div>
  );
}

// Khu vực tài khoản dưới cùng sidebar — hiện tên GV thật (lấy từ session) +
// menu đăng xuất. Đăng xuất gọi API xóa cookie thật, KHÔNG chỉ ẩn UI.
function AccountMenu({ teacher, onLogout }: { teacher: CurrentTeacher; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [loggingOutEverywhere, setLoggingOutEverywhere] = useState(false);

  // THÊM MỚI (phương án dự phòng khi tài khoản bị chiếm): huỷ NGAY mọi
  // phiên đăng nhập khác của chính tài khoản này (kể cả 1 phiên bị đánh cắp
  // đang dùng ở nơi khác), không cần biết/đổi mật khẩu. Đặc biệt quan trọng
  // với tài khoản admin (hệ thống hiện chỉ có 1 admin) — dùng ngay khi nghi
  // ngờ có ai khác đang đăng nhập bằng tài khoản của mình.
  async function handleLogoutEverywhere() {
    if (
      !window.confirm(
        'Đăng xuất khỏi TẤT CẢ thiết bị đang đăng nhập bằng tài khoản này, kể cả thiết bị hiện tại bạn đang dùng?\n\nBạn sẽ cần đăng nhập lại bằng mật khẩu hiện tại. Dùng khi nghi ngờ tài khoản bị lộ.'
      )
    ) {
      return;
    }
    setLoggingOutEverywhere(true);
    try {
      const res = await fetch('/api/auth/logout-everywhere', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Không thực hiện được, vui lòng thử lại.');
        return;
      }
      onLogout(); // dùng lại luồng đăng xuất sẵn có để đưa về /login
    } catch {
      alert('Không thực hiện được, vui lòng thử lại.');
    } finally {
      setLoggingOutEverywhere(false);
    }
  }

  return (
    <div className="relative border-t border-gray-100 px-3 py-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <div className="w-7 h-7 rounded-full border-2 border-blue-500 text-blue-600 flex items-center justify-center text-[11px] font-semibold shrink-0">
          {initials(teacher.name)}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-gray-800 truncate">{teacher.name}</p>
          <p className="text-xs text-gray-400 truncate">{teacher.email}</p>
        </div>
        <span className="text-gray-300 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <button
            onClick={onLogout}
            className="w-full text-left px-3.5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5"><LogoutIcon className="w-4 h-4" /> Đăng xuất</span>
          </button>
          <button
            onClick={handleLogoutEverywhere}
            disabled={loggingOutEverywhere}
            className="w-full text-left px-3.5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 border-t border-gray-100 disabled:opacity-50 transition-colors"
          >
            {loggingOutEverywhere ? 'Đang xử lý...' : 'Đăng xuất tất cả thiết bị'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const router = useRouter();

  // THÊM MỚI: cảnh báo "đang mở bằng trình duyệt trong Zalo/Messenger/
  // Facebook..." cho app chính của GV — cùng cơ chế với trang học sinh
  // (/thi/[examId]), chỉ khác lời chào và lý do. Gọi 1 lần ở đây là đủ,
  // banner theo GV xuyên suốt mọi tab (home/classes/exams).
  useInAppBrowserWarning({
    greeting: 'Quý Thầy, Cô',
    reasonText: 'app hiển thị tốt trên Chrome',
  });

  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [teacher, setTeacher] = useState<CurrentTeacher | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  // THÊM MỚI (bắt buộc xác nhận email): trạng thái nút "Gửi lại email xác
  // nhận" ở màn chặn bên dưới — resendVerifyMsg dùng chung cho cả thông báo
  // thành công lẫn lỗi (phân biệt bằng resendVerifyError).
  const [resendingVerify, setResendingVerify] = useState(false);
  const [resendVerifyMsg, setResendVerifyMsg] = useState('');
  const [resendVerifyError, setResendVerifyError] = useState(false);
  // THÊM MỚI (mạo danh): có giá trị khi phiên hiện tại là admin đang "xem
  // thay mặt" 1 GV — điều khiển hiện/ẩn banner cảnh báo ở đầu trang.
  const [impersonating, setImpersonating] = useState<ImpersonatingInfo>(null);
  const [exitingImpersonation, setExitingImpersonation] = useState(false);
  // THÊM MỚI (khiếu nại: "muốn kiểu Azota — bấm icon 4 gạch mới hiện cột
  // trái chứa tab, tiện nhất là trên điện thoại"): TRƯỚC ĐÂY cột trái luôn
  // hiện cố định (chiếm sẵn 15rem bề ngang) — trên điện thoại (màn hình hẹp)
  // phần nội dung chính bị ép co lại rất chật. Giờ: MÀN HÌNH HẸP (dưới
  // breakpoint sm) ẩn hẳn cột trái, thay bằng 1 thanh trên cùng có nút hamburger
  // (☰) — bấm vào mới HIỆN cột trái dạng lớp phủ trượt ra từ bên trái (đúng
  // kiểu Azota ở ảnh chụp màn hình). MÀN HÌNH RỘNG (từ sm trở lên, máy
  // tính/tablet) vẫn giữ cột trái cố định như cũ vì ở đó đủ chỗ, không cần
  // ẩn/hiện.
  const [navOpen, setNavOpen] = useState(false);

  // Đọc query param "?tab=..." 1 LẦN lúc trang vừa tải xong để có thể trỏ
  // thẳng về đúng khu vực (vd link ngoài trỏ "/?tab=khoi") thay vì luôn rơi
  // về "Trang chủ". Dùng window.location trực tiếp (không dùng
  // useSearchParams của next/navigation để khỏi phải bọc thêm <Suspense>),
  // rồi dọn param khỏi URL bằng history.replaceState để bấm F5 sau đó không
  // bị nhảy tab lại.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const validTabs: MainTab[] = ['home', 'classes', 'khoi', 'exams', 'admin'];
    if (tab && (validTabs as string[]).includes(tab)) {
      setActiveTab(tab as MainTab);
      params.delete('tab');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  // SỬA (khiếu nại: "dùng điện thoại ở chế độ NGANG thì icon 📱 mô phỏng
  // điện thoại vẫn hiện ra, vô lý — icon đó chỉ nên hiện trên máy tính"):
  // TRƯỚC ĐÂY icon này ẩn/hiện chỉ dựa vào ĐỘ RỘNG màn hình (class Tailwind
  // `hidden sm:flex`, breakpoint 640px) — nhưng điện thoại xoay ngang cũng
  // thường rộng hơn 640px (vd 800-900px), nên bị tính nhầm là "màn hình
  // rộng kiểu máy tính" dù vẫn đang cầm điện thoại thật. Đổi sang phát hiện
  // đúng LOẠI THIẾT BỊ (có chuột con trỏ mảnh + có hover hay không) bằng
  // matchMedia('(pointer: fine) and (hover: hover)') — chuột máy tính mới
  // thoả cả 2 điều kiện này; điện thoại/tablet cảm ứng (dù xoay ngang hay
  // dọc, dù màn hình rộng bao nhiêu) luôn có pointer thô (coarse) nên không
  // bao giờ thoả, icon sẽ không hiện. Mặc định false (ẩn) tới khi xác định
  // xong, để tránh nháy hiện icon 1 khắc trên điện thoại trước khi kịp ẩn.
  const [isDesktopPointer, setIsDesktopPointer] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: fine) and (hover: hover)');
    // SỬA (kiểm tra lại khiếu nại "icon điện thoại vẫn lỡ hiện trên điện
    // thoại"): thêm lớp chặn thứ 2 — kiểm tra thẳng khả năng CHẠM
    // ('ontouchstart' in window hoặc navigator.maxTouchPoints > 0). Một số
    // điện thoại/trình duyệt di động (đặc biệt vài bản Android WebView cũ)
    // báo sai `(pointer: fine)` hoặc `(hover: hover)`, nhưng KHÔNG có thiết
    // bị nào vừa cảm ứng vừa được coi là "máy tính thật" cho mục đích icon
    // này — nên hễ phát hiện có khả năng chạm là ẩn icon ngay, bất kể kết
    // quả matchMedia thế nào.
    const hasTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator?.maxTouchPoints || 0) > 0);
    const evaluate = (pointerFine: boolean) => setIsDesktopPointer(pointerFine && !hasTouch);
    evaluate(mq.matches);
    const handler = (e: MediaQueryListEvent) => evaluate(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // SỬA (khiếu nại: "cột trái Xem đề chật quá khi xoay ngang điện thoại"):
  // cột trái CỐ ĐỊNH (<aside> điều hướng chính) đang ẩn/hiện chỉ dựa vào
  // breakpoint `sm` (≈640px chiều RỘNG) — điện thoại xoay ngang thường có
  // chiều rộng > 640px (vd 800-900px) nên cột trái bị hiện nhầm, chiếm mất
  // ~240px trong màn hình vốn đã thấp, làm nội dung "Xem đề" (cần rộng để
  // hiện công thức/hình TikZ) bị bóp chật lại.
  // Không dùng isDesktopPointer (pointer:fine) ở trên cho việc này vì nó
  // sẽ ẩn cột trái luôn cả với TABLET cảm ứng (iPad...) — vốn vẫn muốn giữ
  // cột trái khi đủ rộng (đúng ý định gốc "sm trở lên = máy tính/tablet").
  // Thay vào đó dùng CHIỀU CAO viewport: điện thoại xoay ngang luôn có
  // chiều cao rất thấp (≤ 500px với hầu hết điện thoại hiện nay, kể cả
  // phablet), trong khi tablet xoay ngang vẫn cao hơn hẳn (iPad ≥ 744px)
  // — nên max-height:500px phân biệt được "điện thoại nằm ngang" khỏi
  // "tablet nằm ngang" mà không cần biết kích thước vật lý thật của máy.
  // Kèm điều kiện có cảm ứng (hasTouch) để không ảnh hưởng cửa sổ trình
  // duyệt desktop bị kéo thấp (rất hiếm khi < 500px chiều cao, nhưng vẫn
  // phòng hờ).
  const [isPhoneLandscape, setIsPhoneLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const hasTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator?.maxTouchPoints || 0) > 0);
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
    const evaluate = (matches: boolean) => setIsPhoneLandscape(hasTouch && matches);
    evaluate(mq.matches);
    const handler2 = (e: MediaQueryListEvent) => evaluate(e.matches);
    mq.addEventListener('change', handler2);
    return () => mq.removeEventListener('change', handler2);
  }, []);

  // Lúc mở app: hỏi server "hiện có ai đăng nhập không" (đọc cookie session).
  // Nếu có → vào thẳng dashboard, không cần nhập lại email/mật khẩu (đúng
  // yêu cầu "chưa đăng xuất thì lần sau vào thẳng"). Nếu không → đẩy sang
  // trang /login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (cancelled) return;
        if (data.teacher) {
          setTeacher(data.teacher);
          setImpersonating(data.impersonating || null);
        } else {
          router.replace('/login');
        }
      } catch {
        if (!cancelled) router.replace('/login');
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  // THÊM MỚI (bắt buộc xác nhận email): gọi route đã có sẵn từ trước
  // (resend-verification, xem auth/register lúc đăng ký) — chỉ thêm phần
  // UI gọi nó từ màn chặn bên dưới.
  async function handleResendVerification() {
    setResendingVerify(true);
    setResendVerifyMsg('');
    setResendVerifyError(false);
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setResendVerifyError(true);
        setResendVerifyMsg(data.error || 'Không gửi lại được, thử lại sau.');
      } else {
        setResendVerifyMsg(data.message || 'Đã gửi lại email xác nhận.');
      }
    } catch {
      setResendVerifyError(true);
      setResendVerifyMsg('Không gửi lại được, thử lại sau.');
    } finally {
      setResendingVerify(false);
    }
  }

  // THÊM MỚI (mạo danh): thoát phiên "xem thay mặt", khôi phục lại phiên
  // admin gốc. Cố tình TẢI LẠI CẢ TRANG (window.location.href) thay vì chỉ
  // gọi lại /api/auth/me — toàn bộ state của mọi tab (ClassesTab, ExamBuilder...)
  // đang mount sẵn có thể đang chứa dữ liệu của GV vừa bị mạo danh, tải lại
  // trang là cách chắc chắn nhất để không lẫn dữ liệu giữa 2 tài khoản.
  async function handleExitImpersonation() {
    setExitingImpersonation(true);
    try {
      await fetch('/api/auth/impersonate/exit', { method: 'POST' });
    } finally {
      window.location.href = '/';
    }
  }

  const NAV_ITEMS: { key: MainTab; label: string; icon: ReactNode }[] = [
    { key: 'home', label: 'Trang chủ', icon: <HomeIcon className="w-[18px] h-[18px]" /> },
    { key: 'exams', label: 'Tạo đề thi', icon: <FileIcon className="w-[18px] h-[18px]" /> },
    // ẨN (Phần 7): mục "Quản lý lớp" đã bị bỏ khỏi mảng này nên không còn
    // hiện trên menu — Khối đã thay thế đủ tính năng (xem `KhoiTab` +
    // `ClassDetailPanel`). Nếu sau này phát hiện Khối còn thiếu gì, chỉ cần
    // thêm lại đúng 1 dòng
    // `{ key: 'classes', label: 'Quản lý lớp', icon: <UsersIcon className="w-[18px] h-[18px]" /> },`
    // vào đây là tab cũ hiện lại ngay, không cần sửa code gì khác —
    // `ClassesTab` và route render của nó bên dưới (activeTab === 'classes')
    // vẫn được giữ nguyên 100%, không hề bị đụng tới ở Phần 7 này.
    // THÊM MỚI (Phần 3b): mục "Khối" — gửi 1 link chung cho nhiều lớp cùng
    // khối lớp, xem KhoiTab.tsx.
    { key: 'khoi', label: 'Quản lí Khối-lớp', icon: <LayersIcon className="w-[18px] h-[18px]" /> },
    // THÊM MỚI: mục "Quản trị" — CHỈ thêm vào danh sách khi đúng tài khoản
    // admin (isAdminEmail) đang đăng nhập, nên GV thường không bao giờ thấy
    // mục này trên giao diện của họ.
    ...(isAdminEmail(teacher?.email)
      ? [{ key: 'admin' as MainTab, label: 'Quản trị', icon: <ShieldIcon className="w-[18px] h-[18px]" /> }]
      : []),
  ];

  // Đang hỏi server / chưa xác định được đã đăng nhập hay chưa → hiện màn
  // hình chờ ngắn, tránh nháy dashboard rồi lại bật sang /login (giật giao diện).
  if (checkingSession || !teacher) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Đang kiểm tra đăng nhập...</p>
      </div>
    );
  }

  // THÊM MỚI (bắt buộc xác nhận email): chặn TOÀN BỘ app (không render
  // dashboard/tab nào) cho tới khi teacher.emailVerified = true. Đặt sau
  // early-return checkingSession ở trên vì lúc đó `teacher` chắc chắn đã có
  // giá trị. BỎ QUA chặn khi admin đang "xem thay mặt" (impersonating) —
  // admin cần vào được tài khoản GV để hỗ trợ dù GV đó chưa xác nhận email,
  // không phải người đang tự dùng tài khoản của chính mình.
  if (!teacher.emailVerified && !impersonating) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <p className="text-3xl mb-3">📧</p>
          <h2 className="text-lg font-bold text-gray-900 mb-1.5">Xác nhận email để tiếp tục</h2>
          <p className="text-sm text-gray-500 mb-1">
            Bạn cần bấm vào link xác nhận đã gửi tới
          </p>
          <p className="text-sm font-semibold text-gray-800 mb-5 break-all">{teacher.email}</p>
          <p className="text-xs text-gray-400 mb-5">
            Không thấy email? Kiểm tra cả mục Spam/Quảng cáo, hoặc bấm nút bên dưới để gửi lại.
          </p>
          {resendVerifyMsg && (
            <p className={`text-xs mb-3 ${resendVerifyError ? 'text-red-600' : 'text-emerald-600'}`}>
              {resendVerifyMsg}
            </p>
          )}
          <button
            onClick={handleResendVerification}
            disabled={resendingVerify}
            className="w-full bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 mb-2.5"
          >
            {resendingVerify ? 'Đang gửi...' : 'Gửi lại email xác nhận'}
          </button>
          <button
            onClick={handleLogout}
            className="w-full text-xs text-gray-500 hover:text-gray-700 py-1.5"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  // Nội dung cột trái (logo + 2 mục điều hướng + tài khoản) — DÙNG CHUNG cho
  // cả 2 cách hiển thị: cột cố định ở màn hình rộng, và drawer trượt ra ở
  // màn hình hẹp. Viết 1 lần để không lệch nhau khi sửa sau này.
  const navContent = (
    <>
      <nav className="flex-1 py-3">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setActiveTab(item.key);
              setNavOpen(false); // bấm 1 mục xong tự đóng drawer (chỉ có tác dụng ở màn hình hẹp)
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === item.key
                ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* SỬA: trợ lý AI hỏi-đáp về app — trước đây là nút nổi kiểu "position:
          fixed" (dễ đè lên tab đang xem), giờ gắn thẳng vào cột trái, ngay
          trên khu vực tài khoản, dùng chung navContent nên có mặt ở cả cột
          cố định (máy tính) lẫn drawer trượt ra (điện thoại). Vẫn CHỈ hiện ở
          app chính của GV (page.tsx), không hiện ở trang học sinh
          /thi/[examId] theo đúng phạm vi đã chốt. */}
      <AiHelpWidget />

      {/* SỬA (khiếu nại: bỏ dòng link "Xem thử trên điện thoại" khỏi cuối
          cột trái) — link này giờ chuyển thành 1 icon nổi ở góc trên-phải
          màn hình lớn, xem khối "Icon xem thử điện thoại" ngay dưới return
          JSX chính bên dưới. */}
      <AccountMenu teacher={teacher} onLogout={handleLogout} />
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SỬA (khiếu nại: bỏ link "Xem thử trên điện thoại" ở cuối cột trái,
          thay bằng 1 icon nổi góc trên-phải, to hơn, không nhãn chữ) — chỉ
          hiện khi phát hiện ĐÚNG máy tính có chuột thật (isDesktopPointer),
          không chỉ dựa độ rộng màn hình nữa (điện thoại xoay ngang cũng có
          thể rộng hơn breakpoint sm nhưng vẫn là điện thoại, không phải máy
          tính — icon "xem thử điện thoại" ở đó vô nghĩa vì đang cầm sẵn
          điện thoại thật rồi). */}
      {isDesktopPointer && (
        <a
          href="/phone-simulator.html"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Xem thử trên điện thoại"
          title="Xem thử trên điện thoại"
          className="fixed top-4 right-4 z-30 flex items-center justify-center w-11 h-11 rounded-full bg-white border border-gray-200 shadow-md text-2xl text-gray-600 hover:text-blue-600 hover:border-blue-300 hover:shadow-lg transition"
        >
          📱
        </a>
      )}

      {/* Cột trái CỐ ĐỊNH — chỉ hiện từ breakpoint sm (≈640px) trở lên, tức
          máy tính/tablet. Ở màn hình hẹp hơn (điện thoại) ẩn hẳn, thay bằng
          thanh trên cùng + drawer bên dưới. Muốn xem thử layout điện thoại
          ngay trên laptop, dùng icon 📱 nổi ở góc trên-phải màn hình.
          SỬA: thêm điều kiện isPhoneLandscape — điện thoại xoay ngang vẫn
          ẩn cột này dù chiều rộng đã vượt breakpoint sm (xem giải thích ở
          chỗ khai báo state). */}
      <aside className={`${isPhoneLandscape ? 'hidden' : 'hidden sm:flex'} w-60 shrink-0 border-r border-gray-200 bg-white flex-col`}>
        <div className="px-4 py-5 border-b border-gray-100">
          <span className="flex items-center gap-2.5 font-bold text-blue-600 text-lg tracking-tight"><AppLogoIcon className="w-8 h-8 shrink-0" />{APP_NAME}</span>
        </div>
        {navContent}
      </aside>

      {/* Cột phải: thanh trên cùng (chỉ hiện ở màn hình hẹp) + nội dung tab. */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Thanh trên cùng kiểu Azota — logo bên trái, icon hamburger (☰) bên
            phải. Bấm hamburger mới hiện cột trái (kiểu lớp phủ trượt ra).
            SỬA: giữ hiện (không bị sm:hidden nuốt mất) khi isPhoneLandscape,
            vì lúc đó cột trái cố định cũng đang bị ẩn — nếu không, điện
            thoại xoay ngang sẽ mất cả 2 cách mở menu điều hướng. */}
        <div className={`${isPhoneLandscape ? 'flex' : 'flex sm:hidden'} items-center justify-between bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30`}>
          <span className="flex items-center gap-2.5 font-bold text-blue-600 text-base tracking-tight"><AppLogoIcon className="w-7 h-7 shrink-0" />{APP_NAME}</span>
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Mở menu điều hướng"
            className="text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <HamburgerIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Drawer trượt ra từ trái + lớp phủ mờ phía sau — chỉ tồn tại trong
            DOM lúc navOpen=true, và chỉ áp dụng ở màn hình hẹp (hoặc điện
            thoại xoay ngang — xem isPhoneLandscape). */}
        {navOpen && (
          <div className={`${isPhoneLandscape ? '' : 'sm:hidden'} fixed inset-0 z-40`}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
            <aside className="absolute top-0 left-0 bottom-0 w-72 max-w-[80vw] bg-white flex flex-col shadow-xl">
              <div className="flex items-center justify-between px-4 py-5 border-b border-gray-100">
                <span className="flex items-center gap-2.5 font-bold text-blue-600 text-lg tracking-tight"><AppLogoIcon className="w-8 h-8 shrink-0" />{APP_NAME}</span>
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Đóng menu"
                  className="text-gray-400 hover:text-gray-600 px-2"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
              {navContent}
            </aside>
          </div>
        )}

        {/* Nội dung đổi theo tab.
            SỬA LỖI: trước đây dùng `{activeTab === 'x' && <X />}` — kiểu này
            HỦY HẲN component của tab không active mỗi lần đổi tab. Hậu quả:
            GV đang mở 1 đề trong tab "Đề thi" (currentExamId, nội dung đang
            sửa dở...) rồi sang tab "Quản lý lớp" để giao bài, quay lại "Đề
            thi" thì ExamBuilder bị dựng lại từ đầu — mất currentExamId, màn
            hình về "upload đề mới" trắng tinh, giống hệt như đề vừa tạo biến
            mất (dù trong MongoDB đề vẫn còn nguyên, chỉ là UI local mất dấu
            đang sửa đề nào). Giờ cả 3 tab LUÔN được mount, chỉ ẩn/hiện bằng
            CSS (display) — chuyển tab qua lại bao nhiêu lần cũng giữ nguyên
            đề đang mở, kể cả phần chưa kịp bấm Lưu. */}
        {/* THÊM MỚI (mạo danh): banner luôn nổi ở trên cùng khi admin đang
            "xem thay mặt" 1 GV — để admin không quên mình đang ở "vai"
            người khác, tránh sửa nhầm dữ liệu rồi tưởng là của mình. */}
        {impersonating && (
          <div className="sticky top-0 z-40 bg-amber-500 text-white text-sm px-4 py-2.5 flex items-center justify-between gap-3">
            <span>
              Đang xem thay mặt <b>{teacher.name}</b> ({teacher.email}) — quản trị viên {impersonating.adminEmail}.
            </span>
            <button
              onClick={handleExitImpersonation}
              disabled={exitingImpersonation}
              className="shrink-0 bg-white text-amber-700 font-semibold text-xs px-3 py-1.5 rounded-md hover:bg-amber-50 disabled:opacity-60 transition-colors"
            >
              {exitingImpersonation ? 'Đang thoát...' : 'Thoát'}
            </button>
          </div>
        )}

        {/* THÊM MỚI (khiếu nại: "muốn 3 lần thông báo — lúc mới gán hạn dùng
            thử báo còn bao nhiêu ngày, còn 5 ngày báo tiếp, hết hạn báo lần
            3"): trước đây banner CHỈ hiện khi sắp hết hạn (≤ FREE_EXPIRING_
            SOON_DAYS, hiện = 5 ngày) hoặc đã hết hạn — im lặng suốt những
            ngày đầu. Giờ thêm 1 tầng thứ 3 (nhẹ nhàng, màu xanh dương) hiện
            NGAY TỪ NGÀY ĐẦU có hạn dùng thử, chỉ đổi số ngày đếm ngược mỗi
            ngày — tới khi còn ≤5 ngày mới đổi sang tầng cảnh báo (vàng, đã
            có sẵn), rồi tới lúc hết hạn mới đổi sang tầng cuối (đỏ, đã có
            sẵn). daysRemaining === null nghĩa là tài khoản KHÔNG có hạn áp
            dụng (lifetime hoặc tài khoản cũ tạo trước tính năng này) — vẫn
            không hiện gì, giữ đúng hành vi cũ cho nhóm này. */}
        {!isAdminEmail(teacher.email) && teacher.planStatus && !teacher.planStatus.isLifetime && teacher.planStatus.daysRemaining !== null && (
          teacher.planStatus.isExpired ? (
            <div className="sticky top-0 z-40 bg-red-600 text-white text-sm px-4 py-2.5">
              Gói dùng thử đã hết hạn. Bạn vẫn xem/thi được nhưng không tạo/sửa đề mới. Nếu cần, hãy liên hệ tác giả qua Messenger Facebook{' '}
              <a href={ADMIN_CONTACT.facebook} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                tại đây
              </a>{' '}
              hoặc email {ADMIN_CONTACT.email} để gia hạn.
            </div>
          ) : teacher.planStatus.isExpiringSoon ? (
            <div className="sticky top-0 z-40 bg-amber-500 text-white text-sm px-4 py-2.5">
              Gói dùng thử của bạn còn {teacher.planStatus.daysRemaining} ngày. Liên hệ admin để gia hạn.
            </div>
          ) : (
            <div className="sticky top-0 z-40 bg-blue-50 text-blue-800 text-sm px-4 py-2.5 border-b border-blue-100">
              Bạn đang dùng thử — còn {teacher.planStatus.daysRemaining} ngày dùng thử.
            </div>
          )
        )}

        <main className="flex-1 overflow-y-auto">
          <div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
            <HomeTab teacher={teacher} onGoTo={setActiveTab} />
          </div>
          <div style={{ display: activeTab === 'classes' ? 'block' : 'none' }}>
            <ClassesTab />
          </div>
          {/* THÊM MỚI (Phần 3b): tab "Khối" — cùng pattern mount-luôn/ẩn-hiện
              bằng display (không huỷ component) như các tab khác, để GV
              chuyển qua lại giữa "Khối" và "Đề thi"/"Quản lý lớp" không mất
              state đang xem dở (khối đang mở, modal Giao đề đang điền...). */}
          <div style={{ display: activeTab === 'khoi' ? 'block' : 'none' }}>
            <KhoiTab />
          </div>
          <div style={{ display: activeTab === 'exams' ? 'block' : 'none' }}>
            {/* THÊM MỚI: nút điều hướng thẳng sang tab "Quản lý lớp" trong modal
                "Đã xuất bản đề thi" — trước đây modal đó chỉ CHỈ DẪN bằng chữ
                ("sang tab Quản lý lớp...") khiến GV phải tự bấm menu, dễ nhầm
                link "quản lý đề" (không có classId) với link giao được cho
                học sinh. Truyền onGoToClasses xuống để ExamBuilder tự chuyển
                tab luôn, không cần GV tự tìm.
                SỬA (Phần 7): tab "Quản lý lớp" đã bị ẩn khỏi menu, GV giờ
                giao đề qua "Khối" nên đổi đích đến sang 'khoi' — hành vi
                tương đương (vẫn tự chuyển tab hộ GV), không xoá nút này. */}
            <ExamBuilder onGoToClasses={() => setActiveTab('khoi')} />
          </div>
          {/* CHỈ mount AdminTab khi đúng tài khoản admin đang đăng nhập — GV
              thường không bao giờ tải/gọi API /api/admin/teachers, dù họ có
              cố sửa activeTab bằng tay (devtools) cũng không thấy gì vì
              component còn chưa được mount, và API phía server vẫn tự chặn
              lại lần nữa nếu có ai cố gọi thẳng. */}
          {isAdminEmail(teacher.email) && (
            <div style={{ display: activeTab === 'admin' ? 'block' : 'none' }}>
              <AdminTab />
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
