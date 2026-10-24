import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { connectToDatabase } from '@/lib/mongodb';
import { ClassModel } from '@/lib/classModel';
import { StudentModel } from '@/lib/studentModel';
import { getVerifiedTeacherIdFromRequest } from '@/lib/auth';

// POST /api/students/import — nhập nhiều học sinh cùng lúc từ 1 file Excel
// (.xlsx/.xls) hoặc .csv, thay vì bấm "Thêm học sinh" từng em (rất cực khi
// lớp có 40-50 em). Chỉ Họ và tên là BẮT BUỘC — Ngày sinh và Giới tính để
// trống vẫn nhập được bình thường, đúng như StudentForm (thêm tay) đã cho
// phép từ trước — nhất quán giữa 2 cách nhập.
//
// GV không cần theo đúng thứ tự cột: hệ thống đọc DÒNG TIÊU ĐỀ (dòng đầu
// tiên có dữ liệu) và tự dò cột theo TÊN, chấp nhận vài cách viết phổ biến
// (có dấu/không dấu, hoa/thường) — xem matchColumn() bên dưới. Nếu file
// không có dòng tiêu đề nhận diện được cho cột tên, coi cột ĐẦU TIÊN là tên
// (để vẫn nhập được file GV tự gõ tay 1 cột duy nhất, không tiêu đề).
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — file danh sách lớp, không cần lớn
const MAX_ROWS = 500; // chặn file quá khổ (nhầm file khác) — 1 lớp không quá vài trăm em

function normalizeHeader(h: string): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt để so khớp dễ hơn
    .replace(/\s+/g, ' ');
}

