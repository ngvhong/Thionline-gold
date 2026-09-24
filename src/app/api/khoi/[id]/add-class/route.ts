import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { KhoiModel } from '@/lib/khoiModel';
import { ClassModel } from '@/lib/classModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

async function findOwnedKhoi(id: string, teacherId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return KhoiModel.findOne({ _id: id, ownerId: teacherId });
}

// GET /api/khoi/[id]/add-class — liệt kê các lớp CỦA GV đang đăng nhập mà
// CHƯA thuộc khối nào (khoiId: null), để trang Khối (Phần 3b) hiện dropdown
// "chọn lớp có sẵn để gán vào khối này". Không lọc theo grade/schoolYear của
// khối — GV tự biết lớp nào hợp lý để gán, không áp đặt cứng ở API (spec
// không yêu cầu ràng buộc grade lớp phải khớp grade khối).
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

    const unassigned = await ClassModel.find({ ownerId: teacherId, khoiId: null })
      .sort({ name: 1 })
      .lean();

    return NextResponse.json(
      {
        classes: unassigned.map((c: any) => ({
          _id: String(c._id),
          name: c.name,
          schoolYear: c.schoolYear,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy danh sách lớp chưa phân khối:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách lớp, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// POST /api/khoi/[id]/add-class — 2 chế độ theo đúng spec mục 4.4:
//   mode 'new'      : tạo lớp MỚI, tự động gán khoiId = khối đang mở.
//                     Body thêm: { name, schoolYear? } — schoolYear không
//                     truyền thì lấy đúng schoolYear của khối (hợp lý vì
//                     lớp con cùng năm học với khối cha).
//   mode 'existing' : gán 1 lớp CÓ SẴN (đang khoiId = null) vào khối này.
//                     Body thêm: { classId }.
// KHÔNG cho gán lớp đã thuộc khối KHÁC (phải gỡ ra trước ở trang Lớp) — spec
// mục 4.4 chỉ nói "gán 1 lớp có sẵn (đang khoiId = null)", không đề cập
// chuyển lớp giữa 2 khối, nên chặn hẳn trường hợp đó để không có hành vi
// ngoài đặc tả.
export async function POST(
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

    const body = await request.json();
    const mode = body?.mode;

    if (mode === 'new') {
      const { name, schoolYear } = body;
      if (!name || !String(name).trim()) {
        return NextResponse.json({ error: 'Vui lòng nhập tên lớp.' }, { status: 400 });
      }
      const resolvedSchoolYear =
        schoolYear && String(schoolYear).trim() ? String(schoolYear).trim() : khoi.schoolYear;

      const created = await ClassModel.create({
        name: String(name).trim(),
        schoolYear: resolvedSchoolYear,
        ownerId: teacherId,
        khoiId: khoi._id,
      });

      return NextResponse.json(
        {
          class: {
            _id: created._id.toString(),
            name: created.name,
            schoolYear: created.schoolYear,
            khoiId: khoi._id.toString(),
          },
        },
        { status: 201 }
      );
    }

    if (mode === 'existing') {
      const { classId } = body;
      if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
        return NextResponse.json({ error: 'Thiếu hoặc sai classId.' }, { status: 400 });
      }

      const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId });
      if (!cls) {
        return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
      }
      if ((cls as any).khoiId) {
        return NextResponse.json(
          { error: 'Lớp này đã thuộc 1 khối khác. Hãy gỡ khỏi khối cũ (ở trang Lớp) trước khi gán vào đây.' },
          { status: 409 }
        );
      }

      (cls as any).khoiId = khoi._id;
      await cls.save();

      return NextResponse.json(
        {
          class: {
            _id: cls._id.toString(),
            name: cls.name,
            schoolYear: cls.schoolYear,
            khoiId: khoi._id.toString(),
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: 'mode phải là "new" hoặc "existing".' }, { status: 400 });
  } catch (err) {
    console.error('Lỗi thêm lớp vào khối:', err);
    return NextResponse.json(
      { error: 'Không thêm được lớp vào khối, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
