# KE_HOACH_V10 — Tính năng "Kiểm tra ID" (verify lại câu đã gắn)

## 0. Bối cảnh & mục tiêu

Luồng gắn ID hiện tại (`/api/gan-id/run`) đôi khi gắn **sai Khối/Chương/Bài** dù ID
trả về vẫn đúng format và có thật trong `map_id.json` (nên không bị
`validateGanId` bắt được — validate chỉ kiểm tra ID có TỒN TẠI trong taxonomy,
không kiểm tra ID có ĐÚNG NỘI DUNG câu hỏi hay không).

Mục tiêu tính năng mới: chạy **thêm 1 lượt AI riêng, độc lập**, quét lại các
câu đang `status: 'done'`, chỉ hỏi AI đúng 1 câu hỏi: *"câu này có đúng thuộc
Khối – Chương – Bài đang gắn hay không"* (KHÔNG xét Dạng/Mức độ). Câu nào AI
xác nhận đúng → giữ nguyên, không đụng gì. Câu nào AI xác nhận sai → xoá ID,
đưa về `skipped` để admin dùng lại cơ chế **Requeue** đã có sẵn ở trang Review,
gắn lại bằng đúng luồng AI gắn ID cũ.

**Nguyên tắc bất di bất dịch:** `/api/gan-id/run`, `/api/gan-id/requeue`,
`/api/gan-id/manual` giữ nguyên 100%, không sửa dòng nào. Tính năng mới CHỈ
CỘNG THÊM (field mới, route mới, prompt mới), không sửa logic cũ.

Chia 6 phần việc, làm tuần tự 1 → 2 → 3 → 4 → 5 → 6 (phần sau phụ thuộc phần
trước).

---

## Phần 1 — Đổi schema (`src/lib/ganIdModel.ts`) — ✅ ĐÃ LÀM

- Thêm field vào `GanIdBlockSchema`:
  ```
  idVerified: { type: String, enum: ['unverified', 'ok', 'wrong'], default: 'unverified' }
  ```
- Thêm index: `GanIdBlockSchema.index({ fileName: 1, status: 1, idVerified: 1 })`
  — phục vụ query "câu done chưa kiểm tra" theo đúng thứ tự `blockIndex`.
- Thêm vào `GanIdJobSchema`:
  ```
  verifyCurrentFileName: { type: String, default: null }
  ```
  Tách riêng khỏi `currentFileName` (đang dùng cho `/run`) để 2 luồng "Chạy"
  và "Kiểm tra ID" không ghi đè nhau nếu admin bấm xen kẽ 2 nút.
- Batch size dùng chung `job.batchSize` có sẵn, không cần field riêng.

**Migrate dữ liệu cũ:** field mới có `default`, Mongoose tự áp cho document cũ
khi đọc/ghi — KHÔNG cần script migrate riêng. Hệ quả: mọi câu `done` từ trước
tới giờ đều là `unverified`, tức lần đầu chạy "Kiểm tra ID" sẽ quét lại TOÀN
BỘ câu đã gắn từ trước, không chỉ câu mới.

**Acceptance:** deploy xong, mở 1 document `GanIdBlock` cũ bất kỳ trong DB →
thấy `idVerified: 'unverified'` dù chưa chạy script gì.

---

## Phần 2 — Prompt kiểm tra (`src/lib/ganIdGemini.ts`) — ✅ ĐÃ LÀM

Viết hàm mới `buildGanIdVerifyPrompt(blocks, questionType)`, khác 2 prompt cũ
(`buildGanIdPrompt`, `buildGanIdRequeuePrompt`) ở chỗ:

- KHÔNG đưa cả cây taxonomy vào (AI không cần chọn mã) — chỉ đưa **tên chữ**
  Khối/Chương/Bài đang gắn cho từng câu, lấy qua `describeGanId()` đã có sẵn
  trong `ganIdTaxonomy.ts` (dùng `lopTen`, `chuongTen`, `baiTen`) + đề bài
  (dùng lại `stripLoiGiaiForPrompt()` đã có).
