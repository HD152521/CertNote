# Day 2 - SSM Automation: 운영 절차를 코드로, 사람을 워크플로 안으로

운영 조직의 가장 깊은 부채는 코드가 아니라 사람 머릿속에 있다. "프로덕션 DB를 재시작할 때는 먼저 읽기 복제본 지연을 확인하고, 백업이 끝났는지 보고, 시니어 두 명의 승인을 받고, 트래픽을 빼고, 재시작하고, 헬스체크를 통과하면 트래픽을 다시 넣는다." 이 절차는 위키 문서나 베테랑의 경험으로만 존재한다. 그 베테랑이 휴가를 가거나 퇴사하면, 같은 절차가 새벽 3시에 당직자의 떨리는 손으로 재현되고, 한 단계를 빼먹으면 사고가 난다. **Runbook**은 이 절차를 글로 적은 것이고, **Runbook-as-Code**는 그것을 실행 가능한 코드로 만든 것이다. SSM Automation은 AWS에서 이를 구현하는 도구다 — 운영 절차를 선언적 워크플로로 적고, 그 안에 AWS API 호출·스크립트·조건 분기·사람 승인을 단계로 엮는다.

오늘은 SSM Automation을 "리메디에이션 실행기"로만 보지 않고, 그 밑의 워크플로 모델을 판다. Automation Document가 어떤 워크플로 엔진 계보에 속하는지, `aws:approve` 같은 휴먼-인-더-루프(human-in-the-loop) 단계가 왜 자동화의 패러독스를 푸는지, Step Functions와 Automation이 어떻게 다른지, 멱등성과 출력 전달이 워크플로 엔진의 어떤 근본 문제를 다루는지를 본다. DOP 시험에서 SSM Automation은 운영 우수성(Operational Excellence)과 인시던트 자동화의 단골로, "절차를 어떻게 코드화하나", "자동 대응에 사람 게이트를 어떻게 끼우나", "수백 계정에 같은 리메디에이션을 어떻게 동시 적용하나"로 출제된다.

## Runbook의 역사 — 운영실 벽의 종이에서 코드로

"Runbook"이라는 말은 메인프레임 시대 데이터센터에서 왔다. 운영자(operator)가 야간 배치 작업, 장애 대응, 시스템 재기동 절차를 적어 둔 바인더가 문자 그대로 "실행 책(run book)"이었다. 컴퓨터가 멈추면 운영자는 그 책을 펴 단계를 따라갔다. 이 종이 절차서가 디지털화되며 위키·체크리스트가 됐고, DevOps 운동과 함께 **executable runbook**(실행 가능한 런북) 개념으로 진화했다 — 절차를 사람이 읽는 글이 아니라 기계가 실행하는 코드로 만들자는 것이다.

이 진화에는 단계가 있다. 처음엔 종이(human-executed), 다음엔 스크립트 모음(semi-automated), 그다음엔 워크플로 엔진(fully orchestrated)이다. SSM Automation은 마지막 단계로, 절차의 각 단계를 선언적 YAML/JSON으로 적고 SSM이 그 상태 전이를 관리한다. 사람은 "무엇을 할지"만 선언하고, "어떻게 실행·재시도·분기할지"는 엔진이 맡는다.

```
[운영실 종이 바인더] → [위키 체크리스트] → [개별 스크립트] → [SSM Automation Document]
   human-executed        semi-manual         scripted          fully orchestrated
   (베테랑 의존)         (복붙 실행)         (글루 코드)        (선언적 워크플로 + 감사)
```

