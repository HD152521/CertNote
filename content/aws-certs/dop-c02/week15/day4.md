# Day 4 - 서버리스 대규모 인시던트 자동 대응: 사람 없이 복구하는 자동화의 원리와 안전장치

24시간 돌아가는 대규모 시스템에서 사고는 새벽 3시에, 가장 피곤한 사람이 페이저를 받을 때 일어난다. 하루 5억 이벤트를 처리하는 IoT·결제 파이프라인이 SLA 99.95%를 지켜야 하는데, 알려진 유형의 사고마다 사람이 깨어나 콘솔을 더듬고 절차를 떠올려 수습한다면 — 평균 페이저 핸드오프만 6분이 걸린다면 — SLA는 무너진다. 그래서 성숙한 운영 조직은 한 가지 목표를 세운다. "알려진 사고의 80%는 사람이 깨기 전에 자동으로 복구한다." 오늘은 그 목표를 어떻게 구조로 만드는지 — EventBridge가 모든 신호의 진입점이 되고, Step Functions가 Runbook을 감싸 재시도·감사를 보장하며, Incident Manager + Chatbot이 자동화가 실패하는 20%에서 사람을 끌어들이는 — 그리고 그 자동화가 어디서 위험해지는지를, 신뢰성 공학과 멱등성 이론과 함께 판다.

DOP 시험에서 이 영역은 "Lambda Throttle을 사람 없이 해소하려면", "GuardDuty가 키 유출을 탐지하면 즉시 비활성화·영향 분석·인시던트 오픈까지 자동으로", "DLQ 자동 Re-drive에서 무한 루프를 막으려면", "5분 이상 걸리는 Runbook은 Standard인가 Express인가" 같은 시나리오로 반복 등장한다. 각 선택지가 EventBridge·Step Functions·Incident Manager·멱등성 가드 중 무엇을 건드리는지 읽어내면 답이 보인다.

## MTTR을 줄이는 두 길 — 탐지와 대응의 자동화

신뢰성 공학의 중심 지표는 **MTTR(Mean Time To Recovery, 평균 복구 시간)**이다. 가용성 = MTBF / (MTBF + MTTR)이므로, 장애 간격(MTBF)을 늘리는 것만큼 복구 시간(MTTR)을 줄이는 것이 가용성을 끌어올린다. MTTR은 네 단계로 쪼개진다 — **탐지(detect) → 진단(diagnose) → 복구(repair) → 검증(verify)**. 사람이 개입하면 각 단계마다 핸드오프·인지 지연이 쌓인다(평균 6분의 페이저 지연이 그 예다).

자동 대응의 본질은 이 네 단계를 코드로 만들어 사람의 인지 지연을 제거하는 것이다. **Runbook Automation** — 사람이 위키에 적어 두던 수습 절차를 실행 가능한 상태 기계로 바꾸는 것 — 이 그 도구다.

> 💡 **관련 이론**: 자동 대응은 SRE(Site Reliability Engineering)의 **toil 제거** 원칙의 구현이다. Google SRE 책이 정의한 toil은 "수동·반복·자동화 가능·가치를 늘리지 않는 운영 작업"이며, "알려진 사고를 사람이 매번 수습하는 것"이 전형적 toil이다. SRE는 toil이 운영 시간의 50%를 넘지 않게 자동화로 밀어내라고 권한다. 더 깊은 이론은 제어 이론의 **피드백 루프**다 — 신호(메트릭 이상)를 입력으로 받아, 제어 동작(복구)을 출력하고, 그 결과를 다시 측정(검증)해 수렴을 확인하는 폐루프. 자동 대응의 "진단 → 복구 → 검증" 사슬이 정확히 이 폐루프이며, 검증 단계가 빠지면 "복구했다고 믿지만 실은 안 됐다"는 위험이 생긴다. 그래서 잘 만든 자동 대응은 항상 검증(verify) 단계로 닫힌다.

## EventBridge — 모든 신호가 모이는 진입점

자동 대응의 첫 결정은 "수많은 신호원(CloudWatch Alarm, GuardDuty Finding, Security Hub, Config 비준수, 스케줄)을 어떻게 한 흐름으로 모으나"이다. 답은 **EventBridge**다 — 이질적인 이벤트를 받아 패턴 매칭으로 필터링하고 적절한 대상(Step Functions·Lambda·SNS)으로 라우팅하는 이벤트 버스.

