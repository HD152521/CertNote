# Day 4 - AWS Organizations: 100개 계정을 한 사람이 운영하는 법

스타트업이 5명일 땐 AWS 계정 1개로 충분하다. 직원이 50명이 되면 환경 분리(prod/dev/staging) + 비용 분리 + 권한 분리 필요로 계정이 보통 5-10개. 200명이 되면 팀별 sandbox까지 합쳐 50개를 넘기 시작한다. 1,000명이면 100개를 가뿐히 넘는다. 아마존 자신은 사내 팀들이 수만 개의 계정을 보유한다("two-pizza team마다 자기 계정"이 아마존 내부 원칙). 이 시점에서 운영자가 안 보면 무너지는 게 **거버넌스**다. 누가 어떤 권한을, 어느 계정에서, 얼마의 비용까지 쓸 수 있는가.

AWS Organizations는 이 멀티 계정 운영의 신경계다. SCP·통합 청구·계정 생성 자동화·로깅 중앙화·일괄 정책 적용·중앙 GuardDuty·중앙 Config — 운영자가 손으로 100번 할 일을 한 번에 처리한다.

## Organizations의 구조: 4가지 단위

```
[Organization]                           ← 회사 전체 (관리 계정 1개)
   │
   ├─ Root                               ← 최상위 컨테이너
   │   │
   │   ├─ OU: Security                   ← 부서/환경 단위 그룹
   │   │   ├─ Log Archive Account        ← 개별 계정
   │   │   └─ Audit Account
   │   │
   │   ├─ OU: Production
   │   │   ├─ Prod-Web Account
   │   │   ├─ Prod-API Account
   │   │   └─ Prod-Data Account
   │   │
   │   ├─ OU: Development
   │   │   ├─ Dev Account
   │   │   └─ Staging Account
   │   │
   │   └─ OU: Sandbox
   │       ├─ Developer1 Account
   │       └─ Developer2 Account
```

| 단위 | 의미 |
|------|------|
| **Organization** | 회사 전체. 관리 계정(Management Account) 1개가 root |
| **Root** | Organization 최상위 컨테이너. 모든 OU의 부모 |
| **OU (Organizational Unit)** | 계정의 묶음. 5단계까지 중첩 가능 |
| **Account** | 실제 AWS 계정. 12자리 ID로 식별 |

운영자가 가장 자주 헷갈리는 게 **Management Account vs Member Account**. 관리 계정은 organization을 만든 계정으로, **SCP 적용 대상이 아니다**(자기 자신을 제한 못함). 그래서 관리 계정에는 워크로드를 절대 두지 않는 게 정석. organization 관리 + 결제 + Identity Center만.

> 📚 **사례**: 한 한국 SaaS 회사가 management account에 prod EC2와 RDS를 운영했다. 어느 날 IAM 사용자 access key가 GitHub에 유출됐고, 공격자가 그 계정을 침해. SCP로 막아둔 다른 계정과 달리 management account엔 SCP가 통하지 않아 무방비. 결과: 수천 달러 비트코인 채굴 + 데이터베이스 유출. 사고 후 management account는 워크로드 zero로 재구성됐다. AWS가 2024년부터 management account에 워크로드를 띄우면 콘솔에서 노란 배너를 띄워 경고하기 시작한 배경이다.

> ⚠️ **함정**: 시험에서 "관리 계정에 SCP를 적용해 보안을 강화" 같은 보기는 함정. 관리 계정엔 SCP가 안 통한다. 또 다른 함정: management account의 root user는 모든 권한을 가지고, MFA 없이 access key를 만들 수 있다. 이게 가장 큰 single point of failure.

## 통합 결제(Consolidated Billing): 운영자의 비용 통제 첫 도구

Organizations의 가장 즉각적 가치는 통합 결제다. 모든 member account의 청구가 management account로 합쳐지고, 결제도 한 번에. 운영자에게 더 중요한 건 다음 네 가지:

