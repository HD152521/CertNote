# Day 3 - Custom Resource·Hooks·Change Set: CloudFormation의 확장과 검증 메커니즘

CloudFormation을 6개월 정도 쓰다 보면 누구나 같은 벽에 부딪힌다. "Slack 채널을 자동 생성하고 싶은데 `AWS::Slack::Channel`이 없네", "GitHub Repo에 webhook을 등록하고 싶은데 CFN 리소스가 없네", "신규 출시된 AWS 서비스가 아직 CFN에서 지원 안 되네." 이 빈틈을 메우려고 2015년에 도입된 게 **Custom Resource**고, 그 위에 2021년 출시된 게 변경 사전 검증 메커니즘인 **CloudFormation Hooks**다. 두 도구는 표면적으로 다른 일을 하지만 본질적으로 같은 철학을 공유한다 — **CloudFormation을 폐쇄된 리소스 집합에서 확장 가능한 워크플로 엔진으로 만든다**는 것.

오늘은 Custom Resource Lambda의 ResponseURL이 왜 그렇게 설계됐는지, PhysicalResourceId가 라이프사이클의 키가 되는 이유, CDK Provider 프레임워크가 isComplete 패턴으로 장시간 작업을 어떻게 다루는지, CloudFormation Hooks가 OPA/Gatekeeper와 어떻게 닮았는지, 그리고 Change Set이 CI/CD에서 manual approval과 어떻게 결합되는지를 본다. 시험에서는 Custom Resource의 "응답 안 보내면 1시간 timeout" 같은 디테일이 자주 출제되므로 내부 동작을 정확히 알아둘 가치가 있다.

## CloudFormation의 한계 — 왜 확장이 필요한가

CloudFormation의 리소스 카탈로그는 1500개가 넘지만 그 카탈로그는 (1) AWS 서비스만, (2) 신규 기능 출시 후 평균 3~6개월의 시차, (3) 일부 deep features는 영원히 미지원이라는 한계가 있다. 예를 들어 AWS Bedrock 같은 신규 서비스는 출시 직후엔 CFN 지원이 없거나 일부 속성만 지원되고, GA 이후에도 모든 파라미터가 노출되기까지 시간이 걸린다. 이 시차 동안 운영팀은 "코드로 정의된 부분"과 "콘솔/CLI로 후처리한 부분"이 섞이면서 진정한 IaC를 유지하지 못한다.

Custom Resource는 이 빈틈을 일반적 메커니즘으로 메운다. **CFN의 라이프사이클(Create/Update/Delete)에 임의의 Lambda를 끼워넣어 그 Lambda가 외부 시스템 호출, 내부 로직, 신규 API 호출 등 무엇이든 수행할 수 있게 한다**. 결과적으로 CFN은 "AWS 리소스 관리 도구"에서 "선언적 라이프사이클 엔진"으로 확장된다.

```yaml
# CFN 표준 리소스 (AWS 카탈로그 안)
S3Bucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: my-bucket

# Custom Resource (Lambda가 무엇이든 수행)
SlackChannel:
  Type: Custom::SlackChannel
  Properties:
    ServiceToken: !GetAtt SlackProvisionerFn.Arn
    ChannelName: !Sub 'alerts-${Environment}'
    SlackToken: '{{resolve:secretsmanager:slack/token:SecretString:bot}}'
```

> 💡 **관련 이론**: Custom Resource는 Kubernetes의 Custom Resource Definition(CRD) + Operator 패턴과 정확히 같다. K8s가 자체 카탈로그(Pod, Deployment, Service)에 더해 CRD로 사용자 정의 리소스(Certificate, IstioVirtualService, ArgoCDApplication 등)를 등록하고 Operator(controller)가 reconciliation loop를 돌리는 모델이 CFN의 Custom Resource + Lambda Provider와 같은 추상화 패턴이다. 모두 **선언적 정의 + 명령적 reconciler**의 결합. Terraform의 External Provider, Pulumi의 Dynamic Provider도 같은 계열.

## Custom Resource Lambda의 응답 프로토콜