> 💡 **관련 이론**: Runbook-as-Code는 운영 우수성(Operational Excellence)의 핵심 원리인 **"운영을 코드로(operations as code)"**의 구현이다. AWS Well-Architected의 운영 우수성 기둥은 "운영 절차를 코드로 정의하면 일관성·재현성·버전 관리·테스트가 가능하다"고 말한다. 인프라를 코드로(IaC) 다루는 것과 같은 사상을 운영 절차에 적용한 것이다. 핵심 이득: 절차가 코드면 (1) Git으로 버전 관리·리뷰되고, (2) 누가 실행해도 동일하며(베테랑 의존 제거), (3) CloudTrail에 모든 실행이 감사되고, (4) 사고 후 절차를 개선하면 다음 사고에 자동 반영된다. 이것이 "사람의 실수를 줄이는 가장 확실한 방법은 사람을 절차에서 빼는 것"이라는 SRE 원칙과 닿는다.

## Automation Document — 선언적 워크플로의 해부

SSM Document에는 여러 종류가 있고, 그중 **Automation**(`schemaVersion: '0.3'`)이 워크플로용이다.

| Document Type | 용도 |
|---------------|------|
| `Automation` | 다단계 워크플로 (오늘 주제) |
| `Command` | Run Command — 인스턴스 위에서 셸/PowerShell 실행 |
| `Session` | Session Manager 접속 설정 |
| `Package` | Distributor — 소프트웨어 배포 |
| `Policy` | State Manager — 원하는 상태 유지 |

Automation Document의 골격은 파라미터 + 메인 단계(mainSteps)다.

```yaml
schemaVersion: '0.3'
description: Auto-remediate unencrypted S3 buckets
assumeRole: '{{AutomationAssumeRole}}'   # 이 워크플로가 빌릴 IAM 역할
parameters:
  BucketName: {type: String}
  AutomationAssumeRole: {type: String}
mainSteps:
  - name: CheckEncryption
    action: aws:executeAwsApi
    inputs:
      Service: s3
      Api: GetBucketEncryption
      Bucket: '{{BucketName}}'
    onFailure: 'step:EnableEncryption'   # 실패 시 분기
    isCritical: false
  - name: EnableEncryption
    action: aws:executeAwsApi
    inputs:
      Service: s3
      Api: PutBucketEncryption
      Bucket: '{{BucketName}}'
      ServerSideEncryptionConfiguration:
        Rules: [{ApplyServerSideEncryptionByDefault: {SSEAlgorithm: AES256}}]
```

`assumeRole`이 핵심이다 — Automation은 자신을 실행한 사람의 권한이 아니라, 문서에 지정된 IAM 역할의 권한으로 동작한다. 이 덕에 "권한 없는 운영자도 승인된 Runbook으로는 제한된 작업을 수행"하는 권한 위임(privilege delegation)이 가능하다.

> 🔍 **더 깊이**: Automation Document의 `assumeRole`은 **권한 경계의 재배치**라는 중요한 보안 패턴이다. 운영자에게 직접 `s3:PutBucketEncryption` 권한을 주는 대신, 그 권한을 Runbook의 역할에 담고 운영자에겐 `ssm:StartAutomationExecution`(특정 문서에 한정)만 준다. 그러면 운영자는 "이 검증된 절차"로만 그 권한을 쓸 수 있고, 임의로 휘두를 수 없다. 이는 **최소 권한 원칙(least privilege)**을 절차 단위로 구현한 것이다 — sudo가 "특정 명령만 권한 상승"을 허용하는 것과 같은 발상이다. 시험에서 "운영자에게 위험한 권한을 직접 주지 않고 통제된 작업만 허용"의 답이 종종 이 패턴이다.

## Step Action 종류 — 워크플로의 원시 연산자들

Automation의 표현력은 Step Action에서 나온다. 각 단계가 하나의 액션 타입을 가진다.

| Action | 용도 |
|--------|------|
| `aws:executeAwsApi` | AWS API 직접 호출 (가장 범용) |
| `aws:runCommand` | 인스턴스에서 Run Command 실행 |
| `aws:invokeLambdaFunction` | Lambda 호출 (커스텀 로직) |
| `aws:executeStateMachine` | Step Functions 시작 (복잡 분기 위임) |
| `aws:approve` | **사람 승인 대기** |
| `aws:branch` | 조건 분기 |
| `aws:waitForResource` | 리소스 상태 대기 (RDS available 등) |
| `aws:sleep` | 시간 대기 |
| `aws:executeScript` | 인라인 Python/PowerShell 스크립트 |
| `aws:createImage` / `aws:runInstances` | AMI 생성 / EC2 시작 |

