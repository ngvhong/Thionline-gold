'use client';

import { useEffect, useRef } from 'react';

// Báo server khi học sinh RỜI / QUAY LẠI tab-app lúc đang thi. Chỉ gửi theo SỰ
// KIỆN (ẩn tab → 'leave', hiện lại → 'back'), KHÔNG có vòng lặp heartbeat nên
// gần như không tốn tải Mongo. Quá 4 phút chưa quay lại -> server ngắt lượt thi
// thử/ôn luyện (xem lib/abandonLeft.ts). 'back' trả { abandoned: true } nếu lượt
// đã bị ngắt -> gọi onAbandoned để báo cho em.
export function useLeavePresence(opts: {
  examId: string;
  submissionId: string;
  enabled: boolean;
  onAbandoned: () => void;
}) {
  const { examId, submissionId, enabled } = opts;
  const cbRef = useRef(opts.onAbandoned);
  cbRef.current = opts.onAbandoned;
  const leftRef = useRef(false);

  useEffect(() => {
    if (!enabled || !submissionId) return;
    const url = `/api/thi/${examId}/presence`;
    const payload = (action: 'leave' | 'back') => JSON.stringify({ submissionId, action });

    function sendLeave() {
      if (leftRef.current) return;
      leftRef.current = true;
      try {
        const ok = navigator.sendBeacon?.(url, new Blob([payload('leave')], { type: 'application/json' }));
        if (!ok) {
          fetch(url, { method: 'POST', body: payload('leave'), headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
        }
      } catch {
        /* bỏ qua */
      }
    }

    async function sendBack() {
      if (!leftRef.current) return;
      leftRef.current = false;
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: payload('back'),
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        });
        const data = await res.json().catch(() => ({}));
        if (data?.abandoned) cbRef.current();
      } catch {
        /* mất mạng: lần quay lại sau sẽ thử lại */
        leftRef.current = true;
      }
    }

    const onVisibility = () => (document.visibilityState === 'hidden' ? sendLeave() : void sendBack());
    const onPageHide = () => sendLeave();
    const onPageShow = () => void sendBack();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [examId, submissionId, enabled]);
}
