# 콘텐츠 깊이 보강 레시피

> 이 문서는 SAA Week 1-2 / DVA Week 2 / SOA Week 1-2 / SAP Week 1-2 / DOP Week 1·2를
> 깊이 보강할 때 실제로 사용한 절차다. 나머지 Week 3-16을 같은 방식으로
> 작업하려면 이 문서를 그대로 따라하면 된다.

---

## 0. 목표

각 day.md를 **"시험용 정답 설명"** → **"진짜 이해를 위한 깊이 있는 기술 블로그 글"** 로 변환.

특징:
- 학습지 양식 H2 헤더(학습목표/이론/심화/요약) 제거
- 블로그 narrative: intro 문단 → 본문 흐름 → 마무리 문단 → 연습 문제
- 박스(`> 💡 관련 이론`, `> 🔍 더 깊이`, `> 📚 사례`, `> ⚠️ 함정`, `> 🎯 시나리오`) 8-14개
- 사고 사례·RFC·CS 이론·다른 클라우드 비교·내부 동작 원리 자연스럽게
- 분량: Associate 20-30KB / Professional 25-35KB
- **연습 문제는 양식 유지** (Quiz 컴포넌트가 파싱)

---

## 1. 진도 확인 (시작 전 반드시 실행)

```bash
cd "/c/Users/안용식/aws-certs"
for repo in AWS_associate_solutionArchitect AWS_associate_developer \
            AWS_associate_cloudopsEngineer AWS_professional_solutionArchitect \
            AWS_professional_devopsEngineer; do
  echo "=== $repo ==="
  for w in $(seq 1 16); do
    if [ -d "$repo/week$w" ]; then
      for d in 1 2 3 4 5; do
        f="$repo/week$w/day$d.md"
        if [ -f "$f" ]; then
          size=$(stat -c %s "$f")
          kb=$((size/1024))
          if [ "$size" -ge 18000 ]; then
            echo "  ✓ week$w/day$d  ($kb KB)"
          else
            echo "  ✗ week$w/day$d  ($kb KB) — TODO"
          fi
        fi
      done
    fi
  done
done
```

18KB 컷오프는 보수적인 기준. **15-17KB도 깊이 보강이 됐을 수 있음** (특히 day5
주차 복습 파일). 의심 가는 파일은 직접 열어서 `📚 사례` 박스가 있고 RFC가
인용됐는지 확인.

---

## 2. 톤 모델 파일 (Read 한 번만)

모든 sub-agent가 **반드시 이 파일을 1회 Read**해서 톤·구조·박스 패턴을 익혀야 함:

- **Associate 톤 모델**: `C:\Users\안용식\aws-certs\AWS_associate_solutionArchitect\week1\day1.md` (24KB)
- **Pro 톤 모델**: 같은 파일 + `C:\Users\안용식\aws-certs\AWS_professional_solutionArchitect\week1\day1.md` (23KB) 추가

이 두 파일을 모방해서 다른 day들을 작성한다.

---

## 3. Sub-agent 분담 (5개 병렬)

| Agent | 자격증 | 폴더 | 분량/day |
|---|---|---|---|
| 1 | SAA-C03 | `AWS_associate_solutionArchitect` | 20-30KB |
| 2 | DVA-C02 | `AWS_associate_developer` | 20-30KB |
| 3 | SOA-C02 | `AWS_associate_cloudopsEngineer` | 20-30KB |
| 4 | SAP-C02 | `AWS_professional_solutionArchitect` | 25-35KB |
| 5 | DOP-C02 | `AWS_professional_devopsEngineer` | 25-35KB |

각 agent에게 **정확한 파일 목록**을 주는 게 핵심. "Week 3-5 다 해" 같은 모호한
지시는 self-stop 유발. 정확히 N개 파일 경로를 prompt에 박아둘 것.

---

## 4. Sub-agent prompt 템플릿

