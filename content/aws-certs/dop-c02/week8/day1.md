# Day 1 - CloudFormation 고급: Nested·Cross-Stack과 모듈화의 깊은 이야기

CloudFormation을 처음 쓸 때는 한 파일에 모든 걸 욱여넣는다. VPC, 보안 그룹, EC2, RDS, ALB가 한 템플릿에 들어가고, 500줄을 넘기면서 git diff를 읽기가 불가능해진다. 어느 순간 누군가 "VPC만 따로 빼자"고 말하면서 본격적인 모듈화가 시작된다. 그런데 떼어내자마자 두 갈래 길이 나타난다. 하나는 부모 템플릿이 자식 템플릿을 직접 호출하는 **Nested Stack**, 다른 하나는 완전히 독립적인 Stack들이 Export/ImportValue로 값을 교환하는 **Cross-Stack**이다. 둘 다 "재사용"이라는 같은 목적을 표방하지만 운영 모델은 정반대다.

오늘은 이 두 패턴이 왜 동시에 존재하는지, 결합도(coupling)라는 소프트웨어 공학의 오래된 주제가 IaC에서 어떻게 다시 나타나는지를 본다. 또 Export가 사용 중일 때 소스 Stack을 삭제하지 못해 만든 사고들, Stack Policy가 IAM과 다른 보호 계층인 이유, `{{resolve:secretsmanager:...}}` 동적 참조의 내부 동작과 한계, DeletionPolicy/UpdateReplacePolicy/UpdatePolicy 세 가족의 미묘한 차이까지 짚는다. DOP 시험에서는 이 영역에서 "어느 패턴을 골라야 하는가" 형태의 시나리오 문제가 매 회 3~5개씩 나온다.

## Nested Stack과 Cross-Stack — 결합도라는 같은 문제의 두 답

소프트웨어 공학에서 결합도(coupling)와 응집도(cohesion)는 Larry Constantine이 1968년에 정립한 개념이다. 두 모듈이 서로의 내부에 얼마나 의존하느냐를 결합도라고 하고, 한 모듈 안의 요소들이 얼마나 한 가지 목적에 묶여 있느냐를 응집도라고 한다. CloudFormation의 두 모듈화 패턴은 이 결합도 축의 양 끝에 자리잡고 있다.

**Nested Stack**은 부모-자식의 강결합(tight coupling)이다. 부모 템플릿 안에 `AWS::CloudFormation::Stack` 리소스를 선언하고 `TemplateURL`로 자식 템플릿을 가리킨다. 부모 Stack을 업데이트하면 자식 Stack까지 재평가되고, 부모 Stack을 삭제하면 자식 Stack도 함께 삭제된다. 라이프사이클이 하나로 묶여 있는 것이다. 그 대신 자식 Stack의 Output을 부모가 `!GetAtt VpcStack.Outputs.VpcId`로 직접 받아쓸 수 있어 의존성 관계가 명확하고 변경 추적이 쉽다.

**Cross-Stack**은 독립 Stack 간의 약결합(loose coupling)이다. 네트워크 Stack이 `Outputs.Export.Name`으로 값을 게시하면 앱 Stack이 `!ImportValue Network-VpcId`로 받아온다. 두 Stack은 완전히 독립적인 라이프사이클을 가져서 따로 배포·업데이트·삭제할 수 있다. 대신 값을 주고받는 "계약(contract)"이 Export 이름이라는 전역 네임스페이스에 묶이는데, 이게 다음에 볼 함정의 시작점이다.

> 💡 **관련 이론**: 결합도-응집도 원칙은 Edward Yourdon과 Larry Constantine의 1979년 책 *Structured Design*에서 정형화됐고, 이후 Robert Martin의 SOLID 원칙(특히 Single Responsibility, Interface Segregation)으로 이어진다. CloudFormation의 Nested vs Cross-Stack 선택은 본질적으로 같은 트레이드오프다. Nested는 한 트랜잭션으로 묶어 일관성을 얻지만 변경 영향을 격리하지 못한다. Cross-Stack은 격리를 얻지만 Export 이름이라는 명시적 계약을 관리해야 한다. Kubernetes의 Helm umbrella chart(Nested)와 Helm dependencies + separate releases(Cross)도 정확히 같은 축에 놓인다.