| 항목 | EventBridge | SNS |
|------|-------------|-----|
| 필터링 | 풍부한 패턴 매칭(내용 기반) | 메시지 속성 필터 정책 |
| 스키마 | 강함(Schema Registry) | 약함 |
| 아카이브/재처리 | 가능(이벤트 보관·replay) | 불가 |
| Pipes | 가능(Source→Filter→Enrich→Target) | 불가 |
| 다대다 라우팅 | 강함 | 강함(팬아웃) |

자동 대응 라우팅의 표준이 EventBridge인 이유는 **내용 기반 필터링**과 **아카이브/replay**다. "severity ≥ 7 AND type prefix가 X인 GuardDuty Finding만 이 Runbook으로"처럼 이벤트 내용을 보고 정밀하게 거를 수 있고, 사고 후 이벤트를 replay해 자동화를 재현·디버깅할 수 있다.

> 🔍 **더 깊이**: **EventBridge Pipes**(2022년 출시)가 자동 대응을 한 단계 끌어올렸다. 전통적으로 "큐에서 꺼내 변환해 다음으로 보내는" glue 코드를 Lambda로 짜야 했는데, Pipes는 **Source → Filter → Enrichment → Target**을 코드 없이 선언한다 — SQS/Kinesis/DynamoDB Stream을 소스로, 필터로 거르고, Lambda/Step Functions로 보강(enrich)한 뒤, 최종 타깃으로 보낸다. 이는 **point-to-point integration**(각 연결을 따로 코딩)에서 **선언적 파이프라인**으로의 이동이다. 또 EventBridge는 본질적으로 **EDA(Event-Driven Architecture)**의 메시지 브로커 역할 — 생산자와 소비자를 시간·위치로 분리(decoupling)해, 신호원이 누가 자기 이벤트를 소비하는지 몰라도 되게 한다. 이 느슨한 결합이 "신호원을 늘려도 대응 로직을 안 건드린다"는 확장성의 근거다.

## Step Functions로 Runbook 감싸기 — 왜 Lambda 단독이 위험한가

자동 복구를 Lambda 함수 하나로 짜고 싶은 유혹이 크지만, 성숙한 패턴은 **Step Functions로 Runbook을 감싸는 것**이다. 이유는 Lambda 단독에 없는 네 가지 보장 때문이다.

```
EventBridge Bus
      │
      ▼
Step Functions (Runbook State Machine)
   ├─ 진단 Lambda          ← 현재 상태 측정
   ├─ Approval (선택적)     ← 임팩트 크면 사람 승인 게이트
   ├─ 복구 (Lambda/SSM Automation)
   └─ 검증 Lambda          ← 복구 결과 재측정, 실패 시 Escalation
      │
      ▼
Incident Manager (Response Plan)
   ├─ Chatbot → Slack/Teams 채널 자동 생성
   ├─ Contacts/Pager 호출
   └─ Post-Incident Analysis 자동 생성
```

Step Functions가 주는 것: (1) **재시도·타임아웃**을 상태별로 선언적으로 정의, (2) **감사 가능한 실행 이력**(각 단계 입출력이 남음), (3) **사람 승인 게이트**(임팩트 큰 작업 전 일시정지), (4) **명시적 에러 처리·분기**(실패 시 Escalation 경로). Lambda 단독은 한 함수 안에 이 모두를 절차적으로 짜야 해, 중간 실패 시 어디까지 됐는지 추적하기 어렵고 부분 실행의 위험이 크다.

> ⚠️ **함정**: Step Functions의 **Standard vs Express** 선택이 시험 단골이다. **Standard**는 최대 1년 실행, 정확히 한 번(exactly-once) 워크플로, 완전한 실행 이력 — Runbook 자동화처럼 감사·승인·긴 대기가 필요한 경우에 맞다. **Express**는 최대 5분, 고빈도·고처리량, 이력 제한 — 짧고 빠른 이벤트 처리에 맞다. "5분 이상 걸리는 Runbook, 감사 필요"면 답은 항상 Standard다. Express를 골라 5분을 넘기면 워크플로가 잘린다. 반대로 "초당 수천 건의 짧은 이벤트 변환"이면 Express가 비용·성능에서 맞다.

