import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { Exam } from '@/lib/examModel';
import { TeacherModel } from '@/lib/teacherModel';
import { requireAdmin } from '@/lib/adminGuard';
import { countLiveTakersByExam } from '@/lib/libraryUnshare';

// THÊM MỚI (v21): ADMIN xem TOÀN BỘ đề đang được chia sẻ vào kho đề chung —
// gồm cả đề chia sẻ cho giáo viên (shareWithTeachers) LẪN đề chỉ "mở cho học
// sinh" (openForStudents) mà trang /kho-de-chung của giáo viên không liệt kê.
// Dùng cho mục "Đề đang chia sẻ" trong tab Quản trị, để admin gỡ được mọi đề.
// Không trả nội dung đề (raw_data) cho nhẹ — chỉ thông tin để nhận diện.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Chỉ quản trị viên mới có quyền này.' }, { status: 403 });
    }

    const folderId = request.nextUrl.searchParams.get('folderId');
    const filter: Record<string, unknown> = {
      sharedFolderId: { $ne: null },
      $or: [{ shareWithTeachers: true }, { openForStudents: true }, { openForMockExam: true }],
    };
    if (folderId) {
      if (!mongoose.Types.ObjectId.isValid(folderId)) {
        return NextResponse.json({ error: 'folderId không hợp lệ.' }, { status: 400 });
      }
      filter.sharedFolderId = folderId;
    }

    const exams: any[] = await Exam.find(filter)
      .select('title teacherId sharedFolderId shareWithTeachers openForStudents openForMockExam published_at created_at')
      .sort({ published_at: -1, created_at: -1 })
      .limit(500)
      .lean();

    const teacherIds = Array.from(new Set(exams.map((e) => e.teacherId).filter(Boolean)));
    const teachers: any[] = teacherIds.length
      ? await TeacherModel.find({ _id: { $in: teacherIds } }).select('name email').lean()
      : [];
    const teacherMap: Record<string, { name: string; email: string }> = {};
    for (const t of teachers) teacherMap[String(t._id)] = { name: t.name || '', email: t.email || '' };

    // THÊM MỚI (v22): số HS đang làm bài của từng đề, để admin thấy đề nào đang
    // bận trước khi bấm gỡ. Lỗi đếm không làm hỏng cả danh sách.
    let liveMap = new Map<string, number>();
    try {
      liveMap = await countLiveTakersByExam(exams.map((e) => String(e._id)));
    } catch (err) {
      console.error('Lỗi đếm HS đang làm bài của đề chia sẻ:', err);
    }

    return NextResponse.json({
      exams: exams.map((e) => ({
        _id: String(e._id),
        title: e.title,
        folderId: e.sharedFolderId ? String(e.sharedFolderId) : null,
        shareWithTeachers: !!e.shareWithTeachers,
        openForStudents: !!e.openForStudents,
        openForMockExam: !!e.openForMockExam,
        liveCount: liveMap.get(String(e._id)) || 0,
        teacherName: teacherMap[String(e.teacherId)]?.name || 'Không rõ',
        teacherEmail: teacherMap[String(e.teacherId)]?.email || '',
        published_at: e.published_at || e.created_at || null,
      })),
    });
  } catch (err) {
    console.error('Lỗi admin tải danh sách đề đang chia sẻ:', err);
    return NextResponse.json({ error: 'Không tải được danh sách đề đang chia sẻ.' }, { status: 500 });
  }
}
