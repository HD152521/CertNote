# Day 2 - AWS Config: 구성 항목·기록, 규칙(관리형/커스텀 Lambda), Conformance Pack, 자동 교정

CloudTrail이 "누가 무엇을 했는가"(활동)를 기록한다면, **AWS Config**는 "리소스가 *지금* 그리고 *과거의 각 시점에* 어떤 상태였는가"(구성)를 기록한다. 둘은 보완 관계다. 침해 조사에서 CloudTrail은 `AuthorizeSecurityGroupIngress` 호출을 보여주지만, AWS Config는 그 결과 보안 그룹이 *0.0.0.0/0:22*로 열렸고 그것이 며칠간 지속됐다는 *상태와 시간선*을 보여준다.

보안 시험에서 Config는 "규정 준수 평가", "구성 드리프트 탐지", "원하는 상태 강제(자동 교정)"의 핵심 도구다.

> 📚 **사례**: 공개적으로 보고된 대규모 클라우드 데이터 노출 사고 중 상당수는 취약점 익스플로잇이 아니라 **구성 실수**였다. 잘못 열린 스토리지 버킷, 인터넷에 노출된 데이터베이스, 0.0.0.0/0으로 열린 관리 포트 — 반복되는 패턴은 늘 같다. 그리고 이 사고들이 공통적으로 보여 준 더 뼈아픈 사실은, 문제의 설정이 **사고가 알려지기 몇 주 또는 몇 달 전부터 그 상태였다**는 점이다. 즉 실패는 "잘못 설정한 순간"이 아니라 "잘못된 상태가 아무에게도 보이지 않은 채 지속된 기간"에서 발생한다. AWS Config의 존재 이유가 정확히 여기다 — 구성을 *사건*이 아니라 *지속되는 상태*로 다루고, 그 상태가 기준에서 벗어난 순간부터 그것을 계속 붉게 표시한다. CloudTrail은 "누가 언제 열었나"에 답하지만, "그게 아직도 열려 있나"에 답하는 것은 Config다.

### 세 로그가 각각 답하는 질문

이번 주의 도구들은 겹치는 것처럼 보이지만 던지는 질문이 서로 다르다. 이 표를 먼저 머리에 넣고 나머지를 읽는 편이 빠르다.

| | CloudTrail | AWS Config | VPC Flow Logs |
|---|-----------|-----------|---------------|
| 기록 단위 | API 호출 1건(사건) | 리소스 1개의 시점 스냅샷(상태) | 네트워크 흐름 1건(통신) |
| 답하는 질문 | "누가 무엇을 했나" | "지금/그때 어떤 상태였나" | "어떤 트래픽이 오갔나" |
| 시간축 | 점(point) | 선(구간) | 점(집계 윈도) |
| 없으면 못 하는 것 | 행위자 특정 | 노출 지속 기간 산정 | 유출 규모 추정 |
| 대표 필드 | `userIdentity`, `eventName` | `configuration`, `relationships` | `action`, `bytes`, `pkt-srcaddr` |
| 전형적 오해 | "모든 게 다 남는다"(데이터 이벤트 별도) | "실시간 차단 도구다"(아니다, 평가 도구다) | "패킷 내용이 남는다"(메타데이터뿐) |

세 번째 줄이 핵심이다. **CloudTrail은 점을, Config는 선을 그린다.** 침해 보고서에 "보안 그룹이 6월 12일 14:02에 열렸고 6월 19일 09:30에 닫혔다 — 7일 7시간 동안 노출"이라고 쓸 수 있게 해 주는 것은 Config뿐이다. 규제 대응에서 노출 *지속 기간*은 통지 의무와 과징금 산정에 직접 영향을 주므로, 이것은 학술적 구분이 아니라 실질적 차이다.

## 구성 항목(Configuration Item)과 구성 기록(Configuration Recorder)

Config의 기본 단위는 **Configuration Item(CI)**이다. CI는 특정 시점의 한 리소스에 대한 스냅샷으로, 속성·관계·관련 이벤트·메타데이터를 담는다. 리소스가 변경될 때마다 새 CI가 생성되어 **구성 타임라인(configuration timeline)**을 이룬다.

```json
{
  "configurationItemCaptureTime": "2026-06-24T08:00:00Z",
  "resourceType": "AWS::EC2::SecurityGroup",
  "resourceId": "sg-0abc123",
  "configurationItemStatus": "OK",
  "configuration": {
    "ipPermissions": [
      { "ipProtocol": "tcp", "fromPort": 22, "toPort": 22,
        "ipRanges": [{ "cidrIp": "0.0.0.0/0" }] }
    ]
  },
  "relationships": [
    { "resourceType": "AWS::EC2::Instance", "resourceId": "i-0def456",
      "relationshipName": "Is associated with" }
  ]
}
```

### CI를 끝까지 읽는 법

위 예시는 이해를 위해 줄인 것이고, 실제 CI에는 조사에서 결정적인 필드가 더 있다.

| 필드 | 의미 | 왜 중요한가 |
|------|------|------------|
| `configurationItemStatus` | `OK` / `ResourceDiscovered` / `ResourceDeleted` / `ResourceNotRecorded` 등 | 리소스가 삭제된 시점도 CI로 남는다 — "언제 증거가 사라졌나" |
| `configurationStateId` | 상태의 순번 식별자 | 타임라인에서 특정 상태를 고정 참조 |
| `relatedEvents` | **이 변경을 만든 CloudTrail 이벤트 ID** | Config ↔ CloudTrail을 잇는 다리 |
| `relationships` | 다른 리소스와의 연결 | 측면 이동 경로·영향 범위 추적 |
| `supplementaryConfiguration` | 본 구성에 안 담기는 부가 설정 | 버킷 정책·ACL·수명주기 등이 여기 들어간다 |
| `tags` | 태그 스냅샷 | 소유팀·환경 식별, 태그 기반 정책 평가 |
| `resourceCreationTime` | 리소스 생성 시각 | "언제부터 존재했나" |

