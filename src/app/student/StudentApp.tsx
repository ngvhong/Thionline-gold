'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';
import { setPortalChoice, clearPortalChoice } from '@/lib/portalChoice';
// THÊM MỚI (Giai đoạn 2 — tab "Đề được giao"): nội dung thật, thay khung
// rỗng cũ — xem AssignedExamsTab.tsx.
import AssignedExamsTab from './AssignedExamsTab';
// THÊM MỚI (Giai đoạn 4 — tab "Ôn luyện"): nội dung thật, thay khung rỗng
// cũ — xem LibraryPracticeTab.tsx.
import LibraryPracticeTab from './LibraryPracticeTab';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): điền nội dung thật thay cho
// khung rỗng của Giai đoạn 0 — đăng ký/đăng nhập (SĐT + PIN), join lớp bằng
// mã lớp. Giai đoạn 2/4 sẽ điền nội dung thật cho 2 tab "Đề được giao" /
// "Ôn luyện" hiện đang là khung rỗng bên dưới.
//
// QUY TẮC: file này (và mọi file con của nó trong src/app/student/) KHÔNG
// import bất kỳ gì từ code GV, TRỪ 2 ngoại lệ có chủ đích ở Giai đoạn 2/4
// (StudentTakeExam.tsx, SolutionView.tsx — xem 00-THINKING.md mục 2.5).

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

type Account = { id: string; name: string; phone: string };
type RosterStudent = { _id: string; name: string };

