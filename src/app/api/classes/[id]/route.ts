import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { deleteSubmissionBlobs } from '@/lib/blobCleanup';

// Dùng chung ở cả GET/PUT/DELETE: tìm lớp theo id VÀ ownerId cùng lúc — nếu
// lớp tồn tại nhưng thuộc GV khác, kết quả vẫn là null giống như không tồn
// tại (tránh lộ thông tin "lớp này có thật, chỉ là không phải của bạn").
async function findOwnedClass(id: string, teacherId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return ClassModel.findOne({ _id: id, ownerId: teacherId });
}

// GET /api/classes/[id] — chi tiết 1 lớp + danh sách học sinh trong lớp đó.
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

    const cls = await findOwnedClass(id, teacherId);
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    const students = await StudentModel.find({ classId: cls._id }).sort({ name: 1 }).lean();

    return NextResponse.json(
      {
        class: {
          _id: cls._id.toString(),
          name: cls.name,
          schoolYear: cls.schoolYear,
          inviteCode: cls.inviteCode || null,
          selfRegisterMode: cls.selfRegisterMode || 'off',
          created_at: cls.created_at,
          // THÊM MỚI (tính năng "Khối", Phần 3a) — xem ghi chú ở GET /api/classes.
          khoiId: (cls as any).khoiId ? String((cls as any).khoiId) : null,
        },
        students: students.map((s: any) => ({
          _id: String(s._id),
          name: s.name,
          dob: s.dob || null,
          gender: s.gender || null,
          classId: String(s.classId),
          selfRegistered: !!s.selfRegistered,
          // Không dùng ở frontend hiện tại (GET danh sách học sinh riêng dùng
          // /api/students), nhưng thêm vào đây cho nhất quán với response đó.
          approved: s.approved !== false,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy chi tiết lớp:', err);
    return NextResponse.json(
      { error: 'Không tải được lớp, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// PUT /api/classes/[id] — sửa tên lớp / năm học.
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

    const cls = await findOwnedClass(id, teacherId);
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    const { name, schoolYear, selfRegisterMode } = await request.json();
    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ error: 'Tên lớp không được để trống.' }, { status: 400 });
      }
      cls.name = String(name).trim();
    }
    if (schoolYear !== undefined) {
      if (!String(schoolYear).trim()) {
        return NextResponse.json({ error: 'Năm học không được để trống.' }, { status: 400 });
      }
      cls.schoolYear = String(schoolYear).trim();
    }
    // THÊM MỚI: đổi chế độ "Tự báo danh" (nút gạt 3 trạng thái ở frontend) —
    // dùng PUT chung này thay vì API riêng, giống cách name/schoolYear đang
    // được sửa (chỉ field nào có mặt trong body mới bị đổi, field khác giữ
    // nguyên).
    if (selfRegisterMode !== undefined) {
      if (!['off', 'auto', 'approval'].includes(selfRegisterMode)) {
        return NextResponse.json(
          { error: 'Chế độ tự báo danh không hợp lệ.' },
          { status: 400 }
        );
      }
      cls.selfRegisterMode = selfRegisterMode;
    }
    await cls.save();

    return NextResponse.json(
      {
        class: {
          _id: cls._id.toString(),
          name: cls.name,
          schoolYear: cls.schoolYear,
          inviteCode: cls.inviteCode || null,
          selfRegisterMode: cls.selfRegisterMode || 'off',
          created_at: cls.created_at,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi sửa lớp:', err);
    return NextResponse.json(
      { error: 'Không sửa được lớp, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// DELETE /api/classes/[id] — xóa lớp. XÁC NHẬN NGẦM (surgical, tránh dữ liệu
// rác): xóa lớp thì xóa luôn toàn bộ học sinh thuộc lớp đó và mọi lượt
// làm bài (submissions) của các học sinh này — vì submissions/students không
// còn ý nghĩa gì khi lớp cha đã bị xóa, và Mongo không tự cascade delete.
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

    const cls = await findOwnedClass(id, teacherId);
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    const students = await StudentModel.find({ classId: cls._id }, { _id: 1 }).lean();
    const studentIds = students.map((s: any) => s._id);

    if (studentIds.length > 0) {
      // SỬA (chi phí Blob — câu hỏi "xóa cả lớp thì ảnh tự luận có được xóa
      // không?"): TRƯỚC ĐÂY không có bước này, nên ảnh essayImages/
      // essayAnnotatedImages của mọi học sinh trong lớp vẫn còn nguyên trên
      // Vercel Blob dù Submission đã bị xóa khỏi MongoDB — không còn cách
      // nào tra lại URL ảnh nào cần xóa nữa một khi record biến mất. Giờ
      // đọc essayImages/essayAnnotatedImages của các submissions sắp bị xóa
      // NGAY TRƯỚC KHI xóa, rồi mới xóa Blob + Mongo.
      const submissionsToDelete = await SubmissionModel.find(
        { studentId: { $in: studentIds } },
        { essayImages: 1, essayAnnotatedImages: 1 }
      ).lean();
      await deleteSubmissionBlobs(submissionsToDelete as any[]);

      await SubmissionModel.deleteMany({ studentId: { $in: studentIds } });
      await StudentModel.deleteMany({ classId: cls._id });
    }
    await ClassModel.deleteOne({ _id: cls._id });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xóa lớp:', err);
    return NextResponse.json(
      { error: 'Không xóa được lớp, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
