'use client';

// THÊM MỚI (25-10): màn "Ôn luyện" TƯƠNG TÁC cho 1 đề (khác "Thi thử" làm như thi thật).
//  - Làm từng câu, bấm icon ✓ (nút to) ở từng câu -> chỉ câu đó được chấm, đáp án khóa.
//    Câu chưa bấm Kiểm tra thì KHÔNG chấm (kể cả Phần I: chọn phương án chưa chấm, còn đổi được).
//  - Thanh tiêu đề thu gọn 1 dòng nổi; bấm biểu tượng mũi tên để mở rộng (tiến độ, nút Mở lời giải, Làm lại).
//  - Mỗi câu có Ổ KHÓA (đặt cạnh icon ✓, bên phải): bấm để mở lời giải riêng câu đó. Mở lời giải VẪN ĐƯỢC ĐIỂM nhưng
//    câu bị ghi chú "Đã xem lời giải" (theo yêu cầu).
//  - "Mở toàn bộ lời giải" mở cho CẢ ĐỀ một lần (ghi chú đã xem cho mọi câu).
//  - Thanh tiến độ: đã làm X/Y câu, điểm, số câu đã xem lời giải. Tự lưu (cần tài khoản HS).
//  - "Làm lại" xóa sạch rồi ghi đè lại.
// Không trộn câu/phương án: chỉ số phương án luôn là thứ tự gốc nên gradeExam chấm thẳng.
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderExamText, buildTikzSvgMap, buildImageUrlMap } from '@/lib/examRender';
import { gradeExam, round2, type ScoringSettings } from '@/lib/grading';
import { extractAnswerDigits } from '@/lib/textUtils';
import { scrollFadeX } from '@/lib/scrollFade';

type Part = 'p1' | 'p2' | 'p3' | 'p4';
const k = (part: Part, id: string) => `${part}:${id}`;

type Loaded = {
  title: string;
  raw_data: any;
  scoring: ScoringSettings;
  imageScalePercent?: number;
  progress: {
    p1Answers: Record<string, number>;
    p2Answers: Record<string, Record<number, boolean>>;
    textAnswers: Record<string, string>;
    checked: string[];
    solutionOpened: string[];
    attempts: number;
  } | null;
};

