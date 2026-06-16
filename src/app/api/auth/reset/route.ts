import { AppError, errorResponse } from '@/lib/auth/errors';
import { hashPassword } from '@/lib/auth/passwords';
import { consumeResetToken, updateUserPassword } from '@/lib/auth/passwordReset';

const MIN_PASSWORD_LENGTH = 8;

// 토큰 검증 후 비밀번호 변경. 토큰은 1회성(원자적 소비).
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!token) {
      throw new AppError(400, 'invalid_body', '토큰이 없습니다.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(400, 'weak_password', `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
    }
    const userId = await consumeResetToken(token);
    if (!userId) {
      throw new AppError(400, 'invalid_token', '만료되었거나 이미 사용된 링크입니다. 다시 요청해 주세요.');
    }
    await updateUserPassword(userId, await hashPassword(password));
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
