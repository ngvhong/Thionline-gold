// Branding DÙNG CHUNG cho toàn app — trước đây AppLogoIcon chỉ định nghĩa
// riêng trong page.tsx (chỉ dùng được ở khu vực GV đăng nhập), nên các trang
// công khai (đăng nhập, phòng thi học sinh, màn nộp bài, bản xem mô phỏng...)
// không có logo, chỉ có chữ hoặc emoji tạm. Tách ra đây để MỌI trang import
// chung 1 nguồn, sửa 1 chỗ là đổi đồng bộ khắp app.
//
// GHI CHÚ: tên app hiện tại là "Thionline-ap" — đặt thành 1 hằng
// số DUY NHẤT ở đây để khi có tên chính thức mới, chỉ cần sửa đúng 1 dòng
// APP_NAME bên dưới là áp dụng lại toàn bộ app (sidebar, topbar, trang đăng
// nhập, thẻ <title>, các màn học sinh...), không phải tìm sửa rải rác nhiều
// file như trước.
export const APP_NAME = 'Thionline-ap';

// ĐỔI LOGO (25-10): logo mới (khung xanh + Σ + quyển sách) là hình nhiều lớp
// có chuyển sắc, nên KHÔNG còn vẽ inline bằng <svg> trong code như bản cũ nữa.
// Lý do: logo này xuất hiện nhiều lần cùng 1 trang (header + drawer di động
// + các thẻ...), mà gradient trong SVG inline dùng id (bg, cyan, page) — nhiều
// bản cùng id trong 1 trang dễ lỗi (bản đầu bị display:none thì các bản sau
// mất màu). Dùng <img src="/logo.svg"> thì mỗi hình là 1 tài liệu SVG riêng,
// không đụng id nhau, trình duyệt cache 1 lần. Muốn đổi logo lần sau: chỉ cần
// thay file public/logo.svg (cùng với src/app/favicon.ico và các icon PNG).
// className giữ nguyên như cũ (w-10 h-10 shrink-0...) nên mọi nơi gọi không
// phải sửa.
// 25-10 (logo hiện nhanh): logo NHÚNG THẲNG dạng data URI thay vì <img src="/logo.svg">.
// Trước đây trình duyệt phải tải thêm file /logo.svg SAU khi trang hiện nên logo
// "bật" ra trễ 1 nhịp; nay dữ liệu logo đi cùng HTML nên hiện ngay lập tức, không
// thêm request. Vẫn là <img> (không phải <svg> inline) để các id gradient không đụng
// nhau khi 1 trang có nhiều logo. File public/logo.svg vẫn giữ cho favicon/tab trình
// duyệt — đổi logo thì sửa CẢ file đó LẪN chuỗi LOGO_SRC bên dưới (tạo lại bằng
// base64 của public/logo.svg).
const LOGO_SRC =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjgyIDgyIDg2MCA4NjAiIHJvbGU9ImltZyIgYXJpYS1sYWJlbD0iVGhpb25saW5lLWFwIGxvZ28iPjxkZWZzPjxsaW5lYXJHcmFkaWVudCBpZD0iYmciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwODdCRkYiLz48c3RvcCBvZmZzZXQ9IjAuNTUiIHN0b3AtY29sb3I9IiMwNjQ4RTgiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwOTJDQjgiLz48L2xpbmVhckdyYWRpZW50PjxsaW5lYXJHcmFkaWVudCBpZD0iY3lhbiIgeDE9IjAiIHkxPSIwIiB4Mj0iMSIgeTI9IjEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzAwRTdGNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzEzQTlGRiIvPjwvbGluZWFyR3JhZGllbnQ+PGxpbmVhckdyYWRpZW50IGlkPSJwYWdlIiB4MT0iMCIgeTE9IjAiIHgyPSIwLjkiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNGRkZGRkYiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNEREY1RkYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48IS0tIFJvdW5kZWQgYXBwIHRpbGU7IDglIGNsZWFyIG1hcmdpbiBmb3IgYWRhcHRpdmUgaWNvbiBjcm9wcGluZyAtLT48cmVjdCB4PSI4MiIgeT0iODIiIHdpZHRoPSI4NjAiIGhlaWdodD0iODYwIiByeD0iMTkwIiBmaWxsPSJ1cmwoI2JnKSIvPjwhLS0gT3JiaXRhbCBzdHJva2UgYmVoaW5kIHRoZSBzeW1ib2wgLS0+PHBhdGggZD0iTTMwMCA1OTUgQzM1NSA1MDAgNDY1IDQ0OCA2MjAgMzk0IEM3MTIgMzYxIDc2NCAzMDkgNzcwIDI1MyIKICAgICAgICBmaWxsPSJub25lIiBzdHJva2U9InVybCgjY3lhbikiIHN0cm9rZS13aWR0aD0iNDIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPjxwYXRoIGQ9Ik03NjAgMjgyIEM3NDggNDMzIDYxNCA1NjIgNDA1IDYyMyBDMzIyIDY0OCAyNjAgNjM0IDIzNSA1OTIgQzIwOCA1NDYgMjQ5IDQ4MiAzMzEgNDMwIgogICAgICAgIGZpbGw9Im5vbmUiIHN0cm9rZT0idXJsKCNjeWFuKSIgc3Ryb2tlLXdpZHRoPSIzNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iNzcwIiBjeT0iMjQ4IiByPSI0OSIgZmlsbD0idXJsKCNjeWFuKSIvPjxjaXJjbGUgY3g9Ijc3MCIgY3k9IjI0OCIgcj0iMjciIGZpbGw9IiNGRkZGRkYiLz48IS0tIEJvbGQgU2lnbWEgLS0+PHBhdGggZD0iTTM0NyAyNzYgSDY1MQogICAgICAgICAgIFE2NzEgMjc2IDY3MSAyOTcgVjMxOAogICAgICAgICAgIFE2NzEgMzM4IDY1MCAzMzggSDQ1NgogICAgICAgICAgIEw1NDggNDM2CiAgICAgICAgICAgUTU2NSA0NTQgNTQ4IDQ3MiBMNDU2IDU2OAogICAgICAgICAgIEg2MjkKICAgICAgICAgICBRNjUxIDU2OCA2NTEgNTkwIFY2MDgKICAgICAgICAgICBRNjUxIDYzMCA2MjkgNjMwIEgzNDcKICAgICAgICAgICBRMzIwIDYzMCAzMjAgNjA0CiAgICAgICAgICAgUTMyMCA1OTAgMzMzIDU3NiBMNDQzIDQ1NQogICAgICAgICAgIEwzMzMgMzM1CiAgICAgICAgICAgUTMyMCAzMjEgMzIwIDMwNQogICAgICAgICAgIFEzMjAgMjc2IDM0NyAyNzYgWiIKICAgICAgICBmaWxsPSIjRkZGRkZGIi8+PCEtLSBPcGVuIGJvb2ssIHRoaWNrIHNpbXBsaWZpZWQgcGFnZXMgLS0+PHBhdGggZD0iTTIxNCA2NTAKICAgICAgICAgICBDMzE1IDY3NSA0MjAgNzEyIDUxMiA4MDQKICAgICAgICAgICBDNTk0IDcxNSA3MDEgNjc1IDgxMCA2NDUKICAgICAgICAgICBMODQyIDcxOQogICAgICAgICAgIEM3MjQgNzQ5IDYxMiA3OTYgNTI2IDg3NAogICAgICAgICAgIFE1MTIgODg3IDQ5OCA4NzQKICAgICAgICAgICBDNDE0IDc5NiAzMDMgNzU4IDE4NCA3MzUgWiIKICAgICAgICBmaWxsPSJ1cmwoI3BhZ2UpIi8+PHBhdGggZD0iTTE4MSA3NTQKICAgICAgICAgICBDMzAzIDc3NSA0MTYgODExIDUxMiA4OTUKICAgICAgICAgICBDNjA4IDgxMSA3MjEgNzc1IDg0MyA3NTQKICAgICAgICAgICBMODYxIDgwMgogICAgICAgICAgIEM3MjQgODI3IDYxMSA4NjYgNTMxIDkyMwogICAgICAgICAgIFE1MTIgOTM3IDQ5MyA5MjMKICAgICAgICAgICBDNDEzIDg2NiAzMDAgODI3IDE2MyA4MDIgWiIKICAgICAgICBmaWxsPSJ1cmwoI2N5YW4pIi8+PHBhdGggZD0iTTUxMiA4MDQgVjg5NSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjEyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=';

export function AppLogoIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={LOGO_SRC} alt="" aria-hidden="true" width={40} height={40} decoding="sync" className={className} draggable={false} />
  );
}