CFN과 Lambda 사이의 통신 방식을 자세히 보면 흥미로운 비대칭 설계가 보인다. CFN이 Lambda를 호출할 때는 일반적인 Lambda invocation으로 이벤트를 보내는데, **Lambda는 응답을 함수의 return 값으로 돌려주지 않고 별도의 pre-signed S3 URL(ResponseURL)에 PUT으로 결과를 올린다**. 왜 이렇게 설계됐을까.

답은 **장시간 작업의 비동기성** 때문이다. Lambda의 invocation 자체는 최대 15분이지만 Custom Resource가 처리해야 하는 작업은 더 길 수 있다 — 예를 들면 ECR 이미지 복제, RDS 스냅샷 복사, 대형 S3 객체 처리 등. Lambda가 timeout되어 종료되어도 (또는 별도 step function이 백그라운드에서 작업을 이어가도) 최종 결과를 S3 URL에 PUT으로만 올리면 된다. CFN은 ResponseURL에 결과가 도착할 때까지 polling하며 기다린다.

```python
import json, urllib.request

def handler(event, context):
    request_type = event['RequestType']  # Create / Update / Delete
    response_url = event['ResponseURL']  # pre-signed S3 PUT URL
    physical_id = event.get('PhysicalResourceId', 'slack-channel-default')

    response = {
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'PhysicalResourceId': physical_id,
    }

    try:
        if request_type == 'Create':
            channel_id = slack_create_channel(event['ResourceProperties']['ChannelName'])
            response['PhysicalResourceId'] = channel_id  # 진짜 ID로 갱신
            response['Status'] = 'SUCCESS'
            response['Data'] = {'ChannelId': channel_id}
        elif request_type == 'Update':
            slack_update_channel(physical_id, event['ResourceProperties'])
            response['Status'] = 'SUCCESS'
        elif request_type == 'Delete':
            slack_archive_channel(physical_id)
            response['Status'] = 'SUCCESS'
    except Exception as e:
        response['Status'] = 'FAILED'
        response['Reason'] = str(e)

    req = urllib.request.Request(
        response_url,
        data=json.dumps(response).encode('utf-8'),
        method='PUT',
        headers={'Content-Type': ''}  # 헤더 비움이 중요 (S3 서명 검증)
    )
    urllib.request.urlopen(req)
```

> ⚠️ **함정**: Lambda가 어떤 예외에도 응답을 보내지 못하면 CFN은 **기본 1시간**(설정으로 최대 3일까지) 동안 대기한다. 그 동안 Stack 전체가 `CREATE_IN_PROGRESS` 또는 `UPDATE_IN_PROGRESS` 상태로 묶이고, 다른 변경도 막힌다. 그래서 모든 Custom Resource Lambda는 **반드시 try/finally로 응답을 보장**해야 한다. AWS 공식 가이드는 `cfn-response` Python 모듈 또는 `aws-cdk-lib`의 Provider framework 사용을 권장하는데, 둘 다 응답 누락을 방지하는 boilerplate를 추상화한다.

## PhysicalResourceId — 리소스 동일성의 키

Custom Resource의 가장 미묘한 동작이 PhysicalResourceId의 의미다. CFN은 LogicalResourceId(템플릿 안의 이름)와 PhysicalResourceId(실제 외부 시스템의 ID)를 분리해 관리하는데, **Update 시 Lambda가 반환하는 PhysicalResourceId가 이전 값과 다르면 CFN은 그걸 "리소스 교체"로 해석한다**.

```
Create 호출  → Lambda가 PhysicalResourceId = "slack-CH001" 반환 → CFN이 기록
Update 호출  → Lambda가 같은 "slack-CH001" 반환             → 정상 Update
Update 호출  → Lambda가 다른 "slack-CH002" 반환             → CFN이 자동으로 이전 "slack-CH001"에 Delete 호출
```

이 동작은 의도된 설계다. **외부 시스템의 동일한 자원을 가리키는 키가 바뀌었다는 건 자원이 교체됐다는 의미**라고 보는 것이다. RDS DB Instance의 DBInstanceIdentifier 변경이 자동 교체를 유발하는 것과 같은 모델이다. 이걸 모르면 Custom Resource Lambda를 잘못 짜서 의도치 않은 자원 삭제가 발생한다.

