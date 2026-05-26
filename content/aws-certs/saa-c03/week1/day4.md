# Day 4 - AWS Organizations, SCP, Control Tower: 다계정 거버넌스의 골격

처음 AWS를 쓸 때는 계정 하나로 충분하다. 그런데 조직이 커지면 곧 한계가 온다. 운영팀과 개발팀이 같은 계정을 쓰면 사고가 번지고, 보안팀의 감사 로그가 일반 워크로드 옆에 쌓이며, 비용도 누가 얼마나 쓰는지 알 수 없게 된다. 그래서 어느 단계부터 멀티 계정으로 갈라지는 건 선택이 아니라 필연이다.

AWS는 그 필연을 위해 세 가지 도구를 준비해두었다. **Organizations**(계정 묶기, 2017년 출시), **SCP**(계정 단위 권한 상한), **Control Tower**(다계정 자동화 + 베스트 프랙티스 강제, 2019년 출시). 이 셋이 어떻게 맞물리는지가 오늘의 주제다. 한 가지 흥미로운 역사적 맥락: Organizations가 나오기 전까지 AWS는 "Consolidated Billing"이라는 결제 통합 기능만 있었고, 다계정 권한 거버넌스는 사실상 존재하지 않았다. Organizations가 만들어진 직접적 계기는 대기업 고객들이 "수십·수백 개 계정을 어떻게 관리하느냐"를 AWS 컨설팅 팀에 끊임없이 물어봤기 때문이다.

## 계정을 분리하는 진짜 이유

계정은 AWS의 "보안 경계의 최강 단위"다. VPC, IAM, 비용, 한도(quota)가 모두 계정 단위로 격리된다. 한 계정에서 권한이 깨져도 다른 계정으로는 자동으로 번지지 않는다. 이건 다른 어떤 IAM 정책보다 강한 경계다. 비유하자면 IAM 정책은 "문 잠금", VPC는 "방 분리", **계정은 건물 자체가 다른 것**이다.

| 분리 차원 | 단일 계정 | 멀티 계정 |
|----------|-----------|----------|
| 폭발 반경 | 권한 실수 = 전체 영향 | 한 계정만 영향 |
| 비용 가시성 | 태그로 추정 | 계정 단위 명확 |
| 환경 격리 | IAM·VPC로만 가능 | 물리적으로 분리 |
| 한도 관리 | 공유 (병목) | 독립 |
| 규제 감사 | 복잡 | 계정 단위 단순 |
| 협력사 위임 | 위험 | 계정 통째로 위임 가능 |

AWS의 표준 권장 패턴은 **AWS Multi-Account Strategy**(SRA, Security Reference Architecture)인데, 핵심은 이렇게 분리하는 것이다.

- **Management Account**: Organizations 루트. 결제·SCP 관리만. 워크로드 금지.
- **Log Archive**: 모든 계정의 CloudTrail, Config 로그를 중앙 집계. WORM(Write-Once Read-Many) 설정.
- **Audit/Security**: GuardDuty, Security Hub, Macie 위임 관리자.
- **Production / Staging / Dev**: 환경별 계정.
- **Sandbox**: 개발자 자유 실험 계정. SCP로 비용·리전 제한.

> 📚 **사례**: 2019년 한 핀테크 스타트업이 단일 계정에서 운영하다 개발자가 실수로 prod RDS를 삭제한 사건이 있었다. 같은 IAM Role이 dev/prod 모두에 권한을 가지고 있었기 때문이다. 만약 계정이 분리되어 있었다면 dev 계정의 자격 증명으로 prod RDS를 건드릴 수조차 없었을 것이다. 이 사건 이후 그 회사는 환경별 계정 분리를 표준으로 채택했다. 비슷한 사례로 2017년 GitLab.com 사건도 있는데, 운영자가 backup이 아닌 prod DB를 삭제한 인적 오류였다. AWS에서 prod와 backup이 같은 계정에 있으면 동일한 사고가 IAM 실수 한 번으로 가능하다.

