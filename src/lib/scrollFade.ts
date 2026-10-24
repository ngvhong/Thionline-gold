import type { CSSProperties } from 'react';

/**
 * Style bóng mờ 2 mép cho khối `overflow-x-auto` khi nội dung tràn ngang.
 *
 * Cách hoạt động (thuần CSS, không JS/state, không thêm DOM node):
 * - 2 lớp gradient "che" (cùng màu nền của khối) được `background-attachment: local`
 *   nên cuộn theo nội dung — chúng phủ kín bóng mờ ở mép khi mép đó đã ở đầu/cuối
 *   nội dung (không còn gì để cuộn thêm).
 * - 2 lớp gradient "bóng" (màu tối mờ) được `background-attachment: scroll` nên
 *   đứng yên theo khung nhìn — chỉ lộ ra khi lớp che phía trên đã cuộn dịch đi,
 *   tức là báo hiệu "còn nội dung phía đó".
 * Kết quả: bóng tự ẩn/hiện đúng theo vị trí cuộn thực tế mà không cần theo dõi
 * sự kiện scroll bằng JS, nên không có nguy cơ giật/lag hay ảnh hưởng layout.
 *
 * @param bg Màu nền thực của khối (hex/rgb), dùng để lớp che khớp màu nền,
 *           tránh lộ viền cắt giữa lớp che và nội dung thật.
 * @param edge Bề rộng vùng che/bóng theo px (mặc định 24px).
 */
export function scrollFadeX(bg: string, edge: number = 24): CSSProperties {
  return {
    backgroundImage: [
      `linear-gradient(to right, ${bg} 40%, rgba(0,0,0,0))`,
      `linear-gradient(to left, ${bg} 40%, rgba(0,0,0,0))`,
      `linear-gradient(to right, rgba(15,23,42,0.18), rgba(15,23,42,0))`,
      `linear-gradient(to left, rgba(15,23,42,0.18), rgba(15,23,42,0))`,
    ].join(', '),
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${edge}px 100%, ${edge}px 100%, ${Math.round(edge * 0.4)}px 100%, ${Math.round(edge * 0.4)}px 100%`,
    backgroundPosition: '0 0, 100% 0, 0 0, 100% 0',
    backgroundAttachment: 'local, local, scroll, scroll',
  };
}
