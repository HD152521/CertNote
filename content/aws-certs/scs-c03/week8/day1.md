# Day 1 - CloudWatch: 로그 그룹·지표 필터·알람, 비정상 탐지, 보안 이벤트 알림

로그를 "쌓는 것"과 "감지하는 것"은 전혀 다른 문제다. CloudTrail이 무슨 일이 일어났는지 기록한다면, Amazon CloudWatch는 그 기록을 **수치화하고, 임계를 정의하고, 임계를 넘는 순간 사람을 깨우는** 운영 평면이다. 보안 시험의 관점에서 CloudWatch는 단순 모니터링 도구가 아니라 "텍스트 로그 → 메트릭 → 알람 → 자동 대응"으로 이어지는 탐지 파이프라인의 첫 변환기다. 이 변환의 메커니즘 — 로그가 어떻게 숫자가 되고, 숫자가 어떻게 경보가 되는지 — 을 정확히 아는 것이 핵심이다.

week7에서 CloudTrail이 *무엇을 어떻게 기록하는가*를, 그리고 그 레코드를 어떻게 읽는가를 다뤘다. 이번 주는 방향이 반대다. **이미 쌓인 로그를 질의와 알림으로 바꾸는 배관**을 짓는다. 오늘은 그 배관의 첫 구간 — 로그 그룹에 들어온 텍스트가 메트릭이 되고, 메트릭이 알람이 되고, 알람이 사람과 자동화로 갈라지는 구간 — 을 끝까지 따라간다.

```
[ Week 8이 짓는 배관 전체. 오늘(day1)은 굵게 표시한 구간 ]

  로그 원천              수집·저장              질의·변환               알림·대응
 ┌──────────┐        ┌──────────────┐      ┌────────────────┐     ┌──────────────┐
 │CloudTrail│───┬───▶│CloudWatch Logs│═══▶ │**Metric Filter**│════▶│**Alarm**     │
 │VPC Flow  │   │    │ (로그 그룹)   │      │**Logs Insights**│     │ (임계·N of M)│
 │앱/ELB/R53│   │    └──────┬────────┘      └────────────────┘     └──────┬───────┘
 └──────────┘   │           │ Subscription Filter                        │
                │           ▼                                            ▼
                │      Firehose/Lambda ──▶ OpenSearch (day3)      **SNS 토픽**
                │                                                   ├─ 사람(메일/Slack/온콜)
                └──▶ S3 아카이브 ──▶ Athena (day3)                  └─ 기계(Lambda/SSM, day4)
                          │
                          └──▶ Security Lake / Security Hub (day2·day4)
```

이 그림에서 오늘 다루는 구간의 특징은 하나다 — **가장 싸고 가장 빠르지만, 가장 좁다.** 단일 로그 그룹 안의 패턴 하나를 숫자로 바꿔 임계를 거는 일에는 CloudWatch를 이길 것이 없다. 반대로 "서로 다른 소스의 신호를 엮어라"는 요구가 나오는 순간 CloudWatch의 영역이 아니다. 이 경계를 정확히 아는 것이 시험에서 도구를 고르는 기준이 된다.

> 📚 **사례**: 침해 사후 보고서에서 반복적으로 지적되는 실패는 "탐지기가 없었다"가 아니라 **"경보는 울렸는데 아무도 행동하지 않았다"**다. 2013년 미국 소매업체 Target의 결제 시스템 침해가 그 대표 사례로 널리 인용된다 — 침해 당시 보안 모니터링 도구가 이상을 감지해 경보를 발생시켰지만, 쏟아지는 경보 속에서 그 신호가 실질적인 대응으로 이어지지 않았다는 점이 미 상원 상무위원회 보고서 등을 통해 공개적으로 지적됐다. 이 교훈이 오늘 내용에 주는 함의는 분명하다. **알람을 만드는 능력과 알람을 운영 가능하게 유지하는 능력은 다른 기술이다.** 필터 패턴을 정확히 쓰는 것만큼이나, 무엇을 알람으로 만들지 *말지*를 정하고 심각도별로 경로를 나누는 설계가 중요하다. 이 문서 후반의 "알림 피로 관리" 절이 그 이야기를 다룬다.

## CloudWatch의 두 평면: Logs와 Metrics

CloudWatch는 성격이 다른 두 데이터 모델을 한 이름 아래 묶고 있다.

- **CloudWatch Logs**: 비정형/반정형 *텍스트* 로그 이벤트의 저장·검색. 로그 그룹(log group) → 로그 스트림(log stream) → 로그 이벤트(log event)의 3단 계층.
- **CloudWatch Metrics**: 시간에 따른 *숫자* 시계열. 네임스페이스(namespace) → 메트릭(metric) + 디멘션(dimension) → 데이터포인트.

이 둘을 잇는 다리가 **Metric Filter**다. 로그 텍스트에서 패턴을 추출해 숫자 메트릭을 만든다. 보안 탐지의 거의 모든 시나리오가 이 다리를 건넌다.

```
로그 이벤트(텍스트) ──[Metric Filter]──▶ 커스텀 메트릭(숫자) ──[Alarm]──▶ SNS/액션
```

> 💡 **관련 이론**: 이 구조는 SIEM(Security Information and Event Management)의 고전적 파이프라인 — collect → normalize → correlate → alert — 의 AWS 네이티브 최소 구현이다. CloudWatch는 단일 로그 그룹 내 패턴 매칭까지를 담당하고(상관분석은 약함), 다중 소스 상관·정규화는 Security Hub/OpenSearch가 맡는다. 즉 CloudWatch 알람은 "단일 신호 임계 탐지"에 강하고 "다중 신호 상관 탐지"에는 약하다는 경계를 기억해야 한다.

## 로그 그룹: 보존, 암호화, 접근

로그 그룹은 보존·암호화·권한의 단위다. 보안에서 놓치기 쉬운 세 가지 속성이 있다.

- **Retention(보존 기간)**: 기본값은 "Never expire"(무기한). 명시적으로 설정하지 않으면 비용이 무한 증가한다. 1일~10년 또는 무기한.
- **KMS 암호화**: 로그 그룹은 KMS CMK로 암호화할 수 있다. 단, CloudWatch Logs 서비스 주체가 해당 키를 사용할 수 있도록 **키 정책**에 권한을 부여해야 한다(IAM 정책만으로는 부족 — 키 정책이 게이트다).
- **Resource Policy**: 다른 서비스(예: Route 53, VPC, CloudTrail)가 로그를 *쓸* 수 있게 하려면 로그 그룹의 리소스 정책에 해당 서비스 주체를 허용해야 한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "logs.ap-northeast-2.amazonaws.com" },
    "Action": ["kms:Encrypt*","kms:Decrypt*","kms:ReEncrypt*","kms:GenerateDataKey*","kms:Describe*"],
    "Resource": "*",
    "Condition": {
      "ArnLike": { "kms:EncryptionContext:aws:logs:arn": "arn:aws:logs:ap-northeast-2:111122223333:log-group:*" }
    }
  }]
}
```

> ⚠️ **함정**: 로그 그룹에 KMS 키를 붙였는데 로그가 들어오지 않거나 `associate-kms-key` 호출이 실패한다면, 거의 항상 *키 정책*에 `logs.<region>.amazonaws.com` 서비스 주체 권한이 빠진 경우다. IAM 사용자/역할 권한과 KMS 키 정책은 별개의 게이트이며, KMS는 두 게이트를 *모두* 통과해야 접근을 허용한다.

위 키 정책에서 눈여겨볼 것은 `Resource: "*"`가 아니라 **`Condition` 블록**이다. 키 정책 문서 안에서 `Resource: "*"`는 "이 키"를 뜻하므로 넓은 권한이 아니다. 반면 `kms:EncryptionContext:aws:logs:arn` 조건이 없으면 *그 리전의 어떤 로그 그룹이든* 이 키로 암호화할 수 있게 되어, 다른 팀이 자기 로그를 우리 키에 붙여 놓고 키 삭제를 막는 상황이 생긴다. 암호화 컨텍스트로 범위를 좁히는 것이 이 정책의 요점이다.

### 로그 그룹에서 자주 빠뜨리는 두 가지 보안 설정

**데이터 보호 정책(Data Protection)** — 애플리케이션 로그에 신용카드 번호·주민등록 성격의 식별자·액세스 키가 섞여 들어가는 일은 흔하다. 한 번 로그에 들어간 민감정보는 그 로그를 볼 수 있는 모두에게 노출되고, 로그는 대개 개발자 다수가 본다. CloudWatch Logs의 데이터 보호 정책은 지정한 데이터 식별자를 **수집 시점에 마스킹**하고, 마스킹 해제(`logs:Unmask`)를 별도 권한으로 분리한다.

```bash
aws logs put-data-protection-policy \
  --log-group-identifier /aws/lambda/payment-service \
  --policy-document '{
    "Name": "mask-sensitive",
    "Version": "2021-06-01",
    "Statement": [
      {
        "Sid": "audit",
        "DataIdentifier": [
          "arn:aws:dataprotection::aws:data-identifier/CreditCardNumber",
          "arn:aws:dataprotection::aws:data-identifier/AwsSecretKey"
        ],
        "Operation": { "Audit": { "FindingsDestination": {
          "S3": { "Bucket": "sec-dataprotection-findings" } } } }
      },
      {
        "Sid": "mask",
        "DataIdentifier": [
          "arn:aws:dataprotection::aws:data-identifier/CreditCardNumber",
          "arn:aws:dataprotection::aws:data-identifier/AwsSecretKey"
        ],
        "Operation": { "Deidentify": { "MaskConfig": {} } }
      }
    ]
  }'
