import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { connectToDatabase } from '@/lib/mongodb';
import { ShortLinkModel } from '@/lib/shortLinkModel';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// Sinh mã ngắn, random, dùng trên URL (/s/{code}) — 6 ký tự hex, đủ ngắn để
// dán vào chat nhưng vẫn đủ khó đoán cho mục đích chia sẻ link công khai này
// (không phải mật khẩu — cùng tinh thần với mã link chung ?g= của Khối, xem
// generateUniqueGroupCode trong assign-exam/route.ts). Thử lại nếu trùng.
async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = crypto.randomBytes(3).toString('hex');
    const exists = await ShortLinkModel.findOne({ code }, { _id: 1 }).lean();
    if (!exists) return code;
  }
  // Cực kỳ khó xảy ra — vẫn có phương án dự phòng để không kẹt request.
  return crypto.randomBytes(6).toString('hex');
}

// POST /api/short-link — GV đã đăng nhập gọi khi mở panel chia sẻ (Giao đề
// cho lớp / Giao đề cho khối) để rút gọn link /thi/{examId}?class=...
// (hoặc ?g=...) thành /s/{code}. Body: { examId, target } — target là phần
// path+query của link gốc (KHÔNG gồm origin, vì origin có thể khác nhau
// giữa preview/production deploy trên Vercel).
//
// Idempotent theo target (xem unique index ở shortLinkModel.ts): gọi lại
// nhiều lần cho cùng 1 target trả về đúng code cũ, không sinh mã mới.
export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    const body = await request.json();
    const examId = String(body?.examId || '');
    const target = String(body?.target || '');

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'examId không hợp lệ.' }, { status: 400 });
    }
    // Chỉ nhận target dạng path nội bộ bắt đầu bằng "/thi/" — tránh bị lợi
    // dụng route này để tạo short link redirect tới domain khác (open
    // redirect) nếu sau này có ai gọi thẳng API mà không qua UI.
    if (!target.startsWith('/thi/')) {
      return NextResponse.json({ error: 'target không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();

    const exam = await Exam.findOne({ _id: examId, ownerId: teacherId }, { _id: 1 }).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề hoặc bạn không có quyền.' }, { status: 404 });
    }

    // Đã có short link cho đúng target này chưa — trả lại code cũ, không
    // tạo mã mới (xem ghi chú unique index ở shortLinkModel.ts).
    const existing = await ShortLinkModel.findOne({ target }, { code: 1 }).lean();
    if (existing) {
      return NextResponse.json({ code: (existing as any).code }, { status: 200 });
    }

    const code = await generateUniqueCode();
    await ShortLinkModel.create({ code, target, examId });

    return NextResponse.json({ code }, { status: 201 });
  } catch (err) {
    console.error('Lỗi tạo short link:', err);
    return NextResponse.json({ error: 'Không tạo được link rút gọn, thử lại.' }, { status: 500 });
  }
}
