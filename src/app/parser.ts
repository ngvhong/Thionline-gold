// src/app/parser.ts

import { sanitizeMathMacros } from '@/lib/textUtils';

export interface QuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface ParsedQuestion {
  id: string;
  code: string;
  content: string;
  options: QuestionOption[];
  solution: string;
  // THÊM MỚI: đáp số riêng của câu "Trả lời ngắn" (\shortans{...}), tách khỏi
  // solution để giao diện hiển thị thành ô vuông riêng (4 ô liền kề) ở góc
  // dưới trái của đề, thay vì gộp chung vào cuối lời giải như trước.
  answer?: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
  // Nhãn hiển thị: môi trường \begin{ex} -> "Câu", môi trường \begin{bt} -> "Bài"
  label: 'Câu' | 'Bài';
}

export function parseLatexToJSON(texString: string) {
  // CHUẨN HOÁ XUỐNG DÒNG: file .tex gốc có thể dùng CRLF (\r\n) hoặc lẫn cả
  // \r trơ trọi. Mọi bước xử lý xuống dòng/dòng trống phía dưới (cleanTextFormatting,
  // xoá \n sát [[HÌNH_TIKZ_n]], v.v.) chỉ nhận diện \n — nếu để nguyên \r sẽ
  // lọt qua các regex đó và khi hiển thị bằng whitespace-pre-wrap, mỗi \r sót
  // lại vẫn bị trình duyệt vẽ thành một dòng trống riêng, sinh khoảng trắng
  // thừa (đặc biệt rõ ngay sát hình vẽ TikZ). Chuẩn hoá NGAY ĐẦU HÀM, trước
  // mọi bước xử lý khác, để áp dụng nhất quán cho toàn bộ văn bản.
  texString = texString.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // SỬA LỖI TIKZ-TRONG-TIKZ: trước đây dùng regex non-greedy
  // /\begin{tikzpicture}[\s\S]*?\end{tikzpicture}/, nên khi có một
  // \begin{tikzpicture}...\end{tikzpicture} LỒNG bên trong khối ngoài (ví dụ
  // vẽ hình phụ trong node), regex dừng lại ở \end{tikzpicture} ĐẦU TIÊN gặp
  // được — chính là end của khối lồng bên trong — cắt cụt khối ngoài, để lại
  // phần đuôi (vd "};" và "\end{tikzpicture}" còn lại) rớt ra thành text thô.
  // BÂY GIỜ: dùng extractTikzBlocks đếm ĐỘ SÂU begin/end như
  // extractBraceGroupFrom đã làm với dấu {}, đảm bảo bắt đúng cặp ngoài cùng.
  const { cleanText: tikzExtractedText, tikzBlocks } = extractTikzBlocks(texString);
  let cleanText = tikzExtractedText;

  // XOÁ MỌI DÒNG CHÚ THÍCH LATEX "%..." (comment) TRÊN TOÀN VĂN BẢN, không chỉ
  // ở đầu mỗi câu hỏi như logic commentLines cũ (logic đó chỉ chạy cho phần
  // NGAY SAU \begin{ex}/\begin{bt} để rút mã câu). Các dòng comment kiểu
  // "%     \renewcommand{\arraystretch}{1.2}" nằm GIỮA lời giải (ví dụ ngay
  // trước một bảng thống kê) trước đây lọt qua mọi bước lọc và bị in thô ra
  // ngoài (thấy rõ trong ảnh chụp màn hình: dòng xanh "% \renewcommand{...}").
  // Coi MỌI DÒNG mà ký tự "%" đầu tiên không đứng ngay sau một dấu "\" (tức
  // không phải "\%" ký hiệu phần trăm thật) là một dòng comment: cắt bỏ từ "%"
  // đó đến hết dòng.
  // SỬA LỖI (khiếu nại: "\% bị biến mất khi render, ví dụ $24 \%$ ra thành
  // 24"): quy tắc "bs % 2 === 0 -> là comment" CHỈ đúng khi "%" đứng NGOÀI
  // công thức toán. Nếu tác giả gõ "%" phần trăm ngay TRONG cặp $...$/
  // $$...$$ mà QUÊN gõ "\" phía trước (rất hay gặp — nhiều GV không biết "%"
  // là ký tự đặc biệt của LaTeX), bs = 0 (chẵn) khiến toàn bộ phần còn lại
  // của dòng (kể cả dấu "$" đóng công thức) bị cắt mất -> công thức không
  // đóng lại được, "%" biến mất, thường kéo theo cả nội dung phía sau trong
  // cùng dòng cũng mất theo. Trong LaTeX thật, "%" đứng giữa công thức toán
  // dở dang không có cách hiểu hợp lý nào khác ngoài ký hiệu phần trăm (một
  // comment thật sự sẽ làm hỏng cú pháp công thức ngay khi biên dịch), nên
  // AN TOÀN để không bao giờ cắt "%" khi đang ở trong 1 cặp $ chưa đóng trên
  // dòng đó — bất kể có dấu "\" phía trước hay không.
  // Theo dõi trạng thái "đang trong công thức" bằng cách đảo cờ inMath mỗi
  // khi gặp 1 dấu "$" không bị escape ("\$" là dấu đô-la thật, không tính);
  // "$$" (2 dấu liền nhau) được gộp coi là MỘT lần đảo, giống "$" đơn.
  cleanText = cleanText
    .split('\n')
    .map((line) => {
      let cutAt = -1;
      let inMath = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '$') {
          let bsDollar = 0;
          let k = i - 1;
          while (k >= 0 && line[k] === '\\') { bsDollar++; k--; }
          if (bsDollar % 2 === 1) continue; // "\$" thật -> không phải delimiter
          if (line[i + 1] === '$') i++; // "$$" -> gộp coi là 1 lần đảo
          inMath = !inMath;
          continue;
        }
        if (ch !== '%') continue;
        if (inMath) continue; // "%" trong công thức dở dang -> luôn là phần trăm thật
        let bs = 0;
        let j = i - 1;
        while (j >= 0 && line[j] === '\\') { bs++; j--; }
        if (bs % 2 === 0) { cutAt = i; break; }
      }
      return cutAt === -1 ? line : line.slice(0, cutAt);
    })
    .join('\n');

  // THÊM MỚI: bóc tách \includegraphics{...} còn sót lại NGOÀI tikz.
  // Vì khối \begin{tikzpicture}...\end{tikzpicture} đã bị lấy ra khỏi
  // cleanText hoàn toàn ở bước trên (kể cả \includegraphics nằm bên TRONG nó
  // — cái đó vẫn còn nguyên trong tikzBlocks[i].code, gửi HF như cũ, KHÔNG
  // đụng vào), nên MỌI \includegraphics còn lại trong cleanText tại đây chắc
  // chắn đứng NGOÀI mọi khối tikz. Thay bằng mốc [[HÌNH_FILE_n]], lưu lại
  // đường dẫn gốc ghi trong lệnh (path) để phía giao diện tự khớp với file
  // ảnh người dùng chọn từ thư mục ảnh cùng cấp.
  // Hỗ trợ cả dạng có tham số tuỳ chọn \includegraphics[width=...]{path}.
  const imageBlocks: { id: string; path: string }[] = [];
  cleanText = cleanText.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)\}/g, (_match, path: string) => {
    const id = `[[HÌNH_FILE_${imageBlocks.length + 1}]]`;
    imageBlocks.push({ id, path: path.trim() });
    return id;
  });

  // TRƯỚC ĐÂY: tách văn bản thành 3 phần theo vị trí (\caulc/\cauds/\caukq)
  // rồi GÁN CỨNG loại câu hỏi theo phần đó. Vấn đề: nhiều câu KHÔNG hề chứa
  // \choice / \choiceTF / \shortans (thực chất là câu TỰ LUẬN) vẫn bị ép vào
  // một trong 3 loại chỉ vì vị trí của nó trong file, khiến bóc tách sai.
  //
  // BÂY GIỜ: gom TẤT CẢ khối \begin{ex}...\end{ex} trong toàn bộ tài liệu,
  // rồi xác định loại câu hỏi dựa vào DẤU HIỆU THỰC SỰ có trong chính khối đó:
  //   - có \choiceTF  -> Đúng/Sai
  //   - có \choice    -> Trắc nghiệm
  //   - có \shortans  -> Trả lời ngắn
  //   - không có gì trong 3 dấu hiệu trên -> Tự luận
  const allQuestions = parseAllQuestions(cleanText);

  const questionsPart1 = allQuestions.filter(q => q.type === 'multiple_choice');
  const questionsPart2 = allQuestions.filter(q => q.type === 'true_false');
  const questionsPart3 = allQuestions.filter(q => q.type === 'short_answer');
  const questionsPart4 = allQuestions.filter(q => q.type === 'essay');

  return {
    thong_ke: {
      so_luong_tikz: tikzBlocks.length,
      so_luong_anh: imageBlocks.length,
      so_cau_phan_1: questionsPart1.length,
      so_cau_phan_2: questionsPart2.length,
      so_cau_phan_3: questionsPart3.length,
      so_cau_phan_4: questionsPart4.length,
    },
    tikz_list: tikzBlocks,
    image_list: imageBlocks,
    phan_1_TracNghiem: questionsPart1,
    phan_2_DungSai: questionsPart2,
    phan_3_TraLoiNgan: questionsPart3,
    phan_4_TuLuan: questionsPart4,
  };
}

// Đáp số Phần III (\shortans{...}) thường vẫn còn nguyên cú pháp LaTeX bao
// quanh, ví dụ "$0{,}5$" (viết vậy để KaTeX không hiểu nhầm dấu phẩy) hay
// "$-3$" — nếu giữ nguyên để hiển thị từng ký tự vào 4 ô vuông đáp số sẽ lẫn
// cả "$", "{", "}" rác. Hàm này CHỈ giữ lại chữ số 0-9, dấu "-", "+" và dấu
// phẩy thập phân ",", bỏ mọi ký tự LaTeX bao quanh khác (ví dụ
// "$0{,}5$" -> "0,5", "$-3$" -> "-3").
function extractAnswerDigits(text: string): string {
  if (!text) return '';
  return text.replace(/[^0-9+\-,]/g, '');
}

// THÊM MỚI: một số đề gốc dùng "\SA{...}" thay vì "\shortans{...}" (cùng một ý
// nghĩa — đáp số câu trả lời ngắn — chỉ là bí danh viết tắt). TRƯỚC ĐÂY parser
// chỉ tìm cứng chuỗi "\shortans" nên các câu dùng "\SA{...}" bị lọt qua, không
// được nhận diện là "Trả lời ngắn" và cũng không tách được đáp số ra khỏi đề
// bài. Hàm này tìm lệnh đầu tiên trong 2 dạng ("\shortans" hoặc "\SA"), dùng
// \b để không bắt nhầm vào giữa một từ khác (vd không khớp phần đầu của một
// lệnh dài hơn tình cờ bắt đầu bằng "SA"). Trả về vị trí bắt đầu và ĐỘ DÀI
// đúng của tên lệnh đã khớp (7 cho "shortans", 2 cho "SA") để nơi gọi tự cộng
// vào để tìm dấu "{" mở nhóm tham số ngay sau đó — 2 lệnh không cùng độ dài
// nên không thể dùng độ dài cố định như cũ ('\\shortans'.length).
function findShortAnsCommand(text: string): { index: number; length: number } | null {
  const re = /\\(shortans|SA)\b/;
  const m = re.exec(text);
  if (!m) return null;
  return { index: m.index, length: m[0].length };
}

