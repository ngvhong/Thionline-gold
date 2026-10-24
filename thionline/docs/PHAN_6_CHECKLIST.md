# Phần 6 — Checklist Test & Rollout tính năng "Kiểm tra ID"

Làm theo đúng thứ tự. Đây là thao tác **trên môi trường thật** (đã deploy code
Phần 1-5), cần đăng nhập admin + có ít nhất 1 API key Gemini còn quota.

---

## Bước 0 — Trước khi bắt đầu

- [ ] Deploy code (Phần 1-5) lên môi trường test/staging trước, KHÔNG deploy
      thẳng lên production nếu có staging riêng.
- [ ] Mở trang **"② Gắn ID"**, xác nhận card mới **"4. Kiểm tra ID đã gắn"**
      hiện ra, đọc số liệu ban đầu:
      - Nếu đây là lần đầu chạy tính năng này → **"Chưa kiểm tra"** phải
        đúng bằng toàn bộ số câu `status: 'done'` hiện có (đúng như migrate
        tự động ở Phần 1 — mọi câu cũ đều là `unverified`).
      - "Đúng" và "Sai" phải đều = 0.

---

## Bước 1 — Test trên 1 file nhỏ (`passed_choiceTF`)

Chưa bấm "Kiểm tra ID" cho cả 4 file — cần cô lập test trên 1 file trước,
nhưng route hiện tại tự chọn file kế tiếp theo `GAN_ID_FILE_ORDER`
(`passed_choice → passed_choiceTF → passed_shortans → passed_tuluan`), không
cho chọn tay file nào. Có 2 cách xử lý:

**Cách A (khuyến nghị, không sửa code):** nếu `passed_choice` đã có sẵn câu
`done` + `unverified` nhiều, việc bấm 1 lần sẽ xử lý `passed_choice` trước —
chấp nhận test trên file đầu tiên theo thứ tự đó (không nhất thiết phải là
`passed_choiceTF`) miễn là file đó ít câu / bạn quen thuộc nội dung để đối
chiếu tay.

**Cách B:** nếu bắt buộc phải test đúng `passed_choiceTF` trước, tạm thời xoá
file `passed_choice` (dùng nút "Xoá" ở card 1) trước khi test, upload lại sau
khi test xong. An toàn vì Phần 4 xác nhận: xoá file không đụng gì tới
`idVerified`/dữ liệu các file khác.

- [ ] Bấm nút **"Kiểm tra ID"**.
- [ ] Đợi tới khi nút hết trạng thái "Đang kiểm tra..." (tối đa ~50s/lượt,
      bấm lại nếu message báo `time_budget` hoặc `quota_exhausted`).
- [ ] Đọc dòng message hiện ra — ghi lại: `checkedCount`, `markedOkCount`,
      `markedWrongCount`, `stoppedReason`.

---

## Bước 2 — Đối chiếu tay 10-15 câu

Mục tiêu: không quá tay (đánh sai câu đang đúng) và không quá dễ dãi (bỏ sót
câu thật sự sai).

1. Sang trang **"③ Xem & sửa"** (Review).
2. Lọc theo **"Bị bỏ qua (skip)"** — đây là các câu vừa bị đánh **sai**
   (`markedWrongCount`). Với mỗi câu:
   - Đọc `lastError` — phải thấy chú thích tím **"(phát hiện lúc Kiểm tra
     ID)"** và dòng `[Kiểm tra lại] Sai Khối/Chương/Bài — ID cũ: "..."`.
   - Tự đọc lại đề bài, so với ID cũ ghi trong `lastError` → xác nhận AI
     đánh giá đúng là ID cũ thực sự sai (không phải AI đánh oan).
3. Lọc theo **"done"**, chọn ngẫu nhiên một số câu — dùng route/):
   - Cách kiểm nhanh: câu nào `idVerified: 'ok'` thì AI xác nhận đúng. Đọc lại
     đề, so ID đang gắn → xác nhận AI không bỏ sót câu thật sự sai (nếu bạn
     biết trước 1 câu chắc chắn gắn sai mà AI lại đánh `ok`, đó là dấu hiệu
     dễ dãi).

