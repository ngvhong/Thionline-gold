'use client';

import { useEffect, useRef, useState } from 'react';

// Công cụ chấm bài tự luận TRỰC TIẾP TRÊN ẢNH (toàn màn hình): bút đỏ, khoanh
// elip/tròn, ghi chữ (gõ chữ, hoặc bấm nút nhanh ✓ ✗ −0,25 ...), phóng to/di
// chuyển, hoàn tác. Mọi nét được lưu thành danh sách thao tác (ops) rồi vẽ lại
// từ ảnh gốc → hoàn tác chính xác từng nét, không làm hỏng ảnh nền.
// Lưu = xuất canvas (ảnh + nét chấm) ra 1 ảnh JPEG mới qua onSave, KHÔNG sửa
// ảnh gốc (xem essay-annotate/route.ts). Độ phân giải giữ như cũ (rộng tối đa
// 900px) để nhẹ máy; nếu ảnh không tải trực tiếp được (CORS) sẽ tự thử tải qua
// route trung gian cùng domain.
type Tool = 'pen' | 'ellipse' | 'text' | 'move';
type Pt = { x: number; y: number };
type Op =
  | { t: 'pen'; pts: Pt[]; w: number }
  | { t: 'ellipse'; a: Pt; b: Pt; w: number }
  | { t: 'text'; p: Pt; text: string; size: number };

