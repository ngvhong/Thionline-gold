// TÁCH RIÊNG khỏi examRender.tsx — hàm này là hàm thuần (không dùng JSX,
// không dùng hook), nhưng trước đây nằm trong examRender.tsx (có 'use client'
// ở đầu file). Next.js coi CẢ FILE có 'use client' là một "ranh giới Client
// Component" — mọi export từ file đó (kể cả hàm thuần, không phải component)
// đều bị chặn không cho gọi trực tiếp từ code chạy trên SERVER.
//
// grading.ts cần gọi extractAnswerDigits() ở CẢ 2 nơi: client (xem trước
// điểm ngay lúc học sinh làm bài) VÀ server (API /api/thi/[examId]/submit,
// chấm điểm chính thức) — import từ examRender.tsx nên khi chạy trên server
// bị lỗi "Attempted to call extractAnswerDigits() from the server but
// extractAnswerDigits is on the client".
//
// Giải pháp: đưa hàm thuần này ra một file KHÔNG có 'use client', dùng chung
// được cho cả server lẫn client.
export function extractAnswerDigits(text: string): string {
  if (!text) return '';
  return text.replace(/[^0-9+\-,]/g, '');
}

// THÊM MỚI: sửa các macro LaTeX mà KaTeX KHÔNG hỗ trợ nhưng đề gốc hay dùng.
// \wideparen{AmB} (ký hiệu "cung AmB" trong hình học — vòng cung phía trên
// các chữ cái) KHÔNG nằm trong danh sách hàm KaTeX hỗ trợ (xem
// https://katex.org/docs/support_table.html — "\overparen: Not supported").
// KaTeX chính thức gợi ý dùng \overgroup thay thế cho ký hiệu cung tròn này
// (\overgroup ĐƯỢC hỗ trợ, cùng hình dạng vòng cung phía trên, dùng biểu diễn
// cung/đoạn trong hình học — xem docs/supported.html mục Accents). Trước đây
// không thay thế -> KaTeX không nhận diện được lệnh, in thô nguyên văn
// "\wideparen{AmB}" ra màn hình thay vì vẽ cung tròn.
export function sanitizeMathMacros(text: string): string {
  if (!text) return text;
  return text.replace(/\\wideparen\b/g, '\\overgroup');
}

