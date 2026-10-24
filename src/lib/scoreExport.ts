import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
  VerticalAlign,
  ShadingType,
  VerticalMergeType,
} from 'docx';
import { formatScoreCell, formatPartScore, formatEssayScore, type ScoreTableData } from './scoreTable';

// THÊM MỚI (mục 4): xuất bảng điểm dạng Excel — mỗi hàng 1 học sinh, mỗi
// cột 1 đề (đúng kiểu Azota vẫn hay xuất). Dùng exceljs (không phải gói
// "xlsx" nhẹ hơn) vì cần style tiêu đề/đóng băng hàng-cột đầu, thứ mà gói
// "xlsx" cơ bản không hỗ trợ tốt.
//
// SỬA (mục "tổng điểm từng phần"): khi GV xuất RIÊNG 1 đề (data.exams.length
// === 1), bảng có thêm 3 cột phụ Phần I/Phần II/Phần III bên cạnh cột Tổng
// điểm — GV xem được điểm từng phần mà không cần mở lại bài làm. Khi xuất
// NHIỀU đề cùng lúc, bảng giữ nguyên kiểu cũ (mỗi đề 1 cột, chỉ hiện tổng
// điểm) — không đủ chỗ hợp lý để chi tiết từng phần từng đề trên cùng 1
// bảng, đúng yêu cầu "xuất điểm nhiều đề chỉ xuất tổng điểm".
export async function buildScoreWorkbook(data: ScoreTableData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống thi trực tuyến';
  wb.created = new Date();

  const FONT = { name: 'Arial', size: 11 };
  const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  const SUB_HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
  const PART_HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E5A8F' } };
  const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  };

  const singleExamMode = data.exams.length === 1;

  const sheet = wb.addWorksheet('Bảng điểm', {
    // đóng băng 3 cột đầu (STT/Họ tên/Ngày sinh) + 2 hoặc 3 hàng đầu (tiêu
    // đề) tùy chế độ 1 đề (có thêm hàng phụ Phần I/II/III) hay nhiều đề.
    views: [{ state: 'frozen', xSplit: 3, ySplit: singleExamMode ? 3 : 2 }],
  });

  if (singleExamMode) {
    const ex = data.exams[0];
    const totalCols = 3 + 5; // STT, Họ tên, Ngày sinh + Phần I, Phần II, Phần III, Phần IV, Tổng điểm

    // ----- Dòng tiêu đề báo cáo -----
    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `BẢNG ĐIỂM LỚP ${data.className} — Năm học ${data.schoolYear}`;
    titleCell.font = { ...FONT, size: 14, bold: true, color: { argb: 'FF1E3A5F' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 26;

    // ----- Hàng 2-3: tiêu đề cột, 3 cột đầu gộp dọc 2 hàng, cột đề gộp
    // ngang thành tiêu đề đề thi (hàng 2) + 5 cột con Phần I/II/III/IV/Tổng
    // (hàng 3) -----
    const fixedHeaders = ['STT', 'Họ và tên', 'Ngày sinh'];
    fixedHeaders.forEach((h, i) => {
      const col = i + 1;
      sheet.mergeCells(2, col, 3, col);
      const cell = sheet.getCell(2, col);
      cell.value = h;
      cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      [sheet.getCell(2, col), sheet.getCell(3, col)].forEach((c) => (c.border = THIN_BORDER));
    });

    sheet.mergeCells(2, 4, 2, 8);
    const examTitleCell = sheet.getCell(2, 4);
    examTitleCell.value = ex.title;
    examTitleCell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    examTitleCell.fill = HEADER_FILL;
    examTitleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    const partHeaders = ['Phần I', 'Phần II', 'Phần III', 'Phần IV', 'Tổng điểm'];
    partHeaders.forEach((h, i) => {
      const col = 4 + i;
      const cell = sheet.getCell(3, col);
      cell.value = h;
      cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = PART_HEADER_FILL;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    for (let c = 1; c <= totalCols; c++) sheet.getCell(3, c).border = THIN_BORDER;
    for (let c = 4; c <= totalCols; c++) sheet.getCell(2, c).border = THIN_BORDER;
    sheet.getRow(2).height = 26;
    sheet.getRow(3).height = 24;

    // ----- Cột độ rộng -----
    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 26;
    sheet.getColumn(3).width = 14;
    for (let c = 4; c <= totalCols; c++) sheet.getColumn(c).width = 13;

    // ----- Dữ liệu học sinh -----
    data.students.forEach((st, rowOffset) => {
      const r = sheet.getRow(3 + 1 + rowOffset);
      r.getCell(1).value = rowOffset + 1;
      r.getCell(2).value = st.name;
      r.getCell(3).value = st.dob || '';

      const cell = st.cells[ex.examId];
      r.getCell(4).value = formatPartScore(cell?.partScores?.p1);
      r.getCell(5).value = formatPartScore(cell?.partScores?.p2);
      r.getCell(6).value = formatPartScore(cell?.partScores?.p3);
      r.getCell(7).value = formatEssayScore(cell);
      r.getCell(8).value = formatScoreCell(cell);
      for (let c = 4; c <= 8; c++) r.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(8).font = { ...FONT, bold: true };

      if (cell?.status === 'đã nộp') {
        for (let c = 4; c <= 8; c++) r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
      } else if (cell?.status === 'chưa thi' || cell?.status === 'đang thi') {
        for (let c = 4; c <= 8; c++) r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
      }

      for (let c = 1; c <= totalCols; c++) {
        const c1 = r.getCell(c);
        if (!c1.font || !c1.font.name) c1.font = { ...FONT, ...c1.font };
        c1.border = THIN_BORDER;
        if (c === 1 || c === 3) c1.alignment = { horizontal: 'center', vertical: 'middle' };
        if (c === 2) c1.alignment = { horizontal: 'left', vertical: 'middle' };
      }
      if (rowOffset % 2 === 1) {
        for (let c = 1; c <= 3; c++) {
          const c1 = r.getCell(c);
          if (!c1.fill) c1.fill = SUB_HEADER_FILL;
        }
      }
    });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ----- Chế độ nhiều đề: mỗi đề 1 cột, chỉ hiện tổng điểm (giữ nguyên hành vi cũ) -----
  const totalCols = 3 + data.exams.length + 1; // STT + Họ tên + Ngày sinh + [mỗi đề] + Điểm TB

  sheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `BẢNG ĐIỂM LỚP ${data.className} — Năm học ${data.schoolYear}`;
  titleCell.font = { ...FONT, size: 14, bold: true, color: { argb: 'FF1E3A5F' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  const headerRowIdx = 2;
  const headers = ['STT', 'Họ và tên', 'Ngày sinh', ...data.exams.map((e) => e.title), 'Điểm TB'];
  const headerRow = sheet.getRow(headerRowIdx);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = THIN_BORDER;
  });
  headerRow.height = 32;

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 26;
  sheet.getColumn(3).width = 14;
  data.exams.forEach((_e, i) => {
    sheet.getColumn(4 + i).width = 20;
  });
  sheet.getColumn(totalCols).width = 12;

  data.students.forEach((st, rowOffset) => {
    const r = sheet.getRow(headerRowIdx + 1 + rowOffset);
    r.getCell(1).value = rowOffset + 1;
    r.getCell(2).value = st.name;
    r.getCell(3).value = st.dob || '';

    let sum = 0;
    let count = 0;
    data.exams.forEach((ex, ci) => {
      const cell = st.cells[ex.examId];
      const c = r.getCell(4 + ci);
      const text = formatScoreCell(cell);
      c.value = text;
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      if (cell?.status === 'đã nộp') {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
        if (cell.scorePoints !== null && cell.maxScorePoints) {
          sum += cell.scorePoints;
          count += 1;
        } else if (cell.score !== null && cell.total) {
          sum += (cell.score / cell.total) * 10; // quy đổi tạm về thang 10 nếu đề không có scorePoints
          count += 1;
        }
      } else if (cell?.status === 'chưa thi' || cell?.status === 'đang thi') {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
      }
    });

    const avgCell = r.getCell(totalCols);
    avgCell.value = count > 0 ? Number((sum / count).toFixed(2)) : '';
    avgCell.font = { ...FONT, bold: true };
    avgCell.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let c = 1; c <= totalCols; c++) {
      const cell = r.getCell(c);
      cell.font = cell.font || FONT;
      if (!cell.font.name) cell.font = { ...FONT, ...cell.font };
      cell.border = THIN_BORDER;
      if (c === 1 || c === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (c === 2) cell.alignment = { horizontal: 'left', vertical: 'middle' };
    }
    if (rowOffset % 2 === 1) {
      for (let c = 1; c <= 3; c++) {
        const cell = r.getCell(c);
        if (!cell.fill) cell.fill = SUB_HEADER_FILL;
      }
    }
  });

  sheet.getCell(headerRowIdx, 1).font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// THÊM MỚI (mục 4): xuất bảng điểm dạng Word — dùng bảng (Table) đơn giản,
// đủ để GV in ra hoặc gửi phụ huynh. SỬA: cũng thêm chế độ 1 đề có 3 cột phụ
// Phần I/II/III (2 hàng tiêu đề, giống bản Excel) — xuất nhiều đề vẫn giữ
// bảng đơn giản như cũ.
export async function buildScoreDocx(data: ScoreTableData): Promise<Buffer> {
  const singleExamMode = data.exams.length === 1;
  const totalCols = singleExamMode ? 8 : 3 + data.exams.length + 1;
  const colWidthPct = 100 / totalCols;

  const headerCell = (text: string, opts: { colSpan?: number; rowSpanStart?: boolean; rowSpanContinue?: boolean } = {}) =>
    new TableCell({
      width: { size: colWidthPct * (opts.colSpan || 1), type: WidthType.PERCENTAGE },
      columnSpan: opts.colSpan,
      verticalMerge: opts.rowSpanStart ? VerticalMergeType.RESTART : opts.rowSpanContinue ? VerticalMergeType.CONTINUE : undefined,
      shading: { type: ShadingType.SOLID, color: '1E3A5F', fill: '1E3A5F' },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })],
        }),
      ],
    });

  const rows: TableRow[] = [];

  if (singleExamMode) {
    const ex = data.exams[0];
    // Hàng 1: STT/Họ tên/Ngày sinh gộp dọc 2 hàng, tên đề gộp ngang 5 cột.
    rows.push(
      new TableRow({
        children: [
          headerCell('STT', { rowSpanStart: true }),
          headerCell('Họ và tên', { rowSpanStart: true }),
          headerCell('Ngày sinh', { rowSpanStart: true }),
          headerCell(ex.title, { colSpan: 5 }),
        ],
      })
    );
    // Hàng 2: 3 ô đầu là phần tiếp của gộp dọc, sau đó Phần I/II/III/IV/Tổng.
    rows.push(
      new TableRow({
        children: [
          headerCell('', { rowSpanContinue: true }),
          headerCell('', { rowSpanContinue: true }),
          headerCell('', { rowSpanContinue: true }),
          headerCell('Phần I'),
          headerCell('Phần II'),
          headerCell('Phần III'),
          headerCell('Phần IV'),
          headerCell('Tổng điểm'),
        ],
      })
    );

    data.students.forEach((st, i) => {
      const cell = st.cells[ex.examId];
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(i + 1), size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: st.name, size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: st.dob || '', size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatPartScore(cell?.partScores?.p1) || '—', size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatPartScore(cell?.partScores?.p2) || '—', size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatPartScore(cell?.partScores?.p3) || '—', size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatEssayScore(cell) || '—', size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatScoreCell(cell) || '—', bold: true, size: 20 })] })],
            }),
          ],
        })
      );
    });
  } else {
    rows.push(
      new TableRow({
        children: ['STT', 'Họ và tên', 'Ngày sinh', ...data.exams.map((e) => e.title), 'Điểm TB'].map((text) => headerCell(text)),
        tableHeader: true,
      })
    );

    data.students.forEach((st, i) => {
      let sum = 0;
      let count = 0;
      const scoreCells = data.exams.map((ex) => {
        const cell = st.cells[ex.examId];
        const text = formatScoreCell(cell);
        if (cell?.status === 'đã nộp') {
          if (cell.scorePoints !== null && cell.maxScorePoints) {
            sum += cell.scorePoints;
            count += 1;
          } else if (cell.score !== null && cell.total) {
            sum += (cell.score / cell.total) * 10;
            count += 1;
          }
        }
        return new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: text || '—', size: 20 })] })],
        });
      });
      const avg = count > 0 ? (sum / count).toFixed(2) : '—';

      rows.push(
        new TableRow({
          children: [
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(i + 1), size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: st.name, size: 20 })] })],
            }),
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: st.dob || '', size: 20 })] })],
            }),
            ...scoreCells,
            new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: avg, bold: true, size: 20 })] })],
            }),
          ],
        })
      );
    });
  }

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: totalCols > 6 ? ('landscape' as const) : ('portrait' as const) },
          },
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `BẢNG ĐIỂM LỚP ${data.className}`, bold: true })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Năm học ${data.schoolYear}`, italics: true, size: 22 })],
          }),
          new Paragraph({ text: '' }),
          table,
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Xuất lúc: ${new Date(data.generatedAt).toLocaleString('vi-VN')}`,
                italics: true,
                size: 18,
                color: '888888',
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