`relatedEvents`가 실무에서 가장 값진 필드다. Config에서 "이 보안 그룹이 14:02에 열렸다"를 찾은 다음, 이 필드에 담긴 CloudTrail 이벤트 ID로 곧장 "그 변경을 일으킨 호출과 호출자"로 건너뛸 수 있다. 두 서비스를 시간으로 대충 맞춰 보는 것이 아니라 **ID로 정확히 연결**되는 것이다.

> ⚠️ **함정**: `supplementaryConfiguration`을 모르면 S3 버킷 조사에서 헤맨다. S3 버킷의 CI에서 `configuration`만 열어 보면 버킷 정책이 보이지 않는다 — 정책·ACL·퍼블릭 액세스 차단 설정·수명주기 같은 것들은 `supplementaryConfiguration` 쪽에 담기기 때문이다. "Config에 버킷 정책 이력이 없다"고 결론 내리기 전에 이 블록을 먼저 확인해야 한다.

### 변경 알림에 담기는 `configurationItemDiff`

CI 자체는 "그 시점의 전체 상태"이지만, 구성 변경 알림(SNS·EventBridge로 나가는 메시지)에는 **무엇이 어떻게 바뀌었는지의 차이**가 함께 담긴다. 이것이 사람이 실제로 읽게 되는 형태다.

```json
{
  "configurationItemDiff": {
    "changeType": "UPDATE",
    "changedProperties": {
      "Configuration.IpPermissions.0": {
        "changeType": "CREATE",
        "updatedValue": {
          "ipProtocol": "tcp",
          "fromPort": 3389,
          "toPort": 3389,
          "ipv4Ranges": [{ "cidrIp": "0.0.0.0/0" }]
        },
        "previousValue": null
      }
    }
  },
  "configurationItem": {
    "resourceType": "AWS::EC2::SecurityGroup",
    "resourceId": "sg-0abc123",
    "configurationItemCaptureTime": "2026-06-24T14:02:11Z",
    "awsRegion": "ap-northeast-2",
    "relatedEvents": ["9a1b2c3d-4e5f-6789-abcd-ef0123456789"],
    "tags": { "Environment": "prod", "Owner": "payments-team" }
  },
  "notificationCreationTime": "2026-06-24T14:02:47Z",
  "messageType": "ConfigurationItemChangeNotification"
}
```

이 한 덩어리 안에 조사에 필요한 것이 거의 다 있다. **무엇이**(3389 인바운드가 전 세계로), **언제**(14:02:11), **어느 리소스에**(sg-0abc123), **누구 소유의**(payments-team), 그리고 **어떤 API 호출로**(`relatedEvents`의 CloudTrail 이벤트 ID) 일어났는지까지.

> 🎯 **시나리오**: "구성 변경이 일어나면 즉시 알림을 받되, 모든 변경이 아니라 *보안에 영향을 주는 변경*만 받고 싶다." 정답 구조는 Config의 변경 알림을 **EventBridge 규칙으로 필터링**하는 것이다. Config는 `Config Configuration Item Change`와 `Config Rules Compliance Change` 두 종류의 이벤트를 EventBridge로 보내며, 후자를 `NON_COMPLIANT`로만 필터링하면 "규칙을 위반한 변경"만 골라 받을 수 있다. SNS 주제에 모든 CI 변경을 그대로 흘려 보내는 구성은 하루 만에 아무도 안 보는 채널이 된다.

```json
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {
    "messageType": ["ComplianceChangeNotification"],
    "newEvaluationResult": {
      "complianceType": ["NON_COMPLIANT"]
    },
    "configRuleName": ["restricted-common-ports", "s3-bucket-public-read-prohibited",
                       "encrypted-volumes", "iam-root-access-key-check"]
  }
}
```

**Configuration Recorder**가 어떤 리소스 타입을 기록할지 결정한다. 전 리소스 기록, 특정 타입만, 글로벌 리소스(IAM 등) 포함 여부를 설정한다. 기록된 CI와 스냅샷·기록 변경 이력은 **delivery channel**을 통해 S3 버킷에 저장되고, SNS로 알림된다.

```bash
# 기록기 설정 — 전 리소스 + 글로벌 리소스 포함
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:aws:iam::111122223333:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig \
  --recording-group allSupported=true,includeGlobalResourceTypes=true

# 전달 채널 — S3(원본 보관) + SNS(변경 알림)
aws configservice put-delivery-channel \
  --delivery-channel '{
    "name": "default",
    "s3BucketName": "central-config-logs",
    "snsTopicARN": "arn:aws:sns:ap-northeast-2:999988887777:config-changes",
    "configSnapshotDeliveryProperties": { "deliveryFrequency": "TwentyFour_Hours" }
  }'

# 기록 시작 — 이걸 안 하면 recorder를 만들어 두고도 아무것도 안 남는다
aws configservice start-configuration-recorder --configuration-recorder-name default

# 지금 기록 중인가? (감사 때 가장 먼저 확인하는 명령)
aws configservice describe-configuration-recorder-status
```

