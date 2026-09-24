import mongoose from 'mongoose';
import { StudentModel } from './studentModel';
import { SubmissionModel } from './submissionModel';
import { Exam } from './examModel';
import { computePartScores, computeEssayMax, DEFAULT_SCORING, type PartScores } from './grading';

// THÊM MỚI (mục 4): gom dữ liệu bảng điểm kiểu Azota — 1 lớp có thể được
// giao NHIỀU đề khác nhau theo thời gian, GV muốn xem/tải về 1 bảng DUY
// NHẤT: hàng là học sinh, cột là từng đề, ô là điểm của em đó ở đề đó. Tách
// riêng hàm build dữ liệu (không phụ thuộc xlsx/docx) để dùng chung cho cả
// 2 định dạng xuất — chỉ phần "vẽ file" mới khác nhau (xem scoreExport.ts).

export type ScoreCell = {
  status: 'chưa thi' | 'đang thi' | 'đã nộp' | null; // null = chưa từng được giao đề này
  scorePoints: number | null; // điểm theo thang điểm (vd 7.75/10) — ưu tiên hiển thị cái này
  maxScorePoints: number | null;
  score: number | null; // số câu đúng (fallback nếu đề chưa có scorePoints)
  total: number | null;
  submittedAt: string | null; // ISO string, để cột "Ngày nộp" nếu cần
  // THÊM MỚI: tổng điểm TỪNG PHẦN (Phần I/II/III), chấm lại từ raw_data gốc
  // của đề + answers đã lưu — null nếu chưa nộp bài (không có answers để
  // chấm) hoặc đề không có raw_data. LƯU Ý: cột này chỉ có ý nghĩa khi GV
  // xuất RIÊNG 1 đề — xuất nhiều đề cùng lúc chỉ hiển thị tổng điểm
  // (scorePoints/score), không hiện chi tiết từng phần (xem scoreExport.ts).
  partScores: PartScores | null;
  // THÊM MỚI (chấm Phần IV theo từng câu): tổng điểm Phần IV đã GV chấm
  // (essaySum, null nếu chưa chấm câu nào) + điểm tối đa Phần IV
  // (essayMaxScore, snapshot lúc nộp — null nếu đề không có Phần IV/chưa
  // nộp) + essayGraded (true khi GV đã chấm ĐỦ mọi câu). formatScoreCell()
  // chỉ cộng essaySum vào tổng điểm hiển thị khi essayGraded === true —
  // tránh hiện điểm "hụt" lúc GV mới chấm được vài câu trong tổng số.
  essaySum: number | null;
  essayMaxScore: number | null;
  essayGraded: boolean;
};

export type ScoreTableExam = {
  examId: string;
  title: string;
};

export type ScoreTableStudent = {
  studentId: string;
  name: string;
  dob: string | null;
  gender: string | null;
  cells: Record<string, ScoreCell>; // key = examId
};

export type ScoreTableData = {
  className: string;
  schoolYear: string;
  exams: ScoreTableExam[];
  students: ScoreTableStudent[];
  generatedAt: string;
  // THÊM MỚI: cách tính điểm ĐÃ DÙNG để tạo bảng này — ghi lại vào file xuất
  // (xem scoreExport.ts) để GV mở lại file cũ vẫn biết đây là bảng tính theo
  // kiểu nào, không cần nhớ lúc bấm tải đã chọn gì.
  scoreMode: ScoreMode;
};

// THÊM MỚI (SỬA LỖI TỐC ĐỘ): trước đây menu "Chọn đề muốn xuất" gọi thẳng
// buildScoreTable() đầy đủ (bên dưới) chỉ để lấy VÀI CÁI TÊN đề — nhưng hàm
// đó lại kéo theo toàn bộ dữ liệu HỌC SINH + CHẤM LẠI ĐIỂM TỪNG PHẦN
// (computePartScores) cho MỌI submission đã nộp của CẢ LỚP, qua MỌI đề từng
// giao — với lớp đông học sinh + nhiều đề, việc này chậm rõ rệt dù người
// dùng chỉ đang mở menu để CHỌN đề, chưa cần tải gì cả. Tách riêng hàm này:
// chỉ query danh sách examId+title đã từng giao cho lớp (KHÔNG lấy học
// sinh, KHÔNG chấm điểm) — dùng cho format=list. Việc chấm điểm đầy đủ chỉ
// chạy trong buildScoreTable() bên dưới, đúng lúc GV thật sự bấm tải file.
export async function listAssignedExamOptions(classId: string): Promise<ScoreTableExam[]> {
  const studentIds = await StudentModel.find({ classId }, { _id: 1 }).lean();
  const ids = studentIds.map((s: any) => s._id);
  if (ids.length === 0) return [];

  // Chỉ cần danh sách examId DUY NHẤT đã từng có submission cho lớp này —
  // dùng distinct() thay vì aggregate group + tính điểm như buildScoreTable,
  // rẻ hơn nhiều lần cho việc này.
  const examIds: mongoose.Types.ObjectId[] = await SubmissionModel.distinct('examId', {
    studentId: { $in: ids },
  });
  if (examIds.length === 0) return [];

  const exams = await Exam.find({ _id: { $in: examIds } }, { title: 1 }).lean();
  return exams
    .map((e: any) => ({ examId: String(e._id), title: e.title || '(Đề không có tên)' }))
    .sort((a, b) => a.title.localeCompare(b.title, 'vi'));
}

