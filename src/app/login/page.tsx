'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';
import { REGISTRATION_CLOSED_MESSAGE, REGISTRATION_APPROVAL_MESSAGE } from '@/lib/adminConfig';
// THÊM MỚI (Giai đoạn 0 — bảng chọn vai trò): trang /login là nơi DUY NHẤT
// mọi người dùng CHƯA đăng nhập (dù là GV hay HS) bị page.tsx redirect tới
// (xem useEffect gọi /api/auth/me trong src/app/page.tsx, KHÔNG đổi gì ở
// đó) — nên chỉ cần chặn/rẽ nhánh đúng 1 chỗ này là đủ, không phải sửa
// page.tsx.
import PortalChoice from '@/components/PortalChoice';
import { getPortalChoice, clearPortalChoice, type PortalChoiceValue } from '@/lib/portalChoice';

export default function LoginPage() {
  const router = useRouter();
  // THÊM MỚI (Giai đoạn 0): 3 trạng thái ban đầu — null (đang đọc cookie,
  // hiện màn chờ ngắn để tránh nháy giao diện), 'teacher' (hiện đúng form
  // đăng nhập/đăng ký GV như cũ, KHÔNG đổi phía dưới), 'student' (route này
  // chỉ trung chuyển, xem useEffect bên dưới — sẽ đẩy sang /student ngay,
  // không tự vẽ giao diện HS tại đây để tránh trùng logic với trang
  // /student).
  const [portalChoice, setPortalChoiceState] = useState<PortalChoiceValue | null>(null);
  const [checkingPortalChoice, setCheckingPortalChoice] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // THÊM MỚI (đóng/duyệt đăng ký): tải chế độ đăng ký hiện tại NGAY khi vào
  // trang (route công khai, không cần đăng nhập — xem GET /api/auth/register)
  // để hiện banner giải thích + khoá nút "Đăng ký" nếu admin đang đóng, thay
  // vì để người dùng điền hết form rồi mới bị từ chối ở bước gửi. Mặc định
  // 'open' trong lúc chờ tải xong, không chặn nhầm khi API chưa kịp trả lời.
  const [registrationMode, setRegistrationMode] = useState<'open' | 'approval' | 'closed'>('open');
  // THÊM MỚI: đăng ký ở chế độ 'approval' KHÔNG tự đăng nhập luôn (server
  // không set cookie session, xem route auth/register) — hiện thông báo
  // "đang chờ duyệt" ngay tại trang này thay vì chuyển trang như bình
  // thường, vì chuyển trang sẽ chỉ đưa họ về lại đúng trang đăng nhập này.
  const [pendingMessage, setPendingMessage] = useState('');

  // THÊM MỚI (Giai đoạn 0): đọc cookie NGAY khi trang vừa tải, chỉ 1 lần.
  // - Đã từng chọn 'student' → không hiện form GV dù chỉ 1 khắc, đẩy thẳng
  //   sang /student (trang đó tự lo đăng nhập/đăng ký HS + 2 tab).
  // - Đã từng chọn 'teacher' → hiện đúng form đăng nhập/đăng ký GV bên dưới
  //   như trước khi có Giai đoạn 0, không có gì khác biệt với GV đang dùng
  //   app hiện tại.
  // - Chưa từng chọn (cookie rỗng, người dùng hoàn toàn mới) → hiện bảng 2
  //   nút <PortalChoice />.
  useEffect(() => {
    const existing = getPortalChoice();
    if (existing === 'student') {
      router.replace('/student');
      return;
    }
    setPortalChoiceState(existing);
    setCheckingPortalChoice(false);
  }, [router]);

  useEffect(() => {
    fetch('/api/auth/register')
      .then((res) => res.json())
      .then((data) => {
        if (data?.mode === 'approval' || data?.mode === 'closed') {
          setRegistrationMode(data.mode);
        }
      })
      .catch(() => {
        // Không tải được thì giữ nguyên 'open' — không chặn đăng ký nhầm vì
        // lỗi mạng/tạm thời phía client, chỉ ẩn banner.
      });
  }, []);
  // THÊM MỚI (rate limit): khi API trả 429, đếm ngược tại chỗ theo giây thay
  // vì chỉ hiện chữ tĩnh — người dùng thấy rõ còn bao lâu, không cần đoán
  // hay tự bấm thử lại nhiều lần trong lúc chờ (bấm thử cũng không tính
  // thêm lượt mới vì nút bị khoá).
  const [retrySeconds, setRetrySeconds] = useState(0);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = setInterval(() => {
      setRetrySeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [retrySeconds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPendingMessage('');
    // THÊM MỚI (đóng/duyệt đăng ký): chặn ngay ở client khi admin đã đóng
    // đăng ký — server (POST /api/auth/register) vẫn tự chặn lại độc lập
    // (xem route đó), đây chỉ là lớp UX cho gọn, tránh gửi request vô ích.
    if (mode === 'register' && registrationMode === 'closed') {
      setError(REGISTRATION_CLOSED_MESSAGE);
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { email, password, name };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra, thử lại nhé.');
        // res.status === 429: server đã trả sẵn retryAfterSeconds, dùng luôn
        // để chạy đồng hồ đếm ngược, không cần tự đoán.
        if (res.status === 429 && typeof data.retryAfterSeconds === 'number') {
          setRetrySeconds(data.retryAfterSeconds);
        }
        setLoading(false);
        return;
      }

      // THÊM MỚI (đóng/duyệt đăng ký): đăng ký thành công nhưng đang ở chế
      // độ 'approval' — server KHÔNG set cookie session (xem route
      // auth/register), nên KHÔNG chuyển trang như bình thường. Hiện thông
      // báo chờ duyệt ngay tại đây, quay về màn hình đăng nhập cho gọn.
      if (data?.pendingApproval) {
        setPendingMessage(data.message || REGISTRATION_APPROVAL_MESSAGE);
        setMode('login');
        setPassword('');
        setLoading(false);
        return;
      }

      // Đăng nhập/đăng ký thành công → cookie session đã được server set,
      // chuyển thẳng về trang chính. Lần sau mở app, page.tsx tự gọi
      // /api/auth/me và vào thẳng, không cần qua trang này nữa.
      router.push('/');
      router.refresh();
    } catch (err) {
      setError('Không kết nối được tới server, thử lại nhé.');
      setLoading(false);
    }
  }

  // THÊM MỚI (Giai đoạn 0): màn chờ ngắn trong lúc đọc cookie, tránh nháy
  // giao diện (đúng kiểu "Đang kiểm tra đăng nhập..." đã dùng ở page.tsx).
  if (checkingPortalChoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Đang tải...</p>
      </div>
    );
  }

  // THÊM MỚI (Giai đoạn 0): chưa từng chọn vai trò → hiện bảng chọn, KHÔNG
  // render form GV bên dưới. Chọn "giáo viên" thì set state để rơi thẳng
  // xuống form cũ ngay (không cần tải lại trang); chọn "học sinh" thì đẩy
  // sang /student.
  if (portalChoice === null) {
    return (
      <PortalChoice
        onChoose={(choice) => {
          if (choice === 'student') {
            router.replace('/student');
          } else {
            setPortalChoiceState('teacher');
          }
        }}
      />
    );
  }

  // Từ đây trở xuống: portalChoice === 'teacher' — TOÀN BỘ phần còn lại của
  // component giữ NGUYÊN 100% như trước Giai đoạn 0, không sửa gì.
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-7">
        <p className="flex items-center justify-center gap-2.5 font-bold text-blue-600 text-2xl tracking-tight text-center mb-1">
          <AppLogoIcon className="w-10 h-10 shrink-0" />
          {APP_NAME}
        </p>
        <p className="text-sm text-gray-400 text-center mb-6">
          {mode === 'login' ? 'Đăng nhập vào tài khoản giáo viên' : 'Tạo tài khoản giáo viên mới'}
        </p>

        {/* THÊM MỚI: thông báo vừa đăng ký xong ở chế độ 'approval' — hiện
            trên cả màn hình đăng nhập, không tự mất khi đổi qua lại 2 tab
            login/register (chỉ mất khi bấm gửi form lần kế tiếp). */}
        {pendingMessage && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5 mb-4">
            {pendingMessage}
          </div>
        )}

        {/* THÊM MỚI (đóng/duyệt đăng ký): banner giải thích lý do hạ tầng —
            CHỈ hiện khi đang ở tab "Đăng ký" và chế độ khác 'open', không
            làm phiền người chỉ muốn đăng nhập vào tài khoản đã có sẵn. */}
        {mode === 'register' && registrationMode !== 'open' && (
          <div
            className={`text-sm rounded-lg px-3.5 py-2.5 mb-4 border ${
              registrationMode === 'closed'
                ? 'text-amber-800 bg-amber-50 border-amber-200'
                : 'text-blue-800 bg-blue-50 border-blue-200'
            }`}
          >
            {registrationMode === 'closed' ? REGISTRATION_CLOSED_MESSAGE : REGISTRATION_APPROVAL_MESSAGE}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Họ và tên</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Nguyễn Thị Hồng"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ban@truong.edu.vn"
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Ít nhất 6 ký tự"
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
            {mode === 'login' && (
              <Link href="/forgot-password" className="text-xs text-blue-600 font-medium hover:underline mt-1 inline-block">
                Quên mật khẩu?
              </Link>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p>{error}</p>
              {retrySeconds > 0 && (
                <p className="mt-1 font-semibold">
                  Thử lại sau: {String(Math.floor(retrySeconds / 60)).padStart(2, '0')}:
                  {String(retrySeconds % 60).padStart(2, '0')}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || retrySeconds > 0 || (mode === 'register' && registrationMode === 'closed')}
            className="w-full bg-blue-600 text-white font-semibold text-sm rounded-lg py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading
              ? 'Đang xử lý...'
              : retrySeconds > 0
              ? 'Vui lòng đợi...'
              : mode === 'register' && registrationMode === 'closed'
              ? 'Tạm đóng đăng ký'
              : mode === 'login'
              ? 'Đăng nhập'
              : 'Đăng ký'}
          </button>
        </form>

        <p className="text-sm text-gray-500 text-center mt-5">
          {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
              setRetrySeconds(0);
            }}
            className="text-blue-600 font-semibold hover:underline"
          >
            {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
          </button>
        </p>

        {/* THÊM MỚI (Giai đoạn 0): phòng trường hợp dùng chung máy (máy tính
            ở lớp...) lỡ set nhầm cookie last_portal_choice = 'teacher' —
            cho phép quay lại bảng chọn vai trò mà không cần xoá cookie thủ
            công. Không đăng xuất ai cả, chỉ xoá "trí nhớ" lựa chọn. */}
        <p className="text-xs text-gray-300 text-center mt-4">
          <button
            type="button"
            onClick={() => {
              clearPortalChoice();
              setPortalChoiceState(null);
            }}
            className="hover:underline hover:text-gray-500"
          >
            Không phải bạn? Đổi vai trò
          </button>
        </p>
      </div>
    </div>
  );
}
