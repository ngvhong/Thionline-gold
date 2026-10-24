import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Exam } from '@/lib/examModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// SỬA LỖI (nguyên nhân của "lưu/xuất bản xong mà chờ rất lâu mới thấy link
// trong Giao đề"): route này KHÔNG đọc cookies/headers/searchParams nên
// Next.js coi là route TĨNH và cache lại response (Full Route Cache) —
// danh sách đề trả về bị đóng băng tại thời điểm build/deploy đầu tiên,
// chỉ cập nhật lại sau khi cache tự hết hạn hoặc deploy lại (đúng kiểu
// "chờ rất lâu rồi tự nhiên thấy"). Ép route này luôn chạy động, luôn đọc
// MongoDB mới nhất mỗi lần gọi.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// SỬA LỖI BẢO MẬT: route này trước đây không kiểm tra đăng nhập và trả về
// TOÀN BỘ đề thi của MỌI giáo viên (không lọc theo ai đang gọi) — khác với
// các route khác (classes, students...) đều bắt buộc getVerifiedTeacherIdFromRequest
// rồi lọc đúng theo GV đó. Giờ bắt buộc đăng nhập + chỉ trả đề của đúng GV
// đang đăng nhập, theo đúng pattern dùng chung trong dự án.
export async function GET(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    await connectToDatabase();

    // Chỉ lấy title + created_at + is_published (bỏ raw_data) — đề thi có
    // thể chứa hàng chục câu hỏi + mã TikZ nên khá nặng, không cần tải hết
    // chỉ để hiện danh sách. Mới nhất lên đầu. Lọc theo teacherId — GV chỉ
    // thấy đề của chính mình.
    const exams = await Exam.find(
      { teacherId },
      { title: 1, created_at: 1, is_published: 1, folder: 1 }
    )
      .sort({ created_at: -1 })
      .lean();

    return NextResponse.json({ exams }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy danh sách đề:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách đề, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
