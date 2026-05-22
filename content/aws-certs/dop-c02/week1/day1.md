# Day 1 - DevOps 개요, CALMS 모델, DORA 4 metrics

📅 날짜: Week 1 (Day 1)
🎯 주제: DevOps 철학과 측정 지표 — Professional 시험의 사고 프레임
⏱️ 학습 시간: 약 90분 (출퇴근 15-20분으로 핵심 훑기 가능)

---

## 🎯 학습 목표

- DevOps의 정의와 등장 배경을 설명할 수 있다
- CALMS 모델의 다섯 가지 축을 운영 사례와 연결할 수 있다
- DORA 4 metrics(배포 빈도, 변경 리드 타임, MTTR, 변경 실패율)를 측정 관점에서 이해한다
- AWS DevOps 도구 선택이 CALMS/DORA와 어떻게 매핑되는지 감을 잡는다

---

## 🧩 사전 지식 (CS 기초)

> 출퇴근 중 처음 보는 사람을 위해 — 이 Day를 이해하려면 알아두면 좋은 CS 개념.

- **CI (Continuous Integration)**: 코드 변경을 자주 통합하고 자동 테스트하여 통합 지옥을 막는다.
- **CD (Continuous Delivery / Deployment)**: Delivery는 "릴리스 가능한 상태 유지", Deployment는 "자동 프로덕션 반영"까지.
- **Idempotency (멱등성)**: 같은 작업을 여러 번 실행해도 결과가 같음. IaC와 배포 스크립트의 핵심 속성.
- **Pipeline-as-Code**: 빌드/배포 파이프라인을 코드로 관리(Jenkinsfile, GitHub Actions YAML, CodePipeline JSON).
- **Blameless Postmortem**: 인시던트 원인을 사람이 아닌 시스템 결함으로 분석하는 문화.
- **Feedback Loop**: 코드 → 배포 → 관찰 → 학습 → 코드 사이클이 짧을수록 좋다. Lean의 "작은 배치"와 같은 개념.
- **Toil**: SRE 용어로 "반복적·수동적·자동화 가능한 잡일". 자동화 우선순위의 기준.

---

## 📖 이론 내용

### 1. DevOps란 무엇인가?

DevOps는 **개발(Dev)과 운영(Ops)의 사일로를 허물고, 소프트웨어 전달 속도와 안정성을 동시에 높이는 문화·관행·도구의 결합**입니다. "둘 중 하나를 희생하지 않는다"가 핵심입니다.

- 전통: Dev가 코드를 던지면 Ops가 배포·운영 → 책임 회피, 늦은 피드백
- DevOps: 동일 팀이 빌드 → 배포 → 운영 → 모니터링 → 회수까지 책임 (You build it, you run it — Werner Vogels)

AWS는 DevOps를 도구가 아니라 **운영 모델**로 정의합니다. 이 점이 시험에서 도구만 외운 사람과 통합 시나리오를 푸는 사람을 가릅니다.

### 2. CALMS 모델 — DevOps 5축

CALMS는 DevOps 성숙도를 평가하는 프레임워크입니다.

| 글자 | 의미 | AWS 매핑 예시 |
|------|------|---------------|
| **C** Culture | 협업, 책임 공유, 비난 없는 문화 | Cross-account IAM, Slack 통합(Chatbot) |
| **A** Automation | 수동 절차 제거, 모든 것 코드화 | CodePipeline, CloudFormation, SSM Automation |
| **L** Lean | 작은 배치, 낭비 제거, 빠른 피드백 | Canary 배포, AppConfig 플래그 |
| **M** Measurement | 측정 없이는 개선 없음 | CloudWatch, X-Ray, DORA 대시보드 |
| **S** Sharing | 지식 공유, 도구·티켓 공유 | Service Catalog, 내부 PaaS, README/Runbook |

> ⚠️ Professional 시험은 직접 CALMS 글자를 묻진 않지만, "팀이 사일로화되어 있다 → 어떤 도구를 도입할 것인가" 같은 시나리오가 자주 나옵니다. Culture·Sharing 부족 → Service Catalog/공통 파이프라인.

### 3. DORA 4 metrics — 측정의 표준

Google의 DevOps Research and Assessment(DORA) 연구가 정의한 4개 지표입니다. AWS DevOps Lens가 그대로 차용합니다.

