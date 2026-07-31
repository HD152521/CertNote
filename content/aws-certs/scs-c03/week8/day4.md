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

### 어떤 서비스가 무슨 이벤트를 보내는가

패턴을 쓰려면 `source`와 `detail-type`의 조합을 알아야 한다. 보안에서 쓰는 것은 사실상 아래 목록이 전부다.

| 서비스 | `source` | `detail-type` | 비고 |
|--------|----------|---------------|------|
| GuardDuty | `aws.guardduty` | `GuardDuty Finding` | `detail.severity`가 **숫자** |
| Security Hub | `aws.securityhub` | `Security Hub Findings - Imported` | `detail.findings[]` 배열, severity는 **라벨** |
| Security Hub 수동 작업 | `aws.securityhub` | `Security Hub Findings - Custom Action` | 분석가가 버튼을 누를 때 |
| Inspector | `aws.inspector2` | `Inspector2 Finding` | 취약점 |
| Macie | `aws.macie` | `Macie Finding` | 민감데이터 |
| Config | `aws.config` | `Config Rules Compliance Change` | 준수 상태 전이 |
| CloudTrail 경유 API 호출 | `aws.<서비스>` | `AWS API Call via CloudTrail` | **해당 리전에 trail이 있어야** 발행됨 |
| AWS Health | `aws.health` | `AWS Health Event` | 계정에 영향을 주는 이벤트 |

마지막에서 두 번째 행이 시험에서 자주 등장한다. **개별 API 호출에 반응하는 자동화**(예: "누군가 CloudTrail을 중지하면 즉시 되돌린다")는 CloudWatch 알람이 아니라 이 경로다. 다만 전제가 있다 — **그 리전에 관리 이벤트를 기록하는 trail이 존재해야** EventBridge로 이벤트가 흐른다. "trail이 없는 리전에서도 자동으로 잡힌다"는 서술은 오답이다.

```json
// CloudTrail 중지 시도를 즉시 잡아 되돌리는 자동화의 입구
{
  "source": ["aws.cloudtrail"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventSource": ["cloudtrail.amazonaws.com"],
    "eventName": ["StopLogging", "DeleteTrail", "UpdateTrail", "PutEventSelectors"]
  }
}
```

```json
// Config 규칙이 NON_COMPLIANT로 전이하는 순간만 (COMPLIANT 복귀는 무시)
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {
    "messageType": ["ComplianceChangeNotification"],
    "newEvaluationResult": {
      "complianceType": ["NON_COMPLIANT"]
    }
  }
}
```

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

### 연산자를 실제로 쓰는 모양

패턴을 정밀하게 쓰는 능력이 곧 알림 피로를 줄이는 능력이다. 아래는 연산자별 실전 용례다.

```json
// ① anything-but: 알려진 양성(benign) 유형을 제외하고 나머지 전부
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 4.0] }],
    "type": [{ "anything-but": { "prefix": "Recon:EC2/PortProbeUnprotectedPort" } }]
  }
}
```

```json
// ② cidr: 사내 대역에서 온 것과 외부에서 온 것을 다르게 처리
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "service": {
      "action": {
        "networkConnectionAction": {
          "remoteIpDetails": {
            "ipAddressV4": [{ "anything-but": { "cidr": "203.0.113.0/24" } }]
          }
        }
      }
    }
  }
}
```

```json
// ③ exists + 다중 조건: 프로덕션 태그가 붙은 리소스의 FAILED 컨트롤만
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Compliance": { "Status": ["FAILED"] },
      "Severity":   { "Label": ["CRITICAL", "HIGH"] },
      "Workflow":   { "Status": ["NEW"] },
      "Resources":  { "Tags": { "Env": ["prod"] } }
    }
  }
}
```

> ⚠️ **함정**: 패턴 매칭은 **부분 매칭**이다. 패턴에 쓰지 않은 필드는 검사하지 않으므로, 조건을 적게 쓸수록 *넓게* 잡힌다. 이 성질 때문에 생기는 대표적 사고가 **"테스트로 만든 넓은 규칙을 지우지 않은 채 정밀한 규칙을 추가"**하는 것이다. EventBridge는 매칭되는 *모든* 규칙을 실행하므로, 넓은 규칙이 남아 있으면 정밀 규칙을 아무리 잘 써도 알림은 줄지 않는다. 규칙은 서로를 대체하지 않고 **누적**된다는 점을 기억해야 한다.

