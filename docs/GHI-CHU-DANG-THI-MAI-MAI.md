# Ghi chú cho AI/dev sau — "HS đang thi" kẹt mãi mãi + vị trí khối "Đang thi"

## 1. Vị trí giao diện (yêu cầu GV)
Khối "Đang thi (N)" ở Trang chủ (`HomeTab` trong `src/app/page.tsx`) đã chuyển xuống **CUỐI trang**,
sau 2 thẻ "Quản lí Khối-lớp" / "Đề thi". Không đưa lên giữa lại.

## 2. Sự cố "đang thi mãi mãi" (GV: không chấp nhận được)
`status = 'đang thi'` được ghi lúc HS mở đề (`api/thi/[examId]/start`) và chỉ đổi sang `'đã nộp'` khi
trình duyệt HS gọi API nộp. HS tắt tab / mất mạng / bỏ thi -> kẹt 'đang thi' vĩnh viễn (trang chủ, danh sách lớp, bảng điểm).

### Cách sửa: `src/lib/expireOverdueSubmissions.ts`
- Mốc hết hạn = `started_at + settings.duration (phút)` (cùng công thức `endAt` ở start/route.ts;
  settings lấy qua `resolveEffectiveSettings`, tính cả cài đặt riêng theo lớp).
- Quá mốc + `OVERDUE_GRACE_MS` (5 phút, chừa cho trình duyệt còn mở tự nộp lúc hết giờ + độ trễ mạng)
  mà vẫn 'đang thi' -> server tự chốt: `status='đã nộp'`, 0 điểm (gradeExam với đáp án rỗng),
  `submitted_at = đúng lúc hết giờ`, `autoSubmitted = true` (field mới trong `submissionModel.ts`).
- Bài làm dở nằm ở trình duyệt HS nên server KHÔNG có -> 0 điểm. GV muốn cho làm lại dùng nút "Cho làm lại" sẵn có.
- Chạy KIỂU LƯỜI (không cần cron): gọi ở đầu các đường ĐỌC trạng thái:
  `api/submissions/live`, `api/submissions` (cả 4 nhánh GET), `api/library/my-assignments`, `lib/scoreTable.ts (buildScoreTable)`.
- `updateOne` có điều kiện `status: 'đang thi'` -> nếu đúng lúc đó HS nộp thật thì bài nộp thật thắng, không bị ghi đè.
- Route nộp bài (`submit/route.ts`) đã idempotent: nộp muộn sau khi bị chốt sẽ trả `alreadySubmitted`.

### Lưu ý khi sửa tiếp
- Thêm API GET mới có hiện trạng thái 'đang thi' -> nhớ gọi `expireOverdueSubmissions(studentIds)` trước khi đọc.
- Đổi `duration`/công thức endAt ở start/route.ts -> đổi luôn ở helper cho khớp.
- Muốn phân biệt "không nộp" với "nộp thật 0 điểm" trên UI: dùng `autoSubmitted` (hiện CHƯA có UI hiển thị nhãn này).
- Chưa có heartbeat: trong khoảng giờ làm bài, HS đã tắt tab vẫn hiện "đang thi" cho tới khi hết giờ + 5 phút.

## 3. Thống kê Quản trị (làm theo hướng NHẸ NHẤT, KHÔNG heartbeat)
GV chủ động bỏ heartbeat vì tốn tải Mongo. Đã thêm ở tab Quản trị > Tổng quan 4 thẻ:
"HS đang thi" (toàn hệ thống), "Tài khoản HS", "GV đăng nhập (7 ngày)", "HS đăng nhập (7 ngày)".
- `lastLoginAt` (Date) thêm vào `teacherModel.ts` và `studentAccountModel.ts`; chỉ ghi 1 lần mỗi lần đăng nhập
  (`api/auth/login`, `api/student-auth/login`). KHÔNG ghi theo từng request. Hệ quả: người dùng còn phiên (cookie)
  mà chưa đăng nhập lại thì không được tính là "hoạt động"; tài khoản cũ có `lastLoginAt = null` cho tới lần đăng nhập kế tiếp.
- Index `{ status: 1 }` trên `submissionModel.ts` cho các lệnh đếm/lọc 'đang thi'.
- `api/admin/stats`: trước khi đếm "đang thi" có gọi `expireOverdueSubmissions` cho các lượt đang mở để số không bị kẹt.
  Chỉ đếm lượt có `studentId` (học sinh trong lớp). Lượt "Ôn luyện" không có `studentId` hiện CHƯA được tự chốt quá giờ — còn tồn.