// THÊM MỚI (khiếu nại: "khoảng trắng trên/dưới hình to bất thường, chỉnh
// margin (my-0) không ăn thua"): nguồn gốc KHÔNG phải margin CSS của khung
// ảnh, mà là các dòng trống nằm sẵn trong chính NỘI DUNG CÂU HỎI, ngay sát
// mốc [[HÌNH_TIKZ_n]]/[[HÌNH_FILE_n]] — thường sót lại từ \begin{center}/
// \end{center} bao quanh hình trong mã .tex gốc (định dạng tự nhiên khi
// soạn LaTeX). Bước tách hình ra khỏi văn bản (extractTikzMarkdown trong
// ExamBuilder.tsx) chỉ cắt ĐÚNG khối \begin{tikzpicture}...\end{tikzpicture}
// để gửi biên dịch — KHÔNG dọn phần \begin{center}/\end{center}/dòng trống
// còn sót lại quanh đó. Khung hiển thị câu hỏi dùng CSS "whitespace-pre-wrap"
// (giữ nguyên mọi dấu xuống dòng y hệt chuỗi gốc) nên các dòng trống này HIỆN
// RA THÀNH khoảng trắng thật trên màn hình, không phân biệt được là do format
// gốc hay do bước tách mã để sót — và hoàn toàn không liên quan tới margin
// (my-0/my-1) của riêng khung ảnh, nên sửa margin không có tác dụng.
//
// MỞ RỘNG (khiếu nại 17-7: "đã giảm my-1 về 0, padding SVG 0.5px, xoá hẳn
// margin .katex-display... nhưng khoảng cách trên/dưới hình, BẢNG, $$...$$,
// list vẫn rất rộng, không đổi gì cả"): điều tra lại thì hàm này TRƯỚC ĐÂY
// CHỈ dọn dòng trống quanh ẢNH — bảng (\begin{array}/\tabular) và công thức
// display ($$...$$) hoàn toàn KHÔNG được dọn, nên \n\n còn sót lại quanh 2
// loại khối đó (rất hay gặp khi giáo viên copy nguyên khối từ file .tex gốc,
// có dòng trống bao quanh \begin{array}/$$ để dễ đọc mã nguồn) vẫn bị
// whitespace-pre-wrap vẽ thành khoảng trắng thật — same bug, khác đối
// tượng. Còn với LIST (\item/\begin{enumerate}/\begin{itemize}) — theo TODO
// đã ghi trong parser.ts (processEnumerate/xử lý itemize), các mục hiện bị
// "làm phẳng" thành text thường (nối bằng "\n• "/"\na) ") ngay lúc parse,
// KHÔNG có <li> riêng để mà set margin — nên vẫn dùng chung cơ chế "gộp mọi
// \n liên tiếp còn 1" bên dưới để ít nhất khoảng cách giữa các mục đều nhau,
// không phụ thuộc số dòng trống ngẫu nhiên còn sót trong nguồn (muốn set
// margin/my-... RIÊNG cho từng mục a)/b)/c) như hình/bảng thì cần đổi hẳn
// kiến trúc — bọc từng mục bằng <li> thật, xem TODO chi tiết ở parser.ts).
//
// Hàm này gọi ở ĐÚNG 1 điểm vào duy nhất của cả 2 luồng hiển thị (renderWithTikZ
// trong ExamBuilder.tsx — màn giáo viên, và renderExamText trong
// examRender.tsx — màn học sinh) để xử lý luôn cả dữ liệu ĐÃ LƯU SẴN trong
// DB (kể cả đề nhập từ TRƯỚC khi có bản vá này), không cần giáo viên
// nhập/import lại từng đề:
//   1) Bỏ hẳn các dòng chỉ chứa \begin{center}/\end{center} (kể cả có khoảng
//      trắng thừa quanh) — dấu vết bao ngoài hình không còn cần thiết vì ảnh
//      đã tự căn giữa (className "flex justify-center" ở TikzImage).
//   2) Gộp MỌI chuỗi dòng trống liên tiếp (2+ dấu \n, bất kể ở đâu trong
//      văn bản — không chỉ quanh ảnh như bản cũ) về ĐÚNG 1 lần xuống dòng.
//      Đây là bước quan trọng nhất: xử lý được HẾT mọi trường hợp (hình,
//      bảng, $$...$$, list) và cả dữ liệu cũ, không cần biết trước vị trí
//      khối nằm ở đâu.
//   3) Rồi xoá NỐT dấu \n đơn lẻ (chỉ còn 1, không phải 2+ nữa sau bước 2)
//      đứng NGAY SÁT trước/sau 1 "khối" (ảnh/TikZ, bảng \begin{array}/
//      \tabular, công thức display $$...$$) — vì khối luôn tự xuống dòng
//      riêng (div/table/.katex-display là phần tử block), nên dù chỉ 1 dấu
//      \n sát cạnh cũng đã "ăn gian" thêm 1 dòng trống nữa, chồng lên
//      margin của chính khối đó (giải thích y hệt ở bước 3C trong
//      parser.ts, áp dụng lại lúc RENDER để bắt cả dữ liệu cũ trong DB).
export function collapseBlankAroundImagePlaceholders(text: string): string {
  if (!text) return text;
  // "Khối" = nội dung tự hiển thị RIÊNG 1 dòng/1 phần tử block, không cần
  // \n đứng cạnh mới ngắt dòng được: ảnh/TikZ, bảng, công thức display.
  // Bảng cho phép có/không có dấu $ (hoặc $$) bao ngoài, vì đề nguồn hay
  // viết cả 2 kiểu "\begin{array}...\end{array}" trần lẫn
  // "$$\begin{array}...\end{array}$$".
  const BLOCK_RE_SRC =
    '\\[\\[HÌNH_(?:TIKZ|FILE)_\\d+\\]\\]' +
    '|\\${2}[\\s\\S]*?\\${2}' +
    '|\\$?\\\\begin\\{(?:array|tabular)\\}[\\s\\S]*?\\\\end\\{(?:array|tabular)\\}\\$?';

  let result = text
    // Xoá riêng các dòng chỉ có \begin{center} hoặc \end{center}.
    .replace(/^[ \t]*\\begin\{center\}[ \t]*\n?/gm, '')
    .replace(/^[ \t]*\\end\{center\}[ \t]*\n?/gm, '')
    // Gộp MỌI chuỗi 2+ dấu \n liên tiếp (ở BẤT KỲ đâu trong văn bản) về
    // đúng 1 lần xuống dòng — không còn giới hạn "chỉ quanh mốc ảnh" như
    // bản cũ, nên bắt được cả trường hợp bảng/$$.../list/dữ liệu cũ.
    .replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n');

  // Xoá nốt \n đơn lẻ (còn đúng 1, sau khi bước trên đã gộp hết 2+) đứng
  // sát ngay trước/sau 1 khối (ảnh/bảng/$$...$$) — khối tự ngắt dòng riêng
  // nên không cần giữ lại \n này nữa.
  result = result
    .replace(new RegExp(`[ \\t]*\\n[ \\t]*(?=${BLOCK_RE_SRC})`, 'g'), '')
    .replace(new RegExp(`(${BLOCK_RE_SRC})[ \\t]*\\n[ \\t]*`, 'g'), '$1');

  // SỬA LỖI (khiếu nại kèm ảnh: mục đầu tiên của danh sách "Trường hợp
  // 1/2/3..." KHÔNG đứng riêng dòng — dính liền ngay sau câu văn phía
  // trước nó, trong khi mục 2, 3... vẫn xuống dòng đúng): "• " (bullet +
  // 1 dấu cách) LUÔN LUÔN là dấu hiệu của MỘT MỤC DANH SÁCH — do
  // cleanTextFormatting (parser.ts) sinh ra duy nhất từ "\item" (thay
  // bằng "\n• "), không có nguồn nào khác tạo ra đúng chuỗi "• " này.
  // Đúng ra mọi "• " phải luôn có "\n" đứng ngay trước nó. Với dữ liệu
  // ĐÃ LƯU SẴN trong DB TRƯỚC bản vá 3C (chỗ phân biệt DISPLAY/INLINE
  // math khi xoá \n cạnh khối — xem parser.ts), có thể có "\n" của MỤC
  // ĐẦU TIÊN trong danh sách bị chính bản vá đó (hoặc 1 bước dọn \n thừa
  // nào khác chạy TRƯỚC khi bản vá 3C tồn tại) xoá nhầm mất — mục sau đó
  // (2, 3...) không bị ảnh hưởng vì \n của chúng nằm sau 1 đoạn văn bản/
  // công thức khác, không đứng sát cạnh "khối" nào bị xoá nhầm. Đây CHÍNH
  // LÀ hàm xử lý "phòng vệ" ở RENDER TIME dành riêng cho dữ liệu cũ này
  // (xem giải thích tổng quan phía trên hàm) nên sửa tại đây, không cần
  // migrate lại dữ liệu trong DB. Regex chỉ chèn "\n" khi "• " CHƯA có
  // "\n" ngay trước nó (an toàn, không lặp/không đụng các "• " vốn đã
  // đúng dòng — chiếm đa số).
  //
  // ĐỒNG BỘ với parser.ts (bước 3D, cùng sửa cùng lúc): mục itemize lồng
  // giờ được thụt lề bằng vài ký tự \u00A0 (non-breaking space, xem
  // bulletIndent() trong parser.ts) đứng ngay trước "• " — regex CŨ
  // "([^\n])• " coi \u00A0 đó cũng là "ký tự thường đứng trước bullet",
  // vô tình chèn \n xen GIỮA thụt lề và bullet (tách rời thụt lề thành 1
  // dòng trống phía trên, bullet lại tụt về sát lề trái phía dưới — sai
  // hoàn toàn, mất luôn thụt lề). Sửa: dùng negative lookbehind, coi "\n" +
  // thụt lề nbsp (0 hoặc nhiều \u00A0) đứng ngay trước là ĐÃ hợp lệ, chỉ
  // chèn \n khi lùi qua hết \u00A0 (nếu có) vẫn không gặp \n nào.
  result = result.replace(/(?<!\n\u00A0*)\u00A0*• /g, (m) => '\n' + m);

  return result;
}