> 🔍 **더 깊이**: 같은 위협을 GuardDuty 버스에서 직접 잡을지, Security Hub 집계 후 잡을지는 스키마 차이만의 문제가 아니라 **설계 선택**이다. 직접 잡으면 지연이 가장 짧고 원본 필드를 전부 쓸 수 있지만, 탐지기가 늘어날 때마다 규칙을 새로 짜야 한다. Security Hub 경유는 한 박자 늦지만 **모든 탐지기가 같은 스키마로 들어오므로 규칙 하나가 여러 탐지기를 커버**한다. 실무의 절충은 이렇다 — *즉시성이 생명인 소수의 위협 유형*(자격증명 유출, 채굴)은 직접 경로로, *나머지 전부*는 Security Hub 경유로. 시험에서 "탐지기가 늘어나도 자동화를 다시 짜지 않으려면"이라는 조건이 붙으면 답은 항상 집계 경유다.

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

> 📚 **사례**: 공개 저장소에 실수로 커밋된 AWS 액세스 키가 **아주 짧은 시간 안에** 발견되어 악용되는 현상은 보안 업계에서 오래 관찰·보고돼 온 패턴이다. 공격자 쪽이 공개 코드 저장소를 상시 스캔하는 자동화를 돌리고 있기 때문이며, 유출된 키는 대개 사람이 알아차리기 전에 채굴 인스턴스 생성이나 데이터 접근에 쓰인다. 이 사실이 오늘 내용에 주는 함의는 냉정하다 — **공격 쪽은 이미 자동화되어 있다.** 방어가 "핀딩을 사람이 보고 판단한 뒤 조치"라는 루프에 머물러 있으면, 그 루프의 시간 상수가 공격의 시간 상수보다 훨씬 크다. 자동 대응이 필요한 이유는 인력 절감이 아니라 **속도의 대칭을 회복하는 것**이다. 동시에 같은 이유로 자동 대응의 오작동 피해도 자동화된 속도로 확산되므로, 가역성 판단과 최소 권한이 그 어느 영역보다 엄격해야 한다.

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

### 무엇을 무인으로 돌릴 것인가: 가역성이라는 기준

자동 대응 설계에서 유일하게 흔들리지 않는 기준은 **되돌릴 수 있는가**다.

| 조치 | 가역성 | 무인 자동화 | 이유 |
|------|--------|------------|------|
| 격리 보안 그룹으로 교체 | 가역 | **가능** | 원래 SG로 되돌리면 끝 |
| 리소스 태깅(격리 표시) | 가역 | **가능** | 부작용 없음 |
| EBS 스냅샷 생성 | 가역(추가만) | **가능** | 증거를 *만드는* 방향 |
| IAM 세션 무효화·키 비활성화 | 가역 | **가능** | 재활성화 가능. 단 서비스 중단 주의 |
| S3 퍼블릭 액세스 차단 | 가역 | **가능** | 노출을 줄이는 방향 |
| 인스턴스 중지 | 준가역 | 조건부 | 메모리 증거는 사라진다 |
| **인스턴스 종료** | **비가역** | **금지** | 증거 파괴 + 서비스 중단 |
| **볼륨·스냅샷 삭제** | **비가역** | **금지** | 증거 파괴 |
| **역할·사용자 삭제** | **비가역** | **금지** | 복구 불가, 다른 워크로드 연쇄 중단 |

경계선에 있는 것이 "인스턴스 중지"다. 네트워크를 끊는 효과는 격리 SG와 같지만, **메모리 상주 증거(실행 중 프로세스, 복호화된 키, 네트워크 연결 상태)가 함께 사라진다.** 그래서 침해 대응의 표준 순서는 *중지가 아니라 격리*다 — 인스턴스는 계속 돌게 두되 통신만 끊고, 그 상태에서 스냅샷과 메모리 수집을 한 다음 사람이 판단한다.

