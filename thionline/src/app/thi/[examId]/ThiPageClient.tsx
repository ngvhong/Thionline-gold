'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import StudentTakeExam from './StudentTakeExam';
import SolutionView from './SolutionView';
import type { P1Answers, P2Answers, TextAnswers, ScoringSettings } from '@/lib/grading';
import { round2 } from '@/lib/grading';
import { AppLogoIcon } from '@/components/AppBranding';
import { useInAppBrowserWarning } from '@/lib/useInAppBrowserWarning';

// THÊM MỚI (Phần 4 — link chung nhiều lớp qua Khối): 'group-pick' là bước
// "chọn lớp của em" khi mở link dạng ?g={code} (xem mục 6 spec-tinh-nang-
// khoi.md). Đứng TRƯỚC 'pick' — sau khi học sinh chọn xong 1 lớp, luồng rơi
// thẳng vào đúng các phase cũ (loading -> pick/blocked-early/blocked-late...)
// y hệt như đang mở link lớp đơn lẻ, không có phase mới nào khác được thêm.
type Phase = 'loading' | 'group-pick' | 'error' | 'blocked-early' | 'blocked-late' | 'pick' | 'starting' | 'pending' | 'taking' | 'done';

// THÊM MỚI (Phần 4): 1 lớp trong danh sách trả về bởi GET
// /api/thi/[examId]/group/[code] — chỉ classId + className, không có gì
// khác (API cố tình không lộ thêm field nào, xem route.ts).
type GroupClassOption = { classId: string; className: string };

type RoomInfo = {
  examTitle: string;
  className: string;
  duration: number;
  students: { _id: string; name: string }[];
  // 'off': ẩn hẳn nút "Không thấy tên mình?". 'auto': tự báo danh xong vào
  // thi luôn. 'approval': tự báo danh xong phải chờ GV duyệt.
  selfRegisterMode: 'off' | 'auto' | 'approval';
  // THÊM MỚI (giờ mở/đóng thi kiểu Azota): CHỈ để hiện thông tin tham khảo ở
  // đây — quyết định CHẶN thật sự nằm ở server (/start, /self-register),
  // không tin giờ máy học sinh nên không tự chặn ở client bằng 2 field này.
  openAt: string | null;
  closeAt: string | null;
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
    // THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): xem giải thích đầy đủ ở
    // StudentTakeExam.tsx — truyền tiếp xuống cả StudentTakeExam lẫn
    // SolutionView bên dưới để 2 nơi hiển thị đề luôn khớp cùng 1 cỡ hình.
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
  // THÊM MỚI: còn được TỰ làm lại không (server tính theo maxAttempts) —
  // hiện nút "Làm lại" ở màn kết quả nếu true.
  canRetake?: boolean;
  // THÊM MỚI: chỉ có giá trị khi màn "Đã nộp bài" tới từ luồng MỞ LẠI LINK
  // sau khi đã nộp (không đi qua StudentTakeExam/session) — dùng làm fallback
  // hiển thị tên học sinh khi `session` vẫn còn null.
  // THÊM MỚI (màn "Đã nộp bài" hiện điểm/ảnh Phần IV): song song với
  // essayScores/essayMaxScore/essayImages/essayAnnotatedImages GV đã chấm —
  // essayGraded=false nghĩa là "chưa chấm xong", chỉ hiện essayMaxScore
  // (biết tối đa bao nhiêu điểm) chứ chưa hiện điểm/ảnh khoanh.
  studentName?: string;
  essayScores?: Record<string, number> | null;
  essayMaxScore?: number | null;
  essayGraded?: boolean;
  essayImages?: Record<string, string[]> | null;
  essayAnnotatedImages?: Record<string, string[]> | null;
  // THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): chỉ có giá trị ở luồng MỞ
  // LẠI LINK sau khi đã nộp (không có `session` để lấy settings từ đó) —
  // server trả kèm effectiveSettings.imageScalePercent trong nhánh
  // alreadySubmitted của route /start, xem giải thích ở đó.
  imageScalePercent?: number;
};

