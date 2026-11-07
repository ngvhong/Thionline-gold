'use client';

import { useState } from 'react';

// Xem 1 ảnh bài tự luận TOÀN MÀN HÌNH cho học sinh: chạm vào ảnh để phóng to /
// thu nhỏ (khi đã phóng to thì kéo để xem), có thể chuyển giữa "Bài đã chấm"
// và "Ảnh gốc" nếu giáo viên đã chấm trên ảnh.
export default function EssayImageLightbox({
  original,
  annotated,
  title,
  onClose,
}: {
  original: string;
  annotated?: string | null;
  title?: string;
  onClose: () => void;
}) {
  const [showOriginal, setShowOriginal] = useState(!annotated);
  const [zoomed, setZoomed] = useState(false);
  const src = showOriginal || !annotated ? original : annotated;

  return (
    <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 text-white">
        <span className="text-sm font-medium truncate flex-1">{title}</span>
        {annotated && (
          <>
            <button
              type="button"
              onClick={() => setShowOriginal(false)}
              className={`text-xs px-2.5 py-1 rounded-lg border ${!showOriginal ? 'bg-white text-gray-900 border-white' : 'border-gray-500'}`}
            >
              Bài đã chấm
            </button>
            <button
              type="button"
              onClick={() => setShowOriginal(true)}
              className={`text-xs px-2.5 py-1 rounded-lg border ${showOriginal ? 'bg-white text-gray-900 border-white' : 'border-gray-500'}`}
            >
              Ảnh gốc
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label="Đóng" className="text-3xl leading-none px-2">
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={title || 'Ảnh bài làm'}
          onClick={() => setZoomed((z) => !z)}
          draggable={false}
          className={zoomed ? 'max-w-none w-[220%] h-auto m-auto cursor-zoom-out' : 'max-w-full max-h-full object-contain m-auto cursor-zoom-in'}
        />
      </div>
      <p className="text-center text-[11px] text-gray-400 py-1.5">Chạm vào ảnh để phóng to / thu nhỏ</p>
    </div>
  );
}