function matchColumn(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const cand of candidates) {
    const idx = normalizedHeaders.findIndex((h) => h === cand);
    if (idx !== -1) return idx;
  }
  // thử khớp "chứa" nếu không khớp tuyệt đối (ví dụ "họ và tên học sinh")
  for (const cand of candidates) {
    const idx = normalizedHeaders.findIndex((h) => h.includes(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Chuẩn hoá vài cách viết giới tính phổ biến về đúng 2 giá trị Model chấp
// nhận ('Nam' | 'Nữ'). Không nhận diện được → bỏ trống (không chặn cả dòng
// chỉ vì ô giới tính lạ, vì giới tính không bắt buộc).
function normalizeGender(raw: unknown): 'Nam' | 'Nữ' | undefined {
  const v = normalizeHeader(String(raw ?? ''));
  if (!v) return undefined;
  if (['nam', 'nu', 'male', 'm', 'boy'].includes(v)) return v === 'nu' ? 'Nữ' : 'Nam';
  if (['nữ'.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), 'female', 'f', 'girl'].includes(v)) return 'Nữ';
  return undefined;
}

// Ngày sinh: giữ nguyên dạng chuỗi hiển thị "dd/mm/yyyy" (StudentModel lưu
// String, không phải Date — xem ghi chú trong studentModel.ts). Nếu ô Excel
// là kiểu Date thật (Excel tự nhận ngày tháng), format lại cho khớp; nếu là
// chuỗi/số thô thì giữ nguyên chuỗi GV đã gõ.
function normalizeDob(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(raw.getDate())}/${pad(raw.getMonth() + 1)}/${raw.getFullYear()}`;
  }
  return String(raw).trim() || undefined;
}

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getVerifiedTeacherIdFromRequest(request);
    if (!teacherId) {
      return NextResponse.json({ error: 'Bạn chưa đăng nhập.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const classId = formData.get('classId');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Thiếu file Excel.' }, { status: 400 });
    }
    if (typeof classId !== 'string' || !mongoose.Types.ObjectId.isValid(classId)) {
      return NextResponse.json({ error: 'Thiếu hoặc sai classId.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File quá nặng (trên 5MB).' }, { status: 400 });
    }
    const okExt = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!okExt) {
      return NextResponse.json({ error: 'Chỉ nhận file .xlsx, .xls hoặc .csv.' }, { status: 400 });
    }

    await connectToDatabase();

    const cls = await ClassModel.findOne({ _id: classId, ownerId: teacherId }).lean();
    if (!cls) {
      return NextResponse.json({ error: 'Không tìm thấy lớp này.' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch {
      return NextResponse.json({ error: 'Không đọc được file, kiểm tra lại định dạng.' }, { status: 400 });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return NextResponse.json({ error: 'File không có dữ liệu.' }, { status: 400 });
    }

    // header: 1 → lấy về dạng mảng-các-mảng (thay vì đoán key theo dòng đầu
    // luôn là tiêu đề) để tự xử lý việc dò cột bên dưới.
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File không có dữ liệu.' }, { status: 400 });
    }

    const headerRow = rows[0].map((c) => String(c ?? ''));
    let nameCol = matchColumn(headerRow, ['ho va ten', 'ho ten', 'ten hoc sinh', 'ten', 'name', 'full name']);
    let dobCol = matchColumn(headerRow, ['ngay sinh', 'dob', 'ngay sinh (dd/mm/yyyy)', 'date of birth']);
    let genderCol = matchColumn(headerRow, ['gioi tinh', 'gender', 'sex']);

    // "Trông giống cột STT": đa số ô ở cột này (xét cả dòng 1) là số nguyên
    // dương, tăng dần bắt đầu từ 1 — đúng đặc điểm cột STT trong file mẫu
    // (xem import-template/route.ts). Dùng để tránh lấy NHẦM cột STT làm
    // cột tên khi không dò được tiêu đề (xem nhánh nameCol === -1 bên dưới).
    function looksLikeSttColumn(colIdx: number): boolean {
      const values = rows
        .slice(0, Math.min(rows.length, 20)) // chỉ cần xét vài dòng đầu là đủ
        .map((r) => r[colIdx]);
      const nums = values.map((v) => Number(v));
      if (nums.some((n) => !Number.isInteger(n) || n <= 0)) return false;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] !== nums[i - 1] + 1) return false;
      }
      return nums.length > 0 && nums[0] === 1;
    }

    // Có dòng tiêu đề thật hay không — quyết định cách tính rowNumber bên
    // dưới (dòng 1 trong file có phải dữ liệu hay là tiêu đề cần bỏ qua).
    const hasHeaderRow = nameCol !== -1;

    let dataRows: unknown[][];
    if (nameCol === -1) {
      // Không dò được cột tên theo tiêu đề (ví dụ GV lỡ xoá/sửa dòng tiêu
      // đề nhưng vẫn giữ nguyên thứ tự cột của file mẫu: STT/Tên/Ngày
      // sinh/Giới tính). Nếu cột đầu tiên trông giống STT và file có từ 2
      // cột trở lên, suy ra đúng theo thứ tự file mẫu — cột 2 là tên, cột 3
      // ngày sinh, cột 4 giới tính — KHÔNG lấy nhầm cột STT làm tên nữa.
      // Toàn bộ file (kể cả dòng 1) được coi là dữ liệu vì không có tiêu đề
      // thật để bỏ qua.
      if (headerRow.length >= 2 && looksLikeSttColumn(0)) {
        nameCol = 1;
        dobCol = headerRow.length >= 3 ? 2 : -1;
        genderCol = headerRow.length >= 4 ? 3 : -1;
      } else {
        // File chỉ có 1 cột tên duy nhất, không có STT ở đầu.
        nameCol = 0;
        dobCol = -1;
        genderCol = -1;
      }
      dataRows = rows;
    } else {
      dataRows = rows.slice(1);
    }

    if (dataRows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `File có tới ${dataRows.length} dòng, vượt giới hạn ${MAX_ROWS} dòng/lần nhập.` },
        { status: 400 }
      );
    }

    // Lấy sẵn danh sách tên hiện có trong lớp để cảnh báo trùng (không chặn,
    // vì 2 em trùng tên là chuyện thật có thể xảy ra — chỉ để GV biết mà
    // kiểm tra lại).
    const existing = await StudentModel.find({ classId }).select('name').lean();
    const existingNames = new Set(existing.map((s: any) => normalizeHeader(s.name)));

    const toInsert: { name: string; dob?: string; gender?: 'Nam' | 'Nữ'; classId: string }[] = [];
    const errors: { row: number; reason: string }[] = [];
    const duplicateWarnings: string[] = [];
    const seenInFile = new Set<string>();

    dataRows.forEach((row, i) => {
      const rowNumber = hasHeaderRow ? i + 2 : i + 1; // số dòng thật trong Excel, để GV dễ dò lại
      const rawName = row[nameCol];
      const name = String(rawName ?? '').trim();
      if (!name) {
        // dòng trống hẳn thì bỏ qua êm, không cần báo lỗi (blankrows đã lọc
        // phần lớn, còn sót do trống mỗi cột tên).
        return;
      }
      if (name.length > 120) {
        errors.push({ row: rowNumber, reason: `Tên quá dài: "${name.slice(0, 30)}..."` });
        return;
      }

      const dob = dobCol !== -1 ? normalizeDob(row[dobCol]) : undefined;
      const gender = genderCol !== -1 ? normalizeGender(row[genderCol]) : undefined;

      const key = normalizeHeader(name);
      if (existingNames.has(key)) {
        duplicateWarnings.push(name);
      }
      if (seenInFile.has(key)) {
        duplicateWarnings.push(`${name} (lặp lại trong chính file này)`);
      }
      seenInFile.add(key);

      toInsert.push({ name, dob, gender, classId });
    });

    if (toInsert.length === 0) {
      return NextResponse.json(
        { error: 'Không tìm thấy học sinh hợp lệ nào trong file (thiếu cột tên hoặc file trống).' },
        { status: 400 }
      );
    }

    const created = await StudentModel.insertMany(toInsert, { ordered: false });

    return NextResponse.json(
      {
        createdCount: created.length,
        skippedCount: errors.length,
        errors,
        duplicateWarnings,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Lỗi nhập học sinh từ Excel:', err);
    return NextResponse.json(
      { error: 'Không nhập được danh sách, xem chi tiết ở server log.' },
      { status: 500 }
    );
  }
}
