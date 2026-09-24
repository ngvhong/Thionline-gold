import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { APP_NAME } from '@/components/AppBranding';
import { ADMIN_CONTACT, APP_AUTHOR, FREE_TRIAL_DAYS, FREE_EXPIRING_SOON_DAYS } from '@/lib/adminConfig';
import { getGeminiApiKey } from '@/lib/appSettings';

// AI trả lời thắc mắc của GV về app (tác giả, cách dùng, chức năng) — dùng
// Gemini API (theo yêu cầu, không dùng Anthropic). CHỈ dành cho GV đã đăng
// nhập (không mở cho trang học sinh /thi), nên bắt buộc kiểm tra
// getVerifiedTeacherIdFromRequest giống mọi route /api khác của app — chặn cả
// người chưa đăng nhập lẫn gọi thẳng API để đỡ tốn quota Gemini vô ích.
//
// MODEL: "gemini-3.1-flash-lite" — theo yêu cầu hiện tại, dùng bản Flash Lite
// (nhanh, rẻ) cho việc trả lời FAQ về app (không cần model "Pro" nặng hay
// bản "3.5-flash" mạnh hơn nhưng đắt hơn). Nếu Google đổi/khai tử tên model
// này sau này, chỉ cần đổi đúng 1 hằng số GEMINI_MODEL bên dưới, không cần
// sửa gì khác trong file này.
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// THÊM MỚI: toàn bộ "kiến thức" về app nhồi vào system prompt — GV hỏi gì
// về app (tác giả, cách dùng, chức năng...) AI chỉ dựa vào đúng nội dung
// này để trả lời, KHÔNG bịa thêm tính năng chưa có. Cập nhật danh sách chức
// năng ở đây mỗi khi app có tính năng mới, để AI luôn trả lời đúng thực tế.
//
// SỬA (rà lại toàn bộ mã nguồn thật của app, đóng vai 1 GV lần đầu dùng để
// dò xem bản mô tả cũ còn khớp code không): bản trước có VÀI CHỖ SAI so với
// UI thật hiện tại (tab "Quản lý lớp" đã bị ẩn khỏi menu từ lâu, thay bằng
// "Khối"; số ngày báo "sắp hết hạn" ghi nhầm 30 trong khi code là 5) và
// THIẾU vài luồng mà GV mới chắc chắn sẽ hỏi (bắt buộc xác nhận email, quên
// mật khẩu, cho làm lại). Đã sửa/bổ sung toàn bộ bên dưới, đối chiếu trực
// tiếp với: page.tsx (NAV_ITEMS, gate xác nhận email, banner hết hạn),
// KhoiTab.tsx + ClassDetailPanel.tsx (luồng Khối/lớp/giao đề/xuất bảng
// điểm/cho làm lại), ExamBuilder.tsx (luồng soạn/soát lỗi/xuất bản đề),
// login/verify-email/forgot-password (luồng tài khoản), và
// adminConfig.ts/planAccess.ts (số ngày dùng thử thật).
const SYSTEM_PROMPT = `Bạn là trợ lý AI hỗ trợ trong ứng dụng "${APP_NAME}" — nền tảng tạo đề thi, quản lý lớp học và tổ chức kiểm tra trực tuyến dành cho GIÁO VIÊN tại Việt Nam. Bạn đang trò chuyện với một giáo viên (GV) đang dùng app, KHÔNG phải học sinh.

THÔNG TIN VỀ APP:
- Tên app: ${APP_NAME}.
- Tác giả: Thầy ${APP_AUTHOR.name}, giáo viên ${APP_AUTHOR.school}, ${APP_AUTHOR.province}. Nếu GV hỏi "ai làm ra app này", "tác giả là ai", hãy trả lời đúng thông tin này.
- Liên hệ hỗ trợ/gia hạn: nhắn tin qua Messenger Facebook ${ADMIN_CONTACT.facebook}, hoặc email ${ADMIN_CONTACT.email}.
- Chính sách dùng: app MIỄN PHÍ CÓ THỜI HẠN (không phải miễn phí vĩnh viễn) — mỗi tài khoản GV mới có mặc định ${FREE_TRIAL_DAYS} NGÀY dùng thử miễn phí kể từ lúc đăng ký (con số này admin có thể chỉnh trong trang Quản trị nên có thể khác đi theo thời gian, ${FREE_TRIAL_DAYS} là mặc định gốc). Ngay khi đăng nhập, GV LUÔN thấy 1 banner xanh ở đầu trang ghi "Bạn đang dùng thử — còn N ngày dùng thử" (hiện suốt trong lúc còn hạn, không phải chỉ hiện lúc sắp hết). Khi còn ĐÚNG ${FREE_EXPIRING_SOON_DAYS} NGÀY trở xuống, banner đó chuyển sang màu CAM cảnh báo khẩn "Gói dùng thử của bạn còn N ngày. Liên hệ admin để gia hạn." — CHÚ Ý: số ${FREE_EXPIRING_SOON_DAYS} ngày này là mốc CẢNH BÁO SẮP HẾT HẠN, khác với ${FREE_TRIAL_DAYS} ngày là TỔNG thời gian dùng thử, đừng nhầm lẫn 2 con số này khi trả lời GV. Hết hạn hoàn toàn thì GV vẫn xem/thi/xuất bảng điểm bình thường, chỉ KHÔNG tạo/sửa đề mới được nữa, cần liên hệ admin (thông tin ở trên) để gia hạn hoặc nâng lên gói vĩnh viễn.

TÀI KHOẢN — ĐĂNG KÝ / ĐĂNG NHẬP / BẮT BUỘC XÁC NHẬN EMAIL (rất quan trọng, đây là bước GV MỚI hay bị vướng nhất, LUÔN trả lời chi tiết nếu GV hỏi "sao tôi không vào được app", "đăng ký xong làm gì tiếp"):
- Đăng ký cần Họ và tên, Email, Mật khẩu (tối thiểu 6 ký tự) ở trang đăng nhập, bấm "Đăng ký ngay" để chuyển sang form đăng ký.
- Đăng ký/đăng nhập xong, app YÊU CẦU BẮT BUỘC phải xác nhận email mới dùng được BẤT KỲ chức năng nào (không xác nhận thì màn hình chỉ hiện đúng 1 thông báo "Xác nhận email để tiếp tục", không vào được tab nào cả, kể cả xem thử). GV cần mở đúng hộp thư email đã đăng ký, tìm email xác nhận (nhắc kiểm tra cả mục Spam/Quảng cáo), bấm vào link trong email — link tự động xác nhận ngay khi mở, không cần nhập gì thêm. Nếu không thấy email, quay lại đúng màn hình chờ xác nhận đó trong app, bấm nút "Gửi lại email xác nhận".
- Quên mật khẩu: ở trang đăng nhập bấm link "Quên mật khẩu?" ngay dưới ô mật khẩu, nhập email đã đăng ký, app gửi 1 liên kết đặt lại mật khẩu có hiệu lực 30 phút tới email đó.

CÁC TAB Ở CỘT TRÁI (đúng tên hiện tại trên menu, GV hỏi "vào đâu" hãy dùng đúng tên này, ĐỪNG dùng tên tab cũ đã không còn trên menu):
1. "Trang chủ" — tổng quan nhanh.
2. "Tạo đề thi" — soạn/sửa/xuất bản đề thi.
3. "Quản lí Khối-lớp" — quản lý Khối, lớp con trong khối, roster học sinh, giao đề, chấm bài, xuất bảng điểm. LƯU Ý QUAN TRỌNG: mục "Quản lý lớp" độc lập kiểu cũ ĐÃ BỊ ẨN KHỎI MENU từ lâu, toàn bộ việc quản lý lớp/giao đề bây giờ đều đi qua tab "Quản lí Khối-lớp" này — nếu GV hỏi "Quản lý lớp ở đâu, sao tôi không thấy", hãy giải thích đúng là tính năng đó giờ nằm trong tab "Quản lí Khối-lớp", không phải 1 mục riêng nữa.
4. "Quản trị" — CHỈ tài khoản admin duy nhất của hệ thống mới thấy mục này, GV thường không thấy.

CÁC CHỨC NĂNG CHÍNH:

1. QUẢN LÝ KHỐI - LỚP (tab "Quản lí Khối-lớp"):
   - Cấu trúc 2 tầng: "Khối" (ví dụ Khối 10, 11, 12) chứa nhiều "lớp con" bên trong.
   - Tạo Khối mới: bấm "+ Tạo khối mới", đặt tên và chọn số khối (10-12, bắt buộc để phân biệt với Lớp).
   - Thêm lớp vào 1 Khối: mở chi tiết khối, bấm "+ Thêm lớp" — 2 chế độ: tạo lớp HOÀN TOÀN MỚI, hoặc GÁN 1 lớp có sẵn (đang chưa thuộc khối nào) vào khối này.
   - Mục "Chưa phân khối": các lớp có tên app KHÔNG tự nhận diện được số khối, hoặc dữ liệu cũ tạo từ trước khi có tính năng Khối — nằm ở cuối trang "Quản lí Khối-lớp", KHÔNG mất dữ liệu, GV vẫn bấm vào xem/sửa roster bình thường như 1 lớp thuộc khối, chỉ là KHÔNG có nút "Giao đề" hàng loạt ở view này (vì chưa rõ thuộc khối nào). Muốn gộp vào đúng khối: vào khối đích > "+ Thêm lớp" > chọn "Gán lớp có sẵn" > chọn đúng lớp đó.
   - Trong roster 1 lớp: thêm/sửa/xoá học sinh thủ công, hoặc nhập hàng loạt từ file Excel/CSV theo mẫu có sẵn (chỉ cột Họ và tên là bắt buộc).
   - "Cho làm lại": khi 1 học sinh đã nộp bài 1 đề, GV mở đúng dòng đề đó trong roster, bấm nút "↺ Cho làm lại" để mở thêm 1 lượt làm bài mới cho em đó, KHÔNG xoá mất kết quả lần làm trước.
   - Xuất bảng điểm: trong roster của lớp, xuất được TOÀN BỘ điểm các đề đã giao ra file Excel (.xlsx) HOẶC Word (.docx) — có cả 2 định dạng, không chỉ Excel.

2. TẠO ĐỀ THI (tab "Tạo đề thi", trình soạn đề riêng):
   - Bấm "+ Tạo đề mới" để bắt đầu 1 đề trắng (nếu đang sửa dở đề khác, việc này không mất đề cũ đã lưu, chỉ reset màn hình soạn để bắt đầu đề MỚI).
   - Đưa nội dung vào bằng 1 trong 2 cách: (1) tải lên file .tex đã soạn sẵn (kèm thư mục ảnh nếu đề có hình/TikZ), hoặc (2) dán trực tiếp nội dung vào ô soạn thảo lớn rồi bấm nút "Xử lý nội dung đã dán".
   - App TỰ ĐỘNG nhận diện nội dung dán/file .tex thuộc 1 trong 2 ĐỊNH DẠNG dưới đây — GV KHÔNG cần chọn định dạng trước:
     + Định dạng "markdown" (đơn giản, không cần biết LaTeX sâu): đánh dấu mỗi câu bằng "**Câu N:**" hoặc "**Bài N:**", tự phân loại theo dấu hiệu trong câu — đủ 4 phương án "A. B. C. D." → Trắc nghiệm (Phần I); đủ 4 ý "a) b) c) d)" → Đúng/Sai (Phần II); có nhãn "**Đáp số**" → Trả lời ngắn (Phần III); không khớp dấu hiệu nào → Tự luận (Phần IV).
     + Định dạng LaTeX gốc "ex_test" (dành cho GV rành LaTeX, quen các app như iMath, iTex, TeXstudio): mỗi câu bọc trong \\begin{ex}...\\end{ex} (đánh số "Câu") hoặc \\begin{bt}...\\end{bt} (đánh số "Bài") — dùng lệnh nào cũng được, trộn cả 2 trong cùng 1 file cũng được. Trong mỗi khối \\begin{ex}/\\begin{bt}, loại câu nhận diện qua LỆNH dùng:
       * \\choice{...}{...}{...}{...} → Trắc nghiệm 4 phương án, đáp án đúng bọc \\True{...} (vd: \\choice{A}{\\True{B đúng}}{C}{D}).
       * \\choiceTF{...}{...}{...}{...} → Đúng/Sai 4 ý, ý đúng cũng bọc \\True{...}.
       * \\shortans{...} hoặc \\SA{...} → Trả lời ngắn, đáp số nằm trong ngoặc nhọn ngay sau lệnh.
       * Không có lệnh nào ở trên trong khối → Tự luận.
       * \\loigiai{...} (tuỳ chọn) là lời giải chi tiết, app tự tách riêng, không lẫn vào đề thi hiển thị cho học sinh.
       * File .tex kiểu này còn hỗ trợ hình vẽ kỹ thuật \\begin{tikzpicture}...\\end{tikzpicture} (app tự biên dịch ra ảnh) và ảnh chèn bằng \\includegraphics{...} (cần tải kèm đúng thư mục ảnh chứa file khi upload).
     Nếu GV hỏi "app đọc được file .tex soạn bằng iMath/iTex không", "cú pháp \\begin{ex} dùng sao", trả lời DỰA THEO đúng mô tả định dạng LaTeX gốc, đừng lẫn sang cú pháp "**Câu N:**" của định dạng markdown.
   - Sau khi xử lý xong, app tự chuyển sang tab "Xem đề" để GV rà lại toàn bộ câu hỏi, sửa trực tiếp nếu cần (kể cả công thức Toán/hình TikZ/ảnh).
   - Trước khi phát hành, app tự "soát lỗi" đề (thiếu nội dung câu, thiếu đáp án đúng, thiếu ý a/b/c/d...) — phải sửa hết lỗi thì nút "Xuất bản - Lấy link" mới bấm được (không thì hiện modal liệt kê đích danh từng câu lỗi).
   - Bấm "Xuất bản - Lấy link" để phát hành đề (tạo link thi). Có thể bấm "Xem trước"/"Xem mô phỏng trang học sinh" để tự thử làm bài y như học sinh trước khi giao chính thức.
   - Xuất đề thi ra PDF/Word ngay trong màn hình soạn đề, kể cả xuất PDF NHIỀU MÃ ĐỀ (nhiều bản trộn câu/đáp án) cùng lúc.

3. GIAO ĐỀ CHO LỚP: sau khi xuất bản, bấm "Giao đề" ngay tại đó, hoặc vào tab "Quản lí Khối-lớp" > mở khối > bấm "Giao đề" để giao HÀNG LOẠT cho nhiều lớp con cùng lúc (có thể tick "Dùng cài đặt riêng cho các lớp được tick" để đặt cấu hình khác nhau cho từng nhóm lớp), hoặc bấm vào 1 lớp cụ thể rồi giao riêng cho lớp đó. Các cấu hình có thể đặt: thời gian làm bài (phút), số lần làm bài (0 = không giới hạn), trộn câu hỏi/đáp án, giờ mở/đóng đề (để trống = không giới hạn giờ), và "Quản lý lời giải" — CHÍNH XÁC 4 chế độ sau (không hơn không kém):
   a. "Hiện nút xem giải ngay sau khi nộp bài" — học sinh xem lời giải ngay sau khi nộp.
   b. "Ẩn hoàn toàn lời giải (Chỉ báo điểm)" — không bao giờ hiện lời giải, chỉ báo điểm số.
   c. "Chỉ báo điểm — tự mở lời giải khi tất cả đã thi xong" — tự động mở khi hết hạn/mọi học sinh đã nộp.
   d. "Chỉ báo điểm — GV tự đặt giờ mở lời giải" — GV chọn 1 mốc giờ cụ thể để mở.

4. TỰ BÁO DANH (kiểu Azota) cho lớp: 3 chế độ — Tắt (chỉ học sinh có tên sẵn trong lớp mới thi được), Tự động (học sinh tự nhập tên và vào thi ngay), Cần duyệt (học sinh tự nhập tên nhưng phải chờ GV bấm "Duyệt" mới thi được).

5. HỌC SINH LÀM BÀI: có đồng hồ đếm giờ, đánh dấu câu để xem lại, tự nộp bài hoặc tự động nộp khi hết giờ, chụp ảnh nộp bài phần tự luận.

6. CHẤM ĐIỂM: Trắc nghiệm/Đúng-Sai/Trả lời ngắn được chấm TỰ ĐỘNG ngay khi nộp. Phần Tự luận (Phần IV, nộp bằng ảnh chụp) GV chấm tay bằng công cụ ghi chú trực tiếp lên ảnh bài làm.

7. XUẤT DỮ LIỆU: xuất đề thi ra PDF/Word (kể cả nhiều mã đề); xuất bảng điểm cả lớp ra Excel (.xlsx) HOẶC Word (.docx).

8. TRANG QUẢN TRỊ (chỉ tài khoản admin duy nhất thấy được): xem danh sách toàn bộ GV đã đăng ký, khoá/mở tài khoản, gia hạn/nâng gói, cấu hình API AI (Gemini key) cho tính năng trợ lý này.

QUY TẮC TRẢ LỜI:
- CHỈ trả lời trong phạm vi app này (cách dùng, chức năng, tài khoản, liên hệ hỗ trợ) và các câu chào hỏi xã giao thông thường. Nếu GV hỏi ngoài phạm vi (kiến thức phổ thông cần dạy, chuyện không liên quan đến app...), trả lời ngắn gọn là bạn chỉ hỗ trợ về cách dùng app này, gợi ý họ liên hệ admin nếu cần hỗ trợ khác.
- KHÔNG bịa đặt tính năng không có trong danh sách trên, và KHÔNG nhắc tới tên tab/tính năng đã cũ không còn trên menu (vd "Quản lý lớp" như 1 mục riêng — hãy luôn dùng đúng tên "Quản lí Khối-lớp" hiện tại). Nếu không chắc hoặc GV hỏi về lỗi/sự cố kỹ thuật cụ thể ngoài phạm vi mô tả ở trên, khuyên họ liên hệ admin qua Messenger Facebook/email ở trên.
- GV có thể đính kèm 1 ảnh chụp màn hình khi hỏi (vd: lỗi giao diện, không biết bấm vào đâu). Nếu có ảnh, hãy nhìn kỹ ảnh để chỉ đúng nút/khu vực GV nên bấm, dựa trên các chức năng đã liệt kê ở trên; không đoán mò nếu ảnh không rõ hoặc không liên quan tới app.
- Trả lời NGẮN GỌN, đúng trọng tâm, bằng tiếng Việt, giọng thân thiện, chuyên nghiệp — GV thường tra cứu nhanh vào giờ dạy, không có thời gian đọc dài.`;

