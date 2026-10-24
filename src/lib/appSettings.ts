import { connectToDatabase } from './mongodb';
import { AppSettingsModel, SETTINGS_DOC_ID } from './appSettingsModel';
import { FREE_TRIAL_DAYS } from './adminConfig';

// THÊM MỚI: đọc Gemini API key đã lưu trong DB (đặt ở trang Quản trị) —
// dùng CHUNG cho route /api/ai-assistant (nơi thật sự gọi Gemini) và route
// /api/admin/settings (nơi admin xem trạng thái đã cấu hình hay chưa), để
// chỉ có 1 nơi biết cách đọc cấu hình này, tránh lệch logic giữa 2 chỗ.
export async function getGeminiApiKey(): Promise<string> {
  await connectToDatabase();
  const doc: any = await AppSettingsModel.findById(SETTINGS_DOC_ID).lean();
  return doc?.geminiApiKey?.trim() || '';
}

// Lưu/ghi đè key mới — upsert vào đúng bản ghi singleton (xem
// appSettingsModel.ts), không tạo thêm bản ghi.
export async function setGeminiApiKey(key: string): Promise<void> {
  await connectToDatabase();
  await AppSettingsModel.findByIdAndUpdate(
    SETTINGS_DOC_ID,
    { geminiApiKey: key.trim(), updated_at: new Date() },
    { upsert: true }
  );
}

// THÊM MỚI (Phần 2b — gói dùng free/vĩnh viễn): đọc số ngày dùng thử mặc
// định — dùng ở route đăng ký (auth/register) để cấp freeExpiresAt cho tài
// khoản mới. Chưa cấu hình riêng trong DB (freeTrialDays === null/chưa có
// bản ghi) thì FALL BACK về hằng số FREE_TRIAL_DAYS trong adminConfig.ts,
// nên tài khoản cũ/khi mới deploy chưa có ai vào Quản trị đổi gì vẫn hoạt
// động đúng như trước (không bao giờ trả về số ngày rỗng/0 âm thầm).
export async function getFreeTrialDays(): Promise<number> {
  await connectToDatabase();
  const doc: any = await AppSettingsModel.findById(SETTINGS_DOC_ID).lean();
  const value = doc?.freeTrialDays;
  return typeof value === 'number' && value > 0 ? value : FREE_TRIAL_DAYS;
}

// Lưu/ghi đè số ngày dùng thử mặc định — upsert vào đúng bản ghi singleton,
// giống setGeminiApiKey. Validate ở đây (số nguyên dương) để không lỡ lưu
// giá trị vô lý (0, âm, số thập phân) làm hỏng tính năng đăng ký.
export async function setFreeTrialDays(days: number): Promise<void> {
  await connectToDatabase();
  await AppSettingsModel.findByIdAndUpdate(
    SETTINGS_DOC_ID,
    { freeTrialDays: days, updated_at: new Date() },
    { upsert: true }
  );
}

// THÊM MỚI (đóng/duyệt đăng ký): đọc chế độ đăng ký hiện tại — dùng ở route
// đăng ký (auth/register, cả GET công khai cho trang login lấy banner lẫn
// POST để quyết định tạo tài khoản kiểu gì) và route đăng nhập (auth/login,
// để chặn tài khoản 'pending'). CHƯA cấu hình riêng trong DB thì fallback
// về 'open' (giữ đúng hành vi trước khi có tính năng này), giống cách
// getFreeTrialDays fallback về FREE_TRIAL_DAYS ở trên.
export async function getRegistrationMode(): Promise<'open' | 'approval' | 'closed'> {
  await connectToDatabase();
  const doc: any = await AppSettingsModel.findById(SETTINGS_DOC_ID).lean();
  const value = doc?.registrationMode;
  return value === 'approval' || value === 'closed' ? value : 'open';
}

// Lưu/ghi đè chế độ đăng ký — upsert vào đúng bản ghi singleton, giống
// setFreeTrialDays/setGeminiApiKey.
export async function setRegistrationMode(mode: 'open' | 'approval' | 'closed'): Promise<void> {
  await connectToDatabase();
  await AppSettingsModel.findByIdAndUpdate(
    SETTINGS_DOC_ID,
    { registrationMode: mode, updated_at: new Date() },
    { upsert: true }
  );
}

// Che bớt key khi hiển thị cho admin (KHÔNG BAO GIỜ trả nguyên key về
// client sau khi đã lưu) — chỉ hiện vài ký tự đầu/cuối để admin nhận ra
// đúng key mình đã lưu mà không lộ toàn bộ giá trị qua network/devtools.
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