function cleanTextFormatting(text: string): string {
  if (!text) return text;
  let result = text;

  // -1. Sửa các macro LaTeX mà KaTeX KHÔNG hỗ trợ nhưng đề gốc hay dùng, vd
  // \wideparen{AmB} (ký hiệu cung tròn hình học) -> \overgroup{AmB} (KaTeX
  // CÓ hỗ trợ, cùng hình dạng vòng cung). Xem giải thích chi tiết tại
  // sanitizeMathMacros trong lib/textUtils.ts. Làm NGAY từ đầu ở bước nhập
  // đề để nội dung lưu vào DB đã sạch sẵn, không phải chờ vá lại lúc render.
  result = sanitizeMathMacros(result);

  // 0. XỬ LÝ DANH SÁCH TRẮC NGHIỆM CON (itemchoice/itemch) -> a) b) c) d)
  result = processItemChoice(result);

  // 0-bis. \immini{noiDung}{hinhVe} có thể xuất hiện CẢ trong nội dung đề bài
  // LẪN trong lời giải (\loigiai). TRƯỚC ĐÂY hàm resolveImmini chỉ được gọi
  // thủ công trên phần nội dung câu hỏi (cleanBody), nên \immini còn sót lại
  // trong lời giải bị in thô ra ngoài. Gọi NGAY TẠI ĐÂY để áp dụng đồng nhất
  // cho mọi văn bản đi qua cleanTextFormatting (nội dung, đáp án, lời giải).
  result = resolveImmini(result);

  // 0-bis-2. \begin{minipage}...\end{minipage} (cú pháp LaTeX gốc để đặt các
  // khối cạnh nhau, thường đi theo CẶP 2 khối cho layout "2 cột") cũng có thể
  // xuất hiện cả trong đề bài lẫn lời giải -> bóc vỏ ngay tại đây, cùng chỗ và
  // cùng lý do với resolveImmini ở trên.
  result = resolveMinipage(result);

  // 0-ter2. \begin{enumEX}{2}...\end{enumEX} là môi trường liệt kê TÙY BIẾN
  // (tham số {2} là số thứ tự bắt đầu, chỉ có ý nghĩa khi in PDF) — hay gặp ở
  // đề gốc nhưng KaTeX/trình duyệt không hiểu gì cả, in thô "\begin{enumEX}{2}"
  // ra ngoài. Đổi thẳng thành \begin{enumerate}/\end{enumerate} CHUẨN (bỏ luôn
  // tham số số thứ tự {2}, vì processEnumerate bên dưới tự đánh nhãn a) b) c)...
  // theo thứ tự \item, không hỗ trợ số bắt đầu tùy chỉnh) để dùng lại đúng
  // logic xử lý enumerate đã có, không cần viết thêm hàm riêng.
  result = result
    .replace(/\\begin\{enumEX\}(\{[^}]*\})?/g, '\\begin{enumerate}')
    .replace(/\\end\{enumEX\}/g, '\\end{enumerate}');

  // \begin{listEX}{...}...\end{listEX} là MỘT BIẾN THỂ KHÁC của môi trường
  // liệt kê tuỳ biến, hoàn toàn tương tự enumEX ở trên (chỉ khác tên), cũng
  // chỉ có ý nghĩa khi in PDF (tham số {...} là số thứ tự bắt đầu) và KaTeX/
  // trình duyệt không hiểu -> in thô "\begin{listEX}{...}" ra ngoài nếu không
  // xử lý. Quy về enumerate chuẩn giống hệt cách làm với enumEX.
  result = result
    .replace(/\\begin\{listEX\}(\{[^}]*\})?/g, '\\begin{enumerate}')
    .replace(/\\end\{listEX\}/g, '\\end{enumerate}');

  // 0-ter. Danh sách \begin{enumerate}...\end{enumerate} MẶC ĐỊNH (không phải
  // itemchoice) -> gán nhãn a) b) c) d)... giống itemchoice, áp dụng cho cả
  // nội dung đề bài LẪN lời giải. Phải xử lý TRƯỚC bước thay \item -> "• " ở
  // dưới, nếu không toàn bộ \item bên trong sẽ biến thành bullet trần.
  result = processLists(result);

  // \vv{XY} là macro tùy biến rất hay gặp trong đề gốc (định nghĩa quen thuộc
  // \newcommand{\vv}[1]{\overrightarrow{#1}} để gõ vectơ cho nhanh), nhưng
  // KaTeX hoàn toàn không biết lệnh \vv -> luôn in thô "\vv{...}" ra ngoài.
  // Đổi thẳng sang \overrightarrow chuẩn của KaTeX, làm NGAY từ đầu để áp dụng
  // nhất quán dù \vv nằm trong hay ngoài cặp $ có sẵn của tác giả.
  //
  // \vec{...} thì KaTeX HIỂU sẵn (không báo lỗi) nhưng mặc định vẽ mũi tên
  // NGẮN, chỉ đủ dài cho 1 ký tự đơn (\vec{a}) — với vectơ 2 điểm như
  // \vec{AB} thì mũi tên ngắn trông rất xấu, không phủ hết bề rộng chữ.
  // Yêu cầu: mọi vectơ (kể cả gõ bằng \vec) đều hiển thị mũi tên DÀI như
  // \overrightarrow, nên gộp chung với \vv ở đây, đổi luôn \vec -> \overrightarrow.
  result = result.replace(/\\(?:vv|vec)(\{[^}]*\})/g, '\\overrightarrow$1');

  // BẢO VỆ \heva{...}/\hoac{...} KHỎI CÁC BƯỚC TÁCH HÀNG/CỘT PHÍA DƯỚI
  // (khiếu nại: "hệ phương trình \heva bị vỡ/lệch cột khi nằm trong
  // eqnarray*"). Các bước xử lý eqnarray*/align*/array bên dưới
  // (normalizeArrayRows, collapseDoubleAmpAroundRelation, fixMissingRowBreaks)
  // đếm số "&"/"\\" bằng regex TRÊN VĂN BẢN THÔ, KHÔNG biết độ sâu ngoặc
  // "{ }". Khi \heva{...}/\hoac{...} (macro hệ pt/tuyển pt riêng của app,
  // được mở rộng RIÊNG ở bước xa hơn phía dưới — xem parseCustomGomCumLệnh)
  // nằm LỒNG bên trong eqnarray*/align*, các dấu "\\" và "&" thuộc về NỘI
  // DUNG BÊN TRONG \heva/\hoac (tách các phương trình con của hệ) bị hiểu
  // nhầm thành hàng/cột của eqnarray*/align* NGOÀI — ví dụ hàng đầu của hệ
  // chỉ có 1 dấu "&" nhưng bị eqnarray* ngoài tính là dòng "thiếu cột" so
  // với dòng có "\heva{" (dính thêm & của khung ngoài) rồi TỰ CHÈN "&" thừa
  // vào GIỮA nội dung hệ phương trình con -> KaTeX dựng lệch cột, hệ dài bị
  // vỡ/cụt khi hiển thị (đặc biệt rõ trên màn hình hẹp).
  // Cách sửa: bóc \heva{...}/\hoac{...} ra một placeholder TRƠN, không chứa
  // "&"/"\\"/"{"/"}" NGAY TỪ ĐẦU (trước mọi bước đếm hàng/cột bên dưới), rồi
  // khôi phục lại macro gốc NGAY TRƯỚC bước mở rộng \heva/\hoac thật sự (xem
  // chú thích "BẢO VỆ ... KHÔI PHỤC" ở gần lệnh gọi parseCustomGomCumLệnh
  // phía dưới) — nhờ vậy các bước đếm hàng/cột chỉ thấy 1 khối "trơn" duy
  // nhất cho mỗi \heva/\hoac, không còn đếm nhầm nội dung bên trong.
  // Dùng LẠI extractBraceGroupFrom (hàm ở cuối file, đã xử lý ĐÚNG ngoặc
  // escape "\{"/"\}" và trường hợp riêng "\\}" — xem chú thích trong chính
  // hàm đó) thay vì tự đếm độ sâu ngoặc thủ công ở đây, để đảm bảo cặp "{}"
  // được bảo vệ ở bước này LUÔN khớp CHÍNH XÁC với cặp "{}" mà bước mở rộng
  // \heva/\hoac thật sự phía dưới (parseCustomGomCumLệnh, cũng dùng hàm này)
  // sẽ nhận diện — tránh hai bước "hiểu" ranh giới macro khác nhau.
  const hevaHoacProtected: string[] = [];
  const protectHevaHoac = (text: string, macroName: string): string => {
    let out = '';
    let searchFrom = 0;
    let idx = text.indexOf(macroName, searchFrom);
    while (idx !== -1) {
      const braceResult = extractBraceGroupFrom(text, idx + macroName.length);
      if (!braceResult) {
        // Không tìm được "{" cân bằng theo sau -> không đụng vào, để bước
        // mở rộng \heva/\hoac thật sự phía dưới tự xử lý như trước đây.
        out += text.slice(searchFrom, idx + macroName.length);
        searchFrom = idx + macroName.length;
        idx = text.indexOf(macroName, searchFrom);
        continue;
      }
      const full = text.slice(idx, braceResult.endIndex);
      const token = `@@HEVAHOAC_${hevaHoacProtected.length}@@`;
      hevaHoacProtected.push(full);
      out += text.slice(searchFrom, idx) + token;
      searchFrom = braceResult.endIndex;
      idx = text.indexOf(macroName, searchFrom);
    }
    out += text.slice(searchFrom);
    return out;
  };
  result = protectHevaHoac(result, '\\heva');
  result = protectHevaHoac(result, '\\hoac');

  // Tự vá lỗi thiếu dấu "\\" xuống dòng giữa các hàng trong aligned/array —
  // lỗi hay gặp ở nguồn đề: một dòng mới bắt đầu bằng "&" nhưng dòng trước
  // không kết thúc bằng "\\", khiến KaTeX không parse được cả khối.
  //
  // NGOẠI LỆ QUAN TRỌNG (khiếu nại: "câu d) hệ eqnarray* 3 cột kiểu 'vế trái
  // & quan hệ & vế phải' bị tách sai hàng, lệch cột so với ý đồ tác giả"):
  // GV Toán VN hay gõ kiểu 3 cột chuẩn eqnarray* mà HÀNG ĐẦU TIÊN viết liền
  // "vế_trái &<quan_hệ>& vế_phải" nhưng XUỐNG DÒNG VẬT LÝ trong file .tex
  // ngay SAU vế trái (chỉ để dễ đọc, không phải lỗi thiếu "\\"), ví dụ:
  //   vế_trái
  //   &\Leftrightarrow &
  //   vế_phải \\
  // Nếu cứ chèn "\\" giả ngay sau "vế_trái" (như quy tắc gốc phía trên vẫn
  // làm), hàng này bị xé làm đôi: "vế_trái" rơi vào MỘT hàng riêng, còn
  // "&\Leftrightarrow & vế_phải" bị đẩy sang hàng kế tiếp -> toàn bộ khối bị
  // lệch cột so với các hàng còn lại (vốn đúng 2 cột "nhãn &<quan_hệ> nội
  // dung"). Dấu hiệu nhận biết cụm "&<quan_hệ>&" hợp lệ này: NGAY SAU dấu
  // "&" đầu (cái mà quy tắc gốc định chèn "\\" trước nó), chỉ có MỘT toán tử
  // quan hệ trần trụi rồi tới một dấu "&" KHÁC ngay sau — giống hệt điều
  // kiện mà collapseDoubleAmpAroundRelation (hàm ngay bên dưới) dùng để gộp
  // "&<quan_hệ>&" thành "&<quan_hệ>". Dùng CHUNG danh sách toán tử quan hệ
  // với hàm đó để đảm bảo hai bước luôn "hiểu" cụm 3 cột giống nhau.
  // Chỉ loại trừ ĐÚNG trường hợp hẹp này (lookahead, không tiêu thụ ký tự)
  // -> mọi trường hợp "thiếu \\ thật sự" khác (không có cụm &<quan_hệ>& theo
  // sau) vẫn được vá như cũ, không ảnh hưởng gì tới các đề đang hiển thị đúng.
  const RELATION_OPERATORS_ALT =
    '=|\\\\Leftrightarrow|\\\\Rightarrow|\\\\Leftarrow|\\\\le|\\\\ge|\\\\leq|\\\\geq|\\\\neq|\\\\approx|\\\\equiv|<|>';
  const fixMissingRowBreaks = (body: string) =>
    body.replace(
      new RegExp(
        `(?<!\\\\\\\\)(?<!\\\\\\\\\\s)\\n(\\s*&)(?!\\s*(?:${RELATION_OPERATORS_ALT})\\s*&)`,
        'g'
      ),
      '\\\\\n$1'
    );

  // Tác giả rất hay gõ dư một dấu "\\" (xuống dòng) NGAY TRƯỚC dấu đóng "}"
  // hoặc \end{...} (ví dụ "...B'D'\\}" hay "...B'D'\\\end{aligned}"), tạo ra
  // một HÀNG TRẮNG cuối cùng không có nội dung gì. react-latex-next/KaTeX
  // không chấp nhận hàng trắng cuối này -> báo lỗi cú pháp và rơi về hiển thị
  // chữ thô cho CẢ khối toán. Cắt bỏ mọi dấu "\\" thừa ở cuối trước khi đóng
  // môi trường aligned/array để tránh lỗi này.
  const stripTrailingRowBreak = (body: string) =>
    body.replace(/(?:\\\\\s*)+$/, '');

  // SỬA LỖI (khiếu nại: "khoảng trống xấu giữa dấu = và biểu thức ở công
  // thức nhiều dòng, dòng nào biểu thức ngắn hơn dòng dài nhất thì bị hở"):
  // GV Toán VN có thói quen gõ eqnarray*/align*/aligned kiểu 3 cột —
  // "nhãn & = & biểu thức" (2 dấu "&", tách RIÊNG dấu quan hệ ra làm 1 cột)
  // — thay vì đúng chuẩn 2 cột "nhãn &= biểu thức" (1 dấu "&", dấu quan hệ
  // dính liền đầu ô thứ hai). Với cấu trúc 3 cột, cột chứa biểu thức (cột
  // cuối) bị canh giữa/phải theo BỀ RỘNG CỦA DÒNG DÀI NHẤT trong khối —
  // dòng nào biểu thức ngắn hơn thì bị đẩy lệch, để hở khoảng trắng ngay
  // sau dấu quan hệ. Gộp "&<quan_hệ>&" thành "&<quan_hệ>" NGAY TRÊN VĂN BẢN
  // GỐC, trước khi đóng gói vào bất kỳ môi trường nào (eqnarray*, align*,
  // aligned...) — dùng CHUNG 1 hàm ở đây để không phải vá riêng từng loại
  // môi trường, và tự động phòng luôn cho các môi trường thêm sau này.
  // Regex chỉ khớp khi Ô GIỮA HAI DẤU "&" CHỈ CHỨA ĐÚNG 1 TOÁN TỬ QUAN HỆ
  // TRẦN TRỤI (không có gì khác) — nên an toàn, không đụng tới bảng dữ liệu
  // thật (LatexStatTable, ma trận...) vì ở đó ô giữa hai dấu "&" luôn có
  // nội dung số/chữ thật, không rơi vào pattern này.
  // QUAN TRỌNG: PHẢI có dấu cách sau "$1" trong chuỗi thay thế. Nguồn đề
  // thường gõ SÁT liền, không có khoảng trắng, giữa dấu "&" thứ hai và biểu
  // thức theo sau, ví dụ "&\Leftrightarrow&x^2+y^2=...". Nếu chỉ ghép thành
  // "&$1" (bỏ hẳn dấu "&" ngăn cách) thì kết quả sẽ là "&\Leftrightarrowx^2..."
  // — tên lệnh LaTeX đọc tham lam mọi chữ cái liền sau nó, nên "\Leftrightarrow"
  // và "x" dính thành MỘT lệnh không tồn tại "\Leftrightarrowx" -> KaTeX lỗi
  // cú pháp -> CẢ khối array rơi về hiển thị chữ thô. Thêm một dấu cách sau
  // "$1" để luôn có ký tự phân tách tên lệnh, bất kể nguồn có gõ cách hay
  // không. An toàn tuyệt đối: trong chế độ toán, KaTeX/LaTeX bỏ qua khoảng
  // trắng thừa nên không hề ảnh hưởng tới layout hiển thị.
  const collapseDoubleAmpAroundRelation = (body: string) =>
    body.replace(
      new RegExp(`&\\s*(${RELATION_OPERATORS_ALT})\\s*&`, 'g'),
      '&$1 '
    );

  // NGUY HIỂM ĐÃ PHÁT HIỆN với collapseDoubleAmpAroundRelation ở trên: hàm đó
  // gộp MỌI cặp "&<quan_hệ>&" liền kề, kể cả khi một dòng có BẤT ĐẲNG THỨC
  // KÉP kiểu "a & < & x & < & b" (2 dấu quan hệ, 4 dấu "&") — dòng này sau khi
  // gộp còn LẠI 3 ô ("a", "< x", "< b") thay vì 2 ô như dòng "nhãn &= biểu
  // thức" thông thường. Nếu cứ đóng cứng cột "rl" (2 cột) như trước, dòng bất
  // đẳng thức kép sẽ bị THIẾU CỘT trong khai báo array -> KaTeX bỏ qua định
  // dạng canh lề cho (các) cột dư, làm dòng đó lệch hẳn so với các dòng khác
  // trong cùng khối. Ngoài ra các dòng trong CÙNG một khối eqnarray* có thể
  // có SỐ Ô KHÁC NHAU (dòng thường 2 ô, dòng bất đẳng thức kép 3+ ô).
  // GIẢI PHÁP: không đóng cứng số cột nữa — quét toàn bộ các dòng trong khối
  // (tách theo dấu xuống dòng "\\" ở mức ngoài cùng, rồi tách mỗi dòng theo
  // "&"), tìm số ô LỚN NHẤT trong cả khối, rồi build spec động: cột đầu
  // "r" (căn phải, thường chứa nhãn/vế trái), các cột còn lại "l" (căn trái,
  // mỗi cột là "<quan_hệ> biểu thức") — đủ cho cả dòng thường (2 ô: "rl") lẫn
  // dòng bất đẳng thức kép (3+ ô: "rll", "rlll"...).
  //
  // LỖI ĐÃ PHÁT HIỆN (khiếu nại: "sao array dòng đầu nằm lệch vị trí, không
  // giống hàng"): trước đây, dòng nào có ÍT Ô HƠN số cột tối đa thì chỉ đơn
  // giản để TRỐNG (các) cột dư Ở CUỐI, mà KHÔNG chèn ô trống vào GIỮA. Ví dụ
  // dòng đầu "&&BM^2+BN^2=MN^2" (không có quan hệ, 3 ô: "", "", "nội dung")
  // trong khi các dòng sau "&\Leftrightarrow ..." (1 quan hệ đã gộp cùng nội
  // dung, chỉ 2 ô: "", "quan hệ + nội dung"). Nếu để nguyên, nội dung dòng
  // đầu rơi vào CỘT THỨ 3, còn nội dung các dòng sau lại rơi vào CỘT THỨ 2 —
  // hai cột này canh trái ở HAI VỊ TRÍ NGANG KHÁC NHAU trong array, khiến các
  // dòng bị LỆCH nhau dù cùng là "l" (canh trái).
  // SỬA: khi một dòng thiếu ô so với số cột tối đa, chèn (các) ô trống ngay
  // SAU ô đầu tiên (ô nhãn) thay vì để trống ở cuối — đẩy (các) ô nội dung
  // còn lại của dòng đó dồn về đúng NHỮNG CỘT CUỐI CÙNG, khớp với vị trí nội
  // dung của các dòng có đủ số ô. Nhờ vậy nội dung mọi dòng luôn nằm chung
  // một cột -> các dòng thẳng hàng với nhau.
  const normalizeArrayRows = (collapsedBody: string): { body: string; colSpec: string } => {
    const rowSplitRegex = /\\\\(?:\s*\[(?!\[)[^\]\[]*\])?/;
    const rawRows = collapsedBody
      .split(rowSplitRegex)
      .map((row) => row.trim())
      .filter((row) => row.length > 0);

    let maxCols = 2;
    const cellsPerRow: string[][] = rawRows.map((row) => {
      const cells = row.split('&');
      if (cells.length > maxCols) maxCols = cells.length;
      return cells;
    });

    const paddedRows = cellsPerRow.map((cells) => {
      if (cells.length >= maxCols) return cells.join('&');
      const padCount = maxCols - cells.length;
      const [first, ...rest] = cells;
      return [first, ...Array(padCount).fill(''), ...rest].join('&');
    });

    return { body: paddedRows.join('\\\\\n'), colSpec: 'r' + 'l'.repeat(maxCols - 1) };
  };

  // LƯU Ý: trong String.replace(), chuỗi thay thế '$$' KHÔNG tạo ra hai dấu $ —
  // JS coi '$$' là escape-sequence cho MỘT dấu $ literal. Vì vậy muốn xuất ra
  // đúng hai dấu $$ (display math) phải viết '$$$$' trong chuỗi thay thế.

  // 1. CÁC CẤU TRÚC HẦU NHƯ LUÔN ĐỨNG ĐỘC LẬP (không bị tác giả bọc sẵn trong $)
  //    -> xử lý ngay từ đầu như trước.
  result = result.replace(/\\begin\{eqnarray\*\}([\s\S]*?)\\end\{eqnarray\*\}/g,
    (_m, body) => {
      const collapsed = collapseDoubleAmpAroundRelation(stripTrailingRowBreak(fixMissingRowBreaks(body)));
      const { body: normalizedBody, colSpec } = normalizeArrayRows(collapsed);
      return `$$\\begin{array}{${colSpec}}${normalizedBody}\\end{array}$$`;
    });
  result = result.replace(/\\begin\{align\*\}([\s\S]*?)\\end\{align\*\}/g,
    (_m, body) => `$$\\begin{align*}${collapseDoubleAmpAroundRelation(stripTrailingRowBreak(fixMissingRowBreaks(body).replace(/\$/g, '')))}\\end{align*}$$`);
  result = result.replace(/\\begin\{center\}/g, '').replace(/\\end\{center\}/g, '');

  // \begin{multicols}{2}...\end{multicols} chỉ là gợi ý CHIA CỘT khi in ấn
  // (LaTeX), không có ý nghĩa gì trên web -> bỏ thẻ, giữ nguyên nội dung bên
  // trong. \centering cũng vậy, chỉ là lệnh căn giữa khi in PDF, bỏ hẳn.
  result = result.replace(/\\begin\{multicols\}\{[^}]*\}/g, '').replace(/\\end\{multicols\}/g, '');
  result = result.replace(/\\centering\b/g, '');

  // \centerline{...} cũng chỉ là lệnh CĂN GIỮA một dòng khi in PDF, không có
  // ý nghĩa gì trên web -> đây là RÁC cần xoá. KHÁC với \centering (không
  // nhận tham số, xoá thẳng là xong), \centerline NHẬN MỘT THAM SỐ {...} chứa
  // nội dung cần căn giữa, nên phải "bóc vỏ" — giữ lại nguyên nội dung bên
  // trong, chỉ xoá lệnh \centerline và cặp {} bọc ngoài nó. Dùng
  // extractBraceGroupFrom (đã có sẵn ở cuối file) để bắt đúng cặp {} khớp,
  // tránh cắt nhầm khi nội dung bên trong có dấu { } lồng nhau (công thức
  // toán, \text{...}...).
  result = unwrapBraceCommand(result, '\\centerline');

  // \[ ... \] LÀ CÚ PHÁP DISPLAY MATH ĐỘC LẬP CỦA LATEX (tương đương $$...$$)
  // nhưng trước đây parser KHÔNG hề xử lý -> "\[" và "\]" bị in thô ra ngoài,
  // đồng thời nội dung bên trong (nếu chứa \heva/\hoac) sẽ không được đưa vào
  // MỘT cặp $$ duy nhất, gây lồng $$ ở bước xử lý \heva/\hoac bên dưới.
  // Xử lý NGAY Ở ĐÂY (trước \heva/\hoac) để mọi \heva/\hoac nằm bên trong chỉ
  // là text thường lúc này, tránh việc chúng tự bọc $$ chồng lên $$ đã có.
  result = result.replace(/\\\[([\s\S]*?)\\\]/g,
    (_m, body) => `$$${stripTrailingRowBreak(fixMissingRowBreaks(body).replace(/\$/g, ''))}$$`);

  // Bảng biểu (array / tabular) -> KaTeX array, giữ nguyên cột |c|c|...|.
  // QUAN TRỌNG: các ô trong bảng đôi khi tự bọc sẵn $...$ cho từng công thức
  // (ví dụ $[2{,}7;3{,}0)$). Nếu giữ nguyên rồi bọc cả bảng vào $$...$$ thì
  // dấu $ đơn sẽ bị LỒNG bên trong $$ -> KaTeX lỗi cú pháp, render ra chữ thô.
  // Vì bên trong array đã là môi trường toán sẵn nên phải bóc hết $ lồng bên
  // trong trước khi bọc $$ ở ngoài.
  //
  // colspec (đặc tả cột) có thể chứa NGOẶC NHỌN LỒNG bên trong, ví dụ cột
  // định dạng của gói LaTeX "array": ">{\arraybackslash}m{1.2cm}" (colspec
  // đầy đủ trông như "{|>{\arraybackslash}m{1.2cm}|c|c|}"). Regex
  // "\{[^}]*\}" CŨ dừng lại ngay ở dấu "}" đầu tiên gặp được (đóng
  // "{\arraybackslash}"), khiến phần đuôi colspec còn lại bị coi nhầm là một
  // phần của "body" (nội dung bảng) -> lọt ra ngoài KaTeX <array> thành chữ
  // rác, hoặc khiến KaTeX lỗi cú pháp toàn khối. Thêm nữa, ngay cả khi trích
  // đúng, KaTeX array KHÔNG hỗ trợ các đặc tả cột nâng cao của gói "array"
  // (">{...}", "m{...}", "p{...}", "b{...}") — cần LÀM SẠCH colspec, chỉ giữ
  // lại l/c/r và dấu "|" mà KaTeX thực sự hiểu, trước khi đưa vào $$...$$.
  const sanitizeColSpecForKatex = (spec: string): string => {
    let s = spec;
    s = s.replace(/>\{[^{}]*\}/g, ''); // vd ">{\arraybackslash}" -> bỏ
    s = s.replace(/<\{[^{}]*\}/g, ''); // vd "<{\centering}" -> bỏ
    s = s.replace(/[pmb]\{[^{}]*\}/g, 'c'); // cột rộng cố định p/m/b{...} -> coi như cột căn giữa thường
    s = s.replace(/[^lcr|:]/g, ''); // chỉ giữ lại các ký tự KaTeX array hiểu được
    return s || 'c';
  };
  // SỬA (khiếu nại: "bảng hiện rác \\multirow{2}{*}{...}/\\cline{2-7} ra
  // ngoài màn hình thay vì hiện chữ M_1/kẻ ngang"): 2 lệnh này thuộc gói
  // LaTeX "multirow"/"array" dùng để GỘP Ô DỌC (multirow) và kẻ ngang MỘT
  // PHẦN cột (cline) khi in PDF — KaTeX (dùng để render bảng trên web qua
  // \begin{array}) KHÔNG hỗ trợ 2 lệnh này. Trước đây parser chỉ xử lý
  // \hline (KaTeX có hỗ trợ) nên \multirow/\cline lọt nguyên văn vào công
  // thức, khiến KaTeX bó tay: "\mu" (trong "\multirow") bị hiểu nhầm thành
  // ký tự Hy Lạp μ, phần "ltirow{2}{*}{$M_1$}" còn lại rơi ra thành CHỮ THÔ
  // ngay trong bảng.
  // Xử lý: \cline{a-b} chỉ có tác dụng trình bày (kẻ ngang 1 đoạn cột) ->
  // XOÁ HẲN, không có gì tương đương trên web đáng để giữ (giống \hline khi
  // dùng ở bảng thuần layout). \multirow{n}{độ rộng}{nội dung} -> KHÔNG có
  // cách nào gộp ô dọc thật sự trong KaTeX array, nên BÓC VỎ giữ lại đúng
  // "nội dung" (đối số thứ 3) — chấp nhận mất hiệu ứng gộp ô, còn hơn hiện
  // rác cú pháp LaTeX thô ra màn hình.
  const stripClineForKatex = (body: string): string => body.replace(/\\cline\{[^{}]*\}/g, '');
  // \multicolumn{n}{align}{nội dung} có CÙNG GỐC LỖI với \multirow ("\mu" bị
  // nuốt thành ký tự Hy Lạp μ) và hay xuất hiện CHUNG bảng (thường dùng làm
  // hàng trắng ngăn cách 2 bảng con, như \multicolumn{7}{c}{}) — xử lý y hệt
  // \multirow: bóc vỏ, chỉ giữ lại đối số thứ 3 (nội dung), bỏ số cột gộp/
  // căn lề vì KaTeX array không có khái niệm gộp cột ngang.
  const unwrapNArgBraceCommandForKatex = (body: string, keyword: string, argCount: number): string => {
    let result = body;
    while (result.includes(keyword)) {
      const idx = result.indexOf(keyword);
      let cursor = idx + keyword.length;
      let lastGroup: { content: string; endIndex: number } | null = null;
      let ok = true;
      for (let k = 0; k < argCount; k++) {
        const group = extractBraceGroupFrom(result, cursor);
        if (!group) { ok = false; break; }
        lastGroup = group;
        cursor = group.endIndex;
      }
      if (!ok || !lastGroup) {
        // Cú pháp không đủ tham số (dữ liệu lỗi) -> chỉ xoá trơ tên lệnh để
        // tránh lặp vô hạn, không cố đoán phần còn lại.
        result = result.substring(0, idx) + result.substring(idx + keyword.length);
        continue;
      }
      result = result.substring(0, idx) + lastGroup.content + result.substring(lastGroup.endIndex);
    }
    return result;
  };
  const unwrapMultirowForKatex = (body: string): string => unwrapNArgBraceCommandForKatex(body, '\\multirow', 3);
  const unwrapMulticolumnForKatex = (body: string): string => unwrapNArgBraceCommandForKatex(body, '\\multicolumn', 3);
  // THÊM MỚI (fix bug: "bảng thống kê ghép nhóm có tiêu đề gộp 2 tầng +
  // ô 2 dòng bị vỡ"): bảng THẬT (không phải công thức toán viết dưới dạng
  // array) đôi khi dùng \multicolumn để GỘP Ô TIÊU ĐỀ theo chiều ngang (ví
  // dụ "Đà Lạt" trải 3 cột) và/hoặc lồng thẳng \begin{tabular}{c}...\end{tabular}
  // NGAY BÊN TRONG MỘT Ô để tạo tiêu đề 2 dòng (ví dụ "Giá trị đại diện").
  // Nhánh wrapTableAsDisplayMath ở dưới KHÔNG xử lý được 2 trường hợp này:
  //   - unwrapMulticolumnForKatex BÓC VỎ \multicolumn, GIỮ NỘI DUNG NHƯNG
  //     MẤT SỐ CỘT GỘP -> hàng tiêu đề chỉ còn 1 ô lẻ, lệch hẳn với các cột
  //     dữ liệu bên dưới (KaTeX array không có khái niệm colspan để giữ lại).
  //   - \begin{tabular} LỒNG bên trong 1 ô hoàn toàn KHÔNG được bóc trước
  //     khi wrap cả bảng ngoài vào $$\begin{array}...\end{array}$$ -> chuỗi
  //     "\begin{tabular}{c}...\end{tabular}" lọt NGUYÊN VĂN vào giữa 1 công
  //     thức KaTeX -> KaTeX không hiểu cú pháp này -> lỗi cú pháp, hiện rác
  //     LaTeX thô (đúng lớp lỗi "bảng lỗi ra tex" đã từng vá ở nơi khác).
  // Trong khi đó examRender.tsx/textUtils.ts (LatexStatTable + hàm
  // parseLatexStatTable/cleanTableCell) ĐÃ xử lý ĐÚNG cả 2 trường hợp này
  // khi nhận được bảng \begin{tabular}/\begin{array} GIỮ NGUYÊN cú pháp gốc
  // (không đi qua wrapTableAsDisplayMath):
  //   - parseLatexStatTable tự nhận diện \multicolumn{n}{...}{...} và gán
  //     đúng colSpan=n cho ô đó -> LatexStatTable render <td colSpan={n}>
  //     thật, tiêu đề gộp thẳng hàng đúng với dữ liệu bên dưới.
  //   - cleanTableCell tự bóc tabular LỒNG bên trong 1 ô (stripNestedTableWrappers)
  //     rồi gộp các dòng con (\\ -> khoảng trắng) thành 1 dòng hiển thị gọn,
  //     không còn cú pháp \begin{tabular} thô nữa.
  // => Với 2 dấu hiệu này (\multicolumn CÓ NỘI DUNG hoặc tabular lồng bên
  // trong ô), thay vì convert sang KaTeX array (sẽ vỡ), GIỮ NGUYÊN cú pháp
  // \begin{tabular}/\begin{array} gốc (chỉ đổi lại đúng colSpec đã trích) để
  // bàn giao cho examRender.tsx tự parse đúng ở bước render — xem
  // isStatDataTableBody bên dưới. KHÔNG áp dụng cho \begin{array} lồng bên
  // trong 1 ô (dùng riêng để viết công thức toán thật kiểu hệ phương trình/
  // piecewise, ví dụ trong 1 ô của bảng biến thiên) — chỉ bắt tabular lồng,
  // vì đó luôn là dấu hiệu CHẮC CHẮN của bảng layout/tiêu đề nhiều dòng,
  // không phải công thức toán.
  // LƯU Ý QUAN TRỌNG (tránh regression bảng biến thiên/xét dấu): rất nhiều
  // bảng biến thiên/xét dấu dùng "\multicolumn{n}{c}{}" (đối số cuối RỖNG)
  // làm MỘT DÒNG TRẮNG ngăn cách 2 hàng (x/y') — đây KHÔNG phải tiêu đề gộp
  // thật, nếu bắt cả trường hợp này vào nhánh "giữ nguyên" thì bảng biến
  // thiên (vốn cần render bằng KaTeX array thật để ra đúng mũi tên/canh cột
  // toán học) sẽ bị chuyển nhầm sang LatexStatTable (bảng HTML thường), sai
  // hẳn kiểu hiển thị mong muốn. Nên CHỈ coi là "bảng thống kê thật" khi
  // \multicolumn có nội dung THỰC SỰ khác rỗng ở đối số thứ 3 (dùng lại
  // extractBraceGroupFrom để trích đúng nội dung dù lồng {} bên trong, ví dụ
  // "{|c|}" hay "{Đà Lạt}").
  const hasNonEmptyMulticolumn = (body: string): boolean => {
    let idx = body.indexOf('\\multicolumn');
    while (idx !== -1) {
      let cursor = idx + '\\multicolumn'.length;
      let lastGroup: { content: string; endIndex: number } | null = null;
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const group = extractBraceGroupFrom(body, cursor);
        if (!group) { ok = false; break; }
        lastGroup = group;
        cursor = group.endIndex;
      }
      if (ok && lastGroup && lastGroup.content.trim() !== '') return true;
      idx = body.indexOf('\\multicolumn', idx + '\\multicolumn'.length);
    }
    return false;
  };
  const isStatDataTableBody = (body: string): boolean =>
    hasNonEmptyMulticolumn(body) || /\\begin\{tabular\}/.test(body);
  const wrapTableAsDisplayMath = (colspec: string, body: string) => {
    const cleanedBody = unwrapMulticolumnForKatex(unwrapMultirowForKatex(stripClineForKatex(body)));
    const strippedBody = stripTrailingRowBreak(fixMissingRowBreaks(cleanedBody).replace(/\$/g, ''));
    return `$$\\begin{array}{${sanitizeColSpecForKatex(colspec)}}${strippedBody}\\end{array}$$`;
  };
  // PHẦN 1 (fix lỗi rác \\ / & khi bảng chỉ dùng để DÀN LAYOUT ảnh/tikz):
  // Rất nhiều đề dùng \begin{tabular}{cc} ... \end{tabular} (hoặc {array})
  // CHỈ để đặt ảnh \includegraphics cạnh hình tikz — không hề có công thức
  // toán hay chữ thật nào trong các ô. Tại điểm này trong pipeline,
  // \includegraphics và \begin{tikzpicture} đã được thay bằng mốc
  // [[HÌNH_FILE_n]]/[[HÌNH_TIKZ_n]] (xem extractTikzBlocks ở đầu file và
  // đoạn thay \includegraphics ngay sau đó). Nếu cứ bọc cả bảng này vào
  // $$\begin{array}...\end{array}$$ như trước đây, KaTeX sẽ cố PARSE các mốc
  // "[[HÌNH_FILE_1]]" như một công thức toán -> lỗi cú pháp -> hiện rác thô
  // "\\", "&", "\begin{array}" ra màn hình thay vì render layout ảnh cạnh
  // nhau như tác giả đề mong muốn.
  //
  // Giải pháp: nếu toàn bộ nội dung bảng (sau khi bỏ mốc ảnh/tikz và các ký
  // tự CẤU TRÚC bảng thuần tuý: &, \\, \\[Ndim], \hline, \noalign{...},
  // khoảng trắng, comment %...) rỗng hoàn toàn -> đây chắc chắn là bảng DÀN
  // LAYOUT thuần, KHÔNG phải bảng toán/dữ liệu thật. Khi đó KHÔNG bọc $$...$$
  // nữa mà xuất ra mốc trung gian [[HANG_HINH_ROW]]...[[/HANG_HINH_ROW]] cho
  // mỗi hàng (các ô cách nhau bằng "|||") để examRender.tsx (việc bàn giao ở
  // PHẦN 2) tự vẽ thành một hàng flex ảnh + tikz nằm cạnh nhau.
  const stripPlaceholdersAndTableStructure = (body: string): string => {
    let s = body;
    s = s.replace(/\[\[HÌNH_(?:TIKZ|FILE)_\d+\]\]/g, '');
    s = s.replace(/%[^\n]*/g, ''); // bỏ comment LaTeX (%...) tới hết dòng
    s = s.replace(/\\hline/g, '');
    s = s.replace(/\\noalign\{[^}]*\}/g, '');
    // longtable: các lệnh đánh dấu vùng header/footer lặp lại + \caption{...}
    // cũng chỉ là CẤU TRÚC bảng thuần, không phải nội dung ô thật.
    s = s.replace(/\\endfirsthead/g, '');
    s = s.replace(/\\endhead/g, '');
    s = s.replace(/\\endfoot/g, '');
    s = s.replace(/\\endlastfoot/g, '');
    s = s.replace(/\\caption\{[^}]*\}/g, '');
    // ngắt dòng \\ hoặc \\[10pt]. LƯU Ý: "(?!\[)" chặn KHÔNG cho nhánh
    // "\s*\[[^\]]*\]" (đặc tả khoảng cách dòng) nuốt nhầm vào mốc
    // "[[HÌNH_FILE_n]]"/"[[HÌNH_TIKZ_n]]" khi mốc đứng NGAY SAU \\ không có
    // khoảng trắng (ví dụ "...\\[[HÌNH_FILE_4]]..." - cả 2 cú pháp đều bắt
    // đầu bằng "[" nên nếu không chặn, "\[[^\]]*\]" sẽ khớp tham lam vào
    // "[[HÌNH_FILE_4]" (dừng ở dấu "]" ĐẦU TIÊN bên trong mốc), làm hỏng cả
    // việc tách hàng lẫn nội dung mốc.
    s = s.replace(/\\\\(?:\s*\[(?!\[)[^\]\[]*\])?/g, '');
    s = s.replace(/&/g, '');
    s = s.replace(/\s+/g, '');
    return s;
  };
  const isPureImageLayoutBody = (body: string): boolean => {
    // Phải có ÍT NHẤT 1 mốc ảnh/tikz thì mới xét -> tránh coi nhầm 1 bảng
    // rỗng/lỗi thành bảng layout ảnh.
    if (!/\[\[HÌNH_(?:TIKZ|FILE)_\d+\]\]/.test(body)) return false;
    return stripPlaceholdersAndTableStructure(body) === '';
  };
  const wrapTableAsImageLayoutRows = (body: string): string => {
    // Tách hàng theo \\ (hoặc \\[Ndim]) Ở MỨC NGOÀI CÙNG. An toàn vì tại
    // đây nội dung ô CHỈ còn mốc placeholder + rác định dạng bảng (đã đảm
    // bảo bởi isPureImageLayoutBody ở trên) -> không còn dấu { } lồng phức
    // tạp nào cần đếm độ sâu như body toán thật.
    const rows = body
      // Xem giải thích chi tiết ở stripPlaceholdersAndTableStructure(): phải
      // dùng "(?!\[)" để không tách nhầm ngay giữa mốc "[[HÌNH_FILE_n]]" khi
      // nó đứng liền sau "\\" (không khoảng trắng).
      .split(/\\\\(?:\s*\[(?!\[)[^\]\[]*\])?/)
      .map((row) => row
        .replace(/\\hline/g, '')
        .replace(/\\noalign\{[^}]*\}/g, '')
        .replace(/\\endfirsthead/g, '')
        .replace(/\\endhead/g, '')
        .replace(/\\endfoot/g, '')
        .replace(/\\endlastfoot/g, '')
        .replace(/\\caption\{[^}]*\}/g, ''))
      .map((row) => row.split('&').map((cell) => cell.trim()).filter((cell) => cell.length > 0))
      .filter((cells) => cells.length > 0);
    // SỬA (yêu cầu người dùng 23-7: bỏ hẳn xếp NGANG — quá nhiều lần lỗi vặt
    // khó bắt: hình chập chờn/biến mất, khung hẹp bị đẩy tràn...). Trước đây
    // gói mỗi hàng bảng vào mốc [[HANG_HINH_ROW]]cell1|||cell2[[/HANG_HINH_ROW]]
    // để examRender.tsx/ExamBuilder.tsx tự vẽ thành 1 hàng flex ngang (ảnh +
    // tikz cạnh nhau, dùng component TikzImage với cơ chế đo/co giãn khá
    // phức tạp). Giờ KHÔNG còn phát ra mốc HANG_HINH_ROW nữa — mỗi ô (ảnh
    // hoặc tikz) tách thành 1 DÒNG RIÊNG (ngăn cách 2 dấu xuống dòng), xếp
    // TRÊN-DƯỚI theo đúng dòng chảy tài liệu bình thường, dùng lại NGUYÊN
    // đường render ảnh đơn lẻ (vốn đã chạy ổn định, không qua TikzImage bản
    // "co giãn theo container" hay dễ lỗi) — đơn giản, chắc chắn hơn.
    return rows
      .map((cells) => `\n\n${cells.join('\n\n')}\n\n`)
      .join('');
  };
  // Quét thủ công thay vì regex "{[^}]*}" đơn thuần: tìm "\begin{array}" hay
  // "\begin{tabular}", trích colspec bằng cách đếm độ sâu ngoặc nhọn (chính
  // xác dù lồng bao nhiêu tầng), rồi tìm "\end{...}" TƯƠNG ỨNG cùng tên môi
  // trường (đếm độ sâu begin/end, xử lý được cả trường hợp lồng nhau).
  const transformArrayTabularEnv = (
    text: string,
    envName: 'array' | 'tabular' | 'tabularx' | 'longtable',
    hasWidthArg: boolean = false,
  ): string => {
    // SỬA (fix bug "dư/thiếu dấu $ lẻ khi bảng vốn đã được GV tự bọc sẵn
    // trong $...$"): rất nhiều đề gõ bảng theo thói quen cũ
    // "$\begin{array}...\end{array}$" (tự bọc 1 cặp $ quanh cả bảng, coi
    // như MỘT công thức toán duy nhất). Khối xử lý bên dưới LUÔN tự thêm
    // một cặp "$$...$$" MỚI quanh \begin{array}/\begin{tabular} tìm được
    // (2 nhánh return ở gần cuối vòng lặp), BẤT KỂ đã có "$" bọc sẵn hay
    // chưa. Nếu không dọn dấu "$" đơn cũ này, kết quả dư ra một dấu "$"
    // LẺ ngay sau bảng — dấu $ lẻ đó làm bước tách $/$$ ở examRender.tsx
    // (react-latex-next) BẮT CẶP SAI LỆCH cho MỌI công thức PHÍA SAU
    // bảng trong cùng câu hỏi (không chỉ riêng bảng) -> lỗi khó nhận ra vì
    // bảng có thể vẫn "trông như" render được, nhưng nội dung/công thức
    // ngay sau bảng bị vỡ hoặc hiện rác/trống.
    // Chỉ dọn khi CÓ ĐỦ CẶP: một dấu "$" ĐƠN (không phải "$$") ngay trước
    // \begin{...} (cách nhau tối đa khoảng trắng) VÀ một dấu "$" ĐƠN ngay
    // sau \end{...} TƯƠNG ỨNG — tránh đụng vào trường hợp chỉ có 1 phía
    // (khi đó dấu $ đó nhiều khả năng thuộc về một công thức khác đứng
    // trước/sau bảng, không phải cặp bọc quanh bảng).
    const SINGLE_DOLLAR_BEFORE_RE = /(^|[^$])\$(\s*)$/;
    const SINGLE_DOLLAR_AFTER_RE = /^(\s*)\$(?!\$)/;
    let out = '';
    let i = 0;
    const beginRe = new RegExp(`\\\\begin\\{${envName}\\}\\s*\\{`, 'g');
    while (i < text.length) {
      beginRe.lastIndex = i;
      const m = beginRe.exec(text);
      if (!m) {
        out += text.slice(i);
        break;
      }
      const preSlice = text.slice(i, m.index);
      const preDollarMatch = SINGLE_DOLLAR_BEFORE_RE.exec(preSlice);
      let openBraceIdx = m.index + m[0].length - 1; // vị trí dấu "{" mở tham số đầu tiên
      if (hasWidthArg) {
        // tabularx: \begin{tabularx}{width}{colspec} - CÓ 2 THAM SỐ liên
        // tiếp, tham số đầu là bề rộng bảng (ví dụ {\textwidth}). Bỏ qua
        // tham số {width} này (đếm độ sâu ngoặc, an toàn với { } lồng bên
        // trong như \textwidth hay 0.9\linewidth) rồi mới tìm dấu "{" kế
        // tiếp làm điểm bắt đầu {colspec} thật sự.
        let widthDepth = 1;
        let w = openBraceIdx + 1;
        while (widthDepth > 0 && w < text.length) {
          if (text[w] === '{') widthDepth++;
          else if (text[w] === '}') widthDepth--;
          w++;
        }
        const nextBrace = /^\s*\{/.exec(text.slice(w));
        if (!nextBrace) {
          // Cú pháp lỗi (thiếu {colspec}) -> giữ nguyên phần còn lại, tránh
          // vòng lặp chạy sai/vô hạn trên dữ liệu hỏng.
          out += text.slice(m.index);
          i = text.length;
          break;
        }
        openBraceIdx = w + nextBrace.index + nextBrace[0].length - 1;
      }
      let depth = 1;
      let j = openBraceIdx + 1;
      while (depth > 0 && j < text.length) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const colSpec = text.slice(openBraceIdx + 1, j - 1);
      const envRe = new RegExp(`\\\\(begin|end)\\{${envName}\\}`, 'g');
      envRe.lastIndex = j;
      let envDepth = 1;
      let bodyEnd = -1;
      let afterEnd = -1;
      let em: RegExpExecArray | null;
      while ((em = envRe.exec(text))) {
        envDepth += em[1] === 'begin' ? 1 : -1;
        if (envDepth === 0) {
          bodyEnd = em.index;
          afterEnd = envRe.lastIndex;
          break;
        }
      }
      if (bodyEnd === -1) {
        // Không tìm được \end tương ứng -> giữ nguyên phần còn lại, dừng
        // vòng lặp để tránh chạy vô hạn trên dữ liệu lỗi.
        out += text.slice(m.index);
        i = text.length;
        break;
      }
      const body = text.slice(j, bodyEnd);
      // Xem chú thích đầy đủ ở khai báo SINGLE_DOLLAR_BEFORE_RE/AFTER_RE
      // phía trên: chỉ dọn dấu "$" đơn thừa khi bắt được ĐỦ CẶP (trước
      // \begin VÀ sau \end tương ứng của CHÍNH block này).
      const postDollarMatch = SINGLE_DOLLAR_AFTER_RE.exec(text.slice(afterEnd));
      const hasWrappingDollarPair = !!(preDollarMatch && postDollarMatch);
      if (hasWrappingDollarPair) {
        // Cắt bỏ đúng dấu "$" đơn ở cuối preSlice (giữ lại khoảng trắng
        // trước đó nếu có, chỉ bỏ ký tự "$"), rồi bù lại phần khoảng
        // trắng đã match để không đổi cách trình bày xung quanh.
        out += preSlice.slice(0, preDollarMatch.index) + preDollarMatch[1] + preDollarMatch[2];
      } else {
        out += preSlice;
      }
      // SỬA (fix bug bảng multicolumn/tabular lồng bị vỡ — xem giải thích
      // đầy đủ ở isStatDataTableBody phía trên): GIỮ NGUYÊN cú pháp
      // \begin{envName}{colSpec}...\end{envName} gốc (không unwrap
      // multicolumn, không bóc $ , không stripCline...) để examRender.tsx
      // (extractEnvBlocks + LatexStatTable/parseLatexStatTable trong
      // textUtils.ts) tự parse đúng lúc RENDER — pipeline đó đã hỗ trợ sẵn
      // cả colSpan thật (từ \multicolumn) lẫn tabular lồng trong ô (gộp
      // thành 1 dòng qua cleanTableCell). Không bọc $$...$$ vì đây không
      // phải công thức toán.
      out += isPureImageLayoutBody(body)
        ? wrapTableAsImageLayoutRows(body)
        : isStatDataTableBody(body)
          // Bọc $$...$$ (dù không phải công thức toán thật) CHỈ để
          // maskExistingMath() (chạy ngay sau, ở bước 2A) đóng băng cả khối
          // này lại — nếu không, bước 3 "LỌC VĂN BẢN" phía sau (chuyển \\ ->
          // \n cho văn bản thường) sẽ ăn nhầm dấu \\ dùng để NGẮT HÀNG bên
          // trong bảng (\\ cuối mỗi \hline-row, và \\ trong tabular lồng ở ô
          // "Giá trị đại\\diện"), làm sai lệch số hàng khi parseLatexStatTable
          // tách theo \hline/&. maskExistingMath dùng regex non-greedy tìm
          // cặp $$ GẦN NHẤT nên vẫn khớp đúng dù bên trong có nhiều dấu $ đơn
          // rời rạc (vd "$76{,}65$") — không cần bóc $ như wrapTableAsDisplayMath.
          ? `$$\\begin{${envName}}{${colSpec}}${body}\\end{${envName}}$$`
          : wrapTableAsDisplayMath(colSpec, body);
      // Nếu vừa dọn cặp $ thừa, phải NHẢY QUA luôn dấu "$" đơn (+ khoảng
      // trắng trước nó) ngay sau \end{...} — nếu không nó vẫn còn nguyên
      // trong text và sẽ bị ghi ra ở vòng lặp/đoạn slice(i) kế tiếp,
      // thành dấu $ lẻ y hệt lỗi ban đầu (chỉ là lệch từ đầu sang cuối).
      i = hasWrappingDollarPair ? afterEnd + postDollarMatch![0].length : afterEnd;
    }
    return out;
  };
  result = transformArrayTabularEnv(result, 'array');
  result = transformArrayTabularEnv(result, 'tabular');
  result = transformArrayTabularEnv(result, 'tabularx', true);
  result = transformArrayTabularEnv(result, 'longtable');


  // QUAN TRỌNG: \heva/\hoac KHÔNG tự bọc $$ ở đây nữa. Lý do: khi chúng nằm
  // bên trong một khối ĐÃ được bọc $$ từ trước (từ \[ \], eqnarray*, align*,
  // array/tabular ở các bước trên), việc tự thêm $$ ở đây sẽ tạo ra $$ LỒNG
  // BÊN TRONG $$ (ví dụ "...&$$$$\left[..."), khiến trình render không bắt
  // cặp $$ đúng nữa và toàn bộ khối rơi về hiển thị chữ thô. Thay vào đó chỉ
  // sinh ra "\left...\begin{aligned}...\end{aligned}\right..." TRẦN (không $$).
  // Nếu nó đang nằm trong một khối $$ có sẵn -> hợp lệ, không cần bọc thêm gì.
  // Nếu nó KHÔNG nằm trong khối $$ nào (viết trần ngoài văn bản) -> bước 2B ở
  // dưới (tìm \left...\begin{aligned}...\right còn sót lại) sẽ tự bọc $$ cho
  // nó sau, đảm bảo không sót trường hợp nào.
  // KHÔI PHỤC \heva{...}/\hoac{...} đã bảo vệ bằng placeholder
  // "@@HEVAHOAC_n@@" ở ĐẦU HÀM (xem chú thích "BẢO VỆ \heva{...}/\hoac{...}
  // KHỎI CÁC BƯỚC TÁCH HÀNG/CỘT" phía trên) — khôi phục NGAY TẠI ĐÂY, trước
  // khi mở rộng \heva/\hoac thật sự ở 2 dòng ngay dưới, và SAU KHI mọi bước
  // đếm/tách hàng-cột của eqnarray*/align*/array đã chạy xong nên không còn
  // đếm nhầm dấu "&"/"\\" bên trong \heva/\hoac là hàng/cột của khối ngoài
  // nữa (hệ phương trình \heva lồng trong eqnarray* không còn bị lệch cột).
  // QUAN TRỌNG: dùng vòng lặp thay vì 1 lần .replace() duy nhất, vì
  // \heva/\hoac có thể LỒNG NHAU (ví dụ \hoac{ \heva{...} \\ \heva{...} }).
  // Do protectHevaHoac('\\heva') chạy TRƯỚC protectHevaHoac('\\hoac') ở bước
  // bảo vệ phía trên, nội dung đã lưu cho một \hoac lồng \heva bên trong sẽ
  // tự chứa các token "@@HEVAHOAC_n@@" khác (của \heva con) thay vì \heva
  // gốc. Một lượt String.replace() KHÔNG quét lại phần vừa được chèn vào,
  // nên các token lồng bên trong bị bỏ sót và lọt thẳng ra kết quả hiển thị
  // (hiện tượng "@@HEVAHOAC_n@@" hiện trần trên màn hình khi \heva nằm
  // trong \hoac hoặc ngược lại). Lặp lại .replace() đến khi không còn token
  // nào để khôi phục đúng mọi cấp lồng nhau.
  {
    const hevaHoacTokenRe = /@@HEVAHOAC_(\d+)@@/g;
    let previous: string;
    do {
      previous = result;
      result = result.replace(hevaHoacTokenRe, (_m, idx) => hevaHoacProtected[Number(idx)] ?? '');
    } while (result !== previous && /@@HEVAHOAC_\d+@@/.test(result));
  }

  result = parseCustomGomCumLệnh(result, '\\heva', '\\left\\{\\begin{aligned}', '\\end{aligned}\\right.');
  result = parseCustomGomCumLệnh(result, '\\hoac', '\\left[\\begin{aligned}', '\\end{aligned}\\right.');

  // Dọn dẹp dấu $$ bị lồng nhau thừa thãi (chuỗi thay thế cũng cần '$$$$' để ra đúng $$)
  result = result.replace(/\${3,}/g, '$$$$');

  // GỘP CÁC KHỐI $$...$$ ĐỨNG SÁT NHAU (chỉ cách nhau bởi một đoạn nối NGẮN,
  // ví dụ "\Leftrightarrow", hoặc "\Leftrightarrow t = 0{,}2.") thành MỘT khối
  // $$...$$ duy nhất.
  // LÝ DO: thư viện render (react-latex-next) bắt cặp $$ theo kiểu "tham lam"
  // (greedy) — nếu có "$$A$$ ... $$B$$", nó có thể ghép từ dấu $$ ĐẦU TIÊN tới
  // dấu $$ CUỐI CÙNG làm một khối, nuốt luôn cặp $$ ở giữa vào làm nội dung
  // toán — mà dấu $ không hợp lệ bên trong công thức KaTeX nên toàn bộ bị lỗi
  // cú pháp và rơi về hiển thị chữ thô (và gây rò rỉ __MATH_BLOCK_n__ do bước
  // đóng băng bắt cặp $ sai). Gộp lại còn MỘT cặp $$ duy nhất sẽ triệt tiêu
  // hẳn nguy cơ này. Đoạn nối ở giữa giới hạn dưới 80 ký tự và không chứa dấu
  // $ nào khác, để tránh gộp nhầm hai công thức cách nhau bởi cả một đoạn văn.
  // THIẾT KẾ LẠI HOÀN TOÀN thuật toán gộp (cách cũ dùng regex bắt 4 dấu $$
  // liên tiếp bất kỳ vẫn có lỗi: nó không phân biệt được một dấu "$$" là
  // ĐÓNG của khối này hay MỞ của khối tiếp theo, nên có thể lấy nhầm dấu $$
  // ĐÓNG của một khối array/eqnarray hợp lệ làm dấu MỞ của một cặp mới, rồi
  // "nuốt" luôn cặp $$ của MỘT công thức ngắn ở xa phía sau làm "đoạn nối",
  // xóa mất $$ của chính công thức đó dù nó không hề đứng cạnh khối kia).
  //
  // Cách an toàn: TÁCH văn bản thành dãy các đoạn xen kẽ [text, math, text,
  // math, ...] bằng một lượt quét trái-sang-phải bắt cặp $$...$$ tuần tự
  // (không thể bắt nhầm vì mỗi $$ chỉ được dùng làm ranh giới của ĐÚNG MỘT
  // khối, theo thứ tự xuất hiện). Sau đó chỉ gộp hai khối math thực sự NẰM
  // SÁT NHAU trong dãy đó (cách nhau bởi đúng một đoạn text ngắn, không dấu
  // $) — loại bỏ hoàn toàn khả năng ghép nhầm các khối ở xa nhau.
  const mergeAdjacentDisplayMath = () => {
    type Segment = { type: 'text' | 'math'; content: string };
    const segments: Segment[] = [];
    let lastIndex = 0;
    const blockRe = /\$\$([\s\S]*?)\$\$/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(result)) !== null) {
      if (m.index > lastIndex) segments.push({ type: 'text', content: result.slice(lastIndex, m.index) });
      segments.push({ type: 'math', content: m[1] });
      lastIndex = blockRe.lastIndex;
    }
    if (lastIndex < result.length) segments.push({ type: 'text', content: result.slice(lastIndex) });

    const merged: Segment[] = [];
    for (const seg of segments) {
      const prevText = merged[merged.length - 1];
      const prevMath = merged[merged.length - 2];
      // Đoạn nối hợp lệ để gộp phải là một đoạn NỐI TOÁN HỌC NGẮN, cùng dòng với
      // công thức (ví dụ "\Leftrightarrow", "và", dấu phẩy...). Nếu đoạn nối
      // chứa \item / \begin / \end hoặc xuống dòng thì đó là ranh giới danh sách
      // hay đoạn văn (itemize, align mới, v.v.) — TUYỆT ĐỐI không được gộp, nếu
      // không sẽ nuốt luôn cả câu chữ + lệnh cấu trúc vào trong một khối $$ duy
      // nhất, khiến toàn bộ khối đó sai cú pháp và rơi về hiển thị chữ thô.
      const isSafeConnector =
        !!prevText &&
        prevText.type === 'text' &&
        prevText.content.length <= 80 &&
        !prevText.content.includes('$') &&
        !prevText.content.includes('\n') &&
        !/\\(item|begin|end)\b/.test(prevText.content) &&
        // KHÔNG gộp nếu đoạn nối chứa nhãn in nghiêng/đậm (\textit, \textbf,
        // {\it, {\bf...) — đây là chữ thường (vd "Cách 1:") chứ không phải
        // ký hiệu toán học nối 2 công thức, nếu gộp vào sẽ biến nhãn này
        // thành 1 phần của khối $$ hiển thị dạng khối (canh giữa, luôn tự
        // xuống dòng) thay vì chữ thường chạy inline như bình thường.
        !/\\text(it|bf)\b|\{\\(it|bf)\b/.test(prevText.content);
      const canMerge =
        seg.type === 'math' &&
        isSafeConnector &&
        prevMath && prevMath.type === 'math';
      if (canMerge) {
        prevMath.content += prevText.content + seg.content;
        merged.pop(); // bỏ đoạn text-nối vì đã gộp vào khối math trước đó
      } else {
        merged.push({ ...seg });
      }
    }

    result = merged.map(seg => (seg.type === 'math' ? `$$${seg.content}$$` : seg.content)).join('');
  };
  mergeAdjacentDisplayMath();

  // 2A. ĐÓNG BĂNG (MASK) các khối $$...$$ / $...$ ĐÃ CÓ SẴN trong văn bản —
  // kể cả trường hợp tác giả tự bọc "\left\{\begin{aligned}...\right." trong
  // MỘT dấu $ đơn cho công thức viết inline (ví dụ hàm số từng khúc). Phải
  // làm bước này TRƯỚC khi tự động chèn $$ cho phần còn sót lại ở bước 2B —
  // nếu làm ngược lại, dấu $ gốc của tác giả sẽ bị lồng lệch với $$ mới chèn,
  // khiến 2 bước đóng băng ghép nhầm dấu $ ở rất xa nhau thành một khối toán
  // khổng lồ (nuốt luôn cả đoạn văn bản thường), gây rò rỉ __MATH_BLOCK_n__.
  const mathBlocks: string[] = [];
  // THÊM MỚI (sửa lỗi 17-7: "công thức inline dính liền chữ sau nó, mất cả
  // dấu xuống dòng" — phát hiện khi test file S5-TT-SoNinhBinh-L2-2526.tex,
  // câu có \begin{itemize} chứa "$y = 1$" ngay trước 1 \item khác): TRƯỚC
  // ĐÂY mathBlocks gộp CHUNG cả 2 loại — công thức DISPLAY ($$...$$, tự xuống
  // dòng riêng, tương đương 1 <div>/.katex-display) VÀ công thức INLINE
  // ($...$, nằm ngay trong dòng chữ như 1 từ bình thường, KHÔNG tự xuống
  // dòng) — vào cùng 1 kiểu placeholder __MATH_BLOCK_n__, không phân biệt
  // được loại nào. Bước 3C bên dưới (BLOCK_MARKER_RE) coi MỌI
  // __MATH_BLOCK_n__ đều là "khối tự xuống dòng riêng" nên xoá hẳn \n sát
  // cạnh nó — ĐÚNG với DISPLAY nhưng SAI với INLINE (xoá nhầm \n của 1 công
  // thức nằm giữa câu sẽ dính liền 2 câu/2 mục danh sách lại với nhau, ví
  // dụ "...đường thẳng $y = 1$" + "\n\item Xét giao điểm..." bị nuốt mất
  // \n, thành "...$y = 1$•  Xét giao điểm..." dính sát không có gì ngăn
  // cách). Thêm mảng mathBlockIsDisplay đánh dấu riêng từng phần tử của
  // mathBlocks là DISPLAY (true, ứng với lượt quét $$...$$ đầu) hay INLINE
  // (false, ứng với lượt quét $...$ sau) — dùng ở bước 3C để CHỈ xoá \n
  // cạnh khối DISPLAY, giữ nguyên \n cạnh khối INLINE.
  const mathBlockIsDisplay: boolean[] = [];
  const maskExistingMath = () => {
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      mathBlocks.push(match);
      mathBlockIsDisplay.push(true);
      return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });
    result = result.replace(/\$([\s\S]*?)\$/g, (match) => {
      mathBlocks.push(match);
      mathBlockIsDisplay.push(false);
      return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });
  };
  maskExistingMath();

  // 2A-bis: Nhiều đề KHÔNG bọc $ quanh các câu Đúng/Sai dạng đẳng thức vectơ
  // (ví dụ "\vv{CC'}+\vv{BA}+\vv{D'A'}=\vv{A'C}" viết trần, không có $ nào cả),
  // trong khi các câu khác lại tự bọc "$\overrightarrow{...}$" sẵn. Tới đây,
  // MỌI cặp $ có sẵn của tác giả đã bị đóng băng ở trên, nên \overrightarrow
  // (sinh ra từ \vv) còn sót lại chắc chắn đứng NGOÀI mọi cặp $ -> an toàn để
  // tự bọc $ ... $ quanh CẢ CỤM đẳng thức vectơ (nối bởi + - = , và khoảng
  // trắng, cho phép cả nhãn điểm trần như "2AB" không có \overrightarrow).
  result = result.replace(
    /\\overrightarrow\{[^}]*\}(?:\s*[-+=,]\s*(?:\\overrightarrow\{[^}]*\}|[A-Za-z0-9']+))*/g,
    (m) => '$' + m + '$'
  );
  maskExistingMath();

  // 2B. Với "\left X \begin{aligned}...\right Y" CÒN SÓT LẠI (không nằm trong
  // cặp $ nào — tác giả viết "trần" ngoài mọi ký hiệu $), giờ mới bọc $$...$$
  // rồi đóng băng tiếp. Chấp nhận mọi cặp ngoặc \left/\right thường gặp:
  // \left\{...\right. , \left[...\right] , \left(...\right) — không chỉ mỗi
  // dạng dấu ngoặc nhọn như trước, vì đề có thể viết \left[ trực tiếp mà
  // không qua macro \hoac. Lúc này trong `result` không còn dấu $ rời nào cả
  // (đã bị mask hết ở bước 2A), nên việc chèn $$ mới là an toàn tuyệt đối,
  // không thể lồng nhầm với $ của tác giả nữa.
  result = result.replace(
    /\\left(\\\{|\[|\()\s*\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}\s*\\right(\\\}|\]|\)|\.)/g,
    (_match, leftDelim, body, rightDelim) =>
      `$$\\left${leftDelim}\\begin{aligned}${collapseDoubleAmpAroundRelation(stripTrailingRowBreak(fixMissingRowBreaks(body)))}\\end{aligned}\\right${rightDelim}$$`
  );
  mergeAdjacentDisplayMath();
  maskExistingMath();

  // 2C. "\begin{aligned}...\end{aligned}" ĐỨNG MỘT MÌNH — không có \left{...\right.
  // đi kèm (không phải hệ điều kiện, chỉ là các bước biến đổi liên tiếp) và
  // cũng không được tác giả bọc trong $. Lúc này result đã sạch dấu $ rời
  // (mask ở 2A, 2B xong), nên bọc $$ mới ở đây vẫn an toàn tuyệt đối.
  result = result.replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/g,
    (_match, body) => `$$\\begin{aligned}${collapseDoubleAmpAroundRelation(stripTrailingRowBreak(fixMissingRowBreaks(body)))}\\end{aligned}$$`);
  mergeAdjacentDisplayMath();
  maskExistingMath();

  // Dọn dẹp dấu $$ bị lồng nhau thừa thãi nếu 2B/2C vô tình chèn $$ sát dấu $$
  // đã đóng băng thành placeholder ở lượt trước (chuỗi thay thế cần '$$$$' để
  // ra đúng $$ — xem ghi chú String.replace() ở trên).
  result = result.replace(/\${3,}/g, '$$$$');
  maskExistingMath();


  // 3. LỌC VĂN BẢN (Tuyệt đối an toàn vì Toán đã bị cất đi)
  result = result
    .replace(/\\par\b/g, '\n\n')                 // \par an toàn, không còn ăn nhầm \parallel
    .replace(/\\\\/g, '\n')                      // Dấu \\ lúc này chỉ còn tác dụng ngắt dòng văn bản
    .replace(/\\textbf\s*\{([^}]+)\}/g, '$\\textbf{$1}$') // Biến in đậm thành định dạng Toán để KaTeX nhận
    .replace(/\\textit\s*\{([^}]+)\}/g, '$\\textit{$1}$')
    // Kiểu khai báo font CŨ trong LaTeX: {\it ...}, {\bf ...} — toàn bộ nhóm
    // ngoặc {} áp dụng font nghiêng/đậm cho phần bên trong, khác với cú pháp
    // lệnh-nhận-tham-số \textit{...}/\textbf{...} ở trên. Đề thi hay dùng dạng
    // này cho tiêu đề "Cách 1:", "Cách 2:" nên cần xử lý riêng, nếu không sẽ
    // in thô "{\it Cách 1:}" ra ngoài.
    // SỬA (khiếu nại: "{\bf{Đúng}}" không render, in thô ra màn hình): 2 regex
    // CŨ bắt buộc phải có ÍT NHẤT 1 khoảng trắng ("\s+") ngay sau \it/\bf, và
    // nội dung bên trong KHÔNG được chứa "{"/"}" ("[^{}]*"). Đề thi (đặc biệt
    // phần Đúng/Sai) hay gõ liền không cách "{\bf{Đúng}}" — tức {\bf ...} lồng
    // THÊM một cặp {} bọc nội dung — nên cả 2 điều kiện trên đều KHÔNG khớp
    // (không có khoảng trắng sau \bf, và nội dung {Đúng} có chứa "{"/"}"),
    // regex bỏ qua hoàn toàn, để nguyên "{\bf{Đúng}}" thô ngoài màn hình.
    // Sửa: cho phép \it/\bf được theo sau bởi HOẶC khoảng trắng HOẶC ngay lập
    // tức một dấu "{" (lookahead "(?=\{)", không tiêu thụ ký tự) — rồi cho
    // phép có thêm ĐÚNG 1 cặp "{}" lồng tùy chọn bọc nội dung ("\{?...\}?").
    // Giữ NGUYÊN yêu cầu phải có khoảng trắng HOẶC "{" ngay sau \it/\bf (không
    // đổi thành tùy chọn hoàn toàn) để không vô tình khớp nhầm các lệnh khác
    // bắt đầu bằng "it"/"bf" liền chữ, ví dụ "{\bfseries ...}" (sau "\bf" là
    // chữ "s", không phải khoảng trắng cũng không phải "{", nên vẫn KHÔNG
    // khớp, giữ an toàn như regex cũ).
    .replace(/\{\s*\\it(?:\s+|(?=\{))\s*\{?\s*([^{}]*)\s*\}?\s*\}/g, '$\\textit{$1}$')
    .replace(/\{\s*\\bf(?:\s+|(?=\{))\s*\{?\s*([^{}]*)\s*\}?\s*\}/g, '$\\textbf{$1}$')
    // SỬA (khiếu nại: "chữ in nghiêng vẫn tự xuống dòng riêng dù dòng trên
    // còn trống, kể cả để ngang điện thoại"): nguồn LaTeX gốc thường có 1 dấu
    // "\\" (đã đổi thành "\n" ở dòng .replace phía trên) ngay TRƯỚC nhãn in
    // nghiêng/đậm kiểu "(\textit{kết quả làm tròn...})" — cộng với
    // "whitespace-pre-wrap" giữ nguyên "\n" này thành 1 dấu xuống dòng CỨNG,
    // nên nhãn luôn bị đẩy xuống dòng mới bất kể dòng trên còn thừa bao
    // nhiêu chỗ. Gộp 1 dấu xuống dòng ĐƠN (không phải \n\n ngắt đoạn thật -
    // đoạn (?!\n) đảm bảo không đụng tới trường hợp đó) đứng ngay trước nhãn
    // thành dấu cách, để nhãn chạy tiếp inline theo văn bản thường như mọi
    // cụm chữ khác.
    .replace(/([^\n\s])[ \t]*\n(?!\n)[ \t]*(?=\$\\text(?:it|bf)\{)/g, '$1 ')
    // GHI CHÚ: itemize/enumerate lồng nhau (kể cả nhiều cấp) giờ đã được xử
    // lý ĐỆ QUY, đúng độ sâu, ở processLists() (gọi sớm hơn, ngay sau bước xử
    // lý enumEX/listEX phía trên) — itemize đổi ký tự đầu dòng theo độ sâu
    // (•, -, ◦, ‣...), enumerate vẫn a) b) c)... Xem chi tiết + TODO còn lại
    // (chưa dựng <ul>/<li> HTML thật, còn là text phẳng) ở comment phía trên
    // hàm processLists(). 4 dòng .replace bên dưới giờ chỉ còn là LƯỚI AN
    // TOÀN dự phòng cho trường hợp cú pháp lỗi (thiếu thẻ đóng khớp) khiến
    // processLists() phải dừng giữa chừng — bình thường không còn tác dụng gì
    // vì processLists() đã xử lý hết mọi itemize/enumerate/\item hợp lệ rồi.
    .replace(/\\begin\s*\{\s*itemize\s*\}/g, '\n')
    .replace(/\\end\s*\{\s*itemize\s*\}/g, '\n')
    .replace(/\\begin\s*\{\s*enumerate\s*\}\s*(\[[^\]]*\])?/g, '\n')
    .replace(/\\end\s*\{\s*enumerate\s*\}/g, '\n')
    // SỬA (khiếu nại: "• [•] Ta có..." — thừa "[•]" sau bullet của app): đề
    // thi hay gõ "\item[•]"/"\item[\bullet]" (tham số tùy chọn "[...]" theo
    // sau \item, đúng cú pháp LaTeX để tự đặt nhãn đầu dòng riêng) thay vì
    // "\item" trần. Regex CŨ chỉ khớp đúng chữ "\item" (nhờ "\b" chặn ở biên
    // từ NGAY SAU "item", tức dừng trước dấu "["), nên "[•]" phía sau bị bỏ
    // sót, giữ nguyên là chữ thô — cộng với bullet "• " app tự thêm ở đây =
    // hiện thành "• [•] " kép. Vì app luôn tự chọn ký tự đầu dòng riêng theo
    // độ sâu (bulletForDepth) chứ không dùng nhãn tùy chỉnh của tác giả, nên
    // tham số "[...]" này vô nghĩa với app — khớp và loại bỏ luôn nó cùng lúc
    // với "\item" (không có gì bên trong "[]" cần giữ lại).
    .replace(/\\item\b\s*(?:\[[^\]]*\])?/g, '\n• ')
    .replace(/\\lq\s*\\lq\s*/g, '"')
    .replace(/\\rq\s*\\rq\s*/g, '"')
    .replace(/\\allowdisplaybreaks/g, '')
    // \renewcommand{...}{...} / \newcommand{...}{...} (vd \renewcommand{\arraystretch}{1.2})
    // CHỈ có tác dụng khi biên dịch LaTeX ra PDF (chỉnh khoảng cách dòng trong
    // bảng...), không có ý nghĩa gì trên web -> là RÁC cần xoá hẳn nếu còn sót
    // (kể cả khi KHÔNG đứng trong dòng comment "%", ví dụ tác giả gõ trực tiếp
    // ngoài bảng). Trong page.tsx đã có xử lý tương tự cho riêng bên TRONG ô
    // bảng (cleanTableCell) — đây là bản áp dụng cho phần còn lại của văn bản.
    .replace(/\\(?:re)?newcommand\s*(?:\{\\[a-zA-Z]+\}|\\[a-zA-Z]+)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '')
    .replace(/\\noindent\b/g, '')                // \noindent chỉ có ý nghĩa canh lề khi in PDF
    .replace(/\\break\b/g, '')                   // \break là gợi ý ngắt trang LaTeX, không có ý nghĩa trên web
    .replace(/\\hfill(\s*\(\d+\))*/g, '')
    // Các lệnh CHỪA KHOẢNG TRẮNG khi in ấn (không có ý nghĩa trên web) —
    // \vspace{...}/\vspace*{...}, \hspace{...}/\hspace*{...} bỏ hẳn (kèm
    // tham số độ dài bên trong {}); \quad/\qquad và \bigskip/\medskip/\smallskip
    // đổi thành một dấu cách thường để không dính chữ liền nhau.
    .replace(/\\vspace\*?\{[^}]*\}/g, '')
    .replace(/\\hspace\*?\{[^}]*\}/g, '')
    .replace(/\\qquad\b/g, ' ')
    .replace(/\\quad\b/g, ' ')
    .replace(/\\(bigskip|medskip|smallskip)\b/g, '')
    // \, là lệnh chèn "khoảng trắng mảnh" (thin space) của LaTeX, ví dụ "44\,m^2".
    // Toán học thật sự đã được đóng băng ở bước 2A/2B/2C nên \, còn sót lại ở
    // đây chắc chắn nằm trong VĂN BẢN THƯỜNG (ngoài $...$) -> nếu giữ nguyên sẽ
    // in thô "\," ra ngoài. Đổi thành một dấu cách bình thường.
    .replace(/\\,/g, ' ')
    // SỬA LỖI (khiếu nại: "\{ \} vẫn còn hiện dấu \"): tác giả hay gõ "\{" và
    // "\}" ở NGOÀI công thức toán (trong văn bản thường) để escape dấu ngoặc
    // nhọn — vì "{" "}" trần vốn là ký tự nhóm lệnh của LaTeX, cần thêm "\"
    // phía trước mới ra được ký tự "{" "}" hiển thị thật. react-latex-next
    // KHÔNG hiểu quy ước escape này cho phần text thường (chỉ KaTeX bên trong
    // $...$ mới hiểu \{ \} là lệnh vẽ dấu ngoặc nhọn) -> in thô luôn cả dấu
    // "\" ra màn hình. Toán học thật đã được đóng băng thành placeholder
    // __MATH_BLOCK_n__ ở bước 2A/2B/2C phía trên rồi, nên "\{"/"\}" còn sót
    // lại tới đây chắc chắn nằm NGOÀI mọi công thức -> an toàn để bỏ hẳn dấu
    // "\", chỉ giữ lại ký tự ngoặc nhọn thật.
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}');

  // 3B. THU GỌN DÒNG TRỐNG THỪA (khiếu nại "khoảng cách quá xa giữa các
  // dòng/item/hình"): từ khi thêm class whitespace-pre-wrap để \item xuống
  // dòng đúng (\n• ...), MỌI dòng trống có sẵn trong file .tex gốc (tác giả
  // hay để trống 1-2 dòng giữa các \item, giữa đoạn văn và \imini{...} chèn
  // ảnh, v.v. — chỉ để dễ đọc mã nguồn, KHÔNG có ý nghĩa trình bày) giờ hiện
  // thành khoảng trắng thật to trên web, vì trước đây trình duyệt tự nuốt hết
  // \n thừa (không có pre-wrap) nên không ai để ý các dòng trống này. Coi bất
  // kỳ chuỗi 2+ dấu xuống dòng liên tiếp (kể cả xen khoảng trắng) là MỘT lần
  // xuống dòng duy nhất -> khoảng cách giữa mọi dòng/item/ảnh đều bằng nhau,
  // sát nhau, giống hệt cách LaTeX thật bỏ qua dòng trống thừa khi dàn trang.
  result = result.replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n');

  // 3C. THÊM MỚI (khiếu nại 17-7: "đã giảm my-[1.6px]/margin katex-display
  // xuống 1.6px nhưng khoảng cách vẫn to, không đổi gì cả"): bước 3B ở trên
  // chỉ gộp 2+ dấu \n LIÊN TIẾP thành 1 — nhưng với hình ([[HÌNH_TIKZ_n]]/
  // [[HÌNH_FILE_n]]) và công thức display ($$...$$, lúc này đang là placeholder
  // __MATH_BLOCK_i__ vì đã bị "đóng băng" ở bước 2A/2B/2C phía trên), CHỈ 1
  // dấu \n còn sót lại ngay sát trước/sau mốc cũng đã đủ gây ra khoảng trắng
  // thừa: cả hình lẫn $$ đều tự hiển thị dạng BLOCK (div/.katex-display tự
  // xuống dòng riêng, KHÔNG cần \n đứng trước/sau mới xuống dòng được) —
  // nên 1 dấu \n sát cạnh mốc bị whitespace-pre-wrap vẽ thành THÊM MỘT dòng
  // trống nữa (cao theo line-height, ví dụ ~20px), CHỒNG lên margin
  // my-[1.6px]/1.6px của chính khối đó. Kết quả: margin có giảm bao nhiêu đi
  // nữa thì dòng trống thừa do \n gây ra vẫn còn nguyên, nhìn như "không đổi
  // gì". Xử lý: xoá hẳn \n (và khoảng trắng ngang quanh nó) đứng NGAY SÁT
  // trước/sau các mốc hình/placeholder toán — để duy nhất margin
  // my-[1.6px]/1.6px (đã đồng bộ ở examRender.tsx và globals.css) quyết định
  // khoảng cách, không còn bị \n dư "ăn gian" thêm khoảng trắng nữa.
  //
  // SỬA LỖI (phát hiện khi test file S5-TT-SoNinhBinh-L2-2526.tex, câu có
  // \begin{itemize}: "...đường thẳng $y = 1$" đứng ngay trước 1 \item khác
  // -> bị dính liền thành "...$y = 1$•  Xét giao điểm..." mất hẳn \n ngăn
  // cách): BẢN CŨ liệt kê MỌI __MATH_BLOCK_\d+__ vào BLOCK_MARKER_RE, không
  // phân biệt DISPLAY ($$...$$, tự xuống dòng riêng — xoá \n cạnh nó ĐÚNG)
  // hay INLINE ($...$, nằm giữa dòng chữ như 1 từ bình thường — xoá \n cạnh
  // nó SAI, dính liền 2 câu/2 mục list). Giờ chỉ đưa vào BLOCK_MARKER_RE
  // đúng những INDEX ứng với khối DISPLAY (lấy từ mathBlockIsDisplay ghi
  // song song lúc đóng băng ở bước 2A) — khối INLINE giữ nguyên \n xung
  // quanh như văn bản thường.
  const displayMathIndices = mathBlockIsDisplay
    .map((isDisplay, i) => (isDisplay ? i : -1))
    .filter((i) => i !== -1);
  const mathBlockPattern = displayMathIndices.length
    ? `__MATH_BLOCK_(?:${displayMathIndices.join('|')})__`
    : null;
  const BLOCK_MARKER_RE = mathBlockPattern
    ? `(?:\\[\\[HÌNH_(?:TIKZ|FILE)_\\d+\\]\\]|${mathBlockPattern})`
    : '\\[\\[HÌNH_(?:TIKZ|FILE)_\\d+\\]\\]';
  result = result
    // \n (kèm khoảng trắng ngang) ngay TRƯỚC mốc -> xoá
    .replace(new RegExp(`[ \\t]*\\n[ \\t]*(?=${BLOCK_MARKER_RE})`, 'g'), '')
    // \n (kèm khoảng trắng ngang) ngay SAU mốc -> xoá
    .replace(new RegExp(`(${BLOCK_MARKER_RE})[ \\t]*\\n[ \\t]*`, 'g'), '$1');

  // 3D. LƯỚI AN TOÀN (khiếu nại: mục ĐẦU TIÊN của danh sách "Trường hợp
  // 1/2/3..." không đứng riêng dòng, dính liền ngay sau câu văn phía
  // trước, dù các mục sau vẫn xuống dòng đúng bình thường): "• " (bullet +
  // 1 dấu cách) CHỈ được sinh ra ở ĐÚNG 1 chỗ — thay "\item" bằng "\n• " ở
  // bước 3 phía trên — nên về nguyên tắc luôn có "\n" đứng trước nó. Nếu
  // vì bất kỳ lý do gì (một bước dọn/xoá \n nào đó ở TRÊN chạy trước, hiện
  // tại hoặc phát sinh về sau, vô tình nuốt mất đúng \n này) khiến nó bị
  // mất, đây là lưới an toàn cuối cùng: đảm bảo VĨNH VIỄN mọi "• " đều có
  // "\n" riêng, không phụ thuộc việc tìm & vá đúng chỗ đã làm mất nó ở
  // trên. Regex chỉ chèn khi CHƯA có "\n" ngay trước (an toàn, không lặp).
  // ĐỒNG BỘ với collapseBlankAroundImagePlaceholders trong textUtils.ts
  // (áp dụng lưới an toàn tương tự ở RENDER TIME, cho cả dữ liệu cũ đã lưu
  // sẵn trong DB trước khi có bản vá này).
  //
  // SỬA (khi thêm thụt lề nbsp cho mục lồng, xem bulletIndent() ở trên):
  // "• " của 1 mục itemize LỒNG giờ có thể đứng sau vài ký tự \u00A0 (thụt
  // lề) thay vì đứng NGAY sau \n — regex CŨ "([^\n])• " coi ký tự \u00A0
  // ngay trước "• " cũng là "ký tự thường đứng trước bullet, cần chèn \n
  // ngăn cách", vô tình chèn \n xen GIỮA thụt lề và bullet (tách rời thụt lề
  // ra thành 1 dòng trống phía trên, bullet lại tụt về sát lề trái phía
  // dưới — sai hoàn toàn). Sửa: dùng negative lookbehind, coi "\n" + thụt lề
  // nbsp (0 hoặc nhiều \u00A0) đứng ngay trước là ĐÃ hợp lệ (không chèn gì
  // thêm) — chỉ chèn \n khi lùi qua hết các \u00A0 (nếu có) vẫn KHÔNG gặp
  // \n nào.
  result = result.replace(/(?<!\n\u00A0*)\u00A0*• /g, (m) => '\n' + m);

  // 4. MỞ BĂNG TOÁN HỌC
  // Trả lại nguyên vẹn các khối toán học về vị trí cũ.
  // QUAN TRỌNG: phải dùng hàm callback (() => block) chứ không truyền thẳng
  // block dạng chuỗi — nếu không, các ký tự $$ / $1... bên trong block sẽ lại
  // bị String.replace() diễn giải như pattern đặc biệt và mất một dấu $.
  mathBlocks.forEach((block, i) => {
    result = result.replace(`__MATH_BLOCK_${i}__`, () => block);
  });

  // 5. DỌN RÁC CÒN SÓT TRONG TOÁN HỌC ĐÃ MỞ BĂNG (mục 3 — sửa lỗi \break rò
  // rỉ ra ngoài). Các lệnh này CHỈ có ý nghĩa khi in PDF, không phải cú
  // pháp toán học — nhưng nếu tác giả gõ chúng NGAY BÊN TRONG cặp $...$
  // (vd "$3\break 4$"), bước 2 (đóng băng toán học) đã cất nguyên vẹn cả
  // cụm đó đi TRƯỚC KHI bước 3 (lọc văn bản, nơi có .replace(/\\break\b/g,''))
  // chạy tới — nên \break sống sót qua bước 3, rồi bị mở băng y nguyên ở
  // bước 4 và in thô ra ngoài. Dọn lại 1 lượt NGAY TẠI ĐÂY (sau khi mở
  // băng) là an toàn tuyệt đối vì các lệnh này không có ý nghĩa toán học gì
  // cả — xoá ở bất kỳ vị trí nào (trong hay ngoài $...$) cũng không làm
  // sai lệch công thức thật.
  result = result
    .replace(/\\break\b/g, '')
    .replace(/\\allowdisplaybreaks\b/g, '')
    .replace(/\\noindent\b/g, '')
    .replace(/\\hfill(\s*\(\d+\))*/g, '')
    .replace(/\\vspace\*?\{[^}]*\}/g, '')
    .replace(/\\hspace\*?\{[^}]*\}/g, '');

  return result.trim();
}

