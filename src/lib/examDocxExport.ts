// examDocxExport.ts — xuất đề thi (raw_data đã bóc tách: phan_1_TracNghiem,
// phan_2_DungSai, phan_3_TraLoiNgan, phan_4_TuLuan, tikz_list) ra file Word
// (.docx) THẬT — công thức LaTeX ($...$/$$...$$) render thành công thức Word
// gốc (OMML, sửa được), không phải ảnh chụp màn hình.
//
// KIẾN TRÚC (ĐÃ ĐỔI — không dùng pandoc-wasm nữa): hàm buildExamMarkdown bên
// dưới vẫn dựng Markdown + rasterize hình TikZ (SVG -> PNG) NGAY TRONG
// Next.js bằng "@resvg/resvg-js" (thư viện nhẹ, thuần JS/WASM, chạy tốt trên
// serverless) — phần này KHÔNG đổi. Phần ĐỔI là bước cuối "Markdown -> .docx"
// : trước đây gọi package "pandoc-wasm" (bản WASM ~56MB) chạy tại chỗ, giờ
// gửi markdown + ảnh PNG (base64) sang MỘT SPACE HUGGING FACE (Docker, cài
// pandoc bản đầy đủ thật — xem hf_spaces/docx_space/app.py, route
// POST /export-docx) để pandoc thật dựng file, rồi nhận buffer .docx trả về.
// Lý do đổi: pandoc-wasm nặng, không tận dụng được toàn bộ tính năng pandoc
// gốc; Space Hugging Face đã có sẵn (cùng hạ tầng với Space compile TikZ)
// nên tận dụng luôn, không tốn thêm tài khoản/hosting.
//
// CẦN THÊM biến môi trường (project Next.js, ví dụ trên Vercel):
//   EXPORT_DOCX_SERVICE_URL=https://<ten-space>.hf.space/export-docx
//   EXPORT_SERVICE_SECRET=<chuỗi bí mật, TRÙNG với biến EXPORT_SECRET đặt
//                           trong Settings > Variables and secrets của Space>
//
// HÌNH TIKZ: tikz_list[].svg là SVG (không phải markdown pandoc hiểu trực
// tiếp khi nhúng ảnh). ĐÃ THỬ nhúng thẳng SVG cho pandoc tự xử lý — pandoc
// cần binary "rsvg-convert" để tạo ảnh raster dự phòng bên trong docx; để
// khỏi phụ thuộc thêm binary đó, PHẢI tự rasterize SVG -> PNG bằng
// "@resvg/resvg-js" TRƯỚC khi đưa cho pandoc (giữ nguyên cách cũ).
//
// Cài đặt cần thêm (nếu chưa có trong package.json):
//   npm install @resvg/resvg-js
//   (KHÔNG cần "pandoc-wasm" nữa — có thể gỡ khỏi package.json)
//
// CHƯA LÀM (ngoài phạm vi lần này, ghi chú lại để làm tiếp nếu cần):
//   - Ngắt trang thật giữa các câu/phần: pandoc không tự tạo ngắt trang từ
//     markdown thường. Muốn có, chèn khối raw OOXML
//     ```{=openxml}
//     <w:p><w:r><w:br w:type="page"/></w:r></w:p>
//     ```
//     vào markdown đầu vào (cần bật extension `raw_attribute`, xem ghi chú ở
//     hàm buildExamDocx bên dưới).
//   - [[HÌNH_FILE_n]] (ảnh \includegraphics GV tự tải lên, không phải TikZ):
//     hiện CHƯA có nguồn dữ liệu ảnh gốc truyền vào hàm này, nên tạm thay
//     bằng dòng chú thích thay vì làm vỡ toàn bộ export.

import { Resvg } from '@resvg/resvg-js';
import { sanitizeMathMacros, convertLatexTablesToMarkdown } from './textUtils';

