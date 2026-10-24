'use client';

import { useEffect, useRef, useState } from 'react';
import { ADMIN_CONTACT, APP_AUTHOR } from '@/lib/adminConfig';

type ChatImage = { mimeType: string; data: string; previewUrl: string };
type ChatMessage = { role: 'user' | 'model'; content: string; image?: ChatImage };

// THÊM MỚI: widget chat AI nổi góc màn hình — GV bấm vào hỏi bất cứ điều gì
// về app (tác giả, cách dùng, chức năng...). CHỈ gắn ở app chính của GV
// (page.tsx), KHÔNG gắn ở trang học sinh /thi/[examId] theo đúng phạm vi đã
// chốt. Gọi API nội bộ /api/ai-assistant (route đó mới là nơi thật sự gọi
// Gemini) — component này không cầm API key, không gọi thẳng Gemini từ
// trình duyệt (lộ key ngay lập tức nếu làm vậy).
// Icon robot nét mảnh (line-art), dùng cho nút nổi — vẽ tay bằng path/circle
// gốc, không phải icon nhân vật có bản quyền.
function RobotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* ăng-ten */}
      <path d="M12 3v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="2.3" r="0.9" stroke="currentColor" strokeWidth="1.2" />
      {/* đầu robot */}
      <rect x="5" y="6.2" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="1.4" />
      {/* mắt */}
      <circle cx="9.2" cy="11.2" r="1.1" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="14.8" cy="11.2" r="1.1" stroke="currentColor" strokeWidth="1.3" />
      {/* miệng dạng lưới nhỏ */}
      <path d="M9.5 14h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* ăng-ten/tai hai bên */}
      <path d="M5 9.5H3.3M19 9.5h1.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* cổ + thân dưới nhỏ gợi ý */}
      <path d="M9 16v1.2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M16.5 6.5 8.7 14.3a2.5 2.5 0 1 0 3.54 3.54l7.09-7.09a4.5 4.5 0 1 0-6.36-6.36L5.88 11.5a6.5 6.5 0 1 0 9.19 9.19"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const WELCOME_MESSAGE: ChatMessage = {
  role: 'model',
  content: 'Chào Thầy/Cô 👋 Em là trợ lý AI của app. Thầy/Cô bấm 1 câu hỏi gợi ý bên dưới để có trả lời ngay, hoặc gõ câu hỏi khác để em trả lời trực tiếp nhé.',
};

