# Đặc tả tính năng "Khối" — gửi 1 link chung cho nhiều lớp

Tài liệu bàn giao kỹ thuật. Toàn bộ nội dung dưới đây đã được thống nhất qua trao đổi trực tiếp với giáo viên (chủ dự án), không còn điểm mơ hồ. Người triển khai chỉ cần đọc và làm theo, không cần hỏi lại thiết kế trừ khi phát sinh chi tiết ngoài phạm vi mô tả.

## 1. Bài toán gốc

Hiện tại mỗi lớp có 1 link thi riêng dạng `/thi/{examId}?class={classId}`. Giáo viên dạy nhiều lớp cùng khối (ví dụ 7 lớp khối 12) phải gửi 7 link khác nhau cho 1 đợt kiểm tra chung. Mong muốn: gửi **1 link duy nhất** cho gộp nhiều lớp, nhưng **không được phá vỡ** bất kỳ hành vi nào đang chạy đúng (roster theo lớp, chấm điểm theo lớp, cài đặt riêng theo lớp).

## 2. Nguyên tắc cốt lõi (bắt buộc tuân thủ)

- **Không sửa** `ExamModel`, `ExamAssignmentModel`, `examAccessRules.ts` (`resolveEffectiveSettings`), các route `start`/`submit`/`self-register` hiện có, cũng như logic chấm điểm/roster. Toàn bộ những phần này **giữ nguyên 100%**.
- **"Khối" không lưu trạng thái cài đặt riêng của chính nó.** Không có bảng "cài đặt cấp khối" nào tồn tại độc lập. Khối chỉ là:
  1. Một cách **nhóm hiển thị** các lớp cùng khối lớp (10/11/12...) để chọn nhanh khi giao đề hàng loạt.
  2. Một cơ chế sinh **1 link chung** trỏ tới đúng tập lớp đã được giao trong 1 lượt giao đề.
- Khi giao đề qua Khối kèm cài đặt riêng, cài đặt đó được **ghi thẳng vào `ExamAssignment` của từng lớp đã tick** — hệt như giáo viên tự vào từng lớp bật "dùng cài đặt riêng" và lưu, chỉ khác là làm 1 lần cho nhiều lớp. Cơ chế ưu tiên cài đặt (`resolveEffectiveSettings`: mặc định của đề → riêng của lớp nếu có) **không đổi, không thêm tầng nào**.
- Lớp **không được tick** trong lượt giao đề đó **không có `ExamAssignment`** cho đề này → không có link, không hiện trong bất kỳ danh sách chọn lớp nào, không bị ảnh hưởng.
- Sau khi giao qua Khối, giáo viên vẫn có thể **vào thẳng 1 lớp** để sửa cài đặt riêng của đúng lớp đó — thao tác độc lập, không liên quan gì đến Khối.
- Mở lại đúng lượt giao đề đã làm qua Khối trước đó (ví dụ để sửa giờ thi) → màn hình **tự tick sẵn đúng các lớp đã chọn lần trước**, sửa và lưu lại thì **chỉ áp lại cho đúng các lớp đó**, không tự động lan sang lớp khác trong khối.

## 3. Data model

### 3.1 `KhoiModel` (mới)

```ts
{
  name: string,          // ví dụ "Khối 12"
  grade: number,         // 6-12, dùng để nhận diện/migrate, không hiển thị bắt buộc
  schoolYear: string,    // ví dụ "2025 - 2026", tách khối theo từng năm học
  ownerId: ObjectId,     // ref Teacher — mỗi GV có khối riêng, giống ClassModel.ownerId
  created_at: Date
}
// unique index: (ownerId, schoolYear, grade)
```

### 3.2 `ClassModel` (sửa — thêm field, KHÔNG đổi field cũ)

```ts
khoiId: { type: ObjectId, ref: 'Khoi', default: null, required: false }
```
Lớp cũ không có `khoiId` vẫn hoạt động y như hiện tại. Field optional, không breaking change.

### 3.3 `ExamGroupLinkModel` (mới — đại diện cho 1 "lượt giao đề qua Khối" = 1 link chung)

