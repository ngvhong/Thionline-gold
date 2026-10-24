import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { gradeExam, computeEssayMax, DEFAULT_SCORING } from '@/lib/grading';
import { isSolutionUnlocked, canSelfRetake, resolveEffectiveSettings } from '@/lib/examAccessRules';
// THÊM MỚI (Giai đoạn 2 — tab "Đề được giao"): chỉ IMPORT hàm đọc cookie HS
// đã có sẵn từ Giai đoạn 1, KHÔNG sửa gì studentAuth.ts.
import { getVerifiedStudentAccountIdFromRequest } from '@/lib/studentAuth';

// POST /api/thi/[examId]/submit — CÔNG KHAI.
// Body: { submissionId, classId, p1Answers, p2Answers, textAnswers, essayImages }
// classId — cần để tra ExamAssignment (cài đặt riêng của lớp, nếu có + giờ
// đóng đề) và tính đúng effectiveSettings (xem examAccessRules.ts). Không
// bắt buộc để không phá các lượt gọi cũ (nếu thiếu, coi như lớp này không có
// tuỳ chỉnh riêng — dùng thẳng Exam.settings mặc định).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const { submissionId, classId, p1Answers, p2Answers, textAnswers, essayImages } = await request.json();

    if (!mongoose.Types.ObjectId.isValid(examId) || !submissionId || !mongoose.Types.ObjectId.isValid(submissionId)) {
      return NextResponse.json({ error: 'Yêu cầu nộp bài không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();

    // TỐI ƯU TỐC ĐỘ: TRƯỚC ĐÂY 2 truy vấn (lấy submission, rồi lấy exam theo
    // submission.examId) chạy TUẦN TỰ — round-trip DB thứ 2 chỉ bắt đầu sau
    // khi round-trip thứ 1 xong hoàn toàn, cộng dồn độ trễ 2 lần dù 2 truy
    // vấn không phụ thuộc nhau (exam đã biết trước qua examId trên URL, đã
    // validate hợp lệ ở trên). BÂY GIỜ chạy SONG SONG bằng Promise.all — chỉ
    // còn tốn thời gian bằng round-trip CHẬM HƠN trong 2 cái, không phải
    // tổng của cả 2 — giảm đáng kể độ trễ nộp bài, nhất là lúc nhiều học
    // sinh nộp cùng lúc gần hết giờ. ExamAssignment (cài đặt riêng lớp, nếu
    // classId hợp lệ) cũng gộp vào cùng round-trip song song này.
    const validClassId = classId && mongoose.Types.ObjectId.isValid(classId);
    const [submission, exam, assignment]: [any, any, any] = await Promise.all([
      SubmissionModel.findById(submissionId).exec(),
      Exam.findById(examId).lean(),
      validClassId ? ExamAssignmentModel.findOne({ examId, classId }).lean() : Promise.resolve(null),
    ]);

    if (!submission || String(submission.examId) !== examId) {
      return NextResponse.json({ error: 'Không tìm thấy lượt làm bài này.' }, { status: 404 });
    }
    if (!exam) {
      return NextResponse.json({ error: 'Đề thi không còn tồn tại.' }, { status: 404 });
    }

    const effectiveSettings = resolveEffectiveSettings((exam as any).settings, assignment);

    // Idempotent: nếu ĐÃ nộp rồi (vd double-click nút Nộp, hoặc mất mạng rồi
    // trình duyệt tự gửi lại), trả đúng điểm đã lưu, KHÔNG chấm lại đè lên —
    // tránh 1 lượt làm bị chấm 2 lần với answers khác nhau do lỗi mạng.
    if (submission.status === 'đã nộp') {
      const showSolution = isSolutionUnlocked(effectiveSettings, {
        assignmentCloseAt: effectiveSettings.closeAt || null,
      });
      return NextResponse.json(
        {
          score: submission.score,
          total: submission.total,
          scorePoints: submission.scorePoints,
          maxScorePoints: submission.maxScorePoints,
          essayScores: submission.essayScores || null,
          essayMaxScore: submission.essayMaxScore ?? null,
          essayGraded: !!submission.essayGraded,
          essayImages: submission.essayImages || null,
          essayAnnotatedImages: submission.essayAnnotatedImages || null,
          alreadySubmitted: true,
          showSolution,
          canRetake: canSelfRetake(effectiveSettings, submission.attemptNumber),
        },
        { status: 200 }
      );
    }

    // Thang điểm dùng để chấm lượt này: lấy từ settings.scoring của đề TẠI
    // THỜI ĐIỂM nộp (nếu GV chưa từng cấu hình thì dùng mặc định theo barem
    // THPT hiện hành) — snapshot lại trong submission.scoringUsed để không
    // đổi ngược nếu GV sửa thang điểm sau đó (giống cách total đang làm).
    // Lưu ý: thang điểm KHÔNG nằm trong nhóm cài đặt có thể ghi đè riêng
    // theo lớp (luôn dùng đúng 1 barem của đề cho mọi lớp).
    const scoringUsed = { ...DEFAULT_SCORING, ...(((exam as any).settings?.scoring) || {}) };

    // Chấm điểm ở SERVER, dựa trên raw_data GỐC lưu trong DB — không tin
    // điểm số client tự gửi lên (nếu có), tránh học sinh sửa điểm qua DevTools.
    const result = gradeExam(
      (exam as any).raw_data,
      { p1Answers: p1Answers || {}, p2Answers: p2Answers || {}, textAnswers: textAnswers || {} },
      scoringUsed
    );

    submission.status = 'đã nộp';
    submission.score = result.correct;
    submission.total = result.total;
    submission.scorePoints = result.scorePoints;
    submission.maxScorePoints = result.maxScorePoints;
    submission.scoringUsed = scoringUsed;
    submission.answers = { p1Answers: p1Answers || {}, p2Answers: p2Answers || {}, textAnswers: textAnswers || {} };
    // Phần IV: chỉ lưu URL ảnh (đã upload trước đó qua /upload-essay-image
    // trong lúc làm bài) — KHÔNG tính vào score/total, chờ GV chấm tay.
    submission.essayImages = essayImages || undefined;
    submission.essayMaxScore = computeEssayMax((exam as any).raw_data, scoringUsed);
    submission.submitted_at = new Date();
    // THÊM MỚI (Giai đoạn 2 — tab "Đề được giao"): CHỈ THÊM điều kiện, không
    // đổi cách ghi studentId cũ ở trên. Nếu request này tới từ 1 trình duyệt
    // đang có phiên đăng nhập học sinh hợp lệ (cookie student_session_token,
    // tự động gửi kèm cùng-origin, không cần client truyền tay) thì ghi thêm
    // studentAccountId song song — mọi lượt nộp qua link cũ (không đăng nhập
    // tài khoản) sẽ không có cookie này, submission.studentAccountId vẫn giữ
    // nguyên null như trước Giai đoạn 2, không có gì đổi khác.
    const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
    if (studentAccountId) {
      submission.studentAccountId = studentAccountId;
    }
    await submission.save();

    // Quyết định "có được xem lời giải NGAY LÚC NÀY không" chuyển hẳn về
    // server (trước đây client tự suy ra từ settings.showSolution ===
    // 'after_submit') — để hỗ trợ đúng 2 chế độ mới 'after_close'/'custom_time'
    // (client không đủ dữ liệu closeAt hiệu lực của lớp để tự tính đúng).
    const showSolution = isSolutionUnlocked(effectiveSettings, {
      assignmentCloseAt: effectiveSettings.closeAt || null,
    });

    return NextResponse.json(
      {
        score: result.correct,
        total: result.total,
        scorePoints: result.scorePoints,
        maxScorePoints: result.maxScorePoints,
        essayMaxScore: submission.essayMaxScore,
        essayGraded: false,
        showSolution,
        canRetake: canSelfRetake(effectiveSettings, submission.attemptNumber),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi nộp bài:', err);
    return NextResponse.json(
      { error: 'Không nộp được bài, vui lòng thử lại (bài làm hiện tại vẫn còn trên trình duyệt).' },
      { status: 500 }
    );
  }
}
