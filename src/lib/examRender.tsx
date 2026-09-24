'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import Latex from 'react-latex-next';
import { TIKZ_DISPLAY_BASE_SCALE } from './tikzScaleConstants';
import {
  sanitizeMathMacros,
  collapseBlankAroundImagePlaceholders,
  capLeadingIndent,
  extractEnvBlocks,
  parseLatexStatTable,
} from './textUtils';

// =====================================================================
// TÁCH TỪ ExamBuilder.tsx — các hàm/thành phần hiển thị THUẦN (không phụ
// thuộc state riêng của màn hình soạn đề), dùng lại cho trang /thi/[examId]
// (học sinh làm bài thật). KHÔNG đụng vào ExamBuilder.tsx để tránh phá vỡ
// luồng soạn đề đang chạy ổn định — coi đây là bản sao "chỉ đọc" của phần
// hiển thị, không có nút "Sửa hình", không gọi API biên dịch TikZ (vì SVG
// đã được nhúng sẵn vào tikz_list lúc GV bấm "Xuất bản", xem publishExam
// trong ExamBuilder.tsx).
// =====================================================================

// =====================================================================
// PHÁT HIỆN "KHOẢNG TRỐNG LỚN" trên/dưới hình TikZ (thêm 21-7, theo phản
// ánh: "khoảng trống trên dưới hình đôi khi gấp 9-10 lần nội dung câu
// hỏi, nhìn cực dị").
//
// Bối cảnh: getBBox() ở effect bên dưới đo bbox theo ĐÚNG chuẩn SVG —
// tức TÍNH CẢ những phần tử không nhìn thấy (opacity/visibility ẩn) miễn
// là không display:none, và bbox không loại trừ phần tử tô/viền "none"
// (không có nét vẽ thật). dvisvgm/pdf2svg đôi khi để lại các điểm/nét
// dựng hình ẩn (TikZ dùng để tính toán vị trí, căn chỉnh...) nằm RẤT XA
// phần đồ thị/hình thấy được — hệ quả: bbox tổng bị "thổi phồng", thường
// lệch theo chiều CAO (trên/dưới) nhiều hơn hẳn chiều rộng.
//
// getVisibleContentBBox() đo lại bbox CHỈ dựa trên phần tử thực sự có
// nét vẽ/tô nhìn thấy được (bỏ qua phần tử ẩn do opacity~0/display:none/
// visibility:hidden ở chính nó hoặc bất kỳ tổ tiên nào, và bỏ qua phần tử
// không tô không viền). Kết quả này KHÔNG thay thế bbox tổng — chỉ dùng
// để SO SÁNH: nếu khoảng trống trên+dưới đã lớn hơn hẳn (>1.5 lần) chiều
// cao nội dung thật, mới cắt thêm theo bbox "thấy được" này (kèm 1 chút
// đệm dưới, không cắt sát tuyệt đối). Nếu khoảng trống bình thường/nhỏ
// (ví dụ do mũi tên/nét đậm nhô ra ngoài bbox 1 chút) thì GIỮ NGUYÊN cách
// đo cũ (bbox tổng) — tránh cắt lẹm oan các hình đang hiển thị ổn.
//
// CHỈ áp dụng cho trên/dưới theo đúng phản ánh — không đụng trái/phải.
function isEffectivelyHidden(el: Element, root: Element): boolean {
  let node: Element | null = el;
  while (node && node !== root) {
    let style: CSSStyleDeclaration;
    try {
      style = window.getComputedStyle(node);
    } catch {
      return false;
    }
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    const opAttr = node.getAttribute('opacity');
    const op = parseFloat(opAttr ?? style.opacity ?? '1');
    if (!Number.isNaN(op) && op <= 0.02) return true;
    node = node.parentElement;
  }
  return false;
}