// Chuyển \begin{itemchoice}...\end{itemchoice} với các \itemch thành danh sách a) b) c) d)...
function processItemChoice(text: string): string {
  let result = text;
  const letters = 'abcdefghijklmnopqrstuvwxyz';

  while (result.includes('\\begin{itemchoice}')) {
    const startIdx = result.indexOf('\\begin{itemchoice}');
    const endTag = '\\end{itemchoice}';
    const endIdx = result.indexOf(endTag, startIdx);
    if (endIdx === -1) break; // không tìm thấy thẻ đóng, dừng để tránh lặp vô hạn

    const innerStart = startIdx + '\\begin{itemchoice}'.length;
    const inner = result.substring(innerStart, endIdx);

    const parts = inner.split('\\itemch');
    // Phần tử đầu tiên (trước \itemch đầu) thường chỉ là khoảng trắng, bỏ qua
    const items = parts.slice(1).map((item, idx) => {
      const label = letters[idx] || String(idx + 1);
      return `${label}) ${item.trim()}`;
    });

    const replacement = '\n' + items.join('\n') + '\n';
    result = result.substring(0, startIdx) + replacement + result.substring(endIdx + endTag.length);
  }

  return result;
}

// TODO (yêu cầu người dùng 17-7): hiện \item/\begin{enumerate}/\begin{itemize}
// bị LÀM PHẲNG thành CHỮ THƯỜNG ngay tại đây (nối bằng '\n', gán nhãn
// "a) "/"b) "... hoặc bullet "• ") — hiển thị lại ở examRender.tsx/
// ExamBuilder.tsx qua whitespace-pre-wrap giống 1 đoạn văn bản bình
// thường. VÌ VẬY không có <div>/<li> nào để gắn margin/my-[1.6px] —
// khoảng cách giữa các mục a)/b)/c) hiện chỉ do line-height của khối text
// quyết định, KHÔNG chỉnh được bằng margin như hình/bảng/$$...$$.
// Người dùng muốn có margin trên/dưới + khoảng cách nội bộ = 1.6px cho
// item/enumerate/itemize giống hình/bảng — ĐÃ THẢO LUẬN nhưng CHƯA LÀM
// (người dùng chọn "chỉ ghi chú lại để sau"). Muốn làm cần đổi kiến trúc:
// (1) ở đây, thay vì nối các item bằng '\n', giữ lại thành khối có mốc
//     riêng (kiểu [[HÌNH_TIKZ_n]]) để không bị làm phẳng mất cấu trúc;
// (2) thêm nhánh xử lý mốc đó trong renderTikzAndFormulas/renderExamText
//     (lib/examRender.tsx) VÀ bản sao riêng trong ExamBuilder.tsx, bọc
//     từng khối bằng <ol>/<ul> thật + <li className="my-[1.6px]">;
// (3) kiểm tra lại examDocxExport.ts (xuất Word) có đang dựa vào format
//     text phẳng "a) .../• ..." hiện tại không, tránh vỡ khi đổi cấu trúc.
//
// Chuyển \begin{enumerate}...\end{enumerate} (danh sách liệt kê thông thường,
// KHÁC với \begin{itemchoice}) thành danh sách gán nhãn a) b) c) d)... —
// trước đây \item bên trong enumerate bị xử lý chung với itemize, chỉ ra
// bullet "• " trần, không đúng định dạng mặc định a) b) c)... mà đề thi
// thường mong muốn. Có đếm độ sâu (depth) để tìm đúng \end{enumerate} khớp
// với \begin{enumerate} đang xét, phòng trường hợp có enumerate lồng nhau.
// Tách nội dung bên trong 1 khối enumerate thành các mục con theo \item Ở
// ĐÚNG CẤP CAO NHẤT (top-level) — bất kỳ \item nào nằm bên trong một môi
// trường con lồng bên trong (itemize, enumerate, itemchoice, cases, array...)
// đều bị BỎ QUA (coi khối con đó là "mờ đục", giữ nguyên văn để xử lý sau bởi
// hàm tương ứng của nó). Trước đây dùng inner.split('\\item') ngây thơ nên
// \item của một itemize lồng bên trong 1 mục enumerate cũng bị tách ra và
// gán nhãn chữ cái a) b) c)... giống hệt mục cha — đây chính là lỗi
// "itemize thành a, b, c..." người dùng báo. Cách sửa: quét tuyến tính, đếm
// độ sâu \begin{...}/\end{...}, chỉ cắt tại \item khi độ sâu = 0.
// SỬA (khiếu nại: "• [•] Ta có..." — thừa "[•]" sau bullet của app, xem chú
// thích chi tiết ở lưới an toàn ".replace(/\\item\b\s*(?:\[[^\]]*\])?/..."
// phía trên): nhánh "\item" ở đây cũng chỉ khớp đúng chữ "\item" (nhờ "\b"),
// bỏ sót tham số tùy chọn "[...]" (vd "\item[•]") ngay sau — khiến "[•]" lọt
// qua thành nội dung item, hiện thừa cạnh bullet app tự thêm ở processLists().
// Khớp và bỏ luôn "[...]" (nếu có) cùng với "\item", đồng bộ với lưới an
// toàn phía trên — đây là ĐƯỜNG XỬ LÝ CHÍNH (processLists gọi hàm này), lưới
// an toàn phía trên chỉ chạy khi cú pháp lỗi khiến hàm này dừng giữa chừng.
function splitTopLevelItems(inner: string): string[] {
  const tokenRegex = /\\begin\{[a-zA-Z*]+\}|\\end\{[a-zA-Z*]+\}|\\item\b\s*(?:\[[^\]]*\])?/g;
  let depth = 0;
  let segStart = 0;
  const pieces: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(inner)) !== null) {
    const tok = match[0];
    if (tok.startsWith('\\begin{')) {
      depth++;
    } else if (tok.startsWith('\\end{')) {
      depth = Math.max(0, depth - 1);
    } else {
      // \item — chỉ cắt nếu đang ở cấp cao nhất (không lồng trong môi trường con)
      if (depth === 0) {
        pieces.push(inner.substring(segStart, match.index));
        segStart = match.index + tok.length;
      }
    }
  }
  pieces.push(inner.substring(segStart));
  // pieces[0] là phần trước \item đầu tiên (khoảng trắng thừa) -> bỏ qua
  return pieces.slice(1);
}