**Bảng ghi lại kết quả đối chiếu (điền tay):**

| # | blockIndex | ID cũ | Khối-Chương-Bài đang gắn | AI đánh giá | Đối chiếu tay | Nhận xét |
|---|---|---|---|---|---|---|
| 1 | | | | ok / wrong | đúng / sai | |
| 2 | | | | ok / wrong | đúng / sai | |
| ... | | | | | | |

- [ ] Tính tỉ lệ AI đánh giá KHỚP với đối chiếu tay = (số dòng "đúng") / (tổng
      số dòng đối chiếu).
- [ ] Ghi chú riêng các trường hợp AI đánh sai (oan) và AI bỏ sót (dễ dãi) —
      2 loại lỗi này cần đọc kỹ để hiệu chỉnh prompt (`buildGanIdVerifyPrompt`
      trong `ganIdGemini.ts`, Phần 2) nếu tỉ lệ chưa đạt.

---

## Bước 3 — Quyết định Go/No-Go

- [ ] Tỉ lệ đúng chấp nhận được (tự đặt ngưỡng phù hợp, ví dụ ≥ 90-95% tuỳ độ
      quan trọng của việc gắn ID đúng) → sang Bước 4.
- [ ] Nếu tỉ lệ chưa đạt, hoặc thấy pattern lỗi rõ ràng (ví dụ AI hay nhầm 1
      loại câu hỏi cụ thể) → quay lại chỉnh `buildGanIdVerifyPrompt`
      (`src/lib/ganIdGemini.ts`), KHÔNG chỉnh route `/verify` hay schema —
      lỗi thường nằm ở cách diễn đạt prompt. Sau khi sửa, quay lại Bước 1.
- [ ] Nếu dùng Cách B ở Bước 1 (đã xoá `passed_choice` để test), nhớ tải lại
      file đó trước khi qua Bước 4.

---

## Bước 4 — Chạy full cả 4 file

- [ ] Bấm "Kiểm tra ID" nhiều lần liên tiếp cho tới khi thấy message
      `all_done` — "Đã kiểm tra xong toàn bộ các câu đã gắn ID!"
- [ ] Theo dõi card "4. Kiểm tra ID đã gắn": thanh tiến độ chạy tới 100%,
      `unverified` (Chưa kiểm tra) → 0 ở toàn bộ 4 file.
- [ ] Sang trang Review, xử lý toàn bộ các câu bị đánh sai bằng nút
      **"Requeue tất cả câu skip còn lượt"** (hoặc từng câu) — để AI gắn lại
      bằng đúng luồng cũ (`/run` + `buildGanIdRequeuePrompt`).

---

## Bước 5 — Theo dõi quota Gemini

- [ ] Đây là lượt gọi AI THÊM, dùng chung pool `apiKeys` với luồng gắn ID gốc
      — theo dõi số **"còn dùng được"** ở card "2. Cấu hình AI" trong lúc
      chạy cả Kiểm tra ID lẫn Requeue cùng ngày.
- [ ] Nếu hết quota giữa chừng (`quota_exhausted`), đợi tới giờ reset (xem
      "Hết quota, reset sớm nhất: ...") hoặc thêm key mới, rồi bấm tiếp.
- [ ] Lưu ý: `/run` và `/verify` dùng CHUNG khoá (`GanIdLock`) — không bấm
      "Chạy" và "Kiểm tra ID" cùng lúc, đợi lượt này xong mới bấm lượt kia
      (nếu bấm trùng sẽ nhận `stoppedReason: 'already_running'`).

---

## Sau khi rollout xong

- [ ] Đánh dấu Phần 6 ✅ trong `KE_HOACH_V10.md`, ghi lại tỉ lệ đối chiếu tay
      thực tế đã đạt được (để làm căn cứ nếu sau này cần tinh chỉnh lại
      prompt).
