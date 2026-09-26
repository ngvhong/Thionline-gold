import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { TeacherModel } from '@/lib/teacherModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { canCreateOrEditExam, planExpiredMessage } from '@/lib/planAccess';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): GV đang đăng nhập
// bấm "Lấy đề này về" — nhân bản 1 đề đã `shareWithTeachers = true` thành 1
// đề MỚI hoàn toàn thuộc về GV đang bấm. Sửa bản sao sau này KHÔNG ảnh
// hưởng đề gốc (khác record Mongo hoàn toàn, chỉ copy dữ liệu tại thời điểm
// bấm, không tham chiếu ngược lại đề gốc).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    // THÊM MỚI (gói dùng free/vĩnh viễn): lấy đề về cũng là 1 cách "tạo đề
    // mới" (tạo thêm 1 record Exam) — áp cùng điều kiện chặn khi hết hạn
    // free như tạo/sửa đề bình thường, tránh 1 đường vòng bỏ qua giới hạn.
    const teacher: any = await TeacherModel.findById(teacherId).select('planType freeExpiresAt').lean();
    if (!teacher || !canCreateOrEditExam(teacher)) {
      return NextResponse.json({ error: planExpiredMessage() }, { status: 403 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'ID đề thi không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();
    const original: any = await Exam.findById(id).lean();
    if (!original || !original.shareWithTeachers) {
      // Cùng lý do 404 (không phải 403) như route xem trước — không tiết lộ
      // sự tồn tại của đề chưa được phép lấy, kể cả biết đúng examId.
      return NextResponse.json({ error: 'Không tìm thấy đề thi này trong kho đề chung.' }, { status: 404 });
    }

    const cloned = await Exam.create({
      title: original.title ? `${original.title} (bản sao)` : 'Đề chưa đặt tên (bản sao)',
      teacherId,
      raw_data: original.raw_data,
      settings: original.settings,
      is_published: false,
      published_at: null,
      folder: '',
      // Reset hẳn 3 field chia sẻ — bản sao là đề RIÊNG của GV vừa lấy về,
      // không tự động thuộc kho chung/nhánh cũ, không tự mở cho học sinh.
      sharedFolderId: null,
      shareWithTeachers: false,
      openForStudents: false,
    });

    return NextResponse.json({ newExamId: String(cloned._id) }, { status: 201 });
  } catch (err) {
    console.error('Lỗi lấy đề từ kho đề chung:', err);
    return NextResponse.json({ error: 'Không lấy được đề này về.' }, { status: 500 });
  }
}
