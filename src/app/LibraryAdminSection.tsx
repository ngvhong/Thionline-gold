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

export default function LibraryAdminSection() {
  const [folders, setFolders] = useState<LibraryFolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editParentId, setEditParentId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, []);

  const rows = flattenWithDepth(folders);

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
                <li key={f._id} className="p-3 flex items-center gap-2" style={{ paddingLeft: 12 + f.depth * 20 }}>
                  {editingId === f._id ? (
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                      <select
                        value={editParentId}
                        onChange={(e) => setEditParentId(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
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
    </div>
  );
}
