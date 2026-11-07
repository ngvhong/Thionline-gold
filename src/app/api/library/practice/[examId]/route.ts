import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { PracticeProgressModel } from '@/lib/practiceProgressModel';
import { getVerifiedStudentAccountIdFromRequest } from '@/lib/studentAuth';
import { gradeExam, DEFAULT_SCORING } from '@/lib/grading';

// THÊM MỚI (25-10): tab "Ôn luyện" kiểu TƯƠNG TÁC (khác "Thi thử" làm như thi thật).
//   GET    -> dữ liệu đề + tiến độ đã lưu của học sinh
//   PUT    -> lưu tiến độ (server chấm lại các câu đã "kiểm tra" để lấy điểm)
//   DELETE -> làm lại: xóa sạch tiến độ rồi ghi đè (attempts + 1)
//
// LƯU Ý: Ôn luyện chấm NGAY từng câu và có ổ khóa lời giải ở giao diện, nên đề được
// gửi về trình duyệt KÈM đáp án/lời giải (khác luồng Thi thử). Đây là khu tự luyện mở
// cho học sinh nên chấp nhận được; muốn chống lộ đáp án thì dùng chế độ Thi thử.

async function loadExam(examId: string) {
  const exam: any = await Exam.findById(examId).lean();
  if (!exam || !exam.is_published || !exam.openForStudents) return null;
  return exam;
}

const keyOf = (part: string, id: string) => `${part}:${id}`;

function strArr(v: unknown, max = 500): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length < 80).slice(0, max) : [];
}

// Chấm lại CHỈ các câu đã khóa (checked) và tóm tắt tiến độ.
function summarize(exam: any, body: any) {
  const raw = exam.raw_data || {};
  const scoring = { ...DEFAULT_SCORING, ...((exam.settings?.scoring as any) || {}) };
  const checked = strArr(body.checked);
  const checkedSet = new Set(checked);
  const p1All = body.p1Answers && typeof body.p1Answers === 'object' ? body.p1Answers : {};
  const p2All = body.p2Answers && typeof body.p2Answers === 'object' ? body.p2Answers : {};
  const txAll = body.textAnswers && typeof body.textAnswers === 'object' ? body.textAnswers : {};
  const p1: Record<string, number> = {};
  const p2: Record<string, any> = {};
  const tx: Record<string, string> = {};
  for (const q of raw.phan_1_TracNghiem || []) {
    if (checkedSet.has(keyOf('p1', q.id)) && typeof p1All[q.id] === 'number') p1[q.id] = p1All[q.id];
  }
  for (const q of raw.phan_2_DungSai || []) {
    if (checkedSet.has(keyOf('p2', q.id)) && p2All[q.id] && typeof p2All[q.id] === 'object') p2[q.id] = p2All[q.id];
  }
  for (const q of raw.phan_3_TraLoiNgan || []) {
    if (checkedSet.has(keyOf('p3', q.id)) && typeof txAll[q.id] === 'string') tx[q.id] = String(txAll[q.id]).slice(0, 60);
  }
  const result = gradeExam(raw, { p1Answers: p1, p2Answers: p2, textAnswers: tx }, scoring);
  const validKeys = new Set<string>();
  for (const [part, list] of [
    ['p1', raw.phan_1_TracNghiem],
    ['p2', raw.phan_2_DungSai],
    ['p3', raw.phan_3_TraLoiNgan],
    ['p4', raw.phan_4_TuLuan],
  ] as const) {
    for (const q of list || []) validKeys.add(keyOf(part, q.id));
  }
  const solutionOpened = strArr(body.solutionOpened).filter((k) => validKeys.has(k));
  const answeredKeys = checked.filter((k) => validKeys.has(k) && !k.startsWith('p4:'));
  return {
    p1Answers: p1,
    p2Answers: p2,
    textAnswers: tx,
    checked: answeredKeys,
    solutionOpened,
    answered: answeredKeys.length,
    total: result.total,
    scorePoints: result.scorePoints,
    maxScorePoints: result.maxScorePoints,
    solutionCount: solutionOpened.filter((k) => !k.startsWith('p4:')).length,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
    if (!studentAccountId) {
      return NextResponse.json({ error: 'Cần đăng nhập tài khoản học sinh để ôn luyện.' }, { status: 401 });
    }
    const { examId } = await params;
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Đề không hợp lệ.' }, { status: 400 });
    }
    await connectToDatabase();
    const exam = await loadExam(examId);
    if (!exam) return NextResponse.json({ error: 'Không tìm thấy đề trong khu Ôn luyện.' }, { status: 404 });

    const progress: any = await PracticeProgressModel.findOne({ studentAccountId, examId }).lean();
    return NextResponse.json(
      {
        title: exam.title || '(Đề)',
        raw_data: exam.raw_data,
        scoring: { ...DEFAULT_SCORING, ...((exam.settings?.scoring as any) || {}) },
        imageScalePercent: exam.settings?.imageScalePercent,
        progress: progress
          ? {
              p1Answers: progress.p1Answers || {},
              p2Answers: progress.p2Answers || {},
              textAnswers: progress.textAnswers || {},
              checked: progress.checked || [],
              solutionOpened: progress.solutionOpened || [],
              attempts: progress.attempts || 1,
            }
          : null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi tải đề Ôn luyện:', err);
    return NextResponse.json({ error: 'Không tải được đề.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
    if (!studentAccountId) {
      return NextResponse.json({ error: 'Cần đăng nhập tài khoản học sinh để lưu tiến độ.' }, { status: 401 });
    }
    const { examId } = await params;
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Đề không hợp lệ.' }, { status: 400 });
    }
    await connectToDatabase();
    const exam = await loadExam(examId);
    if (!exam) return NextResponse.json({ error: 'Không tìm thấy đề trong khu Ôn luyện.' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const summary = summarize(exam, body);
    await PracticeProgressModel.findOneAndUpdate(
      { studentAccountId, examId },
      { $set: { ...summary, updated_at: new Date() }, $setOnInsert: { attempts: 1 } },
      { upsert: true }
    );
    return NextResponse.json(
      {
        ok: true,
        answered: summary.answered,
        total: summary.total,
        scorePoints: summary.scorePoints,
        maxScorePoints: summary.maxScorePoints,
        solutionCount: summary.solutionCount,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lưu tiến độ Ôn luyện:', err);
    return NextResponse.json({ error: 'Không lưu được tiến độ.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
    if (!studentAccountId) {
      return NextResponse.json({ error: 'Cần đăng nhập tài khoản học sinh.' }, { status: 401 });
    }
    const { examId } = await params;
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Đề không hợp lệ.' }, { status: 400 });
    }
    await connectToDatabase();
    const exam = await loadExam(examId);
    if (!exam) return NextResponse.json({ error: 'Không tìm thấy đề trong khu Ôn luyện.' }, { status: 404 });

    const empty = summarize(exam, {});
    await PracticeProgressModel.findOneAndUpdate(
      { studentAccountId, examId },
      { $set: { ...empty, updated_at: new Date() }, $inc: { attempts: 1 } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi làm lại Ôn luyện:', err);
    return NextResponse.json({ error: 'Không làm lại được.' }, { status: 500 });
  }
}
