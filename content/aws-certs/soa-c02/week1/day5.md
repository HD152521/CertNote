# Day 5 - Week 1 통합 복습: 운영자 시나리오 12문제

한 주간 본 것은 AWS 운영자의 출발점이다. **인프라 지도(Region/AZ/Edge), 책임 경계(Shared Responsibility), 권한 의사결정(IAM 평가 알고리즘), 멀티 계정 거버넌스(Organizations/SCP)**. 이 네 개념이 SOA-C02 모든 시나리오의 배경이다. 시험 문제를 풀 때 "이 시나리오는 어떤 layer를 묻는가"를 먼저 분류하는 습관이 점수를 만든다. 오늘은 이 네 가지를 실전 시나리오로 묶어 본다.

이 주의 내용이 머릿속에 깔려 있어야 다음 주의 CloudWatch·Config·CloudTrail이 자연스럽게 위에 얹힌다. 알람이 울렸을 때 "어느 리전의 어느 AZ에서, 누구(IAM principal)가, 어떤 권한으로, 어떤 계정에서" 일을 했는지를 거꾸로 추적하는 게 운영자의 일상이고, 그 추적을 가능하게 만드는 인프라가 이 주의 주제였다.

## 통합 정리: 한눈에 보는 Week 1

```
┌─────────────────────────────────────────────────┐
│         [AWS Global Infrastructure]              │
│  Region > AZ > Edge / Local Zones / Outposts     │
│  - Control plane은 us-east-1에 자주 묶임          │
│  - AZ는 격리의 최소 단위, NAT GW는 AZ 단위        │
├─────────────────────────────────────────────────┤
│         [Shared Responsibility]                  │
│  AWS: Security OF / Customer: Security IN        │
│  - 추상화 레벨이 올라갈수록 책임 경계가 위로       │
│  - 데이터 분류·IAM은 늘 고객 책임                 │
├─────────────────────────────────────────────────┤
│         [IAM Evaluation]                         │
│  Deny > SCP > Resource > Identity > Boundary     │
│  - Deny가 어디서든 이긴다                         │
│  - Cross-Account는 양쪽 다 Allow 필요             │
├─────────────────────────────────────────────────┤
│         [Organizations]                          │
│  SCP / Org Trail / RAM / Control Tower           │
│  - Management Account엔 SCP 안 통함               │
│  - Delegated Administrator로 보안 중앙화          │
└─────────────────────────────────────────────────┘
```

운영자의 일상 디버깅 흐름:
1. **증상 → CloudWatch metric/alarm**
2. **원인 후보 → CloudTrail 이벤트(어떤 API가 어떤 결과로 호출됐는가)**
3. **권한 문제? → IAM Policy Simulator + Access Analyzer + errorMessage 정독**
4. **인프라 문제? → AWS Health Dashboard + Personal Health**
5. **계정 단위 보안 위반? → Config + GuardDuty + Security Hub**

## 운영자가 자주 하는 4가지 실수

이 주의 내용을 종합하면 다음 4가지가 운영자가 가장 자주 하는 실수다.

1. **Management Account에 워크로드 두기**: SCP가 안 통하는데 워크로드 두면 사고 시 무방비.
2. **단일 AZ에 NAT GW 또는 RDS Single-AZ**: AZ 장애 시 전체 down.
3. **IAM User 위주 운영 + access key 영구 발급**: 회전 누락·offboarding 누락이 사고 1순위.
4. **us-east-1 의존성 무시**: IAM·Route 53·CloudFront write 작업은 us-east-1 의존. 글로벌 서비스라고 안심하면 사고.

이 네 가지를 다 피하는 게 운영자의 출발선이다.

---

## 📝 연습 문제 (시나리오 12문항)

**문제 1.** 한국 사용자 대상 게임 회사가 ap-northeast-2에서 운영 중인데, us-east-1 장애 시에도 콘솔 로그인과 IAM 관리가 가능하길 원한다. 어떤 대비가 필요한가?

A) STS 글로벌 엔드포인트(sts.amazonaws.com)를 사용
B) STS 리전 엔드포인트(sts.ap-northeast-2.amazonaws.com)를 강제하고 IAM 권한 변경은 us-east-1 의존성 인지
C) Route 53으로 us-east-1을 차단
D) IAM Identity Center를 ap-northeast-2에 설치

**정답: B**
해설: IAM의 컨트롤 플레인은 us-east-1에 있어 권한 변경(write)은 us-east-1 의존성을 피할 수 없다. 단 STS 리전 엔드포인트를 강제하면 자격증명 발급(데이터 플레인)은 ap-northeast-2에서 처리 가능. 운영자는 "글로벌 서비스도 internal엔 region 의존이 있다"는 사실을 알고 대비한다. 2021년 12월 us-east-1 장애가 이 의존성을 모르고 있던 회사들에게 큰 교훈을 줬다.

---

**문제 2.** 한 운영팀이 ASG로 운영 중인 웹 서비스에서 AZ-a 장애 발생 시 트래픽이 끊겼다. 원인 분석 결과 NAT GW가 AZ-a 한 곳에만 있었다. 정답은?

