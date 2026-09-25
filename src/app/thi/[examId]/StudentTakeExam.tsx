'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderExamText, buildTikzSvgMap, buildImageUrlMap } from '@/lib/examRender';
import { gradeExam, computeEssayMax, type P1Answers, type P2Answers, type TextAnswers, type ScoringSettings } from '@/lib/grading';
import { scrollFadeX } from '@/lib/scrollFade';

type Partition = 'p1' | 'p2' | 'p3' | 'p4';

// THÊM MỚI (gợi ý lần đầu bấm neo): key localStorage DÙNG CHUNG cho MỌI đề
// thi/lớp (không kèm classId/examId như recognizedStorageKey ở page.tsx) —
// vì đây là gợi ý "cách dùng app" nói chung (neo tròn ẩn cả đồng hồ/danh
// sách câu/nút nộp bài), học sinh chỉ cần biết 1 LẦN DUY NHẤT trên cả thiết
// bị, không phải nhắc lại mỗi lần đổi sang đề khác. try/catch vì 1 số
// trình duyệt trong app (Zalo/Facebook) có thể chặn localStorage.
const ANCHOR_HINT_SEEN_KEY = 'thionline_seen_exam_anchor_hint';

function hasSeenAnchorHint(): boolean {
  try {
    return localStorage.getItem(ANCHOR_HINT_SEEN_KEY) === '1';
  } catch {
    // Không đọc được thì coi như "chưa từng thấy" — thà gợi ý dư 1 lần còn
    // hơn không hiện cho học sinh thật sự chưa biết.
    return false;
  }
}

function markAnchorHintSeen() {
  try {
    localStorage.setItem(ANCHOR_HINT_SEEN_KEY, '1');
  } catch {}
}

// THÊM MỚI (khiếu nại: "icon emoji người/tên lửa/thư mục nhìn gộm, không
// đồng bộ") — 2 icon SVG nét mảnh (stroke), thay cho emoji 🚩/🗂️:
//   - FlagIcon: dùng cho nút "đánh dấu câu để xem lại" trên từng câu VÀ
//     trong bảng "Danh sách câu". Bình thường CHỈ viền mỏng (không tô màu);
//     khi câu đã được đánh dấu thì tô ĐẶC (fill=currentColor) — giữ đúng
//     cảm giác "đậm" như bản cũ (emoji 🚩 màu cam đặc), chỉ đổi từ emoji
//     sang SVG để icon thật sự đổi theo màu/trạng thái (emoji không đổi màu
//     theo class text-color được).
//   - ListIcon: thay cho 🗂️ ở nút mở "Danh sách câu" — nét mảnh, đồng bộ bộ
//     icon còn lại của trang.
function FlagIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M6 3v18M6 4.5h11.2c.9 0 1.35 1.08.72 1.72L14.5 9.6l3.42 3.38c.63.64.18 1.72-.72 1.72H6"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// THÊM MỚI (khiếu nại: "ẩn luôn cái đồng hồ khi học sinh làm bài, nó
// vướng"): 2 icon nét mảnh thay cho việc hiện SỐ ĐẾM GIỜ (mm:ss) liên tục
// trên mấu thu gọn — CapIcon (mũ tốt nghiệp, đại diện học sinh/tài khoản)
// đặt cạnh "Câu x/y đã làm", còn ClockIcon chỉ là 1 icon tĩnh (không có chữ
// số chạy) đóng vai trò NÚT bấm để mở bảng xem giờ đầy đủ — cùng bộ nét
// mảnh (strokeWidth 1.6) với FlagIcon/ListIcon phía trên.
function CapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 5.5 2.5 10 12 14.5 21.5 10 12 5.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6.5 12.2V16c0 1.4 2.46 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5 10v5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5.5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Nén ảnh ở CLIENT trước khi upload (Bước 3.1 — Phần IV): resize còn tối đa
// 1280px chiều dài + xuất JPEG chất lượng 0.72. Mục đích: giữ dung lượng lưu
// trên Vercel Blob (gói free 1GB) đủ dùng lâu dài — 1 ảnh sau nén thường chỉ
// ~150-400KB thay vì vài MB từ camera điện thoại gốc.
async function compressImageFile(file: File, maxDim = 1280, quality = 0.72): Promise<Blob> {
  const img: HTMLImageElement | ImageBitmap = await (async () => {
    if ('createImageBitmap' in window) {
      try {
        return await createImageBitmap(file);
      } catch {
        // rơi xuống fallback bên dưới nếu trình duyệt báo lỗi decode
      }
    }
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không đọc được ảnh vừa chọn.'));
      el.src = URL.createObjectURL(file);
    });
  })();

  const width = (img as any).width;
  const height = (img as any).height;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt này không nén được ảnh.');
  ctx.drawImage(img as any, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Không nén được ảnh vừa chọn.'))),
      'image/jpeg',
      quality
    );
  });
}

// Gắn _origIdx (chỉ số phương án trong mảng GỐC) vào từng option TRƯỚC khi
// trộn — để dù hiển thị có xáo trộn thứ tự, đáp án gửi lên server vẫn tham
// chiếu đúng phương án gốc, chấm điểm không bao giờ lệch.
function buildDisplayData(raw: any, shuffle: boolean) {
  const clone = JSON.parse(JSON.stringify(raw || {}));
  (clone.phan_1_TracNghiem || []).forEach((q: any) => {
    q.options = (q.options || []).map((o: any, idx: number) => ({ ...o, _origIdx: idx }));
  });
  (clone.phan_2_DungSai || []).forEach((q: any) => {
    q.options = (q.options || []).map((o: any, idx: number) => ({ ...o, _origIdx: idx }));
  });
  if (!shuffle) return clone;
  if (Array.isArray(clone.phan_1_TracNghiem)) {
    clone.phan_1_TracNghiem = shuffleArray(clone.phan_1_TracNghiem).map((q: any) => ({
      ...q,
      options: shuffleArray(q.options || []),
    }));
  }
  (['phan_2_DungSai', 'phan_3_TraLoiNgan'] as const).forEach((key) => {
    if (Array.isArray(clone[key])) clone[key] = shuffleArray(clone[key]);
  });
  return clone;
}

