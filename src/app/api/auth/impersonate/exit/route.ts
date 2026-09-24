import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { AdminAuditLogModel } from '@/lib/adminAuditLogModel';
import {
  getSessionContext,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  IMPERSONATE_RETURN_COOKIE_NAME,
} from '@/lib/auth';

// POST /api/auth/impersonate/exit — thoát phiên mạo danh, khôi phục lại
// đúng phiên admin gốc (đã cất trong IMPERSONATE_RETURN_COOKIE_NAME lúc bắt
// đầu mạo danh). Gọi được bất cứ lúc nào đang trong phiên mạo danh — không
// cần quyền admin để GỌI route này (vì lúc này cookie session đang là của
// GV bị mạo danh, không phải của admin), nhưng route TỰ kiểm tra phiên hiện
// tại đúng là phiên mạo danh thật (có impersonatedBy hợp lệ) trước khi làm
// gì, không tin bất cứ gì khác từ client.
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSessionContext(request);

    // Không phải đang mạo danh (hoặc phiên đã hết hạn) — không có gì để
    // khôi phục, chỉ dọn sạch cookie khôi phục nếu còn sót lại rồi trả ok.
    if (!ctx || !ctx.isImpersonating) {
      const response = NextResponse.json({ ok: true }, { status: 200 });
      response.cookies.set(IMPERSONATE_RETURN_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
      return response;
    }

    const returnToken = request.cookies.get(IMPERSONATE_RETURN_COOKIE_NAME)?.value;
    const returnSession = returnToken ? verifySessionToken(returnToken) : null;

    // Ghi log thoát mạo danh trước khi xoá cookie — lấy email GV bị mạo
    // danh + email admin để log đọc được đầy đủ ngữ cảnh.
    await connectToDatabase();
    const [target, admin] = await Promise.all([
      TeacherModel.findById(ctx.teacherId).select('email').lean(),
      ctx.impersonatedByAdminId
        ? TeacherModel.findById(ctx.impersonatedByAdminId).select('email').lean()
        : null,
    ]);
    if (admin && target) {
      AdminAuditLogModel.create({
        adminEmail: (admin as any).email,
        action: 'impersonate_stop',
        targetTeacherId: ctx.teacherId,
        targetEmail: (target as any).email,
        detail: 'Thoát đăng nhập thay mặt',
      }).catch((err: any) => console.error('Lỗi ghi audit log (impersonate_stop):', err));
    }

    const response = NextResponse.json({ ok: true }, { status: 200 });

    if (returnSession?.teacherId) {
      // Cookie khôi phục còn hợp lệ (chưa hết 60 phút, chưa bị thu hồi qua
      // sessionVersion) — trả lại ĐÚNG token gốc của admin, không ký token
      // mới, để không vô tình kéo dài thêm thời hạn phiên admin.
      response.cookies.set(SESSION_COOKIE_NAME, returnToken!, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
    } else {
      // Cookie khôi phục thiếu/hỏng/hết hạn — không có gì an toàn để khôi
      // phục, đăng xuất hẳn, admin đăng nhập lại bằng mật khẩu.
      response.cookies.set(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
    }
    response.cookies.set(IMPERSONATE_RETURN_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('Lỗi thoát mạo danh:', err);
    return NextResponse.json({ error: 'Không thực hiện được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