> 🎯 **시나리오**: "GuardDuty가 인스턴스 침해를 탐지하면 자동으로 대응하되 포렌식 증거를 보존해야 한다"는 문항의 정답 조치 묶음은 **격리 SG로 교체 + 태깅 + EBS 스냅샷 + 인스턴스 프로파일 역할의 세션 무효화 + 알림**이다. 오답 보기의 전형은 세 가지다. (1) 첫 조치로 **종료** — 증거 파괴. (2) **아무 자동화 없이 알림만** — 반출이 진행 중인 몇 분을 그대로 내준다. (3) **역할 삭제** — 비가역이고 같은 역할을 쓰는 다른 인스턴스까지 죽는다. 정답은 언제나 "가역적 조치로 피해를 멈추고, 비가역 조치는 사람에게 넘긴다"의 형태다.

### 승인 게이트: 사람을 한 번 거치게 하는 법

비가역 조치가 필요할 때는 Step Functions의 **콜백 패턴**으로 사람을 워크플로 안에 넣는다.

```
Step Functions 워크플로
  ├─ 1) 격리 SG 교체            (자동, 가역)
  ├─ 2) 스냅샷 생성             (자동, 증거 보존)
  ├─ 3) 세션 무효화             (자동, 가역)
  ├─ 4) Slack/티켓으로 승인 요청 ◀── waitForTaskToken (사람 대기)
  │        │
  │        ├─ 승인 → 5) 종료·정리 (비가역, 승인 후에만)
  │        └─ 반려 → 6) 격리 유지 + 조사 티켓 승급
  └─ (타임아웃) → 격리 상태 유지하고 에스컬레이션
```

마지막 줄이 설계의 품질을 가른다. **타임아웃 시 기본 동작이 "아무것도 안 함"이면 안 된다** — 승인 요청이 묻히면 격리만 된 채 잊히고, 며칠 뒤 "왜 이 인스턴스가 통신이 안 되지"로 발견된다. 타임아웃의 기본 동작은 *더 높은 등급으로 올리는 것*이어야 한다.

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

### 다계정 집계 구조를 한 장으로

```
[ 조직 전체의 보안 이벤트가 한 버스로 모이는 구조 ]

 워크로드 계정 A            워크로드 계정 B            워크로드 계정 C
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ GuardDuty    │         │ GuardDuty    │         │ GuardDuty    │
│ Config       │         │ Config       │         │ Config       │
│ CloudTrail   │         │ CloudTrail   │         │ CloudTrail   │
│      │       │         │      │       │         │      │       │
│  default bus │         │  default bus │         │  default bus │
│      │       │         │      │       │         │      │       │
│  [규칙: 전달] │         │  [규칙: 전달] │         │  [규칙: 전달] │
└──────┼───────┘         └──────┼───────┘         └──────┼───────┘
       │                        │                        │
       │   events:PutEvents (중앙 버스 리소스 정책이 허용)  │
       └────────────┬───────────┴────────────┬───────────┘
                    ▼                        ▼
        ┌───────────────────────────────────────────────┐
        │   Security Tooling 계정 / 집계 리전             │
        │   custom bus: central-security-bus             │
        │   ├─ 리소스 정책: aws:PrincipalOrgID 조건        │
        │   ├─ 아카이브(archive): 이벤트 원본 보존          │
        │   └─ 규칙 세트:                                 │
        │        · CRITICAL → Step Functions(격리·보존)   │
        │        · HIGH     → SNS 온콜 + 티켓             │
        │        · MEDIUM   → SQS 집계 큐 → 일일 요약      │
        │        · 전부      → Firehose → S3(감사 사본)    │
        └───────────────────────────────────────────────┘
                    │                        │
                    ▼                        ▼
              DLQ(SQS): 전달 실패 보존   재생(replay): 핸들러 수정 후 재처리
```

세 가지가 이 그림의 요점이다. **(1) 워크로드 계정에는 규칙만 두고 대응 로직을 두지 않는다** — 로직이 흩어지면 버전이 갈라진다. **(2) 중앙 버스에서 등급별로 갈라진다** — 모든 이벤트를 같은 곳으로 보내면 알림 피로가 즉시 발생한다. **(3) 아카이브와 DLQ가 양쪽 끝에 있다** — 앞쪽은 "핸들러 버그로 잘못 처리한 이벤트를 다시 돌리기" 위해, 뒤쪽은 "전달 자체가 실패한 이벤트를 잃지 않기" 위해서다.