| 지표 | 의미 | Elite 기준 |
|------|------|------------|
| **Deployment Frequency** | 얼마나 자주 배포하는가 | 하루 여러 번 (on-demand) |
| **Lead Time for Changes** | 커밋 → 프로덕션까지 시간 | < 1시간 |
| **MTTR** (Mean Time to Restore) | 장애 발생 → 복구 시간 | < 1시간 |
| **Change Failure Rate** | 배포가 장애를 유발한 비율 | 0-15% |

> 💡 **암기 팁**: "속도(앞 2개)와 안정성(뒤 2개)의 균형". 시험은 보통 "MTTR을 줄이려면?" → SSM Automation Runbook, CloudWatch 알람 → Lambda 자동 복구를 답으로 유도합니다.

### 4. DevOps 안티패턴 — 시험에서 오답으로 잘 위장됨

- **Wall of Confusion**: Dev↔Ops 단절. 답으로 "수동 배포 절차 강화"가 나오면 거의 오답.
- **Snowflake Server**: 서버마다 설정이 다름. 해결책 = Image Builder / SSM / IaC.
- **Manual Rollback**: 롤백을 사람이 함. 해결책 = CodeDeploy 자동 롤백 또는 Blue/Green.
- **Big Bang Release**: 한 번에 큰 변경. 해결책 = Canary, Feature Flag(AppConfig).

---

## 🧠 알아두면 좋은 심화 이론

### CALMS vs SRE vs Platform Engineering — 무엇이 다른가

| 개념 | 강조점 | AWS 관점 |
|------|--------|----------|
| **DevOps (CALMS)** | 문화 + 자동화 통합 | CodePipeline, Well-Architected DevOps Lens |
| **SRE (Google)** | 신뢰성을 SLO/Error Budget으로 정량화 | CloudWatch SLO, AWS App Composer |
| **Platform Engineering** | 셀프서비스 개발자 플랫폼(IDP) | Service Catalog, Proton, App Runner |

> ⚠️ **함정**: 시험에서 "개발팀이 인프라를 셀프서비스로 프로비저닝하려면?" → **AWS Service Catalog** 또는 **AWS Proton** (Proton은 컨테이너/서버리스 IDP). CloudFormation 단독 답이면 거의 함정.

### Two-pizza team / Microservice — DevOps와의 궁합

- 작은 팀, 작은 서비스, 작은 배포 → DORA Elite 기준에 부합
- 단일 모놀리스 → 배포 빈도 ↓, 변경 실패율 ↑
- 시험에서 "마이그레이션 전략" 시나리오 자주 등장 (Strangler Fig 패턴, Lambda로 점진적 분리)

### Feedback Loop의 4가지 단계

```
Code → Build → Deploy → Observe
  ↑                         ↓
  └──────── Learn ──────────┘
```

- Code/Build 빠르게: CodeBuild 캐시, 병렬 빌드
- Deploy 빠르게: Blue/Green, Canary
- Observe 빠르게: CloudWatch 알람, X-Ray, RUM
- Learn 빠르게: Postmortem → Runbook 자동화

### 시험 빈출 — Operational Excellence와의 관계

AWS Well-Architected의 **운영 우수성(Operational Excellence)** 기둥이 DevOps Lens의 모태입니다. 5가지 디자인 원칙:

1. 운영을 코드로 수행 (CFN/CDK/Terraform)
2. 자주, 작게, 되돌릴 수 있는 변경
3. 운영 절차를 자주 개선
4. 장애를 예측하고 학습
5. 모든 운영 이벤트를 학습 기회로

### 관련 서비스 Cross-Reference

- **CALMS Automation** → Week 3-5 (Code* 시리즈), Week 8 (IaC)
- **DORA MTTR** → Week 12 (인시던트 대응 자동화)
- **Measurement** → Week 10-11 (모니터링/관찰성)
- **Sharing** → Week 9 (AppConfig, Parameter Store)

---

## 🏗️ 아키텍처 다이어그램