이 단계들은 출력을 다음 단계로 전달할 수 있다.

```yaml
- name: GetSnapshot
  action: aws:executeAwsApi
  outputs:
    - {Name: SnapshotId, Selector: $.SnapshotId, Type: String}
  inputs: {Service: ec2, Api: CreateSnapshot, VolumeId: '{{VolId}}'}
- name: TagSnapshot
  action: aws:executeAwsApi
  inputs:
    Service: ec2
    Api: CreateTags
    Resources: ['{{GetSnapshot.SnapshotId}}']   # 앞 단계 출력 참조
```

> 🔍 **더 깊이**: 단계 간 출력 전달(`{{Step.Output}}`)과 분기(`aws:branch`)는 Automation을 단순 스크립트가 아니라 **상태를 가진 워크플로**로 만든다. 이 모델은 워크플로 엔진의 고전인 **DAG(방향성 비순환 그래프) 실행**과 닿아 있다 — 각 단계가 노드, 출력 의존성이 엣지인 그래프다. Apache Airflow의 DAG, AWS Step Functions의 상태 기계, GitHub Actions의 job 의존성이 모두 같은 계보다. 다만 Automation은 Step Functions만큼 풍부한 분기·병렬·Map을 제공하진 않는다 — 그래서 복잡한 분기가 필요하면 `aws:executeStateMachine`으로 Step Functions에 위임한다. 경계: **선형~약한 분기의 운영 절차는 Automation, 복잡한 상태 전이·병렬·장기 실행은 Step Functions**다.

## aws:approve — 자동화의 패러독스를 푸는 사람 게이트

완전 자동화의 역설은, 가장 위험한 작업일수록 자동화하기 무섭다는 것이다. "프로덕션 DB 종료"를 무인 자동화에 맡기면, 오탐(false positive) 하나가 멀쩡한 DB를 죽인다. 그렇다고 사람이 처음부터 끝까지 손으로 하면 자동화의 이점이 사라진다. **`aws:approve`**는 이 사이의 답이다 — 위험한 단계 직전에 워크플로를 멈추고 사람의 승인을 기다린다.

```yaml
- name: ApproveTermination
  action: aws:approve
  timeoutSeconds: 3600
  inputs:
    NotificationArn: arn:aws:sns:...:OncallTopic
    Message: 'Terminate prod instance {{InstanceId}}? GuardDuty critical finding.'
    MinRequiredApprovals: 2
    Approvers:
      - 'arn:aws:iam::...:role/SeniorOps'
      - 'arn:aws:iam::...:user/secops-lead'
```

`MinRequiredApprovals: 2`는 **다자 승인(multi-party authorization)**이다 — 한 사람이 아니라 둘 이상의 승인이 있어야 진행한다. 핵 발사 코드의 "two-person rule"과 같은 사상이다.

> 💡 **관련 이론**: `aws:approve`는 **휴먼-인-더-루프(human-in-the-loop, HITL)** 자동화의 구현이다. 완전 자율(autonomous)과 완전 수동 사이에서, 시스템이 대부분을 자동화하되 결정적·비가역적 지점에서만 사람의 판단을 끼우는 모델이다. 여기서 중요한 구분은 **가역성(reversibility)**이다 — Jeff Bezos의 "Type 1(비가역) vs Type 2(가역) 결정" 프레임처럼, 되돌릴 수 있는 작업(태그 추가)은 자동화로 빠르게, 되돌릴 수 없는 작업(인스턴스 종료, 데이터 삭제)은 사람 승인 게이트를 둔다. `MinRequiredApprovals: 2`의 다자 승인은 보안의 **분리의 원칙(separation of duties)**과 **two-person rule**로, 한 사람의 실수나 악의가 단독으로 파괴적 작업을 못 하게 막는다. SOX·PCI-DSS 같은 컴플라이언스 프레임워크가 권한 분리를 요구하는 이유다.

