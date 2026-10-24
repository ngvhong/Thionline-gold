import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';

// POST /api/thi/[examId]/self-register — CÔNG KHAI. Body: { classId, name }
//
// Tính năng "Tự báo danh" (giống Azota): CHỈ hoạt động khi GV đã bật
// `selfRegisterMode` khác 'off' cho đúng lớp này (xem nút gạt 3 trạng thái ở
// tab Quản lý lớp: TẮT / Tự động / Cần duyệt). Học sinh không thấy tên mình
// trong dropdown ở màn "Em là ai?" gõ tên tự do, gọi API này để:
//   1. Tạo 1 bản ghi Student mới (selfRegistered: true) trong đúng lớp.
//      - Chế độ 'auto': approved = true ngay, vào thi luôn.
//      - Chế độ 'approval': approved = false, phải chờ GV bấm "Duyệt" ở tab
//        Quản lý lớp (PUT /api/students/[id] { approved: true }) mới thi
//        được — /start sẽ chặn cho tới lúc đó.
//   2. Tạo luôn 1 Submission "chưa thi" (tương đương GV vừa "giao đề" cho
//      em này) — vì luồng /start bình thường YÊU CẦU đã có submission sẵn
//      (đề phải được giao trước), học sinh tự thêm tên vẫn cần bước này để
//      không phải sửa logic /start. Tạo submission ngay cả ở chế độ chờ
//      duyệt, để khi GV duyệt xong học sinh bấm lại là vào thi được luôn,
//      không cần bước "giao đề" thủ công thêm lần nữa.
// Trả về { studentId, studentName, approved } — approved=false báo cho
// frontend biết PHẢI hiện màn "đang chờ giáo viên duyệt" thay vì gọi tiếp
// /start ngay (vì /start sẽ từ chối cho tới khi được duyệt).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  try {
    const { examId } = await params;
    const { classId, name } = await request.json();

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Link đề thi không hợp lệ.' }, { status: 400 });
    }
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return NextResponse.json({ error: 'Thiếu thông tin lớp trong link.' }, { status: 400 });
    }
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      return NextResponse.json({ error: 'Em nhập tên trước đã nhé.' }, { status: 400 });
    }
    if (trimmedName.length > 100) {
      return NextResponse.json({ error: 'Tên quá dài, em nhập lại giúp cô/thầy.' }, { status: 400 });
    }

    await connectToDatabase();

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    if (!(exam as any).is_published) {
      return NextResponse.json({ error: 'Đề thi này chưa được giáo viên xuất bản.' }, { status: 403 });
    }

    const cls = await ClassModel.findById(classId).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp học trong link này.' }, { status: 404 });
    }
    // Chốt bảo mật quan trọng nhất của tính năng này: GV PHẢI bật tự báo
    // danh (mode khác 'off') cho lớp thì mới cho tạo học sinh mới ở đây —
    // nếu không, request POST thủ công (VD từ DevTools) vẫn bị chặn dù biết
    // đúng classId.
    const mode = (cls as any).selfRegisterMode || 'off';
    if (mode === 'off') {
      return NextResponse.json(
        { error: 'Lớp này chưa bật tự báo danh. Em liên hệ giáo viên để được thêm tên vào danh sách.' },
        { status: 403 }
      );
    }

    // THÊM MỚI (giờ mở/đóng thi): báo danh trễ giờ (sau closeAt) cũng vô
    // nghĩa — chặn luôn ở đây, không tạo Student/Submission mới. Không check
    // openAt ở đây vì báo danh sớm không có hại gì (em vẫn phải qua /start
    // mới thật sự bắt đầu làm bài, /start sẽ tự chặn nếu chưa tới giờ mở).
    const assignment = await ExamAssignmentModel.findOne({ examId, classId }).lean();
    const closeAt = (assignment as any)?.closeAt ? new Date((assignment as any).closeAt).getTime() : null;
    if (closeAt && Date.now() > closeAt) {
      return NextResponse.json(
        { error: 'Đã quá giờ làm bài này, em không thể báo danh nữa. Liên hệ giáo viên nếu cần hỗ trợ.' },
        { status: 403 }
      );
    }

    const student = await StudentModel.create({
      name: trimmedName,
      classId,
      selfRegistered: true,
      // 'approval' → chờ GV duyệt; 'auto' → coi như đã duyệt, thi ngay.
      approved: mode !== 'approval',
    });

    // Tạo submission "chưa thi" cho đúng đề này — idempotent-ish: nếu vì lý
    // do gì đó (bấm 2 lần rất nhanh) đã có bản ghi trùng thì bỏ qua, không
    // lỗi ra ngoài.
    const existing = await SubmissionModel.findOne({ studentId: student._id, examId }).lean();
    if (!existing) {
      await SubmissionModel.create({
        studentId: student._id,
        examId,
        status: 'chưa thi',
        attemptNumber: 1,
        assigned_at: new Date(),
      });
    }

    return NextResponse.json(
      {
        studentId: String(student._id),
        studentName: student.name,
        approved: !!student.approved,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Lỗi tự báo danh:', err);
    return NextResponse.json(
      { error: 'Không thêm được tên, thử lại giúp cô/thầy.' },
      { status: 500 }
    );
  }
}