```python
# 잘못된 패턴 — Update에서 새 ID 생성
def handler(event, context):
    if event['RequestType'] == 'Update':
        # 매번 새 UUID 생성 → 항상 자원 교체 발생
        physical_id = f"slack-{uuid.uuid4()}"  # ⚠️ 위험

# 올바른 패턴 — 동일성 키 유지
def handler(event, context):
    if event['RequestType'] == 'Update':
        physical_id = event['PhysicalResourceId']  # 이전 ID 그대로 사용
```

> 🔍 **더 깊이**: PhysicalResourceId 변경 시 CFN의 Delete 호출은 **이전 ID를 사용한다**. 즉 Update의 응답에 PhysicalResourceId="new"를 넣으면 CFN이 "old"로 Delete를 호출한다 — 그래서 Lambda의 Delete 분기는 항상 `event['PhysicalResourceId']`로 들어온 값을 자원 키로 봐야 한다. 새로 생성한 PhysicalResourceId가 아니라. 이 비대칭이 처음엔 직관적이지 않아 자주 사고의 원인이 된다.

> 📚 **사례**: 2020년 한 핀테크가 Custom Resource로 외부 결제 게이트웨이 API key를 생성/회전했는데, Update 시 새 API key 생성 후 PhysicalResourceId에 새 키 ID를 반환하도록 짰다. 결과는 매 Stack 업데이트마다 이전 API key가 자동 삭제되면서 진행 중인 결제 트랜잭션이 401로 실패했다. 패치 후 PhysicalResourceId를 외부 자원 이름(예: `payment-gateway-prod`)으로 고정하고 key rotation은 내부 로직으로만 처리하는 식으로 변경.

## CDK Provider Framework — isComplete 패턴

CDK는 Custom Resource Lambda를 직접 작성하는 부담을 줄이는 `Provider` 클래스를 제공한다. 가장 강력한 기능이 `isComplete` 핸들러로, **장시간 작업을 두 함수로 분리**한다.

```typescript
import { Provider } from 'aws-cdk-lib/custom-resources';

const onEvent = new lambda.Function(this, 'OnEvent', {
  // 작업 시작 (예: ECR 이미지 복제 트리거)
  // 반환: { Status: 'IN_PROGRESS', Data: { CopyId: 'xxx' } }
});

const isComplete = new lambda.Function(this, 'IsComplete', {
  // 작업 완료 여부 확인 (예: ECR 복제 상태 polling)
  // 반환: { IsComplete: true/false, Data: { Result: '...' } }
});

const provider = new Provider(this, 'Provider', {
  onEventHandler: onEvent,
  isCompleteHandler: isComplete,
  queryInterval: cdk.Duration.minutes(1),    // 1분마다 isComplete 호출
  totalTimeout: cdk.Duration.hours(2),       // 최대 2시간 대기
});

new CustomResource(this, 'EcrReplica', {
  serviceToken: provider.serviceToken,
  properties: { SourceImage: '...' },
});
```

내부적으로 Provider framework는 Step Functions를 자동 생성한다. onEvent가 작업을 시작하면 Step Functions가 isComplete를 주기적으로 호출하면서 polling하고, 완료되면 CFN ResponseURL에 결과를 PUT한다. 운영자는 Step Functions를 직접 만들지 않고 두 Lambda만 작성하면 된다 — **15분 Lambda 한계를 회피하는 가장 깔끔한 패턴**.

> 🎯 **시나리오**: "Custom Resource로 RDS 스냅샷을 다른 리전으로 복사하고 완료될 때까지 Stack을 대기시켜야 한다. 스냅샷 복사는 1시간 이상 걸릴 수 있다." — 답은 CDK Provider framework + isComplete 패턴. onEvent에서 `copy-db-snapshot` 호출하고, isComplete에서 `describe-db-snapshots`로 상태 확인. queryInterval=2분, totalTimeout=2시간. 직접 작성하면 Lambda 15분 한계로 불가능하고, Step Functions를 수동 작성하면 복잡도 증가.

## CloudFormation Hooks — Proactive Guardrail

