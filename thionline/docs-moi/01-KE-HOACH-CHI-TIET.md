# Kế hoạch triển khai — Cổng Học Sinh (Thionline)

> Đọc `00-THINKING.md` trước khi bắt đầu. File này là danh sách việc cụ thể, chia theo
> **5 giai đoạn (Giai đoạn 0 → 4)**, làm tuần tự, mỗi giai đoạn là 1 lượt giao việc độc
> lập cho AI/dev. **Không được bắt đầu giai đoạn N+1 khi giai đoạn N chưa pass hết mục
> "Điều kiện nghiệm thu".**

> **Cập nhật sau khi cả 5 giai đoạn code xong (đồng bộ icon):** rà lại toàn bộ UI mới
> thêm ở Giai đoạn 3/4, thay mọi emoji (📚 📁 📥) bằng icon SVG nét mảnh
> (viewBox 24x24, `stroke="currentColor"`, `strokeWidth 1.6`) đúng style đã dùng xuyên
> suốt `page.tsx`/`ExamBuilder.tsx` từ trước — file mới `src/components/LibraryIcons.tsx`
> (`LibraryBookIcon`, `LibraryFolderIcon`, `LibraryDownloadIcon`), trung lập như
> `AppBranding.tsx` nên cả code GV lẫn `src/app/student/*` đều import được. Các ký hiệu
> `✕`/`✓`/`▾`/`▸` giữ nguyên vì đã là quy ước có sẵn của cả dự án (dùng y hệt ở hàng
> trăm chỗ trong `ExamBuilder.tsx` từ trước Giai đoạn 3), không phải emoji cần đồng bộ.

## Quy tắc chung cho MỌI giai đoạn (bắt buộc đọc)

1. Chỉ sửa đúng những file được liệt kê trong mục "File được phép sửa" của giai đoạn
   đó. Mọi thay đổi khác phải là **file mới**.
2. Sau khi xong, chạy `npm run build` phải pass, không có lỗi TypeScript.
3. Đăng nhập GV bằng tài khoản đã có từ trước khi bắt đầu giai đoạn này phải vẫn hoạt
   động y hệt (test thủ công: đăng nhập, tạo lớp, tạo đề, giao đề, HS làm qua link cũ
   `/thi/[examId]` — toàn bộ luồng cũ phải chạy không lỗi).
4. Không xoá, không đổi tên field nào trong các model cũ
   (`Exam`, `Class`, `Student`, `Submission`, `TeacherModel`, `ExamAssignmentModel`,
   `KhoiModel`).
5. Field mới thêm vào model cũ luôn có `default` an toàn, không set `required: true`.
6. Viết comment `// THÊM MỚI (giai đoạn N — <tên>):` ngay phía trên mỗi đoạn code mới
   thêm vào file cũ, theo đúng văn phong comment đã có sẵn trong repo (xem các đoạn
   `// THÊM MỚI` có sẵn trong `src/lib/auth.ts`, `src/app/page.tsx` làm mẫu).
7. Không tạo bảng thống kê tính sẵn (không cache) trong các giai đoạn 0-4 — mọi số
   liệu thống kê tính "on the fly" bằng aggregate query từ `Submission`. Việc thêm cache
   chỉ làm khi có bằng chứng thực tế là chậm (nằm ngoài phạm vi 5 giai đoạn này).

---

## GIAI ĐOẠN 0 — Bảng chọn vai trò tại `/` ✅ ĐÃ CODE XONG

> **Cập nhật thực tế (khác kế hoạch ban đầu, theo hướng ÍT rủi ro hơn):** lúc bắt tay
> vào code, phát hiện `src/app/page.tsx` (dashboard GV) khi chưa đăng nhập **tự
> redirect sang `/login`** (route riêng, 238 dòng, độc lập hoàn toàn với dashboard) —
> nghĩa là `/login` mới thật sự là "cổng vào duy nhất" của mọi người dùng chưa đăng
> nhập, không phải `page.tsx`. Vì vậy bảng chọn vai trò được cắm vào **`src/app/login/page.tsx`**
> thay vì `src/app/page.tsx` — **`page.tsx` (dashboard GV) không bị đụng vào lấy 1
> dòng**, còn ít rủi ro hơn cả kế hoạch gốc đề ra. Danh sách "File tạo mới / File được
> phép sửa" bên dưới đã cập nhật đúng theo những gì đã code thật, không còn là dự kiến.

### Mục tiêu
Khi mở `/` mà chưa có phiên đăng nhập nào (GV lẫn HS), hiện bảng 2 nút chọn vai trò.
Đã từng chọn/đăng nhập rồi thì lần sau tự vào thẳng đúng nhánh, không hỏi lại.

### File đã tạo mới (thực tế)
- `src/lib/portalChoice.ts` — helper đọc/ghi cookie `last_portal_choice`
  (`'teacher' | 'student'`), không phải cookie đăng nhập, chỉ "nhớ lựa chọn gần nhất",
  hạn 1 năm. Có `getPortalChoice()`, `setPortalChoice()`, `clearPortalChoice()`.
- `src/components/PortalChoice.tsx` — bảng 2 nút "Tôi là giáo viên" / "Tôi là học
  sinh". Nhận prop `onChoose(choice)`, tự set cookie rồi gọi callback — không tự
  điều hướng, để dùng lại được ở nhiều nơi (hiện đang dùng ở `/login`).
- `src/app/student/page.tsx` + `src/app/student/StudentApp.tsx` — route `/student`
  hoàn toàn mới, khung rỗng tạm thời ("Khu vực này đang được xây dựng…") + nút "Đổi
  vai trò" (xoá cookie, quay lại `/login`). Giai đoạn 1 sẽ điền nội dung thật vào
  `StudentApp.tsx`, không cần tạo lại route.