> 🔍 **더 깊이**: CloudFormation은 내부적으로 Stack을 "리소스의 트랜잭션 단위"로 본다. Nested Stack에서 자식 Stack 하나가 실패하면 **부모 Stack 전체가 롤백**된다(`UPDATE_ROLLBACK_IN_PROGRESS`). 즉 50개 자식 중 49번째가 실패하면 앞의 48개까지 모두 이전 상태로 되돌아간다. 이게 강결합의 비용이다. 반면 Cross-Stack은 앱 Stack이 실패해도 네트워크 Stack은 그대로다. 대규모 환경에서는 "장애 폭발 반경(blast radius)"을 줄이기 위해 도메인별로 Stack을 쪼개는 게 일반적이다.

> 🎯 **시나리오**: "한 회사가 200개 마이크로서비스를 운영하는데, 한 서비스의 IAM Role 추가 때문에 전체 인프라 Stack이 30분 동안 UPDATE_IN_PROGRESS에 묶인다. 어떻게 개선?" — 답은 Stack을 도메인별(네트워크/공통 IAM/서비스별)로 쪼개고 Cross-Stack Export/Import로 연결. 한 서비스 변경이 다른 서비스 배포를 막지 않게.

## Export가 사용 중일 때 — 잠금의 진짜 의미

Cross-Stack의 가장 큰 함정이 여기서 나온다. 네트워크 Stack이 `VpcId`를 Export하고 앱 Stack이 `!ImportValue Network-VpcId`로 가져다 쓰는 순간, **네트워크 Stack의 그 Output은 "잠긴다"**. Output의 이름·값을 변경할 수 없고, 더 무서운 건 네트워크 Stack 자체를 삭제할 수 없다는 점이다. CloudFormation이 Export의 글로벌 일관성을 유지하기 위해 만든 안전장치이지만, 실제 운영에서는 이게 자주 사고로 이어진다.

```yaml
# Network Stack
Outputs:
  VpcId:
    Value: !Ref Vpc
    Export:
      Name: !Sub '${AWS::StackName}-VpcId'   # "prod-network-VpcId"

# App Stack (다른 Stack)
Resources:
  Sg:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !ImportValue prod-network-VpcId   # ← 이 순간 Network Stack의 VpcId Export 잠김
```

이 잠금 상태에서 네트워크 Stack을 업데이트해 Export 값(`!Ref Vpc`가 반환하는 ID)을 바꿔야 하는 상황 — 예를 들면 VPC 재생성 — 이 오면 업데이트가 통째로 실패한다. 사용 중인 Export가 단 하나라도 있으면 그 값을 바꿀 수 없기 때문이다. 그래서 운영팀이 마이그레이션 윈도우에 들어가서 "1단계: 앱 Stack에서 ImportValue를 제거", "2단계: 네트워크 Stack 업데이트", "3단계: 앱 Stack에 ImportValue 다시 추가" 같은 3단 배포를 짜야 한다. 이게 매번 반복되면 결국 SSM Parameter Store나 Service Catalog로 갈아타게 된다.

> ⚠️ **함정**: `aws cloudformation list-exports`와 `aws cloudformation list-imports --export-name <name>`로 누가 이 Export를 쓰고 있는지 미리 확인할 수 있다. 운영 표준으로 Export를 게시한 Stack의 README에 "Export 변경 절차"를 명시하지 않으면, 6개월 뒤 그 Export를 누가 쓰는지 아무도 모르는 상태에서 변경 시도하다 prod 전체 배포가 멈춘다. 실제로 2022년 한 게임사가 VPC 확장 작업을 하다 12시간 동안 모든 신규 배포가 막힌 사례가 있다.

