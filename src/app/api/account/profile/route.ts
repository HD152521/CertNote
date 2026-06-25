import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';

// 로그인 사용자의 프로필(이름·생년월일·직업·목표자격증·목적·수준) 수정.
// 필수 항목(이름·생년월일·목표자격증)은 비울 수 없고, 선택 항목은 빈 값이면 null로 저장.
export async function PATCH(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const body = await req.json().catch(() => null);
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = str(body?.name);
    const birthdate = str(body?.birthdate);
    const targetCert = str(body?.targetCert);
    if (!name) throw new AppError(400, 'name_required', '이름을 입력해 주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) throw new AppError(400, 'birthdate_required', '생년월일을 올바르게 입력해 주세요.');
    if (!targetCert) throw new AppError(400, 'target_cert_required', '목표 자격증을 선택해 주세요.');

    await query(
      `UPDATE users
         SET name = $2, birthdate = $3, occupation = $4, target_cert = $5, purpose = $6, experience_level = $7
       WHERE id = $1`,
      [
        session.sub,
        name,
        birthdate,
        str(body?.occupation) || null,
        targetCert,
        str(body?.purpose) || null,
        str(body?.experienceLevel) || null,
      ],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