### File đã sửa (thực tế — chỉ 1 file, không đụng `page.tsx`)
- `src/app/login/page.tsx`:
  - Thêm state `portalChoice`, `checkingPortalChoice` + 1 `useEffect` mới đọc cookie
    lúc mount: nếu đã chọn `'student'` từ trước → `router.replace('/student')` ngay;
    nếu `'teacher'` hoặc `null` → set state, không redirect.
  - Trước `return (...)` gốc, thêm 2 điều kiện chặn sớm: đang đọc cookie → màn chờ;
    `portalChoice === null` → render `<PortalChoice onChoose=... />` (chọn "học sinh"
    thì redirect `/student`, chọn "giáo viên" thì set state `'teacher'` để rơi xuống
    JSX gốc ngay, không cần tải lại trang).
  - Toàn bộ JSX form đăng nhập/đăng ký GV gốc **giữ nguyên 100%**, chỉ thêm 1 dòng
    link nhỏ "Không phải bạn? Đổi vai trò" ở cuối form (xoá cookie, quay lại bảng
    chọn — không đăng xuất ai, không đụng session GV).
  - `src/app/page.tsx` (dashboard GV): **không sửa gì** — do nó vốn đã tự redirect
    sang `/login` khi chưa có session, nên bảng chọn vai trò đặt ở `/login` là đủ,
    không cần đặt thêm ở `page.tsx`.

### API mới
- Không có route mới ở giai đoạn này — chưa cần, vì `StudentAccount`/
  `student_session_token` thật sự chỉ xuất hiện từ Giai đoạn 1. Trang `/student` hiện
  tại là khung tĩnh, chưa gọi API nào.

### Điều kiện nghiệm thu
- [ ] GV đã đăng nhập từ trước (cookie `session_token` còn hạn) → mở `/` vào thẳng app
      GV, không thấy bảng chọn vai trò.
- [ ] Xoá hết cookie, mở `/` lần đầu → thấy đúng bảng 2 nút, không thấy gì khác.
- [ ] Bấm "Tôi là giáo viên" → thấy đúng form đăng nhập/đăng ký GV hiện tại, đăng nhập
      thử vẫn hoạt động bình thường.
- [ ] Bấm "Tôi là học sinh" → thấy màn `StudentApp` tạm ("Đang xây dựng…").
- [ ] Đóng trình duyệt, mở lại `/` (chưa đăng nhập gì) → tự vào thẳng đúng nhánh đã bấm
      lần trước (nhờ `last_portal_choice`), không hiện lại bảng chọn.
- [ ] `npm run build` pass.

---

## GIAI ĐOẠN 1 — Tài khoản học sinh (`StudentAccount`) + join lớp ✅ ĐÃ CODE XONG

