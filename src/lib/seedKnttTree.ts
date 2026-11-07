import mongoose from 'mongoose';
import { LibraryFolder } from '@/lib/libraryFolderModel';
import { KNTT_TOAN_TREE, KNTT_EXAM_FOLDERS, reviewFolderName } from '@/data/knttToanTree';
import { QG_ROOT_NAME, QG_MOCK_ROOT_NAME, QG_TOPICS } from '@/data/qgTree';

// Tạo cây thư mục Ôn luyện Toán 10/11/12 theo SGK Kết nối tri thức:
//   Chủ đề lớp N > Chương > (Bài ... + Ôn tập chương)
//   Chủ đề lớp N > GK1, CK1, GK2, CK2 (nhánh đề kiểm tra theo kỳ)
//   Gốc "Ôn thi THPT QG 2027" (Ôn luyện) và "Thi thử THPT QG 27" (Thi thử)
// An toàn khi chạy lại: nhánh đã có (cùng tên, cùng nhánh cha) được giữ nguyên, chỉ tạo phần thiếu.
export async function seedKnttTree(): Promise<{ created: number; skipped: number }> {
  const all: any[] = await LibraryFolder.find().lean();
  const keyOf = (parentId: unknown, name: string) => `${parentId ? String(parentId) : 'root'}|${name}`;
  const existing = new Map<string, any>();
  for (const f of all) existing.set(keyOf(f.parentId, f.name), f);

  let created = 0;
  let skipped = 0;

  async function ensure(parentId: unknown, name: string, order: number) {
    const key = keyOf(parentId, name);
    const found = existing.get(key);
    if (found) {
      skipped++;
      return found._id;
    }
    const doc = await LibraryFolder.create({ name, parentId: parentId || null, order });
    existing.set(key, doc);
    created++;
    return doc._id;
  }

  for (let gi = 0; gi < KNTT_TOAN_TREE.length; gi++) {
    const grade = KNTT_TOAN_TREE[gi];
    const gradeId = await ensure(null, grade.name, gi);
    for (let ci = 0; ci < grade.chapters.length; ci++) {
      const ch = grade.chapters[ci];
      const chapterId = await ensure(gradeId, ch.name, ci);
      for (let li = 0; li < ch.lessons.length; li++) {
        await ensure(chapterId, ch.lessons[li], li);
      }
      await ensure(chapterId, reviewFolderName(ch.name), ch.lessons.length);
    }
    for (let ei = 0; ei < KNTT_EXAM_FOLDERS.length; ei++) {
      await ensure(gradeId, KNTT_EXAM_FOLDERS[ei], grade.chapters.length + ei);
    }
  }

  // Hai nhánh gốc THPT QG 2027: một cho Ôn luyện, một cho Thi thử (Ôn luyện có 9 chuyên đề con, Thi thử không có nhánh con).
  const qgId = await ensure(null, QG_ROOT_NAME, KNTT_TOAN_TREE.length);
  for (let ti = 0; ti < QG_TOPICS.length; ti++) await ensure(qgId, QG_TOPICS[ti], ti);
  await ensure(null, QG_MOCK_ROOT_NAME, KNTT_TOAN_TREE.length + 1);
  return { created, skipped };
}

// Tự tạo cây khi hệ thống được mở. Mỗi phiên bản cây (SEED_VERSION) chỉ chạy 1 lần
// (đánh dấu trong DB) nên nếu admin xoá bớt nhánh thì không bị tự tạo lại.
// Đổi SEED_VERSION (ví dụ khi thêm chương/bài mới) thì lần mở kế tiếp sẽ tự bổ sung phần thiếu.
const SEED_VERSION = 5; // v5: 2 gốc THPT QG 2027 (Ôn luyện + 9 chuyên đề, Thi thử)
const MetaSchema = new mongoose.Schema({ key: { type: String, unique: true }, version: Number });
const SeedMeta = mongoose.models.LibrarySeedMeta || mongoose.model('LibrarySeedMeta', MetaSchema);

let inFlight: Promise<void> | null = null;
let doneInProcess = false;

export function ensureKnttTreeOnce(): Promise<void> {
  if (doneInProcess) return Promise.resolve();
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const meta: any = await SeedMeta.findOne({ key: 'kntt-toan' }).lean();
        if (meta && meta.version >= SEED_VERSION) {
          doneInProcess = true;
          return;
        }
        // "Giành" quyền chạy để nhiều máy chủ không tạo trùng.
        try {
          const claimed = await SeedMeta.findOneAndUpdate(
            { key: 'kntt-toan', version: { $ne: SEED_VERSION } },
            { $set: { version: SEED_VERSION } },
            { upsert: true }
          );
          void claimed;
        } catch {
          doneInProcess = true; // máy khác đã giành
          return;
        }
        try {
          await seedKnttTree();
          doneInProcess = true;
        } catch (e) {
          await SeedMeta.updateOne({ key: 'kntt-toan' }, { $set: { version: 0 } });
          throw e;
        }
      } catch (e) {
        console.error('Tự tạo cây KNTT lỗi:', e);
      } finally {
        inFlight = null;
      }
    })();
  }
  return inFlight;
}
