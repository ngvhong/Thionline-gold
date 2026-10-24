import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import { resolveEffectiveSettings, isSolutionUnlocked } from '@/lib/examAccessRules';
import { getVerifiedStudentAccountIdFromRequest } from '@/lib/studentAuth';

// THÊM MỚI (Giai đoạn 4 — tab "Ôn luyện" cho học sinh): bản khởi tạo lượt
// làm RIÊNG cho luồng tự luyện — khác hẳn `/api/thi/[examId]/start` (route
// đó BẮT BUỘC phải có sẵn 1 `Submission` do GV "giao đề" tạo trước qua
// classId+studentId, xem comment đầu file route đó: "Em chưa được giáo viên
// giao đề này"). Ở đây học sinh KHÔNG cần được giao — chỉ cần đăng nhập
// TÀI KHOẢN (studentAccountId) và đề đã bật `openForStudents` — nên viết
// route mới thay vì cố nhét thêm nhánh rẽ vào route cũ (2 luồng có điều
// kiện tồn tại bản ghi khác hẳn nhau, gộp chung dễ rối, dễ vỡ luồng cũ).
//
// KHÔNG viết thêm `/api/library/thi/[examId]/submit` riêng như dự kiến ban
// đầu trong 01-KE-HOACH-CHI-TIET.md — kiểm tra lại thực tế:
// `/api/thi/[examId]/submit` VÀ `/api/thi/[examId]/upload-essay-image` đã
// hoàn toàn TỔNG QUÁT (chỉ cần đúng `submissionId`, không hề bắt buộc
// classId/studentId — `classId` ở route submit chỉ dùng để tra
// ExamAssignment NẾU CÓ, thiếu thì tự bỏ qua, dùng thẳng Exam.settings).
// Submission tạo ra ở route này gọi thẳng 2 route đó được, KHÔNG cần sửa
// dòng nào — tránh nhân đôi logic chấm điểm (đúng đúng tinh thần "gọi lại
// hàm chấm điểm dùng chung" mà đặc tả gốc yêu cầu, chỉ khác là dùng chung
// CẢ ROUTE luôn, không chỉ dùng chung mỗi hàm gradeExam).
//
// KHÔNG áp dụng checkOpenCloseGate (giờ mở/đóng đề) ở luồng này — cửa sổ
// giờ đó gắn với việc GV "giao đề cho 1 lớp trong 1 khung giờ", không hợp
// với tinh thần "tự luyện, làm bất cứ lúc nào" của tab Ôn luyện.
export async function POST(request: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
    if (!studentAccountId) {
      return NextResponse.json({ error: 'Cần đăng nhập tài khoản học sinh để làm bài.' }, { status: 401 });
    }

    const { examId } = await params;
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Link đề thi không hợp lệ.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const retake = !!body?.retake;

    await connectToDatabase();

    const exam: any = await Exam.findById(examId).lean();
    if (!exam || !exam.is_published || !exam.openForStudents) {
      // 404 (không phải 403) — cùng nguyên tắc "không tiết lộ sự tồn tại
      // của đề chưa được phép" đã dùng ở các route kho đề chung Giai đoạn 3.
      return NextResponse.json({ error: 'Không tìm thấy đề thi này trong khu Ôn luyện.' }, { status: 404 });
    }

    const account: any = await StudentAccountModel.findById(studentAccountId).select('name').lean();
    if (!account) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản này.' }, { status: 404 });
    }

    const effectiveSettings = resolveEffectiveSettings(exam.settings, null);

    // Lượt MỚI NHẤT của (account, exam) qua ĐÚNG luồng Ôn luyện — lọc thêm
    // studentId: null để không lẫn với lượt tạo qua luồng "Đề được giao"
    // (luôn có studentId thật) của cùng account + đề, phòng trường hợp đề
    // này VỪA được giao cho 1 lớp em đã join, VỪA share ở "Ôn luyện".
    let submission: any = await SubmissionModel.findOne({ studentAccountId, examId, studentId: null })
      .sort({ attemptNumber: -1 })
      .exec();

    if (!submission) {
      submission = await SubmissionModel.create({
        studentAccountId,
        examId,
        studentId: null,
        status: 'chưa thi',
        attemptNumber: 1,
      });
    }

    if (submission.status === 'đã nộp' && !retake) {
      // Cùng cách tính `assignmentCloseAt` như route /api/thi/*/start (dù
      // ở đây không có ExamAssignment nào, effectiveSettings.closeAt đã là
      // đúng giờ đóng CẤP ĐỘ ĐỀ — chế độ 'after_close' vẫn tính đúng mốc).
      const showSolution = isSolutionUnlocked(effectiveSettings, { assignmentCloseAt: effectiveSettings.closeAt || null });
      return NextResponse.json(
        {
          alreadySubmitted: true,
          submissionId: String(submission._id),
          studentName: account.name,
          examTitle: exam.title || '(Đề thi)',
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
          settings: effectiveSettings,
          solutionData: showSolution
            ? {
                examData: exam.raw_data,
                p1Answers: submission.answers?.p1Answers || {},
                p2Answers: submission.answers?.p2Answers || {},
                textAnswers: submission.answers?.textAnswers || {},
                scoring: submission.scoringUsed || effectiveSettings.scoring,
              }
            : undefined,
          // Luôn true — "Ôn luyện" KHÔNG giới hạn số lần làm lại (khác hẳn
          // luồng "Đề được giao" vốn theo maxAttempts do GV cấu hình).
          canRetake: true,
        },
        { status: 200 }
      );
    }

    if (submission.status === 'đã nộp' && retake) {
      // Không giới hạn số lần — luôn cho phép, không cần checkOpenCloseGate
      // (xem giải thích ở đầu file).
      submission = await SubmissionModel.create({
        studentAccountId,
        examId,
        studentId: null,
        status: 'đang thi',
        attemptNumber: submission.attemptNumber + 1,
        started_at: new Date(),
      });
    }

    if (submission.status === 'chưa thi') {
      submission.status = 'đang thi';
      submission.started_at = new Date();
      await submission.save();
    }
    // Nếu đã là 'đang thi' (mở lại link giữa chừng) — giữ nguyên, không ghi
    // đè started_at, cùng nguyên tắc chống gian lận của route /api/thi/*/start.

    const duration = Math.max(1, Number(effectiveSettings.duration) || 45);
    const startedAtMs = submission.started_at ? new Date(submission.started_at).getTime() : Date.now();
    const endAt = startedAtMs + duration * 60000;

    return NextResponse.json(
      {
        submissionId: String(submission._id),
        studentName: account.name,
        examTitle: exam.title || '(Đề thi)',
        raw_data: exam.raw_data,
        settings: effectiveSettings,
        endAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi bắt đầu làm bài (Ôn luyện):', err);
    return NextResponse.json({ error: 'Không bắt đầu được bài thi, thử tải lại trang.' }, { status: 500 });
  }
}