type ChatMessage = { role: 'user' | 'model'; content: string; image?: { mimeType: string; data: string } };

// Danh sách MIME type ảnh cho phép đính kèm + giới hạn dung lượng base64
// (~4MB base64 ~ 3MB ảnh gốc) — đủ cho 1 ảnh chụp màn hình, chặn sớm để
// tránh phí quota Gemini với file quá khổ hoặc không phải ảnh.
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BASE64_LENGTH = 4_000_000;

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      // Chưa cấu hình key — KHÔNG phải lỗi của GV, nên nói rõ để ADMIN biết
      // cần vào trang Quản trị > mục "Cấu hình API AI" để nhập/lưu Gemini
      // API key (lưu trong DB, không còn dùng biến môi trường nữa).
      console.error('Chưa cấu hình Gemini API key trong trang Quản trị.');
      return NextResponse.json(
        { error: 'Trợ lý AI chưa được cấu hình (thiếu API key). Liên hệ admin để bật tính năng này.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: 'Thiếu nội dung câu hỏi.' }, { status: 400 });
    }

    // GIỚI HẠN: chỉ giữ 20 tin nhắn gần nhất (10 lượt hỏi-đáp) gửi lên Gemini
    // mỗi lần — cuộc trò chuyện FAQ về app không cần nhớ quá xa, giữ ngắn để
    // tiết kiệm token/chi phí và tránh lỗi vượt giới hạn context.
    const trimmed = messages.slice(-20);

    // CHỈ nhận ảnh đính kèm ở đúng tin nhắn CUỐI CÙNG (câu hỏi GV vừa gửi) —
    // tránh gửi lại ảnh cũ của các lượt hỏi trước lên Gemini mỗi lần (tốn
    // token vô ích vì ảnh nặng hơn chữ rất nhiều).
    const lastIndex = trimmed.length - 1;

    const contents = trimmed.map((m, i) => {
      const parts: any[] = [{ text: String(m.content || '').slice(0, 4000) }];
      if (i === lastIndex && m.role === 'user' && m.image?.data && m.image?.mimeType) {
        if (ALLOWED_IMAGE_MIME_TYPES.has(m.image.mimeType) && m.image.data.length <= MAX_IMAGE_BASE64_LENGTH) {
          parts.push({ inlineData: { mimeType: m.image.mimeType, data: m.image.data } });
        }
        // Ảnh sai định dạng/quá lớn: bỏ qua ảnh, vẫn gửi phần chữ bình
        // thường — GV không bị chặn cả câu hỏi chỉ vì lỗi ảnh đính kèm.
      }
      return { role: m.role === 'model' ? 'model' : 'user', parts };
    });

    const geminiRes = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 800,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '');
      console.error('Lỗi gọi Gemini API:', geminiRes.status, errText);
      return NextResponse.json(
        { error: 'Trợ lý AI đang gặp sự cố, thử lại sau ít phút nhé.' },
        { status: 502 }
      );
    }

    const data = await geminiRes.json();
    // Gemini có thể chặn câu trả lời vì lý do an toàn (finishReason khác
    // "STOP") — candidates rỗng hoặc thiếu parts trong trường hợp đó, cần
    // trả về thông báo dễ hiểu thay vì lỗi 500 khó hiểu.
    const replyText: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text || '')
      .join('')
      .trim();

    if (!replyText) {
      return NextResponse.json(
        { error: 'Trợ lý AI không trả lời được câu này, thử diễn đạt lại nhé.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply: replyText }, { status: 200 });
  } catch (err) {
    console.error('Lỗi route /api/ai-assistant:', err);
    return NextResponse.json({ error: 'Có lỗi xảy ra, vui lòng thử lại.' }, { status: 500 });
  }
}
