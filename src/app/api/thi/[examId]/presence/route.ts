import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { SubmissionModel } from '@/lib/submissionModel';
import { abandonFreeSubmission, leftCutoff } from '@/lib/abandonLeft';

// POST /api/thi/[examId]/presence — CÔNG KHAI (giống /submit, tin submissionId).
// Body: { submissionId, action: 'leave' | 'back' }
//   leave: học sinh vừa ẩn tab/rời app -> ghi leftAt (1 lần/lần rời, KHÔNG định kỳ).
//   back : học sinh quay lại -> xoá leftAt. Nếu lượt TỰ DO (Thi thử/Ôn luyện) đã
//          rời quá hạn thì ngắt luôn tại đây và trả { abandoned: true } để trình
//          duyệt báo cho em; lượt của lớp thì chỉ xoá leftAt (không bao giờ reset).
// Rất nhẹ: 1 updateOne/findOne theo _id.
export async function POST(request: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const { examId } = await params;
    const body = await request.json().catch(() => ({}));
    const { submissionId, action } = body || {};
    if (
      !mongoose.Types.ObjectId.isValid(examId) ||
      !mongoose.Types.ObjectId.isValid(submissionId) ||
      (action !== 'leave' && action !== 'back')
    ) {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }
    await connectToDatabase();

    if (action === 'leave') {
      await SubmissionModel.updateOne(
        { _id: submissionId, examId, status: 'đang thi' },
        { $set: { leftAt: new Date() } }
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const sub: any = await SubmissionModel.findOne({ _id: submissionId, examId }, { status: 1, studentId: 1, leftAt: 1, attemptNumber: 1 }).lean();
    // Lượt đã bị ngắt (xoá / về 'chưa thi') từ trước.
    if (!sub || sub.status === 'chưa thi') {
      return NextResponse.json({ ok: true, abandoned: true }, { status: 200 });
    }
    if (sub.status !== 'đang thi') {
      return NextResponse.json({ ok: true }, { status: 200 }); // đã nộp
    }
    const isFree = !sub.studentId;
    if (isFree && sub.leftAt && new Date(sub.leftAt) < leftCutoff()) {
      const done = await abandonFreeSubmission(sub);
      if (done) return NextResponse.json({ ok: true, abandoned: true }, { status: 200 });
    }
    if (sub.leftAt) {
      await SubmissionModel.updateOne({ _id: submissionId, status: 'đang thi' }, { $unset: { leftAt: 1 } });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi ghi trạng thái rời/quay lại:', err);
    return NextResponse.json({ error: 'Không ghi được trạng thái.' }, { status: 500 });
  }
}
