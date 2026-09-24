import type { NextRequest } from 'next/server';
import { connectToDatabase } from './mongodb';
import { TeacherModel } from './teacherModel';
import { getTeacherIdFromRequest } from './auth';
import { isAdminEmail } from './adminConfig';

// Dùng chung cho MỌI route /api/admin/* — xác nhận người gọi API này đang
// đăng nhập ĐÚNG bằng tài khoản quản trị (email cố định ADMIN_EMAIL). LUÔN
// tra lại email THẬT từ database theo session hiện có (không tin bất cứ
// thông tin nào client tự gửi lên trong body/header) để tránh giả mạo quyền
// quản trị. Trả về null nếu không đủ điều kiện — route gọi hàm này tự quyết
// định trả 401/403.
export async function requireAdmin(request: NextRequest) {
  const teacherId = await getTeacherIdFromRequest(request);
  if (!teacherId) return null;

  await connectToDatabase();
  const teacher: any = await TeacherModel.findById(teacherId).lean();
  if (!teacher || !isAdminEmail(teacher.email)) return null;

  return teacher;
}
