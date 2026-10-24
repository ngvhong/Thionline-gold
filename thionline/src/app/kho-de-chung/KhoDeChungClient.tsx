'use client';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): trang GV duyệt kho
// đề chung (cây thư mục do admin dựng, xem LibraryAdminSection.tsx), xem
// preview readonly 1 đề đã share, bấm "Lấy đề này về" để nhân bản thành đề
// riêng. Route độc lập, chỉ vào được khi có session GV hợp lệ.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { renderExamText, buildTikzSvgMap, buildImageUrlMap } from '@/lib/examRender';
// SỬA (đồng bộ icon): thay emoji 📚/📥 bằng icon SVG nét mảnh dùng chung,
// xem giải thích trong LibraryIcons.tsx.
import { LibraryBookIcon, LibraryDownloadIcon } from '@/components/LibraryIcons';

type FolderNode = {
  _id: string;
  name: string;
  parentId: string | null;
  order: number;
  examCount: number;
};

type LibraryExamSummary = {
  _id: string;
  title: string;
  created_at: string;
  published_at: string | null;
  teacherName: string;
  questionCount: number;
};

type LibraryExamPreview = {
  _id: string;
  title: string;
  raw_data: any;
  settings: any;
  created_at: string;
  teacherName: string;
};

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại.');
  return data as T;
}

function buildChildrenMap(folders: FolderNode[]): Record<string, FolderNode[]> {
  const map: Record<string, FolderNode[]> = {};
  for (const f of folders) {
    const key = f.parentId || 'root';
    if (!map[key]) map[key] = [];
    map[key].push(f);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi'));
  }
  return map;
}

