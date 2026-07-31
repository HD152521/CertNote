# Day 1 - 자동 대응 파이프라인: EventBridge + SSM Automation + Lambda로 핀딩 자동 교정

인시던트 대응의 성숙도는 *"얼마나 빨리, 일관되게, 사람의 손을 거치지 않고"* 위협을 봉쇄하느냐로 갈린다. GuardDuty가 EC2 인스턴스의 C2(command-and-control) 통신을 탐지하는 데 5분이 걸려도, 그 핀딩을 사람이 콘솔에서 읽고 격리 조치를 취하는 데 30분이 걸린다면 공격자는 이미 측면 이동(lateral movement)을 끝냈을 것이다. 자동 대응 파이프라인(automated remediation pipeline)의 본질은 *탐지 신호를 결정론적 조치로 변환하는 이벤트 구동 자동화*다. 시험 관점의 핵심은 "어떤 이벤트가, 어떤 라우팅을 거쳐, 어떤 실행 엔진으로, 어떤 권한으로 교정되는가"의 흐름을 정확히 그리는 것이다.

이 파이프라인의 표준 골격은 세 부분이다: **신호원(GuardDuty/Security Hub/Config/Inspector)** → **라우터(EventBridge)** → **실행기(SSM Automation 또는 Lambda)**. 각 단계의 책임과 함정이 시험에 반복 출제된다.

## 신호원: 핀딩은 어디서 와서 어떤 모양인가

자동 대응의 트리거는 대부분 보안 서비스가 EventBridge로 내보내는 이벤트다. 신호원마다 이벤트 패턴(event pattern)의 `source`와 `detail-type`이 다르다.

