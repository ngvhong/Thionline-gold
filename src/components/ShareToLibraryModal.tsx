'use client';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): popup mở khi GV bấm
// nút "Chia sẻ vào kho chung" trong ExamBuilder.tsx — chọn 1 nhánh cây (từ
// GET /api/library/tree), bật/tắt 2 cờ (shareWithTeachers, openForStudents
// — cờ thứ 2 dùng ở Giai đoạn 4, chỉ hiện UI ở đây, CHƯA có tác dụng thật
// với học sinh cho tới khi Giai đoạn 4 thêm route đọc field này). Tách file
// riêng (không viết thẳng vào ExamBuilder.tsx vốn đã hơn 7000 dòng), tự gọi
// GET /api/exams/[id] để lấy trạng thái chia sẻ hiện tại của đề — không cần
// ExamBuilder truyền thêm state nào khác ngoài examId + title.
import { useEffect, useMemo, useState } from 'react';
// SỬA (đồng bộ icon): thay emoji 📚 bằng icon SVG nét mảnh dùng chung, xem
// giải thích trong LibraryIcons.tsx.
import { LibraryBookIcon } from '@/components/LibraryIcons';

type FolderNode = {
  _id: string;
  name: string;
  parentId: string | null;
  order: number;
  examCount: number;
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

function flattenWithDepth(folders: FolderNode[], parentId: string | null = null, depth = 0): (FolderNode & { depth: number })[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi'))
    .flatMap((f) => [{ ...f, depth }, ...flattenWithDepth(folders, f._id, depth + 1)]);
}

export default function ShareToLibraryModal({
  examId,
  examTitle,
  onClose,
}: {
  examId: string;
  examTitle: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [shareWithTeachers, setShareWithTeachers] = useState(false);
  const [openForStudents, setOpenForStudents] = useState(false);
  const [openForMockExam, setOpenForMockExam] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  // THÊM MỚI (25-10): đề đang được chia sẻ (đã gắn nhánh / bật 1 trong 2 cờ) lúc
  // mở popup -> hiện nút đỏ "Xóa chia sẻ" để gỡ đề khỏi nhánh (vd. gk1).
  const [wasShared, setWasShared] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [treeData, examData] = await Promise.all([
          apiFetch<{ folders: FolderNode[] }>('/api/library/tree'),
          apiFetch<{ exam: any }>(`/api/exams/${examId}`),
        ]);
        setFolders(treeData.folders);
        const exam = examData.exam;
        setSelectedFolderId(exam.sharedFolderId || '');
        setShareWithTeachers(!!exam.shareWithTeachers);
        setOpenForStudents(!!exam.openForStudents);
        setOpenForMockExam(!!exam.openForMockExam);
        setIsPublished(!!exam.is_published);
        setWasShared(!!(exam.sharedFolderId || exam.shareWithTeachers || exam.openForStudents || exam.openForMockExam));
      } catch (err: any) {
        setError(err.message || 'Không tải được dữ liệu chia sẻ.');
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  const rows = useMemo(() => {
    const flat = flattenWithDepth(folders);
    const q = search.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((f) => f.name.toLowerCase().includes(q));
  }, [folders, search]);

  async function handleSave() {
    if ((shareWithTeachers || openForStudents || openForMockExam) && !selectedFolderId) {
      alert('Hãy chọn 1 nhánh thư mục trước khi bật chia sẻ.');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/exams/${examId}/share`, {
        method: 'PATCH',
        body: JSON.stringify({
          sharedFolderId: selectedFolderId || null,
          shareWithTeachers,
          openForStudents,
          openForMockExam,
        }),
      });
      alert('✅ Đã cập nhật trạng thái chia sẻ.');
      onClose();
    } catch (err: any) {
      alert(err.message || 'Không cập nhật được trạng thái chia sẻ.');
    } finally {
      setSaving(false);
    }
  }

  // THÊM MỚI (25-10): gỡ hẳn đề khỏi kho chung — bỏ nhánh + tắt cả 2 cờ. Chỉ gỡ
  // CHIA SẺ, KHÔNG xóa đề của GV (đề vẫn còn nguyên trong danh sách của bạn);
  // đề biến mất khỏi nhánh (vd. gk1) trong /kho-de-chung và tab Ôn luyện. Bản
  // GV khác đã "lấy về" trước đó là bản sao riêng nên không bị ảnh hưởng.
  async function handleUnshare() {
    if (!confirm('Xóa chia sẻ đề này?\n\nĐề sẽ biến mất khỏi kho đề chung (và khỏi Ôn luyện, Thi thử của học sinh). Đề của bạn vẫn còn nguyên.')) return;
    setSaving(true);
    try {
      await apiFetch(`/api/exams/${examId}/share`, {
        method: 'PATCH',
        body: JSON.stringify({ sharedFolderId: null, shareWithTeachers: false, openForStudents: false, openForMockExam: false }),
      });
      alert('✅ Đã xóa chia sẻ — đề không còn trong kho chung.');
      onClose();
    } catch (err: any) {
      alert(err.message || 'Không xóa được chia sẻ.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-1">
          <LibraryBookIcon className="w-5 h-5 shrink-0 text-blue-600" />
          Chia sẻ vào kho chung
        </h3>
        <p className="text-sm text-gray-500 mb-4 truncate" title={examTitle}>
          Đề: <span className="font-semibold text-gray-700">{examTitle || '(chưa đặt tên)'}</span>
        </p>

        {loading && <p className="text-sm text-gray-500">Đang tải...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && (
          <>
            {!isPublished && (
              <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                Đề này chưa Xuất bản — hãy Xuất bản trước khi bật &quot;Chia sẻ cho GV khác&quot;.
              </p>
            )}

            <label className="block text-xs font-semibold text-gray-500 mb-1">Chọn nhánh thư mục</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm nhánh theo tên..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto mb-4">
              {rows.length === 0 ? (
                <p className="text-sm text-gray-400 p-3">Không có nhánh nào khớp — liên hệ admin để thêm nhánh mới.</p>
              ) : (
                rows.map((f) => (
                  <button
                    key={f._id}
                    type="button"
                    onClick={() => setSelectedFolderId(f._id)}
                    style={{ paddingLeft: 12 + f.depth * 16 }}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 hover:bg-blue-50 transition ${
                      selectedFolderId === f._id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    {f.name}
                    {f.examCount > 0 && <span className="text-xs text-gray-400 ml-1">({f.examCount} đề)</span>}
                  </button>
                ))
              )}
            </div>

            <label className="flex items-start gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shareWithTeachers}
                onChange={(e) => setShareWithTeachers(e.target.checked)}
                disabled={!isPublished}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-700">
                Chia sẻ cho GV khác — hiện trong <span className="font-semibold">/kho-de-chung</span>, GV khác xem và
                &quot;lấy về&quot; dùng cho lớp mình được.
              </span>
            </label>

            <label className="flex items-start gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={openForStudents}
                onChange={(e) => setOpenForStudents(e.target.checked)}
                disabled={!isPublished}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-700">
                Mở cho học sinh <span className="font-semibold">Ôn luyện</span> — làm tự do theo bài/chủ đề, chấm ngay từng
                câu, bấm ổ khóa để xem lời giải, có điểm và lưu tiến độ.
              </span>
            </label>

            <label className="flex items-start gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={openForMockExam}
                onChange={(e) => setOpenForMockExam(e.target.checked)}
                disabled={!isPublished}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-700">
                Mở cho học sinh <span className="font-semibold">Thi thử</span> — làm như thi thật: bấm giờ, nộp bài một lần,
                có điểm. Có thể bật cả hai chế độ, hoặc chỉ một.
              </span>
            </label>

            <div className="flex items-center justify-end gap-2">
              {wasShared && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleUnshare}
                  className="mr-auto text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 border border-red-200 rounded-lg py-2 px-3 transition"
                >
                  Xóa chia sẻ
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700 py-2 px-4"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2 px-4 rounded-lg transition"
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