1. **Volume Discount 통합**: S3, Data Transfer 같이 사용량 누적 할인이 있는 서비스는 모든 계정의 사용량을 합산해 할인 적용. 흩어진 계정이 모이면 더 큰 할인 구간 진입.
2. **Reserved Instance/Savings Plan 공유**: 한 계정에서 산 RI/SP를 organization 전체가 사용 가능(설정에 따라). 운영자가 RI 구매 계획을 단일 계정 기준이 아닌 전체 사용량 기준으로 짤 수 있음.
3. **Cost Allocation Tag 일괄 적용**: 부서·프로젝트 단위 태그로 비용 분석을 자동화.
4. **Cost Anomaly Detection 중앙화**: 100개 계정의 비용 이상치를 한 곳에서 모니터링.

> 🔍 **더 깊이**: RI/SP 공유는 **Sharing Settings**에서 토글. 켜진 OU/계정 사이에서만 매칭. 운영자 패턴은 "RI 구매는 관리 계정 또는 별도 결제 계정 한 곳에 모으고, 사용은 전체 OU에 공유". 이러면 어느 계정에서든 매칭되는 EC2가 RI 할인을 받는다. 반대로 특정 팀이 자기 RI만 쓰게 하려면 sharing을 끄고 그 OU 내부에서만 공유. Savings Plan은 RI보다 유연(인스턴스 타입·OS·테넌시 무관)하지만 같은 sharing 메커니즘.

> 📚 **사례**: 한 미디어 회사가 30개 계정에 각자 EC2 RI를 구매하다 매월 \$50K 낭비(언더유틸라이즈). Organizations + RI 공유로 한 곳 구매·전체 사용 패턴으로 전환, 매칭률이 85% → 99%로 올라 연간 \$1M 절감. 이게 통합 결제의 진짜 가치.

## CloudTrail Organization Trail: 모든 계정의 감사 로그를 한 번에

운영자가 100개 계정에 일일이 CloudTrail을 활성화하면 누락 가능성이 크다. **Organization Trail** 한 번 만들면 모든 member account의 CloudTrail이 자동 활성화 + 지정한 S3 버킷에 통합 저장.

```
[관리 계정]
   │
   ├─ Organization Trail 생성
   │   - 적용 대상: 모든 OU
   │   - 저장 위치: Log Archive Account의 S3 버킷
   │   - 옵션: Management Events + Data Events + Insight Events
   │
   ▼
[모든 member account]
   - CloudTrail이 자동 활성화
   - 비활성화·삭제 시도 시 SCP로 차단 가능
   - member account 운영자는 trail을 볼 수만 있고 수정 불가
```

이 패턴 + Log Archive Account 분리가 **AWS 권장 멀티 계정 패턴(Landing Zone)**의 핵심.

> 💡 **관련 이론**: 로그 중앙화의 원칙은 "변조 방지 + 보존 + 분석 용이성". NIST SP 800-92(로그 관리 가이드)에서 명시하는 5대 원칙(완전성, 무결성, 기밀성, 가용성, 추적성)을 클라우드에서 구현한 게 Log Archive Account 패턴. 침투당한 계정의 운영자가 자기 흔적을 지우지 못하게, 로그는 별도 계정의 S3 버킷에 저장하고 그 버킷은 S3 Object Lock(WORM)으로 보호. PCI-DSS 10.5.5 요구사항("로그 무결성 보장")의 표준 구현이기도 하다.

> ⚠️ **함정**: Organization Trail은 member account의 CloudTrail을 "추가"한다. member account가 자기 trail을 별도로 만들 수 있다(이중 비용). 운영자는 SCP로 member account의 `cloudtrail:CreateTrail`을 막거나, Organization Trail만 허용하는 정책을 적용. 또 다른 함정: Organization Trail의 S3 버킷 정책에 service principal `cloudtrail.amazonaws.com`이 PutObject를 가져야 한다(자동 생성되지만 수정 시 깨질 수 있음).

## AWS Control Tower: Landing Zone의 자동화

Organizations + SCP + Trail + Identity Center + Account Factory를 모두 한 번에 깔아주는 게 **Control Tower**. 운영자가 "멀티 계정 시작"을 클릭하면 다음이 자동:

