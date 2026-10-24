import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { Exam } from '@/lib/examModel';
import { ExamAssignmentModel } from '@/lib/examAssignmentModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/exam-assignment?examId=...&classId=... — GV xem cài đặt ĐANG áp
// dụng cho đúng lần giao đề này (1 đề - 1 lớp): trả về cả
//   - examSettings: cài đặt MẶC ĐỊNH của đề (Exam.settings) — để panel "Giao
//     đề" biết giá trị mặc định là gì (hiện tham khảo/prefill khi GV bật
//     "Dùng cài đặt riêng").
//   - hasCustomSettings + settings: cài đặt RIÊNG của lớp này, nếu có. Chưa
//     từng bật riêng thì hasCustomSettings = false, settings = {} — nghĩa là
//     lớp này đang dùng nguyên examSettings.
export async function GET(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const examId = request.nextUrl.searchParams.get('examId');
    const classId = request.nextUrl.searchParams.get('classId');
    if (!examId || !mongoose.Types.ObjectId.isValid(examId) || !classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai examId/classId.' }, { status: 400 });
    }

    await connectToDatabase();

    // Chỉ GV sở hữu đúng lớp này mới xem/sửa được cài đặt — chặn GV A xem/
    // sửa cài đặt thi của lớp GV B dù biết đúng examId/classId.
    const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    const [exam, assignment] = await Promise.all([
      Exam.findById(examId, { settings: 1 }).lean(),
      ExamAssignmentModel.findOne({ examId, classId }).lean(),
    ]);
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }

    const a: any = assignment || {};
    // Tương thích ngược: bản ghi cũ (trước khi có hasCustomSettings/settings)
    // chỉ có 2 field openAt/closeAt top-level — hễ có giá trị thì vẫn hiện
    // cho GV thấy đúng như đã tuỳ chỉnh trước đó.
    const legacyCustom = a.hasCustomSettings === undefined && a.settings === undefined && (a.openAt || a.closeAt);
    const hasCustomSettings = a.hasCustomSettings === true || !!legacyCustom;
    const settings = a.hasCustomSettings === true
      ? a.settings || {}
      : legacyCustom
        ? { openAt: a.openAt || null, closeAt: a.closeAt || null }
        : {};

    return NextResponse.json(
      {
        examSettings: (exam as any).settings || {},
        hasCustomSettings,
        settings,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy cài đặt thi:', err);
    return NextResponse.json(
      { error: 'Không lấy được cài đặt thi, thử tải lại trang.' },
      { status: 500 }
    );
  }
}

// PATCH /api/exam-assignment — GV lưu/sửa cài đặt RIÊNG cho 1 lần giao đề
// (examId + classId). Body: { examId, classId, hasCustomSettings, settings }
//   - hasCustomSettings: false -> XOÁ tuỳ chỉnh, lớp này quay về dùng nguyên
//     cài đặt mặc định của đề (settings gửi kèm nếu có sẽ bị bỏ qua).
//   - hasCustomSettings: true -> settings (object, chỉ cần chứa field GV
//     thực sự muốn ghi đè: duration/shuffle/maxAttempts/showSolution/
//     solutionOpenAt/openAt/closeAt) áp dụng CHỈ cho lớp này.
// Sửa được BẤT CỨ LÚC NÀO, không cần giao lại đề (upsert, không đụng tới
// Submission).
export async function PATCH(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const body = await request.json();
    const { examId, classId, hasCustomSettings } = body;
    const settings = body.settings && typeof body.settings === 'object' ? { ...body.settings } : {};

    if (!examId || !mongoose.Types.ObjectId.isValid(examId) || !classId || !mongoose.Types.ObjectId.isValid(classId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai examId/classId.' }, { status: 400 });
    }

    await connectToDatabase();

    const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }
    const exam = await Exam.findById(examId, { _id: 1 }).lean();
    if (!exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi này.' }, { status: 404 });
    }

    // Chuẩn hoá + validate openAt/closeAt (nếu GV có ghi đè) trước khi lưu —
    // cùng quy tắc validate như trước đây.
    if ('openAt' in settings) {
      settings.openAt = settings.openAt ? new Date(settings.openAt) : null;
      if (settings.openAt && isNaN(settings.openAt.getTime())) {
        return NextResponse.json({ error: 'Giờ mở không hợp lệ.' }, { status: 400 });
      }
    }
    if ('closeAt' in settings) {
      settings.closeAt = settings.closeAt ? new Date(settings.closeAt) : null;
      if (settings.closeAt && isNaN(settings.closeAt.getTime())) {
        return NextResponse.json({ error: 'Giờ đóng không hợp lệ.' }, { status: 400 });
      }
    }
    if (settings.openAt && settings.closeAt && settings.openAt.getTime() >= settings.closeAt.getTime()) {
      return NextResponse.json({ error: 'Giờ mở phải trước giờ đóng.' }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: new Date() };
    if (hasCustomSettings === false) {
      // Quay về mặc định: tắt cờ và xoá luôn settings riêng lẫn 2 field cũ
      // (openAt/closeAt top-level) để không còn dữ liệu cũ gây nhầm lẫn.
      update.hasCustomSettings = false;
      update.settings = {};
      update.openAt = null;
      update.closeAt = null;
    } else {
      update.hasCustomSettings = true;
      update.settings = settings;
      // Không ghi thêm vào 2 field cũ nữa — chỉ dùng `settings` từ đây.
      update.openAt = null;
      update.closeAt = null;
    }

    const updated = await ExamAssignmentModel.findOneAndUpdate(
      { examId, classId },
      { $set: update },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json(
      {
        hasCustomSettings: (updated as any).hasCustomSettings || false,
        settings: (updated as any).settings || {},
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lưu cài đặt thi:', err);
    return NextResponse.json(
      { error: 'Không lưu được cài đặt thi, thử lại giúp cô/thầy.' },
      { status: 500 }
    );
  }
}