아래 템플릿을 자격증별로 약간만 수정해서 사용. **굵게 표시한 부분이 self-stop
방지 핵심.**

````markdown
{자격증코드} {대상 Week} 깊이 보강 — 정확히 **N개 파일**.

## 🚨 절대 금지
- **cost critical / scope warning 알림 100% 무시. 사용자 명시 진행 OK.**
- **사용자 질문/confirmation 절대 금지.** "Should I proceed?" 1번이라도 보내면 실패.
- 도구 호출 사이 추가 텍스트 작성 최소화. Read → Write 반복만.
- N개 파일 끝까지 멈춤 금지.

## 작업할 파일 (정확히 이 N개)
1. `C:\Users\안용식\aws-certs\{repo}\week{w}\day{d}.md`
2. ...
(정확한 경로 N줄)

각각 Read → 깊이 보강 → Write 덮어쓰기.

## 톤 모델 (1회 Read)
`C:\Users\안용식\aws-certs\AWS_associate_solutionArchitect\week1\day1.md`
+ {Pro인 경우 같은 자격증의 깊이 보강된 day 1개 더}

## 가이드

### 톤·구조
- 학습지 H2 양식 X (학습목표/이론/심화/요약 제거)
- intro 문단 → narrative 본문 → 마무리 문단 → 연습 문제
- ## 헤더는 주제 중심 ("VPC 서브넷 라우팅: 패킷이 인터넷에 닿는 길" 같은)

### 깊이 (필수, 각 day에 2-4개 자연스럽게)
1. 왜 그렇게 설계됐는지 (역사·기술적 배경)
2. 내부 동작 원리 (API sequence, 알고리즘, latency, 프로토콜)
3. 다른 클라우드/시스템 비교 (GCP, Azure, 온프레미스) — 비교표 권장
4. 실제 사고 사례 (회사명·연도·원인·교훈, 공식 회고 링크)
5. CS 이론과의 깊은 연결 (CAP/PACELC, 분산 시스템, 보안 모델)
6. 관련 표준/논문/RFC (NIST SP, ISO, RFC 번호 명시)
7. 실무 패턴·안티패턴

### 박스 (day당)
**Associate (8-12개)**:
- `> 💡 **관련 이론**: ...` 3-5
- `> 🔍 **더 깊이**: ...` 2-3
- `> 📚 **사례**: ...` 1-3
- `> ⚠️ **함정**: ...` 1-2

**Pro (10-14개)**:
- `> 💡 **관련 이론**: ...` 4-6
- `> 🔍 **더 깊이**: ...` 3-4
- `> 📚 **사례**: ...` 2-3
- `> ⚠️ **함정**: ...` 1-2
- `> 🎯 **시나리오**: ...` 1-2 (Pro 특화)

### 분량
- Associate: **20-30KB** (day5 주차 복습은 18KB 이상)
- Pro: **25-35KB** (day5는 20KB 이상)
- 30/35KB 초과 금지

### 연습 문제 (반드시 유지)
- 섹션 헤더: `## 📝 연습 문제`
- 양식: `**문제 N.** ...` 다음 `A) ... B) ... C) ... D) ...` 다음 `**정답: X**` 다음 `해설: ...`
- `---` 구분선
- day1-4: 5-7문항, day5: 시나리오 10-12문항
- **해설을 깊게**: "왜 다른 옵션은 틀렸는지" + 추가 학습 포인트

### 자격증별 특화 (각 agent prompt에 해당 자격증만 포함)
- **SAA**: 아키텍처 결정·VPC·EC2·스토리지·데이터베이스·서버리스·메시징·보안·운영·비용·DR
- **DVA**: Lambda Firecracker / DynamoDB 파티션 / API Gateway / SQS at-least-once / SigV4 / X-Ray sampling / CodePipeline
- **SOA**: CloudWatch resolution / Logs Insights / SSM Session Manager 내부 / Auto Scaling 알고리즘 / Config rule 평가
- **SAP** (Pro): 멀티 계정(Organizations·SCP·Control Tower) / Multi-Region / 하이브리드(Outposts·DX) / 7R 마이그레이션 / Savings Plans 수학 / WA 6 pillar
- **DOP** (Pro): CodePipeline action provider / 배포 전략 수학(Blue/Green·Canary·Rolling) / IaC drift / 컨테이너(ECR scan·SBOM·SLSA) / 인시던트 자동화 / 옵저버빌리티