> ⚠️ **함정**: `put-configuration-recorder`만 하고 `start-configuration-recorder`를 빠뜨리면 recorder는 *존재하지만 정지 상태*다. 콘솔에서는 "Config가 설정되어 있음"처럼 보이는데 CI가 하나도 쌓이지 않는다. CloudTrail에 `IsLogging=false`가 있듯 Config에는 `recording=false`가 있고, 감사에서 두 값은 반드시 함께 확인해야 하는 짝이다. "켜져 있다"와 "돌고 있다"는 다른 말이다.

> ⚠️ **함정**: Config는 *리전별 서비스*다. 각 리전에서 recorder를 켜야 그 리전 리소스를 기록한다. 또 IAM·CloudFront 같은 글로벌 리소스는 한 리전(보통 us-east-1)에서만 기록하도록 해 중복을 피한다. "Config를 켰는데 다른 리전 리소스가 평가되지 않는다"는 리전별 recorder 미설정이 원인이다.

> 💡 **관련 이론**: Config의 발상은 *infrastructure as a state machine*이다. 모든 리소스는 시간에 따라 상태가 바뀌는 상태 기계이고, Config는 그 상태 전이를 이벤트 소싱(event sourcing)처럼 기록한다. 덕분에 "2주 전 이 리소스는 어떤 상태였나"를 시간 여행하듯 조회할 수 있고, 이는 컴플라이언스 감사와 사고 조사의 토대가 된다.

## Config Rules: 규정 준수 평가

**Config Rule**은 리소스가 원하는 상태를 만족하는지 평가해 `COMPLIANT` / `NON_COMPLIANT`로 표시한다. 평가 트리거는 두 가지:
- **Configuration change triggered**: CI가 생성·변경될 때 평가.
- **Periodic**: 정해진 주기(1시간~24시간)로 평가.

규칙은 세 출처가 있다:
1. **AWS Managed Rules**: AWS가 제공하는 수백 개 사전 정의 규칙(예: `s3-bucket-public-read-prohibited`, `encrypted-volumes`, `iam-password-policy`, `restricted-ssh`).
2. **Custom Lambda Rules**: 직접 Lambda 함수로 평가 로직 작성.
3. **Custom Policy Rules**: Guard(정책 언어)로 코드 없이 작성.

```python
# Custom Lambda rule: EBS 볼륨이 특정 KMS 키로 암호화됐는지 평가
import boto3, json

REQUIRED_KEY = "arn:aws:kms:ap-northeast-2:111122223333:key/aaaa-bbbb"

def lambda_handler(event, context):
    invoking = json.loads(event["invokingEvent"])
    ci = invoking["configurationItem"]
    config = boto3.client("config")

    compliance = "NOT_APPLICABLE"
    if ci["resourceType"] == "AWS::EC2::Volume":
        cfg = ci["configuration"]
        if cfg.get("encrypted") and cfg.get("kmsKeyId") == REQUIRED_KEY:
            compliance = "COMPLIANT"
        else:
            compliance = "NON_COMPLIANT"

    config.put_evaluations(
        Evaluations=[{
            "ComplianceResourceType": ci["resourceType"],
            "ComplianceResourceId": ci["resourceId"],
            "ComplianceType": compliance,
            "OrderingTimestamp": ci["configurationItemCaptureTime"],
        }],
        ResultToken=event["resultToken"],
    )
```

> 🎯 **시나리오**: "AWS 관리형 규칙으로는 표현 못 하는 조직 특화 규칙(예: 모든 EBS가 *특정* CMK로 암호화돼야 함)을 평가하라." 정답은 Custom Lambda rule 또는 Custom Policy(Guard) rule. 단순 "암호화 여부"만이면 관리형 `encrypted-volumes`로 충분하지만, *특정 키* 강제는 커스텀이 필요하다.

같은 규칙을 Lambda 없이 **Guard(Custom Policy rule)** 로 쓰면 이렇게 된다. 코드도 없고 배포할 함수도 없으므로 유지보수 부담이 훨씬 작다.

```
# Guard: 모든 EBS 볼륨은 지정된 CMK로 암호화되어 있어야 한다
let volumes = Resources.*[ Type == 'AWS::EC2::Volume' ]

rule ebs_must_use_corporate_cmk when %volumes !empty {
  %volumes.Properties.Encrypted == true
    <<violation: EBS 볼륨이 암호화되어 있지 않습니다>>
  %volumes.Properties.KmsKeyId == "arn:aws:kms:ap-northeast-2:111122223333:key/aaaa-bbbb"
    <<violation: 승인되지 않은 KMS 키를 사용하고 있습니다>>
}
```

> 💡 **관련 이론**: 세 가지 규칙 출처의 선택은 *표현력과 운영 부담의 교환*이다. 관리형 규칙은 부담이 0이지만 표현할 수 있는 것이 AWS가 미리 정한 것뿐이고, Guard는 선언적 문법 안에서 조직 고유 조건을 표현할 수 있으며, Lambda는 무엇이든 할 수 있는 대신 **함수 자체가 관리 대상이자 공격 표면**이 된다. 실제로 커스텀 Lambda 규칙은 시간이 지나면서 방치되기 쉬운 자산이다 — 런타임이 만료되고, 담당자가 떠나고, 어느 날 조용히 오류를 뱉으며 모든 리소스를 `INSUFFICIENT_DATA`로 만든다. 그래서 선택의 기본값은 **관리형 → Guard → Lambda 순으로 내려가되, 한 단계 위에서 표현 가능하면 절대 내려가지 않는 것**이다. "할 수 있다"와 "해야 한다"는 다르다.

### 평가 결과는 네 가지다