```

두 개의 Statement가 짝으로 움직이는 구조에 주목하라. `Audit`은 "무엇이 몇 건 발견됐는지"를 별도 목적지로 보내고, `Deidentify`는 실제 마스킹을 한다. 감사 없이 마스킹만 걸면 *민감정보가 계속 흘러들고 있다는 사실 자체*를 모르게 된다 — 마스킹은 증상 완화이지 원인 제거가 아니고, 원인은 애플리케이션 코드에 있다.

**로그 클래스(Log Class)** — 로그 그룹은 표준 클래스 외에 저빈도 접근(Infrequent Access) 클래스를 고를 수 있다. 저장 단가가 낮은 대신 **지표 필터·구독 필터·알람 같은 실시간 기능을 쓸 수 없고** 질의 위주로만 쓴다. 여기서 보안적으로 중요한 판단이 갈린다.

| 로그의 용도 | 적합한 클래스 | 이유 |
|-------------|--------------|------|
| 탐지 대상(루트 사용, 로그인 실패 등 알람을 걸 로그) | 표준 | 지표 필터·알람이 필수 |
| 사후 조사용 대량 로그(디버그·접근 로그) | 저빈도 접근 | 질의만 하면 되고 볼륨이 크다 |
| 장기 보존이 목적(규정 준수 아카이브) | CloudWatch Logs가 아니라 **S3** | 저장 단가·수명주기·객체 잠금 |

> ⚠️ **함정**: "비용을 줄이려고 로그 클래스를 낮췄더니 알람이 사라졌다"는 상황이 실제로 생긴다. 탐지 경로에 걸린 로그 그룹은 절대 저빈도 클래스로 내리면 안 된다. 같은 논리로, **보존만이 목적인 로그를 CloudWatch Logs에 무기한 두는 것도 오답**이다 — 구독 필터나 S3 내보내기로 아카이브를 분리하고, CloudWatch 쪽 보존은 탐지·조사에 필요한 기간(예: 수십 일)으로 끊는 것이 표준 설계다.

> 🔍 **더 깊이**: 로그 그룹의 보존 기간을 "무기한"으로 두는 것은 비용 문제만이 아니다. **법적 노출**의 문제이기도 하다. 소송·규제 조사에서 보유한 로그는 제출 대상이 되므로, 필요 이상으로 오래 남긴 로그는 그 자체가 부채가 될 수 있다. 반대로 규정이 요구하는 기간보다 짧게 지우면 준수 위반이다. 즉 보존 기간은 "얼마나 오래 필요한가"가 아니라 **"어떤 규정이 얼마를 요구하고, 그 이상은 왜 남기는가"**를 문서로 답할 수 있어야 정해진다. 시험에서 "로그 보존 정책"을 묻는 문항이 대체로 규정 준수 문맥에 놓이는 이유가 이것이다.

## Metric Filter: 텍스트를 숫자로

Metric Filter는 로그 그룹에 들어오는 *새* 이벤트에 필터 패턴을 적용해, 매칭될 때마다 지정한 메트릭에 값을 기록한다. 두 가지 패턴 문법이 있다.

- **공백 구분(space-delimited) / 텍스트 패턴**: `?ERROR ?WARN`처럼 단어를 찾는다.
- **JSON 패턴**: 구조화된 JSON 로그(예: CloudTrail)에서 `{ $.eventName = "ConsoleLogin" }`처럼 필드를 평가한다.

보안 탐지의 핵심은 CloudTrail 로그를 CloudWatch Logs로 보낸 뒤(CloudTrail → CloudWatch Logs 통합), JSON 패턴으로 위험 API 호출을 잡는 것이다.

```
# 루트 계정 사용 탐지 (CIS 권장 알람)
{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }

# 콘솔 로그인 실패 탐지
{ ($.eventName = "ConsoleLogin") && ($.errorMessage = "Failed authentication") }

# 권한 없는 API 호출(AccessDenied) 탐지
{ ($.errorCode = "*UnauthorizedOperation") || ($.errorCode = "AccessDenied*") }

# IAM 정책 변경 탐지
{ ($.eventName = "DeleteGroupPolicy") || ($.eventName = "DeleteRolePolicy") ||
  ($.eventName = "PutGroupPolicy") || ($.eventName = "AttachRolePolicy") ||
  ($.eventName = "DetachRolePolicy") || ($.eventName = "CreatePolicyVersion") }
```

Metric Filter에는 두 가지 중요한 설정이 있다.

- **metricValue**: 매칭 시 기록할 값. 단순 카운트면 `1`. 로그 필드 값을 그대로 쓰려면 `$.bytes`처럼 참조.
- **defaultValue**: 매칭이 없는 기간에 기록할 값. 이걸 `0`으로 설정하지 않으면 매칭이 없는 구간은 데이터포인트 자체가 *비어버려*, 알람이 `INSUFFICIENT_DATA`로 빠지거나 평가가 흔들린다.

```bash
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-trail \
  --filter-name RootAccountUsage \
  --filter-pattern '{ $.userIdentity.type = "Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != "AwsServiceEvent" }' \
  --metric-transformations \
    metricName=RootAccountUsageCount,metricNamespace=CISBenchmark,metricValue=1,defaultValue=0
