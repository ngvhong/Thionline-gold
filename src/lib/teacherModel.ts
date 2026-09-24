import mongoose from 'mongoose';

// MỚI: bắt buộc phải có model này thì "mỗi GV riêng" (bạn vừa xác nhận) mới
// làm được — không thể lọc lớp theo ownerId nếu không biết ownerId là ai.
// Đây là phần xác thực TỐI THIỂU: email + mật khẩu (hash). Chưa làm giao
// diện đăng nhập/đăng ký ở bước này — đó là việc kế tiếp sau khi xong Mongo.
const TeacherSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },

  // THÊM MỚI: thay cho việc admin phải XOÁ CỨNG tài khoản khi cần chặn 1 GV
  // (mất luôn khả năng mở lại) — 'suspended' cho phép KHOÁ tạm rồi MỞ lại
  // sau, không mất dữ liệu. 'active' là mặc định, không đổi hành vi của các
  // tài khoản đã có sẵn trước khi thêm field này.
  // THÊM MỚI (đóng/duyệt đăng ký): thêm 'pending' — chỉ route đăng ký
  // (auth/register) gán trạng thái này, ĐÚNG LÚC registrationMode ===
  // 'approval' (xem appSettings.ts). Tài khoản 'pending' KHÔNG đăng nhập
  // được (chặn ở route auth/login) cho tới khi admin bấm "Duyệt" ở tab
  // Quản trị (đổi sang 'active', xem PATCH /api/admin/teachers/[id]) —
  // không mất dữ liệu, chỉ tạm chưa cho vào, giống hẳn cách 'suspended'
  // hoạt động, chỉ khác lý do/thời điểm gán.
  status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'active' },

  // THÊM MỚI: để sẵn chỗ cho việc phân quyền nhiều admin sau này (hiện tại
  // CHƯA dùng field này ở đâu cả — trang /api/admin/* vẫn đang xác định
  // quyền quản trị bằng ADMIN_EMAIL cố định trong adminConfig.ts, không đổi
  // trong lần sửa này). Mặc định 'teacher' để không ảnh hưởng tài khoản cũ.
  role: { type: String, enum: ['teacher', 'admin'], default: 'teacher' },

  created_at: { type: Date, default: Date.now },

  // THÊM MỚI (phương án dự phòng khi tài khoản bị chiếm): tăng số này lên
  // là MỌI cookie phiên đăng nhập cũ (kể cả của kẻ đã chiếm được tài khoản)
  // lập tức mất hiệu lực, không cần đợi hết hạn 30 ngày — xem
  // `sessionVersion` trong JWT (auth.ts) và nơi so sánh ở
  // getTeacherIdFromRequest. Tăng tự động khi: (1) đặt lại mật khẩu qua
  // quên mật khẩu, (2) chủ tài khoản tự bấm "Đăng xuất tất cả thiết bị".
  // Mặc định 0, không ảnh hưởng tài khoản cũ chưa có field này (token cũ ký
  // trước khi có field này không mang sessionVersion — coi bằng 0 khi so
  // sánh, xem auth.ts).
  sessionVersion: { type: Number, default: 0 },

  // THÊM MỚI (quên mật khẩu): lưu HASH của token reset (không lưu token gốc
  // — cùng nguyên tắc với passwordHash, để lỡ DB bị lộ cũng không dùng được
  // token trực tiếp). null khi không có yêu cầu reset nào đang chờ.
  // resetTokenExpires: hết hạn sau 30 phút kể từ lúc tạo (xem forgot-password
  // route) — token cũ không dùng lại được, tự động vô hiệu dù chưa bị xoá.
  resetTokenHash: { type: String, default: null },
  resetTokenExpires: { type: Date, default: null },

  // THÊM MỚI (gói dùng free/vĩnh viễn — xem src/lib/planAccess.ts để biết
  // toàn bộ logic tính trạng thái, đây CHỈ là chỗ lưu dữ liệu thô):
  //   - planType: 'free' (mặc định, có hạn) hoặc 'lifetime' (admin cấp tay,
  //     không bao giờ hết hạn — freeExpiresAt bị bỏ qua hoàn toàn khi
  //     planType === 'lifetime').
  //   - freeExpiresAt: mốc hết hạn của gói free. Set 1 LẦN lúc ĐĂNG KÝ (xem
  //     register route, = lúc tạo tài khoản + FREE_TRIAL_DAYS ngày, xem
  //     adminConfig.ts), sau đó chỉ admin đổi được (nút "Gia hạn"/"Chuyển
  //     vĩnh viễn" ở tab Quản trị — xem PATCH /api/admin/teachers/[id]).
  // Mặc định 'free' + freeExpiresAt null: tài khoản tạo TRƯỚC khi có field
  // này (chưa từng ghi planType/freeExpiresAt trong DB) sẽ có freeExpiresAt
  // = null — planAccess.ts coi free + freeExpiresAt null là "chưa bị giới
  // hạn" (không chặn), để tránh khoá nhầm hàng loạt tài khoản cũ ngay khi
  // vừa triển khai tính năng này. Chỉ tài khoản đăng ký MỚI mới thực sự bị
  // đếm ngược ngay từ đầu.
  planType: { type: String, enum: ['free', 'lifetime'], default: 'free' },
  freeExpiresAt: { type: Date, default: null },

  // ĐÃ RÀ SOÁT (Phần 2/2, mục 2 — xác nhận planType 'lifetime' bền vững qua
  // deploy): kết quả rà toàn bộ codebase —
  //   - planType/freeExpiresAt CHỈ được ghi ở ĐÚNG 1 chỗ ngoài giá trị mặc
  //     định của schema này: nhánh 'planUpdate' trong PATCH
  //     /api/admin/teachers/[id]/route.ts (nút "Gia hạn"/"Chuyển vĩnh viễn"
  //     ở tab Quản trị) — không có route/script nào khác ghi đè 2 field này.
  //   - Không tồn tại script seed/migrate/startup nào trong dự án (đã tìm
  //     toàn bộ src/ theo từ khoá seed/migrate/init/startup) có thể tự chạy
  //     lúc server khởi động và ghi đè dữ liệu Teacher.
  //   - src/lib/mongodb.ts chỉ mở kết nối tới MONGODB_URI (biến môi trường),
  //     không có bước đồng bộ/xoá schema hay tạo lại dữ liệu mỗi lần kết
  //     nối — mongoose không tự "reset" document đã có sẵn trong DB khi
  //     app khởi động lại.
  //   => planType: 'lifetime' đã cấp cho 1 GV nằm hẳn trong MongoDB (dữ liệu
  //   ứng dụng, không phải biến môi trường/file trong source code), nên về
  //   NGUYÊN TẮC sẽ giữ nguyên qua các lần deploy tiếp theo, MIỄN LÀ deploy
  //   mới vẫn trỏ tới CÙNG MỘT MONGODB_URI (cùng cluster/database) như lúc
  //   cấp — đổi sang 1 database/cluster MongoDB khác mới là nguyên nhân duy
  //   nhất có thể "mất" trạng thái vĩnh viễn, không phải do deploy code.

  // THÊM MỚI (xác nhận email lúc đăng ký): trước đây ai cũng đăng ký được
  // bằng email bất kỳ, không cần chứng minh sở hữu email đó — dễ gây tài
  // khoản rác VÀ có rủi ro là email nhận reset-password/cảnh báo sau này
  // không thuộc về người đang dùng tài khoản. verifyTokenHash/Expires dùng
  // đúng cơ chế như resetTokenHash/Expires (chỉ lưu hash, token gốc chỉ có
  // trong email + URL, sống 24 giờ vì không khẩn cấp như quên mật khẩu).
  //
  // QUAN TRỌNG: default = TRUE (không phải false) — để tài khoản đã tồn tại
  // TRƯỚC khi thêm field này (mọi GV đang dùng app) coi như "đã xác nhận",
  // không tự nhiên bị khoá/nhắc xác nhận lại. Chỉ tài khoản ĐĂNG KÝ MỚI mới
  // bị set thẳng `false` ở register route rồi bắt xác nhận qua email.
  emailVerified: { type: Boolean, default: true },
  verifyTokenHash: { type: String, default: null },
  verifyTokenExpires: { type: Date, default: null },
});

export const TeacherModel =
  mongoose.models.Teacher || mongoose.model('Teacher', TeacherSchema);
