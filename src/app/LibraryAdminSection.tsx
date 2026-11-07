'use client';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): mục con "Kho đề
// chung" trong trang Quản trị (`AdminTab`, xem page.tsx) — chỉ quản lý CẤU
// TRÚC CÂY (thêm/sửa/xoá nhánh), không liên quan tới việc GV chia sẻ đề
// (xem popup "Chia sẻ vào kho chung" trong ExamBuilder.tsx). Tách file riêng
// (không viết trực tiếp vào page.tsx vốn đã rất dài) — chỉ import + render
// 1 dòng từ AdminTab.
import { useEffect, useState } from 'react';

type LibraryFolderItem = {
  _id: string;
  name: string;
  parentId: string | null;
  order: number;
};

type SharedExamItem = {
  _id: string;
  title: string;
  folderId: string | null;
  shareWithTeachers: boolean;
  openForStudents: boolean;
  openForMockExam?: boolean;
  liveCount?: number;
  teacherName: string;
  teacherEmail: string;
  published_at: string | null;
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

// Dựng danh sách phẳng thành dạng "có thụt lề theo cấp" để hiện trong bảng +
// dropdown chọn parentId, không cần component cây đệ quy riêng cho nhu cầu
// quản trị đơn giản này.
function flattenWithDepth(
  folders: LibraryFolderItem[],
  parentId: string | null = null,
  depth = 0
): (LibraryFolderItem & { depth: number })[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi'))
    .flatMap((f) => [{ ...f, depth }, ...flattenWithDepth(folders, f._id, depth + 1)]);
}

// THÊM MỚI (v22): chuẩn hoá để tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt.
function normalizeSearch(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export default function LibraryAdminSection() {
  const [folders, setFolders] = useState<LibraryFolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // THÊM MỚI (v21): danh sách đề đang chia sẻ trong kho (cả đề cho giáo viên
  // lẫn đề chỉ mở cho học sinh) để admin gỡ bất kỳ đề nào khỏi cây thư mục.
  const [sharedExams, setSharedExams] = useState<SharedExamItem[]>([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState('');
  const [filterFolderId, setFilterFolderId] = useState('');
  const [unsharingId, setUnsharingId] = useState<string | null>(null);
  // THÊM MỚI (v22): tìm kiếm + chọn nhiều đề để gỡ hàng loạt.
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUnsharing, setBulkUnsharing] = useState(false);
  const [bulkNotice, setBulkNotice] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ folders: LibraryFolderItem[] }>('/api/admin/library/folders');
      setFolders(data.folders.map((f: any) => ({ ...f, _id: String(f._id), parentId: f.parentId ? String(f.parentId) : null })));
    } catch (err: any) {
      setError(err.message || 'Không tải được cây thư mục.');
    } finally {
      setLoading(false);
    }
  }

  async function loadSharedExams() {
    setExamsLoading(true);
    setExamsError('');
    try {
      const data = await apiFetch<{ exams: SharedExamItem[] }>('/api/admin/library/exams');
      setSharedExams(data.exams);
    } catch (err: any) {
      setExamsError(err.message || 'Không tải được danh sách đề đang chia sẻ.');
    } finally {
      setExamsLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadSharedExams();
  }, []);

  const rows = flattenWithDepth(folders);

  // Đường dẫn đầy đủ của nhánh, ví dụ "Lớp 12 › Hàm số".
  function folderPath(folderId: string | null): string {
    if (!folderId) return '—';
    const names: string[] = [];
    let cur: string | null = folderId;
    let guard = 0;
    while (cur && guard++ < 20) {
      const f = folders.find((x) => x._id === cur);
      if (!f) break;
      names.unshift(f.name);
      cur = f.parentId;
    }
    return names.length ? names.join(' › ') : '(nhánh đã xoá)';
  }

  const normalizedQuery = normalizeSearch(searchText);
  const visibleExams = sharedExams.filter((e) => {
    if (filterFolderId && e.folderId !== filterFolderId) return false;
    if (!normalizedQuery) return true;
    const haystack = normalizeSearch(`${e.title} ${e.teacherName} ${e.teacherEmail} ${folderPath(e.folderId)}`);
    return haystack.includes(normalizedQuery);
  });

  // Chỉ tính các đề đã chọn mà ĐANG HIỆN (tránh gỡ nhầm đề bị lọc ẩn).
  const selectedVisible = visibleExams.filter((e) => selectedIds.has(e._id));
  const allVisibleSelected = visibleExams.length > 0 && selectedVisible.length === visibleExams.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleExams.forEach((e) => next.delete(e._id));
      else visibleExams.forEach((e) => next.add(e._id));
      return next;
    });
  }

  async function handleBulkUnshare() {
    if (selectedVisible.length === 0) return;
    if (
      !window.confirm(
        `Gỡ ${selectedVisible.length} đề đã chọn khỏi kho đề chung?\n\nCác đề KHÔNG bị xoá — vẫn còn nguyên trong danh sách của giáo viên, lớp đã giao, link thi và bài làm của học sinh không đổi. Đề nào đang có học sinh làm bài sẽ được bỏ qua để gỡ lúc khác.`
      )
    )
      return;
    setBulkUnsharing(true);
    setBulkNotice('');
    try {
      const data = await apiFetch<{
        unsharedIds: string[];
        blocked: { id: string; title: string; liveCount: number }[];
        missingIds: string[];
      }>('/api/admin/library/exams/bulk-unshare', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedVisible.map((e) => e._id) }),
      });
      const gone = new Set([...data.unsharedIds, ...data.missingIds]);
      setSharedExams((list) =>
        list
          .filter((x) => !gone.has(x._id))
          .map((x) => {
            const b = data.blocked.find((y) => y.id === x._id);
            return b ? { ...x, liveCount: b.liveCount } : x;
          })
      );
      // Giữ chọn lại đúng các đề bị bỏ qua để admin bấm gỡ lại sau cho tiện.
      setSelectedIds(new Set(data.blocked.map((b) => b.id)));
      let msg = `Đã gỡ ${data.unsharedIds.length} đề khỏi kho.`;
      if (data.blocked.length > 0) {
        msg += ` ${data.blocked.length} đề CHƯA gỡ vì đang có học sinh làm bài: ${data.blocked
          .map((b) => `"${b.title}" (${b.liveCount} em)`)
          .join(', ')}. Vui lòng chọn thời điểm khác để gỡ các đề này.`;
      }
      setBulkNotice(msg);
    } catch (err: any) {
      alert(err.message || 'Không gỡ được các đề khỏi kho.');
    } finally {
      setBulkUnsharing(false);
    }
  }

  async function handleUnshare(e: SharedExamItem) {
    if (
      !window.confirm(
        `Gỡ đề "${e.title}" (GV ${e.teacherName}) khỏi kho đề chung?\n\nĐề KHÔNG bị xoá — vẫn còn nguyên trong danh sách của giáo viên, lớp đã giao, link thi và bài làm của học sinh không đổi. Chỉ không còn hiện trong cây thư mục.`
      )
    )
      return;
    setUnsharingId(e._id);
    try {
      await apiFetch(`/api/admin/library/exams/${e._id}`, { method: 'DELETE' });
      setSharedExams((list) => list.filter((x) => x._id !== e._id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(e._id);
        return next;
      });
    } catch (err: any) {
      // Server trả 409 + câu báo "đang có N học sinh làm bài, chọn thời điểm khác".
      alert(err.message || 'Không gỡ được đề khỏi kho.');
      loadSharedExams();
    } finally {
      setUnsharingId(null);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiFetch('/api/admin/library/folders', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), parentId: newParentId || null }),
      });
      setNewName('');
      setNewParentId('');
      await load();
    } catch (err: any) {
      alert(err.message || 'Không tạo được nhánh mới.');
    } finally {
      setCreating(false);
    }
  }

  // Tạo nhanh cây Toán 10/11/12 theo SGK Kết nối tri thức (Chủ đề lớp > Chương > Bài + Ôn tập chương).
  async function handleSeedKntt() {
    if (!window.confirm('Tạo nhanh cây thư mục Toán lớp 10, 11, 12 theo sách Kết nối tri thức và thư mục THPT QG 2027 (Ôn luyện gồm 9 chuyên đề, và Thi thử)?\n\nNhánh nào đã có thì giữ nguyên, chỉ tạo phần còn thiếu.')) return;
    setSeeding(true);
    try {
      const r = await apiFetch<{ created: number; skipped: number }>('/api/admin/library/folders/seed-kntt', { method: 'POST' });
      alert(`Xong! Đã tạo ${r.created} thư mục mới (bỏ qua ${r.skipped} thư mục đã có).`);
      await load();
    } catch (err: any) {
      alert(err.message || 'Không tạo được cây thư mục.');
    } finally {
      setSeeding(false);
    }
  }

  function startEdit(f: LibraryFolderItem) {
    setEditingId(f._id);
    setEditName(f.name);
    setEditParentId(f.parentId || '');
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/library/folders', {
        method: 'PATCH',
        body: JSON.stringify({ id: editingId, name: editName.trim(), parentId: editParentId || null }),
      });
      setEditingId(null);
      await load();
    } catch (err: any) {
      alert(err.message || 'Không sửa được nhánh này.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(f: LibraryFolderItem) {
    if (!window.confirm(`Xoá nhánh "${f.name}"? Chỉ xoá được khi không còn nhánh con/đề nào gắn vào.`)) return;
    setDeletingId(f._id);
    try {
      await apiFetch(`/api/admin/library/folders?id=${f._id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      alert(err.message || 'Không xoá được nhánh này.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Dựng cây thư mục để giáo viên gắn đề đã xuất bản vào (ví dụ: Lớp 10, Lớp 11, Lớp 12, Ôn tuyển 10, Ôn thi
        QG, Ôn HSG). Chỉ quản trị viên sửa được cấu trúc cây này — giáo viên chỉ chọn nhánh có sẵn khi chia sẻ đề.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-blue-900">
          <b>Tạo nhanh theo sách giáo khoa:</b> Chủ đề lớp 10, 11, 12 → các Chương → các Bài và Ôn tập chương (Toán – Kết nối tri thức với cuộc sống); thêm thư mục THPT QG 2027 (Ôn luyện gồm 9 chuyên đề, và Thi thử).
        </p>
        <button
          type="button"
          disabled={seeding}
          onClick={handleSeedKntt}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2 px-4 rounded-lg transition whitespace-nowrap"
        >
          {seeding ? 'Đang tạo...' : 'Tạo nhanh cây Toán KNTT'}
        </button>
      </div>

      {/* Form thêm nhánh mới */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Tên nhánh mới</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ví dụ: Lớp 10"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Nhánh cha (để trống = nhánh gốc)</label>
          <select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Nhánh gốc —</option>
            {rows.map((f) => (
              <option key={f._id} value={f._id}>
                {'—'.repeat(f.depth)} {f.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={creating || !newName.trim()}
          onClick={handleCreate}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2 px-4 rounded-lg transition whitespace-nowrap"
        >
          {creating ? 'Đang thêm...' : '+ Thêm nhánh'}
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Đang tải...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 p-4">Chưa có nhánh nào — thêm nhánh đầu tiên ở form trên.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((f) => (
                <li key={f._id} className="p-3 flex flex-wrap items-center gap-2" style={{ paddingLeft: 12 + f.depth * 20 }}>
                  {editingId === f._id ? (
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 min-w-[8rem] border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                      <select
                        value={editParentId}
                        onChange={(e) => setEditParentId(e.target.value)}
                        className="min-w-0 max-w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <option value="">— Nhánh gốc —</option>
                        {rows
                          .filter((r) => r._id !== f._id)
                          .map((r) => (
                            <option key={r._id} value={r._id}>
                              {'—'.repeat(r.depth)} {r.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleSaveEdit}
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs font-semibold text-gray-500 hover:underline"
                      >
                        Huỷ
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => startEdit(f)}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === f._id}
                        onClick={() => handleDelete(f)}
                        className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === f._id ? 'Đang xoá...' : 'Xoá'}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* THÊM MỚI (v21): admin gỡ đề của giáo viên khác khỏi cây thư mục */}
      <div className="mt-8">
        <h3 className="text-base font-bold text-gray-800 mb-1">Đề đang chia sẻ trong kho</h3>
        <p className="text-sm text-gray-500 mb-3">
          Gỡ một đề khỏi cây thư mục khi cần (nội dung không phù hợp, trùng lặp...). Gỡ <b>không xoá đề</b>: đề vẫn còn
          nguyên trong danh sách của giáo viên, lớp đã giao, link thi và bài làm của học sinh không đổi. Giáo viên muốn
          chia sẻ lại thì tự làm lại. Mỗi lần gỡ được ghi vào nhật ký quản trị.
        </p>

        <div className="mb-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={filterFolderId}
            onChange={(e) => setFilterFolderId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:max-w-xs w-full"
          >
            <option value="">Tất cả nhánh ({sharedExams.length} đề)</option>
            {rows.map((f) => (
              <option key={f._id} value={f._id}>
                {'—'.repeat(f.depth)} {f.name} ({sharedExams.filter((x) => x.folderId === f._id).length})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadSharedExams}
            className="text-sm font-semibold text-blue-700 hover:underline text-left"
          >
            Tải lại
          </button>
        </div>

        <div className="mb-3">
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm theo tên đề, giáo viên, email hoặc nhánh..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base sm:text-sm"
          />
        </div>

        {bulkNotice && (
          <div className="mb-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 flex items-start gap-2">
            <span className="flex-1">{bulkNotice}</span>
            <button
              type="button"
              onClick={() => setBulkNotice('')}
              className="shrink-0 text-amber-800 font-bold px-1"
              aria-label="Đóng thông báo"
            >
              ✕
            </button>
          </div>
        )}

        {visibleExams.length > 0 && !examsLoading && !examsError && (
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="w-4 h-4"
              />
              Chọn tất cả ({visibleExams.length} đề đang hiện)
            </label>
            {selectedVisible.length > 0 && (
              <button
                type="button"
                disabled={bulkUnsharing}
                onClick={handleBulkUnshare}
                className="text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 font-semibold text-sm py-1.5 px-3 rounded-lg transition"
              >
                {bulkUnsharing ? 'Đang gỡ...' : `Gỡ ${selectedVisible.length} đề đã chọn`}
              </button>
            )}
          </div>
        )}

        {examsLoading && <p className="text-sm text-gray-500">Đang tải...</p>}
        {examsError && <p className="text-sm text-red-600">{examsError}</p>}

        {!examsLoading && !examsError && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {visibleExams.length === 0 ? (
              <p className="text-sm text-gray-500 p-4">
                {normalizedQuery ? 'Không có đề nào khớp từ khoá tìm kiếm.' : 'Chưa có đề nào được chia sẻ trong phạm vi này.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
                {visibleExams.map((e) => (
                  <li key={e._id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e._id)}
                      onChange={() => toggleSelect(e._id)}
                      aria-label={`Chọn đề ${e.title}`}
                      className="shrink-0 w-4 h-4 self-start sm:self-center mt-1 sm:mt-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 truncate">{e.title}</p>
                      <p className="text-xs text-gray-500 truncate">
                        GV {e.teacherName}
                        {e.teacherEmail ? ` (${e.teacherEmail})` : ''} · {folderPath(e.folderId)}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {e.shareWithTeachers && (
                          <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">
                            Chia sẻ giáo viên
                          </span>
                        )}
                        {(e.liveCount || 0) > 0 && (
                          <span className="text-[11px] font-semibold bg-amber-50 text-amber-800 rounded-full px-2 py-0.5">
                            {e.liveCount} HS đang làm bài
                          </span>
                        )}
                        {e.openForStudents && (
                          <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">
                            Ôn luyện
                          </span>
                        )}
                        {e.openForMockExam && (
                          <span className="text-[11px] font-semibold bg-violet-50 text-violet-700 rounded-full px-2 py-0.5">
                            Thi thử
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={unsharingId === e._id}
                      onClick={() => handleUnshare(e)}
                      className="shrink-0 text-red-600 hover:bg-red-50 disabled:opacity-50 border border-red-200 font-semibold text-sm py-1.5 px-3 rounded-lg transition"
                    >
                      {unsharingId === e._id ? 'Đang gỡ...' : 'Gỡ khỏi kho'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