// THÊM MỚI (chống dồn request "Bắt đầu làm bài" cùng 1 khoảnh khắc): khi
// GV mở đề đúng giờ hẹn, cả lớp/cả khối thường bấm "Bắt đầu làm bài" gần
// như cùng lúc (trong vài giây) — dồn hết request /start lên Vercel +
// MongoDB cùng 1 thời điểm. Mỗi trình duyệt tự chờ ngẫu nhiên 1 khoảng
// ngắn TRƯỚC KHI thực sự gửi request (không phải sau khi bấm mới random —
// bấm là random ngay), để tải rải mỏng ra thay vì dồn cục. Chỉ là giảm
// khả năng TRÙNG KHỚP tới mili-giây, không phải hàng đợi cứng đếm số lượt
// — không cần thêm hạ tầng nào (Redis, queue...), chỉ trì hoãn phía client.
//
// SỬA: chỉ áp dụng khi mở qua LINK CHUNG NHIỀU LỚP (?g=..., dùng khi GV
// giao đề đồng loạt cho cả khối — tổng có thể lên tới vài trăm em cùng
// bấm 1 lúc). Link riêng 1 lớp (phổ biến nhất, chỉ vài chục em) không cần
// trì hoãn — xem điều kiện `groupCode` ở nơi gọi trong handleStart.
function randomStartDelayMs(): number {
  return Math.floor(Math.random() * 3000);
}