```

> 🎯 **시나리오**: "루트 계정이 사용될 때 즉시 알림"은 시험 빈출이며 CIS AWS Foundations Benchmark 통제 항목이다. 정답 경로는 (1) CloudTrail을 *모든 리전*에서 활성화하고 CloudWatch Logs로 전송 → (2) Metric Filter로 루트 사용 패턴 매칭 → (3) 1 이상이면 발동하는 Alarm → (4) SNS 토픽으로 알림. EventBridge 규칙으로도 가능하지만, CIS 벤치마크와 Security Hub의 컨트롤은 Metric Filter+Alarm 경로를 기대한다.

### CIS 모니터링 세트: 실제로 만들어야 하는 알람 전부

CIS AWS Foundations Benchmark의 모니터링 섹션(버전에 따라 3.x 또는 4.x로 번호가 다르다)은 "이 열몇 가지는 지표 필터와 알람으로 감시하라"를 구체적으로 지정한다. Security Hub의 CIS 표준을 켜면 이 항목들이 컨트롤로 평가되므로, 각 필터 패턴은 사실상 시험 범위이자 실무 체크리스트다. 아래는 그 전체 세트를 하나의 표와 패턴 묶음으로 정리한 것이다.

| 감시 대상 | 왜 이것을 보는가 | 핵심 매칭 필드 |
|-----------|-----------------|----------------|
| 권한 없는 API 호출 | 탈취 자격증명의 **권한 열거 정찰** 흔적 | `errorCode` = `*UnauthorizedOperation` / `AccessDenied*` |
| MFA 없는 콘솔 로그인 | 정책 위반 + 자격증명 단독 탈취 가능성 | `additionalEventData.MFAUsed` |
| 루트 계정 사용 | 최고 권한의 비정상 사용. 단 한 번도 정상이 아님 | `userIdentity.type` = `Root` |
| IAM 정책 변경 | 권한 상승(privilege escalation)의 직접 흔적 | `eventName` = `Put*Policy` / `Attach*` / `CreatePolicyVersion` |
| CloudTrail 구성 변경 | **로깅 무력화** — 공격의 사전 준비 단계 | `StopLogging` / `DeleteTrail` / `UpdateTrail` |
| 콘솔 인증 실패 | 자격증명 스터핑·브루트포스 | `errorMessage` = `Failed authentication` |
| CMK 비활성화·삭제 예약 | **데이터 인질(랜섬)** 또는 증거 파괴 | `DisableKey` / `ScheduleKeyDeletion` |
| S3 버킷 정책 변경 | 데이터 공개 노출로 가는 가장 짧은 경로 | `PutBucketPolicy` / `PutBucketAcl` / `Delete*` |
| Config 구성 변경 | 컴플라이언스 평가 무력화 | `StopConfigurationRecorder` / `DeleteDeliveryChannel` |
| 보안 그룹 변경 | 네트워크 경계 개방 | `AuthorizeSecurityGroupIngress` 등 |
| NACL 변경 | 서브넷 경계 개방 | `CreateNetworkAclEntry` 등 |
| 네트워크 게이트웨이 변경 | 인터넷 경로 신설 | `CreateInternetGateway` / `AttachInternetGateway` |
| 라우트 테이블 변경 | **트래픽 우회·유출 경로** 신설 | `CreateRoute` / `ReplaceRoute` |
| VPC 변경 | 네트워크 토폴로지 자체의 변형 | `CreateVpc` / `CreateVpcPeeringConnection` 등 |
| 조직(Organizations) 변경 | SCP 무력화·계정 이탈 | `DetachPolicy` / `LeaveOrganization` / `MoveAccount` |

이 목록에는 관통하는 논리가 있다. **위쪽 절반은 "권한이 어떻게 움직였나", 아래쪽 절반은 "경계가 어떻게 열렸나"**다. 그리고 그 사이에 CloudTrail·Config·KMS 항목이 끼어 있는데, 이 셋은 성격이 다르다 — **감시 장치 자체를 끄는 행위**를 감시하는 항목이다. 공격자 입장에서 이 셋은 "본격적인 작업 전에 먼저 처리해야 할 일"이므로, 실무에서 이 세 알람은 다른 어떤 항목보다 심각도를 높게 잡는다.

```
# 권한 없는 API 호출 (정찰 탐지)
{ ($.errorCode = "*UnauthorizedOperation") || ($.errorCode = "AccessDenied*") }

# MFA 없는 콘솔 로그인 (성공한 것만)
{ ($.eventName = "ConsoleLogin") && ($.additionalEventData.MFAUsed != "Yes")
  && ($.userIdentity.type = "IAMUser") && ($.responseElements.ConsoleLogin = "Success") }

# CloudTrail 구성 변경 — 로깅 무력화 시도
{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail)
  || ($.eventName = StartLogging) || ($.eventName = StopLogging) }

# KMS CMK 비활성화 / 삭제 예약 — 데이터 인질·증거 파괴
{ ($.eventSource = kms.amazonaws.com)
  && (($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion)) }

# S3 버킷 정책·ACL 변경
{ ($.eventSource = s3.amazonaws.com) &&
  (($.eventName = PutBucketAcl) || ($.eventName = PutBucketPolicy) ||
   ($.eventName = PutBucketCors) || ($.eventName = PutBucketReplication) ||
   ($.eventName = DeleteBucketPolicy) || ($.eventName = DeleteBucketReplication)) }

# AWS Config 무력화
{ ($.eventSource = config.amazonaws.com) &&
  (($.eventName = StopConfigurationRecorder) || ($.eventName = DeleteDeliveryChannel) ||
   ($.eventName = PutDeliveryChannel) || ($.eventName = PutConfigurationRecorder)) }

# 보안 그룹 변경
{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) ||
  ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) ||
  ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }

# 라우트 테이블 변경 — 트래픽 우회 경로 신설
{ ($.eventName = CreateRoute) || ($.eventName = CreateRouteTable) ||
  ($.eventName = ReplaceRoute) || ($.eventName = ReplaceRouteTableAssociation) ||
  ($.eventName = DeleteRouteTable) || ($.eventName = DeleteRoute) ||
  ($.eventName = DisassociateRouteTable) }

# 네트워크 게이트웨이 변경 — 인터넷 경로 신설
{ ($.eventName = CreateCustomerGateway) || ($.eventName = DeleteCustomerGateway) ||
  ($.eventName = AttachInternetGateway) || ($.eventName = CreateInternetGateway) ||
  ($.eventName = DeleteInternetGateway) || ($.eventName = DetachInternetGateway) }

# Organizations 변경 — SCP 무력화·계정 이탈
{ ($.eventSource = organizations.amazonaws.com) &&
  (($.eventName = "DetachPolicy") || ($.eventName = "DeletePolicy") ||
   ($.eventName = "LeaveOrganization") || ($.eventName = "MoveAccount") ||
   ($.eventName = "DisablePolicyType") || ($.eventName = "RemoveAccountFromOrganization")) }
```

### 필터 패턴 문법의 함정 세 가지

**(1) 문자열 인용의 비대칭.** JSON 패턴에서 값은 `$.eventName = CreateTrail`처럼 따옴표 없이 써도 되고 `"CreateTrail"`처럼 써도 된다. 그러나 **와일드카드(`*`)를 쓰려면 반드시 따옴표로 감싸야** 한다 — `$.errorCode = AccessDenied*`는 의도대로 동작하지 않는다. 위 패턴들에서 `errorCode` 쪽만 따옴표가 붙어 있는 이유가 이것이다.

**(2) 존재하지 않는 필드는 매칭 실패다.** `$.additionalEventData.MFAUsed != "Yes"`는 그 필드가 *존재하고 값이 Yes가 아닐 때* 참이다. 필드 자체가 없는 이벤트는 매칭되지 않는다. 그래서 "MFA 없는 로그인"을 잡을 때는 `userIdentity.type = "IAMUser"`와 `responseElements.ConsoleLogin = "Success"` 조건을 함께 걸어 *비교 가능한 형태의 이벤트*로 대상을 좁힌다. 페더레이션 로그인처럼 이 필드가 다른 형태로 들어오는 경우까지 한 패턴으로 잡으려다 아무것도 못 잡는 실수가 흔하다.

**(3) 패턴이 맞아도 로그가 없으면 소용없다.** `errorCode` 계열 패턴은 CloudTrail 관리 이벤트가 CloudWatch Logs로 들어와야 성립한다. trail이 S3로만 가고 있으면 지표 필터는 영원히 0이다. 시험 지문에서 "알람이 발동하지 않는다"의 원인은 필터 문법보다 **경로 미구성**인 경우가 더 많다.

### 만드는 법: 필터 하나, 알람 하나가 한 벌

```bash
# 1) 지표 필터 — 로그 텍스트를 숫자로
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-trail \
  --filter-name CloudTrailConfigChanges \
  --filter-pattern '{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) ||
                      ($.eventName = DeleteTrail) || ($.eventName = StartLogging) ||
                      ($.eventName = StopLogging) }' \
  --metric-transformations \
    metricName=CloudTrailConfigChangeCount,metricNamespace=CISBenchmark,metricValue=1,defaultValue=0

