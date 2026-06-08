import { NextResponse } from 'next/server';
import { getAuthService } from '@/lib/auth/factory';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { toPublicUser } from '@/lib/auth/types';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const user = await getAuthService().signup(body.email, body.password);
    const token = await createSessionToken({ sub: user.id, email: user.email, role: user.role });
    const res = NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
