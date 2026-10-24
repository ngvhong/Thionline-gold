'use client';

import { useEffect } from 'react';

// Banner cảnh báo "đang mở bằng trình duyệt TRONG APP" (Zalo/Messenger/
// Facebook...) — các webview này hay bị hệ điều hành thu hồi bộ nhớ / tạm
// ngưng khi người dùng mở app Camera thật (chụp ảnh nộp bài tự luận) hoặc
// khi tải/xuất file, khiến thao tác thất bại dù bản thân file/ảnh hoàn toàn
// bình thường (xem giải thích trong PR review). Banner khuyên mở link bằng
// Chrome/Safari thật.
//
// DÙNG CHUNG CHO CẢ 2 PHÍA: trang học sinh (/thi/[examId]) và trang GV
// (page.tsx) đều gọi hook này, mỗi bên tự truyền `greeting`/`reasonText`
// riêng qua tham số cho đúng văn phong (xem InAppBrowserWarningOptions).
//
// CÀI ĐẶT BẰNG DOM THUẦN (không qua JSX/return của component): trang thi
// (page.tsx) có ~9 khối `if (phase === ...) return (...)` khác nhau — thay
// vì sửa JSX ở từng khối, hook này tự chèn 1 <div> cố định (position: fixed)
// thẳng vào document.body, không phụ thuộc component đang render nhánh nào.
// Chỉ cần gọi useInAppBrowserWarning() MỘT LẦN ở đầu component là banner
// theo người dùng xuyên suốt mọi màn hình.
const DISMISS_KEY = 'thionline_hide_inapp_warning';