- **GuardDuty**: `source: aws.guardduty`, `detail-type: "GuardDuty Finding"`. `detail.severity`(0~10 스케일), `detail.type`(예: `UnauthorizedAccess:EC2/SSHBruteForce`), `detail.resource`에 영향받은 리소스.
- **Security Hub**: `source: aws.securityhub`, `detail-type: "Security Hub Findings - Imported"`. ASFF(AWS Security Finding Format) 정규화 포맷이라 *여러 신호원을 한 형태로* 받을 수 있다 — 자동화의 단일 진입점으로 선호.
- **AWS Config**: `source: aws.config`, `detail-type: "Config Rules Compliance Change"`. 규정 위반(NON_COMPLIANT) 전이를 트리거.
- **Inspector**: 취약점 핀딩.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }],
    "type": [{ "prefix": "UnauthorizedAccess:EC2" }]
  }
}
```

위 이벤트 패턴은 *심각도 7 이상이면서 EC2 무단 접근 계열인* 핀딩만 골라낸다. EventBridge 패턴은 `numeric`, `prefix`, `anything-but` 같은 내용 기반 필터링을 지원해 노이즈를 줄인다. 모든 핀딩에 무차별 대응하면 false positive로 정상 워크로드를 격리하는 사고가 난다.

> 💡 **관련 이론**: 이것은 제어 이론의 *피드백 루프(feedback loop)*를 보안에 적용한 것이다. 센서(GuardDuty)가 시스템 상태를 측정하고, 컨트롤러(EventBridge 규칙)가 임계값과 비교해 액추에이터(SSM/Lambda)를 작동시킨다. 산업 제어에서 임계값을 너무 민감하게 잡으면 *hunting*(불필요한 진동)이 일어나듯, 보안 자동화도 임계값(severity)과 조건을 신중히 설정하지 않으면 정상 변동에 과잉 반응한다. 그래서 처음엔 알림만(human-in-the-loop), 신뢰가 쌓이면 자동 교정으로 단계적 전환하는 것이 정석이다.

### 신호원 비교: 무엇을 트리거로 삼을 것인가

같은 사고라도 어떤 신호를 방아쇠로 잡느냐에 따라 파이프라인의 모양이 달라진다. 보기에 "여러 계정·여러 도구의 핀딩을 하나의 자동화로 처리"라는 문구가 보이면 답은 거의 항상 Security Hub 집계다.

| 신호원 | `source` | 대표 `detail-type` | 신호의 성격 | 자동 대응에서의 자리 |
|---|---|---|---|---|
| GuardDuty | `aws.guardduty` | `GuardDuty Finding` | 위협 *행위* 탐지 | 격리·세션 폐기 등 즉시 봉쇄 |
| Security Hub | `aws.securityhub` | `Security Hub Findings - Imported` | 다신호원 집계(ASFF) | 조직 단일 진입점 |
| Security Hub 사용자 액션 | `aws.securityhub` | `Security Hub Findings - Custom Action` | 분석가가 콘솔에서 버튼을 누름 | *사람이 방아쇠를 당기는* 반자동 |
| AWS Config | `aws.config` | `Config Rules Compliance Change` | 구성 *상태* 일탈 | 설정 복원형 교정 |
| Inspector | `aws.inspector2` | `Inspector2 Finding` | 취약점·CVE | 패치 오케스트레이션 |
| Macie | `aws.macie` | `Macie Finding` | 민감 데이터 노출 | 버킷 잠금·권한 축소 |
| CloudTrail 경유 API 호출 | 각 서비스(`aws.s3`, `aws.iam` 등) | `AWS API Call via CloudTrail` | 감사 이벤트 | 루트 사용·정책 변경 탐지 |

표의 4번째 열이 설계 판단의 축이다. **GuardDuty는 "행위"를, Config는 "상태"를 말한다.** 행위 신호는 시간에 민감해 즉시 봉쇄가 정답이 되고, 상태 신호는 원래 값으로 되돌리는 교정이 정답이 된다. "퍼블릭이 된 S3 버킷을 자동으로 닫아라"가 Config 경로, "이 인스턴스가 지금 C2와 통신 중이다"가 GuardDuty 경로다. 보기에서 이 둘이 섞여 나오면 요구사항의 동사가 *봉쇄*인지 *복원*인지부터 가른다.

`Security Hub Findings - Custom Action`은 자주 간과되지만 시험에 유용한 카드다. 콘솔에서 분석가가 핀딩을 고르고 커스텀 액션 버튼을 누르면 그 자체가 EventBridge 이벤트가 된다. "완전 자동은 위험하지만 분석가가 원클릭으로 표준 대응을 실행하게 하고 싶다"는 요구사항의 정답이 이것이다 — **자동화와 수동 사이의 중간 지대**를 AWS가 제품으로 제공하는 지점이다.

### ASFF: 왜 Security Hub를 단일 진입점으로 삼는가

Security Hub는 GuardDuty·Inspector·Macie·Config·서드파티 핀딩을 **ASFF(AWS Security Finding Format)**라는 하나의 JSON 스키마로 정규화한다. 자동화 코드 입장에서 이것이 결정적이다 — 신호원마다 다른 필드 경로를 파싱하는 분기문이 사라진다.

```json
// ASFF 핵심 필드 (자동화가 실제로 읽는 부분만 발췌)
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/abc/finding/xyz",
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Command and Control/UnauthorizedAccess:EC2-MaliciousIPCaller.Custom"],
  "Severity": { "Label": "HIGH", "Normalized": 70 },
  "Resources": [
    { "Type": "AwsEc2Instance", "Id": "arn:aws:ec2:ap-northeast-2:111122223333:instance/i-0deadbeef",
      "Details": { "AwsEc2Instance": { "IamInstanceProfileArn": "arn:aws:iam::111122223333:instance-profile/app-role" } } }
  ],
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE"
}
```

세 가지를 기억하면 된다. ① **심각도는 이중 표기**다 — GuardDuty의 0.1~10 스케일(통상 Low 1.0–3.9, Medium 4.0–6.9, High 7.0–8.9)이 Security Hub에서는 `Severity.Label`(INFORMATIONAL/LOW/MEDIUM/HIGH/CRITICAL)과 `Severity.Normalized`(0~100)로 다시 표현된다. 두 경로를 섞어 쓰면 임계값이 어긋난다. ② `Resources[].Id`는 **ARN**이라 인스턴스 ID만 필요한 런북에는 파싱이 한 번 더 필요하다. ③ `Workflow.Status`와 `RecordState`가 자동화의 **중복 실행 방지 열쇠**다 — 이미 `NOTIFIED`/`RESOLVED`로 옮긴 핀딩을 다시 처리하지 않도록 이벤트 패턴에서 `Workflow.Status: ["NEW"]`로 걸러야 한다.

```json
// Security Hub 진입점 패턴: 심각도 + 신호원 + 미처리 상태를 동시에 건다
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": { "Label": ["HIGH", "CRITICAL"] },
      "Workflow": { "Status": ["NEW"] },
      "RecordState": ["ACTIVE"],
      "ProductName": ["GuardDuty"]
    }
  }
}
```

### 이벤트 패턴 문법: 노이즈를 줄이는 연산자

EventBridge 패턴은 단순 값 일치를 넘어 내용 기반 필터링을 지원한다. 이 연산자를 모르면 "Lambda 안에서 if 문으로 거른다"는 비효율적 설계로 흐르고, 시험에서도 그런 보기가 오답으로 배치된다.

| 연산자 | 예시 | 쓰임 |
|---|---|---|
| `numeric` | `{"numeric": [">=", 7]}` | 심각도 임계값 |
| `prefix` | `{"prefix": "UnauthorizedAccess:"}` | 핀딩 타입 계열 묶기 |
| `anything-but` | `{"anything-but": ["ap-northeast-2"]}` | 승인 리전 외 활동만 |
| `exists` | `{"exists": true}` | 특정 필드가 있는 이벤트만 |
| `cidr` | `{"cidr": "10.0.0.0/8"}` | 내부/외부 IP 구분 |

```json
// "승인 리전 밖에서, 심각도 7 이상, 자격증명 계열" 만 골라낸다
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "region": [{ "anything-but": ["ap-northeast-2", "us-east-1"] }],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }],
    "type": [{ "prefix": "UnauthorizedAccess:IAMUser" }, { "prefix": "CredentialAccess:" }],
    "resource": { "accessKeyDetails": { "accessKeyId": [{ "exists": true }] } }
  }
}
```

**필터링은 라우터에서 끝내는 것이 원칙이다.** 실행기(Lambda/SSM)까지 이벤트가 도달했다는 사실 자체가 "이건 대응 대상"이라는 의미가 되어야, 실행기 코드가 단순해지고 감사 로그가 깨끗해진다. 실행기 안에서 조건 분기로 대부분을 버리는 설계는 호출 비용·동시성·오작동 가능성을 모두 키운다.

> 📚 **사례**: 2014년 6월, 영국의 코드 호스팅 업체 **Code Spaces**는 AWS 콘솔 접근 권한을 탈취당한 뒤 몸값을 요구받았다. 운영자가 계정 통제권을 되찾으려 시도하자 공격자는 준비해 둔 백업 계정으로 갈아타며 EBS 볼륨·S3 버킷·AMI·스냅샷, 그리고 **백업까지 같은 계정 안에 있던 탓에 백업 사본마저** 대량 삭제했다. 회사는 사실상 하루 만에 사업을 접었다. 이 사건이 자동 대응 설계의 교과서적 반례인 이유는 세 가지다. ① 대응이 전적으로 *사람이 콘솔에서 공격자와 경쟁하는* 형태였고, 공격자는 스크립트로 삭제했다 — 속도 싸움에서 사람은 이길 수 없다. ② 봉쇄의 첫 수단이 *자격증명 무력화*여야 했는데 그것이 늦었다. ③ **백업과 증거를 같은 계정에 둔 설계**가 복구 가능성 자체를 지웠다. 오늘 배우는 파이프라인의 존재 이유가 ①이고, Day 2의 포렌식 계정 분리가 ③에 대한 답이다.

## 라우터: EventBridge가 이벤트를 어디로 보내는가

EventBridge 규칙은 *패턴에 매칭된 이벤트를 하나 이상의 타깃으로 라우팅*한다. 자동 대응에서 자주 쓰는 타깃:

- **SSM Automation Document(런북)** — 멱등적·다단계 교정. EventBridge가 직접 `StartAutomationExecution`을 호출.
- **Lambda 함수** — 커스텀 로직, API 호출, 조건 분기.
- **Step Functions** — 다단계 워크플로우(승인 게이트, 병렬 조치, 재시도).
- **SNS** — 사람에게 알림(자동화와 병행).

타깃이 SSM/Lambda면 EventBridge에 *해당 액션을 실행할 IAM 역할*을 부여해야 한다. 이 역할의 권한이 곧 자동화가 할 수 있는 일의 범위다 — 최소 권한(least privilege)이 핵심이다.

```yaml
# EventBridge Rule → SSM Automation 타깃 (CloudFormation 발췌)
GuardDutyToIsolation:
  Type: AWS::Events::Rule
  Properties:
    EventPattern:
      source: ["aws.guardduty"]
      detail-type: ["GuardDuty Finding"]
      detail:
        severity: [{ "numeric": [">=", 7] }]
    Targets:
      - Arn: !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:automation-definition/IsolateInstance"
        RoleArn: !GetAtt EventBridgeSsmRole.Arn
        Id: "isolate-target"
        InputTransformer:
          InputPathsMap:
            instanceId: "$.detail.resource.instanceDetails.instanceId"
          InputTemplate: '{"InstanceId": [<instanceId>]}'