2021년 출시된 Hooks는 Custom Resource와 완전히 다른 방향의 확장이다. Custom Resource가 "기능 추가"라면 Hooks는 "변경 사전 검증"이다. **CFN이 리소스를 생성/업데이트하기 전에 Hook이 호출되어 평가하고, FAIL을 반환하면 그 리소스 작업 자체가 차단된다**.

```python
# Hook 핸들러 (Resource Type Provider로 등록)
def handler(session, request, callback_context):
    target = request.hook_context.target_name  # 예: 'AWS::S3::Bucket'
    properties = request.hook_context.target_model.resource_properties

    if target == 'AWS::S3::Bucket':
        encryption = properties.get('BucketEncryption')
        if not encryption:
            return ProgressEvent.failed(
                error_code=HandlerErrorCode.NonCompliant,
                message='S3 bucket must have encryption enabled'
            )

    return ProgressEvent.success()
```

| 도구 | 시점 | 동작 |
|------|------|------|
| **CFN Hook** | 변경 전(pre-provision) | 위반 차단(proactive prevention) |
| **AWS Config Rule** | 변경 후(post-provision) | 평가 후 알람·자동 수정(reactive detection) |
| **SCP** | API 호출 시점 | 호출 자체 차단(account-wide) |
| **IAM Policy** | API 호출 시점 | 권한 거부 |
| **Stack Policy** | Stack Update 시점 | 특정 리소스 변경 거부 |

Hooks는 Control Tower의 Proactive Guardrails 백엔드로 쓰이며, 같은 메커니즘을 자체적으로 등록해 회사별 정책을 강제할 수 있다. 예를 들면 "모든 RDS는 multi-AZ 강제", "모든 S3는 BlockPublicAccess 강제", "모든 EC2는 IMDSv2만 강제" 같은 규칙을 변경 발생 전에 차단한다.

> 💡 **관련 이론**: Hooks는 Kubernetes의 ValidatingAdmissionWebhook과 같은 패턴이다. K8s가 리소스 생성/업데이트 요청을 받으면 admission controller가 webhook을 호출해 평가하고, 거부되면 요청 자체가 실패한다. OPA(Open Policy Agent) + Gatekeeper가 K8s 생태계의 표준 정책 엔진인 것처럼, CFN Hooks는 AWS 생태계의 변경 사전 검증 표준이다. NIST SP 800-204C의 "policy-as-code with admission control"의 권고 구현.

> 🔍 **더 깊이**: Hooks는 등록 시 `INVOCATION_POINT`로 어디서 호출될지 결정한다 — `PRE_PROVISION`(자원 생성 전), `PRE_UPDATE`(업데이트 전), `PRE_DELETE`(삭제 전). 각 invocation point에 모드(WARN/FAIL)도 지정 가능 — WARN은 로그만 남기고 진행, FAIL은 차단. 도입 초기엔 WARN으로 베이스라인 측정 후 FAIL로 전환하는 게 표준 패턴(graceful rollout).

## Change Set + CI/CD — 안전 변경의 표준

Change Set은 CFN의 변경을 "미리보기"로 만든다. 적용 전에 어떤 리소스가 추가/수정/삭제될지, **특히 Modify 시 Replacement(자원 교체) 여부**를 보여준다. Replacement = True는 다운타임 또는 데이터 손실의 신호다.

```
$ aws cloudformation describe-change-set --change-set-name v2 --stack-name myapp
{
  "Changes": [
    {
      "Type": "Resource",
      "ResourceChange": {
        "Action": "Modify",
        "LogicalResourceId": "ProdDatabase",
        "PhysicalResourceId": "myapp-prod-db",
        "ResourceType": "AWS::RDS::DBInstance",
        "Replacement": "True",                  # ⚠️ 자원 교체 발생
        "Scope": ["Properties"],
        "Details": [{
          "Target": {
            "Attribute": "Properties",
            "Name": "Engine",
            "RequiresRecreation": "Always"
          },
          "ChangeSource": "DirectModification"
        }]
      }
    }
  ]
}
```

이 정보로 운영자는 "이 변경이 안전한가"를 사람이 판단한다. CI/CD에 통합하는 표준 패턴은 다음과 같다.

