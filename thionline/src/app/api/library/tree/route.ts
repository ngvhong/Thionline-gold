import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { LibraryFolder } from '@/lib/libraryFolderModel';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): trả toàn bộ cây thư
// mục (phẳng, kèm parentId để client tự dựng cây lồng nhau), kèm đếm số đề
// `shareWithTeachers = true` gắn trực tiếp vào MỖI nhánh — dùng cho trang
// GV duyệt kho (`/kho-de-chung`).
//
// SỬA (Giai đoạn 4 — tab "Ôn luyện" cho học sinh): thêm nhánh rẽ theo query
// `?audience=student` — đúng như ghi chú để lại ở Giai đoạn 3. Khi có
// `audience=student`: đếm theo `openForStudents=true` (thay vì
// `shareWithTeachers`), và KHÔNG bắt buộc đăng nhập GV (học sinh — kể cả
// chưa đăng nhập tài khoản học sinh — vẫn xem được cây + số đề, chỉ khi bấm
// vào LÀM 1 đề cụ thể mới cần đăng nhập, xem `/api/library/thi/[examId]/start`).
// Nhánh mặc định (không có audience, hoặc audience khác 'student') giữ
// NGUYÊN 100% hành vi cũ của Giai đoạn 3 — GV vẫn phải đăng nhập, vẫn đếm
// theo shareWithTeachers.
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

    await connectToDatabase();

    const folders = await LibraryFolder.find().sort({ parentId: 1, order: 1, name: 1 }).lean();

    const matchField = forStudent ? 'openForStudents' : 'shareWithTeachers';
    const counts = await Exam.aggregate([
      { $match: { [matchField]: true, sharedFolderId: { $ne: null } } },
      { $group: { _id: '$sharedFolderId', count: { $sum: 1 } } },
    ]);
    const countMap: Record<string, number> = {};
    for (const c of counts) {
      countMap[String(c._id)] = c.count;
    }

    const foldersWithCount = folders.map((f: any) => ({
      _id: String(f._id),
      name: f.name,
      parentId: f.parentId ? String(f.parentId) : null,
      order: f.order,
      examCount: countMap[String(f._id)] || 0,
    }));

    return NextResponse.json({ folders: foldersWithCount }, { status: 200 });
  } catch (err) {
    console.error('Lỗi tải cây kho đề chung:', err);
    return NextResponse.json({ error: 'Không tải được cây thư mục.' }, { status: 500 });
  }
}