```

`InputTransformer`는 이벤트 JSON에서 필요한 필드(인스턴스 ID)를 뽑아 런북 파라미터로 매핑한다. 이것이 *신호 → 조치 대상*을 연결하는 접점이다.

> ⚠️ **함정**: 크로스 리전·크로스 계정 라우팅. GuardDuty는 리전별 서비스이므로 각 리전에 EventBridge 규칙이 필요하다. 다계정 환경에서는 멤버 계정의 핀딩을 *관리 계정의 이벤트 버스로 전달*하거나, Security Hub로 집계한 뒤 중앙에서 대응하는 패턴을 쓴다. "한 리전에 규칙 하나 만들면 전체가 보호된다"는 오답.

### 다계정·다리전 대응 허브의 실제 구조

"규칙 하나면 조직 전체가 보호된다"는 오답을 지우려면, 실제 배치 그림을 머리에 넣어 두는 것이 가장 빠르다. 조직 규모 자동 대응은 **집계 지점 하나 + 실행 지점 다수**의 형태를 띤다.

```
[ 워크로드 계정 (수십~수백) ]                      [ 보안(Security) 계정 ]
  리전 A          리전 B                            중앙 대응 허브
  GuardDuty       GuardDuty                         │
     │ finding       │ finding                      │
     ▼               ▼                              │
  Security Hub(리전별) ──── 리전 집계 ─────────────▶ Security Hub
     │                                              │ (위임 관리자)
     │  또는 EventBridge 규칙이                       ▼
     └── 중앙 이벤트 버스로 PutEvents ───────▶  EventBridge (중앙 버스)
                                                    │
                          ┌─────────────────────────┼───────────────────┐
                          ▼                         ▼                   ▼
                    SSM Automation            Lambda(오케스트레이터)   SNS/Slack
                    (교차계정 실행)                 │ sts:AssumeRole      (사람)
                          │                         │
                          └────────── 각 워크로드 계정의 ──────────┐
                                      IR-RemediationRole          │
                                          │                       │
                                          ▼                       ▼
                                     격리·스냅샷·세션 폐기    결과를 Security Hub에
                                                              Workflow.Status 갱신

전제 ①: 대상 계정마다 IR-RemediationRole이 *사고 전에* 배포돼 있어야 한다
전제 ②: 중앙 이벤트 버스에 멤버 계정의 PutEvents를 허용하는 리소스 정책이 필요하다
전제 ③: GuardDuty는 리전별 서비스 — 규칙·탐지기를 리전마다 IaC로 배포해야 한다
```

이 그림에서 시험이 노리는 지점은 **전제 ①**이다. 자동화 Lambda가 침해 계정에서 무언가를 하려면, *그 계정 안에 이미 존재하는 역할*을 `sts:AssumeRole`로 맡아야 한다. 사고가 난 뒤에 역할을 만들 수는 없다(만들 권한 자체가 그 계정에 있어야 하므로). 그래서 "IR 대응 역할의 사전 배포"는 NIST의 *준비(Preparation)* 단계에 속하는 항목이며, Day 4에서 다시 만난다.

```bash
# 중앙 이벤트 버스에 조직 멤버 계정의 이벤트 전달을 허용
aws events put-permission \
  --event-bus-name central-security-bus \
  --statement-id AllowOrgMembers \
  --action events:PutEvents \
  --principal '*' \
  --condition Type=StringEquals,Key=aws:PrincipalOrgID,Value=o-exampleorgid

# 워크로드 계정: 로컬 규칙이 중앙 버스로 이벤트를 전달
aws events put-targets --rule GuardDutyToCentral --targets \
  'Id=central,Arn=arn:aws:events:ap-northeast-2:222233334444:event-bus/central-security-bus,RoleArn=arn:aws:iam::111122223333:role/EventBridgeCrossAccountRole'
```

`aws:PrincipalOrgID` 조건이 핵심이다. `Principal: "*"`만 두면 아무 계정이나 우리 보안 버스에 위조 이벤트를 밀어 넣어 **자동 대응을 원격으로 트리거**할 수 있다 — 자동화 파이프라인 자체에 대한 주입 공격이다. 조직 ID 조건이 그 경계를 만든다.

> ⚠️ **함정**: 자동 대응 파이프라인은 **자기 자신을 트리거하는 재귀 루프**를 만들기 쉽다. 교정 Lambda가 보안 그룹을 바꾸면 그 변경이 다시 Config 규칙 평가를 유발하고, 그 평가가 또 교정을 부른다. 방어 수단은 세 가지다. ① 교정이 만든 변경에 태그(예: `IR-Automated=true`)를 남기고 이벤트 패턴에서 `anything-but`으로 제외한다. ② 교정 역할이 만든 호출을 `userIdentity` 기준으로 필터링한다. ③ SSM Automation의 `MaximumAutomaticAttempts` 같은 시도 상한을 반드시 설정한다. 무한 루프는 요금과 API 스로틀링 양쪽에서 사고를 키우며, 정작 진짜 핀딩이 스로틀에 걸려 처리되지 않는 최악의 조합을 만든다.

## 실행기 1: SSM Automation 런북

SSM Automation Document는 *여러 AWS API 호출과 스크립트를 정해진 순서로 실행하는 선언적 런북*이다. 자동 대응에 선호되는 이유:

- **멱등성·재시도**: 단계별 `onFailure`, `maxAttempts` 제어.
- **승인 게이트**: `aws:approve` 액션으로 사람의 승인을 중간에 삽입(자동화와 사람 판단의 경계 — Day 4 주제).
- **감사성**: 모든 실행이 SSM 콘솔/CloudTrail에 단계별로 기록.
- **AWS 관리형 런북**: `AWS-DisablePublicAccessForSecurityGroup`, `AWSConfigRemediation-*` 등 즉시 사용 가능한 교정 문서 다수.

```yaml
# 침해 인스턴스 격리 런북 (SSM Automation, 발췌)
schemaVersion: '0.3'
description: "EC2 인스턴스를 격리 보안 그룹으로 교체"
assumeRole: "{{ AutomationAssumeRole }}"
parameters:
  InstanceId: { type: String }
  IsolationSgId: { type: String }