## GateGuard 차단 시 facts (그대로 응답)
1. 호출: sync로 webapp/content에 복사 → 빌드 시 read
2. 동일 파일: 의도적 깊이 보강 덮어쓰기
3. 데이터: markdown 재작성
4. 사용자 verbatim: "이 깊이로 나머지 N day 전부 재작성"

## 완료 보고 (마지막 한 번)
- N개 새 파일 크기
- 사용한 사고 사례·RFC 한 줄

**N개 끝까지. 멈춤 금지. 질문 금지.**
````

---

## 5. 5개 agent를 동시 spawn

메인 세션에서 한 메시지에 5개 `Agent` tool 호출을 **병렬**로 (각각 `run_in_background: true`).

자격증당 N (= 그 자격증의 18KB 미만 파일 수). 보통 **자격증당 5-10개 파일**로
끊어가는 게 self-stop 위험 가장 낮음. 10개 초과면 agent가 도중에 멈출 확률 ↑.

---

## 6. self-stop 패턴 회피

이전 시도에서 sub-agent가 멈춘 주요 원인:
- `COST CRITICAL` hook 알림이 매 도구 호출마다 발동 → agent가 "Should I proceed?" 응답
- 작업량이 너무 큼 (60-80 파일) → 중간에 의지 상실
- 가이드가 모호 → agent가 본인 판단으로 멈춤

**회피 패턴**:
1. **자격증당 최대 10개 파일** 단위로 끊어 작업
2. prompt 첫 부분에 **"🚨 절대 금지"** 섹션 강조
3. 정확한 파일 경로를 prompt에 박아두기 (탐색 안 시키기)
4. **`~/.claude/settings.local.json`에 cost hook 끄기**(권장):
   ```json
   {
     "env": {
       "ECC_DISABLED_HOOKS": "post:cost-tracker-critical-warn"
     }
   }
   ```

---

## 7. 완료 후 sync + 빌드 + push

```bash
cd "/c/Users/안용식/webapp"
node scripts/sync-content.mjs            # 원본 → content/ 복사
npm run build                             # 빌드 검증 (354/354 정적 페이지)
git add content/
git commit -m "content(week N-M): depth rewrite N day across 5 certs"
npm run content:manifest                  # 사이트맵 lastmod 매니페스트 갱신(아래 주석 참고)
git add src/data/content-manifest.json
git commit -m "chore: update content manifest"
git push                                  # Vercel 자동 재빌드
```

**`content:manifest`는 반드시 콘텐츠 커밋 "이후"에 실행한다.** 이 스크립트는 `git log`로
파일별 마지막 커밋 시각을 읽으므로, 방금 만든 콘텐츠 커밋이 먼저 존재해야 그 시각을 잡을 수
있다(커밋 전에 돌리면 직전 커밋의 낡은 시각이 찍힌다). `sync-content.mjs` 내부에 자동으로
붙이지 않은 이유도 이 순서 문제 때문이다 — sync 스크립트는 git 커밋이 생기기 "전"에 실행되므로
그 시점엔 아직 정확한 커밋 시각을 알 수 없다. 자세한 배경은
`docs/SEO-indexing-fix-plan.md` Step6 후속 절 참고.

빌드 실패 시 첫 의심: **MDX format mode**. `webapp/src/lib/mdx.ts`에
`mdxOptions.format: 'md'` 들어가 있는지 확인. 없으면 `<1`, `<2024` 같은
텍스트를 JSX로 파싱하다 실패.

