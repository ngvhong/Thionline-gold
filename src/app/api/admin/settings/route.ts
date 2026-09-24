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
} from '@/lib/appSettings';

// GET /api/admin/settings — cho trang Quản trị biết ĐÃ cấu hình Gemini API
// key hay chưa (kèm bản CHE BỚT/masked), và số ngày dùng thử mặc định hiện
// tại (THÊM MỚI — Phần 2b, xem getFreeTrialDays). Chỉ admin gọi được
// (giống mọi route /api/admin/* khác).
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập trang này.' }, { status: 403 });
    }

    const [geminiApiKey, freeTrialDays, registrationMode] = await Promise.all([
      getGeminiApiKey(),
      getFreeTrialDays(),
      getRegistrationMode(),
    ]);

    return NextResponse.json(
      {
        geminiApiKeyConfigured: !!geminiApiKey,
        geminiApiKeyMasked: geminiApiKey ? maskApiKey(geminiApiKey) : '',
        freeTrialDays,
        registrationMode,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Lỗi lấy cấu hình app (admin):', err);
    return NextResponse.json({ error: 'Không lấy được cấu hình, xem chi tiết ở server log.' }, { status: 500 });
  }
}

// PUT /api/admin/settings — lưu/ghi đè cấu hình. Nhận 1 TRONG 2 field
// riêng biệt trong body (ĐỘC LẬP với nhau, giống nhánh status/planUpdate ở
// PATCH teachers/[id]) để 2 khối UI (key AI + số ngày dùng thử) gọi lưu
// riêng, không bắt buộc phải gửi cả 2 field cùng lúc:
//   - "geminiApiKey": string không rỗng sau khi trim — rỗng thì từ chối
//     thay vì lỡ tay xoá key đang dùng tốt.
//   - "freeTrialDays": số nguyên dương — THÊM MỚI (Phần 2b).
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
      const [freeTrialDays, registrationMode] = await Promise.all([getFreeTrialDays(), getRegistrationMode()]);
      return NextResponse.json(
        { geminiApiKeyConfigured: true, geminiApiKeyMasked: maskApiKey(geminiApiKey), freeTrialDays, registrationMode },
        { status: 200 }
      );
    }

    if ('freeTrialDays' in body) {
      const days = Number(body?.freeTrialDays);
      if (!Number.isFinite(days) || !Number.isInteger(days) || days <= 0) {
        return NextResponse.json(
          { error: 'Số ngày dùng thử phải là số nguyên dương.' },
          { status: 400 }
        );
      }
      await setFreeTrialDays(days);
      const [geminiApiKey, registrationMode] = await Promise.all([getGeminiApiKey(), getRegistrationMode()]);
      return NextResponse.json(
        {
          geminiApiKeyConfigured: !!geminiApiKey,
          geminiApiKeyMasked: geminiApiKey ? maskApiKey(geminiApiKey) : '',
          freeTrialDays: days,
          registrationMode,
        },
        { status: 200 }
      );
    }

    // THÊM MỚI (đóng/duyệt đăng ký): nhánh lưu chế độ đăng ký — ĐỘC LẬP với
    // 2 nhánh trên, cùng nguyên tắc (chỉ 1 field/lần gọi). Chỉ nhận đúng 3
    // giá trị hợp lệ của registrationMode (xem appSettingsModel.ts).
    if ('registrationMode' in body) {
      const mode = body?.registrationMode;
      if (mode !== 'open' && mode !== 'approval' && mode !== 'closed') {
        return NextResponse.json(
          { error: "Chế độ đăng ký không hợp lệ, chỉ nhận 'open', 'approval' hoặc 'closed'." },
          { status: 400 }
        );
      }
      await setRegistrationMode(mode);
      const [geminiApiKey, freeTrialDays] = await Promise.all([getGeminiApiKey(), getFreeTrialDays()]);
      return NextResponse.json(
        {
          geminiApiKeyConfigured: !!geminiApiKey,
          geminiApiKeyMasked: geminiApiKey ? maskApiKey(geminiApiKey) : '',
          freeTrialDays,
          registrationMode: mode,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'Yêu cầu không hợp lệ — cần có trường geminiApiKey, freeTrialDays hoặc registrationMode.' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Lỗi lưu cấu hình app (admin):', err);
    return NextResponse.json({ error: 'Không lưu được cấu hình, xem chi tiết ở server log.' }, { status: 500 });
  }
}
