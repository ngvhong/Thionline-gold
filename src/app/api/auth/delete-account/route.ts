import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import {
  getSessionContext,
  verifyPassword,
  SESSION_COOKIE_NAME,
  IMPERSONATE_RETURN_COOKIE_NAME,
} from '@/lib/auth';
import { isAdminEmail } from '@/lib/adminConfig';
import { TeacherModel } from '@/lib/teacherModel';
import { deleteTeacherAndAllData } from '@/lib/deleteTeacherData';

// THÊM MỚI (25-10): GV tự XÓA VĨNH VIỄN tài khoản của mình. Không thể hoàn tác.
//
// An toàn:
//  - Phải đang đăng nhập VÀ nhập lại đúng mật khẩu (chống người lạ mượn máy bấm).
//  - Chặn khi đang ở phiên "xem thay mặt" (mạo danh) — chỉ chủ thật mới được xóa.
//  - Chặn tài khoản admin (hệ thống chỉ có 1 admin; xóa nhầm là mất quyền quản trị).
//
// Xóa theo thứ tự: ảnh trên storage TRƯỚC (cần đọc URL từ bản ghi còn sống), rồi
// dữ liệu Mongo từ "lá" lên "gốc", cuối cùng mới xóa chính tài khoản. Nếu giữa
// chừng lỗi, tài khoản vẫn còn -> GV bấm xóa lại được (các bước đều idempotent).
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getSessionContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }
    if (ctx.isImpersonating) {
      return NextResponse.json(
        { error: 'Không thể xóa tài khoản trong lúc đang xem thay mặt tài khoản khác.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return NextResponse.json({ error: 'Hãy nhập mật khẩu để xác nhận.' }, { status: 400 });
    }

    await connectToDatabase();
    const teacher: any = await TeacherModel.findById(ctx.teacherId).lean();
    if (!teacher) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
    }
    if (teacher.role === 'admin' || isAdminEmail(teacher.email)) {
      return NextResponse.json(
        { error: 'Tài khoản quản trị không thể tự xóa.' },
        { status: 403 }
      );
    }
    if (!(await verifyPassword(password, teacher.passwordHash))) {
      return NextResponse.json({ error: 'Mật khẩu không đúng.' }, { status: 400 });
    }

    // Logic xóa dây chuyền dùng chung với admin (xem lib/deleteTeacherData.ts).
    await deleteTeacherAndAllData(teacher);

    const response = NextResponse.json({ ok: true }, { status: 200 });
    for (const name of [SESSION_COOKIE_NAME, IMPERSONATE_RETURN_COOKIE_NAME]) {
      response.cookies.set(name, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
    }
    return response;
  } catch (err) {
    console.error('Lỗi xóa tài khoản:', err);
    return NextResponse.json(
      { error: 'Không xóa được tài khoản, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
