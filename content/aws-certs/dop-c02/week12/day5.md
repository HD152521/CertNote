# Day 5 - Week 12 통합 복습: 인시던트 자동화의 전체 신경계를 하나로 잇기

한 주 동안 우리는 자동화 도메인을 부위별로 해부했다. EventBridge라는 신경계, SSM Automation이라는 절차의 코드화, Auto-healing이라는 반사 신경, ChatOps와 Incident Manager라는 사람 조직과의 접점. 오늘은 이 부위들을 다시 하나의 살아 있는 유기체로 조립한다. 실전에서 인시던트는 이 컴포넌트들을 따로 쓰지 않는다 — 하나의 탐지가 자동 복구를 부르고, 복구가 실패하면 사람을 호출하고, 사람이 ChatOps로 협응하고, 끝나면 포스트모템으로 학습이 순환된다. 이 전체 흐름을 머릿속에 단일 그림으로 그릴 수 있어야 DOP 시험의 복합 시나리오를 풀 수 있다.

## Week 12 핵심을 하나의 흐름으로

```
                    [탐지 Sense]
   CloudWatch Alarm · GuardDuty · EC2 StatusCheck · Synthetics
                          │
                          ▼
              [라우팅 — EventBridge Day 1]
       Event Pattern 매칭 (결정 트리, 부분 일치, 배열=OR)
                          │
        ┌─────────────────┼──────────────────┬───────────────┐
        ▼                 ▼                  ▼               ▼
   [단순 자동복구]    [표준 절차]        [복잡 복구]      [Critical]
   Lambda Day 3     SSM Automation     Step Functions   Incident Mgr
   (격리·재시작)     Runbook Day 2      (Saga, Day 3)    Day 4 (ICS)
   Cooldown·Bounded  aws:approve 게이트                  Escalation
   ·Idempotent                                          Timeline·PIR
        │                 │                  │               │
        └─────────────────┴──────────────────┴───────────────┘
                          ▼
              [알림 Notify — Day 4]
   CodeStar Notifications → Chatbot(Slack) · PagerDuty(API Destination)
                          │
                          ▼
              [학습 Learn]  비난 없는 포스트모템 · Game Day(FIS)
                          │
                          ▼ (피드백 루프: 새 패턴을 자동 대응에 추가)
```

이 그림의 다섯 단계 — **탐지 → 라우팅 → 대응 → 알림 → 학습** — 가 Week 12 전체의 골격이다. 각 단계의 핵심을 다시 짚는다.

1. **EventBridge(Day 1)** — 자동화의 신경계. EAI/EIP의 메시지 버스·Content-Based Router를 구현해 발신자가 수신자를 모르게 결합도를 끊는다. Event Pattern 매칭은 순차 비교가 아니라 결정 트리(quamina/Rete 계열)로 컴파일되어 규칙 수에 무관하게 빠르고, 부분 일치·배열=OR 의미론을 가진다. Pipes(파이프-필터, 폴링 글루 제거), Scheduler(수백만 스케줄·Flexible Time Window 지터로 thundering herd 방지), Archive/Replay(이벤트 소싱 재처리), at-least-once 전달이라 컨슈머는 멱등해야 한다.

2. **SSM Automation(Day 2)** — 운영 절차를 코드로. Runbook(`aws:executeAwsApi`·`aws:invokeLambdaFunction`·`aws:approve`)으로 절차를 선언하고, `aws:approve`로 사람 게이트를 워크플로에 끼운다.

3. **Auto-healing(Day 3)** — 제어 이론의 폐쇄 루프(MAPE-K). MTTR↓가 MTBF↑보다 비용 효율적. 재시작·교체·격리·스케일·페일오버·회로차단 패턴. 플랫폼 내장(ASG ELB health check, `StatusCheckFailed_System`→`ec2:recover`) 우선. 안전망 3대 기둥(Idempotent·Cooldown·Bounded Action)이 blast radius 폭주를 막고(2017 S3 사고의 교훈), Circuit Breaker가 연쇄 장애를 끊으며, FIS Game Day로 검증한다.

4. **ChatOps & Incident Manager(Day 4)** — 사람 조직과의 접점. Chatbot(SNS-Slack 다리, IAM Role∩Guardrail), CodeStar Notifications(파이프라인 알림 표준), Incident Manager(ICS 사건 지휘 체계의 코드화: Response Plan·Escalation·Timeline·PIR), API Destination(외부 SaaS 통합).

