// SỬA: trước đây import từ './examRender' (file có 'use client') khiến API
// server (submit) lỗi "Attempted to call extractAnswerDigits() from the
// server but extractAnswerDigits is on the client" mỗi khi có câu Phần III.
// Import thẳng từ textUtils.ts (không có 'use client') để dùng được ở cả
// server lẫn client.
import { extractAnswerDigits } from './textUtils';

export type P1Answers = Record<string, number>; // questionId -> origIdx phương án đã chọn
export type P2Answers = Record<string, Record<number, boolean>>; // questionId -> { origIdx: đúng/sai học sinh chọn }
export type TextAnswers = Record<string, string>; // questionId -> chuỗi học sinh gõ (Phần III)

export type ExamAnswers = {
  p1Answers?: P1Answers;
  p2Answers?: P2Answers;
  textAnswers?: TextAnswers;
};

export type QuestionResult = {
  id: string;
  index: number;
  correct: boolean;
  attempted: boolean;
  // THÊM MỚI: điểm đạt được / điểm tối đa của RIÊNG câu này — dùng cho chấm
  // điểm theo thang điểm (không phải đếm số câu đúng nữa). Với Phần II (Đúng
  // Sai), "correct" ở trên vẫn giữ nghĩa cũ (đúng CẢ 4 ý), còn points có thể
  // > 0 dù correct=false (đúng 1-3 ý vẫn được điểm theo thang, xem
  // scoreP2Question bên dưới).
  points: number;
  maxPoints: number;
};

export type GradeResult = {
  correct: number;
  total: number;
  // THÊM MỚI: tổng điểm theo thang điểm giáo viên cấu hình (mặc định
  // 0.25/1/0.5 theo đúng barem đề thi THPT hiện hành) và điểm tối đa của cả
  // đề. correct/total (số câu) vẫn giữ nguyên phía trên để không phá các chỗ
  // đang dùng "x/y câu" (ví dụ modal xem chi tiết ở tab Quản lý lớp).
  scorePoints: number;
  maxScorePoints: number;
  details: {
    p1: QuestionResult[];
    p2: QuestionResult[];
    p3: QuestionResult[];
  };
};

// Cấu hình thang điểm — GV chỉnh trong tab Cài đặt (mục "4. Thang điểm"), lưu
// trong exam.settings.scoring. Mặc định đúng barem Toán THPT 2025: Phần I
// 0.25đ/câu, Phần II tối đa 1đ/câu (chia bậc theo số ý đúng), Phần III
// 0.5đ/câu.
export type ScoringSettings = {
  p1PerQuestion: number;
  p2FullPoints: number;
  p3PerQuestion: number;
  // THÊM MỚI (chấm Phần IV theo từng câu): Phần IV không tự chấm được (GV
  // chấm tay từng câu sau khi xem ảnh) — điểm tối đa MỖI CÂU lấy từ đây, để
  // tính essayMaxScore (tổng điểm tối đa cả Phần IV) ngay lúc học sinh nộp
  // bài, y hệt cách p1/p2/p3PerQuestion đang dùng cho các phần tự động chấm.
  p4PerQuestion: number;
};

export const DEFAULT_SCORING: ScoringSettings = {
  p1PerQuestion: 0.25,
  p2FullPoints: 1,
  p3PerQuestion: 0.5,
  p4PerQuestion: 0.5,
};

// THÊM MỚI: tổng điểm tối đa Phần IV (Tự luận) của 1 đề — chỉ là
// (số câu) × (điểm/câu), không chấm được tự động nên không nằm trong
// gradeExam() ở trên. Dùng lúc nộp bài (snapshot essayMaxScore) và ở modal
// chấm bài của GV.
export function computeEssayMax(examData: any, scoring: ScoringSettings = DEFAULT_SCORING): number {
  const p4Points = Number.isFinite(scoring?.p4PerQuestion) ? scoring.p4PerQuestion : DEFAULT_SCORING.p4PerQuestion;
  const count = (examData?.phan_4_TuLuan || []).length;
  return round2(count * p4Points);
}

// Làm tròn về 2 chữ số thập phân để tránh lỗi số thực kiểu 0.1+0.25=0.35000000000000003.
// Export để scoreTable.ts dùng chung khi cộng dồn điểm từng phần (tránh lệch
// làm tròn nếu mỗi nơi tự viết 1 hàm round2 riêng).
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Barem chấm Phần II (Đúng/Sai) theo ĐÚNG quy chế thi THPT hiện hành — áp
// dụng cho câu có ĐÚNG 4 ý (chuẩn đề thi thật): đúng 1 ý = 10% điểm câu, đúng
// 2 ý = 25%, đúng 3 ý = 50%, đúng cả 4 ý = 100%. Nếu đề soạn câu Phần II có
// số ý KHÁC 4 (ví dụ GV tự soạn 2 hoặc 3 ý), không áp bậc cố định trên nữa vì
// nó chỉ đúng cho đúng 4 ý — thay vào đó chia đều theo tỉ lệ số ý đúng / tổng
// số ý, để câu vẫn có điểm hợp lý thay vì báo lỗi hoặc chấm 0.
export function scoreP2Question(correctCount: number, optionCount: number, fullPoints: number): number {
  if (optionCount === 4) {
    const tiers = [0, 0.1, 0.25, 0.5, 1];
    return round2((tiers[correctCount] ?? 0) * fullPoints);
  }
  if (optionCount <= 0) return 0;
  return round2((correctCount / optionCount) * fullPoints);
}