function detectInAppBrowser(ua: string): string | null {
  if (/Zalo/i.test(ua)) return 'Zalo';
  // Facebook app + Messenger dùng chung vài token UA (FBAN/FBAV/FB_IAB).
  if (/FBAN|FBAV|FB_IAB|MessengerLiteForiOS|MessengerForiOS/i.test(ua)) return 'Facebook/Messenger';
  if (/Line\//i.test(ua)) return 'Line';
  if (/Instagram/i.test(ua)) return 'Instagram';
  return null;
}

function detectOs(ua: string): 'android' | 'ios' | 'other' {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

type InAppBrowserWarningOptions = {
  // Lời xưng hô đầu banner — mặc định "Bạn" (dùng chung, trung tính, hợp cả
  // trang học sinh lẫn trang GV). Trang GV truyền riêng "Quý Thầy, Cô" cho
  // đúng văn phong. (TRƯỚC ĐÂY trang học sinh hard-code "Em" ngay trong
  // hook — nay đổi thành tham số để mỗi trang tự truyền vào, "Em" chỉ còn
  // là ví dụ chứ không phải mặc định cứng.)
  greeting?: string;
  // Lý do cụ thể khiến webview trong app dễ lỗi — mỗi trang một hoàn cảnh
  // khác nhau (học sinh: chụp ảnh nộp bài; GV: tải ảnh/tệp lên, xuất file)
  // nên để trang gọi tự mô tả, hook không đoán hộ.
  reasonText?: string;
};

const DEFAULT_REASON_TEXT = 'dễ bị lỗi khi tải ảnh/tệp lên hoặc xử lý tác vụ nặng';

// Số mili-giây TỐI THIỂU banner phải hiển thị, TÍNH TỪ LÚC CHÈN VÀO DOM —
// không phải "tối thiểu 8s nếu component không bị unmount". Trang GV
// (page.tsx) có redirect sang /login gần như ngay khi mount nếu chưa đăng
// nhập (xem /api/auth/me), khiến component cha unmount rất sớm; nếu cleanup
// gỡ banner ngay lúc đó thì banner tắt sau chưa tới 1s dù watchdog có chạy
// hay không (watchdog chỉ chống việc webview tự xoá DOM ngoài ý muốn, KHÔNG
// chống được lượt unmount thật do chính app điều hướng đi trang khác). Nên
// sửa: cleanup không gỡ banner ngay khi unmount nữa, mà tính thời gian còn
// thiếu so với mốc 8s rồi hẹn giờ gỡ sau — banner nằm ngoài cây React
// (chèn thẳng document.body) nên vẫn sống được kể cả sau khi page.tsx đã
// unmount và /login đã mount xong.
const MIN_VISIBLE_MS = 8000;

export function useInAppBrowserWarning(options?: InAppBrowserWarningOptions) {
  const greeting = options?.greeting ?? 'Bạn';
  const reasonText = options?.reasonText ?? DEFAULT_REASON_TEXT;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const appName = detectInAppBrowser(ua);
    if (!appName) return;
    try {
      // Học sinh đã bấm "vẫn tiếp tục ở đây" trong phiên này rồi thì thôi,
      // không làm phiền lại (mỗi lần chuyển màn hình hook này chạy lại).
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {}

    const os = detectOs(ua);
    const currentUrl = window.location.href;

    const wrap = document.createElement('div');
    wrap.setAttribute(
      'style',
      'position:fixed;top:0;left:0;right:0;z-index:2147483000;' +
        'background:#fffbeb;border-bottom:1px solid #fcd34d;' +
        'padding:12px 16px;box-shadow:0 2px 8px rgba(0,0,0,.08);' +
        'font-family:inherit;'
    );

    const inner = document.createElement('div');
    inner.setAttribute('style', 'max-width:560px;margin:0 auto;');

    const title = document.createElement('p');
    title.textContent = `⚠️ ${greeting} đang mở bằng trình duyệt trong ${appName}`;
    title.setAttribute('style', 'font-size:13px;font-weight:700;color:#92400e;margin:0 0 4px;');

    const desc = document.createElement('p');
    desc.textContent = `Mở trong ${appName} ${reasonText}. Hãy mở bằng Chrome hoặc Safari để dùng ổn định hơn.`;
    desc.setAttribute('style', 'font-size:12px;color:#92400e;margin:0 0 8px;line-height:1.4;');

    const btnRow = document.createElement('div');
    btnRow.setAttribute('style', 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;');

    function makeBtn(label: string, primary: boolean) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute(
        'style',
        primary
          ? 'padding:7px 12px;font-size:12px;font-weight:600;border-radius:8px;border:none;background:#d97706;color:#fff;cursor:pointer;'
          : 'padding:7px 12px;font-size:12px;font-weight:600;border-radius:8px;border:1px solid #fcd34d;background:#fff;color:#92400e;cursor:pointer;'
      );
      return b;
    }

    // Android: ép hẳn Chrome mở đúng link hiện tại bằng URL dạng intent://
    // — hoạt động ổn định vì Android cho phép app khác can thiệp intent này.
    if (os === 'android') {
      const btn = makeBtn('Mở bằng Chrome', true);
      btn.onclick = () => {
        const bare = currentUrl.replace(/^https?:\/\//, '');
        window.location.href = `intent://${bare}#Intent;scheme=https;package=com.android.chrome;end`;
      };
      btnRow.appendChild(btn);
    }
    // iOS: dùng scheme riêng x-safari-https:// của Apple để nhảy thẳng ra
    // Safari — hoạt động với đa số app, nhưng Facebook/Messenger trên iOS
    // đôi khi tự chặn scheme lạ nên KHÔNG đảm bảo 100%; vì vậy luôn có thêm
    // nút "Sao chép link" làm phương án chắc chắn hơn.
    if (os === 'ios') {
      const btn = makeBtn('Mở bằng Safari', true);
      btn.onclick = () => {
        window.location.href = currentUrl.replace(/^https?:\/\//, 'x-safari-https://');
      };
      btnRow.appendChild(btn);
    }

    const copyBtn = makeBtn('Sao chép link', false);
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(currentUrl);
        copyBtn.textContent = 'Đã sao chép ✓';
        setTimeout(() => (copyBtn.textContent = 'Sao chép link'), 1500);
      } catch {
        window.prompt('Sao chép link này rồi dán vào Chrome/Safari:', currentUrl);
      }
    };
    btnRow.appendChild(copyBtn);

    // Cờ + hàm gỡ banner DÙNG CHUNG cho mọi đường gỡ (bấm nút, watchdog hết
    // giờ, cleanup unmount) — tránh gỡ trùng 2 lần, và là nơi DUY NHẤT thật
    // sự gọi wrap.remove().
    let removed = false;
    function removeBannerNow() {
      if (removed) return;
      removed = true;
      window.clearInterval(watchdogId);
      wrap.remove();
    }

    const closeBtn = makeBtn('Vẫn tiếp tục ở đây', false);
    closeBtn.setAttribute(
      'style',
      'padding:7px 4px;font-size:12px;color:#b45309;background:transparent;border:none;text-decoration:underline;cursor:pointer;'
    );
    closeBtn.onclick = () => {
      // Người dùng CHỦ ĐỘNG bấm đóng — tôn trọng ngay lập tức, KHÔNG bắt
      // chờ đủ 8 giây (mốc 8s chỉ áp dụng cho trường hợp banner bị dọn
      // NGOÀI Ý MUỐN do app điều hướng/unmount).
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {}
      removeBannerNow();
    };
    btnRow.appendChild(closeBtn);

    inner.appendChild(title);
    inner.appendChild(desc);
    inner.appendChild(btnRow);
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    const shownAt = Date.now();

    // Banner này được chèn thẳng vào document.body bằng JS thuần (ngoài cây
    // React) nên tồn tại độc lập với vòng đời của component gọi hook —
    // watchdog dưới đây chỉ chống trường hợp chính webview (Zalo/Messenger/
    // Facebook) tự xoá mất DOM đã chèn tay trong 8 giây đầu (vd tự "nạp
    // lại" trang); watchdog KHÔNG xử lý việc unmount do redirect, việc đó
    // xử lý riêng trong cleanup bên dưới.
    const watchdogDeadline = shownAt + MIN_VISIBLE_MS;
    const watchdogId = window.setInterval(() => {
      if (Date.now() > watchdogDeadline) {
        window.clearInterval(watchdogId);
        return;
      }
      if (!removed && !document.body.contains(wrap)) {
        document.body.appendChild(wrap);
      }
    }, 400);

    return () => {
      // SỬA (banner tắt sau chưa tới 1s trên trang GV): TRƯỚC ĐÂY cleanup
      // này gỡ banner NGAY LẬP TỨC mỗi khi component unmount — nhưng trang
      // GV (page.tsx) unmount rất sớm do router.replace('/login') chạy gần
      // như ngay khi vào trang (chưa đăng nhập trong webview Zalo), nên
      // banner bị gỡ theo dù người dùng chưa kịp đọc/bấm gì. Giờ: nếu
      // unmount xảy ra TRƯỚC KHI đủ 8 giây kể từ lúc hiện, KHÔNG gỡ ngay —
      // chỉ hẹn giờ gỡ đúng vào đúng thời điểm đủ 8 giây (banner vẫn nằm
      // nguyên trong document.body suốt khoảng chờ này, kể cả sau khi
      // /login đã mount xong, vì nó ở ngoài cây React nên không unmount
      // theo). Nếu đã đủ 8 giây rồi mới unmount thì gỡ luôn như cũ.
      const elapsed = Date.now() - shownAt;
      const remaining = MIN_VISIBLE_MS - elapsed;
      if (remaining <= 0) {
        removeBannerNow();
      } else {
        window.clearInterval(watchdogId);
        window.setTimeout(removeBannerNow, remaining);
      }
    };
  }, [greeting, reasonText]);
}