```yaml
# CodePipeline 예
Stages:
  - Name: Source
    Actions: [...]
  - Name: Build
    Actions:
      - Name: BuildTemplate
        ActionTypeId: { Category: Build, Provider: CodeBuild }
  - Name: CreateChangeSet
    Actions:
      - Name: CreatePrChangeSet
        ActionTypeId: { Category: Deploy, Provider: CloudFormation }
        Configuration:
          ActionMode: CHANGE_SET_REPLACE
          StackName: myapp-prod
          ChangeSetName: pipeline-changes
          TemplatePath: BuildArtifact::packaged.yaml
          Capabilities: CAPABILITY_NAMED_IAM
  - Name: Approval
    Actions:
      - Name: ManualApproval
        ActionTypeId: { Category: Approval, Provider: Manual }
        Configuration:
          CustomData: 'Review Change Set in CFN console before approving'
  - Name: ExecuteChangeSet
    Actions:
      - Name: Execute
        ActionTypeId: { Category: Deploy, Provider: CloudFormation }
        Configuration:
          ActionMode: CHANGE_SET_EXECUTE
          StackName: myapp-prod
          ChangeSetName: pipeline-changes
```

Pipeline이 Change Set만 만들고 멈춘다 → 운영자가 CFN 콘솔에서 검토 → Approval 누르면 실행. **모든 prod 변경에 사람의 한 단계 확인을 강제하는 거버넌스 패턴**이다. SOC 2, PCI-DSS에서 요구하는 "change management" 통제 요건을 자동화로 충족한다.

> 📚 **사례**: 2021년 한 SaaS가 Change Set 검토 없이 직접 `aws cloudformation deploy`로 prod에 변경을 푸시했다가 RDS Engine을 잘못 수정해 6시간 다운타임을 겪었다. Engine 변경은 Replacement=True를 유발하지만, deploy 명령은 이 정보를 보여주지 않고 바로 실행한다. 이후 회사 표준이 "prod CFN 변경은 무조건 Change Set + Manual Approval"로 바뀌었고, 사고가 같은 패턴으로 재발한 적이 없다.

## Drift Detection의 진짜 의미와 한계

이 영역은 Day 1에서도 다뤘지만 Custom Resource·Hooks 맥락에서 다시 강조할 가치가 있다. **Drift Detection은 CFN이 알고 있는 속성만 비교한다**. 즉 Custom Resource가 만든 외부 시스템 자원(Slack 채널, GitHub webhook)의 변경은 CFN drift로 잡히지 않는다. 또 Hook이 차단한 변경 시도는 CloudTrail에는 남지만 drift와 무관하다.

| 변경 종류 | CFN Drift로 감지 | 다른 도구 필요 |
|----------|-----------------|---------------|
| AWS 리소스 속성 콘솔 직접 수정 | ✅ | - |
| AWS 리소스 콘솔에서 삭제 | ✅ | - |
| Custom Resource 외부 시스템 변경 | ❌ | 외부 시스템 audit log |
| Lambda 코드 직접 update-function-code | ❌ (CFN은 zip hash 비교 안 함) | CloudTrail |
| 신규 리소스 외부 추가 | △ (additional drift로 일부) | AWS Config |
| Hook이 차단한 시도 | ❌ | CloudTrail |

이 한계가 곧 "Drift Detection은 첫 번째 방어선이고 AWS Config + CloudTrail이 두 번째 방어선"이라는 거버넌스 패턴을 만든다. Drift Detection만으로는 prod 보안 보장 불가능.