function LockIcon({ open, className = 'w-4 h-4' }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      {open ? (
        <path d="M8 11V8a4 4 0 0 1 7.5-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12.5l2.7 2.7L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PracticeRunner({ examId, onBack }: { examId: string; onBack: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [p1, setP1] = useState<Record<string, number>>({});
  const [p2, setP2] = useState<Record<string, Record<number, boolean>>>({});
  const [tx, setTx] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // opened = câu ĐÃ TỪNG xem lời giải (lưu, dùng cho ghi chú "Đã xem lời giải" + đếm);
  // shown = lời giải đang HIỆN trên màn hình (chỉ trong phiên, ẩn lại không xóa ghi chú).
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const readyRef = useRef(false);
  const [barOpen, setBarOpen] = useState(false); // thanh tiêu đề: false = thu gọn 1 dòng
  // Dòng gợi ý nhỏ cạnh 2 nút (✓ / ổ khóa): bấm × là ẩn VĨNH VIỄN (lưu localStorage, lần sau mở app không hiện lại).
  const [hintHidden, setHintHidden] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem('pr-hint-hidden') === '1') setHintHidden(true);
    } catch {
      /* bỏ qua nếu trình duyệt chặn localStorage */
    }
  }, []);
  function hideHint() {
    setHintHidden(true);
    try {
      localStorage.setItem('pr-hint-hidden', '1');
    } catch {
      /* bỏ qua */
    }
  }

  async function load() {
    readyRef.current = false;
    setError('');
    try {
      const res = await fetch(`/api/library/practice/${examId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không tải được đề.');
      setLoaded(data as Loaded);
      const pr = (data as Loaded).progress;
      setP1(pr?.p1Answers || {});
      setP2(pr?.p2Answers || {});
      setTx(pr?.textAnswers || {});
      setChecked(new Set(pr?.checked || []));
      setOpened(new Set(pr?.solutionOpened || []));
      setShown(new Set());
      setTimeout(() => {
        readyRef.current = true;
      }, 0);
    } catch (e: any) {
      setError(e.message || 'Không tải được đề.');
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // Tự lưu (chờ 700ms sau lần đổi cuối).
  useEffect(() => {
    if (!loaded || !readyRef.current) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library/practice/${examId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p1Answers: p1,
            p2Answers: p2,
            textAnswers: tx,
            checked: Array.from(checked),
            solutionOpened: Array.from(opened),
          }),
        });
        setSaveState(res.ok ? 'saved' : 'error');
      } catch {
        setSaveState('error');
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p1, p2, tx, checked, opened]);

  const raw = loaded?.raw_data;
  const tikzSvgMap = useMemo(() => buildTikzSvgMap(raw?.tikz_list), [raw]);
  const imageUrlMap = useMemo(() => buildImageUrlMap(raw?.image_list), [raw]);
  const scale = loaded?.imageScalePercent ?? 100;

  // Chỉ tính điểm các câu ĐÃ KHÓA (đã kiểm tra).
  const graded = useMemo(() => {
    if (!raw) return null;
    const a1: Record<string, number> = {};
    const a2: Record<string, any> = {};
    const a3: Record<string, string> = {};
    for (const q of raw.phan_1_TracNghiem || []) if (checked.has(k('p1', q.id)) && p1[q.id] !== undefined) a1[q.id] = p1[q.id];
    for (const q of raw.phan_2_DungSai || []) if (checked.has(k('p2', q.id)) && p2[q.id]) a2[q.id] = p2[q.id];
    for (const q of raw.phan_3_TraLoiNgan || []) if (checked.has(k('p3', q.id)) && tx[q.id] !== undefined) a3[q.id] = tx[q.id];
    return gradeExam(raw, { p1Answers: a1, p2Answers: a2, textAnswers: a3 }, loaded?.scoring);
  }, [raw, p1, p2, tx, checked, loaded]);

  const det = useMemo(() => {
    const m: Record<string, { correct: boolean; points: number; maxPoints: number }> = {};
    if (graded) {
      (['p1', 'p2', 'p3'] as const).forEach((part) => graded.details[part].forEach((d) => (m[k(part, d.id)] = d)));
    }
    return m;
  }, [graded]);

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button type="button" onClick={onBack} className="text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg px-4 py-2 font-medium">
          ← Quay lại danh sách
        </button>
      </div>
    );
  }
  if (!loaded || !raw || !graded) {
    return <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">Đang tải đề…</div>;
  }

  const total = graded.total;
  const answered = Array.from(checked).filter((x) => !x.startsWith('p4:')).length;
  const solutionCount = Array.from(opened).filter((x) => !x.startsWith('p4:')).length;
  const allKeys: string[] = [
    ...(raw.phan_1_TracNghiem || []).map((q: any) => k('p1', q.id)),
    ...(raw.phan_2_DungSai || []).map((q: any) => k('p2', q.id)),
    ...(raw.phan_3_TraLoiNgan || []).map((q: any) => k('p3', q.id)),
    ...(raw.phan_4_TuLuan || []).map((q: any) => k('p4', q.id)),
  ];
  const allOpen = allKeys.length > 0 && allKeys.every((x) => shown.has(x));
  // Các câu HS đã làm xong nhưng CHƯA bấm Kiểm tra (P1 đã chọn; P2 đã chọn đủ ý; P3 đã gõ đáp số).
  const pendingKeys: string[] = [
    ...(raw.phan_1_TracNghiem || []).filter((q: any) => p1[q.id] !== undefined).map((q: any) => k('p1', q.id)),
    ...(raw.phan_2_DungSai || [])
      .filter((q: any) => (q.options || []).length > 0 && (q.options || []).every((_: any, oi: number) => (p2[q.id] || {})[oi] !== undefined))
      .map((q: any) => k('p2', q.id)),
    ...(raw.phan_3_TraLoiNgan || []).filter((q: any) => (tx[q.id] || '').trim() !== '').map((q: any) => k('p3', q.id)),
  ].filter((x) => !checked.has(x));

  function lockQuestion(key: string) {
    setChecked((s) => new Set(s).add(key));
  }
  function checkPending() {
    if (pendingKeys.length === 0) return;
    setChecked((s) => {
      const n = new Set(s);
      pendingKeys.forEach((x) => n.add(x));
      return n;
    });
  }
  function toggleSolution(key: string) {
    setShown((s0) => {
      const n = new Set(s0);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
    // Mở là ghi chú "đã xem" ngay; ẩn lại không xóa ghi chú.
    setOpened((s0) => new Set(s0).add(key));
  }
  function openAll() {
    if (!confirm('Mở toàn bộ lời giải của cả đề?\n\nTất cả câu sẽ được ghi chú "đã xem lời giải" (điểm đã làm vẫn giữ nguyên).')) return;
    setOpened(new Set(allKeys));
    setShown(new Set(allKeys));
  }
  async function restart() {
    if (!confirm('Làm lại từ đầu?\n\nBài làm, điểm và ghi chú đã xem lời giải hiện tại sẽ bị xóa và ghi đè.')) return;
    try {
      const res = await fetch(`/api/library/practice/${examId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setShown(new Set());
      await load();
    } catch {
      alert('Không làm lại được, thử lại nhé.');
    }
  }

  const solBox = (q: any, key: string, label = 'Lời giải:') =>
    shown.has(key) ? (
      <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-sm whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
        <div className="font-bold text-blue-700 mb-1">{label}</div>
        {q.solution ? renderExamText(q.solution, tikzSvgMap, `pr-${key}-sol`, imageUrlMap, scale) : <span className="text-gray-400">Đề chưa có lời giải cho câu này.</span>}
      </div>
    ) : null;

  const head = (part: Part, q: any, i: number) => {
    const key = k(part, q.id);
    const d = det[key];
    const wasViewed = opened.has(key);
    return (
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="bg-blue-600 text-white font-bold text-xs sm:text-sm px-2 sm:px-2.5 py-1 rounded-md">Câu {i + 1}</span>
          <div className="flex items-center gap-2">
            {wasViewed && (
              <span className="text-[11px] font-semibold bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">Đã xem lời giải</span>
            )}
            {d && checked.has(key) && (
              <span className={`text-xs font-bold px-2 py-1 rounded-md ${d.correct ? 'bg-green-100 text-green-700' : d.points > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                {round2(d.points)}/{round2(d.maxPoints)}đ
              </span>
            )}
          </div>
        </div>
        <div className="font-semibold text-[13px] sm:text-[15px] whitespace-pre-wrap mt-2 overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
          {renderExamText(q.content, tikzSvgMap, `pr-${key}-c`, imageUrlMap, scale)}
        </div>
      </div>
    );
  };

  // Hàng nút dưới mỗi câu: icon ✓ (kiểm tra) + icon ổ khóa (xem lời giải) đặt cạnh nhau,
  // bên phải là dòng gợi ý nhỏ, in nghiêng, màu xám, có dấu × phía trước để ẩn.
  const actionRow = (key: string, opts: { canCheck: boolean; ready?: boolean }) => {
    const isLocked = checked.has(key);
    const isOpen = shown.has(key);
    return (
      <div className="mt-3 flex items-center gap-2 flex-nowrap">
        {opts.canCheck && (
          <button
            type="button"
            disabled={isLocked || !opts.ready}
            onClick={() => lockQuestion(key)}
            aria-label={isLocked ? 'Đã kiểm tra' : 'Kiểm tra câu này'}
            title={isLocked ? 'Đã kiểm tra' : 'Kiểm tra câu này'}
            className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-white transition ${
              isLocked ? 'bg-green-500 cursor-default' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-40'
            }`}
          >
            <CheckIcon className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => toggleSolution(key)}
          aria-label={isOpen ? 'Ẩn lời giải' : 'Mở lời giải câu này'}
          title={isOpen ? 'Ẩn lời giải' : 'Mở lời giải câu này'}
          className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border transition ${
            isOpen ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <LockIcon open={isOpen} className="w-5 h-5" />
        </button>
        {opts.canCheck && !hintHidden && (
          <span className="min-w-0 flex-1 inline-flex items-center gap-1 text-[10px] sm:text-[11px] italic text-gray-400 leading-tight">
            <button
              type="button"
              onClick={hideHint}
              aria-label="Ẩn dòng gợi ý"
              title="Ẩn dòng gợi ý"
              className="not-italic shrink-0 w-4 h-4 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              ×
            </button>
            <span className="min-w-0">Bấm vào icon để kiểm tra kết quả và xem lời giải</span>
          </span>
        )}
      </div>
    );
  };

  const section = (title: string) => (
    <h2 className="font-bold text-slate-800 text-[13px] sm:text-[15px] px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-200 border border-slate-300 rounded-lg">{title}</h2>
  );

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gray-50 z-40">
      <div className="min-h-screen p-3 sm:p-6">
        <div className="max-w-3xl mx-auto pb-16">
          {/* Thanh tiến độ: 1 dòng nổi, bấm mũi tên để mở rộng */}
          <div className="sticky top-1 z-20 mb-4">
            <div className={`bg-white/95 backdrop-blur border border-gray-200 shadow-md pl-1.5 pr-1.5 py-1 flex items-center gap-2 ${barOpen ? 'rounded-2xl' : 'rounded-full'}`}>
              <button
                type="button"
                onClick={onBack}
                aria-label="Về danh sách"
                title="Về danh sách"
                className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-800 text-white text-sm"
              >
                ↩
              </button>
              <span className={`min-w-0 flex-1 text-xs sm:text-sm font-semibold text-blue-700 ${barOpen ? 'whitespace-normal break-words py-1' : 'truncate'}`}>{loaded.title}</span>
              {!barOpen && (
                <span className="shrink-0 text-[11px] sm:text-xs text-gray-700 whitespace-nowrap">
                  <b>{answered}/{total}</b> · <b>{round2(graded.scorePoints)}</b>đ
                </span>
              )}
              <button
                type="button"
                onClick={() => setBarOpen((v) => !v)}
                aria-expanded={barOpen}
                aria-label={barOpen ? 'Thu gọn' : 'Mở rộng'}
                title={barOpen ? 'Thu gọn' : 'Mở rộng'}
                className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                <ChevronIcon up={barOpen} />
              </button>
            </div>
            {barOpen && (
              <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg px-3 sm:px-5 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
                    <div className="text-[11px] text-emerald-800">Đã làm</div>
                    <div className="text-base sm:text-lg font-bold text-emerald-700">{answered}/{total} câu</div>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-center">
                    <div className="text-[11px] text-blue-800">Tổng điểm</div>
                    <div className="text-base sm:text-lg font-bold text-blue-700">{round2(graded.scorePoints)}/{round2(graded.maxScorePoints)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={checkPending}
                  disabled={pendingKeys.length === 0}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  <CheckIcon />
                  {pendingKeys.length > 0 ? `Kiểm tra ${pendingKeys.length} câu đã làm` : 'Chưa có câu nào cần kiểm tra'}
                </button>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${total ? Math.min(100, (answered / total) * 100) : 0}%` }} />
                </div>
                <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs sm:text-sm text-gray-700">
                  <span>Đã xem lời giải <b>{solutionCount}</b> câu</span>
                  <span className="ml-auto text-[11px] text-gray-400">
                    {saveState === 'saving' ? 'Đang lưu…' : saveState === 'saved' ? 'Đã lưu' : saveState === 'error' ? 'Lưu lỗi — kiểm tra mạng' : ''}
                  </span>
                </div>
                <div className="mt-2 flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={openAll}
                    disabled={allOpen}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 rounded-lg px-3 py-1.5"
                  >
                    <LockIcon open={allOpen} /> Mở toàn bộ lời giải
                  </button>
                  <button type="button" onClick={restart} className="text-xs sm:text-sm font-semibold border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5">
                    Làm lại
                  </button>
                </div>
              </div>
            )}
          </div>

          {(raw.phan_1_TracNghiem || []).length > 0 && (
            <div className="space-y-4">
              {section('Phần I: Trắc nghiệm')}
              {(raw.phan_1_TracNghiem || []).map((q: any, i: number) => {
                const key = k('p1', q.id);
                const locked = checked.has(key);
                return (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
                    {head('p1', q, i)}
                    <div className="space-y-2">
                      {(q.options || []).map((opt: any, oi: number) => {
                        const isPicked = p1[q.id] === oi;
                        let cls = isPicked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-blue-50 hover:border-blue-300';
                        if (locked) cls = opt.isCorrect ? 'border-green-400 bg-green-50' : isPicked ? 'border-red-400 bg-red-50' : 'border-gray-200 opacity-80';
                        return (
                          <button
                            type="button"
                            key={oi}
                            disabled={locked}
                            onClick={() => setP1((s) => ({ ...s, [q.id]: oi }))}
                            className={`w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg border transition ${cls}`}
                          >
                            <span className="text-sm whitespace-pre-wrap overflow-x-auto no-scrollbar">
                              <span className="font-semibold mr-1 text-blue-700">
                                {String.fromCharCode(65 + oi)}.{locked && opt.isCorrect && <span className="text-green-600 ml-1">✓</span>}
                              </span>
                              {renderExamText(opt.text, tikzSvgMap, `pr-${key}-o${oi}`, imageUrlMap, scale)}
                              {locked && isPicked && <span className="ml-2 text-xs text-gray-500">(em chọn)</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {actionRow(key, { canCheck: true, ready: p1[q.id] !== undefined })}
                    {solBox(q, key)}
                  </div>
                );
              })}
            </div>
          )}

          {(raw.phan_2_DungSai || []).length > 0 && (
            <div className="space-y-4 mt-8">
              {section('Phần II: Đúng/Sai')}
              {(raw.phan_2_DungSai || []).map((q: any, i: number) => {
                const key = k('p2', q.id);
                const locked = checked.has(key);
                const picks = p2[q.id] || {};
                const options = q.options || [];
                const allPicked = options.length > 0 && options.every((_: any, oi: number) => picks[oi] !== undefined);
                return (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
                    {head('p2', q, i)}
                    <div className="space-y-2">
                      {options.map((opt: any, oi: number) => {
                        const chosen = picks[oi];
                        const wrong = locked && chosen !== undefined && chosen !== opt.isCorrect;
                        const rowCls = locked ? (wrong || chosen === undefined ? 'border-red-400 bg-red-50' : 'border-green-400 bg-green-50') : 'border-gray-200';
                        return (
                          <div key={oi} className={`flex items-center justify-between gap-3 max-[700px]:flex-col max-[700px]:items-stretch px-3 py-2 rounded-lg border ${rowCls}`}>
                            <span className="text-sm flex-1 whitespace-pre-wrap overflow-x-auto no-scrollbar">
                              <span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(97 + oi)})</span>
                              {renderExamText(opt.text, tikzSvgMap, `pr-${key}-o${oi}`, imageUrlMap, scale)}
                            </span>
                            <span className="shrink-0 flex items-center gap-1.5">
                              {[true, false].map((v) => (
                                <button
                                  type="button"
                                  key={String(v)}
                                  disabled={locked}
                                  onClick={() => setP2((s) => ({ ...s, [q.id]: { ...(s[q.id] || {}), [oi]: v } }))}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-md border ${
                                    chosen === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {v ? 'Đúng' : 'Sai'}
                                </button>
                              ))}
                              {locked && <span className="text-xs font-semibold text-gray-600 w-20 text-right">Đáp án: {opt.isCorrect ? 'Đúng' : 'Sai'}</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {actionRow(key, { canCheck: true, ready: allPicked })}
                    {solBox(q, key)}
                  </div>
                );
              })}
            </div>
          )}

          {(raw.phan_3_TraLoiNgan || []).length > 0 && (
            <div className="space-y-4 mt-8">
              {section('Phần III: Trả lời ngắn')}
              {(raw.phan_3_TraLoiNgan || []).map((q: any, i: number) => {
                const key = k('p3', q.id);
                const locked = checked.has(key);
                const d = det[key];
                return (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
                    {head('p3', q, i)}
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        inputMode="text"
                        value={tx[q.id] || ''}
                        disabled={locked}
                        onChange={(e) => setTx((s) => ({ ...s, [q.id]: e.target.value }))}
                        placeholder="Nhập đáp số"
                        className="border border-gray-300 rounded-lg px-3 py-2 text-base w-40 font-mono disabled:bg-gray-50"
                      />
                      {locked && d && (
                        <span className={`text-sm font-semibold ${d.correct ? 'text-green-700' : 'text-red-700'}`}>
                          {d.correct ? '✓ Chính xác' : <>✗ Chưa đúng — đáp số: <span className="font-mono">{extractAnswerDigits(q.answer || '')}</span></>}
                        </span>
                      )}
                    </div>
                    {actionRow(key, { canCheck: true, ready: !!(tx[q.id] || '').trim() })}
                    {solBox(q, key)}
                  </div>
                );
              })}
            </div>
          )}

          {(raw.phan_4_TuLuan || []).length > 0 && (
            <div className="space-y-4 mt-8">
              {section('Phần IV: Tự luận')}
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2">
                Phần tự luận làm trên giấy rồi đối chiếu lời giải — không tính điểm trong Ôn luyện.
              </div>
              {(raw.phan_4_TuLuan || []).map((q: any, i: number) => {
                const key = k('p4', q.id);
                return (
                  <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
                    {head('p4', q, i)}
                    {actionRow(key, { canCheck: false })}
                    {solBox(q, key, 'Gợi ý lời giải:')}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