5. **학습** — 비난 없는 포스트모템(스위스 치즈 모델·Just Culture)으로 데이터를 학습으로 전환해 피드백 루프를 닫는다.

> 💡 **관련 이론**: Week 12 전체는 사실 하나의 거대한 **MAPE-K 루프**(IBM Autonomic Computing)다 — Monitor(CloudWatch/GuardDuty) → Analyze(EventBridge 패턴 매칭) → Plan(어느 대응 경로로 보낼지) → Execute(Lambda/SSM/Step Functions/Incident Manager), 그리고 이 넷이 공유하는 Knowledge(런북·포스트모템·스키마 레지스트리). 개별 서비스를 외우는 대신 이 루프의 어느 단계에 무엇이 들어가는지로 이해하면, 처음 보는 시나리오도 "이건 Analyze 단계의 라우팅 문제군 → EventBridge"처럼 분해된다. 그리고 학습 단계가 Knowledge를 갱신해 다음 루프를 개선하는 것이 자율 시스템의 정수다.

## 컴포넌트 선택의 결정 트리

시험에서 가장 자주 묻는 것은 "이 상황에 어떤 서비스인가"다. 헷갈리는 경계를 정리한다.

| 상황 | 정답 | 왜 다른 것은 아닌가 |
|------|------|---------------------|
| 내용 기반 정밀 라우팅, 다수 AWS 서비스 분기 | EventBridge Rule | SNS는 거친 팬아웃, SQS는 점대점 큐 |
| SQS/Kinesis 폴링 → 필터 → 보강 → 타겟 | EventBridge Pipes | Rule은 푸시 전용, 폴링 소스 미지원 |
| 수백만 사용자별 cron 스케줄 | EventBridge Scheduler | CloudWatch cron은 규칙 수 한계 |
| 단순 격리/재시작 자동 복구 | Lambda (안전망 3종 필수) | 복잡 분기엔 부적합 |
| 분기·대기·재시도·보상 복구 | Step Functions (Saga) | Lambda는 15분·상태유실 |
| 표준 운영 절차 + 사람 승인 게이트 | SSM Automation Runbook | aws:approve가 핵심 |
| EC2 하부 하드웨어 장애 복구 | `StatusCheckFailed_System`→`ec2:recover` | Lambda 직접 구현은 검증 안 됨 |
| ASG 인스턴스 자동 교체 | health-check-type ELB + Grace Period | EC2 status만으론 좀비 못 잡음 |
| Pipeline 실패 Slack 알림 (표준) | CodeStar Notifications + Chatbot | Lambda Webhook은 과도한 글루 |
| Critical 인시던트 on-call 에스컬레이션 | Incident Manager Escalation Plan | SNS 전원 알림은 책임 분산 |
| EventBridge → 외부 SaaS 인증 포함 전송 | API Destination + Connection | Lambda 직접 호출은 배관 부담 |

> 🔍 **더 깊이**: 이 표의 밑바닥에는 일관된 원리가 흐른다 — **"가능한 한 높은 추상화, 가능한 한 관리형(managed)"**. 같은 일을 Lambda로도 할 수 있지만, AWS가 관리형으로 제공하는 것(Pipes·Scheduler·`ec2:recover`·CodeStar Notifications·API Destination)이 있으면 그것을 쓴다. 이유는 셋이다. (1) **검증된 안전망** — 관리형 서비스는 AWS가 재시도·멱등성·레이트 리밋을 이미 검증했다. (2) **글루 코드 제거** — 직접 짜면 폴링·배치·에러·인증 갱신 같은 배관을 손으로 관리해야 한다. (3) **운영 부담 이전** — 패치·확장·가용성을 AWS가 진다. DOP 시험의 정답은 거의 항상 "운영 부담이 가장 적은 관리형 옵션"으로 수렴하며, "Lambda로 다 짠다"는 보통 오답 함정이다(되긴 하지만 운영 우수성 기둥에 반함).

## 통합 시나리오의 안티패턴

마지막으로, 이 컴포넌트들을 잘못 조립하는 흔한 안티패턴을 짚는다. 시험은 종종 "무엇이 잘못됐나"를 묻는다.

