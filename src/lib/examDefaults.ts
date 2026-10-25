// Cài đặt đề thi MẶC ĐỊNH cho đề/lượt giao MỚI (25-10): 90 phút, tối đa 3 lần
// làm bài, học sinh xem lời giải ngay sau khi nộp. GV vẫn tự đổi được trong
// tab Cài đặt của đề hoặc ở bảng "Giao đề" — các hằng số này CHỈ là giá trị
// điền sẵn lúc tạo mới, không ép gì lên đề đã có.
//
// Đặt chung 1 file để ExamBuilder / Khối / Lớp / Trang chủ không lệch nhau
// (trước đây mỗi nơi tự viết cứng 45 và 0).
export const DEFAULT_EXAM_DURATION_MINUTES = 90;
export const DEFAULT_EXAM_MAX_ATTEMPTS = 3; // 0 = không giới hạn
export const DEFAULT_EXAM_SHOW_SOLUTION = 'after_submit' as const;

// GIÁ TRỊ CŨ — dùng làm phương án dự phòng khi mở 1 đề ĐÃ LƯU từ trước mà
// thiếu field (đề tạo trước khi có field đó). Giữ đúng hành vi cũ của máy chủ
// (thiếu thời gian = 45 phút, thiếu số lần = không giới hạn), để việc đổi mặc
// định ở trên KHÔNG âm thầm đổi luật của đề cũ khi GV mở ra rồi lưu lại.
export const LEGACY_EXAM_DURATION_MINUTES = 45;
export const LEGACY_EXAM_MAX_ATTEMPTS = 0;
