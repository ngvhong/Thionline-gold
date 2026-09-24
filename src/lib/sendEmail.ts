// PHƯƠNG ÁN GMAIL SMTP (gửi mail thật tới đúng email đã đăng ký) — dùng
// nodemailer + SMTP của Gmail thay cho Resend. An toàn hơn cho giai đoạn
// hiện tại vì: (1) KHÔNG cần domain riêng phải verify, (2) không giới hạn
// "chỉ gửi tới email chủ tài khoản" như Resend free/chưa verify domain,
// (3) dùng App Password riêng cho ứng dụng, không phải mật khẩu Gmail thật.
//
// CÀI ĐẶT (chưa có sẵn trong dự án, cần thêm vào package.json):
//   npm install nodemailer
//   npm install -D @types/nodemailer
//
// CẤU HÌNH (.env.local):
//   GMAIL_USER=ten-tai-khoan@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (App Password 16 ký tự, KHÔNG
//     phải mật khẩu Gmail thường — xem hướng dẫn lấy App Password bên dưới)
//   GMAIL_FROM_NAME=Thionline-opal               (tuỳ chọn, tên hiển thị người gửi)
//
// LẤY APP PASSWORD:
//   1. Tài khoản Gmail dùng để gửi PHẢI bật xác minh 2 bước (2-Step
//      Verification) tại myaccount.google.com/security — nếu chưa bật thì
//      Google không cho tạo App Password.
//   2. Vào myaccount.google.com/apppasswords, tạo App Password mới cho
//      "Mail" (hoặc tên tuỳ chọn, ví dụ "Thionline-opal"), Google sinh ra chuỗi
//      16 ký tự — dán chuỗi đó vào GMAIL_APP_PASSWORD.
//   3. Gmail SMTP có giới hạn khoảng ~500 email/ngày cho tài khoản cá nhân —
//      đủ cho giai đoạn demo/ít người dùng, nếu scale lên cần dịch vụ email
//      chuyên dụng (Resend, SES, SendGrid...).
//
// CHƯA CẤU HÌNH GMAIL_USER/GMAIL_APP_PASSWORD: hàm KHÔNG throw lỗi (để
// không chặn luồng "quên mật khẩu" khi đang demo chưa gắn email) — thay vào
// đó log thẳng nội dung + link reset ra console server. Đây là hành vi TẠM
// cho giai đoạn demo, production thật bắt buộc phải cấu hình đầy đủ, và khi
// đã cấu hình thì việc gửi mail là HOÀN TOÀN TỰ ĐỘNG, không cần admin can
// thiệp thủ công.
import nodemailer from 'nodemailer';

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return cachedTransporter;
}

function getFrom() {
  const user = process.env.GMAIL_USER || '';
  const name = process.env.GMAIL_FROM_NAME || 'Thionline-opal';
  return `"${name}" <${user}>`;
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn(
      `[sendEmail] Chưa cấu hình GMAIL_USER/GMAIL_APP_PASSWORD — KHÔNG gửi được email thật.\n` +
        `[sendEmail] Link đặt lại mật khẩu cho ${toEmail}:\n${resetUrl}`
    );
    return;
  }

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: toEmail,
      subject: 'Đặt lại mật khẩu — Thionline-opal',
      html: `
        <p>Bạn (hoặc ai đó dùng email này) vừa yêu cầu đặt lại mật khẩu cho tài khoản Thionline-opal.</p>
        <p><a href="${resetUrl}">Bấm vào đây để đặt lại mật khẩu</a> (liên kết hết hạn sau 30 phút).</p>
        <p>Nếu không phải bạn yêu cầu, có thể bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.</p>
      `,
    });
  } catch (err) {
    // Không throw ra ngoài để lỗi gửi mail không làm hỏng toàn bộ request
    // /forgot-password — chỉ log lại để debug, response API vẫn trả thông
    // báo chung chung như bình thường (xem route).
    console.error('[sendEmail] Gửi email thất bại:', err);
  }
}

// THÊM MỚI (xác nhận email lúc đăng ký): gửi ngay sau khi tạo tài khoản
// (xem register route) — cùng nguyên tắc "không chặn response nếu gửi mail
// lỗi/chưa cấu hình" như 2 hàm trên, vì đăng ký vẫn cho vào dùng app ngay,
// chỉ nhắc xác nhận email chứ không khoá.
export async function sendVerificationEmail(toEmail: string, verifyUrl: string): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn(
      `[sendEmail] Chưa cấu hình GMAIL_USER/GMAIL_APP_PASSWORD — KHÔNG gửi được email xác nhận.\n` +
        `[sendEmail] Link xác nhận email cho ${toEmail}:\n${verifyUrl}`
    );
    return;
  }

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: toEmail,
      subject: 'Xác nhận email — Thionline-opal',
      html: `
        <p>Cảm ơn bạn đã đăng ký tài khoản Thionline-opal.</p>
        <p><a href="${verifyUrl}">Bấm vào đây để xác nhận địa chỉ email này</a> (liên kết hết hạn sau 24 giờ).</p>
        <p>Nếu không phải bạn đăng ký, có thể bỏ qua email này.</p>
      `,
    });
  } catch (err) {
    console.error('[sendEmail] Gửi email xác nhận thất bại:', err);
  }
}

export async function sendAdminLoginAlertEmail(
  toEmail: string,
  info: { ip: string; time: Date }
): Promise<void> {
  const transporter = getTransporter();
  const timeStr = info.time.toLocaleString('vi-VN');

  if (!transporter) {
    console.warn(
      `[sendEmail] Chưa cấu hình GMAIL_USER/GMAIL_APP_PASSWORD — KHÔNG gửi được cảnh báo đăng nhập admin.\n` +
        `[sendEmail] Tài khoản admin (${toEmail}) vừa đăng nhập lúc ${timeStr} từ IP ${info.ip}.`
    );
    return;
  }

  try {
    await transporter.sendMail({
      from: getFrom(),
      to: toEmail,
      subject: 'Cảnh báo: có lượt đăng nhập vào tài khoản quản trị — Thionline-opal',
      html: `
        <p>Tài khoản <b>quản trị</b> (${toEmail}) của Thionline-opal vừa được đăng nhập:</p>
        <ul>
          <li>Thời gian: ${timeStr}</li>
          <li>Địa chỉ IP: ${info.ip}</li>
        </ul>
        <p><b>Nếu đây không phải bạn</b>, hãy đặt lại mật khẩu ngay (link "Quên mật khẩu" ở trang đăng
        nhập) — đặt lại mật khẩu sẽ tự động huỷ mọi phiên đăng nhập cũ đang tồn tại, kể cả phiên của
        người vừa đăng nhập trái phép. Bạn cũng có thể vào menu tài khoản và bấm "Đăng xuất tất cả
        thiết bị" để huỷ ngay các phiên khác mà không cần đổi mật khẩu.</p>
        <p>Nếu đây đúng là bạn, có thể bỏ qua email này.</p>
      `,
    });
  } catch (err) {
    console.error('[sendEmail] Gửi cảnh báo đăng nhập admin thất bại:', err);
  }
}