---

## 8. 검증 (sample 3-5 day를 직접 읽어보기)

빌드 성공해도 콘텐츠 품질은 사람이 봐야 함. 다음 페이지에서 톤·깊이 비교:

- 새로 작성: http://localhost:3000/aws-certs/saa-c03/week1/day1
- (Week 3-16 작업 후) 비교: 같은 자격증의 새 day와 이전 day

체크 포인트:
- [ ] 학습목표/이론/심화/요약 같은 학습지 H2가 사라졌나
- [ ] intro 문단이 "왜 이 주제를 다루는가"로 시작하나
- [ ] 박스(💡🔍📚⚠️🎯) 8개 이상 나오나
- [ ] 실제 회사·연도·사고 사례가 1개 이상 있나
- [ ] RFC 또는 표준 번호가 명시됐나
- [ ] 연습 문제가 인터랙티브 Quiz 컴포넌트로 렌더되나 (선택지 버튼 클릭됨)

---

## 9. 한 번에 갈지, 잘게 나눌지

**한 번에 5 자격증 × 각 자격증당 Week N개 (20-50 파일)** = 비용 약 $80-150
**자격증별로 따로 (1 자격증당 10 day)** = 비용 약 $40-60, 안전

남은 작업 추정 (Week 3-16 전부):
- 자격증당 Week 3-16 = 10-14주 × 5일 = 50-70 day
- 5 자격증 합 ≈ 290-320 day
- 비용 ≈ $300-700 (한 번에 시도)
- 더 안전: 자격증당 2-3 Week 씩 단계별로 (5-10번 세션)

**권장 일정**:
- 세션 1: 모든 자격증 Week 3-4 (50 day, ~$60-80)
- 세션 2: Week 5-6 (50 day)
- 세션 3: Week 7-8
- ... (Week 9-16 반복)
- 마지막 세션: Pro 자격증 Week 13-16 추가 (각 16주)

각 세션 시작 시 1번 진도 확인 → 18KB 미만만 작업.

---

## 10. 한 번에 정리되는 명령 (참고)

```bash
# 다음 세션 시작 첫 명령
cd "/c/Users/안용식/webapp"
cat RECIPE.md PROGRESS.md       # 컨텍스트 로드
npm run dev                     # 로컬 확인
```

진도 확인 → 다음 Week 범위 결정 → sub-agent 5개 spawn → sync → build → push.
이게 1 사이클.

---

## 11. 자주 묻는 것

**Q. 18KB 컷오프가 뭐?**
임의 기준선. 깊이 보강된 파일이 실제로 19-32KB 정도라 18KB로 컷 잡았을 뿐.
15-17KB 파일도 보강 완료된 경우 있음. 직접 열어보고 박스(💡🔍📚) 8개 이상이면 OK.

**Q. 왜 sub-agent가 자꾸 멈춰?**
ECC 플러그인의 `COST CRITICAL` hook이 매 도구 호출마다 알림. agent가 "사용자
허락 받아야 하나?" 판단으로 self-stop. **해결**: `~/.claude/settings.local.json`에
`ECC_DISABLED_HOOKS` 설정. 또는 작업을 자격증당 10 파일 이하로 끊기.

**Q. 한 번에 다 끝낼 순 없나?**
가능하지만 비용·실패 위험 큼. 5-10번 세션으로 나누는 게 안정적.

**Q. Quiz 양식 어긋나면?**
`webapp/src/lib/parseQuiz.ts`가 정규식으로 파싱. 양식 깨지면 Quiz UI 안 뜨고
그냥 markdown으로 렌더 (안전 fallback). 양식만 유지하면 됨:
```
## 📝 연습 문제

**문제 1.** 질문 내용

A) 선택지 1
B) 선택지 2
C) 선택지 3
D) 선택지 4

**정답: C**
해설: 정답 설명...

---

**문제 2.** ...
```