> 💡 **관련 이론**: 폭발 반경(blast radius)을 최소화하는 분리 설계는 SRE의 핵심 원리이고, Google SRE Book의 "Embracing Risk" 챕터에서 강조하는 패턴이다. 미군의 "compartmentalization"(정보 분획화)에서 유래한 개념으로, 한 부분의 침해가 시스템 전체로 번지지 않게 하는 격벽 설계다. AWS 계정 분리는 이걸 클라우드 영역에서 가장 강하게 구현한 형태다.

## Organizations의 구조

Organizations는 여러 AWS 계정을 트리 구조로 묶는 서비스다.

```
[ Management Account (root) ]
        │
        ├── OU: Security
        │     ├── Account: Log Archive
        │     └── Account: Audit
        ├── OU: Workloads
        │     ├── OU: Prod
        │     │     ├── Account: prod-payments
        │     │     └── Account: prod-web
        │     └── OU: NonProd
        │           ├── Account: dev
        │           └── Account: staging
        └── OU: Sandbox
              └── Account: dev-individual-1
```

OU(Organizational Unit)는 계정의 폴더다. 트리 최대 깊이는 5단계. 계정은 어디 OU에 있든 SCP의 영향을 받는다(부모 OU의 SCP는 자식 모두에 상속). 트리 위치를 바꾸면 적용되는 SCP 셋이 자동으로 바뀐다. 이 "OU 이동만으로 거버넌스가 변경되는" 특성은 다른 클라우드 IAM에는 없는 AWS의 강점이다.

> 💡 **관련 이론**: 트리 구조에 정책을 적용하는 방식은 마이크로소프트 Active Directory의 OU/Group Policy 모델과 거의 동일하다. AD에서 GPO가 OU에 상속되며 우선순위(LSDOU: Local → Site → Domain → OU)에 따라 결합되듯, AWS SCP도 부모 OU에서 자식으로 상속되며 deny-overrides 알고리즘으로 결합된다. NIST SP 800-92(Log Management)와 SP 800-137(Continuous Monitoring)이 권장하는 "중앙 집중 로그 + 분산 워크로드" 패턴이 정확히 이 구조 위에서 구현된다.

> 🔍 **더 깊이**: GCP의 Folder/Organization 계층도 비슷한 트리 구조이고 IAM 정책 상속을 지원하지만, GCP는 자식의 더 강한 권한이 부모를 "추가"하는 union 모델인 반면 AWS SCP는 자식이 더 강해질 수 없는 "intersection + deny override" 모델이다. 같은 트리 구조라도 의미가 정반대인 셈. Azure Management Groups는 AWS와 더 가까운 deny-override 패턴이다.

## SCP: 계정 전체의 권한 상한선

