import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { LibraryFolder } from '@/lib/libraryFolderModel';
import { requireAdmin } from '@/lib/adminGuard';

// THÊM MỚI (Giai đoạn 3 — Kho đề chung giữa giáo viên): CRUD cây thư mục,
// CHỈ admin (kiểm bằng requireAdmin — cơ chế admin hiện có, không tạo cơ chế
// phân quyền mới) mới thêm/sửa/xoá được nhánh. GV không gọi được route này —
// GV chỉ gắn đề của mình vào 1 nhánh có sẵn qua /api/exams/[id]/share.

// GET — trả phẳng toàn bộ danh sách nhánh (không dựng cây lồng nhau ở đây,
// để client tự dựng cây — đơn giản hơn cho form quản trị dạng bảng +
// dropdown chọn parentId).
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    await connectToDatabase();
    const folders = await LibraryFolder.find().sort({ parentId: 1, order: 1, name: 1 }).lean();
    return NextResponse.json({ folders }, { status: 200 });
  } catch (err) {
    console.error('Lỗi tải cây thư mục kho đề chung:', err);
    return NextResponse.json({ error: 'Không tải được cây thư mục.' }, { status: 500 });
  }
}

// POST — tạo 1 nhánh mới.
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Tên nhánh không được để trống.' }, { status: 400 });
    }

    let parentId: string | null = null;
    if (body.parentId) {
      if (!mongoose.Types.ObjectId.isValid(body.parentId)) {
        return NextResponse.json({ error: 'parentId không hợp lệ.' }, { status: 400 });
      }
      parentId = body.parentId;
    }

    const order = typeof body.order === 'number' ? body.order : 0;

    await connectToDatabase();

    if (parentId) {
      const parent = await LibraryFolder.findById(parentId).lean();
      if (!parent) {
        return NextResponse.json({ error: 'Không tìm thấy nhánh cha.' }, { status: 404 });
      }
    }

    const folder = await LibraryFolder.create({ name, parentId, order });
    return NextResponse.json({ folder }, { status: 201 });
  } catch (err) {
    console.error('Lỗi tạo nhánh kho đề chung:', err);
    return NextResponse.json({ error: 'Không tạo được nhánh mới.' }, { status: 500 });
  }
}

// PATCH — sửa 1 nhánh đã có (đổi tên/parentId/order). Nhận id trong body vì
// route dùng chung /api/admin/library/folders (không tách [id] riêng) để đỡ
// nhân file cho 1 tính năng quản trị đơn giản.
export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'id không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();
    const existing = await LibraryFolder.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy nhánh này.' }, { status: 404 });
    }

    const update: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
    if (typeof body.order === 'number') update.order = body.order;
    if ('parentId' in body) {
      if (body.parentId === null) {
        update.parentId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(body.parentId)) {
          return NextResponse.json({ error: 'parentId không hợp lệ.' }, { status: 400 });
        }
        // Chặn tự làm cha của chính mình (vòng lặp 1 cấp — kiểm tra vòng
        // lặp sâu hơn không cần thiết ở quy mô cây nhỏ, admin tự quản lý).
        if (String(body.parentId) === String(id)) {
          return NextResponse.json({ error: 'Không thể đặt 1 nhánh làm cha của chính nó.' }, { status: 400 });
        }
        const parent = await LibraryFolder.findById(body.parentId).lean();
        if (!parent) {
          return NextResponse.json({ error: 'Không tìm thấy nhánh cha.' }, { status: 404 });
        }
        update.parentId = body.parentId;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Không có trường hợp lệ để cập nhật.' }, { status: 400 });
    }

    const folder = await LibraryFolder.findByIdAndUpdate(id, update, { new: true }).lean();
    return NextResponse.json({ folder }, { status: 200 });
  } catch (err) {
    console.error('Lỗi sửa nhánh kho đề chung:', err);
    return NextResponse.json({ error: 'Không cập nhật được nhánh này.' }, { status: 500 });
  }
}

// DELETE — xoá 1 nhánh (?id=). Chặn xoá nếu còn nhánh con hoặc còn đề đang
// gắn vào nhánh đó, tránh dữ liệu mồ côi (đề/nhánh con trỏ tới 1 parentId/
// sharedFolderId không còn tồn tại).
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'id không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();
    const existing = await LibraryFolder.findById(id).lean();
    if (!existing) {
      return NextResponse.json({ error: 'Không tìm thấy nhánh này.' }, { status: 404 });
    }

    const childCount = await LibraryFolder.countDocuments({ parentId: id });
    if (childCount > 0) {
      return NextResponse.json(
        { error: `Nhánh này còn ${childCount} nhánh con — xoá hết nhánh con trước.` },
        { status: 400 }
      );
    }

    const { Exam } = await import('@/lib/examModel');
    const examCount = await Exam.countDocuments({ sharedFolderId: id });
    if (examCount > 0) {
      return NextResponse.json(
        { error: `Nhánh này còn ${examCount} đề đang gắn vào — gỡ chia sẻ các đề đó trước.` },
        { status: 400 }
      );
    }

    await LibraryFolder.findByIdAndDelete(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xoá nhánh kho đề chung:', err);
    return NextResponse.json({ error: 'Không xoá được nhánh này.' }, { status: 500 });
  }
}
