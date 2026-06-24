# Day 4 - EventBridge 보안 자동화: 핀딩 라우팅, 알림 파이프라인, 보안 데이터 레이크 개념

탐지(GuardDuty), 집계(Security Hub), 분석(Athena/OpenSearch)을 갖췄어도, 사람이 모든 핀딩을 손으로 분류·대응하면 운영은 곧 붕괴한다. 보안 자동화의 신경계가 **Amazon EventBridge**다 — AWS 전역에서 일어나는 이벤트를 *규칙(rule)*으로 필터링해 *대상(target)*으로 라우팅하는 이벤트 버스. 보안 시험에서 EventBridge는 "핀딩 → 적절한 대응 액션"을 잇는 라우터이자, 탐지-대응 루프(detection-response loop)를 *닫는* 메커니즘이다. 여기에 더해 조직 전체의 보안 로그를 정규화·통합하는 상위 개념인 **Security Lake**를 오늘 함께 다룬다.

## EventBridge의 구조: Bus, Rule, Target

```
이벤트 소스 ──▶ [Event Bus] ──▶ [Rule: 이벤트 패턴 매칭] ──▶ [Target(s)]
(GuardDuty,                                              (Lambda, SNS,
 Security Hub,                                            Step Functions,
 Config, CloudTrail                                       SSM Automation,
 via API,                                                 SQS, 다른 계정 Bus...)
 Health, ...)
```

- **Event Bus**: 이벤트가 흐르는 통로. *default bus*(AWS 서비스 이벤트), *custom bus*(앱 이벤트), *partner bus*(SaaS).
- **Rule**: 이벤트를 매칭하는 두 종류 — **이벤트 패턴(event pattern)** 기반(특정 모양의 이벤트가 오면) 또는 **스케줄(schedule)** 기반(cron/rate, 주기적 점검·키 로테이션 트리거).
- **Target**: 매칭 시 호출되는 대상. 규칙당 최대 5개. Lambda, SNS, SQS, Step Functions, SSM Automation/Run Command, Kinesis, API Destinations(외부 HTTP), 다른 계정/리전의 Bus 등.

> 💡 **관련 이론**: EventBridge는 EDA(Event-Driven Architecture)의 *content-based router* 패턴 구현이다. 이벤트의 내용을 검사해 목적지를 결정한다. 보안 맥락에서 이는 "탐지 신호를 그 의미에 따라 적절한 대응 핸들러로 분배"하는 것 — 즉 SOAR의 오케스트레이션 계층이다. CloudWatch Events는 EventBridge의 전신이며, 보안 시험에서 둘은 사실상 동일 개념으로 취급된다(EventBridge가 상위 호환).

## 핀딩 라우팅: 이벤트 패턴 정밀하게 쓰기

보안 자동화의 출발점은 "어떤 핀딩을 잡을지"를 이벤트 패턴으로 정밀하게 기술하는 것이다. GuardDuty와 Security Hub 핀딩 라우팅을 비교해보자.

```json
// GuardDuty 핀딩 중 심각도 7.0 이상(HIGH/CRITICAL)만 라우팅
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [ { "numeric": [">=", 7.0] } ]
  }
}
```

```json
// Security Hub로 집계된 핀딩 중 특정 타입 + NEW 상태만
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Types": [{ "prefix": "TTPs/Initial Access" }],
      "Workflow": { "Status": ["NEW"] },
      "Severity": { "Label": ["HIGH", "CRITICAL"] }
    }
  }
}
```

패턴 매칭의 핵심 연산자:
- 정확 매칭(값 배열), `prefix`, `suffix`, `cidr`(IP 범위), `numeric`(비교), `exists`, `anything-but`(부정), `equals-ignore-case`.
- 중첩 필드는 객체로 표현. 매칭은 "패턴에 있는 키만" 검사하므로 패턴에 없는 필드는 무시된다(부분 매칭).

> ⚠️ **함정**: GuardDuty의 `severity`는 *숫자*(0.1~8.9)이고 Security Hub의 `Severity.Label`은 *문자열*(LOW/MEDIUM/HIGH/CRITICAL)이다. GuardDuty 핀딩을 직접 잡을 때 `"severity": ["HIGH"]`라고 쓰면 절대 매칭되지 않는다 — 숫자 비교(`numeric`)를 써야 한다. 같은 위협이라도 *직접 GuardDuty 버스에서 잡느냐*, *Security Hub 집계 후 잡느냐*에 따라 패턴 스키마가 다르다는 점이 빈출 함정이다.