```
DevOps Feedback Loop on AWS
==================================================

  +-----------+    +-----------+    +-----------+
  |  Code     |--->|  Build    |--->|  Test     |
  | (GitHub / |    | CodeBuild |    |  CodeBuild|
  |  Commit)  |    |           |    |  + JUnit  |
  +-----------+    +-----------+    +-----------+
                                          |
        +---------------------------------+
        v
  +-----------+    +-----------+    +-----------+
  |  Deploy   |--->|  Release  |--->|  Operate  |
  | CodeDeploy|    | Pipeline  |    | EC2 / ECS |
  |  (B/G)    |    |           |    |  Lambda   |
  +-----------+    +-----------+    +-----------+
                                          |
        +---------------------------------+
        v
  +-----------+    +-----------+
  |  Monitor  |--->|  Learn    |
  | CloudWatch|    | X-Ray /   |
  |  Alarms   |    | DORA dash |
  +-----------+    +-----------+
        |               |
        +---------------+
        v
  +----------------------+
  | Auto-Remediation     |
  | EventBridge + Lambda |
  | SSM Automation       |
  +----------------------+

CALMS 매핑:
  C: Slack/Chatbot 통합, 공유 Runbook
  A: Pipeline + IaC + SSM
  L: Canary, Feature Flag, 작은 PR
  M: CloudWatch + X-Ray + DORA dashboard
  S: Service Catalog, Proton, 공유 모듈
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ DevOps는 도구가 아니라 **문화·관행·도구의 결합**. 시험 답에 "도구만 도입" 단일 정답은 의심.
2. ⭐ **DORA 4 metrics**: 배포 빈도 / 변경 리드 타임 / MTTR / 변경 실패율. MTTR 단축 시나리오 빈출.
3. ⭐ **CALMS — Automation/Measurement/Sharing**이 시험에 가장 자주 나옴.
4. ⭐ **You build it, you run it** — Dev팀이 운영까지 책임. 운영팀에 티켓을 던지는 답은 함정.
5. ⭐ **수동 절차 제거**가 거의 모든 DevOps 시나리오의 정답 방향.

---

## 💻 실제 예시 - CloudWatch에서 DORA Lead Time 측정 쿼리

```bash
# CodePipeline 실행 히스토리에서 커밋 → 배포 완료 시간 계산
aws codepipeline list-pipeline-executions \
  --pipeline-name MyAppPipeline \
  --max-results 20 \
  --query 'pipelineExecutionSummaries[*].{Id:pipelineExecutionId,Status:status,Start:startTime,End:lastUpdateTime}' \
  --output table

# CloudWatch에 사용자 정의 지표로 Lead Time push
aws cloudwatch put-metric-data \
  --namespace DORA/MyApp \
  --metric-name LeadTimeMinutes \
  --value 47 \
  --unit Count \
  --dimensions Service=checkout-api,Environment=prod
