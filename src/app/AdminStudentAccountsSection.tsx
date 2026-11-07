'use client';

// THÊM MỚI: mục con "Tài khoản HS" trong trang Quản trị (AdminTab, page.tsx) —
// xem tài khoản học sinh đã đăng ký dùng app, lọc những em "không dùng" (lâu
// không đăng nhập + chưa vào lớp nào) và xóa từng em / hàng loạt. Tài khoản đã
// gắn với lớp của GV KHÔNG xóa được (server tự chặn, xem
// lib/studentAccountCleanup.ts). Tách file riêng như LibraryAdminSection.
import { useEffect, useState } from 'react';

type StudentAccountItem = {
  _id: string;
  name: string;
  phone: string;
  created_at: string;
  lastLoginAt: string | null;
  classCount: number;
  submissionCount: number;
  deletable: boolean;
  inactive: boolean;
};

type ListResponse = {
  accounts: StudentAccountItem[];
  total: number;
  inactiveCount: number;
  inactiveDays: number;
  listLimit: number;
  bulkLimit: number;
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

const DAY_OPTIONS = [7, 30, 60, 90, 120, 180];

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString('vi-VN') : '—';
}

export default function AdminStudentAccountsSection({ onChanged }: { onChanged?: () => void }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // search đã "chốt" (debounce)
  const [filter, setFilter] = useState<'all' | 'inactive'>('inactive');
  const [inactiveDays, setInactiveDays] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ filter, inactiveDays: String(inactiveDays) });
      if (query) params.set('q', query);
      const res = await apiFetch<ListResponse>(`/api/admin/student-accounts?${params.toString()}`);
      setData(res);
      setSelected(new Set());
    } catch (err: any) {
      setError(err.message || 'Không tải được danh sách tài khoản học sinh.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, inactiveDays, query]);

  const accounts = data?.accounts ?? [];
  const selectable = accounts.filter((a) => a.deletable);
  const allSelected = selectable.length > 0 && selectable.every((a) => selected.has(a._id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((a) => a._id)));
  }

  async function runDelete(body: object, okMessage: (deleted: number, remaining: number) => string) {
    setBusy(true);
    setNotice('');
    try {
      const r = await apiFetch<{ deleted: number; skippedInClass: string[]; remaining: number }>(
        '/api/admin/student-accounts',
        { method: 'DELETE', body: JSON.stringify(body) }
      );
      let msg = okMessage(r.deleted, r.remaining);
      if (r.skippedInClass.length > 0) {
        msg += ` Bỏ qua ${r.skippedInClass.length} tài khoản đang thuộc lớp của giáo viên.`;
      }
      setNotice(msg);
      await load();
      onChanged?.();
    } catch (err: any) {
      alert(err.message || 'Không xóa được tài khoản học sinh.');
    } finally {
      setBusy(false);
    }
  }

  function handleDeleteOne(a: StudentAccountItem) {
    const extra =
      a.submissionCount > 0
        ? `\n\nBài ôn luyện của em (${a.submissionCount} lượt) cũng bị xóa theo.`
        : '';
    if (
      !window.confirm(
        `Xóa tài khoản học sinh "${a.name}" (${a.phone})?${extra}\n\nKhông thể hoàn tác. Em có thể đăng ký lại bằng số điện thoại này sau.`
      )
    ) {
      return;
    }
    runDelete({ ids: [a._id] }, () => `Đã xóa tài khoản "${a.name}".`);
  }

  function handleDeleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Xóa ${ids.length} tài khoản học sinh đã chọn? Bài ôn luyện của các em này cũng bị xóa theo. Không thể hoàn tác.`
      )
    ) {
      return;
    }
    runDelete({ ids }, (d) => `Đã xóa ${d} tài khoản học sinh.`);
  }

  function handleDeleteAllInactive() {
    if (!data || data.inactiveCount === 0) return;
    const n = Math.min(data.inactiveCount, data.bulkLimit);
    const more = data.inactiveCount > data.bulkLimit ? ` (mỗi lần tối đa ${data.bulkLimit}, còn lại bấm xóa tiếp)` : '';
    if (
      !window.confirm(
        `Xóa ${n} tài khoản học sinh KHÔNG DÙNG${more}?\n\nĐiều kiện: không đăng nhập quá ${inactiveDays} ngày (hoặc chưa từng đăng nhập) VÀ chưa thuộc lớp nào. Bài ôn luyện của các em này cũng bị xóa. Không thể hoàn tác.`
      )
    ) {
      return;
    }
    runDelete(
      { allInactive: true, inactiveDays },
      (d, remaining) => `Đã xóa ${d} tài khoản không dùng.${remaining > 0 ? ` Còn ${remaining} tài khoản nữa — bấm xóa tiếp.` : ''}`
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Tài khoản học sinh{data ? ` (${data.total})` : ''}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            &quot;Không dùng&quot; = không đăng nhập quá số ngày chọn (hoặc chưa từng đăng nhập) và chưa thuộc lớp nào.
            Tài khoản đã vào lớp của giáo viên không xóa được ở đây.
          </p>
        </div>
        <button
          onClick={handleDeleteAllInactive}
          disabled={busy || loading || !data || data.inactiveCount === 0}
          className="text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-2 rounded-lg transition-colors"
        >
          {busy ? 'Đang xóa...' : `Xóa tất cả không dùng${data ? ` (${data.inactiveCount})` : ''}`}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc số điện thoại..."
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'all' | 'inactive')}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="inactive">Chỉ tài khoản không dùng</option>
          <option value="all">Tất cả tài khoản</option>
        </select>
        <select
          value={inactiveDays}
          onChange={(e) => setInactiveDays(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          title="Số ngày không đăng nhập thì coi là không dùng"
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Không dùng &gt; {d} ngày
            </option>
          ))}
        </select>
      </div>

      {notice && (
        <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          {notice}
        </div>
      )}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <span className="text-sm text-red-700 font-medium">Đã chọn {selected.size} tài khoản</span>
          <button
            onClick={handleDeleteSelected}
            disabled={busy}
            className="text-sm font-semibold text-red-700 hover:text-red-800 disabled:opacity-50"
          >
            {busy ? 'Đang xóa...' : 'Xóa các tài khoản đã chọn'}
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Đang tải...</div>
        ) : accounts.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            {filter === 'inactive' ? 'Không có tài khoản nào thuộc diện không dùng.' : 'Chưa có tài khoản học sinh nào.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectable.length === 0}
                    aria-label="Chọn tất cả"
                  />
                </th>
                <th className="px-4 py-2.5">Học sinh</th>
                <th className="px-4 py-2.5">Ngày đăng ký</th>
                <th className="px-4 py-2.5">Đăng nhập gần nhất</th>
                <th className="px-4 py-2.5">Lớp / bài làm</th>
                <th className="px-4 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a._id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(a._id)}
                      onChange={() => toggle(a._id)}
                      disabled={!a.deletable}
                      aria-label={`Chọn ${a.name}`}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-800">{a.name}</div>
                    <div className="text-xs text-gray-500">{a.phone}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{fmtDate(a.created_at)}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {a.lastLoginAt ? fmtDate(a.lastLoginAt) : <span className="text-amber-600">Chưa từng</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {a.classCount} lớp · {a.submissionCount} lượt
                    {a.inactive && (
                      <span className="ml-2 text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                        Không dùng
                      </span>
                    )}
                    {!a.deletable && (
                      <span className="ml-2 text-[11px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        Đang trong lớp
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {a.deletable ? (
                      <button
                        onClick={() => handleDeleteOne(a)}
                        disabled={busy}
                        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        Xóa
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > 0 && accounts.length >= data.listLimit && (
        <p className="text-xs text-gray-400 mt-2">
          Chỉ hiện {data.listLimit} tài khoản đầu tiên — dùng ô tìm kiếm để thu hẹp.
        </p>
      )}
    </div>
  );
}
