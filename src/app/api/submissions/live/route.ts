import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/submissions/live
//   → THÊM MỚI (GV yêu cầu 29-8: "muốn nhìn 1 danh sách biết HS nào đang
//   online để thi, khỏi phải bấm vào từng lớp/từng đề mới thấy"): gom TẤT
//   CẢ học sinh đang có status 'đang thi' (đã bấm bắt đầu, chưa nộp) trên
//   MỌI lớp + MỌI đề của giáo viên đang đăng nhập, trả về 1 danh sách phẳng
//   kèm tên HS, tên lớp, tên đề, thời điểm bắt đầu — để hiện ngay ở trang
//   chủ, không cần vào Quản lý lớp chọn từng lớp/từng đề như trước.
//
// LƯU Ý QUAN TRỌNG (đã trao đổi với GV): status 'đang thi' chỉ dựa trên
// started_at đã ghi + submitted_at còn trống — đây là tín hiệu "đã bắt đầu,
// chưa nộp", KHÔNG phải tín hiệu "trình duyệt đang thật sự mở/kết nối".
// Nếu HS tắt tab/mất mạng giữa chừng mà chưa nộp, dòng này vẫn hiện ở đây
// cho tới khi nộp hoặc hết giờ. Muốn chính xác hơn (biết chắc HS còn đang
// mở bài) cần thêm cơ chế heartbeat riêng — chưa làm ở bản này theo đúng lựa
// chọn "làm nhanh, dùng dữ liệu có sẵn" của GV.
export async function GET(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    await connectToDatabase();

    // Chỉ lấy lớp thuộc đúng GV này — không được thấy HS đang thi của GV khác.
    const myClasses = await ClassModel.find({ ownerId: teacherId }, { name: 1 }).lean();
    if (myClasses.length === 0) {
      return NextResponse.json({ liveStudents: [] }, { status: 200 });
    }
    const classIds = myClasses.map((c: any) => c._id);
    const classNameMap = new Map(myClasses.map((c: any) => [String(c._id), c.name]));

    const myStudents = await StudentModel.find(
      { classId: { $in: classIds } },
      { name: 1, classId: 1 }
    ).lean();
    if (myStudents.length === 0) {
      return NextResponse.json({ liveStudents: [] }, { status: 200 });
    }
    const studentIds = myStudents.map((s: any) => s._id);
    const studentMap = new Map(
      myStudents.map((s: any) => [String(s._id), { name: s.name, classId: String(s.classId) }])
    );

    // Mỗi cặp (studentId, examId) có thể có nhiều attempt — chỉ lần làm MỚI
    // NHẤT mới phản ánh đúng trạng thái hiện tại, giống cách các API khác
    // trong file submissions/route.ts đã làm (aggregate + $group theo cặp).
    const liveSubmissions = await SubmissionModel.aggregate([
      {
        $match: {
          studentId: { $in: studentIds },
          status: 'đang thi',
        },
      },
      { $sort: { attemptNumber: -1 } },
      { $group: { _id: { studentId: '$studentId', examId: '$examId' }, doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { started_at: -1 } },
    ]);

    if (liveSubmissions.length === 0) {
      return NextResponse.json({ liveStudents: [] }, { status: 200 });
    }

    const examIds = [...new Set(liveSubmissions.map((s: any) => String(s.examId)))];
    const exams = await Exam.find({ _id: { $in: examIds } }, { title: 1 }).lean();
    const examTitleMap = new Map(exams.map((e: any) => [String(e._id), e.title]));

    const liveStudents = liveSubmissions
      .map((s: any) => {
        const student = studentMap.get(String(s.studentId));
        if (!student) return null; // học sinh đã bị xóa sau khi giao đề — bỏ qua
        return {
          studentId: String(s.studentId),
          studentName: student.name,
          className: classNameMap.get(student.classId) || '(Lớp đã bị xóa)',
          examId: String(s.examId),
          examTitle: examTitleMap.get(String(s.examId)) || '(Đề đã bị xóa)',
          started_at: s.started_at || null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ liveStudents }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy danh sách học sinh đang thi:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách học sinh đang thi, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