> ⚠️ **함정**: `aws:approve`에는 **timeout**을 반드시 설정해야 한다. 승인 단계에 타임아웃이 없으면, 승인자가 알림을 놓치거나 자리를 비웠을 때 워크플로가 무한정 멈춰 있다 — 인시던트 한복판에서 자동화가 "승인 대기" 상태로 영원히 정지하는 것이다. `timeoutSeconds`를 두고, 타임아웃 시 `onFailure`로 에스컬레이션(다음 승인 그룹 호출)이나 안전한 기본 동작(아무것도 안 하고 사람에게 넘김)으로 분기해야 한다. 또 하나: 승인 알림 ARN(SNS)이 실제로 사람에게 닿는지 검증해야 한다 — 토픽 구독이 깨져 있으면 승인 요청이 허공으로 사라진다.

## AWS 관리형 Runbook — 바퀴를 재발명하지 마라

AWS는 수백 개의 미리 만든 Automation Document를 제공한다. 흔한 운영 작업은 직접 짜기 전에 관리형 문서부터 찾는 게 정석이다.

| Runbook | 용도 |
|---------|------|
| `AWS-StopEC2Instance` / `AWS-StartEC2Instance` | EC2 시작/중지 |
| `AWS-RestartRdsInstance` | RDS 재시작 |
| `AWS-DisablePublicAccessForS3Bucket` | S3 퍼블릭 차단 |
| `AWSSupport-TroubleshootRDP` | EC2 RDP 진단 |
| `AWS-EnableS3BucketEncryption` | S3 암호화 활성화 |
| `AWSConfigRemediation-*` | Config 규칙 위반 자동 교정 (수십 종) |

특히 `AWSConfigRemediation-*` 계열은 AWS Config의 규칙 위반을 자동 교정하는 데 직결된다 — Config가 "이 버킷이 암호화 안 됨"을 탐지하면 대응하는 remediation 문서가 자동으로 고친다.

> 📚 **사례**: 한 핀테크 회사가 컴플라이언스 감사에서 "퍼블릭 접근 가능 S3 버킷"이 주기적으로 생긴다는 지적을 받았다. 개발자가 실수로 버킷을 퍼블릭으로 열어 두는 일이 반복됐다. 이들은 AWS Config 규칙 `s3-bucket-public-read-prohibited`로 탐지하고, 위반 시 관리형 Runbook `AWS-DisablePublicAccessForS3Bucket`을 자동 remediation으로 연결했다. 그러나 초기에 한 가지를 놓쳤다 — remediation에 `aws:approve` 없이 즉시 교정을 걸었더니, 의도적으로 퍼블릭이어야 하는 정적 웹사이트 버킷까지 닫혀 서비스가 끊겼다. 교훈: 자동 교정은 강력하지만, 예외(의도적 설정)를 구분하는 태그 기반 필터나 승인 게이트 없이 전면 적용하면 정상 리소스를 망가뜨린다. 이후 `Exempt=true` 태그가 붙은 버킷은 remediation 대상에서 제외하도록 범위를 좁혔다.

## EventBridge → Automation — 탐지에서 대응으로

어제 본 EventBridge가 "무슨 일이 일어났는가"를 감지하면, SSM Automation이 "그래서 무엇을 할 것인가"를 실행한다. 이 둘을 잇는 것이 자동 인시던트 대응의 핵심 패턴이다.

```json
// EventBridge Rule: GuardDuty 고위험 탐지
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{"numeric": [">=", 7]}],
    "type": [{"prefix": "UnauthorizedAccess:EC2/"}]
  }
}
```