// MỞ RỘNG (yêu cầu người dùng: "itemize lồng itemize đổi ký tự đầu dòng"):
// processEnumerate() CŨ chỉ xử lý \begin{enumerate}, còn \begin{itemize} vẫn bị
// làm phẳng bằng regex đơn giản KHÔNG đếm độ sâu (xem lịch sử ở dưới, đoạn
// .replace(/\\begin\s*\{\s*itemize\s*\}/g, ...) — MỌI \item dù lồng bao
// nhiêu cấp itemize cũng ra CÙNG một ký hiệu "• ", khiến itemize lồng itemize
// bị làm phẳng thành các bullet NGANG HÀNG, mất hẳn quan hệ cha-con (khác
// với enumerate lồng nhau, vốn đã đếm độ sâu đúng qua splitTopLevelItems).
//
// GIẢI PHÁP: processLists() xử lý ĐỆ QUY cả itemize LẪN enumerate cùng lúc,
// lồng kiểu nào cũng đúng:
// - enumerate: vẫn gán nhãn a) b) c)... theo VỊ TRÍ trong danh sách (không
//   đổi theo độ sâu — enumerate lồng enumerate vẫn a) b) c) ở mọi cấp, đúng
//   hành vi enumerate lồng enumerate ĐÃ CÓ TỪ TRƯỚC, không đổi để tránh phá
//   vỡ những đề đã quen với cách hiển thị này).
// - itemize: gán KÝ TỰ ĐẦU DÒNG khác nhau theo ĐỘ SÂU itemize (bulletForDepth
//   ở dưới) — cấp 1 "• ", cấp 2 "- ", cấp 3 "◦ ", cấp 4 trở đi lặp lại "‣ " —
//   để phân biệt trực quan mục cha/mục con dù vẫn là text phẳng (chưa có
//   <ul>/<li> lồng thật, xem TODO cũ ở trên).
// Độ sâu itemize CHỈ tăng khi gặp thêm 1 tầng itemize lồng trong itemize;
// một itemize lồng TRONG enumerate (hoặc ngược lại) không cộng dồn độ sâu
// itemize của nhau — mỗi loại đếm độ sâu RIÊNG của chính nó, khớp với cách
// LaTeX gốc coi 2 loại môi trường là độc lập.
function bulletForDepth(depth: number): string {
  const bullets = ['•', '-', '◦', '‣'];
  return bullets[Math.min(depth, bullets.length - 1)];
}

