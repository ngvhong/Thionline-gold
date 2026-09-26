'use client';

// THÊM MỚI (Giai đoạn 4 — tab "Ôn luyện" cho học sinh, xem
// docs-moi/01-KE-HOACH-CHI-TIET.md): file MỚI HOÀN TOÀN — nội dung thật
// thay khung rỗng cũ của Giai đoạn 0-3 trong StudentApp.tsx.
//
// Cùng 2 NGOẠI LỆ đã nói ở 00-THINKING.md mục 2.5 (StudentTakeExam.tsx,
// SolutionView.tsx) — dùng lại y hệt cách AssignedExamsTab.tsx (Giai đoạn 2)
// đã làm, KHÔNG viết lại engine làm bài/chấm điểm lần 2.
//
// KHÁC 1 ĐIỂM so với đặc tả gốc: đặc tả gốc dự kiến thêm route MỚI
// `/api/library/thi/[examId]/submit` — kiểm tra lại thực tế,
// `/api/thi/[examId]/submit` (và `/api/thi/[examId]/upload-essay-image`)
// ĐÃ hoàn toàn tổng quát (chỉ cần đúng submissionId, classId là optional) —
// StudentTakeExam gọi thẳng 2 route đó, KHÔNG cần sửa StudentTakeExam.tsx
// dòng nào. Xem giải thích chi tiết trong
// src/app/api/library/thi/[examId]/start/route.ts (route MỚI duy nhất).
import { useEffect, useRef, useState } from 'react';
import StudentTakeExam from '@/app/thi/[examId]/StudentTakeExam';
import SolutionView from '@/app/thi/[examId]/SolutionView';
import { round2 } from '@/lib/grading';
import type { P1Answers, P2Answers, TextAnswers, ScoringSettings } from '@/lib/grading';
// SỬA (đồng bộ icon): thay emoji 📁 bằng icon SVG nét mảnh dùng chung — file
// trung lập (giống AppBranding.tsx), không phải "code GV" nên import được
// từ đây, xem giải thích trong LibraryIcons.tsx.
import { LibraryFolderIcon } from '@/components/LibraryIcons';

type FolderNode = {
  _id: string;
  name: string;
  parentId: string | null;
  order: number;
  examCount: number;
};

type LibraryExamRow = {
  _id: string;
  title: string;
  teacherName: string;
  questionCount: number;
  bestScorePoints: number | null;
  bestMaxScorePoints: number | null;
  attempts: number;
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
};

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại.');
  return data as T;
}