> ⚠️ **함정**: 통합 자동화의 3대 안티패턴. **(1) 멱등성 누락** — EventBridge·CloudWatch가 at-least-once라 중복 전달되는데 컨슈머가 멱등하지 않으면 이중 격리·이중 청구가 터진다. "이벤트가 가끔 두 번 처리됨"의 답은 거의 항상 컨슈머 멱등성 부재다. **(2) 무한 자동 복구** — 개방 루프(결과 미확인)로 "재시작→실패→재시작"을 반복하거나, Cooldown·Bounded Action 없이 폭주한다(2017 S3). **(3) 비가역 동작 자동화** — 격리(가역)는 자동이 맞지만 종료·삭제(비가역)를 사람 게이트 없이 자동화하면 오탐 시 데이터·증거를 영구 소실한다. 이 셋을 막는 것이 멱등성·안전망 3기둥·`aws:approve` 게이트다.

## 정리하며

Week 12는 "자동화"라는 한 단어 아래 다섯 층 — 탐지·라우팅·대응·알림·학습 — 을 쌓았다. 핵심 통찰은 이것들이 따로가 아니라 하나의 닫힌 피드백 루프(MAPE-K)라는 점이고, 각 층에서 AWS는 "가장 관리형인 옵션"을 정답으로 제시하며, 모든 자동화의 안전은 멱등성·blast radius 제한·비가역 동작 게이트라는 세 원칙 위에 선다는 것이다. 아래 시나리오 12개로 이 통합 그림을 점검하라.

---

## 📝 연습 문제

**문제 1.** GuardDuty가 Critical 위협(침해된 EC2가 C2 서버와 통신)을 탐지했다. 해당 인스턴스를 자동 격리하고 포렌식 스냅샷을 뜬 뒤, 종료는 운영자 승인을 받아 실행하는 흐름을 구성하려 한다. 가장 적합한 것은?

A) Lambda 하나가 탐지·격리·스냅샷·종료를 모두 즉시 자동 실행해 사람 개입 없이 MTTR을 최소화

B) EventBridge가 GuardDuty Finding(severity 기준)을 패턴 매칭 → SSM Automation Runbook(aws:executeAwsApi로 격리·스냅샷, aws:approve로 종료 게이트)

C) CloudTrail 로그를 매분 폴링하는 Lambda가 C2 통신 흔적을 찾아 격리·스냅샷·종료를 실행

D) GuardDuty 알림을 SNS 이메일로만 전송하고 격리·스냅샷·종료를 전부 운영자가 수동 처리

**정답: B**

해설: EventBridge가 GuardDuty Finding을 Event Pattern으로 매칭(예: severity ≥ 7)해 SSM Automation Runbook을 트리거한다. 격리(SG 교체)·스냅샷은 가역적이라 자동(`aws:executeAwsApi`), 종료는 비가역(데이터·증거 소실)이라 사람 승인 게이트(`aws:approve`)를 둔다 — 가역성에 따라 자동/수동을 가르는 Day 3의 핵심 원칙이다. 전부 자동(A)은 오탐 시 비가역 피해를 키우고, CloudTrail 폴링(C)은 GuardDuty 실시간 탐지를 버리며 페이로드 재생용도 아니다. 전부 수동(D)은 MTTR을 키운다.

---

**문제 2.** SQS 큐의 메시지를 폴링해 이벤트 패턴으로 1차 필터링하고, 부족한 정보를 외부 API로 보강한 뒤 DynamoDB에 저장하는 흐름을 글루 코드 없이 구성하려 한다. 가장 적합한 것은?

A) Lambda를 직접 작성해 SQS 롱폴링·이벤트 필터·외부 API 보강·DynamoDB 저장을 한 함수에서 처리

B) EventBridge Pipes (Source: SQS → Filter → Enrichment → Target: DynamoDB)

C) EventBridge Rule로 SQS를 직접 이벤트 소스로 지정하고 Input Transformer로 보강 후 DynamoDB 타겟

D) SNS 팬아웃으로 메시지를 여러 구독자에 분배한 뒤 각자 필터·보강해 DynamoDB에 저장

**정답: B**

