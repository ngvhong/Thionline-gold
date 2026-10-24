import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/classes/unassigned — trả về các lớp CỦA GV đang đăng nhập đang
// chưa thuộc khối nào (khoiId: null). Dùng cho bucket "Chưa phân khối" ở
// tầng 1 tab Khối (Phần 6) — lớp có tên lạ (detectGrade không nhận diện
// được) hoặc dữ liệu cũ chưa migrate vẫn phải hiện được ở đâu đó trong tab
// Khối, không được "biến mất" khỏi giao diện.
//
// Copy đúng pattern xác thực từ /api/khoi/[id]/add-class (GET): kiểm tra
// đăng nhập qua getVerifiedTeacherIdFromRequest, 401 nếu chưa đăng nhập, rồi mới
// connectToDatabase() và truy vấn lọc theo ownerId — không được bỏ qua bước
// xác thực vì đây là dữ liệu riêng của từng GV.
export async function GET(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    await connectToDatabase();

    const classes = await ClassModel.find({ ownerId: teacherId, khoiId: null })
      .sort({ name: 1 })
      .lean();

    return NextResponse.json(
      {
        classes: classes.map((c: any) => ({
          _id: String(c._id),
          name: c.name,
          schoolYear: c.schoolYear,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy danh sách lớp chưa phân khối:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách lớp chưa phân khối, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
