# HƯỚNG DẪN CẤU HÌNH & CHUYỂN ĐỔI CLOUDINARY (THIONLINE)

Dự án đã được điều chỉnh logic chuyển đổi từ Supabase Storage sang Cloudinary.

## 1. Những thay đổi đã thực hiện:
- **`src/lib/storage.ts`**: Viết lại hoàn chỉnh bằng Cloudinary SDK (`cloudinary`).
  - Hàm `put()` tự động stream buffer lên Cloudinary, trả về URL HTTPS bền vững.
  - Hàm `del()` trích xuất `public_id` và xóa ảnh an toàn trên Cloudinary.
  - Hàm `storageUrlRegex()` nhận diện URL ảnh Cloudinary phục vụ cho việc tự động dọn dẹp ảnh mồ côi (`blobCleanup.ts`).
  - Giữ nguyên 100% chữ ký hàm nên các API như:
    - `src/app/api/upload-exam-image/route.ts`
    - `src/app/api/thi/[examId]/upload-essay-image/route.ts`
    - `src/app/api/submissions/[id]/essay-annotate/route.ts`
    - `src/app/api/upload-tikz-svg/route.ts`
    đều hoạt động trơn tru mà không cần chỉnh sửa bất kỳ dòng nào.
- **Gỡ bỏ Supabase**:
  - Đã xóa `src/lib/supabaseAdmin.ts`.
  - Đã gỡ `@supabase/supabase-js` và thêm thư viện `cloudinary: ^2.5.1` vào `package.json`.
- **Cơ sở dữ liệu MongoDB**:
  - MongoDB vẫn được giữ nguyên làm Database chính lưu trữ các bảng: Đề thi, Lớp học, Học sinh, Bài nộp (Submission), Điểm số,...
  - Biến `MONGODB_URI` trong file `.env.local` tiếp tục kết nối đến cụm MongoDB Atlas của bạn.

## 2. Cách chạy ứng dụng trên máy của bạn:
1. Cài đặt các gói phụ thuộc (bao gồm Cloudinary mới):
   ```bash
   npm install
   ```
2. Khởi chạy môi trường phát triển:
   ```bash
   npm run dev
   ```
3. Truy cập `http://localhost:3000` để bắt đầu sử dụng. Mọi hình ảnh xuất bản đề, ảnh bài làm tự luận sẽ tự động tải thẳng lên Cloudinary của bạn.