mainSteps:
  - name: snapshotVolumes
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateSnapshot
      VolumeId: "{{ ... }}"
  - name: replaceSecurityGroup
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: "{{ InstanceId }}"
      Groups: ["{{ IsolationSgId }}"]
  - name: tagForensic
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateTags
      Resources: ["{{ InstanceId }}"]
      Tags: [{ Key: "Status", Value: "QUARANTINE" }]
```

런북은 *순서가 중요한 다단계 교정*에 적합하다. "먼저 스냅샷(증거 보존) → 그 다음 격리(보안그룹 교체) → 태깅" 순서를 강제한다. 격리를 먼저 하면 인스턴스가 종료되며 휘발성 증거가 사라질 수 있다(Day 2 상세).

런북을 실전 수준으로 올리면 단계마다 *실패 처리*와 *분기*가 붙는다. 아래가 시험에서 요구하는 "다단계·순서 보장·감사 가능"의 실물이다.

```yaml
schemaVersion: '0.3'
description: "침해 EC2 표준 대응: 증거 보존 → 격리 → 세션 폐기 → 태깅"
assumeRole: "{{ AutomationAssumeRole }}"
parameters:
  InstanceId:      { type: String }
  IsolationSgId:   { type: String }
  CaseId:          { type: String, default: "INC-UNSPECIFIED" }
mainSteps:
  # 1단계: 증거부터. 실패해도 다음 단계(봉쇄)는 진행해야 하므로 Continue.
  - name: snapshotAllVolumes
    action: aws:executeAwsApi
    onFailure: Continue
    timeoutSeconds: 600
    maxAttempts: 3
    inputs:
      Service: ec2
      Api: CreateSnapshots
      InstanceSpecification: { InstanceId: "{{ InstanceId }}", ExcludeBootVolume: false }
      Description: "Forensic image {{ CaseId }}"

  # 2단계: 프로덕션 태그면 봉쇄 방식을 달리한다 (분기)
  - name: checkEnvironment
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: DescribeTags
      Filters: [{ Name: "resource-id", Values: ["{{ InstanceId }}"] }]
    outputs:
      - { Name: TagList, Selector: "$.Tags", Type: MapList }

  # 3단계: 격리 SG로 교체 — 실패하면 즉시 중단하고 사람에게 넘긴다
  - name: isolate
    action: aws:executeAwsApi
    onFailure: Abort
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: "{{ InstanceId }}"
      Groups: ["{{ IsolationSgId }}"]

  # 4단계: 케이스 태깅 — 이후 모든 자동화·조회의 기준점
  - name: tagForensic
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateTags
      Resources: ["{{ InstanceId }}"]
      Tags:
        - { Key: "IR-Status", Value: "QUARANTINE" }
        - { Key: "IR-Case",   Value: "{{ CaseId }}" }
        - { Key: "IR-Automated", Value: "true" }
```

`onFailure`를 단계마다 다르게 준 것이 설계의 핵심이다. **증거 수집 실패는 대응을 멈출 이유가 아니지만(Continue), 봉쇄 실패는 멈출 이유다(Abort).** 봉쇄가 실패했는데 런북이 "성공"으로 끝나면 아무도 인스턴스가 여전히 통신 중이라는 사실을 모른다. 자동화에서 가장 위험한 상태는 실패가 아니라 *실패했는데 성공처럼 보이는 상태*다.

마지막 `IR-Automated=true` 태그는 앞서 말한 재귀 루프 차단 표식이기도 하다.

## 실행기 2: Lambda

런북으로 표현하기 까다로운 *조건 분기·외부 API·복잡한 로직*은 Lambda가 맡는다. 예: "핀딩 타입에 따라 다른 조치", "Slack/PagerDuty 통합", "여러 계정의 STS 역할을 어셈블해 교차 계정 교정".

```python
import boto3

def handler(event, context):
    finding = event["detail"]
    severity = finding["severity"]
    ftype = finding["type"]

    if severity >= 7 and ftype.startswith("UnauthorizedAccess:IAMUser"):
        # 유출된 액세스 키 비활성화 (Day 3 주제)
        iam = boto3.client("iam")
        key_id = finding["resource"]["accessKeyDetails"]["accessKeyId"]
        user = finding["resource"]["accessKeyDetails"]["userName"]
        iam.update_access_key(
            UserName=user, AccessKeyId=key_id, Status="Inactive"
        )
        return {"action": "key_disabled", "key": key_id}
    return {"action": "noop"}