// SỬA LỖI (khiếu nại: "câu Đúng/Sai có hình luôn bị khoảng trắng cực lớn,
// >1000px, so với văn bản"): NGUYÊN NHÂN THẬT SỰ không phải do \immini/text
// mà do chính cách trình duyệt đo hình học SVG. `getBBox()` của trình duyệt
// LUÔN trả về bbox HÌNH HỌC THẬT của path, HOÀN TOÀN BỎ QUA clip-path — dù
// phần tử bị clip che khuất không hề nhìn thấy được. Mã TikZ vẽ đồ thị hàm
// phân thức có tiệm cận đứng (vd y = x - 6/(x+1) tại x=-1) thường dùng
// "\clip(...) rectangle (...)" để chỉ hiện phần đồ thị trong khung nhìn —
// nhưng các mẫu vẽ ("\draw[domain=...] plot") lấy domain rất sát tiệm cận
// (vd x=-0.9, chỉ cách x=-1 đúng 0.1 đơn vị) khiến giá trị hàm số tại đó
// "vọt" ra xa hàng chục/hàng trăm đơn vị — TikZ/pdf2svg vẫn vẽ path đó đầy
// đủ (dài ngoằng ra ngoài khung), CHỈ ẩn phần thừa bằng clip-path khi hiển
// thị. getBBox() trên path đó trả về kích thước ĐẦY ĐỦ (bao gồm cả đoạn ẩn
// đi rất xa), khiến getVisibleContentBBox() coi hình là "cao/rộng" hơn thực
// tế rất nhiều, không cắt bớt được khoảng trắng quanh nét vẽ THẬT SỰ nhìn
// thấy — đúng hiện tượng khoảng trắng phồng lên hàng nghìn px.
// SỬA: dò TỪNG tổ tiên của phần tử xem có clip-path không (TikZ "\clip(...)
// rectangle (...)" luôn biên dịch ra <clipPath><rect/></clipPath> + thuộc
// tính clip-path="url(#...)" trên 1 <g> tổ tiên) — nếu có, LẤY GIAO
// (intersect) giữa bbox phần tử với bbox vùng clip đó trước khi cộng vào
// tổng, thay vì dùng nguyên bbox đầy đủ. Nếu phần tử nằm HOÀN TOÀN ngoài
// vùng clip (giao rỗng) thì bỏ qua hẳn — đúng là không nhìn thấy được.
// SỬA TIẾP (22-7, theo phản ánh "khoảng trống vẫn còn, giảm còn 4-5px
// được không"): sau khi vá \clip ở trên, khoảng trống dư ra không phải do
// trục Oy "tự nhiên cao" mà do MỘT LỖI KHÁC — getBBox() của mỗi phần tử
// trả về tọa độ trong HỆ TỌA ĐỘ CỤC BỘ của chính phần tử đó (sau transform
// của bản thân nó và tổ tiên), KHÔNG PHẢI hệ tọa độ chung của toàn SVG.
// dvisvgm đặt CHỮ (nhãn trục, số, glyph...) vào một <g transform="matrix(
// ...)"> RIÊNG để lật trục cho đúng chiều đọc, trong khi NÉT VẼ (<path> của
// trục tọa độ, đồ thị hàm số) lại KHÔNG nằm trong group đó — bbox cục bộ
// của 2 loại phần tử này lệch nhau hàng trăm đơn vị. Cộng gộp thẳng min/
// max của chúng (như code cũ) cho ra bbox tổng bị méo (vd cao 262 trong
// khi hình thật chỉ cao ~135, tức dư ~1.9 lần — do trộn nhầm 2 hệ tọa độ,
// không phải khoảng trống thật).
// SỬA: quy MỌI bbox cục bộ về CHUNG một hệ tọa độ duy nhất (hệ tọa độ gốc
// của <svg>) bằng getCTM() — ma trận biến đổi TÍCH LŨY từ toàn bộ tổ tiên
// — trước khi so sánh/gộp, thay vì dùng thẳng tọa độ cục bộ như trước.
// rootScale dùng để chuẩn hoá lại đơn vị: trình duyệt thường lồng thêm hệ
// số quy đổi pt->px (~1.333) vào getCTM() ngay ở phần tử gốc <svg>, trong
// khi bbox tổng thể (biến `bbox` ở TikzImage, lấy từ svgEl.getBBox() gọi
// trực tiếp trên <svg>) lại ở đơn vị viewBox GỐC (không nhân hệ số đó) —
// không chia lại cho rootScale thì 2 con số không cùng đơn vị, so sánh sai.
function localToRootBBox(
  el: Element,
  bb: { x: number; y: number; width: number; height: number },
  rootScale: number
): { x: number; y: number; width: number; height: number } | null {
  let ctm: DOMMatrix | null = null;
  try {
    ctm = (el as unknown as SVGGraphicsElement).getCTM();
  } catch {
    ctm = null;
  }
  if (!ctm || !rootScale) return null;
  const corners = [
    { x: bb.x, y: bb.y },
    { x: bb.x + bb.width, y: bb.y },
    { x: bb.x, y: bb.y + bb.height },
    { x: bb.x + bb.width, y: bb.y + bb.height },
  ].map((p) => ({
    x: (ctm!.a * p.x + ctm!.c * p.y + ctm!.e) / rootScale,
    y: (ctm!.b * p.x + ctm!.d * p.y + ctm!.f) / rootScale,
  }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function getClipRectBBox(
  node: Element,
  svgRoot: SVGSVGElement,
  rootScale: number
): { x: number; y: number; width: number; height: number } | null {
  let clipRef: string | null = null;
  try {
    const style = window.getComputedStyle(node);
    clipRef = style.clipPath && style.clipPath !== 'none' ? style.clipPath : null;
  } catch {
    clipRef = null;
  }
  if (!clipRef) clipRef = node.getAttribute('clip-path');
  if (!clipRef) return null;
  const m = /url\(["']?#([^"')]+)["']?\)/.exec(clipRef);
  if (!m) return null;
  let clipPathEl: Element | null = null;
  try {
    clipPathEl = svgRoot.querySelector(`#${CSS.escape(m[1])}`);
  } catch {
    return null;
  }
  if (!clipPathEl) return null;
  const shape = clipPathEl.querySelector('rect, path, polygon, circle, ellipse') as SVGGraphicsElement | null;
  if (!shape) return null;
  try {
    const bb = shape.getBBox();
    if (!bb || (bb.width === 0 && bb.height === 0)) return null;
    // clipPathUnits mặc định là "userSpaceOnUse": tọa độ của hình dạng clip
    // (rect/path...) được định nghĩa trong hệ tọa độ cục bộ của PHẦN TỬ
    // MANG thuộc tính clip-path (`node`), không phải của chính <clipPath>
    // (phần tử này nằm trong <defs>, không có getCTM() hợp lệ) — nên quy
    // đổi bằng CTM của `node`, không phải của `shape`.
    return localToRootBBox(node, { x: bb.x, y: bb.y, width: bb.width, height: bb.height }, rootScale);
  } catch {
    return null;
  }
}

function intersectBBox(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function getVisibleContentBBox(
  svgRoot: SVGSVGElement
): { x: number; y: number; width: number; height: number; maxStrokeHalf: number } | null {
  const candidates = svgRoot.querySelectorAll(
    'path, rect, circle, ellipse, line, polyline, polygon, use, text, image'
  );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  // MỚI (khiếu nại: "đường ngang trên cùng của khung bảng biến thiên bị
  // cắt cụt"): getBBox() đo bbox theo TÂM đường path, KHÔNG tính bề dày
  // nét vẽ (stroke-width) — phần nửa nét vẽ lấn ra ngoài path không được
  // tính vào bbox. Với đường viền/khung nằm SÁT MÉP NGOÀI CÙNG của cả
  // hình (không có nội dung nào khác nằm ngoài nó để bù trừ, ví dụ cạnh
  // trên của khung bảng biến thiên), phần nửa nét vẽ đó chính là phần bị
  // viewBox mới (cắt sát theo bbox) cắt cụt mất. SỬA: đo thêm bề dày nét
  // LỚN NHẤT đang thật sự hiển thị trong hình (đã quy đổi đúng theo CTM
  // cục bộ của từng phần tử, không dùng chung rootScale vì phần tử có thể
  // nằm trong group có transform scale riêng) — trả ra ngoài để nơi gọi
  // chỉ nới thêm ĐÚNG BẰNG phần đó vào viewBox cuối cùng, không nới tràn
  // lan mọi phía một khoảng cố định lớn (tránh dư khoảng trống thừa xấu
  // với những hình chỉ toàn nét mảnh, vốn không cần nới thêm gì).
  let maxStrokeHalf = 0;

  // Hệ số quy đổi chung (thường là ~1.333, do trình duyệt lồng thêm quy
  // đổi pt->px vào getCTM() ở gốc <svg>) — dùng để đưa MỌI bbox cục bộ về
  // lại đúng đơn vị viewBox gốc sau khi nhân CTM. Xem giải thích đầy đủ ở
  // localToRootBBox() phía trên.
  let rootScale = 1;
  try {
    const rootCtm = (svgRoot as unknown as SVGGraphicsElement).getCTM();
    if (rootCtm && rootCtm.a) rootScale = rootCtm.a;
  } catch {
    rootScale = 1;
  }

  candidates.forEach((raw) => {
    const el = raw as unknown as SVGGraphicsElement;
    // Bỏ qua phần tử chỉ là ĐỊNH NGHĨA (glyph/symbol/clip/mask/pattern),
    // không tự hiển thị — chỉ tính phần tử thật sự được vẽ ra.
    if ((el as unknown as Element).closest('defs, symbol, clipPath, mask, pattern')) return;
    if (isEffectivelyHidden(el as unknown as Element, svgRoot)) return;

    let style: CSSStyleDeclaration;
    try {
      style = window.getComputedStyle(el as unknown as Element);
    } catch {
      return;
    }
    const fill = (style.fill || '').toLowerCase();
    const stroke = (style.stroke || '').toLowerCase();
    const fillOpacity = parseFloat(style.fillOpacity || '1');
    const strokeOpacity = parseFloat(style.strokeOpacity || '1');
    // SỬA LỖI GỐC RỄ (khiếu nại 23-7: "svg hiện rồi biến mất, không cảnh
    // báo"): TikZ hay dùng `\draw[name path=..., color=white] (A)--(B)`
    // để dựng đường phụ TÍNH TOÁN (vd giao điểm cho `name intersections`,
    // như trong hình lăng trụ/góc alpha) — path này CÓ tô màu thật (không
    // phải display:none/opacity:0 nên isEffectivelyHidden() không bắt
    // được), chỉ vô hình vì TRÙNG MÀU NỀN TRẮNG của trang. Trước đây
    // hasFill/hasStroke chỉ loại 'none'/'transparent', không loại màu
    // trắng -> đường phụ này bị tính nhầm là "nội dung thấy được", có thể
    // kéo dài vùng đo ra xa hẳn phần nét vẽ đen thật, làm viewBox cắt sai.
    // Nền các hình TikZ trong ứng dụng luôn là trắng/trong suốt, nên coi
    // fill/stroke trắng tuyệt đối là "vô hình" cùng một cách với 'none'.
    const isWhite = (c: string) =>
      c === '#fff' ||
      c === '#ffffff' ||
      c === 'white' ||
      /^rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(,.*)?\)$/.test(c);
    const hasFill = fill !== 'none' && fill !== 'transparent' && !isWhite(fill) && fillOpacity > 0.02;
    const hasStroke =
      stroke !== 'none' && stroke !== 'transparent' && !isWhite(stroke) && strokeOpacity > 0.02;
    const tag = (el as unknown as Element).tagName.toLowerCase();
    const isTextLike = tag === 'text' || tag === 'use' || tag === 'image';
    // Không tô, không viền, không phải chữ/glyph -> không phải nét vẽ
    // nhìn thấy được, bỏ qua (thường là điểm/đường dựng hình ẩn của TikZ).
    if (!hasFill && !hasStroke && !isTextLike) return;

    let rawBB: { x: number; y: number; width: number; height: number };
    try {
      rawBB = el.getBBox();
    } catch {
      return;
    }
    if (!rawBB || (rawBB.width === 0 && rawBB.height === 0)) return;

    // MỚI (22-7): quy bbox cục bộ của phần tử về hệ tọa độ chung của <svg>
    // bằng CTM trước khi dùng — bắt buộc phải làm TRƯỚC bước giao với clip,
    // nếu không phần tử nằm trong group bị lệch hệ tọa độ (vd chữ/nhãn) sẽ
    // cho ra bbox sai, kéo méo cả bbox tổng dù đã vá \clip.
    let effectiveBB: { x: number; y: number; width: number; height: number } | null = localToRootBBox(
      el as unknown as Element,
      rawBB,
      rootScale
    );
    if (!effectiveBB) return;

    // Đo bề dày nét vẽ cục bộ (nếu có viền), quy đổi sang đơn vị viewBox
    // gốc bằng CTM RIÊNG của phần tử này (không dùng chung rootScale, vì
    // rootScale chỉ là hệ số pt->px ở <svg> gốc — phần tử nằm trong group
    // có `scale`/`xscale`/`yscale` riêng của TikZ thì stroke-width cũng bị
    // nhân theo tỉ lệ đó, phải tính đúng CTM cục bộ mới ra đúng bề dày nét
    // TRÊN MÀN HÌNH quy về hệ toạ độ chung).
    if (hasStroke) {
      let elCtm: DOMMatrix | null = null;
      try {
        elCtm = (el as unknown as SVGGraphicsElement).getCTM();
      } catch {
        elCtm = null;
      }
      const localScale = elCtm && rootScale ? Math.hypot(elCtm.a, elCtm.b) / rootScale : 0;
      const strokeWidthLocal = parseFloat(style.strokeWidth || '0') || 0;
      const strokeHalf = (strokeWidthLocal * localScale) / 2;
      if (Number.isFinite(strokeHalf) && strokeHalf > maxStrokeHalf) {
        maxStrokeHalf = strokeHalf;
      }
    }

    // Giao (intersect) với TỪNG vùng clip-path của mọi tổ tiên (kể cả chính
    // phần tử) — path bị clip che khuất một phần/toàn phần thì chỉ tính
    // đúng phần THẬT SỰ còn nằm trong khung nhìn.
    let node: Element | null = el as unknown as Element;
    while (node && effectiveBB) {
      const clipRect = getClipRectBBox(node, svgRoot, rootScale);
      if (clipRect) effectiveBB = intersectBBox(effectiveBB, clipRect);
      if (node === svgRoot) break;
      node = node.parentElement;
    }
    if (!effectiveBB) return; // nằm hoàn toàn ngoài vùng clip -> không nhìn thấy được, bỏ qua

    minX = Math.min(minX, effectiveBB.x);
    minY = Math.min(minY, effectiveBB.y);
    maxX = Math.max(maxX, effectiveBB.x + effectiveBB.width);
    maxY = Math.max(maxY, effectiveBB.y + effectiveBB.height);
    found = true;
  });

  if (!found) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, maxStrokeHalf };
}

// (Đã xóa tính năng bấm vào ảnh mở popup phóng to toàn màn hình theo yêu
// cầu người dùng — giờ chỉ còn <img> hiển thị bình thường, không bắt sự
// kiện click/mở lớp phủ nào nữa. Vẫn giữ tên ZoomableImage để không phải
// sửa các nơi đang gọi.)
function ZoomableImage({
  src,
  alt,
  style,
  className,
}: {
  src: string;
  alt: string;
  style: CSSProperties;
  className?: string;
}) {
  return <img src={src} alt={alt} className={className} style={style} loading="lazy" decoding="async" />;
}

export function TikzImage({
  svg,
  scale,
  figId,
  onCropped,
}: {
  svg: string;
  scale: number;
  figId: string;
  // BÁO KẾT QUẢ ĐO THẬT (26-7, sửa khiếu nại "preview đầy đủ nhưng Lưu đề
  // xong bị mất nửa dưới"): trình duyệt đo bbox ở đây bằng getBBox() DOM
  // thật + getVisibleContentBBox() — ĐÃ ĐƯỢC XÁC NHẬN LÀ ĐÚNG (người dùng
  // thấy hình đầy đủ lúc preview). Server (tikzCrop.ts) trước đây tự đo LẠI
  // bằng resvg (thư viện Rust khác hẳn engine trình duyệt) rồi tự quyết cắt
  // theo ngưỡng riêng -> với hình có marker/text, resvg tính bbox lệch với
  // trình duyệt, có thể cắt sai vào nội dung thật dù trình duyệt đo đúng.
  // SỬA: báo NGUYÊN VĂN viewBox đã đo đúng ra ngoài qua callback này, để nơi
  // gọi (ExamBuilder.tsx) lưu lại và gửi kèm lúc Lưu đề — server dùng THẲNG
  // con số này, không đo lại bằng resvg nữa (resvg chỉ còn là phương án dự
  // phòng cho hình không có số đo kèm theo, xem applyTikzCropToRawData).
  onCropped?: (figId: string, bbox: { x: number; y: number; width: number; height: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // SỬA BUG GỐC RỄ (khiếu nại 23-7: "hình hiện đúng lúc đầu rồi biến mất sau
  // vài giây, viewBox vẫn còn nhưng style bị mất"): ĐÃ XÁC NHẬN bằng DOM
  // thực tế người dùng gửi — nguyên nhân giống HỆT bug đã từng gặp và vá ở
  // ExamBuilder.tsx (tab "Xem đề", xem comment gốc tại đó) nhưng CHƯA được
  // đồng bộ sang đây: TRƯỚC ĐÂY effect đo bbox chỉ chạy ĐÚNG 1 LẦN lúc mount
  // (dependency [namespacedSvg]) rồi lưu kết quả THẲNG vào thuộc tính DOM
  // (data-base-w/h). "Xem mô phỏng" mở ra kèm hiệu ứng chuyển màn hình/toàn
  // trang mới — đúng lúc effect chạy, container có thể CHƯA ổn định layout
  // (đang ẩn/đang transition/font glyph liền kề <use> chưa kịp load) khiến
  // getBBox() đo ra bbox sai một lần duy nhất — và vì KHÔNG có cơ chế đo lại,
  // lỗi này VĨNH VIỄN không tự sửa được (khác hẳn ExamBuilder.tsx đã có sẵn
  // vòng lặp đo lại tới khi ổn định).
  // SỬA: chuyển sang lưu kết quả đo bằng REACT STATE (set lại = re-render,
  // effect co giãn bên dưới tự ăn theo) thay vì ghi thẳng DOM attribute, và
  // ĐO LẠI bằng requestAnimationFrame (tối đa ~60 khung hình ~1s) + dự phòng
  // bằng ResizeObserver cho tới khi bbox hợp lệ — CHỈ ghi đè state khi đo
  // THÀNH CÔNG (bbox > 0), nên một lần đo lỡ hỏng sau này không thể xoá mất
  // kết quả tốt đã có trước đó — đồng bộ đúng 100% với ExamBuilder.tsx.
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);

  // Thêm tiền tố riêng cho id/href/url của từng hình — tránh 2 SVG khác nhau
  // bị trùng id glyph (pdf2svg hay đặt "glyph0-1" giống nhau giữa các lần
  // biên dịch), khiến trình duyệt mượn nhầm glyph giữa các hình khi hiển thị
  // nhiều hình cùng lúc trên 1 trang.
  const namespacedSvg = useMemo(() => {
    const prefix = `${figId.replace(/[^a-zA-Z0-9]/g, '')}_`;
    return svg
      .replace(/id="/g, `id="${prefix}`)
      .replace(/href="#/g, `href="#${prefix}`)
      .replace(/url\(#/g, `url(#${prefix}`);
  }, [svg, figId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setBase(null); // hình đổi (svg mới) -> đo lại từ đầu
    let cancelled = false;
    let rafId = 0;
    let attempts = 0;
    let ro: ResizeObserver | null = null;

    const tryMeasure = () => {
      const svgEl = container.querySelector('svg');
      if (!svgEl) return false;
      try {
        const bbox = (svgEl as unknown as SVGGraphicsElement).getBBox();
        // GHI CHÚ: "padding" này KHÔNG phải margin CSS — cộng thẳng vào
        // viewBox của SVG (nằm sẵn TRONG hình).
        const BASE_PADDING = 0.5;
        if (bbox.width > 0 && bbox.height > 0) {
          const LARGE_GAP_THRESHOLD_PX = 10;
          const SAFE_MARGIN_PX = 5;
          let vTop = bbox.y;
          let vBottom = bbox.y + bbox.height;
          const visible = getVisibleContentBBox(svgEl as unknown as SVGSVGElement);
          if (visible && visible.height > 0) {
            const extraTop = visible.y - bbox.y;
            const extraBottom = bbox.y + bbox.height - (visible.y + visible.height);
            if (extraTop > LARGE_GAP_THRESHOLD_PX) {
              vTop = visible.y - SAFE_MARGIN_PX;
            }
            if (extraBottom > LARGE_GAP_THRESHOLD_PX) {
              vBottom = visible.y + visible.height + SAFE_MARGIN_PX;
            }
          }
          // SỬA LỖI (khiếu nại: "đường ngang trên cùng của khung bảng biến
          // thiên bị cắt cụt"): getBBox() (biến `bbox` ở trên) không tính bề
          // dày nét vẽ, nên với đường viền nằm sát mép ngoài cùng của hình,
          // nửa nét vẽ lấn ra ngoài path bị hụt khỏi bbox. TRƯỚC ĐÂY chỉ
          // cộng thêm đúng 0.5 đơn vị mọi phía (đủ cho nét mảnh, KHÔNG đủ
          // cho khung/viền dày) -> bị cắt cụt. SỬA: nới `padding` thêm ĐÚNG
          // BẰNG nửa bề dày nét dày nhất đo được (`visible.maxStrokeHalf`)
          // — hình chỉ có nét mảnh thì padding gần như không đổi (vẫn cắt
          // sát như cũ), chỉ hình có khung/viền dày mới được nới thêm đủ để
          // không mất nét, tránh dư khoảng trắng thừa không cần thiết.
          const padding = Math.max(BASE_PADDING, (visible?.maxStrokeHalf ?? 0) + BASE_PADDING);
          const vh = vBottom - vTop;
          const w = bbox.width + padding * 2;
          const h = vh + padding * 2;
          // LƯỚI AN TOÀN (23-7): dù nguyên nhân gốc là gì, nếu kết quả tính
          // ra kích thước không hợp lệ (<=0 hoặc NaN) thì KHÔNG ghi đè viewBox
          // gốc — giữ nguyên hình đang hiển thị đúng thay vì làm nó biến mất.
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            const finalX = bbox.x - padding;
            const finalY = vTop - padding;
            svgEl.setAttribute('viewBox', `${finalX} ${finalY} ${w} ${h}`);
            svgEl.removeAttribute('width');
            svgEl.removeAttribute('height');
            // QUAN TRỌNG: server biên dịch TikZ thường gắn cứng width/height
            // vào style="..." — inline style luôn thắng CSS ngoài, phải xoá
            // hẳn rồi mới tự set lại kích thước bằng JS ở effect co giãn
            // bên dưới (dựa vào `base` state, không đọc DOM attribute nữa).
            svgEl.removeAttribute('style');
            if (!cancelled) setBase({ w, h });
            // Báo NGUYÊN VĂN viewBox vừa set (đã đo đúng bằng trình duyệt)
            // ra ngoài -- xem giải thích đầy đủ ở khai báo prop onCropped.
            onCropped?.(figId, { x: finalX, y: finalY, width: w, height: h });
            if (ro) {
              ro.disconnect();
              ro = null;
            }
            return true;
          }
        }
      } catch {
        // getBBox có thể ném lỗi nếu SVG chưa gắn vào DOM có kích thước
        // thực — thử lại ở khung hình kế tiếp thay vì bỏ cuộc luôn.
      }
      return false;
    };

    if (!tryMeasure()) {
      // Đo lại tối đa ~60 khung hình (~1s ở 60fps) cho tới khi layout ổn
      // định và bbox > 0 — đủ để chờ qua các trường hợp hình đang ẩn/màn
      // hình đang chuyển tiếp/font liền kề chưa load xong.
      const loop = () => {
        if (cancelled) return;
        attempts++;
        if (tryMeasure() || attempts > 60) return;
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

      // CHỈ lập ResizeObserver khi lần đo đầu tiên CHƯA thành công — bắt
      // đúng thời điểm layout ổn định (vd chuyển màn hình xong). Tự ngắt
      // ngay khi đo được, không rình các lần đổi cỡ sau này.
      ro = new ResizeObserver(() => {
        if (!cancelled) tryMeasure();
      });
      ro.observe(container);
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
    };
  }, [namespacedSvg]);

  // width 100% (lấp đầy khung chứa, CO GIÃN THEO container y hệt ảnh PNG
  // cạnh nó trong HANG_HINH_ROW) + maxWidth chặn trần đúng bằng kích thước
  // gốc đã đo (base.w*factor) để không phóng to vượt quá kích thước tự
  // nhiên của hình (SVG là vector nên phóng nhỏ lại không hề vỡ nét, chỉ
  // cần chặn KHÔNG phóng to quá cỡ thật).
  useEffect(() => {
    const svgEl = containerRef.current?.querySelector('svg') as SVGElement | null;
    if (!svgEl || !base) return;
    const factor = scale / 100;
    const el = svgEl as unknown as HTMLElement;
    el.style.width = '100%';
    el.style.maxWidth = `min(${base.w * factor}px, calc(100vmin - 2rem))`;
    el.style.height = 'auto';
    // Gán thẳng vào inline style (thắng tuyệt đối mọi CSS ngoài) để đảm bảo
    // LUÔN căn giữa, không phụ thuộc class CSS bên ngoài.
    el.style.display = 'block';
    el.style.marginLeft = 'auto';
    el.style.marginRight = 'auto';
  }, [scale, base]);

  // (Đã xóa tính năng bấm vào hình mở popup phóng to toàn màn hình theo
  // yêu cầu người dùng — không còn state zoomed/zoomHtml, không còn
  // onClick/cursor-zoom-in, không còn lớp phủ overlay nào nữa.)
  return (
    <>
      {/* (27-7, sửa lỗi "Xem mô phỏng/trang học sinh/lời giải: hình hiện to
          rồi 1-2 giây sau tự thu nhỏ lại, chỉ riêng Xem đề thì không bị"):
          NGUYÊN NHÂN: quy tắc CSS ép max-width:100%/height:auto cho svg TRƯỚC
          ĐÂY chỉ khai báo cục bộ trong ExamBuilder.tsx (style jsx global của
          trang "Xem đề") — có hiệu lực NGAY từ lần vẽ đầu tiên (CSS tĩnh).
          Mọi trang KHÁC render TikzImage (StudentTakeExam.tsx = Xem mô phỏng
          + trang học sinh thật, SolutionView.tsx = Lời giải, page.tsx/
          ClassDetailPanel.tsx) KHÔNG có quy tắc này — hình vẽ hiện ra theo
          đúng kích thước gốc trong SVG (có thể rất to) cho tới khi effect JS
          ở trên đo xong bbox + tính lại kích thước đúng theo % zoom (mất tới
          ~1s, đợi requestAnimationFrame + font tải xong) rồi mới set inline
          style co lại — đúng lúc đó tạo cảm giác "tự động thu nhỏ". SỬA: dời
          hẳn quy tắc CSS này vào NGAY TRONG TikzImage (component dùng chung
          cho MỌI trang) để có hiệu lực tức thì mọi nơi, không còn phụ thuộc
          effect JS chạy xong hay chưa — bỏ luôn bản khai báo riêng lẻ ở
          ExamBuilder.tsx (đã trở thành thừa, xem comment ở đó). */}
      <style jsx global>{`
        .tikz-svg-wrap {
          text-align: center;
        }
        .tikz-svg-wrap svg {
          display: block !important;
          margin: 0 auto !important;
          max-width: 100%;
          height: auto;
          flex-shrink: 0;
        }
      `}</style>
      <div
        ref={containerRef}
        className="tikz-svg-wrap w-full flex justify-center overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: namespacedSvg }}
      />
    </>
  );
}

// THÊM MỚI (khiếu nại "bảng lỗi ra tex" ở xuất Word): eatSurroundingDollars,
// extractEnvBlocks, cleanTableCell, parseLatexStatTable đã CHUYỂN sang
// textUtils.ts (file THUẦN, không 'use client') để examDocxExport.ts (chạy
// trên SERVER, xuất file .docx) dùng lại được ĐÚNG logic dò/parse bảng này —
// xem chú thích chi tiết tại textUtils.ts. Ở đây chỉ còn import lại
// (extractEnvBlocks, parseLatexStatTable ở đầu file) để renderExamText/
// LatexStatTable bên dưới dùng, giữ nguyên hành vi hiển thị trên web như cũ.

// LỊCH SỬ (đọc trước khi sửa lại phần này): bản trước dùng transform: scale()
// để tự thu nhỏ bảng vừa khung MỖI KHI XEM TRÊN MÀN HÌNH, kết hợp
// overflow-x-auto để cuộn phần còn tràn. Cơ chế đó gây ra một chuỗi bug tái
// diễn nhiều lần dưới nhiều biến thể ("khuất bên trái", "cụt cột", "đè chữ
// dòng sau", "thanh cuộn dọc không mong muốn"...) vì gốc rễ chung: transform
// không làm thay đổi kích thước LAYOUT (scrollWidth) của phần tử — chỉ đổi
// phần được VẼ RA — nên "kích thước dùng để tính vùng cuộn được" và "kích
// thước hiển thị thật" bị lệch nhau, và các trình duyệt/thiết bị (Chrome
// desktop, Chrome Android, WebView trong app như Zalo...) không xử lý phần
// lệch này giống nhau. Mỗi bản vá trước chỉ bù thêm 1 lớp (buffer px, đo lại
// khi font tải xong, ResizeObserver, transformOrigin...) cho ĐÚNG biến thể
// vừa gặp, nên dễ tái phát ở thiết bị/kích cỡ màn hình khác.
// SỬA TẬN GỐC (khiếu nại 28-7: bảng vẫn bị khuất bên trái dù đã vá nhiều
// lần): bỏ HẲN việc tự động scale khi xem trên màn hình. Bảng giữ nguyên cỡ
// chữ thật, khung ngoài CHỈ dùng overflow-x-auto thuần (không transform,
// không đo/tính height thủ công, không ResizeObserver theo dõi kích thước
// để scale, không buffer bù thanh cuộn) — tràn tới đâu vuốt/cuộn tới đó,
// không có khái niệm "phần bị khuất vĩnh viễn không cuộn tới được" nữa vì
// không còn phép biến đổi hình học nào chen vào giữa nội dung thật và vùng
// cuộn cả. Đánh đổi: bảng nhiều cột trên điện thoại hẹp phải vuốt nhiều hơn
// (không tự thu nhỏ chữ nữa) — chấp nhận được vì đổi lại loại bỏ hẳn cả
// nhóm bug đã lặp đi lặp lại nhiều lần.
// Vẫn CẦN scale khi IN/XUẤT PDF (window.print()): lúc in không có thanh
// cuộn, bảng rộng hơn khổ giấy sẽ bị cắt cột vĩnh viễn nếu không thu nhỏ
// (đúng bug gốc trước khi có FitWidthBlock). Phần scale-khi-in được giữ lại
// NHƯNG tách biệt hoàn toàn khỏi hiển thị trên màn hình: chỉ đo & áp dụng
// đúng 1 lần tại thời điểm beforeprint, không có cuộn, không có
// ResizeObserver chạy song song, không có sai số do thanh cuộn hay xoay màn
// hình — nên không mang theo các nguồn lỗi mà bản trước gặp phải.
// `fits` chỉ dùng để chọn canh giữa (bảng nhỏ hơn khung) hay canh trái (bảng
// tràn, cần cuộn) cho đẹp — đây là đọc kích thước THẬT (không qua transform
// nào), nên không lặp lại lỗi margin/căn giữa từng gặp trước đây.
export function FitWidthBlock({ children, className = '' }: { children: ReactNode; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  const [printScale, setPrintScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const check = () => setFits(inner.scrollWidth <= outer.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(outer);
    ro.observe(inner);

    const measureForPrint = () => {
      const naturalW = inner.scrollWidth;
      const availW = outer.clientWidth;
      setPrintScale(availW > 0 && naturalW > availW ? availW / naturalW : 1);
    };
    const onBeforePrint = () => measureForPrint();
    const onAfterPrint = () => setPrintScale(1);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);

    return () => {
      ro.disconnect();
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, [children]);

  return (
    <div
      ref={outerRef}
      className={`w-full flex overflow-x-auto print:overflow-visible print:justify-center ${
        fits ? 'justify-center' : 'justify-start'
      } ${className}`}
    >
      <div
        ref={innerRef}
        style={{ transform: `scale(${printScale})`, transformOrigin: 'top center' }}
        className="inline-block"
      >
        {children}
      </div>
    </div>
  );
}

export function LatexStatTable({ block }: { block: string }) {
  const rows = useMemo(() => parseLatexStatTable(block), [block]);
  if (rows.length === 0) return null;
  // SỬA (khiếu nại "khoảng cách các khối phải đều nhau"): đồng bộ margin
  // bảng thống kê với hình vẽ/TikZ — GIẢM tiếp từ 4px (my-1) xuống 1.6px
  // theo yêu cầu, dùng arbitrary value my-0 vì 1.6px không có sẵn
  // trong thang đo mặc định của Tailwind (chỉ có 0/1/2/3...).
  //
  // GHI CHÚ CHO AI/DEV SAU (đọc kỹ trước khi định giảm tiếp con số 1.6px):
  // my-0 ở đây CHỈ là margin-top/bottom BÊN NGOÀI khối bảng (khoảng
  // cách với văn bản/khối liền trước-sau). Nó KHÔNG kiểm soát 2 nguồn "độ
  // rộng" khác — nếu người dùng phản ánh "giảm margin xuống 0 vẫn thấy
  // khoảng cách/khối bảng to" thì thủ phạm nằm ở chỗ khác, không phải dòng
  // này:
  //   1) <td> bên dưới có padding cứng paddingTop/paddingBottom: 10px,
  //      paddingLeft/paddingRight: 20px — đây là khoảng trống NẰM TRONG
  //      khung viền bảng (giữa border và chữ), muốn bảng "gọn" lại thì phải
  //      giảm mấy số này, my-1/margin ngoài không đụng tới được.
  //   2) FitWidthBlock (định nghĩa phía trên trong file này) có thể co giãn
  //      (transform: scale) toàn bộ bảng để vừa khổ giấy khi in — khi bị
  //      scale nhỏ lại, khoảng trống padding trong mục (1) cũng bị thu nhỏ
  //      theo tỉ lệ nên nhìn có vẻ đổi, nhưng cơ chế margin-ngoài (my-1) thì
  //      không bị ảnh hưởng bởi scale này.
  // SỬA LỖI (khiếu nại: bảng đè lên dòng văn bản/câu hỏi ngay bên dưới nó,
  // xem ảnh chụp "Câu 12"): margin ngoài my-0 trước đây gần như bằng 0 nên
  // không có khoảng đệm nào giữa mép dưới bảng và dòng chữ kế tiếp — với
  // bảng bị FitWidthBlock scale nhỏ lại (đo bằng scrollHeight tự nhiên rồi
  // set height cho div ngoài) đôi khi vẫn còn sai số nhỏ, khiến nội dung
  // ngay sau bảng bị chồng lên. mb-3 (12px) trước đó bị phản ánh là RỘNG
  // QUÁ -> giảm xuống mb-1 (4px), vừa đủ để hết đè mà không tạo khoảng
  // trắng thừa. Giữ mt-0 vì phía trên (giữa văn bản câu hỏi và bảng) không
  // bị lỗi này. Không đụng tới padding trong <td> hay logic scale của
  // FitWidthBlock.
  // SỬA (khiếu nại 21-7: "khoảng đệm trái phải khá rộng"): paddingLeft/
  // paddingRight từ 20px -> 12px (GIẢM, không giảm về 0 để tránh chữ dính
  // sát viền như bản cũ px-5 từng bị phản ánh "chật chội" — xem ghi chú ở
  // ExamBuilder.tsx). paddingTop/paddingBottom giữ nguyên 10px (không liên
  // quan tới khiếu nại này). ĐỒNG BỘ với src/app/ExamBuilder.tsx.
  return (
    <FitWidthBlock className="mt-0 mb-2">
      <table className="border-collapse text-[13px]">
        <tbody>
          {rows.map((row, ri) => {
            const isDataRow = row.some((c) => /\[.*;.*\)/.test(c.text));
            return (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    colSpan={cell.colSpan}
                    // SỬA (khiếu nại: "bảng vẫn to, xem kiểu Azota gọn hơn
                    // nhiều"): giảm padding 12/10 -> 8/6 VÀ giảm cỡ chữ 15px
                    // -> 13px (text-[15px] -> text-[13px] ở <table> phía
                    // trên). ĐỒNG BỘ với src/app/ExamBuilder.tsx.
                    // SỬA LỖI (khiếu nại tiếp: dù đã có đệm 2px pl-0.5/pr-0.5
                    // ở FitWidthBlock, viền dọc mép trái NGOÀI CÙNG của bảng
                    // vẫn bị mờ/khuất khi bảng ở trạng thái cuộn ngang trên
                    // điện thoại): đệm 2px chỉ giải quyết việc viền CÓ CHỖ
                    // để vẽ (không bị tầng cha nào cắt mất), KHÔNG giải quyết
                    // được việc viền đó tự nó quá MỜ để nhìn thấy — nguyên
                    // nhân khác hẳn, nằm ở chính FitWidthBlock: khi bảng
                    // tràn màn hình, nó luôn bị ép `transform: scale(0.7)`
                    // (xem MIN_SCREEN_SCALE). border 1px (class "border" mặc
                    // định của Tailwind) sau khi nhân 0.7 chỉ còn ~0.7px —
                    // NHỎ HƠN 1 device-pixel, buộc trình duyệt phải
                    // anti-alias (tô mờ dần) thay vì vẽ 1 nét đặc — và vì
                    // border-gray-400 vốn đã nhạt, đúng tại mép trái cùng
                    // (nơi tiếp giáp thẳng nền trắng, ít được viền ô bên
                    // cạnh "cộng dồn" độ đậm như các đường kẻ giữa bảng) nó
                    // gần như biến mất hoàn toàn — đúng y hệt hiện tượng
                    // được phản ánh, và giải thích vì sao thêm padding
                    // (không đụng gì đến độ dày viền) không hề cải thiện.
                    // SỬA: tăng độ dày viền 1px -> 1.5px (border-2 là 2px,
                    // hơi dày; dùng inline borderWidth 1.5px để vẫn gọn) VÀ
                    // đậm màu hơn 1 bậc (gray-400 -> gray-500) — sau khi
                    // scale 0.7, viền còn ~1.05px (đủ ép trình duyệt vẽ gần
                    // như 1 device-pixel đặc thay vì nét mờ dưới-điểm-ảnh),
                    // màu đậm hơn cũng làm phần còn bị anti-alias (nếu có ở
                    // các mức scale/DPI khác) khó biến mất hẳn vào nền trắng
                    // hơn. Áp dụng CHO MỌI trường hợp (kể cả lúc bảng không
                    // bị scale) để không phải thêm state/logic điều kiện
                    // theo box.scrollable — đổi lại viền hơi đậm/dày hơn một
                    // chút even khi không cuộn, chấp nhận được vì vẫn đúng
                    // tinh thần "gọn kiểu Azota" (Azota cũng dùng viền khá
                    // rõ, không phải viền siêu mảnh gần vô hình). ĐỒNG BỘ
                    // với src/app/ExamBuilder.tsx.
                    // GHI CHÚ (28-7, sau khi bỏ scale-khi-xem-màn-hình ở
                    // FitWidthBlock — xem lịch sử phía trên component đó):
                    // đoạn giải thích scale(0.7) ở trên chỉ còn đúng cho lúc
                    // IN/XUẤT PDF (nếu bảng phải thu nhỏ để vừa khổ giấy) —
                    // khi XEM TRÊN MÀN HÌNH, bảng không còn bị scale nữa nên
                    // viền 1.5px hiển thị đúng 1.5px thật, không bị mờ. Vẫn
                    // GIỮ NGUYÊN borderWidth 1.5/gray-500 (không cần đổi lại
                    // 1px/gray-400) vì viền đậm hơn một chút không xấu và
                    // vẫn cần thiết lúc in.
                    style={{
                      paddingLeft: 8,
                      paddingRight: 8,
                      paddingTop: 6,
                      paddingBottom: 6,
                      borderWidth: 1.5,
                      borderStyle: 'solid',
                    }}
                    className={`border-gray-500 text-center whitespace-nowrap ${
                      isDataRow ? 'text-gray-700' : 'font-semibold bg-gray-50 text-gray-800'
                    }`}
                  >
                    <Latex>{cell.text}</Latex>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </FitWidthBlock>
  );
}

// Đáp số Phần III chỉ giữ chữ số 0-9, dấu "-", "+", dấu phẩy thập phân —
// bỏ mọi ký tự LaTeX bao quanh (vd "$0{,}5$" -> "0,5").
// CHUYỂN sang src/lib/textUtils.ts (file KHÔNG có 'use client') vì hàm này
// cần gọi được từ CẢ server (API submit) lẫn client — xem giải thích chi
// tiết trong textUtils.ts. Re-export lại ở đây để không phải sửa những chỗ
// khác từng import từ examRender.tsx.
export { extractAnswerDigits } from './textUtils';

// Thay [[HÌNH_TIKZ_n]] bằng SVG đã có sẵn trong tikzSvgMap (nhúng lúc xuất
// bản) — KHÔNG gọi API biên dịch nào, nên trang học sinh không cần API key
// TikZ/Gemini riêng của giáo viên.
// SỬA (Bước 3.1 mục 2): mốc ảnh cứng ngoài tikz do parser sinh ra thực tế là
// [[HÌNH_FILE_n]] (giống ExamBuilder.tsx dùng để tách khi soạn đề) — trước
// đây tách nhầm theo [[ẢNH_...]], không bao giờ khớp với dữ liệu thật nên
// luôn rơi xuống nhánh <Latex> và hiện nguyên văn "[[HÌNH_FILE_n]]" trên màn
// hình học sinh. Giờ nhận đúng mốc, có URL (imageUrlMap, nhúng lúc GV Xuất
// bản) thì hiện ảnh thật; chưa có thì báo rõ thay vì hiện chữ thô.
// THÊM MỚI (mục 2 — sửa lỗi chữ in nghiêng/đậm không xuống dòng): parser.ts
// (cleanTextFormatting) luôn bọc \textit{...}/\textbf{...} (và {\it ...},
// {\bf ...}) thành $\textit{...}$/$\textbf{...}$ để KaTeX nhận diện — nội
// dung bên trong CHẮC CHẮN là văn bản thường, không có $ hay {} lồng nhau
// (thường là nhãn ngắn kiểu "Cách 1:"). Nhưng KaTeX render text-mode thành
// 1 <span> inline-block DUY NHẤT không ngắt được nội bộ — nếu nhãn dài, nó
// tràn ra ngoài lề thay vì xuống dòng như văn bản thường xung quanh.
// Giải pháp: bóc riêng các đoạn $\textit{...}$/$\textbf{...}$ này ra khỏi
// chuỗi TRƯỚC khi đưa cho <Latex>, render trực tiếp bằng <em>/<strong> HTML
// (ngắt dòng tự nhiên như văn bản thường), phần còn lại (toán học thật) vẫn
// đưa cho <Latex>/KaTeX như cũ.
// SỬA (khiếu nại 28-7: "nhãn in nghiêng chứa công thức có dấu {} lồng bên
// trong (vd 'lấy $\pi = 3{,}14$') bị tràn ngang, không xuống dòng được"):
// regex CŨ [^{}]* cấm TUYỆT ĐỐI mọi dấu {}/} trong nội dung nhãn — nhưng
// parser.ts (bước "mở băng toán học", dòng ~831-838) chỉ mask/unmask các
// khối $...$ TRƯỚC/SAU bước bọc \textit{...} -> $\textit{...}$, nên công
// thức con dạng "3{,}14" (cách viết phổ biến để số thập phân không dính
// sát ký hiệu, vd $\pi = 3{,}14$) vẫn còn nguyên dấu {} khi đã nằm lồng
// trong $\textit{...}$ ở bản lưu cuối cùng. Gặp {} này, regex cũ không
// khớp được cả cụm -> rơi thẳng xuống nhánh <Latex> thô (xem
// renderTextWithItalicBoldFix bên dưới), KaTeX dựng thành 1 khối text-mode
// không ngắt dòng được, tràn ra ngoài màn hình.
// SỬA: cho phép nội dung nhãn là chuỗi xen kẽ giữa (a) ký tự thường KHÔNG
// phải {, }, $ và (b) một khối công thức con TRỌN VẸN $...$ (được phép
// chứa {} tự do bên trong, vì đó là công thức thật, không phải cấu trúc
// nhãn) — vẫn PHẢI đóng bằng $\textit{...}$ hoàn chỉnh (không đụng gì tới
// { hay } đứng RỜI ngoài công thức, giữ nguyên mục đích ban đầu là chỉ bắt
// đúng nhãn ngắn, tránh ăn nhầm sang cấu trúc LaTeX phức tạp khác).
const ITALIC_BOLD_MATH_RE = /\$\\text(it|bf)\{((?:[^{}$]|\$[^$]*\$)*)\}\$/g;
// Công thức nhúng BÊN TRONG nhãn in nghiêng/đậm, ví dụ \textit{...đến $2$ chữ
// số...} — cần tách riêng để vẫn cho KaTeX render đúng phần "$2$", còn phần
// chữ thường xung quanh thì in thẳng (không qua KaTeX) để giữ khả năng ngắt
// dòng tự nhiên bên trong <em>/<strong>.
const NESTED_INLINE_MATH_RE = /\$([^$]*)\$/g;

function renderInlineMixedContent(content: string, keyPrefix: string): ReactNode[] {
  if (!content.includes('$')) return [content];
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let mm: RegExpExecArray | null;
  let j = 0;
  NESTED_INLINE_MATH_RE.lastIndex = 0;
  while ((mm = NESTED_INLINE_MATH_RE.exec(content))) {
    if (mm.index > lastIndex) out.push(content.slice(lastIndex, mm.index));
    out.push(<Latex key={`${keyPrefix}-m${j++}`}>{mm[0]}</Latex>);
    lastIndex = mm.index + mm[0].length;
  }
  if (lastIndex < content.length) out.push(content.slice(lastIndex));
  return out;
}

// SỬA (khiếu nại 23-7: "trang Xem đề, chữ in nghiêng tự dưng xuống dòng
// riêng dù dòng trên còn trống") — hàm này TRƯỚC ĐÂY chỉ dùng nội bộ trong
// file này (trang Xem mô phỏng + học sinh làm bài). Trang "Xem đề" trong
// ExamBuilder.tsx lại tự render phần chữ bằng cách đưa thẳng vào <Latex>,
// KHÔNG qua bước tách $\textit{...}$/$\textbf{...}$ ra <em>/<strong> này —
// nên bên đó, KaTeX dựng nhãn in nghiêng thành 1 <span> inline-block DUY
// NHẤT, trình duyệt coi là 1 khối không ngắt được ở giữa: hễ không đủ chỗ
// trên dòng hiện tại (dù chỉ thiếu vài px) là đẩy NGUYÊN khối xuống dòng
// mới, thay vì ngắt chữ bình thường như văn bản HTML thật. Export hàm này
// ra để ExamBuilder.tsx gọi lại y hệt, đảm bảo hành vi giống nhau ở cả 3
// trang.
export function renderTextWithItalicBoldFix(text: string, keyPrefix: string): ReactNode[] {
  if (!text.includes('\\textit') && !text.includes('\\textbf')) {
    return [<Latex key={keyPrefix}>{text}</Latex>];
  }
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  ITALIC_BOLD_MATH_RE.lastIndex = 0;
  while ((m = ITALIC_BOLD_MATH_RE.exec(text))) {
    if (m.index > lastIndex) {
      const plain = text.slice(lastIndex, m.index);
      out.push(<Latex key={`${keyPrefix}-t${i++}`}>{plain}</Latex>);
    }
    const [, kind, content] = m;
    const inner = renderInlineMixedContent(content, `${keyPrefix}-e${i}`);
    out.push(
      kind === 'it' ? (
        <em key={`${keyPrefix}-e${i++}`} className="break-words">{inner}</em>
      ) : (
        <strong key={`${keyPrefix}-e${i++}`} className="break-words">{inner}</strong>
      )
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push(<Latex key={`${keyPrefix}-t${i++}`}>{text.slice(lastIndex)}</Latex>);
  }
  return out;
}

// Render MỘT mốc [[HÌNH_TIKZ_n]] hoặc [[HÌNH_FILE_n]] ra ảnh/tikz thật (hoặc
// cảnh báo "chưa có sẵn"). Tách riêng khỏi renderTikzAndFormulas (Phần 2B)
// để dùng lại được cho từng ô bên trong mốc [[HANG_HINH_ROW]]...[[/HANG_HINH_ROW]]
// (xem renderHangHinhRow bên dưới) mà KHÔNG viết lại logic render ảnh/tikz.
// Trả về null nếu `part` không phải 1 trong 2 dạng mốc trên.
// THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): imageScalePercent = 100 nghĩa
// là giữ NGUYÊN kích thước mặc định hiện tại (TikzImage scale 130, trần ảnh
// URL/file 520px/420px) — GV kéo thanh trượt lên/xuống sẽ nhân thêm hệ số
// này vào các con số gốc đó. Đồng thời đổi width: 'auto' -> width dùng
// CHUNG công thức với maxWidth (thay vì chỉ chặn trần) để ảnh NHỎ cũng thực
// sự được phóng to theo, không chỉ ảnh lớn mới bị thu nhỏ như trước đây.
// SỬA (khiếu nại: "Xem đề/Xem mô phỏng và Trang HS thật/Lời giải hiển thị
// hình TikZ lệch cỡ nhau ~8%"): TRƯỚC ĐÂY nhánh này (ảnh TikZ dạng URL/file,
// dùng cho Trang HS thật + Lời giải) tự định nghĩa riêng 1 hệ số 1.2 (120%)
// — khác với nhánh vẽ SVG sống (dùng cho Xem đề + Xem mô phỏng) đang dùng
// 130%. Giờ CẢ 2 nhánh cùng đọc chung TIKZ_DISPLAY_BASE_SCALE (xem
// tikzScaleConstants.ts) — đổi 1 số ở đó là đồng bộ NGAY cả 4 trang, không
// còn nguy cơ sửa sót 1 nơi như trước.
const TIKZ_URL_BASE_SCALE = TIKZ_DISPLAY_BASE_SCALE / 100;

function renderImageOrTikzToken(
  part: string,
  key: string,
  tikzSvgMap: Record<string, TikzMapEntry>,
  imageUrlMap: Record<string, string>,
  imageScalePercent: number = 100
): ReactNode {
  const scaleFactor = imageScalePercent / 100;
  if (part.startsWith('[[HÌNH_TIKZ_')) {
    const entry = tikzSvgMap[part];
    if (entry) {
      if (entry.isUrl) {
        const effectiveScale = scaleFactor * TIKZ_URL_BASE_SCALE;
        // SỬA (26-7, khiếu nại "PNG chuyển từ SVG hiện to khủng khiếp"):
        // khi đã biết kích thước LOGIC thật (w/h, cùng đơn vị cho cả SVG và
        // PNG — xem buildTikzSvgMap), set width TƯỜNG MINH = w × hệ số,
        // thay vì để 'auto' ăn theo "kích thước tự nhiên" của FILE (đúng
        // với SVG nhưng sai hẳn với PNG rasterize, luôn có kích thước pixel
        // thật cố định 1600px không liên quan gì tới cỡ TikZ gốc). maxWidth
        // vẫn giữ làm TRẦN an toàn (co lại trên màn hình hẹp), height:'auto'
        // để tỉ lệ khung hình luôn đúng khi bị co bởi trần.
        if (entry.w && entry.h && entry.w > 0 && entry.h > 0) {
          const displayW = Math.round(entry.w * effectiveScale);
          return (
            <div key={key} className="my-1 flex justify-center min-w-0 w-full">
              <ZoomableImage
                src={entry.value}
                alt=""
                className="h-auto rounded"
                style={{ width: `${displayW}px`, maxWidth: 'min(100%, calc(100vmin - 2rem))', height: 'auto' }}
              />
            </div>
          );
        }
        // Đề CŨ (chưa có w/h lưu sẵn) -> rơi về công thức cũ: kích thước tự
        // nhiên của file + trần theo capPx (chỉ chính xác với SVG, nhưng đây
        // là hình đã lưu từ trước, không có cách nào biết cỡ logic thật).
        const capPx = Math.round(520 * effectiveScale);
        return (
          <div key={key} className="my-1 flex justify-center min-w-0 w-full">
            <ZoomableImage
              src={entry.value}
              alt=""
              className="h-auto rounded"
              style={{ width: 'auto', maxWidth: `min(${capPx}px, calc(100vmin - 2rem))`, height: 'auto' }}
            />
          </div>
        );
      }
      return (
        <div key={key} className="my-1">
          <TikzImage svg={entry.value} scale={TIKZ_DISPLAY_BASE_SCALE * scaleFactor} figId={part} />
        </div>
      );
    }
    return (
      <div
        key={key}
        className="my-0 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-600 text-xs font-medium"
      >
        ⚠️ Hình vẽ chưa có sẵn (đề chưa được xuất bản lại sau khi cập nhật hình).
      </div>
    );
  }
  if (part.startsWith('[[HÌNH_FILE_')) {
    const url = imageUrlMap[part];
    if (url) {
      // SỬA (26-7, theo yêu cầu người dùng): ẢNH PNG/JPG do GV tải lên KHÔNG
      // áp dụng thanh trượt "Cỡ hình" — vì đây là ảnh raster (bitmap), phóng
      // to vượt quá độ phân giải gốc sẽ làm ảnh mờ/vỡ hạt (khác hẳn TikZ là
      // vector, phóng to bao nhiêu cũng không mất nét). Quay lại ĐÚNG logic
      // v28: width:'auto' (giữ nguyên kích thước gốc của ảnh) + trần CỐ ĐỊNH
      // 420px chỉ để CHẶN ảnh quá lớn, không hề phóng to ảnh nhỏ hơn trần.
      return (
        <div key={key} className="my-1 flex justify-center min-w-0 w-full">
          <ZoomableImage
            src={url}
            alt=""
            className="h-auto rounded"
            style={{ width: 'auto', maxWidth: 'min(420px, calc(100vmin - 2rem))', height: 'auto' }}
          />
        </div>
      );
    }
    return (
      <div
        key={key}
        className="my-0 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-600 text-xs font-medium"
      >
        ⚠️ Ảnh minh họa chưa có sẵn (đề chưa được xuất bản lại sau khi cập nhật ảnh).
      </div>
    );
  }
  return null;
}

function renderTikzAndFormulasPlain(
  text: string,
  keyPrefix: string,
  tikzSvgMap: Record<string, TikzMapEntry>,
  imageUrlMap: Record<string, string>,
  imageScalePercent: number = 100
): ReactNode[] {
  if (!text) return [];
  const parts = text.split(/(\[\[HÌNH_TIKZ_\d+\]\]|\[\[HÌNH_FILE_\d+\]\])/g);
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith('[[HÌNH_TIKZ_') || part.startsWith('[[HÌNH_FILE_')) {
      return renderImageOrTikzToken(part, key, tikzSvgMap, imageUrlMap, imageScalePercent);
    }
    if (!part) return null;
    return <span key={key}>{renderTextWithItalicBoldFix(part, key)}</span>;
  });
}

// THÊM MỚI (Phần 2B): mốc [[HANG_HINH_ROW]]cell1|||cell2|||...[[/HANG_HINH_ROW]]
// do parser.ts sinh ra cho bảng \begin{array}/tabular/tabularx/longtable chỉ
// dùng để DÀN LAYOUT ảnh/tikz cạnh nhau (xem HANDOFF-PHAN2A.md /
// HANDOFF-PHAN2B.md). Mỗi cell bên trong lại là 1 mốc [[HÌNH_FILE_n]] /
// [[HÌNH_TIKZ_n]] có sẵn — tái dùng renderImageOrTikzToken() ở trên, KHÔNG
// viết lại logic render ảnh/tikz.
const HANG_HINH_ROW_RE = /\[\[HANG_HINH_ROW\]\]([\s\S]*?)\[\[\/HANG_HINH_ROW\]\]/g;

function renderHangHinhRow(
  rowContent: string,
  keyPrefix: string,
  tikzSvgMap: Record<string, TikzMapEntry>,
  imageUrlMap: Record<string, string>,
  imageScalePercent: number = 100
): ReactNode {
  const cells = rowContent.split('|||');
  const cellMaxWidth = Math.round(420 * (imageScalePercent / 100));
  return (
    <div key={keyPrefix} className="flex flex-wrap items-start justify-center gap-4 w-full">
      {cells.map((cell, cIdx) => {
        const cellKey = `${keyPrefix}-cell${cIdx}`;
        const trimmed = cell.trim();
        return (
          <div
            key={cellKey}
            className="flex-1 flex justify-center min-w-0"
            style={{ flexBasis: 220, maxWidth: cellMaxWidth }}
          >
            {renderImageOrTikzToken(trimmed, `${cellKey}-tok`, tikzSvgMap, imageUrlMap, imageScalePercent) ?? (
              <span>{renderTextWithItalicBoldFix(trimmed, cellKey)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderTikzAndFormulas(
  text: string,
  keyPrefix: string,
  tikzSvgMap: Record<string, TikzMapEntry>,
  imageUrlMap: Record<string, string>,
  imageScalePercent: number = 100
): ReactNode[] {
  if (!text) return [];
  // Tách theo cặp mốc [[HANG_HINH_ROW]]...[[/HANG_HINH_ROW]] TRƯỚC, phần
  // còn lại (text bình thường + mốc ảnh/tikz đơn lẻ) giữ nguyên logic cũ
  // qua renderTikzAndFormulasPlain.
  if (!text.includes('[[HANG_HINH_ROW]]')) {
    return renderTikzAndFormulasPlain(text, keyPrefix, tikzSvgMap, imageUrlMap, imageScalePercent);
  }
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  HANG_HINH_ROW_RE.lastIndex = 0;
  while ((m = HANG_HINH_ROW_RE.exec(text))) {
    if (m.index > lastIndex) {
      out.push(
        ...renderTikzAndFormulasPlain(text.slice(lastIndex, m.index), `${keyPrefix}-p${i}`, tikzSvgMap, imageUrlMap, imageScalePercent)
      );
    }
    out.push(renderHangHinhRow(m[1], `${keyPrefix}-row${i}`, tikzSvgMap, imageUrlMap, imageScalePercent));
    lastIndex = m.index + m[0].length;
    i++;
  }
  if (lastIndex < text.length) {
    out.push(
      ...renderTikzAndFormulasPlain(text.slice(lastIndex), `${keyPrefix}-p${i}`, tikzSvgMap, imageUrlMap, imageScalePercent)
    );
  }
  return out;
}

export function renderExamText(
  text: string,
  tikzSvgMap: Record<string, TikzMapEntry>,
  keyPrefix: string,
  imageUrlMap: Record<string, string> = {},
  // THÊM MỚI (26-7, "tuỳ chọn chỉnh size hình"): 100 = giữ nguyên kích thước
  // mặc định hiện có; GV chỉnh thanh trượt trong tab "Xem đề" -> lưu vào
  // examSettings.imageScalePercent -> truyền xuống đây, áp dụng ĐỒNG NHẤT ở
  // mọi trang gọi renderExamText (Xem mô phỏng, trang học sinh làm bài, lời
  // giải, xem lại bài) vì tất cả cùng dùng chung hàm này.
  imageScalePercent: number = 100
): ReactNode[] {
  if (!text) return [];
  // Sửa các macro LaTeX mà KaTeX không hỗ trợ (vd \wideparen -> \overgroup)
  // NGAY TẠI ĐÂY — áp dụng lại lúc RENDER (không chỉ lúc GV nhập đề) để sửa
  // được cả những câu hỏi đã lưu sẵn trong DB từ trước khi có bản vá này,
  // không cần giáo viên phải nhập/import lại đề.
  text = sanitizeMathMacros(text);
  // SỬA (khiếu nại: "khoảng trắng trên/dưới hình to bất thường, chỉnh margin
  // không ăn thua") — xem giải thích chi tiết ở collapseBlankAroundImagePlaceholders
  // trong textUtils.ts. Gọi TRƯỚC extractEnvBlocks vì dòng trống dư có thể
  // đứng ngay trước/sau mốc hình, ảnh hưởng luôn tới việc tách khối bảng bên dưới.
  text = collapseBlankAroundImagePlaceholders(text);
  // SỬA (khiếu nại: "thụt đầu dòng khi xuống dòng xấu quá") — xem giải thích
  // chi tiết ở capLeadingIndent trong textUtils.ts.
  text = capLeadingIndent(text);
  const blocks = extractEnvBlocks(text);
  if (blocks.length === 0) {
    return renderTikzAndFormulas(text, `${keyPrefix}-seg0`, tikzSvgMap, imageUrlMap, imageScalePercent);
  }
  const result: ReactNode[] = [];
  let lastEnd = 0;
  blocks.forEach((b, i) => {
    result.push(
      ...renderTikzAndFormulas(text.slice(lastEnd, b.start), `${keyPrefix}-seg${i}`, tikzSvgMap, imageUrlMap, imageScalePercent)
    );
    result.push(<LatexStatTable key={`${keyPrefix}-table-${i}`} block={b.text} />);
    lastEnd = b.end;
  });
  result.push(
    ...renderTikzAndFormulas(text.slice(lastEnd), `${keyPrefix}-seg${blocks.length}`, tikzSvgMap, imageUrlMap, imageScalePercent)
  );
  return result;
}

// Gom tikz_list [{id, code, svg, url}] thành map id -> (svg | url), để
// renderExamText tra cứu nhanh.
//
// THÊM MỚI (đưa SVG TikZ lên Vercel Blob, giống ảnh cứng): đề mới lưu
// {id, code, url} thay vì nhúng thẳng {id, code, svg} — xem
// uploadTikzSvgsForSave() trong ExamBuilder.tsx. Ưu tiên `url` (nếu có) hơn
// `svg` — nhẹ hơn nhiều lần cho mỗi request tải trang /thi/[examId] (chỉ 1
// chuỗi URL ngắn thay vì cả chuỗi SVG dài), và trình duyệt tự cache ảnh
// theo URL. Đề CŨ (chỉ có `svg`, không có `url`) vẫn hoạt động y hệt —
// renderTikzAndFormulas bên dưới tự phân biệt 2 dạng giá trị.
// SỬA (26-7, khiếu nại "PNG chuyển từ SVG hiện to khủng khiếp trên máy
// tính, còn SVG thường thì bình thường"): map giờ mang thêm w/h = kích
// thước LOGIC của hình (đo từ cropBBox lúc upload — xem uploadTikzSvgsForSave
// trong ExamBuilder.tsx và route /api/upload-tikz-svg) — ĐÚNG đơn vị mà 1
// bản SVG bình thường có trong width/height của nó. renderImageOrTikzToken
// dùng con số này để set kích thước hiển thị TƯỜNG MINH cho cả url dạng SVG
// lẫn PNG, thay vì dựa vào "kích thước tự nhiên" của từng loại file (vốn
// chỉ đúng với SVG, còn PNG rasterize luôn có kích thước pixel thật cố định
// 1600px không liên quan gì tới cỡ TikZ gốc). Đề CŨ (lưu trước khi có w/h)
// không có 2 trường này -> w/h undefined -> renderImageOrTikzToken tự rơi
// về công thức cũ (dựa vào kích thước tự nhiên + trần), không hỏng gì.
export type TikzMapEntry = { value: string; isUrl: boolean; w?: number; h?: number };

export function buildTikzSvgMap(
  tikzList: { id: string; svg?: string; url?: string; w?: number; h?: number }[] | undefined
): Record<string, TikzMapEntry> {
  const map: Record<string, TikzMapEntry> = {};
  (tikzList || []).forEach((t) => {
    if (t.url) map[t.id] = { value: t.url, isUrl: true, w: t.w, h: t.h };
    else if (t.svg) map[t.id] = { value: t.svg, isUrl: false };
  });
  return map;
}

// THÊM MỚI (Bước 3.1 mục 2): gom image_list [{id, path, url}] thành map
// id -> url (Vercel Blob URL nhúng lúc GV bấm "Xuất bản"), cùng kiểu với
// buildTikzSvgMap ở trên. Ảnh nào GV chưa nạp/khớp file lúc xuất bản thì
// không có url -> renderTikzAndFormulas tự hiện cảnh báo thay vì lỗi.
export function buildImageUrlMap(imageList: { id: string; url?: string }[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  (imageList || []).forEach((img) => {
    if (img.url) map[img.id] = img.url;
  });
  return map;
}
