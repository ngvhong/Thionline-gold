import { connectToDatabase } from '@/lib/mongodb';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { PracticeProgressModel } from '@/lib/practiceProgressModel';
import { deleteSubmissionBlobs } from '@/lib/blobCleanup';

// Xóa tài khoản HỌC SINH (StudentAccount) do ADMIN thao tác — dùng cho tài
// khoản "đăng ký rồi bỏ không dùng". Cùng nguyên tắc an toàn với autoCleanup:
// KHÔNG BAO GIỜ đụng tài khoản đang gắn với lớp của GV (có dòng roster
// `Student.studentAccountId` trỏ tới, hoặc có bài nộp lớp), vì xóa sẽ làm hỏng
// danh sách lớp/điểm của GV. Tài khoản như vậy được "bảo vệ" (protected).

export const DAY_MS = 24 * 60 * 60 * 1000;

// Các id tài khoản HS đang gắn với lớp/bài nộp lớp — không được xóa.
export async function getProtectedStudentAccountIds(): Promise<any[]> {
  const [inClass, hasClassWork] = await Promise.all([
    StudentModel.distinct('studentAccountId', { studentAccountId: { $ne: null } }),
    SubmissionModel.distinct('studentAccountId', { studentAccountId: { $ne: null }, studentId: { $ne: null } }),
  ]);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const id of [...inClass, ...hasClassWork]) {
    const k = String(id);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(id);
    }
  }
  return out;
}

// "Không dùng" = lâu không đăng nhập (hoặc chưa từng đăng nhập mà tạo đã lâu).
export function staleLoginFilter(inactiveDays: number) {
  const cut = new Date(Date.now() - inactiveDays * DAY_MS);
  return { $or: [{ lastLoginAt: { $lt: cut } }, { lastLoginAt: null, created_at: { $lt: cut } }] };
}

// Chuẩn hoá số ngày từ client: số nguyên 1..3650, mặc định 30.
export function normalizeInactiveDays(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(n, 3650);
}

// Xóa tài khoản + dữ liệu Ôn luyện riêng của chính họ (bài làm tự do, tiến độ).
// Tự LỌC LẠI các id được bảo vệ ở server (không tin danh sách client gửi lên).
// Trả về số đã xóa và danh sách id bị bỏ qua vì đang thuộc lớp.
export async function deleteStudentAccounts(
  ids: any[]
): Promise<{ deleted: number; skippedInClass: string[] }> {
  await connectToDatabase();
  if (ids.length === 0) return { deleted: 0, skippedInClass: [] };

  const protectedIds = new Set((await getProtectedStudentAccountIds()).map(String));
  const deletable = ids.filter((id) => !protectedIds.has(String(id)));
  const skippedInClass = ids.filter((id) => protectedIds.has(String(id))).map(String);
  if (deletable.length === 0) return { deleted: 0, skippedInClass };

  // Chỉ các lượt Ôn luyện (studentId null) — lượt gắn lớp đã bị loại ở trên.
  const practice: any[] = await SubmissionModel.find({ studentAccountId: { $in: deletable }, studentId: null })
    .select('essayImages essayAnnotatedImages')
    .lean();
  await deleteSubmissionBlobs(practice);
  await SubmissionModel.deleteMany({ studentAccountId: { $in: deletable }, studentId: null });
  await PracticeProgressModel.deleteMany({ studentAccountId: { $in: deletable } });
  const r = await StudentAccountModel.deleteMany({ _id: { $in: deletable } });
  return { deleted: r.deletedCount || 0, skippedInClass };
}
