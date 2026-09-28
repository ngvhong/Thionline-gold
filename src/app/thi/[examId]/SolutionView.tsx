'use client';

// SolutionView — hiện lời giải + tô đúng/sai SAU KHI học sinh đã nộp bài,
// CHỈ hiện khi đề bật "showSolution: after_submit" trong Cài đặt. Đọc-only
// hoàn toàn: không có input nào ở đây được phép sửa được nữa.
//
// Nhận CẢ 2 bản dữ liệu:
//  - `examData`: bản ĐÃ TRỘN dùng lúc làm bài thật (có options._origIdx gắn
//    sẵn) — CHỈ dùng để hiển thị đúng thứ tự câu/phương án học sinh đã nhìn
//    thấy lúc làm bài.
//  - `rawData`: bản GỐC chưa trộn — BẮT BUỘC dùng để chấm điểm qua gradeExam.
// SỬA LỖI (lượt này): trước đây gọi gradeExam(examData, ...) — tức chấm trên
// bản ĐÃ TRỘN trong khi p1Answers/p2Answers lại lưu theo origIdx (chỉ số
// PHƯƠNG ÁN GỐC, xem quy ước trong grading.ts). Khi đề có bật trộn, 2 thứ
// lệch nhau khiến gradeExam tra nhầm q.options[picked] sang phương án khác
// -> đúng/sai và điểm hiện SAI, có thể khác cả điểm học sinh đã thấy lúc nộp
// (điểm đó do server chấm trên rawData, luôn ĐÚNG). Nay chấm lại trên
// `rawData` (giống hệt server) rồi TRA KẾT QUẢ bằng q.id (không dùng chỉ số
// mảng i nữa) để khớp đúng câu dù thứ tự hiển thị (examData) có bị trộn.
import { useMemo } from 'react';
import { renderExamText, buildTikzSvgMap, buildImageUrlMap } from '@/lib/examRender';
import { gradeExam, type P1Answers, type P2Answers, type TextAnswers, type ScoringSettings, type QuestionResult } from '@/lib/grading';
import { extractAnswerDigits } from '@/lib/textUtils';
import { scrollFadeX } from '@/lib/scrollFade';

type Partition = 'p1' | 'p2' | 'p3' | 'p4';

function byId(details: QuestionResult[]): Record<string, QuestionResult> {
  const map: Record<string, QuestionResult> = {};
  details.forEach((d) => { map[d.id] = d; });
  return map;
}

