# Ghi chú cho AI/dev sau — Bảng LaTeX có bảng con lồng bên trong

> Đọc trước khi sửa bất cứ thứ gì liên quan tới bảng (`\begin{tabular}` / `\begin{array}` + `\hline`).

## Sự cố đã sửa (khiếu nại: bảng "Đà Lạt / Vũng Tàu" bị vỡ)
Nguồn: câu thống kê ghép nhóm trong `De-OT-CK1-K12-S1.tex` (tìm "độ ẩm không khí trung bình").
Bảng thứ 2 của câu đó có:
- hàng tiêu đề gộp `\multicolumn{3}{|c|}{Đà Lạt}` + `\multicolumn{3}{c|}{Vũng Tàu}`;
- ô "Giá trị đại diện" là **một `\begin{tabular}{c} Giá trị đại\\ diện \end{tabular}` lồng trong ô** của bảng lớn.

Triệu chứng: ô bị cắt đôi, chữ rác `diện \end{tabular}` (chữ đỏ, KaTeX báo lỗi) rơi ra thành ô riêng,
các hàng lệch cột.

## Nguyên nhân
`splitTopLevel()` chỉ đếm ngoặc nhọn `{ }` để biết đang ở "cấp ngoài cùng". Nhưng
`\begin{tabular}...\end{tabular}` KHÔNG dùng ngoặc nhọn bao nội dung, nên dấu `\\` và `&`
nằm BÊN TRONG bảng con bị coi là dấu xuống hàng / sang ô của bảng LỚN.

## Cách sửa (đã áp dụng ở 2 nơi, GIỮ ĐỒNG BỘ)
- `src/lib/textUtils.ts` — `splitTopLevel` + `parseLatexStatTable` (dùng cho trang học sinh
  `examRender.tsx` và xuất Word `examDocxExport.ts`).
- `src/app/ExamBuilder.tsx` — bản sao riêng của `splitTopLevel` + `parseLatexStatTable` (màn xem trước giáo viên).

3 thay đổi:
1. Thêm biến `envDepth` đếm độ sâu `\begin/\end{array|tabular|tabularx}` lồng nhau; chỉ tách khi
   `depth <= 0 && envDepth === 0`.
2. Không tách tại `\&` (dấu & thật trong ô) khi `delimiter === '&'`.
3. `parseLatexStatTable` tách ô bằng `splitTopLevel(row, '&')` thay cho `row.split('&')`
   (bản trong ExamBuilder.tsx trước đó còn dùng `row.split('&')`).

Phần dọn ô đã có từ trước và vẫn cần giữ: `cleanTableCell` → `stripNestedTableWrappers`
(bóc tabular lồng, gộp `\\` thành khoảng trắng); `parser.ts` → `isStatDataTableBody`
(giữ nguyên cú pháp tabular khi có `\multicolumn` có nội dung hoặc tabular lồng, không đổi sang KaTeX array).

## Quy tắc khi sửa lại vùng này
- `extractEnvBlocks` / `cleanTableCell` / `splitTopLevel` / `parseLatexStatTable` tồn tại ở **2 bản**
  (`textUtils.ts` và `ExamBuilder.tsx`). Sửa 1 nơi phải sửa nơi kia.
- Đừng đếm độ sâu bằng `{ }` thôi; bảng con LaTeX cần đếm cả môi trường.
- Đừng lọc bỏ ô rỗng (ô rỗng có ý nghĩa vị trí cột).
- Bảng biến thiên/xét dấu (`\multicolumn{n}{c}{}` đối số cuối rỗng) KHÔNG được chuyển sang nhánh bảng thống kê.

## Cách kiểm tra nhanh
Nhập `De-OT-CK1-K12-S1.tex`, mở câu độ ẩm Đà Lạt/Vũng Tàu. Kết quả đúng của bảng ghép nhóm:
- Hàng 1: `Đà Lạt` (gộp 3 cột) | `Vũng Tàu` (gộp 3 cột)
- Hàng 2: `Nhóm | Giá trị đại diện | Tần số` × 2
- 5 hàng dữ liệu, mỗi hàng đủ 6 ô.

## Việc còn tồn (CHƯA sửa, chỉ ghi nhận)
- Bảng "Độ ẩm" (bảng số liệu 12 tháng) không có ô dạng `[a;b)` nên `isDataRow` coi mọi hàng là tiêu đề
  (in đậm + nền xám cả bảng).
- Lỗi nội dung trong file `.tex` mẫu: "Tấn số" (đúng: Tần số); `81.6` (đúng: `81{,}6`);
  lời giải ghi `89{,}95^2` (đúng: `89{,}85`); lời giải/đáp án ghi "nhiệt độ" trong khi đề nói "độ ẩm".
