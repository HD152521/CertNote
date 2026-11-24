# 호스팅 이전 검토 · 페이지 무게 측정 (2026-11-24)

Vercel Hobby 한도 초과로 사이트가 멈춘 일(11-23~24)에서 시작한 조사 기록이다. 확인한 것과 못 한 것을 나눠 적는다.
**이 문서에 비밀 값은 없다.** 환경변수는 이름만 적는다.

## 1. 무슨 일이 있었나

- 11-23~24 `cert.juganlab.com` 의 모든 경로(로그인·API 포함)가 `402 DEPLOYMENT_DISABLED` 였다. 사이트 전체 정지이지 로그인 버그가 아니다.
- 구글봇도 402 를 받는다. 길어지면 색인된 페이지를 잃을 위험이 있다.
- 사용량(Vercel 함수 실행 시간, 사용자가 붙여준 값. 직접 검증하지는 못함):

| 기준 | cert-note | auto-ops |
|---|---|---|
| 11-23 하루 | 18분 06초 (25.9%) | 51분 41초 (74%) |
| 평균 | 3시간 17분 (70.8%) | 1시간 21분 (29.2%) |

  - **갑작스러운 하루 급증은 auto-ops**(`/api/index`, 호출당 CPU 약 2.7초), **평소 소모는 cert-note** 로 읽힌다.
- Hobby 는 비상업용이라 애드센스를 붙이면 약관과 충돌한다(Pro 는 월 $20부터).

### 한도 초과의 구조적 원인(추정, 실측 아님)
- week2+ day 페이지(1,257개)는 첫 요청 때 만들어 캐시한다(`dayStaticParams()` 가 `[]`, `docs/P3-step1-day-cache-design.md`).
- 페이지 1개의 ISR 저장물이 크다(아래 3절). ISR 쓰기는 8KB 단위로 세므로 페이지당 약 180회, 전부 한 번씩 열리면 약 22.6만 회로 Hobby 한도(20만)를 넘는다.
- 그 1,257개를 다 여는 건 사람보다 크롤러일 가능성이 높다. 다만 **어떤 크롤러였는지는 확인하지 못했다**(프로젝트가 멈춰 접속 로그를 못 봤다). 앞서 받은 분석에는 구글 외에 Meta 계열 봇도 있었다.
- 배포할 때마다 캐시가 비워져 같은 쓰기가 반복된다.

## 2. 호스팅 대안

| 방법 | 비용 | 메모 |
|---|---|---|
| Railway Hobby | 월 $5 (사용량 $5 포함, 초과분 과금) | `next build` + `next start` 로 코드 수정 없이 가능. 체험(Trial) 크레딧은 이미 소진돼 업그레이드 필요 |
| Render | 유료 인스턴스(가격 미확인) | 무료는 15분 유휴 시 슬립 — 실사용 사이트에 부적합 |
| Oracle Cloud 무료 VM | $0 | 서버를 직접 관리 |
| Cloudflare Workers | 무료 한도 넉넉 | Next 16·`proxy.ts` 호환 미검증. 급할 때는 위험 |
| Vercel 잔류 + 사용량 절감 | $0 | 봇 차단·페이지 무게 감소 필요. 광고를 붙이면 약관 문제 |

- 결정은 사용자 몫이다(결제·계정 작업은 직접). 논의 결과: **Railway Hobby 로 먼저 살리고, 그동안 크롤링 비용을 줄이는 쪽**을 권했다. 아직 결정 전.
- 코드 수정 없이 올릴 수 있다: `npm run build` / `npm start` 가 있고 Vercel 전용 코드가 없다. `vercel.json` 의 `regions: ["sin1"]` 는 무시되며 Railway 는 Singapore 리전을 고르면 된다.
- **cron 은 따로 만들어야 한다.** `vercel.json` 에 `/api/cron/reminders` 가 `0 23 * * *`(UTC 23시 = 한국 08시)로 걸려 있다. 인증은 `Authorization: Bearer <CRON_SECRET>` 또는 `x-cron-secret` 헤더.
- DB 는 외부 Neon(Postgres)이라 **옮길 필요가 없다.** 같은 `DATABASE_URL` 만 넣으면 회원·데이터가 그대로 붙는다.

## 3. 환경변수 — 가장 중요한 발견

`vercel env pull` 로 받은 `.env.production` 의 앱 변수 18개 중 17개가 값이 아니라 **`[SENSITIVE]` 자리표시자**였다. Vercel 이 Sensitive 로 저장한 변수는 내려주지 않는다. 값이 있던 건 `NEXT_PUBLIC_ADSENSE_CLIENT` 하나뿐이다.

- 처음 "값 있음"이라고 한 건 비어 있는지만 보고 자리표시자인지 보지 않은 **확인 누락**이었다. 이전을 시작한 뒤 빌드가 `Invalid URL`(APP_URL 이 `[SENSITIVE]`)로 깨져서 발견했다.
- 로컬 `CertNote-open/.env` 는 개발용이다(DB 이름 `certnote_dev`, 운영은 `neondb`). 운영에 쓰면 안 된다.
- `.env*`, `.vercel` 은 `.gitignore` 에 걸려 있어 커밋될 위험은 없었다.

