'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // API luôn trả về thông báo chung chung (xem route) — chỉ cần biết đã gửi
  // xong request để chuyển UI sang trạng thái "đã gửi", không cần phân biệt
  // email đó có tồn tại hay không.
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Có lỗi xảy ra, thử lại nhé.');
        setLoading(false);
        return;
      }
      setSent(true);
    } catch (err) {
      setError('Không kết nối được tới server, thử lại nhé.');
    } finally {
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
        <p className="text-sm text-gray-400 text-center mb-6">Quên mật khẩu</p>

        {sent ? (
          <div className="text-sm text-gray-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            Nếu email <span className="font-medium">{email}</span> đã đăng ký, chúng tôi đã gửi liên kết đặt lại
            mật khẩu tới hộp thư đó. Liên kết có hiệu lực trong 30 phút.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
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

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-semibold text-sm rounded-lg py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Đang gửi...' : 'Gửi liên kết đặt lại mật khẩu'}
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
