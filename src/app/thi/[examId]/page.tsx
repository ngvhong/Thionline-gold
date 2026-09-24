import type { Metadata } from 'next';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { APP_NAME } from '@/components/AppBranding';
import ThiPageClient from './ThiPageClient';

// THÊM MỚI (khiếu nại: "gửi link đề thi qua Zalo/Messenger không thấy tên
// đề, chỉ thấy tên app chung chung") — nguyên nhân: file page.tsx cũ có
// 'use client' ngay dòng đầu, mà Next.js CHỈ cho phép `generateMetadata`
// (hàm sinh ra <title>/thẻ Open Graph mà Zalo/Messenger/Facebook đọc khi
// tạo preview link) trong Server Component, không dùng được trong Client
// Component. Vì vậy dù trang có sẵn `room?.examTitle` trong state, nó
// KHÔNG BAO GIỜ lọt vào được thẻ meta của HTML — Zalo/Messenger chỉ đọc
// meta tĩnh có sẵn trong HTML ban đầu, không chạy JS phía client.
//
// Giải pháp: tách logic hiển thị/tương tác cũ nguyên vẹn sang
// ThiPageClient.tsx (vẫn 'use client', không đổi hành vi gì), còn page.tsx
// này trở thành Server Component MỎNG — chỉ làm 2 việc: (1) tự truy vấn
// Mongo lấy đúng `title` của đề theo examId trong URL rồi trả về qua
// generateMetadata, (2) render lại ThiPageClient y hệt trước đây.

// Chỉ đọc field `title` + `is_published` — nhẹ (không kéo theo raw_data đề
// thi nặng) và không lộ nội dung đề qua thẻ meta công khai. Đề chưa xuất
// bản (is_published=false) hoặc examId sai định dạng: coi như không có
// tên, rơi về metadata mặc định — không lộ rằng 1 đề "chưa xuất bản" đang
// tồn tại qua preview link.
async function getExamTitle(examId: string): Promise<string | null> {
  if (!mongoose.Types.ObjectId.isValid(examId)) return null;
  try {
    await connectToDatabase();
    const exam = await Exam.findById(examId, { title: 1, is_published: 1 }).lean();
    if (!exam || !(exam as any).is_published) return null;
    return (exam as any).title || null;
  } catch {
    // Lỗi kết nối DB lúc Zalo/Messenger/Facebook gọi crawl preview không
    // được làm sập cả trang — rơi về metadata mặc định, trang vẫn mở bình
    // thường cho học sinh ngay sau đó.
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ examId: string }>;
}): Promise<Metadata> {
  const { examId } = await params;
  const examTitle = await getExamTitle(examId);

  const title = examTitle ? `${examTitle} - ${APP_NAME}` : APP_NAME;
  const description = examTitle
    ? `Vào phòng thi "${examTitle}" trên ${APP_NAME} — Hệ thống thi trực tuyến.`
    : `${APP_NAME} — Hệ thống thi trực tuyến.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: APP_NAME,
      type: 'website',
      // SỬA (banner không hiện / hay bị Zalo bỏ qua): trước đây dùng file
      // quy ước `opengraph-image.tsx` tự tạo ảnh RIÊNG theo tên đề (phải
      // gọi MongoDB + tải font Google mỗi lần) — vừa chậm (dễ bị crawler
      // Zalo/Messenger bỏ qua ảnh vì quá thời gian chờ), vừa thừa vì tên
      // đề đã hiển thị sẵn qua `title`/`description` ở trên rồi. Giờ dùng
      // LUÔN ảnh tĩnh chung `public/opengraph-image.png` (giống hệt trang
      // chủ) — nhanh, không phụ thuộc DB/mạng ngoài lúc quét link.
      images: [{ url: '/opengraph-image.png', width: 630, height: 280, alt: APP_NAME }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: ['/opengraph-image.png'],
    },
  };
}

export default function Page() {
  return <ThiPageClient />;
}