// SỬA LỖI (khiếu nại: "bảng bị lỗi ra tex" khi xuất Word): trước đây nội
// dung câu hỏi/lời giải (đã chứa sẵn "$$\begin{array}{...}...\end{array}$$"
// từ parser.ts) được đưa THẲNG cho pandoc, nhờ engine TeX-math (texmath) của
// pandoc tự "đoán" và dựng thành công thức Toán. NHIỀU bảng biến thiên/xét
// dấu dùng \multicolumn để gộp ô đầu dòng — \multicolumn KHÔNG PHẢI cú pháp
// Toán hợp lệ, texmath không hiểu được lệnh này. Vì đây chỉ là WARNING
// ("CouldNotConvertTeXMath"), không phải ERROR, nên buildExamDocx TRƯỚC ĐÂY
// không phát hiện ra và vẫn xuất file — kết quả: pandoc in NGUYÊN VĂN chuỗi
// mã LaTeX nguồn ra file Word dưới dạng chữ thường (đã tái hiện và xác nhận
// bằng thử nghiệm thủ công với pandoc-wasm). Bọc mọi nội dung câu hỏi qua
// convertLatexTablesToMarkdown TRƯỚC khi đưa cho pandoc — tự dò khối bảng và
// dựng thành bảng Markdown (pipe table), pandoc dựng ra <w:tbl> (bảng Word
// thật có viền) thay vì phó mặc cho texmath.
function preprocessContent(text: string): string {
  return convertLatexTablesToMarkdown(sanitizeMathMacros(text || ''));
}

// THÊM MỚI: field `url` — đề mới (sau khi ExamBuilder.tsx đổi sang tải SVG
// TikZ lên Vercel Blob thay vì nhúng thẳng, xem uploadTikzSvgsForSave()) lưu
// {id, code, url} thay vì {id, code, svg}. Route export-docx/export-pdf gọi
// hydrateTikzSvgFromUrls() (tikzCrop.ts) TRƯỚC khi tới đây để mồi lại `svg`
// từ `url`, nên logic rasterize bên dưới (ImageCollector.resolve) không cần
// đổi gì — chỉ khai báo thêm field để khớp type dữ liệu thật sự nhận được.
// THÊM MỚI: `imagePngBuffer` — hình TikZ quá nặng đã bị rasterize sang PNG
// ngay lúc tải lên (xem rasterizeTikzSvgToPng trong tikzCrop.ts, phương án
// cuối khi cắt+nén SVG vẫn không đủ nhẹ) sẽ không có `svg` để mồi lại, chỉ
// hydrateTikzSvgFromUrls() gán field NÀY (Buffer PNG tải thẳng từ url) —
// ImageCollector.resolve bên dưới đọc thẳng, KHÔNG cần rasterize lại lần 2.
export type TikzItem = { id: string; code: string; svg?: string; url?: string; imagePngBuffer?: Buffer };

export type MdOption = { text: string; isCorrect: boolean };

export type MdQuestion = {
  id: string;
  label: string; // 'Câu' | 'Bài'
  code: string;
  content: string;
  options?: MdOption[];
  solution?: string;
  answer?: string;
};

export type ExamRawData = {
  phan_1_TracNghiem?: MdQuestion[];
  phan_2_DungSai?: MdQuestion[];
  phan_3_TraLoiNgan?: MdQuestion[];
  phan_4_TuLuan?: MdQuestion[];
  tikz_list?: TikzItem[];
};

export type BuildExamDocxOptions = {
  title?: string;
  includeSolutions: boolean; // false = "Đề riêng" (phát cho học sinh), true = "Đề + lời giải"
};

const PLACEHOLDER_RE = /(\[\[HÌNH_TIKZ_\d+\]\]|\[\[HÌNH_FILE_\d+\]\])/g;

