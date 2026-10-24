// THÊM MỚI (Giai đoạn 3/4 — Kho đề chung + Ôn luyện): icon SVG nét mảnh
// dùng chung cho mọi nơi liên quan tới "kho đề chung" (trang admin, popup
// chia sẻ của GV, trang /kho-de-chung, tab "Ôn luyện" của học sinh) — thay
// cho emoji (📚 📁 📥) để đồng bộ với style icon nét mảnh
// (viewBox 24x24, stroke="currentColor", strokeWidth 1.6) đã dùng xuyên
// suốt cả `src/app/page.tsx` lẫn `src/app/ExamBuilder.tsx`, tránh emoji
// hiển thị lệch/thành ô vuông rỗng trên 1 số máy/trình duyệt (đúng lý do
// đã ghi lại ở comment của OpenBookIcon trong ExamBuilder.tsx).
//
// Đặt trong `src/components/` (không phải trong `src/app/page.tsx` hay
// `src/app/ExamBuilder.tsx`) vì đây là file TRUNG LẬP — giống
// `AppBranding.tsx` đã có sẵn, cả code GV lẫn code học sinh
// (`src/app/student/*`) đều import được, không vi phạm quy tắc "học sinh
// không import code GV" (xem 00-THINKING.md mục 2.5) vì file này không
// thuộc "code GV".

export function LibraryBookIcon({ className }: { className?: string }) {
  // Y HỆT path của OpenBookIcon trong ExamBuilder.tsx (chỉ đổi tên) — giữ
  // đúng 1 hình quyển sách mở duy nhất cho toàn hệ thống, tránh 2 icon
  // "sách" hơi khác nhau ở 2 chỗ.
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 6.5c-1.6-1.2-3.6-1.7-5.7-1.7-.7 0-1.3.6-1.3 1.3v10.6c0 .7.6 1.2 1.3 1.2 2.1 0 4.1.5 5.7 1.7 1.6-1.2 3.6-1.7 5.7-1.7.7 0 1.3-.5 1.3-1.2V6.1c0-.7-.6-1.3-1.3-1.3-2.1 0-4.1.5-5.7 1.7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 6.5v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function LibraryFolderIcon({ className }: { className?: string }) {
  // Y HỆT path của FolderIcon trong page.tsx (chỉ đổi tên) — cùng 1 hình
  // thư mục cho mọi nơi hiện cây kho đề chung.
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M2.5 8.2V6a1.5 1.5 0 011.5-1.5h4.7a1.5 1.5 0 011.06.44l1.3 1.3a1.5 1.5 0 001.06.44H20a1.5 1.5 0 011.5 1.5v1.06"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.6 9.6a1.5 1.5 0 011.47-1.2h15.86a1.5 1.5 0 011.47 1.8l-1.24 6.3a2 2 0 01-1.96 1.6H5.8a2 2 0 01-1.96-1.6l-1.24-6.3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LibraryDownloadIcon({ className }: { className?: string }) {
  // Mũi tên rơi xuống khay — "lấy đề này về" (tải 1 bản sao về danh sách
  // đề của mình), cùng nét mảnh 1.6 như mọi icon khác trong dự án.
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 4v10.5m0 0-3.3-3.3M12 14.5l3.3-3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15v3A1.5 1.5 0 006 19.5h12a1.5 1.5 0 001.5-1.5v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
