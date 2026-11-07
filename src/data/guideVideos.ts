// Link video hướng dẫn tự đăng ký / sử dụng — hiện ở icon "Video hướng dẫn"
// (component GuideVideoButton). CHỈ CẦN DÁN LINK VÀO 2 DÒNG `url` DƯỚI ĐÂY rồi deploy lại.
//   - url để '' (rỗng): icon vẫn hiện, bấm vào thấy dòng "Video sẽ được cập nhật sớm".
//   - url có link (YouTube, Google Drive, Facebook, Zalo...): bấm vào sẽ mở link ở tab mới.

export type GuideVideoRole = 'teacher' | 'student';

export interface GuideVideo {
  role: GuideVideoRole;
  title: string;
  description: string;
  url: string;
}

export const GUIDE_VIDEOS: Record<GuideVideoRole, GuideVideo> = {
  teacher: {
    role: 'teacher',
    title: 'Hướng dẫn dành cho giáo viên',
    description: 'Tự đăng ký tài khoản và bắt đầu sử dụng',
    url: 'https://youtu.be/R0-pkGqx4p4', // video hướng dẫn giáo viên
  },
  student: {
    role: 'student',
    title: 'Hướng dẫn dành cho học sinh',
    description: 'Tự đăng ký tài khoản và vào lớp làm bài',
    url: 'https://youtu.be/KPOAgJMGKjY', // video hướng dẫn học sinh
  },
};