// Cache PNG đã rasterize theo placeholder id trong PHẠM VI 1 lần export —
// tránh rasterize lại nếu (hiếm khi) cùng 1 hình được chèn nhiều nơi.
//
// THÊM MỚI (xuất PDF nhiều mã đề — buildMultiCodeExamMarkdown bên dưới): 1
// collector giờ có thể được DÙNG CHUNG cho nhiều lần gọi buildExamMarkdown
// liên tiếp (mỗi mã đề gọi 1 lần) — bộ đếm `seq` KHÔNG reset giữa các lần
// gọi nên tên file "tikz_N.png" không bao giờ trùng giữa các mã đề khác
// nhau, dù các mã đề dùng chung id hình gốc (chỉ khác thứ tự câu/phương án
// do trộn đề, ảnh TikZ vẫn y hệt).
class ImageCollector {
  private tikzById = new Map<string, TikzItem>();
  files: Record<string, Blob> = {};
  private seq = 0;

  constructor(tikzList?: TikzItem[]) {
    this.registerTikzList(tikzList);
  }

  // Nạp thêm 1 tikz_list mới vào map hiện có — dùng khi tái sử dụng 1
  // collector cho nhiều mã đề (mỗi mã đề có thể có tikz_list riêng, dù
  // thường trùng nội dung với mã đề gốc).
  registerTikzList(tikzList: TikzItem[] | undefined) {
    for (const t of tikzList || []) this.tikzById.set(t.id, t);
  }

  // Thay mọi placeholder trong `text` bằng cú pháp ảnh markdown
  // "![](tikz_N.png)", rasterize SVG -> PNG ngay lúc gặp (đồng bộ, resvg-js
  // không cần async).
  resolve(text: string): string {
    if (!text) return text;
    return text.replace(PLACEHOLDER_RE, (match) => {
      if (match.startsWith('[[HÌNH_FILE_')) {
        // Chưa có nguồn ảnh gốc truyền vào — giữ lại như 1 dòng chú thích rõ
        // ràng thay vì làm hỏng cả file, để GV biết cần tự chèn ảnh này.
        return `\n\n*(Hình ảnh tải lên "${match}" — chưa hỗ trợ tự động chèn, giáo viên tự bổ sung.)*\n\n`;
      }
      const item = this.tikzById.get(match);
      if (!item || (!item.svg && !item.imagePngBuffer)) {
        return `\n\n*(Không tìm thấy hình "${match}")*\n\n`;
      }
      this.seq += 1;
      const filename = `tikz_${this.seq}.png`;
      // THÊM MỚI: hình đã bị rasterize sang PNG ngay lúc tải lên (quá nặng
      // để giữ SVG, xem imagePngBuffer ở TikzItem) — dùng THẲNG buffer đã
      // tải, không cần gọi resvg rasterize lại lần 2 (item.svg rỗng nên
      // nhánh cũ dưới đây không chạy được với hình này).
      if (!item.svg && item.imagePngBuffer) {
        this.files[filename] = new Blob([new Uint8Array(item.imagePngBuffer)], { type: 'image/png' });
        return `\n\n![Hình vẽ](${filename})\n\n`;
      }
      try {
        const resvg = new Resvg(item.svg!, { fitTo: { mode: 'width', value: 900 } });
        const png = resvg.render().asPng();
        // ÉP KIỂU: @types/node mới siết chặt BlobPart, không còn coi
        // Buffer<ArrayBufferLike> (buffer nền có thể là SharedArrayBuffer)
        // là tương thích thẳng với BlobPart. Bọc lại bằng `new Uint8Array(png)`
        // để tạo 1 Uint8Array mới với ArrayBuffer thường (copy dữ liệu, không
        // tốn kém vì ảnh nhỏ), khớp đúng kiểu BlobPart yêu cầu.
        this.files[filename] = new Blob([new Uint8Array(png)], { type: 'image/png' });
      } catch (err) {
        console.error(`Lỗi rasterize hình ${match}:`, err);
        return `\n\n*(Lỗi hiển thị hình "${match}")*\n\n`;
      }
      return `\n\n![Hình vẽ](${filename})\n\n`;
    });
  }
}

function mdEscapeHeading(text: string): string {
  // Chỉ dùng cho tiêu đề ngắn (tên đề, tên phần) — không cần escape phức tạp
  // vì không chứa markdown đặc biệt trong ngữ cảnh này.
  return text.replace(/\n/g, ' ').trim();
}

