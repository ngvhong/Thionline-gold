// src/lib/appUrl.ts
//
// Lấy URL gốc công khai của app để dựng các link gửi qua email (xác nhận
// email, đặt lại mật khẩu...). ƯU TIÊN biến môi trường APP_URL — đặt cố
// định trong .env / Coolify, KHÔNG phụ thuộc vào header Host của request.
//
// Lý do: sau reverse proxy (Traefik/Nginx...), nếu proxy không forward
// đúng Host gốc, `request.nextUrl.origin` có thể trả về địa chỉ nội bộ
// (vd. http://localhost:3000) thay vì domain thật — khiến link trong email
// không truy cập được từ bên ngoài. Đặt APP_URL cố định để loại bỏ hẳn rủi
// ro này. Nếu chưa kịp cấu hình APP_URL, vẫn fallback về request.nextUrl.origin
// như hành vi cũ, để không phá vỡ các môi trường (vd. Vercel) đang chạy tốt.
export function getAppUrl(requestOrigin: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, ''); // bỏ dấu / thừa ở cuối nếu có
  }
  return requestOrigin;
}