// THÊM MỚI: gỡ đúng phần "\begin{array}{...}" hay "\begin{tabular}{...}" ở
// ĐẦU một khối bảng, đếm ĐỘ SÂU ngoặc nhọn thay vì dùng regex "{[^}]*}" đơn
// giản. LÝ DO: đặc tả cột (colspec) của gói LaTeX "array" có thể chứa NGOẶC
// NHỌN LỒNG bên trong, ví dụ ">{\arraybackslash}m{1.2cm}" hay
// ">{\centering\arraybackslash}p{2cm}" — colspec đầy đủ trông như
// "{|>{\arraybackslash}m{1.2cm}|c|c|}". Regex "{[^}]*}" dừng lại ngay ở dấu
// "}" đầu tiên gặp được (chính là dấu đóng của "{\arraybackslash}"), cắt cụt
// phần đặc tả cột còn lại ("m{1.2cm}|c|c|}") khiến nó RÒ RỈ ra ngoài thành
// chữ rác hiển thị ngay phía trên bảng. Quét thủ công đếm độ sâu "{"/"}" như
// dưới đây bắt đúng TOÀN BỘ colspec bất kể lồng bao nhiêu tầng.
export function stripLeadingTableEnv(text: string): string {
  const m = text.match(/^\s*\\begin\{(array|tabular)\}\s*\{/);
  if (!m) return text;
  let i = m[0].length;
  let depth = 1;
  while (depth > 0 && i < text.length) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  return text.slice(i);
}

// THÊM MỚI (khiếu nại: "thụt đầu dòng khi xuống dòng trong lời giải xấu quá,
// chỉnh lại tụt ngắn thôi"): đề gốc (.tex) hay dùng \quad hoặc nhiều dấu cách
// liền nhau ở ĐẦU DÒNG chỉ để căn cho ĐẸP MẮT khi đọc mã nguồn (ví dụ căn các
// bước biến đổi thẳng hàng dấu "="). Khung hiển thị web dùng
// "whitespace-pre-wrap" (giữ nguyên mọi khoảng trắng y hệt chuỗi gốc — xem
// giải thích ở collapseBlankAroundImagePlaceholders phía trên) nên bao nhiêu
// dấu cách/tab đó hiện ra thành NGẦN ẤY khoảng thụt thật trên màn hình — có
// dòng thụt tới vài chục ký tự, rất xấu. Hàm này gộp khoảng trắng/tab ở ĐẦU
// MỖI DÒNG về tối đa 2 dấu cách (thụt nhẹ, vẫn phân biệt được với dòng không
// thụt) — dòng nào vốn thụt ít (0-2 cách) thì giữ nguyên, chỉ "xén" bớt
// những dòng thụt quá đà. Gọi CHUNG 1 chỗ với collapseBlankAroundImagePlaceholders
// (renderExamText trong examRender.tsx — màn học sinh, và renderWithTikZ
// trong ExamBuilder.tsx — màn giáo viên) để áp dụng đều cho cả 2 bản hiển thị
// và cả dữ liệu cũ đã lưu sẵn trong DB.
export function capLeadingIndent(text: string): string {
  if (!text) return text;
  return text.replace(/^[ \t]+/gm, (match) => (match.length > 2 ? '  ' : match));
}

// ====================================================================
// CHUYỂN BẢNG (\begin{array}/\begin{tabular}...\hline...) SANG BẢNG WORD
// THẬT ====================================================================
// TÁCH TỪ examRender.tsx (eatSurroundingDollars/extractEnvBlocks/
// cleanTableCell/parseLatexStatTable) — đây đều là hàm THUẦN (không JSX,
// không hook), nhưng examRender.tsx có 'use client' ở đầu file nên KHÔNG
// gọi được từ code chạy trên server (xem giải thích ở extractAnswerDigits
// phía trên). examDocxExport.ts (chạy trên server, xuất file Word) cần dùng
// lại ĐÚNG logic dò/parse bảng này — nếu không, bảng bị bỏ mặc cho
// pandoc-wasm tự "đoán" bằng cách coi cả khối là công thức Toán
// ($$\begin{array}...\end{array}$$).
//
// SỰ CỐ THỰC TẾ (khiếu nại "bảng lỗi ra tex"): nhiều bảng biến thiên/xét dấu
// dùng \multicolumn để gộp ô đầu dòng — \multicolumn KHÔNG PHẢI cú pháp
// Toán hợp lệ, engine TeX-math của pandoc (texmath) không hiểu được, và
// pandoc chỉ coi đây là WARNING (không phải ERROR) nên buildExamDocx không
// chặn lại — kết quả: pandoc in LUÔN NGUYÊN VĂN chuỗi mã nguồn LaTeX ra file
// Word dưới dạng chữ thường, đúng hiện tượng "bảng thành tex" (đã tái hiện
// và xác nhận bằng thử nghiệm thủ công với pandoc-wasm).
//
// Giải pháp: tự dò bảng và dựng THÀNH BẢNG MARKDOWN (pipe table) — pandoc
// hiểu cú pháp này và dựng ra <w:tbl> (bảng Word thật, có viền, có ô), mỗi ô
// công thức con vẫn giữ nguyên $...$ để pandoc render đúng thành công thức
// Word (OMML) ngay trong ô — KHÔNG còn phụ thuộc vào việc texmath có hiểu
// trọn vẹn cú pháp bảng LaTeX (\hline, \multicolumn...) hay không nữa.

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

export function extractEnvBlocks(text: string) {
  const blocks: { start: number; end: number; text: string }[] = [];
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
      startRegex.lastIndex = blockStart + 1;
      continue;
    }
    const expanded = eatSurroundingDollars(text, blockStart, blockEnd);
    blocks.push({ start: expanded.start, end: expanded.end, text: text.slice(blockStart, blockEnd) });
    startRegex.lastIndex = blockEnd;
  }
  return blocks.filter((b) => b.text.includes('\\hline'));
}

