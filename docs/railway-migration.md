# Vercel → Railway 이전 매뉴얼 (2026-11-26 작성)

## 왜 옮기나

- Vercel Hobby 플랜 사용량 초과로 프로덕션(`cert.juganlab.com`)이 **402 Payment Required**로 완전히 내려감(2026-11-26 확인).
- 초과 지표: `ISR Writes 417K/200K`(2배 초과), `Fluid Active CPU 4h33m/4h`(소폭 초과). 나머지(CDN 요청·함수 호출·전송량)는 한도 안.
- 원인: 2주차 이상 콘텐츠 페이지(`dynamicParams = true`, revalidate 미지정 → 첫 요청 때 생성해 **재배포 전까지** 캐시)가 재배포마다 전부 무효화됨. 이번 성장 작업에서 PR #97~#103 7회 배포 → 매번 사이트맵 1,679개 URL 캐시가 날아가고 크롤러·점검 스크립트가 재생성시키며 ISR Write가 누적.
- Vercel은 **"28일 8시간 뒤 자동 해제"** 라고 안내하지만(다음 사용량 주기 리셋), 그 시점이 가입자 100명 목표 기한(2026-12-09)보다 늦어서 기다리는 선택지는 버림.
- Pro 업그레이드($20/월 추정)는 즉시 풀리지만, 원인이 "자주 배포하는 성장 작업 방식" 자체라서 10배 한도(2M)로 올려도 또 넘길 수 있음. 반대로 "ISR Writes"는 **Vercel만의 과금 지표**라 Railway(또는 자체 서버) 같은 `next start` 상시 구동 호스팅으로 가면 이 지표 자체가 없음 — 구조적으로 더 지속 가능.
- 결정: **결제 없이 Railway로 이전.**

## 지금 사라진 게 있나 — 없음

Vercel Sensitive 환경변수는 저장 이후 Vercel 자신도 평문으로 돌려주지 않음(설계상 쓰기 전용, 계정 소유자도 못 읽음). 암호화는 Vercel의 키로 하고 그 키도 Vercel만 들고 있어서 복호화 자체도 Vercel 백엔드 안에서만 일어나며, 복호화된 값은 함수가 실행 중일 때 그 프로세스 메모리에만 존재함. 배포가 완전히 중단된 지금은 그 메모리 자체가 어디에도 없음.

PC 전체(디스크, 휴지통, git 기록, VS Code 로컬 히스토리, 빌드 캐시) 검색 결과 `.env.local` 등 실제 값 파일은 없음. 다만 로컬 Turbopack 개발 캐시(`.next/dev/cache`)에서 `NEXT_PUBLIC_ADSENSE_CLIENT` 값 하나(`ca-pub-8773257530258678`)는 복구함 — 이건 원래 공개돼도 안전한 값(빌드 때 브라우저 JS에 평문으로 박히는 값)이라 가능했던 것.

데이터베이스(Neon)의 가입자·학습 데이터는 전혀 영향 없음 — Vercel이 아니라 Neon에 있음.

## 환경변수 28개 처리 방법

### 자동 생성 완료 (로컬 `.env.local`에 이미 채워짐, 2026-11-26)

| 변수 | 비고 |
|---|---|
| `JWT_SECRET` | 새 값 생성됨. 교체 시 **전 사용자 로그아웃**(가입자 적어 지금 부담 작음). |
| `CRON_SECRET` | 새 값 생성됨. Railway Cron 설정 헤더와 맞춰야 함. |
| `ADMIN_PASSWORD` | 새 값 생성됨. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 새 키 쌍 생성됨. 교체 시 **기존 웹 푸시 구독 전부 무효화**(사용자 재구독 필요). |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | 로컬 캐시에서 복구됨(`ca-pub-8773257530258678`). |
| `MAIL_FROM`, `TUTOR_MODEL`, `TUTOR_DAILY_LIMIT`, `TUTOR_GLOBAL_DAILY_LIMIT`, `NEXT_PUBLIC_POSTHOG_HOST` | `.env.example` 기본값 그대로 채움. |

### 사람이 직접 받아와야 함 (아래 순서대로)

재발급해도 옛 값이 끊기지 않는 것들이라 지금 Vercel을 더 쓰게 되거나 다른 프로젝트가 같은 키를 썼어도 충돌 없음(구글만 "Add Secret" 사용, "Regenerate" 금지).