// MỞ RỘNG (yêu cầu người dùng: "nếu lồng nhau thì cái con có thụt đầu dòng
// không, thụt 1 ký tự để thấy có thụt là được"): thêm THỤT ĐẦU DÒNG cho mục
// con so với mục cha khi itemize/enumerate lồng nhau, để phân biệt trực quan
// (song song với bulletForDepth ở trên vốn chỉ đổi KÝ TỰ đầu dòng của
// itemize, không đổi cho enumerate). Dùng RIÊNG 1 tham số listDepth — đếm
// gộp CẢ itemize LẪN enumerate (khác itemizeDepth ở trên chỉ đếm itemize) —
// vì mục đích ở đây là thụt lề theo ĐỘ SÂU LỒNG NÓI CHUNG (itemize lồng
// enumerate hay enumerate lồng itemize đều cần thụt, không riêng gì itemize
// lồng itemize). listDepth = số tầng danh sách (bất kỳ loại nào) đang bao
// bên ngoài mục hiện tại; mỗi tầng thụt thêm ĐÚNG 1 KÝ TỰ (đủ để "thấy có
// thụt", đúng yêu cầu, không thụt quá đà làm lệch khỏi khung câu hỏi hẹp).
//
// LỖI ĐÃ GẶP VÀ CÁCH SỬA: thử thụt bằng dấu cách thường (' ') trước, nhưng
// bước 3B phía dưới (THU GỌN DÒNG TRỐNG THỪA, regex /\n[ \t]*(?:\n[ \t]*)+/g)
// và bước 3C/an toàn tương tự coi khoảng trắng/tab đứng NGAY SAU 1 dấu \n là
// "khoảng trắng thừa cần dọn" — không phân biệt được đó là thụt lề CÓ CHỦ Ý
// mình vừa thêm hay chỉ là dấu vết định dạng .tex gốc — nên dấu cách thụt lề
// bị NUỐT MẤT mỗi khi có 2+ dấu \n liên tiếp trước mục con (rất hay xảy ra vì
// mỗi khối lồng processLists() sinh ra đều tự bọc thêm \n riêng). Khắc phục:
// dùng DẤU CÁCH KHÔNG NGẮT (\u00A0 non-breaking space) thay cho dấu cách
// thường — nhìn TRÊN MÀN HÌNH giống hệt dấu cách bình thường, nhưng không
// thuộc lớp ký tự [ \t] nên các regex dọn dẹp \n[ \t]* phía dưới (và ở
// textUtils.ts, dùng lại lúc RENDER cho cả dữ liệu cũ) không đụng tới, thụt
// lề sống sót nguyên vẹn qua mọi bước sau đó.
//
// LƯU Ý QUAN TRỌNG: 2 "lưới an toàn" chèn "\n" trước mọi "• " chưa đứng đầu
// dòng (parser.ts bước 3D VÀ collapseBlankAroundImagePlaceholders trong
// textUtils.ts) đã được SỬA ĐỒNG BỘ để coi "\n" + (nbsp thụt lề)* + "• " vẫn
// là ĐÃ đứng đầu dòng hợp lệ — nếu không, thụt lề (nbsp) đứng ngay trước "• "
// sẽ bị 2 lưới an toàn đó hiểu nhầm là "ký tự thường đứng trước bullet" và
// chèn thêm 1 "\n" xen giữa thụt lề với bullet, TÁCH RỜI thụt lề ra khỏi
// dòng chứa bullet (nhìn như dòng thụt lề trống phía trên, bullet lại đứng
// sát lề trái phía dưới) — xem sửa ở 2 nơi đó để biết chi tiết.
function bulletIndent(listDepth: number): string {
  return '\u00A0'.repeat(listDepth);
}

