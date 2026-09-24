import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { TeacherModel } from '@/lib/teacherModel';
import { canCreateOrEditExam, planExpiredMessage } from '@/lib/planAccess';
// THÊM MỚI (tư vấn "khoảng trống lớn quanh hình TikZ" — bản xuất Word/PDF
// không đi qua trình duyệt nên không được cắt sát như màn xem trước): cắt
// sát viewBox từng SVG trong tikz_list ngay lúc lưu, xem tikzCrop.ts.
import { applyTikzCropToRawData } from '@/lib/tikzCrop';

// SỬA: bản cũ tự khai báo lại ExamSchema riêng (chỉ có title/raw_data) và
// chỉ đọc { title, raw_data } từ body — bỏ sót `settings` và `is_published`
// mà ExamBuilder.tsx (publishExam) đã gửi kèm từ Bước 3, khiến mỗi lần
// "Xuất bản" KHÔNG set is_published: true (link công khai /thi/[examId]
// coi như đề chưa xuất bản) và mất luôn cài đặt phòng thi (thời gian làm
// bài, trộn câu...). Giờ dùng đúng model dùng chung (`@/lib/examModel`,
// đã có sẵn 2 field này) và nhận đủ cả settings/is_published từ body.
export async function POST(request: NextRequest) {
  try {
    // THÊM MỚI (bảo mật): trước đây route này không kiểm tra đăng nhập nên đề
    // tạo ra không gắn với GV nào cả — đây chính là gốc của lỗi 2 route
    // /api/exams và /api/exams/[id] không lọc/kiểm tra được chủ sở hữu. Từ
    // giờ bắt buộc đăng nhập để tạo đề, và gắn teacherId ngay lúc tạo.
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    // THÊM MỚI (gói dùng free/vĩnh viễn): "vẫn xem được nhưng không tạo/sửa
    // được đề thi mới" khi hết hạn free — route này là nơi TẠO đề MỚI nên
    // chặn thẳng ở đây, trước khi đọc body, để không tốn công parse dữ liệu
    // của 1 thao tác chắc chắn sẽ bị từ chối.
    await connectToDatabase();
    const teacher: any = await TeacherModel.findById(teacherId).select('planType freeExpiresAt').lean();
    if (!teacher || !canCreateOrEditExam(teacher)) {
      return NextResponse.json({ error: planExpiredMessage() }, { status: 403 });
    }

    const { title, raw_data, settings, is_published } = await request.json();

    if (!raw_data) {
      return NextResponse.json(
        { error: 'Thiếu dữ liệu đề thi (raw_data).' },
        { status: 400 }
      );
    }

    const newExam = new Exam({
      title: title?.trim() || 'Đề thi chưa đặt tên',
      // SỬA (tikz crop): raw_data.tikz_list[].svg được cắt sát viewBox
      // trước khi lưu — không đổi field/cấu trúc nào khác của raw_data.
      raw_data: applyTikzCropToRawData(raw_data),
      settings: settings || undefined,
      is_published: !!is_published,
      published_at: is_published ? new Date() : undefined,
      teacherId,
    });
    await newExam.save();

    return NextResponse.json(
      { success: true, id: newExam._id },
      { status: 201 }
    );
  } catch (err) {
    console.error('Lỗi lưu MongoDB:', err);
    return NextResponse.json(
      { error: 'Lưu thất bại, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
