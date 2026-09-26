import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { TeacherModel } from '@/lib/teacherModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): xem ĐẦY ĐỦ nội dung
// 1 đề đã `shareWithTeachers = true` (readonly) — dùng cho màn "xem trước"
// tại `/kho-de-chung` TRƯỚC khi GV bấm "Lấy đề này về". Tách hẳn khỏi
// `GET /api/exams/[id]` (route đó CHỈ trả về đúng chủ đề — xem route.ts) vì
// đây là 1 luồng xem CỦA-NGƯỜI-KHÁC có điều kiện khác hẳn (phải share, không
// cần là chủ), không mở rộng route cũ để tránh lẫn 2 luồng phân quyền.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const exam: any = await Exam.findById(id).lean();
    if (!exam || !exam.shareWithTeachers) {
      // Cố tình trả 404 (không phải 403) cho cả 2 trường hợp "không tồn
      // tại" lẫn "tồn tại nhưng chưa share" — không tiết lộ cho người gọi
      // biết đề có tồn tại hay không nếu chưa được phép xem.
      return NextResponse.json({ error: 'Không tìm thấy đề thi này trong kho đề chung.' }, { status: 404 });
    }

    const teacher: any = exam.teacherId
      ? await TeacherModel.findById(exam.teacherId).select('name').lean()
      : null;

    return NextResponse.json(
      {
        exam: {
          _id: String(exam._id),
          title: exam.title,
          raw_data: exam.raw_data,
          settings: exam.settings,
          created_at: exam.created_at,
          teacherName: teacher?.name || 'Không rõ',
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi xem trước đề trong kho đề chung:', err);
    return NextResponse.json({ error: 'Không tải được đề thi này.' }, { status: 500 });
  }
}