## 입력 변환과 대상으로의 전달

매칭된 이벤트를 대상에 그대로 넘기거나, **Input Transformer**로 필요한 필드만 추출·재구성해 넘길 수 있다. 예를 들어 SNS로 사람에게 보낼 때 원본 JSON 전체 대신 "계정/리전/리소스/심각도"만 읽기 쉽게 가공한다.

```json
// Input Transformer 예: 핵심 필드만 뽑아 알림 메시지로
{
  "InputPathsMap": {
    "acct": "$.detail.findings[0].AwsAccountId",
    "sev": "$.detail.findings[0].Severity.Label",
    "type": "$.detail.findings[0].Types[0]",
    "res": "$.detail.findings[0].Resources[0].Id"
  },
  "InputTemplate": "\"[<sev>] 계정 <acct> 에서 <type> 탐지 — 리소스 <res>\""
}
```

## 자동 대응 파이프라인: 세 가지 전형

EventBridge 대상을 무엇으로 두느냐에 따라 대응의 성격이 달라진다.

1. **알림 파이프라인(notify)**: Rule → SNS → 이메일/Slack(Chatbot/API Destination)/PagerDuty. 사람에게 전달.
2. **즉시 교정(remediate)**: Rule → Lambda 또는 **SSM Automation 문서**. 코드/문서가 리소스를 직접 고친다. 예: 공개 보안 그룹 규칙 회수, 노출된 액세스 키 비활성화, S3 퍼블릭 액세스 차단.
3. **오케스트레이션(orchestrate)**: Rule → **Step Functions**. 격리→스냅샷→포렌식 분석→티켓 생성처럼 다단계·조건 분기·승인 게이트가 있는 대응 워크플로.

```
Rule(CRITICAL GuardDuty: EC2 침해)
  └─▶ Step Functions
        ├─ 1) 인스턴스를 격리 SG로 교체(네트워크 차단)
        ├─ 2) EBS 스냅샷 생성(포렌식 보존)
        ├─ 3) Security Hub Workflow.Status = NOTIFIED
        ├─ 4) SNS로 보안팀 알림
        └─ 5) (승인 후) 인스턴스 종료
```

> 🎯 **시나리오**: "GuardDuty가 EC2 인스턴스의 암호화폐 채굴(CryptoCurrency)을 탐지하면 자동으로 인스턴스를 격리하고 보안팀에 알림"은 시험 빈출 자동화다. 정답 경로: GuardDuty 핀딩 → EventBridge 규칙(severity·type 매칭) → Step Functions 또는 Lambda(격리 SG 적용 + EBS 스냅샷 + SNS 알림). 단순 알림만이면 SNS 하나로 충분하지만 *격리·보존*이 요구되면 Step Functions/Lambda 오케스트레이션이 필요하다.

> ⚠️ **함정**: 자동 대응 Lambda/SSM에 부여하는 IAM 권한이 과도하면 그 자체가 공격 표면이 된다. 격리용 역할은 "보안 그룹 교체·스냅샷·종료" 등 *필요한 액션만* 갖고, 가능하면 리소스 조건(태그·계정)으로 범위를 좁혀야 한다. "자동 대응을 위해 PowerUser/Admin을 붙인다"는 오답 선택지를 경계하라.

## Cross-Account, Cross-Region 이벤트 라우팅

다계정 보안 운영에서 EventBridge는 멤버 계정의 이벤트를 **중앙 보안 계정**으로 모은다.

- 멤버 계정의 규칙 대상을 *중앙 계정의 Event Bus ARN*으로 지정.
- 중앙 계정 버스의 **Resource-based policy**로 멤버 계정의 `events:PutEvents`를 허용.
- 중앙 버스에서 다시 규칙으로 분배(SNS, 교정 Lambda, SIEM 등).

이렇게 하면 각 계정에 대응 로직을 흩어 두지 않고 *중앙에서 일관 대응*한다.

```json
// 중앙 보안 계정 버스의 리소스 정책: 조직 멤버의 PutEvents 허용
{
  "Sid": "AllowOrgMembersPutEvents",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "events:PutEvents",
  "Resource": "arn:aws:events:ap-northeast-2:999988887777:event-bus/central-security-bus",
  "Condition": { "StringEquals": { "aws:PrincipalOrgID": "o-abc123" } }
}
```

