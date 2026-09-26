import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { TeacherModel } from '@/lib/teacherModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
// THÊM MỚI (Giai đoạn 4 — tab "Ôn luyện" cho học sinh): đọc cookie HS (nếu
// có) để kèm trạng thái "đã làm" cho nhánh audience=student — CHỈ import
// hàm đọc cookie đã có sẵn từ Giai đoạn 1, không sửa gì studentAuth.ts.
import { getVerifiedStudentAccountIdFromRequest } from '@/lib/studentAuth';
import { SubmissionModel } from '@/lib/submissionModel';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): trả danh sách đề đã
// `shareWithTeachers = true` trong 1 nhánh cụ thể (?folderId=) — dùng cho
// trang GV duyệt kho `/kho-de-chung`. CHỈ trả đề đã bật chia sẻ, không trả
// đề riêng tư của bất kỳ GV nào, kể cả GV đang gọi route (đề của chính mình
// nếu chưa share cũng không hiện ở đây — trang này chỉ để browse kho chung,
// đề riêng của GV xem ở panel "Danh sách đề đã lưu" như cũ).
//
// SỬA (Giai đoạn 4 — tab "Ôn luyện" cho học sinh): thêm nhánh rẽ theo query
// `?audience=student` — đúng như ghi chú để lại ở Giai đoạn 3. Khi có
// `audience=student`: lọc theo `openForStudents=true` (thay vì
// `shareWithTeachers`), KHÔNG bắt buộc đăng nhập GV, và nếu trình duyệt có
// cookie HS hợp lệ thì kèm theo mỗi đề trạng thái "đã làm" (điểm CAO NHẤT
// trong các lần tự làm qua chính luồng Ôn luyện + tổng số lần đã làm) — quy
// tắc hiển thị "điểm cao nhất, không phải điểm gần nhất" chọn vì đây là
// luồng tự luyện không giới hạn số lần làm lại, hiện điểm cao nhất khuyến
// khích học sinh thử lại để cải thiện điểm, đúng tinh thần "luyện tập".
// Không có cookie (chưa đăng nhập) → vẫn trả list bình thường, chỉ bỏ qua
// phần lịch sử điểm (không được biết, không phải không có).
// Nhánh mặc định (không audience, hoặc khác 'student') giữ NGUYÊN 100%
// hành vi cũ của Giai đoạn 3.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const audience = request.nextUrl.searchParams.get('audience');
    const forStudent = audience === 'student';

    if (!forStudent) {
      const teacherId = await getVerifiedTeacherIdFromRequest(request);
      if (!teacherId) {
        return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
      }
    }

    const folderId = request.nextUrl.searchParams.get('folderId');
    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
      return NextResponse.json({ error: 'folderId không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();

    const shareField = forStudent ? 'openForStudents' : 'shareWithTeachers';
    const exams = await Exam.find({ sharedFolderId: folderId, [shareField]: true })
      .select('title created_at published_at teacherId raw_data')
      .sort({ created_at: -1 })
      .lean();

    const teacherIds = Array.from(
      new Set(exams.map((e: any) => e.teacherId).filter((id: any) => !!id))
    );
    const teachers = teacherIds.length
      ? await TeacherModel.find({ _id: { $in: teacherIds } }).select('name').lean()
      : [];
    const teacherNameMap: Record<string, string> = {};
    for (const t of teachers) teacherNameMap[String(t._id)] = (t as any).name;

    // THÊM MỚI (Giai đoạn 4): lịch sử điểm — chỉ tính khi audience=student
    // VÀ có cookie HS hợp lệ. studentId: null lọc đúng các lượt tạo qua
    // luồng "Ôn luyện" (xem /api/library/thi/[examId]/start), không lẫn
    // lượt "Đề được giao" (luôn có studentId) của cùng account+exam.
    const bestByExamId: Record<string, { bestScorePoints: number | null; bestMaxScorePoints: number | null; attempts: number }> = {};
    if (forStudent && exams.length > 0) {
      const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
      if (studentAccountId) {
        const examIds = exams.map((e: any) => e._id);
        const submissions = await SubmissionModel.find({
          examId: { $in: examIds },
          studentAccountId,
          studentId: null,
          status: 'đã nộp',
        })
          .select('examId scorePoints maxScorePoints score total')
          .lean();
        for (const s of submissions as any[]) {
          const key = String(s.examId);
          const points = typeof s.scorePoints === 'number' ? s.scorePoints : s.score ?? 0;
          const maxPoints = typeof s.maxScorePoints === 'number' ? s.maxScorePoints : s.total ?? 0;
          if (!bestByExamId[key]) {
            bestByExamId[key] = { bestScorePoints: points, bestMaxScorePoints: maxPoints, attempts: 1 };
          } else {
            bestByExamId[key].attempts += 1;
            if (points > (bestByExamId[key].bestScorePoints ?? -Infinity)) {
              bestByExamId[key].bestScorePoints = points;
              bestByExamId[key].bestMaxScorePoints = maxPoints;
            }
          }
        }
      }
    }

    const result = exams.map((e: any) => {
      const raw = e.raw_data || {};
      const questionCount =
        (raw.phan_1_TracNghiem?.length || 0) +
        (raw.phan_2_DungSai?.length || 0) +
        (raw.phan_3_TraLoiNgan?.length || 0) +
        (raw.phan_4_TuLuan?.length || 0);
      const best = bestByExamId[String(e._id)];
      return {
        _id: String(e._id),
        title: e.title,
        created_at: e.created_at,
        published_at: e.published_at,
        teacherName: teacherNameMap[String(e.teacherId)] || 'Không rõ',
        questionCount,
        // undefined khi không tính lịch sử (không phải audience=student,
        // hoặc chưa đăng nhập) — chỉ có giá trị thật khi đã từng làm.
        bestScorePoints: best?.bestScorePoints ?? null,
        bestMaxScorePoints: best?.bestMaxScorePoints ?? null,
        attempts: best?.attempts ?? 0,
      };
    });

    return NextResponse.json({ exams: result }, { status: 200 });
  } catch (err) {
    console.error('Lỗi tải danh sách đề trong kho đề chung:', err);
    return NextResponse.json({ error: 'Không tải được danh sách đề.' }, { status: 500 });
  }
}
