import { NextRequest, NextResponse } from 'next/server';
import { runSafeCleanup } from '@/lib/autoCleanup';

// GET /api/cron/cleanup[?dryRun=1] — gọi tay hoặc từ cron ngoài. Cần header
// "Authorization: Bearer <CRON_SECRET>" (đặt CRON_SECRET trong biến môi
// trường). Chưa đặt CRON_SECRET thì route từ chối hẳn. Bình thường KHÔNG cần
// gọi route này vì app tự dọn mỗi ngày khi có người đăng nhập (xem
// maybeRunDailyCleanup); dùng ?dryRun=1 để xem trước sẽ dọn những gì.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'Chưa cấu hình CRON_SECRET.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Không có quyền.' }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';
  const result = await runSafeCleanup({ dryRun });
  return NextResponse.json(result);
}