// THÊM MỚI: cách chọn "điểm chính thức" khi 1 học sinh làm 1 đề NHIỀU lần
// (GV cho làm lại) —
//   'latest'  (mặc định, hành vi cũ) : lấy đúng lần làm MỚI NHẤT, dù điểm
//             cao hay thấp hơn các lần trước.
//   'highest' : trong các lần ĐÃ NỘP, lấy lần điểm CAO NHẤT (so theo
//             scorePoints, hoặc score nếu đề chưa có scorePoints). Nếu học
//             sinh CHƯA nộp lần nào (mọi attempt còn "chưa thi"/"đang thi")
//             thì vẫn lấy lần mới nhất để hiện đúng trạng thái hiện tại
//             (không có gì để so "cao nhất" khi chưa có điểm nào).
export type ScoreMode = 'latest' | 'highest';

// Chọn 1 attempt đại diện cho mỗi cặp (studentId, examId) từ TOÀN BỘ các lần
// làm, theo đúng `mode`. Tách riêng khỏi buildScoreTable() để dễ test/đọc.
function pickRepresentativeAttempt(attempts: any[], mode: ScoreMode): any {
  if (mode === 'latest') {
    return attempts.reduce((best, cur) => (cur.attemptNumber > best.attemptNumber ? cur : best));
  }
  // mode === 'highest'
  const submitted = attempts.filter((a) => a.status === 'đã nộp');
  if (submitted.length === 0) {
    // Chưa có lần nào nộp — không có điểm để so sánh, trả về lần mới nhất
    // (đang "chưa thi"/"đang thi") để bảng vẫn hiện đúng trạng thái thật.
    return attempts.reduce((best, cur) => (cur.attemptNumber > best.attemptNumber ? cur : best));
  }
  return submitted.reduce((best, cur) => {
    const bestPoints = typeof best.scorePoints === 'number' ? best.scorePoints : (best.score ?? -Infinity);
    const curPoints = typeof cur.scorePoints === 'number' ? cur.scorePoints : (cur.score ?? -Infinity);
    if (curPoints > bestPoints) return cur;
    // Bằng điểm nhau -> ưu tiên lần MỚI NHẤT (nhất quán, dễ đoán hơn là giữ
    // nguyên lần cũ tình cờ đến trước trong mảng).
    if (curPoints === bestPoints && cur.attemptNumber > best.attemptNumber) return cur;
    return best;
  }, submitted[0]);
}