# 2) 알람 — 숫자를 경보로 (한 번이라도 발생하면)
aws cloudwatch put-metric-alarm \
  --alarm-name CIS-CloudTrailConfigChanges \
  --alarm-description "CloudTrail 구성 변경 감지 — 로깅 무력화 시도 가능성" \
  --namespace CISBenchmark --metric-name CloudTrailConfigChangeCount \
  --statistic Sum --period 300 \
  --evaluation-periods 1 --datapoints-to-alarm 1 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-critical
```

> ⚠️ **함정**: **지표 필터는 소급 적용되지 않는다.** 필터를 만든 시점 이후에 로그 그룹으로 들어오는 이벤트에만 적용되며, 이미 저장된 과거 로그를 되짚어 메트릭을 만들지 않는다. "지난달 로그에서 루트 사용을 세어 보라"는 요구에 지표 필터를 만드는 것은 오답이고, 그건 Logs Insights나 Athena(day3)의 일이다. 지표 필터 = *앞으로 오는 것을 감시*, 질의 도구 = *이미 온 것을 조사* — 이 시간 방향의 구분이 week8 전체를 관통하는 축이다.

> 🔍 **더 깊이**: 지표 필터의 `metricTransformations`에는 **디멘션(dimensions)**을 붙일 수 있다. 예를 들어 로그인 실패 카운트에 `$.userIdentity.userName`을 디멘션으로 붙이면 "누구의" 실패인지까지 메트릭으로 분리된다. 유혹적이지만 위험한 기능이다 — 디멘션 값의 종류만큼 *별개의 커스텀 메트릭*이 생성되고 각각 과금되기 때문에, 공격자가 임의의 사용자명으로 로그인을 시도하면 **카디널리티 폭발**이 일어나 비용이 치솟는다. 즉 공격자가 우리 청구서를 조종할 수 있게 된다. 원칙은 이렇다: **디멘션에는 공격자가 제어할 수 없는 값만 쓴다.** 계정 ID·리전은 안전하고, 사용자명·IP·User-Agent는 위험하다. "누가"를 알아야 한다면 메트릭이 아니라 질의(Logs Insights)로 답할 문제다.

## Alarm: 임계, 평가 기간, 결측 데이터 처리

CloudWatch Alarm은 메트릭을 주기적으로 평가해 세 상태(`OK`, `ALARM`, `INSUFFICIENT_DATA`) 중 하나로 둔다. 보안 알람에서 결정적인 파라미터들:

- **Period**: 데이터포인트 집계 주기(예: 300초).
- **Evaluation Periods (M)** / **Datapoints to Alarm (N)**: 최근 M개 기간 중 N개가 임계를 넘으면 ALARM("N of M" 평가). 노이즈를 줄이려 N<M을 쓴다.
- **Statistic**: `Sum`, `Average`, `Maximum` 등. 보안 카운트 탐지는 보통 `Sum`을 쓴다(특정 기간 동안 몇 번 발생했나).
- **Treat Missing Data**: `notBreaching`(정상 취급), `breaching`(위반 취급), `ignore`, `missing`(기본). 보안 탐지에서는 "데이터가 없으면 정상"이 맞는 경우(`notBreaching`)와 "데이터가 끊긴 것 자체가 이상"인 경우(`breaching`)를 구분해야 한다.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name RootAccountUsageAlarm \
  --namespace CISBenchmark --metric-name RootAccountUsageCount \
  --statistic Sum --period 300 \
  --evaluation-periods 1 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:security-alerts
```

> ⚠️ **함정**: `Statistic`을 잘못 고르면 탐지가 무력화된다. 로그인 실패 5회 같은 카운트를 `Average`로 평가하면(예: 5분 동안 평균 0.x) 임계 5를 절대 넘지 못한다. 카운트 기반 보안 탐지는 반드시 `Sum`이어야 한다. 또한 `defaultValue=0`을 metric filter에 설정하지 않으면 결측 구간이 생겨 알람이 흔들린다 — 두 설정은 짝으로 움직인다.

### 결측 데이터 처리: 보안에서 가장 오해받는 설정

`treat-missing-data`는 "데이터포인트가 없는 기간을 어떻게 볼 것인가"를 정한다. 네 값의 의미와 **보안에서의 올바른 선택**은 다음과 같다.

| 값 | 결측 기간의 해석 | 보안에서 언제 쓰나 |
|----|-----------------|-------------------|
| `notBreaching` | 정상으로 취급 | **이벤트 탐지 알람의 기본 선택.** 루트 사용·정책 변경처럼 "평소엔 아무 일도 없는 것이 정상"인 지표 |
| `breaching` | 위반으로 취급 | **하트비트(생존 확인) 알람.** "로그가 계속 들어오고 있는가"를 감시할 때 — 데이터가 끊긴 것 자체가 사고 |
| `missing` (기본값) | 이전 상태 유지, 전부 결측이면 INSUFFICIENT_DATA | 애매하다. 보안 알람에서는 명시적 선택을 권장 |
| `ignore` | 결측을 무시하고 마지막 상태 유지 | 플래핑을 막고 싶을 때. ALARM이 자동 해제되지 않는 점에 주의 |

두 번째 행이 시험과 실무 모두에서 결정적이다. **"로그 수집이 멈춘 것"은 그 자체로 보안 사건**이다. 공격자가 로깅을 끄거나, 에이전트가 죽거나, 로그 전달 역할의 권한이 회수되면 — 탐지 알람들은 모두 조용해지고, 조용한 대시보드는 "안전하다"처럼 보인다. 이 침묵을 깨는 유일한 장치가 하트비트 알람이다.

```bash
# 하트비트: CloudTrail 로그가 5분 이상 끊기면 경보
# (전체 이벤트를 세는 지표 필터를 별도로 하나 둔다)
aws logs put-metric-filter \
  --log-group-name /aws/cloudtrail/org-trail \
  --filter-name AllEventsHeartbeat \
  --filter-pattern '{ $.eventVersion = "*" }' \
  --metric-transformations \
    metricName=TrailEventHeartbeat,metricNamespace=CISBenchmark,metricValue=1

aws cloudwatch put-metric-alarm \
  --alarm-name CloudTrailDeliveryStopped \
  --alarm-description "CloudTrail 로그 유입 중단 — 로깅 무력화 또는 파이프라인 장애" \
  --namespace CISBenchmark --metric-name TrailEventHeartbeat \
  --statistic Sum --period 300 \
  --evaluation-periods 2 --datapoints-to-alarm 2 --threshold 1 \
  --comparison-operator LessThanThreshold \
  --treat-missing-data breaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-critical
```

이 알람에서만은 `defaultValue`를 **설정하지 않는다.** 이유가 중요하다 — `defaultValue=0`을 주면 로그가 끊겨도 0이라는 데이터포인트가 계속 생성되어, 결측이 발생하지 않고 따라서 `breaching`이 절대 트리거되지 않는다. 다만 이 경우 `LessThanThreshold 1`이 대신 발동하므로 결과적으로는 잡힌다. 두 경로를 다 열어 두려면 결측 처리를 `breaching`으로 두고 `defaultValue`는 생략하는 조합이 안전하다. **다른 모든 알람과 정확히 반대의 설정**이라는 점이 이 알람의 정체성이다.

### N of M: 오탐과 놓침 사이의 눈금

`--evaluation-periods M`과 `--datapoints-to-alarm N`의 조합이 알람의 성격을 결정한다.

```
N=1, M=1  →  한 번이라도 발생하면 즉시     (루트 사용, CMK 삭제 예약, CloudTrail 중지)
N=1, M=3  →  최근 3구간 중 한 번이라도     (간헐적이지만 놓치면 안 되는 신호)
N=3, M=3  →  3구간 연속으로 지속되어야     (지속적 브루트포스 — 단발 오타는 무시)
N=2, M=5  →  최근 5구간 중 2번            (산발적 반복 패턴. 노이즈 내성이 가장 높다)
```

판단 기준은 단순하다. **"단 한 번의 발생이 그 자체로 사건인가?"** 루트 로그인은 한 번이 사건이므로 N=1/M=1이다. 반면 콘솔 로그인 실패 한 번은 사건이 아니라 일상이므로, 임계값(예: 5회)과 지속성(N=2/M=3) 양쪽으로 노이즈를 걸러야 한다. 이 판단을 생략하고 모든 알람을 N=1/M=1로 만들면 며칠 안에 아무도 알림을 읽지 않게 된다.

