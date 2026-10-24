import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { Exam } from '@/lib/examModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { resolveEffectiveSettings } from '@/lib/examAccessRules';

// GET /api/thi/[examId]?classId=... — CÔNG KHAI, học sinh không đăng nhập.
// Trả về tiêu đề đề + thời gian làm bài + danh sách tên học sinh trong lớp
// (để hiện dropdown "chọn tên mình"). Theo quyết định đã chốt: link dạng
// /thi/{examId}?class={classId}, không cần token riêng.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const classId = request.nextUrl.searchParams.get('classId');

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Link đề thi không hợp lệ.' }, { status: 400 });
    }
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return NextResponse.json({ error: 'Thiếu thông tin lớp trong link.' }, { status: 400 });
    }

    await connectToDatabase();

    // SỬA LỖI TỐC ĐỘ (nguyên nhân "mở link làm bài học sinh, chọn lớp rồi mở
    // đề cũng khá lâu"): TRƯỚC ĐÂY 4 câu truy vấn dưới đây chạy TUẦN TỰ từng
    // cái một (Exam -> Class -> Student -> ExamAssignment), dù CẢ 4 đều độc
    // lập với nhau — chỉ cần biết trước examId/classId (đã có sẵn từ URL),
    // không câu nào cần kết quả của câu trước để biết TRUY VẤN GÌ. Cộng dồn
    // 4 lượt round-trip tuần tự tới MongoDB (đặc biệt chậm ở lượt gọi đầu
    // của 1 lambda mới khởi động / kết nối MongoDB Atlas còn "lạnh") có thể
    // mất gấp 3-4 lần so với chạy song song. Giờ gộp cả 4 vào Promise.all —
    // các bước kiểm tra dữ liệu (exam có tồn tại/đã xuất bản chưa, class có
    // tồn tại chưa) chuyển xuống SAU khi có đủ kết quả, không đổi hành vi
    // logic, chỉ đổi thứ tự chạy.
    const [exam, cls, students, assignment] = await Promise.all([
      Exam.findById(examId, { title: 1, is_published: 1, settings: 1 }).lean(),
      ClassModel.findById(classId, { name: 1, selfRegisterMode: 1 }).lean(),
      StudentModel.find({ classId }, { name: 1 }).sort({ name: 1 }).lean(),
      ExamAssignmentModel.findOne({ examId, classId }).lean(),
    ]);

    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    if (!(exam as any).is_published) {
      return NextResponse.json({ error: 'Đề thi này chưa được giáo viên xuất bản.' }, { status: 403 });
    }

    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp học trong link này.' }, { status: 404 });
    }

    // Cài đặt (thời gian mở/đóng đề kiểu Azota, thời gian làm bài...) CÓ
    // HIỆU LỰC cho đúng lần giao đề này (examId + classId) — gộp mặc định
    // của đề với tuỳ chỉnh riêng của lớp (nếu có). CHỈ dùng để hiện thông
    // tin tham khảo cho học sinh ở đây — quyết định CHẶN thật sự nằm ở
    // /start (server-side, không tin giờ máy học sinh).
    const effective = resolveEffectiveSettings((exam as any).settings, assignment as any);

    return NextResponse.json(
      {
        examTitle: (exam as any).title || '(Đề thi)',
        className: (cls as any).name,
        duration: effective.duration ?? 45,
        students: students.map((s: any) => ({ _id: String(s._id), name: s.name })),
        // THÊM MỚI (tự báo danh kiểu Azota): cho frontend biết có nên hiện
        // "Không thấy tên mình?" hay không, và nếu hiện thì bấm xong có vào
        // làm bài ngay hay phải chờ GV duyệt — mặc định 'off' (ẩn) nếu GV
        // chưa bật, giữ đúng hành vi bảo mật cũ.
        selfRegisterMode: (cls as any).selfRegisterMode || 'off',
        openAt: effective.openAt || null,
        closeAt: effective.closeAt || null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi tải thông tin phòng thi:', err);
    return NextResponse.json(
      { error: 'Không tải được thông tin đề thi, thử tải lại trang.' },
      { status: 500 }
    );
  }
}
