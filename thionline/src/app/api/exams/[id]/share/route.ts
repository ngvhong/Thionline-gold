import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { LibraryFolder } from '@/lib/libraryFolderModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): GV chủ đề (bắt buộc
// đúng chủ, kiểm tra `Exam.teacherId === teacherId`) bật/tắt chia sẻ 1 đề đã
// publish vào kho chung — set `sharedFolderId` + `shareWithTeachers` (và
// `openForStudents`, dùng ở Giai đoạn 4 — checkbox đã hiện sẵn ở popup
// nhưng CHƯA có route nào cho học sinh làm bài qua field này ở Giai đoạn 3).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID đề thi không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();
    const existing: any = await Exam.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    if (existing.teacherId !== teacherId) {
      return NextResponse.json({ error: 'Bạn không có quyền chia sẻ đề thi này.' }, { status: 403 });
    }

    const body = await request.json();
    const update: Record<string, unknown> = {};

    if (typeof body.shareWithTeachers === 'boolean') {
      if (body.shareWithTeachers && !existing.is_published) {
        return NextResponse.json(
          { error: 'Chỉ chia sẻ được đề đã Xuất bản — hãy Xuất bản đề trước.' },
          { status: 400 }
        );
      }
      update.shareWithTeachers = body.shareWithTeachers;
    }

    if (typeof body.openForStudents === 'boolean') {
      update.openForStudents = body.openForStudents;
    }

    if ('sharedFolderId' in body) {
      if (body.sharedFolderId === null) {
        update.sharedFolderId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(body.sharedFolderId)) {
          return NextResponse.json({ error: 'sharedFolderId không hợp lệ.' }, { status: 400 });
        }
        const folder = await LibraryFolder.findById(body.sharedFolderId).lean();
        if (!folder) {
          return NextResponse.json({ error: 'Không tìm thấy nhánh thư mục này.' }, { status: 404 });
        }
        update.sharedFolderId = body.sharedFolderId;
      }
    }

    // Bật shareWithTeachers/openForStudents mà chưa chọn nhánh (cả field cũ
    // lẫn body lần này đều null) là vô nghĩa — đề bật cờ chia sẻ nhưng
    // không gắn vào đâu sẽ không hiện ở bất kỳ nhánh nào trong /kho-de-chung.
    const willShareTeachers = update.shareWithTeachers ?? existing.shareWithTeachers;
    const willShareStudents = update.openForStudents ?? existing.openForStudents;
    const willHaveFolder = 'sharedFolderId' in update ? update.sharedFolderId : existing.sharedFolderId;
    if ((willShareTeachers || willShareStudents) && !willHaveFolder) {
      return NextResponse.json({ error: 'Hãy chọn 1 nhánh thư mục trước khi bật chia sẻ.' }, { status: 400 });
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Không có trường hợp lệ để cập nhật.' }, { status: 400 });
    }

    const exam = await Exam.findByIdAndUpdate(id, update, { new: true }).lean();
    return NextResponse.json({ exam }, { status: 200 });
  } catch (err) {
    console.error('Lỗi chia sẻ đề vào kho đề chung:', err);
    return NextResponse.json({ error: 'Không cập nhật được trạng thái chia sẻ.' }, { status: 500 });
  }
}