1. **`DATABASE_URL`** — console.neon.tech 로그인 → 프로젝트 → Connection string 복사(재발급 아님, 그대로 복사). 영향: 없음.
2. **`RESEND_API_KEY`** — resend.com → API Keys → 새 키 생성. 영향: 없음(옛 키도 살아있음).
3. **`ANTHROPIC_API_KEY`** — console.anthropic.com → API Keys → 새 키 생성. 영향: 없음.
4. **`GOOGLE_CLIENT_ID`** (그대로 보임) **/ `GOOGLE_CLIENT_SECRET`** — console.cloud.google.com → API 및 서비스 → 사용자 인증 정보 → 기존 OAuth 클라이언트 → **"Add Secret"**(⚠️ "Regenerate secret" 누르면 옛 것 즉시 무효화되니 피할 것) → 승인된 리디렉션 URI에 Railway 주소 **추가**(기존 Vercel 주소는 지우지 않아도 됨, 전환 중 끊김 방지):
   - `https://<railway-domain>/api/auth/google/callback`
5. **`NEXT_PUBLIC_POSTHOG_KEY`** — posthog.com 프로젝트 설정에서 그대로 복사(재발급 아님). 영향: 없음.
6. **`NEXT_PUBLIC_SENTRY_DSN`**(선택) — sentry.io 프로젝트 설정에서 그대로 복사. 없어도 앱 정상 동작(에러 추적만 비활성). 건너뛰어도 됨. 함께 쓰는 `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`(빌드 시 소스맵 업로드용, 선택)도 건너뛰어도 됨.
7. **`NEXT_PUBLIC_ADSENSE_SLOT_DAY_TOP` / `_DAY_BOTTOM` / `_HUB`**(선택) — 애드센스 콘솔 → 광고 → 광고 단위 기준에서 그대로 복사. 게시자 ID(위에서 복구됨)만 있어도 앱은 정상 동작하고, 슬롯 값이 없는 자리만 렌더 안 됨.

### 직접 정하면 되는 값

- `ADMIN_EMAIL` — 관리자로 쓸 이메일 주소.
- `APP_URL` — Railway 배포 주소로. 최종적으로 `cert.juganlab.com`을 Railway로 연결하면 그 주소.

## Railway 배포 절차

1. Railway 대시보드 → New Project → GitHub repo 연결(`CertNote`, `main` 브랜치).
2. Build: Railway가 Next.js를 자동 감지(Nixpacks). 별도 Dockerfile 불필요. 빌드 커맨드 `npm run build`, 시작 커맨드 `npm run start`(package.json 확인).
3. 위 환경변수 전부 Railway 프로젝트 → Variables 탭에 입력(`.env.local`에서 복붙, 커밋 금지).
4. **Cron**: Vercel `vercel.json`의 `{ "path": "/api/cron/reminders", "schedule": "0 23 * * *" }`를 Railway Cron(또는 별도 스케줄러)으로 재등록. 호출 시 `Authorization` 헤더에 `CRON_SECRET` 포함해야 함 — `src/app/api/cron/reminders/route.ts` 참고.
5. 첫 배포 후 Railway가 주는 임시 도메인으로 `/`, `/en`, `/login`, `/en/try` 등 핵심 페이지 200 확인.
6. 문제 없으면 **커스텀 도메인 연결**(Railway 프로젝트 → Settings → Domains → `cert.juganlab.com` 추가, Railway가 주는 CNAME/A 레코드로 DNS 변경).
7. DNS 전파 확인 후(TTL에 따라 몇 분~몇 시간) Vercel 쪽 도메인 연결은 그대로 둬도 되고(끊김 방지), 전환 확인되면 정리.
8. Google OAuth 승인된 리디렉션 URI를 최종 도메인(`https://cert.juganlab.com/api/auth/google/callback`)으로 갱신(위 4번 단계에서 Railway 임시 도메인으로 먼저 추가했다면, 최종 도메인도 추가).

## 이전 후 확인할 것

- [ ] `/`, `/en` 200, 홈 숫자 띠·카드 효과 정상
- [ ] 로그인/가입(이메일 인증 메일 발송 — Resend 키 확인), 구글 로그인
- [ ] AI 튜터 응답(Anthropic 키 확인)
- [ ] 웹 푸시 알림(새 VAPID 키로 재구독 필요 안내 필요)
- [ ] 크론(리마인더) 실제 실행 로그
- [ ] 애드센스 광고 슬롯 렌더
- [ ] GSC에 `cert.juganlab.com` 사이트맵 재제출(호스트 바뀐 거 아니면 불필요, 도메인 유지 시 생략 가능)

## 참고

- 환경변수 전체 목록·용도 주석: `.env.example`
- ISR 캐시 설계 배경: `docs/P3-step1-day-cache-design.md`
- 성장 목표·배포 위임 범위: 메모리 `project_certnote_growth_100`