## 멱등성 — 자동 복구가 사고를 키우지 않게

자동 대응의 가장 위험한 실패 모드는 **자동화가 사고를 증폭시키는 것**이다. EventBridge·SQS는 적어도 한 번(at-least-once) 전달을 보장하므로 같은 이벤트가 두 번 올 수 있고, 자동 복구가 그때마다 동작하면 — 예컨대 "동시성 +50"을 두 번 실행하면 +100이 되고, DLQ Re-drive를 무한 반복하면 — 시스템이 더 망가진다. **멱등성(idempotency)**이 이를 막는다.

DLQ Re-drive 자동화의 표준 가드: SQS DLQ 누적을 알람으로 받아 Redrive API를 호출하되, **메시지 속성에 재처리 횟수(retry count)를 기록**한다. 임계(예: 3회)를 넘은 메시지는 자동 재처리를 멈추고 사람에게 넘긴다 — 같은 메시지가 영원히 큐를 도는 무한 루프(poison message)를 막는 것이다.

> 💡 **관련 이론**: 멱등성은 분산 시스템의 근본 제약에서 나온다. 네트워크는 메시지를 잃거나 중복시킬 수 있고, "정확히 한 번 전달(exactly-once delivery)"은 **이론적으로 불가능**하다 — 송신자가 ACK를 못 받으면 재전송하는데, 그 재전송이 원본 도착 후의 ACK 유실 때문인지 원본 자체의 유실 때문인지 구별할 수 없기 때문이다(Two Generals Problem). 그래서 현실은 "적어도 한 번 전달 + 멱등한 처리 = 효과적으로 정확히 한 번(effectively-once)"으로 푼다. 멱등성이란 "같은 연산을 몇 번 적용해도 결과가 한 번 적용한 것과 같음"(f(f(x)) = f(x))이며, 수학에서 멱등 함수의 정의 그대로다. 자동 복구를 멱등하게 만드는 법: (1) 절대값으로 설정(`set concurrency to 200`)이 (2) 증분(`add 50`)보다 안전하다 — 증분은 중복 실행 시 누적되지만 절대값은 몇 번 실행해도 같은 결과다. (3) 처리한 이벤트 ID를 기록해 중복을 건너뛴다(dedup). poison message의 retry count 가드가 이 dedup의 한 형태다.

> 📚 **사례**: 2017년 **AWS S3 us-east-1 대규모 장애**는 한 엔지니어가 디버깅 중 잘못된 명령으로 의도보다 많은 서버를 제거하면서 시작됐고, 그 여파로 의존하던 수많은 서비스(자동화 포함)가 연쇄적으로 영향을 받았다. 더 일반적인 교훈은 **automation runaway(자동화 폭주)** — 잘못 설계된 자동 복구가 정상 상태를 비정상으로 오판해 멀쩡한 리소스를 종료하거나, 피드백 루프가 발산해 사고를 키우는 — 의 위험이다. 그래서 자동 대응 설계에는 항상 (1) **circuit breaker**(같은 자동화가 짧은 시간에 N회 이상 발동하면 멈추고 사람 호출), (2) **dry-run/canary 단계**, (3) **사람 승인 게이트**(임팩트 큰 작업)를 둔다. "자동화는 빠르지만, 빠른 자동화가 틀리면 빠르게 망가뜨린다"가 핵심이다.

## 보안 인시던트 자동화 — 키 유출 대응 사슬

자동 대응이 가장 빛나는 곳이 보안 사고다. 사람의 반응 속도로는 늦는 — 자격 증명 유출은 분 단위로 피해가 커지는 — 시나리오이기 때문이다(Week 14 Day 1의 캐피털 원 교훈). GuardDuty가 IAM 자격 증명 탈취(`UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration`)를 탐지하면 다음 사슬이 자동으로 돈다.

1. **AccessKey 즉시 비활성화** — 유출된 자격 증명 무력화(증거를 위해 삭제가 아닌 비활성화).
2. **영향받은 사용자/Role 식별·알림**.
3. **CloudTrail Lake에서 영향 분석 쿼리** — 그 자격으로 무엇을 했는지 SQL로 조회.
4. **Incident Manager 인시던트 자동 오픈** — 사람-자동화 협력 시작.

