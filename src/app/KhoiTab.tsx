'use client';

// ============================================================
// Phần 3b — UI trang Khối. Tự chứa (không sửa page.tsx ngoài việc gắn 1 tab
// mới trỏ vào đây) — mirror đúng UX/style của tab "Quản lý lớp" trong
// page.tsx (Breadcrumb, PrimaryButton, IconButton, ClassForm, panel "Giao đề
// cho lớp"...), theo đúng GHI-CHU-PHAN-3B.md. Toàn bộ API dùng ở đây đã có
// sẵn từ Phần 3a, KHÔNG sửa gì ở src/lib hay các route đã có.
// ============================================================

import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import ClassDetailPanel from './ClassDetailPanel';

// ---------- Kiểu dữ liệu, khớp đúng response API Phần 3a ----------

type KhoiItem = {
  _id: string;
  name: string;
  grade: number;
  schoolYear: string;
  created_at: string;
  classCount: number;
};

type KhoiChildClass = {
  _id: string;
  name: string;
  schoolYear: string;
};

type ExamListItem = {
  _id: string;
  title: string;
  is_published?: boolean;
};

type ShowSolutionMode = 'after_submit' | 'never' | 'after_close' | 'custom_time';

type AssignSettings = {
  duration: number;
  shuffle: boolean;
  maxAttempts: number;
  showSolution: ShowSolutionMode;
  solutionOpenAt: string;
  openAt: string;
  closeAt: string;
};

// ---------- Helper dùng chung (bản riêng cho file này — page.tsx chưa export
// các hàm này nên không import chéo được; giữ đúng hành vi y hệt bản gốc) ----------

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

// ---------- Icon (cùng bộ nét mảnh/stroke với page.tsx) ----------

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

function LayersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3.5 12 12 16.5 20.5 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 16 12 20.5 20.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Nút / breadcrumb dùng chung (bản riêng, cùng style page.tsx) ----------

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

function PrimaryButton({
  onClick,
  disabled,
  icon,
  children,
  type = 'button',
}: {
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
    >
      {icon}
      {children}
    </button>
  );
}