> 📚 **사례**: AWS 자체 설명서(Best Practices)에서도 "Stack 수가 늘어나면 Export/ImportValue 대신 **SSM Parameter Store**를 권장"한다. Parameter Store는 잠금이 없어 자유롭게 변경 가능하고, 동적 참조 `'{{resolve:ssm:/network/vpc-id:1}}'`로 가져올 때 버전을 명시할 수 있어 의도치 않은 변경 영향을 통제한다. 단점은 변경 시점에 자동으로 의존 Stack이 업데이트되지 않는다는 것(Stack은 deploy 시점에만 해석).

## 동적 참조(Dynamic References)의 내부 동작

`'{{resolve:secretsmanager:prod/db:SecretString:password}}'` 같은 문법이 CloudFormation 템플릿 곳곳에 나온다. 이게 어떻게 동작하는지 알면 시험 문제뿐 아니라 실무 사고도 절반은 줄어든다.

동적 참조는 **CloudFormation이 리소스 생성/업데이트 직전에 시크릿을 외부 서비스에서 fetch해 임시로 주입**하는 메커니즘이다. 템플릿 자체에는 비밀번호 평문이 들어가지 않고, S3에 업로드된 템플릿 파일에도 평문이 없으며, ChangeSet에도 마스킹된 형태로만 나타난다. 지원되는 출처는 세 가지다.

| 출처 | 문법 | 캐싱 |
|------|------|------|
| **SSM Parameter** | `'{{resolve:ssm:/path/to/param:version}}'` | 버전 지정 가능, latest는 생성/업데이트 시점 |
| **SSM Secure String** | `'{{resolve:ssm-secure:/path:version}}'` | KMS 복호화 후 주입, version 필수 |
| **Secrets Manager** | `'{{resolve:secretsmanager:secret-id:SecretString:json-key:version-stage:version-id}}'` | JSON 키 추출, 회전 버전 지정 |

내부적으로 CloudFormation 서비스가 자신의 Service Role(또는 사용자의 IAM 권한)로 `ssm:GetParameter` 또는 `secretsmanager:GetSecretValue`를 호출한다. 그래서 Stack을 배포하는 역할이 시크릿에 접근 권한이 없으면 `Dynamic reference resolution failed` 오류가 나면서 전체 Stack이 멈춘다.

```yaml
Resources:
  Db:
    Type: AWS::RDS::DBInstance
    Properties:
      MasterUsername: '{{resolve:secretsmanager:prod/db:SecretString:username}}'
      MasterUserPassword: '{{resolve:secretsmanager:prod/db:SecretString:password}}'
      # 같은 시크릿의 다른 키를 두 번 fetch — Secrets Manager 호출 2회
```

> 🔍 **더 깊이**: 동적 참조는 **fetch한 값이 CloudFormation 내부에 영구 저장되지 않는다**. 즉 다음 Stack 업데이트 시점에 다시 fetch하기 때문에 Secrets Manager에서 시크릿을 회전해도 자동으로 RDS 비밀번호가 바뀌지는 않는다. RDS와 Secrets Manager의 자동 회전을 연결하려면 별도로 `AWS::SecretsManager::SecretTargetAttachment`와 회전 Lambda를 써야 한다. 동적 참조는 "주입" 메커니즘이지 "동기화" 메커니즘이 아니다.

> ⚠️ **함정**: 동적 참조를 쓰면 Stack drift detection이 시크릿 변경을 못 잡는다. CloudFormation은 템플릿에 적힌 `'{{resolve:...}}'` 문자열만 비교하지 실제 fetch된 값을 비교하지 않는다. 그래서 누가 Secrets Manager에서 직접 비밀번호를 바꿔도 drift는 발생하지 않는다. 시크릿 변경 감지가 필요하면 EventBridge 규칙으로 Secrets Manager 회전 이벤트를 잡아야 한다.

## Stack Policy — IAM과 다른 보호 계층

처음 Stack Policy를 보면 IAM 정책과 거의 똑같이 생겼다. JSON, Effect/Action/Principal/Resource 구조다. 그런데 왜 따로 존재할까. **IAM은 "누가 무엇을 할 수 있는가"를 통제하고, Stack Policy는 "이 Stack 안에서 특정 리소스가 보호되는가"를 통제한다**. 권한 모델이 아니라 변경 보호 모델이다.

