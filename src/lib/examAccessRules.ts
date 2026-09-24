// examAccessRules.ts — logic DÙNG CHUNG cho các route công khai (/thi,
// /start, /submit) để tính "cài đặt áp dụng thực tế" (effective settings)
// cho 1 lượt thi, cùng các quy tắc phái sinh từ đó (còn được làm lại không /
// lời giải đã mở chưa / có đang trong khung giờ mở đề không). Tách riêng
// file này để các route không lặp lại (và lỡ lệch nhau) cách tính — đúng
// nguyên tắc đã áp dụng cho examModel.ts.
//
// QUYẾT ĐỊNH ĐÃ CHỐT VỚI GIÁO VIÊN (xem trao đổi trước khi code):
//  - MẶC ĐỊNH mọi cài đặt (duration, shuffle, maxAttempts, showSolution,
//    solutionOpenAt, openAt/closeAt...) nằm ở CẤP ĐỘ ĐỀ (Exam.settings), áp
//    dụng ĐỒNG NHẤT cho mọi lớp được giao đề này.
//  - GIÁO VIÊN CÓ THỂ tuỳ chỉnh RIÊNG cho 1 lớp cụ thể (ở panel "Giao đề"):
//    khi đó ExamAssignment.hasCustomSettings = true và ExamAssignment.settings
//    chứa các trường bị GHI ĐÈ (chỉ cần chứa trường nào GV thực sự đổi) — các
//    lớp KHÁC không hề bị ảnh hưởng, tiếp tục dùng đúng Exam.settings, kể cả
//    khi GV sửa Exam.settings SAU THỜI ĐIỂM đã tuỳ chỉnh cho lớp kia.
//  - resolveEffectiveSettings() dưới đây là nơi DUY NHẤT áp dụng đúng thứ tự
//    ưu tiên "riêng cho lớp > mặc định của đề" — mọi route đọc qua đây, không
//    tự suy luận riêng lẻ để khỏi lệch nhau.
//  - maxAttempts: 0 (hoặc không có) = KHÔNG GIỚI HẠN số lần tự làm lại. Học
//    sinh tự bấm "Làm lại" được, không cần giáo viên duyệt từng lần — nút
//    "Cho làm lại" hiện có ở tầng 3 vẫn giữ nguyên, dùng khi GV muốn CHO THÊM
//    lượt vượt quá maxAttempts đã cấu hình (trường hợp cá biệt).
//  - showSolution có 4 chế độ:
//      'after_submit' : hiện lời giải ngay sau khi nộp (hành vi cũ)
//      'never'        : không bao giờ hiện lời giải, chỉ báo điểm
//      'after_close'  : tự động mở lời giải khi "tất cả đã thi xong", tính =
//                       giờ đóng đề CÓ HIỆU LỰC của ĐÚNG lớp đang xét (đã
//                       gộp mặc định/riêng lớp) + settings.duration (phút
//                       làm bài). Nếu lớp đó KHÔNG có giờ đóng nào (cả mặc
//                       định lẫn riêng) thì không tính được mốc này — coi
//                       như CHƯA mở (khoá), không tự mở tuỳ tiện.
//      'custom_time'  : giáo viên tự đặt 1 mốc giờ cụ thể (settings.solutionOpenAt)
//                       để mở lời giải cho TẤT CẢ các lớp học đề này.
//  - openAt/closeAt = undefined/null → KHÔNG giới hạn giờ (mặc định).

export type ShowSolutionMode = 'after_submit' | 'never' | 'after_close' | 'custom_time';

export type ExamAccessSettings = {
  duration?: number;
  shuffle?: boolean;
  showSolution?: ShowSolutionMode;
  solutionOpenAt?: string | Date | null; // dùng khi showSolution = 'custom_time'
  maxAttempts?: number; // 0/undefined = không giới hạn
  // Giờ mở/đóng đề MẶC ĐỊNH áp dụng cho mọi lớp (cấu hình ở tab "Cài đặt"
  // của đề) — 1 lớp cụ thể có thể ghi đè riêng qua ExamAssignment.settings.
  openAt?: string | Date | null;
  closeAt?: string | Date | null;
  scoring?: Record<string, number>;
  // THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): % kích thước hình TikZ/ảnh
  // so với mặc định (100 = giữ nguyên) — cấu hình ở tab "Xem đề" của
  // ExamBuilder, lưu chung trong Exam.settings nên tự động trôi theo đúng
  // luồng resolveEffectiveSettings này, không cần code riêng.
  imageScalePercent?: number;
};

export type ExamAssignmentLike = {
  hasCustomSettings?: boolean;
  settings?: ExamAccessSettings | null;
  // Các field cũ (tương thích ngược, xem examAssignmentModel.ts)
  openAt?: string | Date | null;
  closeAt?: string | Date | null;
} | null | undefined;

