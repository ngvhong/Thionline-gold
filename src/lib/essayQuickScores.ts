// Các mức điểm bấm nhanh khi chấm 1 câu tự luận (không vượt quá điểm tối đa
// của câu; luôn có "điểm tối đa" ở cuối).
export function essayQuickValues(perQuestionMax: number): number[] {
  const max = Number.isFinite(perQuestionMax) && perQuestionMax > 0 ? perQuestionMax : 1;
  const base = [0, 0.25, 0.5, 0.75, 1].filter((v) => v <= max + 1e-9);
  if (!base.some((v) => Math.abs(v - max) < 1e-9)) base.push(Math.round(max * 100) / 100);
  return base;
}
