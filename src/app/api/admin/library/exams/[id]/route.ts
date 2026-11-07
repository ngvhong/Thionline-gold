import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { Exam } from '@/lib/examModel';
import { requireAdmin } from '@/lib/adminGuard';
import { countLiveTakersByExam, liveBlockMessage, unshareLibraryExams } from '@/lib/libraryUnshare';

// THÊM MỚI (25-10): ADMIN gỡ 1 đề của GV KHÁC khỏi kho đề chung (cây thư mục).
// CHỈ gỡ chia sẻ — bỏ nhánh + tắt shareWithTeachers/openForStudents — KHÔNG xóa
// đề: đề vẫn còn nguyên trong danh sách của GV chủ đề, lớp đã giao, link thi và
// bài làm của học sinh không đổi. GV chủ đề muốn chia sẻ lại thì tự làm lại.
//
// SỬA (v22): nếu đang có học sinh LÀM BÀI (đang thi, chưa quá giờ) thì KHÔNG gỡ,
// trả 409 + liveCount để admin chọn thời điểm khác. (Kiểm tra rồi mới ghi nên
// vẫn có khe hở vài mili-giây nếu đúng lúc đó có em bấm vào làm — chấp nhận được.)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Chỉ quản trị viên mới có quyền này.' }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID đề thi không hợp lệ.' }, { status: 400 });
    }

    // Đọc đề TRƯỚC khi gỡ để ghi nhật ký đủ ngữ cảnh (tên đề, GV chủ, nhánh).
    const before: any = await Exam.findById(id).select('title teacherId sharedFolderId').lean();
    if (!before) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }

    const live = await countLiveTakersByExam([id]);
    const liveCount = live.get(id) || 0;
    if (liveCount > 0) {
      return NextResponse.json(
        { error: liveBlockMessage(before.title, liveCount), code: 'STUDENTS_TAKING', liveCount },
        { status: 409 }
      );
    }

    await unshareLibraryExams(admin.email, [before]);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi admin gỡ đề khỏi kho chung:', err);
    return NextResponse.json({ error: 'Không gỡ được đề khỏi kho.' }, { status: 500 });
  }
}