해설: EventBridge Pipes는 파이프-필터 아키텍처의 구현으로, 폴링이 필요한 소스(SQS/Kinesis/DynamoDB Streams/MSK)를 받아 Filter(이벤트 패턴)→Enrichment(Lambda/Step Functions/API Destination)→Target으로 관리형 연결한다. 폴링·배치·에러 처리 배관을 AWS가 흡수하므로 직접 Lambda(A) 대비 글루 코드가 사라진다. EventBridge Rule(C)은 푸시 전용이라 폴링 소스(SQS)를 직접 소스로 받지 못한다 — 이것이 Pipes가 따로 존재하는 이유다. 또 Filter가 Enrichment 앞에 있어 불필요 이벤트를 비싼 보강 전에 버리는 early filtering(predicate pushdown) 경제학을 준다.

---

**문제 3.** 자동 복구 Lambda가 같은 알람의 중복 전달로 한 인스턴스를 두 번 격리하고, 짧은 간격으로 반복 트리거되어 자원을 소진하며, 한 번에 너무 많은 인스턴스를 건드린다. 폭주를 막는 안전망 조합은?

A) Lambda 타임아웃과 메모리를 늘려 격리 동작이 중간에 끊기지 않게 완주를 보장한다

B) Idempotent(DynamoDB ConditionExpression) + Cooldown(lastActionTime, T초 내 재처리 금지) + Bounded Action(트리거당 최대 N개 상한)

C) EventBridge RetryPolicy를 0으로 설정해 재시도에 의한 중복 트리거를 원천 차단한다

D) CloudWatch Alarm 평가 주기를 늘려 중복·연속 트리거 빈도 자체를 낮춘다

**정답: B**

해설: 자동 복구의 진짜 위험은 양성 피드백 루프와 blast radius 폭주다. 안전망 3대 기둥은 멱등성(at-least-once 전달로 중복 와도 결과 1회와 동일 — DynamoDB 낙관적 동시성 제어/Lambda Powertools Idempotency), Cooldown(같은 대상 T초 내 재처리 금지 — 시간축 레이트 리밋), Bounded Action(한 트리거가 건드릴 자원 수 상한 — 공간축 제한)이다. 이 설계 부재가 2017 S3 us-east-1 사고(한 명령이 너무 많은 서버 제거)의 직접 원인이었다. 타임아웃 증가(A)·RetryPolicy 0(C)·Alarm 삭제(D)는 모두 근본 원인을 건드리지 못한다.

---

**문제 4.** 매일 새벽 3시 정각에 5만 개의 사용자별 백업 작업이 동시에 실행되며 다운스트림이 부하로 무너진다. 또한 이런 사용자별 스케줄이 수십만 개라 CloudWatch cron 규칙 수 한계에 부딪힌다. 올바른 해법은?

A) cron 시각을 02:59로 당겨 다운스트림이 한가한 시간대로 옮겨 부하 충돌을 회피한다

B) EventBridge Scheduler — 수백만 스케줄 지원 + Flexible Time Window로 실행을 윈도우에 분산(지터 주입, thundering herd 방지)

C) Lambda 예약 동시성 한도를 크게 늘려 5만 개 동시 실행을 모두 수용하도록 확장한다

D) 작업을 수동으로 10개 그룹으로 나눠 각각 다른 cron 시각에 배치해 부하를 시간 분산

**정답: B**

해설: 두 문제를 동시에 푼다. 첫째, EventBridge Scheduler는 개별 일정을 1급 객체로 취급해 수백만 스케줄을 지원하므로 CloudWatch cron의 규칙 수 한계를 넘는다. 둘째, Flexible Time Window는 "정확히 그 시각"이 아니라 "이 윈도우 안 어디든"으로 실행을 시간축에 퍼뜨려 thundering herd(쇄도)를 막는다 — 이는 분산 시스템에서 지터(jitter)를 의도 주입하는 고전 기법으로, exponential backoff with jitter·캐시 만료 분산과 같은 원리다. 시각 당기기(A)·동시성 증가(C)는 동시 쇄도를 못 풀고, 수동 분할(D)은 운영 부담만 늘린다.

---

**문제 5.** Critical 인시던트에서 on-call 1차 담당자가 30분 내 응답하지 않으면 자동으로 2차 그룹을, 그래도 무응답이면 매니저를 호출하고, 전 과정을 타임라인에 자동 기록하려 한다. AWS 네이티브 솔루션은?