// THÊM MỚI: câu hỏi thường gặp + câu trả lời SOẠN SẴN — bấm là hiện ngay,
// KHÔNG gọi API Gemini (nhanh, không tốn quota cho những câu hỏi lặp đi lặp
// lại). Nội dung khớp với SYSTEM_PROMPT ở route /api/ai-assistant, nếu app
// có tính năng mới thì sửa đồng thời cả 2 chỗ để không bị lệch thông tin.
//
// SỬA (rút gọn theo yêu cầu): trước đây 14 câu hỏi gợi ý — quá nhiều, GV
// ngại đọc/chọn. Giảm còn ĐÚNG 5 câu hỏi cốt lõi nhất, xếp theo đúng thứ tự
// GV mới cần biết: (1) quy trình tạo đề & giao bài — viết dạng SƠ ĐỒ mũi tên
// (đọc lướt 5 giây là hiểu), không viết văn xuôi dài; (2) quy trình cài đặt
// đề thi — cũng dạng sơ đồ; (3) đầu vào .tex theo gói ex_test (GV đã có sẵn
// nguồn LaTeX hoặc đang soạn bằng iMath/xtex/itex dùng thẳng được); (4) tác
// giả/liên hệ hỗ trợ; (5) chính sách miễn phí có thời hạn.
// Câu 1 và 2 CHỦ Ý viết ngắn (sơ đồ), cuối mỗi câu ghi rõ "Chi tiết hơn gõ
// câu hỏi hỏi em nhé" để GV cần sâu hơn thì tự gõ hỏi AI (route
// /api/ai-assistant), không nhồi hết chi tiết vào câu trả lời soạn sẵn.
const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'Quy trình tạo đề & giao bài (tóm tắt nhanh)',
    answer:
      '🏫 Tạo lớp (tab "Quản lí Khối-lớp", thêm học sinh vào lớp) → 📄 Soạn/tải đề (.tex hoặc dán nội dung) → 🔍 Xem đề, sửa lỗi soát đề → 🚀 Xuất bản - Lấy link → 👥 Giao đề cho lớp/khối → ✅ Học sinh vào thi bằng link được giao.\n\nChi tiết hơn ở từng bước, Thầy/Cô gõ câu hỏi hỏi em nhé!',
  },
  {
    question: 'Quy trình cài đặt đề thi (tóm tắt nhanh)',
    answer:
      '⏱ Thời gian làm bài → 🔁 Số lần được làm → 🕐 Giờ mở/đóng đề → 🔀 Trộn câu hỏi/đáp án (tuỳ chọn) → 👁 Khi nào học sinh xem lời giải (ngay khi nộp / ẩn hoàn toàn / tự mở khi cả lớp thi xong / GV tự đặt giờ).\n\nChi tiết hơn từng mục, Thầy/Cô gõ câu hỏi hỏi em nhé!',
  },
  {
    question: 'Quy trình chấm tự luận (Phần IV) (tóm tắt nhanh)',
    answer:
      '📷 Học sinh chụp ảnh bài làm nộp lên → 👁 Thầy/Cô mở modal "Xem bài làm" xem ảnh → 🖊 Khoanh/gạch chân bằng bút đỏ ngay trên ảnh nếu cần (không sửa ảnh gốc) → 📝 Nhập điểm từng câu Tự luận → 💾 Lưu — điểm Phần IV cộng riêng, không tự động chấm.\n\nChi tiết hơn, Thầy/Cô gõ câu hỏi hỏi em nhé!',
  },
  {
    question: 'Tôi đã có nguồn đề LaTeX (iMath/xtex/iTex) thì dùng thế nào?',
    answer:
      'Dùng thẳng được, không cần soạn lại. App đọc file .tex theo đúng cấu trúc gói ex_test quen thuộc: mỗi câu bọc trong \\begin{ex}...\\end{ex} (hoặc \\begin{bt}...\\end{bt}), dùng \\choice/\\choiceTF/\\shortans để phân loại Trắc nghiệm/Đúng-Sai/Trả lời ngắn (không có lệnh nào = Tự luận), \\True{...} đánh dấu đáp án đúng, \\loigiai{...} là lời giải. Nếu Thầy/Cô đang soạn bằng iMath, xtex hay iTex thì file xuất ra đúng theo cấu trúc ex_test này là tải lên dùng được ngay, kể cả kèm ảnh/TikZ.',
  },
  {
    question: 'Tác giả app là ai? Liên hệ hỗ trợ ở đâu?',
    answer: `App do Thầy ${APP_AUTHOR.name}, giáo viên ${APP_AUTHOR.school} (${APP_AUTHOR.province}) phát triển. Thầy/Cô liên hệ hỗ trợ qua Messenger Facebook (${ADMIN_CONTACT.facebook}) hoặc email ${ADMIN_CONTACT.email} nhé.`,
  },
  {
    question: 'App miễn phí bao lâu, vì sao có thời hạn?',
    answer: `Vì app đang dùng máy chủ miễn phí nên mọi tài khoản đều là tài khoản dùng thử có thời hạn, tránh máy chủ quá tải khiến app bị sập/đóng.`,
  },
];

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB — đủ cho 1 ảnh chụp màn hình, tránh làm chậm/gánh quota Gemini
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function AiHelpWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showFaq, setShowFaq] = useState(true);
  const [pendingImage, setPendingImage] = useState<ChatImage | null>(null);
  const [imageError, setImageError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tự cuộn xuống cuối mỗi khi có tin nhắn mới hoặc khi vừa mở panel.
  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, sending, showFaq]);

  // THÊM MỚI: bấm 1 câu hỏi gợi ý -> hiện ngay câu hỏi + câu trả lời soạn
  // sẵn vào khung chat, KHÔNG gọi API. GV vẫn gõ tiếp câu khác để chat trực
  // tiếp với Gemini như bình thường sau đó.
  function handleFaqClick(item: { question: string; answer: string }) {
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: item.question }, { role: 'model', content: item.answer }]);
    setShowFaq(false);
  }

  function handlePickImage() {
    setImageError('');
    fileInputRef.current?.click();
  }

  function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại đúng file đó lần sau nếu cần
    if (!file) return;
    setImageError('');
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Chỉ nhận ảnh định dạng PNG, JPEG hoặc WEBP.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Ảnh quá lớn (tối đa 3MB), Thầy/Cô chọn ảnh nhỏ hơn nhé.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.split(',')[1] || '';
      setPendingImage({ mimeType: file.type, data: base64, previewUrl: result });
    };
    reader.onerror = () => setImageError('Không đọc được ảnh, thử lại nhé.');
    reader.readAsDataURL(file);
  }

  function removePendingImage() {
    setPendingImage(null);
    setImageError('');
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && !pendingImage) || sending) return;
    setError('');
    setInput('');
    const image = pendingImage;
    setPendingImage(null);
    const userMessage: ChatMessage = { role: 'user', content: text, ...(image ? { image } : {}) };
    const nextMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    setShowFaq(false);
    setSending(true);
    try {
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.image ? { image: { mimeType: m.image.mimeType, data: m.image.data } } : {}),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Không hỏi được trợ lý AI, thử lại nhé.');
      setMessages((prev) => [...prev, { role: 'model', content: data.reply }]);
    } catch (err: any) {
      // Lỗi KHÔNG xoá tin nhắn GV vừa gửi (vẫn thấy câu mình vừa hỏi), chỉ
      // hiện thêm dòng báo lỗi bên dưới khung chat để GV biết bấm gửi lại.
      setError(err.message || 'Không hỏi được trợ lý AI, thử lại nhé.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Nút tròn nổi góc dưới-trái, đặt PHÍA TRÊN khu vực tài khoản ở cuối
          sidebar (AccountMenu trong page.tsx) để không đè lên nhau. z-40 để
          nổi trên hầu hết nội dung nhưng vẫn dưới các modal xác nhận (z-50)
          của app. */}
      {/* SỬA: bỏ kiểu nút nổi "position: fixed" trước đây (dễ đè lên nội
          dung/tab đang xem tuỳ vị trí cuộn trang) — giờ gắn THẲNG vào cột
          trái (navContent, dùng chung cho aside cố định + drawer di động),
          nằm ngay trên khu vực tài khoản, luôn ở đúng 1 chỗ trong sidebar,
          không nổi đè lên các tab nội dung bên phải nữa. */}
      <div className="border-t border-gray-100 px-3 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Đóng trợ lý AI' : 'Hỏi trợ lý AI về app'}
          aria-label={open ? 'Đóng trợ lý AI' : 'Mở trợ lý AI'}
          className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors ${
            open ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span
            className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
              open ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-400/70 text-blue-600'
            }`}
          >
            <RobotIcon className="w-5 h-5" />
          </span>
          <span className="text-sm font-medium">Trợ lý AI</span>
        </button>
      </div>

      {open && (
        <div className="fixed bottom-4 left-4 sm:left-64 z-40 w-[calc(100vw-2.5rem)] max-w-sm h-[28rem] max-h-[65vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <RobotIcon className="w-4 h-4 shrink-0" />
              <p className="font-semibold text-sm">Trợ lý AI — hỏi về app</p>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowFaq((v) => !v)}
                className="text-[11px] font-medium bg-blue-500/60 hover:bg-blue-500 rounded-full px-2.5 py-1 transition-colors"
              >
                Câu hỏi gợi ý
              </button>
              {/* Nút đóng riêng trong panel — nút tròn ngoài luôn giữ icon
                  robot để không mất nhận diện, đóng chat thì bấm đây hoặc
                  bấm lại nút tròn đều được. */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Đóng"
                aria-label="Đóng trợ lý AI"
                className="w-6 h-6 rounded-full bg-blue-500/60 hover:bg-blue-500 flex items-center justify-center text-sm leading-none transition-colors"
              >
                ✕
              </button>
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-gray-50">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                  }`}
                >
                  {m.image && (
                    <img
                      src={m.image.previewUrl}
                      alt="Ảnh đính kèm"
                      className="max-h-32 rounded-lg mb-1.5 border border-white/30"
                    />
                  )}
                  {m.content}
                </div>
              </div>
            ))}

            {showFaq && (
              <div className="pt-1 flex flex-wrap gap-1.5">
                {FAQ_ITEMS.map((item) => (
                  <button
                    key={item.question}
                    type="button"
                    onClick={() => handleFaqClick(item)}
                    className="text-xs text-left bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-full px-3 py-1.5 transition-colors"
                  >
                    {item.question}
                  </button>
                ))}
              </div>
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-white text-gray-400 border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 text-sm">
                  Đang trả lời...
                </div>
              </div>
            )}
          </div>

          {error && <p className="px-3 pt-1.5 text-xs text-red-600">{error}</p>}
          {imageError && <p className="px-3 pt-1.5 text-xs text-red-600">{imageError}</p>}

          {pendingImage && (
            <div className="px-3 pt-2 flex items-center gap-2">
              <div className="relative">
                <img src={pendingImage.previewUrl} alt="Ảnh sắp gửi" className="h-12 w-12 object-cover rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={removePendingImage}
                  aria-label="Bỏ ảnh đính kèm"
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-700 text-white text-[10px] leading-none flex items-center justify-center hover:bg-gray-900"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-400">Ảnh sẽ gửi kèm câu hỏi tiếp theo</p>
            </div>
          )}

          <div className="border-t border-gray-200 p-2.5 flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={handlePickImage}
              title="Đính kèm ảnh chụp màn hình"
              aria-label="Đính kèm ảnh"
              className="text-gray-400 hover:text-blue-600 border border-gray-300 hover:border-blue-400 rounded-lg p-2 transition-colors shrink-0"
            >
              <PaperclipIcon className="w-4 h-4" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Nhập câu hỏi về app..."
              rows={1}
              className="flex-1 resize-none text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-24"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || (!input.trim() && !pendingImage)}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors shrink-0"
            >
              Gửi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