| 상태 | 의미 | 흔히 오해하는 지점 |
|------|------|-------------------|
| `COMPLIANT` | 기준을 만족 | — |
| `NON_COMPLIANT` | 기준 위반 | 대응이 필요한 유일한 상태처럼 보이지만 아니다 |
| `NOT_APPLICABLE` | 규칙의 평가 대상이 아닌 리소스 | 정상 |
| `INSUFFICIENT_DATA` | **평가를 하지 못함** | 초록도 빨강도 아닌 회색 — 실질적으로 사각지대 |

`INSUFFICIENT_DATA`가 함정이다. 커스텀 Lambda가 오류를 내거나, recorder가 해당 리소스 타입을 기록하지 않거나, 규칙이 방금 만들어져 아직 평가되지 않았을 때 이 상태가 된다. 대시보드에서 준수율을 볼 때 이 항목을 분모에서 빼 버리면 **"98% 준수"라는 숫자가 실제로는 "평가된 것 중 98%"** 를 뜻하게 되고, 평가되지 않은 나머지는 통계 밖에서 조용히 위험하다. 준수 리포트를 읽을 때 첫 번째로 확인할 것은 위반 건수가 아니라 *평가되지 않은 건수*다.

### 탐지 평가와 사전 평가(proactive)

Config 규칙의 기본 동작은 **이미 존재하는 리소스**를 평가하는 것이다(detective). 그런데 일부 규칙은 리소스가 만들어지기 *전에* 그 구성이 규칙을 통과할지 미리 물어볼 수 있는 **사전 평가(proactive) 모드**를 지원한다. 배포 파이프라인이나 IaC 단계에서 이 평가를 호출하면, 위반 구성이 애초에 생성되지 않게 막을 수 있다.

```
[ 같은 규칙, 다른 시점 ]

  IaC 템플릿 작성 ─▶ 배포 파이프라인 ─▶ 리소스 생성 ─▶ 운영 중
        │                  │                  │            │
        │            사전 평가(proactive)      │      탐지 평가(detective)
        │            "이대로 만들면            │      "지금 상태가
        │             위반인가?"               │       위반인가?"
        │                  │                  │            │
        └─ 예방 통제 ──────┘                  └─ 탐지 통제 ┴─ 자동 교정(대응)
```

> ⚠️ **함정**: 사전 평가는 **모든 규칙이 지원하지는 않는다.** 그리고 사전 평가를 통과했다고 해서 탐지 평가가 자동으로 면제되지도 않는다. 둘은 같은 기준을 서로 다른 시점에 적용하는 별개의 통제이며, 파이프라인을 우회해 콘솔에서 직접 만든 리소스는 사전 평가를 거치지 않는다. 그래서 "사전 평가를 도입했으니 탐지 규칙은 꺼도 된다"는 판단은 언제나 틀리다 — 통제는 우회 경로가 존재하는 순간 보조 수단이 된다.

### 규칙 다루기: CLI

```bash
# 규칙별 준수 상태 요약
aws configservice describe-compliance-by-config-rule \
  --config-rule-names restricted-common-ports encrypted-volumes

# 특정 규칙을 위반한 리소스 목록 — "무엇을 고쳐야 하는가"
aws configservice get-compliance-details-by-config-rule \
  --config-rule-name restricted-common-ports \
  --compliance-types NON_COMPLIANT \
  --query 'EvaluationResults[].EvaluationResultIdentifier.EvaluationResultQualifier'

# 한 리소스의 구성 이력을 시간 순으로 — 조사의 핵심 명령
aws configservice get-resource-config-history \
  --resource-type AWS::EC2::SecurityGroup \
  --resource-id sg-0abc123 \
  --earlier-time 2026-06-01T00:00:00Z \
  --later-time  2026-06-30T00:00:00Z \
  --query 'configurationItems[].{t:configurationItemCaptureTime,s:configurationItemStatus,e:relatedEvents}'

# 즉시 재평가 강제 (교정 후 확인할 때)
aws configservice start-config-rules-evaluation \
  --config-rule-names restricted-common-ports

# 수동 교정 실행
aws configservice start-remediation-execution \
  --config-rule-name s3-bucket-public-read-prohibited \
  --resource-keys resourceType=AWS::S3::Bucket,resourceId=corp-sensitive
```

`get-resource-config-history`가 이 서비스의 존재 이유를 가장 잘 보여 주는 명령이다. 한 리소스의 모든 상태 변화를 시간 순으로 늘어놓고, 각 항목의 `relatedEvents`로 CloudTrail 이벤트에 바로 연결한다. 침해 조사에서 "이 보안 그룹의 지난 한 달"을 요청받으면 이 한 줄로 시작한다.

## Conformance Pack: 규칙·교정의 묶음 배포

규칙을 하나씩 배포·관리하는 것은 다계정·다리전에서 비효율적이다. **Conformance Pack**은 Config 규칙과 교정(remediation) 액션을 **하나의 YAML 템플릿**으로 묶어 일괄 배포·관리하는 단위다. AWS는 PCI-DSS, HIPAA, NIST, CIS, FedRAMP 등에 대응하는 **샘플 conformance pack**을 제공한다.

```yaml
Resources:
  S3PublicReadProhibited:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
  EncryptedVolumes:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: encrypted-volumes
      Source:
        Owner: AWS
        SourceIdentifier: ENCRYPTED_VOLUMES
```

Organizations와 결합하면 **organization conformance pack**으로 모든 멤버 계정에 동일한 규칙 세트를 배포하고, 위임 관리자(delegated administrator)가 집계된 준수 상태를 본다.