- Chỉ hỏi đúng/sai cho bộ 3 Khối–Chương–Bài, KHÔNG hỏi gì về Dạng/Mức độ.
- Output JSON dạng `{"<blockIndex>": true, "<blockIndex>": false, ...}` — giữ
  đúng kiểu key số-dạng-chuỗi như 2 prompt cũ để dùng lại được hàm parse JSON
  hiện có, không viết hàm parse mới.
- Không sửa `buildGanIdPrompt` / `buildGanIdRequeuePrompt`.

**Acceptance:** thử tay prompt (dán vào Gemini Studio hoặc gọi thử qua script
test riêng) với 3–4 câu đã biết trước đúng/sai thực tế, xác nhận AI trả đúng
format JSON + đúng nhận định, trước khi gắn vào route.

---

## Phần 3 — Route `/api/gan-id/verify` (POST, file mới `src/app/api/gan-id/verify/route.ts`) — ✅ ĐÃ LÀM

> **Lưu ý kỹ thuật phát sinh khi làm xong Phần 2:** `callGeminiForBatch()`
> (dùng chung, không đổi ở Phần 2) khai báo kiểu trả về
> `answers: Record<string, string | null>` — đúng cho 2 prompt gắn ID cũ
> (giá trị là mã ID hoặc null). Với `buildGanIdVerifyPrompt`, Gemini trả
> `true`/`false` (kiểu `boolean`), không phải `string`. Route Phần 3 khi gọi
> `callGeminiForBatch` cho luồng verify cần ép kiểu `answers` sang
> `Record<string, boolean | null>` (dùng `as unknown as ...` hoặc kiểm tra
> `typeof v === 'boolean'` từng phần tử trước khi dùng) — KHÔNG sửa lại kiểu
> chung của `GanIdCallResult`/`callGeminiForBatch` vì 2 route cũ (`/run`,
> luồng requeue) vẫn đang dùng đúng kiểu `string | null`, sửa chung sẽ ảnh
> hưởng ngược.

Copy cấu trúc vòng lặp nhiều-batch-trong-1-lần-gọi của
`src/app/api/gan-id/run/route.ts` (round-robin `apiKeys`, đọc/ghi
`keyQuotaExhaustedUntil`, dừng khi hết quota TẤT CẢ key / hết câu cần kiểm /
chạm giới hạn thời gian serverless function) nhưng:

- Chọn file kế tiếp theo đúng `GAN_ID_FILE_ORDER`, dùng
  `job.verifyCurrentFileName` (không đụng `currentFileName`).
- Query batch:
  ```
  GanIdBlock.find({ fileName, status: 'done', idVerified: 'unverified' })
    .sort({ blockIndex: 1 }).limit(batchSize)
  ```
- Gọi Gemini bằng `buildGanIdVerifyPrompt`.
- Parse kết quả, cập nhật bằng `bulkWrite`:
  - AI trả `true` → `$set: { idVerified: 'ok' }` (không đụng `id`, `status`).
  - AI trả `false` → `$set: { id: null, status: 'skipped', idVerified: 'wrong', lastError: '[Kiểm tra lại] Sai Khối/Chương/Bài — ID cũ: <id trước khi xoá>' }`.
  - AI không trả lời / lỗi parse cho câu đó → giữ nguyên `unverified`, KHÔNG
    đoán bừa thành `ok` (an toàn hơn, để lượt chạy sau quét lại).
- KHÔNG đụng `requeueCount`, `attempts` — đúng quy tắc "field nào chỉ route
  đó được sửa" đã ghi trong comment gốc của `ganIdModel.ts`.
- Response format tương tự `/run`: `{ stoppedReason, checked, markedOk, markedWrong, ... }`.

**Acceptance:** gọi route bằng tay (curl/Postman) trên 1 file test nhỏ, kiểm
tra trong DB: câu đúng → `idVerified: 'ok'`, giữ nguyên `id`/`status: 'done'`;
câu sai → `id: null`, `status: 'skipped'`, `idVerified: 'wrong'`.