1. **Log Archive Account** 자동 생성 + 모든 CloudTrail/Config 로그 중앙 저장
2. **Audit Account** 자동 생성 + Cross-Account 감사 권한 부여
3. **기본 SCP 가드레일 ~20개** 자동 적용 (강제·강력 권장·강력 권장 disabled 등 분류)
4. **Account Factory**: 신규 계정을 표준 OU 배치 + 기본 정책 자동 적용으로 5분 안에 생성
5. **AFT(Account Factory for Terraform)**: GitOps 방식으로 계정 생성·구성 자동화

> 🔍 **더 깊이**: Control Tower의 가드레일은 두 종류. **Preventive(예방)**는 SCP로 액션을 차단(예: "CloudTrail 비활성화 금지"). **Detective(탐지)**는 Config Rule로 비준수를 탐지(예: "S3 버킷이 public이면 알림"). 일부는 둘 다 — `Strongly Recommended` 카테고리 중에는 SCP + Config 양쪽으로 가드. 2023년부터는 **Proactive controls**도 추가됐는데, 이건 CloudFormation 배포 시점에 미리 차단하는 hook 기반 가드(CFN Guard).

## RAM (Resource Access Manager): 리소스 공유

계정을 나눠 두면 VPC, Transit Gateway, License, Route 53 Resolver Rule 같은 리소스도 계정마다 따로 만들어야 한다. 비용·관리 부담이 폭증. **AWS RAM**으로 이 리소스를 다른 계정과 공유.

대표 시나리오:
- **VPC Subnet 공유**: 한 네트워크 계정이 VPC를 만들고, 다른 워크로드 계정이 그 VPC의 subnet에 EC2/RDS를 띄움. **VPC는 한 곳에만, 비용은 각자**.
- **Transit Gateway 공유**: 중앙 TGW 한 개로 모든 계정의 VPC를 hub-and-spoke로 연결.
- **License Manager 공유**: BYOL 라이선스를 organization 전체가 공유.
- **Route 53 Resolver Rule 공유**: 온프레미스 DNS forward 룰을 모든 계정이 사용.

```bash
# RAM으로 VPC subnet 공유
aws ram create-resource-share \
  --name SharedSubnets \
  --resource-arns arn:aws:ec2:ap-northeast-2:111111111111:subnet/subnet-abc \
  --principals 222222222222 333333333333
```

> 📚 **사례**: 한 게임 회사가 50개 계정 각각에 VPC + NAT GW를 만들어 운영하다 NAT GW 비용만 월 \$3,000+. VPC 공유 패턴으로 전환해 중앙 1개 VPC + NAT GW 2개로 통일하니 NAT 비용이 90% 감소. 운영 부담도 함께 감소. 단 트레이드오프: 네트워크 계정 장애 시 모든 계정이 영향(blast radius). 그래서 보통 active-active로 2개 네트워크 계정 운영.

## Service Quotas와 Usage 모니터링

Organization 단위로 자주 일어나는 운영 사고가 **service quota 도달**. EC2 vCPU 한도, Lambda 동시 실행 한도, S3 버킷 수 한도 — 평소엔 안 보이다가 트래픽 폭증·신규 출시 시점에 갑자기 막힌다.

운영자 패턴:
1. **Service Quotas 콘솔에서 사용률 모니터링**: 현재 사용량 / quota 비율
2. **CloudWatch Alarm 설정**: 사용률 80% 도달 시 자동 알림(`AWS/Usage` 네임스페이스)
3. **선제적 quota 증가 요청**: 트래픽 캠페인 1-2주 전 신청
4. **Quota Template**: 신규 계정 생성 시 표준 quota를 자동 적용

> 🔍 **더 깊이**: 일부 quota는 **soft limit**(요청으로 즉시 증가)이지만 일부는 **hard limit**(증가 불가). EC2 vCPU는 soft(평소 1000 vCPU에서 100,000으로 증가 신청 가능). VPC 당 subnet 수 200개는 보통 hard(Architecture로 풀어야 함). 시험에서 "vCPU 한도 도달" 시나리오는 거의 항상 Service Quotas 요청. CloudWatch metric `ResourceCount` (네임스페이스 `AWS/Usage`)으로 quota 추적이 가능하다.