```ts
{
  code: string,              // mã ngắn, random, unique, dùng trên URL (?g=code)
  examId: ObjectId,          // ref Exam
  khoiId: ObjectId,          // ref Khoi — chỉ để hiển thị UI, không dùng để tính quyền truy cập
  classIds: [ObjectId],      // DANH SÁCH LỚP THỰC TẾ đã được giao trong lượt này — nguồn sự thật duy nhất
  ownerId: ObjectId,         // ref Teacher, để kiểm tra quyền khi GV mở lại sửa
  created_at: Date,
  updated_at: Date
}
// unique index: (examId, khoiId) — mỗi cặp đề+khối chỉ có 1 lượt giao group đang hoạt động,
// mở lại để sửa thì upsert đúng bản ghi này (không tạo mã mới, giữ nguyên link đã gửi ra).
```

Bản ghi này **không lưu settings** — settings luôn nằm ở `ExamAssignment` của từng lớp trong `classIds`. `classIds` ở đây chỉ dùng để: (a) biết link chung này dẫn tới những lớp nào, (b) khi mở lại màn giao đề thì tick sẵn đúng các lớp này.

## 4. Nhận diện & migrate khối cho lớp có sẵn

### 4.1 Hàm nhận diện số khối từ tên lớp

Không neo đầu chuỗi — số khối có thể nằm ở bất kỳ vị trí nào trong tên (`"10"`, `"11A1"`, `"lớp 12"`, `"Lớp 12A3"`). Quét toàn bộ các cụm số trong chuỗi, lấy cụm **đầu tiên** rơi vào khoảng hợp lệ 6–12:

```js
function detectGrade(className) {
  const matches = className.match(/\d{1,2}/g) || [];
  for (const m of matches) {
    const n = parseInt(m, 10);
    if (n >= 6 && n <= 12) return n;
  }
  return null;
}
```

Đã kiểm chứng: `"12A1"` → 12, `"lớp 12A3"` → 12 (bỏ qua cụm `3`), `"11A1"` → 11 (bỏ qua cụm `1` vì ngoài khoảng 6–12). Hàm chỉ **đọc** `className` để suy luận, **không** sửa/ghi lại field `name`.

### 4.2 Script migrate (chạy 1 lần, không chạy nền liên tục)

Với mỗi lớp hiện có trong DB:
1. Tính `grade = detectGrade(class.name)`.
2. Nếu `grade === null` → bỏ qua, giữ `khoiId = null`.
3. Nếu có `grade` → `find-or-create` 1 bản ghi `Khoi` theo khóa `(ownerId, schoolYear, grade)` (dùng đúng `schoolYear` và `ownerId` sẵn có trên chính lớp đó) → set `class.khoiId = khoi._id`.

Không sửa/xóa bất kỳ field nào khác của lớp hay học sinh. An toàn khi chạy lại nhiều lần (idempotent).

### 4.3 Sau migrate — lớp không nhận diện được

Trang danh sách Lớp cần thêm 1 bộ lọc "Lớp chưa phân khối" để GV thấy và tự gán bằng dropdown (không cần chạy lại script).

### 4.4 Từ nay về sau (tạo mới)

Không cần script gì thêm. Luồng: GV vào trang Khối → **tạo Khối mới** (chọn/nhập số khối + năm học) → vào Khối đó bấm **"+ Thêm lớp"** → 2 lựa chọn: (a) tạo lớp mới (tự động gán sẵn `khoiId` = khối đang mở), hoặc (b) gán 1 lớp có sẵn (đang `khoiId = null`) vào khối này.

## 5. UI/UX — Trang Khối

Mirror đúng UX của trang Lớp hiện có (bố cục quen thuộc, giáo viên không phải học lại thao tác mới).