A) SNS 토픽에 on-call 전원을 구독시켜 동시에 알림하고 먼저 응답한 사람이 처리하게 한다

B) AWS Incident Manager — Escalation Plan(N분 무응답 시 다음 단계) + Engagement(SMS/Voice/Email) + Timeline(자동 기록) + PIR

C) Lambda가 30분마다 응답 여부를 폴링하며 무응답이면 다음 단계 그룹에 순차 SMS를 발송

D) CloudWatch Alarm을 단계별로 여러 개 만들어 시차를 두고 1차·2차·매니저에 알림

**정답: B**

해설: Incident Manager는 1970년대 산불 대응의 ICS(사건 지휘 체계)를 코드화한 것으로, Escalation Plan이 "N분 내 acknowledge 없으면 다음 단계 그룹 승계"(ICS의 응답 없는 자원 자동 승계)를 구현하고, Engagement(호출)·Timeline(ICS 활동 일지)·PIR(사후 분석 초안)과 통합된다. 전원 동시 알림(A)은 책임 분산(bystander effect — 아무도 안 받음)을 부르고, Lambda 폴링(C)·시차 Alarm(D)은 직접 구현 부담과 상태 관리 문제가 있다.

---

**문제 6.** Slack에서 운영자가 Chatbot으로 진단 명령은 자유롭게 실행하되, 실수로라도 prod EC2 종료·RDS 삭제는 절대 못 하게 하려 한다. IAM Role은 운영 편의상 넓게 유지하고 싶다. 올바른 구성은?

A) Chatbot이 맡는 IAM Role을 read-only 권한으로만 제한해 어떤 변경·삭제도 못 하게 막는다

B) Chatbot 채널 Guardrail Policy에 명시적 Deny(ec2:TerminateInstances, rds:Delete*) — IAM Role과 무관하게 봉쇄

C) Slack 채널을 비공개·초대제로 전환해 권한 있는 운영자만 위험 명령을 칠 수 있게 한다

D) Chatbot의 명령 실행(run command) 기능을 끄고 조회·알림 수신 용도로만 사용한다

**정답: B**

해설: Chatbot 명령 권한은 IAM Role과 Guardrail Policy의 교집합이다. Guardrail은 IAM의 explicit-deny-always-wins 평가 모델로 작동해, Role이 아무리 넓어도 가드레일이 막은 것은 못 한다 — Organizations SCP와 같은 권한 천장(ceiling) 메커니즘이다. 그래서 "Role은 넓게, Guardrail로 위험 동작만 Deny, 쓰기는 파이프라인으로"가 정석이다. Role을 read-only로(A) 좁히면 운영에 필요한 권한까지 잃고, 명령 비활성화(D)는 ChatOps 이점을 버린다. 채널 비공개(C)는 권한과 무관하다.

---

**문제 7.** EC2 인스턴스가 하부 호스트 하드웨어 장애로 응답하지 않는다. 같은 IP·ENI·EBS를 유지하며 건강한 하드웨어로 자동 복구하려 한다. 올바른 구성은?

A) ASG에 넣고 health-check-type을 EC2로 설정

B) `StatusCheckFailed_System` 메트릭 알람 + `ec2:recover` 알람 액션

C) `StatusCheckFailed_Instance` 알람 + Lambda로 종료 후 재생성

D) Route 53 헬스체크로 페일오버

**정답: B**

해설: `StatusCheckFailed_System`은 AWS 측 인프라(호스트 하드웨어·네트워크) 장애를 가리키고, `ec2:recover` 액션은 인스턴스를 같은 ID·ENI·IP·EBS로 건강한 하드웨어에 다시 띄운다(인스턴스 스토어만 손실). 이는 플랫폼 내장 폐쇄 루프라 검증돼 있다. `StatusCheckFailed_Instance`(C)는 OS·앱·네트워크 설정 등 인스턴스 내부 문제로 recover로 해결되지 않으며, 시스템 장애와 인스턴스 장애의 구분이 핵심이다. ELB health check(A의 EC2 타입)는 좀비 인스턴스를 못 잡고, Route 53(D)은 리전/엔드포인트 페일오버지 단일 인스턴스 하드웨어 복구가 아니다.

