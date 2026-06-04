# Day 57 - CloudFormation: 인프라를 "선언"한다는 발상

서버 한 대를 콘솔에서 클릭으로 만드는 건 쉽다. 그런데 VPC, 서브넷, 보안 그룹, EC2, RDS, ALB, Lambda 수십 개를 클릭으로 만들고, 그걸 스테이징·프로덕션에 똑같이 복제하고, 6개월 뒤에 "이 보안 그룹이 왜 이렇게 열려 있지?"를 추적하려 하면 지옥이 시작된다. 손으로 만든 인프라는 재현할 수 없고, 변경 이력이 없으며, 사람의 기억에만 의존한다. **인프라를 코드로(Infrastructure as Code, IaC)** 정의한다는 발상은 이 문제를 정면으로 친다 — 인프라를 텍스트 파일에 선언하면, 버전 관리(git)가 가능해지고, 코드 리뷰가 가능해지고, 똑같은 환경을 명령 한 번으로 재생산할 수 있다. AWS CloudFormation은 이 IaC를 AWS 위에서 구현한 서비스다.

DVA-C02에서 CloudFormation은 배포 도메인의 중심축이고, SAM·CDK의 기반이라 반드시 알아야 한다. 단순 암기(`!Ref` vs `!GetAtt`, DeletionPolicy)도 나오지만, "스택 업데이트가 왜 위험한가", "롤백은 어떻게 동작하나", "교차 스택 참조의 함정" 같은 동작 원리가 더 자주 나온다. 이번 글은 선언적 IaC가 명령적 스크립트와 무엇이 다른지, CloudFormation이 어떻게 의존 그래프를 풀어 생성 순서를 정하는지, 스택 업데이트와 롤백의 내부 동작은 어떤지, 그리고 여러 보호 메커니즘이 갈라지는 이유를 깊이 파고든다.

## 선언적 대 명령적: "무엇을"과 "어떻게"의 차이

CloudFormation 템플릿을 처음 보면 "그냥 설정 파일 아닌가" 싶지만, 그 밑에는 **선언적(declarative) 모델**이라는 중요한 철학이 있다. 선언적 IaC는 "**무엇을** 원하는지(원하는 최종 상태)"만 적고, "그것을 **어떻게** 만들지(생성 순서, API 호출, 에러 처리, 롤백)"는 CloudFormation 엔진에 맡긴다. 반대로 bash 스크립트로 `aws ec2 create-vpc` → `aws ec2 create-subnet` → ...을 순서대로 적는 것은 **명령적(imperative) 모델**이다.

이 차이가 실무에서 결정적이다. 명령적 스크립트는 "절반 실행되다 실패하면" 어중간한 상태로 남는다 — VPC는 만들어졌는데 서브넷에서 실패하면, 그 VPC를 정리할 책임이 사람에게 있다. 선언적 모델은 "원하는 상태"와 "현재 상태"의 차이를 엔진이 계산하므로, 두 번 실행해도 같은 결과가 나오는 **멱등성(idempotency)** 을 가지고, 실패하면 엔진이 알아서 **자동 롤백**한다. "내가 시키는 대로 하라"가 아니라 "이 상태가 되게 하라"는 것이다.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: My Application Stack

Parameters:
  EnvironmentName:
    Type: String
    Default: production
    AllowedValues: [production, staging, development]

Conditions:
  IsProduction: !Equals [!Ref EnvironmentName, production]

Mappings:
  RegionAMI:
    ap-northeast-2: { AMI: ami-0c9c942bd7bf113a2 }
    us-east-1:      { AMI: ami-0abcdef1234567890 }

Resources:
  MyVPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      Tags: [{ Key: Name, Value: !Sub "${EnvironmentName}-vpc" }]

  MyEC2:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: !If [IsProduction, m5.large, t3.micro]
      ImageId: !FindInMap [RegionAMI, !Ref AWS::Region, AMI]

Outputs:
  VPCId:
    Value: !Ref MyVPC
    Export:
      Name: !Sub "${EnvironmentName}-vpc-id"
