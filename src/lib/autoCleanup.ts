import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { SubmissionModel } from '@/lib/submissionModel';
import { StudentModel } from '@/lib/studentModel';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import { deleteSubmissionBlobs } from '@/lib/blobCleanup';

// DỌN DỮ LIỆU TỰ ĐỘNG — CHỈ NHỮNG THỨ KHÔNG THUỘC VỀ GIÁO VIÊN NÀO.
//
// Nguyên tắc: không đụng bài nộp/điểm của học sinh trong lớp của GV, không
// đụng tài khoản & đề của giáo viên. Chỉ dọn 3 nhóm "mồ côi":
//   1. Tài khoản học sinh CHƯA vào lớp nào, không dùng quá N ngày (đăng ký
//      thử rồi bỏ) — kèm lượt Ôn luyện của chính tài khoản đó.
//   2. Lượt Ôn luyện rỗng: chưa làm, hoặc server tự chốt vì bỏ dở (0 điểm,
//      không có bài làm).
//   3. Ảnh tự luận cũ của lượt Ôn luyện (nay không còn nhận loại ảnh này,
//      và chưa từng có GV nào chấm).
// Mọi ngưỡng ngày chỉnh ở CLEANUP_CONFIG bên dưới.
export const CLEANUP_CONFIG = {
  inactiveStudentAccountDays: 120,
  emptyPracticeAttemptDays: 30,
  practiceEssayImageDays: 30,
  // Mỗi lần chạy xử lý tối đa chừng này bản ghi mỗi nhóm — nhóm nào còn dư
  // sẽ được dọn tiếp ở lần chạy hôm sau (tránh 1 lần chạy quá nặng).
  batchLimit: 500,
};

const DAY = 24 * 60 * 60 * 1000;

export type CleanupResult = {
  dryRun: boolean;
  inactiveStudentAccounts: number;
  practiceSubmissionsOfDeletedAccounts: number;
  emptyPracticeAttempts: number;
  practiceEssayImageSubmissions: number;
};

const CleanupStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  lastRunAt: { type: Date, default: null },
  lastResult: { type: Object, default: null },
});
const CleanupStateModel =
  mongoose.models.CleanupState || mongoose.model('CleanupState', CleanupStateSchema);

export async function runSafeCleanup(opts: { dryRun?: boolean } = {}): Promise<CleanupResult> {
  const dryRun = !!opts.dryRun;
  await connectToDatabase();
  const now = Date.now();
  const cfg = CLEANUP_CONFIG;
  const result: CleanupResult = {
    dryRun,
    inactiveStudentAccounts: 0,
    practiceSubmissionsOfDeletedAccounts: 0,
    emptyPracticeAttempts: 0,
    practiceEssayImageSubmissions: 0,
  };

  // --- 1. Tài khoản học sinh bỏ không dùng, chưa vào lớp nào ---
  const accCut = new Date(now - cfg.inactiveStudentAccountDays * DAY);
  const candidates: any[] = await StudentAccountModel.find({
    $or: [{ lastLoginAt: { $lt: accCut } }, { lastLoginAt: null, created_at: { $lt: accCut } }],
  })
    .select('_id')
    .limit(cfg.batchLimit)
    .lean();
  if (candidates.length > 0) {
    const ids = candidates.map((c) => c._id);
    const [inClass, hasClassWork] = await Promise.all([
      StudentModel.distinct('studentAccountId', { studentAccountId: { $in: ids } }),
      // Phòng hờ: tài khoản có bài nộp gắn với 1 dòng roster của lớp thì giữ.
      SubmissionModel.distinct('studentAccountId', { studentAccountId: { $in: ids }, studentId: { $ne: null } }),
    ]);
    const keep = new Set([...inClass, ...hasClassWork].map(String));
    const deletable = ids.filter((id) => !keep.has(String(id)));
    result.inactiveStudentAccounts = deletable.length;
    if (deletable.length > 0) {
      const practice: any[] = await SubmissionModel.find({ studentAccountId: { $in: deletable }, studentId: null })
        .select('essayImages essayAnnotatedImages')
        .lean();
      result.practiceSubmissionsOfDeletedAccounts = practice.length;
      if (!dryRun) {
        await deleteSubmissionBlobs(practice);
        await SubmissionModel.deleteMany({ studentAccountId: { $in: deletable }, studentId: null });
        await StudentAccountModel.deleteMany({ _id: { $in: deletable } });
      }
    }
  }

  // --- 2. Lượt Ôn luyện rỗng (không có dữ liệu gì để mất) ---
  const emptyCut = new Date(now - cfg.emptyPracticeAttemptDays * DAY);
  const emptyFilter = {
    studentId: null,
    studentAccountId: { $ne: null },
    $or: [
      { status: 'chưa thi', assigned_at: { $lt: emptyCut } },
      { autoSubmitted: true, submitted_at: { $lt: emptyCut } },
    ],
  };
  if (dryRun) {
    result.emptyPracticeAttempts = await SubmissionModel.countDocuments(emptyFilter);
  } else {
    const r = await SubmissionModel.deleteMany(emptyFilter);
    result.emptyPracticeAttempts = r.deletedCount || 0;
  }

  // --- 3. Ảnh tự luận cũ ở Ôn luyện (chưa ai chấm) ---
  const essayCut = new Date(now - cfg.practiceEssayImageDays * DAY);
  const essayFilter = {
    studentId: null,
    studentAccountId: { $ne: null },
    status: 'đã nộp',
    submitted_at: { $lt: essayCut },
    essayGraded: { $ne: true },
    essayImages: { $exists: true, $ne: null },
  };
  const withImages: any[] = await SubmissionModel.find(essayFilter)
    .select('essayImages essayAnnotatedImages')
    .limit(cfg.batchLimit)
    .lean();
  result.practiceEssayImageSubmissions = withImages.length;
  if (!dryRun && withImages.length > 0) {
    await deleteSubmissionBlobs(withImages);
    await SubmissionModel.updateMany(
      { _id: { $in: withImages.map((s) => s._id) } },
      { $unset: { essayImages: '', essayAnnotatedImages: '' } }
    );
  }

  return result;
}

// Chạy tối đa 1 lần / ~20 giờ, an toàn khi nhiều instance cùng gọi: chỉ 1 nơi
// "giành" được lượt (cập nhật nguyên tử lastRunAt), nơi còn lại bỏ qua.
export async function maybeRunDailyCleanup(): Promise<void> {
  try {
    await connectToDatabase();
    const now = new Date();
    const claimed = await CleanupStateModel.findOneAndUpdate(
      { key: 'daily', $or: [{ lastRunAt: null }, { lastRunAt: { $lt: new Date(now.getTime() - 20 * 60 * 60 * 1000) } }] },
      { $set: { lastRunAt: now } },
      { upsert: true, new: true }
    );
    if (!claimed) return;
    const result = await runSafeCleanup();
    await CleanupStateModel.updateOne({ key: 'daily' }, { $set: { lastResult: { ...result, at: now } } });
    console.log('[autoCleanup] đã dọn:', JSON.stringify(result));
  } catch (err: any) {
    // E11000 = nơi khác vừa giành lượt (upsert trùng key) — bình thường.
    if (err?.code !== 11000) console.error('[autoCleanup] lỗi:', err);
  }
}
