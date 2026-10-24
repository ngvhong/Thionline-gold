# Bối cảnh & tư duy thiết kế (đọc trước khi code)

Tài liệu này ghi lại **lý do** đứng sau các quyết định trong `01-KE-HOACH-CHI-TIET.md`,
để bất kỳ AI/dev nào tiếp tục dự án cũng hiểu "vì sao làm vậy" chứ không chỉ "làm gì".
Nếu một quyết định trong kế hoạch có vẻ mâu thuẫn với trực giác, hãy đọc lại mục tương
ứng ở đây trước khi tự ý đổi.

## 1. Bối cảnh dự án

- Thionline là app thi online **nhỏ, 1 người/nhóm nhỏ vận hành**, đang chạy thật, có
  giáo viên (GV) dùng hàng ngày. Ưu tiên số 1 trên hết: **không được làm hỏng những gì
  đang chạy tốt cho GV hiện tại.**
- Mô hình cũ (giữ nguyên, không đổi): GV soạn đề → giao cho 1 lớp → hệ thống sinh link
  → GV tự gửi link (qua Zalo, v.v.) → học sinh (HS) mở link → chọn tên mình trong danh
  sách lớp (không tài khoản, không mật khẩu) → làm bài → nộp.
- Chủ app quyết định mở rộng thêm 3 nhu cầu mới, **không thay thế** mô hình cũ:
  1. HS có tài khoản riêng, mở app thấy được đề các lớp mình đang học "được giao" mà
     không cần link riêng từng lần ("Đề được giao").
  2. GV có thể thấy đề hay của GV khác trong 1 kho đề chung theo cây thư mục (Lớp
     10/11/12, Ôn tuyển 10, Ôn QG, Ôn HSG) và "lấy về" dùng cho lớp mình.
  3. HS có thể tự vào một khu vực chung để luyện tập tự do (không cần GV giao), chọn đề
     theo cây thư mục, làm xong thấy điểm + lời giải, lần sau quay lại thấy lịch sử đã
     làm ("Ôn luyện").

## 2. Nguyên tắc bất di bất dịch — "cộng dồn, không sửa"

Đây là nguyên tắc quan trọng nhất, áp dụng cho MỌI giai đoạn:

1. **Chỉ được thêm (file mới, field mới, route mới), không được sửa hành vi của
   code/field/route đã có**, trừ những điểm "được phép sửa" liệt kê tường minh trong
   từng giai đoạn của kế hoạch (số điểm này rất ít và luôn có lý do rõ ràng).
2. Nếu một tính năng mới cần dữ liệu từ model cũ (`Exam`, `Class`, `Student`,
   `Submission`, `TeacherModel`) → **thêm field mới, optional, có giá trị mặc định an
   toàn** (`default: false`, `default: null`...). Không đổi kiểu, không đổi field cũ,
   không thêm field `required` vào model cũ (sẽ làm vỡ dữ liệu cũ đã có trong DB).
3. Hệ thống xác thực (`auth.ts`) của GV **không được đụng vào** — chỉ thêm hàm mới song
   song cho HS (`getVerifiedStudentAccountIdFromRequest`), dùng cookie tên khác
   (`student_session_token`, khác với `session_token` của GV) để 2 phiên đăng nhập sống
   độc lập trên cùng 1 trình duyệt.
4. Mỗi giai đoạn khi làm xong phải **tự chạy được, tự test được**, và **không được làm
   hỏng bất kỳ tính năng nào của giai đoạn trước + của app gốc**. Vì vậy mỗi giai đoạn
   trong kế hoạch đều có mục "Điều kiện nghiệm thu" — phải pass hết mới coi là xong,
   mới được bắt đầu giai đoạn kế tiếp.
5. Giao diện học sinh là **1 nhánh code tách biệt hoàn toàn** (`StudentApp` và các
   component con), không import ngược từ code GV, **trừ 2 chỗ dùng chung có chủ đích**:
   engine làm bài (`StudentTakeExam.tsx`) và xem lời giải (`SolutionView.tsx`) — vì đó
   là logic chấm điểm/hiển thị đề, chỉ nên có 1 bản, không viết lại 2 lần dễ lệch nhau.

## 3. Vì sao chọn "bảng chọn vai trò tại `/`" thay vì domain/URL riêng

Đã cân nhắc 2 phương án:
- (A) URL riêng cho HS (ví dụ `/em`) — không đụng `/` chút nào, nhưng GV phải nhớ và
  phân phát 2 link khác nhau cho 2 nhóm người dùng.
