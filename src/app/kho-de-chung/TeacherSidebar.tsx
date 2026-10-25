'use client';

// THÊM MỚI: cột trái điều hướng cho trang /kho-de-chung — cùng bố cục với
// cột trái của app chính (page.tsx): logo, các tab, Kho đề chung (đang chọn),
// trợ lý AI, khu vực tài khoản. Bấm "Trang chủ" (ngôi nhà) hoặc tab khác sẽ
// về app chính qua "/?tab=...", page.tsx tự đọc query này và mở đúng tab.
// Màn hình hẹp (điện thoại): thanh trên cùng + drawer trượt, giống page.tsx.
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';
import { AiHelpWidget } from '@/components/AiHelpWidget';
import { isAdminEmail } from '@/lib/adminConfig';

export type SidebarTeacher = { name: string; email: string };

type IconProps = { className?: string };
const svgProps = (className?: string) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  className,
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true as const,
});
const stroke = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function HomeIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4 11.2 12 4l8 7.2" {...stroke} />
      <path d="M6 9.8V19c0 .55.45 1 1 1h3.2v-4.8c0-.55.45-1 1-1h1.6c.55 0 1 .45 1 1V20H17c.55 0 1-.45 1-1V9.8" {...stroke} />
    </svg>
  );
}
function FileIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6.5 3h6.4L18.5 8.6V19.5a1.5 1.5 0 01-1.5 1.5H6.5A1.5 1.5 0 015 19.5v-15A1.5 1.5 0 016.5 3z" {...stroke} />
      <path d="M12.7 3v4.6a1.5 1.5 0 001.5 1.5h4.3" {...stroke} />
    </svg>
  );
}
function LayersIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z" {...stroke} />
      <path d="M3.5 12 12 16.5 20.5 12" {...stroke} />
      <path d="M3.5 16 12 20.5 20.5 16" {...stroke} />
    </svg>
  );
}
function FolderIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M2.5 8.2V6a1.5 1.5 0 011.5-1.5h4.7a1.5 1.5 0 011.06.44l1.3 1.3a1.5 1.5 0 001.06.44H20a1.5 1.5 0 011.5 1.5v1.06" {...stroke} />
      <path d="M2.6 9.6a1.5 1.5 0 011.47-1.2h15.86a1.5 1.5 0 011.47 1.8l-1.24 6.3a2 2 0 01-1.96 1.6H5.8a2 2 0 01-1.96-1.6l-1.24-6.3z" {...stroke} />
    </svg>
  );
}
function ShieldIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M12 3.5l6.75 2.7v5.1c0 4.35-2.9 8.15-6.75 9.2-3.85-1.05-6.75-4.85-6.75-9.2V6.2L12 3.5z" {...stroke} />
      <path d="M9.2 12.1l1.9 1.9 3.7-3.9" {...stroke} />
    </svg>
  );
}
function LogoutIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M15.5 8.25V6a2.25 2.25 0 00-2.25-2.25h-6A2.25 2.25 0 005 6v12a2.25 2.25 0 002.25 2.25h6A2.25 2.25 0 0015.5 18v-2.25" {...stroke} />
      <path d="M9.5 12h11m0 0-3-3m3 3-3 3" {...stroke} />
    </svg>
  );
}
function HamburgerIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1]?.[0]?.toUpperCase() || '?';
}