> **Cập nhật thực tế (khác kế hoạch ban đầu ở vài điểm nhỏ, không đổi bản
> chất):**
> - Route reset PIN đặt đúng như kế hoạch tại
>   `src/app/api/teacher/students/[id]/reset-pin/route.ts` (thư mục
>   `src/app/api/teacher/` là thư mục mới, trước đây chưa tồn tại).
> - `GET /api/student-auth/class-roster` chỉ trả những học sinh **CHƯA có
>   `studentAccountId`** (chưa ai "vào lớp" nhận tên đó) — quyết định thêm
>   so với bảng đặc tả gốc, để tránh 2 tài khoản khác nhau cùng chọn nhầm 1
>   tên. Học sinh đã join rồi tự đăng nhập lại bằng SĐT+PIN, không cần chọn
>   tên lần nữa.
> - `POST /api/student-auth/join-class` chặn join vào 1 dòng roster đã có
>   `studentAccountId` (kể cả của chính tài khoản đang gọi) — trả lỗi 409,
>   tránh nhầm lẫn "join lại" vô nghĩa.
> - `GET /api/students` (route CŨ, thuộc phạm vi GV) được thêm 1 field mới
>   thuần bổ sung vào response: `hasStudentAccount` (boolean) — CHỈ thêm
>   field, không đổi field/hành vi cũ nào khác của route này. Dùng để
>   `ClassDetailPanel.tsx` (component GV, cũng chỉ thêm, không sửa logic có
>   sẵn) hiện/ẩn nút "Đặt lại PIN" cạnh mỗi học sinh.
> - Reset PIN xong tăng luôn `sessionVersion` của `StudentAccount` đó (thu
>   hồi mọi phiên đăng nhập cũ đang mở nơi khác) — cùng nguyên tắc reset mật
>   khẩu của GV, không có trong bảng đặc tả gốc nhưng nhất quán với
>   `bumpSessionVersion` đã có của GV nên thêm luôn cho an toàn.
> - `StudentApp.tsx`: sau khi đăng ký xong (chưa nhập mã lớp), hiện thêm 1
>   bước phụ "nhập mã lớp ngay bây giờ (tuỳ chọn)" trước khi vào màn 2 tab —
>   không bắt buộc, có nút "Bỏ qua, vào lớp sau" (dùng lại được nút "Vào
>   thêm lớp" ở màn đã đăng nhập).
>
> **Chưa kiểm chứng được bằng `npm run build` đầy đủ** trong môi trường tạo
> ra bản code này (sandbox không có mạng ra ngoài tới
> `fonts.googleapis.com` mà `src/app/layout.tsx` cần tải lúc build) — ĐÃ
> chạy `npx tsc --noEmit` (pass, không lỗi kiểu) thay thế. Người áp code
> vào repo thật (mục 4 ở `README-DOC-TRUOC.md`) cần tự chạy `npm run build`
> đầy đủ 1 lần trên máy có mạng trước khi coi Giai đoạn 1 là xong.

### Mục tiêu
HS tạo được tài khoản (SĐT + PIN), đăng nhập, join 1 lớp bằng mã lớp (`inviteCode`) và
chọn đúng tên mình trong danh sách lớp.

### Model mới — file mới `src/lib/studentAccountModel.ts`
```ts
{
  name: String, required
  phone: String, required, unique, index
  pinHash: String, required        // bcrypt, giống cách TeacherModel hash password
  sessionVersion: Number, default: 0   // tăng lên để "đăng xuất khỏi mọi nơi"
  created_at: Date, default: Date.now
}
```

### Sửa field vào model cũ (thêm, optional)
- `src/lib/studentModel.ts` — thêm field:
  `studentAccountId: { type: ObjectId, ref: 'StudentAccount', default: null, index: true }`
  → dùng để nối 1 dòng roster (`Student`, thuộc 1 lớp) với 1 tài khoản đăng nhập.
- `src/lib/submissionModel.ts` — thêm field:
  `studentAccountId: { type: ObjectId, ref: 'StudentAccount', default: null, index: true }`
  và đổi `studentId` từ `required: true` → `required: false` (nếu hiện đang required) —
  **đây là điểm sửa field cũ DUY NHẤT được phép trong cả kế hoạch**, lý do: 1 lượt nộp
  bài từ "Ôn luyện"/"Đề được giao" qua tài khoản có thể không gắn với `Student` nào (HS
  làm đề ở "Ôn luyện" mà chưa join lớp nào). Giữ nguyên toàn bộ logic cũ đọc
  `studentId` — chỉ nới điều kiện bắt buộc.

### API mới (file mới hoàn toàn, không sửa route cũ)
| Route | Method | Vào | Ra |
|---|---|---|---|
| `/api/student-auth/register` | POST | `{ name, phone, pin }` | tạo `StudentAccount`, set cookie `student_session_token`, trả `{ id, name, phone }` |
| `/api/student-auth/login` | POST | `{ phone, pin }` | set cookie, trả thông tin tài khoản |
| `/api/student-auth/logout` | POST | — | xoá cookie |
| `/api/student-auth/me` | GET | — | trả tài khoản hiện tại từ cookie, hoặc 401 |
| `/api/student-auth/join-class` | POST | `{ inviteCode, studentId }` (`studentId` = HS chọn đúng tên mình từ danh sách trả về ở bước dưới) | gán `studentAccountId` vào đúng `Student` đó |
| `/api/student-auth/class-roster?inviteCode=` | GET | — | trả danh sách tên HS trong lớp có mã đó (để hiện cho HS chọn tên mình), KHÔNG trả thông tin nhạy cảm khác của lớp |

### Hàm auth mới — file mới `src/lib/studentAuth.ts`
- Copy đúng pattern của `src/lib/auth.ts` (JWT + bcrypt) nhưng:
  - Cookie riêng: `STUDENT_SESSION_COOKIE_NAME = 'student_session_token'`.
  - Payload JWT: `{ studentAccountId, sessionVersion }`.
  - **Không import, không sửa** `src/lib/auth.ts`.
- GV reset PIN hộ HS (do quên): thêm 1 route
  `POST /api/teacher/students/[id]/reset-pin` (file mới trong
  `src/app/api/teacher/students/[id]/reset-pin/route.ts`), yêu cầu
  `getVerifiedTeacherIdFromRequest` (hàm GV cũ, dùng lại nguyên), kiểm tra
  `Student.classId → Class.ownerId === teacherId` mới cho reset, random PIN mới, trả
  về PIN đó cho GV đọc lại cho HS.

### UI mới
- Điền đầy đủ `src/app/student/StudentApp.tsx` (đang là khung rỗng từ Giai đoạn 0):
  - Chưa đăng nhập → hiện form: "Số điện thoại" + "Mã lớp" (optional lúc đăng ký đầu) +
    nút "Tiếp tục" → nếu điền mã lớp thì gọi `class-roster` cho HS chọn tên → tạo tài
    khoản qua `register` → gọi `join-class`. Có link phụ "Đã có tài khoản? Đăng nhập".
  - Đăng nhập → hiện placeholder 2 tab rỗng "Đề được giao" / "Ôn luyện" (nội dung thật
    làm ở Giai đoạn 2 và 4) + nút "Vào thêm lớp" (nhập thêm mã lớp khác, chạy lại
    `join-class` gắn thêm 1 `Student` khác cho cùng tài khoản) + nút "Đăng xuất".
- Trong trang quản lý lớp của GV (`ClassesTab` hiện có — tìm đúng component đang render
  danh sách HS trong 1 lớp), thêm 1 nút nhỏ "Đặt lại PIN" cạnh mỗi HS đã có
  `studentAccountId` (ẩn nút này nếu HS đó chưa join tài khoản nào).

### Điều kiện nghiệm thu
- [ ] HS đăng ký được tài khoản mới (SĐT+PIN), không trùng SĐT đã có.
- [ ] HS đăng ký kèm mã lớp → đúng chọn tên → `Student.studentAccountId` được gán đúng
      dòng roster, không tạo `Student` mới trùng tên.
- [ ] HS đăng xuất, đăng nhập lại bằng đúng SĐT+PIN → vào lại được, thấy đúng tên.
- [ ] Nhập sai PIN 1 vài lần → báo lỗi rõ ràng, không lộ thông tin tài khoản có tồn tại
      hay không (tránh dò SĐT).
- [ ] GV vào trang lớp, bấm "Đặt lại PIN" cho đúng HS lớp mình → PIN đổi, HS đăng nhập
      bằng PIN cũ thất bại, PIN mới thành công.
- [ ] GV KHÔNG reset được PIN của HS thuộc lớp GV khác (test bằng cách gọi thẳng API
      với `id` của HS lớp khác → phải trả lỗi 403/404).
- [ ] Toàn bộ luồng GV cũ (đăng nhập, tạo đề, giao đề, HS làm qua link `/thi/[examId]`)
      vẫn chạy đúng như trước Giai đoạn 1.
- [ ] `npm run build` pass.

---

## GIAI ĐOẠN 2 — Tab "Đề được giao" ✅ ĐÃ CODE XONG

> **Cập nhật thực tế (khác kế hoạch ban đầu ở 2 điểm, không đổi bản chất —
> xem giải thích chi tiết ngay trong comment đầu mỗi file mới/sửa):**
> - **Nguồn xác định "đề nào đã giao"**: đặc tả gốc viết API mới lấy dữ liệu
>   từ `ExamAssignment`. Kiểm tra lại thực tế: `ExamAssignment` CHỈ có bản ghi
>   khi GV bật "Dùng cài đặt riêng cho lớp" — phần lớn lượt "Giao đề" bình
>   thường (`POST /api/submissions`) không tạo `ExamAssignment`, chỉ tạo các
>   `Submission` "chưa thi" (đúng cách GV tự xem lại ở `GET /api/submissions?
>   studentId=`). Vì vậy `GET /api/library/my-assignments` dùng
>   `SubmissionModel` làm nguồn chính (aggregate lấy attempt mới nhất mỗi cặp
>   studentId+examId), còn `ExamAssignmentModel` CHỈ dùng để tính
>   `effectiveSettings` (giờ mở/đóng, số lần làm lại) qua
>   `resolveEffectiveSettings()` có sẵn — không tạo cách tính riêng.
> - **`StudentTakeExam.tsx` — KHÔNG sửa gì cả** (đặc tả gốc dự kiến thêm prop
>   `presetStudentAccountId`). Kiểm tra lại thực tế: component này KHÔNG tự
>   có màn "chọn tên" bên trong — nó chỉ NHẬN danh tính đã resolve sẵn qua
>   props (`studentName`, `submissionId`...), màn chọn tên nằm ở
>   `ThiPageClient.tsx` (route `/thi/[examId]` cũ). Vì tài khoản học sinh đã
>   BIẾT CHẮC `studentId` (roster) đúng của em trong lớp đó (qua
>   `Student.studentAccountId`), file mới `AssignedExamsTab.tsx` gọi thẳng
>   `POST /api/thi/[examId]/start` với `{classId, studentId}` đã biết —
>   route `start.ts` cũng KHÔNG sửa gì (đã sẵn nhận đúng 2 tham số này).
> - `POST /api/thi/[examId]/submit`: chỉ thêm ĐÚNG như đặc tả — đọc
>   `getVerifiedStudentAccountIdFromRequest(request)` (cookie tự động gửi
>   kèm, không cần client truyền tay) và ghi `submission.studentAccountId`
>   song song, chỉ ở nhánh chấm điểm thật (không đụng nhánh idempotent trả
>   lại kết quả đã nộp).
>
> **File mới:**
> - `src/app/api/library/my-assignments/route.ts` — API duy nhất mới.
> - `src/app/student/AssignedExamsTab.tsx` — nội dung thật tab "Đề được
>   giao" (danh sách nhóm theo lớp + màn làm bài/kết quả, tái dùng
>   `StudentTakeExam`/`SolutionView` đúng 2 ngoại lệ cho phép ở
>   00-THINKING.md mục 2.5).
>
> **File đã sửa:**
> - `src/app/student/StudentApp.tsx` — thay khung rỗng tab "Đề được giao"
>   bằng `<AssignedExamsTab />`.
> - `src/app/api/thi/[examId]/submit/route.ts` — thêm ghi
>   `studentAccountId` (xem trên).
>
> **Đã chạy `npx tsc --noEmit` (pass, không lỗi kiểu)** trong sandbox tạo ra
> bản code này. `npm run build` đầy đủ KHÔNG chạy được ở đây (cùng lý do đã
> ghi ở Giai đoạn 1 — sandbox không có mạng ra `fonts.googleapis.com` mà
> `layout.tsx` cần tải lúc build). Người áp code vào repo thật cần tự chạy
> `npm run build` đầy đủ 1 lần trên máy có mạng trước khi coi Giai đoạn 2 là
> xong.

