import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { deleteSubmissionBlobs } from '@/lib/blobCleanup';

// Học sinh không có ownerId riêng — quyền sở hữu đi qua classId → Class.ownerId.
// Hàm này tìm học sinh rồi xác nhận lớp hiện tại của em đó thuộc đúng GV đang
// đăng nhập, trả về cả student + lớp để route dùng tiếp (PUT cần biết lớp cũ).
async function findOwnedStudent(id: string, teacherId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const student = await StudentModel.findById(id);
  if (!student) return null;
  const cls = await ClassModel.findOne({ _id: student.classId, ownerId: teacherId }).lean();
  if (!cls) return null; // học sinh có thật, nhưng thuộc lớp của GV khác
  return student;
}

// PUT /api/students/[id] — sửa thông tin học sinh, hoặc "chuyển lớp" khi body
// có classId mới.
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

    const student = await findOwnedStudent(id, teacherId);
    if (!student) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }

    const { name, dob, gender, classId, approved } = await request.json();

    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ error: 'Tên học sinh không được để trống.' }, { status: 400 });
      }
      student.name = String(name).trim();
    }
    if (dob !== undefined) {
      student.dob = dob ? String(dob).trim() : undefined;
    }
    if (gender !== undefined) {
      if (gender !== null && gender !== '' && !['Nam', 'Nữ'].includes(gender)) {
        return NextResponse.json({ error: 'Giới tính chỉ nhận "Nam" hoặc "Nữ".' }, { status: 400 });
      }
      student.gender = gender || undefined;
    }
    // Chuyển lớp: lớp MỚI cũng phải thuộc đúng GV này — nếu không, GV A có
    // thể "chuyển" học sinh của mình sang 1 lớp của GV B để lộ dữ liệu.
    if (classId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(classId)) {
        return NextResponse.json({ error: 'classId mới không hợp lệ.' }, { status: 400 });
      }
      const targetClass = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
      if (!targetClass) {
        return NextResponse.json({ error: 'Không tìm thấy lớp muốn chuyển đến.' }, { status: 404 });
      }
      student.classId = classId;
    }
    // THÊM MỚI: GV bấm "Duyệt" cho học sinh tự báo danh đang chờ (chế độ
    // selfRegisterMode='approval') — chỉ set true ở đây, không cho set false
    // qua field này (muốn "hủy duyệt" thì xóa học sinh, tránh phức tạp hóa
    // API cho 1 nhu cầu hiếm).
    if (approved !== undefined) {
      student.approved = !!approved;
    }

    await student.save();

    return NextResponse.json(
      {
        student: {
          _id: student._id.toString(),
          name: student.name,
          dob: student.dob || null,
          gender: student.gender || null,
          classId: String(student.classId),
          selfRegistered: !!student.selfRegistered,
          approved: student.approved !== false,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi sửa học sinh:', err);
    return NextResponse.json(
      { error: 'Không sửa được học sinh, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// DELETE /api/students/[id] — xóa học sinh, kèm xóa mọi submissions của em
// đó (không còn ý nghĩa gì khi học sinh đã bị xóa khỏi hệ thống).
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

    const student = await findOwnedStudent(id, teacherId);
    if (!student) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }

    // SỬA (chi phí Blob — cùng lỗi với xóa lớp): đọc essayImages/
    // essayAnnotatedImages của các submissions sắp bị xóa TRƯỚC KHI xóa, để
    // dọn ảnh trên Vercel Blob thay vì để chúng mồ côi mãi mãi.
    const submissionsToDelete = await SubmissionModel.find(
      { studentId: student._id },
      { essayImages: 1, essayAnnotatedImages: 1 }
    ).lean();
    await deleteSubmissionBlobs(submissionsToDelete as any[]);

    await SubmissionModel.deleteMany({ studentId: student._id });
    await StudentModel.deleteOne({ _id: student._id });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('Lỗi xóa học sinh:', err);
    return NextResponse.json(
      { error: 'Không xóa được học sinh, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
