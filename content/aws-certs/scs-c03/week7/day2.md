# Day 2 - AWS Config: 구성 항목·기록, 규칙(관리형/커스텀 Lambda), Conformance Pack, 자동 교정

CloudTrail이 "누가 무엇을 했는가"(활동)를 기록한다면, **AWS Config**는 "리소스가 *지금* 그리고 *과거의 각 시점에* 어떤 상태였는가"(구성)를 기록한다. 둘은 보완 관계다. 침해 조사에서 CloudTrail은 `AuthorizeSecurityGroupIngress` 호출을 보여주지만, AWS Config는 그 결과 보안 그룹이 *0.0.0.0/0:22*로 열렸고 그것이 며칠간 지속됐다는 *상태와 시간선*을 보여준다.

보안 시험에서 Config는 "규정 준수 평가", "구성 드리프트 탐지", "원하는 상태 강제(자동 교정)"의 핵심 도구다.

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

**Configuration Recorder**가 어떤 리소스 타입을 기록할지 결정한다. 전 리소스 기록, 특정 타입만, 글로벌 리소스(IAM 등) 포함 여부를 설정한다. 기록된 CI와 스냅샷·기록 변경 이력은 **delivery channel**을 통해 S3 버킷에 저장되고, SNS로 알림된다.

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

> 💡 **관련 이론**: Conformance pack은 *compliance as code*의 구현이다. 규정 통제 항목(control)을 사람이 체크리스트로 점검하는 대신, 기계가 지속적으로 평가하는 코드로 바꾼다. 이것이 *continuous compliance*다 — 연 1회 감사 스냅샷이 아니라 변경이 일어나는 매 순간 평가한다. NIST 800-137의 ISCM(Information Security Continuous Monitoring) 개념과 직결된다.

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

## Config Aggregator: 다계정·다리전 집계

**Configuration Aggregator**는 여러 계정·리전의 Config 데이터를 단일 뷰로 모은다. Organizations 기반 aggregator를 쓰면 조직 전체의 규칙 준수 상태와 리소스 인벤토리를 한 곳에서 본다. 보안팀이 "조직 전체에서 암호화 안 된 EBS가 어디 있나"를 한 번에 쿼리할 수 있다.

> 🔍 **더 깊이**: Config의 진짜 가치는 *advanced query*와 *관계 그래프*에 있다. Config는 리소스 간 관계(`relationships`)를 기록하므로, "이 KMS 키를 사용하는 모든 리소스", "이 보안 그룹이 붙은 모든 ENI"를 추적할 수 있다. Config advanced query는 SQL 유사 구문으로 인벤토리를 조회한다:
>
> ```sql
> SELECT resourceId, resourceName
> WHERE resourceType = 'AWS::EC2::SecurityGroup'
>   AND configuration.ipPermissions.ipRanges.cidrIp = '0.0.0.0/0'
> ```
>
> 침해 조사에서 "측면 이동(lateral movement)" 경로를 재구성할 때 이 관계 그래프가 결정적이다. CloudTrail의 활동 로그와 Config의 상태·관계 그래프를 교차하면 공격의 전체 그림이 그려진다 — 이것이 내일(3일차) 네트워크 로깅, 그리고 5일차 종합으로 이어진다.

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