export default function TeacherSidebar({
  teacher,
  children,
}: {
  teacher: SidebarTeacher | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOutEverywhere, setLoggingOutEverywhere] = useState(false);

  // Điện thoại xoay ngang: chiều rộng > 640px nhưng chiều cao rất thấp. Cùng
  // cách nhận biết với page.tsx (có cảm ứng + max-height 500px) → ẩn cột trái
  // cố định, chỉ dùng thanh trên cùng + nút ☰.
  const [isPhoneLandscape, setIsPhoneLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const hasTouch = 'ontouchstart' in window || (navigator?.maxTouchPoints || 0) > 0;
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
    const evaluate = (matches: boolean) => setIsPhoneLandscape(hasTouch && matches);
    evaluate(mq.matches);
    const handler = (e: MediaQueryListEvent) => evaluate(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const items: { key: string; label: string; icon: ReactNode; tab?: string }[] = [
    { key: 'home', tab: 'home', label: 'Trang chủ', icon: <HomeIcon className="w-[18px] h-[18px]" /> },
    { key: 'exams', tab: 'exams', label: 'Tạo đề thi', icon: <FileIcon className="w-[18px] h-[18px]" /> },
    { key: 'khoi', tab: 'khoi', label: 'Quản lí Khối-lớp', icon: <LayersIcon className="w-[18px] h-[18px]" /> },
    { key: 'library', label: 'Kho đề chung', icon: <FolderIcon className="w-[18px] h-[18px]" /> },
    ...(isAdminEmail(teacher?.email)
      ? [{ key: 'admin', tab: 'admin', label: 'Quản trị', icon: <ShieldIcon className="w-[18px] h-[18px]" /> }]
      : []),
  ];

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  async function handleLogoutEverywhere() {
    if (
      !window.confirm(
        'Đăng xuất khỏi TẤT CẢ thiết bị đang đăng nhập bằng tài khoản này, kể cả thiết bị hiện tại bạn đang dùng?\n\nBạn sẽ cần đăng nhập lại bằng mật khẩu hiện tại. Dùng khi nghi ngờ tài khoản bị lộ.'
      )
    ) {
      return;
    }
    setLoggingOutEverywhere(true);
    try {
      const res = await fetch('/api/auth/logout-everywhere', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Không thực hiện được, vui lòng thử lại.');
        return;
      }
      await handleLogout();
    } catch {
      alert('Không thực hiện được, vui lòng thử lại.');
    } finally {
      setLoggingOutEverywhere(false);
    }
  }

  const navContent = (
    <>
      <nav className="flex-1 py-3">
        {items.map((item) => {
          const active = item.key === 'library';
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setNavOpen(false);
                if (!active && item.tab) router.push(`/?tab=${item.tab}`);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                active ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <AiHelpWidget />

      {teacher && (
        <div className="relative border-t border-gray-100 px-3 py-3">
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="w-7 h-7 rounded-full border-2 border-blue-500 text-blue-600 flex items-center justify-center text-[11px] font-semibold shrink-0">
              {initials(teacher.name)}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-gray-800 truncate">{teacher.name}</p>
              <p className="text-xs text-gray-400 truncate">{teacher.email}</p>
            </div>
            <span className="text-gray-300 text-xs">{accountOpen ? '▲' : '▼'}</span>
          </button>
          {accountOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-left px-3.5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <span className="inline-flex items-center gap-1.5">
                  <LogoutIcon className="w-4 h-4" /> Đăng xuất
                </span>
              </button>
              <button
                type="button"
                onClick={handleLogoutEverywhere}
                disabled={loggingOutEverywhere}
                className="w-full text-left px-3.5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 border-t border-gray-100 disabled:opacity-50 transition-colors"
              >
                {loggingOutEverywhere ? 'Đang xử lý...' : 'Đăng xuất tất cả thiết bị'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className={`${isPhoneLandscape ? 'hidden' : 'hidden sm:flex'} w-60 shrink-0 border-r border-gray-200 bg-white flex-col`}>
        <div className="px-4 py-5 border-b border-gray-100">
          <span className="flex items-center gap-2.5 font-bold text-blue-600 text-lg tracking-tight">
            <AppLogoIcon className="w-8 h-8 shrink-0" />
            {APP_NAME}
          </span>
        </div>
        {navContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className={`${isPhoneLandscape ? 'flex' : 'flex sm:hidden'} items-center justify-between bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30`}>
          <span className="flex items-center gap-2.5 font-bold text-blue-600 text-base tracking-tight">
            <AppLogoIcon className="w-7 h-7 shrink-0" />
            {APP_NAME}
          </span>
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Mở menu điều hướng"
            className="text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <HamburgerIcon className="w-6 h-6" />
          </button>
        </div>

        {navOpen && (
          <div className={`${isPhoneLandscape ? '' : 'sm:hidden'} fixed inset-0 z-40`}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
            <aside className="absolute top-0 left-0 bottom-0 w-72 max-w-[80vw] bg-white flex flex-col shadow-xl">
              <div className="flex items-center justify-between px-4 py-5 border-b border-gray-100">
                <span className="flex items-center gap-2.5 font-bold text-blue-600 text-lg tracking-tight">
                  <AppLogoIcon className="w-8 h-8 shrink-0" />
                  {APP_NAME}
                </span>
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Đóng menu"
                  className="text-gray-400 hover:text-gray-600 px-2"
                >
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
              {navContent}
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