// Chấm điểm 1 lượt làm bài dựa trên raw_data GỐC (chưa trộn) của đề — cả
// client (xem trước điểm ngay lúc nộp) và server (API submit, kết quả CHÍNH
// THỨC lưu vào DB) đều gọi đúng hàm này để không bao giờ lệch nhau.
//
// QUY ƯỚC origIdx: dù giao diện có trộn thứ tự câu/phương án để hiển thị,
// đáp án học sinh gửi lên LUÔN dùng chỉ số phương án trong mảng GỐC (trước
// khi trộn) — xem StudentTakeExam.tsx (trang /thi) gắn origIdx lúc trộn.
// Nhờ vậy hàm chấm này không cần biết gì về việc có trộn hay không.
export function gradeExam(
  examData: any,
  answers: ExamAnswers,
  scoring: ScoringSettings = DEFAULT_SCORING
): GradeResult {
  const p1Answers = answers.p1Answers || {};
  const p2Answers = answers.p2Answers || {};
  const textAnswers = answers.textAnswers || {};

  let correct = 0;
  let total = 0;
  let scorePoints = 0;
  let maxScorePoints = 0;

  const p1Points = Number.isFinite(scoring?.p1PerQuestion) ? scoring.p1PerQuestion : DEFAULT_SCORING.p1PerQuestion;
  const p2Full = Number.isFinite(scoring?.p2FullPoints) ? scoring.p2FullPoints : DEFAULT_SCORING.p2FullPoints;
  const p3Points = Number.isFinite(scoring?.p3PerQuestion) ? scoring.p3PerQuestion : DEFAULT_SCORING.p3PerQuestion;

  const p1Details: QuestionResult[] = [];
  (examData?.phan_1_TracNghiem || []).forEach((q: any, i: number) => {
    total += 1;
    maxScorePoints = round2(maxScorePoints + p1Points);
    const picked = p1Answers[q.id];
    const isCorrect = picked !== undefined && !!q.options?.[picked]?.isCorrect;
    if (isCorrect) correct += 1;
    const points = isCorrect ? p1Points : 0;
    scorePoints = round2(scorePoints + points);
    p1Details.push({ id: q.id, index: i, correct: isCorrect, attempted: picked !== undefined, points, maxPoints: p1Points });
  });

  const p2Details: QuestionResult[] = [];
  (examData?.phan_2_DungSai || []).forEach((q: any, i: number) => {
    total += 1;
    maxScorePoints = round2(maxScorePoints + p2Full);
    const picks = p2Answers[q.id] || {};
    const attempted = Object.keys(picks).length > 0;
    const options = q.options || [];
    const correctCount = options.filter((opt: any, idx: number) => (picks[idx] ?? null) === opt.isCorrect).length;
    const allMatch = correctCount === options.length && options.length > 0;
    if (allMatch) correct += 1;
    const points = scoreP2Question(correctCount, options.length, p2Full);
    scorePoints = round2(scorePoints + points);
    p2Details.push({ id: q.id, index: i, correct: allMatch, attempted, points, maxPoints: p2Full });
  });

  const p3Details: QuestionResult[] = [];
  (examData?.phan_3_TraLoiNgan || []).forEach((q: any, i: number) => {
    total += 1;
    maxScorePoints = round2(maxScorePoints + p3Points);
    const given = (textAnswers[q.id] || '').replace(/\s+/g, '').toLowerCase();
    const expected = extractAnswerDigits(q.answer || '').replace(/\s+/g, '').toLowerCase();
    const isCorrect = !!given && !!expected && given === expected;
    if (isCorrect) correct += 1;
    const points = isCorrect ? p3Points : 0;
    scorePoints = round2(scorePoints + points);
    p3Details.push({ id: q.id, index: i, correct: isCorrect, attempted: !!given, points, maxPoints: p3Points });
  });

  return {
    correct,
    total,
    scorePoints,
    maxScorePoints,
    details: { p1: p1Details, p2: p2Details, p3: p3Details },
  };
}

// THÊM MỚI: tổng điểm TỪNG PHẦN (Phần I/II/III) — dùng cho bảng điểm khi GV
// xuất RIÊNG 1 đề (xem scoreTable.ts). Chỉ cần tổng điểm mỗi phần, KHÔNG cần
// chi tiết từng câu (đã có sẵn trong gradeExam().details nếu sau này cần),
// nên tách hàm riêng, nhẹ hơn, gọi lại đúng logic chấm của gradeExam() để
// không bao giờ lệch với điểm chính thức đã lưu.
export type PartScore = { points: number; maxPoints: number };
export type PartScores = { p1: PartScore; p2: PartScore; p3: PartScore };

function sumPart(details: QuestionResult[]): PartScore {
  return details.reduce(
    (acc, q) => ({ points: round2(acc.points + q.points), maxPoints: round2(acc.maxPoints + q.maxPoints) }),
    { points: 0, maxPoints: 0 }
  );
}

export function computePartScores(
  examData: any,
  answers: ExamAnswers,
  scoring: ScoringSettings = DEFAULT_SCORING
): PartScores {
  const { details } = gradeExam(examData, answers, scoring);
  return {
    p1: sumPart(details.p1),
    p2: sumPart(details.p2),
    p3: sumPart(details.p3),
  };
}