Target으로 SSM Automation 문서를 지정하면, GuardDuty 탐지가 곧바로 격리 워크플로를 발동한다.

```json
{
  "DocumentName": "AWS-IsolateEC2Instance",
  "Parameters": {"InstanceId": ["$.detail.resource.instanceDetails.instanceId"]}
}
```

> 🎯 **시나리오**: GuardDuty가 EC2 인스턴스에서 비트코인 채굴 트래픽(`CryptoCurrency:EC2/BitcoinTool`)을 severity 8로 탐지했다. 목표 흐름: (1) EventBridge Rule이 severity≥7 finding을 잡아 SSM Automation 트리거 → (2) Automation이 `aws:executeAwsApi`로 인스턴스를 격리 보안 그룹(`sg-quarantine`)으로 이동(인바운드·아웃바운드 차단) → (3) `aws:createImage`로 포렌식용 스냅샷 생성 → (4) `aws:invokeLambdaFunction`으로 Slack 알림 + Jira 티켓 → (5) `aws:approve`로 시니어 승인 대기 → (6) 승인되면 `aws:executeAwsApi`로 인스턴스 종료. 핵심은 격리·증거 보존·알림은 무인 자동(가역적·비파괴적)으로 즉시, 종료(비가역적·파괴적)는 사람 승인 후라는 점이다. 격리를 종료보다 먼저 하는 이유는 MTTR — 위협을 즉시 봉쇄해 피해 확산을 막고, 분석·종료는 그 뒤에 천천히 한다.

## Multi-Account Automation — 한 절차를 조직 전체에

규모가 커지면 같은 리메디에이션을 수백 계정에 적용해야 한다. **TargetLocations** 파라미터가 한 Automation 실행을 여러 계정·리전에 동시 전개한다.

```bash
aws ssm start-automation-execution \
  --document-name AWS-DisablePublicAccessForS3Bucket \
  --target-locations '[{
    "Accounts": ["ou-abcd-12345678"],
    "Regions": ["us-east-1", "ap-northeast-2"],
    "TargetLocationMaxConcurrency": "10",
    "TargetLocationMaxErrors": "5"
  }]'
```

`MaxConcurrency`(동시 실행 수)와 `MaxErrors`(허용 오류 수)가 핵심 안전장치다.

> 💡 **관련 이론**: `MaxConcurrency`/`MaxErrors`는 대규모 자동화의 **폭발 반경(blast radius) 제어**다. 한 번에 모든 계정에 변경을 밀면, 버그가 있을 때 조직 전체가 동시에 망가진다. 동시성을 제한하면 변경이 점진적으로 퍼지고, 오류 임계값(`MaxErrors`)을 넘으면 자동으로 멈춰 피해를 가둔다. 이는 배포 전략의 **카나리/롤링**과 정확히 같은 사상이다 — 작게 시작해 건강을 확인하며 확대하고, 문제가 보이면 멈춘다. "모든 변경은 점진적이고 가역적이어야 한다"는 안전한 운영의 제1원칙이 자동화 실행에도 그대로 적용된다.

## Automation vs Step Functions vs Lambda — 도구 선택의 경계

세 도구가 자주 비교된다. 경계를 명확히 해야 시험에서 헷갈리지 않는다.

| | SSM Automation | Step Functions | Lambda |
|--|----------------|----------------|--------|
| 본질 | 운영 절차 워크플로 | 범용 상태 기계 | 단일 함수 실행 |
| 강점 | AWS 운영 작업, 관리형 Runbook, `aws:approve` | 복잡 분기·병렬·Map·장기 실행 | 짧은 커스텀 로직 |
| 사람 승인 | `aws:approve` 내장 | Activity/콜백으로 구현 | 직접 구현 |
| 적합 | "RDS 재시작 절차", "S3 교정" | "주문 처리 사가", "ETL 오케스트레이션" | "이벤트 변환", "단순 격리" |