- Còn tồn: UI đọc `expiringSoonCount`/`expiredFreeCount` nhưng `api/admin/stats` trong bản này không trả hai trường đó.
- KHÔNG thêm heartbeat/ghi theo request vào vùng này nếu chưa được GV đồng ý.

## 4. Lỗi "Vào thêm lớp" báo thành công nhưng không vào lớp (đã sửa)
`JoinClassForm` (src/app/student/StudentApp.tsx) KHÔNG tự gọi API, chỉ trả `{inviteCode, studentId}` qua `onJoined`.
Hộp thoại "+ Vào thêm lớp" trong `StudentHome` trước đây bỏ qua tham số đó, chỉ đóng hộp thoại và alert
"Đã vào lớp thành công" -> KHÔNG gọi `/api/student-auth/join-class` -> `Student.studentAccountId` không được gắn ->
tab "Đề được giao" luôn trống. Nay gọi API thật, báo lỗi nếu thất bại, rồi ép `AssignedExamsTab` tải lại (key).
Luồng đăng ký mới (`handleJoinAfterRegister`) vốn đã đúng.
Dữ liệu cũ: học sinh đã bấm "Vào thêm lớp" trước bản sửa chưa được gắn lớp, phải vào lớp lại.

## 5. Bổ sung 25-10 (vẫn thấy "đang thi" dù không ai thi; danh sách dài; admin xem cả thí sinh tự do)
- NGUYÊN NHÂN còn sót: lượt "Ôn luyện"/thí sinh tự do (`studentId = null`, chỉ có `studentAccountId`, tạo ở
  `api/library/thi/[examId]/start`) KHÔNG bao giờ được tự chốt -> kẹt 'đang thi' mãi. Thêm
  `expireOverdueFreeSubmissions()` (cùng công thức giờ: started_at + duration của đề), gọi ở `api/admin/stats`.
- `lib/expireOverdueSubmissions.ts` tách `computeLiveEndTimes()` dùng chung. Lượt thiếu started_at/assigned_at dùng
  thời điểm tạo ObjectId; đề đã bị xoá -> chốt bỏ dở sau 24 giờ. Mỗi lượt chấm lỗi được bắt riêng, không làm 500 cả API.
- `api/submissions/live`: ẨN NGAY lượt đã hết giờ làm bài (không chờ +5 phút chừa), trả thêm `endAt`, `total`,
  `truncated`; hỗ trợ `?countOnly=1` (chỉ trả tổng) và cắt tối đa 500 dòng.
- Trang chủ (`HomeTab`): khi gập chỉ gọi `countOnly`, mở mới tải danh sách; danh sách nằm trong khung `max-h-80`
  có thanh cuộn + ô tìm kiếm (khi > 8 em); dòng quá `endAt` tự ẩn phía trình duyệt (tick 30s).
- `api/admin/stats` trả thêm `liveClassCount`, `liveFreeCount`, `liveByExam` (top 8 đề); `liveExamCount` = tổng cả hai.
  Tab Quản trị > Tổng quan hiện thẻ "HS đang thi" kèm "x trong lớp · y tự do" + bảng top đề. Không realtime.
- Chưa có heartbeat (vẫn cố ý): em đã tắt tab vẫn hiện tới khi hết giờ làm bài.

## 6. Bổ sung 25-10 (tab học sinh + Kho đề chung)
- `.thin-scroll` (globals.css): thanh cuộn mảnh dùng chung. Áp cho danh sách "Đang thi", đề Ôn luyện, Đề được giao,
  cây thư mục + danh sách đề ở Kho đề chung.
- `api/library/exams`: đề xếp MỚI NHẤT trước theo `published_at || created_at`. Tab học sinh có nhãn "MỚI" (14 ngày
  Ôn luyện / 7 ngày Đề được giao chưa làm), ô tìm kiếm khi > 8 đề.
- Hàng thư mục ở tab Ôn luyện có mũi tên ">" + dòng hướng dẫn; ở Kho đề chung mũi tên ▸ nhỏ được thay bằng icon lớn
  (vùng bấm 28px) và bấm vào tên thư mục vừa chọn vừa mở/đóng nhánh con.

## 7. Bổ sung 25-10 (dọn giao diện + trợ lý AI)
- BỎ icon nổi 📱 "Xem thử trên điện thoại" ở góc trên-phải (`page.tsx`) cùng state `isDesktopPointer` và file
  `public/phone-simulator.html`. `isPhoneLandscape` (ẩn cột trái khi điện thoại xoay ngang) là chức năng KHÁC, vẫn giữ.