## 사람-자동화 협력 — 자동화가 실패하는 20%

목표는 "80% 자동 복구"였다. 나머지 20% — 자동화가 실패하거나 임팩트가 너무 커 자동 처리하면 안 되는 — 에서 사람을 끌어들이는 것이 **Incident Manager**다. Response Plan은 Contact(연락처) + Escalation(단계적 호출) + Engagement(참여)로 구성되고, 사고 발생 시 페이저를 울리고 **AWS Chatbot으로 Slack/Teams 채널을 자동 생성**한다. Chatbot은 단순 알림이 아니라 **제한된 IAM Role 안에서 채팅창에서 직접 AWS CLI를 실행**하게 해준다 — SRE가 콘솔을 열지 않고 채팅에서 진단·조치를 한다. 사고 종료 시 **Post-Incident Analysis** 템플릿이 자동 생성돼 Timeline·Impact를 기록하고 비난 없는(blameless) 회고를 강제한다.

> ⚠️ **함정**: 자동화 Role과 비상용 Role을 분리하지 않으면 보안이 무너진다. **자동화 Role**은 미리 정의된 복구 동작만 할 수 있게 최소 권한으로 한정한다. **Break-glass Role**(비상시 사람이 쓰는 강력한 권한)은 별도로 두고, **자동화에서는 절대 쓰지 않는다.** 자동화가 Break-glass를 쓸 수 있으면, 자동화가 탈취되거나 폭주할 때 그 강력한 권한이 무기가 된다. 또 모든 자동 수정은 CloudTrail에 흔적을 남기고, SCP로 자동화 Role의 범위를 계정·OU 수준에서 한 번 더 봉한다. "자동화 Role ≠ Break-glass Role"이 시험 포인트다.

> 🎯 **시나리오**: "하루 5억 이벤트, SLA 99.95%. ①Lambda Throttle 급증을 사람 없이 해소 ②GuardDuty가 IAM 키 유출을 탐지하면 즉시 비활성화·영향 분석·인시던트 오픈 ③DLQ 누적 시 자동 Re-drive하되 무한 루프 방지 ④자동화 실패 시 SRE를 Slack으로 끌어들여 제한된 CLI 실행." → ① CloudWatch Alarm(Throttles) → EventBridge → Step Functions(Standard): 진단 Lambda가 현재 동시성 조회 → 절대값으로 상향 설정(멱등) → 5분 후 검증 Lambda 재측정 → 안정되면 Slack 통지, 아니면 Escalation. ② GuardDuty Finding → EventBridge → Step Functions Runbook: 키 비활성화 → CloudTrail Lake 영향 쿼리 → Incident Manager 오픈. ③ DLQ 알람 → Redrive Lambda, 메시지 속성에 retry count 기록, 임계 초과 시 사람. ④ Incident Manager Response Plan + AWS Chatbot(제한된 IAM Role). 자동화 Role과 Break-glass Role 분리, 모든 동작 CloudTrail 기록.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **자동 대응은 MTTR의 탐지→진단→복구→검증 사슬에서 사람의 인지 지연을 제거**하는 SRE의 toil 제거이며, 검증 단계로 닫힌 폐루프여야 한다. 둘째, **EventBridge가 모든 신호의 진입점**으로 내용 기반 필터링·아카이브/replay·Pipes로 느슨한 결합(EDA)을 만든다. 셋째, **Step Functions로 Runbook을 감싸** 재시도·감사·승인 게이트·에러 분기를 얻으며 Standard(긴 Runbook)와 Express(짧고 빠른)를 구분한다. 넷째, **멱등성이 자동화의 사고 증폭을 막는다** — 절대값 설정·dedup·retry count 가드(at-least-once + 멱등 = effectively-once). 다섯째, **Incident Manager + Chatbot이 자동화 실패 20%에서 사람을 끌어들이고**, 자동화 Role과 Break-glass Role을 분리하며 automation runaway에 circuit breaker·승인 게이트로 대비한다.

다음 글에서는 Week 15 전체(멀티 계정·하이브리드·컨테이너·서버리스 인시던트)를 종합 시나리오로 점검한다.

---

## 📝 연습 문제

**문제 1.** 자동 인시던트 대응이 단축하려는 핵심 지표와, 잘 설계된 자동 대응이 반드시 닫아야 하는 단계는?