export default function StudentTakeExam({
  examId,
  submissionId,
  classId,
  studentName,
  examTitle,
  rawData,
  settings,
  endAt,
  onSubmitted,
  previewMode = false,
  onExit,
}: {
  examId: string;
  submissionId: string;
  // THÊM MỚI: cần gửi kèm lúc /submit để server tra đúng ExamAssignment
  // (giờ đóng đề của ĐÚNG lớp này) — dùng tính mốc mở lời giải 'after_close'.
  // Không bắt buộc (previewMode không có lớp thật).
  classId?: string;
  studentName: string;
  // THÊM MỚI (mục 1): tên đề thi — hiển thị chung khối với họ tên/đồng hồ ở
  // đầu trang, để học sinh biết đang làm đề nào mà không cần tab riêng.
  examTitle?: string;
  rawData: any;
  // THÊM MỚI: showSolution (đồng bộ với examSettings ở ExamBuilder — GV cấu
  // hình trong tab Cài đặt) quyết định có hiện nút "Xem lời giải" sau khi
  // nộp hay không; scoring là thang điểm 0.25/1/0.5 mỗi phần GV đã chỉnh
  // (nếu chưa từng chỉnh thì undefined, gradeExam tự dùng mặc định). Việc
  // "lúc nào được xem" giờ do SERVER quyết định (trả về trong response
  // /submit) — 4 chế độ ở đây chỉ còn dùng để hiện chú thích UI nếu cần.
  settings: {
    duration: number;
    shuffle?: boolean;
    showSolution?: 'after_submit' | 'never' | 'after_close' | 'custom_time';
    scoring?: ScoringSettings;
    // THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): % kích thước hình so với
    // mặc định (100 = giữ nguyên) — GV chỉnh ở tab "Xem đề", lưu chung trong
    // examSettings nên tự động có mặt ở đây khi settings được truyền vào từ
    // đề đã lưu/xuất bản. Đề CŨ (lưu trước khi có field này) sẽ là
    // undefined -> mọi renderExamText(...) dùng "?? 100" để về đúng mặc định.
    imageScalePercent?: number;
  };
  // endAt do SERVER tính (started_at + duration*60000, started_at chỉ ghi 1
  // lần lúc bắt đầu) — KHÔNG tự tính lại Date.now()+duration ở client nữa,
  // để đóng tab rồi mở lại link không cộng thêm giờ (Bước 3.1 mục 3).
  endAt: number;
  onSubmitted: (result: {
    score: number;
    total: number;
    scorePoints?: number;
    maxScorePoints?: number;
    // THÊM MỚI: có được xem lời giải không + toàn bộ dữ liệu cần để
    // SolutionView tự chấm lại và tô đúng/sai (không cần gọi thêm API nào).
    showSolution: boolean;
    solutionData?: {
      examData: any;
      p1Answers: P1Answers;
      p2Answers: P2Answers;
      textAnswers: TextAnswers;
      scoring?: ScoringSettings;
    };
    // THÊM MỚI: còn được TỰ làm lại không (server tính theo
    // Exam.settings.maxAttempts) — trang /thi dùng để hiện/ẩn nút "Làm lại".
    canRetake?: boolean;
    // THÊM MỚI (màn "Đã nộp bài" hiện điểm/ảnh Phần IV): tổng điểm tối đa
    // Phần IV (snapshot lúc nộp) + ảnh học sinh vừa upload — essayScores/
    // essayAnnotatedImages CHƯA có gì (GV chưa kịp chấm lúc vừa nộp) nên
    // không truyền, trang /thi tự hiểu "chưa chấm" khi essayGraded=false.
    essayMaxScore?: number | null;
    essayImages?: Record<string, string[]> | null;
    essayGraded?: boolean;
    essayScores?: Record<string, number> | null;
    essayAnnotatedImages?: Record<string, string[]> | null;
  }) => void;
  // THÊM MỚI: dùng cho màn "Xem mô phỏng trang học sinh" bên phía GV
  // (ExamBuilder). previewMode=true tắt mọi lệnh gọi API THẬT (upload ảnh
  // tự luận, nộp bài) — chấm điểm/nộp bài được MÔ PHỎNG hoàn toàn ở client
  // bằng gradeExam có sẵn, không ghi gì lên server, không tạo submission
  // giả trong DB. onExit (chỉ GV truyền) hiện thêm 1 nút nhỏ góc trên bên
  // trái để thoát khỏi màn xem trước — học sinh thi thật (không có onExit)
  // sẽ không bao giờ thấy nút này.
  previewMode?: boolean;
  onExit?: () => void;
}) {
  const tikzSvgMap = useMemo(() => buildTikzSvgMap(rawData?.tikz_list), [rawData]);
  // THÊM MỚI (Bước 3.1 mục 2): ảnh cứng ngoài tikz — cùng cơ chế tra map
  // như tikzSvgMap ở trên (nhúng URL Vercel Blob lúc GV Xuất bản).
  const imageUrlMap = useMemo(() => buildImageUrlMap(rawData?.image_list), [rawData]);
  // Trộn 1 LẦN DUY NHẤT lúc vào bài (không trộn lại mỗi lần re-render).
  const data = useMemo(() => buildDisplayData(rawData, !!settings.shuffle), []); // eslint-disable-line react-hooks/exhaustive-deps

  const storageKey = `thi_progress_${submissionId}`;
  const saved = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [p1Answers, setP1Answers] = useState<P1Answers>(saved?.p1Answers || {});
  const [p2Answers, setP2Answers] = useState<P2Answers>(saved?.p2Answers || {});
  const [textAnswers, setTextAnswers] = useState<TextAnswers>(saved?.textAnswers || {});
  // THÊM MỚI: đánh dấu "cờ" 🚩 để xem lại — độc lập với việc đã làm hay
  // chưa (1 câu vừa làm vừa đánh dấu vẫn được, ví dụ làm rồi nhưng chưa
  // chắc chắn). Lưu theo questionId, persist cùng chỗ với các đáp án khác.
  const [flagged, setFlagged] = useState<Record<string, boolean>>(saved?.flagged || {});
  // Đóng/mở bảng "🗂️ Danh sách câu" (kiểu Azota) — modal đè lên, bấm 1 số
  // câu sẽ cuộn tới đúng câu đó rồi tự đóng bảng.
  const [navOpen, setNavOpen] = useState(false);
  // Phần IV: { questionId: string[] } — mảng URL ảnh đã upload lên Vercel
  // Blob (KHÔNG lưu file thật ở client, chỉ giữ URL để hiện thumbnail + gửi
  // kèm lúc nộp bài). essayUploading/essayError theo dõi riêng từng câu để 1
  // câu đang tải ảnh không khoá thao tác ở câu khác.
  const [essayImages, setEssayImages] = useState<Record<string, string[]>>(saved?.essayImages || {});
  const [essayUploading, setEssayUploading] = useState<Record<string, boolean>>({});
  const [essayError, setEssayError] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // THÊM MỚI (khiếu nại 25-7: "cảnh báo học sinh chuyển tab/thu nhỏ trong
  // lúc thi" — CHỈ nhắc nhở ngay trên màn hình, KHÔNG ghi lại/gửi lên server
  // gì cả, đúng theo yêu cầu đã chốt). Hiện modal này khi phát hiện học sinh
  // VỪA QUAY LẠI sau khi đã rời tab/mất focus cửa sổ — xem effect
  // `visibilitychange`/`blur`/`focus` bên dưới để hiểu đầy đủ lý do chọn
  // đúng thời điểm này (không hiện lúc rời đi vì học sinh không nhìn thấy
  // được, chỉ hiện lúc quay lại mới có tác dụng).
  const [showLeftExamWarning, setShowLeftExamWarning] = useState(false);

  // THÊM MỚI (khiếu nại: "thanh thời gian + danh sách câu chiếm không gian
  // quá lớn, đặc biệt trên điện thoại" + "không hiện đồng hồ khi làm bài"):
  // toàn bộ giờ còn lại/tên học sinh/nút "Danh sách câu"/nút "Nộp bài" gộp
  // vào 1 POPUP duy nhất, mặc định ĐÓNG — học sinh chỉ thấy 1 mấu hình bán
  // nguyệt nhỏ ghim góc trên bên phải, KHÔNG hiện số đếm giờ hay bất cứ chữ
  // nào khác. `collapsed` = true nghĩa là popup đang ĐÓNG (trạng thái mặc
  // định mỗi lần vào trang) — đây chỉ là trạng thái hiển thị của 1 popup
  // (giống navOpen/showConfirm bên dưới) nên KHÔNG cần nhớ qua
  // sessionStorage như thanh gấp gọn kiểu cũ nữa.
  const [collapsed, setCollapsed] = useState(true);

  // THÊM MỚI (gợi ý lần đầu bấm neo — thay cho việc GV phải nhắc từng học
  // sinh "vào bấm cái tròn góc trên bên phải để nộp bài"): khởi tạo lazy
  // (function trong useState) để CHỈ đọc localStorage đúng 1 lần lúc mount,
  // không đọc lại mỗi lần re-render. previewMode (GV bấm "Xem mô phỏng")
  // không cần hiện gợi ý này — đó là GV đang xem thử, không phải học sinh
  // thật lần đầu vào bài.
  const [showAnchorHint, setShowAnchorHint] = useState(() => !previewMode && !hasSeenAnchorHint());

  // Tự tắt gợi ý sau ~7s nếu học sinh không bấm vào neo — tránh vòng sáng +
  // bong bóng chú thích cứ đứng mãi nếu học sinh mải đọc đề mà không để ý.
  // Dù tự tắt do hết giờ (không phải do bấm), vẫn ghi nhớ "đã thấy" luôn —
  // mục đích chỉ là 1 lần gây chú ý ban đầu, không phải chờ tới khi học
  // sinh CHẮC CHẮN đã hiểu mới thôi.
  useEffect(() => {
    if (!showAnchorHint) return;
    const t = setTimeout(() => {
      setShowAnchorHint(false);
      markAnchorHintSeen();
    }, 7000);
    return () => clearTimeout(t);
  }, [showAnchorHint]);

  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.round((endAt - Date.now()) / 1000)));

  // GHI CHÚ: khối "mấu" bán nguyệt mới (xem render bên dưới) rất nhỏ và ghim
  // cứng vào góc trên bên phải viewport bằng `position: fixed` — không còn
  // chiếm chỗ trong luồng bố cục bình thường như thanh tiêu đề to cũ, nên
  // KHÔNG cần đo chiều cao / chừa khoảng đệm nữa (bỏ hẳn headerRef,
  // headerHeight, ResizeObserver so với bản trước).

  // Tự lưu tiến độ vào sessionStorage — mất khi ĐÓNG HẲN tab trình duyệt
  // (đúng theo quyết định đã chốt: đóng tab giữa chừng thì phải làm lại từ
  // đầu), nhưng vẫn sống sót qua lỡ tay F5/mất mạng trong cùng phiên.
  // KHÔNG lưu endAt nữa — endAt luôn lấy từ prop do server tính (started_at
  // cố định), không phải giá trị client tự tính, nên đóng tab mở lại link
  // (gọi lại /start) vẫn ra đúng endAt cũ, không được cộng thêm giờ.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ p1Answers, p2Answers, textAnswers, essayImages, flagged })
      );
    } catch {
      // Bỏ qua nếu trình duyệt chặn sessionStorage.
    }
  }, [storageKey, p1Answers, p2Answers, textAnswers, essayImages, flagged]);

  // THÊM MỚI (khiếu nại 25-7, xem giải thích đầy đủ ở effect ngay dưới):
  // suppressLeaveWarningRef bật = true để TẠM BỎ QUA cảnh báo "rời khỏi bài
  // thi" trong lúc học sinh đang mở picker camera/thư viện ảnh chọn ảnh bài
  // làm Phần IV (hành động hợp lệ, không phải rời đi gian lận, nhưng vẫn
  // kích hoạt visibilitychange/blur y hệt chuyển tab thật). Kèm timeout dự
  // phòng — tự tắt chặn sau tối đa 3 phút dù không nhận được sự kiện quay
  // lại nào (an toàn, tránh lỡ tắt cảnh báo vĩnh viễn nếu có trình duyệt
  // không bắn đúng sự kiện focus như kỳ vọng).
  const suppressLeaveWarningRef = useRef(false);
  const suppressLeaveWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function suppressLeaveWarningForImagePicker() {
    suppressLeaveWarningRef.current = true;
    if (suppressLeaveWarningTimeoutRef.current) clearTimeout(suppressLeaveWarningTimeoutRef.current);
    suppressLeaveWarningTimeoutRef.current = setTimeout(() => {
      suppressLeaveWarningRef.current = false;
    }, 3 * 60 * 1000);
  }

  useEffect(() => {
    if (submitting) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [submitting]);

  // THÊM MỚI (khiếu nại 25-7: "cảnh báo chuyển tab/thu nhỏ trong lúc thi"):
  // dùng CẢ 2 sự kiện trình duyệt, vì mỗi cái bắt được 1 kiểu "rời đi" khác
  // nhau, thiếu 1 trong 2 sẽ lọt:
  //   - `visibilitychange` (document.visibilityState === 'hidden'): bắt
  //     được lúc chuyển hẳn sang TAB khác, hoặc bấm nút Home/chuyển app
  //     khác trên điện thoại (trình duyệt lùi hẳn xuống nền).
  //   - `blur`/`focus` trên `window`: bắt được lúc cửa sổ trình duyệt MẤT
  //     tiêu điểm dù tab vẫn đang "hiện" theo trình duyệt (vd trên máy
  //     tính: bấm sang 1 app khác trong khi cửa sổ trình duyệt vẫn nằm đó,
  //     không bị `visibilitychange` phát hiện vì tab không hề bị ẩn).
  //
  // CHỦ ĐỘNG chỉ hiện cảnh báo lúc học sinh QUAY LẠI (visible/focus trở
  // lại), KHÔNG hiện ngay lúc rời đi — vì đúng lúc rời đi thì học sinh
  // không còn nhìn thấy màn hình này nữa, hiện lúc đó vô nghĩa, chỉ có lúc
  // quay lại mới thực sự "chạm mắt" được cảnh báo.
  //
  // CHẶN BÁO ĐỘNG GIẢ khi học sinh đang chụp/chọn ảnh bài làm Phần IV (nút
  // "Chụp / chọn ảnh bài làm" mở picker camera/thư viện ảnh của điện thoại
  // — hành động này CHẮC CHẮN kích hoạt visibilitychange/blur y hệt như
  // chuyển tab thật, dù học sinh không hề rời khỏi bài thi để gian lận) —
  // xem `suppressLeaveWarningRef`, được bật ngay trước khi mở picker (tại
  // <label> "Chụp / chọn ảnh bài làm" bên dưới) và tự tắt khi quay lại.
  useEffect(() => {
    if (submitting || previewMode) return;
    let leftWhileAway = false;

    const markLeft = () => {
      if (suppressLeaveWarningRef.current) return;
      leftWhileAway = true;
    };
    const markReturned = () => {
      if (suppressLeaveWarningRef.current) {
        // Vừa quay lại đúng lúc đang chặn báo động giả (do mở picker ảnh) —
        // huỷ chặn sớm luôn (không cần đợi hết thời gian chặn tối đa), trễ
        // 1 nhịp ngắn để phòng trường hợp visibilitychange 'hidden' bắn ra
        // SAU sự kiện focus (thứ tự 2 sự kiện này không đảm bảo giống nhau
        // giữa các trình duyệt/điện thoại).
        if (suppressLeaveWarningTimeoutRef.current) clearTimeout(suppressLeaveWarningTimeoutRef.current);
        suppressLeaveWarningTimeoutRef.current = setTimeout(() => {
          suppressLeaveWarningRef.current = false;
        }, 600);
        return;
      }
      if (leftWhileAway) {
        leftWhileAway = false;
        setShowLeftExamWarning(true);
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') markLeft();
      else markReturned();
    };
    const handleBlur = () => markLeft();
    const handleFocus = () => markReturned();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [submitting, previewMode]);

  useEffect(() => {
    if (timeLeft <= 0) {
      handleSubmit(true);
      return;
    }
    const timer = setTimeout(() => {
      setTimeLeft(Math.max(0, Math.round((endAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, endAt]);

  const preview = useMemo(
    () => gradeExam(rawData, { p1Answers, p2Answers, textAnswers }, settings.scoring),
    [rawData, p1Answers, p2Answers, textAnswers, settings.scoring]
  );

  // THÊM MỚI (bảng "Danh sách câu" kiểu Azota): preview.details.pX được chấm
  // trên `rawData` (thứ tự GỐC), còn lưới câu hỏi hiển thị theo thứ tự
  // `data` (có thể đã bị trộn) — tra theo q.id thay vì chỉ số mảng để không
  // lệch câu, giống cách đã sửa ở SolutionView.tsx.
  const attemptedByIdP1 = useMemo(
    () => Object.fromEntries(preview.details.p1.map((d) => [d.id, d.attempted])),
    [preview]
  );
  const attemptedByIdP2 = useMemo(
    () => Object.fromEntries(preview.details.p2.map((d) => [d.id, d.attempted])),
    [preview]
  );
  const attemptedByIdP3 = useMemo(
    () => Object.fromEntries(preview.details.p3.map((d) => [d.id, d.attempted])),
    [preview]
  );

  function scrollToQuestion(anchorId: string) {
    setNavOpen(false);
    // Đợi modal đóng xong (đổi display) rồi mới cuộn, tránh giật màn hình.
    requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Nén ảnh ở client (compressImageFile) rồi upload lên Vercel Blob qua API
  // công khai /api/thi/[examId]/upload-essay-image — chỉ nhận về URL, thêm
  // vào cuối mảng ảnh của đúng câu đó (1 câu có thể có nhiều ảnh = nhiều
  // trang giấy).
  async function uploadEssayImage(questionId: string, file: File) {
    setEssayUploading((prev) => ({ ...prev, [questionId]: true }));
    setEssayError((prev) => ({ ...prev, [questionId]: '' }));
    try {
      const compressed = await compressImageFile(file);
      // previewMode (GV "Xem mô phỏng"): không có submissionId thật trong
      // DB để gắn ảnh vào — dùng URL tạm (object URL) ngay trên trình duyệt
      // để GV vẫn thấy ảnh hiện lên y hệt, không gọi API/không tốn dung
      // lượng Vercel Blob thật.
      if (previewMode) {
        const localUrl = URL.createObjectURL(compressed);
        setEssayImages((prev) => ({ ...prev, [questionId]: [...(prev[questionId] || []), localUrl] }));
        return;
      }
      const form = new FormData();
      form.append('file', compressed, 'essay.jpg');
      form.append('submissionId', submissionId);
      form.append('questionId', questionId);
      const res = await fetch(`/api/thi/${examId}/upload-essay-image`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Tải ảnh thất bại.');
      setEssayImages((prev) => ({ ...prev, [questionId]: [...(prev[questionId] || []), data.url] }));
    } catch (err: any) {
      setEssayError((prev) => ({ ...prev, [questionId]: err.message || 'Không tải ảnh lên được, thử lại.' }));
    } finally {
      setEssayUploading((prev) => ({ ...prev, [questionId]: false }));
    }
  }

  function removeEssayImage(questionId: string, url: string) {
    setEssayImages((prev) => ({ ...prev, [questionId]: (prev[questionId] || []).filter((u) => u !== url) }));
  }

  async function handleSubmit(auto = false) {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      // previewMode (GV "Xem mô phỏng"): không có submissionId thật để gọi
      // /submit (sẽ chỉ trả 404/500 vì DB không có bản ghi đó) — tự chấm
      // NGAY tại client bằng đúng hàm gradeExam mà server dùng, không ghi
      // gì lên DB. Luôn hiện màn kết quả + lời giải (bất kể showSolution)
      // vì đây là GV đang xem thử, không phải học sinh thật.
      if (previewMode) {
        const graded = gradeExam(data, { p1Answers, p2Answers, textAnswers }, settings.scoring);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        onSubmitted({
          score: graded.correct,
          total: graded.total,
          scorePoints: graded.scorePoints,
          maxScorePoints: graded.maxScorePoints,
          showSolution: true,
          solutionData: { examData: data, p1Answers, p2Answers, textAnswers, scoring: settings.scoring },
          essayMaxScore: computeEssayMax(data, settings.scoring),
          essayImages,
          essayGraded: false,
        });
        return;
      }
      const res = await fetch(`/api/thi/${examId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, classId, p1Answers, p2Answers, textAnswers, essayImages }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Nộp bài thất bại.');
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      // SỬA: showSolution giờ do SERVER quyết định (hỗ trợ 'after_close' /
      // 'custom_time' cần biết giờ đóng đề của lớp, client không có đủ dữ
      // liệu để tự tính đúng) — không còn suy ra từ settings.showSolution
      // === 'after_submit' ở client nữa.
      const showSolution = !!result.showSolution;
      onSubmitted({
        score: result.score,
        total: result.total,
        scorePoints: result.scorePoints,
        maxScorePoints: result.maxScorePoints,
        showSolution,
        // `data` = bản đã trộn (nếu có bật shuffle) dùng SUỐT lúc làm bài —
        // truyền lại nguyên bản này để SolutionView tô đúng/sai đúng theo
        // đúng thứ tự học sinh đã nhìn thấy, không bị lệch nếu trộn lại.
        solutionData: showSolution
          ? { examData: data, p1Answers, p2Answers, textAnswers, scoring: settings.scoring }
          : undefined,
        canRetake: !!result.canRetake,
        essayMaxScore: result.essayMaxScore,
        essayImages: result.essayImages || essayImages,
        essayGraded: !!result.essayGraded,
        essayScores: result.essayScores || undefined,
        essayAnnotatedImages: result.essayAnnotatedImages || undefined,
      });
    } catch (err: any) {
      setSubmitError(err.message || 'Không nộp được bài, thử lại.');
      setSubmitting(false);
      if (auto) {
        // Hết giờ mà nộp lỗi (vd mất mạng đúng lúc) — thử lại sau vài giây,
        // không được để học sinh kẹt màn hình không biết làm gì.
        setTimeout(() => handleSubmit(true), 4000);
      }
    }
  }

  const mm = String(Math.floor(Math.max(0, timeLeft) / 60)).padStart(2, '0');
  const ss = String(Math.max(0, timeLeft) % 60).padStart(2, '0');

  const partitionLabel: Record<Partition, string> = {
    p1: 'Phần I: Trắc nghiệm',
    p2: 'Phần II: Đúng/Sai',
    p3: 'Phần III: Trả lời ngắn',
    p4: 'Phần IV: Tự luận',
  };
  const partitionCount: Record<Partition, number> = {
    p1: (data.phan_1_TracNghiem || []).length,
    p2: (data.phan_2_DungSai || []).length,
    p3: (data.phan_3_TraLoiNgan || []).length,
    p4: (data.phan_4_TuLuan || []).length,
  };

  const unansweredCount = preview.total - preview.details.p1.filter((q) => q.attempted).length
    - preview.details.p2.filter((q) => q.attempted).length
    - preview.details.p3.filter((q) => q.attempted).length;
  const answeredCount = preview.total - unansweredCount;

  const flaggedCount = Object.values(flagged).filter(Boolean).length;

  // Màu nền cảnh báo thời gian — dùng chung cho cả thanh tiêu đề (viền
  // dưới) và mấu thu gọn, để vẫn có tín hiệu khẩn cấp bằng MÀU dù không còn
  // hiện số đếm giờ chạy chữ khi thu gọn (khiếu nại: "đồng hồ nó vướng").
  const urgency: 'red' | 'amber' | 'normal' = timeLeft <= 60 ? 'red' : timeLeft <= 300 ? 'amber' : 'normal';

  // THÊM MỚI (khiếu nại: "nhịp thở khi còn tầm 5 phút, thở 3 nhịp; còn dưới
  // 1 phút thì thở nhanh và đổi màu như nhịp tim"): 2 kiểu "nhịp thở" cho
  // mấu neo, gắn theo `urgency` ở trên chứ không phải mốc thời gian riêng
  // (mốc 300s/60s đã dùng chung y hệt urgency amber/red).
  //  - Mốc "còn ~5 phút" (urgency chuyển sang amber lần đầu): chỉ thở ĐÚNG 3
  //    nhịp rồi thôi (animation-iteration-count: 3), như một lời nhắc thoáng
  //    qua — không thở liên tục suốt 5 phút gây rối mắt khi làm bài.
  //  - Mốc "còn dưới 1 phút" (urgency = red): thở NHANH + đổi màu như nhịp
  //    tim, LIÊN TỤC cho tới khi nộp bài — đúng tính chất khẩn cấp thật sự.
  const enteredAmberRef = useRef(false);
  const [breatheAlert, setBreatheAlert] = useState(false);
  useEffect(() => {
    if (urgency === 'amber' && !enteredAmberRef.current) {
      enteredAmberRef.current = true;
      setBreatheAlert(true);
    }
  }, [urgency]);

  return (
    <div className="max-w-3xl mx-auto pb-16 pt-4">
      {/* THANH TIÊU ĐỀ — SỬA (khiếu nại: "để tiêu đề đề thi phía trên thanh
          Phần I/II/III... không neo/ghim cố định như vậy nữa"): TRƯỚC ĐÂY
          thanh này `position: fixed` ghim cứng mép trên viewport, đè lên nội
          dung cuộn bên dưới (phải chừa 1 khoảng đệm giả `height` để tránh bị
          che). GIỜ trả về layout bình thường — tiêu đề nằm NGAY TRONG luồng
          nội dung, phía trên thanh mục lục Phần I/II/III..., cuộn trang thì
          tiêu đề cuộn theo như mọi phần tử khác, không còn ghim/neo gì cả. */}
      {examTitle && (
        <div
          className={`flex items-center justify-center text-center px-4 py-3 mb-3 rounded-xl border shadow-md transition-colors bg-gradient-to-r ${
            urgency === 'red'
              ? 'from-red-600 to-rose-600 border-red-700'
              : urgency === 'amber'
              ? 'from-amber-500 to-orange-500 border-amber-600'
              : 'from-blue-600 to-indigo-600 border-blue-700'
          }`}
        >
          <h1 className="font-bold text-white text-sm sm:text-base leading-snug truncate max-w-full drop-shadow-sm">{examTitle}</h1>
        </div>
      )}

      {/* Nút thoát — CHỈ hiện khi được truyền onExit (trường hợp GV bấm "Xem
          mô phỏng" từ ExamBuilder). Tiêu đề giờ đã nằm trong luồng nội dung
          (không còn ghim cố định) nên nút thoát chỉ cần ghim nhẹ ở góc trên
          bên TRÁI viewport, không phải tính toán lệch theo chiều cao tiêu đề
          nữa. Học sinh làm bài thật (không có onExit) không bao giờ thấy nút
          này. */}
      {onExit && (
        <button
          type="button"
          onClick={onExit}
          className="fixed left-3 sm:left-6 top-3 z-30 flex items-center gap-1.5 bg-gray-900/85 hover:bg-gray-900 active:bg-gray-900 active:scale-95 text-white text-xs font-semibold px-3 py-2 rounded-full shadow-md transition"
        >
          ✕ Thoát xem trước
        </button>
      )}

      {/* NEO — THIẾT KẾ LẠI LẦN 5 (khiếu nại: "vòng tròn hơi nhỏ, tăng kích
          thước vòng tròn nhưng icon đồng hồ giữ nguyên"): TRƯỚC ĐÂY (lần 4)
          giảm ĐỒNG THỜI cả vòng tròn (32px -> 24px) LẪN icon (16px -> 14px)
          theo cùng 1 tỉ lệ, nên icon cũng nhỏ theo. Giờ tách riêng 2 việc:
          CHỈ phóng to vùng bấm (24px -> 32px, dễ bấm hơn, nhất là trên điện
          thoại — vùng chạm rộng hơn ~1.8 lần diện tích), còn className icon
          bên dưới (<ClockIcon className="w-3.5 h-3.5" />) GIỮ NGUYÊN 14px
          như cũ — icon nhỏ nằm giữa 1 vòng tròn to hơn, không phóng to icon
          theo. Bấm vào bất kỳ đâu trong vòng tròn 32px vẫn mở popup như cũ
          (cả nút <button> là vùng bấm, không chỉ riêng icon).
          THÊM (khiếu nại "nó đụng mép màn hình phải"): right: 0 -> 0.35rem
          — trước đây (lúc còn 24px) để sát hẳn mép (right: 0) không sao, giờ
          vòng tròn to hơn (32px) để right: 0 nhìn như dính/tràn ra mép, nên
          chừa 1 khoảng đệm nhỏ (~5-6px) với mép phải màn hình. */}
      <button
        type="button"
        onClick={() => {
          setCollapsed(false);
          // Học sinh đã bấm vào neo — coi như đã "hiểu", tắt gợi ý ngay và
          // ghi nhớ vĩnh viễn, không chờ hết 7s.
          if (showAnchorHint) {
            setShowAnchorHint(false);
            markAnchorHintSeen();
          }
        }}
        onAnimationEnd={() => setBreatheAlert(false)}
        title="Xem giờ, câu đã làm và các nút thao tác"
        aria-label="Mở bảng điều khiển bài thi"
        className={`fixed z-30 flex items-center justify-center rounded-full border bg-transparent transition-colors ${
          urgency === 'red'
            ? 'anchor-heartbeat border-red-400 text-red-600'
            : urgency === 'amber'
            ? `border-amber-400 text-amber-700 ${breatheAlert ? 'anchor-breathe-alert' : ''}`
            : `border-gray-300 text-blue-700 hover:bg-white/30 ${
                showAnchorHint && collapsed ? 'anchor-onboard-ping' : ''
              }`
        }`}
        style={{ top: '1cm', right: '0.35rem', width: '2rem', height: '2rem' }}
      >
        <ClockIcon className="w-3.5 h-3.5" />
      </button>

      {/* Bong bóng chú thích đi kèm vòng sáng lan toả — CHỈ hiện cùng lúc với
          gợi ý (showAnchorHint), tự ẩn theo cùng điều kiện (bấm neo hoặc hết
          7s). Đặt lệch xuống dưới-trái neo (neo ở góc trên-phải) để không
          tràn ra ngoài mép phải màn hình trên điện thoại. Mũi tên nhỏ trỏ
          lên neo bằng 1 hình vuông xoay 45° (kiểu tooltip cổ điển). */}
      {showAnchorHint && collapsed && urgency === 'normal' && (
        <div
          className="fixed z-30 max-w-[11.5rem] text-right"
          style={{ top: 'calc(1cm + 2.5rem)', right: '0.35rem' }}
        >
          <div
            className="ml-auto mr-2.5 mb-[-3px] w-2.5 h-2.5 bg-gray-900 rotate-45 relative z-10"
            aria-hidden="true"
          />
          <div className="inline-block bg-gray-900 text-white text-[11px] leading-snug rounded-lg px-2.5 py-2 shadow-lg text-left relative">
            Bấm vào đây để xem giờ, danh sách câu và nộp bài
          </div>
        </div>
      )}

      {/* POPUP bảng điều khiển bài thi — hiện khi bấm nút neo tròn ở trên.
          THIẾT KẾ LẠI (khiếu nại: "sắp xếp các mục cho khoa học và đẹp mắt,
          nhìn lộn xộn rối quá"): trước đây giờ/tài khoản/tiến độ/nút hành
          động dồn gần như ngang hàng nhau, không rõ thứ tự ưu tiên. Giờ tách
          RÕ 3 tầng thông tin, đọc từ trên xuống đúng thứ tự quan trọng giảm
          dần:
            1) Dải tiêu đề màu theo mức khẩn cấp (đồng bộ màu với thanh tiêu
               đề đề thi vừa đổi ở trên) — nhận diện nhanh còn nhiều/ít giờ
               ngay cả khi chưa đọc số.
            2) Đồng hồ đếm giờ làm HERO riêng, cỡ chữ lớn, canh giữa — thứ
               học sinh cần thấy đầu tiên.
            3) 1 khối thẻ gộp "tài khoản" + "tiến độ làm bài" (có thanh tiến
               độ trực quan thay vì chỉ 1 dòng chữ), 2 dòng tách nhau bằng
               đường kẻ mảnh — không còn rải rác 2 nơi khác nhau như cũ.
          Nút hành động vẫn giữ nguyên logic/handler cũ, chỉ đổi vị trí xuống
          cuối cùng cho đúng luồng "xem tình trạng xong mới đến hành động". */}
      {!collapsed && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
            <div
              className={`flex items-center justify-between px-5 py-3 bg-gradient-to-r ${
                urgency === 'red'
                  ? 'from-red-600 to-rose-600'
                  : urgency === 'amber'
                  ? 'from-amber-500 to-orange-500'
                  : 'from-blue-600 to-indigo-600'
              }`}
            >
              <h3 className="text-white font-bold text-base flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4 shrink-0" /> Bảng điều khiển bài thi
              </h3>
              <button
                onClick={() => setCollapsed(true)}
                className="text-white/80 hover:text-white text-xl leading-none px-1"
                title="Đóng"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tầng 1: đồng hồ đếm giờ — hero, canh giữa, cỡ chữ lớn nhất
                  trong popup để luôn là điểm nhìn đầu tiên. THÊM MỚI (khiếu
                  nại: "cái mốc neo và popup khi gần hết giờ nên có nhịp thở
                  khi dưới 1 phút") — trước đây CHỈ nút neo tròn ngoài popup
                  có nhịp tim khi urgency=red, còn popup (khi đã bấm mở ra
                  xem) lại đứng yên, không đồng bộ cảm giác khẩn cấp với neo.
                  Giờ bọc số giờ trong 1 khối "viên thuốc" (pill) và tái dùng
                  ĐÚNG animation .anchor-heartbeat (khai báo dùng chung ở
                  globals.css) khi urgency=red — thở nhanh + đổi màu nền y hệt
                  nút neo, để dù học sinh đang xem popup mở sẵn cũng vẫn thấy
                  tín hiệu khẩn cấp nhấp nháy chứ không phải chỉ có số chạy. */}
              <div className="text-center">
                <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Thời gian còn lại</p>
                <div
                  className={`inline-flex items-center justify-center rounded-2xl px-4 py-1 ${
                    urgency === 'red' ? 'anchor-heartbeat bg-red-100' : ''
                  }`}
                >
                  <p
                    className={`font-mono font-extrabold text-3xl leading-none ${
                      urgency === 'red' ? 'text-red-600' : urgency === 'amber' ? 'text-amber-600' : 'text-blue-700'
                    }`}
                  >
                    {mm}:{ss}
                  </p>
                </div>
              </div>

              {/* Tầng 2: 1 thẻ gộp tài khoản + tiến độ làm bài, 2 dòng chia
                  bằng đường kẻ mảnh (divide-y) — cùng "ngôn ngữ thiết kế"
                  nhóm/đường kẻ mảnh đang dùng ở tab Cài đặt đề thi. */}
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="flex items-center gap-1.5 text-sm text-gray-600">
                    <CapIcon className="w-4 h-4 shrink-0 text-blue-400" /> Tài khoản
                  </span>
                  <span className="text-sm font-bold text-blue-600 truncate max-w-[55%]">{studentName}</span>
                </div>
                <div className="px-3.5 py-2.5">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-gray-600">Tiến độ làm bài</span>
                    <span className="font-bold text-gray-800">
                      {answeredCount}/{preview.total} câu
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${preview.total ? Math.round((answeredCount / preview.total) * 100) : 0}%` }}
                    />
                  </div>
                  {flaggedCount > 0 && (
                    <p className="text-xs text-amber-600 mt-1.5">🚩 Đánh dấu {flaggedCount} câu để xem lại</p>
                  )}
                </div>
              </div>

              {/* Tầng 3: hành động — giữ nguyên lưới [1fr auto] để nút "Nộp
                  bài" không bao giờ bị rớt chữ như đã sửa trước đây. */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCollapsed(true);
                    setNavOpen(true);
                  }}
                  className="relative inline-flex items-center justify-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 active:bg-gray-100 active:scale-95 text-gray-700 text-sm font-semibold px-3 py-2 rounded-lg transition whitespace-nowrap"
                  title="Danh sách câu — xem đã làm câu nào, đánh dấu để xem lại"
                >
                  <ListIcon className="w-4 h-4 shrink-0" /> <span>Danh sách câu</span>
                  {flaggedCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {flaggedCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setCollapsed(true);
                    setShowConfirm(true);
                  }}
                  disabled={submitting}
                  className="bg-red-600 hover:bg-red-700 active:bg-red-800 active:scale-95 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-lg transition whitespace-nowrap"
                >
                  Nộp bài
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {submitError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {submitError}
        </div>
      )}

      {/* THÊM MỚI (mục 1): mục lục cuộn nhanh — bấm sẽ CUỘN tới phần tương
          ứng, KHÔNG ẩn/hiện nội dung như tab cũ. Tất cả các phần vẫn nằm
          liên tiếp trên cùng một trang, cuộn xuống là thấy hết. */}
      <div className="flex gap-2 mb-5 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm flex-wrap">
        {(['p1', 'p2', 'p3', 'p4'] as Partition[]).map((p) =>
          partitionCount[p] === 0 ? null : (
            <a
              key={p}
              href={`#section-${p}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`section-${p}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="flex-1 text-center text-sm font-medium px-3 py-2 rounded-lg transition text-gray-600 hover:bg-gray-50 hover:text-blue-600 active:bg-gray-100 active:scale-95 cursor-pointer min-w-[45%] sm:min-w-0"
            >
              {partitionLabel[p]} ({partitionCount[p]})
            </a>
          )
        )}
      </div>

      {partitionCount.p1 > 0 && (
        <div id="section-p1" className="space-y-4 scroll-mt-28">
          <h2 className="font-bold text-slate-800 text-[15px] px-4 py-2.5 bg-slate-200 border border-slate-300 rounded-lg">{partitionLabel.p1}</h2>
          {(data.phan_1_TracNghiem || []).map((q: any, i: number) => (
            <div key={q.id} id={`qcard-p1-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm scroll-mt-28">
              <div className="flex justify-end -mt-4 -mr-4 mb-0.5">
                <button
                  type="button"
                  onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                  title={flagged[q.id] ? 'Bỏ đánh dấu' : 'Đánh dấu để xem lại'}
                  className={`shrink-0 flex items-center justify-center px-1 py-0.5 rounded-md transition ${
                    flagged[q.id] ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'
                  }`}
                >
                  <FlagIcon className="w-4 h-4" filled={!!flagged[q.id]} />
                </button>
              </div>
              <div className="font-semibold text-[13px] sm:text-[15px] min-w-0 whitespace-pre-wrap mb-2 overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                <span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderExamText(q.content, tikzSvgMap, `p1-${q.id}-c`, imageUrlMap, settings.imageScalePercent ?? 100)}
              </div>
              <div className="space-y-2">
                {(q.options || []).map((opt: any, oi: number) => {
                  const checked = p1Answers[q.id] === opt._origIdx;
                  return (
                    <label
                      key={oi}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition ${
                        checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={checked}
                        onChange={() => setP1Answers((prev) => ({ ...prev, [q.id]: opt._origIdx }))}
                        className="mt-1"
                      />
                      <span className="text-sm whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX(checked ? '#eff6ff' : '#ffffff')}>
                        <span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(65 + oi)}.</span>
                        {renderExamText(opt.text, tikzSvgMap, `p1-${q.id}-o${oi}`, imageUrlMap, settings.imageScalePercent ?? 100)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {partitionCount.p2 > 0 && (
        <div id="section-p2" className="space-y-4 mt-8 scroll-mt-28">
          <h2 className="font-bold text-slate-800 text-[15px] px-4 py-2.5 bg-slate-200 border border-slate-300 rounded-lg">
            {partitionLabel.p2} <span className="font-normal text-slate-500 text-[12px]">(Đ = Đúng, S = Sai)</span>
          </h2>
          {(data.phan_2_DungSai || []).map((q: any, i: number) => (
            <div key={q.id} id={`qcard-p2-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm scroll-mt-28">
              <div className="flex justify-end -mt-4 -mr-4 mb-0.5">
                <button
                  type="button"
                  onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                  title={flagged[q.id] ? 'Bỏ đánh dấu' : 'Đánh dấu để xem lại'}
                  className={`shrink-0 flex items-center justify-center px-1 py-0.5 rounded-md transition ${
                    flagged[q.id] ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'
                  }`}
                >
                  <FlagIcon className="w-4 h-4" filled={!!flagged[q.id]} />
                </button>
              </div>
              <div className="font-semibold text-[13px] sm:text-[15px] min-w-0 whitespace-pre-wrap mb-2 overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                <span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderExamText(q.content, tikzSvgMap, `p2-${q.id}-c`, imageUrlMap, settings.imageScalePercent ?? 100)}
              </div>
              <div className="space-y-2">
                {(q.options || []).map((opt: any, oi: number) => {
                  const picks = p2Answers[q.id] || {};
                  const val = picks[opt._origIdx];
                  return (
                    <div key={oi} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-3 py-2 rounded-lg border border-gray-200">
                      <span className="text-sm flex-1 whitespace-pre-wrap overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                        <span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(97 + oi)})</span>
                        {renderExamText(opt.text, tikzSvgMap, `p2-${q.id}-o${oi}`, imageUrlMap, settings.imageScalePercent ?? 100)}
                      </span>
                      {/* SỬA (khiếu nại 25-7: "điện thoại dọc, 2 nút Đ/S choán
                          diện tích làm chữ chật quá"): dưới sm — đổi 2 nút
                          rời sang 1 thanh liền khối chia đôi full-width,
                          CAO ĐÚNG BẰNG chiều cao nút cũ (h-7 = 28px = py-1.5
                          + text-xs trước đây). Từ sm trở lên (đã đủ rộng,
                          landscape/tablet vẫn ổn) giữ nguyên 2 nút nhỏ cạnh
                          chữ như cũ. */}
                      <div className="flex sm:hidden w-full h-7 rounded-lg border border-gray-300 overflow-hidden">
                        <button
                          onClick={() =>
                            setP2Answers((prev) => ({
                              ...prev,
                              [q.id]: { ...(prev[q.id] || {}), [opt._origIdx]: true },
                            }))
                          }
                          className={`flex-1 h-full flex items-center justify-center text-xs font-semibold transition ${
                            val === true ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 active:bg-gray-200'
                          }`}
                        >
                          Đ
                        </button>
                        <button
                          onClick={() =>
                            setP2Answers((prev) => ({
                              ...prev,
                              [q.id]: { ...(prev[q.id] || {}), [opt._origIdx]: false },
                            }))
                          }
                          className={`flex-1 h-full flex items-center justify-center text-xs font-semibold transition border-l border-gray-300 ${
                            val === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 active:bg-gray-200'
                          }`}
                        >
                          S
                        </button>
                      </div>
                      <div className="hidden sm:flex items-center gap-1 shrink-0">
                        <button
                          onClick={() =>
                            setP2Answers((prev) => ({
                              ...prev,
                              [q.id]: { ...(prev[q.id] || {}), [opt._origIdx]: true },
                            }))
                          }
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                            val === true ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          Đ
                        </button>
                        <button
                          onClick={() =>
                            setP2Answers((prev) => ({
                              ...prev,
                              [q.id]: { ...(prev[q.id] || {}), [opt._origIdx]: false },
                            }))
                          }
                          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                            val === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          S
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {partitionCount.p3 > 0 && (
        <div id="section-p3" className="space-y-4 mt-8 scroll-mt-28">
          <h2 className="font-bold text-slate-800 text-[15px] px-4 py-2.5 bg-slate-200 border border-slate-300 rounded-lg">{partitionLabel.p3}</h2>
          {(data.phan_3_TraLoiNgan || []).map((q: any, i: number) => (
            <div key={q.id} id={`qcard-p3-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm scroll-mt-28">
              <div className="flex justify-end -mt-4 -mr-4 mb-0.5">
                <button
                  type="button"
                  onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                  title={flagged[q.id] ? 'Bỏ đánh dấu' : 'Đánh dấu để xem lại'}
                  className={`shrink-0 flex items-center justify-center px-1 py-0.5 rounded-md transition ${
                    flagged[q.id] ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'
                  }`}
                >
                  <FlagIcon className="w-4 h-4" filled={!!flagged[q.id]} />
                </button>
              </div>
              <div className="font-semibold text-[13px] sm:text-[15px] min-w-0 whitespace-pre-wrap mb-2 overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                <span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderExamText(q.content, tikzSvgMap, `p3-${q.id}-c`, imageUrlMap, settings.imageScalePercent ?? 100)}
              </div>
              <input
                type="text"
                value={textAnswers[q.id] || ''}
                onChange={(e) => setTextAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Nhập đáp số..."
                className="w-[120px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          ))}
        </div>
      )}

      {partitionCount.p4 > 0 && (
        <div id="section-p4" className="space-y-4 mt-8 scroll-mt-28">
          <h2 className="font-bold text-slate-800 text-[15px] px-4 py-2.5 bg-slate-200 border border-slate-300 rounded-lg">{partitionLabel.p4}</h2>
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2">
            Làm bài trên giấy, chụp ảnh hoặc chọn ảnh đã chụp cho từng câu. Giáo viên sẽ chấm tay
            phần này sau khi em nộp bài — điểm hiển thị lúc nộp KHÔNG bao gồm Phần IV.
          </div>
          {(data.phan_4_TuLuan || []).map((q: any, i: number) => {
            const images = essayImages[q.id] || [];
            const uploading = !!essayUploading[q.id];
            const inputId = `essay-file-${q.id}`;
            return (
              <div key={q.id} id={`qcard-p4-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm scroll-mt-28">
                <div className="flex justify-end -mt-4 -mr-4 mb-0.5">
                  <button
                    type="button"
                    onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                    title={flagged[q.id] ? 'Bỏ đánh dấu' : 'Đánh dấu để xem lại'}
                    className={`shrink-0 flex items-center justify-center px-1 py-0.5 rounded-md transition ${
                      flagged[q.id] ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'
                    }`}
                  >
                    <FlagIcon className="w-4 h-4" filled={!!flagged[q.id]} />
                  </button>
                </div>
                <div className="font-semibold text-[13px] sm:text-[15px] min-w-0 whitespace-pre-wrap mb-2 overflow-x-auto no-scrollbar" style={scrollFadeX('#ffffff')}>
                  <span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderExamText(q.content, tikzSvgMap, `p4-${q.id}-c`, imageUrlMap, settings.imageScalePercent ?? 100)}
                </div>

                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {images.map((url, idx) => (
                      <div key={url} className="relative">
                        <a href={url} target="_blank" rel="noreferrer">
                          <img
                            src={url}
                            alt={`Ảnh bài làm câu ${i + 1} - trang ${idx + 1}`}
                            className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                            loading="lazy"
                            decoding="async"
                          />
                        </a>
                        <button
                          type="button"
                          onClick={() => removeEssayImage(q.id, url)}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center shadow"
                          title="Xóa ảnh này"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* SỬA (khiếu nại: "chụp ảnh bấm OK xong bị bung khỏi bài làm"):
                    nguyên nhân là input file với capture="environment" ép mở
                    THẲNG app Camera gốc — trên điện thoại RAM thấp, hệ điều
                    hành hay tự tắt (kill) tiến trình trình duyệt đang chạy nền
                    để nhường RAM cho app Camera, khiến lúc quay lại Chrome phải
                    tải lại trang từ đầu, mất trạng thái bài làm.
                    BỎ HẲN nút chụp trực tiếp (capture="environment") theo yêu
                    cầu — đa phần học sinh dùng máy yếu, rủi ro bị bung khỏi
                    bài thi oan cao hơn lợi ích tiện chụp nhanh. Chỉ còn 1 input
                    KHÔNG có capture: mở bảng chọn ảnh bình thường của điện
                    thoại (trên Android/iOS đời mới, bảng này vẫn có sẵn lựa
                    chọn "Chụp ảnh mới" ngay bên trong, nhẹ hơn hẳn so với ép mở
                    thẳng app Camera riêng, ít bị hệ điều hành kill tiến trình
                    hơn), hoặc chọn ảnh đã có sẵn trong Thư viện ảnh. */}
                <label
                  htmlFor={inputId}
                  onClick={suppressLeaveWarningForImagePicker}
                  className={`inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border cursor-pointer transition ${
                    uploading
                      ? 'border-gray-200 text-gray-400 pointer-events-none'
                      : 'border-blue-300 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {uploading ? 'Đang tải ảnh lên...' : images.length > 0 ? '+ Thêm ảnh (trang khác)' : '📷 Chụp / chọn ảnh bài làm'}
                </label>
                <input
                  id={inputId}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) uploadEssayImage(q.id, file);
                  }}
                />
                {essayError[q.id] && <p className="text-xs text-red-600 mt-2">{essayError[q.id]}</p>}
              </div>
            );
          })}
        </div>
      )}

      {navOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900"><ListIcon className="w-5 h-5 shrink-0" /> Danh sách câu</h3>
              <button
                onClick={() => setNavOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
                title="Đóng"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-1">
              Đã làm {preview.total - Math.max(0, unansweredCount)}/{preview.total} câu
              {flaggedCount > 0 && (
                <span className="text-amber-600"> · Đánh dấu {flaggedCount} câu để xem lại</span>
              )}
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-blue-100 border border-blue-300 inline-block" /> Đã làm
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-gray-100 border border-gray-300 inline-block" /> Chưa làm
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-white border-2 border-amber-400 inline-block" /> Đã đánh dấu
              </span>
            </div>

            {(
              [
                { key: 'p1', label: partitionLabel.p1, items: data.phan_1_TracNghiem || [], attemptedById: attemptedByIdP1 },
                { key: 'p2', label: partitionLabel.p2, items: data.phan_2_DungSai || [], attemptedById: attemptedByIdP2 },
                { key: 'p3', label: partitionLabel.p3, items: data.phan_3_TraLoiNgan || [], attemptedById: attemptedByIdP3 },
                {
                  key: 'p4',
                  label: partitionLabel.p4,
                  items: data.phan_4_TuLuan || [],
                  attemptedById: Object.fromEntries(
                    (data.phan_4_TuLuan || []).map((q: any) => [q.id, (essayImages[q.id] || []).length > 0])
                  ),
                },
              ] as const
            ).map((group) =>
              group.items.length === 0 ? null : (
                <div key={group.key} className="mb-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((q: any, i: number) => {
                      const attempted = !!group.attemptedById[q.id];
                      const isFlagged = !!flagged[q.id];
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => scrollToQuestion(`qcard-${group.key}-${q.id}`)}
                          title={`Câu ${i + 1}${attempted ? ' — đã làm' : ' — chưa làm'}${isFlagged ? ' — đã đánh dấu' : ''}`}
                          className={`relative w-10 h-10 rounded-lg text-sm font-semibold flex items-center justify-center transition ${
                            attempted
                              ? 'bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200'
                              : 'bg-gray-100 text-gray-500 border border-gray-300 hover:bg-gray-200'
                          } ${isFlagged ? 'ring-2 ring-amber-400' : ''}`}
                        >
                          {i + 1}
                          {isFlagged && <FlagIcon className="absolute -top-1.5 -right-1.5 w-3 h-3 text-amber-500" filled />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* THÊM MỚI (mục 3): màn "vui lòng chờ" phủ toàn màn hình trong lúc
          chờ server chấm bài — TRƯỚC ĐÂY học sinh chỉ thấy nút "Nộp bài" đổi
          chữ thành "Đang nộp..." (dễ bị lẫn với các nút khác, dễ hiểu nhầm
          là app bị đứng nếu mạng chậm), giờ chặn hẳn thao tác + báo rõ đang
          chờ điểm/lời giải để học sinh yên tâm không bấm thêm lần nữa (tránh
          gửi trùng request). z-[60] để LUÔN nổi trên modal xác nhận (z-50)
          nếu 2 modal vô tình chồng nhau đúng lúc chuyển trạng thái. */}
      {submitting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-xs w-full p-6 text-center">
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
            <h3 className="text-base font-bold text-gray-900 mb-1">Vui lòng chờ...</h3>
            <p className="text-sm text-gray-500">Đang chấm bài và tính điểm, đừng tắt hay tải lại trang nhé.</p>
          </div>
        </div>
      )}

      {showConfirm && !submitting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nộp bài?</h3>
            <p className="text-sm text-gray-500 mb-1">
              Em đã làm {preview.total - Math.max(0, unansweredCount)}/{preview.total} câu.
            </p>
            {unansweredCount > 0 && (
              <p className="text-sm text-amber-600 mb-4">Còn {unansweredCount} câu chưa làm.</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2 rounded-lg hover:bg-gray-50"
              >
                Làm tiếp
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  handleSubmit(false);
                }}
                disabled={submitting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg"
              >
                {submitting ? 'Đang nộp...' : 'Nộp bài'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THÊM MỚI (khiếu nại 25-7): cảnh báo hiện ĐÚNG lúc học sinh quay lại
          sau khi rời tab/mất focus cửa sổ — xem effect visibilitychange/
          blur/focus ở trên. Chỉ nhắc nhở, không ghi/gửi gì lên server, học
          sinh bấm "Đã hiểu" là đóng, làm bài tiếp bình thường, đồng hồ
          không hề bị ảnh hưởng (vẫn tính từ started_at gốc như mọi khi). */}
      {showLeftExamWarning && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-amber-600" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path
                  d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Em vừa rời khỏi bài thi</h3>
            <p className="text-sm text-gray-500 mb-4">
              Đừng chuyển sang tab hay ứng dụng khác trong lúc làm bài nhé. Đồng hồ vẫn đang chạy bình thường.
            </p>
            <button
              onClick={() => setShowLeftExamWarning(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg"
            >
              Đã hiểu, tiếp tục làm bài
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