```bash
# 중앙 버스: 조직 멤버의 PutEvents 허용
aws events put-permission \
  --event-bus-name central-security-bus \
  --action events:PutEvents \
  --principal "*" \
  --statement-id AllowOrgMembers \
  --condition '{"Type":"StringEquals","Key":"aws:PrincipalOrgID","Value":"o-abc123xyz"}'

# 멤버 계정: 자기 이벤트를 중앙 버스로 전달 (전달용 역할 필요)
aws events put-targets \
  --rule forward-security-events \
  --targets '[{
    "Id": "to-central",
    "Arn": "arn:aws:events:ap-northeast-2:999988887777:event-bus/central-security-bus",
    "RoleArn": "arn:aws:iam::111122223333:role/EventBridgeCrossAccountRole"
  }]'

# 중앙 버스: 대상마다 재시도 정책과 DLQ를 붙인다
aws events put-targets \
  --event-bus-name central-security-bus \
  --rule critical-findings \
  --targets '[{
    "Id": "isolate-workflow",
    "Arn": "arn:aws:states:ap-northeast-2:999988887777:stateMachine:IsolateAndPreserve",
    "RoleArn": "arn:aws:iam::999988887777:role/EventBridgeInvokeSfn",
    "RetryPolicy": { "MaximumRetryAttempts": 4, "MaximumEventAgeInSeconds": 3600 },
    "DeadLetterConfig": { "Arn": "arn:aws:sqs:ap-northeast-2:999988887777:eb-dlq" }
  }]'

# 아카이브: 원본 이벤트를 보존해 두면 나중에 재생할 수 있다
aws events create-archive \
  --archive-name central-security-archive \
  --event-source-arn arn:aws:events:ap-northeast-2:999988887777:event-bus/central-security-bus \
  --retention-days 90
```

> ⚠️ **함정**: 크로스계정 전달에는 **양쪽 권한이 모두** 필요하다. 중앙 버스의 리소스 정책이 `PutEvents`를 허용해야 하고, *동시에* 멤버 계정의 규칙 대상에 지정한 **역할이 `events:PutEvents` 권한을 가져야** 한다. 한쪽만 설정하고 "이벤트가 안 온다"고 하는 것이 가장 흔한 증상이며, 더 나쁜 것은 **실패가 조용하다**는 점이다. 그래서 크로스계정 전달에는 반드시 DLQ를 붙이고, DLQ에 메시지가 쌓이는지 자체를 알람으로 감시해야 한다.

> 🔍 **더 깊이**: 아카이브와 재생(replay)이 보안에서 갖는 가치는 흔히 과소평가된다. 자동 대응 핸들러에 버그가 있어 3일치 CRITICAL 핀딩이 잘못 처리됐다고 하자. 핸들러를 고쳐도 **이미 지나간 이벤트는 돌아오지 않는다** — 탐지기가 같은 핀딩을 다시 만들어 주지 않기 때문이다. 아카이브가 있으면 기간을 지정해 재생할 수 있고, 이때 핸들러가 멱등하다면 재생은 안전하다. **멱등성이 단지 중복 전달 대비가 아니라 "재생 가능성"의 전제**라는 점이 핵심이다. 멱등하지 않은 핸들러는 재생이 불가능하고, 재생이 불가능하면 버그의 영향 범위를 복구할 방법이 없다.

## 알림 피로 관리: 자동화가 만드는 새로운 소음

자동화를 붙이면 알림이 줄 것 같지만 실제로는 **늘어난다.** 이전에는 사람이 콘솔을 볼 때만 알던 것이 이제 전부 채널로 밀려오기 때문이다. 파이프라인 단계마다 소음을 줄이는 장치가 필요하다.