> **Ghi chú thực tế khi code (khác nhẹ so với mô tả ban đầu):**
> - Dùng CHUNG `GanIdLock` (singleton) với `/run` — cố ý, vì cả 2 route cùng
>   đọc/ghi `job.apiKeys`/`lastKeyIndex`/`keyQuotaExhaustedUntil` (chung 1
>   pool key Gemini), chạy đồng thời sẽ race-condition. Hệ quả: không bấm
>   được "Chạy" và "Kiểm tra ID" cùng lúc — chấp nhận được.
> - KHÔNG kiểm tra `job.isPaused` — cờ đó chỉ nói về việc tạm dừng luồng gắn
>   ID gốc, không liên quan tới luồng kiểm tra lại này.
> - KHÔNG hỗ trợ cron/`GAN_ID_CRON_SECRET` cho route này (khác `/run`) — đây
>   là thao tác admin chủ động, không cần chạy nền tự động.
> - Thêm xử lý phòng hờ: nếu 1 câu trong batch không giải mã được ID hiện tại
>   (`describeGanId` trả `null` — lý thuyết không nên xảy ra), tự đánh
>   `idVerified: 'ok'` luôn (an toàn hơn xoá oan) + ghi rõ lý do vào
>   `lastError` để admin biết cần xem tay, KHÔNG đưa câu đó vào prompt gọi
>   AI.

---

## Phần 4 — Route trạng thái — ✅ ĐÃ LÀM

Thêm vào `src/app/api/gan-id/status/route.ts` (route đã có, đang phục vụ
trang "② Gắn ID") phần thống kê mới theo từng file:
```
{ totalDone, verifiedOk, verifiedWrong, unverified }
```
3 số `verifiedOk + verifiedWrong + unverified` phải luôn bằng `totalDone`.
Gộp vào response cũ, không tạo route riêng, đỡ phải sửa nhiều nơi gọi API ở
frontend.

**Acceptance:** gọi `/api/gan-id/status`, tổng 3 số theo từng file khớp với số
`status: 'done'` đếm thực tế trong DB.

> **Ghi chú thực tế khi code:**
> - `totalDone` lấy THẲNG từ số đếm `status: 'done'` trực tiếp trong DB (khớp
>   đúng nghĩa đen acceptance), KHÔNG cộng dồn 3 số kia lại.
> - `verifiedWrong` suy ra bằng hiệu số `totalDone - verifiedOk - unverified`
>   thay vì đếm riêng `idVerified: 'wrong'` — vì route `/verify` (Phần 3) luôn
>   `$set` cả `status: 'skipped'` VÀ `idVerified: 'wrong'` CÙNG 1 lần
>   `bulkWrite`, nên trên thực tế không có block nào vừa `status: 'done'` vừa
>   `idVerified: 'wrong'` cùng lúc — đếm trực tiếp `idVerified: 'wrong'` mà
>   không lọc theo `status` sẽ đúng về giá trị (luôn ra 0 ở điều kiện bình
>   thường) nhưng phá vỡ công thức bắt buộc nếu tính riêng rẽ, nên dùng hiệu
>   số để công thức luôn đúng tuyệt đối theo cấu trúc phép tính.
> - Không sửa `GAN_ID_FILE_ORDER`, không đổi field cũ (`total/done/skipped/
>   pending/status`) — chỉ cộng thêm 4 field mới vào từng phần tử của mảng
>   `files` trong response, kể cả nhánh file "chưa tải lên" (trả về toàn 0).

---

## Phần 5 — Giao diện — ✅ ĐÃ LÀM

- **Trang "② Gắn ID"** (`src/app/admin/gan-id/page.tsx`): thêm 1 khối riêng
  "Kiểm tra ID đã gắn" cạnh khối "Chạy" hiện có — thanh tiến độ (đã kiểm bao
  nhiêu / tổng done, bao nhiêu ok / bao nhiêu sai) + nút **"Kiểm tra ID"**
  (hành vi giống hệt nút "Chạy": bấm 1 lần xử lý nhiều batch tới khi hết
  quota/hết câu, bấm lại nếu còn dở dang).