SCP(Service Control Policy)는 IAM 정책과 문법이 같지만 적용 범위가 다르다. **계정 또는 OU 단위로 권한의 상한선** 을 정한다. SCP는 권한을 "주지" 않고 "한도를 정할" 뿐이다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyRegionsExceptApproved",
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringNotEquals": {
        "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
      }
    }
  }]
}
```

이 SCP는 "ap-northeast-2와 us-east-1 외의 모든 리전 사용 금지"라는 뜻이다. 개발자가 실수로 ap-southeast-1에 인스턴스를 띄우려 해도 SCP가 차단한다. IAM 정책에서 아무리 Allow해도 SCP가 Deny면 끝이다.

| SCP 패턴 | 효과 |
|---------|------|
| Region 제한 | 데이터 주권·비용 보호 |
| Root account API 차단 | 위험 작업 금지 (예: 계정 폐쇄, ELBv1) |
| 특정 서비스 차단 | 미사용 서비스(예: SageMaker, IoT)의 비용·공격 표면 제거 |
| Tag 강제 | `aws:TagKeys`로 필수 태그 누락 시 거부 |
| MFA 강제 | `aws:MultiFactorAuthPresent: false`면 변경 작업 거부 |
| CloudTrail 비활성화 방지 | `cloudtrail:StopLogging` 차단 |
| Root credential 사용 금지 | `aws:PrincipalArn`이 root인 호출 차단 |

> ⚠️ **함정**: SCP는 Management 계정 자체에는 적용되지 않는다. 이게 시험에 자주 나온다. Management 계정이 워크로드를 가지면 안 되는 핵심 이유 중 하나가 이거다. SCP로 보호되지 않는 계정이므로 사고 시 가장 큰 폭발 반경을 가진다. 또 하나 함정 — SCP는 서비스 연결 역할(Service-linked role)에도 일부 적용 안 된다(예: AWSServiceRoleForOrganizations).

> 🔍 **더 깊이**: SCP는 두 가지 전략으로 운영된다. **Deny List 전략**(기본 FullAWSAccess를 유지하고 금지할 것만 Deny)과 **Allow List 전략**(FullAWSAccess를 떼고 명시적 Allow만 둠). Allow List는 더 엄격하지만 새 서비스가 출시될 때마다 명시 허용을 추가해야 해서 운영 부담이 크다. 대부분 조직은 Deny List + 핵심 가드레일 조합을 쓴다. 또한 SCP는 "최대 5MB까지" 그리고 "한 entity에 최대 5개"라는 제약이 있어서, 정책 통합과 모듈화 설계가 중요해진다.

> 📚 **사례**: 2020년 한 미디어 기업이 SCP 없이 운영하다 신입 개발자가 us-east-1 외의 모든 리전에 인스턴스를 무작위로 띄워 한 달 만에 청구액이 평소의 4배가 됐다. SCP로 region 제한이 있었다면 발생 자체가 불가능한 사고였다. 같은 회사는 사고 이후 "Region 제한 + Sandbox 계정 월 한도 + Budgets 알람"의 3중 가드를 표준화했다.

## Control Tower: Landing Zone의 자동화

Control Tower는 위에서 본 모든 걸 한 번에 자동으로 세팅해주는 서비스다. 2019년에 출시됐고, 다음을 자동으로 만든다.

- Organizations 구조 (Management + Security OU + Sandbox OU)
- Log Archive와 Audit 계정 자동 생성
- 중앙 집중 CloudTrail (모든 계정 → Log Archive)
- 중앙 집중 Config (Audit 계정으로 집계)
- IAM Identity Center 연동
- Account Factory (셀프서비스 계정 발급)
- **Guardrails**: 미리 정의된 SCP + Config Rule 묶음

Guardrails는 두 종류다. **Preventive**(SCP 기반, 사전 차단)와 **Detective**(Config Rule 기반, 사후 감지). 예를 들어:

| Guardrail | 종류 | 효과 |
|----------|------|------|
| Disallow public read access to S3 buckets | Detective | Config가 위반 감지 |
| Disallow changes to encryption configuration for S3 buckets | Preventive | SCP로 차단 |
| Enable encryption at rest for log archive | Preventive | 강제 적용 |
| Require MFA for root | Detective | 미준수 알림 |
| Disallow deletion of CloudTrail logs | Preventive | SCP로 차단 |

Control Tower의 가치는 "이걸 직접 세팅하려면 며칠 걸리는 표준 베이스라인을 클릭 몇 번으로 끝낸다"는 데 있다. Landing Zone Accelerator(LZA)라는 더 정교한 솔루션도 있는데, 이는 Control Tower 위에 CloudFormation 코드로 거버넌스를 추가하는 오픈소스다(공식 AWS Solutions).

> 💡 **관련 이론**: "Landing Zone"이라는 용어 자체가 AWS에서 만든 용어인데, 의미는 "고객이 워크로드를 올리기 전에 미리 갖춰져 있어야 할 안전한 기반 환경"이다. 비행기가 활주로에 내려앉기 전 활주로가 준비돼 있어야 하는 것과 같은 비유. ITIL의 "Foundation Service Layer", CIS Benchmark의 "Baseline Configuration"과 개념적으로 같다.

## Account Factory와 Service Catalog

Control Tower의 Account Factory는 새 AWS 계정을 표준 템플릿으로 생성한다. 내부적으로 Service Catalog 제품으로 노출되어, 개발팀이 셀프 서비스로 계정을 요청할 수 있다. 각 계정은 자동으로 OU에 배치되고, IAM Identity Center 권한이 연결되고, 베이스라인 가드레일이 적용된다.

> 📚 **사례**: 2021년 Capital One 계열사가 "1주일에 50개 계정 발급" 요청을 받았는데, Control Tower Account Factory를 도입해 30분 만에 자동화했다. 이전에는 운영자가 일일이 IAM Identity Center 권한 세트, CloudTrail, Config, GuardDuty를 설정해야 했고 계정당 2-3시간이 걸렸다. 자동화 도입 후 계정 발급 SLA가 "1주일"에서 "10분"으로 줄었고, 운영팀 인원이 다른 보안 업무로 전환됐다.

> 🔍 **더 깊이**: Account Factory for Terraform(AFT)이라는 확장이 2021년 출시됐다. 이는 Control Tower의 Account Factory를 Terraform 모듈로 호출 가능하게 해서, GitOps 방식으로 계정 생성·삭제를 PR 리뷰 흐름에 묶는다. 대형 조직에서 "계정 발급을 코드 리뷰로 통제"하는 게 표준 패턴이 되고 있다.

## RAM: Resource Access Manager

Organizations 안에서 같은 회사 계정끼리 리소스를 공유할 때 쓰는 게 **AWS RAM**이다. VPC 서브넷, Transit Gateway, Route 53 Resolver Rules, License Manager configurations 등을 다른 계정에 공유한다.

가장 흔한 패턴은 **Networking 계정 + Workload 계정** 분리다. Networking 계정에서 VPC와 Transit Gateway를 만들고 RAM으로 Workload 계정에 서브넷을 공유하면, 모든 워크로드 계정이 같은 네트워크 토폴로지를 쓰면서도 워크로드 자체는 격리된다. Cross-account VPC peering보다 훨씬 단순하다.

| RAM으로 공유 가능 | 주 용도 |
|------------------|---------|
| VPC Subnet | 중앙 네트워크 관리 |
| Transit Gateway | 다계정 hub-and-spoke |
| Route 53 Resolver Rules | 다계정 DNS 통합 |
| License Manager | 라이선스 공유 |
| Aurora cluster | DB 공유 (드물게) |
| Outposts | 온프레미스 하드웨어 공유 |

> 🔍 **더 깊이**: RAM으로 VPC 서브넷을 공유받은 계정은 그 서브넷에 ENI/EC2를 직접 만들 수 있지만, 서브넷 자체의 라우팅·NACL은 못 건드린다. 즉 네트워크 설계와 워크로드 운영을 깔끔히 분리할 수 있다. 이 패턴이 "Networking 계정"이라는 개념의 핵심이다. 단, 공유 VPC 안에서 만든 ENI의 비용은 ENI 소유 계정이 지불하지만, NAT Gateway·Transit Gateway 같은 인프라 비용은 Networking 계정이 부담한다 — 이 비용 분리를 사전에 합의해두지 않으면 부서 간 회계 문제가 생긴다.

## Consolidated Billing의 진짜 이득

Organizations에 가입하면 자동으로 통합 결제(Consolidated Billing)가 활성화된다. 효과는 단순한 청구서 통합이 아니다.

1. **볼륨 할인**: S3·CloudFront 같은 사용량 기반 서비스가 전체 계정 사용량을 합산해 더 큰 할인 tier 진입.
2. **Reserved Instance/Savings Plan 공유**: 한 계정에서 산 RI/SP가 다른 계정 EC2에도 자동 적용(설정에 따라).
3. **Cost & Usage Report 통합**: 전체 계정 비용을 한 곳에서 분석.
4. **무료 한도 합산**: 새 계정의 12개월 무료 한도가 부모 계정 한도에 합쳐짐(주의 — 무료 한도가 중복되지 않음).

> 💡 **관련 이론**: Consolidated Billing은 클라우드의 "공유 자원 풀" 모델을 IAM 경계와 분리시킨다. 같은 회사 계정들은 IAM은 완전히 격리되지만 비용은 풀로 묶여 규모의 경제를 누린다. 이는 NIST 클라우드 정의(SP 800-145)에서 말하는 "resource pooling"의 변종이다. 더 흥미로운 건 RI/SP 공유 정책 — Organizations 콘솔에서 "RI Sharing"을 끄면 각 계정이 독립적으로 RI를 운영하게 되어, "팀별 비용 책임"을 강하게 분리하고 싶을 때 쓴다.

> ⚠️ **함정**: 통합 결제는 자동이지만 RI/SP 공유는 기본 "공유"이고, 끄려면 별도 설정이 필요하다. "왜 우리 팀이 안 산 RI가 우리 계정 EC2에 적용되어 회계가 꼬이나" 같은 질문이 여기서 나온다. 시험에선 "한 계정이 다른 계정의 RI 혜택을 받는 이유"를 묻는 문제로 등장한다.

## 계정 생성 자동화: CloudFormation StackSets

다계정 환경에서 같은 인프라를 모든 계정에 똑같이 배포하고 싶을 때 쓰는 게 **CloudFormation StackSets**. 한 번의 명령으로 모든 OU 또는 선택된 계정에 동일한 스택을 배포한다.

```bash
aws cloudformation create-stack-set \
  --stack-set-name baseline-security \
  --template-body file://template.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false
