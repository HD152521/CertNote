// 인증/도메인 오류를 HTTP 상태코드와 함께 표현한다.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// 라우트 핸들러에서 잡은 오류를 일관된 JSON 응답으로 변환한다.
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json({ error: err.code, message: err.message }, { status: err.status });
  }
  // 예기치 못한 오류: 상세는 서버 로그에만, 클라이언트엔 일반 메시지.
  console.error('[auth] 예기치 못한 오류:', err);
  return Response.json(
    { error: 'internal_error', message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
    { status: 500 },
  );
}
