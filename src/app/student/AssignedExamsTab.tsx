'use client';

// THÊM MỚI (Giai đoạn 2 — tab "Đề được giao", xem
// docs-moi/01-KE-HOACH-CHI-TIET.md): file MỚI HOÀN TOÀN. Đúng 2 NGOẠI LỆ đã
// nói ở 00-THINKING.md mục 2.5 — file này (nhánh code học sinh) được phép
// import StudentTakeExam.tsx và SolutionView.tsx (nhánh code GV) vì đó là
// engine làm bài/xem lời giải DÙNG CHUNG, không viết lại lần 2 dễ lệch nhau.
//
// KHÁC 1 CHI TIẾT so với đặc tả gốc trong 01-KE-HOACH-CHI-TIET.md: đặc tả
// gốc đề nghị sửa StudentTakeExam.tsx để thêm prop "danh tính truyền sẵn"
// (presetStudentAccountId) — nhưng kiểm tra lại thực tế, StudentTakeExam.tsx
// KHÔNG tự chọn danh tính (không có UI "chọn tên" bên trong nó); việc chọn
// tên nằm ở ThiPageClient.tsx (nhánh /thi/[examId] cũ), còn StudentTakeExam
// chỉ NHẬN danh tính đã có sẵn qua props (studentName, submissionId...) sau
// khi nơi gọi đã tự gọi /api/thi/[examId]/start xong. Vì tài khoản học sinh
// (Giai đoạn 1) đã BIẾT CHẮC CHẮN danh tính (Student._id đúng của em trong
// lớp đó, qua Student.studentAccountId), component dưới đây gọi thẳng
// /api/thi/[examId]/start với đúng {classId, studentId} đã biết — KHÔNG cần
// màn "chọn tên" nào, KHÔNG cần sửa StudentTakeExam.tsx/start route.ts lấy
// 1 dòng nào. Route submit (duy nhất bị sửa, xem submit/route.ts) chỉ THÊM
// việc ghi studentAccountId song song, đúng như đặc tả.

import { useEffect, useState } from 'react';
import StudentTakeExam from '@/app/thi/[examId]/StudentTakeExam';
import SolutionView from '@/app/thi/[examId]/SolutionView';
import { round2 } from '@/lib/grading';
import type { P1Answers, P2Answers, TextAnswers, ScoringSettings } from '@/lib/grading';

type AssignmentRow = {
  examId: string;
  examTitle: string;
  classId: string;
  className: string;
  teacherName: string;
  studentId: string;
  openAt: string | null;
  closeAt: string | null;
  isNotYetOpen: boolean;
  isClosed: boolean;
  status: 'done' | 'not_done';
  score: number | null;
  total: number | null;
  scorePoints: number | null;
  maxScorePoints: number | null;
  attemptNumber: number;
  canRetake: boolean;
  assignedAt: string | null;
};

type ExamSession = {
  submissionId: string;
  studentName: string;
  examTitle: string;
  raw_data: any;
  settings: {
    duration: number;
    shuffle?: boolean;
    showSolution?: 'after_submit' | 'never' | 'after_close' | 'custom_time';
    scoring?: ScoringSettings;
    imageScalePercent?: number;
  };
  endAt: number;
};

type SubmitResult = {
  score: number;
  total: number;
  scorePoints?: number;
  maxScorePoints?: number;
  showSolution: boolean;
  solutionData?: {
    examData: any;
    p1Answers: P1Answers;
    p2Answers: P2Answers;
    textAnswers: TextAnswers;
    scoring?: ScoringSettings;
  };
  canRetake?: boolean;
  studentName?: string;
  imageScalePercent?: number;
};

