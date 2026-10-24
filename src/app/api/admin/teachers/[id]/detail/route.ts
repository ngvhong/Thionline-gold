import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { Exam } from '@/lib/examModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { requireAdmin } from '@/lib/adminGuard';

// GET /api/admin/teachers/[id]/detail — chi tiết danh sách LỚP + ĐỀ THI của
// 1 GV cụ thể, hiện khi admin bấm mở rộng 1 dòng trong bảng tài khoản. Chỉ
// admin gọi được. Đây là dữ liệu XEM riêng cho tab Quản trị — không phải
// route /api/classes, /api/exams đang dùng cho chính GV đó (những route ấy
// lọc theo GV ĐANG ĐĂNG NHẬP, admin không có quyền gọi thay).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập trang này.' }, { status: 403 });
    }

    const { id } = await params;

    await connectToDatabase();

    const teacher: any = await TeacherModel.findById(id).lean();
    if (!teacher) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản này.' }, { status: 404 });
    }

    const classes = await ClassModel.find({ ownerId: id }).sort({ created_at: -1 }).lean();
    const classIds = classes.map((c: any) => c._id);

    // Đếm số học sinh mỗi lớp trong 1 lần query (tránh N+1 giống /api/admin/teachers).
    const studentCounts = await StudentModel.aggregate([
      { $match: { classId: { $in: classIds } } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ]);
    const studentCountMap = new Map(studentCounts.map((c: any) => [String(c._id), c.count]));

    const exams = await Exam.find({ teacherId: String(id) }).sort({ created_at: -1 }).lean();
    const examIds = exams.map((e: any) => e._id);

    const submissionCount = await SubmissionModel.countDocuments({
      examId: { $in: examIds },
      status: 'đã nộp',
    });

    return NextResponse.json(
      {
        classes: classes.map((c: any) => ({
          _id: String(c._id),
          name: c.name,
          schoolYear: c.schoolYear,
          studentCount: studentCountMap.get(String(c._id)) || 0,
          created_at: c.created_at,
        })),
        exams: exams.map((e: any) => ({
          _id: String(e._id),
          title: e.title || '(Chưa đặt tên)',
          is_published: !!e.is_published,
          created_at: e.created_at,
        })),
        submissionCount,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy chi tiết tài khoản GV (admin):', err);
    return NextResponse.json(
      { error: 'Không lấy được chi tiết tài khoản này, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