Conformance pack 템플릿에는 규칙만이 아니라 **교정 액션과 파라미터까지** 함께 담을 수 있다. 즉 "이 규정을 지키기 위한 판정 기준과 위반 시 조치"를 한 파일로 묶어 버전 관리한다.

```yaml
Parameters:
  RestrictedPortsParam:
    Type: String
    Default: '3389,23,3306,5432'

Resources:
  RestrictedCommonPorts:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: restricted-common-ports
      Source:
        Owner: AWS
        SourceIdentifier: RESTRICTED_INCOMING_TRAFFIC
      InputParameters:
        blockedPort1: 3389
        blockedPort2: 23
      Scope:
        ComplianceResourceTypes: [ "AWS::EC2::SecurityGroup" ]

  RestrictedCommonPortsRemediation:
    Type: AWS::Config::RemediationConfiguration
    Properties:
      ConfigRuleName: restricted-common-ports
      TargetType: SSM_DOCUMENT
      TargetId: AWSConfigRemediation-RemoveUnrestrictedSourceInSecurityGroup
      Automatic: false          # 먼저 수동으로 돌려 보고 자동화한다
      MaximumAutomaticAttempts: 3
      RetryAttemptSeconds: 60
      Parameters:
        AutomationAssumeRole:
          StaticValue:
            Values: [ "arn:aws:iam::111122223333:role/ConfigRemediationRole" ]
        GroupId:
          ResourceValue: { Value: RESOURCE_ID }
```

### Config Rule · Conformance Pack · Security Hub 표준을 헷갈리지 않기

| | Config Rule | Conformance Pack | Security Hub 보안 표준 |
|---|------------|------------------|------------------------|
| 단위 | 규칙 1개 | 규칙 + 교정의 묶음(템플릿) | 통제 항목의 집합(CIS, FSBP 등) |
| 배포 방식 | 개별 생성 | YAML 템플릿 일괄 배포 | 표준을 활성화 |
| 조직 배포 | 개별/CFN StackSets | **organization conformance pack** | Security Hub 위임 관리자 |
| 교정 포함 | 별도 연결 | 템플릿에 포함 가능 | 직접 교정은 아님(결과 집계 중심) |
| 커스텀 규칙 | 가능 | 가능(템플릿에 포함) | 표준 자체는 고정 |
| 무엇을 산출하나 | 리소스별 준수 상태 | 팩 단위 준수 점수 | 통제별 결과·전체 보안 점수 |

세 가지의 관계는 **포함 관계가 아니라 계층 관계**다. Security Hub의 여러 통제는 내부적으로 Config 규칙을 근거로 판정하므로 Config recorder가 꺼져 있으면 그 통제들이 제대로 평가되지 않는다. 시험에서 "Security Hub를 켰는데 다수 통제가 결과를 내지 않는다"가 나오면 대개 **Config가 그 리전에서 기록 중이 아니기 때문**이다. 반대 방향의 오해도 흔하다 — Config는 규정 준수 *평가 엔진*이고, Security Hub는 여러 소스의 결과를 모아 *한 화면으로 보여 주는* 계층이다. 배포와 판정은 Config에서, 집계와 우선순위는 Security Hub에서 일어난다.

> 💡 **관련 이론**: Conformance pack은 *compliance as code*의 구현이다. 규정 통제 항목(control)을 사람이 체크리스트로 점검하는 대신, 기계가 지속적으로 평가하는 코드로 바꾼다. 이것이 *continuous compliance*다 — 연 1회 감사 스냅샷이 아니라 변경이 일어나는 매 순간 평가한다. NIST 800-137의 ISCM(Information Security Continuous Monitoring) 개념과 직결된다.

> 📚 **사례**: 규제 산업의 감사 실무에서 오래 반복돼 온 실패 패턴이 이른바 "감사 주간 현상"이다. 감사가 예고되면 그 주에만 설정을 정돈하고, 감사관이 떠나면 운영 편의를 위해 하나둘 되돌아간다. 종이 체크리스트 기반 감사는 이 되돌림을 구조적으로 볼 수 없다 — **점(감사일)만 보고 선(1년)을 보지 못하기 때문**이다. Conformance pack과 Config 타임라인의 결합이 바꾸는 것이 바로 이 지점이다. "감사일에 준수했는가"가 아니라 "지난 1년 중 며칠을 위반 상태로 보냈는가"를 물을 수 있게 되고, 그 순간 준수는 이벤트가 아니라 상태가 된다. 클라우드 규제 대응이 종이 감사보다 강해질 수 있는 유일한 이유가 여기 있다.

## 자동 교정(Auto Remediation): 탐지를 넘어 수정으로

규칙이 `NON_COMPLIANT`를 찾는 데서 그치지 않고 **자동 교정**으로 원하는 상태를 강제할 수 있다. Config는 **SSM Automation 문서**를 교정 액션으로 호출한다. AWS 제공 문서(예: `AWS-DisableS3BucketPublicReadWrite`, `AWS-DetachIAMPolicy`)나 커스텀 문서를 연결한다.

```yaml
RemediationConfiguration:
  ConfigRuleName: s3-bucket-public-read-prohibited
  TargetType: SSM_DOCUMENT
  TargetId: AWS-DisableS3BucketPublicReadWrite
  Automatic: true
  MaximumAutomaticAttempts: 3
  RetryAttemptSeconds: 60
  Parameters:
    AutomationAssumeRole:
      StaticValue: { Values: ["arn:aws:iam::111122223333:role/ConfigRemediationRole"] }
    S3BucketName:
      ResourceValue: { Value: "RESOURCE_ID" }
```