// ============================================================
// ---------- Màn làm 1 đề cụ thể trong "Ôn luyện" ----------
// ============================================================
function PracticeExamRunner({ examId, onBack }: { examId: string; onBack: () => void }) {
  const [phase, setPhase] = useState<'starting' | 'taking' | 'done' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const [session, setSession] = useState<ExamSession | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [showSolutionView, setShowSolutionView] = useState(false);

  async function start(retake: boolean) {
    setPhase('starting');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/library/thi/${examId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retake }),
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
  }, [examId]);

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
              imageScalePercent={session?.settings.imageScalePercent}
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
          {/* "Ôn luyện" KHÔNG giới hạn số lần làm lại — luôn hiện nút này,
              khác nút "Làm lại" ở tab "Đề được giao" (chỉ hiện khi GV còn
              cho phép theo maxAttempts). */}
          <button
            type="button"
            onClick={() => start(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg transition"
          >
            Làm lại
          </button>
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
// ---------- Duyệt cây thư mục (dạng "đào sâu" từng cấp — phù
// hợp khung hẹp max-w-md của cổng học sinh, khác cây thu/phóng 2
// cột rộng ở /kho-de-chung dành cho GV) ----------
// ============================================================
export default function LibraryPracticeTab({
  isLoggedIn,
  onRequestAuth,
  autoStartExamId,
  onAutoStartConsumed,
}: {
  // true khi đã có tài khoản đăng nhập — false vẫn xem được cây/list bình
  // thường (đúng yêu cầu "chưa đăng nhập vẫn xem được"), chỉ chặn lúc BẤM
  // VÀO LÀM 1 đề cụ thể.
  isLoggedIn: boolean;
  // Gọi khi khách (chưa đăng nhập) bấm vào 1 đề để làm — StudentApp.tsx sẽ
  // chuyển sang màn đăng nhập/đăng ký, nhớ lại đúng examId này.
  onRequestAuth: (examId: string) => void;
  // _id đề cần tự mở lại NGAY sau khi vừa đăng nhập xong (do trước đó bấm
  // vào 1 đề lúc chưa đăng nhập) — null trong mọi trường hợp khác.
  autoStartExamId?: string | null;
  onAutoStartConsumed?: () => void;
}) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [treeError, setTreeError] = useState('');
  const [treeLoading, setTreeLoading] = useState(true);

  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const currentParentId = path.length > 0 ? path[path.length - 1].id : null;

  const [exams, setExams] = useState<LibraryExamRow[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examsError, setExamsError] = useState('');

  const [runningExamId, setRunningExamId] = useState<string | null>(null);

  async function loadTree() {
    setTreeLoading(true);
    setTreeError('');
    try {
      const data = await apiFetch<{ folders: FolderNode[] }>('/api/library/tree?audience=student');
      setFolders(data.folders);
    } catch (err: any) {
      setTreeError(err.message || 'Không tải được cây thư mục.');
    } finally {
      setTreeLoading(false);
    }
  }

  useEffect(() => {
    loadTree();
  }, []);

  async function loadExams(folderId: string) {
    setExamsLoading(true);
    setExamsError('');
    try {
      const data = await apiFetch<{ exams: LibraryExamRow[] }>(
        `/api/library/exams?folderId=${folderId}&audience=student`
      );
      setExams(data.exams);
    } catch (err: any) {
      setExamsError(err.message || 'Không tải được danh sách đề.');
    } finally {
      setExamsLoading(false);
    }
  }

  useEffect(() => {
    if (currentParentId) loadExams(currentParentId);
    else setExams([]);
  }, [currentParentId]);

  // Tự mở đúng đề vừa bấm trước khi đăng nhập — chỉ chạy 1 lần khi
  // autoStartExamId đổi từ null/undefined sang có giá trị thật.
  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoStartExamId && autoStartedRef.current !== autoStartExamId && isLoggedIn) {
      autoStartedRef.current = autoStartExamId;
      setRunningExamId(autoStartExamId);
      onAutoStartConsumed?.();
    }
  }, [autoStartExamId, isLoggedIn, onAutoStartConsumed]);

  function handleTapExam(examId: string) {
    if (!isLoggedIn) {
      onRequestAuth(examId);
      return;
    }
    setRunningExamId(examId);
  }

  function handleBackFromRunner() {
    setRunningExamId(null);
    // Vừa làm xong có thể vừa cập nhật badge điểm — tải lại danh sách đề
    // của đúng nhánh đang đứng để thấy điểm mới ngay, không cần bấm ra vào
    // lại nhánh.
    if (currentParentId) loadExams(currentParentId);
  }

  if (runningExamId) {
    return <PracticeExamRunner examId={runningExamId} onBack={handleBackFromRunner} />;
  }

  const children = folders.filter((f) => f.parentId === currentParentId);

  return (
    <div>
      {!isLoggedIn && (
        <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
          Xem tự do — bấm vào 1 đề để làm thì mới cần đăng nhập/đăng ký.
        </p>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center flex-wrap gap-1 text-xs text-gray-500 mb-2">
        <button type="button" onClick={() => setPath([])} className="hover:text-blue-600 hover:underline">
          Kho đề
        </button>
        {path.map((p, idx) => (
          <span key={p.id} className="flex items-center gap-1">
            <span>›</span>
            <button
              type="button"
              onClick={() => setPath(path.slice(0, idx + 1))}
              className={idx === path.length - 1 ? 'font-semibold text-gray-700' : 'hover:text-blue-600 hover:underline'}
            >
              {p.name}
            </button>
          </span>
        ))}
      </div>

      {treeLoading && <p className="text-sm text-gray-400">Đang tải...</p>}
      {treeError && <p className="text-sm text-red-600">{treeError}</p>}

      {!treeLoading && !treeError && (
        <>
          {children.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {children
                .slice()
                .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi'))
                .map((f) => (
                  <li key={f._id}>
                    <button
                      type="button"
                      onClick={() => setPath([...path, { id: f._id, name: f.name }])}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-left text-sm font-medium text-gray-700"
                    >
                      <LibraryFolderIcon className="w-4 h-4 shrink-0 text-gray-400" />
                      <span className="flex-1">{f.name}</span>
                      {f.examCount > 0 && <span className="text-xs text-gray-400">{f.examCount} đề</span>}
                    </button>
                  </li>
                ))}
            </ul>
          )}

          {currentParentId && (
            <div>
              {examsLoading && <p className="text-sm text-gray-400">Đang tải đề...</p>}
              {examsError && <p className="text-sm text-red-600">{examsError}</p>}
              {!examsLoading && !examsError && (
                <>
                  {exams.length === 0 ? (
                    children.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">Mục này chưa có đề nào.</p>
                    )
                  ) : (
                    <ul className="space-y-1.5">
                      {exams.map((e) => (
                        <li key={e._id}>
                          <button
                            type="button"
                            onClick={() => handleTapExam(e._id)}
                            className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition"
                          >
                            <p className="text-sm font-semibold text-gray-800">{e.title}</p>
                            <p className="text-xs text-gray-400">
                              GV {e.teacherName} · {e.questionCount} câu
                              {e.attempts > 0 && (
                                <span className="ml-1.5 text-emerald-600 font-semibold">
                                  · Đã làm {e.attempts} lần — {round2(e.bestScorePoints ?? 0)}/{round2(e.bestMaxScorePoints ?? 0)}đ (cao nhất)
                                </span>
                              )}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {!currentParentId && children.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Chưa có mục nào trong kho đề.</p>
          )}
        </>
      )}
    </div>
  );
}
