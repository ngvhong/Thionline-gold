import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { connectToDatabase } from '@/lib/mongodb';
import { KhoiModel } from '@/lib/khoiModel';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { SubmissionModel } from '@/lib/submissionModel';
import { Exam } from '@/lib/examModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { ExamGroupLinkModel } from '@/lib/examGroupLinkModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

async function findOwnedKhoi(id: string, teacherId: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return KhoiModel.findOne({ _id: id, ownerId: teacherId });
}

// Sinh mã ngắn, random, dùng trên URL (?g=code) — 10 ký tự hex, đủ ngắn để
// dán vào link nhưng vẫn đủ khó đoán. Thử lại nếu trùng (rất hiếm) để đảm
// bảo unique index của ExamGroupLinkModel không bao giờ bị vi phạm.
async function generateUniqueGroupCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = crypto.randomBytes(5).toString('hex');
    const exists = await ExamGroupLinkModel.findOne({ code }, { _id: 1 }).lean();
    if (!exists) return code;
  }
  // Cực kỳ khó xảy ra (xác suất đụng độ 10 ký tự hex quá thấp) — vẫn có
  // phương án dự phòng để không kẹt request nếu 5 lần thử đều trùng.
  return crypto.randomBytes(8).toString('hex');
}

// GET /api/khoi/[id]/assign-exam?examId=... — lấy lại lượt giao đề qua khối
// đã có (nếu có) cho đúng cặp (examId, khoiId), để UI (Phần 3b) mở lại modal
// "Giao đề" và tick sẵn đúng các lớp đã chọn lần trước — đúng yêu cầu mục 4
// của GHI-CHU-PHAN-3.md. Trả về link: null nếu chưa từng giao qua khối này.
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
    const examId = request.nextUrl.searchParams.get('examId');
    if (!examId || !mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai examId.' }, { status: 400 });
    }

    await connectToDatabase();

    const khoi = await findOwnedKhoi(id, teacherId);
    if (!khoi) {
      return NextResponse.json({ error: 'Không tìm thấy khối này.' }, { status: 404 });
    }

    const link = await ExamGroupLinkModel.findOne({ examId, khoiId: khoi._id }).lean();

    return NextResponse.json(
      {
        link: link
          ? {
              code: (link as any).code,
              classIds: ((link as any).classIds || []).map((c: any) => String(c)),
              updated_at: (link as any).updated_at,
            }
          : null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy lượt giao đề theo khối:', err);
    return NextResponse.json(
      { error: 'Không lấy được thông tin giao đề, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}

// POST /api/khoi/[id]/assign-exam — giao đề hàng loạt cho các lớp con ĐÃ
// TICK trong khối này. Body: { examId, classIds: string[], settings? }
//   - classIds: BẮT BUỘC là tập con của lớp con thuộc ĐÚNG khối này (chặn
//     giao nhầm sang lớp không thuộc khối, kể cả khi client gửi sai).
//   - settings: object các field GV thực sự đổi (duration/shuffle/
//     maxAttempts/showSolution/solutionOpenAt/openAt/closeAt), giống hệt
//     cấu trúc body của PATCH /api/exam-assignment. KHÔNG truyền / truyền
//     object rỗng = GV không đổi gì, các lớp tick vẫn dùng mặc định của đề.
//
// QUAN TRỌNG: với TỪNG lớp trong classIds, thao tác ghi ExamAssignment ở
// đây tái dùng NGUYÊN VẸN đúng logic của PATCH /api/exam-assignment (cùng
// field, cùng validate openAt/closeAt, cùng ý nghĩa hasCustomSettings) —
// không viết lại logic khác, đúng yêu cầu GHI-CHU-PHAN-3.md. Vì lượt giao
// đề qua khối luôn ghi lại TOÀN BỘ tập lớp đã tick (chứ không phải "thêm
// vào"), mỗi lớp được tick trong lượt này sẽ được upsert y hệt như GV tự
// tay vào lớp đó bấm Lưu ở panel giao đề cấp lớp — kể cả khi settings rỗng
// (nghĩa là "Lưu" với hasCustomSettings=false, quay về mặc định của đề).
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
    const body = await request.json();
    const { examId } = body;
    const classIdsInput: string[] = Array.isArray(body.classIds) ? body.classIds : [];
    const settingsInput =
      body.settings && typeof body.settings === 'object' ? { ...body.settings } : {};

    if (!examId || !mongoose.Types.ObjectId.isValid(examId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai examId.' }, { status: 400 });
    }
    if (classIdsInput.length === 0) {
      return NextResponse.json({ error: 'Vui lòng tick ít nhất 1 lớp để giao đề.' }, { status: 400 });
    }
    if (classIdsInput.some((cid) => !mongoose.Types.ObjectId.isValid(cid))) {
      return NextResponse.json({ error: 'Danh sách lớp chứa id không hợp lệ.' }, { status: 400 });
    }

    await connectToDatabase();

    const khoi = await findOwnedKhoi(id, teacherId);
    if (!khoi) {
      return NextResponse.json({ error: 'Không tìm thấy khối này.' }, { status: 404 });
    }

    const exam = await Exam.findById(examId, { _id: 1 }).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }

    // Xác nhận TOÀN BỘ classIds gửi lên đều là lớp con thực sự của khối này
    // (và thuộc đúng GV đang đăng nhập) — không tin tưởng mù quáng dữ liệu
    // từ client, tránh giao đề nhầm sang lớp ngoài khối.
    const validClasses = await ClassModel.find(
      { _id: { $in: classIdsInput }, khoiId: khoi._id, ownerId: teacherId },
      { _id: 1 }
    ).lean();
    const validClassIdSet = new Set(validClasses.map((c: any) => String(c._id)));
    const invalidIds = classIdsInput.filter((cid) => !validClassIdSet.has(String(cid)));
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: 'Có lớp trong danh sách không thuộc khối này hoặc không phải lớp của bạn.' },
        { status: 400 }
      );
    }
    // Loại trùng lặp (nếu client lỡ gửi trùng id) — giữ thứ tự xuất hiện đầu
    // tiên cho dễ debug, không ảnh hưởng logic vì set thao tác theo _id.
    const classIds = Array.from(new Set(classIdsInput.map((cid) => String(cid))));

    // Chuẩn hoá + validate openAt/closeAt NẾU có trong settings — hệt logic
    // PATCH /api/exam-assignment, để hành vi 2 nơi không lệch nhau.
    if ('openAt' in settingsInput) {
      settingsInput.openAt = settingsInput.openAt ? new Date(settingsInput.openAt) : null;
      if (settingsInput.openAt && isNaN(settingsInput.openAt.getTime())) {
        return NextResponse.json({ error: 'Giờ mở không hợp lệ.' }, { status: 400 });
      }
    }
    if ('closeAt' in settingsInput) {
      settingsInput.closeAt = settingsInput.closeAt ? new Date(settingsInput.closeAt) : null;
      if (settingsInput.closeAt && isNaN(settingsInput.closeAt.getTime())) {
        return NextResponse.json({ error: 'Giờ đóng không hợp lệ.' }, { status: 400 });
      }
    }
    if (
      settingsInput.openAt &&
      settingsInput.closeAt &&
      settingsInput.openAt.getTime() >= settingsInput.closeAt.getTime()
    ) {
      return NextResponse.json({ error: 'Giờ mở phải trước giờ đóng.' }, { status: 400 });
    }

    const hasCustomSettings = Object.keys(settingsInput).length > 0;
    const assignmentUpdate: Record<string, unknown> = { updated_at: new Date() };
    if (hasCustomSettings) {
      assignmentUpdate.hasCustomSettings = true;
      assignmentUpdate.settings = settingsInput;
      assignmentUpdate.openAt = null;
      assignmentUpdate.closeAt = null;
    } else {
      // Không đổi gì -> quay về mặc định của đề, hệt PATCH khi
      // hasCustomSettings === false (xem ghi chú đầu file).
      assignmentUpdate.hasCustomSettings = false;
      assignmentUpdate.settings = {};
      assignmentUpdate.openAt = null;
      assignmentUpdate.closeAt = null;
    }

    // Ghi từng ExamAssignment(examId, classId) — CHỈ cho các lớp đã tick.
    // Lớp KHÔNG tick trong lượt này hoàn toàn không bị đụng tới (đúng ràng
    // buộc bắt buộc của spec — không xoá/sửa ExamAssignment của lớp không
    // được tick, kể cả khi lớp đó từng được giao ở 1 lượt trước).
    await Promise.all(
      classIds.map((classId) =>
        ExamAssignmentModel.findOneAndUpdate(
          { examId, classId },
          { $set: assignmentUpdate },
          { upsert: true, new: true }
        )
      )
    );

    // SỬA LỖI QUAN TRỌNG: TRƯỚC ĐÂY route này chỉ ghi ExamAssignment (cấu
    // hình riêng cho lớp) + ExamGroupLink (link nhóm) mà KHÔNG hề tạo
    // Submission cho học sinh — trong khi /start (route công khai học sinh
    // gọi khi bấm vào link) BẮT BUỘC đã phải có sẵn 1 Submission(studentId,
    // examId) mới cho vào thi được (xem ghi chú đầu file start/route.ts).
    // Hậu quả: GV giao đề qua Khối xong, học sinh có sẵn trong lớp (không
    // phải tự báo danh) bấm vào link vẫn bị chặn "Em chưa được giáo viên
    // giao đề này." GIỜ tạo Submission "chưa thi" cho TOÀN BỘ học sinh của
    // từng lớp được tick, y hệt logic idempotent của POST /api/submissions
    // (bỏ qua em nào đã có Submission cho đề này từ trước, không tạo trùng).
    const studentsInClasses = await StudentModel.find(
      { classId: { $in: classIds } },
      { _id: 1 }
    ).lean();
    const studentIds = studentsInClasses.map((s: any) => String(s._id));

    if (studentIds.length > 0) {
      const existingSubmissions = await SubmissionModel.find(
        { examId, studentId: { $in: studentIds } },
        { studentId: 1 }
      ).lean();
      const alreadyAssigned = new Set(existingSubmissions.map((s: any) => String(s.studentId)));

      const toCreate = studentIds
        .filter((sid) => !alreadyAssigned.has(sid))
        .map((studentId) => ({
          studentId,
          examId,
          status: 'chưa thi',
          attemptNumber: 1,
          assigned_at: new Date(),
        }));

      if (toCreate.length > 0) {
        await SubmissionModel.insertMany(toCreate);
      }
    }

    // Upsert ExamGroupLink(examId, khoiId): giữ nguyên `code` cũ nếu lượt
    // giao đề qua khối này đã tồn tại (để link đã gửi cho học sinh không
    // đổi), chỉ sinh code mới khi đây là lần đầu.
    const existingLink = await ExamGroupLinkModel.findOne({ examId, khoiId: khoi._id });
    let link;
    if (existingLink) {
      existingLink.classIds = classIds as any;
      existingLink.updated_at = new Date();
      await existingLink.save();
      link = existingLink;
    } else {
      const code = await generateUniqueGroupCode();
      link = await ExamGroupLinkModel.create({
        code,
        examId,
        khoiId: khoi._id,
        classIds,
        ownerId: teacherId,
      });
    }

    return NextResponse.json(
      {
        assignedClassCount: classIds.length,
        link: {
          code: link.code,
          classIds: classIds,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi giao đề hàng loạt theo khối:', err);
    return NextResponse.json(
      { error: 'Không giao được đề, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
