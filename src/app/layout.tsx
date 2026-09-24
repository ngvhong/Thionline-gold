import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// QUAN TRỌNG: import ở ĐÂY (layout gốc, bao mọi route) chứ không phải chỉ
// trong ExamBuilder.tsx — vì ExamBuilder.tsx chỉ được dùng ở route "/" (tab
// Đề thi của GV). Trang "/thi/[examId]" (học sinh làm bài) dùng component
// khác (StudentTakeExam.tsx -> examRender.tsx), không đi qua ExamBuilder.tsx
// nên KHÔNG được nạp CSS này nếu chỉ import ở đó — thiếu CSS khiến phần
// MathML dành cho trình đọc màn hình của KaTeX (bình thường bị ẩn) lộ ra
// ngoài, hiện chồng lên ngay cạnh phần công thức đã render đẹp, trông như
// "công thức bị lặp lại 2 lần / không có mũ/chỉ số". Import 1 lần ở layout
// gốc thì mọi route (kể cả /thi) đều có CSS này, không cần import lại ở nơi
// khác nữa.
import 'katex/dist/katex.min.css';
import { APP_NAME } from '@/components/AppBranding';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// SỬA (link trang chủ share Zalo/Messenger không hiện banner): trước đây
// không khai báo `metadataBase` và không có `openGraph.images` nào cả —
// tấm banner từng thấy lúc trước (nếu có) không đến từ metadata ở đây.
// Giờ dùng ẢNH TĨNH có sẵn `public/opengraph-image.png` (cùng 1 ảnh dùng
// chung cho mọi trang, kể cả /thi/[examId]) — ảnh tĩnh nên luôn nhanh,
// không phụ thuộc kết nối DB/font ngoài lúc Zalo/Messenger quét link, nên
// không còn rủi ro bị bỏ qua ảnh vì quá thời gian chờ.
const SLOGAN = 'Hệ thống thi trực tuyến';
const BANNER_PATH = '/opengraph-image.png';

export const metadata: Metadata = {
  metadataBase: new URL('https://thionline-opal.vercel.app'),
  title: APP_NAME,
  description: `${APP_NAME} — ${SLOGAN}`,
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: APP_NAME,
    description: SLOGAN,
    siteName: APP_NAME,
    type: 'website',
    images: [{ url: BANNER_PATH, width: 630, height: 280, alt: APP_NAME }],
  },
  twitter: {
    card: 'summary',
    title: APP_NAME,
    description: SLOGAN,
    images: [BANNER_PATH],
  },
  // SỬA LỖI (chữ trắng trên nền trắng khi máy bật chế độ tối): báo cho trình
  // duyệt biết trang này CHỈ có giao diện sáng — tránh trình duyệt/điện
  // thoại tự tô lại các control gốc (scrollbar, khung input, checkbox...)
  // theo chế độ tối của hệ điều hành trong khi phần còn lại của trang vẫn
  // đứng yên ở bảng màu sáng, gây lệch tông rải rác khắp nơi.
  other: {
    'color-scheme': 'light',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