export function cleanTableCell(raw: string): string {
  let s = sanitizeMathMacros(raw);
  s = (function stripNestedTableWrappers(input: string): string {
    let out = input;
    for (let guard = 0; guard < 50; guard++) {
      const m = out.match(/\\begin\{(array|tabular)\}\s*\{/);
      if (!m || m.index === undefined) break;
      const before = out.slice(0, m.index);
      const fromBegin = out.slice(m.index);
      const afterOpenTag = stripLeadingTableEnv(fromBegin);
      const consumedLen = fromBegin.length - afterOpenTag.length;
      if (consumedLen <= 0) break;
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
  // Xem giải thích đầy đủ ở bản ExamBuilder.tsx (đồng bộ hành vi cả 2 nơi).
  s = s.replace(/\\cline\{[^{}]*\}/g, '');
  s = s.replace(/\\multirow\{[^{}]*\}\{[^{}]*\}\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
  s = s.replace(/\\rowcolor(?:\[[^\]]*\])?\{[^}]*\}/g, '');
  s = s.replace(/\\cellcolor(?:\[[^\]]*\])?\{[^}]*\}/g, '');
  s = s.replace(/\\columncolor(?:\[[^\]]*\])?\{[^}]*\}/g, '');
  s = s.replace(/\\renewcommand\s*(?:\{\\[a-zA-Z]+\}|\\[a-zA-Z]+)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '');
  s = s.replace(/\\break\b/g, ' ');
  s = s.replace(/\\allowdisplaybreaks\b/g, '');
  s = s.replace(/\\noindent\b/g, '');
  s = s.replace(/\\\\/g, ' ');
  s = s.trim();
  if (/^\{[\s\S]*\}$/.test(s)) s = s.slice(1, -1).trim();
  s = s.replace(/\s+/g, ' ').trim();
  if (s && !/^\$[\s\S]*\$$/.test(s) && /\\[a-zA-Z]+|\^|_|\{|\}/.test(s)) {
    s = `$${s}$`;
  }
  return s;
}