```

Lambda의 실행 역할 권한이 곧 자동화의 폭발 반경(blast radius)이다. `iam:UpdateAccessKey`만 필요한데 `iam:*`를 부여하면, Lambda 침해 시 권한 상승 경로가 된다.

> 💡 **관련 이론**: SSM Automation vs Lambda 선택은 *선언형(declarative) vs 명령형(imperative)* 자동화 패러다임의 선택이다. 런북은 "무엇을 하라"를 단계로 선언하고 감사·승인·재시도를 플랫폼이 관리한다 — 규정 준수·증거 능력이 중요한 보안 조치에 유리. Lambda는 "어떻게 하라"를 코드로 표현해 유연하지만, 감사·재시도·승인 게이트를 직접 구현해야 한다. 시험의 "best" 답은 *표준 교정 + 감사 필요*면 SSM, *복잡 로직·외부 통합*이면 Lambda로 갈린다.

### 실행기 선택표: SSM Automation vs Lambda vs Step Functions

| 축 | SSM Automation | Lambda | Step Functions |
|---|---|---|---|
| 표현 방식 | 선언적 단계(YAML/JSON) | 코드 | 상태 기계(ASL) |
| 순서·재시도 | 플랫폼 제공(`onFailure`·`maxAttempts`) | 직접 구현 | 플랫폼 제공(`Retry`·`Catch`) |
| 사람 승인 | **`aws:approve` 내장** | 없음 | `.waitForTaskToken` 콜백 |
| 실행 시간 상한 | 장시간 실행에 유리 | 함수 타임아웃에 묶임 | 장기 워크플로우에 유리 |
| 감사 기록 | 단계별 실행 이력이 SSM·CloudTrail에 남음 | CloudWatch Logs 위주 | 실행 이력 시각화 |
| AWS 관리형 자산 | `AWSConfigRemediation-*` 등 기성 문서 다수 | 없음 | 없음 |
| 최적 용도 | **표준 교정·증거 필요** | 조건 분기·외부 API·교차계정 조립 | 다단계 승인·병렬·장기 대기 |

시험 문장에서 신호를 읽는 법은 단순하다. **"승인"·"단계별 감사"·"관리형 교정 문서"가 나오면 SSM**, **"Slack/PagerDuty/티켓 시스템 연동"·"핀딩 타입별 다른 로직"이 나오면 Lambda**, **"여러 팀의 순차 승인"·"수 시간 대기"가 나오면 Step Functions**다. 셋은 경쟁 관계가 아니라 층위가 다르다 — 실무에서는 Step Functions가 오케스트레이터가 되고 그 안에서 SSM 런북과 Lambda를 호출하는 조합이 흔하다.

### 자동 실행 vs 승인 게이트: 경계를 어디에 긋는가

자동 대응의 실패는 대부분 *기술 부족*이 아니라 *경계 설정 실수*에서 나온다. 판단 축은 네 개다.

| 판단 축 | 자동 실행해도 되는 조건 | 승인 게이트를 둬야 하는 조건 |
|---|---|---|
| **가역성** | 되돌릴 수 있음(키 `Inactive`, 격리 SG 교체, 스냅샷 생성) | 되돌릴 수 없음(인스턴스 종료, 볼륨 삭제, 사용자 삭제) |
| **신호 신뢰도** | 결정적 증거(포트 스캔 성공, 알려진 C2 IP 통신) | 통계·행동 기반 이상(비정상 API 패턴, 첫 사용 리전) |
| **영향 범위** | 단일 리소스, 비프로덕션 태그 | 공용 인프라, `Environment=prod` |
| **시간 압박** | 초 단위가 피해량을 좌우(자격증명 폐기) | 분석 품질이 더 중요(데이터 유출 범위 판정) |

네 축이 모두 "자동" 쪽이면 자동, 하나라도 "승인" 쪽이면 게이트를 두는 것이 안전한 기본값이다. 그리고 **가역성 축이 다른 세 축을 압도한다** — 가역적 조치는 오탐이어도 몇 분 안에 원상복구되지만, 비가역 조치는 오탐 한 번이 그대로 장애·데이터 손실이 된다. Day 4의 graduated automation이 이 표를 조직 정책으로 굳힌 형태다.

> 🎯 **시나리오**: GuardDuty 심각도 7 이상이면 무조건 인스턴스를 격리하도록 자동화를 켠 다음 주, 보안 스캐너를 돌리는 사내 취약점 진단 서버가 `Recon:EC2/PortProbeUnprotectedPort` 계열 핀딩을 대량 유발했고, 자동화가 **결제 API 서버 여섯 대를 동시에 격리**해 30분간 결제가 중단됐다. 무엇이 잘못됐고 어떻게 고치는가. → 잘못은 "심각도 하나로만 자동/수동을 갈랐다"는 것이다. 고치는 순서는 ① **즉시 완화**: 격리 SG를 원복하고(가역적 조치였기에 가능하다는 점이 중요하다) 자동화 규칙을 일시 비활성화한다. ② **범위 축소**: 이벤트 패턴에 핀딩 `type` 조건을 추가해 정찰(`Recon:`) 계열을 자동 격리 대상에서 제외하고, 알려진 스캐너의 리소스는 태그로 예외 처리한다. ③ **경계 재설정**: `Environment=prod` 태그가 붙은 인스턴스는 자동 격리 대신 `aws:approve` 게이트를 거치는 분기를 런북에 넣는다. ④ **관측 추가**: 자동화가 실행될 때마다 SNS로 통보해, 다음 오탐을 사람이 30분이 아니라 30초 만에 알아채게 한다. 순서의 요점은 **원복 → 범위 축소 → 경계 재설계 → 관측 강화**이며, 흔한 실수는 ②를 건너뛰고 자동화를 통째로 꺼 버리는 것이다. 자동화를 끄면 MTTR이 즉시 사고 이전으로 되돌아간다.

## 권한 모델: 자동화는 무엇을 할 수 있는가

자동 대응의 보안성은 *실행 역할의 권한 경계*에 달렸다. 두 가지 역할이 등장한다:

1. **EventBridge가 타깃을 호출하는 역할** — `ssm:StartAutomationExecution` 또는 `lambda:InvokeFunction`만.
2. **SSM/Lambda가 실제 교정을 수행하는 역할** — 격리·키 비활성화 등 *실제 변경 권한*.

두 번째 역할이 광범위하면 자동화 파이프라인 자체가 공격 표적이 된다. 모범:
- 역할에 *정확히 필요한 액션*만(예: `ec2:ModifyInstanceAttribute`, `ec2:CreateSnapshot`).
- 리소스·조건으로 범위 제한(`Condition`에 태그 기반 제약).
- CloudTrail로 자동화 역할의 모든 호출 감사.

```json
// 교정 역할의 권한 정책 — "격리 SG로만 교체할 수 있는" 좁은 권한
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EvidenceFirst",
      "Effect": "Allow",
      "Action": ["ec2:CreateSnapshot", "ec2:CreateSnapshots", "ec2:CreateTags", "ec2:DescribeInstances", "ec2:DescribeTags", "ec2:DescribeVolumes"],
      "Resource": "*"
    },
    {
      "Sid": "IsolateOnlyWithApprovedSG",
      "Effect": "Allow",
      "Action": "ec2:ModifyInstanceAttribute",
      "Resource": "arn:aws:ec2:*:*:instance/*"
    },
    {
      "Sid": "DenyAnySecurityGroupExceptIsolation",
      "Effect": "Deny",
      "Action": "ec2:ModifyInstanceAttribute",
      "Resource": "arn:aws:ec2:*:*:security-group/*",
      "Condition": {
        "ArnNotEquals": {
          "ec2:SecurityGroupID": "arn:aws:ec2:ap-northeast-2:111122223333:security-group/sg-forensic-isolation"
        }
      }
    },
    {
      "Sid": "NeverTerminate",
      "Effect": "Deny",
      "Action": ["ec2:TerminateInstances", "ec2:StopInstances", "ec2:DeleteSnapshot", "ec2:DeleteVolume"],
      "Resource": "*"
    }
  ]
}
```

마지막 `NeverTerminate` Statement가 이 정책의 정수다. **자동화 역할에 비가역 조치 권한을 아예 주지 않으면, 코드 버그로도 오탐으로도 인스턴스가 삭제될 수 없다.** 승인 게이트는 절차적 통제지만 이 Deny는 구조적 통제다 — 종료가 정말 필요할 때는 승인 뒤 *별도의 더 강한 역할*이 수행하게 한다. 시험에서 "자동화의 blast radius를 줄이는 가장 효과적인 방법"을 묻는다면, 권한을 좁히는 것이 알림·모니터링보다 상위 답이다.

```json
// 워크로드 계정의 IR 대응 역할 신뢰 정책 — 보안 계정의 특정 실행 역할만 맡을 수 있다
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::222233334444:role/IR-Orchestrator-Lambda" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "ir-2026-shared-secret-from-secrets-manager" },
      "ArnLike": { "aws:PrincipalArn": "arn:aws:iam::222233334444:role/IR-*" }
    }
  }]
}
```

교차 계정 대응 역할은 조직에서 **가장 강력한 통로 중 하나**다. 신뢰 정책을 계정 단위(`"AWS": "222233334444"`)로 열면 그 계정의 아무 프린시펄이나 침해 대응 권한을 얻는다. 역할 ARN 단위로 좁히고, 그 역할의 수정·삭제를 SCP로 막고, `sts:AssumeRole` 호출을 CloudTrail 알람으로 감시하는 세 겹이 표준이다. **대응 자동화의 권한이 조직 보안의 상한을 정한다.**

```bash
# 자동화를 사고 없이 검증하는 법: 실제 침해를 기다리지 말고 샘플 핀딩을 쏜다
aws guardduty create-sample-findings \
  --detector-id <detector-id> \
  --finding-types "UnauthorizedAccess:EC2/MaliciousIPCaller.Custom"