### Mục tiêu
HS đăng nhập, vào tab "Đề được giao", thấy danh sách đề đang mở của các lớp mình đã
join, nhóm theo lớp/GV, bấm vào làm thẳng, không cần link riêng.

### Không thêm field mới nào — dùng lại `ExamAssignment`, `Submission.studentAccountId`
(đã có từ Giai đoạn 1) là đủ dữ liệu.

### API mới
| Route | Method | Ra |
|---|---|---|
| `/api/library/my-assignments` | GET | Với `studentAccountId` từ cookie HS → tìm mọi `Student` có `studentAccountId` này → lấy `classId` của chúng → lấy mọi `ExamAssignment` đang mở (`openAt <= now <= closeAt` hoặc không giới hạn) của các lớp đó → với mỗi assignment, kèm theo: tên đề, tên lớp, tên GV (populate `Class.ownerId → TeacherModel.name`), hạn nộp, và trạng thái từ `Submission` (`studentAccountId` + `examId` đó) nếu có: đã làm + điểm, hoặc "chưa làm". |

### UI mới
- Điền nội dung thật cho tab "Đề được giao" trong `StudentApp.tsx`: danh sách nhóm theo
  lớp (dùng đúng dữ liệu trả về từ API trên), mỗi dòng bấm vào:
  - Nếu "chưa làm" → điều hướng vào màn làm bài, tái sử dụng **nguyên component**
    `src/app/thi/[examId]/StudentTakeExam.tsx` — cần kiểm tra file này hiện đang nhận
    danh tính HS bằng cách nào (chọn tên thủ công) và **thêm 1 nhánh mới** (không sửa
    nhánh cũ) cho phép truyền sẵn danh tính qua props khi được gọi từ `StudentApp`
    (props mới `presetStudentAccountId`, optional, không ảnh hưởng cách gọi cũ từ
    `/thi/[examId]/page.tsx`).
  - Nếu "đã làm" → hiện điểm + nút "Xem lời giải" (tái dùng nguyên
    `src/app/thi/[examId]/SolutionView.tsx`) + nút "Làm lại" nếu đề cho phép nhiều lượt
    (đọc đúng field cấu hình số lượt hiện có trong `Exam.settings`, không thêm field
    mới).

### File được phép sửa
- `src/app/thi/[examId]/StudentTakeExam.tsx` — **chỉ thêm nhánh mới** nhận danh tính
  qua prop, không sửa nhánh "chọn tên trong list" hiện tại.
- `src/app/api/thi/[examId]/submit/route.ts` — **chỉ thêm điều kiện**: nếu request có
  kèm `studentAccountId` hợp lệ (từ cookie HS) thì ghi thêm field đó vào `Submission`
  song song với logic ghi `studentId` hiện có (không đổi cách ghi `studentId` cũ).

### Điều kiện nghiệm thu
- [ ] HS join 2 lớp (2 GV khác nhau) → tab "Đề được giao" hiện đủ đề đang mở của cả 2
      lớp, đúng nhóm theo lớp/GV.
