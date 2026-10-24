import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { requireAdmin } from '@/lib/adminGuard';
import { isAdminEmail } from '@/lib/adminConfig';
import { AdminAuditLogModel } from '@/lib/adminAuditLogModel';
import {
  signSessionToken,
  SESSION_COOKIE_NAME,
  IMPERSONATE_RETURN_COOKIE_NAME,
  IMPERSONATE_SESSION_MINUTES,
} from '@/lib/auth';

// POST /api/admin/teachers/[id]/impersonate — admin "Đăng nhập thay mặt" 1
// GV, để xem đúng y hệt màn hình GV đó đang thấy (phục vụ hỗ trợ/xử lý lỗi
// khó tái hiện). Chỉ admin gọi được.
//
// GIỚI HẠN AN TOÀN (đây là hành động nhạy cảm — admin thấy được toàn bộ dữ
// liệu của GV):
//   1. Không mạo danh được CHÍNH MÌNH hay bất kỳ tài khoản admin nào khác
//      (kiểm tra role/email — hệ thống hiện chỉ có 1 admin cố định nên vế
//      "admin khác" chưa xảy ra được, nhưng vẫn chặn cứng để an toàn nếu
//      sau này thêm admin thứ 2).
//   2. Phiên mạo danh chỉ sống 60 phút (IMPERSONATE_SESSION_MINUTES), ngắn
//      hơn nhiều so với phiên đăng nhập thường (30 ngày) — tự hết hạn nếu
//      quên thoát.
//   3. Không cho mạo danh 1 tài khoản đã bị khoá (suspended) — không có lý
//      do nghiệp vụ nào cần xem giao diện của 1 tài khoản đang bị chặn.
//   4. Mọi lượt mạo danh đều ghi vào Nhật ký quản trị (audit log).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    const { id } = await params;
    if (String(admin._id) === String(id)) {
      return NextResponse.json({ error: 'Không thể mạo danh chính tài khoản quản trị đang dùng.' }, { status: 400 });
    }

    await connectToDatabase();
    const target: any = await TeacherModel.findById(id).lean();
    if (!target) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản này.' }, { status: 404 });
    }
    if (target.role === 'admin' || isAdminEmail(target.email)) {
      return NextResponse.json({ error: 'Không thể mạo danh tài khoản quản trị.' }, { status: 400 });
    }
    if (target.status === 'suspended') {
      return NextResponse.json({ error: 'Tài khoản này đang bị khoá, không thể mạo danh.' }, { status: 400 });
    }
    // SỬA (vá lỗ hổng): trước đây chỉ chặn 'suspended' — tài khoản 'pending'
    // (đăng ký lúc registrationMode === 'approval', chưa được admin duyệt)
    // vẫn mạo danh được, dù UI đã ẩn nút "Đăng nhập thay mặt" với tài khoản
    // này (xem page.tsx, AdminTab). Gọi thẳng API (bỏ qua UI) vẫn tạo được
    // session hợp lệ cho tài khoản chưa duyệt — lách qua đúng bước duyệt mà
    // cả tính năng này đang xây. Không có lý do nghiệp vụ nào cần admin xem
    // giao diện của 1 tài khoản còn chưa được quyết định duyệt hay từ chối.
    if (target.status === 'pending') {
      return NextResponse.json(
        { error: 'Tài khoản này đang chờ duyệt, chưa thể mạo danh. Hãy duyệt tài khoản trước.' },
        { status: 400 }
      );
    }

    // Token mạo danh: teacherId = GV mục tiêu, sessionVersion = phiên bản
    // HIỆN TẠI của GV đó (nếu GV tự bấm "Đăng xuất tất cả thiết bị" trong
    // lúc admin đang mạo danh, phiên mạo danh cũng tự mất hiệu lực theo,
    // đúng hành vi mong đợi), sống ngắn 60 phút, kèm impersonatedBy = id admin.
    const impersonateToken = signSessionToken(String(target._id), target.sessionVersion || 0, {
      impersonatedBy: String(admin._id),
      expiresInMinutes: IMPERSONATE_SESSION_MINUTES,
    });

    // Cất token phiên ADMIN GỐC hiện tại (đọc thẳng từ cookie request, không
    // ký lại) vào 1 cookie riêng — dùng để khôi phục khi admin bấm "Thoát".
    const adminOriginalToken = request.cookies.get(SESSION_COOKIE_NAME)?.value || '';

    AdminAuditLogModel.create({
      adminEmail: admin.email,
      action: 'impersonate_start',
      targetTeacherId: String(target._id),
      targetEmail: target.email,
      detail: 'Bắt đầu đăng nhập thay mặt',
    }).catch((err: any) => console.error('Lỗi ghi audit log (impersonate_start):', err));

    const response = NextResponse.json(
      { ok: true, teacher: { id: String(target._id), email: target.email, name: target.name } },
      { status: 200 }
    );
    response.cookies.set(IMPERSONATE_RETURN_COOKIE_NAME, adminOriginalToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      // Cookie khôi phục chỉ cần sống bằng đúng thời gian phiên mạo danh —
      // hết 60 phút thì cả 2 đều nên hết hạn cùng lúc, admin phải đăng nhập
      // lại bằng mật khẩu (an toàn hơn là giữ sẵn 1 cookie khôi phục sống
      // lâu không dùng tới).
      maxAge: IMPERSONATE_SESSION_MINUTES * 60,
      path: '/',
    });
    response.cookies.set(SESSION_COOKIE_NAME, impersonateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: IMPERSONATE_SESSION_MINUTES * 60,
      path: '/',
    });
    return response;
  } catch (err) {
    console.error('Lỗi bắt đầu mạo danh:', err);
    return NextResponse.json({ error: 'Không thực hiện được, xem chi tiết ở server log.' }, { status: 500 });
  }
}
