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
    title: 'Hướng dẫn giáo viên — Video 1',
    description: 'Tự đăng ký tài khoản và bắt đầu sử dụng',
    url: 'https://youtu.be/R0-pkGqx4p4', // video 1 hướng dẫn giáo viên
  },
  student: {
    role: 'student',
    title: 'Hướng dẫn dành cho học sinh',
    description: 'Tự đăng ký tài khoản và vào lớp làm bài',
    url: 'https://youtu.be/KPOAgJMGKjY', // video hướng dẫn học sinh
  },
};

// Giáo viên có 2 video: bấm nút "Video hướng dẫn" ở trang GV sẽ hiện popup chọn
// Video 1 / Video 2. Muốn đổi tên/mô tả/link thì sửa ngay dưới đây.
export const TEACHER_VIDEO_2: GuideVideo = {
  role: 'teacher',
  title: 'Hướng dẫn giáo viên — Video 2',
  description: 'Hướng dẫn sử dụng tiếp theo',
  url: 'https://youtu.be/zZpoNg8IFlc', // video 2 hướng dẫn giáo viên
};

export const TEACHER_VIDEOS: GuideVideo[] = [GUIDE_VIDEOS.teacher, TEACHER_VIDEO_2];
