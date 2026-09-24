// Branding DÙNG CHUNG cho toàn app — trước đây AppLogoIcon chỉ định nghĩa
// riêng trong page.tsx (chỉ dùng được ở khu vực GV đăng nhập), nên các trang
// công khai (đăng nhập, phòng thi học sinh, màn nộp bài, bản xem mô phỏng...)
// không có logo, chỉ có chữ hoặc emoji tạm. Tách ra đây để MỌI trang import
// chung 1 nguồn, sửa 1 chỗ là đổi đồng bộ khắp app.
//
// GHI CHÚ: tên app hiện tại là "Thionline-opal" — đặt thành 1 hằng
// số DUY NHẤT ở đây để khi có tên chính thức mới, chỉ cần sửa đúng 1 dòng
// APP_NAME bên dưới là áp dụng lại toàn bộ app (sidebar, topbar, trang đăng
// nhập, thẻ <title>, các màn học sinh...), không phải tìm sửa rải rác nhiều
// file như trước.
export const APP_NAME = 'Thionline-opal';

export function AppLogoIcon({ className }: { className?: string }) {
  // SỬA (khiếu nại: "logo hiện không đủ trên điện thoại" + "thiết kế lại
  // hình vuông nét mảnh, bo góc nhẹ, không đổ bóng") — bản trước dùng viền
  // dày (strokeWidth 6), bo góc lớn (rx 22) VÀ đổ bóng mờ (filter blur), 3
  // thứ cộng lại khiến icon rối/nặng khi thu nhỏ xuống cỡ header điện thoại
  // (~28px) — các nét chồng lên nhau, nhìn như chỉ còn mỗi dấu tick. Sửa cả
  // 3: (1) bỏ hẳn filter đổ bóng, (2) giảm rx 22→10 (bo nhẹ, gần vuông hơn
  // là bo tròn), (3) giảm strokeWidth viền 6→3.2 và 2 ký tự bên trong
  // 6.05→4.4 (nét mảnh) — icon gọn, rõ nét kể cả ở cỡ rất nhỏ.
  //
  // SỬA TIẾP (khiếu nại: "để điện thoại dọc thì logo mất, chỉ còn chữ V")
  // — bản sửa trên làm nét MẢNH quá tay, cộng với gradient bạc/vàng trước
  // đó có nhiều điểm dừng gần trắng (#f7f8fa, #eef0f3, #fff2b0...) — trên
  // nền trắng của thanh header/drawer di động, viền vuông + ký hiệu Σ gần
  // như vô hình, chỉ còn dấu ✓ xanh lá (nét đậm màu duy nhất) đủ rõ để
  // thấy — nhìn nhầm thành chữ "V" đơn độc. Bản sửa lúc đó CHỈ đổi gradient
  // sang các điểm dừng đậm hơn — vẫn KHÔNG đủ, vì gốc vấn đề không phải độ
  // đậm/nhạt của từng điểm dừng mà là bản chất gradient trên nét MẢNH: ở
  // cỡ icon header di động (~24-28px), 1 nét stroke chỉ còn rộng ~1-1.5px
  // sau khi scale — quá hẹp để trình duyệt render rõ dải chuyển màu, các
  // điểm dừng bị làm mờ/trộn lẫn (anti-alias) thành 1 vệt xám nhạt gần như
  // trong suốt trên nền trắng. Dấu ✓ là màu ĐẶC (flat color) duy nhất nên
  // vẫn hiện rõ, còn viền vuông + Σ (đều dùng gradient) gần như biến mất
  // → nhìn chỉ còn mỗi ✓, dễ đọc nhầm thành chữ "V".
  //
  // SỬA ĐÚNG GỐC: bỏ hẳn 2 gradient, đổi viền vuông + Σ sang MÀU ĐẶC (flat)
  // như dấu ✓ — cùng bản chất render nên cùng luôn rõ nét ở MỌI kích cỡ,
  // không chỉ riêng dấu ✓ còn thấy được nữa.
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="7" y="7" width="86" height="86" rx="10" fill="none" stroke="#4b5563" strokeWidth="4.2" />
      <path
        d="M54.28 32.36 L19 32.36 L39.16 50 L19 67.64 L54.28 67.64"
        stroke="#b8860b"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M50.76 52.52 L61.84 63.61 L81 35.89"
        stroke="#2f8f2f"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