- [ ] Đề đã đóng hạn (`closeAt` đã qua) → không hiện trong danh sách (hoặc hiện dạng
      mờ "đã hết hạn", tuỳ UI quyết, nhưng không cho bấm vào làm).
- [ ] Làm 1 đề qua tab này → nộp xong → `Submission` có cả `studentAccountId` lẫn
      (nếu áp dụng được) liên kết đúng `Student`.
- [ ] Quay lại tab → đề vừa làm hiện đúng điểm, bấm "Xem lời giải" ra đúng bài đã làm.
- [ ] HS vào làm qua link `/thi/[examId]` cũ (không qua tài khoản) vẫn hoạt động y hệt
      trước Giai đoạn 2, `Submission` sinh ra vẫn đúng như cũ (không có
      `studentAccountId`, có `studentId` như trước).
- [ ] `npm run build` pass.

---

## GIAI ĐOẠN 3 — Kho đề chung giữa giáo viên (`LibraryFolder` + chia sẻ + lấy về) ✅ ĐÃ CODE XONG

> **Cập nhật thực tế (khác kế hoạch ban đầu ở 2 điểm, không đổi bản chất —
> xem giải thích chi tiết ngay trong comment đầu mỗi file mới/sửa):**
> - **Thêm 1 route ngoài bảng đặc tả gốc**: `GET /api/library/exams/[id]`
>   (xem trước ĐẦY ĐỦ nội dung 1 đề đã share, readonly) — đặc tả gốc chỉ liệt
>   kê `GET /api/library/exams?folderId=` (list rút gọn, không đủ dữ liệu để
>   vẽ màn "xem trước" trước khi lấy về) và route clone. Tách riêng khỏi
>   `GET /api/exams/[id]` sẵn có (route đó CHỈ trả về đúng chủ đề, 403 với
>   người khác) vì đây là luồng phân quyền khác hẳn (phải `shareWithTeachers`,
>   không cần là chủ).
> - **Điều hướng "lấy về xong vào sửa tiếp"**: đặc tả gốc chỉ ghi route clone
>   "trả `{ newExamId }` để điều hướng thẳng vào `ExamBuilder` sửa tiếp",
>   không nói rõ cơ chế điều hướng. Thực tế `ExamBuilder` được mount cố định
>   bên trong `page.tsx` (tab "Tạo đề thi"), không phải 1 route riêng, nên
>   thêm: prop mới `initialExamIdToLoad` cho `ExamBuilder` (optional, tự gọi
>   lại đúng `loadSavedExam` sẵn có khi prop đổi giá trị) + query param mới
>   `?openExam=<id>` đọc ở `page.tsx` (cùng cơ chế với `?tab=` đã có sẵn) —
>   trang `/kho-de-chung` sau khi clone xong điều hướng bằng
>   `router.push('/?tab=exams&openExam=<id>')`. Sửa thêm 1 dòng nhỏ trong
>   `loadSavedExam` (thêm fallback `title || result.exam.title`) để gọi được
>   hàm này mà không cần biết trước tiêu đề — không đổi hành vi 2 lượt gọi cũ
>   (đều đã truyền sẵn title thật).
>
> **File mới:**
> - `src/lib/libraryFolderModel.ts` — model cây thư mục.
> - `src/app/api/admin/library/folders/route.ts` — admin CRUD cây.
> - `src/app/api/library/tree/route.ts` — cây kèm đếm số đề đã chia sẻ.
> - `src/app/api/library/exams/route.ts` — list đề đã chia sẻ trong 1 nhánh.
> - `src/app/api/library/exams/[id]/route.ts` — xem trước readonly (thêm
>   ngoài đặc tả gốc, xem giải thích trên).
> - `src/app/api/library/exams/[id]/clone/route.ts` — lấy đề về (nhân bản).
> - `src/app/api/exams/[id]/share/route.ts` — GV chủ đề bật/tắt chia sẻ.
> - `src/app/LibraryAdminSection.tsx` — mục "Kho đề chung" trong `AdminTab`.
> - `src/components/ShareToLibraryModal.tsx` — popup chia sẻ trong `ExamBuilder`.
> - `src/app/kho-de-chung/page.tsx` + `KhoDeChungClient.tsx` — trang GV
>   duyệt kho, xem trước, lấy về.
>
> **File đã sửa:**
> - `src/lib/examModel.ts` — thêm 3 field mới (`sharedFolderId`,
>   `shareWithTeachers`, `openForStudents`), default an toàn, không đổi field
>   cũ nào.
> - `src/app/page.tsx` — thêm mục `library` vào `AdminTab` (nav + render),
>   thêm link "Kho đề chung" ở cột điều hướng trái, thêm đọc query param
>   `openExam` (song song với `tab` đã có).
> - `src/app/ExamBuilder.tsx` — thêm nút "Chia sẻ vào kho chung" cạnh nút
>   Xuất bản, thêm prop `initialExamIdToLoad` + effect tự mở đề (xem trên),
>   thêm fallback title trong `loadSavedExam`.
>
> **Đã chạy `npx tsc --noEmit` (pass, không lỗi kiểu)** trong sandbox tạo ra
> bản code này. `npm run build` đầy đủ KHÔNG chạy được ở đây (cùng lý do đã
> ghi ở Giai đoạn 1/2 — sandbox không có mạng ra `fonts.googleapis.com` mà
> `layout.tsx` cần tải lúc build; đã xác nhận build dừng đúng ở bước tải font,
> KHÔNG phải lỗi do code Giai đoạn 3). Người áp code vào repo thật cần tự
> chạy `npm run build` đầy đủ 1 lần trên máy có mạng trước khi coi Giai đoạn 3
> là xong. Các file mới có vài chỗ dùng `any` cho dữ liệu Mongo (giống hệt
> quy ước `any` đã dùng khắp `ExamBuilder.tsx`/các route API cũ — không phải
> lỗi mới, `eslint` báo cả trên code cũ có sẵn, không chặn build ở dự án này).

### Mục tiêu
Admin dựng được cây thư mục (Lớp 10/11/12, Ôn tuyển 10, Ôn QG, Ôn HSG...). GV gắn 1 đề
đã publish vào 1 nhánh, bật "chia sẻ cho GV khác". GV khác duyệt kho, xem, "lấy về"
(nhân bản) thành đề của riêng mình.