export default function SolutionView({
  examData,
  rawData,
  p1Answers,
  p2Answers,
  textAnswers,
  scoring,
  imageScalePercent,
  presentMode = false,
  onClose,
}: {
  examData: any;
  // THÊM MỚI: bản gốc chưa trộn — dùng để chấm điểm chính xác (xem giải
  // thích ở comment đầu file). Nếu vì lý do gì đó không có (nơi gọi cũ chưa
  // kịp truyền), fallback về examData để không bị crash — chỉ sai lệch khi
  // đề có bật trộn, còn lại vẫn đúng như cũ.
  rawData?: any;
  p1Answers: P1Answers;
  p2Answers: P2Answers;
  textAnswers: TextAnswers;
  scoring?: ScoringSettings;
  // THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): % kích thước hình so với
  // mặc định (100 = giữ nguyên) — cùng giá trị GV chỉnh ở tab "Xem đề"
  // (examSettings.imageScalePercent), truyền vào đây để trang lời giải hiển
  // thị ĐÚNG cỡ hình như trang làm bài/xem trước, không bị lệch riêng.
  imageScalePercent?: number;
  // Không còn nơi nào truyền true nữa (tính năng trình chiếu/live quiz đã
  // gỡ bỏ) — giữ lại field + logic bên dưới vì vô hại (mặc định false =
  // đúng hành vi màn HS xem lại bài như trước), phòng khi cần bật lại.
  presentMode?: boolean;
  onClose: () => void;
}) {
  const tikzSvgMap = useMemo(() => buildTikzSvgMap(examData?.tikz_list), [examData]);
  const imageUrlMap = useMemo(() => buildImageUrlMap(examData?.image_list), [examData]);

  const result = useMemo(
    () => gradeExam(rawData || examData, { p1Answers, p2Answers, textAnswers }, scoring),
    [rawData, examData, p1Answers, p2Answers, textAnswers, scoring]
  );

  // Tra theo q.id thay vì chỉ số mảng — vì thứ tự trong examData (hiển thị,
  // có thể đã trộn) không còn khớp thứ tự trong rawData (dùng để chấm) nữa.
  const detailsByIdP1 = useMemo(() => byId(result.details.p1), [result]);
  const detailsByIdP2 = useMemo(() => byId(result.details.p2), [result]);
  const detailsByIdP3 = useMemo(() => byId(result.details.p3), [result]);

  const partitionLabel: Record<Partition, string> = {
    p1: 'Phần I: Trắc nghiệm',
    p2: 'Phần II: Đúng/Sai',
    p3: 'Phần III: Trả lời ngắn',
    p4: 'Phần IV: Tự luận',
  };
  const partitionCount: Record<Partition, number> = {
    p1: (examData?.phan_1_TracNghiem || []).length,
    p2: (examData?.phan_2_DungSai || []).length,
    p3: (examData?.phan_3_TraLoiNgan || []).length,
    p4: (examData?.phan_4_TuLuan || []).length,
  };

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="sticky top-0 z-20 bg-white border border-gray-200 rounded-xl shadow-sm mb-6 px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-blue-600 font-bold text-base sm:text-lg inline-flex items-center gap-1.5">
            Lời giải
          </span>
          <span className="text-gray-400 text-sm hidden sm:inline">đối chiếu bài làm của em</span>
        </div>
        <div className="flex items-center gap-3">
          {!presentMode && (
            <span className="font-bold text-sm sm:text-lg px-2.5 sm:px-3 py-1 rounded-lg bg-green-100 text-green-700">
              ✅ {result.scorePoints}/{result.maxScorePoints} điểm
            </span>
          )}
          <button
            onClick={onClose}
            className="bg-slate-700 hover:bg-slate-800 active:bg-slate-900 active:scale-95 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            ↩️ Đóng
          </button>
        </div>
      </div>

      {partitionCount.p1 > 0 && (
        <div className="space-y-4">
          <h2 className="font-bold text-slate-800 text-[13px] sm:text-[15px] px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-200 border border-slate-300 rounded-lg">{partitionLabel.p1}</h2>
          {(examData.phan_1_TracNghiem || []).map((q: any, i: number) => {
            const detail = detailsByIdP1[q.id];
            const picked = p1Answers[q.id];
            return (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="bg-blue-600 text-white font-bold text-xs sm:text-sm px-2 sm:px-2.5 py-1 rounded-md">Câu {i + 1}</span>
                    <span
                      className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${
                        detail?.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {detail?.points ?? 0}/{detail?.maxPoints ?? 0}đ
                    </span>
                  </div>
                  <div className="font-semibold text-[13px] sm:text-[15px] whitespace-pre-wrap mt-1 overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                    {renderExamText(q.content, tikzSvgMap, `sv-p1-${q.id}-c`, imageUrlMap, imageScalePercent ?? 100)}
                  </div>
                </div>
                <div className="space-y-2">
                  {(q.options || []).map((opt: any, oi: number) => {
                    const isPicked = picked === opt._origIdx;
                    let cls = 'border-gray-200';
                    if (opt.isCorrect) cls = 'border-green-400 bg-green-50';
                    else if (isPicked) cls = 'border-red-400 bg-red-50';
                    return (
                      <div key={oi} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border ${cls}`}>
                        <span
                          className="text-sm whitespace-pre-wrap overflow-x-auto no-scrollbar"
                          style={scrollFadeX(opt.isCorrect ? '#f0fdf4' : isPicked ? '#fef2f2' : '#ffffff')}
                        >
                          {/* SỬA (28-7, đồng bộ ExamBuilder.tsx tab Xem đề):
                              bỏ nhãn "✓ đáp án đúng" dài đứng CUỐI dòng — thay
                              bằng dấu ✓ ĐƠN dính liền ngay sau nhãn A/B/C/D,
                              khung/nền xanh (border-green-400 bg-green-50) đã
                              đủ phân biệt đáp án đúng, không cần thêm chữ. */}
                          <span className="font-semibold mr-1 text-blue-700">
                            {String.fromCharCode(65 + oi)}.
                            {opt.isCorrect && <span className="text-green-600 ml-1">✓</span>}
                          </span>
                          {renderExamText(opt.text, tikzSvgMap, `sv-p1-${q.id}-o${oi}`, imageUrlMap, imageScalePercent ?? 100)}
                          {isPicked && <span className="ml-2 text-xs text-gray-400">(em chọn)</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {q.solution && (
                  <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-sm whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                    <div className="font-bold text-blue-700 mb-1">Lời giải:</div>
                    {renderExamText(q.solution, tikzSvgMap, `sv-p1-${q.id}-sol`, imageUrlMap, imageScalePercent ?? 100)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {partitionCount.p2 > 0 && (
        <div className="space-y-4 mt-8">
          <h2 className="font-bold text-slate-800 text-[13px] sm:text-[15px] px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-200 border border-slate-300 rounded-lg">{partitionLabel.p2}</h2>
          {(examData.phan_2_DungSai || []).map((q: any, i: number) => {
            const detail = detailsByIdP2[q.id];
            const picks = p2Answers[q.id] || {};
            return (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="bg-blue-600 text-white font-bold text-xs sm:text-sm px-2 sm:px-2.5 py-1 rounded-md">Câu {i + 1}</span>
                    <span
                      className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${
                        detail?.correct ? 'bg-green-100 text-green-700' : detail && detail.points > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {detail?.points ?? 0}/{detail?.maxPoints ?? 0}đ
                    </span>
                  </div>
                  <div className="font-semibold text-[13px] sm:text-[15px] whitespace-pre-wrap mt-1 overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                    {renderExamText(q.content, tikzSvgMap, `sv-p2-${q.id}-c`, imageUrlMap, imageScalePercent ?? 100)}
                  </div>
                </div>
                <div className="space-y-2">
                  {(q.options || []).map((opt: any, oi: number) => {
                    const chosen = picks[opt._origIdx];
                    const wrongPick = chosen !== undefined && chosen !== opt.isCorrect;
                    return (
                      <div
                        key={oi}
                        className={`flex items-center justify-between gap-3 max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:gap-1 px-3 py-2 rounded-lg border ${
                          wrongPick ? 'border-red-400 bg-red-50' : 'border-green-400 bg-green-50'
                        }`}
                      >
                        <span
                          className="text-sm flex-1 whitespace-pre-wrap overflow-x-auto no-scrollbar"
                          style={scrollFadeX(wrongPick ? '#fef2f2' : '#f0fdf4')}
                        >
                          <span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(97 + oi)})</span>
                          {renderExamText(opt.text, tikzSvgMap, `sv-p2-${q.id}-o${oi}`, imageUrlMap, imageScalePercent ?? 100)}
                        </span>
                        {/* SỬA (khiếu nại 25-7: "trên điện thoại, ghi chú
                            Đáp án bị ép hẹp cạnh nội dung, khó đọc"): dưới
                            900px (điện thoại cả dọc lẫn ngang — landscape
                            phone vẫn hẹp hơn tablet/desktop) — cho ghi chú
                            xuống hẳn dòng riêng cuối cùng, full-width, đổi
                            sang phông chữ monospace + giãn chữ (font-mono
                            tracking-wide) để nổi bật khác hẳn phần nội dung
                            phía trên, thu hút mắt HS. Vẫn giữ nguyên hiệu
                            ứng đậm/nhạt cũ: "Đáp án: Đúng/Sai" đậm, "(em
                            chọn: ...)" nhạt màu xám. Từ 900px trở lên (đủ
                            rộng) giữ nguyên layout hàng ngang như cũ. */}
                        <span className="text-xs font-semibold shrink-0 max-[900px]:block max-[900px]:w-full max-[900px]:text-right max-[900px]:pt-1.5 max-[900px]:mt-0.5 max-[900px]:border-t max-[900px]:border-black/10 max-[900px]:font-mono max-[900px]:tracking-wide">
                          Đáp án: {opt.isCorrect ? 'Đúng' : 'Sai'}
                          {chosen !== undefined && (
                            <span className="text-gray-400 ml-1">(em chọn: {chosen ? 'Đúng' : 'Sai'})</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {q.solution && (
                  <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-sm whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                    <div className="font-bold text-blue-700 mb-1">Lời giải:</div>
                    {renderExamText(q.solution, tikzSvgMap, `sv-p2-${q.id}-sol`, imageUrlMap, imageScalePercent ?? 100)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {partitionCount.p3 > 0 && (
        <div className="space-y-4 mt-8">
          <h2 className="font-bold text-slate-800 text-[13px] sm:text-[15px] px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-200 border border-slate-300 rounded-lg">{partitionLabel.p3}</h2>
          {(examData.phan_3_TraLoiNgan || []).map((q: any, i: number) => {
            const detail = detailsByIdP3[q.id];
            const given = textAnswers[q.id] || '';
            const expected = extractAnswerDigits(q.answer || '');
            return (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="bg-blue-600 text-white font-bold text-xs sm:text-sm px-2 sm:px-2.5 py-1 rounded-md">Câu {i + 1}</span>
                    <span
                      className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${
                        detail?.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {detail?.points ?? 0}/{detail?.maxPoints ?? 0}đ
                    </span>
                  </div>
                  <div className="font-semibold text-[13px] sm:text-[15px] whitespace-pre-wrap mt-1 overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                    {renderExamText(q.content, tikzSvgMap, `sv-p3-${q.id}-c`, imageUrlMap, imageScalePercent ?? 100)}
                  </div>
                </div>
                <p className="text-sm">
                  {!presentMode && (
                    <>
                      Em đáp: <span className="font-mono font-semibold">{given || '(bỏ trống)'}</span>{' '}
                    </>
                  )}
                  {(presentMode || !detail?.correct) && (
                    <span className={presentMode ? '' : 'ml-3 text-green-700'}>
                      {presentMode ? (
                        <>Đáp số: <span className="font-mono font-semibold">{expected}</span></>
                      ) : (
                        <span className="text-green-700">
                          Đáp số đúng: <span className="font-mono font-semibold">{expected}</span>
                        </span>
                      )}
                    </span>
                  )}
                </p>
                {q.solution && (
                  <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-sm whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                    <div className="font-bold text-blue-700 mb-1">Lời giải:</div>
                    {renderExamText(q.solution, tikzSvgMap, `sv-p3-${q.id}-sol`, imageUrlMap, imageScalePercent ?? 100)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {partitionCount.p4 > 0 && (
        <div className="space-y-4 mt-8">
          <h2 className="font-bold text-slate-800 text-[13px] sm:text-[15px] px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-200 border border-slate-300 rounded-lg">{partitionLabel.p4}</h2>
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2">
            Phần tự luận do giáo viên chấm tay — điểm chưa cộng vào điểm ở trên, hỏi giáo viên nếu cần biết điểm phần này.
          </div>
          {(examData.phan_4_TuLuan || []).map((q: any, i: number) => (
            <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-5 shadow-sm">
              <div className="font-semibold text-[13px] sm:text-[15px] mb-3 whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                <span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderExamText(q.content, tikzSvgMap, `sv-p4-${q.id}-c`, imageUrlMap, imageScalePercent ?? 100)}
              </div>
              {q.solution && (
                <div className="p-3 bg-white border border-slate-200 rounded-lg text-sm whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                  <div className="font-bold text-blue-700 mb-1">Gợi ý lời giải:</div>
                  {renderExamText(q.solution, tikzSvgMap, `sv-p4-${q.id}-sol`, imageUrlMap, imageScalePercent ?? 100)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