> 🔍 **더 깊이**: 셋의 경계는 **표현력 대 단순성의 트레이드오프**다. Lambda는 가장 단순하지만 오케스트레이션(재시도·분기·상태)을 코드로 직접 짜야 한다. Step Functions는 가장 표현력이 높지만(병렬·Map·Choice·장기 대기) 학습 곡선과 ASL(Amazon States Language) 작성 비용이 있다. Automation은 그 중간으로, **운영 작업에 특화**돼 있다 — AWS API 호출·인스턴스 명령·관리형 Runbook·사람 승인이 1급 시민이라 운영 절차를 적기엔 가장 자연스럽다. 안티패턴: 복잡한 비즈니스 워크플로(주문→결제→배송)를 Automation으로 짜거나, 단순한 운영 리메디에이션을 Step Functions로 과하게 설계하는 것. 도구는 문제의 모양에 맞춰야 한다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **Runbook-as-Code는 운영실 종이 바인더에서 시작된 절차를 실행 가능한 코드로 진화**시킨 것으로, "운영을 코드로"라는 운영 우수성 원리의 구현이다. 둘째, **Automation Document의 `assumeRole`은 권한 경계를 절차 단위로 재배치**해 통제된 권한 위임을 가능케 한다. 셋째, **`aws:approve`는 휴먼-인-더-루프**로 자동화의 패러독스를 풀며, 가역성에 따라 사람 게이트를 두고 다자 승인(two-person rule)으로 분리의 원칙을 구현한다. 넷째, **EventBridge→Automation이 탐지-대응을 잇고**, 격리(가역)는 즉시·종료(비가역)는 승인 후라는 순서가 핵심이다. 다섯째, **Multi-Account의 MaxConcurrency/MaxErrors는 폭발 반경 제어**로 카나리/롤링과 같은 점진적·가역적 변경 원칙을 따른다.

다음 글에서는 사람 승인조차 없이 시스템이 스스로 낫는 **Lambda 자동 복구(auto-healing)** 패턴과 그 폭주를 막는 안전망을 깊이 본다.

---

## 📝 연습 문제

**문제 1.** 운영자에게 위험한 `s3:PutBucketPolicy` 권한을 직접 주지 않으면서도, 검증된 절차로는 그 작업을 수행하게 하려 한다. 가장 적절한 패턴은?

A) 운영자에게 PowerUser 정책을 부여

B) Automation Document의 assumeRole에 권한을 담고, 운영자에겐 특정 문서에 대한 ssm:StartAutomationExecution만 부여

C) 운영자에게 권한을 주되 CloudTrail로 사후 감사

D) 루트 계정으로 작업

**정답: B**

해설: Automation Document는 실행한 사람의 권한이 아니라 문서의 assumeRole 권한으로 동작한다. 위험한 권한을 Runbook 역할에 담고 운영자에겐 그 문서를 시작할 권한만 주면, 운영자는 검증된 절차로만 그 권한을 사용하고 임의로 휘두를 수 없다. 이는 최소 권한 원칙을 절차 단위로 구현한 것(sudo의 명령별 권한 상승과 같은 사상)이다. PowerUser(A)·직접 부여(C)·루트(D)는 모두 권한을 과도하게 넓혀 최소 권한을 위반한다.

---

**문제 2.** GuardDuty가 EC2에서 severity 8의 무단 접근을 탐지했다. 격리·증거 보존·알림은 즉시 자동으로, 인스턴스 종료는 사람 승인 후 하려 한다. 올바른 단계 순서와 설계는?

A) 종료를 먼저 자동 실행해 위협을 제거한 뒤 분석

B) 격리(sg-quarantine 이동) → 스냅샷 생성 → 알림 → aws:approve(시니어 승인) → 종료. 가역적 작업은 무인 자동, 비가역적 종료만 승인 게이트

C) 모든 단계를 사람이 수동 실행

D) 격리 없이 알림만 보내고 사람이 결정