- **Trang Review** (`src/app/admin/gan-id/review/page.tsx`): KHÔNG cần sửa gì
  bắt buộc — câu bị đánh `wrong` tự động rơi vào `status: 'skipped'`, hiện sẵn
  trong khu "Câu bị bỏ qua (skip)" đã có, admin dùng nút **Requeue** có sẵn
  (từng câu hoặc "Requeue tất cả") để AI gắn lại đúng luồng cũ.
  - Cải tiến nhỏ (không bắt buộc, làm sau nếu có thời gian): hiện chú thích
    "(phát hiện lúc Kiểm tra ID)" khi `lastError` bắt đầu bằng
    `[Kiểm tra lại]`, để phân biệt trực quan với câu bị AI skip ngay từ đầu.

**Acceptance:** chạy thử end-to-end trên UI: bấm "Kiểm tra ID" → thấy tiến độ
chạy → sang trang Review, lọc "skip" → thấy đúng những câu vừa bị đánh sai,
kèm ID cũ hiện trong `lastError`.

> **Ghi chú thực tế khi code:**
> - `page.tsx`: thêm state `verifying` riêng (không dùng chung `running` với
>   nút "Chạy" cũ) — 2 nút disable độc lập nhau ở UI, dù backend (Phần 3)
>   thực ra dùng chung `GanIdLock` nên bấm cả 2 gần nhau vẫn có thể bị route
>   sau trả về `stoppedReason: 'already_running'` (hiện đúng thành thông báo
>   lỗi trong `message`, không cần xử lý gì thêm — hành vi này là cố ý theo
>   ghi chú Phần 3).
> - Card mới đánh số "4." (sau "3. Chạy xử lý"), đặt TRƯỚC card "Thống kê &
>   tiến độ" cũ (card đó không đổi số, giữ nguyên không đánh số).
> - Thanh tiến độ verify tính trên toàn bộ 4 file cộng dồn
>   (`checkedAll = verifiedOkAll + verifiedWrongAll`, mẫu số `totalDoneAll`)
>   — dùng đúng 4 field mới từ Phần 4, không gọi thêm API nào khác.
> - Màu tím (`purple-600`) cho progress bar + nút "Kiểm tra ID", để phân biệt
>   trực quan với màu xanh dương của nút "Chạy" chính — không có ý nghĩa gì
>   khác ngoài phân biệt 2 luồng.
> - Không đụng `handleRun`, `handleUploadTex`, `saveConfig`, hay bất kỳ hàm
>   nào khác đã có sẵn — chỉ thêm mới `handleVerify` + state `verifying` +
>   4 biến tổng hợp (`totalDoneAll/verifiedOkAll/verifiedWrongAll/
>   unverifiedAll/checkedAll`) + 1 section JSX mới.
> - `review/page.tsx`: chỉ thêm 1 điều kiện hiển thị (`foundByVerify`) ngay
>   trong vòng lặp `skippedSample.map` đã có sẵn, không đổi cấu trúc hay hàm
>   nào khác của trang.

---

## Phần 6 — Test & rollout — 📋 CHECKLIST SẴN SÀNG (chưa tick — cần chạy tay
trên môi trường thật, xem `PHAN_6_CHECKLIST.md`)

- Chạy thử trên **1 file nhỏ** trước (ví dụ `passed_choiceTF`, ít câu), đối
  chiếu tay 10–15 câu để chắc prompt hoạt động đúng hướng — không quá tay
  (đánh sai câu đang đúng) và không quá dễ dãi (bỏ sót câu thật sự sai).
- Nếu tỉ lệ đúng chấp nhận được → chạy full cả 4 file theo
  `GAN_ID_FILE_ORDER`.
- Theo dõi quota Gemini khi chạy — đây là lượt gọi AI THÊM, tốn quota riêng
  ngoài lượt gắn ID gốc, dùng chung pool `apiKeys` trong `GanIdJob`.

