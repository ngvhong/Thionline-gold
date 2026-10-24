import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionContext,
  bumpSessionVersion,
  SESSION_COOKIE_NAME,
  IMPERSONATE_RETURN_COOKIE_NAME,
} from '@/lib/auth';

// POST /api/auth/logout-everywhere — "Đăng xuất tất cả thiết bị". Bất kỳ
// tài khoản nào (GV thường hay admin) đang đăng nhập đều gọi được cho CHÍNH
// mình — không cần biết mật khẩu, chỉ cần đang có phiên hợp lệ. Đây là
// PHƯƠNG ÁN DỰ PHÒNG chính khi nghi ngờ tài khoản (đặc biệt tài khoản admin,
// vì hệ thống hiện chỉ có 1 admin) bị lộ/bị chiếm: tăng sessionVersion khiến
// MỌI cookie phiên đăng nhập khác đang tồn tại — kể cả của kẻ xấu đang giữ
// 1 cookie bị đánh cắp — lập tức mất hiệu lực ở lượt gọi API kế tiếp, không
// cần đổi mật khẩu (dù đổi mật khẩu qua "Quên mật khẩu" cũng có tác dụng
// tương tự, xem reset-password route).
//
// Sau khi tăng version, chính trình duyệt hiện tại CŨNG bị đăng xuất theo
// (vì cookie hiện tại cũng mang version cũ) — cố tình vậy, không có cách nào
// "trừ ngoại lệ" cho riêng thiết bị đang gọi API mà vẫn đảm bảo mọi phiên
// khác chắc chắn bị huỷ, nên trả cookie rỗng luôn để giao diện đưa về màn
// đăng nhập, GV/admin đăng nhập lại bằng mật khẩu hiện tại là vào được ngay.
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSessionContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    // CHẶN khi đang trong phiên MẠO DANH: hành động này phải do đúng chủ
    // tài khoản admin thật gọi bằng phiên admin gốc của họ, không phải khi
    // đang "đứng trong vai" 1 GV khác — tránh 1 phiên mạo danh (vốn có
    // phạm vi hẹp, xem impersonate route) lại có quyền huỷ hết các phiên
    // đăng nhập khác của chính GV đó.
    if (ctx.isImpersonating) {
      return NextResponse.json(
        { error: 'Không thể thực hiện thao tác này trong lúc đang xem thay mặt tài khoản khác.' },
        { status: 403 }
      );
    }

    await bumpSessionVersion(ctx.teacherId);

    const response = NextResponse.json(
      { ok: true, message: 'Đã đăng xuất khỏi tất cả thiết bị, kể cả thiết bị hiện tại. Vui lòng đăng nhập lại.' },
      { status: 200 }
    );
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    response.cookies.set(IMPERSONATE_RETURN_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('Lỗi đăng xuất tất cả thiết bị:', err);
    return NextResponse.json(
      { error: 'Không thực hiện được, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