`Automatic: true`면 위반 탐지 즉시 교정이 실행된다(수동이면 콘솔에서 버튼으로 트리거). 교정용 IAM 역할(`AutomationAssumeRole`)에는 실제 수정 권한이 있어야 한다.

> ⚠️ **함정**: 자동 교정은 강력하지만 *루프*나 *서비스 중단*을 일으킬 수 있다. 예를 들어 운영상 필요한 0.0.0.0/0 규칙을 자동으로 닫아버리면 장애가 난다. 또 교정이 리소스를 바꾸면 새 CI가 생기고 규칙이 다시 평가되므로, 잘못 설계하면 변경→평가→교정 루프가 돈다. 운영 환경에서는 먼저 수동 교정 또는 알림만으로 검증한 뒤 자동화하는 것이 안전하다.

> 🎯 **시나리오**: "퍼블릭 읽기 가능한 S3 버킷이 만들어지면 자동으로 차단하라." 정답: Config 규칙 `s3-bucket-public-read-prohibited` + SSM Automation 교정 `AWS-DisableS3BucketPublicReadWrite`를 `Automatic: true`로 연결. SCP로 막는 방법도 있지만, Config 교정은 *이미 만들어진* 리소스를 *되돌리는* 탐지·대응 통제이고, SCP는 *애초에 막는* 예방 통제다 — 둘의 계층(detective vs preventive)을 구분하는 것이 시험 포인트다.

### 자동 교정을 안전하게 켜는 순서

자동 교정은 프로덕션에서 사고를 내기 가장 쉬운 기능 중 하나다. 실무에서 검증된 도입 순서가 있다.

```
1단계  규칙만 배포        → NON_COMPLIANT를 관찰만 한다 (며칠~몇 주)
2단계  오탐 정리          → 예외를 태그·Scope로 걸러낸다
3단계  수동 교정          → Automatic: false. 사람이 버튼을 눌러 결과를 확인
4단계  비프로덕션 자동화  → dev/stage 계정에서만 Automatic: true
5단계  프로덕션 자동화    → 변경 알림·롤백 절차와 함께
```

2단계의 "예외 처리"가 특히 중요하다. Config 규칙의 `Scope`에는 리소스 타입뿐 아니라 **태그 키·값**을 지정할 수 있어서, `Exception=approved` 같은 태그가 붙은 리소스를 평가 대상에서 뺄 수 있다. 다만 이 장치는 양날의 검이다 — 태그를 붙일 수 있는 사람이 곧 규칙을 무력화할 수 있는 사람이 되기 때문이다. 그래서 예외 태그를 쓰는 조직은 거의 예외 없이 **"그 태그를 붙이는 행위 자체"를 별도로 감시**한다(CloudTrail의 `CreateTags`/`TagResource` 이벤트 경보). 통제를 우회하는 문을 만들 때는 그 문에도 카메라를 달아야 한다.

> ⚠️ **함정**: 교정용 역할(`AutomationAssumeRole`)의 권한은 조용히 비대해지기 쉽다. 교정 문서 하나를 추가할 때마다 필요한 권한이 늘고, 결국 "이 계정에서 거의 뭐든 고칠 수 있는 역할"이 만들어진다. 그런데 이 역할은 **SSM Automation이 사람 승인 없이 맡을 수 있는 역할**이다. 즉 교정 파이프라인을 장악하면 곧 그 권한을 얻는다. 자동 교정을 설계할 때는 규칙마다 별도의 최소 권한 역할을 두거나, 최소한 역할 신뢰 정책에 `aws:SourceAccount`·`ssm.amazonaws.com` 제한을 걸어야 한다. 보안 통제를 위해 만든 자산이 새로운 권한 상승 경로가 되는 것은 흔한 아이러니다.

## Config Aggregator: 다계정·다리전 집계

**Configuration Aggregator**는 여러 계정·리전의 Config 데이터를 단일 뷰로 모은다. Organizations 기반 aggregator를 쓰면 조직 전체의 규칙 준수 상태와 리소스 인벤토리를 한 곳에서 본다. 보안팀이 "조직 전체에서 암호화 안 된 EBS가 어디 있나"를 한 번에 쿼리할 수 있다.

```
[ 조직 전체 구성 가시성의 배치 ]

  계정 A (ap-northeast-2, us-east-1, eu-west-1)
  계정 B (ap-northeast-2, us-east-1)          각 리전마다 recorder가 돌아야 한다
  계정 C (ap-northeast-2)                      ← 안 켠 리전 = 인벤토리에서 통째로 누락
     │  │  │
     └──┴──┴────────▶ Configuration Aggregator (보안 계정)
                        ├─ 조직 기반: 계정별 승인 불필요, 신규 계정 자동 포함
                        ├─ 개별 계정 기반: 각 계정이 PutAggregationAuthorization 필요
                        └─ Advanced Query로 조직 전체를 한 번에 조회
```

> ⚠️ **함정**: aggregator는 **모으기만 할 뿐 켜 주지는 않는다.** 어떤 계정·리전에서 recorder가 꺼져 있으면 그 범위의 리소스는 집계 화면에 *위반으로도, 준수로도* 나타나지 않고 그냥 없는 것처럼 보인다. 이것이 다계정 환경에서 가장 위험한 실패 양상이다 — 대시보드가 초록색인 이유가 "안전해서"가 아니라 "안 보고 있어서"일 수 있기 때문이다. 그래서 조직 차원의 첫 번째 Config 규칙은 역설적이게도 **"모든 계정·리전에서 Config recorder가 켜져 있는가"** 를 확인하는 것이어야 한다.

