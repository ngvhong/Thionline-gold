# ĐỌC FILE NÀY TRƯỚC KHI LÀM BẤT CỨ GÌ

1. Đọc `00-THINKING.md` — bối cảnh, lý do các quyết định thiết kế.
2. Đọc `01-KE-HOACH-CHI-TIET.md` — kế hoạch 5 giai đoạn (0→4). **Cả 5 giai đoạn (0, 1,
   2, 3, 4) đều đã code xong** (đánh dấu ✅ ở đầu mỗi giai đoạn, kèm ghi chú khác biệt
   so với dự kiến ban đầu nếu có). Kế hoạch 5 giai đoạn này coi như ĐÃ HOÀN TẤT — không
   còn giai đoạn nào tiếp theo trong tài liệu này.
3. Nếu được giao việc MỚI (không nằm trong 5 giai đoạn trên): đọc kỹ toàn bộ code hiện
   có trước, đặc biệt các quy ước đã hình thành xuyên suốt 5 giai đoạn (ghi trong mục
   "Quy tắc chung cho MỌI giai đoạn" ở đầu `01-KE-HOACH-CHI-TIET.md` và trong
   `00-THINKING.md`) — áp dụng lại đúng tinh thần đó (chỉ thêm, không sửa lan sang
   phạm vi khác; tách file/route mới thay vì nhét vào file cũ; ghi chú rõ TẠI SAO ở đầu
   mỗi file mới/sửa) dù không còn mục nào trong tài liệu để bám theo nữa.
4. Đây là **bản zip xuất ra tại 1 thời điểm**, có thể không phải bản mới nhất đang chạy
   trên server thật. Nếu repo thật quản lý bằng git, hãy **áp code trong zip này vào
   đúng nhánh hiện tại của repo thật**, không dùng zip này thay thế toàn bộ repo.
5. Trước khi làm bất cứ việc gì mới: chạy `npm install` rồi `npm run build` để xác nhận
   cả 5 giai đoạn không lỗi (máy tạo ra zip này không có mạng ra
   `fonts.googleapis.com` nên chỉ tự kiểm tra được bằng `npx tsc --noEmit` — pass ở mọi
   giai đoạn — chưa tự chạy được `npm run build` đầy đủ, xem ghi chú trong từng giai
   đoạn ở `01-KE-HOACH-CHI-TIET.md`).