A) NAT GW를 AZ-b로 옮긴다
B) AZ당 NAT GW를 1개씩 만들고 각 private subnet의 라우팅 테이블을 자기 AZ NAT GW로 연결
C) NAT Instance로 교체
D) NAT GW 대신 Internet Gateway 사용

**정답: B**
해설: NAT GW는 AZ 단위 리소스고 자동 페일오버 없음. AZ별 NAT GW + 각 AZ private subnet 라우팅이 정석. 비용보다 가용성을 우선시. 단 비용 절감이 우선이라면 AZ당 1개 대신 1개 + 페일오버 ASG 패턴도 검토 가능하지만, 시험 답은 AZ별 NAT GW.

---

**문제 3.** EC2 인스턴스가 KMS 암호화된 S3 버킷에 PUT을 시도하는데 AccessDenied. IAM Policy에 `s3:PutObject Allow`, Bucket Policy에도 Allow가 있다. 원인은?

A) SCP가 PutObject를 차단
B) KMS Key Policy에 EC2 Role의 `kms:GenerateDataKey` Allow가 없음
C) S3 버킷이 다른 리전에 있음
D) IMDSv2가 비활성화돼 있음

**정답: B**
해설: KMS 암호화된 객체 PUT은 `kms:GenerateDataKey` 권한이 필요하며 IAM Policy + KMS Key Policy 양쪽에서 허용돼야 한다. IAM만 있고 Key Policy에 없으면 거부. 운영자가 가장 자주 헤매는 함정. CloudTrail에 KMS 거부 이벤트가 별도로 찍히므로 그쪽 로그도 봐야 한다.

---

**문제 4.** 회사가 200명 직원에 60개 AWS 계정을 운영 중. 직원이 매주 입퇴사하며, 보안팀은 access key 관리에 지쳤다. 가장 효율적인 변경은?

A) 모든 직원에게 access key 발급, Lambda로 90일마다 회전
B) IAM Identity Center 도입 + 외부 IdP(Azure AD) 페더레이션 + Permission Set
C) 한 master 계정에 IAM User 두고 다른 계정은 Cross-Account Role
D) Secrets Manager에 모든 access key 저장

**정답: B**
해설: Identity Center로 IdP에서 한 번 사용자 관리, Permission Set으로 계정별 권한. 직원 퇴사 시 IdP에서 한 번 비활성화로 전 계정 차단. access key 자체가 거의 사라짐. 2024년부터는 AWS도 IAM User를 만들 때 경고를 띄울 만큼 Identity Center가 표준이 됐다.

---

**문제 5.** 한 회사가 Organizations로 50개 계정 운영 중. 모든 계정에서 us-east-1과 ap-northeast-2 외 리전을 사용 못하게 강제하려고 한다. 가장 효율적인 방법은?

A) 모든 계정의 IAM Policy에 Deny 조건 추가
B) SCP를 root OU에 적용, `aws:RequestedRegion` Condition으로 허용 리전 외 Deny
C) Config Rule로 비준수 탐지
D) CloudFormation Stack Set으로 IAM Policy 배포

**정답: B**
해설: SCP는 계정·OU 단위 가드레일로 전 계정 일괄 적용. `aws:RequestedRegion`으로 허용 리전 제외 Deny. IAM/Route 53/CloudFront는 NotAction으로 예외(글로벌 서비스라 us-east-1로 라우팅). Config는 탐지만, 차단은 못함.

---

**문제 6.** 운영자가 IAM Role을 개발자가 만들 수 있게 위임하되, 그 Role의 최대 권한을 회사 표준으로 제한하려고 한다. 어떤 조합이 정답인가?

A) 개발자에게 AdministratorAccess
B) 개발자에게 `iam:CreateRole` Allow + `iam:PermissionsBoundary` Condition으로 boundary 강제
C) SCP로 개발자 IAM 제한
D) Service Catalog로만 Role 생성

**정답: B**
해설: Permission Boundary 패턴. 개발자가 만든 Role의 effective permission은 그 Role의 정책 ∩ boundary로 제한. SCP는 계정 전체에 적용되므로 너무 광범위. 핀테크 회사 사고 후 도입되는 표준 패턴.

---

**문제 7.** 한 회사가 50개 member 계정의 CloudTrail 로그를 한 곳에 모으고, 운영자가 그 로그를 수정·삭제하지 못하게 하려고 한다. 정답은?

A) Member 계정마다 trail 만들고 cross-account 권한
B) Organization Trail + Log Archive Account의 S3 버킷 + S3 Object Lock(WORM)
C) CloudWatch Logs Subscription
D) AWS Backup으로 trail 백업

**정답: B**
해설: Organization Trail로 모든 계정 자동 활성화, Log Archive Account에 격리된 S3 + Object Lock으로 변조 방지. AWS Landing Zone 표준 패턴. PCI-DSS 10.5.5 요구사항을 정확히 충족.

---