```sql
-- Aggregator advanced query: 조직 전체에서 관리 포트가 전 세계로 열린 보안 그룹
SELECT accountId, awsRegion, resourceId, resourceName, tags
WHERE resourceType = 'AWS::EC2::SecurityGroup'
  AND configuration.ipPermissions.ipRanges.cidrIp = '0.0.0.0/0'
  AND configuration.ipPermissions.fromPort IN (22, 3389, 3306, 5432)

-- 조직 전체에서 암호화되지 않은 EBS 볼륨
SELECT accountId, awsRegion, resourceId, configuration.size
WHERE resourceType = 'AWS::EC2::Volume'
  AND configuration.encrypted = false
```

> 🎯 **시나리오**: "인수한 계열사 계정 40개가 조직에 막 합류했다. 보안팀이 하루 안에 '무엇이 어디에 있고 무엇이 위험한지' 그림을 그려야 한다." 순서는 (1) 모든 계정·리전에서 Config recorder 활성화, (2) 보안 계정에 organization aggregator 생성, (3) advanced query로 인벤토리와 노출 리소스 목록 확보, (4) organization conformance pack으로 기준선 규칙 일괄 배포. 여기서 (1)을 건너뛰고 (2)부터 하면 텅 빈 대시보드를 보게 된다. Config는 *기록을 시작한 시점부터*의 세계만 알고 있다는 점이 CloudTrail과 똑같다.

> 🔍 **더 깊이**: Config의 진짜 가치는 *advanced query*와 *관계 그래프*에 있다. Config는 리소스 간 관계(`relationships`)를 기록하므로, "이 KMS 키를 사용하는 모든 리소스", "이 보안 그룹이 붙은 모든 ENI"를 추적할 수 있다. Config advanced query는 SQL 유사 구문으로 인벤토리를 조회한다:
>
> ```sql
> SELECT resourceId, resourceName
> WHERE resourceType = 'AWS::EC2::SecurityGroup'
>   AND configuration.ipPermissions.ipRanges.cidrIp = '0.0.0.0/0'
> ```
>
> 침해 조사에서 "측면 이동(lateral movement)" 경로를 재구성할 때 이 관계 그래프가 결정적이다. CloudTrail의 활동 로그와 Config의 상태·관계 그래프를 교차하면 공격의 전체 그림이 그려진다 — 이것이 내일(3일차) 네트워크 로깅, 그리고 5일차 종합으로 이어진다.

## Config를 쓸 때 비용이 새는 곳

Config의 과금은 크게 두 갈래다 — **기록된 구성 항목 수**와 **규칙 평가 횟수**. 둘 다 "리소스가 얼마나 자주 바뀌는가"에 비례하므로, 변동이 심한 리소스 타입이 청구서를 지배한다.

| 비용이 튀는 원인 | 왜 생기나 | 대응 |
|-----------------|----------|------|
| 오토스케일링·컨테이너로 인한 ENI·인스턴스 대량 생성·삭제 | 생성·삭제마다 CI가 쌓인다 | 해당 타입을 기록 범위에서 제외하거나 일간 기록 고려 |
| 글로벌 리소스를 모든 리전에서 기록 | IAM 등이 리전 수만큼 중복 기록 | 한 리전에서만 `includeGlobalResourceTypes=true` |
| 변경 트리거 규칙을 고빈도 리소스에 적용 | CI가 생길 때마다 평가 | 주기 평가로 바꾸거나 `Scope`를 좁힌다 |
| 교정 루프 | 교정 → 새 CI → 재평가 → 교정 … | 교정 로직이 멱등한지 확인, 최대 시도 횟수 제한 |

> ⚠️ **함정**: 비용을 줄이겠다고 기록 대상 리소스 타입을 좁히는 것은 **가시성을 줄이는 결정**이기도 하다. 특히 IAM 관련 타입(`AWS::IAM::Role`, `AWS::IAM::Policy`), 네트워크 경계 타입(`AWS::EC2::SecurityGroup`, `AWS::EC2::NetworkAcl`), 데이터 저장소 타입(`AWS::S3::Bucket`, `AWS::RDS::DBInstance`)은 침해 조사에서 가장 자주 참조되는 세 묶음이므로 비용 최적화의 대상으로 삼아서는 안 된다. 깎아야 한다면 고빈도·저가치 타입(임시 ENI 등)부터 손대는 것이 원칙이다. **"무엇을 볼 것인가"의 결정은 예산 문제로 위장한 위험 결정이다.**

## 한 줄 요약

CloudTrail이 *사건*을 남긴다면 AWS Config는 *상태와 그 지속 시간*을 남긴다. 이 차이 하나가 "누가 열었나"와 "얼마나 오래 열려 있었나"를 가르고, 후자가 규제 통지와 피해 산정을 좌우한다. Config를 실무에서 쓴다는 것은 네 개의 결정을 내린다는 뜻이다. **무엇을 기록할 것인가**(recorder의 범위 — 리전마다 켜야 하고, 글로벌 리소스는 한 리전에서만, 그리고 만들어 놓고 `start`를 잊으면 아무것도 안 남는다), **무엇을 기준으로 볼 것인가**(관리형 → Guard → Lambda 순으로 내려가되 위에서 표현 가능하면 내려가지 않는다), **어디까지 자동으로 되돌릴 것인가**(교정은 관찰 → 수동 → 비프로덕션 자동 → 프로덕션 자동의 순서로만 켠다), **어떻게 조직 전체를 한 화면으로 볼 것인가**(organization conformance pack으로 배포하고 aggregator로 모은다). 그리고 이 모든 것 위에 하나의 경고가 있다 — 준수 대시보드의 초록색은 안전을 뜻하지 않을 수 있다. `INSUFFICIENT_DATA`와 recorder가 꺼진 리전은 위반으로 세어지지 않고 그냥 보이지 않으므로, 리포트를 읽을 때 **위반 건수보다 평가되지 않은 건수를 먼저 봐야 한다.**