function questionToMarkdown(
  q: MdQuestion,
  displayIndex: number,
  partKind: 'mc' | 'tf' | 'short' | 'essay',
  includeSolutions: boolean,
  img: ImageCollector
): string {
  const lines: string[] = [];
  const label = q.label || 'Câu';
  const content = img.resolve(preprocessContent(q.content || ''));
  lines.push(`**${label} ${displayIndex}.** ${content}`);

  if (partKind === 'mc' && q.options) {
    const letters = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, i) => {
      const text = img.resolve(preprocessContent(opt.text || ''));
      const mark = includeSolutions && opt.isCorrect ? ' **(Đáp án đúng)**' : '';
      lines.push(`\n${letters[i]}. ${text}${mark}`);
    });
  } else if (partKind === 'tf' && q.options) {
    const letters = ['a', 'b', 'c', 'd'];
    q.options.forEach((opt, i) => {
      const text = img.resolve(preprocessContent(opt.text || ''));
      const mark = includeSolutions ? (opt.isCorrect ? ' **(Đúng)**' : ' **(Sai)**') : '';
      lines.push(`\n${letters[i]}) ${text}${mark}`);
    });
  }

  if (partKind === 'short' && includeSolutions && q.answer) {
    lines.push(`\n**Đáp số:** ${q.answer}`);
  }

  if (includeSolutions && q.solution) {
    lines.push(`\n**Lời giải:**\n\n${img.resolve(preprocessContent(q.solution))}`);
  }

  lines.push('\n');
  return lines.join('\n');
}

// Dựng toàn bộ nội dung Markdown (pandoc hiểu: tex_math_dollars cho công
// thức, ![]() cho ảnh, bảng markdown chuẩn) + map file ảnh PNG kèm theo, sẵn
// sàng đưa cho pandoc-wasm.
export function buildExamMarkdown(
  raw: ExamRawData,
  opts: BuildExamDocxOptions,
  // THÊM MỚI: truyền vào 1 ImageCollector CÓ SẴN (dùng chung giữa nhiều mã
  // đề, xem buildMultiCodeExamMarkdown) — bỏ trống thì hàm tự tạo collector
  // riêng như trước (hành vi export-docx/export-pdf 1 đề không đổi).
  sharedImg?: ImageCollector
): { markdown: string; files: Record<string, Blob> } {
  const img = sharedImg || new ImageCollector(raw.tikz_list);
  if (sharedImg) sharedImg.registerTikzList(raw.tikz_list);
  const parts: string[] = [];

  if (opts.title) {
    parts.push(`# ${mdEscapeHeading(opts.title)}\n`);
    if (opts.includeSolutions) parts.push('_(Bản có lời giải)_\n');
  }

  const p1 = raw.phan_1_TracNghiem || [];
  if (p1.length) {
    parts.push('## Phần I. Trắc nghiệm nhiều phương án lựa chọn\n');
    p1.forEach((q, i) => parts.push(questionToMarkdown(q, i + 1, 'mc', opts.includeSolutions, img)));
  }

  const p2 = raw.phan_2_DungSai || [];
  if (p2.length) {
    parts.push('## Phần II. Trắc nghiệm đúng sai\n');
    p2.forEach((q, i) => parts.push(questionToMarkdown(q, i + 1, 'tf', opts.includeSolutions, img)));
  }

  const p3 = raw.phan_3_TraLoiNgan || [];
  if (p3.length) {
    parts.push('## Phần III. Trả lời ngắn\n');
    p3.forEach((q, i) => parts.push(questionToMarkdown(q, i + 1, 'short', opts.includeSolutions, img)));
  }

  const p4 = raw.phan_4_TuLuan || [];
  if (p4.length) {
    parts.push('## Phần IV. Tự luận\n');
    p4.forEach((q, i) => parts.push(questionToMarkdown(q, i + 1, 'essay', opts.includeSolutions, img)));
  }

  return { markdown: parts.join('\n'), files: img.files };
}

