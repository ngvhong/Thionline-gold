import { NextRequest, NextResponse } from 'next/server';
import { put } from '@/lib/storage';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// POST /api/upload-exam-image — GV gọi lúc "Xuất bản" đề, để đẩy các ảnh
// cứng ngoài tikz (\includegraphics) GV đã chọn ở thư mục ảnh (imageMap
// trong ExamBuilder.tsx, hiện chỉ là blob: URL sống tạm trong trình duyệt
// GV) lên Vercel Blob thành URL bền vững, học sinh xem được (xem
// examRender.tsx buildImageUrlMap + StudentTakeExam.tsx).
//
// CẦN ĐĂNG NHẬP — khác upload-essay-image (route đó công khai vì học sinh
// không có tài khoản).
//
// KHÔNG lồng theo examId: lúc Xuất bản đề MỚI (chưa từng lưu), đề chưa có
// _id (id do /api/save-exam cấp — file đó nằm ngoài phần code trao đổi qua
// chat, xem bàn giao Bước 3) — nên route này nhận id tạm (draftId, GV tự
// sinh phía client, ví dụ Date.now()) chỉ để gom nhóm ảnh trong 1 lần xuất
// bản, không phải _id thật của đề trong MongoDB.
const MAX_BYTES = 15 * 1024 * 1024; // 15MB — ảnh gốc đề thi chưa nén như ảnh bài làm HS

// put() (storage.ts, Supabase) giờ có retry nội bộ khi gặp lỗi mạng
// thoáng qua (xem storage.ts) — cộng dồn có thể mất vài giây, nên xin
// thêm thời gian chạy để không bị nền tảng cắt ngang giữa chừng (mặc
// định 10s trên gói Hobby Vercel).
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const imageId = formData.get('imageId'); // dạng "[[HÌNH_FILE_n]]"
    const draftId = formData.get('draftId'); // id tạm phía client, gom nhóm theo lần xuất bản

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Thiếu file ảnh.' }, { status: 400 });
    }
    if (typeof imageId !== 'string' || !imageId) {
      return NextResponse.json({ error: 'Thiếu id ảnh.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Chỉ nhận file ảnh.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Ảnh quá nặng (trên 15MB).' }, { status: 400 });
    }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().slice(0, 5);
    const safeImageId = imageId.replace(/[^a-zA-Z0-9]/g, '_');
    const safeDraftId = typeof draftId === 'string' && draftId ? draftId.replace(/[^a-zA-Z0-9_-]/g, '') : 'noDraft';
    const pathname = `exam-images/${teacherId}/${safeDraftId}/${safeImageId}-${Date.now()}.${ext}`;

    const blob = await put(pathname, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ url: blob.url, imageId }, { status: 200 });
  } catch (err) {
    console.error('Lỗi tải ảnh cứng lên (Xuất bản đề):', err);
    return NextResponse.json(
      { error: 'Không tải ảnh lên được, thử lại.' },
      { status: 500 }
    );
  }
}