## 멀티 계정 운영의 표준 패턴: AWS Landing Zone

운영자가 100개 계정을 운영할 때의 **AWS 권장 계정 구조**:

```
Management Account     ← Organizations, IAM Identity Center, Billing 만
   │
   ├─ Security OU
   │   ├─ Log Archive Account     ← 모든 CloudTrail/Config/Access 로그
   │   └─ Audit Account            ← Security Hub, GuardDuty 통합
   │
   ├─ Infrastructure OU
   │   ├─ Network Account          ← 중앙 VPC, TGW, Route 53 Resolver
   │   └─ Shared Services Account  ← DNS, AD, 모니터링
   │
   ├─ Workloads OU
   │   ├─ Production OU
   │   │   ├─ Prod-App1, Prod-App2 ...
   │   └─ Non-Production OU
   │       ├─ Dev, Staging, QA
   │
   ├─ Sandbox OU                   ← 개발자 개인 실험
   │
   └─ Deprecated OU                ← 폐기 진행 중인 계정 격리
```

각 OU에 적합한 SCP가 적용되며, Sandbox OU엔 "월 \$100 한도 초과 시 종료" 같은 강한 제약이 붙는다. Production OU엔 리전 잠금 + 변경 제한 + 강제 backup 정책. Deprecated OU는 모든 write 액션을 deny하고 6개월 후 자동 삭제 워크플로 트리거.

> 💡 **관련 이론**: 이 구조는 **Zero Trust Architecture**(NIST SP 800-207)의 클라우드 구현. "Never trust, always verify"를 계정 경계로 확장 — 한 계정의 침해가 다른 계정에 전파되지 않도록 격리. 또한 **Defense in Depth** 원칙 — SCP + Config + GuardDuty + WAF + IAM 등 다층 방어. 군사 보안에서 "concentric rings of defense"라 부르는 개념(미 국방부 DoD CSEC, 2013)을 클라우드에 가져온 것.

## Organizations 활성화되는 통합 서비스

Organizations와 통합되는 서비스가 30개 이상. 자주 쓰는 것:

| 서비스 | 통합 효과 |
|--------|-----------|
| **CloudTrail** | Organization Trail 한 번에 전 계정 |
| **Config** | Aggregator로 모든 계정 컴플라이언스 집계 |
| **GuardDuty** | Delegated Administrator에서 전 계정 finding 통합 |
| **Security Hub** | 모든 계정 보안 점수·finding 집계 |
| **Inspector** | EC2/ECR 취약점 스캔을 전 계정에 |
| **Macie** | S3 PII 탐지를 전 계정에 |
| **Resource Access Manager** | Organization 단위 공유로 외부 invite 불필요 |
| **Service Catalog** | Portfolio를 OU에 공유 |
| **Cost Anomaly Detection** | 비용 이상치 중앙 모니터링 |
| **Backup** | Organization 단위 백업 정책 |
| **Health** | 전 계정 이벤트 통합 보기 |

> 🔍 **더 깊이**: 이 모든 통합의 핵심은 **Delegated Administrator** 패턴. 보안 계정(보통 Audit Account)을 GuardDuty/Security Hub의 delegated admin으로 지정하면, 그 계정에서 모든 member account의 finding을 관리한다. management account 부담을 분산하면서 중앙화는 유지. 시험에서 "100개 계정의 GuardDuty finding을 한 곳에서 보려면?"의 답은 거의 항상 "Delegated Administrator로 Security Account 지정".

## 정리하며

오늘의 핵심: 멀티 계정 운영은 "보안과 비용을 일관되게"의 문제. SCP가 보안 가드레일, 통합 결제가 비용 가드레일, Organization Trail이 감사 가드레일. Control Tower로 이 모두를 자동화하고, Account Factory로 신규 계정을 표준화한다. RAM으로 공통 리소스를 공유해 비용·운영 부담을 줄이고, Delegated Administrator로 보안 서비스 통합을 중앙화한다.

내일은 Week 1을 마무리하며 시나리오 10문제. AWS 인프라·IAM·Organizations를 운영자 시점으로 통합 점검한다.

---

## 📝 연습 문제