// ============================================================
// ---------- Màn làm 1 đề cụ thể (bắt đầu -> làm bài -> kết quả) ----------
// ============================================================
function AssignedExamRunner({
  examId,
  classId,
  studentId,
  onBack,
}: {
  examId: string;
  classId: string;
  studentId: string;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<'starting' | 'taking' | 'done' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const [session, setSession] = useState<ExamSession | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [showSolutionView, setShowSolutionView] = useState(false);

  async function start(retake: boolean) {
    setPhase('starting');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/thi/${examId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, studentId, retake }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không bắt đầu được bài thi.');

      if (data.alreadySubmitted) {
        setResult({
          score: data.score,
          total: data.total,
          scorePoints: data.scorePoints,
          maxScorePoints: data.maxScorePoints,
          showSolution: !!data.showSolution,
          solutionData: data.solutionData,
          canRetake: !!data.canRetake,
          studentName: data.studentName,
          imageScalePercent: data.settings?.imageScalePercent,
        });
        setShowSolutionView(false);
        setPhase('done');
        return;
      }

      setSession(data);
      setPhase('taking');
    } catch (err: any) {
      setErrorMsg(err.message || 'Không bắt đầu được bài thi.');
      setPhase('error');
    }
  }

  useEffect(() => {
    start(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, classId, studentId]);

  if (phase === 'starting') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
        Đang chuẩn bị bài thi…
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-red-600 mb-4">{errorMsg}</p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg px-4 py-2 font-medium"
        >
          ← Quay lại danh sách
        </button>
      </div>
    );
  }

  if (phase === 'taking' && session) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-gray-50 z-40">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
          <StudentTakeExam
            examId={examId}
            submissionId={session.submissionId}
            classId={classId}
            studentName={session.studentName}
            examTitle={session.examTitle}
            rawData={session.raw_data}
            settings={session.settings}
            endAt={session.endAt}
            onSubmitted={(r) => {
              setResult(r);
              setShowSolutionView(false);
              setPhase('done');
            }}
          />
        </div>
      </div>
    );
  }

  // phase === 'done'
  if (result) {
    if (showSolutionView && result.solutionData) {
      return (
        <div className="fixed inset-0 overflow-y-auto bg-gray-50 z-40">
          <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
            <SolutionView
              examData={result.solutionData.examData}
              rawData={session?.raw_data || result.solutionData.examData}
              p1Answers={result.solutionData.p1Answers}
              p2Answers={result.solutionData.p2Answers}
              textAnswers={result.solutionData.textAnswers}
              scoring={result.solutionData.scoring}
              imageScalePercent={session?.settings.imageScalePercent ?? result.imageScalePercent}
              onClose={() => setShowSolutionView(false)}
            />
          </div>
        </div>
      );
    }

    const totalScorePoints = typeof result.scorePoints === 'number' ? result.scorePoints : null;
    const totalMaxScorePoints = typeof result.maxScorePoints === 'number' ? result.maxScorePoints : null;
    const displayScore =
      totalScorePoints !== null && totalMaxScorePoints !== null
        ? `${round2(totalScorePoints)}/${round2(totalMaxScorePoints)} điểm`
        : `${result.score}/${result.total}`;

    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <h3 className="text-base font-bold text-gray-900 mb-1">Đã nộp bài!</h3>
        <p className="text-3xl font-bold text-blue-600 mb-4">{displayScore}</p>
        <div className="space-y-2">
          {result.showSolution && result.solutionData && (
            <button
              type="button"
              onClick={() => setShowSolutionView(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition"
            >
              Xem lời giải
            </button>
          )}
          {result.canRetake && (
            <button
              type="button"
              onClick={() => start(true)}
              className="w-full bg-white border border-blue-600 text-blue-600 hover:bg-blue-50 font-semibold py-2.5 rounded-lg transition"
            >
              🔁 Làm lại
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            ← Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================
// ---------- Danh sách đề được giao (nhóm theo lớp) ----------
// ============================================================
export default function AssignedExamsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [active, setActive] = useState<{ examId: string; classId: string; studentId: string } | null>(null);

  function load() {
    setLoading(true);
    setError('');
    fetch('/api/library/my-assignments')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không tải được danh sách đề được giao.');
        setAssignments(data.assignments || []);
      })
      .catch((err) => setError(err.message || 'Không tải được danh sách đề được giao.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (active) {
    return (
      <AssignedExamRunner
        examId={active.examId}
        classId={active.classId}
        studentId={active.studentId}
        onBack={() => {
          setActive(null);
          load(); // quay lại danh sách -> tải lại để cập nhật trạng thái mới làm
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-400 text-center min-h-[140px] flex items-center justify-center">
        Đang tải…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-red-600 text-center min-h-[140px] flex items-center justify-center">
        {error}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-500 text-center min-h-[140px] flex items-center justify-center">
        Chưa có đề nào được giao cho bạn. Hỏi giáo viên xem đã giao đề cho lớp bạn chưa nhé.
      </div>
    );
  }

  // Nhóm theo lớp (className + teacherName) — giữ nguyên thứ tự đã sort mới
  // nhất trước từ API.
  const groups = new Map<string, { className: string; teacherName: string; rows: AssignmentRow[] }>();
  assignments.forEach((a) => {
    const key = a.classId;
    if (!groups.has(key)) {
      groups.set(key, { className: a.className, teacherName: a.teacherName, rows: [] });
    }
    groups.get(key)!.rows.push(a);
  });

  return (
    <div className="space-y-4 text-left">
      {[...groups.entries()].map(([classId, group]) => (
        <div key={classId}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Lớp {group.className}
            {group.teacherName ? ` · GV ${group.teacherName}` : ''}
          </p>
          <div className="space-y-2">
            {group.rows.map((a) => {
              const disabled = a.isNotYetOpen || (a.isClosed && a.status === 'not_done');
              return (
                <div
                  key={a.examId}
                  className="border border-gray-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{a.examTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {a.status === 'done'
                        ? typeof a.scorePoints === 'number' && typeof a.maxScorePoints === 'number'
                          ? `Đã làm — ${round2(a.scorePoints)}/${round2(a.maxScorePoints)} điểm`
                          : `Đã làm — ${a.score}/${a.total} câu`
                        : a.isNotYetOpen
                        ? 'Chưa tới giờ mở đề'
                        : a.isClosed
                        ? 'Đã hết hạn'
                        : 'Chưa làm'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setActive({ examId: a.examId, classId: a.classId, studentId: a.studentId })}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {a.status === 'done' ? 'Xem lại' : 'Làm bài'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
