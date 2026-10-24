import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { isSolutionUnlocked, canSelfRetake, resolveEffectiveSettings, checkOpenCloseGate } from '@/lib/examAccessRules';

// POST /api/thi/[examId]/start — CÔNG KHAI. Body: { classId, studentId, retake? }
// Idempotent: gọi lại nhiều lần (ví dụ học sinh mở lại link sau khi đóng
// hẳn tab) vẫn trả về cùng 1 submission đang "đang thi", KHÔNG tạo attempt
// mới. Theo quyết định đã chốt: học sinh đóng tab giữa chừng thì bài làm DỞ
// bị mất (không khôi phục từ server), nhưng KHÔNG bị coi là đã nộp — vẫn mở
// lại làm tiếp được (dù phải làm lại từ đầu, không mất lượt).
//
// THÊM MỚI (Số lần làm bài + Xem lời giải sau + cài đặt riêng theo lớp):
//   - Nếu lượt MỚI NHẤT đã "đã nộp" và KHÔNG truyền `retake: true` -> trả về
//     THẲNG kết quả lượt đó (điểm + lời giải nếu đã mở) để học sinh mở lại
//     link cũ vẫn xem lại được, KHÔNG cần giáo viên thao tác gì.
//   - Nếu truyền `retake: true` -> học sinh CHỦ ĐỘNG xin làm lượt mới, chỉ
//     được chấp nhận nếu còn lượt theo cài đặt CÓ HIỆU LỰC của lớp này
//     (maxAttempts, 0 = không giới hạn) VÀ đề vẫn còn trong khung giờ mở
//     (checkOpenCloseGate) — nút "Cho làm lại" của giáo viên ở tầng 3 (route
//     /api/submissions/[id]/retake) vẫn tách riêng, dùng để CẤP THÊM lượt
//     vượt quá cấu hình này.
//   - Cài đặt (thời gian làm bài, giờ mở/đóng, số lần làm lại, xem lời
//     giải...) lấy qua resolveEffectiveSettings: mặc định dùng Exam.settings,
//     NHƯNG nếu lớp này đã được GV bật "Dùng cài đặt riêng" (ExamAssignment.
//     hasCustomSettings) thì ưu tiên dùng cài đặt riêng đó — chỉ áp dụng cho
//     đúng lớp này, các lớp khác không bị ảnh hưởng.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const { classId, studentId, retake } = await request.json();

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Link đề thi không hợp lệ.' }, { status: 400 });
    }
    if (!classId || !mongoose.Types.ObjectId.isValid(classId) || !studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return NextResponse.json({ error: 'Thiếu thông tin học sinh.' }, { status: 400 });
    }

    await connectToDatabase();

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    if (!(exam as any).is_published) {
      return NextResponse.json({ error: 'Đề thi này chưa được giáo viên xuất bản.' }, { status: 403 });
    }

    // Chỉ 1 lần fetch ExamAssignment duy nhất cho cả request (dùng lại ở mọi
    // nhánh bên dưới) — vừa gộp cài đặt hiệu lực, vừa dùng để kiểm tra giờ
    // mở/đóng, tránh query lặp lại DB nhiều lần trong 1 request.
    const assignment = await ExamAssignmentModel.findOne({ examId, classId }).lean();
    const effectiveSettings = resolveEffectiveSettings((exam as any).settings, assignment as any);

    const student = await StudentModel.findOne({ _id: studentId, classId }).lean();
    if (!student) {
      return NextResponse.json({ error: 'Không tìm thấy tên em trong danh sách lớp này.' }, { status: 404 });
    }
    // Chặn học sinh tự báo danh ở chế độ "cần duyệt" nhưng GV chưa duyệt —
    // approved mặc định true cho mọi trường hợp khác (nhập tay/import Excel/
    // tự báo danh chế độ 'auto'), nên check này không ảnh hưởng học sinh cũ.
    if ((student as any).approved === false) {
      return NextResponse.json(
        { error: 'Em đã báo danh xong nhưng giáo viên chưa duyệt. Vui lòng chờ giáo viên duyệt rồi thử lại.' },
        { status: 403 }
      );
    }

    // Lấy attempt MỚI NHẤT của (studentId, examId) — đúng quy ước đã ghi
    // trong submissionModel.ts.
    let submission: any = await SubmissionModel.findOne({ studentId, examId })
      .sort({ attemptNumber: -1 })
      .exec();

    if (!submission) {
      return NextResponse.json(
        { error: 'Em chưa được giáo viên giao đề này. Liên hệ giáo viên để được giao đề.' },
        { status: 403 }
      );
    }

    if (submission.status === 'đã nộp' && !retake) {
      // XEM LẠI kết quả/lời giải lượt đã nộp — không tạo attempt mới, không
      // cần giáo viên thao tác gì. Trả về đủ dữ liệu để trang /thi dựng lại
      // đúng màn "Đã nộp bài" (và mở SolutionView nếu lời giải đã tới lúc mở).
      const showSolution = isSolutionUnlocked(effectiveSettings, {
        assignmentCloseAt: effectiveSettings.closeAt || null,
      });
      return NextResponse.json(
        {
          alreadySubmitted: true,
          submissionId: String(submission._id),
          studentName: (student as any).name,
          examTitle: (exam as any).title || '(Đề thi)',
          attemptNumber: submission.attemptNumber,
          score: submission.score,
          total: submission.total,
          scorePoints: submission.scorePoints,
          maxScorePoints: submission.maxScorePoints,
          essayScores: submission.essayScores || null,
          essayMaxScore: submission.essayMaxScore ?? null,
          essayGraded: !!submission.essayGraded,
          essayImages: submission.essayImages || null,
          essayAnnotatedImages: submission.essayAnnotatedImages || null,
          showSolution,
          // THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): TRƯỚC ĐÂY nhánh này
          // (mở lại link sau khi đã nộp) không hề trả `settings`, nên
          // ThiPageClient không có cách nào biết imageScalePercent GV đã
          // chỉnh -> SolutionView ở luồng này luôn rơi về mặc định 100,
          // không khớp với "Xem mô phỏng"/lúc làm bài thật. Trả thêm để
          // đồng bộ cỡ hình ở MỌI luồng, không riêng lúc vừa làm bài xong.
          settings: effectiveSettings,
          // Lưu ý: KHÔNG có bản "đã trộn" của lượt làm trước (chỉ trộn ở
          // client lúc làm bài, không lưu lại thứ tự) — dùng thẳng raw_data
          // gốc để hiện lời giải, chấm điểm vẫn đúng vì SolutionView tra theo
          // q.id, chỉ có thứ tự hiển thị câu/phương án khác với lúc làm thật.
          solutionData: showSolution
            ? {
                examData: (exam as any).raw_data,
                p1Answers: submission.answers?.p1Answers || {},
                p2Answers: submission.answers?.p2Answers || {},
                textAnswers: submission.answers?.textAnswers || {},
                scoring: submission.scoringUsed || effectiveSettings.scoring,
              }
            : undefined,
          canRetake: canSelfRetake(effectiveSettings, submission.attemptNumber),
        },
        { status: 200 }
      );
    }

    if (submission.status === 'đã nộp' && retake) {
      if (!canSelfRetake(effectiveSettings, submission.attemptNumber)) {
        const max = Number(effectiveSettings.maxAttempts) || 0;
        return NextResponse.json(
          {
            error: `Em đã dùng hết số lần làm bài cho phép (${max} lần). Liên hệ giáo viên nếu cần làm thêm lượt.`,
          },
          { status: 403 }
        );
      }
      const gateError = checkOpenCloseGate(effectiveSettings);
      if (gateError) {
        return NextResponse.json({ error: gateError }, { status: 403 });
      }
      submission = await SubmissionModel.create({
        studentId,
        examId,
        status: 'đang thi',
        attemptNumber: submission.attemptNumber + 1,
        started_at: new Date(),
        assigned_at: new Date(),
      });
    }

    if (submission.status === 'chưa thi') {
      // Chặn giờ mở/đóng thi (kiểu Azota) — CHỈ áp dụng cho học sinh CHƯA
      // từng vào (status vẫn 'chưa thi' tại đây). Em nào đã bấm vào làm
      // trước đó (status đã lên 'đang thi') sẽ không rơi vào nhánh này nữa,
      // nên không bao giờ bị chặn giữa chừng — đúng quyết định đã chốt: giờ
      // đóng chỉ chặn người CHƯA vào, ai đã vào rồi thì làm/nộp bình thường
      // theo thời gian làm bài riêng của đề.
      const gateError = checkOpenCloseGate(effectiveSettings);
      if (gateError) {
        return NextResponse.json({ error: gateError }, { status: 403 });
      }

      submission.status = 'đang thi';
      submission.started_at = new Date();
      await submission.save();
    }
    // Nếu đã là 'đang thi' rồi (mở lại link) — giữ nguyên, không ghi đè
    // started_at, không tạo bản ghi mới, và KHÔNG check lại giờ đóng ở trên.

    // CHỐNG GIAN LẬN "đóng tab để reset đồng hồ" (Bước 3.1 mục 3, bàn giao
    // Bước 3): endAt tính từ started_at GỐC (ghi 1 lần duy nhất ở trên),
    // KHÔNG phải Date.now() lúc gọi API này — nên dù học sinh đóng hẳn tab
    // và mở lại link (gọi lại /start), endAt trả về vẫn y hệt lần trước,
    // đồng hồ không được cộng thêm giờ.
    const duration = Math.max(1, Number(effectiveSettings.duration) || 45);
    const startedAtMs = submission.started_at ? new Date(submission.started_at).getTime() : Date.now();
    const endAt = startedAtMs + duration * 60000;

    return NextResponse.json(
      {
        submissionId: String(submission._id),
        studentName: (student as any).name,
        examTitle: (exam as any).title || '(Đề thi)',
        raw_data: (exam as any).raw_data,
        settings: effectiveSettings,
        endAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi bắt đầu làm bài:', err);
    return NextResponse.json(
      { error: 'Không bắt đầu được bài thi, thử tải lại trang.' },
      { status: 500 }
    );
  }
}
