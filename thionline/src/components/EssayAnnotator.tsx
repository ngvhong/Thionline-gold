'use client';

import { useEffect, useRef, useState } from 'react';

// Công cụ vẽ/khoanh bút đỏ trực tiếp lên ảnh bài làm tự luận của học sinh —
// GV dùng để "chấm trên ảnh" (khoanh chỗ sai, gạch chân, viết chữ tay bằng
// chuột/ngón tay...) trước khi lưu lại. Chỉ có bút ĐỎ (đúng màu bút chấm bài
// truyền thống) + 2 cỡ nét, không làm phức tạp thêm (không cần chọn màu,
// không cần chữ gõ máy — GV vẽ tay là đủ, giống chấm bài giấy thật).
//
// Cách hoạt động: load ảnh gốc vào canvas làm NỀN, GV vẽ đè lên chính canvas
// đó (không phải 1 lớp riêng) — Lưu = xuất toàn bộ canvas (ảnh + nét vẽ) ra
// 1 ảnh JPEG mới, KHÔNG sửa ảnh gốc trên Blob (xem essay-annotate/route.ts).
export default function EssayAnnotator({
  imageUrl,
  onSave,
  onClose,
}: {
  imageUrl: string;
  onSave: (dataUrl: string) => Promise<void>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  // Lịch sử để "Hoàn tác" — lưu snapshot canvas TRƯỚC mỗi nét vẽ (đủ dùng,
  // không cần undo vô hạn/redo cho tác vụ chấm bài đơn giản này).
  const historyRef = useRef<ImageData[]>([]);
  const [brushSize, setBrushSize] = useState<'thin' | 'thick'>('thin');
  const [imgLoaded, setImgLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous'; // ảnh trên Vercel Blob cho phép CORS công khai
    img.onload = () => {
      // Giới hạn chiều rộng canvas để vẽ mượt trên điện thoại/máy yếu, vẫn
      // giữ đúng tỉ lệ ảnh gốc.
      const MAX_W = 900;
      const scale = img.naturalWidth > MAX_W ? MAX_W / img.naturalWidth : 1;
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setImgLoaded(true);
    };
    img.onerror = () => setLoadError(true);
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function pushHistory() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    // Giới hạn 20 bước gần nhất, tránh phình bộ nhớ nếu GV vẽ quá nhiều nét.
    if (historyRef.current.length > 20) historyRef.current.shift();
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!imgLoaded) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    pushHistory();
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPointRef.current) return;
    const point = getPoint(e);
    ctx.strokeStyle = '#e11d1d';
    ctx.lineWidth = brushSize === 'thin' ? 3 : 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  }

  function handlePointerUp() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function handleUndo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const last = historyRef.current.pop();
    if (!canvas || !ctx || !last) return;
    ctx.putImageData(last, 0, 0);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaveError('');
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      await onSave(dataUrl);
    } catch (err: any) {
      setSaveError(err.message || 'Không lưu được ảnh đã chấm.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-900">Chấm trên ảnh (bút đỏ)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">
            ×
          </button>
        </div>

        {loadError && <p className="text-sm text-red-600 mb-3">Không tải được ảnh, thử lại sau.</p>}
        {!imgLoaded && !loadError && <p className="text-sm text-gray-400 mb-3">Đang tải ảnh...</p>}

        <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 touch-none">
          <canvas
            ref={canvasRef}
            className="w-full h-auto touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-gray-500 mr-1">Cỡ bút:</span>
          <button
            onClick={() => setBrushSize('thin')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              brushSize === 'thin' ? 'bg-red-50 border-red-300 text-red-600' : 'border-gray-300 text-gray-600'
            }`}
          >
            Mảnh
          </button>
          <button
            onClick={() => setBrushSize('thick')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              brushSize === 'thick' ? 'bg-red-50 border-red-300 text-red-600' : 'border-gray-300 text-gray-600'
            }`}
          >
            Đậm
          </button>
          <button
            onClick={handleUndo}
            disabled={historyRef.current.length === 0}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 disabled:opacity-40 ml-auto"
          >
            ↩ Hoàn tác
          </button>
          <button
            onClick={handleSave}
            disabled={!imgLoaded || saving}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
        {saveError && <p className="text-xs text-red-600 mt-2">{saveError}</p>}
      </div>
    </div>
  );
}
