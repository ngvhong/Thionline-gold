import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { requireAdmin } from '@/lib/adminGuard';
import { AdminAuditLogModel } from '@/lib/adminAuditLogModel';
import { computePlanStatus } from '@/lib/planAccess';
import { isAdminEmail } from '@/lib/adminConfig';
import { deleteTeacherAndAllData } from '@/lib/deleteTeacherData';
import { ClassModel } from '@/lib/classModel';
import { Exam } from '@/lib/examModel';

// PATCH /api/admin/teachers/[id] — hỗ trợ 2 loại thao tác, phân biệt bằng
// field có mặt trong body:
//   1. { status: 'active' | 'suspended' } — KHOÁ / MỞ LẠI tài khoản (giữ
//      nguyên hành vi cũ, xem ghi chú gốc bên dưới).
//   2. { planUpdate: { action: 'extend', days: number } | { action: 'lifetime' } }
//      — GIA HẠN thêm N ngày gói dùng thử, hoặc CHUYỂN VĨNH VIỄN (Phần 2b).
// SỬA LỖI: trước đây route này chỉ đọc `status` từ body và validate bắt
// buộc phải là 'active'/'suspended' — nên mọi request chỉ gửi `planUpdate`
// (không có `status`) đều rơi vào nhánh validate đó và bị từ chối với lỗi
// "Trạng thái không hợp lệ..." dù không hề liên quan tới trạng thái khoá
// tài khoản. Nay tách hẳn 2 nhánh, mỗi nhánh tự validate phần body của
// riêng mình.
//
// Lý do đổi status khoá/mở (giữ nguyên từ trước): xoá cứng không thể "mở
// lại" nếu admin lỡ tay hoặc GV đó đã thanh toán/khiếu nại xong — khoá vẫn
// giữ nguyên toàn bộ tài khoản + lớp/đề thi họ đã tạo, chỉ chặn KHÔNG cho
// đăng nhập MỚI. Chỉ tài khoản quản trị mới gọi được, và không cho tự khoá
// chính mình để tránh admin lỡ tay khoá luôn tài khoản đang dùng.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    const { id } = await params;
    if (String(admin._id) === String(id)) {
      return NextResponse.json(
        { error: 'Không thể tự thao tác lên chính tài khoản quản trị đang dùng.' },
        { status: 400 }
      );
    }

    const body = await request.json();

    await connectToDatabase();

    // ---- Nhánh 1: khoá / mở lại tài khoản ----
    if ('status' in body) {
      const { status } = body;
      if (status !== 'active' && status !== 'suspended') {
        return NextResponse.json(
          { error: "Trạng thái không hợp lệ, chỉ nhận 'active' hoặc 'suspended'." },
          { status: 400 }
        );
      }

      // THÊM MỚI (đóng/duyệt đăng ký): lấy trạng thái TRƯỚC khi cập nhật —
      // để phân biệt "duyệt tài khoản đang chờ (pending)" với "mở lại tài
      // khoản đã bị khoá (suspended)" trong nhật ký thao tác, dù cả 2 đều
      // cùng đổi sang 'active' qua đúng 1 API này.
      const before: any = await TeacherModel.findById(id).lean();
      if (!before) {
        return NextResponse.json({ error: 'Không tìm thấy tài khoản này.' }, { status: 404 });
      }
      const wasPending = before.status === 'pending';

      const updated = await TeacherModel.findByIdAndUpdate(id, { status }, { new: true }).lean();
      if (!updated) {
        return NextResponse.json({ error: 'Không tìm thấy tài khoản này.' }, { status: 404 });
      }

      // THÊM MỚI (audit log tối thiểu): ghi lại thao tác khoá/mở NGAY SAU
      // khi đã cập nhật DB thành công — cố tình không await chặn response
      // (log thất bại không nên làm hỏng thao tác khoá/mở chính), chỉ log
      // lỗi nếu có ra console để debug sau.
      AdminAuditLogModel.create({
        adminEmail: admin.email,
        action: status === 'suspended' ? 'suspend_teacher' : wasPending ? 'approve_teacher' : 'unsuspend_teacher',
        targetTeacherId: String(id),
        targetEmail: (updated as any).email,
        detail: status === 'suspended'
          ? (wasPending ? 'Từ chối tài khoản đang chờ duyệt (khoá)' : 'Khoá tài khoản')
          : (wasPending ? 'Duyệt tài khoản đăng ký mới' : 'Mở lại tài khoản'),
      }).catch((err: any) => console.error('Lỗi ghi audit log:', err));

      return NextResponse.json({ ok: true, status }, { status: 200 });
    }

    // ---- Nhánh 2: gia hạn / chuyển vĩnh viễn (Phần 2b) ----
    if ('planUpdate' in body) {
      const planUpdate = body.planUpdate;
      const action = planUpdate?.action;
      if (action !== 'extend' && action !== 'lifetime') {
        return NextResponse.json(
          { error: "Thao tác gói dùng không hợp lệ, chỉ nhận 'extend' hoặc 'lifetime'." },
          { status: 400 }
        );
      }

      const teacher: any = await TeacherModel.findById(id).lean();
      if (!teacher) {
        return NextResponse.json({ error: 'Không tìm thấy tài khoản này.' }, { status: 404 });
      }

      // SỬA: dùng computePlanStatus (nguồn duy nhất tính isExpired/hạn hiện
      // tại, xem planAccess.ts) thay vì tự so sánh Date.now() với
      // freeExpiresAt ở đây — tránh trùng lặp logic ngày tháng ở 2 nơi.
      const currentStatus = computePlanStatus(teacher);

      let update: { planType: 'free' | 'lifetime'; freeExpiresAt: string | null };

      if (action === 'lifetime') {
        update = { planType: 'lifetime', freeExpiresAt: null };
      } else {
        // Nếu tài khoản đang là 'lifetime' mà bấm "Gia hạn 30 ngày" (không
        // nên xảy ra vì UI đã ẩn nút này khi isLifetime, nhưng vẫn phòng
        // hờ ai gọi thẳng API) — không hạ cấp xuống 'free', chỉ báo lỗi.
        if (currentStatus.isLifetime) {
          return NextResponse.json(
            { error: 'Tài khoản này đã ở gói vĩnh viễn, không cần gia hạn.' },
            { status: 400 }
          );
        }
        // Cộng thêm N ngày (mặc định 30) kể từ mốc lớn hơn giữa hạn hiện
        // tại và thời điểm hiện tại — nếu gói đã hết hạn (hoặc tài khoản
        // cũ chưa từng có hạn, freeExpiresAt === null) thì tính từ bây
        // giờ, tránh cộng dồn lên 1 ngày đã hết hạn từ lâu.
        const days = typeof planUpdate.days === 'number' && planUpdate.days > 0 ? planUpdate.days : 30;
        const baseMs =
          currentStatus.isExpired || !currentStatus.freeExpiresAt
            ? Date.now()
            : currentStatus.freeExpiresAt.getTime();
        const nextExpiresAt = new Date(baseMs + days * 24 * 60 * 60 * 1000);
        update = { planType: 'free', freeExpiresAt: nextExpiresAt.toISOString() };
      }

      const updated: any = await TeacherModel.findByIdAndUpdate(id, update, { new: true }).lean();
      if (!updated) {
        return NextResponse.json({ error: 'Không tìm thấy tài khoản này.' }, { status: 404 });
      }

      AdminAuditLogModel.create({
        adminEmail: admin.email,
        action: 'update_plan',
        targetTeacherId: String(id),
        targetEmail: updated.email,
        detail:
          action === 'lifetime'
            ? 'Chuyển sang gói vĩnh viễn'
            : `Gia hạn gói dùng thử thêm ${typeof planUpdate.days === 'number' ? planUpdate.days : 30} ngày`,
      }).catch((err: any) => console.error('Lỗi ghi audit log:', err));

      return NextResponse.json(
        { ok: true, planType: updated.planType, freeExpiresAt: updated.freeExpiresAt },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'Yêu cầu không hợp lệ — cần có trường status hoặc planUpdate.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Lỗi cập nhật tài khoản (admin):', err);
    return NextResponse.json(
      { error: 'Không cập nhật được tài khoản này, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/teachers/[id] — admin XÓA VĨNH VIỄN tài khoản GV cùng toàn
// bộ lớp, học sinh trong lớp, đề thi, bài nộp, ảnh bài làm của GV đó. KHÔNG
// thể hoàn tác (khác "Khoá": khoá vẫn giữ nguyên dữ liệu, chỉ chặn đăng nhập).
//
// An toàn:
//  - Chỉ admin (requireAdmin tra lại email thật từ DB theo session).
//  - Không cho tự xóa chính mình, không cho xóa tài khoản quản trị.
//  - Body BẮT BUỘC có `confirmEmail` khớp email tài khoản bị xóa — chống bấm
//    nhầm / gọi API bừa (UI cũng bắt admin gõ lại email trước khi gửi).
//  - Ghi nhật ký SAU khi xóa thành công (snapshot email, vì tài khoản đã mất).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    const { id } = await params;
    if (String(admin._id) === String(id)) {
      return NextResponse.json(
        { error: 'Không thể tự xóa chính tài khoản quản trị đang dùng.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const confirmEmail = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : '';

    await connectToDatabase();
    const teacher: any = await TeacherModel.findById(id).lean();
    if (!teacher) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản này.' }, { status: 404 });
    }
    if (teacher.role === 'admin' || isAdminEmail(teacher.email)) {
      return NextResponse.json({ error: 'Không thể xóa tài khoản quản trị.' }, { status: 403 });
    }
    if (!confirmEmail || confirmEmail !== String(teacher.email).trim().toLowerCase()) {
      return NextResponse.json(
        { error: 'Email xác nhận không khớp — chưa xóa gì cả.' },
        { status: 400 }
      );
    }

    // Đếm trước để ghi vào nhật ký (sau khi xóa sẽ không đếm lại được).
    const [classCount, examCount] = await Promise.all([
      ClassModel.countDocuments({ ownerId: teacher._id }),
      Exam.countDocuments({ teacherId: String(teacher._id) }),
    ]);

    await deleteTeacherAndAllData(teacher);

    // Await có chủ đích (khác khoá/mở): xóa vĩnh viễn nên muốn chắc chắn có
    // dấu vết; lỗi ghi log vẫn không làm hỏng kết quả xóa đã xong.
    await AdminAuditLogModel.create({
      adminEmail: admin.email,
      action: 'delete_teacher',
      targetTeacherId: String(id),
      targetEmail: teacher.email,
      detail: `Xóa vĩnh viễn tài khoản (${classCount} lớp, ${examCount} đề thi)`,
    }).catch((err: any) => console.error('Lỗi ghi audit log:', err));

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xóa tài khoản GV (admin):', err);
    return NextResponse.json(
      { error: 'Không xóa được tài khoản này, xem chi tiết ở server log. Có thể bấm xóa lại.' },
      { status: 500 }
    );
  }
}
