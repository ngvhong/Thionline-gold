'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { GUIDE_VIDEOS, type GuideVideoRole } from '@/data/guideVideos';

// Icon video nét mảnh (stroke 1.6, cùng phong cách các icon SVG khác của app).
export function VideoLineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2.5" y="6" width="13.5" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16 10.5 21 7.5v9l-5-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 10.2v3.6l3-1.8-3-1.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

// Nút "Video hướng dẫn".
//  - role='teacher' | 'student': bấm là MỞ THẲNG video của vai trò đó ở tab mới
//    (không popup). Nếu link chưa được điền trong src/data/guideVideos.ts thì
//    bấm sẽ hiện popup báo "Video sẽ được cập nhật sớm".
//  - role='both' (màn "Bạn là ai?", chưa biết vai trò): bấm hiện popup để chọn 1 trong 2 video.
//  - variant: 'pill' (có chữ — màn đăng nhập/đăng ký) | 'icon' (chỉ icon tròn — chỗ hẹp).
// Link video nằm ở src/data/guideVideos.ts.
export default function GuideVideoButton({
  role = 'both',
  variant = 'pill',
  className = '',
}: {
  role?: GuideVideoRole | 'both';
  variant?: 'pill' | 'icon';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const videos = role === 'both' ? [GUIDE_VIDEOS.teacher, GUIDE_VIDEOS.student] : [GUIDE_VIDEOS[role]];
  const directUrl = role !== 'both' ? GUIDE_VIDEOS[role].url : '';

  const triggerClass =
    variant === 'icon'
      ? `w-8 h-8 rounded-full border border-blue-400/70 text-blue-600 bg-white hover:bg-blue-50 flex items-center justify-center shrink-0 transition-colors ${className}`
      : `inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 border border-blue-300 hover:bg-blue-50 rounded-full pl-2.5 pr-3.5 py-1.5 transition-colors ${className}`;
  const triggerContent =
    variant === 'icon' ? (
      <VideoLineIcon className="w-5 h-5" />
    ) : (
      <>
        <VideoLineIcon className="w-5 h-5" />
        Video hướng dẫn
      </>
    );

  if (directUrl) {
    return (
      <a
        href={directUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Xem video hướng dẫn"
        aria-label="Video hướng dẫn"
        className={triggerClass}
      >
        {triggerContent}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Video hướng dẫn"
        aria-label="Video hướng dẫn"
        className={triggerClass}
      >
        {triggerContent}
      </button>
      {open && mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Video hướng dẫn"
          >
            <div
              className="w-full max-w-sm bg-white rounded-xl shadow-lg p-5 text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="flex items-center gap-2 font-semibold text-gray-800">
                  <VideoLineIcon className="w-6 h-6 text-blue-600" />
                  Video hướng dẫn
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Đóng"
                  className="text-gray-400 hover:text-gray-700 text-lg leading-none w-7 h-7 rounded-md hover:bg-gray-100"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2.5">
                {videos.map((v) =>
                  v.url ? (
                    <a
                      key={v.role}
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 border border-gray-200 rounded-lg px-3.5 py-3 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <VideoLineIcon className="w-7 h-7 shrink-0 text-blue-600" />
                      <span>
                        <span className="block font-semibold text-gray-800 text-sm">{v.title}</span>
                        <span className="block text-xs text-gray-400">{v.description}</span>
                      </span>
                    </a>
                  ) : (
                    <div
                      key={v.role}
                      className="flex items-center gap-3 border border-dashed border-gray-200 rounded-lg px-3.5 py-3"
                    >
                      <VideoLineIcon className="w-7 h-7 shrink-0 text-gray-300" />
                      <span>
                        <span className="block font-semibold text-gray-500 text-sm">{v.title}</span>
                        <span className="block text-xs text-gray-400">Video sẽ được cập nhật sớm</span>
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
