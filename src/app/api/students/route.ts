import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/students?classId=... — danh sách học sinh của 1 lớp. Bắt buộc có
// classId (không có API "lấy hết học sinh của mọi lớp" vì không cần dùng ở
// đâu, và tránh vô tình trả về học sinh của lớp GV khác nếu code sau này quên
// lọc thêm ownerId).
export async function GET(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const classId = request.nextUrl.searchParams.get('classId');
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai classId.' }, { status: 400 });
    }

    await connectToDatabase();

    // Kiểm tra lớp này có thuộc GV đang đăng nhập không — chặn trước khi lộ
    // danh sách học sinh của lớp người khác.
    const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    const students = await StudentModel.find({ classId }).sort({ name: 1 }).lean();

    return NextResponse.json(
      {
        students: students.map((s: any) => ({
          _id: String(s._id),
          name: s.name,
          dob: s.dob || null,
          gender: s.gender || null,
          classId: String(s.classId),
          selfRegistered: !!s.selfRegistered,
          approved: s.approved !== false,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy danh sách học sinh:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách học sinh, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// POST /api/students — thêm 1 học sinh vào 1 lớp (thêm tay từng em — import
// Excel để version sau, theo đúng lựa chọn đã chốt).
export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { name, dob, gender, classId } = await request.json();

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập tên học sinh.' }, { status: 400 });
    }
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai classId.' }, { status: 400 });
    }
    if (gender !== undefined && gender !== null && gender !== '' && !['Nam', 'Nữ'].includes(gender)) {
      return NextResponse.json({ error: 'Giới tính chỉ nhận "Nam" hoặc "Nữ".' }, { status: 400 });
    }

    await connectToDatabase();

    const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    const created = await StudentModel.create({
      name: String(name).trim(),
      dob: dob ? String(dob).trim() : undefined,
      gender: gender || undefined,
      classId,
    });

    return NextResponse.json(
      {
        student: {
          _id: created._id.toString(),
          name: created.name,
          dob: created.dob || null,
          gender: created.gender || null,
          classId: String(created.classId),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Lỗi thêm học sinh:', err);
    return NextResponse.json(
      { error: 'Không thêm được học sinh, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