> 🔍 **더 깊이**: EventBridge 전달은 *at-least-once*(최소 한 번) 보장이라 드물게 중복 전달이 일어날 수 있다. 자동 교정 핸들러는 **멱등(idempotent)**하게 설계해야 한다 — 이미 격리된 인스턴스를 다시 격리해도 부작용이 없도록. 또 대상 호출 실패 시 재시도·**DLQ(Dead-Letter Queue, SQS)**를 구성해 누락된 이벤트를 보존해야 한다. "탐지했는데 대응 이벤트가 조용히 유실"되는 것은 보안 운영의 치명적 공백이다.

## EventBridge Scheduler: 주기적 보안 작업

이벤트 반응형 외에, **스케줄 기반** 규칙(또는 EventBridge Scheduler)으로 주기적 보안 작업을 자동화한다. 예: 매일 미사용 액세스 키 점검 Lambda, 분기별 IAM 자격증명 보고서 생성, 주기적 Config 평가 트리거. cron/rate 표현식으로 정의한다.

## 보안 데이터 레이크: Amazon Security Lake

자동화·분석이 성숙하면 "조직 전역의 보안 로그를 *정규화된 단일 저장소*로 모으자"는 요구가 생긴다. **Amazon Security Lake**가 이를 관리형으로 제공한다.

핵심 개념:
- **목적**: 여러 계정·리전·소스(CloudTrail, VPC Flow, Route 53, Security Hub 핀딩, 서드파티)의 보안 로그를 *중앙 S3 데이터 레이크*로 자동 수집·정규화.
- **OCSF(Open Cybersecurity Schema Framework)**: Security Lake가 데이터를 정규화하는 *오픈 표준 스키마*. ASFF가 Security Hub *내부* 핀딩 포맷이라면, OCSF는 *업계 공통* 보안 이벤트 스키마다. 벤더 종속을 줄인다.
- **저장**: S3에 **Parquet**(컬럼형)로, OCSF 스키마로 정리되어 저장 → Athena/OpenSearch/서드파티 SIEM이 바로 질의.
- **Subscriber 모델**: 데이터를 소비하는 주체(분석 도구·계정)를 subscriber로 등록해 *쿼리 접근* 또는 *데이터 접근*을 부여.

```
CloudTrail ┐
VPC Flow   ┤
Route 53   ┼─▶ [Security Lake] ──(OCSF/Parquet, S3)──▶ Athena / OpenSearch / SIEM(subscriber)
Security Hub┤        (다계정·다리전 자동 수집·정규화)
서드파티     ┘
```

> 💡 **관련 이론**: Security Lake는 Day 3에서 본 "로그가 흩어져 있어 분석 도구마다 다른 스키마를 마주한다"는 문제의 *조직 차원 해법*이다. 정규화를 적재 시점에 OCSF로 통일해두면, 분석 도구(Athena/OpenSearch/SIEM)는 소스별 변환 없이 동일 스키마로 질의한다. 즉 Security Hub가 *핀딩*을 ASFF로 정규화한다면, Security Lake는 *원시 로그 전반*을 OCSF로 정규화한다 — 두 정규화 계층의 역할 분담을 구분하는 것이 시험 포인트다.

> ⚠️ **함정**: Security Lake와 Security Hub를 혼동하지 말 것. Security Hub는 *핀딩(탐지 결과)*의 집계·점수·컴플라이언스 대시보드이고, Security Lake는 *원시 보안 로그*의 정규화 저장소(분석용 데이터 레이크)다. "여러 소스의 로그를 OCSF로 정규화해 SIEM에서 질의"면 Security Lake, "여러 탐지기의 핀딩을 한 대시보드에서 보고 점수화"면 Security Hub다.

## 정리: 자동화 신경계

EventBridge는 탐지 신호를 의미에 따라 알림·교정·오케스트레이션으로 분배하는 라우터이며, 멱등·DLQ·최소권한이 운영 위생의 핵심이다. Security Lake는 그 위에서 조직 전역 로그를 OCSF로 정규화해 분석을 단일 스키마로 통일한다. Day 5에서 CloudWatch·Security Hub·분석·EventBridge를 하나의 탐지-집계-분석-대응 흐름으로 묶는다.

---

## 📝 연습 문제

**문제 1.** GuardDuty 핀딩을 EventBridge 규칙으로 직접 잡으려는데 `"detail": { "severity": ["HIGH"] }` 패턴이 한 번도 매칭되지 않는다. 원인은?