// ==========================================
// XUẤT PDF NHIỀU MÃ ĐỀ (thay cho window.print/in trình duyệt) — GỘP nhiều
// mã đề (mỗi mã đã trộn câu/phương án ở CLIENT bằng buildLiveExamData, xem
// ExamBuilder.tsx) thành 1 markdown DUY NHẤT, ngắt trang thật giữa các mã đề
// bằng khối raw LaTeX `\newpage` (cú pháp ```{=latex}...``` — pandoc's
// "raw_attribute" extension, bật mặc định trong markdown của pandoc, cho
// phép chèn thẳng lệnh LaTeX mà không cần định dạng nguồn là latex). Trang
// đáp án của TẤT CẢ mã đề được gộp ở CUỐI, đúng thứ tự phát đề y hệt bản in
// trình duyệt cũ (PrintExamCodePaper/PrintAnswerKeyPage).
// ==========================================
export type MultiCodeExamEntry = { code: string; data: ExamRawData };

const LATEX_PAGE_BREAK = '\n\n```{=latex}\n\\newpage\n```\n\n';

function extractAnswerDigits(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/[^0-9+\-,]/g, '');
}

// Trang đáp án của 1 mã đề, dạng markdown thuần (không ảnh) — tương ứng
// PrintAnswerKeyPage ở ExamBuilder.tsx.
function buildAnswerKeyMarkdown(code: string, raw: ExamRawData): string {
  const lines: string[] = [`## Đáp án — Mã đề ${code}\n`];

  const p1 = raw.phan_1_TracNghiem || [];
  if (p1.length) {
    lines.push('**Phần I**\n');
    const items = p1.map((q, i) => {
      const idx = (q.options || []).findIndex((o) => o.isCorrect);
      const letter = idx >= 0 ? String.fromCharCode(65 + idx) : '?';
      return `Câu ${i + 1}: **${letter}**`;
    });
    lines.push(items.join('; ') + '\n');
  }

  const p2 = raw.phan_2_DungSai || [];
  if (p2.length) {
    lines.push('**Phần II**\n');
    p2.forEach((q, i) => {
      const opts = (q.options || []).map(
        (o, oi) => `${String.fromCharCode(97 + oi)}) **${o.isCorrect ? 'Đ' : 'S'}**`
      );
      lines.push(`Câu ${i + 1}: ${opts.join(', ')}  `);
    });
    lines.push('');
  }

  const p3 = raw.phan_3_TraLoiNgan || [];
  if (p3.length) {
    lines.push('**Phần III**\n');
    const items = p3.map((q, i) => `Câu ${i + 1}: **${extractAnswerDigits(q.answer)}**`);
    lines.push(items.join('; ') + '\n');
  }

  return lines.join('\n');
}

// Header đầu trang đề — tương ứng phần khung "ĐỀ KIỂM TRA / Họ và tên / Lớp
// / Mã đề" ở PrintExamCodePaper (viết bằng markdown thuần vì đây là nội
// dung tĩnh, không có công thức Toán cần texmath).
function buildExamCodeHeaderMarkdown(code: string, title?: string): string {
  return [
    `## ${title ? mdEscapeHeading(title) : 'ĐỀ KIỂM TRA'} — Mã đề ${code}\n`,
    'Họ và tên: .......................................  ',
    'Lớp: ..................\n',
  ].join('\n');
}

