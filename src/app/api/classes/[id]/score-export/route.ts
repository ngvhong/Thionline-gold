import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';
import { buildScoreTable, listAssignedExamOptions } from '@/lib/scoreTable';
import { buildScoreWorkbook, buildScoreDocx } from '@/lib/scoreExport';

// GET /api/classes/[id]/score-export?format=xlsx|docx|list&examIds=id1,id2
//   → tải bảng điểm của LỚP này, gộp tất cả các đề đã từng giao (hoặc chỉ
//   những đề nêu trong examIds nếu GV muốn lọc bớt, ví dụ chỉ 1 đề) thành 1
//   bảng duy nhất, kiểu bảng điểm Azota vẫn hay xuất — mỗi hàng 1 học sinh,
//   mỗi cột 1 đề. format=list chỉ trả về JSON danh sách đề (không tạo file)
//   để giao diện hiện bảng chọn đề trước khi tải.
// THÊM MỚI (mục 4).
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
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Lớp không hợp lệ.' }, { status: 400 });
    }

    const format = (request.nextUrl.searchParams.get('format') || 'xlsx').toLowerCase();
    if (format !== 'xlsx' && format !== 'docx' && format !== 'list') {
      return NextResponse.json({ error: 'Định dạng không hỗ trợ (chỉ xlsx, docx hoặc list).' }, { status: 400 });
    }
    const examIdsParam = request.nextUrl.searchParams.get('examIds');
    const examIdsFilter = examIdsParam
      ? examIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    // THÊM MỚI: GV chọn cách tính điểm khi 1 em làm 1 đề nhiều lần —
    // 'latest' (mặc định, không đổi hành vi cũ) hoặc 'highest' (lấy điểm
    // cao nhất trong các lần đã nộp). Giá trị lạ/không hợp lệ -> coi như
    // 'latest', không chặn cả request chỉ vì tham số phụ này sai.
    const scoreModeParam = request.nextUrl.searchParams.get('scoreMode');
    const scoreMode: 'latest' | 'highest' = scoreModeParam === 'highest' ? 'highest' : 'latest';

    await connectToDatabase();

    // Xác nhận lớp có thật VÀ thuộc đúng GV đang đăng nhập — không cho tải
    // bảng điểm của lớp GV khác dù đoán đúng id.
    const cls = await ClassModel.findOne({ _id: id, ownerId: teacherId }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    // SỬA LỖI TỐC ĐỘ: format=list TRƯỚC ĐÂY gọi buildScoreTable() đầy đủ
    // (kéo theo chấm lại điểm từng phần cho MỌI học sinh × MỌI đề của lớp)
    // chỉ để lấy vài cái tên đề hiện trong menu — khiến menu "Chọn đề muốn
    // xuất" mở lên rất chậm dù chưa tải gì cả. Giờ tách riêng: list dùng
    // listAssignedExamOptions() (chỉ query tên đề, không đụng tới chấm
    // điểm) — buildScoreTable() ĐẦY ĐỦ chỉ chạy khi thật sự xuất file
    // (format=xlsx/docx) bên dưới.
    if (format === 'list') {
      const exams = await listAssignedExamOptions(id);
      return NextResponse.json({ exams });
    }

    const data = await buildScoreTable(id, (cls as any).name, (cls as any).schoolYear, examIdsFilter, scoreMode);

    if (data.exams.length === 0) {
      return NextResponse.json(
        { error: 'Lớp này chưa có đề nào được giao/nộp, chưa có gì để xuất bảng điểm.' },
        { status: 400 }
      );
    }

    const safeClassName = String((cls as any).name || 'lop').replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const dateTag = new Date().toISOString().slice(0, 10);
    // Gắn hậu tố vào tên file khi xuất theo điểm cao nhất, để GV phân biệt
    // được file nào tính kiểu gì nếu tải cả 2 bản để đối chiếu.
    const modeTag = scoreMode === 'highest' ? '_DiemCaoNhat' : '';

    if (format === 'xlsx') {
      const buf = await buildScoreWorkbook(data);
      // SỬA LỖI KIỂU (tsc): Buffer không nằm trong danh sách kiểu BodyInit mà
      // @types/node mới khai báo cho Response/NextResponse dù chạy ĐÚNG lúc
      // thực thi (Buffer vốn là Uint8Array) — bọc tường minh bằng Uint8Array
      // để qua kiểm tra kiểu, không đổi hành vi byte nào.
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="BangDiem_${safeClassName}_${dateTag}${modeTag}.xlsx"`,
        },
      });
    }

    const buf = await buildScoreDocx(data);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="BangDiem_${safeClassName}_${dateTag}${modeTag}.docx"`,
      },
    });
  } catch (err) {
    console.error('Lỗi xuất bảng điểm:', err);
    return NextResponse.json(
      { error: 'Không xuất được bảng điểm, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
