import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ExamGroupLinkModel } from '@/lib/examGroupLinkModel';
import { ClassModel } from '@/lib/classModel';

// GET /api/thi/[examId]/group/[code] — CÔNG KHAI, học sinh không đăng nhập,
// giống hệt tinh thần của GET /api/thi/[examId] (route lớp đơn lẻ). Dùng cho
// link chung dạng /thi/{examId}?g={code} (Phần 4, xem mục 6 spec-tinh-nang-
// khoi.md) — trả về DANH SÁCH LỚP thuộc lượt giao đề qua khối này, để trang
// học sinh hiện bước "chọn lớp của em" trước khi rơi vào đúng luồng cũ.
//
// Tra theo (examId, code) — đúng field `code` là unique trên toàn hệ thống
// (xem examGroupLinkModel.ts) nhưng vẫn lọc thêm examId cho chắc, tránh
// trường hợp lý thuyết code đúng nhưng examId trong URL bị sửa tay/sai.
//
// CHỈ lộ tối thiểu: classId + className. TUYỆT ĐỐI không trả roster (danh
// sách học sinh), không trả ownerId, không trả khoiId hay bất kỳ thông tin
// nội bộ nào khác — đúng ràng buộc bắt buộc của GHI-CHU-PHAN-4.md. Muốn biết
// roster của 1 lớp cụ thể, học sinh vẫn phải qua đúng luồng cũ: chọn lớp ở
// đây trước → sau đó gọi GET /api/thi/[examId]?classId=... (route đã có,
// không đụng tới ở Phần 4) mới trả tên học sinh trong lớp đó.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string; code: string }> }
) {
  try {
    const { examId, code } = await params;

    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Link đề thi không hợp lệ.' }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: 'Link không hợp lệ hoặc đã bị xoá.' }, { status: 404 });
    }

    await connectToDatabase();

    const link = await ExamGroupLinkModel.findOne({ examId, code }, { classIds: 1 }).lean();
    if (!link) {
      return NextResponse.json({ error: 'Link không hợp lệ hoặc đã bị xoá.' }, { status: 404 });
    }

    const classIds = ((link as any).classIds || []) as any[];
    const classes = await ClassModel.find(
      { _id: { $in: classIds } },
      { name: 1 }
    )
      .sort({ name: 1 })
      .lean();

    return NextResponse.json(
      {
        classes: classes.map((c: any) => ({ classId: String(c._id), className: c.name })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi tải danh sách lớp theo link chung:', err);
    return NextResponse.json(
      { error: 'Không tải được thông tin đề thi, thử tải lại trang.' },
      { status: 500 }
    );
  }
}