A) GuardDuty는 EventBridge로 이벤트를 보내지 않는다  
B) GuardDuty의 severity는 숫자(0.1~8.9)이므로 numeric 비교 연산자를 써야 하며 문자열 "HIGH"로는 매칭되지 않는다  
C) 규칙에 대상이 없어서다  
D) default bus가 아닌 custom bus를 써야 한다  

**정답: B**  
해설: GuardDuty 핀딩의 severity는 숫자 값이므로 `{ "numeric": [">=", 7.0] }` 형태로 매칭해야 한다. 문자열 라벨(HIGH/CRITICAL)은 Security Hub로 집계된 핀딩의 `Severity.Label`에서 쓰는 형식이다. GuardDuty는 default bus로 이벤트를 보내며, 대상 유무는 매칭 여부와 무관하다.

---

**문제 2.** GuardDuty가 EC2 인스턴스 침해를 탐지하면 자동으로 (1) 인스턴스를 격리하고 (2) EBS 스냅샷을 보존하고 (3) 보안팀에 알리는 다단계 대응을 구성하려 한다. 가장 적합한 대상은?

A) SNS 토픽 하나  
B) EventBridge 규칙 → Step Functions(또는 Lambda)로 격리·스냅샷·알림을 오케스트레이션  
C) CloudWatch Alarm  
D) Athena 쿼리  

**정답: B**  
해설: 격리·스냅샷·알림처럼 순서·분기가 있는 다단계 대응은 Step Functions 오케스트레이션(또는 다단계 Lambda)이 적합하다. SNS는 단순 알림만 하고, CloudWatch Alarm은 메트릭 임계 탐지, Athena는 사후 쿼리 도구로 능동 교정 워크플로를 수행하지 못한다.

---

**문제 3.** 자동 교정 Lambda를 설계할 때 보안 위생상 가장 중요한 원칙은?

A) 대응 속도를 위해 Administrator 권한을 부여  
B) 필요한 액션만 갖는 최소 권한 역할을 부여하고 가능하면 리소스 조건으로 범위를 좁힌다  
C) Lambda를 퍼블릭 서브넷에 배치  
D) 로그를 남기지 않는다  

**정답: B**  
해설: 자동 대응 핸들러의 과도한 권한은 그 자체가 공격 표면이 되므로, 격리·스냅샷 등 필요한 액션만 부여하고 태그·계정 등 조건으로 범위를 좁히는 최소 권한이 핵심이다. Administrator 부여는 위험하고, 퍼블릭 배치·로그 미작성은 보안을 약화시킨다.

---

**문제 4.** 다계정 환경에서 모든 멤버 계정의 보안 이벤트를 중앙 보안 계정에서 일관 대응하려 한다. EventBridge 구성으로 옳은 것은?

A) 각 멤버 계정에 동일한 대응 Lambda를 복제 배포  
B) 멤버 계정 규칙의 대상을 중앙 계정 Event Bus로 지정하고, 중앙 버스의 리소스 정책으로 멤버의 PutEvents를 허용  
C) 중앙 계정에서 멤버 계정 로그를 직접 폴링  
D) SNS 토픽 하나를 모든 계정이 공유  

**정답: B**  
해설: cross-account 라우팅은 멤버 규칙의 대상을 중앙 버스 ARN으로 두고, 중앙 버스 리소스 정책(예: aws:PrincipalOrgID 조건)으로 멤버의 events:PutEvents를 허용하는 것이 표준이다. 대응 로직을 모든 계정에 복제하면 일관성·관리성이 떨어지고, 폴링·SNS 공유는 이벤트 라우팅의 정답 패턴이 아니다.

---

**문제 5.** 여러 계정·리전의 CloudTrail, VPC Flow, Route 53 로그와 서드파티 데이터를 OCSF 표준 스키마로 정규화해 S3에 모으고 Athena·SIEM이 단일 스키마로 질의하게 하려 한다. 가장 적합한 서비스는?

A) AWS Security Hub  
B) Amazon Security Lake  
C) Amazon Macie  
D) AWS Config  

**정답: B**  
해설: 다계정·다리전 원시 보안 로그를 OCSF 표준으로 정규화해 S3 데이터 레이크(Parquet)로 자동 수집하고 subscriber가 단일 스키마로 질의하게 하는 서비스는 Security Lake다. Security Hub는 핀딩을 ASFF로 집계·점수화하는 대시보드, Macie는 S3 민감데이터 발견, Config는 리소스 구성 평가로 역할이 다르다.

---