export default function ThiPageClient() {
  const params = useParams<{ examId: string }>();
  const searchParams = useSearchParams();
  const examId = params.examId;
  // SỬA (Phần 4): classId KHÔNG còn đọc thẳng 1 lần từ searchParams — link
  // lớp cũ (?class=) vẫn có giá trị này NGAY LẬP TỨC (set ở effect xác định
  // luồng bên dưới, xem "eslint-disable-next-line" kế tiếp), còn link chung
  // (?g=) thì classId RỖNG cho tới khi học sinh chọn xong 1 lớp ở phase
  // 'group-pick'. Toàn bộ phần code phía sau (fetch phòng thi, handleStart,
  // handleSelfRegister, localStorage theo lớp, StudentTakeExam...) dùng
  // ĐÚNG state này, không đổi logic gì khác — chỉ khác thời điểm nó có giá
  // trị.
  const [classId, setClassId] = useState('');
  // THÊM MỚI (Phần 4): link chung dùng để xác định luồng nào ở effect xác
  // định mode bên dưới — không dùng trực tiếp ở đâu khác trong file.
  const groupCode = searchParams.get('g') || '';
  // THÊM MỚI (Phần 4): danh sách lớp thuộc link chung này, lấy từ GET
  // /api/thi/[examId]/group/[code] — chỉ dùng để hiện bước "chọn lớp của
  // em" (phase 'group-pick').
  const [groupClasses, setGroupClasses] = useState<GroupClassOption[]>([]);

  // Cảnh báo "đang mở bằng trình duyệt trong Zalo/Messenger/Facebook" — gắn
  // 1 lần ở đây là đủ hiện xuyên suốt mọi phase bên dưới (loading/pick/
  // taking/done...), xem chi tiết lý do + cách hoạt động trong file hook.
  // SỬA (theo yêu cầu): đổi xưng hô "Em" -> "Bạn" cho trung tính hơn (không
  // giả định người mở link luôn là học sinh nhỏ tuổi).
  useInAppBrowserWarning({
    greeting: 'Bạn',
    reasonText: 'dễ bị lỗi lúc chụp ảnh nộp bài tự luận',
  });

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  // THÊM MỚI (tự báo danh kiểu Azota): showSelfRegister điều khiển việc hiện
  // ô nhập tên tự do (thay dropdown) khi học sinh bấm "Không thấy tên
  // mình?". selfRegisterName là tên đang gõ, selfRegistering là trạng thái
  // đang gọi API self-register (disable nút tránh bấm trùng).
  const [showSelfRegister, setShowSelfRegister] = useState(false);
  const [selfRegisterName, setSelfRegisterName] = useState('');
  const [selfRegistering, setSelfRegistering] = useState(false);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  // THÊM MỚI: bấm "Xem lời giải" (chỉ hiện khi GV bật showSolution:
  // after_submit) sẽ mở SolutionView đè lên card kết quả nhỏ gọn.
  const [showSolutionView, setShowSolutionView] = useState(false);

  // THÊM MỚI (Phần 4): effect XÁC ĐỊNH LUỒNG, chạy 1 lần khi vào trang —
  // tách riêng khỏi effect fetch phòng thi bên dưới.
  //   - Có `?class=` (link lớp cũ) → set thẳng classId, KHÔNG đổi hành vi gì
  //     (effect fetch phòng thi bên dưới sẽ tự chạy tiếp ngay khi classId
  //     đổi, y hệt luồng cũ 100%, không thêm bước nào, không hiện phase mới).
  //   - Không có `?class=` nhưng có `?g=` (link chung) → gọi API group để
  //     lấy danh sách lớp, chuyển sang phase 'group-pick' cho học sinh tự
  //     chọn lớp — classId vẫn rỗng, effect fetch phòng thi bên dưới CHƯA
  //     chạy (nó chỉ chạy khi classId có giá trị).
  //   - Không có cả 2 → báo lỗi thiếu thông tin lớp, giống hệt thông báo cũ.
  useEffect(() => {
    const classParam = searchParams.get('class');
    if (classParam) {
      setClassId(classParam);
      return;
    }
    if (groupCode) {
      (async () => {
        try {
          const res = await fetch(`/api/thi/${examId}/group/${groupCode}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Không tải được danh sách lớp.');
          setGroupClasses(data.classes || []);
          setPhase('group-pick');
        } catch (err: any) {
          setErrorMsg(err.message || 'Không tải được danh sách lớp.');
          setPhase('error');
        }
      })();
      return;
    }
    setErrorMsg('Link đề thi thiếu thông tin lớp. Nhờ giáo viên gửi lại link.');
    setPhase('error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // THÊM MỚI (Phần 4): học sinh vừa bấm chọn 1 lớp ở phase 'group-pick' —
  // set classId tương ứng rồi để nguyên effect fetch phòng thi bên dưới tự
  // chạy tiếp, RƠI THẲNG vào đúng luồng cũ (chọn tên/tự báo danh/start...)
  // y hệt như đang mở link lớp đơn lẻ, không viết lại/nhân bản logic nào.
  function handlePickGroupClass(pickedClassId: string) {
    setClassId(pickedClassId);
    setPhase('loading');
  }

  // SỬA (Phần 4): bỏ nhánh báo lỗi "thiếu classId" ở đây — effect xác định
  // luồng phía trên đã lo việc đó. Effect này giờ CHỈ chạy khi đã có classId
  // (từ `?class=` hoặc từ bước chọn lớp ở link `?g=`), giữ nguyên 100% phần
  // fetch + xử lý bên trong so với bản gốc.
  useEffect(() => {
    if (!classId) return;
    (async () => {
      try {
        const res = await fetch(`/api/thi/${examId}?classId=${classId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Không tải được đề thi.');
        setRoom(data);
        // THÊM MỚI (giờ mở/đóng thi kiểu Azota): chặn NGAY từ màn vào link,
        // trước cả khi học sinh chọn tên — không đợi tới lúc bấm "Bắt đầu
        // làm bài" mới báo. Đây chỉ là hàng rào UX ở client (server /start
        // vẫn là nơi quyết định thật, xem route.ts) — học sinh không tự sửa
        // được đồng hồ máy để bỏ qua vì server luôn check lại.
        const now = Date.now();
        const openAtMs = data.openAt ? new Date(data.openAt).getTime() : null;
        const closeAtMs = data.closeAt ? new Date(data.closeAt).getTime() : null;
        if (openAtMs && now < openAtMs) {
          setPhase('blocked-early');
        } else if (closeAtMs && now > closeAtMs) {
          setPhase('blocked-late');
        } else {
          setPhase('pick');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Không tải được đề thi.');
        setPhase('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, classId]);

  // SỬA: nhận thêm studentIdOverride để dùng ngay sau khi tự báo danh xong
  // (studentId lúc đó vừa mới có từ API, chưa kịp lưu vào state
  // selectedStudentId — setState là bất đồng bộ, gọi handleStart() ngay sau
  // set sẽ đọc phải giá trị CŨ). Không truyền thì dùng selectedStudentId như
  // cũ (đường chọn từ dropdown).
  //
  // THÊM MỚI: nhớ lại phase TRƯỚC khi gọi /start (fallbackPhase) — vì hàm
  // này giờ được gọi từ cả màn "pick" (chọn tên/vừa tự báo danh xong, chế độ
  // 'auto') LẪN màn "pending" (nút "Em đã được duyệt chưa?", chế độ
  // 'approval'). Nếu /start vẫn thất bại (VD GV chưa duyệt), phải quay lại
  // ĐÚNG màn vừa gọi, không được hard-code về 'pick' — nếu không, em đang
  // chờ duyệt bấm thử lại sẽ bị đá ngược về màn chọn tên, mất luôn ngữ cảnh
  // "đang chờ duyệt".
  async function handleStart(studentIdOverride?: string, opts: { retake?: boolean } = {}) {
    const studentId = studentIdOverride || selectedStudentId;
    if (!studentId) return;
    const fallbackPhase = phase === 'pending' ? 'pending' : phase === 'done' ? 'done' : 'pick';
    setPhase('starting');
    setErrorMsg('');
    try {
      // Trì hoãn ngẫu nhiên TRƯỚC khi gửi request thật — xem giải thích ở
      // randomStartDelayMs() phía trên. Học sinh vẫn thấy nút chuyển sang
      // "Đang chuẩn bị..." ngay lập tức (setPhase ở trên), không cảm giác
      // đứng hình, chỉ có request thật là bị rải mỏng ra.
      // SỬA: chỉ trì hoãn khi mở qua link chung nhiều lớp (groupCode có giá
      // trị, tức GV giao đề đồng loạt cho cả khối) — link riêng 1 lớp thì
      // gửi request ngay, không chờ.
      if (groupCode) {
        await new Promise((resolve) => setTimeout(resolve, randomStartDelayMs()));
      }
      const res = await fetch(`/api/thi/${examId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, studentId, retake: !!opts.retake }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không bắt đầu được bài thi.');

      // THÊM MỚI: lượt mới nhất ĐÃ NỘP rồi (mở lại link sau khi thi xong, hoặc
      // quay lại xem lời giải sau) — server trả thẳng kết quả, không có
      // raw_data/endAt để làm bài, nên KHÔNG chuyển sang phase 'taking'.
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
          essayScores: data.essayScores,
          essayMaxScore: data.essayMaxScore,
          essayGraded: !!data.essayGraded,
          essayImages: data.essayImages,
          essayAnnotatedImages: data.essayAnnotatedImages,
          imageScalePercent: data.settings?.imageScalePercent,
        });
        setPhase('done');
        return;
      }

      setSession(data);
      setPhase('taking');
    } catch (err: any) {
      setErrorMsg(err.message || 'Không bắt đầu được bài thi.');
      setPhase(fallbackPhase);
    }
  }

  // THÊM MỚI: học sinh bấm "Làm lại" ở màn kết quả (chỉ hiện khi
  // result.canRetake === true) — gọi lại /start với retake: true để tự xin
  // 1 lượt làm MỚI, không cần giáo viên bấm "Cho làm lại".
  function handleRetake() {
    setShowSolutionView(false);
    handleStart(selectedStudentId, { retake: true });
  }

  // THÊM MỚI: gọi /self-register để tạo tên mới trong lớp.
  //   - Chế độ 'auto': API trả approved=true → vào thẳng /start bằng
  //     studentId vừa tạo, không phải bấm thêm bước nào khác.
  //   - Chế độ 'approval': API trả approved=false → KHÔNG gọi /start (chắc
  //     chắn bị từ chối), thay vào đó chuyển sang phase 'pending' hiện màn
  //     "đang chờ giáo viên duyệt", có nút "Em đã được duyệt chưa?" để thử
  //     lại /start khi GV duyệt xong.
  async function handleSelfRegister() {
    const trimmed = selfRegisterName.trim();
    if (!trimmed) {
      setErrorMsg('Em nhập tên trước đã nhé.');
      return;
    }
    setSelfRegistering(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/thi/${examId}/self-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thêm được tên.');
      setSelectedStudentId(data.studentId);
      if (data.approved) {
        await handleStart(data.studentId);
      } else {
        setPhase('pending');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thêm được tên.');
    } finally {
      setSelfRegistering(false);
    }
  }

  // Skeleton UI (thay "Đang tải đề thi..." chặn trắng): hiện ngay khung thẻ
  // + logo thật (không đổi theo dữ liệu, hiện được ngay) đúng bố cục màn
  // "chọn tên" thật bên dưới (dòng ~745), phần tên đề/lớp/dropdown còn thiếu
  // thì thay bằng khối xám nhấp nháy — dữ liệu về tới đâu (phase chuyển sang
  // 'pick') màn thật thay vào tới đó. KHÔNG làm API nhanh hơn, chỉ đỡ "đứng
  // hình" trong lúc học sinh chờ.
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full animate-pulse">
          <AppLogoIcon className="w-16 h-16 mx-auto mb-3" />
          <div className="h-5 bg-gray-200 rounded w-3/4 mx-auto mb-2" />
          <div className="h-3.5 bg-gray-100 rounded w-1/2 mx-auto mb-6" />
          <div className="h-10 bg-gray-100 rounded-lg mb-3" />
          <div className="h-10 bg-gray-200 rounded-lg" />
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <p className="text-3xl mb-3">⚠️</p>
          <p className="text-gray-700 font-medium">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // THÊM MỚI (Phần 4): bước "chọn lớp của em" — chỉ hiện khi mở link chung
  // (?g=code). Sau khi bấm chọn 1 lớp, handlePickGroupClass() set classId
  // rồi rơi thẳng vào đúng effect/luồng cũ (xem phía trên) — màn hình dưới
  // đây chỉ là 1 bước CHỌN, không tự gọi API phòng thi, không đụng gì tới
  // phần "chọn tên"/"tự báo danh" phía sau.
  if (phase === 'group-pick') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full">
          <AppLogoIcon className="w-16 h-16 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 text-center mb-1">Chọn lớp của em</h2>
          <p className="text-sm text-gray-400 text-center mb-6">
            Đề thi này được gửi chung cho nhiều lớp — hãy chọn đúng lớp em đang học.
          </p>
          {errorMsg && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}
          <div className="space-y-2">
            {groupClasses.map((c) => (
              <button
                key={c.classId}
                type="button"
                onClick={() => handlePickGroupClass(c.classId)}
                className="w-full text-left border border-gray-200 hover:border-blue-400 hover:bg-blue-50 active:bg-blue-100 active:scale-[0.98] rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition"
              >
                {c.className}
              </button>
            ))}
          </div>
          {groupClasses.length === 0 && (
            <p className="text-xs text-gray-400 text-center mt-3">Không có lớp nào trong link này.</p>
          )}
        </div>
      </div>
    );
  }

  // THÊM MỚI: chặn hẳn màn hình (không cho thấy màn chọn tên) khi mở link
  // trước giờ mở đề — đúng nội dung GV yêu cầu: nói rõ ngày/khoảng giờ mở
  // đề, và cảnh báo nếu vào trễ (sau closeAt) sẽ không thi được nữa.
  if (phase === 'blocked-early') {
    const openAtStr = room?.openAt ? new Date(room.openAt).toLocaleString('vi-VN') : '';
    const closeAtStr = room?.closeAt ? new Date(room.closeAt).toLocaleString('vi-VN') : '';
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <AppLogoIcon className="w-16 h-16 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Chưa tới thời gian thi</h2>
          <p className="text-sm text-gray-600 mb-3">
            Vui lòng quay lại vào lúc <span className="font-semibold">{openAtStr}</span>
            {closeAtStr && (
              <>
                {' '}— thời gian mở đề trong khoảng đến <span className="font-semibold">{closeAtStr}</span>
              </>
            )}
            .
          </p>
          <p className="text-xs text-amber-600">
            Nếu quá thời gian mở đề, em sẽ không tham gia thi được nữa (tính là vào trễ thời gian mở đề).
          </p>
        </div>
      </div>
    );
  }

  // THÊM MỚI: chặn màn hình khi mở link sau khi đã hết giờ mở đề (và học
  // sinh này chưa từng vào thi trước đó — status vẫn 'chưa thi' ở server).
  if (phase === 'blocked-late') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <AppLogoIcon className="w-16 h-16 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Đã hết thời gian mở đề</h2>
          <p className="text-sm text-gray-600">Hãy liên hệ giáo viên bộ môn nhé.</p>
        </div>
      </div>
    );
  }

  if (phase === 'done' && result) {
    if (showSolutionView && result.solutionData) {
      return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
          <SolutionView
            examData={result.solutionData.examData}
            // SỬA: bắt buộc truyền bản GỐC chưa trộn để SolutionView chấm
            // điểm đúng (xem giải thích chi tiết trong comment đầu
            // SolutionView.tsx). Ở luồng vừa nộp bài, `session.raw_data` là
            // bản gốc đó. Ở luồng MỞ LẠI LINK sau khi đã nộp (không có
            // `session` vì không đi qua StudentTakeExam), server trả thẳng
            // `solutionData.examData` = raw_data gốc (không trộn) nên dùng
            // luôn nó làm rawData — vẫn chấm đúng, chỉ có thứ tự hiển thị câu
            // không giữ đúng thứ tự trộn của lần làm bài trước (chấp nhận
            // được, vì thứ tự trộn không lưu lại phía server).
            rawData={session?.raw_data || result.solutionData.examData}
            p1Answers={result.solutionData.p1Answers}
            p2Answers={result.solutionData.p2Answers}
            textAnswers={result.solutionData.textAnswers}
            scoring={result.solutionData.scoring}
            // THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): luồng vừa nộp bài
            // có `session.settings` sẵn; luồng mở lại link không có session
            // nên dùng `result.imageScalePercent` (server trả riêng cho
            // nhánh alreadySubmitted — xem route /start).
            imageScalePercent={session?.settings.imageScalePercent ?? result.imageScalePercent}
            onClose={() => setShowSolutionView(false)}
          />
        </div>
      );
    }
    // THÊM MỚI (Phần IV Tự luận ở màn "Đã nộp bài"): gộp dữ liệu essay lấy từ
    // result (đến từ /start nhánh alreadySubmitted, hoặc từ onSubmitted của
    // StudentTakeExam lúc vừa nộp) — tính essaySum/hasEssay/thứ tự câu ở đây,
    // dùng chung cho cả đoạn hiện tổng điểm lẫn khối liệt kê từng câu bên
    // dưới, giống hệt cách modal GV (page.tsx/SubmissionDetailModal) đang làm.
    const essayMaxScoreVal = typeof result.essayMaxScore === 'number' ? result.essayMaxScore : 0;
    const hasEssay = essayMaxScoreVal > 0;
    const essayScoresMap: Record<string, number> = result.essayScores || {};
    const essaySum = round2(
      Object.values(essayScoresMap).reduce((a: number, b: any) => a + (Number(b) || 0), 0)
    );
    const essayImagesMap: Record<string, string[]> = result.essayImages || {};
    const essayAnnotatedMap: Record<string, string[]> = result.essayAnnotatedImages || {};
    // Ưu tiên lấy đúng thứ tự câu từ raw_data (có ở luồng vừa làm bài qua
    // session, hoặc luồng có lời giải đã mở) — không có thì fallback theo
    // thứ tự key trong essayImages/essayScores (chấp nhận được, hiếm khi
    // xảy ra vì raw_data hầu như luôn có).
    const essayRawQuestions: any[] =
      (session?.raw_data || result.solutionData?.examData)?.phan_4_TuLuan || [];
    const essayQuestionIds: string[] =
      essayRawQuestions.length > 0
        ? essayRawQuestions.map((q: any) => q.id)
        : Object.keys(essayImagesMap).length > 0
        ? Object.keys(essayImagesMap)
        : Object.keys(essayScoresMap);
    const totalScorePoints = typeof result.scorePoints === 'number' ? result.scorePoints : null;
    const totalMaxScorePoints = typeof result.maxScorePoints === 'number' ? result.maxScorePoints : null;
    const displayScore =
      hasEssay && result.essayGraded && totalScorePoints !== null && totalMaxScorePoints !== null
        ? `${round2(totalScorePoints + essaySum)}/${round2(totalMaxScorePoints + essayMaxScoreVal)} điểm`
        : totalScorePoints !== null && totalMaxScorePoints !== null
        ? `${totalScorePoints}/${totalMaxScorePoints} điểm`
        : `${result.score}/${result.total}`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <AppLogoIcon className="w-16 h-16 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Đã nộp bài!</h2>
          <p className="text-sm text-gray-500 mb-4">{session?.studentName || result.studentName}</p>
          {errorMsg && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 text-left">
              {errorMsg}
            </div>
          )}
          {/* SỬA: chỉ hiện điểm theo thang điểm (0.25/1/0.5 mỗi phần) — BỎ
              dòng "x/y câu" cũ (số câu ĐÚNG TUYỆT ĐỐI, không phản ánh điểm
              từng phần của Phần II) vì dễ gây hiểu lầm. Nếu vì lý do gì
              server không trả về scorePoints/maxScorePoints (dữ liệu cũ),
              fallback về "score/total" để không hiện trống trơn.
              THÊM MỚI: nếu đề có Phần IV, cộng gộp essaySum vào tổng khi đã
              chấm xong (essayGraded), kèm dòng phụ tách rõ Phần I-III / Phần
              IV giống modal GV — chưa chấm xong thì vẫn hiện điểm Phần I-III
              ngay (không đợi GV), chỉ Phần IV báo "chưa chấm". */}
          <div className="mb-4">
            <p className="text-3xl font-bold text-blue-600">{displayScore}</p>
            {hasEssay && (
              <p className="text-xs text-gray-400 mt-0.5">
                {result.essayGraded
                  ? `Trong đó Phần I-III: ${totalScorePoints}/${totalMaxScorePoints}đ · Phần IV: ${essaySum}/${essayMaxScoreVal}đ`
                  : `Phần I-III: ${totalScorePoints}/${totalMaxScorePoints}đ · Phần IV (Tự luận): chưa chấm xong (tối đa ${essayMaxScoreVal}đ)`}
              </p>
            )}
          </div>
          {/* SỬA: câu chữ cũ "Điểm sẽ do giáo viên xem và công bố" không còn
              đúng nữa — điểm Phần I-III đã hiện NGAY ở trên rồi (chấm tự
              động), chỉ Phần IV còn chờ GV chấm tay nên đổi câu chữ cho khớp
              thực tế, tuỳ trường hợp có/không có Phần IV. */}
          <p className="text-xs text-gray-400 mb-4">
            {hasEssay && !result.essayGraded
              ? 'Phần IV (Tự luận) đang chờ giáo viên chấm — quay lại link này sau để xem điểm và bài đã chấm khi có kết quả.'
              : result.showSolution
              ? 'Em có thể đóng trang này.'
              : 'Lời giải chưa mở — quay lại link này sau để xem khi giáo viên mở lời giải.'}
          </p>
          {/* THÊM MỚI: khối Phần IV — điểm từng câu + ảnh đã GV khoanh bút đỏ
              (ưu tiên essayAnnotatedImages, không có thì hiện ảnh gốc
              essayImages). Chỉ hiện khi đề có Phần IV (hasEssay). */}
          {hasEssay && essayQuestionIds.length > 0 && (
            <div className="text-left mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Phần IV: Tự luận
              </h3>
              <div className="space-y-2">
                {essayQuestionIds.map((qid, i) => {
                  const urls = essayImagesMap[qid] || [];
                  const annotatedUrls = essayAnnotatedMap[qid] || [];
                  const qScore = essayScoresMap[qid];
                  const qGraded = qScore !== undefined;
                  return (
                    <div key={qid} className="border border-gray-200 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-700">Câu {i + 1}</span>
                        <span className="text-xs font-semibold text-gray-500">
                          {qGraded ? `${qScore}đ` : 'chưa chấm'}
                        </span>
                      </div>
                      {urls.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {urls.map((url, idx) => (
                            <img
                              key={url}
                              src={annotatedUrls[idx] || url}
                              alt={`Ảnh bài làm câu ${i + 1} - trang ${idx + 1}`}
                              className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                              loading="lazy"
                              decoding="async"
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Chưa nộp ảnh câu này.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {result.showSolution && result.solutionData && (
            <button
              onClick={() => setShowSolutionView(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white font-semibold py-2.5 rounded-lg transition inline-flex items-center justify-center gap-1.5"
            >
              Lời giải
            </button>
          )}
          {/* THÊM MỚI: "Làm lại" — chỉ hiện khi server xác nhận còn lượt tự
              làm lại (Exam.settings.maxAttempts chưa dùng hết/không giới
              hạn). Học sinh tự bấm được, không cần giáo viên cấp phép. */}
          {result.canRetake && (
            <button
              onClick={handleRetake}
              className={`w-full font-semibold py-2.5 rounded-lg transition ${
                result.showSolution && result.solutionData
                  ? 'mt-2 bg-white border border-blue-600 text-blue-600 hover:bg-blue-50'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              🔁 Làm lại
            </button>
          )}
        </div>
      </div>
    );
  }

  // THÊM MỚI: màn chờ khi lớp ở chế độ 'approval' — em vừa tự báo danh
  // xong nhưng chưa được giáo viên duyệt, /start sẽ từ chối cho tới lúc đó.
  // Có nút "Em đã được duyệt chưa?" để tự thử lại /start mà không cần tải
  // lại cả trang.
  if (phase === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
          <AppLogoIcon className="w-16 h-16 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Đang chờ giáo viên duyệt</h2>
          <p className="text-sm text-gray-500 mb-4">
            Em đã báo danh với tên "{selfRegisterName.trim()}". Giáo viên cần duyệt trước khi em bắt đầu
            làm bài được — nhờ giáo viên duyệt rồi bấm nút bên dưới.
          </p>
          {errorMsg && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}
          <button
            onClick={() => handleStart(selectedStudentId)}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white font-semibold py-2.5 rounded-lg transition"
          >
            Em đã được duyệt chưa?
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'taking' && session) {
    return (
      // Bọc thêm lớp NGOÀI "fixed inset-0 overflow-y-auto" — ĐỒNG BỘ với bản
      // xem trước mô phỏng cho GV (ExamBuilder.tsx, xem examMode === 'live').
      // Lý do: nếu chỉ có "min-h-screen ... p-4 sm:p-8" (không bọc fixed) như
      // TRƯỚC ĐÂY, một câu quá dài/rộng (bảng dài, hình TikZ to) có thể làm
      // TRÀN NGANG ra ngoài max-w-3xl của StudentTakeExam, kéo rộng luôn cả
      // <body>/<html> — trên điện thoại, khi layout viewport rộng hơn màn
      // hình thấy được, các phần tử `position: fixed` (mấu nút Nộp bài + tài
      // khoản + đồng hồ) bị neo theo mép của trang RỘNG đó chứ không phải mép
      // MÀN HÌNH thật, nên bị khuất mất, phải kéo trượt ngang sang phải mới
      // thấy lại nút. Bọc "fixed inset-0" (rộng đúng bằng khung nhìn, cố
      // định) + "overflow-y-auto" khiến phần tràn ngang chỉ cuộn NGANG BÊN
      // TRONG khung cố định này — <body> không bị kéo rộng ra nữa, nút luôn
      // đứng yên sát mép màn hình thật, giống hệt bản xem trước cho GV.
      <div className="fixed inset-0 overflow-y-auto bg-gray-50">
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
              setPhase('done');
            }}
          />
        </div>
      </div>
    );
  }

  // phase === 'pick' | 'starting'
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full">
        <AppLogoIcon className="w-16 h-16 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900 text-center mb-1">{room?.examTitle}</h2>
        <p className="text-sm text-gray-400 text-center mb-1">
          Lớp {room?.className} · {room?.duration} phút
        </p>
        {/* THÊM MỚI: hiện giờ mở/đóng thi tham khảo nếu GV đã cấu hình — chỉ
            để học sinh biết, không tự chặn ở đây (server quyết định thật). */}
        {(room?.openAt || room?.closeAt) && (
          <p className="text-xs text-amber-600 text-center mb-6">
            {room?.openAt && `Mở lúc ${new Date(room.openAt).toLocaleString('vi-VN')}`}
            {room?.openAt && room?.closeAt && ' · '}
            {room?.closeAt && `Đóng lúc ${new Date(room.closeAt).toLocaleString('vi-VN')}`}
          </p>
        )}
        {!(room?.openAt || room?.closeAt) && <div className="mb-6" />}

        {errorMsg && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {errorMsg}
          </div>
        )}

        {!showSelfRegister ? (
          <>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Em là ai?
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">-- Chọn tên mình --</option>
              {room?.students.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* THÊM MỚI (tự báo danh kiểu Azota): chỉ hiện khi GV đã bật
                selfRegisterMode khác 'off' cho lớp này — mặc định ẩn, giữ
                nguyên hành vi bảo mật cũ (chỉ tên có sẵn trong danh sách mới
                thi được). */}
            {room?.selfRegisterMode !== 'off' && (
              <button
                type="button"
                onClick={() => {
                  setShowSelfRegister(true);
                  setErrorMsg('');
                }}
                className="block w-full text-center text-xs text-blue-600 hover:text-blue-700 underline mb-4"
              >
                Không thấy tên mình? Bấm vào đây để nhập tên
              </button>
            )}
            {room?.selfRegisterMode === 'off' && <div className="mb-4" />}

            <button
              onClick={() => handleStart()}
              disabled={!selectedStudentId || phase === 'starting'}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition"
            >
              {phase === 'starting' ? 'Đang chuẩn bị...' : 'Bắt đầu làm bài'}
            </button>
            {(!room || room.students.length === 0) && (
              <p className="text-xs text-gray-400 text-center mt-3">Lớp này chưa có học sinh nào.</p>
            )}
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Nhập tên của em
            </label>
            <input
              autoFocus
              value={selfRegisterName}
              onChange={(e) => setSelfRegisterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSelfRegister();
              }}
              placeholder="VD: Nguyễn Văn A"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-400 mb-4">
              Ghi đúng họ tên như trong danh sách lớp giáo viên đọc điểm, tránh nhầm với bạn khác.
            </p>

            <button
              onClick={handleSelfRegister}
              disabled={!selfRegisterName.trim() || selfRegistering}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition mb-2"
            >
              {selfRegistering
                ? 'Đang gửi...'
                : room?.selfRegisterMode === 'approval'
                ? 'Vào lớp (chờ giáo viên duyệt)'
                : 'Vào lớp và làm bài'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSelfRegister(false);
                setErrorMsg('');
              }}
              disabled={selfRegistering}
              className="block w-full text-center text-xs text-gray-400 hover:text-gray-600"
            >
              ← Quay lại chọn tên trong danh sách
            </button>
          </>
        )}
      </div>
    </div>
  );
}
