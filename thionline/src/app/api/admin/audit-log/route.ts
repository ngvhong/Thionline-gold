import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/adminGuard';
import { AdminAuditLogModel } from '@/lib/adminAuditLogModel';

// GET /api/admin/audit-log — chỉ tài khoản quản trị mới xem được. Trả về
// 50 thao tác gần nhất (mới nhất trước) — đủ dùng cho việc "gỡ rối sự cố",
// chưa cần phân trang vì tần suất khoá/mở tài khoản còn rất thấp ở giai
// đoạn demo/ít người dùng hiện tại.
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập trang này.' }, { status: 403 });
    }

    await connectToDatabase();

    const logs = await AdminAuditLogModel.find().sort({ created_at: -1 }).limit(50).lean();
    const result = logs.map((l: any) => ({
      _id: String(l._id),
      adminEmail: l.adminEmail,
      action: l.action,
      targetEmail: l.targetEmail,
      detail: l.detail,
      created_at: l.created_at,
    }));

    return NextResponse.json({ logs: result }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy audit log (admin):', err);
    return NextResponse.json({ error: 'Không lấy được nhật ký thao tác, xem chi tiết ở server log.' }, { status: 500 });
  }
}

// THÊM MỚI (Phần 1 — dọn trang admin): xóa nhật ký thao tác. Đây là log
// nội bộ để admin tra cứu, KHÔNG phải dữ liệu nghiệp vụ (không liên quan gì
// tới tài khoản GV/lớp/đề thi thật) nên cho phép admin xóa thoải mái, không
// cần audit lại chính hành động xóa này (tránh vòng lặp log-của-log).
//
// - DELETE?id=<logId>  → xóa đúng 1 dòng.
// - DELETE?all=true    → xóa toàn bộ nhật ký (dùng khi danh sách quá dài,
//   admin xác nhận muốn dọn sạch từ đầu).
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === 'true';
    const id = searchParams.get('id');

    if (all) {
      const r = await AdminAuditLogModel.deleteMany({});
      return NextResponse.json({ ok: true, deletedCount: r.deletedCount ?? 0 }, { status: 200 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Thiếu id nhật ký cần xóa.' }, { status: 400 });
    }

    const r = await AdminAuditLogModel.deleteOne({ _id: id });
    if (r.deletedCount === 0) {
      return NextResponse.json({ error: 'Không tìm thấy dòng nhật ký này (có thể đã bị xóa).' }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xóa audit log (admin):', err);
    return NextResponse.json({ error: 'Không xóa được nhật ký, xem chi tiết ở server log.' }, { status: 500 });
  }
}
