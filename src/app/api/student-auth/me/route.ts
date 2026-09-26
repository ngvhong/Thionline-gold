import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { StudentAccountModel } from '@/lib/studentAccountModel';
import { getVerifiedStudentAccountIdFromRequest } from '@/lib/studentAuth';

// THÊM MỚI (Giai đoạn 1 — tài khoản học sinh): tương tự /api/auth/me của
// GV — trả { account: null } (KHÔNG phải lỗi 401) khi chưa đăng nhập, vì
// đây là truy vấn "đang có ai đăng nhập không", không phải hành động cần
// bảo vệ.
export async function GET(request: NextRequest) {
  try {
    const studentAccountId = await getVerifiedStudentAccountIdFromRequest(request);
    if (!studentAccountId) {
      return NextResponse.json({ account: null }, { status: 200 });
    }

    await connectToDatabase();
    const account: any = await StudentAccountModel.findById(studentAccountId).lean();
    if (!account) {
      return NextResponse.json({ account: null }, { status: 200 });
    }

    return NextResponse.json(
      {
        account: {
          id: account._id.toString(),
          name: account.name,
          phone: account.phone,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi kiểm tra phiên đăng nhập học sinh:', err);
    return NextResponse.json({ account: null }, { status: 200 });
  }
}
