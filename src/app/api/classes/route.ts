import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/classes — danh sách lớp của GV đang đăng nhập, kèm sĩ số mỗi lớp
// (đếm từ collection students, KHÔNG lưu cứng field studentCount trong Class
// vì dễ lệch khi thêm/xóa/chuyển lớp học sinh — đếm động luôn đúng).
export async function GET(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    await connectToDatabase();

    const classes = await ClassModel.find({ ownerId: teacherId })
      .sort({ created_at: -1 })
      .lean();

    const classIds = classes.map((c: any) => c._id);
    // Đếm sĩ số theo từng lớp trong 1 lần query duy nhất (aggregate group by
    // classId) thay vì query riêng cho mỗi lớp — tránh N+1 khi GV có nhiều lớp.
    const counts = await StudentModel.aggregate([
      { $match: { classId: { $in: classIds } } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: any) => [String(c._id), c.count]));

    const result = classes.map((c: any) => ({
      _id: String(c._id),
      name: c.name,
      schoolYear: c.schoolYear,
      inviteCode: c.inviteCode || null,
      selfRegisterMode: c.selfRegisterMode || 'off',
      created_at: c.created_at,
      studentCount: countMap.get(String(c._id)) || 0,
      // THÊM MỚI (tính năng "Khối", Phần 3a): lộ field khoiId ra response —
      // thuần bổ sung, không đổi field nào cũ — để trang Lớp (Phần 3b) có
      // thể lọc "Lớp chưa phân khối" (khoiId === null) ngay trên client mà
      // không cần thêm route riêng.
      khoiId: c.khoiId ? String(c.khoiId) : null,
    }));

    return NextResponse.json({ classes: result }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy danh sách lớp:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách lớp, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// POST /api/classes — tạo lớp mới, tự gắn ownerId từ GV đang đăng nhập (KHÔNG
// nhận ownerId từ body — nếu không, 1 GV có thể tự ý tạo lớp gắn cho GV khác).
export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { name, schoolYear } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên lớp.' }, { status: 400 });
    }
    if (!schoolYear || !String(schoolYear).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập năm học.' }, { status: 400 });
    }

    await connectToDatabase();

    const created = await ClassModel.create({
      name: String(name).trim(),
      schoolYear: String(schoolYear).trim(),
      ownerId: teacherId,
    });

    return NextResponse.json(
      {
        class: {
          _id: created._id.toString(),
          name: created.name,
          schoolYear: created.schoolYear,
          inviteCode: created.inviteCode || null,
          selfRegisterMode: created.selfRegisterMode || 'off',
          created_at: created.created_at,
          studentCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Lỗi tạo lớp:', err);
    return NextResponse.json(
      { error: 'Không tạo được lớp, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