function processLists(text: string, itemizeDepth: number = 0, listDepth: number = 0): string {
  let result = text;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const itemizeBeginTag = '\\begin{itemize}';
  const itemizeEndTag = '\\end{itemize}';
  const enumBeginTag = '\\begin{enumerate}';
  const enumEndTag = '\\end{enumerate}';

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const itemizeIdx = result.indexOf(itemizeBeginTag);
    const enumIdx = result.indexOf(enumBeginTag);
    if (itemizeIdx === -1 && enumIdx === -1) break;

    const isItemize = enumIdx === -1 || (itemizeIdx !== -1 && itemizeIdx < enumIdx);
    const startIdx = isItemize ? itemizeIdx : enumIdx;
    const beginTag = isItemize ? itemizeBeginTag : enumBeginTag;
    const endTag = isItemize ? itemizeEndTag : enumEndTag;

    // Tìm thẻ đóng ĐÚNG bằng cách đếm độ sâu (giống processEnumerate cũ),
    // bỏ qua các cặp begin/end CÙNG LOẠI lồng bên trong để không cắt nhầm.
    let depth = 1;
    let cursor = startIdx + beginTag.length;
    let endIdx = -1;
    while (cursor < result.length) {
      const nextBegin = result.indexOf(beginTag, cursor);
      const nextEnd = result.indexOf(endTag, cursor);
      if (nextEnd === -1) break; // thiếu thẻ đóng, dừng để tránh lặp vô hạn
      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth++;
        cursor = nextBegin + beginTag.length;
      } else {
        depth--;
        cursor = nextEnd + endTag.length;
        if (depth === 0) { endIdx = nextEnd; break; }
      }
    }
    if (endIdx === -1) break;

    // Bỏ qua tham số tuỳ chọn dạng \begin{enumerate}[label=...] nếu có
    let innerStart = startIdx + beginTag.length;
    if (!isItemize && result[innerStart] === '[') {
      const closeBracket = result.indexOf(']', innerStart);
      if (closeBracket !== -1) innerStart = closeBracket + 1;
    }

    const inner = result.substring(innerStart, endIdx);
    // Chỉ tách \item ở cấp cao nhất của KHỐI NÀY — \item của môi trường con
    // lồng bên trong (itemize, enumerate, itemchoice, cases, array...) được
    // GIỮ NGUYÊN VẸN trong nội dung mục đó, xử lý ĐỆ QUY ngay bên dưới (chứ
    // không còn để dịp "lượt while sau" mới xử lý như bản cũ — nhờ vậy mới
    // biết được ĐỘ SÂU itemize chính xác để chọn đúng ký tự đầu dòng).
    const nextItemizeDepth = isItemize ? itemizeDepth + 1 : itemizeDepth;
    const nextListDepth = listDepth + 1;
    const indent = bulletIndent(listDepth);
    const items = splitTopLevelItems(inner).map((item, idx) => {
      const processedItem = processLists(item, nextItemizeDepth, nextListDepth).trim();
      if (isItemize) {
        return `${indent}${bulletForDepth(itemizeDepth)} ${processedItem}`;
      }
      const label = letters[idx] || String(idx + 1);
      return `${indent}${label}) ${processedItem}`;
    });

    const replacement = '\n' + items.join('\n') + '\n';
    result = result.substring(0, startIdx) + replacement + result.substring(endIdx + endTag.length);
  }

  return result;
}

