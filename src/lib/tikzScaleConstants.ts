// NGUỒN DUY NHẤT cho hệ số phóng to mặc định áp dụng cho MỌI cách hiển thị
// hình vẽ TikZ trong toàn bộ app — dù là vẽ trực tiếp từ mã SVG sống (tab
// "Xem đề" trong ExamBuilder.tsx, và "Xem mô phỏng" qua StudentTakeExam)
// hay hiển thị bằng file ảnh đã tải lên host ngoài sau khi Xuất bản (trang
// học sinh làm bài thật và trang Lời giải, cả 2 đều qua renderExamText
// trong lib/examRender.tsx).
//
// TRƯỚC ĐÂY: mỗi nơi tự định nghĩa 1 con số riêng (130 ở ExamBuilder.tsx +
// TikzImage trong examRender.tsx cho nhánh vẽ SVG sống, còn 1.2 (=120%) ở
// TIKZ_URL_BASE_SCALE cho nhánh ảnh file) — khiến "Xem đề"/"Xem mô phỏng"
// và "Trang học sinh thật"/"Lời giải" hiển thị hình TikZ chênh nhau ~8%,
// và mỗi lần cần đổi hệ số phải nhớ sửa đủ cả 2-3 chỗ (dễ sửa sót 1 nơi).
//
// GIỜ: chỉ còn 1 hằng số DUY NHẤT ở đây — mọi nơi cần hệ số phóng to hình
// TikZ đều import từ file này. Muốn đổi cỡ hình mặc định cho CẢ 4 TRANG
// cùng lúc, chỉ cần sửa đúng 1 số bên dưới, không cần sửa gì thêm ở
// ExamBuilder.tsx hay examRender.tsx.
//
// Đơn vị: PHẦN TRĂM (130 = phóng to 130% so với kích thước gốc đo được).
// (27-7) Tăng từ 130 -> 140 theo yêu cầu GV (hình vẽ vẫn hơi nhỏ ở 130%).
// (29-7) Tăng tiếp từ 140 -> 150 theo yêu cầu GV (hình vẽ vẫn hơi nhỏ ở 140%).
export const TIKZ_DISPLAY_BASE_SCALE = 150;