const RED = '#e11d1d';
const PRESETS = ['✓', '✗', '−0,25', '−0,5', 'Sai bước này', 'Thiếu', 'Đúng'];
const ZOOMS = [1, 1.5, 2, 3];

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
  const imgRef = useRef<HTMLImageElement | null>(null);
  const opsRef = useRef<Op[]>([]);
  const draftRef = useRef<Op | null>(null);
  const drawingRef = useRef(false);
  const triedProxyRef = useRef(false);

  const [tool, setTool] = useState<Tool>('pen');
  const [thick, setThick] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [textValue, setTextValue] = useState('✗');
  const [opsCount, setOpsCount] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function lineWidth() {
    return thick ? 7 : 3;
  }
  function textSize() {
    const w = canvasRef.current?.width || 900;
    return Math.round(w / (thick ? 18 : 28));
  }

  function drawOp(ctx: CanvasRenderingContext2D, op: Op) {
    ctx.strokeStyle = RED;
    ctx.fillStyle = RED;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (op.t === 'pen') {
      ctx.lineWidth = op.w;
      ctx.beginPath();
      op.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (op.pts.length === 1) ctx.lineTo(op.pts[0].x + 0.1, op.pts[0].y + 0.1);
      ctx.stroke();
    } else if (op.t === 'ellipse') {
      ctx.lineWidth = op.w;
      const cx = (op.a.x + op.b.x) / 2;
      const cy = (op.a.y + op.b.y) / 2;
      const rx = Math.abs(op.b.x - op.a.x) / 2;
      const ry = Math.abs(op.b.y - op.a.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.font = `bold ${op.size}px sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, op.size / 6);
      ctx.strokeStyle = '#ffffff'; // viền trắng để chữ đỏ đọc rõ trên mọi nền
      ctx.strokeText(op.text, op.p.x, op.p.y);
      ctx.fillStyle = RED;
      ctx.fillText(op.text, op.p.x, op.p.y);
    }
  }

  function render() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imgRef.current;
    if (!canvas || !ctx || !img) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const op of opsRef.current) drawOp(ctx, op);
    if (draftRef.current) drawOp(ctx, draftRef.current);
  }

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const MAX_W = 900;
      const scale = img.naturalWidth > MAX_W ? MAX_W / img.naturalWidth : 1;
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      imgRef.current = img;
      render();
      setImgLoaded(true);
    };
    img.onerror = () => {
      // Thử 1 lần qua route trung gian cùng domain (tránh lỗi CORS của kho ảnh).
      if (!triedProxyRef.current) {
        triedProxyRef.current = true;
        img.src = `/api/essay-image-proxy?url=${encodeURIComponent(imageUrl)}`;
      } else {
        setLoadError(true);
      }
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>): Pt {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!imgLoaded || tool === 'move') return;
    const p = getPoint(e);
    if (tool === 'text') {
      const text = textValue.trim();
      if (!text) return;
      opsRef.current.push({ t: 'text', p, text, size: textSize() });
      setOpsCount(opsRef.current.length);
      render();
      return;
    }
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    draftRef.current =
      tool === 'pen' ? { t: 'pen', pts: [p], w: lineWidth() } : { t: 'ellipse', a: p, b: p, w: lineWidth() };
    render();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !draftRef.current) return;
    const p = getPoint(e);
    const d = draftRef.current;
    if (d.t === 'pen') d.pts.push(p);
    else if (d.t === 'ellipse') d.b = p;
    render();
  }

  function finishStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const d = draftRef.current;
    draftRef.current = null;
    if (d) {
      const tiny = d.t === 'ellipse' && Math.abs(d.b.x - d.a.x) < 6 && Math.abs(d.b.y - d.a.y) < 6;
      if (!tiny) opsRef.current.push(d);
    }
    setOpsCount(opsRef.current.length);
    render();
  }

  function handleUndo() {
    opsRef.current.pop();
    setOpsCount(opsRef.current.length);
    render();
  }

  function handleClear() {
    if (opsRef.current.length === 0) return;
    if (!window.confirm('Xóa hết các nét đã chấm trên ảnh này?')) return;
    opsRef.current = [];
    setOpsCount(0);
    render();
  }

  function handleClose() {
    if (opsRef.current.length > 0 && !window.confirm('Có nét chấm chưa lưu. Đóng và bỏ các nét này?')) return;
    onClose();
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaveError('');
    try {
      render();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      await onSave(dataUrl);
    } catch (err: any) {
      setSaveError(err?.message || 'Không lưu được ảnh đã chấm.');
    } finally {
      setSaving(false);
    }
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      render();
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/jpeg', 0.9);
      a.download = 'bai-da-cham.jpg';
      a.click();
    } catch (err: any) {
      setSaveError(err?.message || 'Không tải ảnh về được.');
    }
  }

  const toolBtn = (key: Tool, label: string) => (
    <button
      type="button"
      onClick={() => setTool(key)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
        tool === key ? 'bg-red-50 border-red-300 text-red-600' : 'border-gray-300 text-gray-600 bg-white'
      }`}
    >
      {label}
    </button>
  );
  const plain = 'px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 bg-white disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200">
        <h3 className="text-base font-bold text-gray-900">Chấm trên ảnh</h3>
        <button type="button" onClick={handleClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none px-2" aria-label="Đóng">
          ×
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-gray-100 p-2">
        {loadError && <p className="text-sm text-red-600 mb-2">Không tải được ảnh, thử lại sau.</p>}
        {!imgLoaded && !loadError && <p className="text-sm text-gray-400 mb-2">Đang tải ảnh...</p>}
        <canvas
          ref={canvasRef}
          style={{
            width: `${ZOOMS[zoomIdx] * 100}%`,
            height: 'auto',
            touchAction: tool === 'move' ? 'pan-x pan-y pinch-zoom' : 'none',
            cursor: tool === 'move' ? 'grab' : tool === 'text' ? 'text' : 'crosshair',
          }}
          className="block mx-auto bg-white select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
      </div>

      <div className="border-t border-gray-200 px-3 py-2.5 space-y-2 bg-white">
        <div className="flex flex-wrap items-center gap-2">
          {toolBtn('pen', '✏️ Bút')}
          {toolBtn('ellipse', '⭕ Khoanh tròn/elip')}
          {toolBtn('text', '🔤 Chữ')}
          {toolBtn('move', '✋ Di chuyển')}
          <span className="w-px h-6 bg-gray-200 mx-1" />
          <button type="button" onClick={() => setThick(false)} className={`${plain} ${!thick ? '!bg-red-50 !border-red-300 !text-red-600' : ''}`}>
            Mảnh
          </button>
          <button type="button" onClick={() => setThick(true)} className={`${plain} ${thick ? '!bg-red-50 !border-red-300 !text-red-600' : ''}`}>
            Đậm
          </button>
          <span className="w-px h-6 bg-gray-200 mx-1" />
          <button type="button" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0} className={plain}>
            −
          </button>
          <span className="text-xs text-gray-500 w-10 text-center">{Math.round(ZOOMS[zoomIdx] * 100)}%</span>
          <button type="button" onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIdx === ZOOMS.length - 1} className={plain}>
            +
          </button>
          <span className="w-px h-6 bg-gray-200 mx-1" />
          <button type="button" onClick={handleUndo} disabled={opsCount === 0} className={plain}>
            ↩ Hoàn tác
          </button>
          <button type="button" onClick={handleClear} disabled={opsCount === 0} className={plain}>
            Xóa hết
          </button>
        </div>

        {tool === 'text' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder="Gõ ghi chú rồi chạm vào ảnh để đặt"
              className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            {PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setTextValue(s)}
                className={`${plain} ${textValue === s ? '!bg-red-50 !border-red-300 !text-red-600' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {saveError && <p className="text-xs text-red-600 mr-auto">{saveError}</p>}
          <button type="button" onClick={handleDownload} disabled={!imgLoaded} className={plain}>
            Tải ảnh về máy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!imgLoaded || saving}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Đang lưu...' : 'Lưu bài chấm'}
          </button>
        </div>
      </div>
    </div>
  );
}
