import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { StudentModel } from '@/lib/studentModel';
import { ClassModel } from '@/lib/classModel';
import { TeacherModel } from '@/lib/teacherModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { getVerifiedStudentAccountIdFromRequest } from '@/lib/studentAuth';
import { resolveEffectiveSettings, canSelfRetake } from '@/lib/examAccessRules';

// THÊM MỚI (Giai đoạn 2 — tab "Đề được giao", xem
// docs-moi/01-KE-HOACH-CHI-TIET.md): route MỚI HOÀN TOÀN, không sửa route
// nào cũ. Trả về mọi đề đang "được giao" cho tài khoản học sinh đang đăng
// nhập (qua cookie student_session_token), gộp theo mọi lớp mà tài khoản đó
// đã join (Student.studentAccountId === tài khoản này).
//
// LƯU Ý QUAN TRỌNG (khác 1 chi tiết nhỏ so với cách đặc tả gốc mô tả — xem
// 01-KE-HOACH-CHI-TIET.md bản gốc viết "lấy mọi ExamAssignment đang mở"):
// KHÔNG dùng ExamAssignmentModel làm nguồn xác định "đề nào đã giao" — bảng
// đó CHỈ có bản ghi khi giáo viên chủ động bật "Dùng cài đặt riêng cho lớp
// này" (xem examAssignmentModel.ts), phần lớn lượt "Giao đề" bình thường
// (POST /api/submissions) KHÔNG tạo ExamAssignment, chỉ tạo các Submission
// "chưa thi" (1 dòng/học sinh). Vì vậy nguồn đúng để biết "đề nào đã giao
// cho em nào" là SubmissionModel (đúng như GV dùng ở GET /api/submissions?
// studentId=...) — ExamAssignmentModel chỉ dùng để tính effectiveSettings
// (giờ mở/đóng/số lần làm lại CÓ HIỆU LỰC), qua resolveEffectiveSettings
// giống hệt các route /thi khác, không tự suy luận riêng ở đây.
export async function GET(request: NextRequest) {
  try {
    const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
    if (!studentAccountId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    await connectToDatabase();

    // Mọi dòng roster (Student, thuộc 1 lớp cụ thể) mà tài khoản này đã
    // "vào lớp" nhận — có thể nhiều dòng nếu đã join nhiều lớp khác nhau
    // (xem 00-THINKING.md mục 5).
    const rosterRows = await StudentModel.find({ studentAccountId }).select('name classId').lean();
    if (rosterRows.length === 0) {
      return NextResponse.json({ assignments: [] }, { status: 200 });
    }

    const classIdByStudentId = new Map<string, string>();
    const studentObjectIds: mongoose.Types.ObjectId[] = [];
    rosterRows.forEach((r: any) => {
      classIdByStudentId.set(String(r._id), String(r.classId));
      studentObjectIds.push(r._id);
    });

    // Lần làm MỚI NHẤT của mỗi cặp (studentId, examId) — đúng quy ước đã ghi
    // trong submissionModel.ts (attemptNumber lớn nhất = kết quả chính thức).
    const latestPerExam = await SubmissionModel.aggregate([
      { $match: { studentId: { $in: studentObjectIds } } },
      { $sort: { attemptNumber: -1 } },
      { $group: { _id: { studentId: '$studentId', examId: '$examId' }, doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]);

    if (latestPerExam.length === 0) {
      return NextResponse.json({ assignments: [] }, { status: 200 });
    }

    const examIds = [...new Set(latestPerExam.map((s: any) => String(s.examId)))];
    const classIds = [...new Set(rosterRows.map((r: any) => String(r.classId)))];

    const [exams, classes, assignmentsRaw] = await Promise.all([
      Exam.find({ _id: { $in: examIds } }, { title: 1, settings: 1, is_published: 1 }).lean(),
      ClassModel.find({ _id: { $in: classIds } }, { name: 1, ownerId: 1 }).lean(),
      ExamAssignmentModel.find({ examId: { $in: examIds }, classId: { $in: classIds } }).lean(),
    ]);

    const examMap = new Map(exams.map((e: any) => [String(e._id), e]));
    const classMap = new Map(classes.map((c: any) => [String(c._id), c]));
    const assignmentMap = new Map(assignmentsRaw.map((a: any) => [`${a.examId}_${a.classId}`, a]));

    const teacherIds = [...new Set(classes.map((c: any) => String((c as any).ownerId)))];
    const teachers = teacherIds.length
      ? await TeacherModel.find({ _id: { $in: teacherIds } }, { name: 1 }).lean()
      : [];
    const teacherMap = new Map(teachers.map((t: any) => [String(t._id), t.name]));

    const now = Date.now();

    const assignments = latestPerExam
      .map((s: any) => {
        const examId = String(s.examId);
        const rosterStudentId = String(s.studentId);
        const classId = classIdByStudentId.get(rosterStudentId);
        if (!classId) return null;
        const exam: any = examMap.get(examId);
        // Đề bị xoá hoặc GV đã gỡ xuất bản SAU KHI giao — không hiện cho học
        // sinh nữa (an toàn hơn là hiện 1 đề không mở được).
        if (!exam || !exam.is_published) return null;
        const cls: any = classMap.get(classId);
        if (!cls) return null;
        const assignment = assignmentMap.get(`${examId}_${classId}`) || null;
        const effectiveSettings = resolveEffectiveSettings(exam.settings, assignment as any);

        const done = s.status === 'đã nộp';
        const closeAtMs = effectiveSettings.closeAt ? new Date(effectiveSettings.closeAt).getTime() : null;
        const openAtMs = effectiveSettings.openAt ? new Date(effectiveSettings.openAt).getTime() : null;

        return {
          examId,
          examTitle: exam.title || '(Đề thi)',
          classId,
          className: cls.name,
          teacherName: teacherMap.get(String(cls.ownerId)) || '',
          // studentId = _id của dòng roster (Student) — dùng để gọi thẳng
          // POST /api/thi/[examId]/start { classId, studentId } (route CŨ,
          // không sửa gì) vì danh tính đã biết chắc chắn qua tài khoản, không
          // cần màn "chọn tên" nữa.
          studentId: rosterStudentId,
          openAt: effectiveSettings.openAt || null,
          closeAt: effectiveSettings.closeAt || null,
          isNotYetOpen: !!(openAtMs && now < openAtMs),
          isClosed: !!(closeAtMs && now > closeAtMs),
          status: done ? 'done' : 'not_done',
          score: done ? s.score ?? null : null,
          total: done ? s.total ?? null : null,
          scorePoints: done ? s.scorePoints ?? null : null,
          maxScorePoints: done ? s.maxScorePoints ?? null : null,
          attemptNumber: s.attemptNumber,
          canRetake: done ? canSelfRetake(effectiveSettings, s.attemptNumber) : false,
          assignedAt: s.assigned_at || null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        const ta = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
        const tb = b.assignedAt ? new Date(b.assignedAt).getTime() : 0;
        return tb - ta;
      });

    return NextResponse.json({ assignments }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy danh sách đề được giao:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách đề được giao, thử tải lại trang.' },
      { status: 500 }
    );
  }
}