// BUG ĐÃ SỬA: hàm cũ chỉ tách hàng theo `\hline`. Nhưng LaTeX thật sự dùng
// `\\` (xuống dòng) để kết thúc MỖI hàng — `\hline` chỉ là đường kẻ ngang,
// KHÔNG bắt buộc xuất hiện giữa mọi hàng (ví dụ bảng chỉ kẻ viền ngoài +
// dưới header, các hàng dữ liệu ở giữa chỉ cách nhau bằng `\\`). Khi đó
// nhiều hàng bị dính làm một chuỗi -> split theo `&` sinh lệch cột, chữ
// dính vào nhau (ví dụ `n1{[a2;a3)}`, `n2...`). Sửa: tách theo CẢ HAI dấu
// hiệu (`\hline` và `\\`), đồng thời chỉ tách ở cấp ngoài cùng (depth 0) để
// không tách nhầm nếu một ô lỡ chứa `{...}` có `\\` bên trong.
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

export function parseLatexStatTable(block: string): { text: string; colSpan: number }[][] {
  const inner = stripLeadingTableEnv(block)
    .replace(/\\end\{(?:array|tabular)\}\s*$/, '');

  const rows = splitTopLevel(inner, '\\hline')
    .flatMap((segment) => splitTopLevel(segment, '\\\\'))
    .map((r) => r.trim())
    .filter(Boolean);

  return rows
    .map((row) => {
      const rawCells = row.split('&');
      // BUG ĐÃ SỬA: trước đây lọc bỏ MỌI ô rỗng (`.filter((c) => c.text !== '')`)
      // ngay sau khi map — nhưng ô rỗng có ý nghĩa VỊ TRÍ (ví dụ hàng cuối
      // `& & n=n_1+...+n_m` cố ý để trống 2 ô đầu, nội dung nằm ở cột 3). Lọc
      // theo kiểu đó xóa mất 2 ô trống, khiến ô có nội dung bị đẩy lùi về
      // cột 1. Sửa: GIỮ nguyên ô rỗng để bảo toàn vị trí cột, chỉ bỏ hẳn
      // HÀNG nào toàn bộ các ô đều rỗng (ví dụ hàng trắng phát sinh do dấu
      // `\\` thừa cuối bảng).
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

// Dựng bảng Markdown kiểu "pipe table" (pandoc hiểu, dựng ra <w:tbl> — bảng
// Word THẬT có viền, không phải công thức Toán trá hình) từ danh sách hàng/ô
// đã bóc tách ở parseLatexStatTable. \multicolumn không có khái niệm "gộp
// ô" tương đương trong pipe table markdown, nên GIÃN ô gộp thành nhiều ô
// liền kề — ô đầu giữ nội dung, các ô còn lại để trống — vẫn đọc được đầy
// đủ nội dung, chỉ mất phần viền gộp trực quan (chấp nhận được, còn hơn hẳn
// hiện nguyên mã LaTeX thô).
export function buildPipeTableMarkdown(rows: { text: string; colSpan: number }[][]): string {
  if (!rows.length) return '';
  const expandedRows = rows.map((row) => {
    const out: string[] = [];
    row.forEach((cell) => {
      const span = Math.max(1, cell.colSpan || 1);
      out.push(cell.text || '');
      for (let k = 1; k < span; k++) out.push('');
    });
    return out;
  });
  const colCount = Math.max(...expandedRows.map((r) => r.length));
  const escapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
  const padRow = (r: string[]) => {
    const padded = r.slice(0, colCount);
    while (padded.length < colCount) padded.push('');
    return padded;
  };
  const lines: string[] = [];
  lines.push(`| ${padRow(expandedRows[0]).map(escapeCell).join(' | ')} |`);
  lines.push(`| ${Array(colCount).fill('---').join(' | ')} |`);
  for (let i = 1; i < expandedRows.length; i++) {
    lines.push(`| ${padRow(expandedRows[i]).map(escapeCell).join(' | ')} |`);
  }
  return `\n\n${lines.join('\n')}\n\n`;
}

// Dò TOÀN BỘ khối bảng \begin{array}/\begin{tabular}...\hline... trong
// `text` (kể cả $$...$$ bao quanh, xem extractEnvBlocks) và thay bằng bảng
// Markdown thật (buildPipeTableMarkdown) — dùng cho xuất Word, nơi KHÔNG có
// cách "dựng bảng HTML tay" như trang web (LatexStatTable trong
// examRender.tsx), phải nhờ chính pandoc dựng bảng qua cú pháp Markdown.
export function convertLatexTablesToMarkdown(text: string): string {
  if (!text) return text;
  const blocks = extractEnvBlocks(text);
  if (blocks.length === 0) return text;
  let out = '';
  let lastEnd = 0;
  for (const b of blocks) {
    out += text.slice(lastEnd, b.start);
    const rows = parseLatexStatTable(b.text);
    out += rows.length ? buildPipeTableMarkdown(rows) : text.slice(b.start, b.end);
    lastEnd = b.end;
  }
  out += text.slice(lastEnd);
  return out;
}
