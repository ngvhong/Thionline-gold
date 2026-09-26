'use client';

// ============================================================
// Phần 4 — Tách "chi tiết 1 lớp" (roster học sinh, thêm/sửa/xoá học sinh,
// import Excel/CSV, tự báo danh, xuất bảng điểm, giao đề, xem/chấm bài, cho
// làm lại) ra khỏi `ClassesTab` trong page.tsx thành 1 component riêng, tự
// chứa (self-contained) — để dùng chung được cho cả tab "Quản lý lớp" cũ VÀ
// tab "Khối" (việc nối vào Khối là Phần 5, KHÔNG làm ở đây).
//
// Bám sát đúng pattern đã dùng ở KhoiTab.tsx: vì page.tsx KHÔNG export các
// type/hàm helper/icon dùng chung, nên toàn bộ những gì component này cần
// đều được copy riêng vào đây (không import chéo từ page.tsx). Toàn bộ
// logic/UI bên trong giữ NGUYÊN 100% so với phần "chi tiết lớp" gốc trong
// `ClassesTab` (tầng 2 — roster của lớp, và tầng 3 — đề đã giao cho 1 học
// sinh) — chỉ đổi cách lấy `classId` hiện tại: TRƯỚC ĐÂY lấy từ state nội bộ
// `selectedClassId` của `ClassesTab` (đặt qua bấm vào thẻ lớp ở tầng 1),
// GIỜ nhận thẳng qua prop `classId` (nơi gọi — vd. KhoiTab — tự quyết định
// lớp nào đang được xem, thậm chí không cần có "danh sách lớp" nào cả).
//
// KHÔNG có tầng 1 (danh sách lớp + tạo/sửa/xoá LỚP) trong component này —
// đó là việc của tầng danh sách bên ngoài (ClassesTab cũ, hoặc KhoiDetailView
// ở Phần 5), không phải "chi tiết 1 lớp". Vì vậy `ClassForm` (form tạo/sửa
// LỚP) không được copy vào đây.
// ============================================================

import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { renderExamText, buildTikzSvgMap } from '@/lib/examRender';
import { gradeExam, computeEssayMax, round2 } from '@/lib/grading';
import { scrollFadeX } from '@/lib/scrollFade';
import { AppLogoIcon } from '@/components/AppBranding';
import EssayAnnotator from '@/components/EssayAnnotator';

// ============================================================
// ---------- Kiểu dữ liệu, khớp đúng response của API (xem GET/PUT
// /api/classes/[id], /api/students, /api/students/[id], /api/submissions,
// /api/submissions/[id], /api/submissions/[id]/retake) ----------
// ============================================================

type SelfRegisterMode = 'off' | 'auto' | 'approval';

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
  // THÊM MỚI (giai đoạn 1 — tài khoản học sinh): true khi học sinh này đã
  // "vào lớp" bằng 1 StudentAccount — chỉ dùng để hiện/ẩn nút "Đặt lại
  // PIN" bên dưới, không có ý nghĩa gì khác.
  hasStudentAccount?: boolean;
};

// Giao đề: chỉ cần vài field tối thiểu từ /api/exams (không cần raw_data/
// settings nặng, panel giao đề chỉ hiện tên đề để GV chọn).
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
// LÀM cụ thể (không gộp về mới nhất như AssignedSubmission ở trên). Giống hệt
// type cùng tên trong page.tsx.
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

// ============================================================
// ---------- Helper dùng chung (bản riêng cho file này) ----------
// ============================================================

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

// ============================================================
// ---------- Icon (cùng bộ nét mảnh/stroke với page.tsx — chỉ copy đúng
// những icon thật sự dùng trong phần "chi tiết lớp", không copy thừa cả bộ
// icon của page.tsx) ----------
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

// THÊM MỚI (giai đoạn 1 — tài khoản học sinh): icon cho nút "Đặt lại PIN".
function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="8" cy="15" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.3 12.7 18 5l2 2-1.5 1.5 1.5 1.5-2 2-1.5-1.5L15 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M15 5.5 8.5 12 15 18.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

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

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5.5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

// Icon trạng thái chấm bài (đúng/đúng 1 phần/sai/bỏ trống) — dùng trong
// SubmissionDetailModal.
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

