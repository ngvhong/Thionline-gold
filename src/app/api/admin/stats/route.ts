import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { ClassModel } from '@/lib/classModel';
import { Exam } from '@/lib/examModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { requireAdmin } from '@/lib/adminGuard';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import { expireOverdueSubmissions, expireOverdueFreeSubmissions } from '@/lib/expireOverdueSubmissions';

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

    // "HS đang thi" toàn hệ thống — GỒM CẢ thí sinh tự do/Ôn luyện (không có
    // studentId, chỉ có studentAccountId). Trước khi đếm, chốt các lượt đã quá
    // giờ mà không nộp (cùng cơ chế trang chủ GV, xem expireOverdueSubmissions.ts)
    // để số không bị kẹt. SỬA (25-10): trước đây chỉ đếm lượt có studentId nên
    // thí sinh tự do không thấy, và lượt tự do kẹt 'đang thi' không bao giờ được chốt.
    // Số liệu KHÔNG cần realtime — chỉ tính khi admin mở/làm mới tab Tổng quan.
    const classFilter = { status: 'đang thi', studentId: { $exists: true, $ne: null } };
    const freeFilter = { status: 'đang thi', $or: [{ studentId: null }, { studentId: { $exists: false } }] };
    const liveStudentIds = await SubmissionModel.distinct('studentId', classFilter);
    await Promise.all([expireOverdueSubmissions(liveStudentIds), expireOverdueFreeSubmissions()]);

    const [
      teacherCount,
      suspendedCount,
      pendingCount,
      newTeachersThisWeek,
      classCount,
      examCount,
      publishedExamCount,
      submissionCount,
      liveClassCount,
      liveFreeCount,
      liveByExamRaw,
      studentAccountCount,
      activeTeachers7d,
      activeStudents7d,
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
      SubmissionModel.countDocuments(classFilter),
      SubmissionModel.countDocuments(freeFilter),
      // Top 8 đề đang có nhiều người làm nhất (gộp cả lớp + tự do) cho bảng nhỏ ở Tổng quan.
      SubmissionModel.aggregate([
        { $match: { status: 'đang thi' } },
        {
          $group: {
            _id: '$examId',
            total: { $sum: 1 },
            free: { $sum: { $cond: [{ $ifNull: ['$studentId', false] }, 0, 1] } },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 8 },
      ]),
      StudentAccountModel.countDocuments(),
      TeacherModel.countDocuments({ lastLoginAt: { $gte: sevenDaysAgo } }),
      StudentAccountModel.countDocuments({ lastLoginAt: { $gte: sevenDaysAgo } }),
    ]);

    const topExamIds = (liveByExamRaw as any[]).map((r) => r._id);
    const topExams: any[] = topExamIds.length > 0 ? await Exam.find({ _id: { $in: topExamIds } }, { title: 1 }).lean() : [];
    const titleMap = new Map(topExams.map((e) => [String(e._id), e.title]));
    const liveByExam = (liveByExamRaw as any[]).map((r) => ({
      examId: String(r._id),
      title: titleMap.get(String(r._id)) || '(Đề đã bị xóa)',
      total: r.total as number,
      free: r.free as number,
    }));

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
          // Tổng = học sinh trong lớp + thí sinh tự do.
          liveExamCount: liveClassCount + liveFreeCount,
          liveClassCount,
          liveFreeCount,
          liveByExam,
          studentAccountCount,
          activeTeachers7d,
          activeStudents7d,
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