---

**문제 8.** "RDS 페일오버 → 완료 대기 → 캐시 무효화 → 헬스 확인 → 실패 시 사람 에스컬레이션, 성공 시 Slack 보고 + 티켓"처럼 분기·대기·재시도·보상이 얽힌 복구를 구성하려 한다. 가장 적합한 것은?

A) 단일 Lambda에 if-else 분기와 sleep 대기로 페일오버·무효화·헬스확인·에스컬레이션을 모두 구현

B) Step Functions State Machine — 각 단계 Retry/Catch, 상태 보존, Saga 보상

C) 각 단계를 EventBridge Rule로 만들어 한 단계 완료 이벤트가 다음 Rule을 트리거하는 체인으로 연결

D) cron으로 매분 폴링하는 Lambda가 현재 복구 단계를 확인해 다음 동작을 결정하며 진행

**정답: B**

해설: 분기·대기·재시도·보상이 얽힌 워크플로는 Step Functions가 적합하다 — 각 단계에 Retry(백오프)와 Catch(보상 트랜잭션)를 선언적으로 붙이고, 워크플로 상태를 서비스가 보존하며, 실행 이력이 시각화돼 사후 분석이 쉽다. 이는 분산 트랜잭션을 보상 가능한 단계로 쪼갠 Saga 패턴의 구현이다. 단일 Lambda(A)는 15분 제한·상태 유실·sleep 비용 문제가 있고, EventBridge 체인(C)은 분기/대기/보상 표현이 빈약하다.

---

**문제 9.** CodePipeline 실패를 Slack 채널에 가장 단순하고 표준적으로 알리려 한다. 가장 적합한 것은?

A) 파이프라인 실패 이벤트마다 Lambda를 트리거해 Slack Incoming Webhook을 직접 호출

B) CodeStar Notifications 규칙 → AWS Chatbot(Slack 채널) 타겟

C) CodePipeline의 CloudWatch Logs를 폴링하는 cron Lambda가 실패 로그를 찾아 Slack에 게시

D) 파이프라인에 수동 승인 단계를 추가해 실패 시 승인자에게 Slack 알림이 가도록 구성

**정답: B**

해설: CodeStar Notifications는 CodePipeline/CodeBuild/CodeDeploy/CodeCommit 상태 변화 알림의 표준 경로로, "어떤 이벤트 타입을 어느 채널로"만 선언하면 내부적으로 EventBridge→SNS→Chatbot으로 흐른다. Lambda Webhook 직접 호출(A)·로그 폴링(C)은 불필요한 글루 코드이며 재시도·인증·유지보수 부담이 생긴다. 시험에서 "가장 단순/표준"은 CodeStar Notifications + Chatbot을 가리킨다. 이는 "가장 관리형인 옵션"이 정답이라는 DOP의 일관된 원리다.

---

**문제 10.** 운영팀이 자동 복구 로직을 만들었으나, 진짜 장애가 처음 발생했을 때 버그로 작동하지 않았다(2017 S3 사고의 재시작 경로처럼). 이런 "녹슨 자동화"를 평시에 발견하는 표준 접근은?

A) 자동화 코드를 더 작성해 발생 가능한 모든 장애 경우의 수를 사전에 빠짐없이 커버한다

B) AWS FIS로 정기적으로 장애를 주입하고 Game Day로 자동 복구·알림·런북을 통째로 리허설(카오스 엔지니어링)

C) 프로덕션에서 신뢰할 수 없는 자동 복구를 끄고 검증된 사람 중심 수동 대응만 운영한다

D) 자동화 실패를 사후에 추적할 수 있도록 관련 로그의 보존 기간을 길게 늘린다

**정답: B**

해설: 자동 복구의 큰 위험은 평소 트리거되지 않아 녹슬고 진짜 장애 때 처음 작동하다 버그가 드러나는 것이다. 카오스 엔지니어링은 "장애는 일어날 것이므로 통제된 환경에서 미리 일으켜 약점을 발견하자"는 철학(Netflix Chaos Monkey 시초)으로, AWS FIS가 EC2 종료·리소스 스트레스·네트워크/AZ 장애를 안전하게(중단 조건 alarm 포함) 주입한다. Game Day는 팀이 모여 전체 대응을 리허설하는 행사다. Well-Architected 신뢰성 기둥(REL12)도 정기 장애 테스트를 명시한다.