- (B) 1 cổng chung tại `/`, hiện bảng 2 nút "Tôi là giáo viên" / "Tôi là học sinh" ngay
  khi chưa có phiên đăng nhập nào (cả GV lẫn HS), ai bấm nút nào thì rẽ hẳn sang nhánh
  code đó, lần sau tự vào thẳng nhờ cookie đã có — **đã chọn phương án này** (giống
  Azota, nhưng gọn hơn: chỉ là 1 bảng 2 nút, không phải hệ thống role đầy đủ).

Lý do chọn (B): chỉ cần 1 link duy nhất để truyền miệng/dán ở lớp/gửi trong nhóm Zalo,
không phải nhớ 2 link. Chi phí kỹ thuật thêm không đáng kể (chỉ 1 điều kiện rẽ nhánh ở
đầu `page.tsx`), rủi ro với GV hiện tại gần như bằng 0 vì họ luôn có cookie
`session_token` sẵn nên tự động bỏ qua bảng chọn vai trò.

## 4. Vì sao HS dùng SĐT + PIN thay vì email + mật khẩu như GV

- HS (đặc biệt cấp 2, đầu cấp 3) thường không có email riêng, hay quên mật khẩu phức
  tạp. SĐT dễ nhớ hơn, PIN ngắn (4-6 số) dễ nhập trên điện thoại.
- Đánh đổi: bảo mật thấp hơn GV (không xác thực email, không gửi OTP SMS vì tốn phí hạ
  tầng — không cần thiết với quy mô app nhỏ). Chấp nhận được vì dữ liệu HS không nhạy
  cảm bằng dữ liệu GV (không có thanh toán, không có dữ liệu của nhiều lớp).
- Quên PIN → không tự reset qua email được (không thu email) → GV chủ nhiệm/GV của lớp
  reset hộ trong trang quản lý lớp (chỉ reset được HS thuộc lớp mình, chặn bằng
  `Student.classId` → `Class.ownerId`).

## 5. Vì sao tách riêng `studentId` (cũ) và `studentAccountId` (mới) trong `Submission`

- `studentId` cũ trỏ tới `Student` — 1 bản ghi **thuộc về 1 lớp cụ thể**, do GV import,
  không có khái niệm đăng nhập. Toàn bộ báo cáo/bảng điểm/xuất Excel theo lớp hiện tại
  đều dựa vào field này — **không được đổi**.
- `studentAccountId` mới trỏ tới `StudentAccount` — 1 tài khoản **sống ở cấp toàn hệ
  thống**, độc lập với lớp, dùng cho lượt làm bài qua "Đề được giao" (khi HS đã đăng
  nhập) và "Ôn luyện" (kho chung).
- Khi HS dùng mã lớp (`inviteCode`) để join 1 lớp, hệ thống nối 2 thế giới bằng cách
  gán `studentAccountId` vào đúng bản ghi `Student` (đã có sẵn tên trong lớp, do GV
  import) mà HS chọn đúng tên mình — không tạo `Student` trùng.

## 6. Vì sao cây thư mục (`LibraryFolder`) chỉ có 1 bản chung, không nhân theo GV

- Tránh loạn cấu trúc: nếu mỗi GV tự đặt tên/tổ chức cây riêng, HS xem "Ôn luyện" sẽ
  thấy hàng chục cây khác nhau không thống nhất, rất khó tìm.
- Việc "riêng tư theo GV" (đề của GV A chỉ HS lớp GV A thấy) được giải quyết bằng
  **field quyền trên từng đề** (`isShared`, `openForStudents`, `sharedFolderId`), không
  phải bằng nhân bản cấu trúc cây — 1 cây, nhiều cờ lọc theo người xem là ai.
- Cây do **admin** (không phải GV) quản lý cấu trúc (thêm/sửa/xoá nhánh) — GV chỉ được
  gắn đề mình vào nhánh có sẵn, không tự tạo nhánh mới (tránh loạn thêm).

## 7. 2 loại hiển thị "đề" khác nhau cho học sinh — đừng nhầm lẫn

| | "Đề được giao" | "Ôn luyện" |
|---|---|---|
| Nguồn đề | `ExamAssignment` (GV giao đích danh 1 lớp, đã có sẵn cơ chế) | Đề GV chủ động bật cờ `openForStudents = true` |
| HS thấy được khi nào | Đã join đúng lớp đó qua `inviteCode` | Bất kỳ ai, không cần join lớp nào (xem cây không cần đăng nhập, chỉ cần đăng nhập lúc bấm làm bài) |
| Có hạn nộp không | Có (`openAt`/`closeAt` theo lớp, như cũ) | Không, làm bất cứ lúc nào, làm lại bao nhiêu lần cũng được |

Hai luồng này **dùng chung 1 màn hình làm bài + 1 engine chấm điểm**, chỉ khác nguồn
danh sách đề hiển thị và điều kiện truy cập.