```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "Update:*",
      "Principal": "*",
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "Action": ["Update:Replace", "Update:Delete"],
      "Principal": "*",
      "Resource": [
        "LogicalResourceId/ProdDatabase",
        "LogicalResourceId/ProdS3Bucket"
      ]
    }
  ]
}
```

이 정책이 적용된 Stack에서는 누가 어떤 IAM Role로 시도해도 ProdDatabase를 Replace 또는 Delete하는 ChangeSet은 실패한다. IAM에서 PowerUser 권한을 가진 운영자가 실수로 prod 템플릿을 잘못 수정해 RDS Engine을 바꾸려 해도(Engine 변경은 Replace) 막힌다. **변경을 진행하려면 Stack Policy를 일시적으로 풀어야 하는데**, 이 풀기 작업 자체가 변경 이력에 남고 사람의 한 단계 확인을 강제한다.

| 보호 메커니즘 | 누가 막는가 | 어떻게 막는가 |
|--------------|-----------|--------------|
| **IAM Policy** | 사용자/역할 단위 | API 호출을 거부 |
| **Stack Policy** | Stack 안의 특정 리소스 | Update 종류(Replace/Delete/Modify)를 거부 |
| **Termination Protection** | Stack 자체의 삭제 | DeleteStack API 거부 |
| **DeletionPolicy: Retain** | 리소스가 삭제될 때 | Stack은 삭제되지만 리소스는 남김 |
| **UpdateReplacePolicy: Retain** | 리소스 속성 변경으로 교체될 때 | 기존 리소스를 떼어내고 보존 |

이 다섯 가지가 다 다른 시점에 작동한다는 게 자주 헷갈리는 부분이다. **DeletionPolicy는 Stack 삭제 시, UpdateReplacePolicy는 속성 변경에 의한 교체 시** 작동한다. 같은 RDS인데 Engine을 바꿔서 교체되는 경우와 Stack을 삭제하는 경우가 다른 정책에 걸린다는 뜻이다. 그래서 prod stateful 리소스는 **두 정책을 다 Snapshot 또는 Retain으로** 설정하는 게 표준이다.

> 💡 **관련 이론**: 변경 보호 계층화는 NIST SP 800-53의 CM-3(Configuration Change Control)와 CM-5(Access Restrictions for Change)의 권고를 IaC에 적용한 모습이다. "변경 통제는 권한과 별도로 존재해야 한다"는 원칙으로, 사람의 권한이 있어도 시스템 차원의 가드레일이 따로 있어야 한다는 깊은 보안 원칙(defense in depth).

## UpdatePolicy — ASG와 Lambda의 다른 의미

이름이 비슷해서 자주 헷갈리는 게 `UpdatePolicy`다. UpdateReplacePolicy(교체 시 동작)와 완전히 다른 속성이고, **리소스가 인-플레이스 업데이트될 때 어떻게 진행할지를 통제**한다. AutoScalingGroup에서 가장 잘 알려져 있다.

```yaml
WebAsg:
  Type: AWS::AutoScaling::AutoScalingGroup
  UpdatePolicy:
    AutoScalingRollingUpdate:
      MinInstancesInService: 4         # 항상 최소 4대는 트래픽 받음
      MaxBatchSize: 2                   # 한 번에 2대씩 교체
      PauseTime: PT5M                   # 각 배치 사이 5분 대기
      WaitOnResourceSignals: true       # cfn-signal 받을 때까지 대기
      SuspendProcesses:                 # 업데이트 중 비활성화할 ASG 프로세스
        - HealthCheck
        - ReplaceUnhealthy
        - AZRebalance
        - AlarmNotification
        - ScheduledActions
  Properties:
    MinSize: 4
    MaxSize: 12
    DesiredCapacity: 6
    LaunchTemplate: ...
```