---

## 📝 연습 문제

**문제 1.** AWS Config와 CloudTrail의 역할 구분으로 가장 정확한 것은?

A) 둘 다 동일하게 API 호출만 기록하므로 하나만 켜면 된다  
B) CloudTrail은 "누가 무엇을 했는가"(활동)를, Config는 "리소스가 각 시점에 어떤 상태였는가"(구성 상태·이력)를 기록한다  
C) Config는 실시간 API 호출을, CloudTrail은 주기적 스냅샷을 기록한다  
D) Config는 네트워크 트래픽을, CloudTrail은 구성 변경을 기록한다  

**정답: B**  
해설: CloudTrail은 API 호출 활동(누가/언제/무엇을)을 기록하고, Config는 리소스의 구성 항목(CI)을 통해 각 시점의 상태와 구성 타임라인, 리소스 간 관계를 기록한다. 둘은 보완적이며 함께 써야 활동과 상태를 교차 분석할 수 있다. 역할이 동일하지 않고, 트래픽 로깅은 VPC Flow Logs의 영역이다.

---

**문제 2.** AWS 관리형 규칙으로는 표현할 수 없는, "모든 EBS 볼륨이 특정 CMK(지정된 KMS 키 ARN)로 암호화돼야 한다"는 조직 특화 요구를 평가해야 한다. 적절한 방법은?

A) 관리형 규칙 `encrypted-volumes`만 사용  
B) Custom Lambda rule 또는 Custom Policy(Guard) rule로 특정 키 ARN 일치를 평가  
C) CloudTrail 데이터 이벤트로 평가  
D) SCP로 EBS 생성을 차단  

**정답: B**  
해설: 관리형 `encrypted-volumes`는 암호화 *여부*만 본다. *특정 키*로의 암호화 강제는 커스텀 평가 로직이 필요하므로 Custom Lambda rule(또는 코드 없는 Custom Policy/Guard rule)로 `configuration.kmsKeyId`를 지정 ARN과 비교한다. CloudTrail은 활동 기록이지 준수 평가 엔진이 아니고, SCP는 예방 통제로 "특정 키 암호화" 평가를 표현하기 어렵다.

---

**문제 3.** 여러 규정(CIS, PCI-DSS)의 다수 Config 규칙과 교정을 다계정 조직에 일관되게 배포·관리하려 한다. 가장 적절한 것은?

A) 각 계정에서 규칙을 하나씩 콘솔로 생성  
B) Organization Conformance Pack으로 규칙·교정을 YAML 템플릿으로 묶어 모든 멤버 계정에 배포  
C) 계정마다 별도 Lambda 규칙 작성  
D) Config Aggregator만 설정  

**정답: B**  
해설: Conformance Pack은 다수의 Config 규칙과 교정 액션을 하나의 YAML 템플릿으로 묶어 배포·관리하는 단위이며, organization conformance pack으로 조직 전체 멤버 계정에 일괄 배포하고 위임 관리자가 집계 준수 상태를 본다. 개별 생성은 일관성·확장성이 없고, Aggregator는 데이터를 *집계해 보는* 도구일 뿐 규칙을 배포하지 않는다.

---

**문제 4.** 퍼블릭 읽기 가능한 S3 버킷이 생성되면 사람 개입 없이 자동으로 차단하려 한다. Config로 구현하는 방법은?

A) `s3-bucket-public-read-prohibited` 규칙에 SSM Automation 교정(`AWS-DisableS3BucketPublicReadWrite`)을 `Automatic: true`로 연결한다  
B) CloudTrail 무결성 검증을 켠다  
C) Config Aggregator를 설정한다  
D) 규칙을 만들고 매일 수동으로 검토한다  

**정답: A**  
해설: Config 규칙이 위반을 탐지하면 연결된 SSM Automation 문서를 교정 액션으로 호출하며, `Automatic: true`로 설정하면 탐지 즉시 자동 실행된다. `AWS-DisableS3BucketPublicReadWrite`는 퍼블릭 액세스를 차단하는 AWS 제공 문서다. 무결성 검증·Aggregator는 교정과 무관하고, 수동 검토는 "사람 개입 없이"라는 요구를 만족하지 못한다.

---

**문제 5.** Config 자동 교정을 운영 환경에 도입할 때 가장 주의해야 할 위험은?

A) Config가 리전 간 자동 복제되어 비용이 두 배가 된다  
B) 교정이 리소스를 변경하면 새 CI가 생겨 규칙이 재평가되므로, 잘못 설계하면 변경→평가→교정 루프나 운영 중단을 유발할 수 있다  
C) 교정은 IAM 역할 없이 동작하므로 권한 통제가 불가능하다  
D) 자동 교정은 글로벌 리소스에만 적용된다  

**정답: B**  
해설: 교정이 리소스를 수정하면 새 구성 항목이 생성되어 규칙이 다시 평가되며, 설계가 잘못되면 평가-교정 루프가 돌거나 운영상 필요한 설정(예: 의도된 공개 규칙)을 닫아 장애를 낼 수 있다. 그래서 먼저 수동 교정·알림으로 검증 후 자동화하는 것이 안전하다. 교정은 `AutomationAssumeRole`로 권한이 통제되며, 리전 자동 복제나 글로벌 한정 같은 동작은 없다.

---
