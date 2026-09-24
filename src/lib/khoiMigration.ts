import { ClassModel } from './classModel';
import { KhoiModel } from './khoiModel';

// Nhận diện số khối (6-12) từ tên lớp — dùng cho migrate lớp có sẵn (Phần 2)
// VÀ có thể tái dùng ở UI sau này (ví dụ gợi ý khối khi tạo lớp mới). KHÔNG
// neo đầu chuỗi: số khối có thể nằm ở bất kỳ vị trí nào trong tên
// ("10", "11A1", "lớp 12", "Lớp 12A3"). Quét toàn bộ các cụm số 1-2 chữ số
// trong chuỗi, lấy cụm ĐẦU TIÊN rơi vào khoảng hợp lệ 6-12.
//
// Đã kiểm chứng: "12A1" → 12 | "lớp 12A3" → 12 (bỏ qua cụm "3") |
// "11A1" → 11 (bỏ qua cụm "1" vì ngoài khoảng 6-12) | "10" → 10.
//
// Hàm chỉ ĐỌC className để suy luận — KHÔNG sửa/ghi lại field name của lớp.
export function detectGrade(className: string): number | null {
  const matches = className.match(/\d{1,2}/g) || [];
  for (const m of matches) {
    const n = parseInt(m, 10);
    if (n >= 6 && n <= 12) return n;
  }
  return null;
}

// Kết quả trả về sau khi chạy migrate — dùng để hiển thị lại cho GV/admin
// biết đã xử lý được bao nhiêu lớp, tránh phải mò log server.
export interface MigrateKhoiResult {
  totalClasses: number;
  migratedCount: number; // số lớp được gán khoiId (mới hoặc giữ nguyên đã đúng)
  skippedCount: number; // số lớp không nhận diện được khối (tên lạ) — khoiId giữ null
  khoiCreatedCount: number; // số bản ghi Khoi MỚI được tạo trong lượt chạy này
  skippedClassNames: string[]; // tên các lớp bị bỏ qua, để GV biết cần tự gán tay ở đâu
}

// Kết quả xử lý MỘT lớp — dùng làm khối xây dựng chung cho cả
// migrateKhoiForAllClasses() (batch, admin) VÀ route /api/khoi (GET) tự
// "bắt kịp" cho từng GV (Phần 6). Giữ tách riêng khỏi MigrateKhoiResult
// (kết quả tổng hợp nhiều lớp) vì 2 nơi gọi cần tổng hợp khác nhau.
export interface MigrateOneClassResult {
  matched: boolean; // detectGrade(tên lớp) có ra kết quả hợp lệ hay không
  khoiCreated: boolean; // có tạo MỚI 1 bản ghi Khoi trong lượt gọi này không (chỉ có ý nghĩa khi matched = true)
  khoiId: string | null; // khoiId sau khi xử lý (null nếu matched = false, giữ nguyên như trước)
}

// Xử lý ĐÚNG 1 lớp: nhận diện khối từ tên, find-or-create Khoi tương ứng rồi
// gán khoiId cho lớp nếu cần — đây là phần lõi mà migrateKhoiForAllClasses()
// và route GET /api/khoi (Phần 6, tự "bắt kịp" theo từng GV) đều dùng
// CHUNG, tránh viết lại logic upsert 2 nơi dễ lệch nhau. AN TOÀN KHI GỌI
// LẠI NHIỀU LẦN CHO CÙNG 1 LỚP (idempotent) — xem chú thích chi tiết ở
// migrateKhoiForAllClasses() bên dưới, áp dụng y hệt ở đây vì đó chính là
// vòng lặp gọi hàm này cho từng lớp.
export async function migrateKhoiForOneClass(cls: {
  _id: unknown;
  name: string;
  ownerId: unknown;
  schoolYear: string;
  khoiId?: unknown;
}): Promise<MigrateOneClassResult> {
  const grade = detectGrade(cls.name);

  if (grade === null) {
    return { matched: false, khoiCreated: false, khoiId: null }; // giữ khoiId = null (mặc định của schema), không đụng tới lớp này
  }

  // find-or-create theo đúng khoá unique (ownerId, schoolYear, grade) — dùng
  // upsert để tránh race condition khi chạy migrate cho nhiều lớp cùng lúc
  // (2 lớp cùng khối, cùng năm học, cùng GV chỉ tạo ra đúng 1 bản ghi Khoi).
  const beforeCount = await KhoiModel.countDocuments({
    ownerId: cls.ownerId,
    schoolYear: cls.schoolYear,
    grade,
  });

  const khoi = await KhoiModel.findOneAndUpdate(
    { ownerId: cls.ownerId, schoolYear: cls.schoolYear, grade },
    {
      $setOnInsert: {
        name: `Khối ${grade}`,
        grade,
        schoolYear: cls.schoolYear,
        ownerId: cls.ownerId,
        created_at: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  const khoiCreated = beforeCount === 0;

  if (String(cls.khoiId || '') !== String(khoi._id)) {
    await ClassModel.updateOne({ _id: cls._id }, { $set: { khoiId: khoi._id } });
  }

  return { matched: true, khoiCreated, khoiId: String(khoi._id) };
}

// Chạy 1 lần cho TOÀN BỘ lớp hiện có trong DB. AN TOÀN KHI CHẠY LẠI NHIỀU
// LẦN (idempotent):
//   - Khoi dùng findOneAndUpdate({...}, {$setOnInsert: ...}, {upsert: true})
//     theo đúng khoá unique (ownerId, schoolYear, grade) từ Phần 1 → chạy lại
//     không bao giờ tạo thêm bản ghi Khoi trùng, luôn trả về đúng bản ghi đã
//     có nếu đã tồn tại.
//   - Lớp đã có khoiId đúng rồi thì ghi lại y hệt giá trị cũ — không đổi kết
//     quả giữa các lần chạy.
//
// KHÔNG sửa/xoá bất kỳ field nào khác của lớp hay học sinh. KHÔNG đụng tới
// StudentModel, SubmissionModel, hay bất kỳ dữ liệu điểm/roster nào.
//
// Phần 6: giữ NGUYÊN chữ ký/hành vi/API — chỉ đổi phần lõi bên trong vòng
// lặp để gọi migrateKhoiForOneClass() dùng chung, không viết lại logic upsert.
export async function migrateKhoiForAllClasses(): Promise<MigrateKhoiResult> {
  const classes = await ClassModel.find({}).lean();

  let migratedCount = 0;
  let skippedCount = 0;
  let khoiCreatedCount = 0;
  const skippedClassNames: string[] = [];

  for (const cls of classes as any[]) {
    const result = await migrateKhoiForOneClass(cls);

    if (!result.matched) {
      skippedCount += 1;
      skippedClassNames.push(cls.name);
      continue;
    }

    if (result.khoiCreated) {
      khoiCreatedCount += 1;
    }

    migratedCount += 1;
  }

  return {
    totalClasses: classes.length,
    migratedCount,
    skippedCount,
    khoiCreatedCount,
    skippedClassNames,
  };
}
