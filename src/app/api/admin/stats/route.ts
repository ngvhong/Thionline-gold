import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { ClassModel } from '@/lib/classModel';
import { Exam } from '@/lib/examModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { requireAdmin } from '@/lib/adminGuard';

// GET /api/admin/stats — thống kê tổng quan TOÀN HỆ THỐNG cho thẻ số liệu ở
// đầu tab Quản trị (tổng GV, lớp, đề thi, bài nộp...). Chỉ admin gọi được,
// cùng cơ chế xác thực với /api/admin/teachers. Mỗi con số dùng 1 lệnh đếm
// riêng (countDocuments) thay vì tải hết dữ liệu về đếm tay — nhẹ và đủ
// nhanh ở quy mô hiện tại; nếu sau này dữ liệu lớn hơn nhiều có thể gộp lại
// bằng $facet trong 1 aggregate duy nhất.
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập trang này.' }, { status: 403 });
    }

    await connectToDatabase();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      teacherCount,
      suspendedCount,
      pendingCount,
      newTeachersThisWeek,
      classCount,
      examCount,
      publishedExamCount,
      submissionCount,
    ] = await Promise.all([
      TeacherModel.countDocuments(),
      TeacherModel.countDocuments({ status: 'suspended' }),
      // THÊM MỚI (đóng/duyệt đăng ký): số tài khoản đang chờ admin duyệt —
      // hiện thành thẻ riêng ở mục Tổng quan để admin biết ngay cần vào tab
      // "Tài khoản GV" xử lý, không phải đoán/đếm tay trong bảng dài.
      TeacherModel.countDocuments({ status: 'pending' }),
      TeacherModel.countDocuments({ created_at: { $gte: sevenDaysAgo } }),
      ClassModel.countDocuments(),
      Exam.countDocuments(),
      Exam.countDocuments({ is_published: true }),
      SubmissionModel.countDocuments({ status: 'đã nộp' }),
    ]);

    return NextResponse.json(
      {
        stats: {
          teacherCount,
          // SỬA: trừ luôn pendingCount — trước đây (chưa có trạng thái
          // 'pending') teacherCount - suspendedCount đúng là số đang hoạt
          // động, nhưng giờ tài khoản 'pending' cũng không đăng nhập được,
          // không nên tính vào "đang hoạt động".
          activeTeacherCount: teacherCount - suspendedCount - pendingCount,
          suspendedCount,
          pendingCount,
          newTeachersThisWeek,
          classCount,
          examCount,
          publishedExamCount,
          submissionCount,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy thống kê tổng quan (admin):', err);
    return NextResponse.json(
      { error: 'Không lấy được thống kê tổng quan, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