// Cây thư mục — chỉ 1 nhánh được chọn (highlight) tại 1 thời điểm, bấm vào
// tên nhánh để chọn, mũi tên nhỏ để mở/đóng nhánh con.
function FolderTree({
  childrenMap,
  parentKey,
  depth,
  selectedId,
  onSelect,
  expanded,
  onToggleExpand,
}: {
  childrenMap: Record<string, FolderNode[]>;
  parentKey: string;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  expanded: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
}) {
  const nodes = childrenMap[parentKey] || [];
  if (nodes.length === 0) return null;
  return (
    <ul className={depth > 0 ? 'ml-3 border-l border-gray-100 pl-2' : ''}>
      {nodes.map((f) => {
        const hasChildren = !!childrenMap[f._id]?.length;
        const isExpanded = !!expanded[f._id];
        return (
          <li key={f._id}>
            <div className="flex items-center gap-1">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggleExpand(f._id)}
                  className="w-4 h-4 shrink-0 text-gray-400 hover:text-gray-600 text-xs"
                  aria-label={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              ) : (
                <span className="w-4 h-4 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => onSelect(f._id)}
                className={`flex-1 text-left px-2 py-1.5 rounded-lg text-sm transition ${
                  selectedId === f._id ? 'bg-blue-100 text-blue-800 font-semibold' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {f.name}
                {f.examCount > 0 && <span className="text-xs text-gray-400 ml-1.5">({f.examCount})</span>}
              </button>
            </div>
            {isExpanded && (
              <FolderTree
                childrenMap={childrenMap}
                parentKey={f._id}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                expanded={expanded}
                onToggleExpand={onToggleExpand}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ExamPreviewModal({ examId, onClose, onCloned }: { examId: string; onClose: () => void; onCloned: (newExamId: string) => void }) {
  const [preview, setPreview] = useState<LibraryExamPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch<{ exam: LibraryExamPreview }>(`/api/library/exams/${examId}`);
        if (!cancelled) setPreview(data.exam);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Không tải được đề thi này.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const tikzSvgMap = useMemo(() => buildTikzSvgMap(preview?.raw_data?.tikz_list), [preview]);
  const imageUrlMap = useMemo(() => buildImageUrlMap(preview?.raw_data?.image_list), [preview]);

  async function handleClone() {
    if (!window.confirm('Lấy đề này về? Hệ thống sẽ tạo 1 bản sao riêng của bạn, không ảnh hưởng đề gốc.')) return;
    setCloning(true);
    try {
      const data = await apiFetch<{ newExamId: string }>(`/api/library/exams/${examId}/clone`, { method: 'POST' });
      onCloned(data.newExamId);
    } catch (err: any) {
      alert(err.message || 'Không lấy được đề này về.');
    } finally {
      setCloning(false);
    }
  }

  const raw = preview?.raw_data || {};

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900 truncate pr-3">{preview?.title || 'Xem trước đề'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none w-7 h-7 shrink-0" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-gray-500">Đang tải...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && preview && (
            <>
              <p className="text-xs text-gray-500 mb-4">Của GV: {preview.teacherName}</p>

              {(raw.phan_1_TracNghiem || []).length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-slate-700 text-sm mb-2 bg-slate-100 px-3 py-1.5 rounded-lg">Phần I — Trắc nghiệm</h4>
                  {raw.phan_1_TracNghiem.map((q: any, i: number) => (
                    <div key={q.id || i} className="mb-3 text-sm">
                      <div className="font-semibold whitespace-pre-wrap">
                        Câu {i + 1}: {renderExamText(q.content, tikzSvgMap, `pv-p1-${i}-c`, imageUrlMap)}
                      </div>
                      <div className="pl-4 mt-1 space-y-0.5">
                        {(q.options || []).map((opt: any, oi: number) => (
                          <div key={oi} className={opt.isCorrect ? 'text-green-700 font-semibold' : 'text-gray-600'}>
                            {String.fromCharCode(65 + oi)}. {renderExamText(opt.text, tikzSvgMap, `pv-p1-${i}-o${oi}`, imageUrlMap)}
                            {opt.isCorrect && ' ✓'}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(raw.phan_2_DungSai || []).length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-slate-700 text-sm mb-2 bg-slate-100 px-3 py-1.5 rounded-lg">Phần II — Đúng/Sai</h4>
                  {raw.phan_2_DungSai.map((q: any, i: number) => (
                    <div key={q.id || i} className="mb-3 text-sm">
                      <div className="font-semibold whitespace-pre-wrap">
                        Câu {i + 1}: {renderExamText(q.content, tikzSvgMap, `pv-p2-${i}-c`, imageUrlMap)}
                      </div>
                      <div className="pl-4 mt-1 space-y-0.5">
                        {(q.options || []).map((opt: any, oi: number) => (
                          <div key={oi} className="text-gray-600">
                            {String.fromCharCode(97 + oi)}) {renderExamText(opt.text, tikzSvgMap, `pv-p2-${i}-o${oi}`, imageUrlMap)} —{' '}
                            <span className={opt.isCorrect ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                              {opt.isCorrect ? 'Đúng' : 'Sai'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(raw.phan_3_TraLoiNgan || []).length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-slate-700 text-sm mb-2 bg-slate-100 px-3 py-1.5 rounded-lg">Phần III — Trả lời ngắn</h4>
                  {raw.phan_3_TraLoiNgan.map((q: any, i: number) => (
                    <div key={q.id || i} className="mb-3 text-sm">
                      <div className="font-semibold whitespace-pre-wrap">
                        Câu {i + 1}: {renderExamText(q.content, tikzSvgMap, `pv-p3-${i}-c`, imageUrlMap)}
                      </div>
                      {q.answer && <div className="pl-4 mt-1 text-green-700 font-semibold">Đáp số: {q.answer}</div>}
                    </div>
                  ))}
                </div>
              )}

              {(raw.phan_4_TuLuan || []).length > 0 && (
                <div className="mb-6">
                  <h4 className="font-bold text-slate-700 text-sm mb-2 bg-slate-100 px-3 py-1.5 rounded-lg">Phần IV — Tự luận</h4>
                  {raw.phan_4_TuLuan.map((q: any, i: number) => (
                    <div key={q.id || i} className="mb-3 text-sm">
                      <div className="font-semibold whitespace-pre-wrap">
                        Câu {i + 1}: {renderExamText(q.content, tikzSvgMap, `pv-p4-${i}-c`, imageUrlMap)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 hover:text-gray-700 py-2 px-4">
            Đóng
          </button>
          <button
            type="button"
            disabled={loading || !!error || cloning}
            onClick={handleClone}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm py-2 px-4 rounded-lg transition"
          >
            {cloning ? (
              'Đang lấy về...'
            ) : (
              <>
                <LibraryDownloadIcon className="w-4 h-4 shrink-0" />
                Lấy đề này về
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KhoDeChungClient() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [treeError, setTreeError] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [exams, setExams] = useState<LibraryExamSummary[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examsError, setExamsError] = useState('');

  const [previewExamId, setPreviewExamId] = useState<string | null>(null);

  // Bắt buộc có session GV hợp lệ — cùng pattern với dashboard GV
  // (page.tsx), không tạo cơ chế kiểm tra riêng.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (cancelled) return;
        if (!data.teacher) {
          router.replace('/login');
          return;
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

  async function loadTree() {
    setTreeError('');
    try {
      const data = await apiFetch<{ folders: FolderNode[] }>('/api/library/tree');
      setFolders(data.folders);
    } catch (err: any) {
      setTreeError(err.message || 'Không tải được cây thư mục.');
    }
  }

  useEffect(() => {
    if (!checkingSession) loadTree();
  }, [checkingSession]);

  async function loadExams(folderId: string) {
    setExamsLoading(true);
    setExamsError('');
    try {
      const data = await apiFetch<{ exams: LibraryExamSummary[] }>(`/api/library/exams?folderId=${folderId}`);
      setExams(data.exams);
    } catch (err: any) {
      setExamsError(err.message || 'Không tải được danh sách đề.');
    } finally {
      setExamsLoading(false);
    }
  }

  function handleSelectFolder(id: string) {
    setSelectedFolderId(id);
    loadExams(id);
  }

  function handleCloned(newExamId: string) {
    setPreviewExamId(null);
    alert('✅ Đã lấy đề về danh sách đề của bạn! Đang chuyển sang màn soạn đề để sửa tiếp...');
    router.push(`/?tab=exams&openExam=${newExamId}`);
  }

  const childrenMap = useMemo(() => buildChildrenMap(folders), [folders]);

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Đang kiểm tra đăng nhập...</div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <LibraryBookIcon className="w-5 h-5 shrink-0 text-blue-600" />
            Kho đề chung
          </h1>
          <button onClick={() => router.push('/')} className="text-sm font-semibold text-gray-500 hover:text-gray-700">
            ← Về Trang chủ
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Duyệt đề do các giáo viên khác đã chia sẻ theo cây thư mục, xem trước rồi lấy về dùng cho lớp của bạn.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-2">Thư mục</h2>
            {treeError && <p className="text-sm text-red-600 px-2">{treeError}</p>}
            {!treeError && folders.length === 0 && <p className="text-sm text-gray-400 px-2">Chưa có nhánh nào.</p>}
            <FolderTree
              childrenMap={childrenMap}
              parentKey="root"
              depth={0}
              selectedId={selectedFolderId}
              onSelect={handleSelectFolder}
              expanded={expanded}
              onToggleExpand={(id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))}
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            {!selectedFolderId && <p className="text-sm text-gray-400">Chọn 1 nhánh thư mục bên trái để xem đề đã chia sẻ.</p>}
            {selectedFolderId && examsLoading && <p className="text-sm text-gray-500">Đang tải...</p>}
            {selectedFolderId && examsError && <p className="text-sm text-red-600">{examsError}</p>}
            {selectedFolderId && !examsLoading && !examsError && (
              <>
                {exams.length === 0 ? (
                  <p className="text-sm text-gray-400">Nhánh này chưa có đề nào được chia sẻ.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {exams.map((e) => (
                      <li key={e._id} className="py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 truncate">{e.title}</p>
                          <p className="text-xs text-gray-400">
                            GV {e.teacherName} · {e.questionCount} câu
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewExamId(e._id)}
                          className="shrink-0 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-sm py-1.5 px-3 rounded-lg transition"
                        >
                          Xem trước
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {previewExamId && (
        <ExamPreviewModal examId={previewExamId} onClose={() => setPreviewExamId(null)} onCloned={handleCloned} />
      )}
    </div>
  );
}