```

> 💡 **관련 이론**: 선언적 모델의 핵심 가치는 **수렴(convergence)** 이다 — 시스템이 어떤 상태에서 출발하든 선언된 목표 상태로 수렴한다. 이는 구성 관리 도구의 오랜 계보(Puppet 2005, Chef 2009, Ansible 2012)가 공유하는 철학이고, 더 근본적으로는 함수형 프로그래밍의 "무엇을 계산할지 기술하되 어떻게 계산할지는 런타임에 맡긴다"와 닮았다. CloudFormation, Terraform, 쿠버네티스 매니페스트가 모두 선언적인 이유는, 분산 인프라에서 "사람이 모든 순서와 에러를 손으로 챙기는 것"이 본질적으로 불가능에 가깝기 때문이다. 엔진에게 그 복잡성을 떠넘기는 것이 선언형의 본질이다.

## CloudFormation은 생성 순서를 어떻게 정하는가: 의존 그래프

템플릿에 EC2와 그것이 속할 VPC, 보안 그룹을 적었을 때, CloudFormation은 무엇을 먼저 만들어야 하는지 어떻게 알까? 답은 **의존 그래프(dependency graph)** 다. CloudFormation은 템플릿을 파싱하면서 리소스 간 참조를 추출한다 — EC2가 `!Ref MyVPC`로 VPC를 참조하면 "EC2는 VPC에 의존한다"는 간선이 생긴다. 이렇게 만들어진 방향 그래프를 **위상 정렬(topological sort)** 해서, 의존되는 것부터(VPC → 서브넷 → EC2) 순서대로 만들고, 서로 의존하지 않는 리소스들은 **병렬로** 생성한다.

그래서 대부분의 경우 `DependsOn`을 명시할 필요가 없다 — `!Ref`나 `!GetAtt`로 다른 리소스를 참조하면 의존성이 자동으로 추론된다. `DependsOn`은 그 자동 추론이 닿지 않는 "암묵적 의존"을 강제할 때만 쓴다(예: IAM 역할이 실제로 전파되기 전에 그걸 쓰는 리소스가 만들어지면 안 될 때).

> 🔍 **더 깊이**: `!Ref`와 `!GetAtt`의 차이는 단순 암기를 넘어 의존 그래프의 작동과 연결된다. `!Ref MyVPC`는 보통 그 리소스의 "기본 식별자"(VPC면 VPC ID)를 돌려주고, `!GetAtt MyRDS.Endpoint.Address`는 특정 속성을 콕 집어 가져온다. 둘 다 "이 값을 알려면 그 리소스가 먼저 만들어져야 한다"는 의존성을 만든다. 그런데 `!GetAtt`가 가져오는 속성 중에는 리소스가 **완전히 프로비저닝된 뒤에야** 정해지는 것이 있다(RDS 엔드포인트 주소는 DB가 다 떠야 알 수 있다). 그래서 RDS 엔드포인트를 `!GetAtt`로 참조하는 리소스는 RDS의 생성 완료까지 기다리게 되고, 이게 스택 생성이 길어지는 흔한 원인이다.

> ⚠️ **함정**: 두 리소스가 서로를 참조하면 **순환 의존(circular dependency)** 이 생겨 스택 생성이 실패한다. 예를 들어 보안 그룹 A가 B를 인바운드로 참조하고 B가 A를 참조하면 위상 정렬이 불가능하다. 해법은 인라인 규칙 대신 **별도의 `SecurityGroupIngress` 리소스**로 규칙을 떼어내 순환을 끊는 것이다. 시험에서 "circular dependency" 에러가 보이면 거의 이 패턴이다.

## 스택 업데이트의 세 가지 운명: 수정, 교체, 중단 없는 변경

CloudFormation에서 가장 위험한 순간은 생성이 아니라 **업데이트**다. 이미 떠 있는 프로덕션 스택의 템플릿을 바꿔 적용할 때, CloudFormation은 변경된 각 리소스를 세 갈래 중 하나로 처리한다.

- **중단 없는 수정(No interruption)**: 리소스를 유지한 채 속성만 바꾼다. 예: EC2 태그 변경, Lambda 환경 변수 변경. 가장 안전하다.
- **일부 중단(Some interruption)**: 리소스는 유지되지만 잠깐 멈춘다. 예: EC2 인스턴스 타입 변경(재시작 필요).
- **교체(Replacement)**: **리소스를 새로 만들고 기존 것을 삭제**한다. 이게 가장 위험하다 — 어떤 속성은 변경 불가(immutable)라, 바꾸려면 통째로 새 리소스를 만들어야 한다. 예: EC2의 AZ나 일부 RDS 설정, 이름이 식별자인 리소스의 이름 변경.

교체가 무서운 이유는 명확하다. RDS 데이터베이스가 교체되면 **새 빈 DB가 만들어지고 기존 데이터가 사라질 수 있다**. 그래서 "어떤 속성이 교체를 유발하는지"를 모르고 템플릿을 고치면 데이터 손실 사고가 난다. 바로 이 위험을 미리 보기 위해 **Change Set**이 존재한다.

```bash
aws cloudformation create-change-set \
    --stack-name my-stack --template-body file://template.yaml \
    --change-set-name my-changes
