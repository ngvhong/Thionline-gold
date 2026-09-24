import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/adminGuard';
import { migrateKhoiForAllClasses } from '@/lib/khoiMigration';

// POST /api/admin/migrate-khoi — chạy 1 LẦN để gán khoiId cho các lớp hiện
// có trong DB, dựa vào việc nhận diện số khối từ tên lớp (xem detectGrade()
// trong khoiMigration.ts). Đặt dưới /api/admin/* và dùng chung requireAdmin
// như mọi route quản trị khác trong dự án — CHỈ admin gọi được, tránh giáo
// viên vô tình bấm trúng hoặc bên ngoài gọi được.
//
// AN TOÀN KHI GỌI LẠI NHIỀU LẦN (idempotent) — xem ghi chú chi tiết ở
// migrateKhoiForAllClasses(). Đây là route TẠM, dùng xong (đã migrate hết
// dữ liệu cũ) có thể xoá — KHÔNG phải 1 phần luồng chạy nền liên tục của
// ứng dụng; từ nay lớp mới tạo/gán khối đều qua UI trang Khối (Phần 3, 4),
// không cần chạy lại route này nữa.
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền chạy migrate.' }, { status: 403 });
    }

    await connectToDatabase();

    const result = await migrateKhoiForAllClasses();

    return NextResponse.json(
      {
        message: `Đã xử lý ${result.totalClasses} lớp: ${result.migratedCount} lớp gán được khối (tạo mới ${result.khoiCreatedCount} khối), ${result.skippedCount} lớp không nhận diện được khối (cần gán tay).`,
        result,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi chạy migrate khối:', err);
    return NextResponse.json(
      { error: 'Không chạy được migrate khối, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