// ============================================================
// ---------- Nút + breadcrumb dùng chung (copy nguyên văn từ page.tsx) ----------
// ============================================================

// Thanh breadcrumb — giúp GV luôn biết mình đang ở đâu, bấm vào từng mắt
// xích để nhảy lùi (không chỉ có nút "quay lại").
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

// Nút hành động chính (CTA) — LUÔN solid màu + bóng nhẹ, chỉ dùng cho ĐÚNG 1
// hành động quan trọng nhất trên mỗi màn hình.
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
// nhau ở màu icon để gợi ý ý nghĩa.
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
// trang) — cùng 1 kích thước, cùng bo góc cho mọi nơi.
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

// ============================================================
// Bước 3: modal "Xem bài làm" — GV bấm mở mới xem được (học sinh không tự
// xem đáp án ngay sau khi nộp, theo quyết định đã chốt). Gọi API GV
// /api/submissions/[id] (có kiểm tra ownerId), rồi tự chấm lại bằng
// gradeExam (dùng chung với server) để tô đúng/sai từng câu.
// ============================================================
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
                              <span
                                className="flex-1 whitespace-pre-wrap overflow-x-auto no-scrollbar"
                                style={scrollFadeX(
                                  r.correct ? '#f0fdf4' : partial ? '#fffbeb' : r.attempted ? '#fef2f2' : '#f9fafb'
                                )}
                              >
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
                            <p className="text-sm mb-2 whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
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
        {/* Nút tải file Excel MẪU đúng định dạng route import nhận diện
            được — GV tải về, điền danh sách (hoặc copy-paste từ file lớp có
            sẵn), rồi tải ngược lại bằng ô chọn file bên dưới. */}
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

// Panel "Giao đề" — GV chọn 1 đề ĐÃ XUẤT BẢN, rồi chọn giao cho cả lớp hoặc
// bỏ chọn từng em không muốn giao. Em nào đã được giao đề này rồi (query lại
// mỗi khi đổi đề) hiện ✓ "Đã giao" và bị disable — tránh GV tưởng nhầm là
// giao lại thành công.
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
  // assignLinkCopied ở component cha — box đó chỉ hiện sau khi bấm "Giao đề").
  const [linkBoxCopied, setLinkBoxCopied] = useState(false);

  // THÊM MỚI (rút gọn link chia sẻ) — xem giải thích đầy đủ ở bản sao cùng
  // logic trong page.tsx (AssignExamPanel): tự sinh/lấy lại mã /s/{code} mỗi
  // khi đổi đề hoặc đổi lớp, `null` thì các chỗ hiển thị bên dưới tự rơi về
  // dùng link dài như cũ.
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
        if (!cancelled) setShortCode(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId, classId]);

  function buildShareLink(origin: string) {
    if (shortCode) return `${origin}/s/${shortCode}`;
    return `${origin}/thi/${selectedExamId}?class=${classId}`;
  }

  // Cài đặt riêng theo lớp: MẶC ĐỊNH lớp này dùng nguyên cài đặt của đề
  // (examDefaultSettings, chỉ đọc để hiện tham khảo). GV bật
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
        // Skeleton UI: 1 thanh xám đúng chiều cao ô <select> thật bên dưới —
        // panel này nhỏ, chỉ cần vậy là đủ đỡ cảm giác đứng hình.
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

          {/* Link đề cho lớp này CHỈ phụ thuộc examId + classId (không cần
              đã "Giao đề" hay chưa) — hiện NGAY khi chọn đề, để giáo viên
              mở lại panel này bất cứ lúc nào (cả vài ngày sau) là lấy được
              link cũ, không phải bấm "Giao đề" lại chỉ để xem link. */}
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

          {/* Cài đặt RIÊNG cho lớp này (thời gian làm bài, trộn câu, số lần
              làm lại, xem lời giải, giờ mở/đóng đề...) — MẶC ĐỊNH tắt, lớp
              dùng nguyên cài đặt của đề (hiện tóm tắt bên dưới). Bật lên +
              sửa + bấm Lưu thì CHỈ lớp này đổi, các lớp khác được giao đề
              này không hề bị ảnh hưởng, vẫn tự động theo đúng cài đặt mặc
              định của đề (kể cả khi GV sửa mặc định sau này). Học sinh
              CHƯA vào làm sẽ bị chặn ngoài khung giờ mở/đóng đang áp dụng;
              em nào đã vào rồi thì không bị ảnh hưởng. */}
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

