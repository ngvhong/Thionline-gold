import { del, storageUrlRegex } from '@/lib/storage';

// GHI CHÚ CHUNG (sửa lỗi "xóa đề/lớp/học sinh xong mà ảnh vẫn còn lưu trên
// Vercel Blob"): trước bản sửa này, các route DELETE (exams/[id],
// classes/[id], students/[id]) chỉ xóa bản ghi trong MongoDB — không hề
// đụng tới file ảnh đã lưu trên Vercel Blob (essayImages/essayAnnotatedImages
// của Submission, hoặc ảnh minh họa \includegraphics của Exam). Vì
// SubmissionModel.deleteMany()/Exam.findByIdAndDelete() không cascade sang
// Blob (khác domain lưu trữ, MongoDB không biết gì về Blob), ảnh trở thành
// "mồ côi" — không ai còn trỏ tới nhưng vẫn tính phí lưu trữ mãi mãi.
//
// Nguyên tắc chung của mọi hàm dưới đây: PHẢI gọi TRƯỚC khi xóa record khỏi
// MongoDB (ngay khi vẫn còn đọc được essayImages/raw_data), vì một khi
// record biến mất thì không còn cách nào tra lại URL ảnh nào cần xóa nữa
// (trừ quét toàn bộ Blob rồi đối chiếu — tốn kém và không phải việc nên làm
// thường xuyên).
//
// Lỗi/thiếu quyền khi gọi del() KHÔNG được làm hỏng luồng xóa chính — nếu 1
// vài ảnh xóa lỗi (mạng, ảnh đã bị xóa tay từ trước...), vẫn phải cho phép
// xóa record MongoDB tiếp tục bình thường. Vì vậy mọi hàm ở đây tự bắt lỗi
// nội bộ, không throw ra ngoài.

// Gom mọi string trong essayImages/essayAnnotatedImages (dạng Record<string,
// string[]>) thành 1 mảng URL phẳng. Bỏ qua nếu field không tồn tại/không
// đúng định dạng (submission cũ có thể chưa từng có ảnh).
function collectEssayUrls(obj: unknown): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const urls: string[] = [];
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item) urls.push(item);
      }
    }
  }
  return urls;
}

// Xóa toàn bộ ảnh Blob (gốc + đã chấm/annotate) của 1 danh sách Submission.
// Nhận thẳng mảng document (đã .lean()) thay vì chỉ id, vì cần đọc
// essayImages/essayAnnotatedImages TRƯỚC khi submission đó bị xóa khỏi
// MongoDB — gọi hàm này ngay trước dòng SubmissionModel.deleteMany(...).
export async function deleteSubmissionBlobs(
  submissions: Array<{ essayImages?: unknown; essayAnnotatedImages?: unknown }>
): Promise<void> {
  const urls = new Set<string>();
  for (const s of submissions) {
    for (const u of collectEssayUrls(s.essayImages)) urls.add(u);
    for (const u of collectEssayUrls(s.essayAnnotatedImages)) urls.add(u);
  }
  if (urls.size === 0) return;

  try {
    await del(Array.from(urls));
  } catch (err) {
    // Không throw — 1 vài ảnh lỗi (đã xóa tay, hết hạn URL...) không được
    // phép chặn việc xóa record chính (đề/lớp/học sinh). Chỉ log lại để
    // GV/admin biết nếu cần kiểm tra Blob dư thừa sau này.
    console.error('Lỗi xóa ảnh tự luận trên storage (bỏ qua, tiếp tục xóa dữ liệu chính):', err);
  }
}

// Storage (S3-compatible, thay Vercel Blob từ 8/2026) luôn trả URL dạng
// `${S3_PUBLIC_URL}/<pathname>` — quét RECURSIVE toàn bộ raw_data (object
// lồng nhau tùy ý, không cố định field) tìm mọi string khớp mẫu này. Cách
// này không cần biết trước raw_data lưu URL ảnh minh họa ở field nào
// (imageMap hiện được nhúng lồng trong cấu trúc câu hỏi, có thể đổi field
// theo thời gian) — quét theo NỘI DUNG (URL trông như thế nào) thay vì
// theo VỊ TRÍ (field tên gì), nên vẫn đúng dù cấu trúc raw_data thay đổi
// sau này.
// GHI CHÚ DI TRÚ: regex lấy trực tiếp từ storageUrlRegex() (dựa vào biến
// môi trường S3_PUBLIC_URL đang cấu hình) — CHỈ bắt được ảnh mới trên
// storage hiện tại. Ảnh CŨ còn URL dạng
// https://*.public.blob.vercel-storage.com/... (upload từ trước khi
// chuyển sang S3) sẽ KHÔNG bị regex này bắt và KHÔNG được dọn tự động nữa
// — nếu cần dọn nốt số ảnh cũ đó, chạy 1 script/hàm riêng bắt thêm pattern
// cũ (giữ tách biệt để không phải sửa lại chỗ này mỗi khi đổi nhà cung cấp
// storage).
function collectBlobUrlsRecursive(node: unknown, out: Set<string>): void {
  const BLOB_URL_RE = storageUrlRegex();
  if (typeof node === 'string') {
    const matches = node.match(BLOB_URL_RE);
    if (matches) {
      for (const m of matches) {
        // Bỏ dấu câu/ký tự thừa có thể dính vào cuối do bị nhúng trong văn
        // bản khác (ví dụ trong markdown) — URL Blob thật không chứa dấu
        // nháy/ngoặc/khoảng trắng.
        out.add(m.replace(/["'),.;\s]+$/, ''));
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectBlobUrlsRecursive(item, out);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectBlobUrlsRecursive(value, out);
    }
  }
}

// Xóa toàn bộ ảnh minh họa (\includegraphics, upload lúc "Xuất bản") của 1
// đề thi — gọi TRƯỚC khi Exam.findByIdAndDelete(id), truyền vào raw_data
// của chính đề đó (đọc được từ exam.raw_data ngay trước khi xóa).
export async function deleteExamImageBlobs(rawData: unknown): Promise<void> {
  const urls = new Set<string>();
  collectBlobUrlsRecursive(rawData, urls);
  if (urls.size === 0) return;

  try {
    await del(Array.from(urls));
  } catch (err) {
    console.error('Lỗi xóa ảnh minh họa đề thi trên storage (bỏ qua, tiếp tục xóa đề):', err);
  }
}