### 복합 알람(Composite Alarm): 신호를 조합해 정밀도를 올린다

CloudWatch는 단일 지표 임계에 강하고 다중 신호 상관에 약하다고 앞서 말했지만, **복합 알람**은 그 한계를 부분적으로 메운다. 여러 알람의 상태를 불리언 식으로 묶어 새 알람을 만든다.

```bash
# 두 신호가 동시에 켜졌을 때만 온콜 호출 — 단독 발생은 각각 낮은 등급으로 흘린다
aws cloudwatch put-composite-alarm \
  --alarm-name SUSPECTED-ACCOUNT-COMPROMISE \
  --alarm-description "권한 열거 정찰 + 정책 변경이 동시에 관측됨" \
  --alarm-rule "ALARM(CIS-UnauthorizedAPICalls) AND ALARM(CIS-IAMPolicyChanges)" \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-oncall-page
```

복합 알람의 또 다른 얼굴이 **액션 억제기(actions suppressor)**다. 계획된 배포나 점검 창 동안 하위 알람이 울려도 액션을 억제한다.

```bash
aws cloudwatch put-composite-alarm \
  --alarm-name PROD-NetworkChangeAlarm \
  --alarm-rule "ALARM(CIS-SecurityGroupChanges) OR ALARM(CIS-RouteTableChanges)" \
  --actions-suppressor ChangeWindowActive \
  --actions-suppressor-wait-period 60 \
  --actions-suppressor-extension-period 120 \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-high
```

> ⚠️ **함정**: 억제기는 **알람 상태를 바꾸지 않고 액션만 막는다.** 즉 억제 중에도 알람은 ALARM으로 기록되므로 사후에 "그 창 동안 무슨 변경이 있었나"를 되짚을 수 있다. 이 성질이 중요한 이유는, 억제를 "탐지를 끄는 것"과 혼동하는 설계가 흔하기 때문이다. 변경 창 동안 지표 필터를 삭제하거나 알람을 비활성화하면 그 구간은 **영구 공백**이 되고, 공격자가 변경 창을 노리면 아무 흔적도 남지 않는다. 억제는 *알림*을 줄이는 장치이지 *기록*을 줄이는 장치가 아니다.

> 💡 **관련 이론**: 복합 알람이 하는 일을 탐지공학의 언어로 말하면 **정밀도(precision)와 재현율(recall)의 교환**이다. 단일 신호 알람은 재현율이 높고 정밀도가 낮다(놓치진 않지만 오탐이 많다). 두 신호의 AND는 정밀도를 크게 올리는 대신 재현율을 떨어뜨린다(공격자가 한 신호만 남기면 놓친다). 그래서 성숙한 설계는 둘을 *동시에* 운영한다 — 단일 신호는 낮은 등급 채널(대시보드·일일 요약)로, 조합 신호는 높은 등급 채널(온콜 호출)로 보낸다. **"어떤 알람을 만들 것인가"가 아니라 "각 알람을 어느 채널로 보낼 것인가"가 실제 설계 문제**라는 인식이 알림 피로를 해결하는 출발점이다.

### 알람 액션은 SNS만이 아니다

알람이 취할 수 있는 액션은 네 부류다. 시험에서 "알람으로 무엇까지 할 수 있나"를 묻는 형태로 나온다.

| 액션 | 용도 | 보안에서의 쓸모 |
|------|------|----------------|
| SNS 게시 | 사람·기계로 팬아웃 | 가장 일반적. 이메일·Slack·Lambda·SQS로 갈라진다 |
| EC2 액션 | 중지·종료·재부팅·복구 | 오탐 시 비가역 피해가 크므로 보안 대응에는 **부적합** |
| Auto Scaling 액션 | 용량 조절 | 보안보다 가용성 대응 |
| Systems Manager OpsItem / Incident Manager | 운영 항목·인시던트 생성 | **티켓·인시던트 자동 개설.** 조사 흐름이 있는 조직에 적합 |

> ⚠️ **함정**: "GuardDuty가 침해를 탐지하면 CloudWatch 알람의 EC2 액션으로 인스턴스를 종료한다"는 보기는 두 겹으로 틀렸다. 첫째, GuardDuty 핀딩은 메트릭이 아니라 이벤트라 EventBridge 경로가 맞다(day4). 둘째, **종료는 비가역이며 포렌식 증거를 파괴**한다. 보안 자동 대응의 원칙은 가역적 조치(격리 SG 이동·스냅샷·태깅·세션 무효화)만 무인으로 돌리고, 비가역 조치는 사람을 경유시키는 것이다.

## CloudWatch 비정상 탐지(Anomaly Detection)

정적 임계가 어려운 메트릭(트래픽 패턴이 시간대·요일에 따라 변하는 경우)에는 **CloudWatch Anomaly Detection**을 쓴다. 머신러닝 모델이 메트릭의 과거 패턴을 학습해 예상 *밴드(band)*를 만들고, 밴드를 벗어나면 발동한다.

```
정적 임계:   ─────── 5 ───────  (고정선)
밴드 임계:   ╱╲  ╱╲  예상 범위  ╱╲   (시간에 따라 출렁이는 밴드)
            실제 값이 밴드 위/아래로 튀면 ALARM
```

보안에서의 쓸모: 평소와 다른 데이터 유출량(NetworkOut 급증), 비정상적 API 호출 빈도, 로그인 시도 패턴의 이탈 등 — "절대값"보다 "평소와 다름"이 신호인 경우. 다만 학습 기간이 필요하고, 명확한 임계가 있는 통제(루트 사용 = 1회만 발생해도 위반)에는 정적 임계가 더 정확하다.

> 💡 **관련 이론**: Anomaly Detection은 통계적 이상치 탐지(시계열 분해 + 신뢰구간)를 관리형으로 제공한다. 이는 GuardDuty가 행위 기반 이상 탐지를 하는 것과 철학이 같지만, GuardDuty는 위협 인텔·ML을 결합한 *완성형 탐지기*이고 CloudWatch Anomaly Detection은 *임의 메트릭에 대한 범용 밴드*다. 시험에서 "특정 위협(크립토마이닝, 자격증명 유출)"을 물으면 GuardDuty, "임의 커스텀 메트릭의 이상"을 물으면 CloudWatch Anomaly Detection이 정답에 가깝다.

밴드 기반 알람은 일반 알람과 CLI 형태가 다르다. 임계값이 *숫자*가 아니라 *다른 메트릭 표현식*이기 때문이다.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name EC2-NetworkOut-Anomaly \
  --alarm-description "데이터 반출 의심: 아웃바운드 전송량이 학습된 밴드를 이탈" \
  --comparison-operator GreaterThanUpperThreshold \
  --evaluation-periods 2 --datapoints-to-alarm 2 \
  --threshold-metric-id ad1 \
  --treat-missing-data notBreaching \
  --metrics '[
    {"Id":"m1",
     "MetricStat":{"Metric":{"Namespace":"AWS/EC2","MetricName":"NetworkOut",
                             "Dimensions":[{"Name":"InstanceId","Value":"i-0abc123def4567890"}]},
                   "Period":300,"Stat":"Average"},
     "ReturnData":true},
    {"Id":"ad1","Expression":"ANOMALY_DETECTION_BAND(m1, 2)",
     "Label":"NetworkOut 예상 범위","ReturnData":true}
  ]' \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-high
