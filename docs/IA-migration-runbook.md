# 4-섹션 IA 마이그레이션 런북 (운영 절차)

> 청사진: [IA-4section-execution.md](./IA-4section-execution.md) · 검증: `scripts/verify-migration.mjs`
> 규칙: **CI에 migrate 훅 없음 — DB migrate는 100% 수동.** Vercel git-push = 원자 배포.

---

## Phase 0 — 하위호환 준비 (라우팅/DB 변경 없음)

**진입 게이트(배포 전):**
```
npx tsc --noEmit           # 0
npm run build              # 성공
```
**배포 후 검증:**
```
node scripts/verify-migration.mjs --base=https://cert.juganlab.com --phase=0
# 기대: 5 pass / 0 fail (기존 URL 전수 200)
```
**롤백:** 순수 추가·하위호환이라 불필요. 문제 시 커밋 revert.

---

## Phase 1 — 섹션축 + 301 + 언어스킴 (★단일 원자 커밋)

> **분리 배포 금지.** 라우트 활성화·301·sitemap·canonical·robots가 **한 커밋**으로 동시에 나가야
> `/aws` 404창 또는 `/aws-certs`·`/aws` 동시 200(중복색인)창이 안 생긴다.

**진입 게이트:** Phase 0가 프로덕션에 선배포되어 안정. **DB 변경 없음.**

**배포 전(로컬):**
```
npx tsc --noEmit && npm run build
node scripts/verify-migration.mjs --base=http://localhost:3002 --phase=1
```
**배포 직후(프로덕션, 즉시):**
```
node scripts/verify-migration.mjs --base=https://cert.juganlab.com --phase=1
# 반드시 확인: linux 규칙이 /aws가 아니라 /linux로 (순서 검증)
curl -sI https://cert.juganlab.com/aws-certs/linux-master-1/week1/day1   # 308 → /linux/...
```
**사용자 수동 작업(배포 직후):**
1. **Search Console** — 새 `sitemap.xml` 제출 + 구 sitemap 제거. **Change of Address 도구 사용 금지**(경로변경 아님).
2. 대표 신 URL 10~20개 `URL Inspection → Request indexing`.
3. **사전(배포 전) 베이스라인 캡처** — GSC Performance export + 색인 페이지수 = 유실 판정 기준.

**롤백:** Phase1 커밋 revert 1건이면 구 라우트·구 sitemap 복귀. 301 캐시가 남아도 구 URL이 다시 200이면 자연 회복(장기 미유지 시 색인 혼선 → 되도록 revert보다 fix-forward).

**상시:** 구 `/aws-certs/*`는 'Page with redirect'(정상), 신 URL이 'Crawled not indexed'/soft-404 아닌지 감시. **301은 최소 1년 유지.**

---

## Phase 2 — 정보·후기·로드맵 (DB migrate 선행)

> **후기 코드 배포 전 반드시 migrate.** 안 하면 배포 즉시 프로덕션 500.

**사용자 수동 작업(후기 코드 배포 *전*):**
```
# 프로덕션 DATABASE_URL 환경에서:
npm run db:migrate
# 로그에 reviews 준비 완료 확인 → 재실행해 멱등 검증(에러 0)
```
통합 SQL은 [IA-4section-execution.md §3](./IA-4section-execution.md) 참조(`scripts/db-migrate.mjs` 말미 append).

**방어:** 후기 API·페이지는 **테이블 부재 graceful degrade**(빈 목록/작성 비활성) 필수 — migrate 지연 시에도 500 대신 정상 폴백.

**분리 배포:** 정보(exam FAQ)·로드맵은 **DB 무의존** → 후기와 별도 배포 가능(부분 롤백 용이).

**사용자 수동 작업(후기 배포 후):** 각 `content/exam-info/*.json`의 응시료·합격점수·도메인 비중(합=100)·유효기간을 공식 가이드(`source`)와 대조 후 커밋.

---

## Phase 3 — 신규 콘텐츠 (배포 리스크 아님)

- `content/kubernetes/**`, `content/terraform/**` 투입 → `generateStaticParams` 자동 노출.
- 빈 섹션은 '준비중' placeholder(sitemap/네비 제외)로 숨김.
- en 재편(D4)은 `contentDirOfSection` 1곳 스위치.

---

## 최상위 리스크 요약 (상세 §5)
1. **R1** 301↔새라우트 분리배포 → 원자 커밋 + phase1 검증 즉시.
2. **R2** migrate 누락 → 후기 graceful degrade + 런북 하드게이트.
3. **R3** 리다이렉트 순서 → linux 특수규칙을 aws 일반보다 앞.
4. **R4** 캐시키 충돌 → 캐시키에 lang 필수.
5. **R5** 빈 구조화데이터 → count/faq≥1일 때만, 화면 텍스트와 1:1.