// examIdsFilter: nếu truyền vào (không rỗng) thì CHỈ lấy các đề đó (GV chọn
// lọc bớt ở giao diện) — mặc định (undefined/rỗng) lấy TẤT CẢ đề đã từng
// giao cho lớp này, đúng yêu cầu "vì có nhiều đề".
// scoreMode: xem ScoreMode ở trên — mặc định 'latest' (hành vi cũ, không đổi
// với GV chưa từng chọn gì).
export async function buildScoreTable(
  classId: string,
  className: string,
  schoolYear: string,
  examIdsFilter?: string[],
  scoreMode: ScoreMode = 'latest'
): Promise<ScoreTableData> {
  const students = await StudentModel.find({ classId }).sort({ name: 1 }).lean();
  const studentIds = students.map((s: any) => s._id);

  if (studentIds.length === 0) {
    return { className, schoolYear, exams: [], students: [], generatedAt: new Date().toISOString(), scoreMode };
  }

  const matchStage: any = { studentId: { $in: studentIds } };
  if (examIdsFilter && examIdsFilter.length > 0) {
    matchStage.examId = {
      $in: examIdsFilter.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  // Lấy TOÀN BỘ các lần làm khớp bộ lọc (không chỉ mới nhất) rồi tự chọn 1
  // attempt đại diện cho mỗi cặp (studentId, examId) theo `scoreMode` ở JS —
  // cần đủ dữ liệu mọi attempt mới so được "điểm cao nhất" khi scoreMode =
  // 'highest' (aggregate $group $first cũ chỉ lấy được đúng 1 attempt ngay
  // từ DB nên không đủ để so sánh).
  const allSubmissions = await SubmissionModel.find(matchStage).lean();
  const byPair = new Map<string, any[]>();
  allSubmissions.forEach((s: any) => {
    const key = `${String(s.studentId)}|${String(s.examId)}`;
    const arr = byPair.get(key) || [];
    arr.push(s);
    byPair.set(key, arr);
  });
  const representativeSubmissions = Array.from(byPair.values()).map((attempts) =>
    pickRepresentativeAttempt(attempts, scoreMode)
  );

  const examIdSet = new Set<string>(representativeSubmissions.map((s: any) => String(s.examId)));
  const examIds = Array.from(examIdSet);

  // THÊM MỚI: lấy thêm raw_data + settings của đề (không chỉ title) — cần để
  // chấm lại điểm từng phần (Phần I/II/III) cho mỗi submission bên dưới.
  const exams = await Exam.find({ _id: { $in: examIds } }, { title: 1, raw_data: 1, settings: 1 }).lean();
  // Sắp đề theo tên (tự nhiên) để bảng điểm ổn định, dễ đối chiếu giữa các lần xuất.
  const examList: ScoreTableExam[] = exams
    .map((e: any) => ({ examId: String(e._id), title: e.title || '(Đề không có tên)' }))
    .sort((a, b) => a.title.localeCompare(b.title, 'vi'));

  // Tra nhanh raw_data/settings theo examId — dùng khi chấm lại điểm từng phần.
  const examRawDataMap = new Map<string, any>();
  exams.forEach((e: any) => examRawDataMap.set(String(e._id), e));

  // Tra nhanh submission theo "studentId|examId".
  const cellMap = new Map<string, any>();
  representativeSubmissions.forEach((s: any) => {
    cellMap.set(`${String(s.studentId)}|${String(s.examId)}`, s);
  });

  const studentRows: ScoreTableStudent[] = students.map((st: any) => {
    const cells: Record<string, ScoreCell> = {};
    examList.forEach((ex) => {
      const sub = cellMap.get(`${String(st._id)}|${ex.examId}`);
      // Chỉ chấm lại điểm từng phần khi đã nộp bài (có answers) VÀ đề còn
      // raw_data (đề có thể đã bị xóa raw_data hoặc không tìm thấy) — các
      // trường hợp khác (chưa thi/đang thi) không có gì để chấm lại.
      let partScores: PartScores | null = null;
      if (sub && sub.status === 'đã nộp' && sub.answers) {
        const examDoc = examRawDataMap.get(ex.examId);
        if (examDoc?.raw_data) {
          try {
            partScores = computePartScores(examDoc.raw_data, sub.answers, sub.scoringUsed || examDoc.settings?.scoring || DEFAULT_SCORING);
          } catch {
            // Đề lỗi cấu trúc (hiếm) — bỏ qua điểm từng phần, không làm hỏng cả bảng điểm.
            partScores = null;
          }
        }
      }
      // THÊM MỚI: Phần IV (Tự luận) — essaySum cộng dồn từ essayScores (GV đã
      // chấm), essayMaxScore ưu tiên snapshot lúc nộp (sub.essayMaxScore),
      // fallback tính lại bằng computeEssayMax() cho submission CŨ (trước khi
      // có tính năng này, chưa từng lưu essayMaxScore) — vẫn cần raw_data của
      // đề để tính, giống hệt cách partScores fallback ở trên.
      let essaySum: number | null = null;
      let essayMaxScore: number | null = null;
      const essayGraded = !!sub?.essayGraded;
      if (sub && sub.status === 'đã nộp') {
        const examDoc = examRawDataMap.get(ex.examId);
        if (sub.essayScores && Object.keys(sub.essayScores).length > 0) {
          essaySum = Object.values(sub.essayScores as Record<string, number>).reduce(
            (a: number, b: any) => a + (Number(b) || 0),
            0
          );
          essaySum = Math.round(essaySum * 100) / 100;
        }
        if (typeof sub.essayMaxScore === 'number') {
          essayMaxScore = sub.essayMaxScore;
        } else if (examDoc?.raw_data) {
          try {
            const computed = computeEssayMax(examDoc.raw_data, sub.scoringUsed || examDoc.settings?.scoring || DEFAULT_SCORING);
            essayMaxScore = computed > 0 ? computed : null;
          } catch {
            essayMaxScore = null;
          }
        }
      }
      cells[ex.examId] = sub
        ? {
            status: sub.status,
            scorePoints: sub.scorePoints ?? null,
            maxScorePoints: sub.maxScorePoints ?? null,
            score: sub.score ?? null,
            total: sub.total ?? null,
            submittedAt: sub.submitted_at ? new Date(sub.submitted_at).toISOString() : null,
            partScores,
            essaySum,
            essayMaxScore,
            essayGraded,
          }
        : {
            status: null,
            scorePoints: null,
            maxScorePoints: null,
            score: null,
            total: null,
            submittedAt: null,
            partScores: null,
            essaySum: null,
            essayMaxScore: null,
            essayGraded: false,
          };
    });
    return {
      studentId: String(st._id),
      name: st.name,
      dob: st.dob || null,
      gender: st.gender || null,
      cells,
    };
  });

  return {
    className,
    schoolYear,
    exams: examList,
    students: studentRows,
    generatedAt: new Date().toISOString(),
    scoreMode,
  };
}

// Định dạng 1 ô điểm thành chuỗi hiển thị ngắn gọn — dùng chung cho cả Excel
// và Word để 2 định dạng xuất luôn khớp nhau tuyệt đối.
export function formatScoreCell(cell: ScoreCell): string {
  if (!cell || cell.status === null) return '';
  if (cell.status !== 'đã nộp') return cell.status === 'đang thi' ? 'Đang thi' : 'Chưa thi';
  if (cell.scorePoints !== null && cell.maxScorePoints !== null) {
    // THÊM MỚI: cộng gộp Phần IV vào tổng khi GV đã chấm ĐỦ (essayGraded) —
    // chưa chấm xong thì vẫn chỉ hiện điểm Phần I-III như cũ (không hiện
    // điểm "hụt" thiếu Phần IV mà không rõ lý do).
    if (cell.essayGraded && cell.essaySum !== null && cell.essayMaxScore !== null) {
      return `${trimNum(cell.scorePoints + cell.essaySum)}/${trimNum(cell.maxScorePoints + cell.essayMaxScore)}`;
    }
    return `${trimNum(cell.scorePoints)}/${trimNum(cell.maxScorePoints)}`;
  }
  if (cell.score !== null && cell.total !== null) return `${cell.score}/${cell.total}`;
  return 'Đã nộp';
}

// Bỏ .0 thừa (vd "8" thay vì "8.0") nhưng giữ số lẻ thật (vd "7.75") — tách
// riêng để formatScoreCell và formatPartScore dùng chung, không lặp code.
function trimNum(n: number): number {
  return Number(n.toFixed(2));
}

// THÊM MỚI: định dạng điểm 1 PHẦN (Phần I/II/III) của 1 ô — dùng chung cho cả
// xuất Excel và Word (xem scoreExport.ts) để 2 định dạng luôn khớp nhau.
// part = null (chưa chấm được, ví dụ chưa nộp bài) → chuỗi rỗng.
// maxPoints = 0 (đề không có câu nào ở phần này) → chuỗi rỗng, không hiện "0/0".
export function formatPartScore(part: { points: number; maxPoints: number } | null | undefined): string {
  if (!part || !part.maxPoints) return '';
  return `${trimNum(part.points)}/${trimNum(part.maxPoints)}`;
}

// THÊM MỚI: định dạng điểm PHẦN IV (Tự luận) của 1 ô — dùng riêng (không dùng
// chung formatPartScore ở trên) vì cần phân biệt "chưa chấm xong" (GV chưa
// nhập đủ điểm mọi câu) với "đã chấm, được 0đ" — 2 trường hợp formatPartScore
// không phân biệt được (chỉ có points/maxPoints, không có cờ graded).
// maxPoints = null/0 (đề không có Phần IV) → chuỗi rỗng, giống formatPartScore.
export function formatEssayScore(cell: { essaySum: number | null; essayMaxScore: number | null; essayGraded: boolean } | null | undefined): string {
  if (!cell || !cell.essayMaxScore) return '';
  if (!cell.essayGraded) return 'Chưa chấm';
  return `${trimNum(cell.essaySum ?? 0)}/${trimNum(cell.essayMaxScore)}`;
}