```

세 가지를 읽어야 한다. `--threshold-metric-id ad1`이 "임계는 ad1이라는 밴드"라고 지정한다. `ANOMALY_DETECTION_BAND(m1, 2)`의 두 번째 인자는 밴드 폭(표준편차 배수)으로, 크게 잡을수록 둔감해진다. 그리고 비교 연산자가 `GreaterThanUpperThreshold`인 것은 **위로 튄 것만** 본다는 뜻이다 — 데이터 반출 탐지에서는 이것이 맞지만, "로그 유입량이 갑자기 줄었다"를 보려면 `LessThanLowerThreshold`가 필요하다. 후자가 실무에서 더 자주 빠뜨리는 방향이다.

> ⚠️ **함정**: 비정상 탐지는 **학습 구간이 필요하고, 학습 데이터에 이미 공격이 섞여 있으면 그 공격을 "정상"으로 배운다.** 침해가 진행 중인 환경에 밴드를 새로 붙이면 침해 트래픽이 기준선이 되어 버린다. 또 "루트 계정 사용"처럼 정상 기준선이 0이어야 하는 통제에 밴드를 쓰면, 몇 번 발생한 것이 학습되어 임계가 올라간다. **명확한 규범이 있는 통제에는 정적 임계, 규범이 없고 패턴만 있는 지표에는 밴드** — 이 구분이 시험의 판단 기준이다.

## CloudWatch Logs Insights: 알람이 울린 다음 5분

알람은 "무언가 일어났다"까지만 말한다. 온콜이 즉시 던지는 질문은 "누가, 어디서, 얼마나"이고, 그 답은 로그 원문에 있다. **Logs Insights**는 CloudWatch Logs에 이미 있는 로그를 별도 적재 없이 즉시 질의하는 도구로, 알람과 조사 사이의 공백을 메운다. (질의 언어와 비용 모델의 상세, 그리고 S3 아카이브를 상대하는 Athena와의 선택 기준은 day3에서 다룬다. 여기서는 **알람 직후 손이 먼저 가야 하는 쿼리 몇 개**만 본다.)

```
# 1) 방금 울린 "권한 없는 API 호출" 알람의 정체 — 누가, 어떤 API에서 막혔나
fields @timestamp, userIdentity.arn, eventName, errorCode, sourceIPAddress
| filter errorCode like /AccessDenied|UnauthorizedOperation/
| stats count(*) as denied,
        count_distinct(eventName) as distinct_apis
    by userIdentity.arn, sourceIPAddress
| sort denied desc
| limit 20
```

**결과를 읽는 법이 핵심이다.** 이 쿼리에서 봐야 할 것은 `denied` 숫자가 아니라 **`distinct_apis`**다.

- `denied`가 크고 `distinct_apis`가 **1~2** → 잘못 설정된 자동화가 같은 호출을 반복 실패하는 것. 운영 이슈이지 보안 사건이 아니다.
- `denied`가 중간인데 `distinct_apis`가 **수십** → **권한 열거 정찰**이다. 사람이나 도구가 "이 자격증명으로 뭘 할 수 있나"를 훑고 있다는 뜻. 정상 자동화는 성공하도록 짜여 있어 실패 API가 다양할 이유가 없다.
- 같은 `arn`인데 `sourceIPAddress`가 여러 개로 갈라짐 → 세션이 다른 곳에서도 쓰이고 있다는 신호. 임시 자격증명 유출을 의심할 지점이다.

```
# 2) 콘솔 로그인의 성공/실패를 IP별로 한 화면에 — 브루트포스가 뚫렸는지 확인
fields @timestamp, sourceIPAddress, userIdentity.userName,
       responseElements.ConsoleLogin as result
| filter eventName = "ConsoleLogin"
| stats count(*) as attempts,
        sum(result = "Success") as ok,
        sum(result = "Failure") as fail
    by sourceIPAddress
| sort fail desc
| limit 25
```

여기서 결정적인 것은 `fail`이 큰 행이 아니라 **`fail`이 크면서 `ok`가 0이 아닌 행**이다. 실패만 잔뜩 있는 IP는 (아직) 실패한 공격이고, 실패가 쌓이다가 성공이 하나 섞인 IP는 **이미 뚫린 것**이다. 대응의 긴급도가 완전히 다르다.

```
# 3) 특정 주체가 알람 시각 전후에 한 모든 일 — 타임라인 재구성
fields @timestamp, eventName, eventSource, awsRegion, sourceIPAddress, errorCode
| filter userIdentity.arn like /AdminRole/
| sort @timestamp asc
| limit 200
```

```
# 4) 시간대별 실패 추세 — 지속적 공격인가, 단발 사고인가
fields @timestamp
| filter errorCode = "AccessDenied"
| stats count(*) as denied by bin(5m)
```

4번의 결과 모양이 판단을 가른다. **평평한 고원**이면 자동화가 계속 실패하고 있는 것이고, **한 봉우리**면 사람이 한 세션 동안 훑고 간 것이며, **일정 간격의 톱니**면 스케줄러나 스크립트다. 숫자의 크기보다 *모양*이 더 많은 것을 말한다.

> ⚠️ **함정**: Logs Insights는 **CloudWatch Logs에 있는 것만** 본다. CloudTrail을 S3로만 보내고 CloudWatch Logs 전달을 켜지 않았다면, 위 쿼리들은 전부 빈 결과를 낸다. 반대로 CloudWatch Logs로 보냈다면 그만큼 수집·저장 비용이 추가된다. **"모든 로그를 CloudWatch Logs로 보낸다"는 설계는 탐지에는 편하지만 비용에서 무너진다** — 실무 표준은 *알람을 걸어야 하는 로그만* CloudWatch Logs로 이중 전달하고, 나머지는 S3 아카이브에 두고 Athena로 조사하는 계층 분리다.

## 알림 피로 관리: 놓치지 않으면서 조용하게

지금까지 배운 것으로 알람 수십 개를 만드는 것은 쉽다. 어려운 것은 **그 알람들이 6개월 뒤에도 읽히게 만드는 것**이다. 알림 피로(alert fatigue)는 도구 문제가 아니라 설계 문제이며, 시험에서도 "노이즈를 줄이되 사각지대는 만들지 마라"라는 형태로 반복해 나온다. 정답의 형태는 언제나 **탐지는 다 하되, 도달 경로를 등급으로 나눈다**이다.

### 층으로 나누기: 무엇을 어디로 보낼 것인가

```
[ 하나의 탐지 세트, 세 개의 도달 경로 ]

  탐지(전부 유지)                     등급 판정                도달 경로
 ┌────────────────────┐          ┌──────────────┐      ┌───────────────────────┐
 │ 루트 사용          │──CRITICAL─▶│              │─────▶│ 온콜 호출(즉시 깨움)  │
 │ CloudTrail 중지    │          │              │      │ sec-alerts-critical   │
 │ CMK 삭제 예약      │          │              │      └───────────────────────┘
 ├────────────────────┤          │  SNS 토픽    │      ┌───────────────────────┐
 │ IAM 정책 변경      │──HIGH────▶│  3개로 분리  │─────▶│ 보안 채널(업무시간)   │
 │ SG/라우트 변경     │          │              │      │ sec-alerts-high       │
 │ 권한열거 정찰      │          │              │      └───────────────────────┘
 ├────────────────────┤          │              │      ┌───────────────────────┐
 │ 콘솔 로그인 실패   │──LOW─────▶│              │─────▶│ 대시보드·일일 요약    │
 │ 개별 AccessDenied  │          │              │      │ (알림 없음, 집계만)   │
 └────────────────────┘          └──────────────┘      └───────────────────────┘
         ▲                                                        │
         │              복합 알람으로 승급: LOW 신호 둘이            │
         └──────────── 동시에 켜지면 HIGH로 재진입 ◀───────────────┘