aws cloudformation describe-change-set \
    --stack-name my-stack --change-set-name my-changes   # Replacement: True 확인
aws cloudformation execute-change-set \
    --stack-name my-stack --change-set-name my-changes
```

Change Set은 "이번 업데이트로 무엇이 추가/수정/삭제되고, 어떤 게 교체(Replacement: True)되는지"를 실행 전에 보여준다. 프로덕션 배포의 안전 장치로, "DB가 교체된다"는 경고를 미리 보고 멈출 수 있다.

> 📚 **사례**: CloudFormation으로 RDS를 관리하다 `DBInstanceIdentifier`나 특정 엔진 속성을 바꿔 의도치 않은 교체가 일어나 데이터를 날리는 사고는 IaC 운영의 고전적 함정이다. AWS가 권장하는 방어는 두 겹이다. 첫째, **`DeletionPolicy: Snapshot`** 또는 **`Retain`** 을 RDS/EBS에 걸어 삭제·교체 시 데이터를 보존한다. 둘째, **Change Set으로 Replacement 여부를 항상 확인**한다. 실무에서 "직접 update를 절대 하지 말고 반드시 Change Set을 거쳐라"가 철칙이 된 배경이다.

## 자동 롤백: 실패하면 시간을 되돌린다

선언적 모델의 가장 강력한 안전망이 **자동 롤백(automatic rollback)** 이다. 스택 생성이나 업데이트 중 한 리소스라도 실패하면, CloudFormation은 그때까지 만든 것을 그대로 두지 않고 **직전의 안정 상태로 되돌린다**. 생성 중 실패면 만든 것을 모두 삭제(`ROLLBACK_COMPLETE`)하고, 업데이트 중 실패면 이전 템플릿 상태로 복구(`UPDATE_ROLLBACK_COMPLETE`)한다. 이게 명령적 스크립트와의 결정적 차이다 — 스크립트는 절반 실행된 채 방치되지만, CloudFormation은 "전부 성공" 또는 "전부 되돌림"이라는 트랜잭션 비슷한 보장을 준다.

> 💡 **관련 이론**: 이 "전부 성공 아니면 전부 취소"는 데이터베이스 트랜잭션의 **원자성(atomicity)** 과 같은 개념이다. CloudFormation을 일종의 "인프라 트랜잭션 매니저"로 보면 이해가 쉽다 — 여러 리소스 생성을 하나의 단위로 묶고, 중간에 실패하면 보상 동작(생성한 것 삭제)으로 롤백한다. 다만 완벽한 트랜잭션은 아니다. 어떤 리소스는 롤백 중 삭제가 안 돼(예: 비어 있지 않은 S3 버킷) 스택이 `UPDATE_ROLLBACK_FAILED`에 빠지기도 한다. 이때는 문제 리소스를 수동 정리하고 `ContinueUpdateRollback`으로 롤백을 재개해야 한다. 시험에서 "스택이 ROLLBACK_FAILED에 멈췄다"의 해법으로 이게 나온다.

> ⚠️ **함정**: 업데이트 중 새로 만들어진 리소스가 롤백되면 삭제되는데, 만약 그 리소스에 `DeletionPolicy: Retain`이 걸려 있으면 롤백해도 남는다. 또 EC2 부트스트랩이 끝났는지를 CloudFormation이 알려면 **`CreationPolicy`와 cfn-signal**이 필요하다 — 이게 없으면 CloudFormation은 "EC2 API가 성공했다"만 보고 인스턴스 안 애플리케이션이 실제로 떴는지 모른 채 성공 처리한다. UserData 스크립트가 깨져도 스택은 성공으로 끝나는 함정이 여기서 나온다.

## 교차 스택 참조 대 중첩 스택: 인프라를 어떻게 쪼개나

스택 하나가 너무 커지면 관리가 어렵다. 인프라를 여러 스택으로 쪼개는 두 가지 방식이 있고, 둘은 목적이 다르다.

| 방식 | 메커니즘 | 결합도 | 적합 |
|------|----------|--------|------|
| **교차 스택 참조(Cross-stack)** | `Export` + `!ImportValue` | 느슨 | 네트워크 스택의 VPC ID를 여러 앱 스택이 공유 |
| **중첩 스택(Nested stack)** | 부모가 자식 템플릿을 `AWS::CloudFormation::Stack`으로 포함 | 강함 | 재사용 컴포넌트(표준 ALB 구성)를 여러 곳에서 |

교차 스택 참조는 한 스택이 `Outputs`에서 값을 `Export`하고, 다른 스택이 `!ImportValue`로 가져온다. 느슨하게 결합되지만 제약이 있다 — **Export된 값을 누가 Import하고 있으면 그 Export를 바꾸거나 스택을 지울 수 없다**. 의존이 생겨 단단히 묶인다. 또 **`!ImportValue`는 같은 리전·같은 계정 안에서만** 작동한다(cross-region/account 불가).

중첩 스택은 부모 스택이 자식 스택을 리소스처럼 품는다. 표준화된 빌딩 블록을 재사용할 때 좋고, 부모를 지우면 자식도 함께 정리된다.

> 🔍 **더 깊이**: `Export`/`ImportValue`가 만드는 단단한 의존이 운영에서 자주 발목을 잡는다. 네트워크 스택이 VPC ID를 Export하고 앱 스택 다섯 개가 그걸 Import하고 있으면, 네트워크 스택의 그 Export 이름을 바꾸려면 다섯 앱 스택을 먼저 떼어내야 한다. 그래서 큰 조직은 점점 **교차 스택 Export 대신 SSM Parameter Store에 값을 넣고 읽는** 패턴으로 옮겨간다 — Parameter Store는 이런 강결합을 만들지 않아 스택을 독립적으로 바꿀 수 있다. CDK가 등장한 이유 중 하나도 이런 스택 간 참조를 코드로 더 유연하게 다루기 위해서다.

## 보호 메커니즘 4종: 무엇으로부터 무엇을 지키는가

CloudFormation에는 비슷해 보이지만 보호 대상이 다른 메커니즘이 여럿 있어 시험 함정의 단골이다. "무엇으로부터 무엇을 지키는가"로 가르면 명확하다.

| 메커니즘 | 무엇을 막나 | 범위 |
|----------|-------------|------|
| **DeletionPolicy** | 스택/리소스 삭제 시 그 **리소스**가 사라지는 것 (Retain/Snapshot/Delete) | 개별 리소스, 삭제 시점 |
| **UpdateReplacePolicy** | 업데이트로 리소스가 **교체**될 때 기존 것이 사라지는 것 | 개별 리소스, 교체 시점 |
| **Stack Policy** | 업데이트 중 특정 리소스의 **수정/교체** 자체 | 스택 업데이트 작업 |
| **Termination Protection** | **스택 전체의 삭제** 명령 | 스택 단위 |
| **IAM Policy** | **누가** 스택을 조작할 수 있는지 | 사용자/역할 권한 |

자주 헷갈리는 두 쌍을 분리하자. **DeletionPolicy vs Termination Protection**: 전자는 "스택을 지울 때 이 DB만은 남겨라"(리소스 단위), 후자는 "이 스택 자체를 아예 못 지우게 하라"(스택 단위)다. **Stack Policy vs IAM**: 전자는 "업데이트 중 ProductionDB를 건드리지 마라"(작업 보호), 후자는 "철수는 스택을 업데이트할 수 없다"(사람 보호)다.

```json
{
  "Statement": [
    { "Effect": "Allow", "Action": "Update:*", "Principal": "*", "Resource": "*" },
    {
      "Effect": "Deny",
      "Action": ["Update:Replace", "Update:Delete"],
      "Principal": "*",
      "Resource": "LogicalResourceId/ProductionDB"
    }
  ]
}
```

> ⚠️ **함정**: "프로덕션 DB가 실수로 삭제되는 걸 막으려면?"에서 정답은 시나리오에 따라 다르다. "스택 삭제 시 DB 보존" → `DeletionPolicy: Retain`. "스택 업데이트 중 DB 교체 방지" → Stack Policy의 Deny `Update:Replace`. "스택 자체 삭제 방지" → Termination Protection. 하나만 외워두면 함정에 빠진다 — 보호 시점(삭제/업데이트)과 범위(리소스/스택)를 함께 봐야 한다.

## 드리프트: 코드와 현실이 어긋날 때

IaC의 전제는 "템플릿이 곧 인프라의 진실"이다. 그런데 누군가 콘솔에서 보안 그룹을 손으로 열어버리면, 템플릿(코드)과 실제 인프라(현실)가 어긋난다. 이게 **드리프트(drift)** 다. CloudFormation의 **드리프트 감지(Drift Detection)** 는 템플릿이 기대하는 상태와 실제 리소스 상태를 비교해 차이를 보여준다.

중요한 점은 **드리프트 감지는 자동이 아니다** — 명시적으로 실행해야 한다. CloudFormation은 콘솔 변경을 실시간으로 막지 않는다(그건 IAM·SCP의 일이다). 드리프트 감지는 "이미 벌어진 어긋남을 사후에 발견"하는 도구다. 자동·지속 감지가 필요하면 **AWS Config**의 규칙과 결합한다.

> 📚 **사례**: 많은 조직이 "긴급하니 일단 콘솔에서 고치고 나중에 코드에 반영하자"는 임시 변경을 반복하다, 템플릿과 현실이 크게 벌어진 채 다음 스택 업데이트를 돌려 콘솔 변경을 통째로 덮어쓰는 사고를 겪는다. CloudFormation 업데이트는 "템플릿이 진실"이라 보고 동작하므로, 드리프트를 무시하고 업데이트하면 손으로 한 긴급 패치가 사라진다. 그래서 성숙한 팀은 콘솔 직접 변경을 IAM으로 막고(읽기 전용 권한), 모든 변경을 템플릿→파이프라인으로만 흐르게 하는 **불변 인프라(immutable infrastructure)** 규율을 세운다.

## 정리하며

CloudFormation을 관통하는 한 문장은 "인프라의 원하는 상태를 선언하면, 엔진이 의존 그래프로 순서를 풀고, 트랜잭션처럼 전부 만들거나 전부 되돌린다"이다. 선언적 모델은 멱등성과 자동 롤백을 주고, 의존 그래프와 위상 정렬은 생성 순서와 병렬화를 자동으로 결정한다. 업데이트의 위험은 교체(Replacement)에 있고 Change Set이 그걸 미리 보여주며, DeletionPolicy·Stack Policy·Termination Protection은 각기 다른 시점과 범위에서 리소스를 지킨다. 교차 스택 참조의 강결합은 SSM Parameter Store로 완화되고, 드리프트는 "코드가 진실"이라는 전제가 깨졌음을 알린다. 시험 함정 대부분은 이 파이프라인 위에서 "삭제냐 교체냐, 리소스냐 스택이냐, 자동이냐 수동이냐"를 가른다.

다음 글에서는 이 CloudFormation을 서버리스에 맞게 압축한 SAM으로 넘어간다.

---

## 📝 연습 문제

**문제 1.** 프로덕션 스택의 템플릿을 수정해 적용하려 한다. RDS가 의도치 않게 교체되어 데이터가 사라지는 것을 사전에 발견하려면?

A) 바로 스택을 업데이트하고 결과를 본다

B) Change Set을 생성해 Replacement 여부를 검토한 뒤 실행한다

C) 드리프트 감지를 실행한다

D) Termination Protection을 켠다

**정답: B**

해설: **Change Set**은 업데이트를 실제로 적용하기 전에 각 리소스가 추가/수정/삭제/**교체(Replacement: True)** 중 무엇이 되는지 보여준다. RDS가 교체되면 새 빈 DB가 생기고 데이터가 사라질 수 있으므로, Change Set으로 "Replacement: True"를 미리 확인하고 멈출 수 있다. A) 바로 업데이트하면 발견했을 땐 이미 늦다. C) 드리프트 감지는 이미 벌어진 콘솔 변경과의 차이를 보는 것이지 업데이트 결과 예측이 아니다. D) Termination Protection은 스택 삭제를 막을 뿐 업데이트 중 교체를 막지 않는다.

---

**문제 2.** CloudFormation 스택 생성 시 두 보안 그룹이 서로를 참조해 "circular dependency" 오류가 났다. 올바른 해결은?

A) DependsOn을 양쪽에 추가한다

B) 인라인 ingress 규칙을 별도의 AWS::EC2::SecurityGroupIngress 리소스로 분리한다

C) 두 보안 그룹을 하나로 합친다

D) 리전을 변경한다

**정답: B**

해설: 두 리소스가 서로를 참조하면 의존 그래프에 순환이 생겨 위상 정렬이 불가능해 생성이 실패한다. 보안 그룹 규칙을 인라인으로 두지 말고 **별도의 `AWS::EC2::SecurityGroupIngress` 리소스**로 떼어내면, 보안 그룹 자체는 서로 참조하지 않고 규칙만 나중에 양쪽을 연결하므로 순환이 끊긴다. A) DependsOn은 명시적 의존을 추가할 뿐 순환을 풀지 못한다(오히려 악화). C) 합치면 격리가 깨지고 항상 가능하지도 않다. D) 리전과 무관하다.

---

**문제 3.** 스택을 삭제하더라도 그 안의 프로덕션 RDS 데이터베이스는 보존하고 싶다. 적절한 설정은?

A) Termination Protection 활성화

B) 리소스에 DeletionPolicy: Retain 설정

C) Stack Policy로 Update:Delete 거부

D) IAM으로 삭제 권한 제거

**정답: B**

해설: **`DeletionPolicy: Retain`** 을 RDS 리소스에 걸면, 스택을 삭제해도 그 리소스는 삭제되지 않고 그대로 남는다(데이터 보존). 스냅샷을 원하면 `Snapshot`을 쓴다. A) Termination Protection은 스택 자체의 삭제를 막을 뿐, 스택을 정상적으로 삭제하는 경우의 리소스 보존과는 다른 개념이다. C) Stack Policy는 업데이트 작업 중 보호이지 스택 삭제 시점의 리소스 보존이 아니다. D) IAM은 "누가" 삭제하는지를 막을 뿐 리소스 보존 메커니즘이 아니다.

---

**문제 4.** 네트워크 스택이 Export한 VPC ID를 애플리케이션 스택에서 참조하려 한다. 올바른 함수와 제약은?

A) !Ref vpc-id, 모든 리전에서 가능

B) !ImportValue로 가져오며, 같은 리전·같은 계정 안에서만 가능

C) !GetAtt vpc.Id, 교차 리전 가능

D) !FindInMap, 교차 계정 가능

**정답: B**

해설: 다른 스택이 `Outputs`에서 `Export`한 값은 **`!ImportValue`** 로 가져온다. 단 이 메커니즘은 **같은 리전·같은 계정 내 스택끼리만** 작동하며 교차 리전/계정은 지원하지 않는다. 또 Import가 걸려 있는 동안 원본 Export는 변경·삭제할 수 없는 강결합이 생긴다. A) !Ref는 같은 템플릿 내 리소스/파라미터 참조다. C) !GetAtt는 같은 템플릿 내 속성 참조이고 교차 리전을 주지 않는다. D) !FindInMap은 매핑 조회로 무관하다.

---

**문제 5.** CloudFormation으로 EC2를 만들고 UserData로 애플리케이션을 부트스트랩하는데, 스크립트가 실패해도 스택이 "성공"으로 끝난다. 부트스트랩 완료를 CloudFormation이 기다리게 하려면?

A) DependsOn 추가

B) CreationPolicy + cfn-signal로 부트스트랩 완료 신호를 보낸다

C) DeletionPolicy: Retain

D) Stack Policy 설정

**정답: B**

해설: 기본적으로 CloudFormation은 EC2 생성 API가 성공하면 "성공"으로 보며, 인스턴스 **안의** 애플리케이션이 실제로 떴는지는 모른다. **`CreationPolicy`** 를 걸고 부트스트랩 끝에서 **`cfn-signal`** 로 성공 신호를 보내게 하면, CloudFormation은 그 신호(또는 타임아웃)까지 기다렸다가 완료 처리한다. 신호가 안 오면 실패로 보고 롤백한다. A) DependsOn은 리소스 간 순서일 뿐 내부 부트스트랩 완료를 기다리지 않는다. C·D는 부트스트랩 신호와 무관하다.

---

**문제 6.** 운영자가 콘솔에서 보안 그룹을 손으로 수정했다. CloudFormation 템플릿과 실제 리소스의 차이를 확인하려면?

A) Change Set 생성

B) 드리프트 감지(Drift Detection) 실행

C) 스택 업데이트

D) Termination Protection

**정답: B**

해설: **드리프트 감지**는 템플릿이 기대하는 상태와 실제 리소스 상태를 비교해 콘솔 등에서 발생한 수동 변경(드리프트)을 찾아낸다. 단 자동이 아니라 명시적으로 실행해야 하며, 지속·자동 감지가 필요하면 AWS Config와 결합한다. A) Change Set은 "앞으로의 업데이트"가 무엇을 바꿀지 보여주는 것이지 현재 어긋남을 보여주지 않는다. C) 스택 업데이트는 오히려 콘솔 변경을 덮어쓸 위험이 있다. D) Termination Protection은 삭제 방지일 뿐이다.

---

**문제 7.** CloudFormation의 자동 롤백 동작에 대한 설명으로 가장 정확한 것은?

A) 생성 중 한 리소스가 실패하면 그때까지 만든 것을 그대로 두고 멈춘다

B) 생성/업데이트 중 실패하면 직전 안정 상태로 되돌리며, 이는 트랜잭션의 원자성과 유사하다

C) 롤백은 항상 100% 성공한다

D) 롤백은 사용자가 수동으로만 시작할 수 있다

**정답: B**

해설: CloudFormation은 생성·업데이트 중 실패 시 **직전의 안정 상태로 자동 롤백**해, 명령적 스크립트처럼 어중간한 상태로 방치하지 않는다. 이는 DB 트랜잭션의 **원자성**(전부 성공 아니면 전부 취소)과 유사한 보장이다. A) 그대로 두는 게 아니라 되돌린다. C) 항상 성공하지는 않는다 — 비어 있지 않은 S3 버킷 등으로 `ROLLBACK_FAILED`에 빠지면 수동 정리 후 `ContinueUpdateRollback`이 필요하다. D) 롤백은 실패 시 자동으로 시작된다.
