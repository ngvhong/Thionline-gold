import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/submissions?studentId=...
//   → toàn bộ đề đã giao cho 1 học sinh, MỖI ĐỀ 1 DÒNG (lần làm mới nhất) —
//   dùng ở tầng 3 tab Quản lý lớp.
// GET /api/submissions?studentId=...&examId=...&history=1
//   → THÊM MỚI: toàn bộ CÁC LẦN LÀM (mọi attempt) của đúng 1 cặp học sinh-đề,
//   dùng cho mục "Lịch sử làm bài" khi GV muốn xem lại các lần trước.
// GET /api/submissions?classId=...&examId=...
//   → trạng thái giao đề của từng em trong lớp, cho 1 đề cụ thể (dùng khi mở
//   panel "Giao đề" để biết em nào đã được giao đề này rồi, tránh giao trùng
//   nhìn nhầm là giao mới).
export async function GET(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const studentId = request.nextUrl.searchParams.get('studentId');
    const classId = request.nextUrl.searchParams.get('classId');
    const examId = request.nextUrl.searchParams.get('examId');

    await connectToDatabase();

    // Lưu ý: chỉ vào nhánh "tổng quan" này khi KHÔNG kèm examId — có examId
    // đi cùng nghĩa là GV đang xin lịch sử 1 đề cụ thể (xem nhánh history bên
    // dưới), tránh nhánh này "nuốt mất" request trước khi tới được đó.
    if (studentId && !examId) {
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return NextResponse.json({ error: 'studentId không hợp lệ.' }, { status: 400 });
      }
      const student = await StudentModel.findById(studentId).lean();
      if (!student) {
        return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
      }
      // Học sinh có thật, nhưng phải thuộc lớp của đúng GV đang đăng nhập.
      const ownedClass = await ClassModel.findOne({ _id: (student as any).classId, ownerId: teacherId }).lean();
      if (!ownedClass) {
        return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
      }

      // Mỗi đề chỉ lấy lần làm (attempt) MỚI NHẤT làm kết quả "chính thức" —
      // đúng quy ước đã ghi sẵn trong submissionModel.ts, để sau này nút "Cho
      // làm lại" (Bước 3) không làm trùng dòng hiển thị ở đây.
      const latestPerExam = await SubmissionModel.aggregate([
        { $match: { studentId: new mongoose.Types.ObjectId(studentId) } },
        { $sort: { attemptNumber: -1 } },
        { $group: { _id: '$examId', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $sort: { assigned_at: -1 } },
      ]);

      const examIds = latestPerExam.map((s: any) => s.examId);
      const exams = await Exam.find({ _id: { $in: examIds } }, { title: 1 }).lean();
      const titleMap = new Map(exams.map((e: any) => [String(e._id), e.title]));

      return NextResponse.json(
        {
          submissions: latestPerExam.map((s: any) => ({
            _id: String(s._id),
            examId: String(s.examId),
            examTitle: titleMap.get(String(s.examId)) || '(Đề đã bị xóa)',
            status: s.status,
            score: s.score ?? null,
            total: s.total ?? null,
            scorePoints: s.scorePoints ?? null,
            maxScorePoints: s.maxScorePoints ?? null,
            attemptNumber: s.attemptNumber,
            assigned_at: s.assigned_at,
            submitted_at: s.submitted_at || null,
          })),
        },
        { status: 200 }
      );
    }

    // GET /api/submissions?studentId=...&examId=...&history=1
    //   → TOÀN BỘ các lần làm (mọi attempt) của đúng 1 cặp học sinh-đề này,
    //   mới nhất trước — dùng cho mục "Lịch sử làm bài" khi GV bấm xem lại
    //   các lần trước (khác với nhánh chỉ-studentId ở trên, vốn CHỈ trả lần
    //   mới nhất mỗi đề để hiện danh sách tổng quan gọn).
    if (studentId && examId && request.nextUrl.searchParams.get('history')) {
      if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(examId)) {
        return NextResponse.json({ error: 'studentId/examId không hợp lệ.' }, { status: 400 });
      }
      const student = await StudentModel.findById(studentId).lean();
      if (!student) {
        return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
      }
      const ownedClass = await ClassModel.findOne({ _id: (student as any).classId, ownerId: teacherId }).lean();
      if (!ownedClass) {
        return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
      }

      const attempts = await SubmissionModel.find({ studentId, examId })
        .sort({ attemptNumber: -1 })
        .lean();

      return NextResponse.json(
        {
          attempts: attempts.map((s: any) => ({
            _id: String(s._id),
            attemptNumber: s.attemptNumber,
            status: s.status,
            score: s.score ?? null,
            total: s.total ?? null,
            scorePoints: s.scorePoints ?? null,
            maxScorePoints: s.maxScorePoints ?? null,
            started_at: s.started_at || null,
            submitted_at: s.submitted_at || null,
          })),
        },
        { status: 200 }
      );
    }

    // GET /api/submissions?classId=...  (KHÔNG kèm examId)
    //   → THÊM MỚI (GV yêu cầu 29-8: "chỉ cần dòng chữ nhỏ dưới tên mỗi em
    //   trong danh sách lớp, ghi 'Đang thi' lúc em đó đang làm bài, 'Đã thi
    //   xong' lúc em đó vừa nộp — không cần rắc rối hơn (không cần
    //   heartbeat)"). Khác với nhánh classId+examId ở trên (chỉ 1 đề cụ
    //   thể), nhánh này lấy trạng thái theo LẦN HOẠT ĐỘNG GẦN NHẤT của mỗi
    //   em trên TOÀN BỘ đề đã giao (không cần biết đề nào) — vừa đủ cho 1
    //   dòng badge gọn ở danh sách lớp, không phải màn hình xem chi tiết
    //   theo từng đề (đã có sẵn khi bấm vào 1 học sinh).
    if (classId && !examId) {
      if (!mongoose.Types.ObjectId.isValid(classId)) {
        return NextResponse.json({ error: 'classId không hợp lệ.' }, { status: 400 });
      }
      const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
      if (!cls) {
        return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
      }

      const students = await StudentModel.find({ classId }, { _id: 1 }).lean();
      const studentIds = students.map((s: any) => s._id);

      // Mỗi em có thể có nhiều đề, nhiều attempt mỗi đề — sắp theo thời điểm
      // hoạt động gần nhất (started_at nếu có, không thì assigned_at) rồi
      // chỉ lấy 1 dòng mới nhất/em, đúng ý "trạng thái đang hiện lên người
      // này bây giờ ra sao", không cộng dồn theo đề.
      const latestPerStudent = await SubmissionModel.aggregate([
        { $match: { studentId: { $in: studentIds } } },
        {
          $addFields: {
            _activityAt: { $ifNull: ['$started_at', '$assigned_at'] },
          },
        },
        { $sort: { _activityAt: -1, attemptNumber: -1 } },
        { $group: { _id: '$studentId', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ]);

      return NextResponse.json(
        {
          assignments: latestPerStudent.map((s: any) => ({
            studentId: String(s.studentId),
            status: s.status,
          })),
        },
        { status: 200 }
      );
    }

    if (classId && examId) {
      if (!mongoose.Types.ObjectId.isValid(classId) || !mongoose.Types.ObjectId.isValid(examId)) {
        return NextResponse.json({ error: 'classId/examId không hợp lệ.' }, { status: 400 });
      }
      const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
      if (!cls) {
        return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
      }

      const students = await StudentModel.find({ classId }, { _id: 1 }).lean();
      const studentIds = students.map((s: any) => s._id);

      const latestPerStudent = await SubmissionModel.aggregate([
        { $match: { examId: new mongoose.Types.ObjectId(examId), studentId: { $in: studentIds } } },
        { $sort: { attemptNumber: -1 } },
        { $group: { _id: '$studentId', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ]);

      return NextResponse.json(
        {
          assignments: latestPerStudent.map((s: any) => ({
            studentId: String(s.studentId),
            status: s.status,
          })),
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'Cần truyền studentId, hoặc cả classId và examId.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Lỗi lấy dữ liệu giao đề:', err);
    return NextResponse.json(
      { error: 'Không lấy được dữ liệu giao đề, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// POST /api/submissions — giao 1 đề ĐÃ XUẤT BẢN cho cả lớp hoặc từng em.
// Body: { examId, classId, studentIds?: string[] }  (bỏ studentIds = giao cho cả lớp)
export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { examId, classId, studentIds } = await request.json();

    if (!examId || !mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai examId.' }, { status: 400 });
    }
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai classId.' }, { status: 400 });
    }

    await connectToDatabase();

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    // Chỉ giao được đề ĐÃ xuất bản — đề nháp chưa qua soát lỗi không nên tới
    // tay học sinh.
    if (!(exam as any).is_published) {
      return NextResponse.json(
        { error: 'Đề này chưa được xuất bản, chưa thể giao cho học sinh.' },
        { status: 400 }
      );
    }

    const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    let targetStudentIds: string[];
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      // Xác nhận từng học sinh được chọn thật sự thuộc lớp này — chặn trường
      // hợp body bị chỉnh tay gửi kèm studentId của lớp/GV khác.
      const validIds = studentIds.filter((sid: any) => mongoose.Types.ObjectId.isValid(sid));
      const belongToClass = await StudentModel.find({ _id: { $in: validIds }, classId }, { _id: 1 }).lean();
      targetStudentIds = belongToClass.map((s: any) => String(s._id));
    } else {
      const allStudents = await StudentModel.find({ classId }, { _id: 1 }).lean();
      targetStudentIds = allStudents.map((s: any) => String(s._id));
    }

    if (targetStudentIds.length === 0) {
      return NextResponse.json({ error: 'Không có học sinh nào hợp lệ để giao đề.' }, { status: 400 });
    }

    // Idempotent: em nào ĐÃ có submission cho đề này (bất kỳ attempt nào) thì
    // bỏ qua, không tạo thêm bản ghi trùng — GV bấm "Giao đề" nhiều lần cho
    // cùng lớp/đề không tạo dữ liệu rác.
    const existing = await SubmissionModel.find(
      { examId, studentId: { $in: targetStudentIds } },
      { studentId: 1 }
    ).lean();
    const alreadyAssigned = new Set(existing.map((s: any) => String(s.studentId)));

    const toCreate = targetStudentIds
      .filter((sid) => !alreadyAssigned.has(sid))
      .map((studentId) => ({
        studentId,
        examId,
        status: 'chưa thi',
        attemptNumber: 1,
        assigned_at: new Date(),
      }));

    if (toCreate.length > 0) {
      await SubmissionModel.insertMany(toCreate);
    }

    return NextResponse.json(
      {
        assignedCount: toCreate.length,
        skippedCount: targetStudentIds.length - toCreate.length,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Lỗi giao đề:', err);
    return NextResponse.json(
      { error: 'Không giao được đề, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
