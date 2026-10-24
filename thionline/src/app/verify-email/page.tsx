'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  // Khác reset-password (đợi người dùng nhập rồi bấm nút), trang này TỰ
  // GỌI API ngay khi mở link — người dùng chỉ cần bấm link trong email,
  // không cần thao tác gì thêm.
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error'
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setMessage('Liên kết không hợp lệ. Hãy mở lại đúng liên kết trong email.');
      return;
    }

    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'Có lỗi xảy ra, thử lại nhé.');
          return;
        }
        setStatus('success');
        setMessage(data.message || 'Xác nhận email thành công.');
      })
      .catch(() => {
        setStatus('error');
        setMessage('Không kết nối được tới server, thử lại nhé.');
      });
    // Chỉ chạy 1 lần lúc mở trang — token không đổi trong vòng đời trang này.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-7">
        <p className="flex items-center justify-center gap-2.5 font-bold text-blue-600 text-2xl tracking-tight text-center mb-1">
          <AppLogoIcon className="w-10 h-10 shrink-0" />
          {APP_NAME}
        </p>
        <p className="text-sm text-gray-400 text-center mb-6">Xác nhận email</p>

        {status === 'loading' && (
          <p className="text-sm text-gray-600 text-center py-3">Đang xác nhận...</p>
        )}

        {status === 'success' && (
          <div className="text-sm text-gray-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            {message}
          </div>
        )}

        {status === 'error' && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {message}
          </p>
        )}

        <p className="text-sm text-gray-500 text-center mt-5">
          {status === 'success' ? (
            <Link href="/" className="text-blue-600 font-semibold hover:underline">
              Vào ứng dụng
            </Link>
          ) : (
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">
              Quay lại đăng nhập
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

// useSearchParams() bắt buộc phải nằm trong <Suspense> khi dùng ở trang tĩnh
// (App Router yêu cầu, nếu không sẽ lỗi build) — bọc riêng component chính
// ở ngoài, page.tsx chỉ làm nhiệm vụ bọc Suspense (cùng khuôn mẫu với
// reset-password/page.tsx).
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