| 변수 | 복구 방법 | 영향 |
|---|---|---|
| `DATABASE_URL` | Neon 콘솔에서 운영 DB(`neondb`) 연결 문자열 확인 또는 비밀번호 재설정 | 데이터는 그대로 |
| `GOOGLE_CLIENT_ID` / `SECRET` | 구글 클라우드 콘솔. 시크릿은 새로 발급 | 없음 |
| `ANTHROPIC_API_KEY` | 콘솔에서 새로 발급 | 없음 |
| `JWT_SECRET` | 새 값 | **기존 로그인이 모두 풀림** |
| `VAPID_*`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | 새 키 쌍 | 기존 푸시 구독이 끊김 |
| `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | 새로 정함 | 없음 |
| `APP_URL` | `https://cert.juganlab.com` | 없음 |
| `TUTOR_MODEL`, `TUTOR_DAILY_LIMIT`, `NEXT_PUBLIC_POSTHOG_*` | 기본값(`.env.example`)·PostHog 설정 화면 | 없음 |

Vercel 이 자동으로 붙인 `VERCEL*`, `NX_DAEMON`, `TURBO_*` 는 옮기지 않는다.
**앞으로는 운영 비밀 값을 Vercel 외에 비밀번호 관리자 같은 곳에 따로 보관해야 한다.** 이번에 보관본이 없어서 전부 재발급 대상이 됐다.

## 4. 페이지 무게 측정

프로덕션 빌드(`next build`)의 출력으로 직접 쟀다. saa-c03 week1 day1 한 페이지:

| 파일 | 크기 |
|---|---|
| `day1.html` | 225,831B |
| `day1.rsc` | 136,232B |
| `day1.segments/_full.segment.rsc` | 136,232B — **`.rsc` 와 바이트까지 동일한 복사본** |
| 레이아웃 세그먼트 | 약 77KB (거의 전부 사이드바 목차) |
| 페이지 세그먼트 | 약 52KB |
| 합계 | 약 635KB |

(이전에 추정한 "한 페이지 1.4MB"는 더 긴 페이지 기준이다. 같은 방식으로 그 페이지를 다시 재지는 않았다.)

- 개발 서버로 week2 day1 의 RSC 데이터를 분해하면 약 198KB 중 **사이드바 목차(`certTrees`)가 약 70KB(35%)** 다. 코드블록 색칠(6KB)·퀴즈(8KB) 는 작아 병목이 아니다.
- 목차가 HTML·`.rsc`·`_full`·레이아웃 세그먼트 4곳에 실려 **페이지당 약 280KB(약 44%)** 가 모든 페이지에서 똑같다.
- 세그먼트 파일은 정적 페이지면 항상 만들어지고 끄는 설정은 찾지 못했다(`app-render.js` 확인). `prefetchInlining` 은 힌트 계산용이고 효과는 시험하지 않았다.
- 이전 작업자가 이미 목차를 269KB → 약 70KB 로 줄였다(`navTree.ts` 주석). 남은 것은 day 제목 문자열이다.

### 적용한 변경 (브랜치 `perf/page-weight`)
- 사이드바로 보내는 day 제목에서 `Day N - ` 접두사를 서버(`buildCertTree`)에서 뗀다. 화면은 같다(SidebarNav 가 예전에도 렌더 때 뗐다).
- 결과: day1 634,764 → 609,380B(−4.0%), day3 688,300 → 662,916B(−3.7%). 예상(약 7%)보다 작았다. 한글 제목이 대부분이라 접두사 8바이트의 비중이 작다.

### 하지 않은 것 — 사용자 결정 필요
- **목차 지연 로딩**(정적 JSON 을 사이드바를 열 때 받음): 저장 크기 약 −44% 로 가장 크다. 대신 서버 HTML 에서 사이드바의 day 링크가 사라진다. 구글봇은 JS 를 실행하니 찾을 가능성이 높지만 검증하지 않았고, 허브가 모든 day 를 링크하는 점이 안전장치다. 색인이 막혀 있는 사이트라 검증 없이 바꾸지 않았다.
  - 레이아웃은 현재 경로를 몰라(클라이언트 이동 때 props 가 갱신되지 않음) "현재 자격증만 싣기"는 안 된다.
- 영어 day 페이지 792개를 사이트맵에서 빼기(크롤링 대상 절반): 영어 트래픽 수치를 본 뒤 결정(기존 보류 항목 A).
- 봇 차단(`meta-externalagent`, `meta-webindexer` 를 `robots.ts` 와 `proxy.ts` 에서). Googlebot·Bingbot·Naver 는 두지 않는다. 미착수.
- auto-ops `/api/index` 호출 빈도 점검(11-23 하루 52분 급증의 원인). 미착수.

## 5. 이번에 얻은 교훈

- `vercel env pull` 결과는 값이 채워졌는지가 아니라 **자리표시자가 아닌지**까지 봐야 한다.
- 워크트리의 `node_modules` 를 junction 으로 걸면 Turbopack 이 `Symlink [project]/node_modules is invalid, it points out of the filesystem root` 로 빌드를 중단한다. 워크트리에서 빌드하려면 실제 설치가 필요하다(이번에는 `CertNote-open` 에 임시 적용 후 원복해서 측정).
- 로컬 `.env`(개발 DB)와 운영 값은 다르다. 운영 값 보관 위치를 정해 둘 것.

## 6. 다음 순서(제안)

1. 환경변수 재발급 → Railway Hobby 에 올리기 → 임시 주소로 확인 → DNS 전환 → cron 서비스 추가.
2. 이전과 별개로 봇 차단 PR, auto-ops 호출 점검.
3. 사이트가 안정되면 목차 지연 로딩을 SEO 영향 검증과 함께 진행.
4. 영어 day 사이트맵 정리는 영어 트래픽을 본 뒤.
