// scoreMode.ts — CÁCH TÍNH ĐIỂM khi 1 học sinh làm 1 đề NHIỀU lần.
//   'highest' (MẶC ĐỊNH, GV yêu cầu 6-11): lấy lần ĐÃ NỘP có điểm CAO NHẤT.
//   'latest'  : lấy đúng lần làm MỚI NHẤT (hành vi cũ), dù cao hay thấp hơn.
// Cấu hình ở Exam.settings.scoreMode (tab Cài đặt của đề). Đề cũ chưa có field
// này => dùng 'highest'. Dùng chung cho bảng điểm/xuất file, trang học sinh,
// thống kê đề — để mọi nơi cùng 1 con số, không lệch nhau.

export type ScoreMode = 'latest' | 'highest';
export const DEFAULT_SCORE_MODE: ScoreMode = 'highest';

export function resolveScoreMode(settings: { scoreMode?: string } | null | undefined): ScoreMode {
  return settings?.scoreMode === 'latest' ? 'latest' : 'highest';
}

function essaySumOf(a: any): number {
  if (!a?.essayGraded || !a?.essayScores) return 0;
  return Object.values(a.essayScores as Record<string, number>).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
}

// Điểm dùng để SO SÁNH giữa các lần: điểm Phần I-III + điểm Phần IV (tự luận)
// nếu GV đã chấm ĐỦ — khớp đúng con số hiển thị ở bảng điểm (formatScoreCell).
export function attemptPoints(a: any): number {
  const base = typeof a?.scorePoints === 'number' ? a.scorePoints : typeof a?.score === 'number' ? a.score : null;
  if (base === null) return -Infinity;
  return base + essaySumOf(a);
}

function newest(attempts: any[]): any {
  return attempts.reduce((best, cur) => (cur.attemptNumber > best.attemptNumber ? cur : best));
}

// Chọn 1 lần làm đại diện cho mỗi cặp (học sinh, đề) từ TOÀN BỘ các lần làm.
export function pickRepresentativeAttempt(attempts: any[], mode: ScoreMode): any {
  if (mode === 'latest') return newest(attempts);
  const submitted = attempts.filter((a) => a.status === 'đã nộp');
  // Chưa nộp lần nào: không có điểm để so, trả về lần mới nhất để hiện đúng trạng thái.
  if (submitted.length === 0) return newest(attempts);
  return submitted.reduce((best, cur) => {
    const b = attemptPoints(best);
    const c = attemptPoints(cur);
    if (c > b) return cur;
    // Bằng điểm -> ưu tiên lần MỚI NHẤT cho nhất quán.
    if (c === b && cur.attemptNumber > best.attemptNumber) return cur;
    return best;
  }, submitted[0]);
}