# 런북만 따로 손으로 돌려 단계별 결과를 확인
aws ssm start-automation-execution \
  --document-name "IsolateCompromisedInstance" \
  --parameters '{"InstanceId":["i-0deadbeef"],"IsolationSgId":["sg-forensic"],"CaseId":["DRILL-001"]}'

aws ssm describe-automation-step-executions \
  --automation-execution-id <execution-id> --output table

# 규칙이 실제로 매칭됐는지 / 타깃 호출이 실패했는지는 지표로 본다
aws cloudwatch get-metric-statistics --namespace AWS/Events \
  --metric-name FailedInvocations --statistics Sum --period 300 \
  --start-time 2026-07-01T00:00:00Z --end-time 2026-07-02T00:00:00Z \
  --dimensions Name=RuleName,Value=GuardDutyToIsolation
```

`create-sample-findings`는 시험에도 실무에도 등장하는 카드다. **자동 대응은 "만들었다"가 아니라 "실제 이벤트로 끝까지 흘러가는 것을 확인했다"에서 완성된다.** 샘플 핀딩은 실제 위협 없이 전체 경로(패턴 매칭 → InputTransformer → 실행 역할 → 런북 단계)를 점검하는 표준 수단이며, Day 4의 game day 훈련과 직접 연결된다.

## 전체 흐름 종합

```
GuardDuty 핀딩(severity≥7)
   │  (EventBridge 이벤트 발행)
   ▼
EventBridge 규칙 (패턴 매칭 + InputTransformer)
   ├──► SNS  → 보안팀 즉시 알림 (사람)
   └──► SSM Automation 런북 (EventBridge 역할로 호출)
            │  (자동화 역할로 실행)
            ├─ 1. 스냅샷 생성 (증거 보존)
            ├─ 2. 격리 SG로 교체 (봉쇄)
            ├─ 3. QUARANTINE 태깅
            └─ 4. Step Functions로 후속(포렌식 EC2 기동 등)
```

핵심 통찰: *알림(사람)과 교정(자동)을 병행*한다. 자동 봉쇄로 시간을 벌고, 사람은 동시에 상황을 파악한다. 완전 자동화가 위험한 고영향 조치(예: 프로덕션 인스턴스 종료)는 `aws:approve` 게이트로 사람의 승인을 받는다.

> 🔍 **더 깊이**: 성숙한 조직은 자동 대응을 *신뢰 등급별로 차등*한다. 명백한 위협(공개된 RDP에 대한 brute force 성공)은 완전 자동 격리, 모호한 신호(비정상 API 호출 패턴)는 알림만, 고영향 조치는 승인 게이트. 이를 "graduated automation"이라 한다. 또한 자동화 자체의 실패에 대비해 *dead-letter queue(DLQ)*를 EventBridge 타깃에 붙여 실패한 이벤트를 보존하고, 자동 교정이 작동하지 않았을 때 사람에게 escalate하는 안전망을 둔다.

## 파이프라인을 세우는 순서: 무엇을 먼저 하는가

시험이 이 주차에서 집요하게 묻는 것은 언제나 **순서**다. 자동 대응 파이프라인을 구축할 때도 순서가 있고, 그 순서를 어기면 "동작하는 것처럼 보이지만 사고 때 아무것도 하지 못하는" 파이프라인이 된다.

```
① 로깅·탐지 기반 확보     CloudTrail(전 계정·전 리전) · GuardDuty · Security Hub 집계
     │  ← 왜 먼저인가: 신호가 없으면 트리거할 것이 없다. 사고 후 켜면 과거를 볼 수 없다.
     ▼
② 대응 역할 사전 배포     각 워크로드 계정에 IR-RemediationRole (최소 권한 + 비가역 Deny)
     │  ← 왜 지금인가: 사고가 난 뒤에는 침해 계정에 역할을 만들 수단이 없을 수 있다.
     ▼
③ 격리 인프라 준비        격리 SG·격리 서브넷·포렌식 계정·증거 S3(Object Lock)
     │  ← 왜 지금인가: 런북이 참조할 대상이 없으면 런북은 실행 시점에 실패한다.
     ▼
④ 런북 작성·수동 검증     SSM Automation 문서 + start-automation-execution 으로 직접 실행
     │  ← 왜 지금인가: 트리거를 붙이기 전에 조치 자체가 옳은지 먼저 확인한다.
     ▼
⑤ 알림 전용으로 배선       EventBridge 규칙 → SNS 만 연결 (human-in-the-loop)
     │  ← 왜 지금인가: 패턴이 정말 매칭되는지, 노이즈가 얼마인지를 무해하게 측정한다.
     ▼
⑥ 가역적 조치 자동 연결    규칙 → SSM 런북(격리·키 비활성화) 추가, DLQ·재시도 설정
     │  ← 왜 지금인가: 오탐 비용이 낮은 조치부터 신뢰를 쌓는다.
     ▼