`WaitOnResourceSignals: true`는 EC2 UserData 안에서 `cfn-signal`을 호출해 "나 정상 부팅 끝났다"고 알릴 때까지 다음 배치로 넘어가지 않게 한다. 이게 없으면 ASG는 인스턴스가 RUNNING 상태가 되자마자 다음 배치를 시작하고, 그 사이에 새 인스턴스가 헬스체크에 실패해도 모르고 계속 교체하다 전체 서비스가 죽는다.

| 리소스 | UpdatePolicy 종류 | 무엇을 통제 |
|--------|-------------------|------------|
| `AWS::AutoScaling::AutoScalingGroup` | `AutoScalingRollingUpdate` | 인스턴스 단계적 교체 |
| `AWS::AutoScaling::AutoScalingGroup` | `AutoScalingReplacingUpdate` | ASG 자체를 새로 만들고 트래픽 시프트 |
| `AWS::AutoScaling::AutoScalingGroup` | `AutoScalingScheduledAction` | 스케줄 액션이 있을 때 동작 |
| `AWS::Lambda::Alias` | `CodeDeployLambdaAliasUpdate` | Canary/Linear 트래픽 시프트 |
| `AWS::ElastiCache::ReplicationGroup` | `UseOnlineResharding` | 온라인 리샤딩 |

> 🔍 **더 깊이**: AutoScalingReplacingUpdate는 ASG 자체를 새로 만든다. 즉 새 ASG에 새 인스턴스를 띄우고, 두 ASG가 잠시 공존하다 ELB Target Group이 새 ASG 인스턴스만 가리키게 되고, 마지막에 기존 ASG가 삭제된다. **블루/그린의 EC2 버전**이라고 보면 된다. RollingUpdate가 in-place 교체라면 ReplacingUpdate는 ASG 단위 블루/그린.

## CFN Helper Scripts — 사라져가는 부트스트랩 패턴

EC2 인스턴스가 부팅하면서 cfn-init으로 자동 구성하는 패턴은 2010년대 초중반의 표준이었다. 지금은 AMI 베이킹(Packer), 컨테이너, EKS, Lambda로 워크로드가 옮겨가면서 사용 빈도가 줄었지만 시험에는 여전히 나온다.

```yaml
WebInstance:
  Type: AWS::EC2::Instance
  Metadata:
    AWS::CloudFormation::Init:
      configSets:
        default: [install, configure, start]
      install:
        packages:
          yum:
            nginx: []
            python3: []
        files:
          /etc/nginx/conf.d/app.conf:
            content: !Sub |
              server {
                listen 80;
                location / { proxy_pass http://localhost:8080; }
              }
            owner: root
            group: root
            mode: '000644'
      configure:
        commands:
          01_set_hostname:
            command: !Sub 'hostnamectl set-hostname web-${Environment}'
      start:
        services:
          sysvinit:
            nginx:
              enabled: true
              ensureRunning: true
              files: [/etc/nginx/conf.d/app.conf]
  CreationPolicy:
    ResourceSignal:
      Timeout: PT10M
  Properties:
    UserData: !Base64
      Fn::Sub: |
        #!/bin/bash -xe
        yum install -y aws-cfn-bootstrap
        /opt/aws/bin/cfn-init -v -s ${AWS::StackName} -r WebInstance --configsets default --region ${AWS::Region}
        /opt/aws/bin/cfn-signal -e $? --stack ${AWS::StackName} --resource WebInstance --region ${AWS::Region}
```

`CreationPolicy.ResourceSignal.Timeout: PT10M`은 10분 안에 cfn-signal이 안 오면 인스턴스 생성을 실패로 처리한다. 이게 ASG의 UpdatePolicy.WaitOnResourceSignals와 짝을 이룬다. cfn-init은 멱등성을 갖도록 설계됐는데, 같은 configSet을 여러 번 실행해도 결과가 같다. `cfn-hup`은 daemon으로 떠서 메타데이터 변경(Stack 업데이트)을 감지하면 cfn-init을 다시 실행한다 — 즉 인스턴스 재부팅 없이 설정 변경 가능.