export function buildMultiCodeExamMarkdown(
  codes: MultiCodeExamEntry[],
  opts: { title?: string }
): { markdown: string; files: Record<string, Blob> } {
  // 1 collector DÙNG CHUNG cho toàn bộ N mã đề — xem ghi chú ở class
  // ImageCollector: bộ đếm file không reset giữa các mã đề nên không trùng
  // tên, dù các mã đề tham chiếu cùng 1 tập hình TikZ gốc.
  const img = new ImageCollector();
  const parts: string[] = [];

  if (opts.title) {
    parts.push(`# ${mdEscapeHeading(opts.title)}\n`);
  }

  // Phần 1: từng mã đề — TRANG ĐỀ, không đánh dấu đáp án đúng (includeSolutions: false).
  codes.forEach((entry, idx) => {
    if (idx > 0) parts.push(LATEX_PAGE_BREAK);
    parts.push(buildExamCodeHeaderMarkdown(entry.code, opts.title));
    const { markdown } = buildExamMarkdown(entry.data, { includeSolutions: false }, img);
    parts.push(markdown);
  });

  // Phần 2: TRANG ĐÁP ÁN của TẤT CẢ mã đề, gộp ở cuối cùng (phát đề xong
  // mới phát đáp án, không lẫn vào giữa) — luôn bắt đầu ở trang giấy mới.
  parts.push(LATEX_PAGE_BREAK);
  parts.push('# ĐÁP ÁN\n');
  codes.forEach((entry, idx) => {
    if (idx > 0) parts.push(LATEX_PAGE_BREAK);
    parts.push(buildAnswerKeyMarkdown(entry.code, entry.data));
  });

  return { markdown: parts.join('\n'), files: img.files };
}

// Chuyển map ảnh (Blob, do ImageCollector rasterize từ SVG) sang base64
// thuần — định dạng mà Space Hugging Face (route /export-docx, /export-pdf)
// nhận vào JSON body.
export async function filesToBase64(files: Record<string, Blob>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [filename, blob] of Object.entries(files)) {
    out[filename] = Buffer.from(await blob.arrayBuffer()).toString('base64');
  }
  return out;
}

// Hàm chính: raw_data đề thi -> Buffer .docx thật, sẵn sàng ghi ra
// NextResponse. Không tự dựng file tại chỗ nữa — gửi Markdown + ảnh sang
// Space Hugging Face (pandoc thật, xem hf_spaces/docx_space/app.py) và nhận
// buffer .docx trả về. Ném lỗi nếu thiếu cấu hình hoặc Space báo lỗi.
export async function buildExamDocx(raw: ExamRawData, opts: BuildExamDocxOptions): Promise<Buffer> {
  const { markdown, files } = buildExamMarkdown(raw, opts);
  const images = await filesToBase64(files);

  // ĐỊA CHỈ SPACE: xác nhận qua source code — Space "carot2026-tikz" (App 1,
  // ưu tiên chính) và "hong-2-m2w-tikz-compiler" (App 2, dự phòng) chạy
  // CHUNG 1 bản app.py (cả 2 đều có /compile + /export-docx). Mặc định
  // dùng App 1 cho xuất Word. Gán cứng mặc định tại đây, vẫn cho phép ghi
  // đè qua biến môi trường EXPORT_DOCX_SERVICE_URL nếu cần đổi Space.
  const serviceUrl = process.env.EXPORT_DOCX_SERVICE_URL || 'https://carot2026-tikz.hf.space/export-docx';
  const secret = process.env.EXPORT_SERVICE_SECRET;
  if (!serviceUrl) {
    throw new Error(
      'Chưa cấu hình EXPORT_DOCX_SERVICE_URL (URL Space Hugging Face render Word, dạng https://<ten-space>.hf.space/export-docx).'
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-export-secret': secret } : {}),
      },
      body: JSON.stringify({ markdown, images, title: opts.title || 'exam' }),
      // Space Hugging Face free tier có thể "ngủ" khi không ai gọi và mất
      // vài chục giây để tỉnh dậy (cold start) trước khi chạy pandoc thật —
      // để timeout rộng hơn timeout chờ ở route.ts phía trên gọi hàm này.
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    throw new Error(`Không kết nối được Space render Word (Hugging Face): ${(err as Error).message}`);
  }

  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => '');
    console.error('Lỗi pandoc khi xuất đề (Space Hugging Face):', upstream.status, errBody);
    throw new Error(`Space render Word báo lỗi (${upstream.status}). Xem chi tiết ở server log.`);
  }

  const arrBuf = await upstream.arrayBuffer();
  const buf = Buffer.from(arrBuf);
  if (!buf.length) {
    throw new Error('Space render Word không trả về nội dung file .docx.');
  }
  return buf;
}
