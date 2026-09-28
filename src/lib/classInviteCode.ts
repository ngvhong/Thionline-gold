import { ClassModel } from './classModel';

// Mã lớp 6 ký tự chữ HOA + số, bỏ các ký tự dễ nhầm (0/O, 1/I/L) để học sinh
// gõ tay không sai. Trường inviteCode trong ClassModel đã có sẵn từ trước
// (unique + sparse) nhưng chưa nơi nào sinh mã -> mọi lớp đều không có mã,
// học sinh không vào lớp được. File này là nơi DUY NHẤT sinh/bù mã.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

// Sinh 1 mã chưa ai dùng (kiểm tra trùng trong DB, thử lại tối đa 10 lần).
export async function generateUniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    const taken = await ClassModel.exists({ inviteCode: code });
    if (!taken) return code;
  }
  // Cực hiếm (không gian ~887 triệu mã) — thêm 1 ký tự để chắc chắn khác.
  return randomCode(7);
}

// Bù mã cho lớp cũ chưa có mã. Trả về mã hiện có (hoặc mã vừa tạo). Chỉ ghi
// khi inviteCode còn trống ($exists: false / null) nên không bao giờ đè mã đã
// có, và an toàn nếu 2 request chạy song song.
export async function ensureInviteCode(classId: unknown): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await generateUniqueInviteCode();
    try {
      const res = await ClassModel.updateOne(
        { _id: classId, $or: [{ inviteCode: { $exists: false } }, { inviteCode: null }, { inviteCode: '' }] },
        { $set: { inviteCode: code } }
      );
      if (res.modifiedCount === 1) return code;
      const current = await ClassModel.findById(classId).select('inviteCode').lean();
      return (current as any)?.inviteCode || null;
    } catch (err: any) {
      if (err?.code === 11000) continue; // trùng mã (rất hiếm) -> sinh lại
      throw err;
    }
  }
  return null;
}