function IconButton({
  onClick,
  title,
  icon,
  hoverClass = 'hover:text-blue-600 hover:bg-blue-50',
  disabled,
}: {
  onClick?: () => void;
  title?: string;
  icon: ReactNode;
  hoverClass?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${hoverClass}`}
    >
      {icon}
    </button>
  );
}

// ============================================================
// Form tạo Khối mới — dòng ~948 ClassForm trong page.tsx là khuôn mẫu, thêm
// dropdown "Số khối" (6-12) vì Khối bắt buộc phải có grade (khác Lớp).
// ============================================================
function KhoiForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (grade: number, schoolYear: string, name: string) => Promise<void> }) {
  const [grade, setGrade] = useState('10');
  const [schoolYear, setSchoolYear] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(Number(grade), schoolYear, name);
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-4 mb-5 shadow-sm space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-[11px] text-gray-500 block mb-1">Số khối</span>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          >
            {Array.from({ length: 7 }, (_, i) => i + 6).map((g) => (
              <option key={g} value={g}>
                Khối {g}
              </option>
            ))}
          </select>
        </label>
        <input
          value={schoolYear}
          onChange={(e) => setSchoolYear(e.target.value)}
          placeholder="Năm học (ví dụ 2025 - 2026)"
          className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Tên hiển thị (mặc định "Khối ${grade}")`}
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
        <button type="button" onClick={onCancel} className="text-sm font-medium text-gray-500 px-3.5 py-2 rounded-lg hover:bg-gray-100 transition-colors">
          Hủy
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Modal "+ Thêm lớp" — 2 chế độ: tạo lớp mới (mode 'new') hoặc gán lớp có
// sẵn chưa thuộc khối nào (mode 'existing') — đúng POST /api/khoi/[id]/add-class.
// ============================================================
function AddClassModal({
  khoiId,
  khoiSchoolYear,
  onClose,
  onAdded,
}: {
  khoiId: string;
  khoiSchoolYear: string;
  onClose: () => void;
  onAdded: (cls: KhoiChildClass) => void;
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');

  // mode 'new'
  const [newName, setNewName] = useState('');
  const [newSchoolYear, setNewSchoolYear] = useState(khoiSchoolYear);

  // mode 'existing'
  const [unassigned, setUnassigned] = useState<KhoiChildClass[]>([]);
  const [loadingUnassigned, setLoadingUnassigned] = useState(true);
  const [unassignedError, setUnassignedError] = useState('');
  const [existingClassId, setExistingClassId] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoadingUnassigned(true);
      setUnassignedError('');
      try {
        const data = await apiFetch<{ classes: KhoiChildClass[] }>(`/api/khoi/${khoiId}/add-class`);
        setUnassigned(data.classes);
      } catch (err: any) {
        setUnassignedError(err.message || 'Không tải được danh sách lớp chưa phân khối.');
      } finally {
        setLoadingUnassigned(false);
      }
    })();
  }, [khoiId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'new' && !newName.trim()) {
      setError('Vui lòng nhập tên lớp.');
      return;
    }
    if (mode === 'existing' && !existingClassId) {
      setError('Vui lòng chọn 1 lớp để gán vào khối.');
      return;
    }
    setSaving(true);
    try {
      const data = await apiFetch<{ class: { _id: string; name: string; schoolYear: string; khoiId: string } }>(
        `/api/khoi/${khoiId}/add-class`,
        {
          method: 'POST',
          body: JSON.stringify(
            mode === 'new'
              ? { mode: 'new', name: newName.trim(), schoolYear: newSchoolYear.trim() || undefined }
              : { mode: 'existing', classId: existingClassId }
          ),
        }
      );
      onAdded({ _id: data.class._id, name: data.class.name, schoolYear: data.class.schoolYear });
    } catch (err: any) {
      setError(err.message || 'Không thêm được lớp.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-gray-800">+ Thêm lớp vào khối</h3>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${
              mode === 'new' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Tạo lớp mới
          </button>
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex-1 text-sm font-semibold px-3 py-2 rounded-lg border transition-colors ${
              mode === 'existing' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            Gán lớp có sẵn
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'new' ? (
            <div className="grid gap-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tên lớp (ví dụ 12A1)"
                className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
              <input
                value={newSchoolYear}
                onChange={(e) => setNewSchoolYear(e.target.value)}
                placeholder="Năm học"
                className="border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
          ) : loadingUnassigned ? (
            <p className="text-sm text-gray-400">Đang tải danh sách lớp chưa phân khối...</p>
          ) : unassignedError ? (
            <p className="text-sm text-red-600">{unassignedError}</p>
          ) : unassigned.length === 0 ? (
            <p className="text-sm text-gray-400">Không có lớp nào đang chưa thuộc khối nào.</p>
          ) : (
            <select
              value={existingClassId}
              onChange={(e) => setExistingClassId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            >
              <option value="">-- Chọn lớp --</option>
              {unassigned.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} · {c.schoolYear}
                </option>
              ))}
            </select>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || (mode === 'existing' && unassigned.length === 0)}
              className="bg-blue-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              {saving ? 'Đang lưu...' : 'Thêm vào khối'}
            </button>
            <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 px-3.5 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Modal "Giao đề" — mirror panel "Giao đề cho lớp" (dòng ~1275-1830 page.tsx)
// nhưng giao hàng loạt cho nhiều lớp con của khối cùng lúc, qua
// POST /api/khoi/[id]/assign-exam.
// ============================================================
function AssignExamModal({
  khoiId,
  classes,
  onClose,
  onAssigned,
}: {
  khoiId: string;
  classes: KhoiChildClass[];
  onClose: () => void;
  onAssigned: (message: string, link: string) => void;
}) {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [examsError, setExamsError] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');

  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [loadingLink, setLoadingLink] = useState(false);
  const [isReopenedLink, setIsReopenedLink] = useState(false);

  const [useCustomSettings, setUseCustomSettings] = useState(false);
  const [customSettings, setCustomSettings] = useState<AssignSettings>({
    duration: 45,
    shuffle: false,
    maxAttempts: 0,
    showSolution: 'after_submit',
    solutionOpenAt: '',
    openAt: '',
    closeAt: '',
  });

  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoadingExams(true);
      setExamsError('');
      try {
        const data = await apiFetch<{ exams: ExamListItem[] }>('/api/exams');
        setExams(data.exams.filter((e) => e.is_published));
      } catch (err: any) {
        setExamsError(err.message || 'Không tải được danh sách đề.');
      } finally {
        setLoadingExams(false);
      }
    })();
  }, []);

  // Khi chọn đề: lấy lại lượt giao qua khối đã có (nếu có) để tick sẵn đúng
  // các lớp đã chọn lần trước — KHÔNG tự tick lớp nào nếu chưa từng giao qua
  // khối này (đúng ràng buộc bắt buộc của spec).
  useEffect(() => {
    if (!selectedExamId) {
      setSelectedClassIds(new Set());
      setUseCustomSettings(false);
      setIsReopenedLink(false);
      return;
    }
    (async () => {
      setLoadingLink(true);
      setError('');
      try {
        const data = await apiFetch<{ link: { code: string; classIds: string[]; updated_at: string } | null }>(
          `/api/khoi/${khoiId}/assign-exam?examId=${selectedExamId}`
        );
        if (data.link) {
          setSelectedClassIds(new Set(data.link.classIds));
          setIsReopenedLink(true);
          // Prefill form cài đặt bằng cài đặt hiện tại của 1 lớp bất kỳ đã
          // tick trước đó (xem mục 3 hướng (a) trong GHI-CHU-PHAN-3B.md) —
          // tránh GV vô tình xoá mất cài đặt cũ khi bấm Lưu lại mà không sửa
          // gì trong form.
          const sampleClassId = data.link.classIds[0];
          if (sampleClassId) {
            try {
              const settingsData = await apiFetch<{ hasCustomSettings: boolean; settings: any; examSettings: any }>(
                `/api/exam-assignment?examId=${selectedExamId}&classId=${sampleClassId}`
              );
              const merged = { ...(settingsData.examSettings || {}), ...(settingsData.settings || {}) };
              setUseCustomSettings(!!settingsData.hasCustomSettings);
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
              setUseCustomSettings(false);
            }
          }
        } else {
          setSelectedClassIds(new Set());
          setIsReopenedLink(false);
          setUseCustomSettings(false);
        }
      } catch (err: any) {
        setError(err.message || 'Không tải được thông tin giao đề trước đó.');
      } finally {
        setLoadingLink(false);
      }
    })();
  }, [selectedExamId, khoiId]);

  function toggleClass(id: string) {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedClassIds((prev) => (prev.size === classes.length ? new Set() : new Set(classes.map((c) => c._id))));
  }

  async function handleSave() {
    if (!selectedExamId) {
      setError('Vui lòng chọn 1 đề để giao.');
      return;
    }
    if (selectedClassIds.size === 0) {
      setError('Vui lòng tick ít nhất 1 lớp để giao đề.');
      return;
    }
    setAssigning(true);
    setError('');
    try {
      const data = await apiFetch<{ assignedClassCount: number; link: { code: string; classIds: string[] } }>(
        `/api/khoi/${khoiId}/assign-exam`,
        {
          method: 'POST',
          body: JSON.stringify({
            examId: selectedExamId,
            classIds: Array.from(selectedClassIds),
            settings: useCustomSettings
              ? {
                  duration: Math.max(1, Number(customSettings.duration) || 45),
                  shuffle: customSettings.shuffle,
                  maxAttempts: Math.max(0, Number(customSettings.maxAttempts) || 0),
                  showSolution: customSettings.showSolution,
                  solutionOpenAt: datetimeLocalToIso(customSettings.solutionOpenAt),
                  openAt: datetimeLocalToIso(customSettings.openAt),
                  closeAt: datetimeLocalToIso(customSettings.closeAt),
                }
              : {},
          }),
        }
      );
      const longLink = `${window.location.origin}/thi/${selectedExamId}?g=${data.link.code}`;
      // THÊM MỚI (rút gọn link chia sẻ): link giao đề qua Khối vẫn dài (còn
      // nguyên examId 24 ký tự trong path dù đã có ?g= ngắn), nên rút gọn
      // thêm 1 lớp thành /s/{code} — cùng cơ chế với link giao đề theo lớp
      // (xem AssignExamPanel ở page.tsx/ClassDetailPanel.tsx). Lỗi thì rơi
      // về dùng longLink như hành vi cũ, không chặn việc giao đề.
      let link = longLink;
      try {
        const short = await apiFetch<{ code: string }>('/api/short-link', {
          method: 'POST',
          body: JSON.stringify({
            examId: selectedExamId,
            target: `/thi/${selectedExamId}?g=${data.link.code}`,
          }),
        });
        link = `${window.location.origin}/s/${short.code}`;
      } catch {
        // giữ nguyên longLink
      }
      onAssigned(`Đã giao đề cho ${data.assignedClassCount} lớp.`, link);
    } catch (err: any) {
      setError(err.message || 'Không giao được đề.');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-3.5 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-gray-800">Giao đề cho khối</h3>

        {loadingExams ? (
          <p className="text-sm text-gray-400">Đang tải danh sách đề...</p>
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

            {selectedExamId && loadingLink && <p className="text-xs text-gray-400">Đang kiểm tra lượt giao đề trước đó...</p>}

            {selectedExamId && !loadingLink && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Chọn lớp trong khối {isReopenedLink && <span className="text-blue-600 normal-case font-normal">(đã tick sẵn theo lượt giao trước)</span>}
                    </p>
                    <button type="button" onClick={toggleAll} className="text-xs text-blue-600 hover:underline font-medium shrink-0">
                      {selectedClassIds.size === classes.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 max-h-40 overflow-y-auto pr-1 border border-gray-100 rounded-lg p-2">
                    {classes.map((c) => (
                      <label key={c._id} className="flex items-center gap-2 px-2 py-1 rounded-lg text-sm text-gray-700 hover:bg-gray-50 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedClassIds.has(c._id)}
                          onChange={() => toggleClass(c._id)}
                          className="rounded border-gray-300 shrink-0"
                        />
                        <span className="truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomSettings}
                      onChange={(e) => setUseCustomSettings(e.target.checked)}
                      className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                    />
                    <span className="text-xs text-amber-800 font-bold uppercase tracking-wide">Dùng cài đặt riêng cho các lớp được tick</span>
                  </label>

                  {!useCustomSettings ? (
                    <p className="text-xs text-amber-700">
                      Các lớp được tick sẽ dùng nguyên cài đặt mặc định của đề. Nếu 1 lớp trong số này trước đó đã có cài đặt
                      riêng (đặt thủ công ở trang Lớp), bấm Lưu ở đây sẽ đưa lớp đó về lại mặc định của đề.
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
                          onChange={(e) => setCustomSettings((s) => ({ ...s, showSolution: e.target.value as ShowSolutionMode }))}
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
                        <ClockIcon className="w-3.5 h-3.5" /> Giờ mở/đóng đề (để trống = không giới hạn giờ)
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
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={assigning || !selectedExamId || exams.length === 0}
            className="bg-blue-600 text-white text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
          >
            {assigning ? 'Đang lưu...' : 'Lưu'}
          </button>
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-500 px-3.5 py-2 rounded-lg hover:bg-gray-100 transition-colors">
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tầng 2 — chi tiết 1 khối: liệt kê lớp con (chỉ đọc) + 2 nút "+ Thêm lớp" /
// "Giao đề".
// ============================================================
function KhoiDetailView({
  khoiId,
  onBack,
  onKhoiChanged,
}: {
  khoiId: string;
  onBack: () => void;
  onKhoiChanged: () => void;
}) {
  const [khoi, setKhoi] = useState<{ _id: string; name: string; grade: number; schoolYear: string } | null>(null);
  const [classes, setClasses] = useState<KhoiChildClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Phần 5 — GV bấm vào 1 thẻ lớp con -> chuyển sang xem chi tiết lớp đó
  // (ClassDetailPanel) ngay trong Khối, không cần văng sang tab "Quản lý
  // lớp" cũ nữa. null = đang ở tầng 2 (danh sách lớp con của khối).
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const [showAddClass, setShowAddClass] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // THÊM MỚI: sửa/xóa 1 lớp con ngay trong thẻ lớp ở tầng 2 của Khối — mirror
  // đúng nút Pencil/Trash + form sửa lớp đã có ở tab "Quản lý lớp" (page.tsx,
  // dòng ~2662-2696), dùng chung API PUT/DELETE /api/classes/[id] đã có sẵn.
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classNameInput, setClassNameInput] = useState('');
  const [classSchoolYearInput, setClassSchoolYearInput] = useState('');
  const [savingClass, setSavingClass] = useState(false);

  const [assignedMessage, setAssignedMessage] = useState('');
  const [assignedLink, setAssignedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ khoi: { _id: string; name: string; grade: number; schoolYear: string }; classes: KhoiChildClass[] }>(
        `/api/khoi/${khoiId}`
      );
      setKhoi(data.khoi);
      setClasses(data.classes);
    } catch (err: any) {
      setError(err.message || 'Không tải được khối này.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khoiId]);

  async function handleSaveName() {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      await apiFetch(`/api/khoi/${khoiId}`, { method: 'PUT', body: JSON.stringify({ name: nameInput.trim() }) });
      setKhoi((prev) => (prev ? { ...prev, name: nameInput.trim() } : prev));
      setEditingName(false);
      onKhoiChanged();
    } catch (err: any) {
      alert(err.message || 'Không đổi được tên khối.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleDeleteKhoi() {
    if (!khoi) return;
    if (!window.confirm(`Xóa khối "${khoi.name}"? Chỉ xóa được khi khối không còn lớp con nào.`)) return;
    try {
      await apiFetch(`/api/khoi/${khoiId}`, { method: 'DELETE' });
      onKhoiChanged();
      onBack();
    } catch (err: any) {
      alert(err.message || 'Không xóa được khối.');
    }
  }

  function handleStartEditClass(c: KhoiChildClass) {
    setEditingClassId(c._id);
    setClassNameInput(c.name);
    setClassSchoolYearInput(c.schoolYear);
  }

  async function handleSaveClass(classId: string) {
    if (!classNameInput.trim()) return;
    setSavingClass(true);
    try {
      const data = await apiFetch<{ class: KhoiChildClass }>(`/api/classes/${classId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: classNameInput.trim(), schoolYear: classSchoolYearInput.trim() }),
      });
      setClasses((prev) =>
        prev.map((c) => (c._id === classId ? { ...c, name: data.class.name, schoolYear: data.class.schoolYear } : c))
      );
      setEditingClassId(null);
    } catch (err: any) {
      alert(err.message || 'Không sửa được lớp.');
    } finally {
      setSavingClass(false);
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

  if (loading) {
    // Skeleton UI (thay "Đang tải..." chặn trắng): hiện sẵn khung breadcrumb
    // + tiêu đề khối (khối xám nhấp nháy, vì tên khối chưa có) + lưới thẻ
    // lớp giả đúng bố cục thật (xem nhánh render thành công bên dưới) —
    // dữ liệu về tới đâu, màn thật thay vào tới đó.
    return (
      <div className="p-8 max-w-3xl mx-auto animate-pulse">
        <div className="h-3.5 bg-gray-100 rounded w-40 mb-5" />
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <div className="h-6 bg-gray-200 rounded w-32" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="h-4 bg-gray-200 rounded w-2/5 mb-2.5" />
              <div className="h-3 bg-gray-100 rounded w-3/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !khoi) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Breadcrumb items={[{ label: 'Quản lí Khối-lớp', onClick: onBack }, { label: 'Chi tiết' }]} />
        <p className="text-sm text-red-600">{error || 'Không tìm thấy khối này.'}</p>
      </div>
    );
  }

  // Đang xem chi tiết 1 lớp con -> return SỚM, chỉ render ClassDetailPanel
  // (nó tự vẽ breadcrumb/tiêu đề/nút hành động riêng của nó qua
  // breadcrumbPrefix, không hiện lại Breadcrumb/tiêu đề/nút "Thêm lớp"/"Giao
  // đề" của KhoiDetailView nữa) — y hệt cách page.tsx tách 3 nhánh return
  // cho ClassesTab.
  if (selectedClassId) {
    return (
      <ClassDetailPanel
        classId={selectedClassId}
        className={classes.find((c) => c._id === selectedClassId)?.name || ''}
        onBack={() => setSelectedClassId(null)}
        breadcrumbPrefix={[{ label: 'Quản lí Khối-lớp', onClick: onBack }, { label: khoi.name }]}
      />
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumb items={[{ label: 'Quản lí Khối-lớp', onClick: onBack }, { label: khoi.name }]} />

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName}
                className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingName ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button onClick={() => setEditingName(false)} className="text-xs text-gray-500 px-2.5 py-1.5 hover:bg-gray-100 rounded-lg">
                Hủy
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">{khoi.name}</h2>
              <IconButton
                onClick={() => {
                  setNameInput(khoi.name);
                  setEditingName(true);
                }}
                title="Sửa tên khối"
                icon={<PencilIcon className="w-4 h-4" />}
                hoverClass="hover:text-blue-600 hover:bg-blue-50"
              />
              <IconButton onClick={handleDeleteKhoi} title="Xóa khối" icon={<TrashIcon className="w-4 h-4" />} hoverClass="hover:text-red-600 hover:bg-red-50" />
            </div>
          )}
          <p className="text-sm text-gray-400 mt-0.5">
            {classes.length} lớp · Năm học {khoi.schoolYear}
          </p>
        </div>
        <div className="flex gap-2">
          <PrimaryButton onClick={() => setShowAddClass(true)} icon={<PlusIcon className="w-4 h-4" />}>
            Thêm lớp
          </PrimaryButton>
          <button
            type="button"
            onClick={() => setShowAssign(true)}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3.5 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-400 shadow-sm transition-colors"
          >
            <LinkIcon className="w-4 h-4 text-blue-500" /> Giao đề
          </button>
        </div>
      </div>

      {assignedMessage && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-3 mb-5">
          <p className="text-sm text-blue-800 font-medium mb-1.5">✓ {assignedMessage}</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={assignedLink}
              onFocus={(e) => e.target.select()}
              className="flex-1 border border-blue-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(assignedLink);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                } catch {}
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              {linkCopied ? (
                <span className="inline-flex items-center gap-1">
                  <CheckIcon className="w-3.5 h-3.5" /> Đã copy
                </span>
              ) : (
                'Copy'
              )}
            </button>
          </div>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl py-10 text-center">
          <p className="text-sm text-gray-400">Khối này chưa có lớp con nào. Bấm &quot;Thêm lớp&quot; để bắt đầu.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) =>
            editingClassId === c._id ? (
              <div key={c._id} className="bg-white border border-blue-300 rounded-xl p-5 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  placeholder="Tên lớp"
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
                <input
                  value={classSchoolYearInput}
                  onChange={(e) => setClassSchoolYearInput(e.target.value)}
                  placeholder="Năm học"
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveClass(c._id)}
                    disabled={savingClass}
                    className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingClass ? 'Đang lưu...' : 'Lưu'}
                  </button>
                  <button
                    onClick={() => setEditingClassId(null)}
                    className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={c._id}
                onClick={() => setSelectedClassId(c._id)}
                className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-blue-300 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-gray-900 truncate">{c.name}</p>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      onClick={() => handleStartEditClass(c)}
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
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Năm học {c.schoolYear}</p>
              </div>
            )
          )}
        </div>
      )}

      {showAddClass && (
        <AddClassModal
          khoiId={khoiId}
          khoiSchoolYear={khoi.schoolYear}
          onClose={() => setShowAddClass(false)}
          onAdded={(cls) => {
            setClasses((prev) => [...prev, cls].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAddClass(false);
            onKhoiChanged();
          }}
        />
      )}

      {showAssign && (
        <AssignExamModal
          khoiId={khoiId}
          classes={classes}
          onClose={() => setShowAssign(false)}
          onAssigned={(message, link) => {
            setAssignedMessage(message);
            setAssignedLink(link);
            setShowAssign(false);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Phần 6 — "Chưa phân khối": lớp có tên lạ (detectGrade không nhận diện
// được) hoặc dữ liệu cũ chưa migrate. Mirror UI thẻ lớp của KhoiDetailView,
// bấm vào 1 lớp mở ClassDetailPanel y hệt Phần 5 (dùng lại nguyên component,
// không viết lại). KHÔNG có nút "Giao đề" hàng loạt ở đây (các lớp này chưa
// cùng 1 khối rõ ràng) — chọn phương án ĐƠN GIẢN: chỉ gợi ý GV vào đúng Khối
// cần rồi bấm "Thêm lớp" → "Gán lớp có sẵn" (đã có sẵn ở AddClassModal),
// KHÔNG tự chế thêm API mới cho việc gán khối ở view này.
// ============================================================
function UnassignedClassesView({ onBack }: { onBack: () => void }) {
  const [classes, setClasses] = useState<KhoiChildClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // THÊM MỚI: sửa/xóa lớp ngay ở đây, mirror KhoiDetailView — trước đây
  // thẻ lớp ở view này không có nút Pencil/Trash nào cả (chỉ bấm vào để mở
  // ClassDetailPanel), GV muốn đổi tên/xóa 1 lớp chưa phân khối phải đoán mò.
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classNameInput, setClassNameInput] = useState('');
  const [classSchoolYearInput, setClassSchoolYearInput] = useState('');
  const [savingClass, setSavingClass] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ classes: KhoiChildClass[] }>('/api/classes/unassigned');
      setClasses(data.classes);
    } catch (err: any) {
      setError(err.message || 'Không tải được danh sách lớp chưa phân khối.');
    } finally {
      setLoading(false);
    }
  }

  function handleStartEditClass(c: KhoiChildClass) {
    setEditingClassId(c._id);
    setClassNameInput(c.name);
    setClassSchoolYearInput(c.schoolYear);
  }

  async function handleSaveClass(classId: string) {
    if (!classNameInput.trim()) return;
    setSavingClass(true);
    try {
      const data = await apiFetch<{ class: KhoiChildClass }>(`/api/classes/${classId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: classNameInput.trim(), schoolYear: classSchoolYearInput.trim() }),
      });
      setClasses((prev) =>
        prev.map((c) => (c._id === classId ? { ...c, name: data.class.name, schoolYear: data.class.schoolYear } : c))
      );
      setEditingClassId(null);
    } catch (err: any) {
      alert(err.message || 'Không sửa được lớp.');
    } finally {
      setSavingClass(false);
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

  useEffect(() => {
    load();
  }, []);

  // Đang xem chi tiết 1 lớp -> return SỚM, chỉ render ClassDetailPanel, y hệt
  // cách KhoiDetailView nhúng ClassDetailPanel ở Phần 5.
  if (selectedClassId) {
    return (
      <ClassDetailPanel
        classId={selectedClassId}
        className={classes.find((c) => c._id === selectedClassId)?.name || ''}
        onBack={() => {
          setSelectedClassId(null);
          // Lớp có thể vừa được gán vào 1 khối thật ở nơi khác (ví dụ GV mở
          // 2 tab) trong lúc đang xem -> tải lại để danh sách "chưa phân
          // khối" luôn khớp thực tế khi quay lại.
          load();
        }}
        breadcrumbPrefix={[{ label: 'Quản lí Khối-lớp', onClick: onBack }, { label: 'Chưa phân khối' }]}
      />
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumb items={[{ label: 'Quản lí Khối-lớp', onClick: onBack }, { label: 'Chưa phân khối' }]} />

      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Chưa phân khối</h2>
        <p className="text-sm text-gray-400 mt-0.5">{classes.length} lớp chưa thuộc khối nào</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-3 mb-5 text-xs text-amber-800">
        Đây là các lớp có tên không tự nhận diện được số khối (6-12), hoặc dữ
        liệu cũ chưa được gán khối. Để đưa 1 lớp vào đúng khối: vào Khối cần
        gán → bấm &quot;Thêm lớp&quot; → chọn &quot;Gán lớp có sẵn&quot; →
        chọn đúng lớp đó.
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Đang tải...</p>
      ) : classes.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl py-10 text-center">
          <p className="text-sm text-gray-400">Không còn lớp nào chưa phân khối.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) =>
            editingClassId === c._id ? (
              <div key={c._id} className="bg-white border border-blue-300 rounded-xl p-5 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  placeholder="Tên lớp"
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
                <input
                  value={classSchoolYearInput}
                  onChange={(e) => setClassSchoolYearInput(e.target.value)}
                  placeholder="Năm học"
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveClass(c._id)}
                    disabled={savingClass}
                    className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingClass ? 'Đang lưu...' : 'Lưu'}
                  </button>
                  <button
                    onClick={() => setEditingClassId(null)}
                    className="text-xs font-medium text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={c._id}
                onClick={() => setSelectedClassId(c._id)}
                className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:border-blue-300 hover:shadow-md transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-gray-900 truncate">{c.name}</p>
                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      onClick={() => handleStartEditClass(c)}
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
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Năm học {c.schoolYear}</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tầng 1 — danh sách Khối. Mirror bố cục tab "Quản lý lớp" (dòng ~2604+
// page.tsx).
// ============================================================
export default function KhoiTab() {
  const [khois, setKhois] = useState<KhoiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedKhoiId, setSelectedKhoiId] = useState<string | null>(null);
  // Phần 6 — bucket "ảo" cho các lớp GV có nhưng chưa thuộc khối nào (khoiId:
  // null). Chỉ hiện thẻ này ở tầng 1 khi có ít nhất 1 lớp như vậy.
  const [unassignedClasses, setUnassignedClasses] = useState<KhoiChildClass[]>([]);
  const [showUnassigned, setShowUnassigned] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    // Gọi song song GET /api/khoi + GET /api/classes/unassigned. Dùng
    // allSettled (không phải all) để 1 trong 2 lỗi không kéo lỗi cả 2 — bucket
    // "Chưa phân khối" không tải được không phải lỗi chặn đường xem danh sách
    // khối chính, chỉ đơn giản là tạm không hiện bucket đó.
    const [khoiResult, unassignedResult] = await Promise.allSettled([
      apiFetch<{ khois: KhoiItem[] }>('/api/khoi'),
      apiFetch<{ classes: KhoiChildClass[] }>('/api/classes/unassigned'),
    ]);
    if (khoiResult.status === 'fulfilled') {
      setKhois(khoiResult.value.khois);
    } else {
      setError(khoiResult.reason?.message || 'Không tải được danh sách khối.');
    }
    setUnassignedClasses(unassignedResult.status === 'fulfilled' ? unassignedResult.value.classes : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreateKhoi(grade: number, schoolYear: string, name: string) {
    const data = await apiFetch<{ khoi: KhoiItem }>('/api/khoi', {
      method: 'POST',
      body: JSON.stringify({ grade, schoolYear, name: name.trim() || undefined }),
    });
    setKhois((prev) => [data.khoi, ...prev]);
    setShowCreate(false);
  }

  if (selectedKhoiId) {
    return (
      <KhoiDetailView
        khoiId={selectedKhoiId}
        onBack={() => setSelectedKhoiId(null)}
        onKhoiChanged={load}
      />
    );
  }

  // Đang xem bucket "Chưa phân khối" -> return SỚM, chỉ render
  // UnassignedClassesView (nó tự vẽ breadcrumb riêng qua breadcrumbPrefix,
  // giống hệt cách selectedKhoiId tách nhánh ở trên).
  if (showUnassigned) {
    return (
      <UnassignedClassesView
        onBack={() => {
          setShowUnassigned(false);
          // Tải lại để cập nhật số lớp "chưa phân khối" (có thể vừa gán bớt
          // vào 1 khối thật trong lúc xem) + danh sách khối (classCount có
          // thể đã đổi).
          load();
        }}
      />
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Breadcrumb items={[{ label: 'Quản lí Khối-lớp' }]} />

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Quản lí Khối-lớp</h2>
          <p className="text-sm text-gray-400 mt-0.5">{khois.length} khối</p>
        </div>
        <PrimaryButton onClick={() => setShowCreate((v) => !v)} icon={<PlusIcon className="w-4 h-4" />}>
          Tạo khối
        </PrimaryButton>
      </div>

      {showCreate && <KhoiForm onCancel={() => setShowCreate(false)} onSubmit={handleCreateKhoi} />}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Đang tải...</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {khois.map((k) => (
            <div key={k._id} className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:shadow-md hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <button onClick={() => setSelectedKhoiId(k._id)} className="font-bold text-gray-900 text-left inline-flex items-center gap-1.5">
                  <LayersIcon className="w-4 h-4 text-blue-500 shrink-0" /> {k.name}
                </button>
                <IconButton
                  onClick={() => setSelectedKhoiId(k._id)}
                  title="Vào khối"
                  icon={<ChevronRightIcon className="w-4 h-4" />}
                  hoverClass="hover:text-gray-700 hover:bg-gray-100"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {k.classCount} lớp · Năm học {k.schoolYear}
              </p>
            </div>
          ))}
          {/* Bucket "ảo" — style khác biệt nhẹ (viền nét đứt) để GV phân biệt
              đây không phải 1 khối thật, chỉ là nơi gom tạm các lớp chưa gán
              được khối nào. Chỉ hiện khi có ít nhất 1 lớp như vậy. */}
          {unassignedClasses.length > 0 && (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-5 text-left hover:shadow-md hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowUnassigned(true)}
                  className="font-bold text-gray-500 text-left inline-flex items-center gap-1.5"
                >
                  <LayersIcon className="w-4 h-4 text-gray-400 shrink-0" /> Chưa phân khối
                </button>
                <IconButton
                  onClick={() => setShowUnassigned(true)}
                  title="Xem các lớp chưa phân khối"
                  icon={<ChevronRightIcon className="w-4 h-4" />}
                  hoverClass="hover:text-gray-700 hover:bg-gray-100"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{unassignedClasses.length} lớp chưa thuộc khối nào</p>
            </div>
          )}
          {khois.length === 0 && unassignedClasses.length === 0 && !error && (
            <div className="border border-dashed border-gray-300 rounded-xl py-10 text-center col-span-2">
              <p className="text-sm text-gray-400">Chưa có khối nào. Bấm &quot;Tạo khối&quot; để tạo khối đầu tiên.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
