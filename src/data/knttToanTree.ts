// Cây thư mục Ôn luyện theo SGK TOÁN 10, 11, 12 — bộ "Kết nối tri thức với cuộc sống"
// (Chương trình GDPT 2018). Dùng cho nút "Tạo nhanh cây Toán KNTT" của admin.
// Mỗi chương tự có thêm 1 thư mục "Ôn tập chương ..." (tương ứng "Bài tập cuối chương" của sách).
// Muốn đổi tên thư mục gốc/bài: sửa tại đây rồi bấm nút tạo nhanh lại (tên đã có thì bỏ qua, không nhân đôi).

export type KnttChapter = { name: string; lessons: string[] };
export type KnttGrade = { name: string; chapters: KnttChapter[] };

// Các nhánh đề kiểm tra theo kỳ, đặt trong mỗi Chủ đề lớp (cạnh các Chương).
export const KNTT_EXAM_FOLDERS: string[] = ['GK1', 'CK1', 'GK2', 'CK2'];

export const KNTT_TOAN_TREE: KnttGrade[] = [
  {
    name: 'Chủ đề lớp 10',
    chapters: [
      { name: 'Chương I. Mệnh đề và tập hợp', lessons: ['Bài 1. Mệnh đề', 'Bài 2. Tập hợp và các phép toán trên tập hợp'] },
      { name: 'Chương II. Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', lessons: ['Bài 3. Bất phương trình bậc nhất hai ẩn', 'Bài 4. Hệ bất phương trình bậc nhất hai ẩn'] },
      { name: 'Chương III. Hệ thức lượng trong tam giác', lessons: ['Bài 5. Giá trị lượng giác của một góc từ 0° đến 180°', 'Bài 6. Hệ thức lượng trong tam giác'] },
      {
        name: 'Chương IV. Vectơ',
        lessons: ['Bài 7. Các khái niệm mở đầu', 'Bài 8. Tổng và hiệu của hai vectơ', 'Bài 9. Tích của một vectơ với một số', 'Bài 10. Vectơ trong mặt phẳng tọa độ', 'Bài 11. Tích vô hướng của hai vectơ'],
      },
      {
        name: 'Chương V. Các số đặc trưng của mẫu số liệu không ghép nhóm',
        lessons: ['Bài 12. Số gần đúng và sai số', 'Bài 13. Các số đặc trưng đo xu thế trung tâm', 'Bài 14. Các số đặc trưng đo mức độ phân tán'],
      },
      {
        name: 'Chương VI. Hàm số, đồ thị và ứng dụng',
        lessons: ['Bài 15. Hàm số', 'Bài 16. Hàm số bậc hai', 'Bài 17. Dấu của tam thức bậc hai', 'Bài 18. Phương trình quy về phương trình bậc hai'],
      },
      {
        name: 'Chương VII. Phương pháp tọa độ trong mặt phẳng',
        lessons: ['Bài 19. Phương trình đường thẳng', 'Bài 20. Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách', 'Bài 21. Đường tròn trong mặt phẳng tọa độ', 'Bài 22. Ba đường conic'],
      },
      { name: 'Chương VIII. Đại số tổ hợp', lessons: ['Bài 23. Quy tắc đếm', 'Bài 24. Hoán vị, chỉnh hợp và tổ hợp', 'Bài 25. Nhị thức Newton'] },
      { name: 'Chương IX. Tính xác suất theo định nghĩa cổ điển', lessons: ['Bài 26. Biến cố và định nghĩa cổ điển của xác suất', 'Bài 27. Thực hành tính xác suất theo định nghĩa cổ điển'] },
    ],
  },
  {
    name: 'Chủ đề lớp 11',
    chapters: [
      {
        name: 'Chương I. Hàm số lượng giác và phương trình lượng giác',
        lessons: ['Bài 1. Giá trị lượng giác của góc lượng giác', 'Bài 2. Công thức lượng giác', 'Bài 3. Hàm số lượng giác', 'Bài 4. Phương trình lượng giác cơ bản'],
      },
      { name: 'Chương II. Dãy số. Cấp số cộng và cấp số nhân', lessons: ['Bài 5. Dãy số', 'Bài 6. Cấp số cộng', 'Bài 7. Cấp số nhân'] },
      {
        name: 'Chương III. Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm',
        lessons: ['Bài 8. Mẫu số liệu ghép nhóm', 'Bài 9. Các số đặc trưng đo xu thế trung tâm'],
      },
      {
        name: 'Chương IV. Quan hệ song song trong không gian',
        lessons: ['Bài 10. Đường thẳng và mặt phẳng trong không gian', 'Bài 11. Hai đường thẳng song song', 'Bài 12. Đường thẳng và mặt phẳng song song', 'Bài 13. Hai mặt phẳng song song', 'Bài 14. Phép chiếu song song'],
      },
      { name: 'Chương V. Giới hạn. Hàm số liên tục', lessons: ['Bài 15. Giới hạn của dãy số', 'Bài 16. Giới hạn của hàm số', 'Bài 17. Hàm số liên tục'] },
      {
        name: 'Chương VI. Hàm số mũ và hàm số lôgarit',
        lessons: ['Bài 18. Lũy thừa với số mũ thực', 'Bài 19. Lôgarit', 'Bài 20. Hàm số mũ và hàm số lôgarit', 'Bài 21. Phương trình, bất phương trình mũ và lôgarit'],
      },
      { name: 'Chương VII. Đạo hàm', lessons: ['Bài 22. Hai bài toán dẫn đến khái niệm đạo hàm', 'Bài 23. Các quy tắc tính đạo hàm', 'Bài 24. Đạo hàm cấp hai'] },
      {
        name: 'Chương VIII. Quan hệ vuông góc trong không gian',
        lessons: [
          'Bài 25. Hai đường thẳng vuông góc',
          'Bài 26. Đường thẳng vuông góc với mặt phẳng',
          'Bài 27. Phép chiếu vuông góc. Góc giữa đường thẳng và mặt phẳng',
          'Bài 28. Hai mặt phẳng vuông góc',
          'Bài 29. Khoảng cách',
          'Bài 30. Thể tích',
        ],
      },
      { name: 'Chương IX. Xác suất', lessons: ['Bài 31. Biến cố hợp, biến cố giao, biến cố độc lập', 'Bài 32. Các quy tắc tính xác suất'] },
    ],
  },
  {
    name: 'Chủ đề lớp 12',
    chapters: [
      {
        name: 'Chương I. Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
        lessons: [
          'Bài 1. Tính đơn điệu và cực trị của hàm số',
          'Bài 2. Giá trị lớn nhất và giá trị nhỏ nhất của hàm số',
          'Bài 3. Đường tiệm cận của đồ thị hàm số',
          'Bài 4. Khảo sát sự biến thiên và vẽ đồ thị của hàm số',
          'Bài 5. Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn',
        ],
      },
      {
        name: 'Chương II. Vectơ và hệ trục tọa độ trong không gian',
        lessons: ['Bài 6. Vectơ trong không gian', 'Bài 7. Hệ trục tọa độ trong không gian', 'Bài 8. Biểu thức tọa độ của các phép toán vectơ'],
      },
      {
        name: 'Chương III. Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm',
        lessons: ['Bài 9. Khoảng biến thiên và khoảng tứ phân vị', 'Bài 10. Phương sai và độ lệch chuẩn'],
      },
      { name: 'Chương IV. Nguyên hàm và tích phân', lessons: ['Bài 11. Nguyên hàm', 'Bài 12. Tích phân', 'Bài 13. Ứng dụng hình học của tích phân'] },
      {
        name: 'Chương V. Phương trình mặt phẳng, đường thẳng, mặt cầu trong không gian',
        lessons: ['Bài 14. Phương trình mặt phẳng', 'Bài 15. Phương trình đường thẳng trong không gian', 'Bài 16. Công thức tính góc trong không gian', 'Bài 17. Phương trình mặt cầu'],
      },
      { name: 'Chương VI. Xác suất có điều kiện', lessons: ['Bài 18. Xác suất có điều kiện', 'Bài 19. Công thức xác suất toàn phần và công thức Bayes'] },
    ],
  },
];

// "Chương I. Mệnh đề và tập hợp" -> "Ôn tập chương I"
export function reviewFolderName(chapterName: string): string {
  const m = chapterName.match(/^Chương\s+([IVXLC]+)\b/);
  return m ? `Ôn tập chương ${m[1]}` : 'Ôn tập chương';
}