// Bóc vỏ một lệnh LaTeX dạng "\tenLenh{nội dung}" — xoá tên lệnh và cặp {}
// bọc ngoài, GIỮ LẠI nguyên nội dung bên trong. Dùng cho các lệnh chỉ có tác
// dụng trình bày khi in PDF (căn giữa, đổi màu chữ...) nhưng không có ý nghĩa
// gì trên web, ví dụ \centerline{...}. Có đếm độ sâu ngoặc { } đúng (qua
// extractBraceGroupFrom) nên không bị cắt nhầm khi nội dung bên trong có
// ngoặc lồng nhau.
function unwrapBraceCommand(text: string, keyword: string): string {
  let result = text;
  while (result.includes(keyword)) {
    const idx = result.indexOf(keyword);
    const braceResult = extractBraceGroupFrom(result, idx + keyword.length);
    if (!braceResult) {
      // Không tìm thấy cặp {} hợp lệ theo sau -> chỉ còn cách xoá trơ tên
      // lệnh để tránh lặp vô hạn, phần còn lại giữ nguyên.
      result = result.substring(0, idx) + result.substring(idx + keyword.length);
      continue;
    }
    result = result.substring(0, idx) + braceResult.content + result.substring(braceResult.endIndex);
  }
  return result;
}

function parseCustomGomCumLệnh(text: string, keyword: string, openTag: string, closeTag: string): string {
  let result = text;
  while (result.includes(keyword)) {
    const idx = result.indexOf(keyword);
    const braceResult = extractBraceGroupFrom(result, idx + keyword.length);
    if (braceResult) {
      // Tác giả rất hay gõ dư một dấu "\\" (xuống dòng) NGAY TRƯỚC dấu đóng
      // "}" của \heva{...}/\hoac{...} (ví dụ "...B'D'\\}"), tạo ra một HÀNG
      // TRẮNG cuối cùng không có nội dung gì bên trong \begin{aligned}. KaTeX
      // / react-latex-next không chấp nhận hàng trắng cuối này -> báo lỗi cú
      // pháp và rơi về hiển thị CHỮ THÔ cho cả khối (đây chính là lỗi
      // "\heva đã thay nhưng không render được"). Cắt bỏ mọi dấu "\\" thừa ở
      // cuối nội dung trước khi bọc vào \begin{aligned}...\end{aligned}.
      //
      // LỖI TƯƠNG TỰ Ở ĐẦU: khi \heva{...}/\hoac{...} nằm trong một khối
      // \[ ... \] (hoặc $$...$$) và dòng đầu tiên bên trong bắt đầu bằng "&"
      // ngay sau dấu "{" mở đầu, bước xử lý \[ \] chạy TRƯỚC \heva/\hoac
      // (fixMissingRowBreaks, dùng để tự vá dấu "\\" CÒN THIẾU giữa các hàng)
      // hiểu nhầm "dòng đầu tiên bắt đầu bằng &" là một hàng nối tiếp còn
      // thiếu "\\" phía trước, nên tự chèn THÊM một dấu "\\" thừa NGAY SAU
      // "\heva{" — kết quả sau khi bung ra là "\begin{aligned}\\ &x=...",
      // tạo một HÀNG TRẮNG ĐẦU TIÊN (KaTeX vẫn chấp nhận, không báo lỗi,
      // nhưng đẩy cả hệ phương trình xuống, hở khoảng trắng xấu phía trên).
      // Cắt bỏ mọi dấu "\\" thừa ở ĐẦU nội dung, đối xứng với cách xử lý ở
      // cuối, để không còn hàng trắng đầu tiên nào lọt qua.
      const content = braceResult.content
        .replace(/^\s*(?:\\\\\s*)+/, '')
        .replace(/(?:\\\\\s*)+$/, '');
      const replacement = `${openTag}${content}${closeTag}`;
      result = result.substring(0, idx) + replacement + result.substring(braceResult.endIndex);
    } else {
      break;
    }
  }
  return result;
}

// Xác định loại câu hỏi dựa vào DẤU HIỆU THỰC SỰ có trong nội dung, KHÔNG dựa
// vào vị trí câu hỏi nằm ở phần nào của đề. \b đảm bảo không bắt nhầm
// "\choice" bên trong "\choiceTF" (vì giữa "e" và "T" không có ranh giới từ).
function detectQuestionType(body: string): 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' {
  // \choiceTFt là biến thể của \choiceTF (thường dùng cho câu Đúng/Sai trình
  // bày dạng bảng trong gói ex_test), CÙNG Ý NGHĨA phân loại "Đúng/Sai" và
  // cùng cấu trúc 4 nhóm {}{}{}{}. Dùng "t?" để cho phép có/không chữ "t"
  // ngay sau "choiceTF" TRƯỚC khi \b kiểm tra ranh giới từ — nếu không, \b
  // sẽ chặn mất vì giữa "F" và "t" đều là ký tự chữ (không có ranh giới).
  if (/\\choiceTFt?\b/.test(body)) return 'true_false';
  if (/\\choice\b/.test(body)) return 'multiple_choice';
  if (findShortAnsCommand(body) !== null) return 'short_answer';
  return 'essay'; // Không có dấu hiệu nào cả -> câu tự luận
}

// \immini{noiDung}{hinhVe} hiển thị 2 khối SONG SONG (thường là văn bản/đề bài
// bên trái và hình TikZ bên phải). TRƯỚC ĐÂY parser chỉ giữ lại nhóm ĐẦU TIÊN
// và VỨT BỎ nhóm thứ hai -> hình vẽ minh hoạ (placeholder [[HÌNH_TIKZ_n]]) bị
// mất hẳn khi render. Sửa lại để giữ CẢ HAI nhóm, nối bằng xuống dòng.
//
// SỬA THÊM (lỗi hình biến mất ở câu trắc nghiệm/đúng sai): với cấu trúc rất
// hay gặp \immini{câu dẫn ... \choiceTF{...}{...}{...}{...}}{hình vẽ}, nhóm
// THỨ NHẤT chứa CẢ câu dẫn LẪN các phương án, còn hình vẽ nằm ở nhóm THỨ HAI
// (đứng SAU \choiceTF/\choice trong văn bản gốc). Ở bước xử lý câu hỏi phía
// dưới (tìm choiceIdx = indexOf('\\choiceTF') rồi cắt cleanBody = phần TRƯỚC
// choiceIdx để làm câu dẫn), nếu vẫn nối hình vào CUỐI (sau \choiceTF) như cũ
// thì hình chắc chắn bị cắt bỏ theo phần "sau \choiceTF" bị vứt đi -> mất hẳn
// hình dù việc bóc tách 4 phương án vẫn đúng. Vì vậy: nếu nhóm thứ nhất có
// chứa \choiceTF hoặc \choice, phải chèn hình vẽ NGAY TRƯỚC lệnh đó (tức nằm
// trong câu dẫn, ở TRÊN các phương án) để nó nằm ở phần cleanBody còn được
// giữ lại. Trường hợp không có \choiceTF/\choice (câu tự luận, hoặc \immini
// nằm trong lời giải) vẫn giữ hành vi cũ: nối hình vào cuối nội dung.
function resolveImmini(text: string): string {
  let result = text;
  while (result.includes('\\immini')) {
    const idx = result.indexOf('\\immini');
    let afterCmd = idx + '\\immini'.length;
    // Bỏ qua tham số tuỳ chọn dạng \immini[...]{...}{...} nếu có
    if (result[afterCmd] === '[') {
      const closeBracket = result.indexOf(']', afterCmd);
      if (closeBracket !== -1) afterCmd = closeBracket + 1;
    }
    const firstBrace = extractBraceGroupFrom(result, afterCmd);
    if (!firstBrace) break; // cú pháp hỏng, dừng để tránh lặp vô hạn
    const secondBrace = extractBraceGroupFrom(result, firstBrace.endIndex);
    if (!secondBrace) {
      result = result.substring(0, idx) + firstBrace.content + result.substring(firstBrace.endIndex);
      continue;
    }

    const choiceMatch = /\\choiceTFt?\b|\\choice\b/.exec(firstBrace.content);
    let replacement: string;
    if (choiceMatch) {
      const cutIdx = choiceMatch.index;
      const stem = firstBrace.content.slice(0, cutIdx).trimEnd();
      const choicePart = firstBrace.content.slice(cutIdx);
      replacement = `${stem}\n\n${secondBrace.content}\n\n${choicePart}`;
    } else {
      replacement = `${firstBrace.content}\n\n${secondBrace.content}`;
    }
    result = result.substring(0, idx) + replacement + result.substring(secondBrace.endIndex);
  }
  return result;
}

