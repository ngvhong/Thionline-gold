import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { KhoiModel } from '@/lib/khoiModel';
import { ClassModel } from '@/lib/classModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { migrateKhoiForOneClass } from '@/lib/khoiMigration';

// GET /api/khoi — danh sách Khối của GV đang đăng nhập, kèm số lớp con mỗi
// khối (đếm động từ ClassModel.khoiId, giống cách /api/classes đếm sĩ số
// động từ StudentModel — tránh lưu cứng số đếm dễ lệch dữ liệu).
export async function GET(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    await connectToDatabase();

    // Phần 6 — tự động "bắt kịp" migrate: TRƯỚC khi trả danh sách khối, tự
    // gán khoiId cho các lớp CỦA GV NÀY đang khoiId: null mà detectGrade(tên
    // lớp) nhận diện được (tái dùng đúng logic upsert đã có trong
    // migrateKhoiForOneClass(), KHÔNG viết lại). Chạy mỗi lần GV mở tab Khối,
    // không tốn kém vì chỉ xử lý lớp còn khoiId: null (thường rất ít hoặc 0)
    // — để lớp tạo qua API cũ POST /api/classes (nếu còn ai gọi tới, hoặc dữ
    // liệu cũ còn sót) tự "bắt kịp" mà không cần đợi admin chạy tay
    // /api/admin/migrate-khoi.
    // SỬA LỖI TỐC ĐỘ (nguyên nhân chính khiến "mở tab Khối lớp lần đầu tải
    // khá lâu"): TRƯỚC ĐÂY vòng lặp này await TUẦN TỰ từng lớp một
    // (migrateKhoiForOneClass ~2-3 lượt gọi Mongo/lớp: countDocuments +
    // findOneAndUpdate + có thể thêm updateOne) — GV nào có nhiều lớp CHƯA
    // từng migrate (đúng lúc mới triển khai tính năng Khối, hoặc mới tạo
    // hàng loạt lớp) phải CHỜ hết lớp này tới lớp khác mới có response đầu
    // tiên, cộng dồn có thể tới vài giây. Những lần mở SAU nhanh hẳn vì danh
    // sách unassignedClasses rỗng (khớp đúng hiện tượng "chỉ chậm lần đầu"
    // người dùng mô tả). migrateKhoiForOneClass() đã tự nhận là AN TOÀN khi
    // gọi đồng thời cho nhiều lớp (dùng findOneAndUpdate + upsert theo đúng
    // khoá unique (ownerId, schoolYear, grade) — xem khoiMigration.ts), nên
    // chạy song song bằng Promise.all an toàn, không cần khoá tuần tự.
    const unassignedClasses = await ClassModel.find({ ownerId: teacherId, khoiId: null }).lean();
    await Promise.all((unassignedClasses as any[]).map((cls) => migrateKhoiForOneClass(cls)));

    const khois = await KhoiModel.find({ ownerId: teacherId })
      .sort({ created_at: -1 })
      .lean();

    const khoiIds = khois.map((k: any) => k._id);
    // Đếm lớp con theo từng khối trong 1 lần aggregate duy nhất (tránh N+1
    // khi GV có nhiều khối) — cùng pattern với đếm sĩ số ở /api/classes.
    const counts = await ClassModel.aggregate([
      { $match: { khoiId: { $in: khoiIds } } },
      { $group: { _id: '$khoiId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: any) => [String(c._id), c.count]));

    const result = khois.map((k: any) => ({
      _id: String(k._id),
      name: k.name,
      grade: k.grade,
      schoolYear: k.schoolYear,
      created_at: k.created_at,
      classCount: countMap.get(String(k._id)) || 0,
    }));

    return NextResponse.json({ khois: result }, { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy danh sách khối:', err);
    return NextResponse.json(
      { error: 'Không lấy được danh sách khối, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// POST /api/khoi — tạo Khối mới. Body: { grade, schoolYear, name? }
//   - grade (bắt buộc, số 6-12): dùng để xác định khối này ứng với khối lớp
//     nào (giống ý nghĩa grade trong khoiMigration.ts).
//   - schoolYear (bắt buộc): tách khối theo năm học.
//   - name (tuỳ chọn): tên hiển thị; nếu GV không nhập, tự đặt "Khối {grade}"
//     giống hệt giá trị mặc định mà script migrate (Phần 2) đã dùng, để
//     khối tạo tay và khối tạo từ migrate nhất quán về tên gọi.
// KHÔNG nhận ownerId từ body — luôn lấy từ GV đang đăng nhập, giống hệt
// nguyên tắc bảo mật ở POST /api/classes.
export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const { grade, schoolYear, name } = await request.json();

    const gradeNum = Number(grade);
    if (!Number.isInteger(gradeNum) || gradeNum < 6 || gradeNum > 12) {
      return NextResponse.json({ error: 'Số khối phải là số nguyên từ 6 đến 12.' }, { status: 400 });
    }
    if (!schoolYear || !String(schoolYear).trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập năm học.' }, { status: 400 });
    }

    await connectToDatabase();

    let created;
    try {
      created = await KhoiModel.create({
        name: name && String(name).trim() ? String(name).trim() : `Khối ${gradeNum}`,
        grade: gradeNum,
        schoolYear: String(schoolYear).trim(),
        ownerId: teacherId,
      });
    } catch (e: any) {
      // Trùng unique index (ownerId, schoolYear, grade) — GV đã có khối này
      // rồi (có thể do đã tạo tay trước đó hoặc do script migrate Phần 2 đã
      // tạo sẵn). Báo lỗi rõ ràng thay vì lỗi 500 khó hiểu.
      if (e?.code === 11000) {
        return NextResponse.json(
          { error: `Khối ${gradeNum} năm học ${String(schoolYear).trim()} đã tồn tại.` },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json(
      {
        khoi: {
          _id: created._id.toString(),
          name: created.name,
          grade: created.grade,
          schoolYear: created.schoolYear,
          created_at: created.created_at,
          classCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Lỗi tạo khối:', err);
    return NextResponse.json(
      { error: 'Không tạo được khối, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