A) MTBF — 탐지 단계만 있으면 된다

B) MTTR(평균 복구 시간)의 탐지→진단→복구→검증 사슬에서 사람의 인지 지연을 제거하며, 복구가 실제로 됐는지 재측정하는 검증(verify) 단계로 폐루프를 닫아야 한다

C) RPO — 복구 단계만 있으면 된다

D) RTO — 진단만 자동화하면 된다

**정답: B**

해설: 가용성 = MTBF/(MTBF+MTTR)이므로 MTTR 단축이 가용성을 끌어올린다. 자동 대응은 탐지→진단→복구→검증 사슬에서 사람의 인지 지연(핸드오프)을 제거하는 SRE의 toil 제거다. 핵심은 검증 단계 — 빠지면 "복구했다고 믿지만 실은 안 됐다"는 위험이 생기므로 폐루프는 검증으로 닫혀야 한다. MTBF만(A)·RPO(C)·RTO(D)는 이 사슬의 정의와 어긋난다.

---

**문제 2.** 이질적 신호원(CloudWatch Alarm·GuardDuty·Security Hub·Config·스케줄)을 한 흐름으로 모아 내용 기반으로 필터링하고 사고 후 replay까지 하려는 자동 대응의 진입점은?

A) SNS

B) EventBridge — 내용 기반 패턴 매칭, 아카이브/replay, Pipes(Source-Filter-Enrich-Target)를 제공해 신호원과 대응 로직을 느슨하게 결합(EDA)한다

C) SQS

D) Kinesis Data Streams

**정답: B**

해설: EventBridge는 이벤트 내용을 보고 정밀 필터링하고("severity≥7 AND type prefix X"), 이벤트를 아카이브해 replay로 자동화를 재현·디버깅하며, Pipes로 코드 없이 Source→Filter→Enrich→Target 파이프라인을 만든다. EDA 메시지 브로커로 생산자·소비자를 분리해 신호원을 늘려도 대응 로직을 안 건드린다. SNS(A)는 내용 기반 필터·replay가 약하고, SQS(C)·Kinesis(D)는 다신호원 라우팅 진입점이 아니다.

---

**문제 3.** 자동 복구를 Lambda 함수 하나가 아니라 Step Functions로 감싸는 이유로 가장 정확한 것은?

A) Lambda보다 무조건 싸기 때문

B) 상태별 재시도·타임아웃의 선언적 정의, 감사 가능한 실행 이력, 사람 승인 게이트, 명시적 에러 처리·Escalation 분기를 얻어 중간 실패 시 부분 실행 추적이 가능하기 때문

C) Lambda는 인시던트 대응에 쓸 수 없기 때문

D) Step Functions가 더 빠르기 때문

**정답: B**

해설: Step Functions는 상태별 재시도·타임아웃을 선언적으로 정의하고, 각 단계 입출력이 남는 감사 이력, 임팩트 큰 작업 전 사람 승인 게이트, 실패 시 Escalation 분기를 제공한다. Lambda 단독은 한 함수에 이 모두를 절차적으로 짜야 해 중간 실패 시 어디까지 됐는지 추적이 어렵고 부분 실행 위험이 크다. 비용(A)·Lambda 불가(C)·속도(D)는 이유가 아니다.

---

**문제 4.** 감사가 필요하고 5분 이상 걸리며 사람 승인 게이트를 포함하는 Runbook에는 Step Functions Standard와 Express 중 무엇이 맞는가?

A) Express — 5분 한도라 충분하다

B) Standard — 최대 1년 실행, exactly-once 워크플로, 완전한 실행 이력으로 감사·승인·긴 대기에 맞다

C) Lambda 단독

D) SSM Document만

**정답: B**

해설: Standard는 최대 1년 실행, 정확히 한 번 워크플로, 완전한 실행 이력을 제공해 감사·승인·긴 대기가 필요한 Runbook에 맞다. Express는 최대 5분·고빈도·이력 제한이라 짧고 빠른 이벤트 처리용이며, 5분 넘는 Runbook을 Express로 짜면 잘린다. "5분 이상 + 감사"는 항상 Standard다. Lambda 단독(C)·SSM Document만(D)은 승인·재시도·감사 보장이 부족하다.

