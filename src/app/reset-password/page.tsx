'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra, thử lại nhé.');
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError('Không kết nối được tới server, thử lại nhé.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-7">
        <p className="flex items-center justify-center gap-2.5 font-bold text-blue-600 text-2xl tracking-tight text-center mb-1">
          <AppLogoIcon className="w-10 h-10 shrink-0" />
          {APP_NAME}
        </p>
        <p className="text-sm text-gray-400 text-center mb-6">Đặt lại mật khẩu</p>

        {!token ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Liên kết không hợp lệ. Hãy mở lại đúng liên kết trong email, hoặc yêu cầu link mới.
          </p>
        ) : done ? (
          <div className="text-sm text-gray-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            Đặt lại mật khẩu thành công. Đang chuyển tới trang đăng nhập...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Mật khẩu mới</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Ít nhất 6 ký tự"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Nhập lại mật khẩu mới</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Nhập lại cho khớp"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-semibold text-sm rounded-lg py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
            </button>
          </form>
        )}

        <p className="text-sm text-gray-500 text-center mt-5">
          <Link href="/login" className="text-blue-600 font-semibold hover:underline">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}

// useSearchParams() bắt buộc phải nằm trong <Suspense> khi dùng ở trang tĩnh
// (App Router yêu cầu, nếu không sẽ lỗi build) — bọc riêng component chính ở
// ngoài, page.tsx chỉ làm nhiệm vụ bọc Suspense.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