```

이 그림의 핵심은 **왼쪽은 절대 줄이지 않는다**는 것이다. 노이즈를 줄이는 작업은 왼쪽(탐지)이 아니라 오른쪽(도달)에서 한다. 그리고 마지막 화살표 — 낮은 등급 신호들의 *조합*이 다시 높은 등급으로 올라가는 경로 — 가 있어야 "낮은 등급으로 내렸더니 아무도 안 본다"는 문제가 해결된다.

### 실무에서 쓰는 다섯 가지 장치

| 장치 | 무엇을 줄이나 | 무엇을 잃지 않나 | 구현 |
|------|--------------|-----------------|------|
| **등급별 SNS 토픽 분리** | 잘못된 시각에 오는 알림 | 모든 탐지는 그대로 발생 | 토픽 3개 + 구독자 분리 |
| **N of M 지속성 요구** | 단발 오탐 | 지속되는 공격은 반드시 잡힘 | `--datapoints-to-alarm` |
| **복합 알람 AND** | 단일 신호 오탐 | 각 신호는 낮은 등급으로 여전히 관측 | `put-composite-alarm` |
| **액션 억제기** | 계획된 변경 창의 소음 | **알람 상태·이력은 남음** | `--actions-suppressor` |
| **집계 요약** | 개별 알림의 수 | 추세는 매일 한 번 반드시 확인 | 낮은 등급 → 대시보드·요약 |

> ⚠️ **함정**: 노이즈를 줄이는 다섯 가지 중 **오답인 방법**을 시험이 자주 섞어 넣는다. (1) **지표 필터·알람 삭제** — 탐지를 끄는 것이므로 사각지대가 영구적이다. (2) **로그 그룹 보존 기간 단축** — 알림은 그대로이고 조사 능력만 잃는다. (3) **임계값을 무작정 올리기** — 공격자가 임계 아래에서 천천히 움직이면 완전히 투명해진다(low-and-slow). 셋 다 "조용해졌다"는 같은 증상을 만들지만, 조용해진 이유가 *덜 울려서*가 아니라 *못 보게 되어서*다. 정답 보기는 항상 **탐지는 유지하고 라우팅·상관·지속성으로 거른다**는 형태를 띤다.

> 🔍 **더 깊이**: 알림 피로를 정량으로 관리하는 조직은 알람마다 두 숫자를 기록한다 — **발생 건수**와 **그중 실제 조치로 이어진 비율(actionability)**. 조치율이 극단적으로 낮은 알람은 두 가지 중 하나다. 임계가 잘못됐거나(튜닝 대상), 애초에 알람이 아니라 대시보드 지표여야 하는 것(강등 대상)이다. 이 지표 없이 "알람이 너무 많다"는 감각만으로 정리에 들어가면, 조용하지만 중요한 알람(1년에 한 번 울리는 루트 사용 알람 같은)이 "안 울리니 필요 없다"는 이유로 함께 삭제되는 사고가 난다. **울리지 않는 알람이야말로 가장 중요한 알람일 수 있다**는 것이 이 영역의 반직관이다.

## CloudWatch Logs Subscription Filter: 실시간 스트리밍

Metric Filter가 "패턴 → 숫자"라면, **Subscription Filter**는 "패턴에 매칭되는 로그 이벤트 자체를 실시간으로 다른 곳으로 흘려보내는" 장치다. 대상은 Kinesis Data Streams, Kinesis Data Firehose, Lambda, 또는 다른 계정의 로그(cross-account)다.

보안 아키텍처에서의 역할: 여러 계정의 로그를 **중앙 로깅 계정**으로 실시간 집계할 때 핵심이다. 각 계정 로그 그룹의 Subscription Filter → 중앙 계정 Kinesis/Firehose → S3 데이터 레이크 또는 OpenSearch.

```bash
aws logs put-subscription-filter \
  --log-group-name /aws/lambda/payment-service \
  --filter-name ErrorsToFirehose \
  --filter-pattern "?ERROR ?Exception ?AccessDenied" \
  --destination-arn arn:aws:firehose:ap-northeast-2:444455556666:deliverystream/central-logs \
  --role-arn arn:aws:iam::111122223333:role/CWLtoFirehoseRole