// ============================================================
// ---------- Component chính: chi tiết 1 lớp (roster + xem 1 học sinh) ----------
// ============================================================

export default function ClassDetailPanel({
  classId,
  className,
  onBack,
  breadcrumbPrefix,
}: {
  classId: string;
  className: string;
  onBack: () => void;
  breadcrumbPrefix: { label: string; onClick?: () => void }[];
}) {
  // Chi tiết lớp (tên đầy đủ/năm học/chế độ tự báo danh) — GV bấm vào 1 lớp
  // là component này tự tải, KHÔNG nhận sẵn từ props (props chỉ có
  // className để hiện tiêu đề NGAY, khỏi phải chờ fetch xong mới thấy chữ
  // gì trên màn hình).
  const [classDetail, setClassDetail] = useState<ClassItem | null>(null);
  const [loadingClassDetail, setLoadingClassDetail] = useState(true);
  const [classDetailError, setClassDetailError] = useState('');

  // Danh sách TẤT CẢ các lớp của GV — chỉ dùng để đổ vào dropdown "chuyển
  // lớp" của StudentForm khi sửa 1 học sinh (giữ đúng tính năng gốc).
  const [allClasses, setAllClasses] = useState<ClassItem[]>([]);

  const [classStudents, setClassStudents] = useState<StudentItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [showAddStudent, setShowAddStudent] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  // Nhập danh sách học sinh từ file Excel/CSV thay vì gõ tay từng em — panel
  // bật/tắt độc lập với form "Thêm học sinh" (chỉ 1 trong 2 mở tại 1 thời điểm).
  const [showImportStudents, setShowImportStudents] = useState(false);

  // Menu xuất bảng điểm Excel/Word (đóng/mở khi bấm nút "Bảng điểm").
  const [showScoreExportMenu, setShowScoreExportMenu] = useState(false);
  // Danh sách đề đã từng giao cho lớp đang xem (lấy qua format=list) + đề
  // nào đang được chọn để lọc — cho phép GV xuất bảng điểm CHỈ 1 đề thay vì
  // luôn gộp tất cả các đề của lớp. selectedScoreExportExamIds rỗng = xuất
  // tất cả (giữ hành vi mặc định như trước).
  const [scoreExportExams, setScoreExportExams] = useState<{ examId: string; title: string }[]>([]);
  const [loadingScoreExportExams, setLoadingScoreExportExams] = useState(false);
  const [selectedScoreExportExamIds, setSelectedScoreExportExamIds] = useState<string[]>([]);
  // FIX HIỆU NĂNG (đây là cơ chế đã có chủ đích ở bản gốc, giữ nguyên):
  // TRƯỚC ĐÂY mỗi lần bấm mở menu "Bảng điểm" đều gọi lại API format=list từ
  // đầu, kể cả khi vừa mở/đóng menu này liên tục cho ĐÚNG 1 lớp — GV thấy
  // "Đang tải danh sách đề..." nhấp nháy mỗi lần bấm dù dữ liệu chẳng đổi
  // gì. Giờ cache kết quả theo classId (Map, sống suốt vòng đời component
  // này — component này chỉ hiện đúng 1 lớp nên Map thường chỉ có 1 key,
  // nhưng vẫn giữ đúng kiểu Map để nhất quán với bản gốc): lần mở đầu tiên
  // tải + hiện loading như cũ; những lần mở SAU hiện NGAY dữ liệu đã cache
  // (không loading), đồng thời âm thầm gọi lại API phía sau (revalidate) để
  // cập nhật nếu GV vừa giao thêm đề mới.
  const scoreExportCacheRef = useRef<Map<string, { examId: string; title: string }[]>>(new Map());
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
  // THÊM MỚI (GV yêu cầu 29-8: "dòng chữ nhỏ dưới tên mỗi em, 'Đang thi' lúc
  // đang làm bài, 'Đã thi xong' lúc vừa nộp — không cần heartbeat"). Map
  // studentId -> status ('đang thi' | 'đã nộp' | 'chưa thi') lấy từ lần hoạt
  // động GẦN NHẤT của em đó trên TOÀN BỘ đề (không cần biết đề nào), tự làm
  // mới mỗi 20 giây để GV không cần bấm F5 khi có em bắt đầu/nộp bài trong
  // lúc đang xem danh sách lớp.
  const [studentActivityStatus, setStudentActivityStatus] = useState<Record<string, string>>({});
  // THÊM MỚI (Lịch sử làm bài): giống hệt state cùng tên trong page.tsx.
  const [historyOpenExamId, setHistoryOpenExamId] = useState<string | null>(null);
  const [historyByExam, setHistoryByExam] = useState<Record<string, AttemptHistoryItem[]>>({});
  const [historyLoadingExamId, setHistoryLoadingExamId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<Record<string, string>>({});

  // Tải chi tiết 1 lớp (name/schoolYear/selfRegisterMode...) CỘNG danh sách
  // học sinh trong CÙNG 1 lần gọi (GET /api/classes/[id] trả cả 2), đỡ phải
  // gọi 2 API riêng lẻ như bản gốc lúc mới vào lớp.
  async function loadClassDetail(id: string) {
    setLoadingClassDetail(true);
    setClassDetailError('');
    try {
      const data = await apiFetch<{ class: ClassItem; students: StudentItem[] }>(`/api/classes/${id}`);
      setClassDetail(data.class);
      setClassStudents(data.students);
    } catch (err: any) {
      setClassDetailError(err.message || 'Không tải được thông tin lớp.');
    } finally {
      setLoadingClassDetail(false);
    }
  }

  async function loadClassStudents(id: string) {
    setLoadingDetail(true);
    setDetailError('');
    try {
      const data = await apiFetch<{ students: StudentItem[] }>(`/api/students?classId=${id}`);
      setClassStudents(data.students);
    } catch (err: any) {
      setDetailError(err.message || 'Không tải được danh sách học sinh.');
    } finally {
      setLoadingDetail(false);
    }
  }

  // Danh sách toàn bộ lớp của GV — chỉ để đổ vào dropdown "chuyển lớp" khi
  // sửa 1 học sinh (StudentForm showClassSelect).
  async function loadAllClasses() {
    try {
      const data = await apiFetch<{ classes: ClassItem[] }>('/api/classes');
      setAllClasses(data.classes);
    } catch {
      // Không tải được danh sách lớp để "chuyển lớp" không phải lỗi chặn
      // đường — GV vẫn xem/sửa được thông tin học sinh bình thường, chỉ là
      // dropdown "chuyển lớp" tạm trống (options rỗng, select tự ẩn khỏi
      // chọn được lớp nào).
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
      // Học sinh vừa được cấp lượt mới -> lịch sử cũ (nếu cache sẵn) thiếu
      // attempt mới -> xoá cache, lần mở sau tự tải lại đủ.
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

  // THÊM MỚI (Lịch sử làm bài): giống hệt hàm cùng tên trong page.tsx.
  function toggleAttemptHistory(examId: string) {
    if (historyOpenExamId === examId) {
      setHistoryOpenExamId(null);
      return;
    }
    setHistoryOpenExamId(examId);
    if (historyByExam[examId] || !selectedStudentId) return;
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

  // Gộp lại thành 1 hàm dùng chung cho: mở menu lần đầu, nút "Thử lại", và
  // revalidate ngầm — silent=true thì không bật loadingScoreExportExams
  // (dùng cho revalidate ngầm khi đã có cache, tránh nháy lại "Đang tải...").
  function loadScoreExportExams(id: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;
    if (!silent) {
      setLoadingScoreExportExams(true);
      setScoreExportListError('');
    }
    apiFetch<{ exams: { examId: string; title: string }[] }>(
      `/api/classes/${id}/score-export?format=list`
    )
      .then((result) => {
        const exams = result.exams || [];
        scoreExportCacheRef.current.set(id, exams);
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

  // Vào lớp mới (classId đổi) -> tải lại toàn bộ, reset mọi panel/tầng con
  // đang mở của lớp cũ (tránh dính state của lớp trước sang lớp sau, ví dụ
  // panel "Giao đề" hay đang xem 1 học sinh của lớp cũ).
  useEffect(() => {
    loadClassDetail(classId);
    loadAllClasses();
    setSelectedStudentId(null);
    setSearch('');
    setShowAddStudent(false);
    setEditingStudentId(null);
    setShowImportStudents(false);
    setShowAssignPanel(false);
    setAssignMessage('');
    setAssignLink('');
    setAssignLinkCopied(false);
    setShowScoreExportMenu(false);
    setScoreExportExams([]);
    setSelectedScoreExportExamIds([]);
    setScoreExportListError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // THÊM MỚI: tải + tự làm mới trạng thái "Đang thi / Đã thi xong" của cả
  // lớp mỗi 20 giây — tách riêng effect này (không gộp vào effect load lớp ở
  // trên) vì effect trên chỉ chạy 1 lần khi ĐỔI lớp, còn effect này cần chạy
  // liên tục theo interval trong suốt thời gian GV đang xem đúng lớp đó.
  useEffect(() => {
    let cancelled = false;
    async function loadActivityStatus() {
      try {
        const data = await apiFetch<{ assignments: { studentId: string; status: string }[] }>(
          `/api/submissions?classId=${classId}`
        );
        if (!cancelled) {
          const map: Record<string, string> = {};
          data.assignments.forEach((a) => {
            map[a.studentId] = a.status;
          });
          setStudentActivityStatus(map);
        }
      } catch {
        // Chỉ là badge phụ trên danh sách lớp — lỗi ở đây không cần báo ồn
        // ào, GV vẫn xem chi tiết đúng khi bấm vào từng học sinh.
      }
    }
    loadActivityStatus();
    const interval = setInterval(loadActivityStatus, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [classId]);

  useEffect(() => {
    if (selectedStudentId) {
      loadAssignedExams(selectedStudentId);
    }
    setHistoryOpenExamId(null);
    setHistoryByExam({});
    setHistoryError({});
  }, [selectedStudentId]);

  const selectedStudent = classStudents.find((s) => s._id === selectedStudentId) || null;
  // Tên hiện NGAY từ prop trong lúc chờ fetch xong; sau khi tải được thì ưu
  // tiên tên mới nhất từ server (phòng trường hợp GV vừa đổi tên lớp ở nơi
  // khác trong lúc đang mở panel này).
  const displayClassName = classDetail?.name ?? className;

  // Quay lại tầng 2 (roster) từ tầng 3 (1 học sinh) — tải lại roster vì học
  // sinh có thể vừa tự báo danh/thêm tên mới trong lúc GV đang xem học sinh
  // khác, tránh phải rời hẳn khỏi lớp rồi vào lại mới thấy tên mới.
  const goClass = () => {
    setSelectedStudentId(null);
    loadClassStudents(classId);
  };

  async function handleChangeSelfRegisterMode(next: SelfRegisterMode) {
    if (!classDetail) return;
    const prevMode = classDetail.selfRegisterMode;
    // Đổi UI NGAY khi bấm (optimistic update) — chờ `await apiFetch` xong
    // mới cập nhật khiến nút gạt đứng yên trong lúc chờ mạng, cảm giác như
    // bấm không ăn. Gọi API ngầm phía sau; nếu lỗi thì rollback + báo lỗi,
    // để không "nói dối" GV là đã đổi thành công trong khi thực ra chưa lưu
    // được.
    setClassDetail((prev) => (prev ? { ...prev, selfRegisterMode: next } : prev));
    try {
      const data = await apiFetch<{ class: ClassItem }>(`/api/classes/${classId}`, {
        method: 'PUT',
        body: JSON.stringify({ selfRegisterMode: next }),
      });
      // Khớp lại đúng giá trị server trả về (phòng trường hợp server tự
      // chuẩn hoá khác đi) — bình thường sẽ giống hệt `next` nên không gây
      // giật hình.
      setClassDetail((prev) => (prev ? { ...prev, selfRegisterMode: data.class.selfRegisterMode } : prev));
    } catch (err: any) {
      // Rollback về giá trị trước khi bấm — nút gạt tự nhảy lại vị trí cũ để
      // GV biết thao tác KHÔNG thành công, không phải màn hình đứng hình.
      setClassDetail((prev) => (prev ? { ...prev, selfRegisterMode: prevMode } : prev));
      alert(err.message || 'Không đổi được chế độ tự báo danh, thử lại nhé.');
    }
  }

  // "Duyệt" đổi UI ngay (nút biến mất ngay khi bấm), rollback (hiện lại nút)
  // nếu API lỗi — cùng lý do optimistic update ở trên.
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

  async function handleCreateStudent(data: { name: string; dob: string; gender: '' | 'Nam' | 'Nữ' }) {
    const res = await apiFetch<{ student: StudentItem }>('/api/students', {
      method: 'POST',
      body: JSON.stringify({ name: data.name, dob: data.dob, gender: data.gender || undefined, classId }),
    });
    setClassStudents((prev) => [...prev, res.student].sort((a, b) => a.name.localeCompare(b.name)));
    setClassDetail((prev) => (prev ? { ...prev, studentCount: prev.studentCount + 1 } : prev));
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
    const movedToOtherClass = data.classId && data.classId !== classId;
    if (movedToOtherClass) {
      // Chuyển sang lớp khác — biến mất khỏi danh sách đang xem, cập nhật
      // sĩ số lớp hiện tại (sĩ số lớp đích không hiện ở component này).
      setClassStudents((prev) => prev.filter((s) => s._id !== studentId));
      setClassDetail((prev) => (prev ? { ...prev, studentCount: Math.max(0, prev.studentCount - 1) } : prev));
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
      setClassDetail((prev) => (prev ? { ...prev, studentCount: Math.max(0, prev.studentCount - 1) } : prev));
      if (selectedStudentId === studentId) setSelectedStudentId(null);
    } catch (err: any) {
      alert(err.message || 'Không xóa được học sinh.');
    }
  }

  // THÊM MỚI (giai đoạn 1 — tài khoản học sinh): GV đặt lại PIN hộ học
  // sinh đã có tài khoản (do quên PIN) — chỉ hiện nút này khi
  // hasStudentAccount === true (xem chỗ render bên dưới). PIN mới hiện 1
  // lần duy nhất qua alert (không lưu lại ở đâu để GV đọc lại cho học
  // sinh), giống cách 1 số app hiện mật khẩu tạm 1 lần.
  async function handleResetPin(studentId: string, name: string) {
    if (!window.confirm(`Đặt lại PIN cho "${name}"? PIN cũ sẽ không dùng được nữa.`)) return;
    try {
      const res = await apiFetch<{ pin: string }>(`/api/teacher/students/${studentId}/reset-pin`, {
        method: 'POST',
      });
      window.alert(`PIN mới của "${name}": ${res.pin}\n\nHãy đọc lại số này cho học sinh — PIN cũ đã ngừng hoạt động.`);
    } catch (err: any) {
      alert(err.message || 'Không đặt lại PIN được.');
    }
  }

  // Nút "‹ Quay lại" nhỏ phía trên breadcrumb — gọi `onBack` (KHÔNG tự điều
  // hướng route, nơi gọi component này tự quyết định rời khỏi panel để về
  // đâu, ví dụ danh sách lớp trong 1 Khối).
  const backButton = (
    <IconButton
      onClick={onBack}
      title="Quay lại"
      icon={<ChevronLeftIcon className="w-4 h-4" />}
      hoverClass="hover:text-gray-700 hover:bg-gray-100"
      className="border border-gray-300 shrink-0"
    />
  );

  // ---------- Tầng 3: đề thi đã giao cho 1 học sinh ----------
  if (selectedStudent) {
    const doneCount = assignedExams.filter((e) => e.status === 'đã nộp').length;
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          {backButton}
          <Breadcrumb
            items={[...breadcrumbPrefix, { label: displayClassName, onClick: goClass }, { label: selectedStudent.name }]}
          />
        </div>

        <div className="flex items-center gap-4 mb-7 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="w-11 h-11 rounded-full border-2 border-blue-500 text-blue-600 flex items-center justify-center font-semibold text-base">
            {initials(selectedStudent.name)}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">{selectedStudent.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {selectedStudent.gender || '—'} · Sinh {selectedStudent.dob || '—'} · Lớp {displayClassName}
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

  // ---------- Tầng 2: danh sách học sinh trong lớp ----------
  // Trong lúc chờ tải xong chi tiết lớp lần đầu (chưa có classDetail), vẫn
  // hiện breadcrumb + tiêu đề NGAY bằng tên truyền qua prop, khỏi để màn
  // hình trắng trơn trong lúc chờ mạng.
  if (loadingClassDetail && !classDetail) {
    // Skeleton UI (thay "Đang tải..." chặn trắng): hiện sẵn khung tiêu đề +
    // thanh công cụ + ô tìm kiếm + vài dòng học sinh giả (đúng bố cục thật
    // ở nhánh render thành công bên dưới), tên lớp thật đã hiện ngay qua
    // displayClassName (không cần chờ fetch). Dữ liệu về tới đâu, danh
    // sách thật thay vào tới đó.
    return (
      <div className="p-8 max-w-3xl mx-auto animate-pulse">
        <div className="flex items-center gap-3">
          {backButton}
          <Breadcrumb items={[...breadcrumbPrefix, { label: displayClassName }]} />
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 mt-1">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Lớp {displayClassName}</h2>
        </div>

        <div className="h-14 bg-gray-50 border border-gray-200 rounded-lg mb-3" />
        <div className="h-10 bg-gray-100 rounded-lg mb-4" />

        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3.5"
            >
              <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-3.5 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (classDetailError && !classDetail) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-3">
          {backButton}
          <Breadcrumb items={[...breadcrumbPrefix, { label: displayClassName }]} />
        </div>
        <p className="text-sm text-red-600">{classDetailError}</p>
        <button
          type="button"
          onClick={() => loadClassDetail(classId)}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 mt-2"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const filtered = classStudents.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        {backButton}
        <Breadcrumb items={[...breadcrumbPrefix, { label: displayClassName }]} />
      </div>

      {/* Bố trí lại theo đúng kiểu khối "Cài đặt riêng cho lớp này" ở panel
          Giao đề bên dưới: tiêu đề tách hẳn 1 dòng riêng, các nút hành động
          dồn xuống 1 THANH CÔNG CỤ riêng ngay dưới, gom thành 2 NHÓM theo
          đúng ý nghĩa công việc (nhóm "danh sách học sinh" và nhóm "đề
          thi/điểm") thay vì xếp ngẫu nhiên theo thứ tự code — mắt dễ quét,
          tay dễ bấm đúng nút cần. */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">
          Lớp {displayClassName}{' '}
          <span className="text-sm text-gray-400 font-normal">({classStudents.length} học sinh)</span>
        </h2>
        {/* Nút làm mới đứng riêng cạnh tiêu đề (không phải một "hành động"
            ngang hàng Giao đề/Thêm học sinh, chỉ là tiện ích phụ) — giữ
            IconButton nhỏ gọn, tách khỏi thanh công cụ chính bên dưới. */}
        <IconButton
          onClick={() => loadClassStudents(classId)}
          disabled={loadingDetail}
          title="Tải lại danh sách học sinh"
          icon={<RefreshIcon className="w-4 h-4" />}
          hoverClass="hover:text-gray-700 hover:bg-gray-100"
          className="border border-gray-300 shrink-0"
        />
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3.5 py-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
        {/* Nhóm 1: thao tác với DANH SÁCH HỌC SINH của lớp — việc GV làm đầu
            tiên khi vào 1 lớp, nên đặt bên trái và dùng PrimaryButton cho
            "Thêm học sinh" (hành động chính). */}
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
            rộng), tự ẩn khi xuống dòng ở màn hẹp để không tạo 1 gạch lửng lơ
            giữa 2 hàng. */}
        <div className="hidden sm:block w-px self-stretch bg-gray-300" />

        {/* Nhóm 2: thao tác với ĐỀ THI/ĐIỂM của lớp — tách rõ khỏi nhóm 1 vì
            đây là việc làm SAU KHI đã có danh sách học sinh. */}
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
          {/* Xuất bảng điểm Excel/Word, gộp tất cả các đề đã giao cho lớp
              này thành 1 bảng — kiểu Azota. Dùng thẻ <a> tải trực tiếp qua
              GET (trình duyệt tự kèm cookie đăng nhập), không cần gọi
              fetch/blob thủ công. */}
          <div className="relative">
            <SecondaryButton
              onClick={() => {
                const opening = !showScoreExportMenu;
                setShowScoreExportMenu(opening);
                if (opening) {
                  const cached = scoreExportCacheRef.current.get(classId);
                  if (cached) {
                    // Đã có cache cho ĐÚNG lớp này — hiện ngay, không chờ,
                    // rồi âm thầm gọi lại phía sau để đồng bộ nếu GV vừa
                    // giao thêm đề mới (xem loadScoreExportExams ở trên).
                    setScoreExportExams(cached);
                    setScoreExportListError('');
                    loadScoreExportExams(classId, { silent: true });
                  } else {
                    loadScoreExportExams(classId);
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
                  {/* Chọn xuất TẤT CẢ đề hay chỉ 1/vài đề cụ thể — mặc định
                      "Tất cả đề" (selectedScoreExportExamIds rỗng), GV bấm
                      vào từng đề để chỉ lọc riêng đề đó. */}
                  <div className="px-4 pt-2 pb-1.5 border-b border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Chọn đề muốn xuất</p>
                    {loadingScoreExportExams ? (
                      // Skeleton UI nhỏ gọn cho đúng dropdown này: vài dòng
                      // xám thay cho ô checkbox + tên đề, không cần khung to.
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
                          onClick={() => loadScoreExportExams(classId)}
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
                    href={`/api/classes/${classId}/score-export?format=xlsx${
                      selectedScoreExportExamIds.length > 0 ? `&examIds=${selectedScoreExportExamIds.join(',')}` : ''
                    }`}
                    onClick={() => setShowScoreExportMenu(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <FileIcon className="w-4 h-4 text-emerald-600" /> Xuất Excel (.xlsx)
                  </a>
                  <a
                    href={`/api/classes/${classId}/score-export?format=docx${
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

      {/* Tự báo danh kiểu Azota: nút gạt 3 trạng thái thay vì checkbox
          bật/tắt đơn giản, vì GV cần chọn giữa 2 kiểu tự báo danh khác nhau
          — không chỉ bật/tắt. Mặc định TẮT để giữ đúng hành vi cũ (chỉ tên
          có sẵn mới thi được). */}
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
            const active = (classDetail?.selfRegisterMode || 'off') === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChangeSelfRegisterMode(opt.value)}
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
          {classDetail?.selfRegisterMode === 'approval' ? (
            <>
              Học sinh không thấy tên mình khi vào link đề có thể tự nhập tên để "Xin vào lớp", nhưng
              phải chờ giáo viên bấm "Duyệt" trong danh sách bên dưới mới bắt đầu làm bài được.
            </>
          ) : classDetail?.selfRegisterMode === 'auto' ? (
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
          classId={classId}
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
            scoreExportCacheRef.current.delete(classId);
          }}
        />
      )}
      {assignMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3.5 py-2.5 mb-4">
          <p className="mb-2 inline-flex items-center gap-1.5"><CheckIcon className="w-4 h-4 shrink-0" /> {assignMessage}</p>
          {assignLink && (
            <>
              <p className="text-xs text-green-600 mb-1.5">
                Gửi link này cho học sinh lớp {displayClassName} (link "Xuất bản" ở tab Đề thi KHÔNG dùng
                được cho học sinh — thiếu thông tin lớp):
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

      {showImportStudents && (
        <ImportStudentsPanel
          classId={classId}
          onCancel={() => setShowImportStudents(false)}
          onImported={() => {
            setShowImportStudents(false);
            loadClassStudents(classId);
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
                classes={allClasses}
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
                    {/* THÊM MỚI: badge trạng thái đơn giản — chỉ 2 trường hợp
                        GV cần thấy ngay (đang thi / đã thi xong), lấy từ lần
                        hoạt động gần nhất trên toàn bộ đề của em này. Trạng
                        thái "chưa thi" không hiện gì (mặc định, không cần
                        nhấn mạnh), tránh rợp mắt danh sách khi cả lớp chưa
                        ai làm bài. */}
                    {studentActivityStatus[s._id] === 'đang thi' && (
                      <p className="text-xs text-green-600 font-medium mt-0.5 flex items-center gap-1">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                        </span>
                        Đang thi
                      </p>
                    )}
                    {studentActivityStatus[s._id] === 'đã nộp' && (
                      <p className="text-xs text-gray-400 mt-0.5">Đã thi xong</p>
                    )}
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
                {s.hasStudentAccount && (
                  <IconButton
                    onClick={() => handleResetPin(s._id, s.name)}
                    title="Đặt lại PIN (học sinh quên PIN đăng nhập)"
                    icon={<KeyIcon className="w-4 h-4" />}
                    hoverClass="hover:text-amber-600 hover:bg-amber-50"
                  />
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