> 🎯 **시나리오**: "Custom Resource로 만든 Slack 채널의 권한을 누가 직접 Slack에서 바꿨는지 추적하려면?" — 답은 Slack Audit Log Streaming(Enterprise Grid 기능)을 S3 또는 SIEM으로 보내고, EventBridge Rule이나 별도 워크플로로 평가. CFN Drift Detection은 외부 시스템 변경을 못 잡으므로 이 시나리오에서 무의미.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **Custom Resource는 CFN의 라이프사이클 엔진 확장**이고 K8s CRD + Operator와 같은 추상화 패턴이다. 둘째, **ResponseURL과 PhysicalResourceId는 비동기성과 동일성**이라는 두 개념을 다룬다 — 응답 안 보내면 1시간 timeout, PhysicalResourceId 바꾸면 자동 재생성. 셋째, **CDK Provider framework의 isComplete 패턴**은 Step Functions를 자동 생성해 15분 Lambda 한계를 우아하게 회피한다. 넷째, **Hooks는 변경 사전 검증(proactive)**으로 Config Rules(reactive)와 보완하며, K8s ValidatingAdmissionWebhook 패턴의 AWS 버전이다. 다섯째, **Change Set + Manual Approval은 SOC 2/PCI 거버넌스 표준**으로 prod 변경의 사람 한 단계 확인을 강제한다.

다음 글에서는 코드로 IaC를 정의하는 **CDK**를 본다. SAM이 Transform Macro로 YAML 위에 얹은 추상화라면, CDK는 TypeScript/Python/Java 같은 범용 언어로 합성(synth)해 CFN을 생성하는 한 단계 더 높은 추상화다.

---

## 📝 연습 문제

**문제 1.** Custom Resource Lambda가 어떤 분기에서도 ResponseURL에 응답을 보내지 못하면 발생하는 일은?

A) 자동 성공으로 처리
B) CFN이 기본 1시간(설정 시 최대 3일) 대기 후 Stack을 실패 처리 — 그동안 전체 Stack이 IN_PROGRESS로 묶임
C) 자동 재시도 3회
D) Layer로 자동 우회

**정답: B**

해설: CFN과 Lambda 간 비동기 응답 프로토콜의 핵심. Lambda timeout, 예외, return 누락 어떤 경로든 응답이 안 오면 CFN은 ResponseURL polling을 계속한다. 모든 try/finally 분기에 응답 보장이 필수이고, AWS는 `cfn-response` 모듈 또는 CDK Provider framework 사용을 권장한다. Stack이 묶이면 다른 변경도 막혀 운영 사고로 이어짐.

---

**문제 2.** Custom Resource Update 시 Lambda가 새 PhysicalResourceId를 반환하면 CFN의 동작은?

A) 동일 자원의 정상 Update
B) CFN이 이전 PhysicalResourceId로 Delete 호출 + 새 ID로 Create — 자원 교체로 해석
C) Stack 실패
D) 동작 변화 없음

**정답: B**

해설: PhysicalResourceId가 외부 자원의 동일성 키. 키가 바뀌면 다른 자원으로 간주해 자동 교체. RDS DBInstanceIdentifier 변경이 교체를 유발하는 것과 같은 모델. 2020년 핀테크 결제 API key 자동 회전 사고와 같은 패턴 — 매 Update마다 새 키 생성하도록 짜면 이전 자원이 자동 삭제되어 진행 중인 트랜잭션 실패. Update 분기에선 `event['PhysicalResourceId']` 유지가 표준.

---

**문제 3.** CDK Provider framework의 isComplete 핸들러가 풀어주는 문제는?

A) IAM 자동 생성
B) Lambda 15분 timeout 한계 — 장시간 작업(RDS 스냅샷 크로스 리전 복사, ECR 복제 등)을 Step Functions polling으로 우아하게 처리
C) 비용 절감
D) 자동 Drift Detection

**정답: B**

해설: Lambda invocation은 최대 15분이지만 외부 자원 작업은 더 길 수 있음. onEventHandler는 작업 시작, isCompleteHandler는 주기적으로 완료 여부 확인. CDK가 Step Functions를 자동 생성해 polling 인프라를 캡슐화. queryInterval/totalTimeout으로 polling 주기와 최대 대기 시간 조절. 수동으로 Step Functions를 작성하지 않아도 되는 추상화의 가치.

---

**문제 4.** CloudFormation Hooks와 AWS Config Rules의 가장 정확한 차이는?

A) 둘 다 동일한 시점에 평가
B) Hooks는 변경 전(pre-provision) 차단(proactive prevention), Config Rules는 변경 후(post-provision) 평가/알람/자동 수정(reactive detection)
C) Hooks는 IAM 전용
D) Config Rules는 비용이 더 비쌈

**정답: B**

