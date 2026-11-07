'use client';

// THÊM MỚI (25-10): popup "Thống kê theo câu" — biểu đồ CỘT tỷ lệ làm đúng của
// từng câu trong 1 đề (dữ liệu từ GET /api/exams/[id]/stats). Mỗi cột có SỐ %
// ghi rõ trên đầu (không chỉ dựa vào màu), màu chỉ để lướt nhanh: xanh >= 70%,
// vàng 40-69%, đỏ < 40%. Bấm 1 cột để xem chi tiết (Phần I: số em chọn từng
// phương án A/B/C/D, đáp án đúng đánh dấu).
import { useEffect, useMemo, useState } from 'react';

type QStat = {
  id: string;
  part: 'p1' | 'p2' | 'p3';
  number: number;
  answered: number;
  fullyCorrect: number;
  pctCorrect: number;
  optionCounts?: number[];
  correctOption?: number | null;
};
type StatsResponse = {
  title: string;
  submissionCount: number;
  averagePoints: number;
  maxPoints: number;
  questions: QStat[];
};

const PART_LABEL: Record<QStat['part'], string> = {
  p1: 'Phần I — Trắc nghiệm',
  p2: 'Phần II — Đúng/Sai',
  p3: 'Phần III — Trả lời ngắn',
};

function barColor(pct: number): string {
  if (pct >= 70) return '#16a34a';
  if (pct >= 40) return '#d97706';
  return '#dc2626';
}

export default function ExamStatsModal({
  examId,
  examTitle,
  onClose,
}: {
  examId: string;
  examTitle: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<QStat | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/exams/${examId}/stats`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Không tải được thống kê.');
        setData(json as StatsResponse);
      } catch (err: any) {
        setError(err.message || 'Không tải được thống kê.');
      } finally {
        setLoading(false);
      }
    })();
  }, [examId]);

  const hardest = useMemo(() => {
    if (!data) return [];
    return [...data.questions]
      .filter((q) => data.submissionCount > 0)
      .sort((a, b) => a.pctCorrect - b.pctCorrect)
      .slice(0, 5);
  }, [data]);

  const CHART_H = 180;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Thống kê theo câu</h3>
            <p className="text-sm text-gray-500 truncate max-w-[60ch]">{examTitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none" aria-label="Đóng">
            ×
          </button>
        </div>

        {loading && <p className="text-sm text-gray-500 py-8 text-center">Đang tải thống kê...</p>}
        {error && <p className="text-sm text-red-600 py-4">{error}</p>}

        {data && data.submissionCount === 0 && (
          <p className="text-sm text-gray-600 py-8 text-center">
            Chưa có học sinh nào nộp bài đề này nên chưa có thống kê. (Chỉ tính bài của học sinh được giao đề trong lớp,
            không tính lượt tự luyện.)
          </p>
        )}

        {data && data.submissionCount > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
                <div className="text-xs text-blue-700 font-semibold">Số bài đã nộp</div>
                <div className="text-2xl font-bold text-blue-900">{data.submissionCount}</div>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
                <div className="text-xs text-emerald-700 font-semibold">Điểm trung bình (Phần I-III)</div>
                <div className="text-2xl font-bold text-emerald-900">
                  {data.averagePoints} <span className="text-sm font-medium">/ {data.maxPoints}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 mb-2">
              <span className="font-semibold text-gray-700">Tỷ lệ làm đúng:</span>
              <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm inline-block" style={{ background: '#16a34a' }} /> từ 70%</span>
              <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm inline-block" style={{ background: '#d97706' }} /> 40-69%</span>
              <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm inline-block" style={{ background: '#dc2626' }} /> dưới 40%</span>
              <span className="text-gray-400">· bấm vào cột để xem chi tiết</span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-lg p-3">
              <div className="flex gap-5 min-w-max">
                {(['p1', 'p2', 'p3'] as const).map((part) => {
                  const list = data.questions.filter((q) => q.part === part);
                  if (list.length === 0) return null;
                  return (
                    <div key={part}>
                      <div className="text-xs font-semibold text-gray-600 mb-1">{PART_LABEL[part]}</div>
                      <div className="flex items-end gap-1.5" style={{ height: CHART_H + 36 }}>
                        {list.map((q) => {
                          const isSel = selected?.id === q.id && selected?.part === q.part;
                          return (
                            <button
                              key={`${q.part}-${q.id}`}
                              type="button"
                              onClick={() => setSelected(q)}
                              className={`flex flex-col items-center justify-end w-7 rounded ${isSel ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'}`}
                              style={{ height: CHART_H + 36 }}
                              title={`Câu ${q.number}: ${q.pctCorrect}% đúng`}
                            >
                              <span className="text-[10px] font-semibold text-gray-700 leading-none mb-0.5">
                                {Math.round(q.pctCorrect)}
                              </span>
                              <span
                                className="w-5 rounded-t"
                                style={{
                                  height: Math.max(2, (q.pctCorrect / 100) * CHART_H),
                                  background: barColor(q.pctCorrect),
                                }}
                              />
                              <span className="text-[10px] text-gray-500 mt-1 leading-none">{q.number}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selected && (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 text-sm text-gray-800">
                <div className="font-semibold mb-1">
                  {PART_LABEL[selected.part]} — Câu {selected.number}
                </div>
                <div>
                  {selected.fullyCorrect}/{data.submissionCount} em làm đúng trọn câu ({selected.pctCorrect}%), {selected.answered} em
                  có trả lời.
                </div>
                {selected.part === 'p1' && selected.optionCounts && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.optionCounts.map((c, i) => (
                      <span
                        key={i}
                        className={`px-2 py-1 rounded border text-xs font-semibold ${
                          selected.correctOption === i
                            ? 'border-green-500 bg-green-50 text-green-800'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        {String.fromCharCode(65 + i)}: {c} em{selected.correctOption === i ? ' ✓ đáp án đúng' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {hardest.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-800 mb-1">5 câu có tỷ lệ đúng thấp nhất (nên ôn lại trên lớp)</div>
                <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
                  {hardest.map((q) => (
                    <li key={`${q.part}-${q.id}`}>
                      {PART_LABEL[q.part].split(' — ')[0]}, câu {q.number}: <b>{q.pctCorrect}%</b> đúng
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
