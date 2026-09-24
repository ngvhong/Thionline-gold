import mongoose from 'mongoose';
import type { NextRequest } from 'next/server';
import { connectToDatabase } from './mongodb';

// THÊM MỚI (rate limit đăng ký/đăng nhập): mỗi lần gọi checkRateLimit() ghi
// 1 "lượt thử" vào đây, gắn với `key` (vd. "register:1.2.3.4"). Lưu trong
// MongoDB thay vì biến JS trong RAM — vì Next.js API route có thể chạy trên
// NHIỀU instance (serverless/nhiều worker), biến RAM mỗi instance đếm riêng
// nên đếm sai (dễ vượt giới hạn thật). MongoDB là 1 nguồn đếm DUY NHẤT dùng
// chung cho mọi instance.
const RateLimitHitSchema = new mongoose.Schema({
  key: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
});
RateLimitHitSchema.index({ key: 1, created_at: 1 });
// TTL: tự xoá sau 2 giờ — chỉ để dọn rác định kỳ, KHÔNG dùng để tính giới
// hạn (việc tính giới hạn dùng đúng `windowSeconds` truyền vào mỗi lần gọi
// checkRateLimit, có thể ngắn hơn 2 giờ nhiều, vd. 15 phút cho đăng nhập).
// Đặt 2 giờ vì đó là window DÀI NHẤT đang dùng (đăng ký, 1 giờ) + biên an toàn.
RateLimitHitSchema.index({ created_at: 1 }, { expireAfterSeconds: 2 * 60 * 60 });

const RateLimitHitModel =
  mongoose.models.RateLimitHit || mongoose.model('RateLimitHit', RateLimitHitSchema);

// Lấy IP thật của người gọi — Next.js App Router không có request.ip đáng
// tin cậy khi chạy sau proxy/CDN (Vercel, Nginx...), phải đọc header
// x-forwarded-for (proxy chuẩn thường set) và lấy IP ĐẦU TIÊN trong danh
// sách (IP gốc của client, các IP sau là các proxy trung gian).
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

// Kiểm tra + ghi nhận 1 lượt thử cho `key` trong cửa sổ `windowSeconds` gần
// nhất. Nếu số lượt trong cửa sổ đã đạt `maxAttempts`, KHÔNG ghi thêm (lượt
// hiện tại bị từ chối) và trả về số giây còn phải đợi tới khi lượt thử CŨ
// NHẤT trong cửa sổ hết hạn (sliding window, chính xác hơn kiểu "cứ đầu giờ
// lại reset" — tránh trường hợp ai đó canh đúng đầu giờ để thử dồn 2 lượt
// liền nhau).
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  await connectToDatabase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  const hits = await RateLimitHitModel.find({ key, created_at: { $gte: windowStart } })
    .sort({ created_at: 1 })
    .select('created_at')
    .lean();

  if (hits.length >= maxAttempts) {
    const oldest = new Date((hits[0] as any).created_at);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(windowSeconds - (now.getTime() - oldest.getTime()) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }

  await RateLimitHitModel.create({ key, created_at: now });
  return { allowed: true, retryAfterSeconds: 0 };
}

// Đổi số giây thành chuỗi tiếng Việt dễ đọc (vd. "23 phút", "1 giờ 5 phút")
// — dùng cho cả thông báo lỗi phía API lẫn hiển thị phía giao diện.
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours} giờ ${remMinutes} phút` : `${hours} giờ`;
}
