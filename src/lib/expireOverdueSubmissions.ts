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
// BỔ SUNG (25-10, "đang thi mãi mãi" vẫn còn): bản trước CHỈ xử lý lượt có
// studentId (học sinh trong lớp). Lượt "Ôn luyện"/thí sinh tự do (kho đề
// chung, studentId = null, chỉ có studentAccountId) KHÔNG BAO GIỜ được chốt
// nên kẹt 'đang thi' vĩnh viễn, và còn đội số liệu "HS đang thi" của admin.
// Nay có thêm expireOverdueFreeSubmissions() cho nhóm này (công thức giờ y hệt:
// started_at + duration của ĐỀ, vì Ôn luyện không có cài đặt riêng theo lớp).
// Thêm computeLiveEndTimes() để API liệt kê "đang thi" ẩn NGAY những lượt đã
// hết giờ (không cần chờ OVERDUE_GRACE_MS mới tự chốt trong DB).
//
// Chạy KIỂU LƯỜI (gọi ở đầu các API GET có hiện trạng thái) — không cần cron.
// updateOne có điều kiện status: 'đang thi' nên nếu đúng lúc đó em nộp thật
// thì bài nộp thật thắng, không bị ghi đè.
export const OVERDUE_GRACE_MS = 5 * 60 * 1000;
// Đề đã bị xoá thì không có giờ làm bài để tính — coi lượt 'đang thi' là bỏ
// dở nếu đã mở quá ngần này giờ rồi chốt cho khỏi kẹt (không chấm được).
const ORPHAN_EXAM_MAX_MS = 24 * 60 * 60 * 1000;

// Mốc bắt đầu của 1 lượt: started_at, rồi assigned_at, cuối cùng là thời điểm
// tạo bản ghi (ObjectId) — để lượt thiếu cả 2 trường kia không bị bỏ qua mãi.
function startedMsOf(sub: any): number {
  let ms = new Date(sub.started_at || sub.assigned_at || 0).getTime();
  if (!ms || isNaN(ms)) {
    try {
      ms = new mongoose.Types.ObjectId(String(sub._id)).getTimestamp().getTime();
    } catch {
      ms = 0;
    }
  }
  return ms;
}

type EndInfo = { endMs: number; exam: any } | { endMs: null; exam: null; startedMs: number };

// Tính giờ hết hạn (ms) cho từng lượt 'đang thi' đã tải sẵn. Lượt có studentId
// dùng cài đặt đã gộp theo lớp (assignment); lượt tự do (không studentId) chỉ
// dùng cài đặt của đề. Trả Map theo _id lượt; endMs = null nếu đề đã bị xoá.
export async function computeLiveEndTimes(live: any[]): Promise<Map<string, EndInfo>> {
  const result = new Map<string, EndInfo>();
  if (!live || live.length === 0) return result;

  const examIds = [...new Set(live.map((s) => String(s.examId)))];
  const liveStudentIds = [...new Set(live.filter((s) => s.studentId).map((s) => String(s.studentId)))];
  const [exams, students]: [any[], any[]] = await Promise.all([
    Exam.find({ _id: { $in: examIds } }, { settings: 1, raw_data: 1 }).lean(),
    liveStudentIds.length > 0
      ? StudentModel.find({ _id: { $in: liveStudentIds } }, { classId: 1 }).lean()
      : Promise.resolve([] as any[]),
  ]);
  const examMap = new Map(exams.map((e) => [String(e._id), e]));
  const classOfStudent = new Map(students.map((s) => [String(s._id), String(s.classId)]));

  const classIds = [...new Set(classOfStudent.values())];
  const assignments: any[] =
    classIds.length > 0
      ? await ExamAssignmentModel.find({ examId: { $in: examIds }, classId: { $in: classIds } }).lean()
      : [];
  const assignmentMap = new Map(assignments.map((a) => [`${a.examId}|${a.classId}`, a]));

  for (const sub of live) {
    const startedMs = startedMsOf(sub);
    const exam = examMap.get(String(sub.examId));
    if (!exam) {
      result.set(String(sub._id), { endMs: null, exam: null, startedMs });
      continue;
    }
    if (!startedMs) continue;
    const classId = sub.studentId ? classOfStudent.get(String(sub.studentId)) : undefined;
    const assignment = classId ? assignmentMap.get(`${sub.examId}|${classId}`) : null;
    const settings: any = resolveEffectiveSettings(exam.settings, assignment as any);
    const duration = Math.max(1, Number(settings.duration) || 45);
    result.set(String(sub._id), { endMs: startedMs + duration * 60000, exam });
  }
  return result;
}

// Chốt các lượt trong `live` đã quá (giờ hết hạn + GRACE_MS). Dùng chung cho
// nhóm học sinh trong lớp và nhóm tự do.
async function closeOverdue(live: any[]): Promise<number> {
  if (live.length === 0) return 0;
  const ends = await computeLiveEndTimes(live);
  const now = Date.now();
  let expired = 0;
  for (const sub of live) {
    const info = ends.get(String(sub._id));
    if (!info) continue;

    if (info.endMs === null) {
      // Đề đã bị xoá: không chấm được. Quá 24 giờ kể từ lúc mở thì chốt bỏ dở.
      if (now - info.startedMs < ORPHAN_EXAM_MAX_MS) continue;
      const r = await SubmissionModel.updateOne(
        { _id: sub._id, status: 'đang thi' },
        { $set: { status: 'đã nộp', score: 0, total: 0, scorePoints: 0, maxScorePoints: 0, submitted_at: new Date(), autoSubmitted: true } }
      );
      if (r.modifiedCount > 0) expired++;
      continue;
    }

    const { endMs, exam } = info;
    if (now <= endMs + OVERDUE_GRACE_MS) continue; // còn trong giờ (hoặc trong thời gian chừa)

    try {
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
    } catch (err) {
      // 1 lượt lỗi chấm (đề hỏng...) không được làm hỏng cả API liệt kê.
      console.error('Không tự chốt được lượt quá giờ', String(sub._id), err);
    }
  }
  return expired;
}

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
  return closeOverdue(live);
}

// THÊM MỚI: tự chốt lượt 'đang thi' quá giờ của thí sinh tự do/Ôn luyện (không
// có studentId). Gọi ở đầu các API thống kê của admin.
export async function expireOverdueFreeSubmissions(): Promise<number> {
  const live: any[] = await SubmissionModel.find({
    status: 'đang thi',
    $or: [{ studentId: null }, { studentId: { $exists: false } }],
  })
    .select('_id studentId examId started_at assigned_at')
    .lean();
  return closeOverdue(live);
}
