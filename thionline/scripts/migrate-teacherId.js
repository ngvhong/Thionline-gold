/**
 * Script migrate 1 lần: gán teacherId cho các đề cũ (chưa có teacherId).
 *
 * Logic:
 *  - Đề có title === "2-B6-De2"  -> gán cho Nguyễn Mộng Hùng (nguyenmonghung68@gmail.com)
 *  - MỌI đề còn lại có teacherId null/không tồn tại -> gán cho Nguyen van Hong (ngvhong79@gmail.com)
 *
 * An toàn / idempotent:
 *  - Chỉ động vào các đề có teacherId là null hoặc không có field teacherId.
 *  - Đề đã có teacherId (dù của ai) sẽ KHÔNG bị đụng tới, nên chạy lại nhiều lần
 *    hoặc chạy sau khi đã có GV thứ 3/4 đăng ký và tự tạo đề mới đều an toàn.
 *  - Chạy ở mode "dry run" trước (mặc định) để xem trước sẽ đổi gì, không ghi
 *    xuống DB. Khi đã kiểm tra kỹ, thêm --apply để ghi thật.
 *
 * Cách chạy (đứng ở thư mục gốc project, nơi có node_modules và .env.local):
 *   node scripts/migrate-teacherId.js          -> chỉ xem trước (dry run)
 *   node scripts/migrate-teacherId.js --apply  -> ghi thật vào DB
 */

// Tự đọc .env.local / .env bằng tay — không cần cài package "dotenv".
const fs = require('fs');
const path = require('path');

function loadEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const APPLY = process.argv.includes('--apply');

if (!MONGODB_URI) {
  console.error(
    '❌ Thiếu MONGODB_URI. Hãy chạy script này ngay tại thư mục gốc project ' +
      '(nơi có file .env.local đang dùng khi "npm run dev").'
  );
  process.exit(1);
}

// Khai báo schema tối giản tại đây (không import từ src/lib để script chạy
// độc lập bằng node thường, không cần build/ts-node).
const ExamSchema = new mongoose.Schema(
  {
    title: String,
    teacherId: { type: String, default: null },
  },
  { strict: false } // không đụng/xoá các field khác (raw_data, settings...)
);
const TeacherSchema = new mongoose.Schema(
  { email: String, name: String },
  { strict: false }
);

const Exam = mongoose.models.Exam || mongoose.model('Exam', ExamSchema);
const Teacher = mongoose.models.Teacher || mongoose.model('Teacher', TeacherSchema);

const EMAIL_HUNG = 'nguyenmonghung68@gmail.com';
const EMAIL_HONG = 'ngvhong79@gmail.com';
const TITLE_HUNG = '2-B6-De2';

async function main() {
  console.log(`\n=== MIGRATE teacherId ===  mode: ${APPLY ? '⚠️  APPLY (ghi thật)' : '🔍 DRY RUN (chỉ xem trước)'}\n`);

  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  console.log('✅ Đã kết nối MongoDB.');

  const teacherHung = await Teacher.findOne({ email: EMAIL_HUNG });
  const teacherHong = await Teacher.findOne({ email: EMAIL_HONG });

  if (!teacherHung) {
    console.error(`❌ Không tìm thấy Teacher với email ${EMAIL_HUNG}. Dừng lại, không đổi gì cả.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (!teacherHong) {
    console.error(`❌ Không tìm thấy Teacher với email ${EMAIL_HONG}. Dừng lại, không đổi gì cả.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const hungId = teacherHung._id.toString();
  const hongId = teacherHong._id.toString();
  console.log(`👤 Hùng  -> teacherId = ${hungId}`);
  console.log(`👤 Hồng  -> teacherId = ${hongId}\n`);

  // Chỉ lấy các đề CHƯA có teacherId (null hoặc không có field) — không đụng
  // tới đề đã được gán rồi (an toàn khi chạy lại nhiều lần).
  const orphanFilter = { $or: [{ teacherId: null }, { teacherId: { $exists: false } }] };

  const orphanExams = await Exam.find(orphanFilter, { title: 1 }).lean();
  console.log(`📋 Tổng số đề chưa có teacherId (orphan): ${orphanExams.length}`);

  const hungExams = orphanExams.filter((e) => e.title === TITLE_HUNG);
  const hongExams = orphanExams.filter((e) => e.title !== TITLE_HUNG);

  console.log(`   -> ${hungExams.length} đề khớp title "${TITLE_HUNG}" sẽ gán cho Hùng`);
  hungExams.forEach((e) => console.log(`      - ${e.title}  (_id: ${e._id})`));

  console.log(`   -> ${hongExams.length} đề còn lại sẽ gán cho Hồng`);
  hongExams.forEach((e) => console.log(`      - ${e.title}  (_id: ${e._id})`));

  if (!APPLY) {
    console.log('\n🔍 Đây là DRY RUN — chưa ghi gì vào DB.');
    console.log('   Kiểm tra danh sách trên đúng chưa, rồi chạy lại với --apply để ghi thật:');
    console.log('   node scripts/migrate-teacherId.js --apply\n');
    await mongoose.disconnect();
    return;
  }

  const resHung = await Exam.updateMany(
    { ...orphanFilter, title: TITLE_HUNG },
    { $set: { teacherId: hungId } }
  );
  const resHong = await Exam.updateMany(
    { ...orphanFilter, title: { $ne: TITLE_HUNG } },
    { $set: { teacherId: hongId } }
  );

  console.log(`\n✅ Đã gán teacherId cho Hùng: ${resHung.modifiedCount} đề.`);
  console.log(`✅ Đã gán teacherId cho Hồng: ${resHong.modifiedCount} đề.`);
  console.log('🎉 Migrate xong.\n');

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Lỗi khi migrate:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