**문제 8.** 운영팀이 EC2 인스턴스의 메타데이터 SSRF 공격을 막으려고 한다. 가장 강력한 운영 표준은?

A) SG로 169.254.169.254 차단
B) IMDSv2 강제 + hop limit 1 + SCP로 IMDSv1 인스턴스 생성 차단 + Config rule로 비준수 탐지
C) IAM 역할을 인스턴스에 안 붙임
D) NACL로 메타데이터 IP 차단

**정답: B**
해설: 169.254.169.254는 link-local로 SG/NACL로 막을 수 없음(hypervisor 레벨에서 처리). SCP로 신규 생성 차단(가장 강함) + Config로 기존 인스턴스 탐지 + IMDSv2 + hop limit 1로 다층 방어. 운영자의 표준 4중 방어.

---

**문제 9.** 운영자가 100개 계정의 EC2를 한 번에 보고 싶다. 가장 효율적인 방법은?

A) 각 계정에 로그인해서 EC2 목록 확인
B) Resource Explorer Multi-Account 검색 또는 Systems Manager Inventory + Resource Data Sync
C) Lambda로 매일 모든 계정 순회
D) CloudFormation Stack Set으로 EC2 메타데이터 수집

**정답: B**
해설: Resource Explorer를 organization 단위로 활성화하면 모든 계정 리소스를 한 검색에서 조회. SSM Inventory + Resource Data Sync로도 가능. Lambda 순회는 가능하지만 운영 부담. 2022년 출시된 Resource Explorer가 AWS 공식 답.

---

**문제 10.** 한 운영팀이 새벽 3시 us-east-1 장애 알림을 받기 위해 EventBridge 룰을 만들었다. 어디에 만들어야 빠짐없이 받는가?

A) us-east-1에만
B) us-east-1과 us-west-2 양쪽에
C) 모든 활성화된 리전에
D) 관리 계정에 단 한 번

**정답: B**
해설: AWS Health API는 us-east-1과 us-west-2 두 곳에서 active-active로 운영. EventBridge `aws.health` source 룰을 양쪽에 만들어야 한 쪽 장애 시에도 누락 없음. Organization Health View를 켜면 모든 계정 이벤트를 management account에서도 받을 수 있다.

---

**문제 11.** 보안 운영자가 5개 부서별로 EC2 시작/중지 권한을 분리해야 한다. 100명 직원과 200대 EC2가 있다. 가장 확장성 있는 방식은?

A) 부서별로 IAM Group 5개 + EC2별 IAM Policy 200개
B) 직원 PrincipalTag/Department와 EC2 ResourceTag/Department가 일치할 때만 Allow하는 ABAC 정책
C) 부서별 IAM User 5명
D) Service Catalog로 EC2 launch

**정답: B**
해설: ABAC 패턴. 정책 하나로 N×M 권한 조합 처리. 직원 부서가 IdP에서 바뀌면 AWS 권한도 자동 변경. NIST SP 800-162 ABAC 표준 구현. RBAC로는 정책 폭증이 발생한다.

---

**문제 12.** 보안 운영자가 100개 계정의 GuardDuty finding과 Security Hub 점수를 한 곳에서 보려고 한다. 표준 패턴은?

A) 각 계정 콘솔에 일일이 로그인
B) Security Account를 GuardDuty/Security Hub의 Delegated Administrator로 지정
C) Lambda로 각 계정 finding 수집
D) EventBridge로 SNS에 전송 후 별도 시스템 구축

**정답: B**
해설: Delegated Administrator 패턴은 GuardDuty, Security Hub, Inspector, Macie 등 보안 서비스의 표준 중앙화 방식. management account 부담을 분산하면서 한 보안 계정이 organization 전체를 관리. 2020년 이후 모든 보안 서비스가 이 패턴을 지원.

---

## Week 1 셀프 체크리스트

- [ ] Region/AZ의 차이와 NAT GW의 AZ 의존성을 설명할 수 있는가?
- [ ] 공동 책임 모델에서 EC2 vs Lambda의 책임 경계 차이를 설명할 수 있는가?
- [ ] IAM 정책 평가 6단계 알고리즘을 떠올릴 수 있는가?
- [ ] SCP와 Permission Boundary의 차이를 알고 있는가?
- [ ] Identity Center의 Permission Set 동작 원리를 이해하는가?
- [ ] AWS Health Dashboard와 EventBridge 연동 패턴을 안다?
- [ ] Organization Trail의 운영자 가치를 설명할 수 있는가?
- [ ] IMDSv2와 hop limit이 SSRF를 어떻게 막는지 안다?
- [ ] ZoneName과 ZoneId의 차이와 cross-account 비용 최적화 패턴을 안다?
- [ ] Delegated Administrator로 보안 서비스 중앙화 방법을 안다?

다음 주는 운영자 도구 중 가장 자주 쓰는 **CloudWatch Metrics와 Logs**. 모든 알람과 디버깅의 출발점이다. metric의 resolution(1초 vs 60초), Logs Insights 쿼리, X-Ray 추적까지 차례로 본다.
