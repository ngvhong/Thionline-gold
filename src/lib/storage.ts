// src/lib/storage.ts
// Module lưu trữ hình ảnh & tệp tin qua CLOUDINARY (thay thế Supabase Storage & Vercel Blob).
// Giữ nguyên 100% chữ ký hàm put(), del(), storageUrlRegex() để toàn bộ các route
// trong ứng dụng không cần phải sửa đổi bất kỳ dòng code nào.

import { v2 as cloudinary } from 'cloudinary';

// Cấu hình Cloudinary từ biến môi trường
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export interface PutOptions {
  access?: 'public';
  contentType?: string;
  addRandomSuffix?: boolean;
}

export interface PutResult {
  url: string;
  pathname: string;
}

/**
 * Trích xuất public_id và resource_type từ URL Cloudinary.
 * URL dạng: https://res.cloudinary.com/<cloud>/<resource_type>/upload/(v<version>/)?<public_id>.<ext>
 */
export function keyFromUrl(url: string): { publicId: string; resourceType: 'image' | 'raw' | 'video' } | null {
  if (!url || !url.includes('cloudinary.com')) return null;

  const match = url.match(/\/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  if (!match) return null;

  const resourceType = match[1] as 'image' | 'raw' | 'video';
  const publicId = decodeURIComponent(match[2]);
  return { publicId, resourceType };
}

/**
 * Tải file (Buffer, Blob, ArrayBuffer, string) lên Cloudinary
 */
export async function put(
  pathname: string,
  body: Buffer | Blob | ArrayBuffer | string,
  options?: PutOptions
): Promise<PutResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('⚠️ Thiếu cấu hình CLOUDINARY (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) trong biến môi trường.');
  }

  let finalPathname = pathname;
  if (options?.addRandomSuffix) {
    const dot = pathname.lastIndexOf('.');
    const suffix = Math.random().toString(36).slice(2, 10);
    finalPathname = dot > -1
      ? `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`
      : `${pathname}-${suffix}`;
  }

  // Chuyển đổi dữ liệu đầu vào thành Buffer
  let buffer: Buffer;
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    buffer = Buffer.from(await body.arrayBuffer());
  } else if (body instanceof ArrayBuffer) {
    buffer = Buffer.from(body);
  } else if (typeof body === 'string') {
    buffer = Buffer.from(body, 'utf-8');
  } else {
    buffer = body as Buffer;
  }

  // Tách đuôi file và lấy public_id
  const lastDot = finalPathname.lastIndexOf('.');
  const ext = lastDot > -1 ? finalPathname.slice(lastDot + 1).toLowerCase() : '';
  const publicIdWithoutExt = lastDot > -1 ? finalPathname.slice(0, lastDot) : finalPathname;

  const isSvg = ext === 'svg' || options?.contentType?.includes('svg');
  const resourceType: 'image' | 'raw' | 'auto' = isSvg ? 'image' : 'auto';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicIdWithoutExt,
        resource_type: resourceType,
        overwrite: true,
        use_filename: false,
        unique_filename: false,
      },
      (error, result) => {
        if (error || !result) {
          console.error('[Cloudinary] Lỗi upload:', error);
          return reject(new Error(`Lỗi tải file lên Cloudinary: ${error?.message || 'Upload failed'}`));
        }
        resolve({
          url: result.secure_url,
          pathname: result.public_id,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Xóa 1 hoặc danh sách file ảnh khỏi Cloudinary
 */
export async function del(urls: string | string[]): Promise<void> {
  const list = Array.isArray(urls) ? urls : [urls];
  if (list.length === 0) return;

  for (const url of list) {
    const info = keyFromUrl(url);
    if (!info) continue;

    try {
      await cloudinary.uploader.destroy(info.publicId, {
        resource_type: info.resourceType,
        invalidate: true,
      });
    } catch (err: any) {
      console.error(`[Cloudinary] Lỗi xóa file ${info.publicId}:`, err?.message || err);
    }
  }
}

/**
 * Regex nhận diện URL Cloudinary (dùng trong blobCleanup.ts để quét tìm ảnh dọn dẹp)
 */
export function storageUrlRegex(): RegExp {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '[^/]+';
  return new RegExp(`https?:\/\/res\.cloudinary\.com\/${cloudName}\/(?:image|raw|video)\/upload\/\S+`, 'gi');
}
