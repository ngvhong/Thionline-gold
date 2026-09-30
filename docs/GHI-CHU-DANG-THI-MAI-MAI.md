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

## 5. Dấu hiệu "đề đang thi, AI không được giải" (chống HS chụp/copy đề hỏi AI)
File: `src/components/ExamIntegrityMark.tsx`, gắn vào `StudentTakeExam.tsx`.
**TUỲ CHỌN CỦA GV, MẶC ĐỊNH TẮT**: checkbox "Đánh dấu chống AI" ở ExamBuilder > tab Cài đặt, lưu ở `Exam.settings.aiGuard`
(qua `resolveEffectiveSettings` tới học sinh). Chỉ hiện khi `settings.aiGuard === true`; luôn tắt ở `previewMode` và tab Ôn luyện.
Đề cũ chưa có field = tắt. Có cả ô bật/tắt RIÊNG theo lớp/khối trong 3 panel "Dùng cài đặt riêng" (`page.tsx`, `ClassDetailPanel.tsx`, `KhoiTab.tsx`); lớp không tuỳ chỉnh thì theo cài đặt chung của đề.
- Ảnh chụp màn hình/chụp điện thoại: KHÔNG có ký tự ẩn nào sống sót trong ảnh -> dùng chữ mờ HIỆN THẬT lát kín màn hình
  (VN + EN, kèm họ tên HS để truy vết). Ô lát rộng 340px để không bị cắt chữ trên điện thoại (ô 520px đã thử và bị cắt).
- Copy chữ rồi dán: `onCopy` gắn `EXAM_AI_NOTICE` vào đầu và cuối nội dung copy.
- GIỚI HẠN: chỉ là dấu hiệu, không phải khoá. AI có nghe theo hay không do từng công cụ quyết định; HS có thể cắt vùng chữ
  hoặc gõ tay lại đề. Đừng hứa với GV là "AI chắc chắn không giải". Dùng kèm cảnh báo rời tab sẵn có.
- Không chặn chọn/copy chữ (để HS còn dùng máy tính/ghi chú); nếu GV muốn chặn hẳn thì thêm `user-select: none` — chưa làm.
