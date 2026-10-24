import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { ClassModel } from '@/lib/classModel';
import { requireAdmin } from '@/lib/adminGuard';

// GET /api/admin/teachers — danh sách TẤT CẢ tài khoản GV đã đăng ký, chỉ
// tài khoản quản trị (ADMIN_EMAIL, xem src/lib/adminConfig.ts) mới gọi được.
// Hiện tại đăng ký đang MỞ CHO TẤT CẢ (chưa giới hạn) — trang này chỉ để
// admin XEM danh sách ai đã dùng, việc siết đăng ký/duyệt tài khoản tính sau.
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập trang này.' }, { status: 403 });
    }

    await connectToDatabase();

    const teachers = await TeacherModel.find().sort({ created_at: -1 }).lean();
    const teacherIds = teachers.map((t: any) => t._id);

    // Đếm số lớp mỗi GV đang quản lý trong 1 lần query duy nhất (tránh N+1).
    const counts = await ClassModel.aggregate([
      { $match: { ownerId: { $in: teacherIds } } },
      { $group: { _id: '$ownerId', count: { $sum: 1 } } },
    ]);
    const classCountMap = new Map(counts.map((c: any) => [String(c._id), c.count]));

    const result = teachers.map((t: any) => ({
      _id: String(t._id),
      email: t.email,
      name: t.name,
      created_at: t.created_at,
      classCount: classCountMap.get(String(t._id)) || 0,
      // THÊM MỚI: để trang Quản trị hiện đúng trạng thái khoá/mở — tài
      // khoản tạo trước khi có field này không có `status` trong DB, coi
      // như 'active' (khớp default của schema).
      status: t.status || 'active',
    }));

    return NextResponse.json({ teachers: result }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy danh sách tài khoản (admin):', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách tài khoản, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