**정답: B**

해설: 가역성에 따라 자동화 경계를 나누는 것이 핵심이다. 격리(보안 그룹 이동)·스냅샷(증거 보존)·알림은 가역적·비파괴적이므로 무인 자동으로 즉시 실행해 MTTR을 줄이고 피해 확산을 막는다. 종료는 비가역적·파괴적이므로 aws:approve로 사람 승인 게이트를 둔다. 격리를 종료보다 먼저 하는 이유는 위협을 즉시 봉쇄하기 위함이다. 종료 우선(A)은 오탐 시 멀쩡한 인스턴스를 죽이고 증거를 잃으며, 전부 수동(C)은 MTTR을 늘리고, 격리 없이 알림만(D)은 위협이 계속 확산된다.

---

**문제 3.** aws:approve 단계를 둔 인시던트 자동화가, 승인자가 알림을 놓친 새벽에 "승인 대기" 상태로 무한정 멈춰 버렸다. 근본 예방책은?

A) 승인 단계를 제거하고 완전 자동화

B) timeoutSeconds를 설정하고, 타임아웃 시 onFailure로 에스컬레이션(다음 승인 그룹)이나 안전한 기본 동작으로 분기

C) 승인자를 1명으로 줄임

D) Automation 대신 Lambda로 전환

**정답: B**

해설: aws:approve에는 반드시 timeoutSeconds를 설정해야 한다. 타임아웃이 없으면 승인자가 자리를 비웠을 때 워크플로가 영원히 정지하는데, 이는 인시던트 한복판에서 치명적이다. 타임아웃 시 onFailure로 다음 승인 그룹 에스컬레이션이나 "아무것도 안 하고 사람에게 넘김" 같은 안전한 기본 동작으로 분기해야 한다. 승인 제거(A)는 위험한 작업의 안전장치를 없애고, 승인자 축소(C)는 무응답 가능성을 줄일 뿐 무한 대기를 못 막으며, Lambda 전환(D)은 사람 승인 기능을 잃는다.

---

**문제 4.** 동일한 S3 퍼블릭 차단 리메디에이션을 200개 계정에 적용하되, 버그가 있어도 전체가 동시에 망가지지 않게 하려 한다. 올바른 구성은?

A) 200개 계정에 한 번에 전부 적용

B) TargetLocations로 OU/리전을 지정하고 MaxConcurrency(동시성 제한)와 MaxErrors(오류 임계값)로 폭발 반경 제어

C) 각 계정에 로그인해 수동 실행

D) 한 계정에만 적용하고 나머지는 포기

**정답: B**

해설: Multi-Account Automation의 TargetLocations는 한 실행을 여러 계정·리전에 전개하되, MaxConcurrency로 동시 실행 수를 제한하고 MaxErrors로 오류가 임계값을 넘으면 자동 중단해 폭발 반경을 가둔다. 이는 배포의 카나리/롤링과 같은 사상으로, 변경을 점진적·가역적으로 만든다. 전부 동시 적용(A)은 버그가 200개 계정을 한꺼번에 망가뜨리고, 수동(C)은 규모에서 비현실적이며, 일부만 적용(D)은 목표를 달성하지 못한다.

---

**문제 5.** "RDS 인스턴스를 재시작하는 표준 운영 절차"를 코드화하려 한다. AWS가 이미 제공하는 것이 있다면 어떻게 하는 게 정석인가?

A) 처음부터 직접 Automation Document를 작성

B) 관리형 Runbook(AWS-RestartRdsInstance 등)을 먼저 찾아 활용하고, 필요한 부분만 커스텀

C) Lambda로 직접 RDS API 호출 코드 작성

D) 콘솔에서 수동 재시작

**정답: B**

