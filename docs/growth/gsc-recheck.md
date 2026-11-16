# Search Console 재점검 도구 (2026-11-20)

읽기 전용 도구 모음: `scripts/gsc/` (의존성 없음, Node 22, `npm install` 불필요).
기준선은 2026-11-15 측정 결과(735 URL 표본)이며, 같은 URL을 다시 조회해 전후를 1:1 비교한다.

> 색인 요청, 사이트맵 제출 같은 쓰기 기능은 **의도적으로 구현하지 않았다.** 인증 스코프도 `webmasters.readonly` 뿐이다.

## 준비

- 서비스 계정 키: 기본 `C:\Users\yongsik\.secrets\certnote-gsc.json`. 다른 위치면 `GSC_KEY_PATH` 환경변수로 지정. 키는 레포에 절대 넣지 않는다.
- 속성: 기본 `sc-domain:juganlab.com` (`GSC_SITE`로 변경 가능).
- 기준선 파일(레포 밖): `%LOCALAPPDATA%\Temp\gsc-analysis\inspect.json` (색인), `sa.json` (성과). 지우거나 수정하지 말 것.
- 결과 기본 저장 위치: `%TEMP%\gsc-analysis` (레포 밖, `--out`으로 변경).

## 11-20 실행 순서 (PowerShell, 레포 루트에서)

```powershell
$B = "$env:LOCALAPPDATA\Temp\gsc-analysis"

# 1) 기준선과 정확히 같은 735 URL 재조회 (쿼터 735 소모, 동시성 4로 수 분)
node scripts/gsc/inspect.mjs --same-as "$B\inspect.json"

# 2) 비교 리포트 (한국어 마크다운)
node scripts/gsc/compare.mjs "$B\inspect.json" "$env:TEMP\gsc-analysis\inspect-2026-11-20.json" > "$env:TEMP\gsc-analysis\report-2026-11-20.md"

# 3) 검색 성과 (최근 90일, 기준선과 대비)
node scripts/gsc/performance.mjs --baseline "$B\sa.json"
```

먼저 가볍게 확인하려면 `--limit 30` 을 붙인다 (시드 고정 무작위 30건). 같은 날 다시 실행하면 파일명에 시각이 붙어 덮어쓰지 않는다.

새 표본을 뽑고 싶을 때(사이트맵 기준 층화 추출, 기준선과 일부만 겹침): `node scripts/gsc/inspect.mjs --seed 7` (day 주차별 상한 120/250, 옵션 `--cap-day-w1`, `--cap-day-w2`). 전후 비교에는 `--same-as` 를 쓴다.

## 무엇을 볼 것인가 (성공 기준)

1. **noindex 제외 감소**: 기준선 표본 194건(ko day w2+ 110, en day w2+ 84)이 줄어야 한다. "여전히 noindex 인 URL" 목록이 남으면 해당 페이지 메타를 재확인한다.
2. **URL 모름 감소**: 특히 en lab/info, ko lab/info 그룹. "새로 알려진 URL" 수가 늘어야 한다.
3. **"Submitted and indexed" 가 1건 이상** (기준선 0).
4. 보조: 11-15 이후 크롤된 URL 수(구글 재방문 여부), canonical 불일치, 크롤됨-미색인 -> 색인됨 전이.
5. 성과: 기준선은 90일 노출 73, 클릭 0. 11-15 이후 열이 0보다 커지는지 본다.

해석 주의: 재크롤이 안 됐으면 상태는 그대로다. 크롤 이동 수치가 0이면 "개선 없음"이 아니라 "아직 방문 전"이다.

## 쿼터와 한계

- URL Inspection API: 속성당 하루 2,000건, 분당 600건. 스크립트는 하루 1,500건에서 멈추며(`quota-<날짜>.json` 으로 누적 집계, out 폴더), 초과 예상이면 시작 전에 메시지를 내고 종료(코드 2)한다. 429/5xx 는 지수 백오프로 최대 5회 재시도.
- searchAnalytics 는 약 3일 지연. 종료일을 오늘-3일로 잡으므로 11-20 실행 시 11-17까지만 조회된다(11-15 이후 구간은 3일 분량).
- 그룹 분류는 기준선과 동일하게 `scripts/gsc/lib.mjs` 의 `groupOf` 에 있다 (735건 전부 기준선 라벨과 일치 확인).
- 비교는 양쪽에 모두 있는 URL만 대상으로 하며, 겹침 비율을 리포트 상단에 표시한다.
- inspect 의 `referringUrls`, `sitemap` 등 원본 필드도 JSON 에 보존된다.
