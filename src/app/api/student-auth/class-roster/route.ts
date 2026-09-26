import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): route công khai, KHÔNG cần
// đăng nhập (học sinh cần xem danh sách để CHỌN tên mình TRƯỚC KHI có tài
// khoản, lúc đăng ký kèm mã lớp). Chỉ trả tên học sinh + tên lớp — KHÔNG
// trả ownerId/tên giáo viên/năm học hay bất kỳ thông tin nào khác của lớp,
// đúng theo kế hoạch ("KHÔNG trả thông tin nhạy cảm khác của lớp").
//
// Chỉ trả những dòng roster CHƯA có ai "vào lớp" nhận (studentAccountId ===
// null) — tránh 2 tài khoản khác nhau cùng nhận nhầm 1 tên, học sinh đã
// join rồi thì lần sau tự đăng nhập lại bằng SĐT+PIN, không cần chọn tên
// lần nữa.
export async function GET(request: NextRequest) {
  try {
    const inviteCode = request.nextUrl.searchParams.get('inviteCode');
    if (!inviteCode || !inviteCode.trim()) {
      return NextResponse.json({ error: 'Thiếu mã lớp.' }, { status: 400 });
    }

    await connectToDatabase();

    const cls = await ClassModel.findOne({ inviteCode: inviteCode.trim() }).select('name').lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp với mã này.' }, { status: 404 });
    }

    const students = await StudentModel.find({
      classId: (cls as any)._id,
      studentAccountId: null,
    })
      .select('name')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json(
      {
        className: (cls as any).name,
        students: students.map((s: any) => ({ _id: String(s._id), name: s.name })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy danh sách lớp theo mã:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách lớp, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
