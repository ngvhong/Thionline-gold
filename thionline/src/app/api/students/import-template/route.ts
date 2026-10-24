import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// GET /api/students/import-template — tải file Excel MẪU để GV điền danh
// sách học sinh rồi tải ngược lại qua "Nhập từ Excel" (xem
// /api/students/import/route.ts — cột "Họ và tên" bắt buộc, "Ngày sinh" và
// "Giới tính" tuỳ chọn, tên cột khớp đúng những gì matchColumn() ở route
// import nhận diện được để GV không bị lỗi "không tìm thấy cột tên").
// THÊM MỚI: đi kèm yêu cầu "thêm nút tải file mẫu Excel" trong khu vực nhập
// danh sách học sinh.
//
// CẬP NHẬT (khiếu nại: "thêm dòng mẫu tầm 50 dòng, thêm cột đầu là STT"):
// - Cột A "STT" thêm vào ĐẦU tiên chỉ để GV dễ đếm/theo dõi khi điền — route
//   import ở trên dò cột theo TÊN tiêu đề (matchColumn), không dò theo vị
//   trí cột, nên "STT" không khớp với "ten"/"ngay sinh"/"gioi tinh" và bị bỏ
//   qua an toàn, không ảnh hưởng tới việc nhập liệu.
// - Số dòng dữ liệu (kể cả ví dụ) tăng lên 50 dòng: 3 dòng ví dụ đầu có sẵn
//   nội dung mẫu, 47 dòng còn lại để trống (chỉ có sẵn số STT) cho GV điền
//   thẳng vào, đỡ phải tự kéo/thêm dòng khi nhập danh sách cả lớp.
export async function GET(request: NextRequest) {
  const teacherId = await getVerifiedTeacherIdFromRequest(request);
  if (!teacherId) {
    return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống thi trực tuyến';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Danh sách học sinh');

  sheet.columns = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'Họ và tên', key: 'name', width: 28 },
    { header: 'Ngày sinh', key: 'dob', width: 16 },
    { header: 'Giới tính', key: 'gender', width: 12 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 20;

  // 3 dòng ví dụ đầu để GV hình dung đúng định dạng cần điền — GV xoá nội
  // dung ví dụ (giữ nguyên STT hoặc không đều được) rồi điền danh sách thật
  // của lớp mình trước khi tải lên. Tổng cộng 50 dòng dữ liệu (STT 1-50) —
  // 47 dòng sau chỉ có sẵn STT, còn lại để trống cho GV điền trực tiếp.
  const TOTAL_ROWS = 50;
  const sampleNames: [string, string, string][] = [
    ['Nguyễn Văn An', '15/03/2010', 'Nam'],
    ['Trần Thị Bích', '22/07/2010', 'Nữ'],
    ['Lê Hoàng Cường', '', ''],
  ];
  for (let i = 0; i < TOTAL_ROWS; i++) {
    const sample = sampleNames[i];
    sheet.addRow(sample ? [i + 1, sample[0], sample[1], sample[2]] : [i + 1, '', '', '']);
  }

  const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  };
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = THIN_BORDER;
    });
  });
  sheet.getColumn('stt').font = { name: 'Arial', size: 11 };
  sheet.getColumn('stt').alignment = { horizontal: 'center' };
  sheet.getColumn('name').font = { name: 'Arial', size: 11 };
  sheet.getColumn('dob').font = { name: 'Arial', size: 11 };
  sheet.getColumn('gender').font = { name: 'Arial', size: 11 };

  // Ghi chú hướng dẫn ngay dưới bảng mẫu, để trống 1 dòng cho dễ nhìn.
  const noteRowIndex = TOTAL_ROWS + 3;
  sheet.getCell(`A${noteRowIndex}`).value =
    'Ghi chú: chỉ cột "Họ và tên" là bắt buộc, cột "STT" không bắt buộc (chỉ để dễ theo dõi). Xoá nội dung các dòng ví dụ ở trên trước khi điền danh sách thật, giữ nguyên dòng tiêu đề. Còn thiếu chỗ thì cứ thêm dòng mới bên dưới.';
  sheet.getCell(`A${noteRowIndex}`).font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF888888' } };
  sheet.mergeCells(`A${noteRowIndex}:D${noteRowIndex}`);
  sheet.getRow(noteRowIndex).alignment = { wrapText: true };

  const buf = await wb.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Mau_danh_sach_hoc_sinh.xlsx"',
    },
  });
}