```
 [ 발생 ]        [ 라우팅 ]        [ 집계 ]           [ 도달 ]
 핀딩 ──────▶ EventBridge ──┬──▶ 즉시 경로 ──────▶ 온콜(CRITICAL만)
                            │
                            ├──▶ SQS 집계 큐 ──▶ Lambda(배치) ──▶ 일일 요약
                            │      (윈도 동안 모았다가 한 번에)
                            │
                            └──▶ Firehose ──▶ S3 ──▶ 대시보드·주간 리뷰
```

| 장치 | 무엇을 줄이나 | 구현 |
|------|--------------|------|
| **심각도 임계 라우팅** | 낮은 등급이 온콜에 도달하는 것 | 규칙의 `numeric`/`Label` 조건 |
| **중복 제거(dedupe)** | 같은 리소스의 같은 문제 반복 | 리소스ID+유형을 키로 잡아 티켓/알림 재사용 |
| **집계 윈도** | 알림의 *개수* | SQS로 모았다가 배치로 한 번 발송 |
| **억제 목록** | 승인된 예외의 반복 알림 | Security Hub 자동화 규칙(day2) 또는 패턴 제외 |
| **티켓 단위 변경** | 핀딩당 티켓 폭증 | **핀딩당이 아니라 리소스당** 티켓 |

마지막 항목이 실무에서 가장 큰 차이를 만든다. 핀딩 하나에 티켓 하나를 만들면 리소스 200개짜리 컨트롤이 실패할 때 티켓이 200개 생긴다. **"이 리소스를 고쳐라"는 티켓 하나에 핀딩 200개를 붙이는 구조**로 바꾸면 담당자가 실제로 처리할 수 있는 단위가 된다.

> ⚠️ **함정**: 집계 윈도를 도입할 때 **모든 등급에 똑같이 적용하는 것**이 함정이다. CRITICAL을 15분 윈도에 넣으면 대응이 15분 늦어진다. 올바른 설계는 **등급별로 다른 시간 축**을 쓰는 것이다 — CRITICAL은 윈도 없이 즉시, HIGH는 짧은 윈도, MEDIUM 이하는 일 단위 요약. 시험에서 "알림을 줄이면서 중대한 위협의 대응 시간은 유지"라는 조건이 붙으면 이 계층적 시간 축이 정답의 형태다.

## EventBridge Scheduler: 주기적 보안 작업

이벤트 반응형 외에, **스케줄 기반** 규칙(또는 EventBridge Scheduler)으로 주기적 보안 작업을 자동화한다. 예: 매일 미사용 액세스 키 점검 Lambda, 분기별 IAM 자격증명 보고서 생성, 주기적 Config 평가 트리거. cron/rate 표현식으로 정의한다.

```bash
# 매일 새벽 미사용·노후 액세스 키 점검
aws scheduler create-schedule \
  --name daily-credential-hygiene \
  --schedule-expression "cron(0 18 * * ? *)" \
  --schedule-expression-timezone "Asia/Seoul" \
  --flexible-time-window '{"Mode":"FLEXIBLE","MaximumWindowInMinutes":15}' \
  --target '{
    "Arn": "arn:aws:lambda:ap-northeast-2:999988887777:function:credential-hygiene",
    "RoleArn": "arn:aws:iam::999988887777:role/SchedulerInvokeLambda",
    "RetryPolicy": { "MaximumRetryAttempts": 2 },
    "DeadLetterConfig": { "Arn": "arn:aws:sqs:ap-northeast-2:999988887777:sched-dlq" }
  }'
```

주기 작업이 보안에서 갖는 위치는 **"이벤트가 발생하지 않는 위험"**을 잡는 것이다. 액세스 키가 오래된 것, MFA가 없는 사용자가 남아 있는 것, 미사용 역할이 방치된 것 — 이런 상태는 아무 이벤트도 만들지 않으므로 반응형 자동화로는 영원히 잡히지 않는다. **반응형은 사건을, 주기형은 상태를 본다.**

> ⚠️ **함정**: 주기 작업 자체가 조용히 죽는 것이 위험하다. 스케줄이 실행되지 않아도 아무 알림이 없기 때문이다. 그래서 주기 보안 작업에는 **"성공적으로 실행됐다"는 신호를 남기고, 그 신호가 끊기면 경보**하는 하트비트가 필요하다(day1의 결측 데이터 `breaching` 알람과 같은 발상). 자동화를 감시하지 않는 자동화는 시간이 지나면 존재하지 않는 것과 같아진다.

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

