import { pickRepresentativeAttempt, resolveScoreMode } from '@/lib/scoreMode';
import { resolveEffectiveSettings } from '@/lib/examAccessRules';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { StudentModel } from '@/lib/studentModel';
import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { gradeExam, DEFAULT_SCORING } from '@/lib/grading';

// THÊM MỚI (25-10): thống kê THEO TỪNG CÂU của 1 đề — dữ liệu cho biểu đồ cột
// ("Thống kê" trong ExamBuilder). Chỉ tính các bài ĐÃ NỘP của học sinh được GV
// giao đề (có studentId); mỗi học sinh lấy LẦN LÀM MỚI NHẤT. Lượt tự luyện ở
// khu Ôn luyện (không có studentId) không tính vào đây.
// Chấm lại ở server từ answers đã lưu + raw_data hiện tại của đề (cùng hàm
// gradeExam như lúc nộp bài) nên số liệu luôn khớp logic chấm.

type QStat = {
  id: string;
  part: 'p1' | 'p2' | 'p3';
  number: number; // số thứ tự trong phần (từ 1)
  answered: number; // số em có trả lời câu này
  fullyCorrect: number; // số em đúng trọn câu
  pctCorrect: number; // 0-100, trên tổng số bài đã nộp
  // Chỉ Phần I: số em chọn từng phương án (theo thứ tự GỐC A,B,C,D...) và đáp án đúng.
  optionCounts?: number[];
  correctOption?: number | null;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID đề thi không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();
    const exam: any = await Exam.findById(id).select('teacherId title raw_data settings').lean();
    if (!exam || String(exam.teacherId) !== String(teacherId)) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }

    // Mỗi học sinh 1 lần làm đại diện (chỉ bài đã nộp) theo Cách tính điểm của đề:
    // mặc định CAO NHẤT, hoặc lần làm cuối nếu GV chọn 'latest'.
    const allSubs: any[] = await SubmissionModel.find({
      examId: new mongoose.Types.ObjectId(id),
      status: 'đã nộp',
      studentId: { $ne: null },
    }).lean();
    const byStudent = new Map<string, any[]>();
    allSubs.forEach((a: any) => {
      const k = String(a.studentId);
      const arr = byStudent.get(k) || [];
      arr.push(a);
      byStudent.set(k, arr);
    });
    // Cài đặt có thể khác theo lớp (GV chỉnh riêng ở panel Giao đề) -> theo lớp của từng học sinh.
    const studentRows: any[] = await StudentModel.find(
      { _id: { $in: Array.from(byStudent.keys()).map((k) => new mongoose.Types.ObjectId(k)) } },
      { classId: 1 }
    ).lean();
    const classOf = new Map(studentRows.map((r: any) => [String(r._id), String(r.classId)]));
    const assignRows: any[] = await ExamAssignmentModel.find({ examId: id }).lean();
    const assignByClass = new Map(assignRows.map((a: any) => [String(a.classId), a]));
    const subs: any[] = Array.from(byStudent.entries()).map(([sid, arr]) => {
      const eff = resolveEffectiveSettings(exam.settings, assignByClass.get(classOf.get(sid) || '') as any);
      return pickRepresentativeAttempt(arr, resolveScoreMode(eff));
    });

    const raw = exam.raw_data || {};
    const parts: { key: 'p1' | 'p2' | 'p3'; list: any[] }[] = [
      { key: 'p1', list: raw.phan_1_TracNghiem || [] },
      { key: 'p2', list: raw.phan_2_DungSai || [] },
      { key: 'p3', list: raw.phan_3_TraLoiNgan || [] },
    ];

    const questions: QStat[] = [];
    const byId = new Map<string, QStat>();
    for (const { key, list } of parts) {
      list.forEach((q: any, i: number) => {
        const stat: QStat = {
          id: q.id,
          part: key,
          number: i + 1,
          answered: 0,
          fullyCorrect: 0,
          pctCorrect: 0,
        };
        if (key === 'p1') {
          const opts = q.options || [];
          stat.optionCounts = opts.map(() => 0);
          const ci = opts.findIndex((o: any) => o?.isCorrect);
          stat.correctOption = ci >= 0 ? ci : null;
        }
        questions.push(stat);
        byId.set(`${key}:${q.id}`, stat);
      });
    }

    let sumPoints = 0;
    let sumMax = 0;
    for (const s of subs) {
      const answers = s.answers || {};
      const scoring = { ...DEFAULT_SCORING, ...(s.scoringUsed || {}) };
      const result = gradeExam(raw, answers, scoring);
      sumPoints += result.scorePoints;
      sumMax += result.maxScorePoints;
      for (const key of ['p1', 'p2', 'p3'] as const) {
        for (const d of result.details[key]) {
          const stat = byId.get(`${key}:${d.id}`);
          if (!stat) continue;
          if (d.attempted) stat.answered += 1;
          if (d.correct) stat.fullyCorrect += 1;
          if (key === 'p1' && d.attempted && stat.optionCounts) {
            const picked = answers.p1Answers?.[d.id];
            if (typeof picked === 'number' && picked >= 0 && picked < stat.optionCounts.length) {
              stat.optionCounts[picked] += 1;
            }
          }
        }
      }
    }

    const n = subs.length;
    for (const q of questions) q.pctCorrect = n ? Math.round((q.fullyCorrect / n) * 1000) / 10 : 0;

    return NextResponse.json(
      {
        title: exam.title,
        submissionCount: n,
        averagePoints: n ? Math.round((sumPoints / n) * 100) / 100 : 0,
        maxPoints: n ? Math.round((sumMax / n) * 100) / 100 : 0,
        questions,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi thống kê đề:', err);
    return NextResponse.json({ error: 'Không tải được thống kê.' }, { status: 500 });
  }
}