```

**출력 예시:**
```
------------------------------------------------------------------
|                       ListPipelineExecutions                    |
+----------+----------+----------------------+---------------------+
|   Id     |  Status  |        Start         |        End          |
+----------+----------+----------------------+---------------------+
| abc-123  |Succeeded |2026-05-22T08:14:01Z  |2026-05-22T08:51:34Z |
| def-456  |Failed    |2026-05-22T07:02:11Z  |2026-05-22T07:09:55Z |
+----------+----------+----------------------+---------------------+
```

이 데이터를 EventBridge → Lambda → CloudWatch 사용자 정의 지표 패턴으로 자동 수집하면 DORA 대시보드를 자동화할 수 있습니다.

---

## 📝 연습 문제

**문제 1.** 한 조직이 배포는 한 달에 한 번, 평균 MTTR은 4시간, 변경 실패율은 30%다. DORA 기준에서 가장 시급히 개선해야 하는 영역은?

A) Deployment Frequency만 늘리면 자연스럽게 해결
B) MTTR 단축을 위한 자동 복구 자동화 도입
C) 변경 실패율과 MTTR 모두 안정성 지표이므로 함께 개선 — Canary 배포 + 자동 롤백 + SSM Automation Runbook
D) DORA는 지표일 뿐이므로 무시하고 신규 기능 개발에 집중

**정답: C**
해설: 변경 실패율 30%는 매우 높고(Elite는 15% 이하), MTTR 4시간은 Low 수준(Elite는 1시간 이하). 두 지표가 모두 안정성 영역이므로 Canary 배포(실패 영향 최소화) + 자동 롤백(MTTR 단축) + SSM Runbook(복구 자동화)을 동시에 적용해야 합니다. D는 DevOps 철학 정반대.

---

**문제 2.** 다음 중 CALMS의 "Sharing"에 가장 부합하는 AWS 솔루션은?

A) 모든 팀이 각자 CloudFormation 템플릿을 작성하게 한다
B) 인증된 인프라 패턴을 AWS Service Catalog로 제공해 누구나 셀프서비스로 사용한다
C) 운영팀이 모든 배포를 수동 승인한다
D) 보안팀이 IAM 정책을 독점 관리한다

**정답: B**
해설: Service Catalog는 검증된 IaC 템플릿을 카탈로그로 공유해 셀프서비스를 가능하게 합니다. A는 표준화 부재, C·D는 사일로 강화.

---

**문제 3.** 다음 시나리오에서 가장 적절한 우선 조치는?
"매주 1회 금요일 야간 배포, 배포마다 평균 2시간 소요, 롤백은 DBA가 수동 SQL로 처리, 인시던트 평균 복구 6시간"

A) 배포 시간을 화요일 오전으로 이동
B) Blue/Green 배포 + CodeDeploy 자동 롤백 + 가능한 변경은 작은 PR로 분리
C) 배포 인력을 2명 → 4명으로 증원
D) 모든 변경을 수동 승인 단계 2개 추가

**정답: B**
해설: 큰 배치(Big Bang) + 수동 롤백 안티패턴입니다. 작은 배치 + 자동 롤백 + Blue/Green이 정공법. A는 시간 이동일 뿐, C는 인력으로 본질 해결 안 됨, D는 더 느려짐.

---

**문제 4.** "You build it, you run it" 원칙을 가장 잘 구현한 조직 구조는?

A) 개발팀이 코드 작성 후 운영팀에 인계해 운영팀이 24/7 온콜을 담당
B) 별도 SRE 부서가 모든 서비스의 운영을 일괄 담당
C) 개발팀이 자기 서비스의 온콜·관찰·인시던트 대응까지 책임지고, 플랫폼팀은 셀프서비스 도구를 제공
D) QA팀이 배포 승인권을 가짐

**정답: C**
해설: Amazon의 DevOps 원칙으로, 만든 사람이 운영까지 책임지면 품질이 올라갑니다. 플랫폼팀은 도구를 제공해 부담을 줄여줍니다.

---

**문제 5.** 한 회사가 마이크로서비스 30개를 운영 중인데, 서비스마다 빌드/배포 방식이 제각각이라 신규 개발자 온보딩이 3주씩 걸린다. CALMS 관점에서 무엇이 부족한가?

A) Culture와 Lean
B) Automation과 Sharing
C) Measurement만 부족
D) 모두 충분하나 인력이 부족할 뿐

**정답: B**
해설: 빌드/배포가 표준화되지 않음 = Automation 미흡 + 공통 도구 부재 = Sharing 미흡. 정답은 공통 파이프라인 템플릿(Service Catalog/Proton) + IaC 표준화.

---

**문제 6.** 다음 중 MTTR 단축에 직접 기여하는 AWS 서비스 조합으로 가장 적절한 것은?

A) CloudWatch Alarm → SNS → 이메일로 인간에게 알림
B) CloudWatch Alarm → EventBridge → SSM Automation Runbook으로 자동 격리 + Lambda로 페일오버
C) CloudTrail 로그를 S3에 저장 → 매주 수동 분석
D) Config 규칙 위반을 분기에 한 번 검토

**정답: B**
해설: MTTR은 "복구 시간"이므로 사람이 개입할 시간을 최소화해야 합니다. EventBridge + SSM Automation + Lambda 조합이 자동 복구의 정석. A는 알림만 자동화. C·D는 사후 분석.

---

**문제 7.** Professional 시험에서 "DevOps 도입 초기 조직"에 가장 먼저 권장되는 단계는?

A) 모든 서비스를 즉시 Multi-Region Active-Active로 전환
B) Source/Build/Deploy를 코드화하고 Pipeline-as-Code를 먼저 정착
C) GuardDuty/Security Hub부터 도입
D) Kubernetes로 전면 마이그레이션

**정답: B**
해설: DevOps는 기초 자동화부터. 파이프라인을 코드로 만들지 않으면 측정·재현·확장이 안 됩니다. A·D는 과도, C는 별개 영역.

---

## 📌 오늘의 요약

1. DevOps는 도구·문화·관행의 결합이며, "Dev가 Ops 책임까지 진다"가 핵심 철학이다
2. CALMS = Culture / Automation / Lean / Measurement / Sharing 다섯 축으로 성숙도 평가
3. DORA 4 metrics = 배포 빈도, 리드 타임, MTTR, 변경 실패율 — Elite 기준 외우기
4. 시험에서 "수동 절차 강화/팀 분리/큰 배치"는 거의 항상 오답
5. AWS 서비스 선택의 1차 기준은 "사람의 개입을 자동화로 대체했는가"