```

> 🔍 **더 깊이**: 로그 그룹당 활성 Subscription Filter는 (기본) 최대 2개로 제한된다. 한 로그 그룹의 데이터를 동시에 Firehose(아카이브)와 Lambda(실시간 대응) 양쪽으로 보내려면 이 한도를 의식해야 한다. 또한 cross-account subscription을 쓰려면 *대상* 계정에 destination(논리 엔드포인트)을 만들고 access policy로 *소스* 계정을 허용해야 한다 — 로그 그룹의 리소스 정책이 아니라 destination의 정책이 게이트라는 점이 헷갈리는 부분이다.

## SNS 알림: 사람과 기계로 갈라지는 분기점

Alarm의 액션은 SNS 토픽으로 가는 경우가 가장 흔하다. SNS에서 다시 이메일/SMS(사람)와 Lambda/SQS(기계 대응)로 팬아웃한다. 보안 알림 토픽 설계의 위생:

- SNS 토픽도 **KMS 암호화**(SSE)와 **토픽 정책**으로 보호한다. 누가 publish/subscribe할 수 있는지 명시한다.
- 알람 → SNS → Lambda로 자동 대응(예: 노출된 보안 그룹 규칙 회수)을 붙이면 탐지-대응 루프가 닫힌다. 단, 자동 대응의 권한 범위를 최소화해야 한다(과잉 권한 Lambda는 그 자체가 위협).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudWatchAlarmsToPublish",
      "Effect": "Allow",
      "Principal": { "Service": "cloudwatch.amazonaws.com" },
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-critical",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "111122223333" }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "sns:*",
      "Resource": "arn:aws:sns:ap-northeast-2:111122223333:sec-alerts-critical",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

> ⚠️ **함정**: 보안 알림 토픽에 **KMS 암호화를 켰더니 알람이 조용해지는** 사고가 흔하다. SNS의 SSE에 고객 관리 키를 쓰면 CloudWatch가 그 키로 암호화할 수 있어야 하므로 **키 정책에 `cloudwatch.amazonaws.com`의 `kms:GenerateDataKey*`·`kms:Decrypt` 허용**이 필요하다. 로그 그룹 KMS 함정과 완전히 같은 구조 — *IAM이 아니라 키 정책이 게이트*다. 그리고 이 실패는 조용하다: 알람은 ALARM으로 잘 전환되는데 알림만 도달하지 않는다. 그래서 보안 알림 경로는 **주기적으로 합성 이벤트를 흘려 도달을 확인**해야 한다(알림 파이프라인 자체의 하트비트).

## 세 가지 "로그에서 신호 뽑기"의 비교

같은 CloudTrail 로그를 두고도 신호를 뽑는 길이 셋이다. 시험은 이 셋을 헷갈리게 만드는 지문을 즐겨 낸다.

| 축 | 지표 필터 + 알람 | Logs Insights | EventBridge 규칙 |
|----|-----------------|---------------|-----------------|
| 입력 | CloudWatch Logs의 **새 이벤트** | CloudWatch Logs의 **저장된 이벤트** | AWS 서비스가 발행하는 **이벤트 스트림** |
| 시간 방향 | 앞으로 오는 것 | 이미 온 것 | 지금 오는 것 |
| 지연 | 로그 전달 지연 + 알람 평가 주기 | 즉시(질의 시점) | 가장 짧음 |
| 결과물 | 숫자 메트릭 → 상태(OK/ALARM) | 표·차트(사람이 읽음) | 이벤트 → 대상 호출 |
| 상관 능력 | 단일 패턴(복합 알람으로 제한적 조합) | 쿼리 내 집계·조인 유사 연산 | 패턴 매칭(단일 이벤트 내) |
| 비용 모델 | 커스텀 메트릭 + 알람 개수 | 질의 시 스캔량 | 이벤트 수(대부분 AWS 이벤트는 무료 유입) |
| 전형적 용도 | 임계 경보, CIS 통제 | 사고 조사, 헌팅 | 핀딩 라우팅, 자동 대응(day4) |
| 소급 적용 | **불가** | 가능(보존 기간 내) | 불가 |

> 🎯 **시나리오**: "IAM 정책 변경이 일어나면 즉시 Lambda로 자동 검증하고 위반이면 되돌려라"가 나오면 지표 필터+알람이 아니라 **EventBridge 규칙 → Lambda**가 정답이다. 이유는 두 가지다. (1) 알람 경로는 *숫자로 변환된 뒤*라 "어떤 정책이 어떻게 바뀌었는지"라는 원본 맥락을 잃는다 — Lambda가 받아야 할 정보가 사라진다. (2) 알람은 평가 주기만큼 지연된다. 반대로 "특정 이벤트가 **일정 횟수 이상** 발생하면 알려라"는 임계·집계가 필요하므로 EventBridge 단독으로는 안 되고 지표 필터+알람이 맞다. **판별 기준은 '개별 이벤트의 내용이 필요한가(EventBridge)' vs '발생 횟수의 집계가 필요한가(알람)'**이다.

## 정리하며

CloudWatch는 "단일 로그 그룹 내 패턴을 숫자로 만들어 임계로 경보"하는 1차 탐지기다. 강점은 단순·즉시·저비용이고, 한계는 다중 소스 상관·정규화·장기 분석이며, 그 영역은 day2(Security Hub), day3(Athena/OpenSearch), day4(EventBridge)에서 메운다. 오늘의 핵심 등식은 그대로다: **CloudTrail → CloudWatch Logs → Metric Filter → Alarm → SNS**.

다만 오늘 배운 것을 등식 하나로만 기억하면 절반을 놓친다. 이 배관에는 **세 개의 조용한 실패 지점**이 있고, 시험 문항의 상당수가 그 지점을 짚는다.

1. **경로가 없다** — CloudTrail이 CloudWatch Logs로 오지 않으면 어떤 필터도 0을 낸다.
2. **변환이 어긋난다** — `defaultValue=0`이 없거나 `Statistic`이 `Sum`이 아니면 숫자가 임계에 닿지 않는다.
3. **도달이 막힌다** — KMS 키 정책이나 토픽 정책이 막으면 알람은 울리는데 알림만 사라진다.

셋 다 공통점이 있다. **아무 오류도 나지 않고, 대시보드는 평온해 보인다.** 그래서 탐지 파이프라인은 "만들었다"로 끝나지 않고 *합성 이벤트로 끝에서 끝까지 도달을 확인*하고, *로그 유입 자체를 감시하는 하트비트*를 두어야 완성된다. 조용함이 안전을 뜻하지 않는다는 것 — 이것이 오늘의 진짜 결론이다.

## 한 줄 요약 체크리스트

- [ ] CloudTrail(전 리전)을 CloudWatch Logs로 전달해 탐지 경로를 열었는가
- [ ] CIS 모니터링 세트(루트 사용·CloudTrail 중지·CMK 삭제·정책/네트워크 변경 등)를 지표 필터로 덮었는가
- [ ] 카운트 탐지에 `metricValue=1` + `defaultValue=0` + `Statistic=Sum`을 짝으로 맞췄는가
- [ ] 알람마다 "한 번이 사건인가"를 물어 N of M을 정했는가
- [ ] 로그 유입 중단을 잡는 하트비트 알람(`treat-missing-data=breaching`)을 별도로 두었는가
- [ ] 등급별 SNS 토픽을 분리하고, 낮은 등급은 집계·대시보드로 흘렸는가
- [ ] 억제는 액션 억제기로 하고 탐지·기록은 남겼는가(필터 삭제·임계 상향으로 조용하게 만들지 않았는가)
- [ ] 로그 그룹 KMS 키 정책과 SNS 토픽 KMS 키 정책에 각 서비스 주체 권한을 넣었는가
- [ ] 민감정보가 섞이는 로그 그룹에 데이터 보호 정책(Audit + Deidentify)을 적용했는가

---

## 📝 연습 문제

**문제 1.** CloudTrail 로그에서 루트 계정 사용을 탐지해 즉시 알림을 보내려 한다. 올바른 구성 순서는?

A) CloudTrail → S3 → Athena 쿼리 스케줄링 → 이메일  
B) CloudTrail을 CloudWatch Logs로 전송 → Metric Filter로 루트 사용 패턴 매칭 → Alarm(임계 1) → SNS  
C) GuardDuty를 활성화하면 자동으로 처리된다  
D) VPC Flow Logs에 Metric Filter를 적용  

**정답: B**  
해설: 루트 사용 탐지의 표준 경로는 CloudTrail 로그를 CloudWatch Logs로 보내고, JSON 패턴 Metric Filter로 루트 주체 호출을 카운트한 뒤, 임계 1 이상이면 발동하는 Alarm을 SNS에 연결하는 것이다. S3+Athena는 사후 배치 분석이라 "즉시"가 아니고, GuardDuty는 루트 사용 자체를 핵심 탐지로 다루지 않으며, VPC Flow Logs에는 API 호출 정보가 없다.

---

**문제 2.** 5분 동안 콘솔 로그인 실패가 5회 이상이면 경보하도록 알람을 만들었는데 한 번도 발동하지 않는다. 메트릭 필터와 알람을 점검했을 때 가장 가능성 높은 원인은?

A) 알람의 Statistic을 Average로 설정해 카운트 합이 임계를 넘지 못한다  
B) SNS 토픽이 암호화되어 있다  
C) 로그 그룹 보존 기간이 너무 길다  
D) CloudFront 스코프가 잘못되었다  

**정답: A**  
해설: 카운트 기반 보안 탐지는 지정 기간 동안 발생 횟수의 합이 중요하므로 `Sum` 통계를 써야 한다. `Average`로 평가하면 5분 평균이 임계 5에 도달하지 못해 영원히 발동하지 않는다. SNS 암호화·보존 기간은 발동 여부와 무관하고, CloudFront 스코프는 WAF 개념으로 이 문맥과 관계없다.

---

**문제 3.** 트래픽이 시간대와 요일에 따라 크게 변동하는 애플리케이션의 NetworkOut 급증(데이터 유출 의심)을 정적 임계 없이 탐지하려 한다. 가장 적절한 것은?

A) 고정 임계 알람을 보수적으로 낮게 설정  
B) CloudWatch Anomaly Detection으로 학습된 밴드를 벗어나는 값을 탐지  
C) Subscription Filter로 모든 로그를 Lambda로 전송  
D) 로그 그룹 보존 기간을 무기한으로 설정  

**정답: B**  
해설: 패턴이 시간에 따라 변동해 정적 임계를 정하기 어려운 메트릭에는 Anomaly Detection이 적합하다. ML 모델이 과거 패턴으로 예상 밴드를 만들고 이를 벗어나면 발동한다. 고정 임계를 낮게 잡으면 정상 피크에서 오탐이 폭증하고, Subscription Filter는 탐지가 아니라 스트리밍 전달이며, 보존 기간은 탐지와 무관하다.

---

**문제 4.** 여러 멤버 계정의 로그를 중앙 로깅 계정으로 실시간 집계하려 한다. 핵심 구성 요소는?

A) 각 계정에서 S3 버킷 복제(replication)만 설정  
B) 각 로그 그룹의 Subscription Filter를 중앙 계정의 Kinesis Data Firehose destination으로 연결하고, destination access policy로 소스 계정을 허용  
C) 각 계정에서 Metric Filter를 만들면 자동으로 중앙 집계된다  
D) CloudWatch Alarm을 cross-account로 공유  

**정답: B**  
해설: 실시간 로그 집계는 Subscription Filter가 핵심이며, cross-account 시 *대상* 계정에 destination(Kinesis/Firehose)을 만들고 그 access policy로 소스 계정을 허용해야 한다. S3 복제는 실시간 이벤트 스트리밍이 아니고, Metric Filter는 같은 계정 내 숫자 변환일 뿐 cross-account 집계를 하지 않으며, 알람 공유로는 원본 로그가 모이지 않는다.

---

**문제 5.** 로그 그룹에 KMS CMK 암호화를 설정했더니 로그가 더 이상 수집되지 않는다. 가장 먼저 확인할 것은?

A) IAM 사용자에게 CloudWatch 읽기 권한이 있는지  
B) KMS 키 정책에 `logs.<region>.amazonaws.com` 서비스 주체의 키 사용 권한이 있는지  
C) 로그 그룹 보존 기간 설정  
D) SNS 토픽 구독 상태  

**정답: B**  
해설: CloudWatch Logs가 KMS로 암호화하려면 *키 정책*에 CloudWatch Logs 서비스 주체의 Encrypt/Decrypt/GenerateDataKey 권한이 명시돼야 한다. KMS는 IAM 권한과 키 정책 두 게이트를 모두 통과해야 하며, 서비스 주체 권한이 없으면 수집이 실패한다. IAM 읽기 권한, 보존 기간, SNS 구독은 수집 실패 원인과 무관하다.

---
