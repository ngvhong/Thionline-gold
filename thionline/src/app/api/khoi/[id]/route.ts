import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { KhoiModel } from '@/lib/khoiModel';
import { ClassModel } from '@/lib/classModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// Dùng chung ở cả GET/PUT/DELETE — cùng pattern findOwnedClass() ở
// /api/classes/[id]/route.ts: tìm theo id VÀ ownerId cùng lúc, để khối của
// GV khác trả về null giống như không tồn tại (không lộ "khối này có thật").
async function findOwnedKhoi(id: string, teacherId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return KhoiModel.findOne({ _id: id, ownerId: teacherId });
}

// GET /api/khoi/[id] — chi tiết 1 khối + danh sách lớp con (CHỈ ĐỌC — spec
// mục 5 xác nhận: roster/sĩ số vẫn quản lý trong trang Lớp như cũ, trang
// Khối không sửa gì trên từng lớp con ở đây).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { id } = await params;
    await connectToDatabase();

    const khoi = await findOwnedKhoi(id, teacherId);
    if (!khoi) {
      return NextResponse.json({ error: 'Không tìm thấy khối này.' }, { status: 404 });
    }

    const classes = await ClassModel.find({ khoiId: khoi._id }).sort({ name: 1 }).lean();

    return NextResponse.json(
      {
        khoi: {
          _id: khoi._id.toString(),
          name: khoi.name,
          grade: khoi.grade,
          schoolYear: khoi.schoolYear,
          created_at: khoi.created_at,
        },
        classes: classes.map((c: any) => ({
          _id: String(c._id),
          name: c.name,
          schoolYear: c.schoolYear,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy chi tiết khối:', err);
    return NextResponse.json(
      { error: 'Không tải được khối, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// PUT /api/khoi/[id] — chỉ đổi TÊN hiển thị (`name`). Cố tình KHÔNG cho sửa
// grade/schoolYear ở đây: 2 field này là khoá nhận diện (unique index cùng
// ownerId) và ảnh hưởng migrate/việc gộp nhóm lớp con — đổi tuỳ tiện dễ gây
// nhầm khối đang chứa lớp của năm học/khối lớp khác. Muốn đổi grade/năm học
// thực chất là tạo khối khác, không phải "sửa".
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { id } = await params;
    await connectToDatabase();

    const khoi = await findOwnedKhoi(id, teacherId);
    if (!khoi) {
      return NextResponse.json({ error: 'Không tìm thấy khối này.' }, { status: 404 });
    }

    const { name } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Tên khối không được để trống.' }, { status: 400 });
    }
    khoi.name = String(name).trim();
    await khoi.save();

    return NextResponse.json(
      {
        khoi: {
          _id: khoi._id.toString(),
          name: khoi.name,
          grade: khoi.grade,
          schoolYear: khoi.schoolYear,
          created_at: khoi.created_at,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi sửa khối:', err);
    return NextResponse.json(
      { error: 'Không sửa được khối, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// DELETE /api/khoi/[id] — CHỈ xoá được khi khối KHÔNG còn lớp con nào (đúng
// yêu cầu GHI-CHU-PHAN-3.md mục "CRUD Khối"). Cố tình KHÔNG cascade xoá lớp
// con hay gỡ khoiId của lớp con — nếu còn lớp, chặn hẳn và yêu cầu GV tự
// chuyển/xoá lớp con trước ở trang Lớp, tránh xoá nhầm dữ liệu roster/điểm
// của học sinh chỉ vì xoá nhầm khối cha.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { id } = await params;
    await connectToDatabase();

    const khoi = await findOwnedKhoi(id, teacherId);
    if (!khoi) {
      return NextResponse.json({ error: 'Không tìm thấy khối này.' }, { status: 404 });
    }

    const childCount = await ClassModel.countDocuments({ khoiId: khoi._id });
    if (childCount > 0) {
      return NextResponse.json(
        {
          error: `Khối này vẫn còn ${childCount} lớp con. Hãy chuyển các lớp đó sang khối khác hoặc gỡ khỏi khối (ở trang Lớp) trước khi xoá.`,
        },
        { status: 400 }
      );
    }

    await KhoiModel.deleteOne({ _id: khoi._id });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xoá khối:', err);
    return NextResponse.json(
      { error: 'Không xoá được khối, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