### 구독자(subscriber)의 두 종류: 이 구분이 시험 포인트다

Security Lake에서 데이터를 소비하는 방법은 둘이고, 둘은 완전히 다른 메커니즘을 쓴다.

| 축 | 쿼리 접근(query access) | 데이터 접근(data access) |
|----|------------------------|--------------------------|
| 소비 방식 | 테이블을 **SQL로 질의** | S3 객체를 **직접 읽어 감** |
| 권한 관리 | **AWS Lake Formation** | S3 + IAM 역할 |
| 알림 | 없음(질의는 당김) | **SQS로 새 객체 알림** |
| 대표 소비자 | 사내 분석가(Athena), QuickSight | 서드파티 SIEM, 자체 파이프라인 |
| 세분화 | 테이블·컬럼·행 수준까지 제어 가능 | 접두사 수준 |

이 표에서 기억할 한 줄은 **"세분화된 접근 제어가 필요하면 Lake Formation 기반 쿼리 접근"**이다. "특정 팀에게는 VPC Flow 로그만 보이고 CloudTrail은 보이지 않게 하라"는 요구가 나오면 답은 Lake Formation 권한이지 S3 버킷 정책이 아니다.

```bash
# 소스 활성화: 어떤 로그를 레이크로 모을 것인가
aws securitylake create-aws-log-source --sources '[{
  "regions": ["ap-northeast-2", "us-east-1"],
  "sourceName": "CLOUD_TRAIL_MGMT",
  "sourceVersion": "2.0"
}]'

# 서드파티 SIEM에 데이터 접근 구독자 등록
aws securitylake create-subscriber \
  --subscriber-name external-siem \
  --access-types S3 \
  --subscriber-identity '{"principal":"444455556666","externalId":"siem-ext-9021"}' \
  --sources '[{"awsLogSource":{"sourceName":"VPC_FLOW","sourceVersion":"2.0"}}]'
```

> 🔍 **더 깊이**: Security Lake의 **롤업 리전(rollup Region)** 개념이 Security Hub의 집계 리전과 헷갈린다. 둘 다 "여러 리전을 한 곳에서"이지만 대상이 다르다 — Security Hub 집계 리전은 *핀딩*을 복사해 오고, Security Lake 롤업 리전은 *정규화된 로그 데이터*를 모은다. 그리고 후자는 리전 간 데이터 전송이 발생하므로 **비용과 데이터 주권(data residency) 양쪽에서 판단이 필요**하다. "규제상 데이터가 특정 리전을 벗어나면 안 된다"는 조건이 붙으면 롤업 리전 구성이 그대로 위반이 될 수 있고, 이 경우 리전별로 레이크를 분리하고 질의만 연합하는 설계가 답이 된다.

> ⚠️ **함정**: Security Lake는 **커스텀 소스(custom source)**를 받아 사내 로그나 온프레미스 데이터도 OCSF로 넣을 수 있다. 여기서 오해가 생긴다 — Security Lake가 *자동으로 변환해 주는 것이 아니라*, 넣는 쪽이 **OCSF 형식으로 만들어서 넣어야** 한다. "온프레미스 방화벽 로그를 Security Lake에 넣으면 알아서 정규화된다"는 서술은 틀렸다. AWS 네이티브 소스만 자동 정규화되고, 그 밖은 변환 책임이 소비자 쪽에 있다.

## 세 가지 "자동으로 무언가 하기"의 구분

시험이 헷갈리게 만드는 삼각형이 있다. 셋 다 "조건이 맞으면 뭔가 한다"이지만 작동 지점이 다르다.

| 축 | CloudWatch 알람 | Security Hub 자동화 규칙 | EventBridge 규칙 |
|----|-----------------|--------------------------|-----------------|
| 입력 | 메트릭(숫자) | 들어오는 핀딩 | 이벤트 |
| 조건 | 임계·통계 | 핀딩 필드(계정·태그·심각도) | 이벤트 패턴 |
| 할 수 있는 일 | SNS·SSM OpsItem·EC2/ASG 액션 | **핀딩 필드 갱신만**(억제·심각도 조정) | **외부 리소스 조작 전부** |
| 할 수 없는 일 | 이벤트 원본 맥락 활용 | **외부 리소스 변경** | 임계·집계(횟수 세기) |
| 소급 적용 | 불가 | **불가**(과거 핀딩은 별도 API) | 불가(아카이브 재생은 가능) |
| 전형적 용도 | "N회 이상 발생하면 알려라" | "이 계정의 이 유형은 접어라" | "이 핀딩이 오면 격리해라" |

