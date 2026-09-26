import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { hashPin, bumpStudentSessionVersion } from '@/lib/studentAuth';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): GV reset PIN hộ học sinh
// (do quên) — dùng lại NGUYÊN hàm GV cũ getVerifiedTeacherIdFromRequest
// (auth.ts, không sửa gì ở đó), chỉ thêm route mới.
//
// Sinh ngẫu nhiên PIN 6 số bằng crypto (không dùng Math.random — không đủ
// ngẫu nhiên cho mục đích bảo mật, dù chỉ là PIN 6 số).
function generateRandomPin(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

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
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }

    await connectToDatabase();

    // Học sinh không có ownerId riêng — quyền sở hữu đi qua
    // classId → Class.ownerId (cùng pattern findOwnedStudent ở
    // /api/students/[id]) — CHẶN reset PIN của HS thuộc lớp GV khác.
    const student = await StudentModel.findById(id).lean();
    if (!student) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }
    const cls = await ClassModel.findOne({ _id: (student as any).classId, ownerId: teacherId }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy học sinh này.' }, { status: 404 });
    }
    if (!(student as any).studentAccountId) {
      return NextResponse.json(
        { error: 'Học sinh này chưa có tài khoản đăng nhập nào để đặt lại PIN.' },
        { status: 400 }
      );
    }

    const newPin = generateRandomPin();
    const pinHash = await hashPin(newPin);
    await StudentAccountModel.findByIdAndUpdate((student as any).studentAccountId, { pinHash });
    // Thu hồi ngay mọi phiên đăng nhập cũ (PIN cũ không còn dùng được ở máy
    // nào khác nữa) — cùng nguyên tắc đặt lại mật khẩu của GV.
    await bumpStudentSessionVersion(String((student as any).studentAccountId));

    return NextResponse.json({ pin: newPin }, { status: 200 });
  } catch (err) {
    console.error('Lỗi đặt lại PIN học sinh:', err);
    return NextResponse.json(
      { error: 'Không đặt lại PIN được, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
