import { NextResponse } from 'next/server';
import { STUDENT_SESSION_COOKIE_NAME } from '@/lib/studentAuth';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): chỉ xoá cookie phiên HỌC
// SINH — không đụng gì tới session_token của GV, dù đang mở cùng 1 trình
// duyệt (2 cookie khác tên, sống độc lập).
export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(STUDENT_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