// ============================================================
// ---------- Form nhập mã lớp + chọn tên (dùng chung cho cả lúc
// đăng ký lần đầu và nút "Vào thêm lớp" lúc đã đăng nhập) ----------
// ============================================================
function JoinClassForm({
  onJoined,
  onSkip,
}: {
  onJoined: (info: { inviteCode: string; studentId: string }) => void;
  onSkip?: () => void;
}) {
  const [inviteCode, setInviteCode] = useState('');
  const [className, setClassName] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [error, setError] = useState('');

  async function handleLookup() {
    setError('');
    if (!inviteCode.trim()) {
      setError('Vui lòng nhập mã lớp.');
      return;
    }
    setLoadingRoster(true);
    setRoster(null);
    setSelectedStudentId('');
    try {
      const data = await apiFetch<{ className: string; students: RosterStudent[] }>(
        `/api/student-auth/class-roster?inviteCode=${encodeURIComponent(inviteCode.trim())}`
      );
      setClassName(data.className);
      setRoster(data.students);
      if (data.students.length === 0) {
        setError('Lớp này không còn tên nào để chọn — có thể mọi bạn đã vào lớp rồi, hoặc bạn nhập sai mã. Hỏi lại giáo viên để chắc chắn.');
      }
    } catch (err: any) {
      setClassName(null);
      setError(err.message || 'Không tìm thấy lớp với mã này.');
    } finally {
      setLoadingRoster(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Mã lớp</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Ví dụ: AB12CD"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleLookup}
            disabled={loadingRoster}
            className="shrink-0 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-50"
          >
            {loadingRoster ? 'Đang tìm…' : 'Tìm lớp'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {roster && roster.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Chọn đúng tên bạn trong lớp {className ? `"${className}"` : ''}
          </label>
          <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {roster.map((s) => (
              <label
                key={s._id}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="radio"
                  name="rosterStudent"
                  value={s._id}
                  checked={selectedStudentId === s._id}
                  onChange={() => setSelectedStudentId(s._id)}
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {roster && roster.length > 0 && (
        <button
          type="button"
          disabled={!selectedStudentId}
          onClick={() => onJoined({ inviteCode: inviteCode.trim(), studentId: selectedStudentId })}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
        >
          Vào lớp này
        </button>
      )}

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-xs text-gray-400 hover:text-gray-600 hover:underline"
        >
          Bỏ qua, vào lớp sau
        </button>
      )}
    </div>
  );
}

// ============================================================
// ---------- Đăng ký / Đăng nhập (chưa có phiên nào) ----------
// ============================================================
function AuthGate({ onAuthenticated }: { onAuthenticated: (account: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Sau khi tạo tài khoản xong (register), nếu người dùng muốn vào lớp
  // ngay thì hiện thêm bước chọn mã lớp + tên — KHÔNG chặn tạo tài khoản
  // nếu chưa có mã lớp (có thể "Vào thêm lớp" sau, lúc đã đăng nhập).
  const [pendingAccount, setPendingAccount] = useState<Account | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const account = await apiFetch<Account>('/api/student-auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, pin }),
      });
      onAuthenticated(account);
    } catch (err: any) {
      setError(err.message || 'Không đăng nhập được.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const account = await apiFetch<Account>('/api/student-auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, phone, pin }),
      });
      // Đăng ký xong đã có cookie phiên — hiện thêm bước "vào lớp" (tùy
      // chọn) trước khi coi như hoàn tất, để không phải mở lại màn "Vào
      // thêm lớp" ngay sau khi vừa đăng ký nếu học sinh có sẵn mã lớp.
      setPendingAccount(account);
    } catch (err: any) {
      setError(err.message || 'Không đăng ký được.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinAfterRegister(info: { inviteCode: string; studentId: string }) {
    if (!pendingAccount) return;
    try {
      await apiFetch('/api/student-auth/join-class', {
        method: 'POST',
        body: JSON.stringify(info),
      });
    } catch (err: any) {
      // Tài khoản đã tạo thành công dù join lớp lỗi — không chặn, chỉ báo
      // để học sinh tự "Vào thêm lớp" lại sau lúc đã đăng nhập.
      alert(err.message || 'Tạo tài khoản thành công nhưng vào lớp chưa được — bạn có thể thử lại ở "Vào thêm lớp".');
    }
    onAuthenticated(pendingAccount);
  }

  if (pendingAccount) {
    return (
      <div>
        <p className="text-sm text-gray-600 mb-4">
          Đã tạo tài khoản cho <b>{pendingAccount.name}</b>. Nếu có mã lớp, nhập vào đây để vào lớp ngay:
        </p>
        <JoinClassForm
          onJoined={handleJoinAfterRegister}
          onSkip={() => onAuthenticated(pendingAccount)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex mb-5 rounded-lg bg-gray-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 py-1.5 rounded-md transition-colors ${
            mode === 'login' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'
          }`}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`flex-1 py-1.5 rounded-md transition-colors ${
            mode === 'register' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'
          }`}
        >
          Đăng ký
        </button>
      </div>

      <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-3 text-left">
        {mode === 'register' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Họ và tên</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Số điện thoại</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mã PIN (4-6 số)</label>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
            minLength={4}
            maxLength={6}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
        >
          {submitting ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>
    </div>
  );
}

// ============================================================
// ---------- Đã đăng nhập — khung 2 tab (nội dung thật ở Giai
// đoạn 2 và 4) ----------
// ============================================================
function StudentHome({
  account,
  onLoggedOut,
  initialTab,
  autoStartExamId,
  onAutoStartConsumed,
}: {
  account: Account;
  onLoggedOut: () => void;
  // THÊM MỚI (Giai đoạn 4): tab mở sẵn lúc mount — dùng khi vừa đăng nhập
  // xong từ luồng "bấm đề lúc chưa đăng nhập" (cần quay lại đúng tab "Ôn
  // luyện", không phải tab mặc định "Đề được giao"). undefined = giữ hành
  // vi mặc định cũ (luôn mở "assigned").
  initialTab?: 'assigned' | 'library';
  autoStartExamId?: string | null;
  onAutoStartConsumed?: () => void;
}) {
  const [tab, setTab] = useState<'assigned' | 'library'>(initialTab || 'assigned');
  const [showJoinModal, setShowJoinModal] = useState(false);

  async function handleLogout() {
    try {
      await apiFetch('/api/student-auth/logout', { method: 'POST' });
    } finally {
      onLoggedOut();
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-semibold text-gray-800">{account.name}</p>
          <p className="text-xs text-gray-400">{account.phone}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-red-600 border border-gray-300 hover:border-red-300 rounded-lg px-3 py-1.5"
        >
          Đăng xuất
        </button>
      </div>

      <div className="flex mb-4 rounded-lg bg-gray-100 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setTab('assigned')}
          className={`flex-1 py-1.5 rounded-md transition-colors ${
            tab === 'assigned' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'
          }`}
        >
          Đề được giao
        </button>
        <button
          type="button"
          onClick={() => setTab('library')}
          className={`flex-1 py-1.5 rounded-md transition-colors ${
            tab === 'library' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'
          }`}
        >
          Ôn luyện
        </button>
      </div>

      {tab === 'assigned' ? (
        <AssignedExamsTab />
      ) : (
        <LibraryPracticeTab
          isLoggedIn={true}
          onRequestAuth={() => {
            /* THÊM MỚI (Giai đoạn 4): đã đăng nhập rồi thì không bao giờ gọi
               tới nhánh này — LibraryPracticeTab chỉ gọi onRequestAuth khi
               isLoggedIn=false. Để trống, không phải no-op vô nghĩa. */
          }}
          autoStartExamId={autoStartExamId}
          onAutoStartConsumed={onAutoStartConsumed}
        />
      )}

      <button
        type="button"
        onClick={() => setShowJoinModal(true)}
        className="w-full mt-3 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg py-2 font-medium transition-colors"
      >
        + Vào thêm lớp
      </button>

      {showJoinModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-6">
            <p className="font-semibold text-gray-800 mb-3">Vào thêm lớp</p>
            <JoinClassForm
              onJoined={() => {
                setShowJoinModal(false);
                alert('Đã vào lớp thành công.');
              }}
              onSkip={() => setShowJoinModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ---------- Chưa đăng nhập nhưng vẫn xem được kho đề "Ôn luyện"
// (Giai đoạn 4 — xem điều kiện nghiệm thu: "chưa đăng nhập, mở tab
// Ôn luyện → xem được cây + list đề, không bị bắt đăng nhập chỉ để
// xem") ----------
// ============================================================
function GuestHome({ onRequestAuth, onWantLogin }: { onRequestAuth: (examId: string) => void; onWantLogin: () => void }) {
  return (
    <div className="w-full max-w-md text-left">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">Ôn luyện — kho đề tự luyện</p>
        <button
          type="button"
          onClick={onWantLogin}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg px-2.5 py-1"
        >
          Đăng nhập
        </button>
      </div>
      <LibraryPracticeTab isLoggedIn={false} onRequestAuth={onRequestAuth} />
    </div>
  );
}

export default function StudentApp() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);
  // THÊM MỚI (Giai đoạn 4): người chưa đăng nhập chủ động bấm "Đăng nhập"
  // (hoặc bấm vào 1 đề để làm) sẽ lật sang màn AuthGate — trước đây màn
  // này luôn hiện ngay khi account === null, không cho khách xem gì cả.
  const [showAuthGate, setShowAuthGate] = useState(false);
  // _id đề khách vừa bấm vào làm lúc CHƯA đăng nhập — giữ lại để sau khi
  // đăng nhập/đăng ký xong, tự mở thẳng vào đúng đề đó (không bắt bấm lại
  // từ đầu cây), xem StudentHome/LibraryPracticeTab.
  const [pendingExamId, setPendingExamId] = useState<string | null>(null);

  // Lỡ có người vào thẳng /student bằng cách gõ URL (chưa từng qua bảng
  // chọn vai trò ở /login) → vẫn ghi nhận đây là lựa chọn "học sinh", để
  // lần sau mở app (qua /login) tự vào thẳng /student, không hiện lại bảng
  // chọn. Không ảnh hưởng gì tới phiên đăng nhập GV nếu có (cookie khác
  // tên, xem src/lib/auth.ts).
  useEffect(() => {
    setPortalChoice('student');
  }, []);

  useEffect(() => {
    apiFetch<{ account: Account | null }>('/api/student-auth/me')
      .then((data) => setAccount(data.account))
      .catch(() => setAccount(null))
      .finally(() => setChecking(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-7 text-center">
        <p className="flex items-center justify-center gap-2.5 font-bold text-blue-600 text-2xl tracking-tight mb-1">
          <AppLogoIcon className="w-10 h-10 shrink-0" />
          {APP_NAME}
        </p>
        <p className="text-sm text-gray-400 mb-6">Cổng học sinh</p>

        {checking ? (
          <p className="text-sm text-gray-400 py-6">Đang kiểm tra phiên đăng nhập…</p>
        ) : account ? (
          <StudentHome
            account={account}
            onLoggedOut={() => setAccount(null)}
            initialTab={pendingExamId ? 'library' : undefined}
            autoStartExamId={pendingExamId}
            onAutoStartConsumed={() => setPendingExamId(null)}
          />
        ) : showAuthGate ? (
          <AuthGate onAuthenticated={setAccount} />
        ) : (
          <GuestHome
            onRequestAuth={(examId) => {
              setPendingExamId(examId);
              setShowAuthGate(true);
            }}
            onWantLogin={() => setShowAuthGate(true)}
          />
        )}

        <button
          type="button"
          onClick={() => {
            clearPortalChoice();
            router.push('/login');
          }}
          className="text-xs text-gray-400 hover:text-gray-600 hover:underline mt-5"
        >
          Không phải bạn? Đổi vai trò
        </button>
      </div>
    </div>
  );
}