> **Ghi chú:** Phần 6 là thao tác thủ công trên môi trường đã deploy thật
> (cần DB thật + key Gemini thật + đăng nhập admin) — không tự chạy được từ
> môi trường soạn code. File `PHAN_6_CHECKLIST.md` (cùng thư mục gốc) liệt kê
> chi tiết từng bước thao tác + bảng mẫu để đối chiếu tay 10-15 câu + tiêu
> chí Go/No-Go, bám sát đúng 3 gạch đầu dòng ở trên. Rà soát code Phần 1-5
> lần cuối trước khi test: không phát hiện vấn đề tích hợp (kiểu dữ liệu
> `answers` ở `callGeminiForBatch` khớp đúng cách ép kiểu trong route
> `/verify`; `describeGanId`/`stripLoiGiaiForPrompt` dùng đúng tên hàm có
> sẵn trong `ganIdTaxonomy.ts`; `GAN_ID_FILE_ORDER` dùng nhất quán).

---

## Tóm tắt các thay đổi theo file

| File | Thay đổi |
|---|---|
| `src/lib/ganIdModel.ts` | ✅ + field `idVerified` (Block), + index, + field `verifyCurrentFileName` (Job) |
| `src/lib/ganIdGemini.ts` | ✅ + hàm `buildGanIdVerifyPrompt` + interface `GanIdVerifyPromptBlock` |
| `src/app/api/gan-id/verify/route.ts` | ✅ **File mới** — route POST xử lý nhiều batch/lần gọi |
| `src/app/api/gan-id/status/route.ts` | + field thống kê `verifiedOk/verifiedWrong/unverified` theo file |
| `src/app/admin/gan-id/page.tsx` | + khối UI "Kiểm tra ID đã gắn" + nút bấm |
| `src/app/admin/gan-id/review/page.tsx` | Không bắt buộc sửa; có thể thêm chú thích nhỏ cho câu bị đánh sai lúc verify |
| `src/app/api/gan-id/run/route.ts` | **Không đụng** |
| `src/app/api/gan-id/requeue/route.ts` | **Không đụng** |
| `src/app/api/gan-id/manual/route.ts` | **Không đụng** |

**Thứ tự bắt buộc:** 1 → 2 → 3 → 4 → 5 → 6 (route Phần 3 cần schema Phần 1 và
prompt Phần 2 xong trước; UI Phần 5 cần route Phần 3, Phần 4 xong trước).

---

## Bổ sung sau khi làm xong 1-6: batch size riêng cho "Kiểm tra ID"

Lý do: dữ liệu thật ~5-6 nghìn câu, và prompt verify nhẹ hơn nhiều so với
prompt gắn ID (không kèm cả cây taxonomy, chỉ 3 tên chữ Khối/Chương/Bài + đề
bài; trả lời chỉ true/false thay vì mã ID dạng chuỗi) — chịu được batch lớn
hơn mà không đụng giới hạn context/token của Gemini, giảm số lượt bấm nút cần
thiết.

**Thay đổi:**

| File | Thay đổi |
|---|---|
| `src/lib/ganIdModel.ts` | + field `verifyBatchSize` (Job), mặc định 40 |
| `src/app/api/gan-id/config/route.ts` | GET/PUT đọc/ghi `verifyBatchSize` (trần 100, khác trần 50 của `batchSize` gắn ID) |
| `src/app/api/gan-id/verify/route.ts` | Đổi từ dùng `job.batchSize` sang `job.verifyBatchSize` (KHÔNG đụng gì ở `/run`, vẫn dùng `job.batchSize` như cũ) |
| `src/app/admin/gan-id/page.tsx` | Thêm ô nhập "Batch size (Kiểm tra ID)" cạnh "Batch size (Chạy)" trong card "2. Cấu hình AI", gửi kèm khi bấm "Lưu cấu hình chạy" (dùng chung nút cũ, không thêm nút mới) |

**Không đụng:** `retryLimit` (chỉ `/run` dùng), `batchSize` gốc (vẫn của
riêng `/run`), route `/requeue`, `/manual` — đúng nguyên tắc bất di bất dịch
đầu kế hoạch.