**문제 1.** 관리 계정(Management Account)에 워크로드를 두면 안 되는 이유는?

A) 관리 계정은 비용이 더 비싸다
B) 관리 계정에는 SCP가 적용되지 않으므로 보안 가드레일이 없다
C) 관리 계정은 read-only다
D) 관리 계정은 단일 리전만 사용 가능

**정답: B**
해설: 관리 계정은 SCP의 영향을 받지 않는다(자기 자신을 제한 못함). 따라서 워크로드를 두면 organization의 보안 가드레일이 통하지 않아 위험. AWS 권장은 관리 계정에 organization 관리·결제·Identity Center만 두고 워크로드는 member account에. 한국 SaaS 회사 사고가 이걸 보여준다.

---

**문제 2.** 운영자가 100개 계정의 CloudTrail 로그를 한 S3 버킷에 모으려고 한다. 가장 효율적인 방법은?

A) 각 계정에 trail 만들고 cross-account S3 권한 설정
B) Organization Trail 생성 → 모든 member account 자동 활성화
C) Lambda로 각 계정에서 trail 만들기
D) Service Catalog로 trail 템플릿 배포

**정답: B**
해설: Organization Trail은 한 번 만들면 모든 member account에 자동 활성화 + 통합 S3 버킷 저장. member account가 비활성화하려고 해도 SCP로 차단 가능. Landing Zone 패턴의 핵심 컴포넌트.

---

**문제 3.** 회사가 50개 계정에서 VPC와 NAT Gateway를 각각 운영해 비용이 폭증했다. 운영 부담을 줄이려면?

A) 모든 계정의 VPC를 하나로 통합
B) 네트워크 계정 한 곳에 VPC를 만들고 RAM으로 subnet 공유
C) Direct Connect로 통합
D) Transit Gateway로 VPC를 묶고 각자 NAT GW 유지

**정답: B**
해설: RAM(Resource Access Manager)으로 VPC subnet을 다른 계정과 공유. 각 계정은 자기 EC2/RDS를 공유된 subnet에 띄우지만 VPC와 NAT GW 비용은 네트워크 계정 한 곳에만. 운영도 중앙화. 단 네트워크 계정 장애 시 blast radius가 커지므로 active-active 구성을 검토.

---

**문제 4.** 신규 계정을 매주 5개씩 만드는데, 표준 SCP·CloudTrail·IAM 역할이 자동 적용되게 하려면?

A) 매번 CloudFormation 수동 배포
B) Control Tower + Account Factory
C) Lambda로 신규 계정 감지하고 자동 적용
D) Service Catalog product로 배포

**정답: B**
해설: Control Tower의 Account Factory는 신규 계정 생성 시 표준 OU 배치 + 기본 SCP + Trail/Config + Identity Center 권한을 자동 적용. 5-10분 안에 표준화된 계정 생성. AFT(Account Factory for Terraform)로 GitOps 방식 자동화도 가능. 시험에서 "신규 계정 표준화"는 거의 Control Tower.

---

**문제 5.** SCP가 적용되지 않는 대상은? (2개)

A) Member Account의 IAM User
B) Member Account의 IAM Role
C) Management Account의 IAM User
D) Service-Linked Role

**정답: C, D**
해설: SCP는 management account에 적용 안 됨 + service-linked role에도 적용 안 됨(AWS가 관리). 나머지 member account 내의 모든 IAM principal에는 적용. 이 두 예외는 시험에 자주 나온다.

---

**문제 6.** 보안 운영자가 100개 계정의 GuardDuty finding을 한 곳에서 보고 관리하고 싶다. 표준 패턴은?

A) 각 계정 콘솔에 일일이 로그인
B) Security Account를 GuardDuty의 Delegated Administrator로 지정
C) Lambda로 각 계정 finding을 수집
D) EventBridge로 SNS에 전송

**정답: B**
해설: Delegated Administrator 패턴은 GuardDuty, Security Hub, Inspector, Macie 등 보안 서비스의 표준 중앙화 방식. management account 부담을 분산하면서 한 보안 계정이 organization 전체를 관리. 2020년 이후 모든 보안 서비스가 이 패턴을 지원.
