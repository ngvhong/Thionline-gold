import { Exam } from '@/lib/examModel';
import { TeacherModel } from '@/lib/teacherModel';
import { LibraryFolder } from '@/lib/libraryFolderModel';
import { AdminAuditLogModel } from '@/lib/adminAuditLogModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { computeLiveEndTimes } from '@/lib/expireOverdueSubmissions';

// THÊM MỚI (v22): dùng chung cho gỡ 1 đề và gỡ hàng loạt khỏi kho đề chung.

// Đếm số học sinh ĐANG LÀM BÀI THẬT (status 'đang thi' và CHƯA quá giờ làm bài)
// của từng đề. Cùng cách tính giờ với khối "Đang thi" ở trang chủ
// (computeLiveEndTimes): lượt bị bỏ dở/đã quá giờ KHÔNG tính, nếu không admin sẽ
// bị chặn gỡ vì những em đã tắt tab từ lâu. Chỉ ĐỌC, không ghi gì vào DB.
// Trả Map<examId, số em đang làm>; đề không có ai làm thì không có trong Map.
export async function countLiveTakersByExam(examIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (examIds.length === 0) return result;

  const live: any[] = await SubmissionModel.find({ examId: { $in: examIds }, status: 'đang thi' })
    .select('_id studentId examId started_at assigned_at')
    .lean();
  if (live.length === 0) return result;

  const ends = await computeLiveEndTimes(live);
  const now = Date.now();
  for (const sub of live) {
    const info = ends.get(String(sub._id));
    if (!info || info.endMs === null || info.endMs <= now) continue;
    const key = String(sub.examId);
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
}

// Thông điệp báo admin khi đề đang có học sinh làm bài.
export function liveBlockMessage(title: string, liveCount: number): string {
  return `Đề "${title}" đang có ${liveCount} học sinh làm bài nên chưa thể gỡ lúc này. Vui lòng chọn thời điểm khác (khi các em đã nộp bài hoặc hết giờ làm bài) rồi gỡ lại.`;
}

// Gỡ chia sẻ các đề đã kiểm tra xong (KHÔNG xoá đề) + ghi nhật ký quản trị.
// `befores` là các đề đọc TRƯỚC khi gỡ (cần title, teacherId, sharedFolderId).
export async function unshareLibraryExams(adminEmail: string, befores: any[]): Promise<void> {
  if (befores.length === 0) return;
  await Exam.updateMany(
    { _id: { $in: befores.map((b) => b._id) } },
    { sharedFolderId: null, shareWithTeachers: false, openForStudents: false, openForMockExam: false }
  );

  // Ghi nhật ký không chặn response, lỗi log không làm hỏng thao tác gỡ.
  (async () => {
    const teacherIds = [...new Set(befores.map((b) => b.teacherId).filter(Boolean).map(String))];
    const folderIds = [...new Set(befores.map((b) => b.sharedFolderId).filter(Boolean).map(String))];
    const [teachers, folders]: [any[], any[]] = await Promise.all([
      teacherIds.length ? TeacherModel.find({ _id: { $in: teacherIds } }).select('email').lean() : Promise.resolve([]),
      folderIds.length ? LibraryFolder.find({ _id: { $in: folderIds } }).select('name').lean() : Promise.resolve([]),
    ]);
    const emailOf = new Map(teachers.map((t) => [String(t._id), t.email as string]));
    const folderName = new Map(folders.map((f) => [String(f._id), f.name as string]));
    await AdminAuditLogModel.insertMany(
      befores.map((b) => {
        const fname = b.sharedFolderId ? folderName.get(String(b.sharedFolderId)) : '';
        return {
          adminEmail,
          action: 'unshare_library_exam',
          targetTeacherId: String(b.teacherId || 'unknown'),
          targetEmail: emailOf.get(String(b.teacherId)) || 'không rõ',
          detail: `Gỡ đề "${b.title}"${fname ? ` (nhánh ${fname})` : ''} khỏi kho đề chung của`,
        };
      })
    );
  })().catch((err: any) => console.error('Lỗi ghi audit log:', err));
}
