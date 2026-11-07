import { SubmissionModel } from '@/lib/submissionModel';

// NGẮT LƯỢT THI THỬ/ÔN LUYỆN KHI HỌC SINH RỜI APP QUÁ LÂU (GV yêu cầu 6-11).
//
// BỐI CẢNH: nhiều người vào xem thử, mở nhiều đề rồi thoát app mà không nộp ->
// các lượt 'đang thi' (thí sinh tự do, studentId = null) nằm lại tới khi hết
// giờ làm bài + 5 phút, đội số "đang thi" và làm các lệnh chốt-quá-giờ phải
// chấm hàng loạt.
//
// CÁCH LÀM (KHÔNG heartbeat): trình duyệt chỉ báo 2 sự kiện — "rời tab/app"
// (ghi leftAt) và "quay lại" (xoá leftAt) — xem api/thi/[examId]/presence.
// Lượt nào có leftAt cũ hơn LEFT_ABANDON_MS mà chưa quay lại thì bị ngắt:
//   - lượt làm lại (attemptNumber > 1): xoá luôn lượt đó (lượt đã nộp trước đó
//     vẫn còn nguyên, là kết quả mới nhất);
//   - lượt đầu tiên: trả về 'chưa thi' (xoá started_at) như chưa từng mở.
// CHỈ áp dụng cho lượt tự do (Thi thử/Ôn luyện). Lượt của học sinh trong lớp
// KHÔNG bị reset (reset sẽ cho phép làm lại đồng hồ/lượt) — chúng chỉ bị ẩn
// khỏi danh sách "đang thi" khi rời quá hạn (xem notLeftTooLongFilter).
export const LEFT_ABANDON_MS = 4 * 60 * 1000;

export function leftCutoff(): Date {
  return new Date(Date.now() - LEFT_ABANDON_MS);
}

// Điều kiện Mongo: KHÔNG phải lượt "đã rời quá hạn".
export function notLeftTooLongFilter(): any {
  return { $or: [{ leftAt: { $exists: false } }, { leftAt: null }, { leftAt: { $gte: leftCutoff() } }] };
}

// Ngắt 1 lượt tự do. Điều kiện status 'đang thi' -> nếu em vừa nộp thật thì không đụng.
export async function abandonFreeSubmission(sub: { _id: any; attemptNumber?: number }): Promise<boolean> {
  if ((sub.attemptNumber || 1) > 1) {
    const r = await SubmissionModel.deleteOne({ _id: sub._id, status: 'đang thi' });
    return r.deletedCount > 0;
  }
  const r = await SubmissionModel.updateOne(
    { _id: sub._id, status: 'đang thi' },
    { $set: { status: 'chưa thi' }, $unset: { started_at: 1, leftAt: 1 } }
  );
  return r.modifiedCount > 0;
}

// Quét & ngắt các lượt tự do đã rời quá hạn. Truyền studentAccountId để chỉ quét
// của 1 tài khoản (rẻ, có index). Tối đa `limit` lượt mỗi lần gọi.
export async function abandonLeftFreeSubmissions(opts: { studentAccountId?: any; limit?: number } = {}): Promise<number> {
  const filter: any = {
    status: 'đang thi',
    $or: [{ studentId: null }, { studentId: { $exists: false } }],
    leftAt: { $lt: leftCutoff() },
  };
  if (opts.studentAccountId) filter.studentAccountId = opts.studentAccountId;
  const stale: any[] = await SubmissionModel.find(filter, { _id: 1, attemptNumber: 1 })
    .limit(opts.limit ?? 500)
    .lean();
  let n = 0;
  for (const s of stale) {
    try {
      if (await abandonFreeSubmission(s)) n++;
    } catch {
      /* 1 lượt lỗi không làm hỏng cả lượt quét */
    }
  }
  return n;
}
