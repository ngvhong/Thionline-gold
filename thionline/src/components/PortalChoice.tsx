'use client';

import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';
import { setPortalChoice, type PortalChoiceValue } from '@/lib/portalChoice';


// SỬA (khiếu nại: "xoá icon emoji, thay bằng icon svg nét mảnh cho đồng bộ"):
// 2 icon nét mảnh (stroke 1.6, cùng phong cách LayersIcon/FolderIcon ở
// trang chủ giáo viên) thay cho emoji 👩‍🏫 / 🧑‍🎓.
function TeacherLineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="4" width="18" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 9.5h6M7 12h3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 15v3.5M8.5 20.5 12 18.5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StudentLineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 4 2.5 9 12 14 21.5 9 12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6.5 11.5v4.2c0 .9 2.5 2.8 5.5 2.8s5.5-1.9 5.5-2.8v-4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5 9v5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// THÊM MỚI (Giai đoạn 0 — bảng chọn vai trò): hiện đúng 1 lần cho người
// dùng chưa từng chọn (chưa có cookie last_portal_choice) và chưa đăng nhập
// ở cả 2 phía. Component này KHÔNG tự điều hướng/redirect — chỉ ghi cookie
// rồi gọi onChoose, nơi gọi nó (trang /login, trang /student) tự quyết định
// hiện gì tiếp theo. Nhờ vậy component này dùng lại được ở cả 2 nơi mà
// không phải sửa logic điều hướng bên trong nó.
export default function PortalChoice({
  onChoose,
}: {
  onChoose: (choice: PortalChoiceValue) => void;
}) {
  function handlePick(choice: PortalChoiceValue) {
    setPortalChoice(choice);
    onChoose(choice);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-7">
        <p className="flex items-center justify-center gap-2.5 font-bold text-blue-600 text-2xl tracking-tight text-center mb-1">
          <AppLogoIcon className="w-10 h-10 shrink-0" />
          {APP_NAME}
        </p>
        <p className="text-sm text-gray-400 text-center mb-6">Bạn là ai?</p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handlePick('teacher')}
            className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3.5 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <TeacherLineIcon className="w-8 h-8 shrink-0 text-blue-600" />
            <span>
              <span className="block font-semibold text-gray-800 text-sm">Tôi là giáo viên</span>
              <span className="block text-xs text-gray-400">Tạo đề, giao bài, quản lý lớp</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => handlePick('student')}
            className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-4 py-3.5 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <StudentLineIcon className="w-8 h-8 shrink-0 text-blue-600" />
            <span>
              <span className="block font-semibold text-gray-800 text-sm">Tôi là học sinh</span>
              <span className="block text-xs text-gray-400">Làm bài được giao, ôn luyện</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