> 📚 **사례**: 2018년경까지 많은 회사가 cfn-init으로 OS 패키지를 설치했지만, 이게 인스턴스 부팅 시간을 3~5분 이상 늦추고 yum/apt 미러 장애에 직접 노출되는 문제가 있었다. 그래서 지금은 Packer로 AMI를 미리 베이크하고 cfn-init은 최소한의 환경 변수 주입과 cfn-signal 정도만 쓰는 게 일반적이다. AMI 베이킹은 GoldenAMI 패턴으로 부트 시간을 30초 미만으로 줄인다.

## Drift Detection — 자동 수정 없는 감지의 의도

`aws cloudformation detect-stack-drift`는 Stack의 모든 리소스를 검사해 템플릿 정의와 실제 상태를 비교한다. 결과는 `IN_SYNC`, `MODIFIED`, `DELETED`, `NOT_CHECKED` 중 하나로 표시되고, 어떤 속성이 어떻게 다른지 상세 비교를 제공한다. 그런데 흥미로운 점은 **CloudFormation이 자동으로 drift를 수정하지 않는다**는 것이다.

이게 의도된 설계다. Drift가 났다는 건 "누군가 콘솔/CLI로 직접 변경했다"는 뜻이고, 그 변경이 의도된 긴급 패치일 수도 있고 실수일 수도 있다. CloudFormation이 자동으로 되돌리면 긴급 패치를 지워버려 더 큰 사고로 이어진다. 그래서 drift는 "감지만 하고 알린다"는 보수적 접근을 취하고, 수정은 사람이 ChangeSet으로 진행하거나 별도 도구(AWS Config Rules, Custom Lambda)로 자동화한다.

| 도구 | drift 감지 | 자동 수정 | 사용 시점 |
|------|-----------|-----------|----------|
| **CFN Drift Detection** | ✅ Stack 단위 | ❌ | 수동/스케줄 실행 |
| **AWS Config Rules** | ✅ 리소스 단위 | ✅ (Remediation) | 지속 모니터링 |
| **Terraform plan** | ✅ State 비교 | ❌ (refresh로 받아들임) | CI 파이프라인 |
| **Pulumi refresh** | ✅ | ❌ | CI 파이프라인 |

> 🎯 **시나리오**: "어느 날 prod RDS의 backup retention이 7일에서 3일로 바뀌어 있었다. 누가 언제 바꿨는지 추적하고, 자동 복원되게 하려면?" — 답은 (1) CloudTrail로 RDS modify 호출 추적, (2) Config Rule `rds-instance-deletion-protection-enabled` 같은 관리형 규칙으로 변경 감지, (3) SSM Automation Document를 Config Remediation으로 등록해 자동 복원. CFN Drift는 감지만 가능하므로 단독으로는 부족.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **Nested Stack과 Cross-Stack은 같은 모듈화의 두 답**이고 결합도라는 1968년의 소프트웨어 공학 원칙이 그대로 적용된다. 둘째, **Cross-Stack의 Export는 사용 중이면 잠긴다** — 운영 표준으로 Parameter Store 전환을 고려하라. 셋째, **동적 참조는 fetch 메커니즘이지 동기화가 아니다** — Drift detection도 못 잡으니 EventBridge로 별도 감지. 넷째, **Stack Policy / Termination Protection / DeletionPolicy / UpdateReplacePolicy는 모두 다른 시점에 작동**하는 보호 계층이다. 다섯째, **Drift Detection은 의도적으로 감지만** 하고, 자동 수정은 Config Rules로 분리한다.

다음 글에서는 StackSets를 통해 이 모든 패턴을 멀티 계정·멀티 리전으로 확장하는 방법을 본다. AWS Organizations와 결합되면서 거버넌스의 차원이 한 단계 더 올라간다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 200개 마이크로서비스 인프라를 단일 CloudFormation Stack에 담아 운영 중이다. 한 서비스의 IAM 변경 때문에 전체 Stack이 UPDATE_IN_PROGRESS로 30분간 묶이는 문제를 가장 적절히 해결하려면?