---

**문제 11.** EventBridge로 처리하는 결제 이벤트가 가끔 두 번 처리되어 이중 청구가 발생한다. 근본 원인과 해법은?

A) EventBridge가 이벤트를 중복 전달하는 것은 버그이므로 AWS 지원팀에 문의해 수정을 요청한다

B) EventBridge 전달은 at-least-once라 중복이 정상 — 컨슈머에 멱등성 로직(이벤트 ID 기반 중복 차단: DynamoDB conditional write, Lambda Powertools Idempotency)을 추가

C) EventBridge 타겟의 RetryPolicy를 0으로 설정해 재시도로 인한 중복 전달을 원천 제거한다

D) 결제 컨슈머의 DLQ를 제거해 실패 이벤트가 재유입·재처리되지 않도록 경로를 단순화한다

**정답: B**

해설: EventBridge 전달 보장은 at-least-once(최소 1회)로, 분산 시스템 특성상 같은 이벤트가 두 번 전달될 수 있다(exactly-once는 일반적으로 보장 불가). 멱등성(f(f(x))=f(x), RFC 9110의 HTTP 멱등 메서드 개념)은 중복 처리를 막는 컨슈머의 책임이다 — 이벤트 ID를 키로 한 낙관적 동시성 제어(DynamoDB ConditionExpression)나 Lambda Powertools Idempotency를 둔다. RetryPolicy 0(C)은 일시 실패 시 유실, DLQ 제거(D)는 영구 실패 이벤트 손실을 부른다. 중복은 버그(A)가 아니라 설계된 동작이며, 이것이 통합 자동화의 1번 안티패턴이다.

---

**문제 12.** EventBridge에서 외부 SaaS(PagerDuty)로 인증을 포함해 인시던트를 안전하게 전송하되, 인증 갱신·레이트 리밋·재시도·시크릿 관리를 직접 코딩하지 않으려 한다. 가장 적합한 것은?

A) Lambda가 PagerDuty REST API를 직접 호출하고 API Key를 환경 변수에 저장해 인증을 처리

B) EventBridge API Destination + Connection(인증을 Secrets Manager로 관리, 레이트 리밋, EventBridge 재시도·DLQ 활용)

C) SNS Email 구독으로 PagerDuty의 이메일 통합 주소에 인시던트 알림을 전송

D) S3에 이벤트를 쓰고 PagerDuty가 버킷을 주기적으로 폴링해 인시던트를 생성하게 한다

**정답: B**

해설: EventBridge API Destination은 외부 HTTPS 엔드포인트 호출을 관리형으로 제공한다 — Connection에 인증(API Key/OAuth/Basic)을 저장하고 Secrets Manager로 비밀을 관리하며, 레이트 리밋으로 외부 API를 보호하고, 실패 시 EventBridge 재시도·DLQ 안전망을 받는다. Lambda 직접 호출(A)은 인증 갱신·레이트 리밋·재시도·시크릿 로테이션을 손으로 관리해야 하고 API Key를 환경 변수에 두면 노출 위험이 있다. 이메일(C)·S3 폴링(D)은 신뢰성·지연 면에서 부적합하다. "글루 코드를 관리형으로 흡수"하는 EventBridge 철학의 연장이다.

---

## 🔜 Week 13 예고

**복원력 - DR, Multi-Region**

Week 12가 "한 리전 안에서 장애를 감지·복구·협응"하는 신경계였다면, Week 13은 그 신경계가 리전 전체를 잃었을 때를 다룬다 — RTO/RPO의 수학, Backup·Pilot Light·Warm Standby·Multi-Site Active/Active의 비용-복구시간 트레이드오프, Route 53 페일오버, 그리고 리전 간 데이터 복제의 일관성 문제. Week 12의 자동 복구가 "노드 단위"였다면 Week 13은 "리전 단위"의 복구다.

> 💪 Week 12 완료! 자동화의 다섯 층 — 탐지·라우팅·대응·알림·학습 — 을 하나의 MAPE-K 피드백 루프로 묶었다. 멱등성·blast radius 제한·비가역 동작 게이트, 이 세 안전 원칙을 기억하라.
