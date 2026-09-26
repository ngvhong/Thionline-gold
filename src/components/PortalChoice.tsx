'use client';

import { AppLogoIcon, APP_NAME } from '@/components/AppBranding';
import { setPortalChoice, type PortalChoiceValue } from '@/lib/portalChoice';

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
            <span className="text-2xl" aria-hidden>
              👩‍🏫
            </span>
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
            <span className="text-2xl" aria-hidden>
              🧑‍🎓
            </span>
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
