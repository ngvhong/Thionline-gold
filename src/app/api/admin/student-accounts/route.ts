import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/adminGuard';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { AdminAuditLogModel } from '@/lib/adminAuditLogModel';
import {
  DAY_MS,
  deleteStudentAccounts,
  getProtectedStudentAccountIds,
  normalizeInactiveDays,
  staleLoginFilter,
} from '@/lib/studentAccountCleanup';

export const maxDuration = 60;

const LIST_LIMIT = 200; // tối đa 200 dòng / lần xem
const BULK_LIMIT = 500; // tối đa 500 tài khoản / lần xóa hàng loạt

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/admin/student-accounts?q=&filter=all|inactive&inactiveDays=30
// Danh sách tài khoản học sinh (chỉ admin). `inactive` = lâu không đăng nhập
// VÀ chưa gắn với lớp nào (an toàn để xóa) — đúng tập sẽ bị xóa hàng loạt.
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập trang này.' }, { status: 403 });
    }
    await connectToDatabase();

    const sp = request.nextUrl.searchParams;
    const q = (sp.get('q') || '').trim();
    const filter = sp.get('filter') === 'inactive' ? 'inactive' : 'all';
    const inactiveDays = normalizeInactiveDays(sp.get('inactiveDays'));

    const protectedIds = await getProtectedStudentAccountIds();
    const stale = staleLoginFilter(inactiveDays);
    const inactiveQuery = { _id: { $nin: protectedIds }, ...stale };

    const conds: any[] = [];
    if (filter === 'inactive') conds.push(inactiveQuery);
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      conds.push({ $or: [{ name: rx }, { phone: rx }] });
    }
    const query = conds.length ? { $and: conds } : {};

    const [total, inactiveCount, accounts] = await Promise.all([
      StudentAccountModel.countDocuments(),
      StudentAccountModel.countDocuments(inactiveQuery),
      StudentAccountModel.find(query)
        .select('name phone created_at lastLoginAt')
        .sort({ lastLoginAt: 1, created_at: 1 })
        .limit(LIST_LIMIT)
        .lean(),
    ]);

    const ids = accounts.map((a: any) => a._id);
    const [classAgg, subAgg] = ids.length
      ? await Promise.all([
          StudentModel.aggregate([
            { $match: { studentAccountId: { $in: ids } } },
            { $group: { _id: '$studentAccountId', count: { $sum: 1 } } },
          ]),
          SubmissionModel.aggregate([
            { $match: { studentAccountId: { $in: ids } } },
            {
              $group: {
                _id: '$studentAccountId',
                total: { $sum: 1 },
                withClass: { $sum: { $cond: [{ $ifNull: ['$studentId', false] }, 1, 0] } },
              },
            },
          ]),
        ])
      : [[], []];
    const classMap = new Map((classAgg as any[]).map((c) => [String(c._id), c.count as number]));
    const subMap = new Map((subAgg as any[]).map((s) => [String(s._id), s]));

    const cutMs = Date.now() - inactiveDays * DAY_MS;
    const result = accounts.map((a: any) => {
      const key = String(a._id);
      const classCount = classMap.get(key) || 0;
      const sub: any = subMap.get(key);
      const submissionCount = sub?.total || 0;
      const inClass = classCount > 0 || (sub?.withClass || 0) > 0;
      const lastMs = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : null;
      const stalePassed = lastMs !== null ? lastMs < cutMs : new Date(a.created_at).getTime() < cutMs;
      return {
        _id: key,
        name: a.name,
        phone: a.phone,
        created_at: a.created_at,
        lastLoginAt: a.lastLoginAt || null,
        classCount,
        submissionCount,
        // Có thể xóa được (không gắn lớp) / thuộc diện "không dùng".
        deletable: !inClass,
        inactive: !inClass && stalePassed,
      };
    });

    return NextResponse.json(
      { accounts: result, total, inactiveCount, inactiveDays, listLimit: LIST_LIMIT, bulkLimit: BULK_LIMIT },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy danh sách tài khoản HS (admin):', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách tài khoản học sinh, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/student-accounts — body 1 trong 2 dạng:
//   { ids: string[] }                         xóa các tài khoản được chọn
//   { allInactive: true, inactiveDays: n }    xóa hàng loạt MỌI tài khoản "không dùng"
// Server luôn tính/lọc lại danh sách (không tin client) và tự bỏ qua tài khoản
// đang gắn với lớp của GV. Hàng loạt xóa tối đa BULK_LIMIT mỗi lần — trả về
// `remaining` để giao diện bấm tiếp nếu còn dư.
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }
    await connectToDatabase();

    const body = await request.json().catch(() => ({}));
    let ids: any[] = [];
    let mode: 'selected' | 'inactive' = 'selected';
    let inactiveDays = 30;

    if (body.allInactive === true) {
      mode = 'inactive';
      inactiveDays = normalizeInactiveDays(body.inactiveDays);
      const protectedIds = await getProtectedStudentAccountIds();
      const found: any[] = await StudentAccountModel.find({ _id: { $nin: protectedIds }, ...staleLoginFilter(inactiveDays) })
        .select('_id')
        .limit(BULK_LIMIT)
        .lean();
      ids = found.map((f) => f._id);
    } else if (Array.isArray(body.ids)) {
      const valid = body.ids.filter((x: any) => typeof x === 'string' && mongoose.isValidObjectId(x));
      if (valid.length === 0) {
        return NextResponse.json({ error: 'Chưa chọn tài khoản nào hợp lệ.' }, { status: 400 });
      }
      if (valid.length > BULK_LIMIT) {
        return NextResponse.json({ error: `Mỗi lần chỉ xóa tối đa ${BULK_LIMIT} tài khoản.` }, { status: 400 });
      }
      ids = valid.map((x: string) => new mongoose.Types.ObjectId(x));
    } else {
      return NextResponse.json({ error: 'Yêu cầu không hợp lệ — cần ids hoặc allInactive.' }, { status: 400 });
    }

    // Lấy tên/SĐT TRƯỚC khi xóa để ghi nhật ký có ý nghĩa.
    const preview: any[] =
      mode === 'selected' && ids.length === 1
        ? await StudentAccountModel.find({ _id: { $in: ids } }).select('name phone').lean()
        : [];

    const { deleted, skippedInClass } = await deleteStudentAccounts(ids);

    let remaining = 0;
    if (mode === 'inactive') {
      const protectedIds = await getProtectedStudentAccountIds();
      remaining = await StudentAccountModel.countDocuments({ _id: { $nin: protectedIds }, ...staleLoginFilter(inactiveDays) });
    }

    if (deleted > 0) {
      const single = preview[0];
      await AdminAuditLogModel.create({
        adminEmail: admin.email,
        action: 'delete_student_accounts',
        // Trường bắt buộc của schema log GV — không có "GV đích" ở đây.
        targetTeacherId: '-',
        targetEmail: single ? `${single.name} (${single.phone})` : 'khỏi hệ thống',
        detail: single
          ? 'Xóa tài khoản học sinh'
          : mode === 'inactive'
          ? `Xóa ${deleted} tài khoản học sinh không dùng ${inactiveDays} ngày`
          : `Xóa ${deleted} tài khoản học sinh`,
      }).catch((err: any) => console.error('Lỗi ghi audit log:', err));
    }

    return NextResponse.json({ ok: true, deleted, skippedInClass, remaining }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xóa tài khoản HS (admin):', err);
    return NextResponse.json(
      { error: 'Không xóa được tài khoản học sinh, xem chi tiết ở server log. Có thể bấm xóa lại.' },
      { status: 500 }
    );
  }
}
