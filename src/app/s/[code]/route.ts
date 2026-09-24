import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ShortLinkModel } from '@/lib/shortLinkModel';

// GET /s/[code] — CÔNG KHAI, học sinh không đăng nhập (giống hệt tinh thần
// /thi/[examId] — route công khai, xem examAccessRules.ts). Tra `code` ra
// `target` rồi chuyển hướng (307) tới đúng link gốc /thi/{examId}?class=...
//
// Dùng redirect 307 (Temporary Redirect), KHÔNG dùng 308/301 (permanent):
// dù target của 1 code không đổi sau khi tạo, dùng 307 để trình duyệt/crawler
// không cache cứng việc redirect này ở phía client — nếu sau này cần đổi
// chiến lược (ví dụ tạm khóa 1 short link) thì đổi được ngay, không phải chờ
// người dùng xóa cache trình duyệt.
//
// Các nền tảng lấy preview link (Facebook/Messenger/Zalo) đều tự động dò
// theo redirect để lấy đúng thẻ Open Graph ở trang đích /thi/[examId] —
// không cần làm gì thêm ở đây, opengraph-image.tsx/page.tsx của route đó
// vẫn hoạt động y hệt như khi chia sẻ thẳng link dài.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    await connectToDatabase();
    const link = await ShortLinkModel.findOne({ code }, { target: 1 }).lean();

    if (!link || !(link as any).target) {
      // Link không tồn tại/sai — đưa về trang chủ thay vì màn lỗi trắng,
      // để học sinh bấm nhầm ký tự vẫn còn đường quay lại thay vì bế tắc.
      return NextResponse.redirect(new URL('/', request.url), 307);
    }

    return NextResponse.redirect(new URL((link as any).target, request.url), 307);
  } catch (err) {
    console.error('Lỗi chuyển hướng short link:', err);
    return NextResponse.redirect(new URL('/', request.url), 307);
  }
}
