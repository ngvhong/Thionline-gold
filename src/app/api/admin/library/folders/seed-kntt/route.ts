import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/adminGuard';
import { seedKnttTree } from '@/lib/seedKnttTree';

// Tạo nhanh cây thư mục Ôn luyện Toán 10/11/12 theo SGK Kết nối tri thức:
//   Chủ đề lớp N > Chương > (các Bài ... + Ôn tập chương).
// Chạy lại nhiều lần vẫn an toàn: nhánh đã có (cùng tên, cùng nhánh cha) được giữ nguyên, chỉ tạo phần thiếu.
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }
    await connectToDatabase();

    const { created, skipped } = await seedKnttTree();

    return NextResponse.json({ success: true, created, skipped }, { status: 200 });
  } catch (err) {
    console.error('Lỗi tạo nhanh cây thư mục KNTT:', err);
    return NextResponse.json({ error: 'Không tạo được cây thư mục.' }, { status: 500 });
  }
}