해설: 사전 vs 사후가 핵심 차이. Hooks는 K8s ValidatingAdmissionWebhook과 같은 admission control 패턴 — 위반 변경이 절대 발생하지 않게 차단. Config Rules는 일어난 변경을 평가하고 알람 또는 Remediation Action으로 사후 대응. NIST SP 800-204C의 "policy-as-code with admission control" 권고 구현. Control Tower Proactive Guardrails가 내부적으로 Hooks 사용.

---

**문제 5.** prod CFN 변경에 SOC 2 / PCI-DSS의 change management 통제 요건을 충족하려면 가장 적절한 패턴은?

A) `aws cloudformation deploy` 한 줄로 자동화
B) CodePipeline에 CreateChangeSet → Manual Approval → ExecuteChangeSet 3단계 구성 + Change Set의 Replacement 정보를 사람이 검토 후 승인
C) IAM 권한만 강화
D) Drift Detection만으로 충분

**정답: B**

해설: `aws cloudformation deploy`는 Change Set 정보를 보여주지 않고 바로 실행 → Replacement=True 같은 위험 변경을 놓침(2021년 SaaS RDS Engine 사고). 표준 패턴은 Change Set으로 미리보기 → 사람 검토 → 승인 시 실행 3단계. ManualApproval Action이 사람의 한 단계 확인을 강제해 SOC 2 CC8.1(Change Management) 요건 자동화 충족. Drift Detection은 사후 감지이지 변경 통제 아님.

---

**문제 6.** Drift Detection이 감지하지 못하는 변경 중 가장 위험한 것은?

A) S3 버킷 콘솔 삭제
B) Custom Resource로 만든 외부 시스템(Slack 채널, GitHub webhook 등) 자원의 외부 변경 — CFN은 외부 시스템 상태를 모르므로 감지 불가, 별도 audit log 필요
C) EC2 인스턴스 타입 변경
D) RDS 비밀번호 회전

**정약: B**

**정답: B**

해설: CFN Drift Detection은 CFN이 추적하는 AWS 리소스 속성만 비교. Custom Resource는 외부 시스템 자원의 PhysicalResourceId만 기록하고 실제 자원 상태는 추적하지 않음. Slack 채널이 외부에서 archive되거나 권한이 변경돼도 CFN drift로 잡히지 않음. 외부 시스템 audit log streaming(Slack Audit Log, GitHub Audit Log)을 별도로 SIEM에 보내야 함. A/C는 모두 CFN drift로 감지 가능, D는 동적 참조 평문 보호 영역.

---

**문제 7.** CFN Hooks를 도입할 때 안전한 rollout 전략으로 가장 적절한 것은?

A) 처음부터 FAIL 모드로 모든 리소스에 적용
B) WARN 모드로 시작해 베이스라인 위반 측정 → 위반 해소 → FAIL 모드로 전환 (graceful rollout)
C) 한 번에 모든 hook 활성화
D) Hook 비활성화

**정답: B**

해설: WARN은 위반을 로그/알람만 남기고 변경 진행, FAIL은 차단. 처음부터 FAIL이면 기존 비준수 리소스의 모든 변경이 차단되어 운영 마비. WARN으로 베이스라인 측정 → 기존 위반 정리 → FAIL 전환의 단계적 접근이 표준. K8s OPA Gatekeeper도 동일한 dryrun → warn → deny rollout 패턴 권장. 거버넌스 도입의 일반 원칙.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Custom Resource는 CFN을 선언적 라이프사이클 엔진으로 확장하는 메커니즘이고 K8s CRD + Operator와 같은 추상화. 둘째, ResponseURL/PhysicalResourceId 프로토콜의 비동기성과 동일성 의미를 정확히 알아야 사고 없이 운영. 셋째, CDK Provider framework의 isComplete가 Step Functions를 자동 생성해 Lambda 15분 한계 우회. 넷째, Hooks는 변경 사전 검증(K8s ValidatingAdmissionWebhook과 같은 패턴)으로 Config Rules의 사후 대응과 보완. 다섯째, Change Set + Manual Approval은 SOC 2/PCI 거버넌스 요건의 자동화 표준이며 prod에 필수.