해설: AWS는 수백 개의 관리형 Automation Document를 제공하며, 흔한 운영 작업(EC2 시작/중지, RDS 재시작, S3 퍼블릭 차단, Config 위반 교정 등)은 직접 짜기 전에 관리형 문서부터 찾는 게 정석이다. 바퀴를 재발명하지 않으면 검증된 절차를 즉시 쓰고 유지보수 부담을 던다. 처음부터 작성(A)·Lambda 직접 코딩(C)은 이미 있는 것을 중복 구현하는 것이고, 수동 재시작(D)은 코드화·재현성의 이점을 버린다.

---

**문제 6.** SSM Automation과 Step Functions 중 무엇을 쓸지 고민이다. "각 단계가 AWS 운영 API 호출이고, 중간에 사람 승인이 필요하며, 대체로 선형 절차"라면?

A) Step Functions — 항상 더 강력하므로

B) SSM Automation — AWS 운영 작업·관리형 Runbook·aws:approve가 1급 시민이라 운영 절차에 가장 자연스러움

C) Lambda 하나로 전부 처리

D) 둘 다 부적합, EventBridge로

**정답: B**

해설: SSM Automation은 운영 작업에 특화돼 AWS API 호출(aws:executeAwsApi)·인스턴스 명령·관리형 Runbook·사람 승인(aws:approve)이 모두 1급 시민이다. 선형~약한 분기의 운영 절차에 사람 승인이 끼는 경우 Automation이 가장 자연스럽다. Step Functions(A)는 복잡 분기·병렬·Map·장기 실행에 강하지만 단순 운영 절차엔 과하고 사람 승인을 콜백으로 직접 구현해야 한다. Lambda(C)는 오케스트레이션·승인을 직접 짜야 하고, EventBridge(D)는 라우팅이지 워크플로 실행기가 아니다.

---

**문제 7.** Automation의 한 단계에서 생성한 스냅샷 ID를 다음 단계에서 태그를 다는 데 사용하려 한다. 단계 간 데이터 전달 방법은?

A) 전역 변수에 저장

B) 앞 단계에 outputs(Selector로 값 추출)를 정의하고, 다음 단계에서 {{StepName.OutputName}}으로 참조

C) DynamoDB에 중간 저장

D) 불가능 — 각 단계는 독립적

**정답: B**

해설: Automation 단계는 outputs에 Selector(JSONPath)로 결과에서 값을 추출해 이름을 붙이고, 다음 단계에서 {{StepName.OutputName}} 구문으로 참조한다. 이 출력 전달이 Automation을 단순 스크립트가 아니라 상태를 가진 워크플로(DAG 실행)로 만든다. 전역 변수(A)·외부 저장(C)은 불필요한 우회이고, 단계 간 전달은 명백히 가능하므로 D는 틀리다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Runbook-as-Code는 메인프레임 운영실의 종이 바인더에서 시작해 실행 가능한 코드로 진화한 "운영을 코드로(operations as code)"의 구현으로, 일관성·재현성·감사·베테랑 의존 제거를 준다. 둘째, Automation Document의 assumeRole은 권한 경계를 절차 단위로 재배치해, 운영자에게 위험 권한을 직접 주지 않고 검증된 Runbook으로만 쓰게 하는 최소 권한 위임을 구현한다. 셋째, aws:approve는 휴먼-인-더-루프로 자동화의 패러독스를 풀며, 가역성(Type 1/Type 2 결정)에 따라 비가역 작업에만 사람 게이트를 두고 MinRequiredApprovals(two-person rule)로 분리의 원칙을 구현하되 timeout이 필수다. 넷째, EventBridge→Automation이 탐지(무슨 일)와 대응(무엇을)을 잇고, 격리·증거 보존은 즉시 자동·종료는 승인 후라는 순서가 핵심이며, 관리형 Runbook으로 바퀴를 재발명하지 않는다. 다섯째, Multi-Account의 TargetLocations와 MaxConcurrency/MaxErrors는 폭발 반경 제어로 카나리/롤링 같은 점진적·가역적 변경 원칙을 자동화 실행에 적용한다.
