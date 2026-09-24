# Bàn giao — Phần 2B (render + xuất Word cho mốc [[HANG_HINH_ROW]])

> Việc CHÍNH, làm sau khi Phần 2A xong (xem `HANDOFF-PHAN2A.md`). Ước lượng
> ~30-50 dòng, chủ yếu ở `examRender.tsx`.

## Bối cảnh (input của phần này)
Sau Phần 1 + Phần 2A, `parser.ts` xuất ra mốc trung gian cho mỗi hàng bảng
layout ảnh/tikz thuần (áp dụng cho cả `array`, `tabular`, `tabularx`,
`longtable`):
```
[[HANG_HINH_ROW]]cell1|||cell2|||...[[/HANG_HINH_ROW]]
```
Mỗi `cellN` bên trong là một mốc ảnh/tikz đã có sẵn từ trước, dạng
`[[HÌNH_FILE_n]]` hoặc `[[HÌNH_TIKZ_n]]`. Phần 2B là vẽ mốc `HANG_HINH_ROW`
này ra giao diện (và xử lý khi xuất Word) — KHÔNG cần đụng lại `parser.ts`.

## 1. Cập nhật `src/lib/examRender.tsx`
Hiện file này (hàm quanh dòng ~862, xem comment "Thay [[HÌNH_TIKZ_n]] bằng
SVG...") chỉ tách text theo regex:
```js
const parts = text.split(/(\[\[HÌNH_TIKZ_\d+\]\]|\[\[HÌNH_FILE_\d+\]\])/g);
```
Cần thêm một lớp xử lý TRƯỚC bước này: tách text theo cặp mốc
`[[HANG_HINH_ROW]]...[[/HANG_HINH_ROW]]` (dùng regex non-greedy
`/\[\[HANG_HINH_ROW\]\]([\s\S]*?)\[\[\/HANG_HINH_ROW\]\]/g`), với mỗi khối
match được:
1. Tách nội dung bên trong theo `|||` thành mảng ô.
2. Với MỖI ô, tái sử dụng logic render ảnh/tikz đã có sẵn (đoạn code xử lý
   `[[HÌNH_TIKZ_n]]` / `[[HÌNH_FILE_n]]` ở dòng ~862-912) để ra `<img>` hoặc
   SVG tikz tương ứng — KHÔNG viết lại logic render ảnh/tikz từ đầu, chỉ gọi
   lại hàm/đoạn code đã có.
3. Bọc các ô đã render trong MỘT hàng.

### Responsive — ĐIỆN THOẠI phải xếp TRÊN/DƯỚI (yêu cầu của người dùng)
Container bọc hàng ảnh/tikz PHẢI dùng class kiểu Tailwind:
```
className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full"
```
- Mặc định (`flex-col`, tức màn hình nhỏ / điện thoại): các ô xếp CHỒNG
  TRÊN-DƯỚI theo chiều dọc — đây là điều người dùng yêu cầu, KHÔNG được để
  2 hình nằm cạnh nhau bị bóp nhỏ trên điện thoại.
- Từ breakpoint `sm:` trở lên (tablet/desktop): mới xếp `flex-row` NGANG
  cạnh nhau đúng như ý đồ gốc của bảng LaTeX (`{cc}` = 2 cột).
- Mỗi ô nên có `className="flex-1 flex justify-center min-w-0"` để ảnh/svg
  bên trong tự co giãn đúng, không tràn khung trên màn hình hẹp.
- Nhớ test lại với DevTools chế độ mobile (hoặc điện thoại thật) sau khi
  sửa.

## 2. Kiểm tra `src/lib/examDocxExport.ts` (nhỏ, tùy chọn)
`PLACEHOLDER_RE` hiện tại (dòng ~98) chỉ khớp `[[HÌNH_TIKZ_n]]` /
`[[HÌNH_FILE_n]]` ĐƠN LẺ, chưa biết gì về mốc
`[[HANG_HINH_ROW]]...[[/HANG_HINH_ROW]]` mới. Khi xuất file Word, nếu không
xử lý mốc bọc ngoài này, văn bản `[[HANG_HINH_ROW]]` và `[[/HANG_HINH_ROW]]`
thô sẽ bị in ra trong file .docx cùng với ảnh. Cần:
- Thêm bước tiền xử lý: gặp `[[HANG_HINH_ROW]]...[[/HANG_HINH_ROW]]`, bóc bỏ
  2 mốc bọc ngoài (giữ nguyên các mốc `HÌNH_FILE`/`HÌNH_TIKZ` bên trong, nối
  bằng tab hoặc bảng Word 1 hàng nhiều cột để giữ ý đồ "ảnh cạnh ảnh" khi in
  ra Word).
- Nếu chưa cần xuất Word gấp thì có thể để sau, không chặn phần render web
  ở mục 1.

## 3. Build & test lại (làm sau cùng, sau khi cả 2A + 2B xong)
- Chạy `npm run build` trong project đầy đủ (không phải zip rời) để bắt lỗi
  type/build thật (zip bàn giao chỉ chứa `src/`, thiếu
  `package.json`/`node_modules`).
- Test lại chính xác câu hỏi trong ảnh chụp màn hình gốc (câu 5, ảnh nhà gỗ
  + hình tikz góc α) — kỳ vọng: không còn rác `\\`, `&`; 2 hình nằm cạnh
  nhau trên desktop, xếp trên-dưới trên điện thoại.
- Test thêm 1 trường hợp bảng `tabularx`/`longtable` có ảnh/tikz (từ Phần
  2A) để chắc toàn bộ chuỗi parser → render hoạt động đúng.
