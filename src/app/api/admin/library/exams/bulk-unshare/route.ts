import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { Exam } from '@/lib/examModel';
import { requireAdmin } from '@/lib/adminGuard';
import { countLiveTakersByExam, unshareLibraryExams } from '@/lib/libraryUnshare';

// THÊM MỚI (v22): ADMIN gỡ HÀNG LOẠT đề khỏi kho đề chung. Cùng luật với gỡ 1
// đề: chỉ gỡ chia sẻ, KHÔNG xoá đề; đề nào đang có học sinh làm bài thì BỎ QUA
// (không gỡ) và báo lại trong `blocked` để admin gỡ lại sau. Đề còn lại vẫn gỡ
// bình thường (không "hỏng cả lô" vì 1 đề bận).
export const dynamic = 'force-dynamic';

const MAX_IDS = 200;

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Chỉ quản trị viên mới có quyền này.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawIds: unknown = body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: 'Chưa chọn đề nào để gỡ.' }, { status: 400 });
    }
    const ids = [...new Set(rawIds.map((x) => String(x)))];
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `Mỗi lần chỉ gỡ tối đa ${MAX_IDS} đề.` }, { status: 400 });
    }
    if (ids.some((x) => !mongoose.Types.ObjectId.isValid(x))) {
      return NextResponse.json({ error: 'Có ID đề thi không hợp lệ.' }, { status: 400 });
    }

    const befores: any[] = await Exam.find({ _id: { $in: ids } })
      .select('title teacherId sharedFolderId')
      .lean();
    const found = new Set(befores.map((b) => String(b._id)));
    const missing = ids.filter((x) => !found.has(x));

    const live = await countLiveTakersByExam(befores.map((b) => String(b._id)));
    const blocked = befores
      .filter((b) => (live.get(String(b._id)) || 0) > 0)
      .map((b) => ({ id: String(b._id), title: b.title as string, liveCount: live.get(String(b._id)) || 0 }));
    const blockedIds = new Set(blocked.map((b) => b.id));
    const toUnshare = befores.filter((b) => !blockedIds.has(String(b._id)));

    await unshareLibraryExams(admin.email, toUnshare);

    return NextResponse.json(
      {
        ok: true,
        unsharedIds: toUnshare.map((b) => String(b._id)),
        blocked,
        // Đề không còn tồn tại (đã bị xoá) — giao diện sẽ bỏ khỏi danh sách.
        missingIds: missing,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi admin gỡ hàng loạt đề khỏi kho chung:', err);
    return NextResponse.json({ error: 'Không gỡ được các đề khỏi kho.' }, { status: 500 });
  }
}
