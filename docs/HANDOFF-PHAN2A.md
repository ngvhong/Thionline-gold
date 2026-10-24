# Bàn giao — Phần 2A (mở rộng parser.ts: tabularx + longtable)

> ĐÃ HOÀN THÀNH. Việc NHỎ, làm trước. Không đụng tới `examRender.tsx` /
> `examDocxExport.ts` (2 file đó nằm ở `HANDOFF-PHAN2B.md`).

## Đã làm xong (Phần 2A)
- `transformArrayTabularEnv` nhận thêm tham số thứ 3 `hasWidthArg` (mặc
  định `false`); khi `true` sẽ bỏ qua tham số `{width}` đầu tiên (đếm độ
  sâu ngoặc, an toàn với `\textwidth`/`0.9\linewidth`...) trước khi đọc
  `{colspec}` như bình thường.
- Đã gọi thêm 2 dòng:
  `transformArrayTabularEnv(result, 'tabularx', true)` và
  `transformArrayTabularEnv(result, 'longtable')` ngay sau 2 dòng
  `array`/`tabular` cũ.
- `stripPlaceholdersAndTableStructure()` đã thêm `\endfirsthead`,
  `\endhead`, `\endfoot`, `\endlastfoot`, `\caption{...}` vào danh sách
  ký tự cấu trúc bảng thuần (cho `longtable`).

## BUG PHẦN 1 phát hiện thêm khi làm 2A (đã sửa luôn)
Khi bảng layout ảnh có **nhiều hàng** và một mốc `[[HÌNH_FILE_n]]` /
`[[HÌNH_TIKZ_n]]` đứng NGAY SAU `\\` mà không có khoảng trắng (ví dụ
`...\\[[HÌNH_FILE_4]]...`), quy tắc tách hàng cũ
(`/\\\\(?:\s*\[[^\]]*\])?/`) hiểu nhầm đó là cú pháp khoảng cách dòng
`\\[10pt]` — vì cả hai đều bắt đầu bằng `[` ngay sau `\\`. Nó khớp tham
lam vào `[[HÌNH_FILE_4]` (dừng ở dấu `]` ĐẦU TIÊN bên trong mốc), làm mất
1 dấu `]` và có thể làm sai số hàng tách ra.

Đã sửa bằng cách thêm `(?!\[)` ngay sau `\[` mở đầu trong cả 2 chỗ dùng
regex này (`stripPlaceholdersAndTableStructure` và
`wrapTableAsImageLayoutRows`): nếu ký tự theo sau `\[` lại là `[` (tức
đang đứng trước mốc `[[HÌNH_...]]`) thì KHÔNG coi đó là đặc tả khoảng
cách dòng nữa — chỉ tách theo `\\` trần, giữ nguyên mốc placeholder.

Đã kiểm chứng bằng `test-phan2a.js` (5/5 pass), gồm cả case cụ thể này.

## Bối cảnh (đã xong, không cần làm lại)
File `src/app/parser.ts`, hàm `cleanTextFormatting`, khối xử lý
`\begin{array}` / `\begin{tabular}` đã có sẵn:

- `stripPlaceholdersAndTableStructure()` + `isPureImageLayoutBody()`:
  phát hiện bảng mà nội dung ô **chỉ gồm** mốc `[[HÌNH_FILE_n]]` /
  `[[HÌNH_TIKZ_n]]` và ký tự cấu trúc bảng thuần (`&`, `\\`, `\\[10pt]`,
  `\hline`, `\noalign{...}`, comment `%...`, khoảng trắng) — tức bảng chỉ
  dùng để DÀN LAYOUT ảnh cạnh nhau, không phải bảng toán/dữ liệu thật.
- `wrapTableAsImageLayoutRows()`: khi đúng trường hợp trên, xuất mốc trung
  gian cho MỖI HÀNG thay vì bọc `$$\begin{array}...\end{array}$$`:
  ```
  [[HANG_HINH_ROW]]cell1|||cell2|||...[[/HANG_HINH_ROW]]
  ```
- Trong vòng lặp quét bảng (`transformArrayTabularEnv`), đã rẽ nhánh:
  `isPureImageLayoutBody(body) ? wrapTableAsImageLayoutRows(body) : wrapTableAsDisplayMath(colSpec, body)`.
- Phạm vi hiện tại CHỈ áp dụng cho `array` và `tabular` (2 tên môi trường mà
  `transformArrayTabularEnv` đang hỗ trợ).

## Việc cần làm ở Phần 2A

`transformArrayTabularEnv(text, envName)` hiện chỉ nhận `'array' | 'tabular'`
và giả định cú pháp `\begin{env}{colspec}` (đúng 1 tham số `{...}` ngay sau
`\begin{env}`). Cần bổ sung:

1. **`tabularx`**: cú pháp là `\begin{tabularx}{width}{colspec}` — CÓ 2
   THAM SỐ `{}` liên tiếp (tham số đầu là bề rộng bảng, ví dụ `{\textwidth}`),
   khác với `tabular`/`array` chỉ có 1 tham số. Cần viết nhánh riêng (hoặc
   thêm cờ `hasWidthArg: boolean` cho hàm `transformArrayTabularEnv`) để BỎ
   QUA tham số `{width}` đầu tiên rồi mới đọc `{colspec}` như bình thường.
2. **`longtable`**: cú pháp giống `tabular` (chỉ 1 tham số `{colspec}`),
   NHƯNG nội dung bên trong có thể có thêm các lệnh riêng của gói
   `longtable`: `\endhead`, `\endfirsthead`, `\endfoot`, `\endlastfoot`,
   `\caption{...}`. Cần thêm các lệnh này vào danh sách "ký tự cấu trúc bảng
   thuần" trong `stripPlaceholdersAndTableStructure()` (tương tự `\hline`,
   `\noalign{...}` đã có) để không làm hỏng việc phát hiện
   `isPureImageLayoutBody` khi bảng layout ảnh lỡ dùng `longtable`.
3. Gọi thêm `result = transformArrayTabularEnv(result, 'tabularx', true);`
   và `result = transformArrayTabularEnv(result, 'longtable');` sau 2 dòng
   hiện có (dòng ~334-335), TRƯỚC khi các bước xử lý `\heva`/`\hoac` phía
   dưới chạy (thứ tự vẫn phải giữ đúng như 2 dòng cũ).

## Test khi xong Phần 2A
- Mốc `[[HANG_HINH_ROW]]...[[/HANG_HINH_ROW]]` phải xuất ra đúng y hệt cho
  bảng `tabularx{\textwidth}{cc}` và `longtable{cc}` chứa 2 mốc ảnh/tikz,
  giống kết quả đã kiểm chứng với `tabular{cc}` ở Phần 1.
- Chưa cần đụng tới `examRender.tsx`/`examDocxExport.ts` — việc đó ở
  `HANDOFF-PHAN2B.md`.
