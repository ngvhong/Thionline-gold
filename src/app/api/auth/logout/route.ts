import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, IMPERSONATE_RETURN_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  // maxAge: 0 = xóa cookie ngay lập tức ở trình duyệt.
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  // THÊM MỚI (mạo danh): nếu admin đang mạo danh mà bấm "Đăng xuất" thường
  // (thay vì "Thoát mạo danh") — dọn luôn cookie chứa phiên admin gốc đang
  // cất tạm, tránh sót lại 1 cookie phiên admin cũ không ai dùng tới trong
  // trình duyệt.
  response.cookies.set(IMPERSONATE_RETURN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