// Gộp cài đặt CÓ HIỆU LỰC cho 1 lượt thi: bắt đầu từ cài đặt mặc định của đề
// (Exam.settings), rồi ghi đè bằng cài đặt riêng của lớp NẾU lớp đó đang bật
// hasCustomSettings. Đây là nơi DUY NHẤT các route nên gọi để lấy "cài đặt
// đang áp dụng" — không tự cộng dồn/suy luận riêng lẻ ở từng route.
export function resolveEffectiveSettings(
  examSettings: ExamAccessSettings | undefined | null,
  assignment: ExamAssignmentLike
): ExamAccessSettings {
  const base: ExamAccessSettings = { ...(examSettings || {}) };

  // (27-7) Đã GỠ tính năng +/- cỡ hình ở ExamBuilder.tsx -> LUÔN bỏ qua
  // imageScalePercent còn lưu sẵn trong DB (dù ở Exam.settings hay
  // ExamAssignment.settings riêng lớp) từ TRƯỚC khi gỡ UI, để "Trang học
  // sinh thật"/"Lời giải" không bao giờ lệch cỡ so với "Xem đề"/"Xem mô
  // phỏng" — cả 4 trang giờ luôn dùng đúng 1 mức mặc định duy nhất
  // (TIKZ_DISPLAY_BASE_SCALE, xem tikzScaleConstants.ts) thông qua fallback
  // `?? 100` ở nơi gọi renderExamText, không phụ thuộc dữ liệu cũ đã lưu.
  delete base.imageScalePercent;

  if (!assignment) return { ...base };

  if (assignment.hasCustomSettings === true) {
    const merged = { ...base, ...(assignment.settings || {}) };
    delete merged.imageScalePercent;
    return merged;
  }

  // Tương thích ngược: bản ghi ExamAssignment tạo ra TRƯỚC KHI có cơ chế
  // hasCustomSettings/settings (chỉ có 2 field openAt/closeAt top-level) —
  // hễ đã có giá trị ở 1 trong 2 field đó thì vẫn coi là "lớp này đã tuỳ
  // chỉnh giờ riêng" đúng như hành vi cũ, tránh vỡ dữ liệu đã lưu trước đó.
  if (assignment.hasCustomSettings === undefined && assignment.settings === undefined && (assignment.openAt || assignment.closeAt)) {
    return { ...base, openAt: assignment.openAt ?? null, closeAt: assignment.closeAt ?? null };
  }

  return { ...base };
}

// Còn được TỰ làm lại (không cần GV bấm "Cho làm lại") hay không, dựa trên
// attemptNumber của lượt "đã nộp" MỚI NHẤT.
export function canSelfRetake(settings: ExamAccessSettings | undefined | null, currentAttemptNumber: number): boolean {
  const max = Number(settings?.maxAttempts) || 0;
  if (max <= 0) return true; // 0 = không giới hạn
  return currentAttemptNumber < max;
}

// Lời giải đã tới lúc được xem CHƯA, tại thời điểm `now` — KHÔNG quan tâm
// việc học sinh vừa nộp hay quay lại xem sau, chỉ tính thuần theo mốc thời
// gian/quy tắc đã cấu hình.
//   assignmentCloseAt: giờ đóng đề CÓ HIỆU LỰC (đã gộp mặc định/riêng lớp,
//   lấy từ effectiveSettings.closeAt) của ĐÚNG lần giao đề (examId+classId)
//   đang xét — null nếu không có giờ đóng nào áp dụng.
export function isSolutionUnlocked(
  settings: ExamAccessSettings | undefined | null,
  opts: { assignmentCloseAt?: Date | string | null; now?: number } = {}
): boolean {
  const mode: ShowSolutionMode = settings?.showSolution || 'after_submit';
  const now = opts.now ?? Date.now();

  if (mode === 'never') return false;
  if (mode === 'after_submit') return true;

  if (mode === 'custom_time') {
    if (!settings?.solutionOpenAt) return false; // GV chưa đặt giờ -> coi như chưa mở
    const t = new Date(settings.solutionOpenAt).getTime();
    if (isNaN(t)) return false;
    return now >= t;
  }

  if (mode === 'after_close') {
    if (!opts.assignmentCloseAt) return false; // lớp này chưa có giờ đóng -> không tính được mốc, khoá
    const closeAtMs = new Date(opts.assignmentCloseAt).getTime();
    if (isNaN(closeAtMs)) return false;
    const durationMs = Math.max(1, Number(settings?.duration) || 45) * 60000;
    return now >= closeAtMs + durationMs;
  }

  return false;
}

// Chặn giờ mở/đóng thi (kiểu Azota), dựa trên cài đặt CÓ HIỆU LỰC (đã gộp
// mặc định đề + riêng lớp). Dùng cho CẢ 2 trường hợp "bắt đầu lần đầu" (status
// 'chưa thi') VÀ "tự xin làm lại" (status 'đã nộp' + retake) vì cả 2 đều là
// "bắt đầu 1 lượt làm MỚI", phải theo đúng khung giờ đề đang mở — khác với
// việc "mở lại link đang làm dở" (status 'đang thi') là KHÔNG bị chặn dù đã
// quá giờ đóng (giữ đúng quyết định đã chốt trước đây).
export function checkOpenCloseGate(effectiveSettings: ExamAccessSettings | undefined | null): string | null {
  const now = Date.now();
  const openAt = effectiveSettings?.openAt ? new Date(effectiveSettings.openAt).getTime() : null;
  const closeAt = effectiveSettings?.closeAt ? new Date(effectiveSettings.closeAt).getTime() : null;
  if (openAt && !isNaN(openAt) && now < openAt) {
    return `Chưa tới thời gian thi. Vui lòng quay lại vào lúc ${new Date(openAt).toLocaleString('vi-VN')}${
      closeAt ? ` — thời gian mở đề trong khoảng đến ${new Date(closeAt).toLocaleString('vi-VN')}` : ''
    }. Nếu quá thời gian mở đề, em sẽ không tham gia thi được nữa (tính là vào trễ thời gian mở đề).`;
  }
  if (closeAt && !isNaN(closeAt) && now > closeAt) {
    return 'Đã hết thời gian mở đề. Hãy liên hệ giáo viên bộ môn nhé.';
  }
  return null;
}