A) Nested Stack으로 자식 50개를 만든다
B) 도메인별로 Stack을 쪼개고 Cross-Stack Export/Import로 연결한다
C) Terraform으로 마이그레이션
D) Stack Policy로 변경 차단

**정답: B**

해설: Nested Stack은 자식이 늘어도 부모 Stack 한 트랜잭션 안에서 평가되므로 문제(변경 영향 격리 부재)가 해결되지 않는다. Cross-Stack은 독립 라이프사이클을 가져 한 서비스 변경이 다른 서비스 배포를 막지 않는다. 결합도-응집도 원칙의 적용. Terraform 마이그레이션(C)은 비용이 크고 본질을 해결하지 않으며 CFN의 거버넌스 자산(StackSets, Service Catalog)을 잃는다. Stack Policy(D)는 변경 보호이지 격리 도구가 아니다.

---

**문제 2.** Cross-Stack에서 Export `prod-network-VpcId`가 다른 Stack의 ImportValue로 사용 중이다. 네트워크 Stack 업데이트로 VPC를 재생성(논리 ID 재사용, 물리 ID 변경)하려 할 때 일어나는 일은?

A) 자동으로 의존 Stack까지 업데이트됨
B) Export 값 변경 시도가 실패해 전체 Stack 업데이트 롤백
C) Export가 자동 잠금 해제됨
D) 변경 영향이 의존 Stack에 자동 전파

**정답: B**

해설: 사용 중인 Export의 값은 변경 불가. VPC 재생성은 Export 값(VpcId)을 바꾸므로 Stack 업데이트 자체가 실패한다. 의존 Stack에서 먼저 ImportValue를 제거(3단계 배포의 1단계) → 네트워크 Stack 업데이트 → 의존 Stack에 ImportValue 다시 추가 순으로 진행해야 한다. 2022년 게임사 12시간 prod 배포 마비 사례와 동일한 패턴. AWS Best Practices는 이런 경우 SSM Parameter Store 전환을 권장.

---

**문제 3.** 다음 중 `'{{resolve:secretsmanager:prod/db:SecretString:password}}'` 동적 참조에 대해 옳은 설명은?

A) Secrets Manager 회전 시 RDS 비밀번호가 자동으로 동기화된다
B) Drift Detection이 시크릿 값 변경을 자동 감지한다
C) Stack 배포 시점에 CloudFormation Service Role이 GetSecretValue 호출로 fetch해 주입하고, 템플릿/ChangeSet에는 평문이 남지 않는다
D) S3에 저장된 템플릿 안에 복호화된 평문이 저장된다

**정답: C**

해설: 동적 참조는 fetch 메커니즘. Stack 생성/업데이트 시점에 외부 서비스에서 가져와 임시 주입한다. 회전 동기화(A)는 별도 `SecretTargetAttachment` + 회전 Lambda가 필요. Drift Detection(B)은 템플릿의 `'{{resolve:...}}'` 문자열만 비교하므로 시크릿 값 변경 못 잡음 — EventBridge로 회전 이벤트 잡는 게 표준. 평문이 절대 템플릿/ChangeSet/S3에 저장되지 않는다는 게 동적 참조의 핵심 보안 이점.

---

**문제 4.** Stack Policy와 IAM Policy의 차이로 가장 정확한 것은?

A) Stack Policy는 IAM Policy의 별칭
B) Stack Policy는 Stack 안의 특정 리소스에 대한 Update 종류(Replace/Delete/Modify)를 통제하는 변경 보호 계층이고, IAM은 사용자/역할의 API 호출 권한을 통제
C) Stack Policy는 비용 최적화 도구
D) 둘 다 동일한 시점에 평가됨

**정답: B**

