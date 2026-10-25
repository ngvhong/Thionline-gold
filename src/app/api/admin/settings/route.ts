import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  maskApiKey,
  getFreeTrialDays,
  setFreeTrialDays,
  getRegistrationMode,
  setRegistrationMode,
  getRequireEmailVerification,
  setRequireEmailVerification,
} from '@/lib/appSettings';

// Cấu hình chung do admin chỉnh ở tab Quản trị > Cấu hình. Mọi nhánh GET/PUT
// đều trả ĐỦ toàn bộ cấu hình hiện tại (client gán thẳng vào state, thiếu
// trường nào là giao diện hiểu nhầm trường đó đang tắt).
async function buildSettingsResponse() {
  const [geminiApiKey, freeTrialDays, registrationMode, requireEmailVerification] = await Promise.all([
    getGeminiApiKey(),
    getFreeTrialDays(),
    getRegistrationMode(),
    getRequireEmailVerification(),
  ]);
  return {
    geminiApiKeyConfigured: !!geminiApiKey,
    geminiApiKeyMasked: geminiApiKey ? maskApiKey(geminiApiKey) : '',
    freeTrialDays,
    registrationMode,
    requireEmailVerification,
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập trang này.' }, { status: 403 });
    }
    return NextResponse.json(await buildSettingsResponse(), { status: 200 });
  } catch (err) {
    console.error('Lỗi lấy cấu hình app (admin):', err);
    return NextResponse.json({ error: 'Không lấy được cấu hình, xem chi tiết ở server log.' }, { status: 500 });
  }
}

// PUT nhận 1 trong các trường: geminiApiKey | freeTrialDays | registrationMode
// | requireEmailVerification — mỗi lần chỉ đổi 1 trường.
export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập trang này.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if ('geminiApiKey' in body) {
      const geminiApiKey = typeof body?.geminiApiKey === 'string' ? body.geminiApiKey.trim() : '';
      if (!geminiApiKey) {
        return NextResponse.json({ error: 'Vui lòng nhập Gemini API key.' }, { status: 400 });
      }
      await setGeminiApiKey(geminiApiKey);
      return NextResponse.json(await buildSettingsResponse(), { status: 200 });
    }

    if ('freeTrialDays' in body) {
      const days = Number(body?.freeTrialDays);
      if (!Number.isFinite(days) || !Number.isInteger(days) || days <= 0) {
        return NextResponse.json({ error: 'Số ngày dùng thử phải là số nguyên dương.' }, { status: 400 });
      }
      await setFreeTrialDays(days);
      return NextResponse.json(await buildSettingsResponse(), { status: 200 });
    }

    if ('registrationMode' in body) {
      const mode = body?.registrationMode;
      if (mode !== 'open' && mode !== 'approval' && mode !== 'closed') {
        return NextResponse.json(
          { error: "Chế độ đăng ký không hợp lệ, chỉ nhận 'open', 'approval' hoặc 'closed'." },
          { status: 400 }
        );
      }
      await setRegistrationMode(mode);
      return NextResponse.json(await buildSettingsResponse(), { status: 200 });
    }

    if ('requireEmailVerification' in body) {
      if (typeof body.requireEmailVerification !== 'boolean') {
        return NextResponse.json({ error: 'requireEmailVerification phải là true hoặc false.' }, { status: 400 });
      }
      await setRequireEmailVerification(body.requireEmailVerification);
      return NextResponse.json(await buildSettingsResponse(), { status: 200 });
    }

    return NextResponse.json(
      { error: 'Yêu cầu không hợp lệ — cần có trường geminiApiKey, freeTrialDays, registrationMode hoặc requireEmailVerification.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Lỗi lưu cấu hình app (admin):', err);
    return NextResponse.json({ error: 'Không lưu được cấu hình, xem chi tiết ở server log.' }, { status: 500 });
  }
}