```

`SERVICE_MANAGED`는 Organizations와 통합된 모드로, 새 계정이 추가될 때 자동으로 배포된다. `auto-deployment`가 true면 OU에 계정이 들어오면 자동 적용된다. StackSets는 내부적으로 각 계정마다 별도의 Stack을 만들지만, 변경은 StackSet 수준에서 일괄 관리된다 — 이 두 층 구조가 처음 보면 헷갈리지만 익숙해지면 강력하다.

> 🔍 **더 깊이**: StackSets의 동시성은 "Concurrency mode"로 설정한다. `STRICT_FAILURE_TOLERANCE`는 한 계정이 실패하면 전체 중단, `SOFT_FAILURE_TOLERANCE`는 일정 비율까지 실패 허용. 수백 계정 배포 시 일부 계정의 일시적 실패(예: throttling)로 전체가 멈추지 않게 하려면 후자를 쓴다.

## 정리하며

Organizations + SCP + Control Tower는 다계정 거버넌스의 3축이다. SCP는 권한의 상한, Control Tower는 자동화된 베스트 프랙티스, RAM은 계정 간 공유, StackSets는 일괄 배포. 이 다섯 가지가 머리에 그려지면 다계정 시나리오 문제는 거의 자동으로 풀린다. 시험에서 "수십~수백 계정", "셀프 서비스 계정 발급", "리전 제한", "중앙 로그 집계" 같은 키워드가 나오면 이 도구들 중 어느 것이 답인지를 시나리오 단어 매핑으로 빠르게 찾을 수 있어야 한다.

다음 글은 Week 1의 정리·복습편이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 30개 AWS 계정을 운영한다. 모든 계정에서 us-west-1 리전 사용을 금지하려 한다. 가장 적절한 방법은?

A) 각 계정마다 IAM 정책 추가
B) Organizations SCP로 region 제한
C) CloudTrail로 사후 감지
D) VPC를 us-west-1에 만들지 않음

**정답: B**
해설: 다계정 권한 상한은 SCP가 답. `aws:RequestedRegion` 조건으로 Deny하면 모든 계정의 모든 신원이 해당 리전을 못 쓴다. A는 30번 동기화 부담, C는 예방이 아닌 사후, D는 VPC 외 서비스(예: DynamoDB, S3)는 막지 못한다. 단 Management 계정 자체는 SCP 적용 안 됨 — 그래서 Management에 워크로드 두면 안 된다. 추가로 글로벌 서비스(IAM, CloudFront, Route 53 등)는 `aws:RequestedRegion`이 `us-east-1`로 평가되므로 예외 처리가 필요하다.

---

**문제 2.** Control Tower로 새 계정을 만들 때 자동으로 설정되지 않는 것은?

A) CloudTrail 중앙 집중
B) Config 활성화
C) 사용자별 비밀번호
D) IAM Identity Center 권한 세트 연결

**정답: C**
해설: Control Tower는 인프라 베이스라인을 자동화하지만 사용자 비밀번호는 IdP 영역. IAM Identity Center에 연결된 외부 IdP(Okta, AD)가 인증을 담당한다. 나머지는 모두 자동 적용된다. Control Tower의 가치는 "거버넌스 코드를 매번 작성하지 않아도 베스트 프랙티스가 자동 적용된다"는 것 — 직접 구현하면 며칠 ~ 몇 주 분량.

---

**문제 3.** Networking 계정에서 만든 VPC 서브넷을 다른 계정에 공유하려면?

A) VPC Peering
B) AWS RAM
C) Transit Gateway
D) PrivateLink

**정답: B**
해설: RAM이 다계정 리소스 공유의 표준. 서브넷 공유 후 받은 계정은 ENI·EC2를 만들 수 있지만 라우팅·NACL은 못 건드린다. Peering은 두 VPC 간 연결일 뿐 공유가 아니고, TGW는 라우팅 허브, PrivateLink는 서비스 엔드포인트 노출이다. 네 가지가 비슷해 보이지만 풀려는 문제가 다 다르다: 공유(RAM), 연결(Peering), 라우팅 허브(TGW), 서비스 노출(PrivateLink).

---

**문제 4.** Management 계정에 대해 옳은 것은?

A) SCP가 자동 적용된다
B) SCP가 적용되지 않으므로 워크로드를 두면 안 된다
C) Audit 계정의 역할을 겸할 수 있다
D) Log Archive 역할에 적합하다

**정답: B**
해설: Management 계정은 SCP 적용 대상이 아니므로 모든 권한이 무방비. 운영 워크로드를 두면 사고 시 폭발 반경이 가장 크다. AWS 권장은 결제·Organizations 관리만 하는 "비어 있는" 계정. Audit·Log Archive는 별도 계정으로 분리한다. 같은 이유로 Management 계정의 root 자격 증명에는 반드시 하드웨어 MFA를 걸고, 일상 운영에는 IAM Identity Center를 거쳐 다른 계정의 Role을 빌려쓴다.

---

**문제 5.** Consolidated Billing의 이점이 아닌 것은?

A) 볼륨 할인 합산
B) RI/Savings Plan 공유
C) 계정 간 IAM 권한 통합
D) 단일 청구서

**정답: C**
해설: Consolidated Billing은 비용 영역만 합치고 IAM은 완전히 격리된다. 이게 멀티 계정의 핵심 안전망이다. IAM 통합이 필요하면 IAM Identity Center나 cross-account Role이 따로 있다. 시험은 자주 "비용은 합치되 권한은 분리된다"는 이 비대칭성을 묻는다.

---

**문제 6.** 새 계정이 OU에 추가될 때 자동으로 동일한 보안 스택이 배포되게 하려면?

A) Lambda 트리거
B) CloudFormation StackSets with auto-deployment
C) 수동 배포 절차 문서화
D) Terraform 수동 실행

**정답: B**
해설: StackSets with `SERVICE_MANAGED` + `auto-deployment Enabled`. 새 계정이 OU에 들어오면 자동으로 스택이 적용된다. 수백 계정 환경에서 운영자 개입 없이 베이스라인을 유지하는 표준 패턴이다. Terraform도 가능하지만 AWS-네이티브 답은 StackSets. CDK·Terraform과 StackSets를 같이 쓰는 하이브리드도 흔하다 — 공통 베이스라인은 StackSets, 워크로드별 차이는 IaC.

---

**문제 7.** SCP 운영 전략 중 "Allow List" 방식의 단점은?

A) 더 안전하지 않다
B) 새 AWS 서비스가 출시될 때마다 명시적 허용 추가 필요
C) 비용이 더 든다
D) Multi-region 불가

**정답: B**
해설: Allow List는 기본 FullAWSAccess를 제거하고 명시 허용만 두는 방식. 가장 엄격하지만 AWS가 매년 수십 개의 새 서비스를 출시하므로 그때마다 정책 업데이트가 필요해 운영 부담이 크다. 대부분 조직은 Deny List(기본 허용 + 위험한 것만 Deny) + 핵심 가드레일 조합을 쓴다. Allow List는 금융·공공처럼 변경 통제가 엄격한 환경에서나 채택된다.
