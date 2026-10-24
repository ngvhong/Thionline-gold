import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { TeacherModel } from '@/lib/teacherModel';
import { canCreateOrEditExam, planExpiredMessage } from '@/lib/planAccess';
// THÊM MỚI (tư vấn "khoảng trống lớn quanh hình TikZ"): xem ghi chú đầy đủ
// ở save-exam/route.ts — route này là nơi GV "Lưu"/"Xuất bản" LẠI 1 đề đã
// có (PATCH), nên cũng phải cắt sát ở đây, không chỉ lúc tạo mới.
import { applyTikzCropToRawData } from '@/lib/tikzCrop';
import { deleteExamImageBlobs } from '@/lib/blobCleanup';

// SỬA LỖI (cùng nguyên nhân với /api/exams — route TĨNH bị Next.js cache lại
// response): GET chi tiết 1 đề cũng không đọc cookies/headers/searchParams
// nên có thể bị cache, khiến mở lại đề vừa lưu/xuất bản (đã có svg mới) vẫn
// thấy dữ liệu CŨ (chưa có svg) cho tới khi cache tự hết hạn — đúng triệu
// chứng "chờ rất lâu mới thấy hình svg". Ép route luôn chạy động.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// SỬA LỖI BẢO MẬT: route này trước đây không kiểm tra đăng nhập/chủ sở hữu —
// ai biết đúng ID (chuỗi Mongo, khó đoán nhưng không phải bất khả thi, có thể
// lộ qua log/lịch sử trình duyệt/chia sẻ nhầm link) đều xem được toàn bộ nội
// dung đề (câu hỏi + đáp án), kể cả đề CHƯA xuất bản của GV khác. Giờ bắt
// buộc đăng nhập và chỉ trả về nếu đúng là đề của GV đang gọi.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const exam = await Exam.findById(id).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    if ((exam as any).teacherId !== teacherId) {
      return NextResponse.json({ error: 'Bạn không có quyền xem đề thi này.' }, { status: 403 });
    }

    return NextResponse.json({ exam }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy chi tiết đề:', err);
    return NextResponse.json(
      { error: 'Không tải được đề thi, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// THÊM MỚI: PATCH — ban đầu chỉ dùng để đổi thư mục (folder) của 1 đề.
// MỞ RỘNG: giờ còn nhận title/raw_data/settings/is_published — dùng khi
// giáo viên mở lại 1 đề đã lưu, sửa nội dung/cài đặt trong tab "Cài đặt"
// rồi bấm "Lưu"/"Xuất bản" — ExamBuilder.tsx sẽ gọi PATCH tới đúng _id đó
// (thay vì POST tạo bản ghi MỚI) để CẬP NHẬT tại chỗ, giữ nguyên link công
// khai /thi/[id] cũ (học sinh không phải nhận link mới mỗi lần GV sửa đề).
// SỬA LỖI BẢO MẬT: cùng vấn đề với GET ở trên nhưng NẶNG HƠN — route này
// trước đây không kiểm tra gì cả, nghĩa là bất kỳ ai biết ID đều có thể SỬA
// nội dung/cài đặt/trạng thái xuất bản của đề GV khác. Giờ bắt buộc đăng
// nhập và chỉ cho sửa nếu đúng là chủ đề.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const existing = await Exam.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    if ((existing as any).teacherId !== teacherId) {
      return NextResponse.json({ error: 'Bạn không có quyền sửa đề thi này.' }, { status: 403 });
    }

    const body = await request.json();
    const update: Record<string, unknown> = {};
    if (typeof body.folder === 'string') update.folder = body.folder;
    if (typeof body.title === 'string' && body.title.trim()) update.title = body.title.trim();
    // raw_data/settings: chấp nhận object bất kỳ (kể cả rỗng {}), chỉ loại
    // trừ null/undefined — khác với check "falsy" thông thường vì {} vẫn là
    // dữ liệu hợp lệ (ví dụ đề không còn hình TikZ nào).
    // SỬA (tikz crop): cắt sát viewBox từng SVG trong tikz_list trước khi
    // ghi update.raw_data — không đổi field/cấu trúc nào khác của raw_data.
    if (body.raw_data && typeof body.raw_data === 'object') {
      update.raw_data = applyTikzCropToRawData(body.raw_data);
    }
    if (body.settings && typeof body.settings === 'object') update.settings = body.settings;
    if (typeof body.is_published === 'boolean') {
      update.is_published = body.is_published;
      if (body.is_published) update.published_at = new Date();
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Không có trường hợp lệ để cập nhật.' }, { status: 400 });
    }

    // THÊM MỚI (gói dùng free/vĩnh viễn): "vẫn xem được nhưng không tạo/sửa
    // được đề thi mới" khi hết hạn free — CHỈ chặn khi update động tới NỘI
    // DUNG đề (title/raw_data/settings/is_published). Đổi `folder` (kéo thả
    // sắp xếp đề vào thư mục khác) là thao tác TỔ CHỨC, không phải soạn/sửa
    // đề, nên vẫn cho phép kể cả khi đã hết hạn — nếu không GV hết hạn sẽ
    // không sắp xếp lại được thư mục của chính các đề cũ đã có từ trước.
    const isContentUpdate = Object.keys(update).some((key) => key !== 'folder');
    if (isContentUpdate) {
      const teacher: any = await TeacherModel.findById(teacherId).select('planType freeExpiresAt').lean();
      if (!teacher || !canCreateOrEditExam(teacher)) {
        return NextResponse.json({ error: planExpiredMessage() }, { status: 403 });
      }
    }

    const exam = await Exam.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }

    return NextResponse.json({ exam, id }, { status: 200 });
  } catch (err) {
    console.error('Lỗi cập nhật đề:', err);
    return NextResponse.json(
      { error: 'Không cập nhật được đề thi, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// THÊM MỚI: DELETE — xoá vĩnh viễn 1 đề khỏi MongoDB (dùng cho nút 🗑️ trong
// panel "Danh sách đề đã lưu"). Không xoá kèm submissions liên quan (ngoài
// phạm vi yêu cầu hiện tại) — chỉ xoá bản ghi Exam.
// SỬA LỖI BẢO MẬT: cùng vấn đề — trước đây bất kỳ ai biết ID đều XOÁ VĨNH VIỄN
// được đề của GV khác. Giờ bắt buộc đăng nhập và chỉ cho xoá nếu đúng chủ đề.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const existing = await Exam.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }
    if ((existing as any).teacherId !== teacherId) {
      return NextResponse.json({ error: 'Bạn không có quyền xoá đề thi này.' }, { status: 403 });
    }

    // SỬA (chi phí Blob): TRƯỚC KHI xóa record Exam, quét raw_data lấy hết
    // URL ảnh minh họa (\includegraphics) đã upload lúc "Xuất bản" và xóa
    // trên Vercel Blob — nếu không làm bước này TRƯỚC, raw_data sẽ mất theo
    // exam, không còn cách nào tra lại URL ảnh nào cần xóa nữa (ảnh trở
    // thành mồ côi, vẫn tính phí lưu trữ mãi mãi dù không ai dùng tới).
    // KHÔNG đụng tới Submission của đề này — giữ đúng phạm vi ban đầu của
    // route (đã ghi rõ ở comment DELETE phía trên): xóa đề KHÔNG kèm xóa
    // lịch sử bài làm/điểm của học sinh, đó là quyết định thiết kế có chủ
    // đích, không phải thiếu sót.
    await deleteExamImageBlobs((existing as any).raw_data);

    const exam = await Exam.findByIdAndDelete(id).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xoá đề:', err);
    return NextResponse.json(
      { error: 'Không xoá được đề thi, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