> ⚠️ **함정**: "Security Hub 자동화 규칙으로 노출된 보안 그룹을 수정한다"는 보기는 오답이다. 자동화 규칙은 **Security Hub 안에서 핀딩의 필드만** 바꾼다. 실제 리소스를 고치는 것은 EventBridge → Lambda/SSM Automation의 일이다. 반대로 "EventBridge로 로그인 실패 5회를 세어 알린다"도 오답이다 — EventBridge는 개별 이벤트를 라우팅할 뿐 횟수를 세지 않으며, 집계는 CloudWatch 알람의 일이다. **"필드를 바꾸는가 / 리소스를 바꾸는가 / 횟수를 세는가"** 세 질문이 이 삼각형을 가른다.

## 정리하며

EventBridge는 탐지 신호를 의미에 따라 알림·교정·오케스트레이션으로 분배하는 라우터다. 오늘 내용을 한 문장으로 줄이면 **"신호는 패턴으로 고르고, 대응은 가역성으로 나누고, 전달은 멱등·DLQ·아카이브로 지킨다"**이다.

세부를 잊더라도 남겨야 할 판단 기준은 넷이다.

1. **스키마는 어디서 잡느냐에 따라 다르다.** GuardDuty 직접 경로는 숫자 severity, Security Hub 경유는 라벨. 그리고 탐지기가 늘어날 것을 안다면 집계 경유가 옳다.
2. **가역적인 것만 무인으로 돌린다.** 종료·삭제는 사람을 거치고, 그 승인 흐름의 타임아웃 기본값은 "에스컬레이션"이어야 한다.
3. **조용한 실패를 감시한다.** 크로스계정 권한 누락, DLQ 적체, 주기 작업 중단 — 셋 다 아무 오류 없이 파이프라인을 멈춘다.
4. **알림은 등급별로 다른 시간 축을 갖는다.** 집계 윈도를 일괄 적용하면 중대한 위협의 대응이 그만큼 늦어진다.

그리고 Security Lake는 이 자동화 위에 얹히는 **저장·분석 계층의 표준화**다. Security Hub가 *핀딩*을 ASFF로 통일한다면 Security Lake는 *원시 로그*를 OCSF로 통일한다 — 두 정규화의 대상이 다르다는 것이 시험에서 가장 자주 확인되는 구분이다. day5에서 week8의 네 날을 하나의 파이프라인으로 다시 통과시킨다.

## 한 줄 요약 체크리스트

- [ ] 이벤트 패턴에서 GuardDuty는 `numeric`, Security Hub는 `Label`로 심각도를 다뤘는가
- [ ] 넓게 잡히는 시험용 규칙이 남아 있지 않은가(규칙은 대체가 아니라 누적된다)
- [ ] 무인 자동화에 비가역 조치(종료·삭제)를 넣지 않았는가
- [ ] 승인 게이트의 타임아웃 기본 동작이 에스컬레이션인가
- [ ] 크로스계정 전달에 **양쪽 권한**(버스 리소스 정책 + 전달 역할)을 모두 구성했는가
- [ ] 모든 대상에 재시도 정책과 DLQ를 붙였고, DLQ 적체를 알람으로 감시하는가
- [ ] 아카이브를 켜서 핸들러 수정 후 재생이 가능하게 해 두었는가(그리고 핸들러는 멱등한가)
- [ ] 등급별로 다른 시간 축(즉시/짧은 윈도/일 단위 요약)을 적용했는가
- [ ] 티켓을 핀딩당이 아니라 **리소스당** 만들고 있는가
- [ ] Security Lake 구독자에게 세분화 권한이 필요하면 Lake Formation 기반 쿼리 접근을 썼는가

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
