## v28
- ExamBuilder.tsx (tab "Tải file"): bỏ nút "Tải zip mẫu"; khối "Lần đầu dùng?" thiết kế lại cùng phong cách các khối còn lại (nền trắng, viền xám, nút xanh dương).
- Đề mẫu mới lấy từ đề ôn tập chương 1 lớp 12: 6 trắc nghiệm (2 câu có bảng biến thiên bằng mã tikz gốc, 2 câu có đồ thị), 2 đúng/sai, 2 trả lời ngắn, 1 tự luận. Đồ thị vẽ bằng canvas, bảng biến thiên biên dịch bằng tikz (cần máy chủ biên dịch tikz hoạt động).

# Bản sửa 4/11/2026 (trên nền thionline-gold-v24-full)
1. Gộp bản vá v27-fix2: parser.ts, ExamBuilder.tsx, ClassDetailPanel.tsx, examRender.tsx, tikzCrop.ts, api/submissions/route.ts
   (sửa hình TikZ bị lẹm, nút "Chấm em tiếp theo", gỡ { } thừa quanh hình).
   LƯU Ý: ExamBuilder.tsx của bản vá v27 gọi nút/cửa sổ "Thống kê ôn luyện" (PracticeStatsModal) không có trong v24,
   nên đã GỠ phần đó, chỉ giữ các sửa hình TikZ. Nếu dự án thật của bạn là v27 (đã có PracticeStatsModal) thì
   dùng ExamBuilder.tsx từ gói v27 thay cho tệp này.
2. parser.ts: {\it(...)} và {\bf(...)} nay được nhận dạng.
3. src/app/thi/[examId]/SolutionView.tsx: câu bỏ trống không còn hiện "(em chọn)" ở mọi đáp án
   (thiếu _origIdx và bỏ trống làm undefined === undefined; nay kiểm tra có chọn thật, thiếu _origIdx thì dùng vị trí đáp án).
Đã kiểm tra: npm ci, tsc --noEmit (không lỗi), next build (thành công; cần MONGODB_URI; trong môi trường thử phải bỏ next/font Google
vì không có mạng, tệp layout.tsx trong gói giữ nguyên), thử riêng parser và SolutionView.

## v30 (gồm v29)
- ExamBuilder.tsx: đề mẫu ("Dùng đề mẫu ngay") viết lại theo đúng cấu trúc tệp .tex (\begin{ex}, \choice, \choiceTF + itemchoice, \shortans, \begin{bt}, xuống dòng bằng \\). Lời giải đúng/sai là văn bản thường, không còn nhãn "Đúng:/Sai:".
- student/PracticeRunner.tsx (Ôn luyện): nút Kiểm tra đổi thành icon ✓ (nút to); ổ khóa xem lời giải chuyển xuống cạnh icon ✓ (bên phải); thêm dòng gợi ý nhỏ, nghiêng, xám có dấu × (bấm × ẩn vĩnh viễn, lưu localStorage nên lần sau mở app không hiện lại).

## v31
- Admin > Kho đề chung: thêm nút "Tạo nhanh cây Toán KNTT" (LibraryAdminSection.tsx) -> gọi POST /api/admin/library/folders/seed-kntt.
  Tạo 129 thư mục: Chủ đề lớp 10/11/12 > Chương > Bài + "Ôn tập chương ..." theo SGK Toán Kết nối tri thức. Chạy lại không nhân đôi (bỏ qua nhánh đã có).
- Dữ liệu chương/bài nằm ở src/data/knttToanTree.ts (sửa tên tại đó nếu cần).

## v33 (gồm v32)
- Cây thư mục Toán KNTT nay TỰ TẠO khi mở Kho đề chung / Ôn luyện / Admin (không cần bấm nút). Chỉ chạy 1 lần cho mỗi phiên bản cây (đánh dấu trong DB, collection librarysedmetas), nên xoá nhánh thì không bị tự tạo lại.
- Mỗi Chủ đề lớp 10/11/12 có thêm 4 nhánh: GK1, CK1, GK2, CK2 (đúng tên thì giữ nguyên nhánh GK1/CK1 đã có, chỉ thêm GK2, CK2).
- Nút "Tạo nhanh cây Toán KNTT" vẫn giữ nguyên. Logic dùng chung ở src/lib/seedKnttTree.ts; danh sách GK1/CK1/GK2/CK2 ở KNTT_EXAM_FOLDERS (src/data/knttToanTree.ts).
- Tab Thi thử (student/LibraryPracticeTab.tsx): chỉ hiện Chủ đề lớp 10/11/12 > GK1, CK1, GK2, CK2. Tab Ôn luyện vẫn hiện đủ Chương/Bài.
- ExamBuilder.tsx: sửa lỗi đè đề. Đang mở đề 1 rồi tải/dán đề 2 thì bấm Lưu không còn ghi đè lên đề 1 nữa (tải/dán = đề mới, bỏ liên kết đề cũ, cài đặt về mặc định). Mở đề đã lưu vẫn sửa đúng đề đó.
- ExamBuilder.tsx: tải file / dán nội dung / dùng đề mẫu khi đang mở 1 đề đã lưu sẽ hỏi xác nhận (phần chưa lưu của đề đang mở sẽ mất, đề đã lưu vẫn nguyên).