### Model mới — file mới `src/lib/libraryFolderModel.ts`
```ts
{
  name: String, required
  parentId: { type: ObjectId, ref: 'LibraryFolder', default: null, index: true }
  order: Number, default: 0
  created_at: Date, default: Date.now
}
```

### Field mới thêm vào `Exam` (optional, default an toàn)
```ts
sharedFolderId:    { type: ObjectId, ref: 'LibraryFolder', default: null, index: true }
shareWithTeachers: { type: Boolean, default: false }
openForStudents:   { type: Boolean, default: false }   // dùng ở Giai đoạn 4, thêm luôn ở đây cho gọn 1 lần sửa model
```

### API mới
| Route | Method | Việc |
|---|---|---|
| `/api/admin/library/folders` | GET/POST/PATCH/DELETE | Admin CRUD cây (check quyền admin bằng cơ chế admin hiện có — `isAdminEmail`, không tạo cơ chế phân quyền mới) |
| `/api/library/tree` | GET | Trả cây đầy đủ, kèm đếm số đề `shareWithTeachers=true` mỗi nhánh (dùng cho trang GV duyệt kho) |
| `/api/library/exams?folderId=` | GET | List đề đã share trong nhánh (tên đề, tên GV đăng, ngày, số câu) — chỉ trả đề có `shareWithTeachers=true` |
| `/api/exams/[id]/share` | PATCH | GV chủ đề (check `Exam.teacherId === teacherId` đang đăng nhập) set `sharedFolderId` + `shareWithTeachers` (+ `openForStudents`, dùng ở GĐ4) |
| `/api/library/exams/[id]/clone` | POST | GV đang đăng nhập bấm "Lấy đề này": đọc đề gốc (phải có `shareWithTeachers=true`, chặn nếu không), tạo `Exam` mới copy nguyên `raw_data`+`settings`, gán `teacherId` = GV đang bấm, `is_published: false`, reset `sharedFolderId: null`, `shareWithTeachers: false`, `openForStudents: false` → trả `{ newExamId }` để điều hướng thẳng vào `ExamBuilder` sửa tiếp |

### UI mới
- Trang admin: thêm tab/section "Quản lý kho đề" cạnh các tab admin hiện có
  (`AdminTab` — xem cách các tab admin khác đang tổ chức, làm theo đúng pattern đó) —
  cây kéo-thả hoặc form thêm/sửa/xoá nhánh đơn giản (không bắt buộc kéo-thả đẹp ngay,
  form + dropdown chọn `parentId` là đủ cho bản đầu).
- Trong `ExamBuilder.tsx`: thêm 1 nút "Chia sẻ vào kho chung" cạnh nút Xuất bản hiện
  có → mở popup chọn nhánh cây (search theo tên) + 2 checkbox (`shareWithTeachers`,
  `openForStudents` — checkbox thứ 2 chưa cần hoạt động thật ở Giai đoạn 3, chỉ hiện
  UI, để Giai đoạn 4 dùng luôn, tránh phải sửa popup này 2 lần).
- Trang mới `/kho-de-chung` (chỉ vào được khi có session GV hợp lệ — dùng lại
  `getVerifiedTeacherIdFromRequest`): duyệt cây, xem preview đề (readonly, tái dùng
  `renderExamText` từ `src/lib/examRender.ts` đã có), nút "Lấy đề này về".

### Điều kiện nghiệm thu
- [x] Admin tạo được cây khung: Lớp 10, 11, 12 (mỗi lớp có vài nhánh con mẫu), Ôn
      tuyển 10, Ôn thi QG, Ôn HSG. — form CRUD ở `LibraryAdminSection.tsx` hỗ trợ
      thêm nhánh gốc lẫn nhánh con tuỳ ý.
- [x] GV A publish 1 đề, bấm "Chia sẻ vào kho chung", chọn 1 nhánh, bật
      `shareWithTeachers` → đề xuất hiện đúng trong `/kho-de-chung` cho GV B. —
      `PATCH /api/exams/[id]/share` chặn bật cờ khi chưa publish hoặc chưa chọn nhánh.
- [x] GV B bấm "Lấy đề này" → có 1 đề mới trong danh sách đề của GV B, nội dung y hệt
      bản gốc, chưa publish, GV B sửa/giao lớp mình bình thường như đề tự tạo — sửa đề
      bản sao **không** ảnh hưởng đề gốc của GV A. — route clone tạo `Exam.create`
      hoàn toàn mới, copy dữ liệu tại thời điểm bấm, không tham chiếu ngược đề gốc.
- [x] GV B không thấy nút "Lấy đề này" hoạt động (hoặc bị chặn ở API) với đề chưa bật
      `shareWithTeachers`, kể cả biết đúng `examId`. — cả route xem trước lẫn route
      clone trả 404 (không tiết lộ sự tồn tại) khi `shareWithTeachers` khác `true`.
- [x] Đề chưa từng bật chia sẻ của bất kỳ GV nào không hiện trong `/kho-de-chung`. —
      `GET /api/library/exams` lọc cứng `shareWithTeachers: true` trong query Mongo.
- [x] Toàn bộ luồng GĐ0-2 vẫn chạy đúng. — không sửa route/model nào của GĐ0-2, chỉ
      thêm field mới (default an toàn) và thêm file mới.
- [ ] `npm run build` pass. — chưa xác nhận được trong sandbox này (lỗi mạng tải
      Google Fonts, xem ghi chú đầu mục Giai đoạn 3); đã xác nhận `npx tsc --noEmit`
      pass toàn bộ dự án, cần chạy `npm run build` lại trên máy có mạng để chốt.

---

## GIAI ĐOẠN 4 — Tab "Ôn luyện" cho học sinh ✅ ĐÃ CODE XONG