- `APP_AUTHOR` (adminConfig.ts): trường hiện tại = THPT Nguyễn Huệ, thêm `previousSchool` = THPT An Phước.
- `AiHelpWidget.tsx`: bỏ emoji trong lời chào và 3 câu trả lời soạn sẵn (giữ nút ✕ đóng).
- `api/ai-assistant` (SYSTEM_PROMPT): thêm mục 9-14 (khối "Đang thi", Kho đề chung, cổng học sinh/Ôn luyện, xuất đề,
  dùng trên điện thoại, thống kê admin). Khi app có tính năng mới nhớ cập nhật prompt này.

## 8. Bổ sung 25-10 (xác nhận email tuỳ chọn + cài đặt đề mặc định)
- Xác nhận email: thêm `requireEmailVerification` (AppSettings, MẶC ĐỊNH false). `getRequireEmailVerification()` có cache 30s.
  Điểm quyết định duy nhất là `getSessionContext` (lib/auth.ts): `emailVerified = teacher.emailVerified !== false || !require`.
  `/api/auth/me` trả giá trị đã tính này nên màn chặn ở page.tsx tự biến mất. Đăng ký khi tắt: KHÔNG gửi email xác nhận,
  tài khoản vẫn lưu `emailVerified:false` (đúng sự thật) => nếu admin bật lại thì họ phải xác nhận ở lần vào kế tiếp.
  Admin bật/tắt ở Quản trị > Cấu hình > "Xác nhận email khi đăng ký". `api/admin/settings` nay trả ĐỦ cấu hình ở mọi nhánh.
- Mặc định đề mới: `lib/examDefaults.ts` (90 phút, 3 lần, xem lời giải ngay sau khi nộp). Dùng ở ExamBuilder, KhoiTab,
  ClassDetailPanel, page.tsx. Mở đề CŨ thiếu field => giữ luật cũ (45 phút / không giới hạn lần), không áp mặc định mới.
  Chú ý: đề chia sẻ vào Kho chung cho "Ôn luyện" cũng theo maxAttempts của đề (đề mới = 3 lần).

## 9. Bổ sung 25-10 (cảnh báo sắp hết giờ)
- `StudentTakeExam.tsx`: giữ nguyên nút tròn + nút "Nộp bài" trong bảng. Khi còn <= 5 phút (`urgency` amber) hiện đồng hồ nhỏ mm:ss
  bên trái nút tròn (`role="timer"`, `pointer-events-none`); <= 1 phút đỏ + `.anchor-heartbeat`. Cố ý KHÔNG thêm thanh giờ cố định.
- Gợi ý lần đầu cạnh nút tròn ("Bấm vào đây để xem giờ, danh sách câu và nộp bài"): đổi nền từ đen sang đỏ nâu `#8B2F1F`
  (cả mũi tên trỏ) để học sinh dễ chú ý. Chỉ hiện lần đầu (localStorage), tự ẩn sau 7 giây hoặc khi bấm nút tròn.

## 7. Rà soát giao diện điện thoại/iPad (25-10)
- Ô nhập chữ phải >= 16px (nếu không iPhone/iPad tự phóng to khi bấm): đã sửa ô "Nhập đáp số" và 3 ô tìm kiếm.
- Vùng chạm >= 40-44px: nút menu ☰/đóng menu (page.tsx), tab Đề được giao/Ôn luyện + Đăng xuất, nút Làm bài/Xem lại,
  thanh Đ/S ở Phần II (thanh mobile h-11), nút cờ đánh dấu câu, thư mục trong breadcrumb Ôn luyện.
- Tiêu đề đề ở "Đề được giao" cho xuống 2 dòng (line-clamp-2) thay vì cắt "…".

## 8. Đợt chỉnh sau (đồng hồ, giấy A4, cổng HS, logo)
- Đồng hồ đếm ngược (còn ≤5 phút) hiện thành viên thuốc ngay PHÍA TRÊN icon tròn (StudentTakeExam.tsx).
- Màn rộng (md trở lên): đề thi dạng tờ giấy A4 (max-w-[210mm], nền trắng, đổ bóng nhẹ); điện thoại giữ nguyên toàn chiều ngang.
- Cổng học sinh (StudentApp.tsx): bố cục gọn, rộng hơn, nút/tab lớn hơn.
- Logo (AppBranding.tsx): nhúng data-URI, decoding="sync", width/height cố định nên hiện ngay không chờ tải.