// \begin{minipage}[vị trí]{bề rộng}...\end{minipage} là hộp nội dung LATEX
// dùng để đặt 2 (hoặc nhiều) khối CẠNH NHAU khi in PDF (kiểu "2 cột": văn bản
// bên trái + hình/bảng bên phải, hay ngược lại) — TƯƠNG TỰ mục đích của
// \immini nhưng là cú pháp \begin{...}\end{...} thô của LaTeX gốc, không phải
// một macro tuỳ biến. Trên web không có khái niệm "đặt cạnh nhau theo bề rộng
// cố định bằng pt/cm" -> chỉ cần BÓC VỎ (bỏ khai báo \begin{minipage}[..]{..}
// và \end{minipage}, GIỮ NGUYÊN nội dung bên trong) để tránh in thô ra ngoài,
// rồi để nội dung tự xuống dòng chồng lên nhau (giống cách \immini đang xử lý
// — nối 2 khối bằng "\n\n" thay vì dàn ngang, vì layout ngang cố định theo
// pt/cm của LaTeX không có ý nghĩa trên trình duyệt co giãn responsive).
// Đếm độ sâu begin/end để bắt đúng cặp NGOÀI CÙNG, phòng trường hợp bên
// trong một minipage lại có bảng/array cũng dùng \begin{...}\end{...}.
function resolveMinipage(text: string): string {
  const beginRe = /\\begin\{minipage\}/;
  let result = text;

  while (beginRe.test(result)) {
    const startIdx = result.search(beginRe);
    // Bỏ qua tham số vị trí tuỳ chọn [t]/[c]/[b] và bề rộng bắt buộc {...}
    // (vd \begin{minipage}[t]{0.45\textwidth}).
    let cursor = startIdx + '\\begin{minipage}'.length;
    if (result[cursor] === '[') {
      const closeBracket = result.indexOf(']', cursor);
      if (closeBracket !== -1) cursor = closeBracket + 1;
    }
    const widthBrace = extractBraceGroupFrom(result, cursor);
    const bodyStart = widthBrace ? widthBrace.endIndex : cursor;

    // Đếm độ sâu để tìm đúng \end{minipage} khớp với \begin{minipage} đang xét.
    const envRe = /\\begin\{minipage\}|\\end\{minipage\}/g;
    envRe.lastIndex = bodyStart;
    let depth = 1;
    let m: RegExpExecArray | null;
    let bodyEnd = -1;
    let tagEnd = -1;
    while ((m = envRe.exec(result)) !== null) {
      if (m[0] === '\\begin{minipage}') depth++;
      else {
        depth--;
        if (depth === 0) { bodyEnd = m.index; tagEnd = envRe.lastIndex; break; }
      }
    }
    if (bodyEnd === -1) {
      // Thiếu \end{minipage} khớp -> dừng để tránh lặp vô hạn, chỉ bóc khai báo begin.
      result = result.substring(0, startIdx) + result.substring(bodyStart);
      break;
    }

    const inner = result.substring(bodyStart, bodyEnd);
    result = result.substring(0, startIdx) + inner + '\n\n' + result.substring(tagEnd);
  }

  return result;
}

function parseAllQuestions(fullText: string): ParsedQuestion[] {
  const hasEx = fullText.includes('\\begin{ex}');
  const hasBt = fullText.includes('\\begin{bt}');

  if (!hasEx && !hasBt) {
    if (!fullText.trim()) return [];
    return [{
      id: 'preview_1',
      code: 'RAW_PREVIEW',
      content: cleanTextFormatting(fullText),
      options: [],
      solution: '',
      type: 'essay',
      label: 'Câu'
    }];
  }

  // TRƯỚC ĐÂY: chỉ tách theo \begin{ex}, nên MỌI câu hỏi khai báo trong môi
  // trường \begin{bt}...\end{bt} (thường dùng cho "Bài" thay vì "Câu") bị bỏ
  // sót hoàn toàn. BÂY GIỜ: quét cả 2 môi trường \begin{ex} và \begin{bt}
  // THEO ĐÚNG THỨ TỰ XUẤT HIỆN trong tài liệu, ghi nhớ nhãn tương ứng
  // ("Câu" cho ex, "Bài" cho bt) để hiển thị đúng ở giao diện.
  type RawBlock = { body: string; label: 'Câu' | 'Bài' };
  const rawBlocks: RawBlock[] = [];
  const envRe = /\\begin\{(ex|bt)\}/g;
  let envMatch: RegExpExecArray | null;
  while ((envMatch = envRe.exec(fullText)) !== null) {
    const envName = envMatch[1];
    const endTag = `\\end{${envName}}`;
    const bodyStart = envMatch.index + envMatch[0].length;
    const endIdx = fullText.indexOf(endTag, bodyStart);
    const body = endIdx !== -1 ? fullText.substring(bodyStart, endIdx) : fullText.substring(bodyStart);
    rawBlocks.push({ body, label: envName === 'bt' ? 'Bài' : 'Câu' });
    envRe.lastIndex = endIdx !== -1 ? endIdx + endTag.length : fullText.length;
  }

  const counters: Record<string, number> = { multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 };
  const idPrefix: Record<string, string> = { multiple_choice: 'p1', true_false: 'p2', short_answer: 'p3', essay: 'p4' };

  return rawBlocks.map(({ body: rawBody, label }) => {
    const questionBody = rawBody.trim();

    // --- Mã câu hỏi (code) ---
    // Đầu mỗi câu có thể có NHIỀU dòng chú thích bắt đầu bằng "%" liên tiếp,
    // ví dụ:
    //   %[Câu 23][KNTT, Mức độ 3]%[Dự án 2025 - Đề cấu trúc mới của Bộ theo,
    //   ...]%[2H2V2-2]
    // Trong đó chỉ nhóm [...]  CUỐI CÙNG khép kín đúng mới là MÃ CÂU thật sự;
    // các nhóm còn lại (số thứ tự câu, mức độ, tên dự án/người ra đề) không
    // cần giữ. TRƯỚC ĐÂY: regex bắt buộc MỌI %[...] phải đóng ngoặc "]" mới
    // được coi là phần chú thích cần xoá — nếu tên dự án bị thiếu dấu "]"
    // (lỗi gõ ở nguồn đề, ví dụ tên dự án quá dài bị ngắt dòng mà quên đóng
    // ngoặc) hoặc chỉ có một dấu "%" trơ trọi không kèm ngoặc vuông nào
    // (\begin{ex}%), regex cũ KHÔNG match -> cả dòng rác đó lọt vào nội dung
    // câu hỏi, hiển thị thô ra ngoài. BÂY GIỜ: coi MỌI DÒNG bắt đầu bằng "%"
    // ngay từ đầu câu là dòng chú thích cần xoá, BẤT KỂ ngoặc vuông có đóng
    // đúng hay không — chỉ dùng các nhóm [...] khép kín đúng để suy ra mã câu,
    // còn lại vẫn xoá sạch khỏi nội dung hiển thị.
    let code = '';
    let cleanBody = questionBody;
    const commentLines: string[] = [];
    let scanText = questionBody;
    while (true) {
      const withoutLeadingWs = scanText.replace(/^\s+/, '');
      const newlineIdx = withoutLeadingWs.indexOf('\n');
      const line = newlineIdx === -1 ? withoutLeadingWs : withoutLeadingWs.slice(0, newlineIdx);

      const isPercentLine = line.startsWith('%');
      // Dòng "rác" thẻ metadata đôi khi KHÔNG có dấu "%" ở đầu — lỗi gõ hay
      // gặp ở nguồn đề, ví dụ ngay sau \begin{ex} là
      // "[SGK 12 - KNTT, Mức độ 3]%[BG12-4IN1, Nguyễn Khánh Trọng]%[2D1V3-6]"
      // (nhóm ngoặc ĐẦU TIÊN thiếu dấu % phía trước, các nhóm sau mới có %).
      // TRƯỚC ĐÂY: chỉ coi dòng bắt đầu bằng "%" là rác nên trường hợp này lọt
      // thẳng vào nội dung câu hỏi, hiển thị thô cả dòng mã dự án ra ngoài.
      // BÂY GIỜ: nếu CẢ DÒNG chỉ gồm toàn các nhóm "[...]" nối tiếp nhau (có
      // hoặc không có "%" xen giữa) chứ không lẫn chữ nào khác, vẫn coi là
      // dòng rác cần xoá, bất kể có mở đầu bằng "%" hay không.
      const isBracketOnlyLine = line.includes('[') && /^(?:%?\[[^\]]*\])+$/.test(line);

      if (!isPercentLine && !isBracketOnlyLine) break;

      commentLines.push(isPercentLine ? line.slice(1) : line); // bỏ dấu % ở đầu dòng (nếu có)
      scanText = newlineIdx === -1 ? '' : withoutLeadingWs.slice(newlineIdx + 1);
    }
    if (commentLines.length > 0) {
      const combined = commentLines.join('');
      const groups = [...combined.matchAll(/\[([^\]]*)\]/g)].map(m => m[1]);
      if (groups.length > 0) code = groups[groups.length - 1].trim();
      cleanBody = scanText.trim();
    }

    let solution = '';
    const loigiaiIdx = cleanBody.indexOf('\\loigiai');
    if (loigiaiIdx !== -1) {
      const braceResult = extractBraceGroupFrom(cleanBody, loigiaiIdx + 8);
      if (braceResult) {
        solution = braceResult.content;
        cleanBody = cleanBody.substring(0, loigiaiIdx) + cleanBody.substring(braceResult.endIndex);
      }
    }

    // \shortans{...} là đáp số của câu trả lời ngắn, nằm trong đề bài.
    // Xoá khỏi nội dung câu hỏi. TRƯỚC ĐÂY gắn xuống cuối solution kèm nhãn
    // "Đáp số:" — BÂY GIỜ giữ riêng trong biến shortAnswer, để giao diện hiển
    // thị thành ô vuông riêng (4 ô liền kề) ở góc dưới trái của đề thay vì
    // nằm lẫn trong lời giải.
    // Lưu ý: phải kiểm tra \shortans TRƯỚC khi phân loại (để dấu hiệu \shortans
    // vẫn còn trong cleanBody lúc detectQuestionType chạy), nên ta chỉ XOÁ khỏi
    // cleanBody ở đây nhưng vẫn dùng biến hadShortAns để phân loại bên dưới.
    const shortansMatch = findShortAnsCommand(cleanBody);
    const hadShortAns = shortansMatch !== null;
    let shortAnswer = '';
    if (shortansMatch !== null) {
      const shortansIdx = shortansMatch.index;
      const braceResult = extractBraceGroupFrom(cleanBody, shortansIdx + shortansMatch.length);
      if (braceResult) {
        shortAnswer = braceResult.content.trim();
        cleanBody = cleanBody.substring(0, shortansIdx) + cleanBody.substring(braceResult.endIndex);
      }
    }

    // QUAN TRỌNG: phải "bóc vỏ" \immini NGAY TẠI ĐÂY, TRƯỚC khi tìm và cắt
    // cleanBody tại vị trí \choiceTF/\choice ở dưới. Đề gốc rất hay viết
    // \immini{câu dẫn ... \choiceTF{...}...}{hình vẽ} — hình vẽ (nhóm thứ 2
    // của \immini) đứng SAU \choiceTF trong văn bản. Nếu để resolveImmini
    // chạy muộn (như trước đây, chỉ bên trong cleanTextFormatting ở cuối),
    // logic cắt cleanBody bên dưới sẽ vứt bỏ toàn bộ phần "sau \choiceTF",
    // cuốn theo luôn cả hình vẽ -> hình biến mất hoàn toàn khi hiển thị dù
    // 4 phương án vẫn tách đúng. resolveImmini (đã sửa) sẽ tự chèn hình vào
    // ĐÚNG VỊ TRÍ ngay trước \choiceTF/\choice (nằm trong câu dẫn, trên các
    // phương án) nên gọi sớm ở đây là đủ.
    cleanBody = resolveImmini(cleanBody);

    // --- Phân loại câu hỏi dựa vào DẤU HIỆU THỰC SỰ, không dựa vào vị trí ---
    const type = hadShortAns ? 'short_answer' : detectQuestionType(cleanBody);

    let options: QuestionOption[] = [];
    if (type === 'true_false') {
      const choiceIdx = cleanBody.indexOf('\\choiceTF');
      if (choiceIdx !== -1) {
        options = extractConsecutiveOptions(cleanBody, choiceIdx + '\\choiceTF'.length, 4);
        cleanBody = cleanBody.substring(0, choiceIdx).trim();
      }
    } else if (type === 'multiple_choice') {
      const choiceIdx = cleanBody.indexOf('\\choice');
      if (choiceIdx !== -1) {
        options = extractConsecutiveOptions(cleanBody, choiceIdx + '\\choice'.length, 4);
        cleanBody = cleanBody.substring(0, choiceIdx).trim();
      }
    }

    counters[type]++;

    // SỬA (khiếu nại: "giữa nhãn Lời giải và list a) có khoảng trống lạ"):
    // TRƯỚC ĐÂY ở đây có đoạn chèn thêm 1 dấu "\n" vào ĐẦU parsedSolution nếu
    // nó bắt đầu bằng "a)"/"•", với lý do "để không bị dính liền với chữ
    // Lời giải: ở giao diện". Nhưng kiểm tra lại MỌI nơi hiển thị (cả 6 chỗ:
    // ExamBuilder.tsx và SolutionView.tsx, đủ 4 loại câu hỏi) đều đặt nhãn
    // "Lời giải:"/"Gợi ý lời giải:" trong 1 <div> RIÊNG (phần tử khối, tự
    // xuống dòng), rồi mới tới <div> chứa nội dung lời giải ngay sau —
    // 2 khối <div> khối luôn tự tách dòng, không thể "dính liền" dù nội dung
    // có hay không có "\n" ở đầu. Dấu "\n" thừa đó, qua class
    // "whitespace-pre-wrap" ở khung chứa, lại VẼ RA đúng 1 dòng trống nhìn
    // thấy được ngay trước "a)" — chính là khoảng trống bị khiếu nại. Bỏ hẳn
    // đoạn chèn "\n" này, không cần thay thế gì khác.
    const parsedSolution = cleanTextFormatting(solution);

    return {
      id: `${idPrefix[type]}_q${counters[type]}`,
      code,
      content: cleanTextFormatting(cleanBody),
      options,
      solution: parsedSolution,
      answer: shortAnswer ? extractAnswerDigits(shortAnswer) : undefined,
      type,
      label
    };
  });
}

// Tách mọi khối \begin{tikzpicture}...\end{tikzpicture} NGOÀI CÙNG khỏi văn
// bản, có tính đến trường hợp bên trong lại chứa \begin{tikzpicture}...
// \end{tikzpicture} LỒNG NHAU (một tikzpicture vẽ hình phụ đặt trong node của
// tikzpicture cha). Đếm độ sâu thay vì regex non-greedy để không bị cắt cụt
// ở \end{tikzpicture} đầu tiên gặp được (là của khối con, không phải khối cha).
function extractTikzBlocks(text: string): { cleanText: string; tikzBlocks: { id: string; code: string }[] } {
  const tikzBlocks: { id: string; code: string }[] = [];
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

    const fullBlock = text.slice(startIdx, cursor);
    const id = `[[HÌNH_TIKZ_${tikzBlocks.length + 1}]]`;
    tikzBlocks.push({ id, code: fullBlock });
    result += id;
    i = cursor;
  }

  return { cleanText: result, tikzBlocks };
}

function extractBraceGroupFrom(text: string, searchFromIndex: number) {
  let startBraceIdx = searchFromIndex;
  while (startBraceIdx < text.length && text[startBraceIdx] !== '{') {
    startBraceIdx++;
  }
  if (startBraceIdx >= text.length) return null;

  let depth = 1;
  let i = startBraceIdx + 1;
  while (depth > 0 && i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      // TRƯỚC ĐÂY: chỉ nhìn ĐÚNG 1 ký tự "\" ngay trước "{"/"}" để coi là
      // escape (vd "\{", "\}") rồi bỏ qua không tính độ sâu. LỖI: chuỗi
      // "\\}" (dấu xuống dòng LaTeX "\\" CỘNG THÊM một dấu "}" đóng nhóm
      // THẬT ngay sau) cũng bị nhận nhầm thành "\}" escaped (vì ký tự "\"
      // THỨ HAI đứng ngay trước "}"), khiến dấu "}" đóng nhóm thật bị NUỐT
      // MẤT, làm nhóm ngoặc bị coi là chưa đóng và quét tràn xa hơn rất
      // nhiều so với ý định (ví dụ \heva{...\\} bị lấn hết sang các câu c),
      // d) phía sau).
      // SỬA: đếm SỐ DẤU "\" LIÊN TIẾP ngay tại vị trí này. Theo quy ước
      // LaTeX, số backslash LẺ thì ký tự { hoặc } ngay sau đó mới thực sự
      // bị escape (là ký tự { } văn bản thường); số backslash CHẴN (như
      // "\\" = lệnh xuống dòng) nghĩa là các dấu "\" đã triệt tiêu theo
      // từng cặp, và { hoặc } ngay sau đó VẪN LÀ ngoặc thật, phải tính vào
      // độ sâu như bình thường.
      let j = i;
      while (j < text.length && text[j] === '\\') j++;
      const backslashCount = j - i;
      if (backslashCount % 2 === 1 && (text[j] === '{' || text[j] === '}')) {
        i = j + 1; // escape thật -> bỏ qua ký tự { hoặc } này, không tính độ sâu
        continue;
      }
      i = j;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    i++;
  }
  return {
    content: text.substring(startBraceIdx + 1, i - 1),
    endIndex: i
  };
}

function extractConsecutiveOptions(text: string, startIndex: number, count: number): QuestionOption[] {
  const options: QuestionOption[] = [];
  let currentIdx = startIndex;

  for (let i = 0; i < count; i++) {
    const braceResult = extractBraceGroupFrom(text, currentIdx);
    if (!braceResult) break;

    let optionText = braceResult.content.trim();
    let isCorrect = false;

    if (optionText.includes('\\True')) {
      isCorrect = true;
      optionText = optionText.replace(/\\True/g, '').trim();
    }

    options.push({
      text: cleanTextFormatting(optionText),
      isCorrect
    });
    currentIdx = braceResult.endIndex;
  }
  return options;
}