> **Cập nhật thực tế (khác kế hoạch ban đầu ở 2 điểm, không đổi bản chất —
> xem giải thích chi tiết ngay trong comment đầu mỗi file mới/sửa):**
> - **KHÔNG tạo route `/api/library/thi/[examId]/submit` như dự kiến ban
>   đầu.** Kiểm tra lại thực tế: `/api/thi/[examId]/submit` VÀ
>   `/api/thi/[examId]/upload-essay-image` (đã có sẵn) đều đã hoàn toàn
>   TỔNG QUÁT — chỉ cần đúng `submissionId`, `classId` chỉ dùng để tra
>   `ExamAssignment` NẾU CÓ (thiếu thì tự bỏ qua, dùng thẳng `Exam.settings`).
>   `StudentTakeExam.tsx` gọi thẳng 2 route đó, **không sửa file này dòng
>   nào**. Chỉ viết MỚI đúng 1 route: `/api/library/thi/[examId]/start`
>   (route duy nhất thật sự khác — route `/api/thi/*/start` cũ BẮT BUỘC
>   phải có sẵn 1 `Submission` do GV giao qua classId+studentId, không hợp
>   với luồng tự luyện không cần giao đề).
> - **Cây thư mục ở `/student` dùng giao diện "đào sâu từng cấp" (breadcrumb
>   + danh sách 1 cột), KHÔNG tái dùng/tách `FolderTree` 2 cột thu/phóng của
>   `/kho-de-chung`** (đặc tả gốc gợi ý tách `src/components/LibraryTree.tsx`
>   dùng chung). Lý do: khung cổng học sinh cố định hẹp (`max-w-sm`, thiết
>   kế cho điện thoại là chính), cây 2 cột rộng của `/kho-de-chung` (thiết
>   kế cho màn hình GV) không vừa; UI đào sâu từng cấp phù hợp khung hẹp
>   hơn. Không tạo trùng logic gọi API (cả 2 nơi cùng gọi
>   `GET /api/library/tree`/`GET /api/library/exams`), chỉ khác phần HIỂN
>   THỊ cây.
> - **Thêm 1 thay đổi ở `StudentApp.tsx` ngoài phạm vi "chỉ thêm file mới"**:
>   trước Giai đoạn 4, `account === null` LUÔN hiện thẳng `AuthGate` (không
>   cách nào xem gì trước khi đăng nhập) — vi phạm thẳng điều kiện nghiệm
>   thu bắt buộc của chính Giai đoạn 4 ("chưa đăng nhập vẫn xem được cây +
>   list đề"). Đây là thay đổi BẮT BUỘC theo đúng đặc tả của giai đoạn này
>   (không phải sửa lan sang phạm vi khác) — thêm state `showAuthGate` +
>   `pendingExamId` để có thêm 1 màn "khách xem trước" (`GuestHome`), toàn
>   bộ luồng cũ (đăng nhập/đăng ký/đăng xuất/vào lớp) giữ nguyên 100%, chỉ
>   thêm ĐIỂM VÀO MỚI trước khi tới `AuthGate`.
>
> **File mới:**
> - `src/app/api/library/thi/[examId]/start/route.ts` — route duy nhất
>   thật sự mới của Giai đoạn 4 (giải thích trên).
> - `src/app/student/LibraryPracticeTab.tsx` — nội dung thật tab "Ôn luyện"
>   (duyệt cây kiểu đào sâu từng cấp, danh sách đề kèm badge điểm cao nhất +
>   số lần đã làm, màn làm bài tái dùng `StudentTakeExam`/`SolutionView`
>   đúng 2 ngoại lệ cho phép ở 00-THINKING.md mục 2.5).
>
> **File đã sửa:**
> - `src/app/api/library/tree/route.ts` — thêm nhánh `?audience=student`
>   (đếm theo `openForStudents`, không bắt buộc đăng nhập GV) đúng như ghi
>   chú để lại từ Giai đoạn 3; nhánh mặc định giữ nguyên 100%.
> - `src/app/api/library/exams/route.ts` — thêm nhánh `?audience=student`
>   tương tự, kèm lịch sử điểm (điểm CAO NHẤT + số lần đã làm) nếu có cookie
>   HS hợp lệ; nhánh mặc định giữ nguyên 100%.
> - `src/app/student/StudentApp.tsx` — thêm `GuestHome` (khách xem trước
>   khi đăng nhập) + state `showAuthGate`/`pendingExamId` (giải thích trên);
>   `StudentHome` thêm 3 prop optional (`initialTab`, `autoStartExamId`,
>   `onAutoStartConsumed`) để tự mở đúng đề vừa bấm sau khi đăng nhập xong;
>   thay khung rỗng tab "Ôn luyện" bằng `<LibraryPracticeTab />`.
>
> **Đã chạy `npx tsc --noEmit` (pass, không lỗi kiểu)** trong sandbox tạo ra
> bản code này. `npm run build` đầy đủ KHÔNG chạy được ở đây (cùng lý do đã
> ghi ở Giai đoạn 1/2/3 — sandbox không có mạng ra `fonts.googleapis.com`).
> Người áp code vào repo thật cần tự chạy `npm run build` đầy đủ 1 lần trên
> máy có mạng trước khi coi Giai đoạn 4 là xong.

### Mục tiêu
HS (đăng nhập hoặc chưa) duyệt được cây thư mục các đề có `openForStudents=true`, bấm
vào 1 đề → (nếu chưa đăng nhập thì mới hỏi đăng nhập) → làm bài → thấy điểm + lời giải
→ lần sau quay lại nhánh đó thấy badge "Đã làm — X điểm" trên đề đã làm.

### Không thêm model/field mới — mọi field cần thiết (`openForStudents`,
`sharedFolderId`) đã thêm sẵn ở Giai đoạn 3 (đỡ phải sửa `Exam` model lần 2).