해설: 권한(IAM)과 변경 보호(Stack Policy)는 다른 계층. PowerUser IAM 권한을 가진 운영자가 실수로 prod 템플릿을 잘못 수정해도 Stack Policy가 ProdDatabase의 Replace를 Deny하면 막힌다. NIST SP 800-53 CM-3/CM-5의 "변경 통제와 접근 통제 분리" 원칙의 구현. 변경을 진행하려면 Stack Policy를 일시 해제해야 하므로 사람의 한 단계 확인이 강제된다.

---

**문제 5.** RDS prod 인스턴스를 보호하기 위해 다음 중 가장 완전한 조합은?

A) DeletionPolicy: Retain만
B) Termination Protection만
C) DeletionPolicy: Snapshot + UpdateReplacePolicy: Snapshot + Stack Policy로 Replace/Delete Deny + Termination Protection
D) IAM 정책으로 RDS DeleteDBInstance 거부

**정답: C**

해설: 네 가지가 모두 다른 시점에 작동. DeletionPolicy는 Stack 삭제 시, UpdateReplacePolicy는 속성 변경에 의한 교체 시(예: Engine 변경), Stack Policy는 Update API 진입 시점, Termination Protection은 DeleteStack API 호출 자체를 차단. 단일 정책으로는 우회 경로가 항상 존재. defense in depth 원칙. A는 Engine 변경 교체에 약함, B는 update 보호 없음, D는 Stack을 통한 변경에 약함(CFN이 IAM 우회).

---

**문제 6.** ASG의 UpdatePolicy `AutoScalingRollingUpdate`에서 `WaitOnResourceSignals: true`의 효과는?

A) ASG의 모든 인스턴스를 동시에 교체
B) 각 배치 인스턴스가 cfn-signal로 정상 신호를 보낼 때까지 다음 배치 진행 보류 — 부팅 실패 인스턴스가 누적되는 것 방지
C) 자동 롤백 비활성화
D) IAM 권한 변경

**정답: B**

해설: cfn-signal은 EC2 UserData에서 `/opt/aws/bin/cfn-signal --exit-code $?`로 호출되며 "정상 부팅 완료"를 알린다. 이게 없으면 ASG는 RUNNING 상태만 보고 다음 배치를 시작해 부팅 실패가 누적되며 서비스 전체가 죽을 수 있다. CreationPolicy.ResourceSignal.Timeout과 짝을 이뤄 안전한 점진 교체를 보장. RollingUpdate는 in-place 교체(개별 인스턴스), ReplacingUpdate는 ASG 단위 블루/그린이라는 차이도 시험 포인트.

---

**문제 7.** CFN Drift Detection이 자동 수정을 제공하지 않는 이유로 가장 정확한 것은?

A) 기술적 한계
B) Drift는 긴급 패치일 수도 실수일 수도 있어 자동 복원이 더 큰 사고로 이어질 위험 — 감지/알림은 CFN, 자동 수정은 Config Rules의 Remediation Action으로 책임 분리
C) AWS 정책상 금지
D) 비용 문제

**정답: B**

해설: 자동 수정이 인시던트 대응 중 진행되면 운영자가 손으로 적용한 긴급 패치를 되돌려 장애를 악화시킨다. 그래서 보수적 설계 — CFN은 감지만, Config Rules + SSM Automation Document로 명시적 자동화 정책을 등록한 경우만 자동 복원. 책임 분리(separation of concerns)와 안전성 우선 설계의 전형. CloudTrail로 변경 추적, Config로 평가, SSM Automation으로 복원의 3단 구성이 표준.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Nested(강결합, 한 트랜잭션)와 Cross-Stack(약결합, 독립 라이프사이클)은 1968년 결합도 원칙의 IaC 적용. 둘째, Export는 사용 중이면 잠기므로 Parameter Store 전환이 권장. 셋째, 동적 참조는 fetch이지 동기화가 아니며 Drift Detection이 못 잡는다. 넷째, Stack Policy / Termination Protection / DeletionPolicy / UpdateReplacePolicy는 모두 다른 시점의 보호 계층이고 defense in depth로 함께 써야 한다. 다섯째, Drift Detection은 의도적으로 감지만 하며 자동 수정은 Config Rules + SSM Automation으로 분리.
