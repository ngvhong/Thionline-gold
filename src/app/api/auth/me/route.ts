import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { TeacherModel } from '@/lib/teacherModel';
import { getSessionContext } from '@/lib/auth';
import { computePlanStatus } from '@/lib/planAccess';

export async function GET(request: NextRequest) {
  try {
    // ĐỔI: trước đây tự giải mã token + tra DB thủ công ở đây, giờ dùng
    // chung getSessionContext (auth.ts) — vừa gọn, vừa TỰ ĐỘNG có thêm kiểm
    // tra sessionVersion (phiên đã bị thu hồi qua đặt lại mật khẩu/"Đăng
    // xuất tất cả thiết bị" sẽ trả về null ở đây, đúng như đã hết hạn thật).
    const ctx = await getSessionContext(request);
    if (!ctx) {
      // Token thiếu/sai/hết hạn/bị thu hồi/tài khoản bị khoá — coi như chưa
      // đăng nhập, KHÔNG trả lỗi 401 vì đây là truy vấn "đang có ai đăng
      // nhập không", không phải hành động cần bảo vệ.
      return NextResponse.json({ teacher: null }, { status: 200 });
    }

    await connectToDatabase();
    const teacher: any = await TeacherModel.findById(ctx.teacherId).lean();
    if (!teacher) {
      return NextResponse.json({ teacher: null }, { status: 200 });
    }

    // THÊM MỚI (mạo danh): nếu đây là phiên mạo danh, kèm thêm email của
    // admin đang mạo danh — để giao diện hiện banner "Đang xem thay mặt...".
    // Không lấy tên/email admin từ token (không tin dữ liệu client), tra lại
    // thẳng từ DB theo id admin lưu trong token.
    let impersonating: { adminEmail: string } | null = null;
    if (ctx.isImpersonating && ctx.impersonatedByAdminId) {
      const admin: any = await TeacherModel.findById(ctx.impersonatedByAdminId).select('email').lean();
      if (admin) impersonating = { adminEmail: admin.email };
    }

    // THÊM MỚI (gói dùng free/vĩnh viễn): kèm trạng thái gói dùng để giao
    // diện hiện banner "còn N ngày free" / "đã hết hạn free" — tính bằng
    // helper dùng chung (planAccess.ts), KHÔNG tự so ngày ở đây.
    const planStatus = computePlanStatus(teacher);

    return NextResponse.json(
      {
        teacher: { id: teacher._id.toString(), email: teacher.email, name: teacher.name, emailVerified: !!teacher.emailVerified },
        impersonating,
        planStatus,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi kiểm tra phiên đăng nhập:', err);
    return NextResponse.json({ teacher: null }, { status: 200 });
  }
}