⑦ 비가역 조치는 승인 게이트  aws:approve / Step Functions 콜백으로 사람 판단 삽입
     │
     ▼
⑧ 훈련·측정               샘플 핀딩·game day, MTTD/MTTR 추적 → ①로 환류
```

⑤를 건너뛰고 ①→⑥으로 직행하는 것이 실무에서 가장 흔한 실패다. **알림 단계는 낭비가 아니라 노이즈 측정 구간**이며, 여기서 나온 오탐률이 "이 핀딩 타입을 자동화해도 되는가"의 유일한 근거가 된다.

### 자동화의 안전망: 실패했을 때 무슨 일이 일어나는가

자동 대응은 *실패를 전제로* 설계해야 한다. 최소 네 가지 안전망이 필요하다.

1. **DLQ(Dead-Letter Queue)**: EventBridge 타깃 호출이 재시도 후에도 실패하면 이벤트를 SQS로 보낸다. DLQ가 없으면 실패한 핀딩은 *아무 흔적 없이 사라진다*.
2. **재시도 정책**: 최대 재시도 횟수와 이벤트 최대 수명을 명시한다. 무한 재시도는 스로틀링을, 무재시도는 일시적 오류로 인한 대응 누락을 만든다.
3. **멱등성**: 같은 핀딩이 두 번 도착해도 결과가 같아야 한다. 격리 SG 교체·키 비활성화는 본래 멱등적이지만, "스냅샷 생성"은 아니다 — 케이스 태그로 기존 스냅샷 존재를 먼저 확인하는 단계를 넣는다.
4. **실패의 가시화**: `FailedInvocations` 지표에 CloudWatch 알람을 걸고, 알람을 *보안 채널*로 보낸다. 자동화가 조용히 죽어 있는 상태가 자동화가 없는 상태보다 위험한 이유는, 아무도 대응이 안 되고 있다는 사실을 모른다는 데 있다.

```bash
# 타깃에 DLQ와 재시도 상한을 함께 건다
aws events put-targets --rule GuardDutyToIsolation --targets '[{
  "Id": "isolate-target",
  "Arn": "arn:aws:ssm:ap-northeast-2:111122223333:automation-definition/IsolateCompromisedInstance",
  "RoleArn": "arn:aws:iam::111122223333:role/EventBridgeSsmRole",
  "DeadLetterConfig": { "Arn": "arn:aws:sqs:ap-northeast-2:111122223333:ir-dlq" },
  "RetryPolicy": { "MaximumRetryAttempts": 3, "MaximumEventAgeInSeconds": 3600 }
}]'
```

> 🔍 **더 깊이**: 자동 대응 파이프라인은 그 자체가 **공격 표면**이다. 공격자 관점에서 이 파이프라인은 두 가지로 악용될 수 있다. 첫째, *교정 역할 탈취* — 조직 전역에 배포된 IR 대응 역할은 여러 계정에 걸친 강력한 권한을 갖는 드문 자산이라, 오케스트레이터 Lambda 하나를 침해하면 다계정 권한을 한 번에 얻는다. 그래서 오케스트레이터는 별도 계정, 최소 권한, 코드 서명·불변 배포로 다뤄야 한다. 둘째, *자동화 유도(automation baiting)* — 공격자가 의도적으로 저심각도 핀딩을 대량 발생시켜 대응 팀과 자동화를 소진시키고, 그 소음 속에서 진짜 행위를 숨긴다. 이것은 IDS 시대의 고전적 회피 기법이 클라우드로 옮겨온 형태다. 방어는 *핀딩 종류별 처리량 상한*과 *동시 실행 제한*, 그리고 "동일 계정에서 짧은 시간에 N건 이상"이라는 **메타 탐지 규칙**이다. 자동화는 개별 핀딩만 보지만, 사람은 핀딩의 *패턴*을 봐야 한다.

## 함정 정리

- 한 리전에 규칙 하나를 만들어 두고 조직 전체가 보호된다고 믿는다 — GuardDuty는 리전별 서비스다.
- 이벤트 패턴에 `Workflow.Status: NEW` 조건을 빼서, 이미 처리한 핀딩에 대응이 반복 실행된다.
- GuardDuty 원본 심각도(0~10)와 Security Hub 정규화 심각도(0~100)를 섞어 임계값을 잘못 건다.
- 필터링을 실행기 코드 안에서 하여 호출 비용·오작동·감사 로그 오염을 자초한다.
- 중앙 이벤트 버스에 `Principal: "*"`만 두고 `aws:PrincipalOrgID` 조건을 빠뜨려 위조 이벤트를 허용한다.
- 교정이 만든 변경이 다시 교정을 트리거하는 재귀 루프를 막지 않는다(태그 제외·시도 상한 필요).
- 자동화 역할에 `ec2:*`·`iam:*` 같은 광범위 권한을 줘 파이프라인이 곧 권한 상승 경로가 된다.
- 비가역 조치(종료·삭제) 권한을 자동화 역할에 남겨 둔다 — 명시적 Deny로 구조적으로 제거해야 한다.
- 교차 계정 대응 역할의 신뢰 정책을 *계정 단위*로 열어 그 계정의 모든 프린시펄에 대응 권한을 준다.
- DLQ·재시도·`FailedInvocations` 알람이 없어 자동화가 조용히 죽어 있는데 아무도 모른다.
- 알림 전용 단계를 건너뛰고 처음부터 자동 격리를 켜서 오탐으로 프로덕션을 중단시킨다.
- 스냅샷 생성처럼 멱등적이지 않은 단계를 중복 실행 방지 없이 런북에 넣는다.
- 대응 역할을 사고 *이후에* 배포하려 한다 — 침해 계정에서 역할을 만들 수단이 없을 수 있다.
- 자동화를 만들고 샘플 핀딩·game day로 끝까지 흘려 보는 검증을 하지 않는다.

## 한 줄 요약 체크리스트

- [ ] 신호원(GuardDuty/Security Hub/Config)의 이벤트 패턴을 severity·type으로 필터링했는가
- [ ] Security Hub를 단일 진입점으로 삼고 `Workflow.Status: NEW`로 중복 처리를 막았는가
- [ ] 이벤트 패턴 연산자(`numeric`·`prefix`·`anything-but`·`exists`)로 라우터에서 걸러 냈는가
- [ ] 중앙 이벤트 버스에 `aws:PrincipalOrgID` 조건을 걸어 위조 이벤트를 차단했는가
- [ ] 교정 역할에서 비가역 조치를 명시적 Deny로 구조적으로 제거했는가
- [ ] 교차 계정 대응 역할의 신뢰 정책을 특정 역할 ARN 단위로 좁혔는가
- [ ] 런북 단계마다 `onFailure`를 의도대로(증거는 Continue, 봉쇄는 Abort) 설정했는가
- [ ] DLQ·재시도 상한·`FailedInvocations` 알람으로 자동화의 침묵을 감지하는가
- [ ] 재귀 루프 차단 표식(`IR-Automated` 태그 등)과 시도 상한을 뒀는가
- [ ] 샘플 핀딩으로 전체 경로를 끝까지 흘려 검증했는가
- [ ] EventBridge InputTransformer로 이벤트에서 대상 리소스를 추출해 런북에 매핑했는가
- [ ] 교정이 표준·다단계·감사 필요면 SSM Automation, 복잡 로직이면 Lambda를 골랐는가
- [ ] EventBridge 호출 역할과 실제 교정 역할을 분리하고 최소 권한으로 제한했는가
- [ ] 자동 교정과 사람 알림(SNS)을 병행하고, 고영향 조치엔 승인 게이트를 뒀는가
- [ ] 다계정·다리전 핀딩을 Security Hub/중앙 버스로 집계해 일관 대응하는가
- [ ] 증거 보존(스냅샷)을 봉쇄(격리)보다 먼저 수행하는가
- [ ] 자동화 실패에 대비한 DLQ·escalation 경로가 있는가

---

## 📝 연습 문제

**문제 1.** GuardDuty가 심각도 8의 EC2 C2 통신 핀딩을 생성할 때만 자동으로 인스턴스를 격리하고, 동시에 보안팀에 알리고 싶다. 가장 적절한 구성은?

A) Lambda를 1분마다 실행해 GuardDuty API를 폴링하고 조건을 검사  
B) EventBridge 규칙(severity≥7 + type 필터)을 두 타깃(SSM Automation 격리 런북 + SNS 알림)에 연결  
C) GuardDuty 콘솔에서 핀딩을 보고 사람이 수동 격리  
D) Config 규칙으로 인스턴스를 평가  

**정답: B**  
해설: EventBridge 규칙은 이벤트 패턴으로 심각도·타입을 필터링하고, 하나의 규칙을 여러 타깃에 라우팅할 수 있다. SSM Automation 런북으로 격리를 자동 실행하고 SNS로 동시에 알림을 보내면 봉쇄와 통보가 병행된다. Lambda 폴링은 지연·비용·중복 처리 문제가 있고, 수동 격리는 자동화가 아니며, Config는 구성 규정 준수용이지 위협 핀딩 트리거가 아니다.

---

**문제 2.** 자동 대응 파이프라인에서 SSM Automation 런북을 Lambda보다 선호하게 되는 결정적 요인은?

A) Lambda보다 항상 더 빠르게 실행되므로  
B) 다단계 교정의 순서 보장, 단계별 재시도, 사람 승인 게이트(aws:approve), CloudTrail 단계별 감사가 플랫폼 제공되므로  
C) Lambda는 AWS API를 호출할 수 없으므로  
D) 런북은 IAM 권한이 필요 없으므로  

**정답: B**  
해설: SSM Automation은 선언적 다단계 런북으로 순서·재시도·승인 게이트·감사 기록을 플랫폼이 관리해, 증거 능력과 규정 준수가 중요한 보안 교정에 유리하다. 실행 속도가 항상 빠른 것은 아니고, Lambda도 당연히 AWS API를 호출하며, 런북 역시 assumeRole로 IAM 권한이 필요하다.

---

**문제 3.** 자동 교정 역할에 `ec2:*`, `iam:*` 같은 광범위 권한을 부여한 설계의 가장 큰 위험은?

A) 비용이 증가한다  
B) 자동화 파이프라인이나 실행기가 침해되면 광범위 권한이 권한 상승·측면 이동 경로가 되어 폭발 반경이 커진다  
C) 런북이 실행되지 않는다  
D) EventBridge 패턴이 매칭되지 않는다  

**정답: B**  
해설: 자동 교정 역할의 권한은 곧 자동화의 폭발 반경이다. 광범위 권한은 파이프라인이 표적이 됐을 때 공격자에게 강력한 권한을 넘겨준다. 정확히 필요한 액션(예: ec2:ModifyInstanceAttribute)만, 태그·리소스 조건으로 범위를 제한하는 최소 권한이 정답이다. 권한 폭은 비용·런북 실행·이벤트 매칭과 직접 관련이 없다.

---

**문제 4.** 침해 인스턴스 격리 런북에서 단계 순서를 설계할 때 모범은?

A) 인스턴스를 즉시 종료한 뒤 스냅샷을 생성  
B) 스냅샷(증거 보존)을 먼저 만든 뒤 격리 보안 그룹으로 교체하고 태깅  
C) 격리만 하고 증거는 보존하지 않음  
D) 태깅만 하고 봉쇄는 사람이 나중에  

**정답: B**  
해설: 휘발성·디스크 증거 보존을 위해 스냅샷을 먼저 생성한 뒤 보안 그룹 교체로 봉쇄하고 태깅하는 순서가 모범이다. 인스턴스를 먼저 종료하면 메모리 등 휘발성 증거가 소실되고, 증거 미보존이나 봉쇄 누락은 포렌식·대응 실패로 이어진다.

---

**문제 5.** 다계정·다리전 환경에서 GuardDuty 핀딩에 일관된 자동 대응을 적용하려 한다. 가장 적절한 접근은?

A) 한 리전에 EventBridge 규칙 하나만 만든다  
B) 멤버 계정 핀딩을 Security Hub로 집계(또는 중앙 이벤트 버스로 전달)하고 각 리전 규칙을 IaC로 일관 배포해 중앙에서 대응  
C) 계정마다 사람이 수동으로 콘솔을 확인  
D) GuardDuty를 끄고 Config만 사용  

**정답: B**  
해설: GuardDuty는 리전별 서비스라 리전마다 규칙이 필요하고, 다계정은 Security Hub 집계나 중앙 이벤트 버스 전달로 단일 대응 지점을 만든 뒤 IaC로 일관 배포하는 것이 정답이다. 한 리전 규칙 하나로는 전체가 보호되지 않고, 수동 확인은 자동화가 아니며, GuardDuty 비활성화는 탐지 자체를 포기하는 것이다.

---
