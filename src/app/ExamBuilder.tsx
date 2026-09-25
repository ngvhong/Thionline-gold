'use client';

import { useState, useRef, useEffect, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';
import { gradeExam, type ScoringSettings, type P1Answers, type P2Answers, type TextAnswers } from '@/lib/grading';
import { AppLogoIcon } from '@/components/AppBranding';
import StudentTakeExam from './thi/[examId]/StudentTakeExam';
import SolutionView from './thi/[examId]/SolutionView';
import { sanitizeMathMacros, stripLeadingTableEnv, collapseBlankAroundImagePlaceholders, capLeadingIndent } from '@/lib/textUtils';
import { FitWidthBlock, renderTextWithItalicBoldFix } from '@/lib/examRender';
import { TIKZ_DISPLAY_BASE_SCALE } from '@/lib/tikzScaleConstants';
import { scrollFadeX } from '@/lib/scrollFade';

// Icon nét vẽ đơn giản (kiểu outline, 1 màu, kế thừa currentColor) — dùng
// thay cho emoji ở Bảng Điều Khiển Phòng Thi để đồng bộ hình thức, tránh mỗi
// hệ điều hành/trình duyệt vẽ emoji một kiểu khác nhau.
function ClockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75v5.5l3.5 2M20.25 12a8.25 8.25 0 11-16.5 0 8.25 8.25 0 0116.5 0z" />
    </svg>
  );
}

function KeyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function SaveIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.8c0-1.68 0-2.52.327-3.162a3 3 0 011.311-1.311C4.98 3 5.82 3 7.5 3h6.879c.464 0 .696 0 .914.053.192.047.375.123.54.226.188.117.35.28.673.606l2.609 2.609c.326.326.489.489.606.673.103.165.179.348.226.54.053.218.053.45.053.914V16.2c0 1.68 0 2.52-.327 3.162a3 3 0 01-1.311 1.311C17.02 21 16.18 21 14.5 21h-7c-1.68 0-2.52 0-3.162-.327a3 3 0 01-1.311-1.311C3 18.72 3 17.88 3 16.2V7.8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3v4.2c0 .84 0 1.26.163 1.581a1.5 1.5 0 00.656.656C8.64 9.6 9.06 9.6 9.9 9.6h3.6c.84 0 1.26 0 1.581-.163a1.5 1.5 0 00.656-.656C15.9 8.46 15.9 8.04 15.9 7.2V3M7.5 21v-5.4c0-.84 0-1.26.163-1.581a1.5 1.5 0 01.656-.656C8.64 13.2 9.06 13.2 9.9 13.2h3.6c.84 0 1.26 0 1.581.163a1.5 1.5 0 01.656.656c.163.321.163.741.163 1.581V21" />
    </svg>
  );
}

function GlobeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3c2.25 2.4 3.5 5.55 3.5 9s-1.25 6.6-3.5 9c-2.25-2.4-3.5-5.55-3.5-9s1.25-6.6 3.5-9z" />
    </svg>
  );
}

function EyeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// THÊM MỚI: thay emoji ✍️ (bàn tay cầm bút) bằng SVG nét mảnh — chỉ vẽ cây
// bút đang viết lên đường kẻ, đủ gợi ý ý nghĩa "nhập tay/dán nội dung" mà
// không cần chi tiết bàn tay (khó vẽ đẹp ở size nhỏ).
function WritingIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 4.5l5 5L8 21H3v-5L14.5 4.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12.5 6.5l5 5" />
    </svg>
  );
}

// THÊM MỚI: icon mũ tốt nghiệp nét mảnh — dùng ở mấu thu gọn của bản xem
// trước "Cài đặt đề thi" (đồng bộ với StudentTakeExam.tsx, xem chú thích ở
// đó — mấu thu gọn không còn hiện số đếm giờ chạy chữ nữa).
function CapIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={className}>
      <path strokeLinejoin="round" d="M12 5.5 2.5 10 12 14.5 21.5 10 12 5.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 12.2V16c0 1.4 2.46 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-3.8" />
      <path strokeLinecap="round" d="M21.5 10v5.4" />
    </svg>
  );
}

// THÊM MỚI: icon dấu tick trong vòng tròn nét mảnh — thay emoji ✅ ở tiêu đề
// modal "Đã xuất bản đề thi", đồng bộ hình thức với các icon khác ở trên.
function CheckCircleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12.5l2.4 2.4 5.1-5.4" />
    </svg>
  );
}

// THÊM MỚI: icon "tia lấp lánh" nét mảnh — thay emoji 🎉 trong khối chúc
// mừng xuất bản thành công. Giữ tinh thần ăn mừng nhẹ nhàng mà vẫn cùng bộ
// nét mảnh với các icon khác, không lệ thuộc font emoji hệ điều hành.
function SparkleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5l1.4 4.3 4.3 1.4-4.3 1.4-1.4 4.3-1.4-4.3-4.3-1.4 4.3-1.4L12 3.5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 14.5l.75 2.25 2.25.75-2.25.75-.75 2.25-.75-2.25-2.25-.75 2.25-.75.75-2.25z" />
    </svg>
  );
}

// THÊM MỚI: icon biểu đồ cột nét mảnh — thay emoji 📊 ở dòng "Thống kê" số
// câu từng phần, cùng bộ nét mảnh strokeWidth=1.6-1.8 với các icon trên.
function ChartBarIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10.5M10 20V4M16 20v-7M20 20H4" />
    </svg>
  );
}

// THÊM MỚI: icon "gửi/giao" nét mảnh — thay emoji 📤 trong hướng dẫn tìm nút
// "Giao đề" ở tab Quản lý lớp. Cùng hình dạng với SendIcon ở page.tsx (nút
// Giao đề thật) để GV liên tưởng đúng nút cần bấm.
function SendIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20.5 3.5 3 10.2l6.8 2.5 2.5 6.8L20.5 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M20.5 3.5 9.8 12.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

type Partition = 'p1' | 'p2' | 'p3' | 'p4';

const PARTITION_KEY: Record<Partition, string> = {
  p1: 'phan_1_TracNghiem',
  p2: 'phan_2_DungSai',
  p3: 'phan_3_TraLoiNgan',
  p4: 'phan_4_TuLuan',
};

// App 1 là app CHÍNH (mặc định luôn thử trước). App 2 chỉ dùng khi app 1 báo
// bận/xếp hàng (timeout hoặc HTTP 429/503) — dùng để "tăng cường" tốc độ biên
// dịch khi có nhiều hình cùng lúc, không phải để thay thế app 1.
const TIKZ_ENDPOINTS = [
  'https://carot2026-tikz.hf.space/compile', // App 1: chính
  'https://hong-2-m2w-tikz-compiler.hf.space/compile', // App 2: dự phòng khi app 1 bận
];

// Thử biên dịch lần lượt theo thứ tự TIKZ_ENDPOINTS. Với app 1: nếu quá 25
// giây không phản hồi (coi như đang xếp hàng chờ máy chủ free) hoặc trả về
// HTTP 429/503 (quá tải) thì chuyển ngay sang app 2. App nào biên dịch thành
// công trước thì dùng kết quả đó, không cần thử tiếp.
// Bọc mã TikZ THUẦN (không có \documentclass/\begin{document}...) bằng khung
// tài liệu chuẩn kèm các gói LaTeX hình học hay dùng ở Việt Nam. Tách thành
// hàm dùng chung để lần biên dịch ĐẦU (lúc upload) và lần biên dịch LẠI (lúc
// người dùng bấm "Sửa hình" rồi lưu) luôn ra cùng một khung, tránh lặp code.
// SỬA (tư vấn "khoảng trống lớn quanh hình TikZ", phiên 17-7): border giảm
// từ 3mm xuống 1pt. `standalone[tikz]` tự tính bounding box của
// tikzpicture (cơ chế preview package tích hợp sẵn bên trong, KHÔNG cần
// tự thêm `\usepackage{preview}` — thêm vào sẽ trùng/xung đột) rồi crop
// trang PDF sát vào đó, chỉ chừa đúng số này làm viền. 3mm (~8.5pt) khá
// rộng so với nhu cầu; 1pt vẫn đủ an toàn để không cắt lẹm nét vẽ ở biên
// (ví dụ đầu mút nét dày/mũi tên) mà không để lại khoảng trắng thừa. Đây
// chỉ là bước GIẢM viền ở nguồn — phần "cắt sát thêm theo đúng nội dung
// đã vẽ" (bù cho các hình có bounding box rộng hơn phần thấy được, ví dụ
// do điểm dựng hình ẩn) vẫn nằm ở tikzCrop.ts (server, lúc lưu đề) +
// getBBox() phía trình duyệt (lúc xem) như đã thống nhất — 2 việc độc
// lập, không thay thế nhau.
function buildTikzTemplate(tikzCode: string) {
  return `\\documentclass[tikz, border=1pt]{standalone}
\\usepackage[utf8]{vietnam}
\\usepackage[dvipsnames]{xcolor}
\\usepackage{amsmath, amssymb, amsfonts, mathrsfs, mathtools, bm, physics}
\\usepackage[european, straightvoltages]{circuitikz}
\\usepackage{siunitx, chemfig}
\\usepackage[version=4]{mhchem}
\\usepackage{tkz-euclide}
\\usepackage{pgfplots, tkz-tab, pgf-pie}
\\pgfplotsset{compat=1.18}
\\usepgfplotslibrary{fillbetween, colormaps}
\\usetikzlibrary{calc, angles, quotes, intersections, patterns, patterns.meta, shadings, arrows.meta, 3d, perspective, decorations.markings, decorations.pathreplacing, decorations.pathmorphing, positioning, shapes.geometric, trees, mindmap, matrix}
\\begin{document}
${tikzCode}
\\end{document}`;
}

// Ảnh SVG trả về từ Hugging Face luôn có viewBox rộng hơn hẳn phần hình thực
// sự vẽ (bảng, mũi tên...) — khoảng trắng thừa đó nằm NGAY TRONG ảnh nên CSS
// justify-center/mx-auto không cắt được. Sau khi ảnh gắn vào DOM, dùng
// getBBox() để đo đúng vùng có nét vẽ rồi ghi đè lại viewBox cho SÁT nội
// dung — vừa hết khoảng trắng thừa trên/dưới/trái/phải, vừa tự động căn
// giữa đúng nghĩa (vì lúc này toàn bộ viewBox chính là nội dung).
//
// PHÁT HIỆN "KHOẢNG TRỐNG LỚN" trên/dưới (thêm 21-7, theo phản ánh: "khoảng
// trống trên dưới hình đôi khi gấp 9-10 lần nội dung câu hỏi") — ĐỒNG BỘ 100%
// với src/lib/examRender.tsx (trang HS làm bài thật), xem giải thích đầy đủ
// ở đó. Tóm tắt: getBBox() tính CẢ phần tử không nhìn thấy (điểm/nét dựng
// hình ẩn của TikZ) miễn không display:none — dvisvgm/pdf2svg đôi khi để
// các phần tử ẩn này nằm rất xa nội dung thật, khiến bbox tổng bị "thổi
// phồng" theo chiều CAO. getVisibleContentBBox() đo lại CHỈ phần tử có nét
// vẽ/tô thấy được; CHỈ dùng để cắt thêm khi khoảng trống trên+dưới đã lớn
// hơn hẳn (>1.5 lần) chiều cao nội dung thật — khoảng trống bình thường/nhỏ
// thì giữ nguyên cách đo cũ, không cắt lẹm oan.
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
  // cắt cụt") — ĐỒNG BỘ với lib/examRender.tsx: getBBox() không tính bề
  // dày nét vẽ, nên viền/khung nằm sát mép ngoài cùng của hình bị hụt mất
  // nửa nét khi cắt sát viewBox. Đo thêm bề dày nét LỚN NHẤT đang hiển thị
  // để nơi gọi chỉ nới đệm thêm đúng bằng phần đó, không nới tràn lan.
  let maxStrokeHalf = 0;

  // Xem giải thích ở localToRootBBox() phía trên.
  let rootScale = 1;
  try {
    const rootCtm = (svgRoot as unknown as SVGGraphicsElement).getCTM();
    if (rootCtm && rootCtm.a) rootScale = rootCtm.a;
  } catch {
    rootScale = 1;
  }

  candidates.forEach((raw) => {
    const el = raw as unknown as SVGGraphicsElement;
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
    const hasFill = fill !== 'none' && fill !== 'transparent' && fillOpacity > 0.02;
    const hasStroke = stroke !== 'none' && stroke !== 'transparent' && strokeOpacity > 0.02;
    const tag = (el as unknown as Element).tagName.toLowerCase();
    const isTextLike = tag === 'text' || tag === 'use' || tag === 'image';
    if (!hasFill && !hasStroke && !isTextLike) return;

    let rawBB: { x: number; y: number; width: number; height: number };
    try {
      rawBB = el.getBBox();
    } catch {
      return;
    }
    if (!rawBB || (rawBB.width === 0 && rawBB.height === 0)) return;

    // SỬA LỖI (khiếu nại: "câu Đúng/Sai có hình luôn bị khoảng trắng cực
    // lớn >1000px") — ĐỒNG BỘ 100% với lib/examRender.tsx, xem giải thích
    // đầy đủ ở đó: getBBox() bỏ qua clip-path, nên hàm số có tiệm cận đứng
    // vẽ bằng "\clip(...) rectangle (...)" trong TikZ vẫn bị tính cả đoạn
    // "vọt" ra xa (ẩn đi bằng clip, không hề nhìn thấy) vào bbox. Giao
    // (intersect) bbox phần tử với bbox vùng clip-path của mọi tổ tiên
    // trước khi cộng vào tổng — nhưng phải quy về CHUNG hệ tọa độ bằng CTM
    // trước (localToRootBBox), nếu không phần tử nằm trong group bị lệch
    // hệ tọa độ (chữ/nhãn) vẫn cho bbox sai dù đã vá \clip.
    let effectiveBB: { x: number; y: number; width: number; height: number } | null = localToRootBBox(
      el as unknown as Element,
      rawBB,
      rootScale
    );
    if (!effectiveBB) return;

    // Đo bề dày nét vẽ cục bộ, quy đổi sang đơn vị viewBox gốc bằng CTM
    // RIÊNG của phần tử (không dùng chung rootScale) — xem giải thích đầy
    // đủ ở lib/examRender.tsx.
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

    let node: Element | null = el as unknown as Element;
    while (node && effectiveBB) {
      const clipRect = getClipRectBBox(node, svgRoot, rootScale);
      if (clipRect) effectiveBB = intersectBBox(effectiveBB, clipRect);
      if (node === svgRoot) break;
      node = node.parentElement;
    }
    if (!effectiveBB) return;

    minX = Math.min(minX, effectiveBB.x);
    minY = Math.min(minY, effectiveBB.y);
    maxX = Math.max(maxX, effectiveBB.x + effectiveBB.width);
    maxY = Math.max(maxY, effectiveBB.y + effectiveBB.height);
    found = true;
  });

  if (!found) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, maxStrokeHalf };
}

// SỬA TIẾP (22-7) — ĐỒNG BỘ 100% với lib/examRender.tsx, xem giải thích
// đầy đủ ở đó: getBBox() trả về tọa độ cục bộ của từng phần tử, KHÔNG
// cùng hệ tọa độ giữa các nhóm phần tử khác nhau (dvisvgm đặt chữ/nhãn
// vào 1 group transform riêng để lật trục, còn nét vẽ path thì không) —
// phải quy về CHUNG 1 hệ tọa độ bằng getCTM() trước khi so sánh/gộp.
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

// Xem giải thích đầy đủ ở bản gốc trong lib/examRender.tsx.
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

function TikzImage({
  svg,
  scale,
  figId,
  onCropped,
}: {
  svg: string;
  scale: number;
  figId: string;
  // (26-7) Báo NGUYÊN VĂN viewBox đã đo đúng bằng trình duyệt ra ngoài, để
  // lưu lại và gửi kèm lúc Lưu đề — server dùng thẳng, không tự đo lại bằng
  // resvg nữa. Xem giải thích đầy đủ ở bản TikzImage trong lib/examRender.tsx.
  onCropped?: (figId: string, bbox: { x: number; y: number; width: number; height: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // SỬA BUG (khiếu nại: "zoom hình hoạt động lúc được lúc không, 1 số hình
  // zoom to được nhưng kéo nhỏ không được, 1 số hình zoom không có tác
  // dụng"): TRƯỚC ĐÂY lưu kích thước gốc (base-w/h) thẳng vào thuộc tính DOM
  // rồi đọc lại ở effect zoom riêng — nếu getBBox() ở effect đo đầu tiên trả
  // về 0 (hình đang ẩn vì chưa cuộn tới/đang ở tab chưa active/font KaTeX lân
  // cận chưa kịp load xong nên layout chưa ổn định), base-w/h KHÔNG BAO GIỜ
  // được set, khiến effect zoom luôn return sớm — kéo thanh trượt không có
  // tác dụng cho ĐÚNG những hình bị lỡ nhịp đo này (giải thích triệu chứng
  // "lúc được lúc không", tuỳ hình). BÂY GIỜ: chuyển sang lưu bằng state (để
  // set lại là re-render, effect zoom tự chạy lại ăn theo), và đo lại nhiều
  // lần bằng requestAnimationFrame cho tới khi bbox > 0 thay vì đo đúng 1
  // lần lúc mount — không còn phụ thuộc việc layout đã ổn định ngay khung
  // hình đầu tiên hay chưa.
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);

  // QUAN TRỌNG: pdf2svg đặt id glyph/font kiểu "glyph0-1", "glyph0-2"... theo
  // thứ tự font subset — thường TRÙNG NHAU giữa các lần biên dịch khác nhau
  // vì cùng dùng chung font DejaVu/Vietnam. Khi nhiều hình TikZ cùng hiển thị
  // trên 1 trang HTML, nếu 2 SVG khác nhau đều có id="glyph0-1" (nhưng hình
  // dạng nét vẽ khác nhau), trình duyệt chỉ nhận ĐỊNH NGHĨA ĐẦU TIÊN xuất
  // hiện trong toàn trang — mọi <use href="#glyph0-1"> ở SVG sau đó bị mượn
  // nhầm glyph của SVG trước, làm ký hiệu/nhãn hiển thị sai/vỡ. App Desktop
  // đã tránh lỗi này bằng cách thêm tiền tố riêng cho mọi id/href/url của
  // từng hình trước khi nhúng — ở đây làm y hệt.
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
    // SỬA BUG (khiếu nại: "zoom hình bị giật/lag màn hình, 1 số hình tự zoom
    // xong lag"): TRƯỚC ĐÂY ResizeObserver bên dưới được tạo & observe() KHÔNG
    // ĐIỀU KIỆN, và KHÔNG BAO GIỜ tự ngắt — kể cả sau khi đã đo bbox thành
    // công. Hệ quả: effect zoom ở dưới (set `svgEl.style.width/height` theo
    // %) LÀM ĐỔI kích thước khung `container`, ResizeObserver lại tưởng "hình
    // mới cần đo lại", gọi `getBBox()` (tốn CPU với hình nhiều nét vẽ) +
    // `setBase()` (state mới -> re-render) NGAY LẬP TỨC — mỗi nhịp kéo thanh
    // trượt kéo theo 1 vòng đo lại như vậy, gây giật/lag, có hình bị đo lại
    // đúng lúc dở dang tạo cảm giác "tự zoom". BÂY GIỜ: observer chỉ tồn tại
    // trong lúc CHỜ đo (svg chưa có bbox hợp lệ lúc mount — ẩn/tab chưa
    // active/font chưa load) và tự `disconnect()` NGAY khi đo được — không
    // rình các lần đổi cỡ về sau nữa (kể cả do chính thanh trượt zoom gây ra).
    let ro: ResizeObserver | null = null;

    const tryMeasure = () => {
      const svgEl = container.querySelector('svg');
      if (!svgEl) return false;
      try {
        const bbox = (svgEl as unknown as SVGGraphicsElement).getBBox();
        // GHI CHÚ CHO AI/DEV SAU (giống hệt lib/examRender.tsx — bản dùng
        // cho trang học sinh): "padding" này KHÔNG phải margin CSS, không
        // liên quan my-1/my-0 ở LatexStatTable/renderTikzAndFormolas
        // bên dưới. Nó cộng thẳng vào viewBox của SVG (nằm sẵn TRONG hình),
        // nên dù margin ngoài giảm về 0, hình TikZ ở màn soạn đề vẫn còn
        // khoảng trắng quanh nét vẽ do dòng này gây ra. Muốn giảm phải sửa
        // số 4 ở đây, không phải my-1.
        const BASE_PADDING = 0.5; // GIẢM TIẾP (test biên 17-7): 1.6 -> 0.5, đồng bộ với examRender.tsx & margin ngoài đã về 0 (my-0)
        if (bbox.width > 0 && bbox.height > 0) {
          // MỚI (21-7, sửa lại theo yêu cầu — dùng NGƯỠNG SỐ PX CỤ THỂ thay
          // vì tỉ lệ, xét RIÊNG từng đầu trên/dưới, không cộng gộp — ĐỒNG BỘ
          // 100% với src/lib/examRender.tsx, xem giải thích đầy đủ ở đó):
          //   - Khoảng trống 1 đầu > LARGE_GAP_THRESHOLD_PX -> cắt bớt đầu
          //     đó về còn đúng SAFE_MARGIN_PX đệm an toàn từ mép nội dung
          //     thấy được, không cắt sát 0px để tránh phạm/lẹm nét vẽ.
          //   - Khoảng trống đầu đó <= ngưỡng -> giữ nguyên bbox tổng cũ.
          // Chỉ áp dụng trên/dưới, không đụng trái/phải.
          // GIẢM TIẾP (22-7, theo yêu cầu "giảm còn 4-5px"): getVisibleContentBBox()
          // giờ đã đo đúng bằng CTM (xem localToRootBBox), khoảng trống thật
          // của ảnh bình thường chỉ còn ~2-6px -> hạ ngưỡng/đệm tương ứng
          // (trước là 35/15, để lớn vì lúc đó phép đo còn lệch hệ tọa độ).
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
          // thiên bị cắt cụt") — ĐỒNG BỘ với lib/examRender.tsx: nới đệm
          // thêm ĐÚNG BẰNG nửa bề dày nét dày nhất đo được, không nới tràn
          // lan mọi hình một khoảng cố định lớn.
          const padding = Math.max(BASE_PADDING, (visible?.maxStrokeHalf ?? 0) + BASE_PADDING);
          const vh = vBottom - vTop;
          const w = bbox.width + padding * 2;
          const h = vh + padding * 2;
          const finalX = bbox.x - padding;
          const finalY = vTop - padding;
          svgEl.setAttribute('viewBox', `${finalX} ${finalY} ${w} ${h}`);
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');
          // QUAN TRỌNG: pdf2svg (công cụ server dùng để xuất SVG từ PDF LaTeX)
          // luôn gắn CỨNG width/height vào thuộc tính style="..." (vd
          // style="width:400.03pt; height:300pt"). Inline style LUÔN thắng CSS
          // ngoài, nên phải xoá hẳn style cũ rồi mới tự set lại kích thước bằng
          // JS ở effect zoom bên dưới.
          svgEl.removeAttribute('style');
          if (!cancelled) setBase({ w, h });
          onCropped?.(figId, { x: finalX, y: finalY, width: w, height: h });
          // Đo xong rồi — từ giờ chỉ còn thanh trượt zoom đổi kích thước, KHÔNG
          // cần "đo lại" nữa -> ngắt observer ngay để tránh vòng lặp giật/lag
          // mô tả ở trên.
          if (ro) {
            ro.disconnect();
            ro = null;
          }
          return true;
        }
      } catch {
        // getBBox có thể ném lỗi nếu SVG chưa gắn vào DOM có kích thước thực
        // — thử lại ở khung hình kế tiếp thay vì bỏ cuộc luôn.
      }
      return false;
    };

    if (!tryMeasure()) {
      // Đo lại tối đa ~60 khung hình (~1s ở 60fps) cho tới khi layout ổn
      // định và bbox > 0 — đủ để chờ qua các trường hợp hình đang ẩn/tab
      // chưa active/font liền kề chưa load xong.
      const loop = () => {
        if (cancelled) return;
        attempts++;
        if (tryMeasure() || attempts > 60) return;
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);

      // CHỈ lập ResizeObserver khi lần đo đầu tiên CHƯA thành công — để bắt
      // đúng thời điểm layout ổn định (vd chuyển tab/mở lại panel ẩn rồi
      // hiện). Nếu tryMeasure() ở trên đã thành công ngay thì KHÔNG tạo
      // observer nữa (trước đây tạo cả trong trường hợp này — chính là gốc
      // của bug giật/lag khi zoom).
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

  // Thanh trượt phóng to/thu nhỏ: tính kích thước THẬT theo PIXEL từ đúng
  // kích thước đã crop (base.w/h, lưu bằng state) nhân với %, không phụ
  // thuộc max-height/max-width nào cả — kéo bao nhiêu, to/nhỏ đúng bấy
  // nhiêu, và tự chạy lại ngay khi base được đo xong (kể cả đo trễ).
  // SỬA (khiếu nại 23-7, đồng bộ với examRender.tsx): width 100% + maxWidth
  // chặn trần ở kích thước gốc, thay vì px tuyệt đối cố định — để hình co
  // giãn theo khung chứa (nhất là khi 2 hình xếp cạnh nhau trong
  // HANG_HINH_ROW, xem giải thích đầy đủ ở examRender.tsx).
  useEffect(() => {
    const svgEl = containerRef.current?.querySelector('svg') as SVGElement | null;
    if (!svgEl || !base) return;
    const factor = scale / 100;
    const el = svgEl as unknown as HTMLElement;
    el.style.width = '100%';
    el.style.maxWidth = `min(${base.w * factor}px, calc(100vmin - 2rem))`;
    el.style.height = 'auto';
    // Gán thẳng vào inline style (thắng tuyệt đối mọi CSS ngoài, kể cả
    // preflight reset "margin:0" của Tailwind) để đảm bảo LUÔN căn giữa,
    // không phụ thuộc class CSS bên ngoài có bị đè hay chưa build lại hay không.
    el.style.display = 'block';
    el.style.marginLeft = 'auto';
    el.style.marginRight = 'auto';
  }, [scale, base]);

  return (
    <div
      ref={containerRef}
      className="tikz-svg-wrap w-full flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: namespacedSvg }}
    />
  );
}

// THÊM MỚI: ảnh cứng (\includegraphics) nằm NGOÀI tikz — trước đây hiển thị
// bằng thẻ <img> thường với "text-center" trên div cha, nhưng Tailwind
// preflight tự gán "max-width:100%; height:auto" cho MỌI <img>, khiến ảnh to
// hơn khung câu hỏi bị ép co lại vừa khít bề ngang khung — lúc đó ảnh CHIẾM
// TRỌN bề ngang nên "text-center" không còn tác dụng thấy được (100% rồi thì
// căn giữa hay không cũng như nhau về mặt thị giác), tạo cảm giác "không căn
// giữa". Viết lại tương tự TikzImage: bọc trong flex justify-center +
// overflow-x-auto để LUÔN căn giữa đúng nghĩa dù ảnh to hay nhỏ hơn khung, và
// thêm thanh trượt phóng to/thu nhỏ giống hệt hình TikZ — dùng kích thước
// GỐC của ảnh (naturalWidth, giới hạn trần 640px cho lần hiển thị đầu để
// ảnh scan/chụp quá khổ không chiếm hết màn hình) nhân theo % để zoom đúng
// tỷ lệ, không phụ thuộc max-width mặc định của Tailwind (ghi đè bằng
// className "max-w-none" + set width bằng px tuyệt đối).
// SỬA (yêu cầu 23-7 sau: "áp dụng trang Xem đề như 2 trang kia cho ảnh vừa
// khít khung") — TRƯỚC ĐÂY component này tự đo naturalWidth rồi gán width
// CỐ ĐỊNH theo px (Math.min(naturalWidth, 420)), bọc trong div
// "overflow-x-auto" -> trên khung hẹp (điện thoại dọc) ảnh KHÔNG co nhỏ lại
// theo khung mà TRÀN ra và phải cuộn ngang mới xem hết, khác với cách hiển
// thị bên trang Xem mô phỏng/học sinh (examRender.tsx) là ảnh co giãn theo
// đúng % bề rộng khung chứa. Tham số `scale` giờ luôn cố định = 100 (thanh
// trượt zoom đã bị bỏ — xem ghi chú ở nơi gọi), nên bỏ hẳn phần đo
// naturalWidth/state/useEffect (không còn cần thiết) và thay bằng CSS
// responsive y hệt examRender.tsx: width 100% (co theo khung), maxWidth 420
// (không phóng to quá cỡ ảnh gốc/quá cần thiết), height auto.
// SỬA (yêu cầu 23-7 lần 4: "để ngang màn hình thì ảnh không co dãn, dùng
// kích thước ảnh gốc") — width:'100%' vẫn ép ảnh nở khớp bề ngang khung kể
// cả khi khung rộng hơn kích thước thật của ảnh (đề xoay ngang / màn hình
// to) -> ảnh bị phóng to quá cỡ gốc. Đổi width:'100%' -> 'auto' +
// maxWidth:'min(420px, 100%)' (đồng bộ examRender.tsx): ảnh hiển thị đúng
// kích thước gốc, chỉ co nhỏ khi khung hẹp hơn ảnh hoặc ảnh vượt trần 420px.
function HardImageZoom({ src, alt }: { src: string; alt: string }) {
  // SỬA (26-7, theo yêu cầu người dùng): ảnh PNG/JPG KHÔNG áp dụng thanh
  // trượt "Cỡ hình" — lý do và logic giống hệt renderImageOrTikzToken
  // trong examRender.tsx (nhánh HÌNH_FILE): ảnh raster phóng to quá độ
  // phân giải gốc sẽ mờ/vỡ hạt, khác với TikZ (vector). Quay lại đúng v28.
  return (
    <div className="w-full flex justify-center min-w-0">
      <img
        src={src}
        alt={alt}
        className="h-auto rounded border border-gray-200"
        style={{ width: 'auto', maxWidth: 'min(420px, calc(100vmin - 2rem))', height: 'auto' }}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

// Nhiều đề bọc khối bảng trong $$ ... $$ (hoặc $ ... $) chỉ để canh giữa ở
// chế độ hiển thị công thức — sau khi khối bảng đã bị tách ra render thành
// bảng HTML riêng, cặp $$/$ bao quanh đó không còn gì bên trong để ghép cặp
// nữa nên trở thành RÁC (hiện lỗi ngay bên trên/dưới bảng). Hàm này "nuốt"
// luôn cặp $$ hoặc $ liền kề khối bảng (cách nhau chỉ bởi khoảng trắng) vào
// vùng bị cắt bỏ.
function eatSurroundingDollars(text: string, start: number, end: number) {
  let newStart = start;
  {
    let j = newStart;
    while (j > 0 && /\s/.test(text[j - 1])) j--;
    if (text.slice(Math.max(0, j - 2), j) === '$$') newStart = j - 2;
    else if (j > 0 && text[j - 1] === '$') newStart = j - 1;
  }
  let newEnd = end;
  {
    let j = newEnd;
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text.slice(j, j + 2) === '$$') newEnd = j + 2;
    else if (text[j] === '$') newEnd = j + 1;
  }
  return { start: newStart, end: newEnd };
}

// Dò các khối bảng \begin{array}{...}...\end{...} / \begin{tabular}{...}...\end{...}
// bằng cách ĐẾM ĐỘ SÂU begin/end của cả 2 loại môi trường cùng lúc — vì các
// đề bị lỗi trích xuất có thể đóng khối NGOÀI CÙNG bằng \end{array} HOẶC
// \end{tabular} tuỳ lần sửa, không cố định. Chỉ cần bắt đúng cặp begin/end
// khớp độ sâu là lấy được trọn khối, bất kể trong đó lồng bao nhiêu tầng.
function extractEnvBlocks(text: string) {
  const blocks: { start: number; end: number; text: string }[] = [];
  // CHỈ khớp tới dấu "{" MỞ colspec (không cố khớp trọn "{...}") — vì colspec
  // của gói "array" có thể chứa ngoặc nhọn LỒNG bên trong (vd
  // ">{\arraybackslash}m{1.2cm}"), regex "{[^}]*}" cũ sẽ dừng sai ở dấu "}"
  // đầu tiên gặp được. Vòng lặp bên dưới chỉ cần .index của \begin để xác
  // định blockStart nên không cần khớp trọn colspec ở đây.
  const startRegex = /\\begin\{(?:array|tabular)\}\{/g;
  let m: RegExpExecArray | null;
  while ((m = startRegex.exec(text))) {
    const blockStart = m.index;
    const envRegex = /\\(begin|end)\{(?:array|tabular)\}(?:\{[^}]*\})?/g;
    envRegex.lastIndex = startRegex.lastIndex;
    let depth = 1;
    let blockEnd = -1;
    let em: RegExpExecArray | null;
    while ((em = envRegex.exec(text))) {
      depth += em[1] === 'begin' ? 1 : -1;
      if (depth === 0) {
        blockEnd = envRegex.lastIndex;
        break;
      }
    }
    if (blockEnd === -1) {
      // Không tìm được điểm đóng khớp — bỏ qua, coi như không phải bảng.
      startRegex.lastIndex = blockStart + 1;
      continue;
    }
    const expanded = eatSurroundingDollars(text, blockStart, blockEnd);
    blocks.push({ start: expanded.start, end: expanded.end, text: text.slice(blockStart, blockEnd) });
    startRegex.lastIndex = blockEnd; // tiếp tục tìm SAU khối vừa lấy, bỏ qua phần lồng bên trong
  }
  // Chỉ giữ lại khối THỰC SỰ LÀ BẢNG: có \hline. Mảng/ma trận/hệ phương
  // trình Toán bình thường (\begin{array}{cc}...\end{array} cho hệ pt,
  // \begin{cases}...) không dùng \hline nên không bị ảnh hưởng.
  return blocks.filter((b) => b.text.includes('\\hline'));
}

// Dọn nội dung 1 ô: gỡ khối tabular/array lồng bên trong (ô tiêu đề nhiều
// dòng như "Giá trị đại" + "diện"), gỡ dấu ngoặc nhọn bọc ngoài kiểu
// "{[75; 78,3)}", rồi gộp khoảng trắng/xuống dòng thừa lại thành 1 dòng.
function cleanTableCell(raw: string): string {
  let s = sanitizeMathMacros(raw);
  // Gỡ khối tabular/array LỒNG bên trong 1 ô (ví dụ ô tiêu đề nhiều dòng).
  // TRƯỚC ĐÂY dùng regex "{[^}]*}" cho colspec -> lỗi với colspec chứa ngoặc
  // nhọn LỒNG bên trong kiểu ">{\arraybackslash}m{1.2cm}" (xem giải thích
  // chi tiết tại stripLeadingTableEnv trong textUtils.ts), làm rò rỉ phần
  // đuôi colspec ra ngoài thành chữ rác. Quét thủ công đếm độ sâu ngoặc để
  // bắt đúng toàn bộ colspec rồi mới tìm \end{array}/\end{tabular} theo sau
  // (không đòi hỏi khớp tên với \begin, vì đề gốc hay đóng lệch tên).
  s = (function stripNestedTableWrappers(input: string): string {
    let out = input;
    for (let guard = 0; guard < 50; guard++) {
      const m = out.match(/\\begin\{(array|tabular)\}\s*\{/);
      if (!m || m.index === undefined) break;
      const before = out.slice(0, m.index);
      const fromBegin = out.slice(m.index);
      const afterOpenTag = stripLeadingTableEnv(fromBegin);
      const consumedLen = fromBegin.length - afterOpenTag.length;
      if (consumedLen <= 0) break; // an toàn, tránh vòng lặp vô hạn
      const endMatch = afterOpenTag.match(/\\end\{(array|tabular)\}/);
      if (!endMatch || endMatch.index === undefined) {
        out = before + afterOpenTag;
        break;
      }
      const body = afterOpenTag.slice(0, endMatch.index);
      const afterEnd = afterOpenTag.slice(endMatch.index + endMatch[0].length);
      out = before + body + afterEnd;
    }
    return out;
  })(s);
  s = s.replace(/\\hline/g, '');
  // SỬA (khiếu nại: "bảng hiện rác \\cline{2-7}/\\multirow{2}{*}{...}"):
  // 2 lệnh này (gói LaTeX multirow/array, dùng kẻ ngang 1 đoạn cột và gộp ô
  // dọc khi in PDF) không có nghĩa gì trên web — xoá \cline hẳn (giống
  // \hline), còn \multirow thì bóc vỏ giữ lại đúng nội dung bên trong (đối
  // số thứ 3), bỏ số dòng gộp/độ rộng vì HTML <table> ở đây không hỗ trợ
  // rowspan qua cách này.
  s = s.replace(/\\cline\{[^{}]*\}/g, '');
  s = s.replace(/\\multirow\{[^{}]*\}\{[^{}]*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
  // Cac lenh chi co tac dung TRINH BAY khi bien dich PDF (to mau nen o/hang,
  // dinh nghia lai lenh...) khong co y nghia gi khi render tren web bang
  // KaTeX -> phai loai bo han, neu khong se in tho "\rowcolor{gray!20}" ra
  // ngoai o bang. Xoa TRUOC khi xu ly "\\" xuong dong o duoi.
  s = s.replace(/\\rowcolor(?:\[[^\]]*\])?\{[^}]*\}/g, '');
  s = s.replace(/\\cellcolor(?:\[[^\]]*\])?\{[^}]*\}/g, '');
  s = s.replace(/\\columncolor(?:\[[^\]]*\])?\{[^}]*\}/g, '');
  s = s.replace(/\\renewcommand\s*(?:\{\\[a-zA-Z]+\}|\\[a-zA-Z]+)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '');
  // THÊM MỚI (mục 3): các lệnh chỉ có ý nghĩa khi in PDF khác cũng hay lọt
  // vào ô bảng (đề gốc dùng \break để gợi ý ngắt trang giữa các dòng dài
  // trong bảng thống kê) — không có ý nghĩa trên web, xoá hẳn giống \hline.
  s = s.replace(/\\break\b/g, ' ');
  s = s.replace(/\\allowdisplaybreaks\b/g, '');
  s = s.replace(/\\noindent\b/g, '');
  // "\\" la ky hieu xuong dong LaTeX ben trong 1 o nhieu dong (vd "Gia tri
  // dai\\ dien") -> doi thanh khoang trang de gop lai thanh 1 cum, khong phai
  // xoa trang han (neu khong 2 tu se dinh lien nhau).
  s = s.replace(/\\\\/g, ' ');
  s = s.trim();
  if (/^\{[\s\S]*\}$/.test(s)) s = s.slice(1, -1).trim();
  s = s.replace(/\s+/g, ' ').trim();
  // Neu sau khi don van con cu phap Toan/LaTeX tho (lenh \..., dau ngoac
  // nhon thoat \{ \}, chi so tren/duoi ^ _) thi boc CA O trong $...$ de
  // <Latex> (react-latex-next/KaTeX) nhan va render dung thay vi in tho
  // backslash ra ngoai -- vd "\textbf{Cap chan}" hoac "\{2;4\}" hoac
  // "1 \cdot 1 \cdot 3 = 3". \textbf/\textit van hoat dong binh thuong
  // trong moi truong Toan cua KaTeX ke ca voi tieng Viet co dau ben trong.
  // Bổ sung "\{"/"\}" TRẦN (không cần dấu \ phía trước) vào điều kiện — tác
  // giả hay viết dấu phẩy thập phân sát số kiểu "0{,}5" (để LaTeX/KaTeX
  // không hiểu nhầm dấu phẩy), trước đây KHÔNG match điều kiện cũ (chỉ nhận
  // ngoặc nhọn ĐÃ escape "\{"/"\}") nên các ô như "[0{,}5;2{,}5)" không được
  // bọc "$...$", hiển thị lộ nguyên cặp ngoặc nhọn ra màn hình.
  if (s && !/^\$[\s\S]*\$$/.test(s) && /\\[a-zA-Z]+|\^|_|\{|\}/.test(s)) {
    s = `$${s}$`;
  }
  return s;
}

// BUG ĐÃ SỬA (đồng bộ với src/lib/textUtils.ts): hàm cũ chỉ tách hàng theo
// `\hline`, nhưng LaTeX thật sự dùng `\\` để kết thúc MỖI hàng — `\hline`
// chỉ là đường kẻ ngang, không bắt buộc có giữa mọi hàng. Khi bảng chỉ kẻ
// viền ngoài + dưới header (các hàng dữ liệu giữa chỉ cách nhau bằng `\\`),
// nhiều hàng bị dính làm một chuỗi -> split theo `&` sinh lệch cột, chữ dính
// vào nhau (ví dụ "n1{[a2;a3)}", "n2..."). Sửa: tách theo CẢ `\hline` LẪN
// `\\`, chỉ tách ở cấp ngoài cùng (depth 0) để không tách nhầm nếu một ô lỡ
// chứa `{...}` có `\\` bên trong.
function splitTopLevel(str: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth <= 0 && str.startsWith(delimiter, i)) {
      parts.push(current);
      current = '';
      i += delimiter.length - 1;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

// Tách khối bảng thành mảng các hàng, mỗi hàng là mảng ô { text, colSpan }.
function parseLatexStatTable(block: string) {
  // TRƯỚC ĐÂY dùng regex "{[^}]*}" để gỡ colspec ở đầu khối — lỗi với colspec
  // chứa ngoặc nhọn lồng bên trong (ví dụ ">{\arraybackslash}m{1.2cm}"). Dùng
  // stripLeadingTableEnv (đếm độ sâu ngoặc) để gỡ đúng toàn bộ colspec, tránh
  // để sót phần đuôi colspec làm hàng đầu tiên hiển thị thành chữ rác.
  const inner = stripLeadingTableEnv(block)
    .replace(/\\end\{(?:array|tabular)\}\s*$/, '');

  const rows = splitTopLevel(inner, '\\hline')
    .flatMap((segment) => splitTopLevel(segment, '\\\\'))
    .map((r) => r.trim())
    .filter(Boolean);

  return rows
    .map((row) => {
      const rawCells = row.split('&');
      // BUG ĐÃ SỬA (đồng bộ với src/lib/textUtils.ts): trước đây lọc bỏ MỌI
      // ô rỗng (`.filter((c) => c.text !== '')`) ngay sau khi map — nhưng ô
      // rỗng có ý nghĩa VỊ TRÍ (ví dụ hàng cuối `& & n=n_1+...+n_m` cố ý để
      // trống 2 ô đầu, nội dung nằm ở cột 3). Lọc kiểu đó xóa mất 2 ô trống,
      // khiến ô có nội dung bị đẩy lùi về cột 1. Sửa: GIỮ nguyên ô rỗng để
      // bảo toàn vị trí cột, chỉ bỏ hẳn HÀNG nào toàn bộ các ô đều rỗng.
      const cells = rawCells.map((raw) => {
        const trimmed = raw.trim().replace(/\\\\\s*$/, '').trim();
        const mc = trimmed.match(/^\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/);
        if (mc) {
          return { text: cleanTableCell(mc[2]), colSpan: Number(mc[1]) };
        }
        return { text: cleanTableCell(trimmed), colSpan: 1 };
      });
      return cells;
    })
    .filter((row) => row.some((c) => c.text !== ''));
}

// Hàng được coi là hàng DỮ LIỆU nếu có ít nhất 1 ô dạng khoảng [a; b) — còn
// lại (tên nhóm/cột tiêu đề) coi là hàng tiêu đề, in đậm + nền xám nhạt.
// SỬA LỖI (khiếu nại: "canh lề bị lỗi khi xuất PDF"): TRƯỚC ĐÂY bọc bảng
// trong div overflow-x-auto — có tác dụng trên MÀN HÌNH (cuộn ngang xem hết)
// nhưng khi in/xuất PDF trình duyệt không tạo thanh cuộn, nên phần bảng vượt
// khổ giấy bị CẮT MẤT (đúng lỗi trong ảnh chụp: bảng AQI bị cụt sau cột
// "[150;200)"). Đổi sang FitWidthBlock (dùng chung với trang học sinh, xem
// src/lib/examRender.tsx) — tự đo và thu nhỏ bảng vừa khít khổ giấy khi cần,
// không bao giờ bị cắt mất cột nào nữa, dùng chung cho cả xem trước lẫn in.
function LatexStatTable({ block }: { block: string }) {
  const rows = useMemo(() => parseLatexStatTable(block), [block]);
  if (rows.length === 0) return null;
  // GHI CHÚ CHO AI/DEV SAU: nếu giảm my-1/my-0 bên dưới về 0 mà bảng
  // vẫn "trông" to/thoáng — thủ phạm là padding cứng trên <td> (paddingTop/
  // paddingBottom: 10px, paddingLeft/paddingRight: 20px, xem bên dưới),
  // KHÔNG liên quan margin ngoài này. Giải thích đầy đủ (kèm cả nguồn gây
  // khoảng trắng quanh hình TikZ) đặt tại LatexStatTable trong
  // src/lib/examRender.tsx — đọc ở đó trước khi sửa thêm.
  // SỬA (đồng bộ với examRender.tsx): my-3 (12px) -> my-1 (4px) -> nay giảm
  // tiếp xuống 1.6px (arbitrary value my-0, không có sẵn trong thang
  // đo mặc định của Tailwind) theo yêu cầu giảm khoảng cách chung.
  // SỬA LỖI (khiếu nại: bảng đè lên dòng văn bản/câu hỏi ngay bên dưới nó) —
  // đồng bộ với src/lib/examRender.tsx: my-0 -> mt-0 mb-3 (12px) bị phản ánh
  // rộng quá -> giảm còn mt-0 mb-1 (4px), vừa đủ để không đè lên chữ nữa.
  return (
    // SỬA (khiếu nại: "viền ngang trên cùng của bảng bị mất/cắt cụt") —
    // ĐỒNG BỘ với src/lib/examRender.tsx LatexStatTable, xem giải thích đầy
    // đủ ở đó (overflow-x-auto ép overflow-y thành 'auto', viền vẽ sát mép
    // clip bị cắt/mờ do subpixel). pt-0.5 đệm ra khỏi mép clip.
    <FitWidthBlock className="mt-0 mb-1 pt-0.5">
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
                    // TRƯỚC ĐÂY "px-5 py-2.5" khiến các ô có nội dung ngắn (vd
                    // "{1}", "{3;5}") bị bó rất hẹp, đặc biệt khi nhiều cột
                    // đứng cạnh nhau (bảng thống kê 4-5 cột) -> nhìn chật chội,
                    // khó đọc trên màn hình rộng. Tăng đệm ngang/dọc và đặt
                    // min-width cho mỗi ô để bảng dàn đều, thoáng hơn, đồng
                    // thời vẫn giữ whitespace-nowrap để công thức KaTeX không
                    // bị ngắt dòng giữa chừng.
                    // BỎ min-width CỐ ĐỊNH: mỗi ô giờ tự co giãn theo đúng độ
                    // dài nội dung bên trong (không còn ép mọi ô tối thiểu
                    // 150px khiến ô ngắn bị thừa khoảng trắng vô lý so với ô
                    // dài) — bề rộng ô = nội dung + padding ngang.
                    // SỬA (khiếu nại 21-7: "khoảng đệm trái phải khá rộng"):
                    // paddingLeft/paddingRight 20px -> 12px, vừa đủ để chữ
                    // không dính sát viền mà không còn thoáng quá mức như
                    // trước. paddingTop/paddingBottom giữ 10px. ĐỒNG BỘ với
                    // src/lib/examRender.tsx (trang bài làm thật của HS).
                    // SỬA TIẾP (khiếu nại: "bảng vẫn to, xem kiểu Azota gọn
                    // hơn nhiều"): giảm thêm padding 12/10 -> 8/6 VÀ giảm cỡ
                    // chữ 15px -> 13px (text-[15px] -> text-[13px] ở <table>
                    // phía trên). Đây là 2 nguồn kích thước còn lại ngoài
                    // margin ngoài (my/mt/mb) — xem ghi chú tổng hợp phía
                    // trên component LatexStatTable. ĐỒNG BỘ với
                    // src/lib/examRender.tsx.
                    // SỬA LỖI (viền dọc mép trái ngoài cùng bị mờ/khuất khi
                    // bảng bị FitWidthBlock scale 0.7 lúc tràn màn hình —
                    // xem giải thích chi tiết ở src/lib/examRender.tsx, bản
                    // sao đầy đủ ghi chú của component này): border 1px sau
                    // khi nhân 0.7 chỉ còn ~0.7px, dưới 1 device-pixel nên bị
                    // trình duyệt anti-alias mờ gần như biến mất, đặc biệt
                    // rõ ở mép trái cùng (giáp thẳng nền trắng). Tăng độ dày
                    // 1px -> 1.5px + đậm màu hơn 1 bậc (gray-400 -> gray-500)
                    // để sau scale còn ~1.05px, đủ để trình duyệt vẽ gần như
                    // 1 device-pixel đặc. ĐỒNG BỘ với src/lib/examRender.tsx.
                    // GHI CHÚ (28-7): FitWidthBlock đã bỏ scale-khi-xem-màn-
                    // hình (chỉ còn scale lúc in) — xem lịch sử ở
                    // src/lib/examRender.tsx. borderWidth 1.5/gray-500 vẫn
                    // giữ nguyên (không cần đổi lại), chỉ không còn bị mờ do
                    // scale khi xem trên màn hình nữa.
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

// =====================================================================
// PARSER MỚI CHO ĐỊNH DẠNG MARKDOWN (dạng AI sinh câu hỏi theo mẫu
// "**Phần I. ...** / **Câu 1:** ... / **Lời giải:** ... / **Chọn** A").
// ĐÂY LÀ PHẦN THÊM MỚI — không đụng đến parser.ts hay luồng xử lý file
// .tex cũ. Kết quả trả về CÙNG CẤU TRÚC JSON với parseLatexToJSON (để
// page.tsx dùng lại y nguyên UI hiện có), nên chỉ cần chọn đúng parser lúc
// upload là toàn bộ phần hiển thị/biên dịch TikZ/sửa code... vẫn hoạt động
// bình thường không cần sửa gì thêm.
// =====================================================================

type MdOption = { text: string; isCorrect: boolean };
type MdQuestion = {
  id: string;
  label: string;
  code: string;
  content: string;
  options?: MdOption[];
  solution?: string;
  // THÊM MỚI: đáp số riêng của câu Trả lời ngắn (Phần III), tách khỏi
  // solution để hiển thị thành ô vuông riêng thay vì gộp vào cuối lời giải.
  answer?: string;
};

// Tách toàn bộ khối \begin{tikzpicture}...\end{tikzpicture} ra khỏi văn bản,
// thay bằng mốc [[HÌNH_TIKZ_n]] giống hệt cơ chế của parser .tex cũ, để dùng
// chung được renderWithTikZ/svgMap/tikzSourceMap hiện có.
//
// SỬA LỖI TIKZ-TRONG-TIKZ: trước đây dùng regex non-greedy
// /\begin{tikzpicture}[\s\S]*?\end{tikzpicture}/, nên khi bên trong một khối
// tikzpicture lại có một \begin{tikzpicture}...\end{tikzpicture} LỒNG NHAU
// (ví dụ vẽ hình phụ trong node), regex dừng ở \end{tikzpicture} ĐẦU TIÊN gặp
// được — là end của khối con, không phải khối cha — cắt cụt khối cha, để lại
// phần đuôi ("};" và "\end{tikzpicture}" còn sót) rớt ra thành text thô.
// BÂY GIỜ: đếm ĐỘ SÂU begin/end để luôn bắt đúng cặp ngoài cùng.
function extractTikzMarkdown(text: string, tikzList: { id: string; code: string }[], counter: { n: number }) {
  const beginTag = '\\begin{tikzpicture}';
  const endTag = '\\end{tikzpicture}';
  let result = '';
  let i = 0;

  while (i < text.length) {
    const startIdx = text.indexOf(beginTag, i);
    if (startIdx === -1) {
      result += text.slice(i);
      break;
    }
    result += text.slice(i, startIdx);

    let depth = 1;
    let cursor = startIdx + beginTag.length;
    while (depth > 0) {
      const nextBegin = text.indexOf(beginTag, cursor);
      const nextEnd = text.indexOf(endTag, cursor);
      if (nextEnd === -1) {
        // Không cân bằng (thiếu \end) — lấy hết phần còn lại để tránh vòng lặp vô hạn.
        cursor = text.length;
        break;
      }
      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth++;
        cursor = nextBegin + beginTag.length;
      } else {
        depth--;
        cursor = nextEnd + endTag.length;
      }
    }

    counter.n += 1;
    const id = `[[HÌNH_TIKZ_${counter.n}]]`;
    tikzList.push({ id, code: text.slice(startIdx, cursor) });
    result += id;
    i = cursor;
  }

  return result;
}

// Cắt TOÀN BỘ văn bản thành từng câu theo mốc "**Câu N:**" hoặc "**Bài N:**",
// KHÔNG phụ thuộc câu đó đang nằm dưới tiêu đề "Phần" nào — thay cho cặp
// splitMarkdownSections/splitMarkdownQuestions cũ (tách theo VỊ TRÍ dưới tiêu
// đề Phần I/II/III/IV). Lý do đổi: nếu 1 câu bị gõ thiếu/sai tiêu đề Phần bao
// quanh, hoặc nằm lộn vị trí, cách cũ vẫn ép nó theo parser cố định của đúng
// vị trí đó -> dễ mất câu. Cách mới gom hết câu trước, việc PHÂN LOẠI dựa vào
// classifyMarkdownQuestionType (xem bên dưới) — dựa vào dấu hiệu thực sự có
// trong chính câu đó, không dựa vào vị trí.
function splitAllMarkdownQuestions(text: string) {
  const regex = /\*\*(Câu|Bài)\s*(\d+)\s*[:.]?\*\*/g;
  const found: { marker: 'Câu' | 'Bài'; num: string; bodyStart: number; headerStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text))) {
    found.push({ marker: m[1] as 'Câu' | 'Bài', num: m[2], bodyStart: regex.lastIndex, headerStart: m.index });
  }
  return found.map((f, i) => {
    const end = i + 1 < found.length ? found[i + 1].headerStart : text.length;
    const rawBody = text.slice(f.bodyStart, end);
    // QUAN TRỌNG: vì tách CHỈ dựa vào mốc "**Câu N:**"/"**Bài N:**" (không
    // dựa vào tiêu đề "Phần" nữa), dòng tiêu đề markdown "# Phần II. ..."
    // đứng NGAY TRƯỚC câu kế tiếp sẽ rơi vào ĐUÔI thân câu HIỆN TẠI (vì thân
    // câu được cắt tới tận điểm bắt đầu mốc Câu/Bài tiếp theo, mà tiêu đề
    // Phần lại nằm trước đó). Nếu không lọc, tiêu đề này bị "dính" vào cuối
    // nội dung/lời giải/đáp số của câu trước và hiện ra thô ngoài giao diện.
    // Xoá sạch MỌI dòng bắt đầu bằng 1-6 dấu "#" (heading markdown), bất kể
    // nằm ở đầu, giữa hay cuối thân câu.
    const body = rawBody.replace(/^[ \t]*#{1,6}[^\n]*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    return { marker: f.marker, num: f.num, body };
  });
}

// Phân loại 1 câu hỏi dựa vào DẤU HIỆU THỰC SỰ có trong chính nội dung câu đó
// (giống triết lý detectQuestionType của parser.ts cho định dạng .tex cũ):
//   - có đủ 4 phương án "A." "B." "C." "D." (chữ HOA + dấu chấm) -> Trắc nghiệm
//   - có đủ 4 ý "a)" "b)" "c)" "d)" (chữ thường + dấu ngoặc)     -> Đúng/Sai
//   - có nhãn "**Đáp số**"                                       -> Trả lời ngắn
//   - không khớp dấu hiệu nào ở trên                             -> Tự luận
function classifyMarkdownQuestionType(body: string): 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' {
  const hasABCD = /\n\s*A\.[\s\S]*\n\s*B\.[\s\S]*\n\s*C\.[\s\S]*\n\s*D\./.test('\n' + body);
  if (hasABCD) return 'multiple_choice';

  const hasLowerAbcd = /\n\s*a\)[\s\S]*\n\s*b\)[\s\S]*\n\s*c\)[\s\S]*\n\s*d\)/.test('\n' + body);
  if (hasLowerAbcd) return 'true_false';

  if (/\*\*Đáp số/.test(body)) return 'short_answer';

  return 'essay';
}

// Phần I: trắc nghiệm 4 phương án A/B/C/D + "**Chọn** X".
function parseMdPartI(body: string, num: string): MdQuestion | null {
  const re = /^([\s\S]*?)\n\s*A\.\s*([\s\S]*?)\n\s*B\.\s*([\s\S]*?)\n\s*C\.\s*([\s\S]*?)\n\s*D\.\s*([\s\S]*?)\n\s*\*\*Lời giải\s*:?\*\*:?\s*([\s\S]*?)\n\s*\*\*Chọn\s*:?\*\*:?\s*([ABCD])/;
  const m = body.match(re);
  if (!m) return null;
  const [, content, a, b, c, d, solution, chosen] = m;
  const letters = ['A', 'B', 'C', 'D'];
  const texts = [a, b, c, d];
  return {
    id: `md-p1-c${num}`,
    label: 'Câu',
    code: `P1.${num}`,
    content: content.trim(),
    options: texts.map((t, i) => ({ text: t.trim(), isCorrect: letters[i] === chosen })),
    solution: solution.trim(),
  };
}

// Phần II: đúng/sai 4 ý a/b/c/d + "**Đáp án**: a) Đúng, b) Sai, ..."
function parseMdPartII(body: string, num: string): MdQuestion | null {
  const re = /^([\s\S]*?)\n\s*a\)\s*([\s\S]*?)\n\s*b\)\s*([\s\S]*?)\n\s*c\)\s*([\s\S]*?)\n\s*d\)\s*([\s\S]*?)\n\s*\*\*Lời giải\s*:?\*\*:?\s*([\s\S]*?)\n\s*\*\*Đáp án\s*:?\*\*:?\s*([\s\S]*)$/;
  const m = body.match(re);
  if (!m) return null;
  const [, content, a, b, c, d, solution, answerLine] = m;
  const letters = ['a', 'b', 'c', 'd'];
  const texts = [a, b, c, d];
  const options: MdOption[] = texts.map((t, i) => {
    const letter = letters[i];
    const am = answerLine.match(new RegExp(`${letter}\\)\\s*(Đúng|Sai)`, 'i'));
    const isCorrect = !!am && /đúng/i.test(am[1]);
    return { text: t.trim(), isCorrect };
  });
  return {
    id: `md-p2-c${num}`,
    label: 'Câu',
    code: `P2.${num}`,
    content: content.trim(),
    options,
    solution: solution.trim(),
  };
}

// Phần III: trả lời ngắn — content + lời giải + "**Đáp số:**" tách RIÊNG ra
// field `answer` (không gộp vào cuối solution nữa) để giao diện hiển thị
// thành ô vuông đáp số riêng ở góc dưới trái của đề, phía trên nhãn "Lời giải".
function parseMdPartIII(body: string, num: string): MdQuestion | null {
  const re = /^([\s\S]*?)\n\s*\*\*Lời giải\s*:?\*\*:?\s*([\s\S]*?)\n\s*\*\*Đáp số\s*:?\*\*:?\s*([\s\S]*)$/;
  const m = body.match(re);
  if (!m) return null;
  const [, content, solution, answer] = m;
  return {
    id: `md-p3-c${num}`,
    label: 'Câu',
    code: `P3.${num}`,
    content: content.trim(),
    solution: solution.trim(),
    answer: extractAnswerDigits(answer.trim()),
  };
}

// Phần IV: tự luận — content + lời giải, không có cấu trúc cố định bên
// trong nên chỉ cắt tại mốc "**Lời giải:**" đầu tiên.
function parseMdPartIV(body: string, num: string): MdQuestion | null {
  const re = /\*\*Lời giải\s*:?\*\*:?/;
  const m = body.match(re);
  if (!m || m.index === undefined) return null;
  const content = body.slice(0, m.index).trim();
  const solution = body.slice(m.index + m[0].length).trim();
  return {
    id: `md-p4-b${num}`,
    label: 'Bài',
    code: `P4.${num}`,
    content,
    solution,
  };
}

// Fallback DÙNG CHUNG cho mọi loại: nếu parser riêng của loại đã phân loại
// (Trắc nghiệm/Đúng-sai/Trả lời ngắn) vẫn KHÔNG khớp được 100% cấu trúc mong
// đợi (ví dụ đề gõ thiếu dòng "**Chọn**"/"**Đáp án**", sai định dạng đôi
// chỗ...), TRƯỚC ĐÂY câu đó bị trả về null rồi lọc bỏ -> MẤT HẲN không hiện ra
// đâu cả. BÂY GIỜ: luôn giữ lại câu hỏi bằng cách tách đơn giản tại mốc
// "**Lời giải:**" đầu tiên (nếu có) để lấy content/solution, không có thì lấy
// nguyên cả khối làm content — đảm bảo không câu nào biến mất khỏi kết quả.
function parseMdGenericFallback(body: string, num: string, marker: 'Câu' | 'Bài'): MdQuestion {
  const re = /\*\*Lời giải\s*:?\*\*:?/;
  const m = body.match(re);
  const content = m && m.index !== undefined ? body.slice(0, m.index).trim() : body.trim();
  const solution = m && m.index !== undefined ? body.slice(m.index + m[0].length).trim() : '';
  return {
    id: `md-fallback-${marker}${num}`,
    label: marker,
    code: `${marker === 'Câu' ? 'C' : 'B'}${num}`,
    content,
    solution,
  };
}

// Hàm chính — dùng khi file .tex/.txt upload lên có định dạng markdown mẫu
// (nhận diện qua tiêu đề "**Phần I."), thay vì định dạng .tex cũ.
function parseMarkdownExamToJSON(rawText: string) {
  const tikzList: { id: string; code: string }[] = [];
  const counter = { n: 0 };
  const text = extractTikzMarkdown(rawText, tikzList, counter);

  // THAY ĐỔI: gom TẤT CẢ câu hỏi trong toàn văn bản (không cần đúng nằm dưới
  // tiêu đề "Phần" nào), rồi phân loại từng câu dựa vào DẤU HIỆU THỰC SỰ có
  // trong chính nó (xem classifyMarkdownQuestionType). Nếu parser riêng của
  // loại đã phân loại vẫn không khớp được, rơi về fallback tổng quát để giữ
  // lại câu hỏi thay vì mất hẳn.
  const rawQuestions = splitAllMarkdownQuestions(text);

  const phan_1_TracNghiem: MdQuestion[] = [];
  const phan_2_DungSai: MdQuestion[] = [];
  const phan_3_TraLoiNgan: MdQuestion[] = [];
  const phan_4_TuLuan: MdQuestion[] = [];

  rawQuestions.forEach(({ marker, num, body }) => {
    const type = classifyMarkdownQuestionType(body);

    if (type === 'multiple_choice') {
      const q = parseMdPartI(body, num);
      phan_1_TracNghiem.push(q ?? parseMdGenericFallback(body, num, marker));
      return;
    }
    if (type === 'true_false') {
      const q = parseMdPartII(body, num);
      phan_2_DungSai.push(q ?? parseMdGenericFallback(body, num, marker));
      return;
    }
    if (type === 'short_answer') {
      const q = parseMdPartIII(body, num);
      phan_3_TraLoiNgan.push(q ?? parseMdGenericFallback(body, num, marker));
      return;
    }
    // essay (tự luận): thử parseMdPartIV trước (cắt tại "**Lời giải:**"),
    // không khớp vẫn giữ câu hỏi qua fallback tổng quát.
    const q = parseMdPartIV(body, num);
    phan_4_TuLuan.push(q ?? parseMdGenericFallback(body, num, marker));
  });

  return {
    phan_1_TracNghiem,
    phan_2_DungSai,
    phan_3_TraLoiNgan,
    phan_4_TuLuan,
    tikz_list: tikzList,
    thong_ke: {
      so_luong_tikz: tikzList.length,
      so_cau_phan_1: phan_1_TracNghiem.length,
      so_cau_phan_2: phan_2_DungSai.length,
      so_cau_phan_3: phan_3_TraLoiNgan.length,
      so_cau_phan_4: phan_4_TuLuan.length,
    },
  };
}

// Nhận diện: nếu file upload có tiêu đề "**Phần I." thì coi là định dạng
// markdown mới; ngược lại giữ nguyên hành vi cũ (đi qua parser.ts).
// TRƯỚC ĐÂY: chỉ nhận diện định dạng markdown khi có ĐÚNG tiêu đề in đậm
// "**Phần I."; nếu người dùng gõ tiêu đề dạng markdown heading "# Phần I."
// (dùng dấu # thay vì bọc **...**) thì bị coi là KHÔNG PHẢI markdown, rơi
// nhầm sang parser .tex cũ (parseLatexToJSON, vốn tìm \begin{ex}...\end{ex})
// -> không nhận ra câu hỏi nào cả.
// BÂY GIỜ: từ khi parseMarkdownExamToJSON đã đổi sang gom câu hỏi theo chính
// mốc "**Câu N:**"/"**Bài N:**" (không còn phụ thuộc tiêu đề "Phần" để tách),
// nhận diện định dạng cũng nên dựa đúng vào dấu hiệu ĐÓ — có ít nhất một mốc
// "**Câu N:**" hoặc "**Bài N:**" là đủ để coi là định dạng markdown mới, bất
// kể tiêu đề "Phần" phía trên viết theo kiểu nào (hoặc thậm chí không có).
function isMarkdownExamFormat(text: string) {
  return /\*\*(Câu|Bài)\s*\d+\s*[:.]?\*\*/.test(text);
}

// THÊM MỚI: dò các \includegraphics{...} NẰM BÊN TRONG một khối tikzpicture
// (khác với \includegraphics ngoài tikz mà parser.ts đã tách riêng thành mốc
// [[HÌNH_FILE_n]]). Trường hợp này server biên dịch KHÔNG có sẵn file ảnh
// trên đĩa để chèn -> cần gửi kèm dữ liệu ảnh (base64) theo tên file, xem
// buildEmbeddedImagesPayload + compileTikzWithFallback bên dưới. Trả về danh
// sách TÊN FILE (basename, đã bỏ trùng) để khớp với imageMap (khoá theo
// basename, giống cách ảnh ngoài tikz đang khớp).
function extractEmbeddedImageRefs(tikzCode: string): string[] {
  const names = new Set<string>();
  const re = /\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tikzCode))) {
    const base = m[1].trim().split('/').pop();
    if (base) names.add(base);
  }
  return Array.from(names);
}

// Chuyển 1 blob URL (tạo từ ảnh người dùng chọn trong thư mục ảnh, xem
// handleImageFolderSelect) sang chuỗi base64 THUẦN (không kèm tiền tố
// "data:...;base64,") để gửi kèm sang server biên dịch TikZ.
async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx !== -1 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Với danh sách tên ảnh (basename) mà 1 hình TikZ cần, tra trong imageMap
// (ảnh người dùng đã chọn từ thư mục ảnh) rồi build ra object
// { tenFile: base64 } để gửi kèm sang server — CHỈ gồm những ảnh THỰC SỰ tìm
// thấy; ảnh nào thiếu thì bỏ qua (giao diện tự hiển thị cảnh báo riêng dựa
// vào so sánh embeddedNames với imageMap, xem tikzMissingEmbeddedMap trong
// component chính — không chặn quá trình biên dịch chỉ vì thiếu 1 ảnh).
async function buildEmbeddedImagesPayload(
  names: string[],
  imageMap: Record<string, string>
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    names
      .filter((n) => imageMap[n])
      .map(async (n) => [n, await blobUrlToBase64(imageMap[n])] as const)
  );
  return Object.fromEntries(entries);
}

// THÊM MỚI: danh sách model Gemini cho phép chọn khi dùng AI sửa hình.
// Value gửi đúng lên API Gemini, label hiển thị cho người dùng.
const GEMINI_MODELS = [
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (mới nhất, mạnh & tiết kiệm token hơn)' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (mạnh hơn, hiểu yêu cầu tốt hơn)' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (nhanh, tiết kiệm)' },
];

// THÊM MỚI: gọi Gemini API để AI tự sửa mã TikZ dựa theo mô tả yêu cầu của
// người dùng. Chỉ gửi mã TikZ THUẦN (chưa bọc \documentclass...) + mô tả,
// yêu cầu model trả về DUY NHẤT mã TikZ đã sửa (không kèm giải thích, không
// bọc markdown) để có thể đưa thẳng vào ô textarea rồi biên dịch lại.
async function requestGeminiTikzEdit(
  apiKey: string,
  model: string,
  currentTikz: string,
  instruction: string
): Promise<string> {
  const prompt = `Bạn là trợ lý chỉnh sửa mã TikZ (LaTeX) dùng để vẽ hình minh hoạ cho đề thi.
Dưới đây là mã TikZ HIỆN TẠI (mã thuần, không có \\documentclass hay \\begin{document}):

\`\`\`
${currentTikz}
\`\`\`

Yêu cầu chỉnh sửa từ người dùng: "${instruction}"

Hãy sửa lại mã TikZ ở trên theo đúng yêu cầu, giữ nguyên các phần không liên quan.
CHỈ trả về mã TikZ đã sửa, KHÔNG kèm giải thích, KHÔNG bọc trong dấu \`\`\`, KHÔNG thêm \\documentclass/\\begin{document}/\\end{document}.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini API lỗi HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  if (!text.trim()) {
    throw new Error('Gemini không trả về nội dung nào (có thể bị chặn bởi bộ lọc an toàn).');
  }
  // Gemini đôi khi vẫn bọc kết quả trong ```...``` dù đã dặn không làm vậy —
  // dọn lại cho chắc trước khi đưa vào textarea.
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```\s*$/, '')
    .trim();
}

// THÊM MỚI: gọi Gemini với NHIỀU API key xoay vòng — bắt đầu từ `startIndex`
// (key dùng thành công gần nhất, để lần gọi sau không luôn dồn vào key #1).
// Với MỖI key: thử tối đa 3 lần liên tiếp nếu lỗi (đề phòng lỗi tạm thời như
// quá tải/timeout); hết 3 lần vẫn lỗi mới coi key đó "hỏng" và chuyển sang
// key kế tiếp trong danh sách. Trả về cả kết quả lẫn chỉ số key đã dùng
// thành công, để lần gọi sau tiếp tục đúng từ đó (round-robin thật sự).
async function requestGeminiTikzEditRotating(
  apiKeys: string[],
  startIndex: number,
  model: string,
  currentTikz: string,
  instruction: string
): Promise<{ text: string; usedIndex: number }> {
  const n = apiKeys.length;
  if (n === 0) throw new Error('Chưa có API key nào được lưu.');
  let lastError: any = null;
  for (let offset = 0; offset < n; offset++) {
    const idx = (startIndex + offset) % n;
    const key = apiKeys[idx];
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const text = await requestGeminiTikzEdit(key, model, currentTikz, instruction);
        return { text, usedIndex: idx };
      } catch (err) {
        lastError = err;
        console.warn(`Key #${idx + 1} (lần thử ${attempt}/3) lỗi:`, err);
      }
    }
    console.warn(`Key #${idx + 1} lỗi cả 3 lần, chuyển sang key kế tiếp...`);
  }
  throw new Error(
    `Đã thử hết ${n} key (mỗi key 3 lần) đều lỗi. Lỗi gần nhất: ${lastError?.message || String(lastError)}`
  );
}

async function compileTikzWithFallback(templateCode: string, images?: Record<string, string>) {
  for (let i = 0; i < TIKZ_ENDPOINTS.length; i++) {
    const url = TIKZ_ENDPOINTS[i];
    const controller = new AbortController();
    // SỬA: tăng từ 25s lên 40s/app (tổng tối đa ~80s nếu cả 2 app đều timeout)
    // — giảm khả năng bị abort oan khi 16 hình bắn cùng lúc làm server free
    // (1 worker) phải xếp hàng. Muốn chỉnh lại thời gian chờ thì sửa số
    // 40000 (đơn vị ms) ở đây.
    const timeoutId = setTimeout(() => controller.abort(), 40000);
    try {
      const body: Record<string, unknown> = { code: templateCode, engine: 'pdflatex' };
      // THÊM MỚI: gửi kèm ảnh cứng (base64) cho hình TikZ có \includegraphics
      // bên trong — THỬ NGHIỆM, chỉ máy chủ có hỗ trợ nhận field "images" mới
      // dùng được; máy chủ không hỗ trợ sẽ tự bỏ qua field lạ này (không ảnh
      // hưởng các hình TikZ bình thường không có ảnh cứng bên trong).
      if (images && Object.keys(images).length > 0) {
        body.images = images;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 429 || res.status === 503) {
        console.warn(`App ${i + 1} đang quá tải (HTTP ${res.status}), chuyển sang app dự phòng...`);
        continue;
      }

      const apiData = await res.json();
      if (apiData.success) return apiData;
      console.warn(`App ${i + 1} biên dịch thất bại:`, apiData.error || apiData);
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn(`App ${i + 1} không phản hồi kịp (có thể đang xếp hàng), chuyển sang app dự phòng...`, error);
    }
  }
  return null; // cả 2 app đều thất bại
}

// Component dùng chung cho 1 câu hỏi, tránh lặp lại 4 lần cấu trúc gần giống
// hệt nhau (Phần I/II/III/IV chỉ khác nhau ở cách hiển thị đáp án).
//
// QUAN TRỌNG — lý do tách ra NGOÀI Home: trước đây QuestionCard được khai báo
// BẰNG const bên TRONG thân hàm Home. Mỗi lần Home re-render (vd bấm mở lời
// giải 1 câu -> setOpenSolutions -> Home render lại), biến const QuestionCard
// được TẠO LẠI thành một *function reference mới hoàn toàn* — dù code bên
// trong giống hệt lần trước. Với React, component được coi là "component
// khác" khi type (function reference) đổi giữa 2 lần render, nên React
// UNMOUNT toàn bộ cây con cũ rồi MOUNT LẠI TỪ ĐẦU cây mới — với TOÀN BỘ 9 câu
// hỏi đang hiển thị trong tab, không chỉ câu vừa bấm. Hệ quả quan sát được:
// bấm mở lời giải câu 2..9 thì cả danh sách bị mount lại, và vì logic cuộn/
// focus của trang đang neo theo phần tử ĐẦU TIÊN trong DOM mới, cảm giác như
// "quay về câu 1". Đây KHÔNG liên quan gì đến id câu hỏi bị trùng.
//
// Cách sửa: đưa QuestionCard ra ngoài Home để nó chỉ được định nghĩa ĐÚNG MỘT
// LẦN khi module load — function reference không đổi giữa các lần Home
// re-render nữa, nên React nhận diện đúng đây là "cùng 1 component" và chỉ
// re-render (không unmount/mount lại) mỗi khi props đổi. Mọi state/hàm mà
// QuestionCard trước đây "mượn" trực tiếp từ closure của Home (editingId,
// openSolutions, draft, mounted, startEdit, cancelEdit, saveEdit,
// toggleSolution, renderWithTikZ...) giờ phải truyền vào tường minh qua props.
// Đáp số Phần III lấy từ \shortans{...} hoặc **Đáp số:** thường vẫn còn
// nguyên cú pháp LaTeX bao quanh, ví dụ "$0{,}5$" (viết vậy để KaTeX không
// hiểu nhầm dấu phẩy) hay "$-3$" — nếu in thẳng từng ký tự ra 4 ô vuông sẽ
// lẫn cả "$", "{", "}" rác. Hàm này CHỈ giữ lại chữ số 0-9, dấu "-", "+" và
// dấu phẩy thập phân ",", bỏ mọi ký tự LaTeX bao quanh khác (ví dụ
// "$0{,}5$" -> "0,5", "$-3$" -> "-3").
function extractAnswerDigits(text: string): string {
  if (!text) return '';
  return text.replace(/[^0-9+\-,]/g, '');
}

// Xáo trộn mảng theo thuật toán Fisher-Yates — trả về MẢNG MỚI, không sửa
// mảng gốc (để `data` gốc của giáo viên không bị đổi khi bật "trộn đề").
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// THÊM MỚI: soát lỗi đề thi trước khi cho phép "Xuất bản - Lấy link" (theo
// đúng tinh thần Azota — chặn xuất bản, chỉ đích danh câu nào lỗi). Hàm
// thuần, không đụng state, nhận `data` (đề đã bóc tách) + `tikzFailedMap`
// (id hình TikZ nào đang lỗi biên dịch) -> trả về mảng chuỗi lỗi, rỗng nghĩa
// là đề sạch, đủ điều kiện xuất bản.
function validateExamBeforePublish(
  data: any,
  tikzFailedMap: Record<string, string>,
  tikzPendingCount?: number
): string[] {
  const errors: string[] = [];
  if (!data) {
    errors.push('Chưa có đề thi nào để xuất bản.');
    return errors;
  }
  // SỬA LỖI (16 hình biên dịch xong nhưng chỉ add có 12): trước đây hàm này
  // chỉ chặn khi có hình LỖI (tikzFailedMap), không chặn khi vẫn còn hình
  // ĐANG biên dịch dở dang (chưa lỗi, cũng chưa xong) — nếu GV bấm Lưu/Xuất
  // bản đúng lúc đó, svgMap thiếu các hình chưa xong, đề được lưu thiếu hình
  // dù sau đó hình vẫn biên dịch xong bình thường trên màn hình (gây cảm
  // giác "đủ 16/16 mà sao bản lưu thiếu"). Giờ chặn cứng, bắt đợi xong hết.
  // SỬA LỖI (27-7, mở đề cũ báo đang biên dịch, kẹt nút Lưu/Xuất bản mãi):
  // trước đây tham số này là tikzProgress (bộ đếm rời rạc, dễ kẹt khi 1 lượt
  // gọi mạng không bao giờ resolve/reject). Giờ nhận thẳng tikzPendingCount —
  // số hình THẬT SỰ chưa có kết quả (chưa hiển thị được VÀ chưa bị đánh dấu
  // lỗi), tính trực tiếp từ svgMap/tikzImgUrlMap/tikzFailedMap nên luôn khớp
  // đúng những gì GV thấy trên màn hình, không tự kẹt do lỗi mạng vặt.
  if (typeof tikzPendingCount === 'number' && tikzPendingCount > 0) {
    errors.push(
      `Còn ${tikzPendingCount} hình vẽ chưa có kết quả (đang xử lý) — hãy đợi xử lý xong hết rồi mới lưu/xuất bản (nếu lưu lúc này, hình chưa xong sẽ bị thiếu trong bản lưu).`
    );
  }

  (data.phan_1_TracNghiem || []).forEach((q: any, i: number) => {
    if (!q.content || !q.content.trim()) {
      errors.push(`Câu ${i + 1} (Trắc nghiệm): thiếu nội dung câu hỏi.`);
    }
    const options = q.options || [];
    if (options.length < 2) {
      errors.push(`Câu ${i + 1} (Trắc nghiệm): thiếu phương án trả lời.`);
    } else {
      const correctCount = options.filter((o: any) => o.isCorrect).length;
      if (correctCount === 0) {
        errors.push(`Câu ${i + 1} (Trắc nghiệm): chưa có đáp án đúng.`);
      } else if (correctCount > 1) {
        errors.push(`Câu ${i + 1} (Trắc nghiệm): có nhiều hơn 1 đáp án đúng.`);
      }
    }
  });

  (data.phan_2_DungSai || []).forEach((q: any, i: number) => {
    if (!q.content || !q.content.trim()) {
      errors.push(`Câu ${i + 1} (Đúng/Sai): thiếu nội dung câu hỏi.`);
    }
    if (!q.options || q.options.length === 0) {
      errors.push(`Câu ${i + 1} (Đúng/Sai): thiếu các ý a) b) c) d).`);
    }
  });

  (data.phan_3_TraLoiNgan || []).forEach((q: any, i: number) => {
    if (!q.content || !q.content.trim()) {
      errors.push(`Câu ${i + 1} (Trả lời ngắn): thiếu nội dung câu hỏi.`);
    }
    if (!q.answer || !q.answer.trim()) {
      errors.push(`Câu ${i + 1} (Trả lời ngắn): chưa có đáp án mẫu.`);
    }
  });

  (data.phan_4_TuLuan || []).forEach((q: any, i: number) => {
    if (!q.content || !q.content.trim()) {
      errors.push(`Câu ${i + 1} (Tự luận): thiếu nội dung câu hỏi.`);
    }
  });

  const failedTikzIds = Object.keys(tikzFailedMap || {});
  if (failedTikzIds.length > 0) {
    errors.push(`Còn ${failedTikzIds.length} hình vẽ (TikZ) chưa biên dịch được — học sinh sẽ thấy hình lỗi.`);
  }

  return errors;
}


// SỬA LỖI CÓ SẴN: dòng khai báo hàm này bị thiếu trong bản export trước đó,
// khiến toàn bộ file lỗi cú pháp (không biên dịch được). Thêm lại đúng chữ ký
// khớp với 2 nơi đang gọi: buildLiveExamData(data, true) ở generateExamCodes
// và buildLiveExamData(data, examSettings.shuffle) lúc "Kích hoạt Phòng Thi".
// Trả về BẢN SAO của `data`, xáo trộn thứ tự câu/phương án nếu shuffle=true.
function buildLiveExamData(data: any, shuffle: boolean) {
  const clone = JSON.parse(JSON.stringify(data));
  if (!shuffle) return clone;
  // Phần I: trộn thứ tự câu + trộn luôn thứ tự phương án trong mỗi câu.
  if (Array.isArray(clone.phan_1_TracNghiem)) {
    clone.phan_1_TracNghiem = shuffleArray(clone.phan_1_TracNghiem).map((q: any) => ({
      ...q,
      options: Array.isArray(q.options) ? shuffleArray(q.options) : q.options,
    }));
  }
  // Phần II/III/IV: CHỈ trộn thứ tự câu, KHÔNG đụng vào thứ tự phương án
  // bên trong từng câu (giữ nguyên a/b/c/d gốc của Phần II).
  (['phan_2_DungSai', 'phan_3_TraLoiNgan', 'phan_4_TuLuan'] as const).forEach((key) => {
    if (Array.isArray(clone[key])) {
      clone[key] = shuffleArray(clone[key]);
    }
  });
  return clone;
}

// Sinh ra N "mã đề" (101, 102, 103, ...) từ đề gốc — mỗi mã đề gọi
// buildLiveExamData(data, true) ĐỘC LẬP (mỗi lần shuffleArray random lại từ
// đầu) nên các mã đề trộn khác nhau thật sự, không phải copy cùng 1 bản.
// count do giáo viên tự nhập (không cố định 4-5 mã) — chỉ cần >= 1.
function generateExamCodes(data: any, count: number) {
  const n = Math.max(1, Math.floor(count) || 1);
  const codes: { code: string; data: any }[] = [];
  for (let i = 0; i < n; i++) {
    codes.push({ code: String(101 + i), data: buildLiveExamData(data, true) });
  }
  return codes;
}

// ==========================================
// XUẤT PDF NHIỀU MÃ ĐỀ (in giấy, không cần database)
// ==========================================
// Mỗi mã đề gồm 2 phần khi in: (1) TRANG ĐỀ — y hệt học sinh cầm giấy làm
// bài, KHÔNG đánh dấu đáp án đúng; (2) TRANG ĐÁP ÁN riêng ở CUỐI cùng của
// TẤT CẢ các mã đề (để phát đề xong mới phát đáp án, không lẫn vào giữa).
// page-break-after đảm bảo mỗi mã đề bắt đầu ở trang giấy mới khi in.
function PrintExamCodePaper({
  code,
  data,
  renderWithTikZ,
  isLast,
}: {
  code: string;
  data: any;
  renderWithTikZ: (text: string) => any;
  isLast: boolean;
}) {
  return (
    <div
      className="w-[210mm] min-h-[297mm] bg-white mx-auto p-[18mm] print:shadow-none"
      style={{ pageBreakAfter: isLast ? 'auto' : 'always' }}
    >
      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-5">
        <div className="text-sm leading-relaxed">
          <p className="font-bold">ĐỀ KIỂM TRA</p>
          <p>Họ và tên: .......................................</p>
          <p>Lớp: ..................</p>
        </div>
        <div className="text-right">
          <p className="text-xs">Mã đề</p>
          <p className="text-3xl font-extrabold border-2 border-black px-4 py-1 rounded">{code}</p>
        </div>
      </div>

      {Array.isArray(data.phan_1_TracNghiem) && data.phan_1_TracNghiem.length > 0 && (
        <div className="mb-5">
          <p className="font-bold mb-2">PHẦN I. Trắc nghiệm (chọn 1 đáp án)</p>
          {data.phan_1_TracNghiem.map((q: any, i: number) => (
            <div key={q.id} className="mb-3 text-[14px] leading-relaxed">
              {/* SỬA LỖI: đổi <p> thành <div> — nội dung câu hỏi/phương án có
                  thể chứa bảng thống kê LaTeX (<table>/<div>), mà <p> không
                  được phép chứa thẻ khối, trình duyệt tự "vá" DOM khiến
                  React báo lỗi hydration (xem log lỗi thực tế đã gặp). */}
              <div className="font-semibold">Câu {i + 1}: {renderWithTikZ(q.content)}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 pl-2">
                {q.options.map((opt: any, oIdx: number) => (
                  <div key={oIdx}><span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(65 + oIdx)}.</span>{renderWithTikZ(opt.text)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(data.phan_2_DungSai) && data.phan_2_DungSai.length > 0 && (
        <div className="mb-5">
          <p className="font-bold mb-2">PHẦN II. Đúng / Sai</p>
          {data.phan_2_DungSai.map((q: any, i: number) => (
            <div key={q.id} className="mb-3 text-[14px] leading-relaxed">
              <div className="font-semibold">Câu {i + 1}: {renderWithTikZ(q.content)}</div>
              <div className="pl-2 mt-1">
                {q.options.map((opt: any, oIdx: number) => (
                  <div key={oIdx}><span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(97 + oIdx)})</span>{renderWithTikZ(opt.text)} <span className="inline-block ml-2">Đúng ☐ &nbsp; Sai ☐</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(data.phan_3_TraLoiNgan) && data.phan_3_TraLoiNgan.length > 0 && (
        <div className="mb-5">
          <p className="font-bold mb-2">PHẦN III. Trả lời ngắn</p>
          {data.phan_3_TraLoiNgan.map((q: any, i: number) => (
            <div key={q.id} className="mb-3 text-[14px] leading-relaxed">
              <div className="font-semibold">Câu {i + 1}: {renderWithTikZ(q.content)}</div>
              <p className="mt-1">Đáp số: <span className="inline-block border-b border-black w-28">&nbsp;</span></p>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(data.phan_4_TuLuan) && data.phan_4_TuLuan.length > 0 && (
        <div className="mb-5">
          <p className="font-bold mb-2">PHẦN IV. Tự luận</p>
          {data.phan_4_TuLuan.map((q: any, i: number) => (
            <div key={q.id} className="mb-3 text-[14px] leading-relaxed">
              <div className="font-semibold">Câu {i + 1}: {renderWithTikZ(q.content)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Trang đáp án riêng của 1 mã đề — luôn nằm ở CUỐI xấp giấy (giáo viên tách
// riêng phần này ra trước khi phát đề cho học sinh).
function PrintAnswerKeyPage({ code, data, isLast }: { code: string; data: any; isLast: boolean }) {
  return (
    <div
      className="w-[210mm] min-h-[297mm] bg-white mx-auto p-[18mm] print:shadow-none"
      style={{ pageBreakAfter: isLast ? 'auto' : 'always' }}
    >
      <p className="font-bold text-lg mb-4">ĐÁP ÁN — MÃ ĐỀ {code}</p>

      {Array.isArray(data.phan_1_TracNghiem) && data.phan_1_TracNghiem.length > 0 && (
        <div className="mb-4">
          <p className="font-bold mb-1">Phần I</p>
          <div className="grid grid-cols-6 gap-2 text-sm">
            {data.phan_1_TracNghiem.map((q: any, i: number) => {
              const correctIdx = q.options.findIndex((o: any) => o.isCorrect);
              return (
                <span key={q.id}>Câu {i + 1}: <b>{correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : '?'}</b></span>
              );
            })}
          </div>
        </div>
      )}

      {Array.isArray(data.phan_2_DungSai) && data.phan_2_DungSai.length > 0 && (
        <div className="mb-4">
          <p className="font-bold mb-1">Phần II</p>
          {data.phan_2_DungSai.map((q: any, i: number) => (
            <p key={q.id} className="text-sm">
              Câu {i + 1}: {q.options.map((o: any, oIdx: number) => (
                <span key={oIdx} className="mr-3">{String.fromCharCode(97 + oIdx)}) <b>{o.isCorrect ? 'Đ' : 'S'}</b></span>
              ))}
            </p>
          ))}
        </div>
      )}

      {Array.isArray(data.phan_3_TraLoiNgan) && data.phan_3_TraLoiNgan.length > 0 && (
        <div className="mb-4">
          <p className="font-bold mb-1">Phần III</p>
          <div className="grid grid-cols-4 gap-2 text-sm">
            {data.phan_3_TraLoiNgan.map((q: any, i: number) => (
              <span key={q.id}>Câu {i + 1}: <b>{extractAnswerDigits(q.answer)}</b></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// GIAO DIỆN HỌC SINH LÀM BÀI (StudentExamView)
// ==========================================
// Nhận `data` đã "đóng băng" tại thời điểm kích hoạt phòng thi (đã trộn nếu
// có bật), cùng examSettings để biết thời gian làm bài và lúc nào được xem
// lời giải. Tự quản lý toàn bộ trạng thái làm bài (đáp án đã chọn, đã nộp
// hay chưa, đếm giờ) — độc lập hoàn toàn với state chỉnh sửa đề của giáo
// viên (không dùng editingId/draft/openSolutions...).
// Tạo "chữ ký" duy nhất cho 1 lần kích hoạt phòng thi, dựa trên toàn bộ id
// câu hỏi + thời gian làm bài. Dùng làm key lưu sessionStorage — nếu giáo
// viên đóng phòng thi này và mở phòng thi khác (đề khác/mã đề khác), chữ ký
// đổi nên không bị lẫn/khôi phục nhầm bài làm cũ.
// THÊM MỚI (mở lời giải theo giờ cụ thể): input datetime-local cần chuỗi
// "yyyy-MM-ddTHH:mm" theo GIỜ ĐỊA PHƯƠNG trình duyệt GV, còn lưu server nên
// lưu ISO tuyệt đối (không phụ thuộc múi giờ server chạy ở đâu) — cùng cách
// làm với openAt/closeAt ở page.tsx (isoToDatetimeLocal).
function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string | null | undefined): string {
  if (!local) return '';
  const d = new Date(local);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

function buildExamSignature(data: any, settings: { duration: number }) {
  const ids: string[] = [];
  (['phan_1_TracNghiem', 'phan_2_DungSai', 'phan_3_TraLoiNgan', 'phan_4_TuLuan'] as const).forEach((k) => {
    (data[k] || []).forEach((q: any) => ids.push(q.id));
  });
  let hash = 0;
  const str = ids.join('|') + '#' + settings.duration;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return `examProgress_v1_${hash}`;
}

function StudentExamView({
  data,
  settings,
  examTitle,
  renderWithTikZ,
  onExit,
}: {
  data: any;
  settings: { duration: number; showSolution: 'after_submit' | 'never' | 'after_close' | 'custom_time'; scoring?: ScoringSettings };
  // Tên đề thi — hiện ở đầu trang, ĐỒNG BỘ với trang học sinh thật
  // (StudentTakeExam.tsx).
  examTitle?: string;
  renderWithTikZ: (text: string) => any;
  onExit: () => void;
}) {
  // Key sessionStorage riêng cho lần kích hoạt phòng thi này — tính 1 lần
  // duy nhất (không đổi trong suốt phiên làm bài).
  const storageKey = useMemo(() => buildExamSignature(data, settings), [data, settings]);

  // Khôi phục bài làm dở nếu có (ví dụ lỡ tay F5/mất mạng) — đọc 1 lần lúc
  // khởi tạo state (lazy initializer), không đọc lại sau đó.
  const savedProgress = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // p1: { [questionId]: chỉ số phương án đã chọn }
  const [p1Answers, setP1Answers] = useState<Record<string, number>>(savedProgress?.p1Answers || {});
  // p2: { [questionId]: { [chỉ số phương án]: true/false đã chọn } }
  const [p2Answers, setP2Answers] = useState<Record<string, Record<number, boolean>>>(savedProgress?.p2Answers || {});
  // p3/p4: { [questionId]: chuỗi đã gõ } — p4 ở bản xem trước này không dùng
  // (đã chuyển sang ảnh chụp giống trang thật), giữ lại để tương thích nếu
  // cần soát nhanh.
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>(savedProgress?.textAnswers || {});
  // Đánh dấu "cờ" 🚩 để xem lại — ĐỒNG BỘ với trang thật (StudentTakeExam.tsx).
  const [flagged, setFlagged] = useState<Record<string, boolean>>(savedProgress?.flagged || {});
  // Bảng "🗂️ Danh sách câu" — modal đè lên, bấm 1 số câu sẽ cuộn tới đúng
  // câu đó rồi tự đóng bảng, ĐỒNG BỘ với trang thật.
  const [navOpen, setNavOpen] = useState(false);
  // Phần IV: mô phỏng chụp/chọn ảnh bài làm như trang thật — CHỈ lưu tạm ở
  // client bằng URL.createObjectURL (KHÔNG gọi API upload thật vì đây là
  // bản demo tại chỗ cho giáo viên, không có submissionId thật trong CSDL).
  const [essayImages, setEssayImages] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState(savedProgress?.submitted || false);
  // Xem lại lời giải sau khi nộp (giống nút "🔑 Xem lời giải" ở trang thật) —
  // CHỈ hiện khi giáo viên bật showSolution: 'after_submit'.
  const [reviewOpen, setReviewOpen] = useState(false);
  // Mốc thời gian KẾT THÚC tuyệt đối (epoch ms) — tính 1 LẦN DUY NHẤT lúc bắt
  // đầu làm bài (hoặc khôi phục từ sessionStorage nếu đang làm dở). Xem giải
  // thích chi tiết ở StudentTakeExam.tsx (trang thật) — cùng cơ chế.
  const [endAt] = useState<number>(
    savedProgress?.endAt !== undefined ? savedProgress.endAt : Date.now() + Math.max(1, settings.duration) * 60000
  );
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.round((endAt - Date.now()) / 1000)));
  // Hiện modal xác nhận trước khi nộp bài thật sự (kể cả khi bấm nút tay
  // hay khi hết giờ tự động) — tránh nộp nhầm và cho biết còn bao nhiêu câu
  // chưa làm trước khi chốt.
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  // GHI CHÚ: StudentExamView hiện KHÔNG còn được render ở đâu trong app nữa
  // (màn "Xem mô phỏng trang học sinh" đã chuyển hẳn sang dùng component
  // dùng chung StudentTakeExam — xem chỗ gọi <StudentTakeExam previewMode
  // .../> trong hàm ExamBuilder chính) — giữ file này chỉ để không phải xoá
  // nhầm nếu còn tham chiếu ẩn nào đó, nên vẫn cập nhật state/JSX cho khớp
  // cú pháp, tránh lỗi biên dịch dù không render.
  const [collapsedPreview, setCollapsedPreview] = useState(true);

  // Tự động lưu tiến độ làm bài vào sessionStorage mỗi khi có thay đổi —
  // chống mất bài khi rớt mạng/lỡ tay đóng tab/F5. Không lưu essayImages vì
  // đó là blob: URL tạm của trình duyệt, không sống sót qua lần tải lại nên
  // lưu vào cũng vô nghĩa.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ p1Answers, p2Answers, textAnswers, flagged, submitted, endAt })
      );
    } catch {
      // Bỏ qua nếu trình duyệt chặn sessionStorage (chế độ ẩn danh nghiêm ngặt...).
    }
  }, [storageKey, p1Answers, p2Answers, textAnswers, flagged, submitted, endAt]);

  // Cảnh báo trước khi đóng/tải lại trang trong lúc đang thi — tránh mất
  // bài do bấm nhầm. (ĐỒNG BỘ với trang thật — trang thật cũng có cảnh báo
  // này, xem StudentTakeExam.tsx.)
  useEffect(() => {
    if (submitted) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [submitted]);

  // Đếm ngược mỗi giây bằng cách tính lại (endAt - now), KHÔNG trừ dần một
  // biến đếm — nên nếu tab bị treo/throttle, đồng hồ tự "bắt kịp" đúng thời
  // gian thực ngay lần tick kế tiếp thay vì bị lệch. Tự động nộp khi hết giờ.
  useEffect(() => {
    if (submitted) return;
    if (timeLeft <= 0) {
      setSubmitted(true);
      setShowConfirmSubmit(false);
      return;
    }
    const timer = setTimeout(() => {
      setTimeLeft(Math.max(0, Math.round((endAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, submitted, endAt]);

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss = String(timeLeft % 60).padStart(2, '0');

  // Chấm điểm dựa trên chính `data` (bản đang hiển thị) — bản xem trước này
  // KHÔNG có bản gốc/bản trộn tách riêng như trang thật, nên chấm trực tiếp
  // trên mảng đang hiển thị là tự nhất quán (chỉ số phương án lưu trong
  // p1Answers/p2Answers luôn tham chiếu đúng mảng này).
  const scoring = useMemo(() => {
    const g = gradeExam(data, { p1Answers, p2Answers, textAnswers }, settings.scoring);
    return g;
  }, [data, p1Answers, p2Answers, textAnswers, settings.scoring]);

  const detailsByIdP1 = useMemo(
    () => Object.fromEntries(scoring.details.p1.map((d) => [d.id, d])),
    [scoring]
  );
  const detailsByIdP2 = useMemo(
    () => Object.fromEntries(scoring.details.p2.map((d) => [d.id, d])),
    [scoring]
  );
  const detailsByIdP3 = useMemo(
    () => Object.fromEntries(scoring.details.p3.map((d) => [d.id, d])),
    [scoring]
  );

  const partitionLabel: Record<Partition, string> = {
    p1: 'Phần I: Trắc nghiệm',
    p2: 'Phần II: Đúng/Sai',
    p3: 'Phần III: Trả lời ngắn',
    p4: 'Phần IV: Tự luận',
  };
  const partitionCount: Record<Partition, number> = {
    p1: (data.phan_1_TracNghiem || []).length,
    p2: (data.phan_2_DungSai || []).length,
    p3: (data.phan_3_TraLoiNgan || []).length,
    p4: (data.phan_4_TuLuan || []).length,
  };

  const unansweredCount =
    scoring.total -
    scoring.details.p1.filter((q) => q.attempted).length -
    scoring.details.p2.filter((q) => q.attempted).length -
    scoring.details.p3.filter((q) => q.attempted).length;

  const flaggedCount = Object.values(flagged).filter(Boolean).length;

  function scrollToQuestion(anchorId: string) {
    setNavOpen(false);
    // Đợi modal đóng xong (đổi display) rồi mới cuộn, tránh giật màn hình.
    requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Mô phỏng chụp/chọn ảnh bài làm Phần IV — CHỈ tạo blob: URL tạm ở trình
  // duyệt để hiện thumbnail giống trang thật, KHÔNG upload lên server nào cả
  // (bản xem trước này không có submissionId thật để gắn ảnh vào).
  function addEssayImage(questionId: string, file: File) {
    const url = URL.createObjectURL(file);
    setEssayImages((prev) => ({ ...prev, [questionId]: [...(prev[questionId] || []), url] }));
  }
  function removeEssayImage(questionId: string, url: string) {
    setEssayImages((prev) => ({ ...prev, [questionId]: (prev[questionId] || []).filter((u) => u !== url) }));
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }

  // ---------------------------------------------------------------------
  // Màn "Xem lời giải" sau khi nộp — CHỈ hiện khi giáo viên bật showSolution
  // là 'after_submit'. Tô đúng/sai từng phương án, ĐỒNG BỘ về màu sắc/bố cục
  // với SolutionView.tsx (trang thật), nhưng dùng renderWithTikZ (bộ vẽ
  // LaTeX/ảnh riêng của trình soạn đề) vì đây là preview trước khi xuất bản,
  // chưa có tikzSvgMap/imageUrlMap của bản đã xuất bản.
  if (submitted && reviewOpen) {
    return (
      <div className="max-w-3xl mx-auto pb-16">
        <div className="sticky top-0 z-20 bg-white border border-gray-200 rounded-xl shadow-sm mb-6 px-5 py-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-blue-600 font-bold text-lg">Lời giải</span>
            <span className="text-gray-400 text-sm ml-2 hidden sm:inline">đối chiếu bài làm (xem trước)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg px-3 py-1 rounded-lg bg-green-100 text-green-700">
              ✅ {scoring.scorePoints}/{scoring.maxScorePoints} điểm
            </span>
            <button
              onClick={() => setReviewOpen(false)}
              className="bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              ↩️ Đóng
            </button>
          </div>
        </div>

        {partitionCount.p1 > 0 && (
          <div className="space-y-4">
            <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">{partitionLabel.p1}</h2>
            {(data.phan_1_TracNghiem || []).map((q: any, i: number) => {
              const detail = detailsByIdP1[q.id];
              const picked = p1Answers[q.id];
              return (
                <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="font-semibold text-[15px]"><span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderWithTikZ(q.content)}</div>
                    <span
                      className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${
                        detail?.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {detail?.points ?? 0}/{detail?.maxPoints ?? 0}đ
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(q.options || []).map((opt: any, oi: number) => {
                      const isPicked = picked === oi;
                      let cls = 'border-gray-200';
                      if (opt.isCorrect) cls = 'border-green-400 bg-green-50';
                      else if (isPicked) cls = 'border-red-400 bg-red-50';
                      return (
                        <div key={oi} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border ${cls}`}>
                          {/* SỬA (28-7, đồng bộ ExamBuilder.tsx tab Xem đề +
                              SolutionView.tsx): bỏ nhãn "✓ đáp án đúng" dài ở
                              cuối dòng — thay bằng dấu ✓ đơn dính liền ngay
                              sau nhãn A/B/C/D, khung/nền xanh đã đủ phân biệt. */}
                          <span className="text-sm">
                            <span className="font-semibold mr-1 text-blue-700">
                              {String.fromCharCode(65 + oi)}.
                              {opt.isCorrect && <span className="text-green-600 ml-1">✓</span>}
                            </span>
                            {renderWithTikZ(opt.text)}
                            {isPicked && <span className="ml-2 text-xs text-gray-400">(đã chọn)</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {q.solution && (
                    <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-sm">
                      <div className="font-bold text-blue-700 mb-1">Lời giải:</div>
                      {renderWithTikZ(q.solution)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {partitionCount.p2 > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">{partitionLabel.p2}</h2>
            {(data.phan_2_DungSai || []).map((q: any, i: number) => {
              const detail = detailsByIdP2[q.id];
              const picks = p2Answers[q.id] || {};
              return (
                <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="font-semibold text-[15px]"><span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderWithTikZ(q.content)}</div>
                    <span
                      className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${
                        detail?.correct ? 'bg-green-100 text-green-700' : detail && detail.points > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {detail?.points ?? 0}/{detail?.maxPoints ?? 0}đ
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(q.options || []).map((opt: any, oi: number) => {
                      const chosen = picks[oi];
                      const wrongPick = chosen !== undefined && chosen !== opt.isCorrect;
                      return (
                        <div
                          key={oi}
                          className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border ${
                            wrongPick ? 'border-red-400 bg-red-50' : 'border-green-400 bg-green-50'
                          }`}
                        >
                          <span className="text-sm flex-1">
                            <span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(97 + oi)})</span>
                            {renderWithTikZ(opt.text)}
                          </span>
                          <span className="text-xs font-semibold shrink-0">
                            Đáp án: {opt.isCorrect ? 'Đúng' : 'Sai'}
                            {chosen !== undefined && (
                              <span className="text-gray-400 ml-1">(đã chọn: {chosen ? 'Đúng' : 'Sai'})</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {q.solution && (
                    <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-sm">
                      <div className="font-bold text-blue-700 mb-1">Lời giải:</div>
                      {renderWithTikZ(q.solution)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {partitionCount.p3 > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">{partitionLabel.p3}</h2>
            {(data.phan_3_TraLoiNgan || []).map((q: any, i: number) => {
              const detail = detailsByIdP3[q.id];
              const given = textAnswers[q.id] || '';
              const expected = extractAnswerDigits(q.answer || '');
              return (
                <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="font-semibold text-[15px]"><span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderWithTikZ(q.content)}</div>
                    <span
                      className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md ${
                        detail?.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {detail?.points ?? 0}/{detail?.maxPoints ?? 0}đ
                    </span>
                  </div>
                  <p className="text-sm">
                    Đã đáp: <span className="font-mono font-semibold">{given || '(bỏ trống)'}</span>
                    {!detail?.correct && (
                      <span className="ml-3 text-green-700">
                        Đáp số đúng: <span className="font-mono font-semibold">{expected}</span>
                      </span>
                    )}
                  </p>
                  {q.solution && (
                    <div className="mt-3 p-3 bg-white border border-slate-200 rounded-lg text-sm">
                      <div className="font-bold text-blue-700 mb-1">Lời giải:</div>
                      {renderWithTikZ(q.solution)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {partitionCount.p4 > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">{partitionLabel.p4}</h2>
            <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2">
              Phần tự luận do giáo viên chấm tay — điểm chưa cộng vào điểm ở trên.
            </div>
            {(data.phan_4_TuLuan || []).map((q: any, i: number) => (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="font-semibold text-[15px] mb-3"><span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderWithTikZ(q.content)}</div>
                {q.solution && (
                  <div className="p-3 bg-white border border-slate-200 rounded-lg text-sm">
                    <div className="font-bold text-blue-700 mb-1">Gợi ý lời giải:</div>
                    {renderWithTikZ(q.solution)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      {/* KHỐI ĐẦU TRANG — ĐỒNG BỘ với trang học sinh thật (StudentTakeExam.tsx):
          tiêu đề đề thi + nhãn "xem trước" + đồng hồ/nút danh sách câu/nút
          nộp bài đi LIỀN MỘT KHỐI, không tách tab riêng. Đây là bản GIẢ LẬP
          CHẠY TẠI CHỖ cho giáo viên tự kiểm tra đề (không lưu bài, không có
          link thật) — nhưng bố cục hiển thị phải giống hệt những gì học
          sinh sẽ thấy trên link thật. */}
      {/* THANH TIÊU ĐỀ + MẤU ĐỒNG HỒ — ĐỒNG BỘ với trang học sinh thật
          (StudentTakeExam.tsx, xem chú thích chi tiết ở đó): tiêu đề đề
          thi tách riêng thành thanh MỎNG ghim cố định mép trên cùng (luôn
          hiện, không phụ thuộc đóng/mở mấu) — KHÔNG còn gộp chung 1 khối
          "sticky" to với đồng hồ/nút Nộp bài như bản cũ. Mấu đồng hồ hình
          bán nguyệt ghim góc trên-phải, cách mép trên 1.5cm, không còn hiện
          số đếm giờ chạy chữ (mm:ss) lúc thu gọn — thay bằng icon mũ + tiến
          độ "Câu x/y" + icon đồng hồ tĩnh làm nút mở bảng xem giờ đầy đủ.
          Đây vẫn là bản GIẢ LẬP CHẠY TẠI CHỖ cho GV tự kiểm tra đề (không
          lưu bài, không có link thật) — nhưng bố cục hiển thị phải giống
          hệt những gì học sinh sẽ thấy trên link thật. */}
      {!submitted && examTitle && (
        <div
          className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-center text-center px-4 border-b shadow-sm transition-colors ${
            timeLeft <= 60
              ? 'bg-red-50 border-red-200'
              : timeLeft <= 300
              ? 'bg-amber-50 border-amber-200'
              : 'bg-white border-gray-200'
          }`}
          style={{ height: '1.5cm' }}
        >
          <h1 className="font-bold text-gray-900 text-sm sm:text-base leading-snug truncate max-w-full">
            📝 {examTitle}
          </h1>
        </div>
      )}

      {!submitted && (
        <>
          <button
            type="button"
            onClick={onExit}
            className="fixed left-3 sm:left-6 z-20 flex items-center gap-1.5 bg-gray-900/85 hover:bg-gray-900 text-white text-xs font-semibold px-3 py-2 rounded-full shadow-md transition"
            style={{ top: examTitle ? 'calc(1.5cm + 0.5rem)' : '0.75rem' }}
          >
            🧑‍🎓 Xem trước — bấm để thoát
          </button>

          <div className="fixed right-3 sm:right-6 z-20 flex flex-col items-end" style={{ top: '1.5cm' }}>
            <button
              type="button"
              onClick={() => setCollapsedPreview((v) => !v)}
              title={collapsedPreview ? 'Mở bảng điều khiển bài thi' : 'Thu gọn'}
              className={`flex items-center gap-2 rounded-b-2xl shadow-md border border-t-0 px-3.5 pt-1.5 pb-2 transition ${
                timeLeft <= 60
                  ? 'bg-red-100 border-red-200 text-red-600 animate-pulse'
                  : timeLeft <= 300
                  ? 'bg-amber-100 border-amber-200 text-amber-700'
                  : 'bg-white border-gray-200 text-blue-700'
              }`}
            >
              <CapIcon className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold whitespace-nowrap">
                Câu {scoring.total - unansweredCount}/{scoring.total}
              </span>
              <span className="w-px h-3.5 bg-current opacity-25" />
              <ClockIcon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] opacity-60">{collapsedPreview ? '▾' : '▴'}</span>
            </button>

            {!collapsedPreview && (
              <div className="mt-1.5 w-80 max-w-[calc(100vw-1.5rem)] bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`font-mono font-bold text-lg px-2.5 py-1 rounded-lg ${
                      timeLeft <= 60
                        ? 'bg-red-100 text-red-600'
                        : timeLeft <= 300
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    ⏱️ {mm}:{ss}
                  </span>
                  <span className="text-gray-400 text-xs">chế độ xem trước</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    onClick={() => setNavOpen(true)}
                    className="relative inline-flex items-center justify-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-3 py-2 rounded-lg transition whitespace-nowrap"
                    title="Danh sách câu — xem đã làm câu nào, đánh dấu để xem lại"
                  >
                    🗂️ <span>Danh sách câu</span>
                    {flaggedCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {flaggedCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowConfirmSubmit(true)}
                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition whitespace-nowrap"
                  >
                    🚀 Nộp bài
                  </button>
                </div>
              </div>
            )}
          </div>
          <div style={{ height: examTitle ? 'calc(1.5cm + 0.75rem)' : '1rem' }} />
        </>
      )}

      {!submitted && (
        <>
          {/* Mục lục cuộn nhanh — ĐỒNG BỘ với trang thật: bấm CUỘN tới phần
              tương ứng, KHÔNG ẩn/hiện nội dung như tab cũ. Cả 4 phần luôn
              nằm liên tiếp trên cùng 1 trang. */}
          <div className="flex gap-2 mb-5 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm flex-wrap">
            {(['p1', 'p2', 'p3', 'p4'] as Partition[]).map((p) =>
              partitionCount[p] === 0 ? null : (
                <a
                  key={p}
                  href={`#pv-section-${p}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(`pv-section-${p}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="flex-1 text-center text-sm font-medium px-3 py-2 rounded-lg transition text-gray-600 hover:bg-gray-50 hover:text-blue-600 cursor-pointer min-w-[45%] sm:min-w-0"
                >
                  {partitionLabel[p]} ({partitionCount[p]})
                </a>
              )
            )}
          </div>

          {/* --- PHẦN I: TRẮC NGHIỆM --- radio-list, ĐỒNG BỘ với trang thật
              (trước đây là nút bấm dạng lưới ô — khác cấu trúc với trang thật). */}
          {partitionCount.p1 > 0 && (
            <div id="pv-section-p1" className="space-y-4 scroll-mt-28">
              <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">{partitionLabel.p1}</h2>
              {(data.phan_1_TracNghiem || []).map((q: any, i: number) => (
                <div key={q.id} id={`pv-qcard-p1-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm scroll-mt-28">
                  <div className="flex justify-end -mt-4 -mr-4 mb-0.5">
                    <button
                      type="button"
                      onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                      title={flagged[q.id] ? 'Bỏ đánh dấu' : 'Đánh dấu để xem lại'}
                      className={`shrink-0 text-lg leading-none px-1 py-0.5 rounded-md transition ${
                        flagged[q.id] ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'
                      }`}
                    >
                      🚩
                    </button>
                  </div>
                  <div className="font-semibold text-[15px] mb-2"><span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderWithTikZ(q.content)}</div>
                  <div className="space-y-2">
                    {(q.options || []).map((opt: any, oi: number) => {
                      const checked = p1Answers[q.id] === oi;
                      return (
                        <label
                          key={oi}
                          className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition ${
                            checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`pv-q-${q.id}`}
                            checked={checked}
                            onChange={() => setP1Answers((prev) => ({ ...prev, [q.id]: oi }))}
                            className="mt-1"
                          />
                          <span className="text-sm">
                            <span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(65 + oi)}.</span>
                            {renderWithTikZ(opt.text)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* --- PHẦN II: ĐÚNG/SAI --- nhãn nút rút gọn "Đ"/"S" (trước đây
              "Đúng"/"Sai" đầy đủ), có ghi chú "(Đ = Đúng, S = Sai)" ngay
              cạnh tiêu đề phần để không gây hiểu nhầm — ĐỒNG BỘ với trang
              thật (src/app/thi/[examId]/StudentTakeExam.tsx). */}
          {partitionCount.p2 > 0 && (
            <div id="pv-section-p2" className="space-y-4 mt-8 scroll-mt-28">
              <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">
                {partitionLabel.p2} <span className="font-normal text-slate-500 text-[12px]">(Đ = Đúng, S = Sai)</span>
              </h2>
              {(data.phan_2_DungSai || []).map((q: any, i: number) => (
                <div key={q.id} id={`pv-qcard-p2-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm scroll-mt-28">
                  <div className="flex justify-end -mt-4 -mr-4 mb-0.5">
                    <button
                      type="button"
                      onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                      title={flagged[q.id] ? 'Bỏ đánh dấu' : 'Đánh dấu để xem lại'}
                      className={`shrink-0 text-lg leading-none px-1 py-0.5 rounded-md transition ${
                        flagged[q.id] ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'
                      }`}
                    >
                      🚩
                    </button>
                  </div>
                  <div className="font-semibold text-[15px] mb-2"><span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderWithTikZ(q.content)}</div>
                  <div className="space-y-2">
                    {(q.options || []).map((opt: any, oi: number) => {
                      const picks = p2Answers[q.id] || {};
                      const val = picks[oi];
                      return (
                        <div key={oi} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-200">
                          <span className="text-sm flex-1">
                            <span className="font-semibold mr-1 text-blue-700">{String.fromCharCode(97 + oi)})</span>
                            {renderWithTikZ(opt.text)}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() =>
                                setP2Answers((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), [oi]: true } }))
                              }
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                                val === true ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              Đ
                            </button>
                            <button
                              onClick={() =>
                                setP2Answers((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), [oi]: false } }))
                              }
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                                val === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              S
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* --- PHẦN III: TRẢ LỜI NGẮN --- ô nhập gọn, không tô màu đúng/sai,
              ĐỒNG BỘ với trang thật (trước đây rộng hơn + tô màu + hiện đáp
              án ngay khi "nộp" trong preview — khác trang thật). */}
          {partitionCount.p3 > 0 && (
            <div id="pv-section-p3" className="space-y-4 mt-8 scroll-mt-28">
              <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">{partitionLabel.p3}</h2>
              {(data.phan_3_TraLoiNgan || []).map((q: any, i: number) => (
                <div key={q.id} id={`pv-qcard-p3-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm scroll-mt-28">
                  <div className="flex justify-end -mt-4 -mr-4 mb-0.5">
                    <button
                      type="button"
                      onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                      title={flagged[q.id] ? 'Bỏ đánh dấu' : 'Đánh dấu để xem lại'}
                      className={`shrink-0 text-lg leading-none px-1 py-0.5 rounded-md transition ${
                        flagged[q.id] ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'
                      }`}
                    >
                      🚩
                    </button>
                  </div>
                  <div className="font-semibold text-[15px] mb-2"><span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderWithTikZ(q.content)}</div>
                  <input
                    type="text"
                    value={textAnswers[q.id] || ''}
                    onChange={(e) => setTextAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Nhập đáp số..."
                    className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
          )}

          {/* --- PHẦN IV: TỰ LUẬN --- chụp/chọn ảnh bài làm (mô phỏng, không
              upload thật), ĐỒNG BỘ với trang thật (trước đây là textarea gõ
              chữ — trang thật KHÔNG có textarea, chỉ nhận ảnh chụp giấy làm bài). */}
          {partitionCount.p4 > 0 && (
            <div id="pv-section-p4" className="space-y-4 mt-8 scroll-mt-28">
              <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">{partitionLabel.p4}</h2>
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2">
                Làm bài trên giấy, chụp ảnh hoặc chọn ảnh đã chụp cho từng câu. Giáo viên sẽ chấm tay
                phần này sau khi nộp bài — điểm hiển thị lúc nộp KHÔNG bao gồm Phần IV. (Bản xem trước:
                ảnh chỉ hiện tạm trên máy, không được lưu lại.)
              </div>
              {(data.phan_4_TuLuan || []).map((q: any, i: number) => {
                const images = essayImages[q.id] || [];
                const inputId = `pv-essay-file-${q.id}`;
                return (
                  <div key={q.id} id={`pv-qcard-p4-${q.id}`} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm scroll-mt-28">
                    <div className="flex justify-end -mt-4 -mr-4 mb-0.5">
                      <button
                        type="button"
                        onClick={() => setFlagged((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                        title={flagged[q.id] ? 'Bỏ đánh dấu' : 'Đánh dấu để xem lại'}
                        className={`shrink-0 text-lg leading-none px-1 py-0.5 rounded-md transition ${
                          flagged[q.id] ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'
                        }`}
                      >
                        🚩
                      </button>
                    </div>
                    <div className="font-semibold text-[15px] mb-2"><span className="text-blue-700 font-bold">Câu {i + 1}:</span> {renderWithTikZ(q.content)}</div>

                    {images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {images.map((url, idx) => (
                          <div key={url} className="relative">
                            <a href={url} target="_blank" rel="noreferrer">
                              <img
                                src={url}
                                alt={`Ảnh bài làm câu ${i + 1} - trang ${idx + 1}`}
                                className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                                loading="lazy"
                                decoding="async"
                              />
                            </a>
                            <button
                              type="button"
                              onClick={() => removeEssayImage(q.id, url)}
                              className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs leading-none flex items-center justify-center shadow"
                              title="Xóa ảnh này"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <label
                      htmlFor={inputId}
                      className="inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 cursor-pointer transition"
                    >
                      {images.length > 0 ? '+ Thêm ảnh (trang khác)' : '📷 Chụp / chọn ảnh bài làm'}
                    </label>
                    <input
                      id={inputId}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) addEssayImage(q.id, file);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal "🗂️ Danh sách câu" — ĐỒNG BỘ với trang thật: lưới số câu theo
          từng phần, tô xanh câu đã làm/viền cam câu đã đánh dấu, bấm để cuộn
          tới đúng câu. */}
      {navOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900">🗂️ Danh sách câu</h3>
              <button
                onClick={() => setNavOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
                title="Đóng"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-1">
              Đã làm {scoring.total - Math.max(0, unansweredCount)}/{scoring.total} câu
              {flaggedCount > 0 && (
                <span className="text-amber-600"> · Đánh dấu {flaggedCount} câu để xem lại</span>
              )}
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-blue-100 border border-blue-300 inline-block" /> Đã làm
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-gray-100 border border-gray-300 inline-block" /> Chưa làm
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-md bg-white border-2 border-amber-400 inline-block" /> Đã đánh dấu
              </span>
            </div>

            {(
              [
                { key: 'p1', label: partitionLabel.p1, items: data.phan_1_TracNghiem || [], attemptedById: Object.fromEntries(scoring.details.p1.map((d) => [d.id, d.attempted])) },
                { key: 'p2', label: partitionLabel.p2, items: data.phan_2_DungSai || [], attemptedById: Object.fromEntries(scoring.details.p2.map((d) => [d.id, d.attempted])) },
                { key: 'p3', label: partitionLabel.p3, items: data.phan_3_TraLoiNgan || [], attemptedById: Object.fromEntries(scoring.details.p3.map((d) => [d.id, d.attempted])) },
                {
                  key: 'p4',
                  label: partitionLabel.p4,
                  items: data.phan_4_TuLuan || [],
                  attemptedById: Object.fromEntries(
                    (data.phan_4_TuLuan || []).map((q: any) => [q.id, (essayImages[q.id] || []).length > 0])
                  ),
                },
              ] as const
            ).map((group) =>
              group.items.length === 0 ? null : (
                <div key={group.key} className="mb-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((q: any, i: number) => {
                      const attempted = !!group.attemptedById[q.id];
                      const isFlagged = !!flagged[q.id];
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => scrollToQuestion(`pv-qcard-${group.key}-${q.id}`)}
                          title={`Câu ${i + 1}${attempted ? ' — đã làm' : ' — chưa làm'}${isFlagged ? ' — đã đánh dấu' : ''}`}
                          className={`relative w-10 h-10 rounded-lg text-sm font-semibold flex items-center justify-center transition ${
                            attempted
                              ? 'bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200'
                              : 'bg-gray-100 text-gray-500 border border-gray-300 hover:bg-gray-200'
                          } ${isFlagged ? 'ring-2 ring-amber-400' : ''}`}
                        >
                          {i + 1}
                          {isFlagged && <span className="absolute -top-1.5 -right-1.5 text-xs">🚩</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Modal xác nhận nộp bài — chặn nộp nhầm bằng 1 cú bấm, hiện rõ số
          câu chưa làm để cân nhắc quay lại làm tiếp trước khi chốt. ĐỒNG BỘ
          với trang thật. */}
      {showConfirmSubmit && !submitted && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowConfirmSubmit(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Nộp bài?</h3>
            <p className="text-sm text-gray-500 mb-1">
              Đã làm {scoring.total - Math.max(0, unansweredCount)}/{scoring.total} câu.
            </p>
            {unansweredCount > 0 && (
              <p className="text-sm text-amber-600 mb-4">Còn {unansweredCount} câu chưa làm.</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2 rounded-lg hover:bg-gray-50"
              >
                Làm tiếp
              </button>
              <button
                onClick={() => {
                  setShowConfirmSubmit(false);
                  setSubmitted(true);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg"
              >
                Nộp bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Màn "Đã nộp bài!" — ĐỒNG BỘ với màn hình thi thật (trang/thi/[examId]/page.tsx
          phase 'done'): thẻ điểm gọn ở giữa màn hình, có nút "Xem lời giải"
          nếu giáo viên bật, thay cho việc tô màu đúng/sai ngay trên từng câu
          như bản preview cũ (trang thật KHÔNG làm vậy). */}
      {submitted && !reviewOpen && (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
            <AppLogoIcon className="w-10 h-10 mx-auto mb-2" />
            <p className="text-3xl mb-3">✅</p>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Đã nộp bài! (xem trước)</h2>
            {/* SỬA: chỉ hiện điểm theo thang điểm — BỎ dòng "x/y câu" (số câu
                đúng tuyệt đối) để đồng bộ với màn hình thật, tránh hiểu nhầm
                điểm số câu đúng với điểm thật (có tính điểm từng phần). */}
            <p className="text-3xl font-bold text-blue-600 mb-4">
              {scoring.scorePoints}/{scoring.maxScorePoints} điểm
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Đây là bản xem trước tại chỗ cho giáo viên — không có bài làm nào được lưu lại.
            </p>
            {settings.showSolution === 'after_submit' && (
              <button
                onClick={() => setReviewOpen(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition mb-2"
              >
                Lời giải
              </button>
            )}
            <button
              onClick={onExit}
              className="w-full bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold py-2.5 rounded-lg transition"
            >
              ↩️ Quay lại Giáo viên
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  q,
  index,
  partition,
  typeLabel,
  renderOptions,
  answer,
  isEditing,
  isOpen,
  mounted,
  draft,
  setDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleSolution,
  renderWithTikZ,
}: {
  q: any;
  index: number;
  partition: Partition;
  typeLabel?: string;
  renderOptions?: () => React.ReactNode;
  // Đáp số riêng của câu Trả lời ngắn (Phần III) — hiển thị thành ô vuông ở
  // góc dưới trái của đề, không truyền (undefined) thì không có gì để hiện.
  answer?: string;
  isEditing: boolean;
  isOpen: boolean;
  mounted: boolean;
  // THÊM MỚI (khiếu nại 28-7: "Xem đề GV, sửa phương án trắc nghiệm/đúng
  // sai không được, phải mở file gốc"): options ở đây LÀ BẢN NHÁP đang sửa
  // của q.options (mảng 4 phương án A/B/C/D hoặc a/b/c/d, kèm cờ isCorrect
  // của TỪNG phương án) — chỉ có ở Phần I/II (q.options tồn tại), Phần
  // III/IV không có (mảng rỗng, không hiện khối sửa này). TRƯỚC ĐÂY modal
  // "Sửa đề và giải" chỉ có content/solution/answer(P3) — không hề đụng
  // tới field options này, nên GV không có cách nào sửa nội dung TỪNG
  // phương án hay đổi đáp án đúng ngoài việc mở lại file .tex gốc (chỉnh
  // \True) rồi tải lên lại từ đầu.
  draft: { content: string; solution: string; answer: string; options: { text: string; isCorrect: boolean }[] };
  setDraft: React.Dispatch<
    React.SetStateAction<{ content: string; solution: string; answer: string; options: { text: string; isCorrect: boolean }[] }>
  >;
  onStartEdit: (q: any) => void;
  onCancelEdit: () => void;
  onSaveEdit: (partition: Partition, id: string) => void;
  onToggleSolution: (id: string) => void;
  renderWithTikZ: (text: string) => React.ReactNode;
}) {
  return (
    <div id={`q-${q.id}`} className="bg-white p-3 sm:p-5 rounded-xl shadow-sm border border-gray-200">
      {/* SỬA (khiếu nại 25-7: "trang Xem đề của GV rườm rà quá, làm giống
          hệt trang Xem lời giải của học sinh cho gọn"): nhãn "Câu N" đổi
          sang dạng badge nền xanh bo tròn (giống hệt SolutionView.tsx của
          học sinh), bỏ hẳn phần ghi chú loại câu "(Đúng/Sai)"/"(Trả lời
          ngắn)"/"(Tự luận)" phía sau vì đã có tiêu đề "Phần I/II/III/IV"
          ngay phía trên rồi, nhắc lại là thừa. */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="bg-blue-600 text-white font-bold text-xs sm:text-sm px-2 sm:px-2.5 py-1 rounded-md">
          {q.label} {index + 1}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono">{q.code}</span>
          {!isEditing && (
            <button
              onClick={() => onStartEdit(q)}
              className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium px-2 py-1 rounded transition whitespace-nowrap"
            >
              ✏️ Sửa đề và giải
            </button>
          )}
        </div>
      </div>

      {/* SỬA (25-7): bỏ khung nền xám/viền quanh nội dung câu hỏi — hiện chữ
          trần giống hệt SolutionView.tsx của học sinh (font-semibold, không
          nền, không viền), đỡ rối mắt. Cỡ chữ responsive text-[13px]
          sm:text-[15px] để đọc dễ trên điện thoại, đồng bộ với trang lời
          giải học sinh. */}
      <div
        className="font-semibold text-[13px] sm:text-[15px] whitespace-pre-wrap mb-4 overflow-x-auto no-scrollbar leading-relaxed"
        style={scrollFadeX('#ffffff')}
      >
        {renderWithTikZ(q.content)}
      </div>

      {renderOptions && renderOptions()}

      {/* Ô đáp số của câu Trả lời ngắn (Phần III) — đặt ở góc dưới trái của
          đề, ngay phía trên nhãn "Lời giải" (thay vì gộp chung vào cuối lời
          giải như trước). Gộp chung 1 dòng thay vì tách thành 4 ô vuông rời. */}
      {answer && (
        <div className="flex justify-start items-center gap-2 mb-4">
          <span className="text-xs font-semibold text-gray-500">Đáp số:</span>
          <span className="inline-flex items-center justify-center px-3 h-8 border-2 border-gray-300 rounded bg-white text-sm font-bold text-gray-800 tracking-wide">
            {extractAnswerDigits(answer)}
          </span>
        </div>
      )}

      {q.solution && (
        // SỬA (25-7): đổi khung "Lời giải" từ nền vàng sang nhãn xanh + nền
        // slate giống hệt SolutionView.tsx của học sinh (label "Lời giải:"
        // in đậm màu xanh, khung nền bg-slate-50 border-slate-200). Vẫn giữ
        // nút bấm mở/đóng từng câu (đồng bộ với "Bung hết/Đóng hết lời
        // giải" ở trên), chỉ đổi màu sắc cho gọn và giống trang học sinh.
        <div className="mt-2 rounded-lg border border-slate-200 bg-white overflow-hidden">
          <button
            onClick={() => onToggleSolution(q.id)}
            className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 font-bold text-blue-700 text-[13px] sm:text-sm hover:bg-slate-100 transition text-left"
          >
            <span>Lời giải:</span>
            <span className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {isOpen && (
            <div
              className="px-3 sm:px-4 pb-3 sm:pb-4 text-[13px] sm:text-sm whitespace-pre-wrap leading-relaxed overflow-x-auto no-scrollbar"
              style={scrollFadeX('#ffffff')}
            >
              {renderWithTikZ(q.solution)}
            </div>
          )}
        </div>
      )}

      {/* Modal Sửa code: nổi lên TOÀN MÀN HÌNH thay vì bó trong khung thẻ câu
          hỏi (vốn chỉ rộng bằng max-w-5xl trừ padding) — rộng rãi hơn hẳn để
          sửa các khối LaTeX dài (bảng biến thiên, hệ phương trình...) không
          bị bó chữ khó đọc. */}
      {isEditing && mounted && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#1e1f22] rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-white/10">
            {/* Thanh tiêu đề — cùng bố cục với popup TikZ Editor để đồng bộ giao diện */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#26282c] flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-blue-400 text-base flex-shrink-0">✏️</span>
                <span className="text-sm font-medium text-gray-100 truncate">
                  Sửa đề và lời giải <span className="text-gray-500">—</span>{' '}
                  <span className="text-gray-400 font-mono text-xs align-middle">{q.label} {index + 1}</span>
                </span>
              </div>
              <button
                onClick={onCancelEdit}
                className="text-gray-400 hover:text-white text-lg leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 transition flex-shrink-0"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Nội dung: 2 khung LaTeX */}
            <div className="px-4 pt-4 pb-2 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">Nội dung đề bài (LaTeX)</label>
                <textarea
                  value={draft.content}
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  rows={10}
                  spellCheck={false}
                  className="w-full text-[13px] font-mono leading-relaxed bg-[#141517] border border-white/10 rounded-lg p-3 text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
              {/* THÊM MỚI (khiếu nại 28-7): sửa TỪNG phương án A/B/C/D (Phần
                  I) hoặc a/b/c/d (Phần II) NGAY TẠI ĐÂY — cả nội dung chữ
                  lẫn đáp án đúng — không cần mở lại file .tex gốc nữa. Chỉ
                  hiện khối này khi câu có options (q.options.length > 0,
                  tức Phần I/II) — Phần III (đã có ô "Đáp số" riêng ngay bên
                  dưới) và Phần IV (tự luận, không có phương án nào) không
                  hiện. Phần I: 1 phương án đúng DUY NHẤT -> dùng radio (chọn
                  cái mới tự bỏ chọn cái cũ). Phần II: mỗi ý đúng/sai ĐỘC LẬP
                  với nhau -> dùng nút bấm chuyển đổi (toggle) riêng từng ý,
                  không phải radio. */}
              {draft.options.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-400 mb-1 block">
                    Các phương án{' '}
                    <span className="text-gray-500 font-normal">
                      {partition === 'p1' ? '(chọn 1 đáp án đúng)' : '(bấm Đúng/Sai cho từng ý)'}
                    </span>
                  </label>
                  <div className="flex flex-col gap-2">
                    {draft.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-start gap-2">
                        <span className="text-xs font-mono text-gray-400 mt-2.5 w-4 flex-shrink-0">
                          {partition === 'p1' ? String.fromCharCode(65 + oIdx) : String.fromCharCode(97 + oIdx)}
                        </span>
                        <textarea
                          value={opt.text}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              options: d.options.map((o, i) => (i === oIdx ? { ...o, text: e.target.value } : o)),
                            }))
                          }
                          rows={2}
                          spellCheck={false}
                          className="flex-1 text-[13px] font-mono leading-relaxed bg-[#141517] border border-white/10 rounded-lg p-2 text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                        />
                        {partition === 'p1' ? (
                          <label className="flex items-center gap-1.5 mt-2.5 flex-shrink-0 cursor-pointer select-none">
                            <input
                              type="radio"
                              name={`correct-${q.id}`}
                              checked={opt.isCorrect}
                              onChange={() =>
                                setDraft((d) => ({
                                  ...d,
                                  options: d.options.map((o, i) => ({ ...o, isCorrect: i === oIdx })),
                                }))
                              }
                              className="accent-blue-500"
                            />
                            <span className="text-xs text-gray-400">Đúng</span>
                          </label>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                options: d.options.map((o, i) => (i === oIdx ? { ...o, isCorrect: !o.isCorrect } : o)),
                              }))
                            }
                            className={`mt-2.5 flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md transition ${
                              opt.isCorrect
                                ? 'bg-green-600 text-white hover:bg-green-500'
                                : 'bg-white/10 text-gray-300 hover:bg-white/20'
                            }`}
                          >
                            {opt.isCorrect ? 'Đúng' : 'Sai'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">Lời giải (LaTeX)</label>
                <textarea
                  value={draft.solution}
                  onChange={(e) => setDraft((d) => ({ ...d, solution: e.target.value }))}
                  rows={10}
                  spellCheck={false}
                  className="w-full text-[13px] font-mono leading-relaxed bg-[#141517] border border-white/10 rounded-lg p-3 text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
              {/* Ô sửa đáp số — chỉ hiện với câu Trả lời ngắn (Phần III), vì
                  chỉ loại câu này có ô đáp số riêng hiển thị dạng 4 ô vuông. */}
              {partition === 'p3' && (
                <div>
                  <label className="text-xs font-semibold text-gray-400 mb-1 block">
                    Đáp số <span className="text-gray-500 font-normal">(tối đa 4 ký tự, hiển thị dạng ô vuông)</span>
                  </label>
                  <input
                    type="text"
                    value={draft.answer}
                    onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
                    maxLength={4}
                    spellCheck={false}
                    className="w-32 text-[13px] font-mono leading-relaxed bg-[#141517] border border-white/10 rounded-lg p-3 text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Footer: Hủy / Lưu */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10 bg-[#26282c] flex-shrink-0">
              <button
                onClick={onCancelEdit}
                className="text-gray-300 hover:text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-white/10 transition"
              >
                Hủy
              </button>
              <button
                onClick={() => onSaveEdit(partition, q.id)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-md transition"
              >
                💾 Lưu
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Icon thư mục có mũi tên (dùng để tải file .tex lẫn tải thư mục ảnh) — 1
// icon duy nhất, dùng chung cho cả 2 khối tải lên để đỡ rối mắt vì quá nhiều
// icon khác nhau trong cùng 1 khu vực nhỏ.
function UploadFolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h4l1.7 2h8.3a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-10Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 12.5v5m0-5 2.2 2.2M12 12.5l-2.2 2.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Icon quyển vở/sách mở ra — dùng cho tab con "Xem đề" thay cho emoji 📖 (một
// số máy/trình duyệt hiển thị emoji này thành ô vuông rỗng thay vì hình quyển
// sách, nên đổi hẳn sang icon SVG tự vẽ cho chắc chắn hiển thị đúng mọi nơi).
function OpenBookIcon({ className }: { className?: string }) {
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

// TRUNG TÂM CẤU HÌNH PHÒNG THI (Teacher Dashboard) — mặc định dùng cho MỌI
// đề chưa từng lưu cài đặt riêng (đề mới toanh, hoặc đề cũ không có field
// tương ứng trong settings đã lưu). Tách RA NGOÀI component (module-level,
// không tạo lại object mỗi lần render) để dùng lại được ở CẢ initial state
// (useState) VÀ lúc bấm "+ Tạo đề mới" (handleNewExam) — trước đây chỉ có ở
// initial state, nên "Tạo đề mới" không reset lại (state cũ của đề đang sửa
// vẫn còn nguyên), khiến ví dụ imageScalePercent để 120% ở đề A rồi bấm "Tạo
// đề mới"/mở đề B (đề B chưa từng lưu cài đặt này) vẫn thấy 120% chứ không
// tự quay về 100% như mong đợi.
const DEFAULT_EXAM_SETTINGS = {
  viewMode: 'azota' as 'azota' | 'a4', // Giao diện hiển thị đề
  duration: 45, // Thời gian làm bài (phút)
  shuffle: false, // Trộn câu hỏi và đáp án
  // THÊM MỚI: 'after_close' = tự động mở lời giải khi tất cả đã thi xong
  // (giờ đóng đề của lớp + thời gian làm bài); 'custom_time' = GV tự đặt 1
  // mốc giờ cụ thể (solutionOpenAt) — xem chi tiết trong examAccessRules.ts.
  showSolution: 'after_submit' as 'after_submit' | 'never' | 'after_close' | 'custom_time',
  solutionOpenAt: '' as string, // ISO string, chỉ dùng khi showSolution = 'custom_time'
  // THÊM MỚI: số lần học sinh được TỰ làm lại (không cần GV bấm "Cho làm
  // lại"). 0 = không giới hạn (mặc định, theo đúng yêu cầu giáo viên).
  maxAttempts: 0,
  // THÊM MỚI (giờ mở/đóng đề MẶC ĐỊNH — áp dụng cho MỌI lớp được giao đề
  // này): trước đây giờ mở/đóng chỉ cấu hình được ở panel "Giao đề" của
  // TỪNG lớp riêng lẻ, nên giao 1 đề cho nhiều lớp cùng khung giờ phải
  // nhập lại nhiều lần. Giờ đặt Ở ĐÂY 1 lần là áp dụng chung cho tất cả
  // lớp — lớp nào cần khung giờ RIÊNG khác mặc định này thì vào panel
  // "Giao đề" của lớp đó, bật "Dùng cài đặt riêng cho lớp này" để ghi đè.
  // Dạng chuỗi datetime-local cho input, rỗng = không giới hạn giờ đó.
  openAt: '' as string,
  closeAt: '' as string,
  // THÊM MỚI: thang điểm mỗi phần — mặc định đúng barem Toán THPT hiện
  // hành (Phần I 0.25đ/câu, Phần II tối đa 1đ/câu chia bậc theo số ý đúng,
  // Phần III 0.5đ/câu, Phần IV 0.5đ/câu). GV chỉnh trong Cài đặt nếu đề
  // không theo barem này.
  scoring: { p1PerQuestion: 0.25, p2FullPoints: 1, p3PerQuestion: 0.5, p4PerQuestion: 0.5 },
  // (27-7) ĐÃ GỠ BỎ chức năng GV tự chỉnh +/- cỡ hình (nút +/- ở tab "Xem
  // đề" và tab "Cài đặt") theo yêu cầu — không còn UI nào ghi đè giá trị
  // này nữa, nên nó LUÔN LÀ 100 (giữ nguyên mặc định gốc). Vẫn giữ field +
  // toàn bộ logic đọc nó ở renderExamText/TikzImage phía dưới (không đụng
  // tới, không liên quan tới việc gỡ UI +/-) để cỡ hình TikZ hiển thị đúng
  // 100% * TIKZ_DISPLAY_BASE_SCALE (140%) như code gốc, không hơn không kém.
  imageScalePercent: 100,
};

export default function ExamBuilder({
  onGoToClasses,
}: {
  // THÊM MỚI: callback do trang cha (page.tsx) truyền xuống để chuyển sang
  // tab "Quản lý lớp" ngay trong 1 cú bấm — dùng ở nút trong modal "Đã xuất
  // bản đề thi" bên dưới (xem showPublishSuccessModal). Optional để component
  // vẫn dùng được độc lập (ví dụ nếu sau này có trang test riêng) nếu không
  // ai truyền prop này xuống.
  onGoToClasses?: () => void;
} = {}) {
  const [data, setData] = useState<any>(null);

  // ==========================================
  // TRUNG TÂM CẤU HÌNH PHÒNG THI (Teacher Dashboard)
  // ==========================================
  // viewMode: 'azota' = danh sách dạng thẻ card (như hiện tại) | 'a4' = giả
  // lập tờ giấy A4 (khung trắng cố định kích thước, đổ bóng, có lề).
  // Các cài đặt còn lại (duration/shuffle/showSolution) là bước đệm cho phần
  // "Phòng thi học sinh" làm sau — hiện tại lưu trạng thái sẵn, chưa có logic
  // đếm giờ/trộn đề/khoá lời giải (sẽ nối vào ở bước tiếp theo).
  const [examSettings, setExamSettings] = useState(DEFAULT_EXAM_SETTINGS);

  // examMode: 'setup' = giáo viên đang cấu hình/xem đề (giao diện hiện tại) |
  // 'live' = phòng thi đang mở, hiển thị StudentExamView (giao diện học sinh
  // làm bài — ẩn hết công cụ giáo viên, có đồng hồ đếm giờ, chọn đáp án, nộp
  // bài, chấm điểm). liveExamData là bản sao của `data` tại thời điểm bấm
  // "Kích hoạt Phòng Thi" — nếu bật trộn đề thì đã được xáo trộn thứ tự câu
  // hỏi/phương án; tách riêng khỏi `data` gốc để giáo viên sửa đề sau đó
  // không làm thay đổi đề đang thi.
  const [examMode, setExamMode] = useState<'setup' | 'live'>('setup');
  // THAY ĐỔI: liveExamData giờ giữ bản GỐC CHƯA TRỘN (giống hệt session.raw_data
  // ở trang thật) — việc trộn đề (nếu bật) do CHÍNH StudentTakeExam tự làm ở
  // bên trong (buildDisplayData), KHÔNG trộn sẵn ở đây nữa. Lý do: dùng lại
  // đúng 1 component thật (StudentTakeExam) cho cả 2 nơi thì phải đưa đúng
  // loại input mà nó mong đợi, tránh trộn 2 lần hoặc lệch quy ước _origIdx.
  const [liveExamData, setLiveExamData] = useState<any>(null);
  // Mỗi lần bấm "Xem mô phỏng" tạo 1 submissionId giả MỚI (timestamp) — dùng
  // làm khoá sessionStorage progress riêng cho StudentTakeExam, đảm bảo mỗi
  // lần bấm luôn là 1 phòng thi mới tinh, không dính bài làm/kết quả cũ.
  const [previewSubmissionId, setPreviewSubmissionId] = useState('');
  const [previewEndAt, setPreviewEndAt] = useState(0);
  // Kết quả sau khi GV bấm "Nộp bài" trong màn xem trước — chấm HOÀN TOÀN ở
  // client (previewMode), không tạo bản ghi thật nào trong DB.
  const [previewResult, setPreviewResult] = useState<null | {
    score: number;
    total: number;
    scorePoints?: number;
    maxScorePoints?: number;
    showSolution: boolean;
    solutionData?: { examData: any; p1Answers: P1Answers; p2Answers: P2Answers; textAnswers: TextAnswers; scoring?: ScoringSettings };
  }>(null);
  const [previewShowSolutionView, setPreviewShowSolutionView] = useState(false);
  // SỬA (khiếu nại "tab Cài đặt rối"): khối "Thang điểm" có tới 3 ô nhập +
  // 2 dòng ghi chú, chiếm nhiều chỗ nhất trong 3 cột cấu hình -> gói lại
  // thành dạng xổ (accordion), mặc định ĐÓNG, chỉ hiện dòng tóm tắt (tổng
  // điểm tối đa) — bấm vào mới xổ ra đủ 3 ô nhập để chỉnh.
  const [scoringOpen, setScoringOpen] = useState(false);

  // ==========================================
  // XUẤT PDF NHIỀU MÃ ĐỀ (in giấy, làm hoàn toàn client, không cần DB)
  // ==========================================
  // examCodeCount: giáo viên tự gõ số lượng mã đề muốn xuất — KHÔNG cố định
  // 4 hay 5, có thể là 1, 2, 10... printCodes: mảng {code, data} đã "đóng
  // băng" tại thời điểm bấm xuất (mỗi mã trộn random độc lập qua
  // generateExamCodes) — null nghĩa là chưa xuất/đã đóng khung xem trước.
  const [examCodeCount, setExamCodeCount] = useState(4);
  const [printCodes, setPrintCodes] = useState<{ code: string; data: any }[] | null>(null);

  // THAY THẾ window.print(): trước đây nút "In / Lưu PDF" chỉ mở hộp thoại
  // in gốc của trình duyệt (GV tự chọn "Save as PDF" trong đó, chất lượng
  // phụ thuộc render CSS của trình duyệt). Giờ gọi thẳng
  // POST /api/exams/export-pdf-codes để server dựng file PDF THẬT bằng
  // pandoc/xelatex rồi tải trực tiếp về máy — không cần thao tác gì thêm ở
  // hộp thoại in.
  const [isExportingPdfCodes, setIsExportingPdfCodes] = useState(false);
  const [pdfCodesExportError, setPdfCodesExportError] = useState('');

  // `document` chỉ tồn tại ở phía client, nên createPortal chỉ được gọi SAU
  // khi component đã mount xong ở browser — tránh lỗi hydration mismatch
  // giữa server (render null) và client (render vào document.body).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // THÊM MỚI (mục 4): panel "Danh sách đề đã lưu" giờ thường trực (không
  // còn phải bấm mới hiện) — nạp danh sách + thư mục tự tạo ngay khi mount.
  useEffect(() => {
    refreshSavedExamsList();
    try {
      const raw = localStorage.getItem('examBuilderManualFolders');
      if (raw) setManualFolders(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THÊM MỚI: tên tệp .tex (hoặc nhãn "Nội dung dán trực tiếp") ĐANG được
  // dùng để tạo ra `data` hiện tại — hiển thị cố định (đóng băng) ở thanh
  // trạng thái nguồn dữ liệu, để luôn biết chắc đề đang xem đến từ đâu, và
  // để việc tải LẠI đúng tệp đó luôn được nhận diện rõ ràng là một lần cập
  // nhật mới (không phải "chọn lại không có gì xảy ra").
  const [texFileName, setTexFileName] = useState<string>('');

  // THÊM MỚI: tên đề thi giáo viên gõ tay để lưu lên MongoDB (collection exams),
  // mặc định lấy theo tên tệp .tex vừa xử lý cho tiện, giáo viên có thể sửa
  // lại tuỳ ý trước khi bấm "Lưu đề thi lên MongoDB".
  const [examTitle, setExamTitle] = useState<string>('');
  const [isSavingExamMongo, setIsSavingExamMongo] = useState(false);
  // THÊM MỚI (mục 2 — cập nhật đề đã lưu, giữ nguyên link): khi mở lại 1 đề
  // đã lưu qua loadSavedExam(), currentExamId ghi nhớ _id MongoDB của đề đó.
  // saveExamToMongo/publishExam sẽ PATCH tới đúng _id này (cập nhật tại chỗ,
  // giữ nguyên link /thi/[id] công khai cũ) thay vì POST tạo bản ghi mới.
  // null = đang soạn đề MỚI (chưa từng lưu, hoặc vừa bấm "+ Tạo đề mới") ->
  // lần Lưu/Xuất bản tới sẽ tạo bản ghi mới như trước giờ.
  const [currentExamId, setCurrentExamId] = useState<string | null>(null);

  // THÊM MỚI (Phần 1 - HANDOFF-PHAN3-LIVEQUIZ.md): banner rẽ nhánh
  // "Tạo đề / Trình chiếu trực tiếp" — bật đúng 1 lần ngay khi vừa biên
  // dịch xong 1 đề (xem processExamText), tự đóng khi bấm 1 trong 2 lựa
  // chọn hoặc bấm ✕. Không chặn thao tác nào khác (không phải modal) —
  // GV vẫn dùng "Xem đề"/"Cài đặt" bình thường dù banner còn đang hiện.
  const router = useRouter();


  // SỬA (khiếu nại 26-7: "xoay màn hình / chuyển tab khác thì cỡ hình vừa
  // tăng bị mất, phải chỉnh lại từ đầu"): NGUYÊN NHÂN — examSettings (bao
  // gồm imageScalePercent) chỉ sống trong state React của component này.
  // Nếu đề CHƯA bấm Lưu/Xuất bản, xoay ngang điện thoại hoặc chuyển sang
  // tab/app khác một lúc rồi quay lại có thể khiến trình duyệt (đặc biệt
  // Android Chrome/Safari iOS khi thiếu RAM) TỰ ÂM THẦM TẢI LẠI (reload)
  // tab đang nằm nền để giải phóng bộ nhớ — quay lại thấy giao diện y hệt
  // (Next.js render lại từ đầu) nhưng toàn bộ state đã mất sạch,
  // examSettings rơi về DEFAULT_EXAM_SETTINGS (imageScalePercent = 100) mà
  // không có dấu hiệu nào báo cho GV biết vừa bị tải lại ngầm — trông y hệt
  // như "cỡ hình tự nhiên mất tác dụng".
  // SỬA: tự lưu examSettings vào sessionStorage (sống sót qua việc tab bị
  // tải lại ngầm — chỉ mất khi ĐÓNG HẲN tab, đúng cơ chế đã dùng cho tiến
  // độ làm bài ở StudentTakeExam) mỗi khi có thay đổi, và khôi phục lại
  // đúng bản nháp gần nhất khi mở lại — key phân biệt theo currentExamId
  // (đề đã lưu) hoặc 'new' (đề mới/nháp chưa từng lưu), để nháp của đề A
  // không lẫn sang đề B đang mở sau đó.
  const examSettingsDraftKey = (id: string | null) => `examBuilderSettingsDraft_${id || 'new'}`;

  // Khôi phục nháp — chạy mỗi khi currentExamId đổi (kể cả lúc mount lần
  // đầu, currentExamId = null ứng với đề mới/nháp). Đặt TRƯỚC effect ghi ở
  // dưới để nếu cả 2 cùng chạy trong 1 lượt (vd sau loadSavedExam vừa set
  // examSettings từ server VỪA set currentExamId), thứ tự khai báo đảm bảo
  // bản nháp máy đang sửa dở (mới hơn) được áp SAU CÙNG, đè lên đúng như
  // mong đợi — ưu tiên bản đang sửa dở hơn bản đã lưu trên server.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(examSettingsDraftKey(currentExamId));
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && typeof draft === 'object') {
          // (27-7) Đã GỠ tính năng +/- cỡ hình -> KHÔNG khôi phục
          // imageScalePercent từ nháp cũ trong sessionStorage nữa (nháp có
          // thể còn sót giá trị lệch mặc định từ trước khi gỡ UI, khiến "Xem
          // đề"/"Xem mô phỏng" hiện nhỏ/to hơn "Trang học sinh thật"/"Lời
          // giải" dù cả 2 cùng đọc chung TIKZ_DISPLAY_BASE_SCALE — đây chính
          // là nguyên nhân 2 nhóm trang lệch cỡ nhau, KHÔNG liên quan gì tới
          // TIKZ_DISPLAY_BASE_SCALE hay logic render). Các field khác
          // (duration, shuffle, scoring...) vẫn khôi phục bình thường như cũ.
          const { imageScalePercent: _ignoredStaleImageScale, ...restDraft } = draft;
          setExamSettings((s) => ({ ...s, ...restDraft }));
        }
      }
    } catch {
      // Bỏ qua nếu trình duyệt chặn sessionStorage hoặc dữ liệu lưu bị hỏng.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExamId]);

  useEffect(() => {
    try {
      // (27-7) Không cần lưu imageScalePercent vào nháp nữa (không còn UI
      // nào thay đổi được field này — luôn cố định ở DEFAULT_EXAM_SETTINGS).
      const { imageScalePercent: _omitImageScale, ...settingsToPersist } = examSettings;
      sessionStorage.setItem(examSettingsDraftKey(currentExamId), JSON.stringify(settingsToPersist));
    } catch {
      // Bỏ qua nếu trình duyệt chặn sessionStorage (chế độ ẩn danh nghiêm ngặt...).
    }
  }, [examSettings, currentExamId]);
  // THÊM MỚI: modal "Danh sách đề đã lưu" — showSavedExamsModal điều khiển
  // hiện/ẩn, savedExamsList là danh sách rút gọn (chỉ title + ngày, không
  // có raw_data) lấy từ GET /api/exams, loadingExamId là id đề đang bấm "Mở"
  // (để hiện spinner đúng dòng đang tải, các dòng khác vẫn bấm được).
  const [showSavedExamsModal, setShowSavedExamsModal] = useState(false);
  const [savedExamsList, setSavedExamsList] = useState<
    { _id: string; title: string; created_at: string; folder?: string; is_published?: boolean }[]
  >([]);
  const [isLoadingSavedExamsList, setIsLoadingSavedExamsList] = useState(false);
  const [savedExamsError, setSavedExamsError] = useState('');
  const [loadingExamId, setLoadingExamId] = useState<string | null>(null);
  // THÊM MỚI (mục 4): builderSubTab điều khiển 3 tab con trong khu vực soạn
  // đề — 'upload' (tải file/dán .tex + thư mục ảnh), 'view' (xem/soát câu
  // hỏi), 'settings' (cài đặt phòng thi + tên đề + xuất bản). Trước đây cả
  // 3 khối luôn hiện chồng lên nhau theo chiều dọc, giờ tách rõ từng tab.
  const [builderSubTab, setBuilderSubTab] = useState<'upload' | 'view' | 'settings'>('upload');
  // THÊM MỚI (mục 4): danh sách tên thư mục do GV tự tạo (nút "+ Tạo thư
  // mục") — lưu localStorage để giữ được các thư mục CHƯA có đề nào trong
  // đó (MongoDB chỉ biết folder khi có ít nhất 1 đề mang tên đó).
  const [manualFolders, setManualFolders] = useState<string[]>([]);
  const [updatingExamId, setUpdatingExamId] = useState<string | null>(null);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
  // THÊM MỚI: state cho luồng "Xuất bản - Lấy link" — showPublishErrorsModal
  // + publishErrors hiện khi soát lỗi không đạt (giống khung đỏ của Azota);
  // showPublishSuccessModal + publishedLink hiện khi xuất bản thành công.
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishErrorsModal, setShowPublishErrorsModal] = useState(false);
  const [publishErrors, setPublishErrors] = useState<string[]>([]);
  const [showPublishSuccessModal, setShowPublishSuccessModal] = useState(false);
  const [publishedLink, setPublishedLink] = useState('');
  // THÊM MỚI (khiếu nại: "app có API xuất Word nhưng Cài đặt chỉ có xuất
  // PDF"): backend đã có sẵn GET /api/exams/[id]/export-docx (dùng
  // pandoc-wasm dựng file .docx THẬT, công thức Toán sửa được, không phải
  // ảnh chụp) nhưng KHÔNG có nút nào ở giao diện gọi tới — giáo viên không
  // có cách nào bấm ra được. isExportingDocx ghi nhớ ĐANG tải bản nào ('de' =
  // đề riêng không lời giải, 'loigiai' = đề + lời giải) để hiện đúng spinner
  // trên đúng nút, docxExportError hiện lỗi ngay dưới nhóm nút nếu tải lỗi
  // (ví dụ đề chưa lưu, hoặc pandoc lỗi công thức/hình).
  const [isExportingDocx, setIsExportingDocx] = useState<'de' | 'loigiai' | null>(null);
  const [docxExportError, setDocxExportError] = useState('');

  // Ảnh SVG trả về từ Hugging Face cho từng hình TikZ, khoá theo id
  // ([[HÌNH_TIKZ_n]]). Và tiến độ biên dịch để hiển thị thanh trạng thái.
  const [svgMap, setSvgMap] = useState<Record<string, string>>({});
  // SỬA (khiếu nại 27-7: "đề đã xuất bản, đã có hình, mở lại lại báo biên
  // dịch thất bại"): hình TikZ quá nặng được rasterize sang PNG lúc Xuất
  // bản (xem uploadTikzSvgsForSave, RAW_SVG_CLIENT_RASTER_THRESHOLD_BYTES)
  // có `url` trỏ tới 1 file .png, KHÔNG phải .svg. Trước đây bước "mồi lại"
  // ở loadExamData luôn coi MỌI url là SVG — fetch về rồi tìm chuỗi "<svg"
  // trong nội dung; với PNG (dữ liệu nhị phân) chuỗi này KHÔNG BAO GIỜ có,
  // nên hình PNG lúc nào mở lại đề cũng rơi vào nhánh lỗi, hiện nhãn "Hình
  // này biên dịch thất bại" — dù thực ra không hề gọi lại API biên dịch nào
  // cả (không tốn quota), chỉ là bước tải/nhận diện định dạng bị sai, gây
  // hiểu lầm là đang biên dịch lại. Bên trang học sinh (examRender.tsx)
  // không có bug này vì nhánh đó dùng thẳng url làm src ảnh, không hề thử
  // đọc nội dung ra để tìm "<svg". Giờ ExamBuilder.tsx cũng làm tương tự
  // cho riêng trường hợp url là .png: lưu thẳng vào map riêng này (biết
  // ngay là ảnh, không cần tải nội dung về / không cần đoán định dạng),
  // renderTikzAndFormulas đọc map này TRƯỚC khi rơi vào nhánh svgMap.
  const [tikzImgUrlMap, setTikzImgUrlMap] = useState<Record<string, { url: string; w?: number; h?: number }>>({});
  // (26-7) Lưu lại viewBox ĐÃ ĐO ĐÚNG bằng trình duyệt cho từng hình TikZ
  // (báo ra từ callback onCropped của TikzImage, tab "Xem đề") — dùng lúc
  // Lưu/Xuất bản để gửi kèm lên server thay vì để server tự đo lại bằng
  // resvg (2 công cụ đo bbox khác nhau, có thể cắt sai với hình có marker/
  // text — xem giải thích đầy đủ ở tikzCrop.ts). Dùng ref (không phải
  // state) vì chỉ đọc lúc Lưu, không cần trigger re-render mỗi lần đo.
  const tikzCropCacheRef = useRef<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [tikzProgress, setTikzProgress] = useState({ total: 0, done: 0 });
  // (27-7, sửa lỗi "mở đề cũ báo đang biên dịch, kẹt nút Lưu/Xuất bản"):
  // tikzProgress ở trên là 1 bộ đếm rời rạc — nếu 1 lượt fetch/gọi API không
  // bao giờ resolve/reject rõ ràng (mất mạng giữa chừng, effect chạy lại 2
  // lần...) thì done có thể kẹt mãi dưới total dù ảnh đã hiển thị đúng 100%
  // trên màn hình. Tập hợp dưới đây theo dõi ĐÚNG những id đang thật sự có 1
  // lượt gọi AI biên dịch (không phải chỉ tải lại SVG đã lưu) còn treo — dùng
  // Set nên add/remove đều idempotent, không bao giờ lệch số như bộ đếm cộng
  // dồn. Dùng để (a) chọn đúng chữ hiển thị banner, (b) không phải nguồn duy
  // nhất để khoá nút Lưu/Xuất bản nữa — xem tikzPendingCount (sau
  // imageDisplayStats) mới là điều kiện khoá chính, tính trực tiếp từ
  // svgMap/tikzImgUrlMap/tikzFailedMap (luôn đồng bộ với thực tế hiển thị).
  const [realCompilingIds, setRealCompilingIds] = useState<Set<string>>(new Set());

  // Mã TikZ THUẦN (chưa bọc khung \documentclass...) của từng hình, khoá theo
  // id ([[HÌNH_TIKZ_n]]) — lưu lại để có thể mở "Sửa hình" và biên dịch lại
  // đúng mã gốc đó, không cần quay lại file .tex rồi upload lại từ đầu.
  const [tikzSourceMap, setTikzSourceMap] = useState<Record<string, string>>({});
  // THÊM MỚI: với mỗi hình TikZ, danh sách TÊN ẢNH CỨNG (basename) mà chính
  // mã TikZ đó chèn bên trong bằng \includegraphics (khác ảnh ngoài tikz).
  // Dùng để (1) tự động gửi kèm ảnh base64 khi biên dịch — xem
  // buildEmbeddedImagesPayload; và (2) hiển thị cảnh báo nếu ảnh cần dùng
  // chưa có trong thư mục ảnh đã chọn.
  const [tikzEmbeddedMap, setTikzEmbeddedMap] = useState<Record<string, string[]>>({});
  const [editingTikzId, setEditingTikzId] = useState<string | null>(null);
  const [tikzDraft, setTikzDraft] = useState('');
  const [recompilingTikzId, setRecompilingTikzId] = useState<string | null>(null);

  // THÊM MỚI: cấu hình AI (Gemini) dùng để "AI sửa hình" — HỖ TRỢ NHIỀU API
  // key cùng lúc (thay vì 1 key như trước), lưu vào localStorage để lần sau
  // mở lại không phải nhập lại. geminiApiKeys là danh sách key đã lưu,
  // geminiKeyInput là ô nhập key MỚI (chưa lưu), activeKeyIndex là key đang
  // được dùng gần nhất — khi gọi AI, nếu key này lỗi liên tiếp 3 lần thì tự
  // động XOAY sang key kế tiếp trong danh sách (xem requestGeminiTikzEditRotating).
  // aiEditInstruction là ô mô tả yêu cầu sửa bằng lời (ví dụ "đổi màu đường
  // tròn thành đỏ", "thêm điểm E ở giữa AB"...). isAiEditing để hiện trạng
  // thái đang gọi API + khoá nút tránh bấm trùng.
  const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>([]);
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);
  const [geminiModel, setGeminiModel] = useState(GEMINI_MODELS[0].value);
  const [aiEditInstruction, setAiEditInstruction] = useState('');
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [aiEditError, setAiEditError] = useState('');
  // THÊM MỚI: đóng/mở khung "API Model" (API key + chọn model) — thiết kế lại
  // thành popover gọn gàng bung ra từ nút trên thanh tiêu đề modal, thay vì
  // chiếm chỗ cố định như <details> cũ. Tự bung sẵn nếu chưa có API key.
  const [showApiSettings, setShowApiSettings] = useState(false);

  // Nạp danh sách API key + model đã lưu (nếu có) ngay khi component mount.
  // Vẫn đọc key "gemini_api_key" (bản CŨ chỉ hỗ trợ 1 key) để KHÔNG làm mất
  // key người dùng đã lưu từ trước khi nâng cấp lên nhiều key.
  useEffect(() => {
    try {
      const savedKeysRaw = localStorage.getItem('gemini_api_keys');
      if (savedKeysRaw) {
        const parsed = JSON.parse(savedKeysRaw);
        if (Array.isArray(parsed)) {
          setGeminiApiKeys(parsed.filter((k) => typeof k === 'string' && k.trim()));
        }
      } else {
        const legacyKey = localStorage.getItem('gemini_api_key');
        if (legacyKey) setGeminiApiKeys([legacyKey]);
      }
      const savedIndex = Number(localStorage.getItem('gemini_active_key_index'));
      if (Number.isFinite(savedIndex) && savedIndex >= 0) setActiveKeyIndex(savedIndex);
      const savedModel = localStorage.getItem('gemini_model');
      if (savedModel && GEMINI_MODELS.some((m) => m.value === savedModel)) setGeminiModel(savedModel);
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage (chế độ ẩn danh...).
    }
  }, []);

  // Lưu lại danh sách key + chỉ số key đang dùng + model mỗi khi đổi.
  useEffect(() => {
    try {
      localStorage.setItem('gemini_api_keys', JSON.stringify(geminiApiKeys));
    } catch {}
  }, [geminiApiKeys]);
  useEffect(() => {
    try {
      localStorage.setItem('gemini_active_key_index', String(activeKeyIndex));
    } catch {}
  }, [activeKeyIndex]);
  useEffect(() => {
    try {
      localStorage.setItem('gemini_model', geminiModel);
    } catch {}
  }, [geminiModel]);

  // Lưu 1 key mới vào danh sách (bỏ qua nếu rỗng hoặc đã có sẵn key này).
  const saveGeminiKey = () => {
    const key = geminiKeyInput.trim();
    if (!key) return;
    setGeminiApiKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setGeminiKeyInput('');
  };

  // Xoá 1 key khỏi danh sách theo vị trí; đưa key đang dùng về đầu danh sách
  // cho chắc ăn (tránh lệch chỉ số sau khi mảng thay đổi độ dài).
  const removeGeminiKey = (idx: number) => {
    setGeminiApiKeys((prev) => prev.filter((_, i) => i !== idx));
    setActiveKeyIndex(0);
  };
  // THÊM MỚI: hình TikZ nào biên dịch THẤT BẠI (cả 2 app đều lỗi) -> lưu
  // thông báo lỗi ngắn gọn theo id. TRƯỚC ĐÂY chỉ console.error rồi dừng lại,
  // khiến hình bị kẹt mãi ở trạng thái "Đang vẽ hình..." (vì svgMap không có
  // key đó và cũng không có tín hiệu nào khác để phân biệt "đang chờ" với
  // "đã thử và thất bại"). BÂY GIỜ hiển thị hẳn thẻ báo lỗi thay vì spinner
  // vô tận, kèm gợi ý sửa nếu nguyên nhân là ảnh cứng chèn trong tikz.
  const [tikzFailedMap, setTikzFailedMap] = useState<Record<string, string>>({});

  // THÊM MỚI: từ tikzFailedMap (chỉ có id kiểu [[HÌNH_TIKZ_n]] và lỗi) ->
  // dò ngược xem id đó nằm trong câu hỏi nào (quét q.content + q.solution
  // của cả 4 phần) để báo rõ "Phần mấy - Câu mấy - Hình số mấy" thay vì chỉ
  // đếm số lượng, vì id hình được đánh số TOÀN VĂN BẢN (không theo câu) nên
  // người dùng không tự suy ra được hình lỗi thuộc câu nào.
  const failedTikzLocations = useMemo(() => {
    if (!data || Object.keys(tikzFailedMap).length === 0) return [];
    const partsMeta: { tab: Partition; tabLabel: string; list: any[] }[] = [
      { tab: 'p1', tabLabel: 'Phần 1', list: data.phan_1_TracNghiem || [] },
      { tab: 'p2', tabLabel: 'Phần 2', list: data.phan_2_DungSai || [] },
      { tab: 'p3', tabLabel: 'Phần 3', list: data.phan_3_TraLoiNgan || [] },
      { tab: 'p4', tabLabel: 'Phần 4', list: data.phan_4_TuLuan || [] },
    ];
    return Object.keys(tikzFailedMap).map((tikzId) => {
      const soHinh = tikzId.match(/HÌNH_TIKZ_(\d+)/)?.[1] || '?';
      let location: { tab: Partition; text: string; qId: string } | null = null;
      for (const part of partsMeta) {
        for (let i = 0; i < part.list.length; i++) {
          const q = part.list[i];
          const haystack = `${q.content || ''}\n${q.solution || ''}`;
          if (haystack.includes(tikzId)) {
            location = { tab: part.tab, text: `${part.tabLabel} — ${q.label || 'Câu'} ${i + 1}`, qId: q.id };
            break;
          }
        }
        if (location) break;
      }
      return { tikzId, soHinh, location };
    });
  }, [data, tikzFailedMap]);

  // ĐÃ BỎ (khiếu nại: "thanh zoom không có tác dụng, bỏ luôn"): trước đây có
  // tikzScaleMap/fileImageScaleMap để mỗi hình tự chỉnh % qua thanh trượt —
  // toàn bộ hình giờ hiển thị cố định 100% (đúng kích thước gốc sau khi đã
  // crop khoảng trắng), không còn state/getter này nữa.

  // THÊM MỚI: Ảnh \includegraphics{...} nằm NGOÀI tikz — không gửi HF, chỉ
  // hiển thị trực tiếp. imageMap khoá theo TÊN FILE CUỐI CÙNG (basename, vd
  // "cau5.png") -> blobURL tạo từ file người dùng chọn trong thư mục ảnh.
  // Dùng basename làm khoá (không dùng nguyên webkitRelativePath) vì đường
  // dẫn ghi trong lệnh \includegraphics{hinh/cau5.png} của đề gốc thường
  // KHÔNG khớp đúng cấu trúc thư mục con trên máy người chọn — chỉ tên file
  // cuối là đáng tin cậy để khớp.
  // Giữ state này ĐỘC LẬP với dữ liệu đề thi (data) và KHÔNG reset khi upload
  // .tex mới — người dùng có thể chọn thư mục ảnh 1 lần rồi upload nhiều đề
  // dùng chung ảnh, hoặc chọn lại bất cứ lúc nào.
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  // THÊM MỚI (Bước 3.1 mục 2): giữ lại File gốc song song với imageMap (chỉ
  // có blob: URL, không đủ để gửi lên server) — dùng LÚC XUẤT BẢN để upload
  // thật lên Vercel Blob (xem uploadHardImagesForPublish bên dưới). Dùng ref
  // (không phải state) vì không cần render lại khi cập nhật, chỉ đọc 1 lần
  // lúc bấm "Xuất bản".
  const imageFileMapRef = useRef<Record<string, File>>({});
  // THÊM MỚI: hỗ trợ NHIỀU thư mục ảnh cùng lúc (trước đây chỉ lưu tên thư
  // mục CUỐI CÙNG được chọn, chọn thêm thư mục khác là mất tên thư mục cũ dù
  // ảnh vẫn còn dùng được). Mỗi phần tử là 1 thư mục đã nạp kèm số ảnh của
  // riêng thư mục đó, hiển thị thành danh sách rõ ràng ở thanh trạng thái.
  const [imageFolders, setImageFolders] = useState<{ name: string; count: number }[]>([]);
  // SỬA (mục 2 - GHI-CHU-TON-DONG-18-7.md, phần A): state dismissImageBanner
  // dùng cho banner cũ ở tab "Tải file" đã bị bỏ (không ai từng thấy banner
  // đó — xem ghi chú tại vị trí banner cũ).
  // THÊM MỚI (mục 2, phần B): popup thay thế banner cũ — hiện ĐÚNG 1 lần,
  // ngay lúc vừa tự nhảy sang tab "Xem đề" sau khi tải file/dán đề, nếu đề
  // đó thiếu ảnh cứng.
  const [showMissingImagePopup, setShowMissingImagePopup] = useState(false);
  // GV bấm "Bỏ qua" trên popup -> true, để không tự bật lại phiền trong CÙNG
  // phiên soạn đề này dù imageMap/data có thay đổi vặt khác. loadExamData()
  // reset về false mỗi khi nạp đề MỚI (xem bên trong hàm đó).
  const [missingImagePopupDismissed, setMissingImagePopupDismissed] = useState(false);
  // Cờ báo "vừa mới load đề xong, đang chờ xác nhận có thiếu ảnh hay không".
  // Dùng useRef (không phải state) vì processExamText set cờ này ngay sau khi
  // gọi loadExamData()+setBuilderSubTab('view') — tại thời điểm đó
  // tikzMissingEmbeddedMap/standaloneMissingImages (useMemo phụ thuộc
  // data/imageMap/tikzEmbeddedMap) vẫn đang mang giá trị của lần render TRƯỚC
  // (React chưa re-render), nên không thể đọc trực tiếp ngay tại đó. Phải
  // chờ effect bên dưới chạy lại sau khi re-render xong mới đọc được giá trị
  // memo mới, nên chỉ cần 1 lá cờ đơn giản báo "đang chờ", không cần render
  // lại khi cờ đổi giá trị.
  const justLoadedExamRef = useRef(false);
  // Đuôi file ảnh hợp lệ — dùng làm phương án dự phòng khi trình duyệt
  // không tự gán được file.type (xem ghi chú bên dưới), để không bỏ sót
  // ảnh thật chỉ vì OS/trình duyệt không nhận diện đúng MIME type.
  const IMAGE_EXTENSIONS = [
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'avif', 'tif', 'tiff',
  ];
  const isImageFile = (file: File) => {
    if (file.type.startsWith('image/')) return true;
    // file.type do trình duyệt "đoán" theo đăng ký MIME của hệ điều hành
    // dựa vào đuôi file, KHÔNG đọc nội dung file thật. Khi chọn cả thư
    // mục (webkitdirectory), rất hay gặp file.type trả về rỗng ("") dù
    // file đúng là ảnh (đuôi hoa .JPG, .webp/.heic/.bmp trên máy thiếu
    // đăng ký MIME, v.v...) — nếu chỉ dựa vào file.type, ảnh bị âm thầm
    // loại bỏ, GV chọn đúng thư mục mà không thấy ảnh nào được nạp.
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return IMAGE_EXTENSIONS.includes(ext);
  };
  // SỬA LỖI (GV phản ánh: "chọn đúng thư mục mà vẫn báo thiếu ảnh"): LaTeX
  // thường ghi \includegraphics{...} KHÔNG kèm đuôi file (trình biên dịch
  // tự dò đuôi lúc build PDF, ví dụ \includegraphics{images/Hinh17} — xem
  // ví dụ thực tế GV gửi), nên baseName tách từ path trong parser.ts CŨNG
  // không có đuôi. Trong khi đó file ảnh THẬT GV chọn từ thư mục trên máy
  // luôn có đuôi (Hinh17.png). Trước đây mọi nơi so khớp `imageMap[baseName]`
  // là so khớp CHUỖI TUYỆT ĐỐI -> "Hinh17" không bao giờ khớp "Hinh17.png",
  // dù đúng ảnh, đúng thư mục -> luôn báo "thiếu ảnh".
  // GV yêu cầu (chat 29-8): chỉ cần TÊN ảnh đúng, KHÔNG quan tâm có ghi đuôi
  // trong LaTeX hay không, đuôi khác nhau (vd .png vs .PNG) hay thậm chí
  // đuôi hai bên khác hẳn nhau (Hinh17.png khớp Hinh17.jpg vẫn coi là 1) —
  // nên bỏ hẳn bước so khớp đuôi, LUÔN so theo TÊN ĐÃ BỎ ĐUÔI (không phân
  // biệt hoa/thường) ở cả 2 phía, không còn ưu tiên khớp tuyệt đối trước.
  // SỬA LỖI (GV phản ánh 29-8: "thêm đuôi vào vẫn báo thiếu ảnh, xóa đuôi cả
  // 2 mới nhận"): nguyên nhân là file bị ĐÚP ĐUÔI kiểu "Hinh17.PNG.png" — do
  // Windows Explorer mặc định ẨN đuôi file đã biết, GV tưởng file chưa có
  // đuôi nên tự gõ thêm ".png" vào, vô tình nối chồng lên đuôi gốc đã có sẵn
  // (nhưng bị ẩn) -> tên file thật có 2 lớp đuôi. Regex cũ chỉ cắt ĐÚNG 1 lớp
  // đuôi cuối cùng nên "hinh17.png.png" chỉ cắt còn "hinh17.png" (vẫn dư 1
  // lớp), không khớp với "hinh17" bên LaTeX -> vẫn báo thiếu dù đã đúng ảnh.
  // Nay lặp cắt LIÊN TỤC, mỗi lần chỉ cắt nếu đuôi đó có trong danh sách
  // IMAGE_EXTENSIONS đã khai báo ở trên (tránh cắt nhầm dấu chấm khác không
  // phải đuôi ảnh, ví dụ tên file "Hinh.17" không bị đụng tới phần ".17"),
  // cho tới khi không còn đuôi ảnh hợp lệ nào ở cuối nữa — dù GV lỡ đúp 1
  // lớp hay nhiều lớp đuôi đều tự quy về đúng 1 tên gốc duy nhất.
  const IMAGE_EXT_SUFFIX_RE = new RegExp(`\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i');
  const stripImageExt = (name: string): string => {
    let result = name;
    while (IMAGE_EXT_SUFFIX_RE.test(result)) {
      result = result.replace(IMAGE_EXT_SUFFIX_RE, '');
    }
    return result.toLowerCase();
  };
  const findImageMapKey = <T,>(
    map: Record<string, T>,
    baseName: string
  ): string | undefined => {
    const target = stripImageExt(baseName);
    return Object.keys(map).find((k) => stripImageExt(k) === target);
  };
  const resolveImageUrl = (map: Record<string, string>, baseName: string): string | undefined => {
    const key = findImageMapKey(map, baseName);
    return key !== undefined ? map[key] : undefined;
  };

  const handleImageFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const map: Record<string, string> = {};
    let folderLabel = '';
    let count = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // webkitRelativePath dạng "TenThuMuc/hinh_anh/cau5.png" — chỉ chọn
      // những file là ảnh, bỏ qua file khác lỡ lọt vào thư mục.
      if (!isImageFile(file)) continue;
      const relPath = (file as any).webkitRelativePath || file.name;
      if (!folderLabel) folderLabel = relPath.split('/')[0] || '';
      const baseName = relPath.split('/').pop() || file.name;
      map[baseName] = URL.createObjectURL(file);
      imageFileMapRef.current[baseName] = file;
      count++;
    }
    // Gộp với ảnh đã chọn trước đó (nếu người dùng chọn thêm thư mục khác)
    // thay vì ghi đè mất, để hỗ trợ trường hợp ảnh nằm rải ở nhiều thư mục.
    setImageMap((prev) => ({ ...prev, ...map }));
    if (folderLabel) {
      setImageFolders((prev) => {
        // Chọn LẠI đúng thư mục đã có (trùng tên) -> cập nhật số ảnh mới
        // thay vì cộng dồn thêm 1 dòng trùng lặp trong danh sách hiển thị.
        const exists = prev.some((f) => f.name === folderLabel);
        if (exists) return prev.map((f) => (f.name === folderLabel ? { name: folderLabel, count } : f));
        return [...prev, { name: folderLabel, count }];
      });
    }
    // Cho phép chọn lại đúng thư mục vừa chọn (nếu bấm lại) — browser coi
    // giá trị "không đổi" nên phải reset value để bắn lại sự kiện onChange.
    e.target.value = '';
  };

  // THÊM MỚI: gỡ 1 thư mục ảnh khỏi danh sách đã nạp. Vì imageMap chỉ khoá
  // theo basename (không lưu ảnh đó thuộc thư mục nào), thao tác này chỉ gỡ
  // dòng hiển thị — nếu 2 thư mục có ảnh trùng tên thì ảnh vẫn còn dùng
  // được. Muốn xoá sạch toàn bộ ảnh, dùng "Xoá tất cả ảnh" bên dưới.
  const removeImageFolderChip = (name: string) => {
    setImageFolders((prev) => prev.filter((f) => f.name !== name));
  };

  const clearAllImages = () => {
    setImageMap({});
    setImageFolders([]);
    imageFileMapRef.current = {};
  };

  // Tra path gốc ghi trong \includegraphics{...} theo id [[HÌNH_FILE_n]],
  // lấy từ data.image_list do parser.ts sinh ra.
  const imagePathMap = useMemo(() => {
    const map: Record<string, string> = {};
    (data?.image_list || []).forEach((img: { id: string; path: string }) => {
      map[img.id] = img.path;
    });
    return map;
  }, [data]);

  // THÊM MỚI: với mỗi hình TikZ có ảnh cứng bên trong, tính xem còn thiếu
  // ảnh nào so với imageMap hiện tại — tự cập nhật ngay khi người dùng chọn
  // thêm thư mục ảnh, không cần đợi biên dịch lại mới thấy hết cảnh báo.
  const tikzMissingEmbeddedMap = useMemo(() => {
    const result: Record<string, string[]> = {};
    Object.entries(tikzEmbeddedMap).forEach(([id, names]) => {
      // SỬA (câu hỏi: "mở lại đề đã lưu để sửa có bị mất ảnh không?"): nếu
      // hình này ĐÃ có sẵn svg (đã biên dịch/lưu từ trước — svgMap[id] chỉ
      // có thể true ở đây nhờ existingSvgMap trong loadExamData, tức ảnh
      // cứng bên trong đã được "nướng" sẵn vào chính SVG đó rồi), KHÔNG báo
      // thiếu dù imageMap (bộ nhớ local phiên hiện tại) chưa có file tương
      // ứng — tránh báo giả mỗi lần mở lại đề đã lưu để xem/sửa câu chữ. GV
      // chỉ cần chọn lại đúng thư mục ảnh nếu thật sự muốn SỬA/biên dịch lại
      // riêng hình TikZ đó (lúc đó tikzSourceMap/editingTikzId sẽ dùng
      // imageMap để build payload gửi biên dịch, không liên quan map này).
      if (svgMap[id] || tikzImgUrlMap[id]) return;
      const missing = names.filter((n) => !imageMap[n]);
      if (missing.length > 0) result[id] = missing;
    });
    return result;
  }, [tikzEmbeddedMap, imageMap, svgMap, tikzImgUrlMap]);

  // THÊM MỚI: banner "nhắc ảnh cứng" phía dưới (dismissImageBanner) TRƯỚC ĐÂY
  // chỉ xét tikzMissingEmbeddedMap — tức là CHỈ phát hiện \includegraphics
  // chèn CỨNG BÊN TRONG mã TikZ. \includegraphics đứng RIÊNG, NGOÀI mọi khối
  // tikz (mốc [[HÌNH_FILE_n]], parser.ts đã tách sẵn vào data.image_list) lại
  // KHÔNG được banner này biết tới -> đề chỉ có loại ảnh này (không có ảnh
  // cứng nào chèn trong TikZ) thì GV không hề được nhắc, phải tự kéo xuống
  // từng câu mới thấy khung đỏ "Thiếu ảnh: ...". Giờ quét thêm data.image_list
  // so với imageMap để không bỏ sót trường hợp này.
  const standaloneMissingImages = useMemo(() => {
    if (!data) return [] as string[];
    const names = new Set<string>();
    (data.image_list || []).forEach((img: { id: string; path: string }) => {
      const baseName = img.path.split('/').pop() || img.path;
      if (!resolveImageUrl(imageMap, baseName)) names.add(baseName);
    });
    return Array.from(names);
  }, [data, imageMap]);

  // THÊM MỚI (mục 3 - GHI-CHU-TON-DONG-18-7.md): tikzMissingEmbeddedMap và
  // standaloneMissingImages ở trên chỉ ĐẾM SỐ LƯỢNG chỗ thiếu ảnh, không biết
  // "câu nào" chứa chỗ thiếu đó — y hệt vấn đề failedTikzLocations đã giải
  // quyết cho hình TikZ LỖI biên dịch. Áp dụng ĐÚNG pattern đó (dò ngược id
  // hình/ảnh trong q.content + q.solution của cả 4 phần) cho cả 2 loại thiếu
  // ảnh, để bất kỳ banner nào liệt kê "N câu thiếu ảnh" đều có thể kèm nút
  // nhảy thẳng tới câu, không còn báo số lượng suông.
  const missingHardImageLocations = useMemo(() => {
    type Loc = { key: string; label: string; location: { tab: Partition; text: string; qId: string } | null };
    if (!data) return [] as Loc[];
    if (Object.keys(tikzMissingEmbeddedMap).length === 0 && standaloneMissingImages.length === 0) {
      return [] as Loc[];
    }
    const partsMeta: { tab: Partition; tabLabel: string; list: any[] }[] = [
      { tab: 'p1', tabLabel: 'Phần 1', list: data.phan_1_TracNghiem || [] },
      { tab: 'p2', tabLabel: 'Phần 2', list: data.phan_2_DungSai || [] },
      { tab: 'p3', tabLabel: 'Phần 3', list: data.phan_3_TraLoiNgan || [] },
      { tab: 'p4', tabLabel: 'Phần 4', list: data.phan_4_TuLuan || [] },
    ];
    // Dò ngược 1 marker id (kiểu [[HÌNH_TIKZ_n]] hoặc [[HÌNH_FILE_n]]) xem
    // nằm trong câu nào — giống hệt vòng lặp trong failedTikzLocations.
    const findLocation = (markerId: string): Loc['location'] => {
      for (const part of partsMeta) {
        for (let i = 0; i < part.list.length; i++) {
          const q = part.list[i];
          const haystack = `${q.content || ''}\n${q.solution || ''}`;
          if (haystack.includes(markerId)) {
            return { tab: part.tab, text: `${part.tabLabel} — ${q.label || 'Câu'} ${i + 1}`, qId: q.id };
          }
        }
      }
      return null;
    };

    const items: Loc[] = [];

    // (a) Ảnh cứng chèn BÊN TRONG mã TikZ còn thiếu — key là chính tikzId
    // ([[HÌNH_TIKZ_n]]), marker này nằm thẳng trong q.content/solution.
    Object.entries(tikzMissingEmbeddedMap).forEach(([tikzId, missingNames]) => {
      const soHinh = tikzId.match(/HÌNH_TIKZ_(\d+)/)?.[1] || '?';
      items.push({
        key: tikzId,
        label: `Hình TikZ ${soHinh} — thiếu ảnh: ${missingNames.join(', ')}`,
        location: findLocation(tikzId),
      });
    });

    // (b) Ảnh cứng đứng riêng ngoài mọi khối tikz còn thiếu — tra ngược từ
    // baseName ra marker [[HÌNH_FILE_n]] tương ứng trong data.image_list rồi
    // mới dò câu chứa marker đó (baseName không xuất hiện trực tiếp trong
    // q.content, chỉ marker mới xuất hiện — xem parser.ts).
    standaloneMissingImages.forEach((baseName) => {
      const img = (data.image_list || []).find(
        (it: { id: string; path: string }) => (it.path.split('/').pop() || it.path) === baseName
      );
      if (!img) return;
      const soHinh = img.id.match(/HÌNH_FILE_(\d+)/)?.[1] || '?';
      items.push({
        key: img.id,
        label: `Ảnh file ${soHinh} — thiếu: ${baseName}`,
        location: findLocation(img.id),
      });
    });

    return items;
  }, [data, tikzMissingEmbeddedMap, standaloneMissingImages]);

  // THÊM MỚI (mục 2, phần B - GHI-CHU-TON-DONG-18-7.md): bật popup nhắc
  // thiếu ảnh cứng ĐÚNG 1 LẦN ngay lúc vừa nhảy sang tab "Xem đề" sau khi
  // tải file/dán đề (processExamText set justLoadedExamRef.current = true
  // ngay sau khi gọi loadExamData()+setBuilderSubTab('view')). Không thể
  // kiểm tra ngay trong processExamText vì tikzMissingEmbeddedMap/
  // standaloneMissingImages là useMemo phụ thuộc data/imageMap/tikzEmbeddedMap
  // — các state đó vừa được set bởi loadExamData() ngay phía trên nên tại
  // thời điểm gọi processExamText, React CHƯA re-render, giá trị memo trong
  // closure vẫn là của lần render TRƯỚC. Effect này chạy lại mỗi khi các map
  // đổi giá trị (tức sau khi re-render xong), nên đọc được giá trị mới nhất.
  useEffect(() => {
    if (!justLoadedExamRef.current) return;
    if (builderSubTab !== 'view') return;
    // Đề vừa nạp không thiếu ảnh -> tắt cờ, không bật popup.
    if (missingHardImageLocations.length === 0) {
      justLoadedExamRef.current = false;
      return;
    }
    justLoadedExamRef.current = false;
    if (!missingImagePopupDismissed) {
      setShowMissingImagePopup(true);
    }
  }, [tikzMissingEmbeddedMap, standaloneMissingImages, builderSubTab, missingHardImageLocations, missingImagePopupDismissed]);

  // THÊM MỚI: sửa gốc vấn đề "dán đề -> biên dịch ngay -> ảnh cứng trong TikZ
  // chưa kịp nạp -> lỗi hàng loạt". Trước đây GV phải nhận ra hình nào lỗi vì
  // thiếu ảnh, mở "Sửa hình" rồi bấm "Lưu & biên dịch lại" TỪNG câu một sau
  // khi đã chọn thư mục ảnh — rất mất công nếu đề có 10-20 câu như vậy.
  // Giờ: hễ imageMap có thêm ảnh mới (chọn thêm thư mục) và 1 hình TikZ đang
  // nằm trong tikzFailedMap mà (a) có chèn ảnh cứng bên trong (tikzEmbeddedMap)
  // và (b) giờ đã đủ hết ảnh cần (tikzMissingEmbeddedMap không còn thiếu gì)
  // -> tự động gửi biên dịch lại NGAY, không cần GV làm gì thêm. Hình nào lỗi
  // vì lý do KHÁC (không liên quan ảnh cứng, ví dụ sai cú pháp TikZ) thì bỏ
  // qua, vẫn giữ nguyên trong tikzFailedMap để GV tự sửa như trước.
  const autoRetryInFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // SỬA: bắt CẢ 2 trường hợp — (a) đã gửi đi và lỗi (nằm trong tikzFailedMap,
    // như trước), VÀ (b) chưa từng được gửi đi vì loadExamData chủ động bỏ
    // qua lúc ảnh còn thiếu (không nằm trong tikzFailedMap lẫn svgMap). Duyệt
    // theo tikzEmbeddedMap (danh sách MỌI hình có ảnh cứng bên trong) thay vì
    // chỉ Object.keys(tikzFailedMap) như bản trước, để không bỏ sót case (b).
    const idsToRetry = Object.keys(tikzEmbeddedMap).filter((id) => {
      const names = tikzEmbeddedMap[id];
      if (!names || names.length === 0) return false;
      if (svgMap[id] || tikzImgUrlMap[id]) return false; // đã có ảnh rồi, không cần thử nữa
      if (tikzMissingEmbeddedMap[id]) return false; // vẫn còn thiếu ảnh
      if (autoRetryInFlightRef.current.has(id)) return false;
      return true;
    });
    if (idsToRetry.length === 0) return;

    idsToRetry.forEach(async (id) => {
      autoRetryInFlightRef.current.add(id);
      setRealCompilingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      // Hình này đã được TÍNH vào tikzProgress.done ở lượt trước chưa? Chỉ
      // đúng khi nó đã từng lỗi (tikzFailedMap) — case (a). Case (b) (bị bỏ
      // qua, chưa từng thử) chưa được tính, giờ thử xong (dù đậu hay rớt)
      // phải cộng thêm 1 vào done, nếu không thanh tiến trình "còn X đang
      // biên dịch" sẽ treo mãi dù thực ra đã xử lý hết.
      const wasCountedBefore = id in tikzFailedMap;
      try {
        const code = tikzSourceMap[id];
        if (!code) return;
        const names = tikzEmbeddedMap[id] || [];
        const images = await buildEmbeddedImagesPayload(names, imageMap);
        const apiData = await compileTikzWithFallback(buildTikzTemplate(code), images);
        const svgOk = !!apiData && !!apiData.success && typeof apiData.svg === 'string'
          && apiData.svg.trim().length > 0 && apiData.svg.includes('<svg');
        if (svgOk) {
          setSvgMap((prev) => ({ ...prev, [id]: apiData.svg }));
          setTikzFailedMap((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
        } else {
          const reason = apiData && apiData.success
            ? 'Server báo thành công nhưng không trả về SVG hợp lệ'
            : (apiData && apiData.error) || 'Biên dịch thất bại (đã tự thử lại sau khi nạp ảnh, vẫn lỗi — kiểm tra lại cú pháp)';
          setTikzFailedMap((prev) => ({ ...prev, [id]: reason }));
        }
      } catch (error) {
        console.error('Lỗi tự động biên dịch lại sau khi nạp ảnh:', error);
        setTikzFailedMap((prev) => ({ ...prev, [id]: 'Lỗi khi gọi API biên dịch (đã tự thử lại sau khi nạp ảnh)' }));
      } finally {
        autoRetryInFlightRef.current.delete(id);
        if (!wasCountedBefore) {
          setTikzProgress((prev) => ({ ...prev, done: Math.min(prev.total, prev.done + 1) }));
        }
        setRealCompilingIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageMap, tikzFailedMap, tikzEmbeddedMap, tikzMissingEmbeddedMap, svgMap, tikzImgUrlMap]);

  // THÊM MỚI: thống kê số hình THỰC TẾ đang hiển thị được (SVG từ TikZ đã
  // biên dịch xong + ảnh file png/jpg/... đã khớp đúng tên) trên tab "Xem
  // đề", để phát hiện đúng trường hợp GV báo "biên dịch 16/16 ✅" (tức là cả
  // 16 hình ĐÃ GỬI ĐI biên dịch xong, không lỗi cú pháp) nhưng lúc hiển thị
  // thật lại thiếu hình vì lý do KHÁC (ví dụ: đổi thư mục ảnh giữa chừng nên
  // khớp sai tên file, svg trả về rỗng do timeout...). Dùng ĐÚNG logic khớp
  // hình y hệt renderTikzAndFormulas (svgMap cho [[HÌNH_TIKZ_n]], imagePathMap
  // + imageMap cho [[HÌNH_FILE_n]]) để con số này phản ánh chính xác những gì
  // mắt thường thấy trên trang, không suy diễn riêng một logic khác.
  const imageDisplayStats = useMemo(() => {
    if (!data) return null;
    const partsMeta: { tab: Partition; tabLabel: string; list: any[] }[] = [
      { tab: 'p1', tabLabel: 'Phần I', list: data.phan_1_TracNghiem || [] },
      { tab: 'p2', tabLabel: 'Phần II', list: data.phan_2_DungSai || [] },
      { tab: 'p3', tabLabel: 'Phần III', list: data.phan_3_TraLoiNgan || [] },
      { tab: 'p4', tabLabel: 'Phần IV', list: data.phan_4_TuLuan || [] },
    ];

    let tikzTotal = 0;
    let tikzOk = 0;
    let fileTotal = 0;
    let fileOk = 0;
    // Đếm theo phần mở rộng file thật (svg/png/jpg/jpeg/gif/webp/khác) — hình
    // TikZ biên dịch xong LUÔN là svg nên gộp riêng vào nhãn "svg (TikZ)" để
    // không lẫn với ảnh .svg người dùng tự chèn qua \includegraphics.
    const byExt: Record<string, { total: number; ok: number }> = {};
    const missingList: { id: string; label: string; location: string }[] = [];
    const seenPerQuestion = new Set<string>();

    const bump = (ext: string, ok: boolean) => {
      if (!byExt[ext]) byExt[ext] = { total: 0, ok: 0 };
      byExt[ext].total += 1;
      if (ok) byExt[ext].ok += 1;
    };

    partsMeta.forEach((part) => {
      part.list.forEach((q: any, i: number) => {
        const texts: string[] = [q?.content || '', q?.solution || ''];
        if (Array.isArray(q?.options)) {
          q.options.forEach((opt: any) => texts.push(opt?.text || ''));
        }
        const haystack = texts.join('\n');
        const ids = haystack.match(/\[\[HÌNH_(?:TIKZ|FILE)_\d+\]\]/g) || [];
        ids.forEach((id) => {
          // 1 hình có thể xuất hiện lặp (vd nhắc lại trong lời giải) — chỉ
          // đếm 1 lần cho mỗi câu để không thổi phồng số liệu.
          const dedupeKey = `${q.id}::${id}`;
          if (seenPerQuestion.has(dedupeKey)) return;
          seenPerQuestion.add(dedupeKey);

          if (id.startsWith('[[HÌNH_TIKZ_')) {
            tikzTotal += 1;
            const ok = !!svgMap[id] || !!tikzImgUrlMap[id];
            if (ok) tikzOk += 1;
            bump('svg (TikZ)', ok);
            if (!ok) {
              missingList.push({
                id,
                label: tikzFailedMap[id] ? 'Hình TikZ — biên dịch thất bại' : 'Hình TikZ — chưa hiển thị',
                location: `${part.tabLabel} — Câu ${i + 1}`,
              });
            }
          } else {
            fileTotal += 1;
            const originalPath = imagePathMap[id] || '';
            const baseName = originalPath.split('/').pop() || originalPath;
            const ok = !!resolveImageUrl(imageMap, baseName);
            if (ok) fileOk += 1;
            const extMatch = baseName.match(/\.([a-zA-Z0-9]+)$/);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'khác';
            bump(ext, ok);
            if (!ok) {
              missingList.push({
                id,
                label: `Ảnh thiếu: ${baseName || originalPath || '(không rõ tên)'}`,
                location: `${part.tabLabel} — Câu ${i + 1}`,
              });
            }
          }
        });
      });
    });

    return {
      total: tikzTotal + fileTotal,
      displayed: tikzOk + fileOk,
      tikz: { total: tikzTotal, ok: tikzOk },
      file: { total: fileTotal, ok: fileOk },
      byExt,
      missingList,
    };
  }, [data, svgMap, tikzImgUrlMap, imageMap, imagePathMap, tikzFailedMap]);

  // (27-7, sửa lỗi "mở đề cũ báo đang biên dịch, kẹt nút Lưu/Xuất bản"): số
  // hình TikZ CHƯA có kết quả gì cả (chưa hiển thị được VÀ chưa bị đánh dấu
  // lỗi) — tức đang thực sự còn treo, cần đợi. Tính TRỰC TIẾP từ
  // imageDisplayStats + tikzFailedMap (2 nguồn luôn đồng bộ với thực tế hiển
  // thị trên màn hình) THAY VÌ dựa vào tikzProgress — bộ đếm rời rạc dễ bị
  // treo khi có request mạng không bao giờ resolve/reject. Dùng số NÀY để
  // khoá nút Lưu/Xuất bản và hiện banner, tikzProgress chỉ còn dùng để hiện
  // tỉ lệ % tham khảo trong banner "đang biên dịch/tải lại".
  const tikzPendingCount = imageDisplayStats
    ? Math.max(0, imageDisplayStats.tikz.total - imageDisplayStats.tikz.ok - Object.keys(tikzFailedMap).length)
    : 0;

  // (27-7) Lưới an toàn cuối cùng: nếu tikzPendingCount > 0 kéo dài quá 25s
  // (1 lượt gọi mạng bị treo, không bao giờ tự resolve/reject) thì KHÔNG khoá
  // nút Lưu/Xuất bản mãi mãi nữa — GV vẫn lưu/xuất bản được, chỉ là hình đó
  // coi như lỗi (đã có cảnh báo riêng ở missingList/failedTikzLocations cho
  // GV biết hình nào còn thiếu). Timer tự huỷ/khởi động lại mỗi khi
  // tikzPendingCount đổi, nên hình xử lý xong bình thường trong vài giây (đa
  // số trường hợp) sẽ không bao giờ chạm tới nhánh này.
  const [tikzPendingTimedOut, setTikzPendingTimedOut] = useState(false);
  useEffect(() => {
    if (tikzPendingCount === 0) {
      setTikzPendingTimedOut(false);
      return;
    }
    setTikzPendingTimedOut(false);
    const timer = setTimeout(() => setTikzPendingTimedOut(true), 25000);
    return () => clearTimeout(timer);
  }, [tikzPendingCount]);
  const tikzBlockingSave = tikzPendingCount > 0 && !tikzPendingTimedOut;

  const startEditTikz = (id: string) => {
    setEditingTikzId(id);
    setTikzDraft(tikzSourceMap[id] ?? '');
    setAiEditInstruction('');
    setAiEditError('');
    setShowApiSettings(geminiApiKeys.length === 0);
  };

  const cancelEditTikz = () => setEditingTikzId(null);

  // THÊM MỚI: gọi AI (Gemini) sửa mã TikZ hiện trong ô textarea theo mô tả
  // yêu cầu người dùng nhập — CHỈ cập nhật lại nội dung ô mã (tikzDraft),
  // KHÔNG tự biên dịch/lưu. Người dùng xem lại mã AI sửa, thấy ổn thì bấm
  // "Cập nhật" (saveEditTikz) như bình thường để vẽ và chèn lại hình.
  // Dùng requestGeminiTikzEditRotating để tự xoay vòng qua nhiều key đã lưu
  // nếu key hiện tại gặp lỗi (mỗi key thử tối đa 3 lần trước khi đổi key).
  const handleAiEditTikz = async () => {
    if (geminiApiKeys.length === 0) {
      setAiEditError('Chưa lưu Gemini API key nào — dán key rồi bấm "Lưu key" ở khung "API Model" bên trên.');
      return;
    }
    if (!aiEditInstruction.trim()) {
      setAiEditError('Hãy mô tả yêu cầu sửa hình (ví dụ: "đổi màu đường tròn thành màu đỏ").');
      return;
    }
    setIsAiEditing(true);
    setAiEditError('');
    try {
      const { text: newTikz, usedIndex } = await requestGeminiTikzEditRotating(
        geminiApiKeys,
        activeKeyIndex,
        geminiModel,
        tikzDraft,
        aiEditInstruction.trim()
      );
      setTikzDraft(newTikz);
      setActiveKeyIndex(usedIndex);
    } catch (error: any) {
      console.error('Lỗi khi gọi AI sửa hình (đã xoay vòng hết key):', error);
      setAiEditError(error?.message || 'Lỗi không xác định khi gọi AI sửa hình.');
    } finally {
      setIsAiEditing(false);
    }
  };

  // Textarea thường (không phải input) nên Enter/Backspace hoạt động tự
  // nhiên: Enter xuống dòng mới, Backspace xoá lùi/gộp dòng — không cần xử
  // lý gì thêm ở đây, chỉ cần biên dịch lại khi người dùng bấm "Lưu & biên
  // dịch lại".
  const saveEditTikz = async (id: string) => {
    setRecompilingTikzId(id);
    try {
      // THÊM MỚI: mã sửa lại cũng có thể vẫn còn (hoặc mới thêm) ảnh cứng
      // \includegraphics bên trong -> dò lại và gửi kèm base64 y hệt lúc
      // biên dịch lần đầu.
      const embeddedNames = extractEmbeddedImageRefs(tikzDraft);
      setTikzEmbeddedMap((prev) => ({ ...prev, [id]: embeddedNames }));
      const images = embeddedNames.length > 0
        ? await buildEmbeddedImagesPayload(embeddedNames, imageMap)
        : undefined;
      const apiData = await compileTikzWithFallback(buildTikzTemplate(tikzDraft), images);
      // SỬA LỖI: đồng bộ với chỗ biên dịch hàng loạt — không chỉ tin
      // apiData.success, phải có svg thật sự mới coi là thành công.
      const svgOk = !!apiData && !!apiData.success && typeof apiData.svg === 'string'
        && apiData.svg.trim().length > 0 && apiData.svg.includes('<svg');
      if (svgOk) {
        setSvgMap((prev) => ({ ...prev, [id]: apiData.svg }));
        // Xoá ảnh PNG cũ (nếu có) — render đọc tikzImgUrlMap TRƯỚC svgMap,
        // không xoá thì svg mới biên dịch xong vẫn bị ảnh PNG cũ đè lên.
        setTikzImgUrlMap((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setTikzSourceMap((prev) => ({ ...prev, [id]: tikzDraft }));
        setTikzFailedMap((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setEditingTikzId(null);
      } else {
        const reason = apiData && apiData.success
          ? 'Server báo thành công nhưng không trả về SVG hợp lệ'
          : (apiData && apiData.error) || 'Biên dịch thất bại';
        setTikzFailedMap((prev) => ({ ...prev, [id]: reason }));
        alert('Biên dịch lại thất bại — kiểm tra lại cú pháp mã TikZ rồi thử lại.');
      }
    } catch (error) {
      console.error('Lỗi biên dịch lại TikZ:', error);
      setTikzFailedMap((prev) => ({ ...prev, [id]: 'Lỗi khi gọi API biên dịch' }));
      alert('Lỗi khi gọi API biên dịch lại hình.');
    } finally {
      setRecompilingTikzId(null);
    }
  };

  // Câu nào đang MỞ lời giải. TRƯỚC ĐÂY dùng thẻ <details>/<summary> mặc định
  // của HTML — vùng bấm để mở/đóng chỉ là 1 dòng chữ nhỏ, rất khó trúng.
  // BÂY GIỜ tự quản lý trạng thái mở/đóng bằng state, gắn onClick lên cả 1
  // nút to (full width) để bấm dễ hơn hẳn.
  // SỬA (khiếu nại: "trang xem đề phải bung hết lời giải ra" — để soát hết
  // hình trong lời giải mà không phải bấm từng câu): TRƯỚC ĐÂY mặc định TẤT
  // CẢ đều ĐÓNG (isOpen = !!openSolutions[q.id], id chưa có trong map -> undefined
  // -> đóng). BÂY GIỜ đảo ngược mặc định — chỉ ĐÓNG khi id đó được set rõ
  // ràng thành false, còn lại (kể cả chưa có trong map, tức câu MỚI) coi như
  // ĐANG MỞ (xem isOpen={openSolutions[q.id] !== false} ở nơi dùng). Nhờ vậy
  // không cần useEffect riêng để "bung hết" mỗi khi nạp đề mới — mọi câu tự
  // động ở trạng thái mở ngay từ đầu, người dùng vẫn bấm để ĐÓNG BỚT nếu muốn.
  const [openSolutions, setOpenSolutions] = useState<Record<string, boolean>>({});
  const toggleSolution = (id: string) =>
    setOpenSolutions((prev) => ({ ...prev, [id]: prev[id] === false ? true : false }));
  // Mở lại toàn bộ (xoá hết cờ "false" đã đóng) / đóng hết toàn bộ — dùng cho
  // 2 nút tiện lợi cạnh banner thống kê hình, phòng khi GV lỡ đóng bớt vài
  // câu rồi muốn soát lại toàn bộ hình 1 lượt.
  const expandAllSolutions = () => setOpenSolutions({});
  const collapseAllSolutions = () => {
    if (!data) return;
    const allIds = [
      ...(data.phan_1_TracNghiem || []),
      ...(data.phan_2_DungSai || []),
      ...(data.phan_3_TraLoiNgan || []),
      ...(data.phan_4_TuLuan || []),
    ].map((q: any) => q.id);
    const next: Record<string, boolean> = {};
    allIds.forEach((id) => {
      next[id] = false;
    });
    setOpenSolutions(next);
  };

  // Câu nào đang ở chế độ SỬA CODE (sửa trực tiếp mã LaTeX của nội dung đề
  // bài / lời giải, không cần quay lại file .tex gốc rồi upload lại từ đầu).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ content: string; solution: string; answer: string; options: { text: string; isCorrect: boolean }[] }>({
    content: '',
    solution: '',
    answer: '',
    options: [],
  });

  const startEdit = (q: any) => {
    setEditingId(q.id);
    // Nhân bản SÂU (deep copy) q.options — nếu chỉ copy nông (spread mảng),
    // các object phương án bên trong vẫn là CÙNG THAM CHIẾU với q.options
    // gốc, sửa draft sẽ vô tình sửa luôn dữ liệu THẬT trước khi bấm "Lưu"
    // (kể cả khi sau đó bấm "Hủy").
    setDraft({
      content: q.content,
      solution: q.solution || '',
      answer: q.answer || '',
      options: Array.isArray(q.options) ? q.options.map((o: any) => ({ ...o })) : [],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (partition: Partition, id: string) => {
    setData((prev: any) => {
      const key = PARTITION_KEY[partition];
      return {
        ...prev,
        [key]: prev[key].map((q: any) =>
          q.id === id
            ? {
                ...q,
                content: draft.content,
                solution: draft.solution,
                // Chỉ ghi đè answer cho câu Trả lời ngắn (Phần III) — các phần
                // khác không có ô đáp số nên giữ nguyên field cũ (undefined).
                ...(partition === 'p3' ? { answer: draft.answer } : {}),
                // THÊM MỚI (khiếu nại 28-7): ghi đè options (nội dung TỪNG
                // phương án + đáp án đúng) cho Phần I/II — chỉ khi câu này
                // thật sự có options (draft.options.length > 0), Phần III/IV
                // giữ nguyên q.options gốc (undefined/không có).
                ...(draft.options.length > 0 ? { options: draft.options } : {}),
              }
            : q
        ),
      };
    });
    setEditingId(null);
  };

  // THÊM MỚI: gộp toàn bộ phần xử lý sau khi có được nội dung text (dù lấy
  // từ file .tex upload, kéo-thả, hay dán trực tiếp vào ô nhập) vào MỘT hàm
  // dùng chung — tránh lặp lại y hệt logic parse + biên dịch TikZ ở 3 nơi.
  // Hành vi bên trong giữ NGUYÊN 100% so với code gốc trong handleFileUpload.

  // Lưu đề thi lên MongoDB. LƯU Ý — vì file này là 'use client'
  // (chạy trên trình duyệt), KHÔNG được import mongoose/connectToDatabase
  // trực tiếp ở đây (mongoose chỉ chạy được ở server, và làm vậy sẽ lộ luôn
  // chuỗi kết nối MongoDB ra trình duyệt). Nên hàm này chỉ gọi fetch() tới
  // API route /api/save-exam — nơi thật sự chạy mongoose ở phía server.
  const saveExamToMongo = async (examTitleParam: string, parsedData: any, forceNew = false) => {
    if (!parsedData) {
      alert('⚠️ Chưa có đề thi nào để lưu — hãy tải/dán đề trước đã.');
      return;
    }
    // SỬA LỖI (16 hình biên dịch xong nhưng chỉ add có 12): nút "Lưu" trước
    // đây không kiểm tra gì cả — bấm Lưu lúc còn hình đang biên dịch dở dang
    // sẽ lưu thiếu hình y hệt lỗi bên "Xuất bản" (xem validateExamBeforePublish).
    if (tikzPendingCount > 0) {
      alert(
        `⚠️ Còn ${tikzPendingCount} hình vẽ chưa có kết quả — hãy đợi xử lý xong hết (thanh trạng thái phía trên chuyển sang ✅ hoặc ⚠️) rồi mới bấm Lưu, nếu không hình chưa xong sẽ bị thiếu trong bản lưu.`
      );
      return;
    }
    const title = examTitleParam.trim() || 'Đề thi chưa đặt tên';
    // SỬA LỖI (mở lại đề bị biên dịch lại TikZ từ đầu): trước đây nút "Lưu"
    // thường gửi thẳng `data` gốc — tikz_list chỉ có {id, code}, KHÔNG có
    // svg. Vì vậy lúc mở lại đề, loadExamData không có svg sẵn để dùng, phải
    // gọi lại API biên dịch TikZ cho MỌI hình, dù hình đó đã biên dịch xong
    // từ trước rồi (tốn thời gian + làm quá tải server biên dịch nếu nhiều
    // người mở đề cùng lúc). Giờ nhúng luôn svg đã có sẵn trong svgMap (biên
    // dịch lúc soạn đề, không tốn thêm lệnh gọi API nào) vào tikz_list trước
    // khi lưu — giống hệt cơ chế "Xuất bản" đã làm — để lần sau mở lại có
    // ngay ảnh, không phải biên dịch lại.
    setIsSavingExamMongo(true);
    try {
      // SỬA LỖI (mục 1 - GHI-CHU-TON-DONG-18-7.md): "Lưu" trước đây không
      // upload ảnh PNG cứng lên Vercel Blob như "Xuất bản" đã làm — image_list
      // bị lưu y nguyên {id, path} không có `url` thật, nên ảnh chỉ còn sống
      // qua blob: URL tạm trong bộ nhớ tab hiện tại. Mở lại đề đã lưu (hoặc
      // học sinh vào link) thì blob: URL đã chết -> ảnh biến mất. Gọi lại
      // đúng hàm uploadHardImagesForPublish() dùng chung với publishExam()
      // để image_list luôn có url thật trước khi lưu.
      const { imageList: imageListWithUrl, missing: missingHardImages } = await uploadHardImagesForPublish();
      if (missingHardImages.length > 0) {
        console.warn('Ảnh cứng chưa có file khớp lúc Lưu (sẽ hiện thiếu khi mở lại):', missingHardImages);
      }
      // (26-7) Đo ngầm viewBox cho MỌI hình TikZ trước khi upload — không
      // cần bạn phải mở tab "Xem đề" nữa, tự chạy trong lúc bấm "Lưu".
      await ensureAllTikzCropsCached(parsedData.tikz_list || []);
      // SỬA (413 Payload Too Large): trước đây nhúng THẲNG chuỗi svg (dòng
      // "svg: svgMap[t.id] || t.svg || ''") vào tikz_list gửi lên server —
      // giờ tải lên Vercel Blob trước, chỉ gửi {id, code, url} (xem
      // uploadTikzSvgsForSave ở trên, cùng kiến trúc uploadHardImagesForPublish).
      const { list: tikzListWithUrl, failed: failedTikzIds } = await uploadTikzSvgsForSave(parsedData.tikz_list || []);
      // SỬA LỖI (26-7, "báo Lưu thành công dù ảnh chưa lên kịp"): nếu có hình
      // TikZ upload lỗi mạng sau khi đã thử lại 3 lần, dừng lại hỏi GV trước
      // khi lưu — thay vì âm thầm lưu thiếu rồi báo "Lưu thành công" như cũ.
      if (failedTikzIds.length > 0) {
        const tiepTuc = window.confirm(
          `⚠️ ${failedTikzIds.length} hình TikZ tải lên thất bại (có thể do mạng chậm/chập chờn), dù đã thử lại 3 lần:\n` +
          failedTikzIds.join(', ') +
          `\n\nNếu vẫn Lưu bây giờ, đề sẽ được lưu nhưng câu chứa hình này sẽ hiện cảnh báo "Hình vẽ chưa có sẵn" cho tới khi bạn Lưu lại thành công.\n\n` +
          `Bấm OK để vẫn Lưu, hoặc Hủy để dừng lại và thử Lưu lại (khuyến nghị nếu mạng đang yếu).`
        );
        if (!tiepTuc) {
          setIsSavingExamMongo(false);
          return;
        }
      }
      const dataWithSvgForSave = {
        ...parsedData,
        tikz_list: tikzListWithUrl,
        image_list: imageListWithUrl,
      };
      // THÊM MỚI (mục 2): nếu đang sửa 1 đề đã lưu (currentExamId có giá
      // trị) và KHÔNG bấm "Lưu bản sao mới" -> PATCH cập nhật lại đúng bản
      // ghi đó (giữ nguyên link công khai /thi/[id] cũ nếu đề đã xuất bản).
      // Ngược lại (đề hoàn toàn mới, hoặc chủ động chọn lưu thành 1 tệp
      // riêng) -> POST tạo bản ghi MỚI như trước giờ.
      // THÊM MỚI (Phần 1 - HANDOFF-PHAN3-LIVEQUIZ.md): `savedExamId` ghi lại
      // đúng id vừa lưu/cập nhật ở CẢ 2 nhánh, để return ra ngoài cho nơi gọi
      // dùng ngay — không đọc lại currentExamId vì state
      // setter là bất đồng bộ, đọc ngay sau khi gọi hàm dễ bị giá trị CŨ.
      let savedExamId: string | null = null;
      if (currentExamId && !forceNew) {
        const res = await fetch(`/api/exams/${currentExamId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, raw_data: dataWithSvgForSave }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || 'Lưu thất bại');
        alert('✅ Đã cập nhật đề thi (giữ nguyên link cũ nếu đã xuất bản)!');
        savedExamId = currentExamId;
      } else {
        const res = await fetch('/api/save-exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, raw_data: dataWithSvgForSave }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || 'Lưu thất bại');
        // Ghi nhớ luôn _id vừa tạo -> lần Lưu tiếp theo sẽ cập nhật đúng bản
        // ghi này thay vì tạo thêm bản mới nữa.
        setCurrentExamId(result.id);
        alert(forceNew ? '✅ Đã lưu thành một đề (tệp) MỚI riêng biệt!' : '✅ Lưu đề thi lên MongoDB thành công!');
        savedExamId = result.id;
      }
      refreshSavedExamsList();
      return savedExamId;
    } catch (err) {
      console.error('Lỗi lưu MongoDB:', err);
      alert('❌ Lưu thất bại! Hãy kiểm tra lại kết nối MongoDB (Console > F12 xem chi tiết lỗi).');
    } finally {
      setIsSavingExamMongo(false);
    }
  };


  // THÊM MỚI: gọi GET /api/exams để lấy danh sách đề đã lưu — dùng chung
  // cho cả panel thường trực phía dưới (mục 4) và (nếu còn nơi nào gọi)
  // modal cũ. showModal=true mới bật showSavedExamsModal, panel thường trực
  // không cần modal nên gọi hàm này KHÔNG kèm tham số.
  const refreshSavedExamsList = async (showModal = false) => {
    if (showModal) setShowSavedExamsModal(true);
    setIsLoadingSavedExamsList(true);
    setSavedExamsError('');
    try {
      const res = await fetch('/api/exams');
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Không lấy được danh sách');
      setSavedExamsList(result.exams || []);
    } catch (err) {
      console.error('Lỗi lấy danh sách đề:', err);
      setSavedExamsError('❌ Không lấy được danh sách đề — kiểm tra lại kết nối MongoDB.');
    } finally {
      setIsLoadingSavedExamsList(false);
    }
  };
  // Giữ tên cũ để không phải sửa những nơi khác đang gọi openSavedExamsModal.
  const openSavedExamsModal = () => refreshSavedExamsList(true);

  // THÊM MỚI (mục 4): đổi thư mục của 1 đề (dropdown trong panel) — gọi
  // PATCH /api/exams/:id rồi cập nhật lại state cục bộ, không cần fetch
  // lại toàn bộ danh sách.
  const moveExamToFolder = async (examId: string, folder: string) => {
    setUpdatingExamId(examId);
    try {
      const res = await fetch(`/api/exams/${examId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Không đổi được thư mục');
      setSavedExamsList((prev) => prev.map((e) => (e._id === examId ? { ...e, folder } : e)));
    } catch (err) {
      console.error('Lỗi đổi thư mục đề:', err);
      alert('❌ Không đổi được thư mục — kiểm tra lại kết nối MongoDB.');
    } finally {
      setUpdatingExamId(null);
    }
  };

  // THÊM MỚI (mục 4): xoá vĩnh viễn 1 đề (nút 🗑️ trong panel), có xác nhận
  // trước vì không thể hoàn tác.
  const deleteExamPermanently = async (examId: string, title: string) => {
    if (!window.confirm(`Xoá vĩnh viễn đề "${title}"? Không thể hoàn tác.`)) return;
    setDeletingExamId(examId);
    try {
      const res = await fetch(`/api/exams/${examId}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Không xoá được đề');
      setSavedExamsList((prev) => prev.filter((e) => e._id !== examId));
    } catch (err) {
      console.error('Lỗi xoá đề:', err);
      alert('❌ Không xoá được đề — kiểm tra lại kết nối MongoDB.');
    } finally {
      setDeletingExamId(null);
    }
  };

  // THÊM MỚI (mục 4): tạo thư mục rỗng mới (chỉ lưu tên trong localStorage
  // cho tới khi có đề nào được chuyển vào, khi đó folder trở thành thật
  // trên MongoDB qua moveExamToFolder ở trên).
  const createManualFolder = () => {
    const name = window.prompt('Tên thư mục mới:')?.trim();
    if (!name) return;
    setManualFolders((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name];
      try {
        localStorage.setItem('examBuilderManualFolders', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // THÊM MỚI (mục 4): nút "+ Tạo đề mới" — reset toàn bộ state soạn đề hiện
  // tại để bắt đầu 1 đề trắng, không đụng tới các đề đã lưu trên MongoDB.
  const handleNewExam = () => {
    if (data && !window.confirm('Bắt đầu đề mới sẽ xoá nội dung đang soạn (chưa lưu sẽ mất). Tiếp tục?')) return;
    setData(null);
    setPastedText('');
    setTexFileName('');
    setExamTitle('');
    setImageMap({});
    setImageFolders([]);
    setBuilderSubTab('upload');
    // Reset để lần Lưu/Xuất bản tiếp theo tạo bản ghi MỚI (không PATCH nhầm
    // đè lên đề vừa rời khỏi).
    setCurrentExamId(null);
    // SỬA (khiếu nại: "để cỡ hình 120% ở đề trước, tạo/mở đề khác không tự
    // quay về mặc định"): TRƯỚC ĐÂY hàm này không đụng tới examSettings —
    // toàn bộ cài đặt (cỡ hình, thời gian làm bài, thang điểm...) của đề
    // VỪA SỬA vẫn còn nguyên trong state, "rớt" sang đề mới hoàn toàn không
    // liên quan. Reset thẳng về DEFAULT_EXAM_SETTINGS ở đây.
    setExamSettings(DEFAULT_EXAM_SETTINGS);
  };

  // THÊM MỚI: bấm "Mở" trên 1 dòng trong danh sách -> gọi GET
  // /api/exams/:id lấy đầy đủ raw_data -> nạp vào giao diện y hệt như vừa
  // upload file .tex (dùng chung hàm loadExamData ở dưới).
  const loadSavedExam = async (id: string, title: string) => {
    setLoadingExamId(id);
    // SỬA (phòng trường hợp còn kẹt ở chế độ "Xem mô phỏng" từ trước): tab
    // "Xem đề"/"Cài đặt" chỉ render khi examMode === 'setup' — nếu vì lý do
    // gì đó examMode đang kẹt ở 'live', chuyển tab xong mà nội dung không
    // hiện ra (trông như "không chuyển tab được"). Luôn ép về 'setup' ngay
    // khi mở 1 đề đã lưu để tránh trường hợp này.
    setExamMode('setup');
    try {
      const res = await fetch(`/api/exams/${id}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Không tải được đề thi');
      loadExamData(result.exam.raw_data);
      setExamTitle(title);
      setTexFileName(title);
      // THÊM MỚI (mục 2): ghi nhớ đang sửa đúng đề nào -> lần Lưu/Xuất bản
      // tiếp theo sẽ PATCH cập nhật lại bản ghi này (giữ nguyên link cũ),
      // KHÔNG tạo bản ghi mới.
      setCurrentExamId(id);
      // Khôi phục lại cài đặt phòng thi (thời gian, trộn câu...) đã lưu kèm
      // đề này trước đó, nếu có — để mở "Cài đặt" ra thấy đúng cấu hình cũ
      // thay vì lúc nào cũng về mặc định 45 phút.
      if (result.exam.settings && typeof result.exam.settings === 'object') {
        setExamSettings(() => ({
          // SỬA (khiếu nại: "để cỡ hình 120% ở đề A, mở đề B (đề cũ, chưa
          // từng lưu cài đặt cỡ hình) không tự quay về mặc định"): TRƯỚC
          // ĐÂY dùng {...s, ...result.exam.settings} — field nào KHÔNG có
          // trong settings đã lưu của đề B (vd imageScalePercent, hoặc bất
          // kỳ field mới nào thêm sau này) thì spread không ghi đè, giữ
          // NGUYÊN giá trị hiện tại `s` đang có (còn sót từ đề A vừa sửa
          // trước đó trong cùng phiên làm việc) — SAI, phải rơi về mặc định
          // đúng nghĩa. SỬA: luôn bắt đầu từ DEFAULT_EXAM_SETTINGS (không
          // phải state `s` hiện tại) rồi mới ghi đè bằng đúng những gì đề
          // B thực sự có lưu.
          ...DEFAULT_EXAM_SETTINGS,
          ...result.exam.settings,
          // SỬA: {...s, ...result.exam.settings} ở trên ghi đè NGUYÊN cả
          // object scoring — đề CŨ lưu trước khi có tính năng Phần IV sẽ
          // thiếu p4PerQuestion trong settings.scoring đã lưu, khiến field
          // này biến mất khỏi state (input hiện trống, "Tổng tối đa" tính ra
          // NaN vì nhân với undefined). Merge riêng scoring lên trên state
          // hiện tại (đã có đủ 4 field mặc định) để field thiếu luôn có giá
          // trị mặc định hợp lý thay vì undefined.
          scoring: { ...DEFAULT_EXAM_SETTINGS.scoring, ...(result.exam.settings.scoring || {}) },
          // SỬA (khiếu nại: "chỗ Xem đề hẹp quá"): 1 số đề CŨ (lưu trước khi
          // bỏ bộ chọn "Chế độ hiển thị") vẫn còn kẹt viewMode: 'a4' trong
          // settings đã lưu — chế độ này hiển thị dạng trang giấy A4 rộng cố
          // định ~210mm (rất hẹp so với màn hình rộng), dù giao diện hiện tại
          // không còn nút nào để đổi lại. Luôn ép về 'azota' (dạng thẻ card,
          // rộng hết khung) khi mở lại đề — đúng chế độ DUY NHẤT còn hỗ trợ.
          viewMode: 'azota',
          // (27-7) Đã GỠ tính năng +/- cỡ hình -> LUÔN ép về mặc định, bỏ
          // qua imageScalePercent cũ (nếu có) còn sót trong settings đã lưu
          // của đề này từ trước khi gỡ UI — nếu không, đề CŨ từng chỉnh cỡ
          // hình sẽ mãi mãi hiện lệch cỡ ở tab "Xem đề"/"Xem mô phỏng" so
          // với "Trang học sinh thật"/"Lời giải" (2 trang đó không đọc qua
          // đây, đọc thẳng settings đã publish trên server) mà không có cách
          // nào sửa lại vì không còn nút +/- nữa.
          imageScalePercent: DEFAULT_EXAM_SETTINGS.imageScalePercent,
          // solutionOpenAt/openAt/closeAt lưu server dạng ISO -> đổi lại dạng
          // datetime-local để input hiện đúng, không bị input coi là chuỗi
          // rỗng/không hợp lệ.
          solutionOpenAt: isoToDatetimeLocal(result.exam.settings.solutionOpenAt),
          openAt: isoToDatetimeLocal(result.exam.settings.openAt),
          closeAt: isoToDatetimeLocal(result.exam.settings.closeAt),
        }));
      }
      setShowSavedExamsModal(false);
    } catch (err) {
      console.error('Lỗi mở đề đã lưu:', err);
      alert('❌ Không mở được đề này — kiểm tra lại kết nối MongoDB (Console > F12 xem chi tiết lỗi).');
    } finally {
      setLoadingExamId(null);
    }
  };

  // THÊM MỚI: "Xuất bản - Lấy link" — soát lỗi trước (validateExamBeforePublish),
  // nếu có lỗi thì chặn lại và hiện modal đỏ liệt kê từng câu lỗi (không gọi
  // MongoDB). Nếu sạch thì lưu lên MongoDB với is_published: true kèm luôn
  // examSettings (thời gian, trộn câu...) để sau này link công khai load
  // đúng cấu hình, rồi hiện modal thành công kèm link để copy.
  // THÊM MỚI (Bước 3.1 mục 2): tải từng ảnh cứng ngoài tikz (data.image_list)
  // lên Vercel Blob trước khi lưu đề — cùng tinh thần "nhúng sẵn SVG" của
  // TikZ ở dưới, nhưng ảnh cứng không biên dịch, chỉ cần upload thẳng file
  // GV đã chọn ở thư mục ảnh (imageFileMapRef, khớp theo basename giống
  // imagePathMap/imageMap đang dùng để preview lúc soạn đề).
  // Ảnh nào GV CHƯA chọn/khớp file thì bỏ qua (không chặn xuất bản) — trang
  // học sinh sẽ tự hiện cảnh báo "ảnh chưa có sẵn" cho đúng câu đó (xem
  // examRender.tsx), GV xuất bản lại sau khi bổ sung ảnh là được.
  const uploadHardImagesForPublish = async (): Promise<{
    imageList: { id: string; path: string; url: string }[];
    missing: string[];
  }> => {
    const list: { id: string; path: string }[] = data?.image_list || [];
    const draftId = String(Date.now());
    const missing: string[] = [];
    const uploaded = await Promise.all(
      list.map(async (img) => {
        const baseName = img.path.split('/').pop() || img.path;
        const fileKey = findImageMapKey(imageFileMapRef.current, baseName);
        const file = fileKey !== undefined ? imageFileMapRef.current[fileKey] : undefined;
        if (!file) {
          missing.push(baseName);
          return { ...img, url: '' };
        }
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('imageId', img.id);
          fd.append('draftId', draftId);
          const res = await fetch('/api/upload-exam-image', { method: 'POST', body: fd });
          const result = await res.json();
          if (!res.ok) throw new Error(result?.error || 'Tải ảnh thất bại');
          return { ...img, url: result.url as string };
        } catch (err) {
          console.error(`Lỗi tải ảnh cứng "${baseName}" lên:`, err);
          missing.push(baseName);
          return { ...img, url: '' };
        }
      })
    );
    return { imageList: uploaded, missing };
  };

  // THÊM MỚI (đưa SVG TikZ lên Vercel Blob, giống ảnh cứng — sửa gốc lỗi
  // 413 khi Lưu/Xuất bản đề có nhiều hình): trước đây saveExamToMongo và
  // publishExam nhúng THẲNG chuỗi SVG (đang có sẵn trong svgMap) vào từng
  // phần tử tikz_list rồi gửi nguyên cục lên server — đề có nhiều hình (SVG
  // TikZ tuy nhẹ nhưng cộng dồn hàng chục hình vẫn đủ vượt giới hạn body của
  // Vercel/Next). Giờ tải TỪNG hình lên Vercel Blob trước (route mới
  // /api/upload-tikz-svg, cùng kiến trúc uploadHardImagesForPublish() ở
  // dưới), chỉ gửi {id, code, url} lên MongoDB — nhẹ như đề chỉ có ảnh cứng.
  //
  // Hình nào KHÔNG có svg mới trong svgMap (ví dụ: mở lại đề chỉ mồi từ url
  // cũ — xem loadExamData — chưa từng biên dịch lại trong phiên này) thì
  // GIỮ NGUYÊN url cũ, KHÔNG tải lại (tránh tốn Blob storage + thời gian vô
  // ích khi hình không hề đổi). Hình nào tải lỗi (mạng lỗi, timeout...) thì
  // cũng giữ url cũ làm dự phòng, không chặn cả việc lưu đề chỉ vì 1 hình.
  // (26-7) Đo viewBox bằng CHÍNH trình duyệt nhưng KHÔNG cần hiển thị ra
  // màn hình / không cần bạn mở tab "Xem đề" trước — dựng 1 <svg> tạm ở
  // ngoài rìa màn hình (visibility:hidden, không phải display:none — SVG
  // vẫn tham gia layout/render tree nên getBBox()/getComputedStyle() đo
  // đúng, chỉ là không vẽ ra mắt thấy), đo xong thì tự xoá đi ngay.
  // ĐẶT TIỀN TỐ id riêng (giống namespacedSvg trong TikzImage) để tránh 2
  // hình đo cùng lúc (Promise.all bên dưới) bị trùng id glyph, mượn nhầm
  // nét vẽ của nhau làm bbox đo sai — đúng loại lỗi mà tikzCrop.ts đang cố
  // tránh, không được để nó lọt lại ở chính bước đo này.
  const measureSvgViewBoxOffscreen = (
    svg: string
  ): Promise<{ x: number; y: number; width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const prefix = `off${Math.random().toString(36).slice(2)}_`;
      const namespaced = svg
        .replace(/id="/g, `id="${prefix}`)
        .replace(/href="#/g, `href="#${prefix}`)
        .replace(/url\(#/g, `url(#${prefix}`);

      const holder = document.createElement('div');
      // QUAN TRỌNG (đã test thật bằng Chrome, phát hiện lỗi thật lúc code
      // dùng "visibility:hidden" ở đây): visibility là thuộc tính KẾ THỪA
      // (inherited) trong CSS — nếu đặt "hidden" ngay trên div bọc ngoài,
      // MỌI phần tử SVG bên trong (kể cả phần THẬT SỰ nhìn thấy được) đều
      // bị tính là "ẩn theo" khi getVisibleContentBBox()/isEffectivelyHidden
      // đọc computed style — khiến hàm không tìm thấy nội dung nào "nhìn
      // thấy được" cả, bỏ qua cắt hoàn toàn (bug ĐÃ tái hiện được bằng
      // Playwright: bbox trả về nguyên 100% chiều cao gốc, không hề co lại
      // dù có 2 phần tử ẩn thật ở rất xa). SỬA: chỉ đẩy container ra NGOÀI
      // MÀN HÌNH (position:fixed, toạ độ âm rất lớn) — không set visibility/
      // display/opacity gì trên nó, để không ảnh hưởng computed style của
      // nội dung SVG bên trong khi đo.
      holder.style.position = 'fixed';
      holder.style.left = '-99999px';
      holder.style.top = '-99999px';
      holder.style.width = '2000px';
      holder.style.height = '2000px';
      holder.style.pointerEvents = 'none';
      holder.innerHTML = namespaced;
      document.body.appendChild(holder);

      let rafId = 0;
      let attempts = 0;
      const cleanup = () => {
        if (rafId) cancelAnimationFrame(rafId);
        holder.remove();
      };

      const tryMeasure = (): boolean => {
        const svgEl = holder.querySelector('svg');
        if (!svgEl) return false;
        try {
          const bbox = (svgEl as unknown as SVGGraphicsElement).getBBox();
          if (bbox.width > 0 && bbox.height > 0) {
            const BASE_PADDING = 0.5;
            const LARGE_GAP_THRESHOLD_PX = 10;
            const SAFE_MARGIN_PX = 5;
            let vTop = bbox.y;
            let vBottom = bbox.y + bbox.height;
            const visible = getVisibleContentBBox(svgEl as unknown as SVGSVGElement);
            if (visible && visible.height > 0) {
              const extraTop = visible.y - bbox.y;
              const extraBottom = bbox.y + bbox.height - (visible.y + visible.height);
              if (extraTop > LARGE_GAP_THRESHOLD_PX) vTop = visible.y - SAFE_MARGIN_PX;
              if (extraBottom > LARGE_GAP_THRESHOLD_PX) vBottom = visible.y + visible.height + SAFE_MARGIN_PX;
            }
            // SỬA LỖI (khiếu nại: "đường ngang trên cùng của khung bảng biến
            // thiên bị cắt cụt") — ĐỒNG BỘ với 2 nơi trên: nới đệm thêm ĐÚNG
            // BẰNG nửa bề dày nét dày nhất đo được thay vì đệm cố định 0.5.
            const padding = Math.max(BASE_PADDING, (visible?.maxStrokeHalf ?? 0) + BASE_PADDING);
            const w = bbox.width + padding * 2;
            const h = vBottom - vTop + padding * 2;
            if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
              resolve({ x: bbox.x - padding, y: vTop - padding, width: w, height: h });
              cleanup();
              return true;
            }
          }
        } catch {
          // getBBox có thể ném lỗi nếu chưa kịp gắn vào DOM — thử lại khung
          // hình kế tiếp thay vì bỏ cuộc luôn (đồng bộ TikzImage).
        }
        return false;
      };

      if (!tryMeasure()) {
        const loop = () => {
          attempts++;
          const ok = tryMeasure();
          if (ok) return;
          if (attempts > 30) {
            // Đo được tối đa ~0.5s (30 khung hình) mà vẫn hỏng -> bỏ cuộc,
            // trả về null. Nơi gọi sẽ không gửi cropBBox cho hình này, server
            // tự rơi về cách đo cũ (resvg) — không chặn việc Lưu đề.
            resolve(null);
            cleanup();
            return;
          }
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
      }
    });
  };

  // Chạy đo NGẦM cho MỌI hình TikZ trong đề (chưa có sẵn trong cache) —
  // gọi tự động ngay khi bấm Lưu/Xuất bản, KHÔNG cần bạn phải mở tab
  // "Xem đề" trước nữa. Chạy song song (Promise.all) cho nhanh; 1 hình lỗi
  // đo không làm hỏng các hình khác (mỗi promise tự bắt lỗi riêng ở trên).
  const ensureAllTikzCropsCached = async (
    tikzList: { id: string; code: string; svg?: string; url?: string }[]
  ) => {
    const targets = (tikzList || []).filter(
      (t) => t && t.id && !tikzCropCacheRef.current[t.id] && svgMap[t.id]
    );
    if (targets.length === 0) return;
    await Promise.all(
      targets.map(async (t) => {
        try {
          const bbox = await measureSvgViewBoxOffscreen(svgMap[t.id]);
          if (bbox) tikzCropCacheRef.current[t.id] = bbox;
        } catch (err) {
          console.error(`Lỗi đo ngầm viewBox cho hình TikZ "${t.id}" (bỏ qua, server sẽ tự đo lại):`, err);
        }
      })
    );
  };

  // SỬA GỐC (26-7, khiếu nại: "hình TikZ quá nặng, báo lỗi tải lên không
  // được dù server đã có sẵn chỗ rơi về PNG"): NGUYÊN NHÂN THẬT SỰ không
  // nằm ở logic cắt/nén/rasterize trong route /api/upload-tikz-svg (logic
  // đó ĐÚNG và VẪN CHẠY) — mà nằm ở TẦNG HẠ TẦNG bên dưới nó: Vercel giới
  // hạn CỨNG 4.5MB cho toàn bộ request/response body của 1 Serverless
  // Function (đây là giới hạn CỐ ĐỊNH của nền tảng, không phải config nào
  // trong code này chỉnh được, xem vercel.com/docs/functions/limitations).
  // Hình TikZ CÀNG NẶNG (nhiều điểm dữ liệu: đồ thị lấy mẫu mượt, lưới/
  // hatching dày...) — tức CÀNG CẦN được rơi về PNG nhất — thì SVG thô gửi
  // lên (trước khi kịp cắt/nén, việc đó chỉ chạy ĐƯỢC SAU KHI request tới
  // được route) càng dễ vượt quá 4.5MB này. Vercel chặn NGAY Ở CỔNG VÀO,
  // trả lỗi 413 trước khi 1 dòng code nào trong route kịp chạy — nên "chỗ
  // rơi về PNG" trong route không hề sai, chỉ đơn giản là KHÔNG BAO GIỜ có
  // cơ hội được gọi tới với đúng những hình cần nó nhất.
  //
  // SỬA: thay vì đợi server rasterize hộ (quá muộn), RASTERIZE SANG PNG
  // NGAY TRONG TRÌNH DUYỆT (canvas, xem rasterizeSvgToPngBlobClientSide bên
  // dưới) TRƯỚC KHI GỬI ĐI, cho những SVG có khả năng vượt ngưỡng an toàn —
  // để cái được gửi lên server luôn là ảnh PNG đã nhẹ (cỡ vài trăm KB ở độ
  // phân giải cố định 1600px, không phụ thuộc SVG gốc nặng cỡ nào), không
  // bao giờ chạm tới giới hạn 4.5MB nữa. Route /api/upload-tikz-svg vẫn giữ
  // nguyên logic cắt/nén/rasterize cũ làm lưới an toàn dự phòng (trường hợp
  // hiếm: SVG dưới ngưỡng gửi thô nhưng sau khi server đo/nén lại vẫn hoá ra
  // nặng), không xoá bỏ gì ở đó.
  // SỬA (26-7, khiếu nại "PNG chuyển từ SVG hiện to khủng khiếp, đặc biệt
  // trên máy tính, còn SVG thường thì bình thường"): NGUYÊN NHÂN GỐC — nơi
  // hiển thị (renderImageOrTikzToken, examRender.tsx) tính cỡ hiển thị dựa
  // vào "kích thước tự nhiên" (naturalWidth) của file ảnh. Với SVG thường,
  // kích thước tự nhiên = đúng viewBox thật (tikzCrop.ts luôn ghi width/
  // height khớp viewBox) — nhỏ, đúng tỉ lệ TikZ gốc. Với PNG rasterize ở
  // đây, kích thước tự nhiên LUÔN là 1600px (ép cứng để giữ nét) — không hề
  // liên quan gì đến cỡ thật của hình TikZ, nên hiển thị theo natural size
  // sẽ luôn to hơn hẳn SVG cùng nội dung.
  // SỬA: hàm này giờ trả thêm w/h = kích thước LOGIC thật (lấy từ cropBBox,
  // ĐÚNG đơn vị mà 1 bản SVG bình thường sẽ có trong width/height của nó) —
  // nơi gọi (uploadTikzSvgsForSave) đính kèm 2 số này vào tikz_list, để nơi
  // hiển thị set CSS width/height TƯỜNG MINH theo đúng số này thay vì dựa
  // vào "kích thước tự nhiên" của file (đúng với SVG nhưng sai hẳn với PNG).
  const rasterizeSvgToPngBlobClientSide = (
    svg: string,
    cropBBox?: { x: number; y: number; width: number; height: number }
  ): Promise<{ blob: Blob; w: number; h: number } | null> => {
    return new Promise((resolve) => {
      try {
        let finalSvg = svg;
        // Áp viewBox đã đo sẵn (nếu có) vào chuỗi SVG TRƯỚC khi rasterize —
        // để ảnh PNG xuất ra cũng được cắt sát y hệt bản SVG, không vẽ kèm
        // viền trắng thừa (viền trắng thừa vẽ ra ảnh raster nặng hơn cần
        // thiết một cách vô ích, đi ngược mục đích "giữ nhẹ" của bước này).
        if (cropBBox && cropBBox.width > 0 && cropBBox.height > 0) {
          const hasSvgOpenTag = /<svg[^>]*>/.test(finalSvg);
          if (hasSvgOpenTag) {
            finalSvg = finalSvg.replace(/<svg([^>]*)>/, (_m, attrs) => {
              const cleanedAttrs = String(attrs)
                .replace(/\swidth="[^"]*"/, '')
                .replace(/\sheight="[^"]*"/, '')
                .replace(/\sviewBox="[^"]*"/, '');
              return `<svg${cleanedAttrs} viewBox="${cropBBox.x} ${cropBBox.y} ${cropBBox.width} ${cropBBox.height}">`;
            });
          }
        }
        const svgBlob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(svgBlob);
        const img = new Image();
        // Độ phân giải raster cố định — KHỚP với rasterizeTikzSvgToPng phía
        // server (tikzCrop.ts) để hình rơi vào 1 trong 2 nhánh (client hay
        // server rasterize) trông không khác biệt về độ nét.
        const TARGET_WIDTH_PX = 1600;
        img.onload = () => {
          const naturalW = img.naturalWidth || TARGET_WIDTH_PX;
          const naturalH = img.naturalHeight || TARGET_WIDTH_PX;
          const scale = TARGET_WIDTH_PX / naturalW;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(naturalW * scale));
          canvas.height = Math.max(1, Math.round(naturalH * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(null);
              return;
            }
            // QUAN TRỌNG: dùng cropBBox.width/height (nếu có) làm kích thước
            // LOGIC báo ra ngoài — KHÔNG dùng naturalW/naturalH đo được ở
            // trên. SVG dùng để load Image() ở đây CHỈ còn viewBox (đã bị
            // xoá width/height lúc set lại viewBox theo cropBBox phía trên),
            // nên trình duyệt trả naturalWidth theo kích thước MẶC ĐỊNH khi
            // ảnh không có width/height rõ ràng (không phải kích thước thật
            // của hình) — chỉ dùng đúng cho MỤC ĐÍCH tính tỉ lệ scale nội bộ
            // ở trên, không đại diện cho cỡ hiển thị thật.
            const logicalW = cropBBox && cropBBox.width > 0 ? cropBBox.width : naturalW;
            const logicalH = cropBBox && cropBBox.height > 0 ? cropBBox.height : naturalH;
            resolve({ blob, w: logicalW, h: logicalH });
          }, 'image/png');
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        };
        img.src = objectUrl;
      } catch {
        resolve(null);
      }
    });
  };

  // SỬA LỖI (26-7, "hình mất âm thầm sau khi Lưu/Xuất bản"): TRƯỚC ĐÂY, nếu
  // 1 hình TikZ upload lỗi mạng (timeout/đứt giữa chừng lúc fetch tới
  // /api/upload-tikz-svg), hàm chỉ console.error() rồi ÂM THẦM trả về
  // url: t.url || '' — không hề báo lại cho publishExam/saveExamToMongo biết
  // là có hình lỗi, nên 2 hàm đó vẫn chạy tiếp và báo "Lưu/Xuất bản thành
  // công" bình thường, dù thật ra 1 hình đã bị lưu THIẾU url (học sinh mở
  // đề ra sẽ thấy cảnh báo "Hình vẽ chưa có sẵn" — xem examRender.tsx).
  // GIỜ: (1) thử lại tối đa 3 lần cho mỗi hình lỗi (network chập chờn thường
  // qua khỏi sau 1-2 lần thử lại), cách nhau 800ms/1600ms; (2) nếu vẫn lỗi
  // sau khi hết số lần thử, GHI NHẬN id hình đó vào mảng `failed` trả về
  // kèm theo (không còn nuốt lỗi lặng lẽ nữa) để nơi gọi (saveExamToMongo/
  // publishExam) tự quyết định báo cho GV và cho GV chọn Hủy để thử lại
  // thay vì lưu thiếu mà không ai biết.
  const uploadTikzSvgsForSave = async (
    tikzList: { id: string; code: string; svg?: string; url?: string; w?: number; h?: number }[]
  ): Promise<{ list: { id: string; code: string; url: string; w?: number; h?: number }[]; failed: string[] }> => {
    const draftId = String(Date.now());
    const failed: string[] = [];
    const MAX_ATTEMPTS = 3;
    const results = await Promise.all(
      (tikzList || []).map(async (t) => {
        const freshSvg = svgMap[t.id];
        if (!freshSvg) {
          // Giữ nguyên w/h đã lưu từ lần upload trước (nếu có) — hình này
          // không đổi, không cần đo/gửi lại.
          return { id: t.id, code: t.code, url: t.url || '', w: t.w, h: t.h };
        }
        // (26-7) Gửi kèm viewBox đã đo ĐÚNG bằng trình duyệt (nếu đã từng
        // mở tab "Xem đề" cho hình này) — server dùng thẳng, không tự đo
        // lại bằng resvg nữa. Hình chưa từng mở "Xem đề" (chưa có trong
        // cache) vẫn gửi được bình thường, server tự rơi về cách đo cũ.
        const cropBBox = tikzCropCacheRef.current[t.id];
        // SỬA GỐC (26-7, "hình quá nặng không tải lên được dù có PNG dự
        // phòng" — xem giải thích đầy đủ ở rasterizeSvgToPngBlobClientSide
        // phía trên): Vercel chặn CỨNG ở 4.5MB request body, TRƯỚC KHI route
        // kịp tự cắt/nén/rasterize — nên với SVG có khả năng chạm ngưỡng đó,
        // phải rasterize sang PNG NGAY TRONG TRÌNH DUYỆT rồi gửi PNG (luôn
        // nhẹ) thay vì gửi SVG thô. Chừa hẳn khoảng an toàn rộng (ngưỡng
        // 1.5MB, thấp hơn nhiều so với 4.5MB thật) vì JSON.stringify() +
        // escape ký tự đặc biệt có thể làm chuỗi SVG phình thêm, và vẫn cần
        // dư chỗ cho các field khác trong body (tikzId/draftId/cropBBox).
        const RAW_SVG_CLIENT_RASTER_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
        const svgByteLength = new Blob([freshSvg]).size;
        const needsClientRasterize = svgByteLength > RAW_SVG_CLIENT_RASTER_THRESHOLD_BYTES;
        const pngResult = needsClientRasterize
          ? await rasterizeSvgToPngBlobClientSide(freshSvg, cropBBox)
          : null;
        if (needsClientRasterize && !pngResult) {
          console.error(`Hình TikZ "${t.id}" quá nặng (${svgByteLength} bytes) và rasterize phía trình duyệt thất bại — vẫn thử gửi thẳng SVG, có thể bị chặn ở tầng hạ tầng.`);
        }
        // THÊM MỚI (26-7, "có thêm thời gian để up ảnh không"): fetch() mặc
        // định KHÔNG có giới hạn thời gian — nếu mạng chỉ rất chậm (chứ
        // chưa hẳn đứt hẳn), request có thể "treo" rất lâu mà không rơi vào
        // catch để retry, làm cả Promise.all (mọi hình khác) phải chờ theo.
        // Dùng AbortController để tự huỷ sau UPLOAD_TIMEOUT_MS mỗi lần thử —
        // vẫn tính là 1 lần thử thất bại, chuyển sang lần thử tiếp theo,
        // thay vì treo vô thời hạn.
        const UPLOAD_TIMEOUT_MS = 20000;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
          try {
            let res: Response;
            if (pngResult) {
              // Gửi bằng multipart/FormData — PNG đã rasterize sẵn ở trình
              // duyệt (thường chỉ vài trăm KB ở 1600px), không còn phần
              // "svg thô" nặng nào trong request nữa. Gửi kèm w/h LOGIC
              // (không phải kích thước pixel thật của PNG) để route echo
              // lại trong response — nơi hiển thị dùng con số này để hình
              // PNG hiện đúng cỡ như 1 SVG bình thường, không bị "to khủng
              // khiếp" theo độ phân giải raster nội bộ.
              const fd = new FormData();
              fd.append('png', pngResult.blob, `${t.id}.png`);
              fd.append('tikzId', t.id);
              fd.append('draftId', draftId);
              fd.append('w', String(pngResult.w));
              fd.append('h', String(pngResult.h));
              res = await fetch('/api/upload-tikz-svg', { method: 'POST', body: fd, signal: controller.signal });
            } else {
              res = await fetch('/api/upload-tikz-svg', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ svg: freshSvg, tikzId: t.id, draftId, cropBBox }),
                signal: controller.signal,
              });
            }
            const result = await res.json();
            if (!res.ok) throw new Error(result?.error || 'Tải hình thất bại');
            const w = typeof result.w === 'number' && result.w > 0 ? result.w : undefined;
            const h = typeof result.h === 'number' && result.h > 0 ? result.h : undefined;
            return { id: t.id, code: t.code, url: result.url as string, w, h };
          } catch (err) {
            const isTimeout = err instanceof Error && err.name === 'AbortError';
            console.error(
              `Lỗi tải SVG TikZ "${t.id}" lên (lần ${attempt}/${MAX_ATTEMPTS}${isTimeout ? ', quá thời gian chờ' : ''}):`,
              err
            );
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, 800 * attempt));
            }
          } finally {
            clearTimeout(timeoutId);
          }
        }
        // Hết số lần thử mà vẫn lỗi -> KHÔNG âm thầm bỏ qua nữa, đánh dấu
        // vào `failed` để nơi gọi báo rõ cho GV. Vẫn trả url cũ (nếu có) để
        // đề không bị mất luôn hình cũ trong lúc chờ GV lưu lại.
        failed.push(t.id);
        return { id: t.id, code: t.code, url: t.url || '', w: t.w, h: t.h };
      })
    );
    return { list: results, failed };
  };

  const publishExam = async () => {
    const errors = validateExamBeforePublish(data, tikzFailedMap, tikzPendingCount);
    if (errors.length > 0) {
      setPublishErrors(errors);
      setShowPublishErrorsModal(true);
      return;
    }

    setIsPublishing(true);
    try {
      const title = examTitle || texFileName.replace(/\.[^/.]+$/, '');
      // THÊM MỚI (Bước 3): nhúng sẵn SVG đã biên dịch vào từng hình TikZ
      // trước khi lưu — trang /thi/[examId] (học sinh làm bài) chỉ hiển thị
      // svg có sẵn này, không tự gọi API biên dịch TikZ (API đó cần API key
      // Gemini riêng của giáo viên, lưu trong localStorage trình duyệt GV,
      // học sinh không có và không nên phải có).
      const { imageList: imageListWithUrl, missing: missingImages } = await uploadHardImagesForPublish();
      // (26-7) Đo ngầm viewBox cho MỌI hình TikZ trước khi upload — không
      // cần bạn phải mở tab "Xem đề" nữa, tự chạy trong lúc bấm "Xuất bản".
      await ensureAllTikzCropsCached(data.tikz_list || []);
      // SỬA (413 Payload Too Large): cùng lý do với saveExamToMongo — tải
      // SVG TikZ lên Vercel Blob thay vì nhúng thẳng, chỉ gửi {id, code, url}.
      const { list: tikzListWithUrl, failed: failedTikzIds } = await uploadTikzSvgsForSave(data.tikz_list || []);
      const dataWithSvg = {
        ...data,
        tikz_list: tikzListWithUrl,
        // THÊM MỚI (Bước 3.1 mục 2): nhúng URL Vercel Blob của ảnh cứng
        // ngoài tikz — cùng cơ chế "nhúng sẵn" như tikz_list ở trên.
        image_list: imageListWithUrl,
      };
      if (missingImages.length > 0) {
        console.warn('Ảnh cứng chưa có file khớp lúc xuất bản (sẽ hiện cảnh báo cho học sinh):', missingImages);
      }
      // SỬA LỖI (26-7, "báo Xuất bản thành công dù ảnh chưa lên kịp"): trước
      // đây lỗi upload TikZ bị nuốt lặng lẽ ở uploadTikzSvgsForSave, nên bấm
      // Xuất bản vẫn luôn thấy modal thành công dù có hình bị thiếu url —
      // học sinh mới phát hiện ra khi mở đề. Giờ dừng lại hỏi GV trước khi
      // thật sự xuất bản nếu có hình lỗi (đã thử lại 3 lần vẫn lỗi).
      if (failedTikzIds.length > 0) {
        const tiepTuc = window.confirm(
          `⚠️ ${failedTikzIds.length} hình TikZ tải lên thất bại (có thể do mạng chậm/chập chờn), dù đã thử lại 3 lần:\n` +
          failedTikzIds.join(', ') +
          `\n\nNếu vẫn Xuất bản bây giờ, học sinh sẽ thấy cảnh báo "Hình vẽ chưa có sẵn" ở câu chứa hình này cho tới khi bạn Xuất bản lại thành công.\n\n` +
          `Bấm OK để vẫn Xuất bản, hoặc Hủy để dừng lại và thử Xuất bản lại (khuyến nghị nếu mạng đang yếu).`
        );
        if (!tiepTuc) {
          setIsPublishing(false);
          return;
        }
      }
      // THÊM MỚI (mục 2): cùng logic với saveExamToMongo — đang sửa 1 đề đã
      // lưu/xuất bản trước đó (currentExamId có giá trị) thì PATCH cập nhật
      // tại chỗ để LINK CÔNG KHAI /thi/[id] KHÔNG đổi, học sinh dùng lại
      // đúng link cũ là thấy bản đã cập nhật. Đề hoàn toàn mới thì POST tạo
      // link mới như trước giờ.
      let newId = currentExamId;
      if (currentExamId) {
        const res = await fetch(`/api/exams/${currentExamId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            raw_data: dataWithSvg,
            settings: { ...examSettings, solutionOpenAt: datetimeLocalToIso(examSettings.solutionOpenAt), openAt: datetimeLocalToIso(examSettings.openAt) || null, closeAt: datetimeLocalToIso(examSettings.closeAt) || null },
            is_published: true,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || 'Xuất bản thất bại');
      } else {
        const res = await fetch('/api/save-exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            raw_data: dataWithSvg,
            settings: { ...examSettings, solutionOpenAt: datetimeLocalToIso(examSettings.solutionOpenAt), openAt: datetimeLocalToIso(examSettings.openAt) || null, closeAt: datetimeLocalToIso(examSettings.closeAt) || null },
            is_published: true,
          }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result?.error || 'Xuất bản thất bại');
        newId = result.id;
        setCurrentExamId(result.id);
      }
      setPublishedLink(`${window.location.origin}/thi/${newId}`);
      setShowPublishSuccessModal(true);
      refreshSavedExamsList();
    } catch (err) {
      console.error('Lỗi xuất bản đề:', err);
      alert('❌ Xuất bản thất bại! Hãy kiểm tra lại kết nối MongoDB (Console > F12 xem chi tiết lỗi).');
    } finally {
      setIsPublishing(false);
    }
  };

  // THÊM MỚI (khiếu nại: "có API xuất Word nhưng Cài đặt chỉ có xuất PDF"):
  // gọi GET /api/exams/[id]/export-docx, nhận về file .docx (Blob) rồi tự
  // tạo link tải xuống — giống cách trình duyệt tải file bình thường, không
  // cần mở tab mới. Cần currentExamId (đề phải được LƯU vào MongoDB trước,
  // vì file Word dựng từ raw_data đã lưu trên server, không dựng từ state
  // đang soạn dở trên trình duyệt) — nếu chưa lưu, báo rõ để GV bấm "Lưu đề
  // thi" ở nhóm bên trên trước.
  const exportExamDocx = async (withSolutions: boolean) => {
    setDocxExportError('');
    if (!currentExamId) {
      setDocxExportError('⚠️ Hãy bấm "Lưu đề thi" ở trên trước, sau đó mới xuất được file Word (file Word dựng từ đề đã lưu trên máy chủ).');
      return;
    }
    const kind: 'de' | 'loigiai' = withSolutions ? 'loigiai' : 'de';
    setIsExportingDocx(kind);
    try {
      const res = await fetch(`/api/exams/${currentExamId}/export-docx?withSolutions=${withSolutions ? '1' : '0'}`);
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error || 'Xuất file Word thất bại.');
      }
      const blob = await res.blob();
      // Lấy tên file gợi ý từ header Content-Disposition do server đặt sẵn
      // (đã gồm tên đề + "_De"/"_LoiGiai" + ngày) — fallback tên chung nếu
      // vì lý do gì đó không đọc được header (ví dụ trình duyệt chặn).
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `${examTitle || 'De_thi'}_${withSolutions ? 'LoiGiai' : 'De'}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Lỗi xuất Word:', err);
      setDocxExportError(`❌ ${err instanceof Error ? err.message : 'Xuất file Word thất bại.'}`);
    } finally {
      setIsExportingDocx(null);
    }
  };

  // THAY THẾ window.print(): gửi nguyên `printCodes` (N mã đề đã trộn ở
  // client bằng generateExamCodes) sang POST /api/exams/export-pdf-codes —
  // route đó dựng markdown thật (đề từng mã + đáp án gộp cuối, y hệt bố
  // cục PrintExamCodePaper/PrintAnswerKeyPage) rồi nhờ Space Hugging Face
  // chạy pandoc/xelatex xuất PDF thật, trả buffer về đây để tải xuống.
  // KHÔNG cần currentExamId/đề đã lưu — dữ liệu mã đề đi thẳng trong body.
  const exportPrintCodesPdf = async () => {
    setPdfCodesExportError('');
    if (!printCodes || printCodes.length === 0) {
      setPdfCodesExportError('⚠️ Hãy bấm "Tạo mã đề" trước để có dữ liệu mã đề cần xuất.');
      return;
    }
    setIsExportingPdfCodes(true);
    try {
      const res = await fetch('/api/exams/export-pdf-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: examTitle || texFileName.replace(/\.[^/.]+$/, ''),
          codes: printCodes,
        }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        throw new Error(result?.error || 'Xuất file PDF thất bại.');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `${examTitle || 'De_thi'}_${printCodes.length}MaDe.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Lỗi xuất PDF nhiều mã đề:', err);
      setPdfCodesExportError(`❌ ${err instanceof Error ? err.message : 'Xuất file PDF thất bại.'}`);
    } finally {
      setIsExportingPdfCodes(false);
    }
  };

  // Nhận `parsedData` đã bóc tách sẵn (từ parser.ts khi upload file, hoặc từ
  // MongoDB khi mở lại đề đã lưu) — set toàn bộ state hiển thị + gửi ngầm
  // từng hình TikZ sang Hugging Face để biên dịch. Tách riêng hàm này để
  // dùng chung cho cả 2 nguồn dữ liệu, tránh lặp code.
  const loadExamData = (parsedData: any) => {
    setData(parsedData);
    setSvgMap({}); // reset ảnh của lần trước
    setTikzImgUrlMap({}); // reset ảnh PNG (TikZ rasterize) của lần trước
    setEditingId(null);
    setOpenSolutions({});
    setEditingTikzId(null);

    setTikzFailedMap({}); // reset trạng thái lỗi biên dịch của lần trước
    // SỬA (mục 2 phần A): dòng setDismissImageBanner(false) từng ở đây đã bỏ
    // theo state đã xoá (xem ghi chú tại khai báo state cũ).
    // THÊM MỚI (mục 2, phần B): reset state "đã bỏ qua" của popup mới mỗi
    // khi nạp đề MỚI, để popup có thể hiện lại đúng lúc (không bị nhớ "đã bỏ
    // qua" của đề cũ). Đóng luôn popup đang mở (nếu có, trường hợp GV tải đè
    // đề khác trong lúc popup của đề trước còn hiện).
    setMissingImagePopupDismissed(false);
    setShowMissingImagePopup(false);

    // SỬA (câu hỏi: "nếu đã lưu ảnh rồi, lần sau mở lại đề để sửa liệu có
    // mất ảnh không?"): TRƯỚC ĐÂY loadExamData KHÔNG hề đọc field `url`
    // trong `image_list` (chỉ dùng để upload lúc Lưu/Xuất bản — xem mục 1),
    // nên mọi ảnh cứng ĐỨNG RIÊNG ngoài tikz của 1 đề ĐÃ LƯU (đã có `url`
    // thật) vẫn hiện "⚠️ Thiếu ảnh" và popup/banner báo thiếu — dù ảnh không
    // hề mất, chỉ là GV chưa chọn lại đúng thư mục ảnh CỤC BỘ trong phiên
    // trình duyệt hiện tại (imageMap là state trong bộ nhớ tab, luôn trống
    // lúc mới mở lại trang). Giờ: mỗi khi nạp đề (mở đề đã lưu, hoặc tải lại
    // file .tex có sẵn image_list kèm url — trường hợp hiếm), tự "mồi" trước
    // imageMap bằng chính url thật đó, dùng basename làm khoá y hệt các chỗ
    // khác đang tra imageMap — nhờ vậy ảnh hiện đúng ngay (HardImageZoom
    // nhận url http(s) làm src cũng chạy bình thường, không cần là blob:),
    // và các map/tính năng "thiếu ảnh" (tikzMissingEmbeddedMap phần standalone,
    // standaloneMissingImages, missingHardImageLocations, popup mới) đều tự
    // động không còn báo giả những ảnh này. Dùng hàm cập nhật (prev) để GIỮ
    // NGUYÊN — không đè mất — ảnh cục bộ (blob:) mà GV vừa chọn ngay trong
    // phiên này (ví dụ chọn thư mục ảnh trước khi tải đề khác đè lên), chỉ
    // bổ sung thêm những basename mà imageMap hiện tại CHƯA có.
    const savedImageUrlMap: Record<string, string> = {};
    (parsedData?.image_list || []).forEach((img: { id: string; path: string; url?: string }) => {
      if (typeof img.url === 'string' && img.url.trim().length > 0) {
        const baseName = img.path.split('/').pop() || img.path;
        savedImageUrlMap[baseName] = img.url;
      }
    });
    if (Object.keys(savedImageUrlMap).length > 0) {
      setImageMap((prev) => ({ ...savedImageUrlMap, ...prev }));
    }

    // Nếu đề có hình TikZ: hình nào ĐÃ có sẵn svg (lưu từ lần trước — xem
    // saveExamToMongo/publishExam) thì dùng luôn, KHÔNG gọi API biên dịch
    // lại. Chỉ hình nào thật sự chưa có svg (đề mới upload lần đầu, hoặc
    // svg cũ bị thiếu/rỗng) mới gửi đi biên dịch. Chạy song song (không
    // await tuần tự) để không chặn giao diện — hình nào xong trước thì hiện
    // trước, các câu khác vẫn đọc được bình thường.
    // SỬA LỖI (mở lại đề bị biên dịch lại TikZ từ đầu): trước đây bước này
    // luôn gọi API biên dịch cho MỌI hình mà không kiểm tra svg có sẵn hay
    // chưa — vừa chậm (chờ biên dịch lại dù ảnh đã có), vừa dễ làm quá tải
    // server biên dịch (Hugging Face, giới hạn ~25 request) khi nhiều giáo
    // viên cùng mở đề đã lưu.
    if (parsedData.tikz_list && parsedData.tikz_list.length > 0) {
      const list = parsedData.tikz_list;
      // Nạp ngay các svg đã có sẵn (không cần chờ biên dịch) — hình hiện ra
      // tức thì thay vì phải đợi vòng lặp bên dưới.
      const existingSvgMap: Record<string, string> = {};
      list.forEach((t: any) => {
        if (t.svg) existingSvgMap[t.id] = t.svg;
      });
      setSvgMap((prev) => ({ ...prev, ...existingSvgMap }));

      // THÊM MỚI (đưa SVG TikZ lên Vercel Blob): hình nào ĐÃ có `url` (lưu
      // từ lần trước theo cách mới — xem uploadTikzSvgsForSave) nhưng CHƯA
      // có `svg` nhúng sẵn thì tải nội dung SVG thật về svgMap để hiển thị
      // tiếp, KHÔNG coi là "chưa biên dịch" (tránh gọi lại API TikZ tốn
      // quota chỉ vì thiếu mỗi bước mồi này — API biên dịch dùng chung 1 key
      // Gemini/HF giới hạn số lượt gọi). Chạy song song, không chặn giao diện.
      // THÊM MỚI (khiếu nại 27-7): url PNG (hình TikZ quá nặng, đã rasterize
      // lúc Xuất bản — xem RAW_SVG_CLIENT_RASTER_THRESHOLD_BYTES) nhận diện
      // ngay qua đuôi file, KHÔNG cần fetch về đọc nội dung (ảnh dùng thẳng
      // làm src, không cần chuỗi SVG) — vừa tránh bug "luôn báo lỗi vì tìm
      // '<svg' trong dữ liệu nhị phân", vừa nhanh hơn (khỏi tải nội dung ảnh
      // về JS chỉ để bỏ đi, trình duyệt tự tải ảnh qua <img src> lúc render).
      const isPngUrl = (u: string) => /\.png(\?|$)/i.test(u);
      const pngUrlItems = list.filter((t: any) => !t.svg && t.url && isPngUrl(t.url));
      if (pngUrlItems.length > 0) {
        const pngMap: Record<string, { url: string; w?: number; h?: number }> = {};
        pngUrlItems.forEach((t: any) => {
          pngMap[t.id] = { url: t.url, w: t.w, h: t.h };
        });
        setTikzImgUrlMap((prev) => ({ ...prev, ...pngMap }));
      }

      const toHydrateFromUrl = list.filter((t: any) => !t.svg && t.url && !isPngUrl(t.url));
      const toCompile = list.filter((t: any) => !t.svg && !t.url);
      setTikzProgress({
        total: list.length,
        done: list.length - toCompile.length - toHydrateFromUrl.length - pngUrlItems.length,
      });
      // Lưu mã TikZ gốc của từng hình để dùng cho tính năng "Sửa hình".
      setTikzSourceMap(Object.fromEntries(list.map((t: any) => [t.id, t.code])));
      // THÊM MỚI: dò trước ảnh cứng chèn bên trong từng hình TikZ (nếu có) để
      // (1) hiện cảnh báo thiếu ảnh ngay cả khi chưa biên dịch xong, và
      // (2) biết ảnh nào cần gửi kèm base64 lúc gọi API bên dưới. Đặt TRƯỚC
      // cả toHydrateFromUrl/toCompile bên dưới vì nhánh "url lỗi -> biên dịch
      // lại" (recompileTikzItem) cũng cần map này.
      const embeddedByFig: Record<string, string[]> = {};
      list.forEach((t: any) => {
        const names = extractEmbeddedImageRefs(t.code);
        if (names.length > 0) embeddedByFig[t.id] = names;
      });
      setTikzEmbeddedMap(embeddedByFig);

      // THÊM MỚI (câu hỏi: "đổi cấu hình Supabase làm mất hình cũ, mở lại đề
      // thì sao?"): logic biên dịch dùng chung cho (1) hình hoàn toàn mới
      // (toCompile — chưa từng có url) và (2) hình ĐÃ có url nhưng file trên
      // Supabase không tải về được nữa — do đổi bucket/env, xoá thủ công,
      // hoặc bất kỳ lý do gì khiến url cũ chết. Gộp chung 1 hàm để cả 2
      // trường hợp đều biên dịch lại TỪ MÃ TIKZ GỐC (tikz.code — luôn được
      // giữ nguyên trong Mongo, không phụ thuộc Supabase) rồi nạp vào
      // svgMap. Bản thân hàm này KHÔNG tự gọi API lưu lên Supabase — chỉ
      // cần svgMap[id] có giá trị mới là uploadTikzSvgsForSave (chạy lúc GV
      // bấm Lưu/Xuất bản) sẽ TỰ ĐỘNG coi đây là "có bản mới cần tải lên" và
      // ghi đè url cũ trong Mongo bằng url Supabase mới — đúng ý "biên dịch
      // lại và lưu lại".
      const recompileTikzItem = async (tikz: any, isReplacingBrokenUrl: boolean) => {
        const templateCode = buildTikzTemplate(tikz.code);
        const embeddedNames = embeddedByFig[tikz.id] || [];

        // SỬA (gốc vấn đề "dán đề -> biên dịch ngay -> ảnh cứng trong TikZ
        // chưa kịp nạp -> báo lỗi hàng loạt"): nếu hình này có \includegraphics
        // bên trong mà lúc NÀY imageMap chưa đủ ảnh cần, KHÔNG gửi đi biên
        // dịch (chắc chắn thiếu ảnh, gửi cũng vô nghĩa, còn tốn 1 lượt gọi
        // server free đang giới hạn số request) — để dành cho effect tự động
        // biên dịch lại (useEffect theo dõi imageMap ở trên) xử lý ngay khi
        // GV nạp đủ ảnh, không tính vào tikzProgress.done ở đây vì chưa thật
        // sự được thử. Banner phía trên khu vực upload sẽ tự nhắc GV chọn
        // thư mục ảnh khi phát hiện còn hình đang ở trạng thái này.
        if (embeddedNames.length > 0 && embeddedNames.some((n) => !imageMap[n])) {
          if (isReplacingBrokenUrl) {
            setTikzFailedMap((prev) => ({
              ...prev,
              [tikz.id]: 'Hình đã lưu bị mất (url cũ lỗi) và cần biên dịch lại, nhưng còn ảnh cứng chèn trong hình chưa chọn lại thư mục ảnh — vui lòng chọn lại thư mục ảnh để biên dịch lại hình này.',
            }));
          }
          return;
        }

        // Đánh dấu ĐANG thật sự gửi đi biên dịch AI (khác với chỉ tải lại
        // SVG đã lưu ở nhánh toHydrateFromUrl phía trên) — dùng để banner
        // chọn đúng chữ "Đang biên dịch hình mới" thay vì nhầm sang mọi
        // trường hợp mở đề cũ. Set nên add lại vẫn an toàn, không lệch số.
        setRealCompilingIds((prev) => {
          const next = new Set(prev);
          next.add(tikz.id);
          return next;
        });

        try {
          // Nếu hình có ảnh cứng bên trong, gửi kèm base64 của những ảnh đã
          // tìm thấy trong thư mục ảnh (imageMap) — ảnh chưa chọn thì bỏ
          // qua, cảnh báo thiếu ảnh sẽ tự hiện dựa vào tikzMissingEmbeddedMap.
          const images = embeddedNames.length > 0
            ? await buildEmbeddedImagesPayload(embeddedNames, imageMap)
            : undefined;
          const apiData = await compileTikzWithFallback(templateCode, images);
          // SỬA LỖI: trước đây chỉ kiểm apiData.success — nếu server trả về
          // {success: true, svg: ""} (hoặc thiếu field svg do lỗi mạng/response
          // bị cắt giữa chừng), code coi là thành công, hình biến mất âm thầm
          // mà KHÔNG vào tikzFailedMap, không hiện trong khung đỏ tổng kết lỗi.
          // Giờ bắt buộc svg phải là chuỗi thật sự chứa nội dung SVG hợp lệ.
          const svgOk = !!apiData && !!apiData.success && typeof apiData.svg === 'string'
            && apiData.svg.trim().length > 0 && apiData.svg.includes('<svg');
          if (svgOk) {
            setSvgMap((prev) => ({ ...prev, [tikz.id]: apiData.svg }));
            setTikzFailedMap((prev) => {
              if (!(tikz.id in prev)) return prev;
              const next = { ...prev };
              delete next[tikz.id];
              return next;
            });
          } else {
            console.error("Cả 2 app đều biên dịch thất bại (hoặc trả về SVG rỗng) cho hình:", tikz.id, apiData);
            const reason = apiData && apiData.success
              ? 'Server báo thành công nhưng không trả về SVG hợp lệ'
              : (apiData && apiData.error) || 'Biên dịch thất bại';
            setTikzFailedMap((prev) => ({
              ...prev,
              [tikz.id]: isReplacingBrokenUrl ? `Hình đã lưu bị mất, biên dịch lại từ mã gốc cũng thất bại: ${reason}` : reason,
            }));
          }
        } catch (error) {
          console.error("Lỗi gọi API biên dịch TikZ:", error);
          setTikzFailedMap((prev) => ({
            ...prev,
            [tikz.id]: isReplacingBrokenUrl ? 'Hình đã lưu bị mất, biên dịch lại từ mã gốc cũng bị lỗi khi gọi API' : 'Lỗi khi gọi API biên dịch',
          }));
        } finally {
          setTikzProgress((prev) => ({ ...prev, done: prev.done + 1 }));
          setRealCompilingIds((prev) => {
            if (!prev.has(tikz.id)) return prev;
            const next = new Set(prev);
            next.delete(tikz.id);
            return next;
          });
        }
      };

      toHydrateFromUrl.forEach(async (t: any) => {
        try {
          const res = await fetch(t.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const svg = await res.text();
          if (!svg || !svg.includes('<svg')) throw new Error('Nội dung tải về không phải SVG hợp lệ');
          setSvgMap((prev) => ({ ...prev, [t.id]: svg }));
          setTikzFailedMap((prev) => {
            if (!(t.id in prev)) return prev;
            const next = { ...prev };
            delete next[t.id];
            return next;
          });
          setTikzProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        } catch (err) {
          // SỬA (câu hỏi: "đổi cấu hình lưu trữ làm mất hình cũ trên
          // Supabase, mở lại đề thì sao?"): TRƯỚC ĐÂY tới đây là bó tay,
          // chỉ báo lỗi "Không tải được hình đã lưu" — hình coi như mất
          // hẳn dù mã TikZ gốc (t.code) vẫn còn nguyên trong Mongo. GIỜ:
          // coi url chết (404/mất mạng/nội dung trả về không phải SVG —
          // ví dụ trang lỗi HTML của Supabase khi object không tồn tại)
          // là tín hiệu "cần biên dịch lại từ đầu", tự động gọi lại y hệt
          // 1 hình hoàn toàn mới (recompileTikzItem) — không cần GV làm gì
          // thêm. Biên dịch xong, hình hiện lại bình thường; lần GV bấm
          // Lưu/Xuất bản tiếp theo, uploadTikzSvgsForSave thấy svgMap có
          // bản mới sẽ tự tải lên Supabase lại và ghi đè url mới vào Mongo.
          console.warn(`URL hình TikZ "${t.id}" đã lưu bị lỗi/mất (${(err as Error)?.message || err}) — tự biên dịch lại từ mã gốc.`);
          await recompileTikzItem(t, true);
        }
      });

      toCompile.forEach((tikz: any) => {
        recompileTikzItem(tikz, false);
      });
    } else {
      setTikzProgress({ total: 0, done: 0 });
      setTikzEmbeddedMap({});
    }
  };

  const processExamText = async (text: string) => {
    // THÊM MỚI: nếu nội dung file là định dạng markdown mẫu ("**Phần I. ...**")
    // thì dùng parser mới; ngược lại giữ NGUYÊN hành vi cũ (parser.ts cho .tex).
    const parsedData = isMarkdownExamFormat(text)
      ? parseMarkdownExamToJSON(text)
      : (await import('./parser')).parseLatexToJSON(text);

    loadExamData(parsedData);
    // SỬA LỖI: sau khi tải file/dán nội dung xong, tự nhảy sang tab "Xem đề"
    // — trước đây thiếu dòng này nên chỉ luồng mở lại đề đã lưu (dòng ~4889)
    // mới tự chuyển tab, còn tải file mới/dán trực tiếp thì không.
    setBuilderSubTab('view');
    // THÊM MỚI (mục 2, phần B): báo cho effect theo dõi map thiếu ảnh biết
    // "vừa mới load đề xong qua luồng tải file/dán trực tiếp" — effect đó sẽ
    // tự bật popup nếu phát hiện đề thiếu ảnh cứng ngay khi re-render xong.
    justLoadedExamRef.current = true;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    // THÊM MỚI: ghim tên tệp hiện tại — nếu người dùng chọn LẠI đúng tệp này
    // (đã reset input value bên dưới nên onChange vẫn bắn ra), processExamText
    // vẫn chạy lại toàn bộ luồng parse + biên dịch nên nội dung LUÔN được cập
    // nhật, không bị "tưởng nhầm là không đổi gì" chỉ vì tên tệp giống nhau.
    // SỬA LỖI (26-7, "tải file .tex khác nhưng tên đề cũ vẫn còn"): examTitle
    // là state RIÊNG với texFileName — nếu đã có giá trị từ trước (gõ tay
    // hoặc từ đề đã mở trước đó) thì ô tiêu đề (examTitle || texFileName...)
    // sẽ ưu tiên giữ giá trị CŨ này, không tự cập nhật theo tên file MỚI vừa
    // chọn. Phải reset về '' ở đây để rơi về đúng nhánh lấy tên file mới.
    setExamTitle('');
    setTexFileName(file.name);
    await processExamText(text);
    // Cho phép chọn lại đúng file vừa upload (nếu người dùng bấm lại) — nếu
    // không reset value, trình duyệt coi là "không đổi" nên sẽ không bắn lại
    // sự kiện onChange.
    e.target.value = '';
  };

  // THÊM MỚI: kéo-thả file .tex trực tiếp vào khung upload, dùng chung
  // processExamText giống hệt hành vi khi bấm chọn file.
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const handleDragOverUpload = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeaveUpload = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDropUpload = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    // SỬA LỖI (26-7, cùng lỗi với handleFileUpload): reset examTitle để ô
    // tiêu đề tự cập nhật theo tên file MỚI vừa kéo-thả vào, không giữ tên
    // đề cũ còn sót lại từ trước.
    setExamTitle('');
    setTexFileName(file.name);
    await processExamText(text);
  };

  // THÊM MỚI: ô nhập cho phép dán trực tiếp nội dung .tex (không cần lưu ra
  // file rồi mới upload) — bấm nút "Xử lý" để chạy đúng cùng luồng parse +
  // biên dịch TikZ như khi upload file.
  const [pastedText, setPastedText] = useState('');
  const [isProcessingPaste, setIsProcessingPaste] = useState(false);

  const handleProcessPastedText = async () => {
    const text = pastedText.trim();
    if (!text) return;
    setIsProcessingPaste(true);
    try {
      // SỬA LỖI (26-7, cùng lỗi với handleFileUpload): reset examTitle để ô
      // tiêu đề không giữ tên đề cũ còn sót lại từ trước khi dán nội dung mới.
      setExamTitle('');
      setTexFileName('📋 Nội dung dán trực tiếp');
      await processExamText(text);
    } finally {
      setIsProcessingPaste(false);
    }
  };

  // Tách văn bản theo dấu mốc [[HÌNH_TIKZ_n]] và "cấy" ảnh SVG đã biên dịch
  // vào đúng vị trí; hình nào chưa xong thì hiện icon đang tải. Phần chữ còn
  // lại vẫn render LaTeX như cũ.
  // Render phần văn bản còn lại (đã loại bảng) như cũ: tách theo mốc hình
  // TikZ rồi cấy ảnh, phần chữ/công thức thường đưa qua <Latex>.
  const renderTikzAndFormulas = (text: string, keyPrefix: string) => {
    // THÊM MỚI: tách thêm cả mốc [[HÌNH_FILE_n]] (ảnh \includegraphics nằm
    // ngoài tikz, xử lý ở nhánh riêng bên dưới — không gửi HF, không biên
    // dịch, chỉ tự khớp với ảnh người dùng đã chọn từ thư mục ảnh).
    const parts = text.split(/(\[\[HÌNH_TIKZ_\d+\]\]|\[\[HÌNH_FILE_\d+\]\])/g);

    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith('[[HÌNH_FILE_')) {
        const originalPath = imagePathMap[part] || '';
        const baseName = originalPath.split('/').pop() || originalPath;
        const blobUrl = resolveImageUrl(imageMap, baseName);
        if (blobUrl) {
          // ĐÃ BỎ thanh trượt zoom (khiếu nại: không có tác dụng) — hiển thị
          // cố định 100%.
          // SỬA (yêu cầu 23-7 sau: "áp dụng trang Xem đề như 2 trang kia") —
          // TRƯỚC ĐÂY "my-0" (0px, ảnh dính sát chữ) -> đổi thành "my-2"
          // (8px, đồng bộ với examRender.tsx dùng cho trang Xem mô phỏng/học
          // sinh) + thêm "flex justify-center min-w-0 w-full" để div bọc co
          // đúng theo khung chứa hẹp (điện thoại dọc), khớp với cách bọc ở
          // examRender.tsx.
          // SỬA (yêu cầu tiếp: "giảm khoảng cách ảnh về 4px") — my-2 (8px)
          // -> my-1 (4px), đồng bộ với examRender.tsx.
          return (
            <div key={key} className="my-1 flex justify-center min-w-0 w-full">
              <HardImageZoom src={blobUrl} alt={baseName} />
            </div>
          );
        }
        // Không tìm thấy ảnh khớp trong thư mục đã chọn -> báo rõ tên file
        // thiếu, không làm vỡ layout các câu khác.
        return (
          <div
            key={key}
            className="my-0 inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium"
          >
            ⚠️ Thiếu ảnh: <span className="font-mono">{baseName || originalPath || '(không rõ tên)'}</span>
            {originalPath && originalPath !== baseName && (
              <span className="text-red-400 font-normal">({originalPath})</span>
            )}
          </div>
        );
      }
      if (part.startsWith('[[HÌNH_TIKZ_')) {
        // THÊM MỚI (khiếu nại 27-7): hình TikZ đã rasterize thành PNG lúc
        // Xuất bản (quá nặng để gửi SVG thô) — dùng thẳng url làm src ảnh,
        // KHÔNG đi qua svgMap/TikzImage (chỉ nhận SVG thật), tránh bug
        // "mở lại đề báo biên dịch thất bại" — xem giải thích đầy đủ ở khai
        // báo state tikzImgUrlMap phía trên.
        const pngEntry = tikzImgUrlMap[part];
        if (pngEntry) {
          const scaleFactor = examSettings.imageScalePercent / 100;
          const imgStyle = pngEntry.w && pngEntry.h && pngEntry.w > 0
            ? { width: `${Math.round(pngEntry.w * scaleFactor)}px`, maxWidth: 'min(100%, calc(100vmin - 2rem))', height: 'auto' as const }
            : { width: 'auto' as const, maxWidth: `min(${Math.round(520 * scaleFactor)}px, calc(100vmin - 2rem))`, height: 'auto' as const };
          return (
            <div key={key} className="my-1">
              <div className="flex justify-end mb-1">
                <button
                  onClick={() => startEditTikz(part)}
                  className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-600 font-medium px-2 py-1 rounded shadow-sm transition"
                >
                  🖊️ Sửa hình
                </button>
              </div>
              <div className="flex justify-center min-w-0 w-full">
                <img src={pngEntry.url} alt="" className="h-auto rounded" style={imgStyle} loading="lazy" decoding="async" />
              </div>
            </div>
          );
        }
        const svg = svgMap[part];
        if (svg) {
          const missingEmbedded = tikzMissingEmbeddedMap[part];
          const embeddedNames = tikzEmbeddedMap[part];
          // SỬA (yêu cầu tiếp: "giảm khoảng cách ảnh png/jpg/svg đồng nhất về
          // 4px") — TRƯỚC ĐÂY "my-0" (0px, dính sát chữ) -> "my-1" (4px), để
          // hình TikZ (SVG) có cùng khoảng cách với ảnh PNG/JPG ở trên và
          // đồng bộ với 2 trang kia.
          return (
            <div key={key} className="my-1">
              {/* ĐÃ BỎ thanh trượt zoom (khiếu nại: không có tác dụng) —
                  hình luôn hiển thị cố định 100%. Nút "Sửa hình" nằm trên
                  MỘT HÀNG RIÊNG, trong luồng bình thường (không dùng
                  "absolute" nữa) — vì khi ảnh nằm sát ngay dưới dòng văn
                  bản (không có khoảng trống), overlay tuyệt đối kiểu
                  "bottom-full" sẽ trồi lên đè thẳng vào dòng chữ phía
                  trên. Đặt nút trong 1 div "flex justify-end" độc lập:
                  luôn ở dưới dòng văn bản (vì nằm sau nó trong luồng),
                  luôn ở trên ảnh (vì đứng ngay trước ảnh), và canh sát
                  mép phải của khung câu hỏi (không phải mép ảnh, để nút
                  không bị dịch chuyển vị trí khi ảnh nhỏ/hẹp hơn khung). */}
              <div className="flex justify-end mb-1">
                <button
                  onClick={() => startEditTikz(part)}
                  className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-600 font-medium px-2 py-1 rounded shadow-sm transition"
                >
                  🖊️ Sửa hình
                </button>
              </div>
              <div className="flex justify-center">
                {/* SỬA (khiếu nại: 4 trang hiển thị cỡ hình lệch nhau):
                    dùng chung TIKZ_DISPLAY_BASE_SCALE (tikzScaleConstants.ts)
                    thay vì hằng số 130 viết cứng riêng ở đây — cùng 1 nguồn
                    với lib/examRender.tsx (dùng cho Xem mô phỏng/Trang HS
                    thật/Lời giải), đảm bảo cả 4 trang luôn khớp cỡ hình,
                    sửa 1 chỗ (tikzScaleConstants.ts) là đồng bộ khắp nơi. */}
                <TikzImage
                  svg={svg}
                  scale={TIKZ_DISPLAY_BASE_SCALE * (examSettings.imageScalePercent / 100)}
                  figId={part}
                  onCropped={(id, bbox) => {
                    tikzCropCacheRef.current[id] = bbox;
                  }}
                />
              </div>
              {/* THÊM MỚI: hình TikZ có chèn ảnh cứng (\includegraphics) bên
                  trong — báo rõ đã ghép được ảnh nào hay còn thiếu ảnh nào,
                  vì tính năng gửi kèm ảnh base64 sang server là THỬ NGHIỆM
                  (phụ thuộc server có hỗ trợ hay không), nên luôn hiển thị
                  trạng thái để người dùng tự kiểm tra lại hình cho chắc. */}
              {embeddedNames && embeddedNames.length > 0 && (
                missingEmbedded ? (
                  <p className="mt-1 text-center text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                    ⚠️ Hình này chèn ảnh cứng bên trong nhưng còn thiếu:{' '}
                    <span className="font-mono">{missingEmbedded.join(', ')}</span> — chọn đúng thư mục ảnh chứa
                    file này rồi bấm "Sửa hình → Biên dịch lại".
                  </p>
                ) : (
                  <p className="mt-1 text-center text-xs text-purple-500">
                    📎 Hình có {embeddedNames.length} ảnh cứng chèn bên trong, đã thử gửi kèm khi biên dịch — kiểm tra
                    lại nếu hình hiển thị chưa đúng.
                  </p>
                )
              )}
            </div>
          );
        }
        // THÊM MỚI: biên dịch THẤT BẠI (đã thử cả 2 app) -> hiện thẻ báo lỗi
        // rõ ràng thay vì giữ spinner "Đang vẽ hình..." mãi mãi (trước đây
        // chỉ console.error nên người dùng không biết là đã dừng thử hay
        // còn đang chờ). Nếu nguyên nhân liên quan ảnh cứng chèn trong tikz,
        // giải thích rõ đây là giới hạn của SERVER biên dịch (không nhận
        // được file ảnh gốc), không phải lỗi cú pháp — kèm nút mở "Sửa hình"
        // để tự chỉnh tay (vd bỏ \includegraphics, thay bằng khung/placeholder).
        if (tikzFailedMap[part]) {
          const embeddedNames = tikzEmbeddedMap[part];
          return (
            <div key={key} className="my-0 max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-sm font-medium text-red-700">⚠️ Hình này biên dịch thất bại</p>
              {embeddedNames && embeddedNames.length > 0 ? (
                <p className="text-xs text-red-600 mt-1">
                  Hình có chèn ảnh cứng (<span className="font-mono">{embeddedNames.join(', ')}</span>) bên trong mã
                  TikZ — máy chủ biên dịch hiện KHÔNG hỗ trợ nhận kèm file ảnh gốc nên
                  <span className="font-mono"> \includegraphics</span> không biên dịch được. Hãy bấm "Sửa hình" và bỏ
                  lệnh <span className="font-mono">\includegraphics</span> này (thay bằng khung/placeholder, hoặc
                  chuyển ảnh đó ra ngoài tikz).
                </p>
              ) : (
                <p className="text-xs text-red-600 mt-1">
                  Lỗi: <span className="font-mono">{tikzFailedMap[part]}</span> — kiểm tra lại cú pháp mã TikZ.
                </p>
              )}
              <button
                onClick={() => startEditTikz(part)}
                className="mt-2 text-xs bg-purple-50 hover:bg-purple-100 text-purple-600 font-medium px-3 py-1.5 rounded transition"
              >
                🖊️ Sửa hình
              </button>
            </div>
          );
        }
        return (
          <span key={key} className="inline-flex flex-col items-center gap-1 my-0">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-blue-600 text-xs font-medium align-middle">
              <span
                className="inline-block rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin"
                style={{ width: 12, height: 12 }}
              />
              Đang vẽ hình...
            </span>
            {tikzMissingEmbeddedMap[part] && (
              <span className="text-[11px] text-red-500 text-center max-w-xs">
                ⚠️ Hình có ảnh cứng chèn bên trong đang thiếu:{' '}
                <span className="font-mono">{tikzMissingEmbeddedMap[part].join(', ')}</span> — chọn thư mục ảnh chứa
                file này để biên dịch đúng.
              </span>
            )}
          </span>
        );
      }
      // SỬA (khiếu nại 23-7: "trang Xem đề, chữ in nghiêng tự dưng xuống
      // dòng riêng dù dòng trên còn trống") — TRƯỚC ĐÂY đưa thẳng `part`
      // vào <Latex>, khiến $\textit{...}$/$\textbf{...}$ bị KaTeX dựng
      // thành 1 khối inline-block không ngắt được -> đẩy nguyên khối xuống
      // dòng mới. Dùng lại renderTextWithItalicBoldFix (đã dùng ở trang Xem
      // mô phỏng/học sinh) để tách riêng phần in nghiêng/đậm ra <em>/
      // <strong> ngắt dòng tự nhiên, đồng bộ cả 3 trang.
      return <Fragment key={key}>{renderTextWithItalicBoldFix(part, key)}</Fragment>;
    });
  };

  // Bao ngoài renderTikzAndFormulas: tách các khối bảng thống kê dạng
  // \begin{array}...\end{tabular} ra trước (KaTeX không render được kiểu
  // này), phần văn bản còn lại giữa các khối bảng vẫn xử lý TikZ + công thức
  // như cũ.
  // SỬA (khiếu nại: bản xem trước soạn đề hiện "rác" [[HANG_HINH_ROW]] / "|||"
  // / [[/HANG_HINH_ROW]] ra màn hình thay vì xếp ảnh/tikz cạnh nhau) — file
  // này (ExamBuilder.tsx) có MỘT BẢN SAO RIÊNG của renderTikzAndFormulas,
  // tách độc lập với src/lib/examRender.tsx (bản dùng cho trang /thi làm
  // bài của học sinh). Khi Phần 2B thêm mốc [[HANG_HINH_ROW]]...[[/HANG_HINH_ROW]]
  // (parser.ts sinh ra cho \tabular/\array chỉ dùng để dàn layout ảnh/tikz
  // cạnh nhau, xem HANDOFF-PHAN2B.md), bản sao ở examRender.tsx đã được vá
  // (renderHangHinhRow) nhưng bản sao Ở ĐÂY thì chưa — nên regex tách phần
  // tử ở renderTikzAndFormulas() phía trên chỉ biết mốc [[HÌNH_TIKZ_n]] /
  // [[HÌNH_FILE_n]], còn [[HANG_HINH_ROW]]/[[/HANG_HINH_ROW]]/"|||" lọt qua
  // <Latex> như chữ thường -> hiện rác y hệt trong ảnh chụp màn hình.
  // Vá tại đây: tách riêng cặp mốc HANG_HINH_ROW TRƯỚC khi gọi
  // renderTikzAndFormulas cho từng đoạn còn lại, mỗi hàng vẽ thành 1
  // flex-row (điện thoại xếp trên-dưới, từ sm: trở lên xếp ngang cạnh nhau
  // — giống hệt cách renderHangHinhRow làm ở examRender.tsx).
  const HANG_HINH_ROW_RE = /\[\[HANG_HINH_ROW\]\]([\s\S]*?)\[\[\/HANG_HINH_ROW\]\]/g;
  // SỬA (khiếu nại 23-7 lần 2, đồng bộ examRender.tsx): flex-wrap + flex-basis
  // theo bề rộng khung chứa THẬT thay vì breakpoint viewport sm: — xem giải
  // thích đầy đủ ở renderHangHinhRow trong examRender.tsx.
  const renderHangHinhRow = (rowContent: string, keyPrefix: string) => {
    const cells = rowContent.split('|||');
    const cellMaxWidth = Math.round(420 * (examSettings.imageScalePercent / 100));
    return (
      <div key={keyPrefix} className="flex flex-wrap items-start justify-center gap-4 w-full">
        {cells.map((cell, cIdx) => (
          <div
            key={`${keyPrefix}-cell${cIdx}`}
            className="flex-1 flex justify-center min-w-0"
            style={{ flexBasis: 220, maxWidth: cellMaxWidth }}
          >
            {renderTikzAndFormulas(cell.trim(), `${keyPrefix}-cell${cIdx}-tok`)}
          </div>
        ))}
      </div>
    );
  };
  const renderTikzAndFormulasWithRows = (text: string, keyPrefix: string) => {
    if (!text.includes('[[HANG_HINH_ROW]]')) {
      return renderTikzAndFormulas(text, keyPrefix);
    }
    const out: React.ReactNode[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    HANG_HINH_ROW_RE.lastIndex = 0;
    while ((m = HANG_HINH_ROW_RE.exec(text))) {
      if (m.index > lastIndex) {
        out.push(...renderTikzAndFormulas(text.slice(lastIndex, m.index), `${keyPrefix}-p${i}`));
      }
      out.push(renderHangHinhRow(m[1], `${keyPrefix}-row${i}`));
      lastIndex = m.index + m[0].length;
      i++;
    }
    if (lastIndex < text.length) {
      out.push(...renderTikzAndFormulas(text.slice(lastIndex), `${keyPrefix}-p${i}`));
    }
    return out;
  };

  const renderWithTikZ = (text: string) => {
    if (!text) return null;
    // Sửa các macro LaTeX mà KaTeX không hỗ trợ (vd \wideparen -> \overgroup)
    // ngay tại điểm vào duy nhất của luồng hiển thị đề (bản xem trước GV).
    text = sanitizeMathMacros(text);
    // SỬA (khiếu nại: "khoảng trắng trên/dưới hình to bất thường, chỉnh
    // margin không ăn thua") — xem giải thích chi tiết ở
    // collapseBlankAroundImagePlaceholders trong textUtils.ts.
    text = collapseBlankAroundImagePlaceholders(text);
    // SỬA (khiếu nại: "thụt đầu dòng khi xuống dòng xấu quá") — xem giải
    // thích chi tiết ở capLeadingIndent trong textUtils.ts.
    text = capLeadingIndent(text);
    const blocks = extractEnvBlocks(text);
    if (blocks.length === 0) {
      return renderTikzAndFormulasWithRows(text, 'seg0');
    }

    const result: React.ReactNode[] = [];
    let lastEnd = 0;
    blocks.forEach((b, i) => {
      result.push(...renderTikzAndFormulasWithRows(text.slice(lastEnd, b.start), `seg${i}`));
      result.push(<LatexStatTable key={`table-${i}`} block={b.text} />);
      lastEnd = b.end;
    });
    result.push(...renderTikzAndFormulasWithRows(text.slice(lastEnd), `seg${blocks.length}`));
    return result;
  };

  // Component QuestionCard đã được tách ra NGOÀI Home (xem phía trên, trước
  // "export default function Home") để tránh bug remount về câu 1 khi mở lời
  // giải — xem giải thích chi tiết ở comment ngay phía trên khai báo đó.

  return (
    <main className="min-h-screen bg-gray-50 text-black pb-20">
      {/* (27-7) Quy tắc .tikz-svg-wrap trước đây khai báo riêng ở đây đã dời
          sang TikzImage (src/lib/examRender.tsx) để có hiệu lực NGAY từ lần
          vẽ đầu tiên trên MỌI trang (Xem mô phỏng, trang học sinh, Lời giải),
          không chỉ riêng tab "Xem đề" này — xem giải thích đầy đủ ở đó (sửa
          lỗi "hình hiện to rồi tự thu nhỏ sau 1-2s" chỉ xảy ra ở các trang
          KHÁC ngoài "Xem đề"). */}
      <style jsx global>{`
        @media print {
          /* QUAN TRỌNG: nếu KHÔNG khai báo @page, trình duyệt tự cộng thêm
             LỀ IN MẶC ĐỊNH CỦA RIÊNG NÓ (thường ~12-19mm, tuỳ trình duyệt)
             CHỒNG LÊN phần đệm 18mm đã có sẵn trong chính khối đề thi
             (".p-[18mm]" ở #print-exam-area, xem JSX bên dưới) — khiến tổng
             chiều rộng vượt quá khổ A4 thật, trình in phải co/dịch nội dung
             để vừa trang, kết quả là lề trái trông "dày" còn lề phải gần như
             sát mép giấy (không đều 2 bên). Đặt margin: 0 ở @page để lề in
             của TRÌNH DUYỆT bằng 0, để 18mm padding của khối đề thi là lề
             DUY NHẤT — đảm bảo đều nhau ở cả 4 cạnh khi xuất PDF/in giấy.
             size: A4 đảm bảo khổ giấy đúng ngay cả khi máy đang đặt khổ khác
             (Letter...) làm mặc định. */
          @page {
            size: A4;
            margin: 0;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          #print-exam-area, #print-exam-area * {
            visibility: visible;
          }
          #print-exam-area {
            position: static !important;
            opacity: 1 !important;
            pointer-events: auto !important;
          }
        }
      `}</style>
      {/* Thanh Tiêu đề */}
      <div className="bg-white shadow-sm border-b p-6 mb-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
            📝 Hệ thống Trích xuất Đề thi Giáo viên
          </h1>
          {data && (
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-4 text-sm bg-blue-50 text-blue-700 py-2 px-4 rounded-lg font-medium">
                <span>🖼️ Hình vẽ TikZ: {data.thong_ke.so_luong_tikz}</span>
                {typeof data.thong_ke.so_luong_anh === 'number' && data.thong_ke.so_luong_anh > 0 && (
                  <>
                    <span>•</span>
                    <span>📁 Ảnh file: {data.thong_ke.so_luong_anh}</span>
                  </>
                )}
                <span>•</span>
                <span>Tổng số câu: {data.thong_ke.so_cau_phan_1 + data.thong_ke.so_cau_phan_2 + data.thong_ke.so_cau_phan_3 + data.thong_ke.so_cau_phan_4}</span>
              </div>
              {/* SỬA LỖI (27-7, "mở đề cũ báo đang biên dịch gây hiểu nhầm
                  tạo đề mới"): trước đây banner này LUÔN nói "Đang biên dịch
                  hình" cho MỌI trường hợp còn hình chưa xong, kể cả khi đó chỉ
                  là tải lại nội dung SVG đã lưu (mở đề đã lưu/xuất bản trước
                  đó) — không hề gọi AI biên dịch lại. Giờ tách rõ 2 chữ khác
                  nhau tuỳ có đang thật sự gửi đi biên dịch AI hay không
                  (realCompilingIds), và điều kiện hiện dựa vào tikzPendingCount
                  (tính trực tiếp từ svgMap/tikzImgUrlMap/tikzFailedMap, không
                  bị kẹt vì lỗi mạng vặt như tikzProgress cũ). */}
              {tikzProgress.total > 0 && tikzPendingCount > 0 && realCompilingIds.size > 0 && (
                <div className="text-xs font-medium text-orange-600 bg-orange-50 px-3 py-1 rounded shadow-sm border border-orange-200">
                  ⚡ Đang biên dịch hình mới: còn {tikzPendingCount} hình
                  {" "}({(Object.keys(svgMap).length + Object.keys(tikzImgUrlMap).length)} hình đã có ảnh hợp lệ)
                </div>
              )}
              {tikzProgress.total > 0 && tikzPendingCount > 0 && realCompilingIds.size === 0 && (
                <div className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded shadow-sm border border-blue-200">
                  📥 Đang tải lại hình đã lưu (không phải biên dịch mới): còn {tikzPendingCount} hình
                  {" "}({(Object.keys(svgMap).length + Object.keys(tikzImgUrlMap).length)} hình đã có ảnh hợp lệ)
                </div>
              )}
              {tikzPendingCount > 0 && tikzPendingTimedOut && (
                <div className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1 rounded shadow-sm border border-amber-200 max-w-sm">
                  ⏱️ {tikzPendingCount} hình xử lý lâu hơn bình thường (có thể do mạng chậm) — vẫn cho Lưu/Xuất bản, nhưng hình đó có thể bị thiếu, nên kiểm tra lại sau khi lưu.
                </div>
              )}
              {/* SỬA LỖI: trước đây khi done >= total và không có hình lỗi thì
                  KHÔNG hiện gì cả — người dùng chỉ biết "chắc là đủ rồi" chứ
                  không có xác nhận rõ ràng. Giờ luôn báo rõ số hình thật sự
                  đã có SVG hợp lệ trên tổng số, kể cả khi không có lỗi nào. */}
              {tikzProgress.total > 0 && tikzPendingCount === 0 && failedTikzLocations.length === 0 && (
                <div className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1 rounded shadow-sm border border-green-200">
                  ✅ Đã thêm thành công {(Object.keys(svgMap).length + Object.keys(tikzImgUrlMap).length)} / {tikzProgress.total} hình
                </div>
              )}
              {/* THÊM MỚI: khi đã xử lý xong hết mà vẫn còn hình lỗi, báo tổng
                  số ngay đây — không phải kéo xuống từng câu mới biết có bao
                  nhiêu hình bị kẹt. */}
              {tikzProgress.total > 0 && tikzPendingCount === 0 && failedTikzLocations.length > 0 && (
                <div className="text-xs font-medium text-red-600 bg-red-50 px-3 py-2 rounded shadow-sm border border-red-200 max-w-sm">
                  <div className="mb-1">
                    ⚠️ Đã thêm {(Object.keys(svgMap).length + Object.keys(tikzImgUrlMap).length)} / {tikzProgress.total} hình —
                    {" "}{failedTikzLocations.length} hình lỗi:
                  </div>
                  <ul className="space-y-0.5">
                    {failedTikzLocations.map(({ tikzId, soHinh, location }) => (
                      <li key={tikzId}>
                        {location ? (
                          <button
                            type="button"
                            onClick={() => {
                              // SỬA: tab con "Xem đề" giờ hiện liền mạch cả 4
                              // phần (không còn tách theo activeTab p1..p4)
                              // nên chỉ cần đảm bảo đang ở tab "Xem đề" rồi
                              // cuộn tới đúng câu, không cần đổi activeTab nữa.
                              setBuilderSubTab('view');
                              // đợi tab con render xong rồi mới cuộn, không
                              // cuộn ngay vì phần tử đích có thể chưa có trong DOM.
                              setTimeout(() => {
                                document.getElementById(`q-${location.qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 50);
                            }}
                            className="underline hover:text-red-800 text-left"
                          >
                            Hình {soHinh} — {location.text}
                          </button>
                        ) : (
                          <span>Hình {soHinh} — không xác định được câu chứa hình (có thể nằm ngoài mọi câu)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* THÊM MỚI (mục 3 - GHI-CHU-TON-DONG-18-7.md): banner riêng cho
                  ảnh cứng còn thiếu ở tab "Xem đề" — dùng missingHardImageLocations
                  để liệt kê từng câu kèm nút nhảy tới, thay vì chỉ đếm số lượng
                  suông như banner cũ ở tab "Tải file" (mục 2, chưa đổi vì tách
                  riêng việc, xem ghi chú). */}
              {missingHardImageLocations.length > 0 && (
                <div className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-2 rounded shadow-sm border border-amber-200 max-w-sm">
                  <div className="mb-1">
                    ⚠️ {missingHardImageLocations.length} chỗ chèn ảnh cứng còn thiếu:
                  </div>
                  <ul className="space-y-0.5">
                    {missingHardImageLocations.map(({ key, label, location }) => (
                      <li key={key}>
                        {location ? (
                          <button
                            type="button"
                            onClick={() => {
                              setBuilderSubTab('view');
                              setTimeout(() => {
                                document.getElementById(`q-${location.qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }, 50);
                            }}
                            className="underline hover:text-amber-900 text-left"
                          >
                            {label} ({location.text})
                          </button>
                        ) : (
                          <span>{label} — không xác định được câu chứa (có thể nằm ngoài mọi câu)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`mx-auto px-4 ${builderSubTab === 'view' ? 'max-w-[1600px]' : 'max-w-6xl'}`}>
        {/* THÊM MỚI: thanh trạng thái "đóng băng" 2 nguồn dữ liệu hiện tại
            (tệp/nội dung đề .tex + các thư mục ảnh đã chọn) — luôn hiển thị
            RÕ đang dùng đúng nguồn nào thay vì phải nhớ đã bấm nút nào lúc
            nãy. Có nút gỡ riêng cho từng thư mục ảnh và nút bỏ ghim tên tệp
            (không xoá dữ liệu đề đang xem, chỉ để chọn lại từ đầu cho rõ). */}
        {(texFileName || imageFolders.length > 0) && (
          <div className="bg-slate-800 text-slate-100 rounded-xl shadow-sm mb-4 px-5 py-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mr-1 shrink-0">
              📌 Nguồn dữ liệu đang dùng
            </span>
            {texFileName && (
              <span className="inline-flex items-center gap-2 bg-slate-700/70 px-3 py-1.5 rounded-lg text-sm max-w-full">
                📄 <span className="font-mono truncate max-w-[240px]" title={texFileName}>{texFileName}</span>
                <button
                  onClick={() => setTexFileName('')}
                  className="text-slate-400 hover:text-white transition"
                  title="Bỏ ghim (không xoá dữ liệu đề đang xem)"
                >
                  ✕
                </button>
              </span>
            )}
            {imageFolders.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-2 bg-slate-700/70 px-3 py-1.5 rounded-lg text-sm max-w-full">
                📁 <span className="font-mono truncate max-w-[160px]" title={f.name}>{f.name}</span>
                <span className="text-slate-400">({f.count} ảnh)</span>
                <button
                  onClick={() => removeImageFolderChip(f.name)}
                  className="text-slate-400 hover:text-white transition"
                  title="Gỡ thư mục này khỏi danh sách"
                >
                  ✕
                </button>
              </span>
            ))}
            {imageFolders.length > 0 && (
              <button onClick={clearAllImages} className="text-xs text-red-300 hover:text-red-200 underline ml-auto shrink-0">
                Xoá tất cả ảnh
              </button>
            )}
          </div>
        )}

        {/* THÊM MỚI (mục 4): thanh tab con — Tải lên / Xem đề / Cài đặt.
            Tab "Xem đề" và "Cài đặt" chỉ bấm được khi đã có dữ liệu đề
            (data) và không phải chế độ thi live, tránh nhảy vào tab trống. */}
        <div id="exam-builder-top" className="flex gap-2 mb-4 bg-white border border-gray-200 rounded-xl shadow-sm p-1.5 scroll-mt-4">
          {[
            // SỬA (khiếu nại: đổi icon tải tệp) — tab "Tải lên" đổi từ emoji
            // 📥 sang icon SVG thư mục có mũi tên lên (UploadFolderIcon),
            // đồng bộ với icon đang dùng ở nút "Tải file lên" bên trong tab.
            { key: 'upload' as const, icon: 'upload' as const, label: 'Tải lên' },
            { key: 'view' as const, icon: 'book' as const, label: 'Xem đề' },
            { key: 'settings' as const, icon: '🎛️' as const, label: 'Cài đặt' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={t.key !== 'upload' && !data}
              onClick={() => setBuilderSubTab(t.key)}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
                builderSubTab === t.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'
              }`}
            >
              {t.icon === 'upload' ? (
                <UploadFolderIcon className="w-4 h-4" />
              ) : t.icon === 'book' ? (
                <OpenBookIcon className="w-4 h-4" />
              ) : (
                <span>{t.icon}</span>
              )}
              {t.label}
            </button>
          ))}
        </div>

        {/* CHUYỂN RA NGOÀI (mục 2 - GHI-CHU-TON-DONG-18-7.md, phần A "nhẹ"):
            input chọn thư mục ảnh TRƯỚC ĐÂY nằm trong khối chỉ render khi
            builderSubTab === 'upload' — nghĩa là khi đang ở tab khác (vd
            "Xem đề"), input này KHÔNG TỒN TẠI trong DOM, nên không thể
            document.getElementById('image-folder-input')?.click() từ nơi
            khác được (chuẩn bị cho nút "Chọn thư mục ảnh" trong popup ở
            phần B). Giờ tách input ra render LUÔN, không phụ thuộc tab nào,
            để popup ở bất kỳ tab nào cũng trigger được. <label htmlFor=...>
            ở tab "Tải file" (giữ nguyên, xem bên dưới) vẫn hoạt động bình
            thường vì HTML label-for chỉ cần khớp id, không cần chung cây DOM. */}
        <input
          id="image-folder-input"
          type="file"
          // webkitdirectory / directory không có trong kiểu HTMLInputElement
          // chuẩn của React -> ép kiểu any để gán thuộc tính trình duyệt.
          {...({ webkitdirectory: 'true', directory: 'true' } as any)}
          multiple
          onChange={handleImageFolderSelect}
          className="hidden"
        />

        {/* THÊM MỚI (mục 2, phần B - GHI-CHU-TON-DONG-18-7.md): popup cực gọn
            thay cho banner cũ ở tab "Tải file" (đã bị bỏ vì không ai thấy) —
            tự bật ĐÚNG 1 lần ngay khi vừa nhảy sang tab "Xem đề" sau khi tải
            file/dán đề, nếu đề thiếu ảnh cứng (xem effect theo dõi
            missingHardImageLocations ở trên). Tái dùng nguyên phần liệt kê
            câu + nút nhảy tới câu đang dùng cho banner amber ở mục 3, đặt
            trong modal thay vì banner. */}
        {showMissingImagePopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold text-amber-800">
                  ⚠️ Đề đang thiếu {missingHardImageLocations.length} chỗ chèn ảnh cứng
                </h3>
                <button
                  type="button"
                  onClick={() => setShowMissingImagePopup(false)}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                  title="Đóng"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Ảnh PNG/JPG chèn cứng ở những chỗ dưới đây chưa có trong thư mục ảnh đã chọn.
              </p>
              <ul className="space-y-1 max-h-48 overflow-y-auto mb-4 text-xs">
                {missingHardImageLocations.map(({ key, label, location }) => (
                  <li key={key} className="text-amber-700">
                    {location ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMissingImagePopup(false);
                          setBuilderSubTab('view');
                          setTimeout(() => {
                            document.getElementById(`q-${location.qId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 50);
                        }}
                        className="underline hover:text-amber-900 text-left"
                      >
                        {label} ({location.text})
                      </button>
                    ) : (
                      <span>{label} — không xác định được câu chứa (có thể nằm ngoài mọi câu)</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMissingImagePopup(false);
                    setMissingImagePopupDismissed(true);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition"
                >
                  Bỏ qua
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMissingImagePopup(false);
                    document.getElementById('image-folder-input')?.click();
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                >
                  Chọn thư mục ảnh
                </button>
              </div>
            </div>
          </div>
        )}

        {builderSubTab === 'upload' && (
        <>
        {/* SỬA (mục 2 - GHI-CHU-TON-DONG-18-7.md): banner nhắc ảnh cứng CŨ
            từng nằm ở đây đã bị BỎ vì vô nghĩa — processExamText luôn tự
            nhảy sang tab "Xem đề" ngay sau khi tải/dán đề, nên không ai
            từng thấy banner này (chỉ thấy nếu tự bấm quay lại tab "Tải
            file"). ĐÃ THAY bằng popup (xem showMissingImagePopup, render
            ngay phía trên khối input#image-folder-input) — tự bật ĐÚNG 1
            lần ngay khi vừa nhảy sang tab "Xem đề" nếu đề thiếu ảnh cứng,
            dùng lại nguyên missingHardImageLocations (mục 3) để liệt kê câu
            kèm nút nhảy tới, và nút "Chọn thư mục ảnh" mở thẳng input đã
            tách ra ngoài tab ở trên. Logic tính toán
            tikzMissingEmbeddedMap/standaloneMissingImages giữ nguyên,
            không đụng vào. */}
        {/* Khu vực nhập liệu: 2 cột trên màn hình rộng — cột trái (tệp .tex +
            thư mục ảnh) gọn hơn, cột phải (dán trực tiếp) RỘNG và CAO hơn hẳn
            vì đây là cách nhập được dùng nhiều nhất, không cần tạo file
            trung gian. Trên màn hình hẹp tự xếp dọc như cũ. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-8 items-stretch">
          {/* Cột trái */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Nút Upload đề */}
            <div
              onDragOver={handleDragOverUpload}
              onDragLeave={handleDragLeaveUpload}
              onDrop={handleDropUpload}
              className={`bg-white border-2 border-dashed p-6 text-center rounded-xl shadow-sm transition ${
                isDraggingFile ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              {/* SỬA (khiếu nại: bỏ icon ở nhãn "Tải file lên") — chỉ còn
                  chữ, không icon, cho gọn mắt. Input file thật vẫn tồn tại
                  (ẩn bằng class hidden) để giữ nguyên logic chọn file/kéo-thả
                  cũ, chỉ đổi phần hiển thị. */}
              <p className="text-gray-600 mb-3 font-medium text-sm">Kéo thả hoặc bấm nút bên dưới để chọn file đề thi gốc (.tex)</p>
              <input id="tex-file-input" type="file" accept=".tex" onChange={handleFileUpload} className="hidden" />
              <label
                htmlFor="tex-file-input"
                className="inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed border-blue-300 rounded-lg text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 cursor-pointer transition"
              >
                Tải file lên
              </label>
              {texFileName && (
                <p className="text-xs text-green-600 mt-2 truncate" title={texFileName}>
                  ✅ Đang dùng: <span className="font-mono">{texFileName}</span> — chọn lại đúng tệp này để cập nhật ngay.
                </p>
              )}
            </div>

            {/* THÊM MỚI: Chọn THƯ MỤC ẢNH — hỗ trợ chọn NHIỀU LẦN/NHIỀU THƯ
                MỤC khác nhau, ảnh sẽ được GỘP lại (không ghi đè), mỗi thư
                mục hiện thành 1 dòng riêng ở thanh trạng thái phía trên. */}
            <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm flex-1 text-center flex flex-col items-center justify-center">
              {/* SỬA (khiếu nại: bỏ cả 2 icon to/đúp ở khu vực này) — không
                  còn icon nào nữa, chỉ chữ + nút, và toàn bộ khối được căn
                  giữa (cả chiều ngang lẫn chiều dọc trong khung) cho gọn mắt. */}
              <p className="text-gray-600 mb-1 font-medium text-sm">
                Chọn thư mục ảnh <span className="text-gray-400 font-normal">(chọn được nhiều thư mục)</span>
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Dùng cho hình <span className="font-mono">\includegraphics</span> — cả ngoài tikz lẫn chèn cứng bên trong tikz.
              </p>
              <label
                htmlFor="image-folder-input"
                className="inline-flex items-center gap-2 px-4 py-2 border-2 border-dashed border-blue-300 rounded-lg text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 cursor-pointer transition"
              >
                Tải thư mục ảnh
              </label>
              {imageFolders.length > 0 && (
                <p className="text-xs text-green-600 mt-2">
                  ✅ Đã nạp {Object.keys(imageMap).length} ảnh từ {imageFolders.length} thư mục (xem danh sách ở thanh trên).
                </p>
              )}
            </div>
          </div>

          {/* Cột phải: Ô dán trực tiếp — chiếm 7/12 cột (rộng hơn hẳn so với
              trước, khi còn phải chia đều chiều rộng với 2 khối bên trái) và
              textarea cao hơn (14 dòng thay vì 8) để dán đề dài mà không phải
              cuộn liên tục lúc kiểm tra lại trước khi xử lý. */}
          <div className="lg:col-span-7 bg-white border border-gray-200 p-5 rounded-xl shadow-sm flex flex-col">
            <p className="text-gray-600 mb-2 font-medium text-sm inline-flex items-center gap-1.5">
              <WritingIcon className="w-4 h-4 text-gray-500" /> Hoặc dán trực tiếp nội dung .tex vào ô bên dưới
            </p>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={14}
              placeholder="Dán nội dung mã LaTeX/.tex của đề thi vào đây..."
              className="w-full flex-1 min-h-[260px] text-sm font-mono border rounded-lg p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={handleProcessPastedText}
                disabled={isProcessingPaste || !pastedText.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition"
              >
                {isProcessingPaste ? 'Đang xử lý...' : 'Xử lý nội dung đã dán'}
              </button>
            </div>
          </div>
        </div>
        </>
        )}

        {/* ========================================== */}
        {/* TRUNG TÂM CẤU HÌNH PHÒNG THI (Teacher Dashboard) */}
        {/* ========================================== */}
        {builderSubTab === 'settings' && data && examMode === 'setup' && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm mb-8 overflow-hidden">
            <div className="bg-slate-800 px-5 py-3 border-b border-slate-700">
              <h2 className="text-white font-semibold flex items-center gap-2">
                🎛️ Bảng Điều Khiển Phòng Thi
              </h2>
            </div>

            {/* SỬA (khiếu nại "bảng điều khiển lộn xộn, quá nhiều nút"):
                - Bỏ hẳn mục chọn "Chế độ hiển thị" (Dạng Azota / Giả lập A4)
                  vì chỉ còn 1 lựa chọn duy nhất (Azota) — không cần hỏi nữa,
                  examSettings.viewMode giữ nguyên mặc định 'azota'.
                - Gom 3 nhóm cấu hình còn lại vào 1 hàng 3 cột cân đối (thay
                  vì 4 cột lệch, cột 3 vừa có dropdown vừa có nút hành động).
                - Nút hành động chính "Kích hoạt Phòng Thi" tách thành 1 hàng
                  CTA riêng, full-width, đặt NGAY DƯỚI khối cấu hình — đúng bố
                  cục "cấu hình xong rồi mới đến 1 nút hành động lớn" hay gặp
                  ở các app lớn (Google Forms, Kahoot...), thay vì bị chèn lẫn
                  vào giữa các ô cấu hình nhỏ. */}
            {/* SỬA (khiếu nại: "tách 3 khu vực cài đặt/mô phỏng/lưu-xuất bản
                thành 3 khối có viền riêng, không phải tab") — trước đây 3
                nhóm này nằm liền mạch trong 1 khối, chỉ phân tách bằng
                border-t mảnh, khó nhận ra ranh giới. BÂY GIỜ: mỗi nhóm là 1
                thẻ (card) riêng, có viền + bo góc + đánh số thứ tự ngay trong
                tiêu đề, xếp DỌC (không phải tab bấm qua lại) để GV thấy hết
                cả 3 khu vực cùng lúc, cuộn xuống lần lượt là xong toàn bộ quy
                trình cấu hình → xem thử → lưu/xuất bản. */}
            <div className="p-5 space-y-5 bg-slate-50">
              {/* ===== Khu vực 1: Cài đặt đề thi ===== */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-extrabold text-blue-700 uppercase tracking-wide mb-4">
                  1. Cài đặt đề thi này chung cho các lớp
                </h3>
                {/* THIẾT KẾ LẠI: chuyển từ bố cục 3 cột sang bố cục DỌC theo
                    cùng "ngôn ngữ thiết kế" với panel "Dùng cài đặt riêng cho
                    lớp này" (khối viền bo góc, chia nhóm rõ ràng bằng đường kẻ
                    ngang mảnh, lưới 2 cột cho các ô số/giờ đi theo cặp, tiêu đề
                    nhóm có icon nhỏ đi kèm) — nhưng đổi hẳn sang nền TRẮNG +
                    viền xám trung tính (không dùng amber/vàng) vì đây là cài
                    đặt MẶC ĐỊNH áp dụng cho mọi lớp, cần phân biệt rõ với khối
                    "cài đặt riêng theo lớp" (màu vàng) ở panel Giao đề. */}
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-4 space-y-4">
                  {/* Nhóm 1: Thời gian & số lần làm bài — 2 cột giống panel lớp */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs text-gray-600 font-semibold block mb-1 inline-flex items-center gap-1.5">
                        <ClockIcon className="w-3.5 h-3.5 text-gray-400" /> Thời gian làm bài (phút)
                      </span>
                      <input
                        type="number"
                        value={examSettings.duration}
                        onChange={(e) => setExamSettings((s) => ({ ...s, duration: Number(e.target.value) }))}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-blue-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>
                    {/* THÊM MỚI: Số lần làm bài — 0 = không giới hạn, học sinh tự
                        bấm làm lại được (không cần GV duyệt từng lần). Nút "Cho
                        làm lại" ở tầng 3 (Quản lý lớp) vẫn dùng riêng cho trường
                        hợp cá biệt cần thêm lượt vượt quá số này. */}
                    <label className="block">
                      <span className="text-xs text-gray-600 font-semibold block mb-1">
                        🔁 Số lần làm bài (0 = không giới hạn)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={examSettings.maxAttempts}
                        onChange={(e) => setExamSettings((s) => ({ ...s, maxAttempts: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-blue-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>
                  </div>

                  {/* Lưu ý: tính năng trộn thực sự (hoán vị mảng câu hỏi/đáp án)
                      chưa được nối logic — mới chỉ lưu trạng thái bật/tắt. Sẽ bổ
                      sung logic xáo trộn ở bước "Phòng thi học sinh" kế tiếp. */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={examSettings.shuffle}
                      onChange={(e) => setExamSettings((s) => ({ ...s, shuffle: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 font-medium">🔀 Tự động trộn câu hỏi &amp; đáp án</span>
                  </label>

                  {/* Nhóm 2: Quản lý lời giải — full width, giống dropdown
                      "Quản lý lời giải" trong panel cài đặt riêng theo lớp */}
                  <label className="block pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-600 font-semibold block mb-1 inline-flex items-center gap-1.5">
                      <KeyIcon className="w-3.5 h-3.5 text-gray-400" /> Quản lý lời giải
                    </span>
                    <select
                      value={examSettings.showSolution}
                      onChange={(e) =>
                        setExamSettings((s) => ({
                          ...s,
                          showSolution: e.target.value as 'after_submit' | 'never' | 'after_close' | 'custom_time',
                        }))
                      }
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="after_submit">Hiện nút xem giải ngay sau khi nộp bài</option>
                      <option value="never">Ẩn hoàn toàn lời giải (Chỉ báo điểm)</option>
                      <option value="after_close">Chỉ báo điểm — tự mở lời giải khi tất cả đã thi xong</option>
                      <option value="custom_time">Chỉ báo điểm — GV tự đặt giờ mở lời giải</option>
                    </select>
                  </label>
                  {/* THÊM MỚI: 'after_close' tính mốc mở = giờ đóng đề của từng
                      lớp (cấu hình ở panel "Giao đề") + thời gian làm bài — lớp
                      nào chưa đặt giờ đóng thì lời giải lớp đó chưa tự mở được. */}
                  {examSettings.showSolution === 'after_close' && (
                    <p className="text-xs text-gray-500 -mt-1">
                      Mốc mở = giờ đóng đề (đặt ở panel "Giao đề" từng lớp) + thời gian làm bài ở trên. Lớp nào chưa
                      đặt giờ đóng sẽ chưa tự mở được lời giải.
                    </p>
                  )}
                  {examSettings.showSolution === 'custom_time' && (
                    <input
                      type="datetime-local"
                      value={examSettings.solutionOpenAt}
                      onChange={(e) => setExamSettings((s) => ({ ...s, solutionOpenAt: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 -mt-1"
                    />
                  )}

                  {/* Nhóm 3: giờ mở/đóng đề MẶC ĐỊNH — áp dụng cho MỌI lớp
                      được giao đề này. Lớp nào cần khung giờ riêng thì vào
                      panel "Giao đề" của lớp đó, bật "Dùng cài đặt riêng cho
                      lớp này" để ghi đè, không ảnh hưởng lớp khác. Để trống
                      cả 2 ô = không giới hạn giờ (mặc định). Tiêu đề nhóm +
                      icon đồng hồ đặt y hệt vị trí/kiểu chữ với panel lớp. */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-xs text-gray-700 font-semibold inline-flex items-center gap-1.5">
                      <ClockIcon className="w-3.5 h-3.5 text-gray-400" /> Giờ mở/đóng đề (mặc định cho mọi lớp — để trống = không giới hạn giờ)
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-[11px] text-gray-500 block mb-1">Mở lúc</span>
                        <input
                          type="datetime-local"
                          value={examSettings.openAt}
                          onChange={(e) => setExamSettings((s) => ({ ...s, openAt: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] text-gray-500 block mb-1">Đóng lúc</span>
                        <input
                          type="datetime-local"
                          value={examSettings.closeAt}
                          onChange={(e) => setExamSettings((s) => ({ ...s, closeAt: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </label>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Lớp cần khung giờ khác vào panel "Giao đề" của lớp đó, bật "Dùng cài đặt riêng cho lớp này" để đặt riêng.
                    </p>
                  </div>

                  {/* Nhóm 4: Thang điểm — mặc định đúng barem Toán THPT hiện
                      hành, GV chỉnh nếu đề không theo đúng cấu trúc 12 câu
                      P1/4 câu P2/6 câu P3 barem chuẩn. Vẫn là accordion —
                      đóng mặc định, chỉ hiện dòng tổng điểm tối đa; bấm vào
                      tiêu đề mới xổ ra 4 ô nhập để chỉnh (thêm Phần IV Tự
                      luận — GV không tự chấm được nhưng cần điểm/câu để
                      tính tổng điểm tối đa của đề). */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <button
                      type="button"
                      onClick={() => setScoringOpen((v) => !v)}
                      className="w-full flex items-center justify-start gap-2 text-left"
                    >
                      <span className="text-xs text-gray-700 font-semibold uppercase tracking-wide">Thang điểm</span>
                      <span className={`text-gray-400 text-sm transition-transform ${scoringOpen ? 'rotate-180' : ''}`}>▼</span>
                    </button>
                    <p className="text-xs text-gray-600 font-semibold">
                      Tổng tối đa:{' '}
                      <span className="text-blue-600">
                        {Math.round(
                          ((data.phan_1_TracNghiem || []).length * examSettings.scoring.p1PerQuestion +
                            (data.phan_2_DungSai || []).length * examSettings.scoring.p2FullPoints +
                            (data.phan_3_TraLoiNgan || []).length * examSettings.scoring.p3PerQuestion +
                            (data.phan_4_TuLuan || []).length * examSettings.scoring.p4PerQuestion) *
                            100
                        ) / 100}{' '}
                        điểm
                      </span>
                    </p>
                    {scoringOpen && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
                        <label className="block">
                          <span className="text-[11px] text-gray-500 block mb-1">Phần I (mỗi câu)</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={examSettings.scoring.p1PerQuestion}
                            onChange={(e) =>
                              setExamSettings((s) => ({ ...s, scoring: { ...s.scoring, p1PerQuestion: Number(e.target.value) } }))
                            }
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-blue-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-gray-500 block mb-1">Phần II (tối đa/câu)</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={examSettings.scoring.p2FullPoints}
                            onChange={(e) =>
                              setExamSettings((s) => ({ ...s, scoring: { ...s.scoring, p2FullPoints: Number(e.target.value) } }))
                            }
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-blue-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-gray-500 block mb-1">Phần III (mỗi câu)</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={examSettings.scoring.p3PerQuestion}
                            onChange={(e) =>
                              setExamSettings((s) => ({ ...s, scoring: { ...s.scoring, p3PerQuestion: Number(e.target.value) } }))
                            }
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-blue-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        </label>
                        {/* THÊM MỚI: Phần IV (Tự luận) — không tự chấm được
                            (GV chấm tay từng câu sau khi nộp, xem
                            SubmissionDetailModal), ô này chỉ để tính điểm
                            tối đa mỗi câu = snapshot lúc học sinh nộp bài
                            (essayMaxScore) và hiện "Tổng tối đa" phía trên
                            cho đúng thực tế. */}
                        <label className="block">
                          <span className="text-[11px] text-gray-500 block mb-1">Phần IV (mỗi câu)</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            value={examSettings.scoring.p4PerQuestion}
                            onChange={(e) =>
                              setExamSettings((s) => ({ ...s, scoring: { ...s.scoring, p4PerQuestion: Number(e.target.value) } }))
                            }
                            className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-blue-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        </label>
                        <p className="text-[11px] text-gray-400 italic md:col-span-4 -mt-1">
                          * Phần II chấm bậc: 1 ý đúng = 10%, 2 ý = 25%, 3 ý = 50%, cả 4 ý = 100% (chỉ áp dụng khi câu có đúng 4 ý; nếu khác 4 ý, tính theo tỉ lệ).
                          Phần IV (Tự luận) do giáo viên chấm tay từng câu sau khi học sinh nộp bài, không tự chấm được.
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* ===== Khu vực 2: Xem mô phỏng trang học sinh làm bài =====
                  SỬA (khiếu nại: nút đặt lệch trái, không căn phải như cũ) —
                  đổi justify-end -> justify-start. */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-extrabold text-blue-700 uppercase tracking-wide mb-3">
                  2. Xem mô phỏng trang học sinh làm bài
                </h3>
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => {
                      // Đưa NGUYÊN bản gốc chưa trộn — StudentTakeExam tự trộn
                      // bên trong (buildDisplayData) y hệt học sinh thật, dựa
                      // trên examSettings.shuffle. submissionId giả MỚI (theo
                      // timestamp) đảm bảo mỗi lần bấm là 1 phiên hoàn toàn
                      // mới, không khôi phục nhầm tiến độ/kết quả của lần xem
                      // trước đó.
                      // SỬA LỖI: data.tikz_list gốc chỉ có {id, code}, SVG đã
                      // biên dịch đang nằm riêng ở state svgMap — phải nhúng
                      // vào đây (cùng pattern với saveExamToMongo/publishExam)
                      // thì StudentTakeExam (buildTikzSvgMap) mới có hình để
                      // hiện, không thì mô phỏng luôn trống hình TikZ.
                      //
                      // SỬA LỖI (khiếu nại 23-7: "trang HS và xem mô phỏng lại
                      // mất SVG"): nếu đề này ĐÃ được Lưu/Xuất bản trước đó,
                      // data.tikz_list nạp từ loadExamData() còn giữ sẵn field
                      // `url` (link Vercel Blob của lần xuất bản CŨ). Trước
                      // đây chỉ ghi đè `svg` mà KHÔNG xoá `url` cũ — trong khi
                      // buildTikzSvgMap() (examRender.tsx) lại ưu tiên `url`
                      // hơn `svg`. Hậu quả: nếu GV sửa lại hình TikZ sau khi
                      // đã xuất bản 1 lần (svgMap có bản mới) mà CHƯA bấm Lưu/
                      // Xuất bản lại, "Xem mô phỏng" vẫn hiển thị bản SVG CŨ ở
                      // Blob (thậm chí mất hẳn nếu id bị đánh số lại) thay vì
                      // bản mới nhất — trong khi khung xem trước từng câu
                      // (renderWithTikZ ở QuestionCard) đọc thẳng từ svgMap
                      // nên luôn đúng, tạo ra khác biệt gây khó hiểu.
                      // Fix: XOÁ hẳn `url` khi build dữ liệu cho preview, để
                      // buildTikzSvgMap luôn rơi xuống nhánh `svg` (bản mới
                      // nhất trong svgMap, hoặc bản cũ nhúng sẵn nếu hình đó
                      // chưa từng sửa trong phiên này).
                      // SỬA LỖI (khiếu nại 23-7 lần 3: "trang mô phỏng báo
                      // 'ảnh minh họa chưa có sẵn' dù đã chọn file ảnh"):
                      // TRƯỚC ĐÂY chỉ nhúng svgMap vào tikz_list, HOÀN TOÀN
                      // BỎ SÓT image_list (ảnh PNG cứng \includegraphics) ->
                      // buildImageUrlMap() không thấy url nào -> luôn hiện
                      // cảnh báo "chưa có sẵn", DÙ imageMap (blob URL cục bộ
                      // của ảnh GV đã chọn từ thư mục ảnh, dùng để hiện đúng
                      // trong khung "Sửa đề và lời giải") đã có sẵn.
                      // Fix: đối xứng y hệt tikz_list — tra theo basename
                      // trong imageMap (ưu tiên bản mới GV vừa chọn), URL
                      // blob này dùng được trực tiếp làm <img src> trong
                      // cùng tab trình duyệt, không cần chờ upload lên
                      // Vercel Blob (chỉ khi Lưu/Xuất bản thật mới cần).
                      const imageListWithLocalUrl = (data.image_list || []).map(
                        (img: { id: string; path: string; url?: string }) => {
                          const baseName = img.path.split('/').pop() || img.path;
                          return { ...img, url: resolveImageUrl(imageMap, baseName) || img.url || '' };
                        }
                      );
                      setLiveExamData({
                        ...data,
                        image_list: imageListWithLocalUrl,
                        tikz_list: (data.tikz_list || []).map(
                          (t: { id: string; code: string; svg?: string; url?: string }) => {
                            // SỬA (khiếu nại 27-7, đồng bộ tikzImgUrlMap): CHỈ
                            // xoá url khi đã có svgMap[t.id] mới thật sự để
                            // thay vào (hình vừa sửa trong phiên này) — nếu
                            // KHÔNG (hình PNG rasterize từ trước, chưa từng
                            // sửa trong phiên này, svgMap[t.id] rỗng), GIỮ
                            // NGUYÊN url gốc để buildTikzSvgMap tự ưu tiên
                            // dùng url đó (xử lý đúng cả url là .png, xem
                            // examRender.tsx). Trước đây luôn xoá url vô điều
                            // kiện -> hình PNG chưa từng sửa rơi vào svg: ''
                            // (rỗng) -> "Xem mô phỏng" hiện trống dù "Xem đề"
                            // đã hiện đúng.
                            if (svgMap[t.id]) {
                              const { url: _staleUrl, ...rest } = t;
                              return { ...rest, svg: svgMap[t.id] };
                            }
                            return t;
                          }
                        ),
                      });
                      setPreviewSubmissionId(`preview_${Date.now()}`);
                      setPreviewEndAt(Date.now() + Math.max(1, examSettings.duration) * 60000);
                      setPreviewResult(null);
                      setPreviewShowSolutionView(false);
                      setExamMode('live');
                    }}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 hover:text-black hover:underline transition"
                  >
                    <EyeIcon className="w-4 h-4" /> Xem mô phỏng trang học sinh
                  </button>
                </div>
              </div>

              {/* ===== Khu vực 3: Lưu và xuất bản =====
                  THIẾT KẾ LẠI (khiếu nại: "mục 3 khá lộn xộn, rối rắm" — trong
                  khi mục 1 "Cài đặt đề thi" bên trên được khen đẹp/khoa học):
                  áp đúng "ngôn ngữ thiết kế" của mục 1 vào mục 1 — khối viền
                  bo góc chứa bên trong 1 hộp trắng/viền xám phụ (px-4 py-4
                  space-y-4), chia thành các NHÓM rõ ràng bằng đường kẻ ngang
                  mảnh (border-t border-gray-100) + tiêu đề nhóm nhỏ in hoa có
                  icon, giống hệt cách mục 1 tách "Thời gian & số lần làm bài"
                  / "Quản lý lời giải" / "Giờ mở đóng đề" / "Thang điểm". Khối
                  "Xuất PDF nhiều mã đề" trước đây nằm RỜI hẳn ra ngoài thành 1
                  thanh riêng dưới chân (khác màu, khác kiểu) — nay gộp LUÔN
                  vào làm nhóm thứ 4 trong cùng 1 mục 3, không còn tách rời
                  gây cảm giác rời rạc/thừa 1 khối lạc lõng nữa. */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-extrabold text-blue-700 uppercase tracking-wide mb-4">
                  3. Lưu và xuất bản
                </h3>
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-4 space-y-4">
                  {/* Nhóm 1: Tên đề thi — full width, giống ô "Quản lý lời giải"
                      của mục 1 (label nhỏ có icon phía trên, ô nhập full width
                      bên dưới). Dòng nhắc "đang sửa đề đã lưu" gắn liền ngay
                      dưới label để cùng ngữ cảnh với ô tên, thay vì nổi lơ
                      lửng phía trên toàn khối như trước. */}
                  <label className="block">
                    <span className="text-xs text-gray-600 font-semibold block mb-1 inline-flex items-center gap-1.5">
                      <WritingIcon className="w-3.5 h-3.5 text-gray-400" /> Tên đề thi
                    </span>
                    <input
                      type="text"
                      value={examTitle || texFileName.replace(/\.[^/.]+$/, '')}
                      onChange={(e) => setExamTitle(e.target.value)}
                      placeholder="Tên đề thi..."
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    {currentExamId && (
                      <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5 mt-2">
                        ✏️ Đang sửa đề đã lưu — bấm <b>Lưu</b> sẽ cập nhật lại đúng đề này (giữ nguyên link cũ nếu đã xuất bản).
                      </p>
                    )}
                  </label>

                  {/* Nhóm 2: Lưu nội bộ — tiêu đề nhóm nhỏ in hoa + icon, đúng
                      kiểu tiêu đề "Thang điểm" ở mục 1. */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-xs text-gray-700 font-semibold uppercase tracking-wide inline-flex items-center gap-1.5">
                      <SaveIcon className="w-3.5 h-3.5 text-gray-400" /> Lưu nội bộ (GV tự xem/sửa)
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isSavingExamMongo || !data || tikzBlockingSave}
                        title={tikzBlockingSave ? `Còn ${tikzPendingCount} hình vẽ chưa xong, đợi xử lý xong đã` : undefined}
                        onClick={() => saveExamToMongo(examTitle || texFileName.replace(/\.[^/.]+$/, ''), data)}
                        className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2 px-4 rounded-lg shadow transition"
                      >
                        {isSavingExamMongo ? (
                          <>
                            <ClockIcon className="w-4 h-4" /> Đang lưu...
                          </>
                        ) : (
                          <>
                            <SaveIcon className="w-4 h-4" /> {currentExamId ? 'Lưu (cập nhật đề này)' : 'Lưu đề thi'}
                          </>
                        )}
                      </button>
                      {currentExamId && (
                        <button
                          type="button"
                          disabled={isSavingExamMongo || !data || tikzBlockingSave}
                          onClick={() => saveExamToMongo(examTitle || texFileName.replace(/\.[^/.]+$/, ''), data, true)}
                          title={tikzBlockingSave ? `Còn ${tikzPendingCount} hình vẽ chưa xong, đợi xử lý xong đã` : "Lưu thành một đề (tệp) hoàn toàn mới, không đụng tới đề đang sửa"}
                          className="inline-flex items-center gap-1.5 bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm py-2 px-4 rounded-lg transition"
                        >
                          <SaveIcon className="w-4 h-4" /> Lưu bản sao mới
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          refreshSavedExamsList();
                          document.getElementById('saved-exams-panel')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 font-semibold text-sm py-2 px-4 rounded-lg transition"
                      >
                        📂 Danh sách đề đã lưu
                      </button>
                    </div>
                  </div>

                  {/* Nhóm 3: Xuất bản công khai — tách hẳn khỏi nhóm "lưu nội
                      bộ" bằng đường kẻ ngang (thay vì gạch dọc như bản cũ) để
                      đồng bộ với cách mục 1 tách các nhóm cấu hình. */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-xs text-gray-700 font-semibold uppercase tracking-wide inline-flex items-center gap-1.5">
                      <GlobeIcon className="w-3.5 h-3.5 text-gray-400" /> Xuất bản công khai (cho học sinh)
                    </p>
                    <button
                      type="button"
                      disabled={isPublishing || !data || tikzBlockingSave}
                      title={tikzBlockingSave ? `Còn ${tikzPendingCount} hình vẽ chưa xong, đợi xử lý xong đã` : undefined}
                      onClick={publishExam}
                      className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm py-2 px-4 rounded-lg shadow transition"
                    >
                      {isPublishing ? (
                        <>
                          <ClockIcon className="w-4 h-4" /> Đang xuất bản...
                        </>
                      ) : (
                        <>
                          <GlobeIcon className="w-4 h-4" /> Xuất bản - Lấy link
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Vùng xem trước + in: CHỈ hiển thị khi đã bấm "Tạo mã đề". Ẩn khỏi
            màn hình thường (fixed off-screen) nhưng vẫn render để trình duyệt
            có nội dung khi bấm Ctrl+P/window.print(); khối "print:block" của
            CSS in (xem thẻ <style> bên dưới) sẽ hiện đúng khối này và ẩn hết
            phần còn lại của trang khi in. */}
        {data && printCodes && (
          <div id="print-exam-area" className="fixed left-0 top-0 w-full bg-white z-[9999]" style={{ pointerEvents: 'none', opacity: 0 }}>
            {printCodes.map((pc, idx) => (
              <PrintExamCodePaper
                key={`paper-${pc.code}-${idx}`}
                code={pc.code}
                data={pc.data}
                renderWithTikZ={renderWithTikZ}
                isLast={false}
              />
            ))}
            {printCodes.map((pc, idx) => (
              <PrintAnswerKeyPage
                key={`key-${pc.code}-${idx}`}
                code={pc.code}
                data={pc.data}
                isLast={idx === printCodes.length - 1}
              />
            ))}
          </div>
        )}

        {/* CSS in ấn (@media print) đã được gộp vào thẻ <style jsx global>
            chung ở đầu component — Next.js không cho phép 2 thẻ <style jsx>
            trong cùng 1 component (lỗi "nested styled-jsx tag"). */}

        {data && examMode === 'live' && liveExamData && (
          // Bọc TOÀN MÀN HÌNH (fixed inset-0, z cao) — che hẳn khung dashboard
          // của GV (thanh tab Tải lên/Xem đề/Cài đặt, header...) phía dưới, để
          // đảm bảo tương đồng trực quan 100% với trang học sinh thật (trang
          // đó không có bất kỳ khung GV nào bao quanh). Bên trong dùng LẠI
          // đúng wrapper "min-h-screen bg-gray-50 p-4 sm:p-8" như
          // src/app/thi/[examId]/page.tsx.
          <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-50">
            <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
              {previewResult ? (
                previewShowSolutionView && previewResult.solutionData ? (
                  <SolutionView
                    examData={previewResult.solutionData.examData}
                    rawData={liveExamData}
                    p1Answers={previewResult.solutionData.p1Answers}
                    p2Answers={previewResult.solutionData.p2Answers}
                    textAnswers={previewResult.solutionData.textAnswers}
                    scoring={previewResult.solutionData.scoring}
                    imageScalePercent={examSettings.imageScalePercent}
                    onClose={() => setPreviewShowSolutionView(false)}
                  />
                ) : (
                  // Màn kết quả — ĐỒNG BỘ với phase 'done' của trang thật
                  // (xem src/app/thi/[examId]/page.tsx) để GV thấy đúng y hệt
                  // những gì học sinh sẽ thấy sau khi nộp.
                  <div className="min-h-screen flex items-center justify-center p-4">
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center relative">
                      <button
                        type="button"
                        onClick={() => setExamMode('setup')}
                        className="absolute top-3 left-3 text-xs text-gray-400 hover:text-gray-600"
                      >
                        ✕ Thoát xem trước
                      </button>
                      <AppLogoIcon className="w-16 h-16 mx-auto mb-3" />
                      <h2 className="text-lg font-bold text-gray-900 mb-1">Đã nộp bài (mô phỏng)</h2>
                      <p className="text-3xl font-bold text-blue-600 mb-4">
                        {typeof previewResult.scorePoints === 'number' && typeof previewResult.maxScorePoints === 'number'
                          ? `${previewResult.scorePoints}/${previewResult.maxScorePoints} điểm`
                          : `${previewResult.score}/${previewResult.total}`}
                      </p>
                      <p className="text-xs text-gray-400 mb-4">Đây là bài mô phỏng — không lưu vào hệ thống.</p>
                      {previewResult.showSolution && previewResult.solutionData && (
                        <button
                          onClick={() => setPreviewShowSolutionView(true)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition"
                        >
                          Lời giải
                        </button>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <StudentTakeExam
                  examId={currentExamId || 'preview'}
                  submissionId={previewSubmissionId}
                  studentName="Học sinh (xem trước)"
                  examTitle={examTitle || texFileName.replace(/\.[^/.]+$/, '')}
                  rawData={liveExamData}
                  settings={examSettings}
                  endAt={previewEndAt}
                  onSubmitted={(r) => setPreviewResult(r)}
                  previewMode
                  onExit={() => setExamMode('setup')}
                />
              )}
            </div>
          </div>
        )}

        {builderSubTab === 'view' && data && examMode === 'setup' && (
          <>
          <div
            className={
              examSettings.viewMode === 'a4'
                ? 'w-[210mm] min-h-[297mm] bg-white shadow-[0_0_20px_rgba(0,0,0,0.15)] mx-auto p-[20mm]'
                // SỬA (khiếu nại: "xem đề của GV hẹp quá") — tăng bề rộng từ
                // max-w-6xl (72rem) lên max-w-[1600px] kèm w-full để lấp hết
                // khoảng rộng đó trên màn hình lớn, đỡ chật khi câu hỏi có
                // bảng/hình TikZ dài.
                : 'max-w-[1600px] w-full mx-auto bg-transparent'
            }
          >
            {/* SỬA (khiếu nại: bỏ 4 tab con Phần I/II/III/IV — GV phải bấm
                qua lại mới xem hết đề, không thấy toàn cảnh): thay bằng 1
                dòng thống kê tổng quan (không bấm được), và gộp cả 4 phần
                thành 1 danh sách liền mạch — mỗi phần có tiêu đề riêng ngay
                phía trên danh sách câu của phần đó, giống hệt cách trang thi
                thật của học sinh (StudentExamView) đang hiển thị. Phần nào
                có 0 câu thì không hiện tiêu đề phần đó (đề thật cũng vậy). */}
            <div className="mb-6 bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-3">
              <p className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5">
                <ChartBarIcon className="w-4 h-4 text-slate-500" /> Thống kê:{' '}
                <span className="font-normal text-slate-600">
                  Trắc nghiệm {data.thong_ke.so_cau_phan_1} câu · Đúng/Sai {data.thong_ke.so_cau_phan_2} câu · Trả lời ngắn {data.thong_ke.so_cau_phan_3} câu · Tự luận {data.thong_ke.so_cau_phan_4} câu
                </span>
              </p>
            </div>

            {/* THÊM MỚI: thống kê số HÌNH THỰC TẾ đang hiển thị được (đếm
                trực tiếp trên dữ liệu đang render, KHÔNG dựa vào thông báo
                "biên dịch thành công n/n" — 2 con số này có thể lệch nhau nếu
                hình biên dịch xong nhưng đổi thư mục ảnh / svg rỗng khiến lúc
                hiển thị thật lại thiếu). Kèm 2 nút bung hết / đóng hết lời
                giải để soát toàn bộ hình trong lời giải chỉ bằng 1 lượt kéo
                xuống, không cần bấm từng câu. */}
            {imageDisplayStats && imageDisplayStats.total > 0 && (
              <div
                className={`mb-6 rounded-lg shadow-sm px-4 py-3 border ${
                  imageDisplayStats.displayed === imageDisplayStats.total
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold inline-flex items-center gap-1.5 flex-wrap">
                    <span>🖼️</span>
                    <span className={imageDisplayStats.displayed === imageDisplayStats.total ? 'text-green-700' : 'text-red-700'}>
                      Hình đang hiển thị thực tế: {imageDisplayStats.displayed}/{imageDisplayStats.total}
                    </span>
                    <span className="font-normal text-slate-500 text-xs">
                      (TikZ/SVG: {imageDisplayStats.tikz.ok}/{imageDisplayStats.tikz.total}
                      {imageDisplayStats.file.total > 0 && <> · Ảnh file: {imageDisplayStats.file.ok}/{imageDisplayStats.file.total}</>})
                    </span>
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={expandAllSolutions}
                      className="text-xs bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95 border border-slate-300 text-slate-600 font-medium px-2.5 py-1.5 rounded-md transition"
                    >
                      Bung hết lời giải
                    </button>
                    <button
                      type="button"
                      onClick={collapseAllSolutions}
                      className="text-xs bg-white hover:bg-slate-50 active:bg-slate-100 active:scale-95 border border-slate-300 text-slate-600 font-medium px-2.5 py-1.5 rounded-md transition"
                    >
                      Đóng hết lời giải
                    </button>
                  </div>
                </div>

                {/* Breakdown theo từng loại đuôi file, để biết rõ svg/png/jpg
                    mỗi loại thiếu bao nhiêu, đúng như yêu cầu "svg hay png
                    hay jpg số lượng thật có hiển thị". */}
                {Object.keys(imageDisplayStats.byExt).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(imageDisplayStats.byExt).map(([ext, s]) => (
                      <span
                        key={ext}
                        className={`text-[11px] px-2 py-0.5 rounded-full border font-mono ${
                          s.ok === s.total ? 'bg-white border-slate-200 text-slate-500' : 'bg-white border-red-300 text-red-600'
                        }`}
                      >
                        .{ext}: {s.ok}/{s.total}
                      </span>
                    ))}
                  </div>
                )}

                {imageDisplayStats.missingList.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-red-200 space-y-1">
                    <p className="text-xs font-semibold text-red-700">
                      ⚠️ {imageDisplayStats.missingList.length} hình chưa hiển thị được:
                    </p>
                    <ul className="text-xs text-red-600 space-y-0.5 max-h-40 overflow-y-auto">
                      {imageDisplayStats.missingList.map((m, idx) => (
                        <li key={`${m.id}-${idx}`}>
                          <span className="font-medium">{m.location}</span> — {m.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Danh sách câu hỏi hiển thị dạng Card, liền mạch cả 4 phần */}
            <div className="space-y-10">
              {/* --- PHẦN I --- */}
              {data.thong_ke.so_cau_phan_1 > 0 && (
                <div className="space-y-6">
                  <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">
                    Phần I: Trắc nghiệm ({data.thong_ke.so_cau_phan_1} câu)
                  </h2>
                  {data.phan_1_TracNghiem.map((q: any, i: number) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i}
                  partition="p1"
                  isEditing={editingId === q.id}
                  isOpen={openSolutions[q.id] !== false}
                  mounted={mounted}
                  draft={draft}
                  setDraft={setDraft}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onToggleSolution={toggleSolution}
                  renderWithTikZ={renderWithTikZ}
                  renderOptions={() => (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      {q.options.map((opt: any, oIdx: number) => (
                        <div
                          key={oIdx}
                          // SỬA (28-7, khiếu nại "đáp án đúng khung xanh là đủ,
                          // không cần chữ chuyển xanh"): BỎ text-green-800 —
                          // chữ phương án giữ màu đen (mặc định) như phương án
                          // sai, chỉ còn khung viền + nền xanh (border-green-300
                          // bg-green-50) phân biệt đáp án đúng.
                          className={`p-3 rounded-lg border text-[13px] sm:text-[15px] overflow-x-auto no-scrollbar whitespace-pre-wrap leading-relaxed ${opt.isCorrect ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}
                          style={scrollFadeX(opt.isCorrect ? '#f0fdf4' : '#ffffff')}
                        >
                          {/* Nhãn A/B/C/D (chữ hoa) đúng chuẩn đề thi trắc
                              nghiệm 4 phương án, giống cách phần II đang dùng
                              a)/b)/c)/d) chữ thường — 65 là mã ASCII của 'A'.
                              SỬA (28-7): bỏ nhãn "✓ đáp án đúng" đứng CUỐI
                              dòng (dài, chiếm chỗ) — thay bằng dấu ✓ ĐƠN đặt
                              NGAY SAU nhãn A/B/C/D, cùng 1 span nên luôn dính
                              liền chữ cái, không rơi lạc xuống cuối dòng dài. */}
                          <span className="font-semibold mr-2 text-blue-700">
                            {String.fromCharCode(65 + oIdx)}.
                            {opt.isCorrect && <span className="text-green-600 ml-1">✓</span>}
                          </span>
                          {renderWithTikZ(opt.text)}
                        </div>
                      ))}
                    </div>
                  )}
                />
                  ))}
                </div>
              )}

              {/* --- PHẦN II --- */}
              {data.thong_ke.so_cau_phan_2 > 0 && (
                <div className="space-y-6">
                  <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">
                    Phần II: Đúng/Sai ({data.thong_ke.so_cau_phan_2} câu)
                  </h2>
                  {data.phan_2_DungSai.map((q: any, i: number) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i}
                  partition="p2"
                  typeLabel="Đúng/Sai"
                  isEditing={editingId === q.id}
                  isOpen={openSolutions[q.id] !== false}
                  mounted={mounted}
                  draft={draft}
                  setDraft={setDraft}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onToggleSolution={toggleSolution}
                  renderWithTikZ={renderWithTikZ}
                  renderOptions={() => (
                    /* SỬA (25-7): bỏ ghi chú "ĐÚNG"/"SAI" thừa bên phải mỗi
                       ý — màu nền đã đủ phân biệt, giống cách phần I giờ chỉ
                       còn 1 nhãn "✓ đáp án đúng" thay vì lặp lại chữ ở mọi
                       phương án.
                       SỬA (27-7, "đồng bộ màu phương án giữa trắc nghiệm
                       A/B/C/D và đúng/sai a/b/c/d"): trước đây phương án
                       "sai" ở đây tô nền CAM (bg-orange-50), trong khi phương
                       án sai/chưa chọn ở Phần I lại tô TRẮNG — lệch màu giữa
                       2 loại câu hỏi trên cùng 1 trang. Nay đổi thành cùng
                       tông trắng/viền xám như Phần I để đồng bộ. */
                    <div className="space-y-2 mb-4">
                      {q.options.map((opt: any, oIdx: number) => (
                        // SỬA (28-7, đồng bộ Phần I): bỏ text-green-800/
                        // font-medium — ý đúng chỉ còn khung/nền xanh, chữ
                        // giữ màu đen như ý sai.
                        <div key={oIdx} className={`p-3 rounded-lg border text-[13px] sm:text-[15px] ${opt.isCorrect ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
                          <span
                            className="overflow-x-auto no-scrollbar whitespace-pre-wrap leading-relaxed"
                            style={scrollFadeX(opt.isCorrect ? '#f0fdf4' : '#ffffff')}
                          >
                            <span className="font-semibold mr-2 text-blue-700">{String.fromCharCode(97 + oIdx)})&nbsp;</span>
                            {renderWithTikZ(opt.text)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                />
                  ))}
                </div>
              )}

              {/* --- PHẦN III --- */}
              {data.thong_ke.so_cau_phan_3 > 0 && (
                <div className="space-y-6">
                  <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">
                    Phần III: Trả lời ngắn ({data.thong_ke.so_cau_phan_3} câu)
                  </h2>
                  {data.phan_3_TraLoiNgan.map((q: any, i: number) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i}
                  partition="p3"
                  typeLabel="Trả lời ngắn"
                  answer={q.answer}
                  isEditing={editingId === q.id}
                  isOpen={openSolutions[q.id] !== false}
                  mounted={mounted}
                  draft={draft}
                  setDraft={setDraft}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onToggleSolution={toggleSolution}
                  renderWithTikZ={renderWithTikZ}
                />
                  ))}
                </div>
              )}

              {/* --- PHẦN IV: TỰ LUẬN --- */}
              {data.thong_ke.so_cau_phan_4 > 0 && (
                <div className="space-y-6">
                  <h2 className="font-bold text-slate-700 text-[15px] px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-lg">
                    Phần IV: Tự luận ({data.thong_ke.so_cau_phan_4} câu)
                  </h2>
                  {data.phan_4_TuLuan.map((q: any, i: number) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={i}
                  partition="p4"
                  typeLabel="Tự luận"
                  isEditing={editingId === q.id}
                  isOpen={openSolutions[q.id] !== false}
                  mounted={mounted}
                  draft={draft}
                  setDraft={setDraft}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onToggleSolution={toggleSolution}
                  renderWithTikZ={renderWithTikZ}
                />
                  ))}
                </div>
              )}
            </div>

            {/* THÊM MỚI (khiếu nại: "xem đề tới cuối rồi phải kéo ngược lên
                trên mới bấm được tab Cài đặt, bất tiện"): nút "đi tắt" sang
                tab Cài đặt đặt NGAY dưới câu cuối cùng — GV xem hết đề xong
                bấm luôn tại đây, không phải kéo ngược lên đầu trang nữa.
                Cuộn nhẹ lên thanh tab (#exam-builder-top) sau khi chuyển tab
                để thấy rõ đang ở tab nào, tránh cảm giác "bấm mà không thấy
                gì đổi" vì nội dung Cài đặt nằm ngay từ đầu trang. */}
            <div className="mt-8 flex justify-center print:hidden">
              <button
                type="button"
                onClick={() => {
                  setBuilderSubTab('settings');
                  document.getElementById('exam-builder-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm transition"
              >
                Tiếp tục sang Cài đặt
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* THÊM MỚI (mục 4): panel "Danh sách đề đã lưu" — THƯỜNG TRỰC ở cuối
          trang (không phải modal như trước). Có nút "+ Tạo đề mới" và
          "+ Tạo thư mục", mỗi đề có dropdown chọn thư mục (PATCH) và nút
          🗑️ xoá vĩnh viễn (DELETE). Nhóm đề theo folder, đề chưa có folder
          rơi vào nhóm "Chưa phân loại". */}
      <div id="saved-exams-panel" className="max-w-6xl mx-auto px-4 mb-10">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-slate-800 px-5 py-3 border-b border-slate-700 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-white font-semibold flex items-center gap-2">
              📂 Danh sách đề đã lưu
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={createManualFolder}
                className="bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition"
              >
                🗂️＋ Tạo thư mục
              </button>
              <button
                type="button"
                onClick={handleNewExam}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition"
              >
                ＋ Tạo đề mới
              </button>
              <button
                type="button"
                onClick={() => refreshSavedExamsList()}
                title="Tải lại danh sách"
                className="text-slate-300 hover:text-white text-xs px-2 py-1.5"
              >
                🔄
              </button>
            </div>
          </div>

          <div className="p-4">
            {isLoadingSavedExamsList ? (
              <p className="text-sm text-gray-500 text-center py-8">⏳ Đang tải danh sách...</p>
            ) : savedExamsError ? (
              <p className="text-sm text-red-600 text-center py-8">{savedExamsError}</p>
            ) : savedExamsList.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Chưa có đề nào được lưu. Bấm &quot;Lưu đề thi lên MongoDB&quot; ở tab Cài đặt sau khi soạn xong.</p>
            ) : (
              (() => {
                // Nhóm đề theo folder; '' -> "Chưa phân loại". Thư mục thủ
                // công (manualFolders) chưa có đề nào cũng được hiện (rỗng).
                const groups: Record<string, typeof savedExamsList> = {};
                savedExamsList.forEach((exam) => {
                  const key = exam.folder?.trim() || '';
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(exam);
                });
                const folderNames = Array.from(
                  new Set([...manualFolders, ...Object.keys(groups).filter((k) => k !== '')])
                ).sort((a, b) => a.localeCompare(b, 'vi'));
                const allFolderOptions = ['', ...folderNames];
                // SỬA LỖI: trước đây nhóm '' (đề CHƯA gán thư mục) bị lọc bỏ
                // khỏi folderNames ở trên (`.filter((k) => k !== '')`) nên
                // KHÔNG BAO GIỜ được render ra, dù comment phía trên nói rõ
                // '' -> "Chưa phân loại" phải hiện. Hậu quả: mọi đề chưa gán
                // thư mục (mặc định khi mới lưu) biến mất khỏi danh sách,
                // trông như bị mất dữ liệu dù vẫn còn nguyên trong MongoDB.
                // Thêm '' vào đầu danh sách section cần render để hiện đúng
                // nhóm "Chưa phân loại" (kể cả khi rỗng, để nhất quán với
                // các thư mục thủ công rỗng cũng được hiện).
                const sectionKeys = ['', ...folderNames];

                return (
                  <div className="flex flex-col gap-6">
                    {sectionKeys.map((folderName) => (
                      <div key={folderName || '__unfiled__'}>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                          🗂️ {folderName || 'Chưa phân loại'} <span className="font-normal text-slate-400">({(groups[folderName] || []).length} đề)</span>
                        </p>
                        {(groups[folderName] || []).length === 0 ? (
                          <p className="text-xs text-gray-400 italic mb-2">Thư mục trống — chuyển đề vào đây bằng dropdown bên dưới.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {(groups[folderName] || []).map((exam) => (
                              <div
                                key={exam._id}
                                className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition flex-wrap"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-700 truncate flex items-center gap-2">
                                    {exam.title}
                                    {exam.is_published && (
                                      <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Đã xuất bản</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {new Date(exam.created_at).toLocaleString('vi-VN')}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <select
                                    value={exam.folder || ''}
                                    disabled={updatingExamId === exam._id}
                                    onChange={(e) => moveExamToFolder(exam._id, e.target.value)}
                                    className="text-xs border rounded-md px-2 py-1.5 text-gray-600 bg-white disabled:opacity-50"
                                    title="Chuyển vào thư mục khác"
                                  >
                                    <option value="">Chưa phân loại</option>
                                    {allFolderOptions.filter((f) => f).map((f) => (
                                      <option key={f} value={f}>{f}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={async () => {
                                      // SỬA (khiếu nại: "mở đề cũ mà nó cứ đứng ở tab Tải
                                      // lên, không tự chuyển"): trước đây nút này CHỈ gọi
                                      // loadSavedExam mà không đổi builderSubTab — nếu đang
                                      // ở tab "Tải lên" thì sau khi mở xong vẫn thấy y
                                      // nguyên khung tải lên/dán văn bản, coi như "không có
                                      // gì xảy ra" dù đề đã nạp xong ở dưới. Giờ luôn chuyển
                                      // sang tab "Xem đề" sau khi mở, để thấy ngay đề vừa mở.
                                      await loadSavedExam(exam._id, exam.title);
                                      setBuilderSubTab('view');
                                      requestAnimationFrame(() => {
                                        document.getElementById('exam-builder-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      });
                                    }}
                                    disabled={loadingExamId === exam._id}
                                    className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-md transition"
                                  >
                                    {loadingExamId === exam._id ? '⏳' : '▶️ Mở xem'}
                                  </button>
                                  <button
                                    onClick={async () => {
                                      // THÊM MỚI (mục 2): mở nhanh thẳng vào tab Cài đặt của
                                      // đúng đề này để sửa + Lưu cập nhật, không phải bấm
                                      // "Mở" rồi tự chuyển tab con thủ công.
                                      await loadSavedExam(exam._id, exam.title);
                                      setBuilderSubTab('settings');
                                      requestAnimationFrame(() => {
                                        document.getElementById('exam-builder-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      });
                                    }}
                                    disabled={loadingExamId === exam._id}
                                    title="Mở đề này và vào thẳng Cài đặt để sửa"
                                    className="bg-white border border-slate-400 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold px-2.5 py-1.5 rounded-md transition"
                                  >
                                    ⚙️ Mở cài đặt
                                  </button>
                                  <button
                                    onClick={() => deleteExamPermanently(exam._id, exam.title)}
                                    disabled={deletingExamId === exam._id}
                                    className="text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-semibold px-2.5 py-1.5 rounded-md transition"
                                    title="Xoá vĩnh viễn"
                                  >
                                    {deletingExamId === exam._id ? '⏳' : '🗑️'}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>

      {/* Modal Sửa hình: sửa thẳng mã TikZ gốc của MỘT hình cụ thể (không phải
          sửa cả câu). Textarea thường nên Enter/Backspace kéo dòng/xoá dòng
          tự nhiên như mọi textarea khác. Đặt ở cấp toàn trang (không nằm
          trong QuestionCard) vì một hình có thể được tham chiếu từ nhiều nơi
          (đề bài, đáp án, lời giải) qua cùng một id. */}
      {editingTikzId && mounted && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#1e1f22] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-white/10">

            {/* Thanh tiêu đề */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#26282c] flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-purple-400 text-base flex-shrink-0">🖊️</span>
                <span className="text-sm font-medium text-gray-100 truncate">
                  TikZ Editor <span className="text-gray-500">—</span>{' '}
                  <span className="text-gray-400 font-mono text-xs align-middle">{editingTikzId}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowApiSettings((v) => !v)}
                  className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 border transition ${
                    showApiSettings
                      ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                      : 'bg-[#33353a] border-white/10 text-gray-300 hover:bg-[#3d3f45] hover:text-white'
                  }`}
                >
                  ⚙️ API Model
                </button>
                <button
                  onClick={cancelEditTikz}
                  disabled={recompilingTikzId === editingTikzId}
                  className="text-gray-400 hover:text-white text-lg leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 transition disabled:opacity-40"
                  aria-label="Đóng"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Popover cài đặt AI: nhiều API key (xoay vòng khi lỗi) + model —
                bung/gập bằng nút "API Model" */}
            {showApiSettings && (
              <div className="px-4 py-3 border-b border-white/10 bg-[#26282c] flex flex-col gap-3 flex-shrink-0">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] text-gray-400 mb-1">
                      Thêm Gemini API key{' '}
                      <span className="text-gray-500 font-normal">
                        — hỗ trợ nhiều key, tự xoay vòng khi lỗi (mỗi key thử tối đa 3 lần)
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={geminiKeyInput}
                        onChange={(e) => setGeminiKeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveGeminiKey();
                          }
                        }}
                        placeholder="Dán API key lấy từ Google AI Studio rồi bấm Lưu key..."
                        className="flex-1 min-w-0 text-xs bg-[#1e1f22] border border-white/10 rounded-md px-2.5 py-1.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        onClick={saveGeminiKey}
                        disabled={!geminiKeyInput.trim()}
                        className="flex-shrink-0 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-1.5 rounded-md transition"
                      >
                        💾 Lưu key
                      </button>
                    </div>
                  </div>
                  <div className="sm:w-52 flex-shrink-0">
                    <label className="block text-[11px] text-gray-400 mb-1">Mô hình</label>
                    <select
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="w-full text-xs bg-[#1e1f22] border border-white/10 rounded-md px-2.5 py-1.5 text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      {GEMINI_MODELS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Danh sách key đã lưu — key có chấm tím là key vừa dùng gần nhất */}
                {geminiApiKeys.length > 0 && (
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">
                      Key đã lưu ({geminiApiKeys.length})
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {geminiApiKeys.map((k, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border ${
                            i === activeKeyIndex
                              ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                              : 'bg-[#1e1f22] border-white/10 text-gray-400'
                          }`}
                        >
                          🔑 Key {i + 1} — ••••{k.slice(-4)}
                          {i === activeKeyIndex && (
                            <span className="text-purple-300" title="Key dùng gần nhất">●</span>
                          )}
                          <button
                            onClick={() => removeGeminiKey(i)}
                            className="text-gray-500 hover:text-red-400 transition"
                            title="Xoá key này"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Nội dung: tiêu đề nhỏ + khung mã TikZ */}
            <div className="px-4 pt-3 pb-2 flex flex-col flex-1 min-h-0 overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-100 mb-0.5">Chỉnh sửa mã TikZ</h3>
              <p className="text-[11px] text-gray-500 font-mono mb-2 truncate">{editingTikzId}</p>
              <textarea
                value={tikzDraft}
                onChange={(e) => setTikzDraft(e.target.value)}
                spellCheck={false}
                rows={16}
                className="w-full flex-1 min-h-[260px] text-[13px] font-mono leading-relaxed bg-[#141517] border border-white/10 rounded-lg p-3 text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
              />
            </div>

            {/* Ô yêu cầu sửa bằng lời + nút gọi AI */}
            <div className="px-4 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2 bg-[#141517] border border-white/10 rounded-lg pl-3 pr-1.5 py-1.5 focus-within:ring-1 focus-within:ring-purple-500">
                <input
                  type="text"
                  value={aiEditInstruction}
                  onChange={(e) => setAiEditInstruction(e.target.value)}
                  placeholder="Yêu cầu sửa code: VD: Đổi nét đứt, tô màu đỏ..."
                  className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 placeholder-gray-500 py-1 focus:outline-none"
                />
                <button
                  onClick={handleAiEditTikz}
                  disabled={isAiEditing}
                  className="flex-shrink-0 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-1.5 rounded-md transition whitespace-nowrap"
                >
                  {isAiEditing ? '⏳ AI Sửa' : 'AI Sửa'}
                </button>
              </div>
              {aiEditError && <p className="text-xs text-red-400 mt-1.5">{aiEditError}</p>}
            </div>

            {/* Footer: Hủy / Lưu và cập nhật */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10 bg-[#26282c] flex-shrink-0">
              <button
                onClick={cancelEditTikz}
                disabled={recompilingTikzId === editingTikzId}
                className="text-gray-300 hover:text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-white/10 transition disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                onClick={() => saveEditTikz(editingTikzId)}
                disabled={recompilingTikzId === editingTikzId}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-md transition"
              >
                {recompilingTikzId === editingTikzId ? '⏳ Đang cập nhật...' : 'Lưu và cập nhật'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* THÊM MỚI (mục 4): modal "Danh sách đề đã lưu" cũ đã được thay bằng
          panel THƯỜNG TRỰC (#saved-exams-panel) ở trên — xem thêm tại đó.
          showSavedExamsModal/setShowSavedExamsModal vẫn giữ trong state để
          không phải sửa các nơi khác đang tham chiếu, nhưng không còn modal
          nào gắn với nó nữa. */}

      {/* THÊM MỚI: modal soát lỗi trước khi xuất bản — theo đúng tinh thần
          khung đỏ của Azota (ảnh soát lỗi), liệt kê đích danh từng câu lỗi,
          không cho xuất bản cho tới khi giáo viên sửa xong và bấm lại. */}
      {showPublishErrorsModal && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowPublishErrorsModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-sm font-bold text-red-700">⚠️ Chưa thể xuất bản, còn lỗi cần sửa</h3>
              <button
                onClick={() => setShowPublishErrorsModal(false)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 transition"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <ul className="flex flex-col gap-2">
                {publishErrors.map((err, i) => (
                  <li
                    key={i}
                    className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                  >
                    {err}
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => setShowPublishErrorsModal(false)}
                className="w-full bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold py-2 rounded-lg transition"
              >
                Tôi đã hiểu, để tôi sửa lại
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* THÊM MỚI: modal xuất bản thành công — hiện link kèm nút copy. LƯU Ý
          hiện tại link chỉ thật sự vào được nếu app đang chạy trên mạng nội
          bộ (cùng Wi-Fi) hoặc đã deploy công khai; đường dẫn /thi/{id} bản
          thân trang hiển thị công khai chưa được xây (việc của giai đoạn
          sau khi đã deploy). */}
      {showPublishSuccessModal && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowPublishSuccessModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-bold text-emerald-700 inline-flex items-center gap-1.5">
                <CheckCircleIcon className="w-4 h-4" /> Đã xuất bản đề thi
              </h3>
              <button
                onClick={() => setShowPublishSuccessModal(false)}
                className="text-gray-400 hover:text-gray-700 text-lg leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 transition"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>
            {/* SỬA (mục 4 - GHI-CHU-TON-DONG-18-7.md): trước đây modal này hiện NGAY link quản lý
                (thiếu classId) cùng lúc với cảnh báo "đừng gửi link này cho
                học sinh" — 2 thông điệp trái ngược nhau trong cùng 1 màn
                hình khiến nhiều GV vẫn lỡ copy nhầm link này gửi cho học
                sinh. Giờ đổi trọng tâm: chỉ hiện THÔNG BÁO đã xuất bản +
                nút bấm đi thẳng sang tab "Khối lớp" (nơi duy nhất lấy được
                link đúng, xem ClassAssignPanel ở trên — tự ghép ?class=...).
                Link quản lý/nội bộ cũ vẫn giữ lại cho GV nào thật sự cần
                (xem lại đề, không dùng để giao), nhưng gói trong khối "nâng
                cao" đóng sẵn, không hiện ra ngay trong tầm mắt.
                SỬA THÊM (khiếu nại 18/07): tab "Quản lý lớp" ĐÃ BỊ XÓA khỏi
                menu (thay bằng "Khối" — xem KhoiTab.tsx/ClassDetailPanel,
                page.tsx đã đổi onGoToClasses={() => setActiveTab('khoi')}
                từ trước NÊN NÚT BẤM VẪN ĐIỀU HƯỚNG ĐÚNG chỗ), nhưng nhãn chữ
                trong modal này vẫn còn ghi "Quản lý lớp" — sửa lại đúng tên
                tab hiện tại "Khối lớp" cho khớp với nơi thực sự điều hướng
                tới, tránh GV hoang mang tưởng nút bấm bị lỗi/trỏ sai. */}
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-3">
                <SparkleIcon className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Xuất bản thành công, đã tạo link cho đề này.</p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Để lấy link gửi cho học sinh: sang tab <b>Khối lớp</b> → chọn lớp → bấm{' '}
                    <b className="inline-flex items-center gap-1 align-middle">
                      <SendIcon className="w-3.5 h-3.5" /> Giao đề
                    </b>,
                    chọn đúng đề vừa xuất bản.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setShowPublishSuccessModal(false);
                  onGoToClasses?.();
                }}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2.5 rounded-md transition flex items-center justify-center gap-2"
              >
                Đi tới Khối lớp để giao đề →
              </button>

              <details className="group text-xs text-gray-500">
                <summary className="cursor-pointer select-none hover:text-gray-700 py-1">
                  Xem link quản lý đề (nâng cao — không dùng để gửi cho học sinh)
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={publishedLink}
                      className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50 text-gray-700"
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(publishedLink);
                        alert('📋 Đã copy link!');
                      }}
                      className="bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold px-4 py-2 rounded-md transition flex-shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                  {/* SỬA: cảnh báo rõ — link này THIẾU classId nên học sinh mở
                      sẽ bị báo "thiếu thông tin lớp", không dùng để gửi trực
                      tiếp cho học sinh được. Link gửi được PHẢI lấy ở tab
                      "Khối lớp" > vào lớp > "Giao đề" (có kèm ?class=...). */}
                  <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    ⚠️ Link này KHÔNG gửi trực tiếp cho học sinh được (thiếu thông tin lớp, học sinh mở sẽ báo lỗi).
                  </p>
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠️ Link chỉ vào được nếu học sinh cùng mạng Wi-Fi với máy bạn (app đang chạy nội bộ), hoặc bạn đã deploy app lên mạng công khai.
                  </p>
                </div>
              </details>
            </div>
          </div>
        </div>,
        document.body
      )}
    </main>
  );
}
