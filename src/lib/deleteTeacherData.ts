import { Exam } from '@/lib/examModel';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { ShortLinkModel } from '@/lib/shortLinkModel';
import { ExamGroupLinkModel } from '@/lib/examGroupLinkModel';
import { KhoiModel } from '@/lib/khoiModel';
import { TeacherModel } from '@/lib/teacherModel';
import { deleteSubmissionBlobs, deleteExamImageBlobs } from '@/lib/blobCleanup';

// DÙNG CHUNG cho 2 nơi xóa tài khoản GV:
//   - GV tự xóa tài khoản mình  (api/auth/delete-account)
//   - Admin xóa tài khoản GV    (api/admin/teachers/[id], method DELETE)
// Tách ra 1 chỗ để 2 luồng không bao giờ lệch nhau (vd. thêm collection mới
// chỉ cần sửa đúng file này).
//
// Hàm KHÔNG kiểm tra quyền/mật khẩu — nơi gọi phải tự làm trước.
//
// Thứ tự: ảnh trên storage TRƯỚC (cần đọc URL từ bản ghi còn sống), rồi dữ
// liệu Mongo từ "lá" lên "gốc", cuối cùng mới xóa chính tài khoản. Nếu giữa
// chừng lỗi, tài khoản vẫn còn -> bấm xóa lại được (các bước đều idempotent).
//
// Lưu ý: tài khoản HS (StudentAccount) KHÔNG bị xóa — nó sống ở cấp toàn hệ
// thống, độc lập với lớp của GV; chỉ các dòng roster `Student` trong lớp GV
// này bị xóa (HS vẫn đăng nhập & dùng Ôn luyện bình thường).
export async function deleteTeacherAndAllData(teacher: { _id: any }): Promise<void> {
  const teacherId = String(teacher._id);

  const exams: any[] = await Exam.find({ teacherId }).select('raw_data').lean();
  const examIds = exams.map((e) => e._id);
  const classes: any[] = await ClassModel.find({ ownerId: teacher._id }).select('_id').lean();
  const classIds = classes.map((c) => c._id);
  const students: any[] = classIds.length
    ? await StudentModel.find({ classId: { $in: classIds } }).select('_id').lean()
    : [];
  const studentIds = students.map((s) => s._id);

  const subFilter = { $or: [{ examId: { $in: examIds } }, { studentId: { $in: studentIds } }] };
  const submissions = await SubmissionModel.find(subFilter)
    .select('essayImages essayAnnotatedImages')
    .lean();
  await deleteSubmissionBlobs(submissions as any[]);
  for (const e of exams) await deleteExamImageBlobs(e.raw_data);

  await SubmissionModel.deleteMany(subFilter);
  await ExamAssignmentModel.deleteMany({
    $or: [{ examId: { $in: examIds } }, { classId: { $in: classIds } }],
  });
  await ShortLinkModel.deleteMany({ examId: { $in: examIds } });
  await ExamGroupLinkModel.deleteMany({ ownerId: teacher._id });
  await StudentModel.deleteMany({ classId: { $in: classIds } });
  await ClassModel.deleteMany({ ownerId: teacher._id });
  await KhoiModel.deleteMany({ ownerId: teacher._id });
  await Exam.deleteMany({ teacherId });
  await TeacherModel.deleteOne({ _id: teacher._id });
}