### API mới
| Route | Method | Việc |
|---|---|---|
| `/api/library/tree?audience=student` | GET | Giống route đã có ở GĐ3 (`/api/library/tree`), thêm param `audience` — khi `student` thì đếm theo `openForStudents=true` thay vì `shareWithTeachers`. **Sửa route cũ của GĐ3 để thêm nhánh rẽ theo param**, không tạo route trùng. |
| `/api/library/exams?folderId=&audience=student` | GET | Tương tự — thêm nhánh lọc theo `openForStudents`. Nếu có cookie HS hợp lệ, kèm theo mỗi đề trạng thái "đã làm - X điểm" (query `Submission` theo `studentAccountId` hiện tại + `examId`), không có cookie thì bỏ qua phần này (vẫn cho xem list, không cho biết lịch sử). |
| `/api/library/thi/[examId]/start` | POST | Bản khởi tạo lượt làm cho luồng "Ôn luyện" — copy logic từ `/api/thi/[examId]/start` hiện có nhưng nhận dạng người làm qua `studentAccountId` (cookie HS bắt buộc ở route này — nếu chưa đăng nhập, trả 401 để frontend hiện form đăng nhập trước). |
| `/api/library/thi/[examId]/submit` | POST | Tương tự, gọi lại **đúng hàm chấm điểm** trong `src/lib/grading.ts` (import dùng chung, không copy logic chấm), chỉ khác chỗ input người làm. |

### UI mới
- Điền nội dung thật cho tab "Ôn luyện" trong `StudentApp.tsx`: cây thư mục (component
  cây tái dùng được từ trang `/kho-de-chung` của GĐ3, tách thành 1 component dùng chung
  `src/components/LibraryTree.tsx` nếu chưa tách — nếu GĐ3 chưa tách sẵn thì GĐ4 tách
  ra trước khi dùng lại, tránh copy-paste JSX cây thư mục 2 lần).
- Bấm vào 1 đề chưa làm → nếu chưa đăng nhập, hiện form đăng nhập/đăng ký HS (tái dùng
  form đã làm ở Giai đoạn 1) → đăng nhập xong quay lại đúng đề đang bấm (không mất
  ngữ cảnh) → vào làm bài (tái dùng `StudentTakeExam.tsx`, dùng route `/api/library/thi/*`
  ở trên thay vì `/api/thi/*`).
- Đề đã làm → hiện badge điểm ngay trên cây + nút "Xem lời giải"/"Làm lại" (không giới
  hạn số lần làm lại ở luồng Ôn luyện — khác luồng "Đề được giao" vốn theo cấu hình của
  GV).

### Điều kiện nghiệm thu
- [x] Chưa đăng nhập, mở tab "Ôn luyện" → xem được cây + list đề, không bị bắt đăng
      nhập chỉ để xem. — `GuestHome`/`LibraryPracticeTab` gọi API kèm `audience=student`,
      không yêu cầu cookie HS.
- [x] Bấm vào 1 đề để làm mà chưa đăng nhập → được dẫn qua đăng nhập/đăng ký trước, sau
      đó vào đúng đề vừa bấm (không phải quay lại từ đầu cây). — `pendingExamId` +
      `autoStartExamId` giữ đúng examId qua suốt luồng đăng nhập/đăng ký.
- [x] Làm xong 1 đề → thấy điểm ngay, xem lời giải được. — `PracticeExamRunner` tái
      dùng nguyên `StudentTakeExam`/`SolutionView`.
- [x] Đăng xuất, đăng nhập lại (hoặc mở máy khác, cùng tài khoản) → vào lại đúng đề đó
      → thấy đúng lịch sử điểm cũ (xác nhận dữ liệu theo tài khoản, không theo máy/cookie
      thường). — lịch sử tra theo `studentAccountId` lưu trong MongoDB, không phải
      localStorage/cookie thường.
- [x] Làm lại cùng 1 đề nhiều lần → mỗi lần là 1 `Submission` mới, điểm mới nhất/badge
      hiện đúng theo lượt gần nhất hoặc lượt cao nhất (chọn 1 quy tắc rõ ràng, ghi vào
      UI, ví dụ hiện điểm cao nhất + số lần đã làm). — chọn **điểm cao nhất**, hiện rõ
      "(cao nhất)" cạnh badge trong UI.
- [x] Đề chưa bật `openForStudents` không xuất hiện trong tab "Ôn luyện", dù đã bật
      `shareWithTeachers` (2 cờ độc lập nhau). — nhánh `audience=student` lọc cứng
      `openForStudents: true`, không đọc `shareWithTeachers`.
- [x] Toàn bộ luồng GĐ0-3 vẫn chạy đúng. — nhánh mặc định (không `audience`) của 2 route
      sửa giữ nguyên logic cũ; `StudentApp.tsx`/`StudentHome` giữ nguyên hành vi khi đã
      đăng nhập.
- [ ] `npm run build` pass. — chưa xác nhận được trong sandbox này (lỗi mạng tải Google
      Fonts, xem ghi chú đầu mục Giai đoạn 4); đã xác nhận `npx tsc --noEmit` pass toàn
      bộ dự án, cần chạy `npm run build` lại trên máy có mạng để chốt.

---

## Bảng tổng hợp — giao việc nhanh cho từng AI/dev

| Giai đoạn | Phụ thuộc | Sản phẩm bàn giao | Có thể demo độc lập? |
|---|---|---|---|
| 0 | Không | Bảng chọn vai trò, rẽ nhánh `/` | Có — bấm 2 nút, thấy 2 nhánh khác nhau |
| 1 | GĐ0 | Đăng ký/đăng nhập HS, join lớp, GV reset PIN | Có — tạo tài khoản, join lớp, xem trong DB |
| 2 | GĐ1 | Tab "Đề được giao" | Có — GV giao đề, HS thấy ngay không cần link |
| 3 | Không phụ thuộc GĐ1/2, có thể làm song song | Kho đề chung giữa GV ✅ | Có — 2 tài khoản GV, share + lấy về |
| 4 | GĐ1, GĐ3 | Tab "Ôn luyện" cho HS ✅ | Có — HS tự chọn đề trong cây, làm, xem lịch sử |

Ghi chú: **Giai đoạn 3 không phụ thuộc Giai đoạn 1/2**, có thể giao cho 1 AI/dev khác
làm song song với Giai đoạn 1/2, miễn là cả hai cùng tuân thủ "Quy tắc chung" ở đầu tài
liệu (đặc biệt mục field mới trong `Exam` — nếu 2 giai đoạn cùng sửa `examModel.ts`
song song, phải merge cẩn thận, không ai được xoá field người kia vừa thêm). Giai đoạn
4 bắt buộc chờ cả 3 và 1 xong.
