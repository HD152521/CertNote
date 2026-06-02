# Day 5 - Week 4 복습 + 시나리오 문제 10개

📅 날짜: Week 4 (Day 5)
🎯 주제: CodeDeploy 배포 전략 통합 시나리오

---

## 🎯 학습 목표

- EC2/Lambda/ECS 배포 시나리오를 한 묶음으로 풀어본다
- 자동 롤백 트리거 설계
- AppSpec 형식 차이 외우기

---

## 📖 Week 4 핵심 요약

### 1줄 요약

1. In-place는 같은 인스턴스, Blue/Green은 새 인스턴스/Version/Task Set
2. Lambda/ECS Blue/Green은 트래픽 시프트 — Alias 또는 Target Group
3. AppSpec EC2(Hooks 7개)/Lambda·ECS(Resources+Hooks 5개) 형식 다름
4. Canary는 2단계, Linear는 점진 — 워크로드 위험도에 맞게 선택
5. 자동 롤백 = 배포 실패 + 알람 + Hook 실패 (Rolling은 Circuit Breaker)

### 헷갈리기 쉬운 비교표

| A | B | 시험 포인트 |
|---|---|-------------|
| EC2 In-place | EC2 Blue/Green | 같은 vs 새 인스턴스 |
| ECS Rolling | ECS Blue/Green | controller=ECS vs CODE_DEPLOY |
| Lambda Canary | Lambda Linear | 2단계 vs 점진 |
| ECS Circuit Breaker | Blue/Green 자동 롤백 | Rolling vs Blue/Green |
| Production Listener | Test Listener | 시프트 vs 사전 검증 |
| AppSpec EC2 | AppSpec Lambda/ECS | Hooks 7개 vs Resources+Hooks |
| Termination Wait | Bake Time | 구 인스턴스 보존 vs 알람 관찰 |

---

## 🧠 실전 시나리오 문제 10개

### 시나리오 1
"on-premises 서버 100대에 새 버전을 다운타임 없이 배포하라."

A) CodeDeploy Blue/Green
B) CodeDeploy In-place + OneAtATime 또는 HalfAtATime + 알람 + 자동 롤백
C) Rolling update with Circuit Breaker
D) Lambda Canary

**정답: B**
해설: On-Prem은 In-place만 지원. OneAtATime이 가장 안전.

---

### 시나리오 2
Lambda 함수 배포 시 "5xx > 1%면 즉시 롤백, Canary 5분으로 검증 후 100%". 가장 적절한 구성은?

A) SAM `AutoPublishAlias` + `DeploymentPreference: Canary10Percent5Minutes` + CloudWatch Alarm + Auto-rollback
B) Lambda 수동 Alias 시프트
C) Rolling update with Circuit Breaker (Lambda에선 N/A)
D) ECS Blue/Green

**정답: A**
해설: SAM이 표준 자동화 패턴.

---

### 시나리오 3
ECS Fargate Service에 새 이미지를 배포하려는데, 사전 검증을 위해 staging 트래픽으로만 새 Task Set을 노출하고 싶다. 가장 적절한 구성은?

A) ECS Rolling update
B) ECS CODE_DEPLOY controller + Test Listener + AfterAllowTestTraffic Hook
C) Lambda Blue/Green
D) ASG Blue/Green

**정답: B**
해설: Test Listener가 사전 검증의 정공법.

---

### 시나리오 4
EC2 ASG에 In-place로 배포 중 ASG가 scale-out했다. 새 EC2의 동작은?

A) 다음 배포까지 구 버전
B) 진행 중인 revision이 자동 적용
C) 즉시 종료
D) 배포 실패

**정답: B**
해설: CodeDeploy가 ASG와 통합 시 자동 동기화.

---

### 시나리오 5
Lambda 배포 후 Pre Traffic Hook이 정상 실행 안 됨. 가능한 원인은?

A) Hook Lambda의 IAM Role에 `codedeploy:PutLifecycleEventHookExecutionStatus` 누락
B) Layer 크기 초과
C) X-Ray 비활성
D) Provisioned Concurrency 미설정

**정답: A**
해설: Hook의 결과 보고 권한 필수. 가장 흔한 함정.

---

### 시나리오 6
ECS Service에 Rolling update를 쓰는데, 신규 Task가 연속 실패하면 자동 롤백되길 원한다.

A) CodeDeploy 추가 도입
B) ECS Deployment Circuit Breaker (`enable=true, rollback=true`)
C) Lambda로 모니터링
D) Auto Scaling 자동 축소

**정답: B**
해설: Circuit Breaker가 ECS 자체의 자동 롤백.

---

### 시나리오 7
"EC2 Blue/Green 배포 후 즉시 롤백하고 싶다." Termination Wait Time이 1시간 남아 있다. 가장 빠른 방법은?

A) CodeDeploy Stop Deployment with Rollback → ALB 트래픽이 즉시 Blue ASG로 복귀
B) 새 ASG 생성
C) DNS 변경
D) Lambda 호출

**정답: A**
해설: Wait time 동안 Blue가 살아 있어 즉시 복귀.

---

### 시나리오 8
"AppSpec의 어떤 Hook이 첫 배포에는 실행되지 않는가?"

A) BeforeInstall
B) ApplicationStop (이전 버전이 없으므로 건너뜀)
C) ValidateService
D) AfterInstall

**정답: B**
해설: 첫 배포는 ApplicationStop 미실행. 시험 빈출.

---

### 시나리오 9
Lambda Provisioned Concurrency 함수에 Canary 배포 시 비용 영향은?

A) 비용 절감
B) 배포 동안 두 Version 모두 PC 비용 (가중치 분배지만 양쪽 워밍업 필요)
C) PC 자동 해제
D) Lambda 동시성 quota 영향 없음

**정답: B**
해설: PC는 Version 단위, 두 Version 동시 활성 시 비용 일시 증가.

---

### 시나리오 10
"CodePipeline에서 ECS Blue/Green 배포 + 자동 이미지 URI 치환" 구성은?

A) CodePipeline의 ECS(Blue/Green) Action + taskdef.json의 `<IMAGE1_NAME>` 플레이스홀더 + imagedefinitions.json
B) Lambda Action만
C) CloudFormation Action만
D) 수동 트리거

**정답: A**
해설: ECS Blue/Green Action이 표준. `<IMAGE1_NAME>`이 핵심.

---

## 📌 Week 4 요약

1. EC2/Lambda/ECS 배포 패턴이 각각 다름 — Hook, Version/Alias, Task Set
2. Canary(2단계) vs Linear(점진)
3. 자동 롤백: Blue/Green은 CodeDeploy, Rolling은 ECS Circuit Breaker
4. Termination Wait Time이 EC2/ECS Blue/Green의 안전망
5. SAM `AutoPublishAlias` + `DeploymentPreference`로 Lambda Canary 자동화

---

## 🔜 다음 주 예고 (Week 5)

**CodePipeline 심화 — 멀티 계정·Action Providers·V2**

- Day 1: Pipeline 구조 (Stage/Action/Artifact)
- Day 2: 멀티 계정 파이프라인 + Cross-Account IAM
- Day 3: Action Providers - Lambda, Step Functions, Manual Approval
- Day 4: V2 Pipeline + 변수 + 트리거 필터
- Day 5: 시나리오 문제 10개

---

> 💪 Week 4 완료! 배포 전략 시나리오의 사고 틀이 잡혔습니다.