- **Danh sách Khối**: giống danh sách Lớp, mỗi Khối hiển thị tên, năm học, số lớp con.
- **Trang chi tiết 1 Khối**: liệt kê các lớp con (chỉ đọc — không sửa roster ở đây, roster vẫn quản lý trong trang Lớp như cũ). Có 2 nút:
  - **"+ Thêm lớp"** — xem mục 4.4.
  - **"Giao đề"** — mở modal:
    1. Chọn 1 đề từ danh sách đề đã xuất bản của GV (tái dùng UI chọn đề đã có).
    2. Hiện checklist các lớp con trong khối, có nút "chọn tất cả". GV tick lớp muốn giao (ví dụ 3/7).
    3. Form cài đặt tùy chọn (thời gian làm bài, giờ mở/đóng, số lần làm lại, hiện lời giải...) — **đúng các field đã có** ở panel giao đề cấp lớp hiện tại, tái dùng UI đó chứ không làm mới. Nếu GV không đổi gì, các lớp được tick vẫn dùng mặc định của đề (không set `hasCustomSettings`).
    4. Bấm **Lưu** → với **từng lớp đã tick**: upsert `ExamAssignment(examId, classId)`, nếu có sửa cài đặt thì set `hasCustomSettings = true` + `settings = {...}` (đúng các field GV đổi). Đồng thời upsert `ExamGroupLink(examId, khoiId)` với `classIds = [danh sách lớp vừa tick]`, sinh `code` nếu là lần đầu (giữ nguyên `code` cũ nếu là sửa lại lượt đã có).
  - Mở lại "Giao đề" cho đúng cặp (đề, khối) đã từng giao → tick sẵn đúng theo `ExamGroupLink.classIds` hiện tại, không phải tick lại từ đầu.

## 6. Link chung & luồng học sinh

- Link chung dạng: `/thi/{examId}?g={code}` (so với link lớp cũ `/thi/{examId}?class={classId}` — 2 dạng tồn tại song song, GV chọn gửi loại nào tùy đợt).
- **API mới** (public, tối thiểu dữ liệu): `GET /api/thi/{examId}/group/{code}` → trả về danh sách `{ classId, className }` lấy từ `ExamGroupLink.classIds` (join sang `ClassModel` chỉ lấy tên, không trả roster/danh sách học sinh).
- **Trang `/thi/[examId]/page.tsx`**: thêm nhánh xử lý khi có param `g` (thay vì `class`):
  1. Gọi API trên để lấy danh sách lớp thuộc link chung này.
  2. Hiện bước **chọn lớp** (danh sách tên lớp, học sinh tự bấm chọn lớp mình).
  3. Sau khi chọn lớp → set `classId` tương ứng → **rơi thẳng vào đúng luồng hiện có** (chọn tên / tự báo danh / start / submit...) — không viết lại logic này, chỉ tái sử dụng y nguyên bằng cách gán đúng `classId` đã xác định.
- Nếu học sinh mở link lớp cũ (`?class=`) → **không đổi gì**, vào thẳng bước chọn tên như hiện tại, không thấy bước chọn lớp.

## 7. Việc KHÔNG làm (đã cân nhắc và loại bỏ trong quá trình trao đổi)

- ❌ Không tạo bảng "cài đặt mặc định cấp khối" sống độc lập, không thêm tầng ưu tiên thứ 3 vào `resolveEffectiveSettings`. Lý do: giáo viên xác nhận mọi cài đặt cuối cùng đều cần rơi về đúng cấp lớp, khối chỉ là thao tác hàng loạt (bulk action) chứ không phải 1 cấp cấu hình sống riêng.
- ❌ Không tự động giao đề cho *toàn bộ* lớp trong khối khi bấm "Giao đề" — luôn phải tick chọn (dù có nút chọn nhanh tất cả), vì giáo viên có thể chỉ muốn giao cho 1 phần lớp trong khối.
- ❌ Không sửa/ghi đè field `name` của lớp trong quá trình nhận diện khối.

## 8. Danh sách file cần đụng tới (tham khảo, theo cấu trúc source hiện có)

- `src/lib/classModel.ts` — thêm field `khoiId`.
- `src/lib/khoiModel.ts` — model mới.
- `src/lib/examGroupLinkModel.ts` — model mới.
- Script/route migrate 1 lần (ví dụ `scripts/migrate-khoi.ts` hoặc 1 admin route tạm) — chứa `detectGrade()` + logic ở mục 4.2.
- Trang quản lý mới cho Khối (list + chi tiết) — đặt cạnh trang quản lý Lớp hiện có, tái dùng component/style.
- API mới: CRUD Khối, thêm lớp vào khối, giao đề hàng loạt theo khối (ghi vào `ExamAssignment` + `ExamGroupLink`), và `GET /api/thi/[examId]/group/[code]` (public).
- `src/app/thi/[examId]/page.tsx` — thêm nhánh xử lý param `g` (bước chọn lớp) trước khi rơi vào luồng cũ.
- **Không đụng**: `examModel.ts`, `examAssignmentModel.ts`, `examAccessRules.ts`, các route `start`/`submit`/`self-register` hiện có.
