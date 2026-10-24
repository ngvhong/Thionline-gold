import mongoose from 'mongoose';
import { SubmissionModel } from '@/lib/submissionModel';
import { StudentModel } from '@/lib/studentModel';
import { Exam } from '@/lib/examModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { resolveEffectiveSettings } from '@/lib/examAccessRules';
import { gradeExam, computeEssayMax, DEFAULT_SCORING } from '@/lib/grading';

// TỰ ĐÓNG BÀI "ĐANG THI" ĐÃ QUÁ GIỜ MÀ HỌC SINH KHÔNG NỘP
//
// SỰ CỐ (khiếu nại: "hs không nộp bài hiện đang thi mãi mãi là không chấp
// nhận được"): status 'đang thi' được ghi lúc học sinh mở đề (start/route.ts)
// và chỉ chuyển sang 'đã nộp' khi trình duyệt của học sinh gọi API nộp bài.
// Học sinh tắt tab / hết pin / mất mạng / bỏ thi -> không ai gọi API nộp ->
// bản ghi kẹt 'đang thi' VĨNH VIỄN, hiện mãi ở trang chủ GV, danh sách lớp,
// bảng điểm.
//
// CÁCH SỬA: mốc hết hạn của mỗi lượt đã biết chắc chắn = started_at +
// settings.duration (phút) — chính công thức endAt trong start/route.ts.
// Quá mốc đó + GRACE_MS (chừa thời gian cho trình duyệt còn mở tự nộp lúc
// hết giờ và độ trễ mạng) mà vẫn 'đang thi' thì server tự chốt lượt đó:
// chuyển 'đã nộp', 0 điểm (bài làm dở nằm ở trình duyệt, server không có),
// submitted_at = đúng lúc hết giờ, gắn autoSubmitted = true để phân biệt
// với bài nộp thật. GV muốn em đó làm lại dùng nút "Cho làm lại" như cũ.
//
// Chạy KIỂU LƯỜI (gọi ở đầu các API GET có hiện trạng thái) — không cần cron.
// updateOne có điều kiện status: 'đang thi' nên nếu đúng lúc đó em nộp thật
// thì bài nộp thật thắng, không bị ghi đè.
export const OVERDUE_GRACE_MS = 5 * 60 * 1000;

export async function expireOverdueSubmissions(
  studentIds: (mongoose.Types.ObjectId | string)[]
): Promise<number> {
  if (!studentIds || studentIds.length === 0) return 0;

  const live: any[] = await SubmissionModel.find({
    studentId: { $in: studentIds },
    status: 'đang thi',
  })
    .select('_id studentId examId started_at assigned_at')
    .lean();
  if (live.length === 0) return 0;

  const examIds = [...new Set(live.map((s) => String(s.examId)))];
  const liveStudentIds = [...new Set(live.map((s) => String(s.studentId)))];
  const [exams, students]: [any[], any[]] = await Promise.all([
    Exam.find({ _id: { $in: examIds } }, { settings: 1, raw_data: 1 }).lean(),
    StudentModel.find({ _id: { $in: liveStudentIds } }, { classId: 1 }).lean(),
  ]);
  const examMap = new Map(exams.map((e) => [String(e._id), e]));
  const classOfStudent = new Map(students.map((s) => [String(s._id), String(s.classId)]));

  const assignments: any[] = await ExamAssignmentModel.find({
    examId: { $in: examIds },
    classId: { $in: [...new Set(classOfStudent.values())] },
  }).lean();
  const assignmentMap = new Map(assignments.map((a) => [`${a.examId}|${a.classId}`, a]));

  const now = Date.now();
  let expired = 0;
  for (const sub of live) {
    const exam = examMap.get(String(sub.examId));
    if (!exam) continue; // đề đã bị xoá — không có gì để chấm, để nguyên
    const startedMs = new Date(sub.started_at || sub.assigned_at || 0).getTime();
    if (!startedMs || isNaN(startedMs)) continue;

    const classId = classOfStudent.get(String(sub.studentId));
    const assignment = classId ? assignmentMap.get(`${sub.examId}|${classId}`) : null;
    const settings: any = resolveEffectiveSettings(exam.settings, assignment as any);
    const duration = Math.max(1, Number(settings.duration) || 45);
    const endMs = startedMs + duration * 60000;
    if (now <= endMs + OVERDUE_GRACE_MS) continue; // còn trong giờ (hoặc trong thời gian chừa)

    const scoringUsed = { ...DEFAULT_SCORING, ...(exam.settings?.scoring || {}) };
    const empty = { p1Answers: {}, p2Answers: {}, textAnswers: {} };
    const result = gradeExam(exam.raw_data, empty, scoringUsed);
    const res = await SubmissionModel.updateOne(
      { _id: sub._id, status: 'đang thi' },
      {
        $set: {
          status: 'đã nộp',
          score: result.correct,
          total: result.total,
          scorePoints: result.scorePoints,
          maxScorePoints: result.maxScorePoints,
          scoringUsed,
          answers: empty,
          essayMaxScore: computeEssayMax(exam.raw_data, scoringUsed),
          submitted_at: new Date(endMs),
          autoSubmitted: true,
        },
      }
    );
    if (res.modifiedCount > 0) expired++;
  }
  return expired;
}
