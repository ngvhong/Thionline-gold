import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/essay-image-proxy?url=... — chỉ cho GIÁO VIÊN đăng nhập, chỉ cho
// ảnh trên kho ảnh Cloudinary của app. Dùng làm phương án dự phòng cho công
// cụ "Chấm trên ảnh": khi trình duyệt không tải được ảnh trực tiếp để vẽ lên
// canvas (lỗi CORS), tải qua đây (cùng domain) thì vẫn vẽ và lưu được.
export async function GET(request: NextRequest) {
  const teacherId = await getVerifiedTeacherIdFromRequest(request);
  if (!teacherId) return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });

  const url = request.nextUrl.searchParams.get('url') || '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'URL không hợp lệ.' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
    return NextResponse.json({ error: 'Chỉ hỗ trợ ảnh của kho ảnh ứng dụng.' }, { status: 400 });
  }

  const upstream = await fetch(parsed.toString());
  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !type.startsWith('image/')) {
    return NextResponse.json({ error: 'Không tải được ảnh.' }, { status: 502 });
  }
  return new NextResponse(await upstream.arrayBuffer(), {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300' },
  });
}