---

**문제 5.** SQS DLQ 누적 시 자동 Re-drive를 하되 무한 루프(poison message)를 방지하려면? 그 밑의 이론은?

A) Lambda 타임아웃을 늘린다

B) 메시지 속성에 재처리 횟수(retry count)를 기록하고 임계 초과 시 자동 재처리를 멈추고 사람에게 넘긴다 — at-least-once 전달 + 멱등 처리 = effectively-once의 dedup 가드다

C) DLQ에 TTL을 설정한다

D) SQS Long Polling을 켠다

**정답: B**

해설: EventBridge·SQS는 at-least-once 전달이라 같은 메시지가 반복될 수 있고, exactly-once 전달은 이론적으로 불가능하다(Two Generals). 그래서 "적어도 한 번 전달 + 멱등 처리 = effectively-once"로 푼다. retry count를 메시지 속성에 기록해 임계 초과 시 멈추는 것은 dedup 가드로 poison message 무한 루프를 막는다. 타임아웃(A)·TTL(C)·Long Polling(D)은 무한 루프 자체를 막지 못한다.

---

**문제 6.** 자동 복구가 "동시성을 늘리는" 동작을 할 때, 중복 이벤트(at-least-once)로 인한 사고 증폭을 막는 멱등 설계는?

A) 증분으로 설정한다(add 50씩)

B) 절대값으로 설정한다(set concurrency to 200) — 몇 번 실행해도 같은 결과(f(f(x))=f(x))라 중복 실행에도 안전하다

C) 매번 무작위 값으로 설정한다

D) 동시성을 두 배로 늘린다

**정답: B**

해설: 멱등성은 "같은 연산을 몇 번 적용해도 한 번 적용한 것과 같음"(f(f(x))=f(x))이다. 증분(add 50)은 중복 실행 시 +100으로 누적돼 위험하지만, 절대값 설정(set to 200)은 몇 번 실행해도 결과가 200으로 같아 at-least-once 중복에 안전하다. 무작위(C)·두 배(D)는 멱등이 아니어서 사고를 키울 수 있다.

---

**문제 7.** 자동화 Role과 Break-glass(비상) Role의 관계로 옳은 것은? 그 이유는?

A) 동일한 Role을 공유한다

B) 분리한다 — 자동화 Role은 정의된 복구 동작만 하는 최소 권한이고 Break-glass Role(강력한 비상 권한)은 사람 전용이며 자동화에서 절대 쓰지 않는다. 자동화가 탈취·폭주할 때 강력한 권한이 무기가 되는 것을 막기 위해서다

C) Break-glass Role을 자동화에 쓰면 더 빠르다

D) Root 계정을 자동화에 쓴다

**정답: B**

해설: 자동화 Role은 미리 정의된 복구 동작만 할 수 있게 최소 권한으로 한정하고, Break-glass Role은 사람 비상용으로 별도로 둬 자동화에서 절대 쓰지 않는다. 자동화가 Break-glass를 쓸 수 있으면 automation runaway나 탈취 시 그 강력한 권한이 무기가 된다. 모든 자동 수정은 CloudTrail에 남기고 SCP로 자동화 Role 범위를 한 번 더 봉한다. 공유(A)·Break-glass 사용(C)·Root(D)는 모두 위험한 안티패턴이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 자동 대응은 MTTR의 탐지→진단→복구→검증 사슬에서 사람의 인지 지연을 제거하는 SRE toil 제거이며 검증으로 닫힌 폐루프여야 한다. 둘째, EventBridge가 모든 신호의 진입점으로 내용 기반 필터링·아카이브/replay·Pipes로 느슨한 결합(EDA)을 만든다. 셋째, Step Functions로 Runbook을 감싸 재시도·감사·승인 게이트·에러 분기를 얻으며 Standard(긴 Runbook·감사)와 Express(짧고 빠른)를 구분한다. 넷째, 멱등성(절대값 설정·dedup·retry count 가드)이 at-least-once 중복으로 인한 사고 증폭을 막는다(effectively-once). 다섯째, Incident Manager + Chatbot이 자동화 실패 20%에서 사람을 끌어들이고, 자동화 Role과 Break-glass Role을 분리하며 automation runaway에 circuit breaker·승인 게이트로 대비한다.
