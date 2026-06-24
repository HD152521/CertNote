# Day 3 - Control Tower와 Landing Zone: 거버넌스의 자동화

2017년 Organizations와 SCP가 등장한 후에도 한 가지 큰 문제가 남아 있었다. **신규 계정을 만들 때마다 같은 작업을 반복해야 한다는 것이다.** CloudTrail 활성화, Config 활성화, 기본 IAM Role 생성, SCP 부착, Log Archive로 트레일 전송 설정, Audit 계정에 GuardDuty Master 연결 — 한 계정당 30분 ~ 1시간이 걸리는 작업이었다. 100개 계정을 만들려면 100시간. 그 사이 실수로 한 단계를 빼먹으면 그 계정만 PCI 감사에서 fail.

이 문제를 푸는 게 **Landing Zone**이라는 개념이다. 멀티 계정 환경의 "기준점 구축물"을 한 번에 자동 구축하는 것. 2017-2018년에 AWS는 [AWS Landing Zone 솔루션](https://github.com/aws-samples/aws-landing-zone-solution)을 CloudFormation 기반으로 제공했다. 하지만 이건 customer-managed solution이라 업데이트가 어렵고, 사용자가 직접 운영해야 했다. 2018년 11월 re:Invent에서 AWS는 이걸 **fully managed** 서비스로 다시 만든 **AWS Control Tower**를 발표한다.

오늘은 Control Tower의 본질, Landing Zone의 구성 요소, 가드레일 3종(Preventive/Detective/Proactive), Account Factory와 AFT의 차이, 그리고 Drift Detection까지 본다. Pro 시험의 "100개 계정 표준화·자동화" 시나리오는 거의 모두 Control Tower 정답이다.

## Landing Zone이란: 거버넌스의 기준점

**Landing Zone** = 멀티 계정 AWS 환경에서 표준화된 거버넌스·보안·감사·로깅·ID 통합의 기준선.

직접 구축 시 필요한 작업들:
1. AWS Organizations 생성 + OU 설계
2. Log Archive 계정 + S3 Object Lock + Organization Trail
3. Audit 계정 + Security Hub Master + GuardDuty Master
4. IAM Identity Center 활성화 + Permission Set 설계
5. SCP 작성·부착 (리전 제한, root 차단, MFA 강제 등)
6. Config Aggregator + Config Rule 일괄 배포
7. 신규 계정 생성 자동화 (CreateAccount API)
8. baseline IAM Role, VPC, 태그 표준화
9. CloudWatch Alarm + SNS 알림 허브

한 번에 다 설정하면 수개월. Control Tower는 이 모든 것을 **1시간 안에** 자동 구축한다.

> 💡 **관련 이론**: Landing Zone의 사상은 Heroku의 **"12-Factor App"**(2011)에서 영감을 받았다. 12-Factor는 앱이 이미 만들어진 환경 위에 "내려앉기(land)"만 하면 동작하도록 환경 자체를 표준화하라는 사상. 클라우드 인프라에 적용하면 "신규 계정이 만들어지면 그 위에 모든 워크로드가 즉시 동작 가능하도록 인프라가 표준화돼 있어야 한다"는 게 Landing Zone. 이게 **Platform Engineering**(2022 이후 트렌드)의 클라우드 인프라 영역이다.

> 🔍 **더 깊이**: Control Tower의 백엔드는 사실 (1) Organizations, (2) Service Catalog, (3) Config, (4) CloudFormation StackSets, (5) IAM Identity Center, (6) CloudWatch Events의 조합이다. AWS가 이걸 fully managed로 묶어 제공하는 것이지 별도의 새 서비스가 아니다. 그래서 Control Tower 없이도 같은 결과를 자체 구축 가능 — 그게 **CfCT(Customizations for Control Tower)**와 **AFT**가 활용하는 기반.

## Control Tower 구성 요소

| 구성 | 역할 |
|------|------|
| **Management Account** | Org·Control Tower 본부 |
| **Log Archive Account** | CloudTrail Organization Trail + Config Aggregator 적재 |
| **Audit Account** | Security Hub Master, GuardDuty Master, SNS 알림 허브 |
| **Core OU** | 위 두 계정 포함, 자동 생성 |
| **Custom OU** | 사용자 정의 워크로드 OU |
| **Account Factory** | 신규 계정 자동 생성 + 가드레일 부착 |
| **AWS IAM Identity Center** | SSO 자동 활성화 |
| **AWS Config Aggregator** | 모든 계정 Config 데이터 단일 뷰 |

> ⚠️ **함정**: Control Tower 활성화 후 **수동으로 Log Archive 계정에 들어가서 S3 정책을 바꾸면 drift**가 발생한다. Control Tower가 "표준에서 벗어남"으로 표시하고 다음 baseline update에서 덮어쓴다. Log Archive·Audit는 절대 손대지 말 것 — 표준 패턴.

## 가드레일 3종: Preventive / Detective / Proactive

| 종류 | 메커니즘 | 작동 시점 | 예 |
|------|----------|------------|-----|
| **Preventive** (예방) | SCP 기반, 위반 시 거부 | API 호출 직전 | "S3 퍼블릭 ACL 금지" |
| **Detective** (탐지) | AWS Config Rule, 위반 사실 감지 | API 호출 후 | "암호화 안 된 EBS 발견" |
| **Proactive** (사전 차단) | CloudFormation Hook, 배포 전 차단 | CFN/CDK 배포 시 | "비암호화 EBS 배포 거부" |

또 다른 분류 (적용 강도):
- **Mandatory**: 항상 켜짐 (해제 불가). 예: CloudTrail 비활성화 차단.
- **Strongly Recommended**: 강력 권장 (해제 가능). 예: S3 퍼블릭 차단.
- **Elective**: 선택. 예: 특정 EBS 타입만 허용.

> 🔍 **더 깊이**: 세 가드레일은 **defense in depth**의 시간축 배치다. (1) Proactive는 IaC 배포 단계, (2) Preventive는 런타임 API 호출 단계, (3) Detective는 사후 모니터링 단계. 한 단계가 뚫려도 다음 단계가 막는다. 예를 들어 IaC 우회로 console에서 직접 만들어도 Preventive(SCP)가 차단, 어찌어찌 만들어졌어도 Detective(Config)가 30분 안에 알림.

> 💡 **관련 이론**: Defense in Depth는 미국 NSA가 1990년대 정착시킨 보안 사상이다. 단일 방어막보다 여러 층의 다른 종류 방어를 두라는 것. NIST SP 800-160 (Systems Security Engineering)이 이를 형식화한다. Control Tower 가드레일 3종은 이 사상을 클라우드에 가장 깔끔하게 구현한 사례.

> 🎯 **시나리오**: "한 회사가 PCI-DSS 인증을 받기 위해 모든 EBS가 KMS 암호화되어야 한다. (1) CloudFormation으로 배포할 때, (2) Console에서 직접 만들 때, (3) 이미 만들어진 비암호화 EBS도 알림이 와야 한다. 어떻게 보장?" — 답: **3가드레일 모두 활성화**. Proactive는 CFN Hook으로 배포 전 차단, Preventive는 SCP로 RunInstances 시점 차단, Detective는 Config Rule로 기존 리소스 스캔. 셋이 한 세트.

## Account Factory의 자동 배포 흐름

```
사용자가 Account Factory에서 신청 (콘솔 또는 API)
   │
   ▼
신규 AWS 계정 생성 (자동 이메일·OU 배치)
   │
   ▼
Baseline 적용:
  - CloudTrail (Organization Trail로 자동 연결)
  - AWS Config Recorder 활성화
  - IAM Identity Center 권한 세트 매핑
  - 표준 IAM Role (예: AWSControlTowerExecution)
   │
   ▼
가드레일 자동 부착 (SCP + Config Rule)
   │
   ▼
IDC에 권한 세트 자동 매핑 (예: AWSAdministratorAccess)
   │
   ▼
사용자에게 알림 (계정 ID + 로그인 URL)
```

> 🔍 **더 깊이**: Account Factory는 내부적으로 Service Catalog를 사용한다. "신규 계정 생성"이 Service Catalog Product로 정의돼 있고, Provisioning이 CloudFormation StackSet 실행으로 이어진다. 그래서 Service Catalog 권한이 있는 사용자만 신규 계정 만들 수 있다 — 이게 Org에서 직접 `CreateAccount` 호출하는 것과의 차이.

## AFT (Account Factory for Terraform)

- **Terraform 기반 IaC**로 계정 생성 자동화.
- 계정 단위 커스터마이징 (네트워킹 stub, 태그, 추가 IAM Role).
- GitOps 워크플로우와 잘 맞음.

```
[Git Repo] ─ PR 머지 ─→ [CodePipeline]
                            │
                            ▼
                       [AFT Modules]
                            │
                            ▼
                       [Control Tower Account Factory]
                            │
                            ▼
                       [신규 계정 + 커스텀 베이스라인]
```

> 🎯 **시나리오**: "한 핀테크가 1년에 200개 신규 마이크로서비스를 출시한다. 각 서비스마다 별도 AWS 계정. 표준 베이스라인(VPC stub, IAM Role, 태그) + GitOps. 가장 적합한 도구?" — 답: **AFT**. Terraform 기반 GitOps 흐름이 표준. PR로 신규 계정 신청 → AFT가 자동 생성 + 베이스라인 적용. 같은 패턴이 Capital One·HashiCorp 등 대형 조직의 표준.

## CfCT (Customizations for Control Tower)

- CloudFormation 기반 확장.
- 라이프사이클 이벤트(예: 계정 등록)에 트리거되어 StackSet·SCP 추가 배포.
- AFT보다 가볍지만 CFN 한정.

| 도구 | 기반 | GitOps | 적합 |
|------|------|--------|------|
| Account Factory (콘솔) | Service Catalog | ❌ | 작은 조직 |
| AFT | Terraform | ✅ | Terraform 사용 |
| CfCT | CloudFormation | 일부 | CFN 사용 |

## Drift Detection

Control Tower는 표준 baseline에서 벗어난 변경 자동 감지:
- OU 외부에서 SCP 변경
- Log Archive S3 정책 변경
- IDC 권한 세트 변경
- Account Factory baseline 변경

탐지 시 콘솔 알림 + Lambda 자동 복구 가능.

> 🔍 **더 깊이**: Drift Detection의 백엔드는 CloudFormation StackSet drift detection + 별도 Lambda 모니터링이다. 매 시간 baseline 상태와 실제 상태를 비교. 차이가 있으면 Control Tower 콘솔의 "Landing Zone Drift" 섹션에 표시. 자동 복구는 기본 OFF — 수동으로 "Re-register Account" 또는 "Update Landing Zone" 실행해야 baseline으로 복원.

> ⚠️ **함정**: Control Tower에서 OU를 만들 때는 반드시 Control Tower 콘솔에서 만들어야 한다. Organizations 콘솔에서 OU를 만들면 Control Tower가 인식 못 해서 가드레일이 자동 부착 안 된다. "Control Tower에 등록된 OU(registered OU)"와 일반 OU의 차이가 시험에 나온다.

## 직접 구축 vs Control Tower

| 항목 | 직접 구축 | Control Tower |
|------|-----------|---------------|
| 구축 시간 | 수개월 | 1시간 |
| 유지보수 | 자체 | AWS 자동 업데이트 |
| 커스터마이징 | 자유 | AFT/CfCT 필요 |
| 비용 | 무료 (구성 비용만) | Config + CT 가드레일 비용 |
| 학습 곡선 | 낮음 (개별 서비스) | 중간 (CT 개념) |
| 모범 사례 | 자체 연구 | AWS SRA 기반 |

> 💡 **Pro 정답 패턴**: "100개 계정·표준화·신규 계정 자동" → **Control Tower**. "이미 운영 중인 Org에 Landing Zone 적용" → **Control Tower가 기존 Org 흡수 가능**. "Terraform GitOps" → **AFT**. "CloudFormation" → **CfCT**.

## 정리하며

오늘 본 그림은 셋이다. 첫째, **Landing Zone**은 멀티 계정 환경의 기준점이고, Control Tower가 이를 1시간 안에 자동 구축한다. 둘째, **가드레일 3종**(Preventive/Detective/Proactive)이 defense in depth의 시간축으로 작동한다. 셋째, **Account Factory/AFT/CfCT**가 신규 계정 자동화의 세 옵션이며 IaC 도구에 따라 선택이 갈린다.

다음 글에서는 Control Tower가 자동 활성화한 **IAM Identity Center**를 본다. Permission Set, SCIM 동기화, 외부 IdP(Okta·Azure AD) 통합 등 멀티 계정 SSO의 표준 패턴이다.

---

## 📝 연습 문제

**문제 1.** "S3 버킷이 퍼블릭이 되는 것을 사전 차단" — 어떤 가드레일 조합이 가장 강력?

A) Detective만
B) Preventive (SCP)만
C) Proactive (CFN Hook)만
D) Preventive + Proactive + Detective (3중)

**정답: D**
해설: Defense in depth — Proactive(IaC 배포 단계 차단), Preventive(API 호출 시점 차단), Detective(사후 모니터링) 셋이 한 세트. 한 단계가 뚫려도 다음 단계가 막음. 2017년 Verizon·Accenture S3 public 사고처럼 한 줄의 실수로 데이터 유출되는 구조적 사고를 방지하려면 다층 방어 필수.

---

**문제 2.** 100개 계정 표준화·신규 계정 자동 생성·SCP 일괄 부착. 가장 적절한?

A) CloudFormation StackSets만
B) Control Tower + Account Factory
C) Service Catalog
D) Systems Manager

**정답: B**
해설: Control Tower가 멀티 계정 거버넌스 표준. Account Factory가 신규 계정 자동 생성 + 가드레일 자동 부착. StackSets는 부분 기능, Service Catalog는 일반 카탈로그 도구.

---

**문제 3.** 기존 Org가 이미 운영 중. Landing Zone 도입하려면?

A) Org를 새로 만들어야 함
B) Control Tower가 기존 Org 흡수 가능 (existing Org에 set up)
C) AFT만 사용
D) StackSets로만

**정답: B**
해설: Control Tower는 기존 Org에 set-up 가능. 기존 OU·계정을 인식하고 Log Archive·Audit 계정을 추가 생성. 기존 워크로드는 그대로 유지하면서 거버넌스만 추가.

---

**문제 4.** Terraform IaC 기반으로 신규 계정 + 커스텀 리소스 자동 배포. 어떤 도구?

A) CfCT
B) AFT (Account Factory for Terraform)
C) Account Factory만
D) CDK

**정답: B**
해설: AFT가 Terraform 기반 GitOps. CfCT는 CloudFormation 기반. CDK는 Cloud Development Kit으로 별도 도구.

---

**문제 5.** Landing Zone에서 표준 설정에서 벗어난 변경이 발생. 무엇이 감지?

A) GuardDuty
B) Control Tower Drift Detection
C) Security Hub
D) Trusted Advisor

**정답: B**
해설: Control Tower Drift Detection이 매 시간 baseline과 실제 상태를 비교. 차이 발견 시 콘솔 알림 + Lambda로 자동 복구 트리거 가능. CloudFormation StackSet drift + 별도 Lambda 모니터링 조합.

---

**문제 6.** Control Tower의 Detective 가드레일은 어떤 서비스 기반?

A) SCP
B) AWS Config Rule
C) CloudFormation Hook
D) WAF Rule

**정답: B**
해설: Detective = Config Rule, Preventive = SCP, Proactive = CFN Hook. 세 가드레일의 백엔드 서비스를 정확히 매핑해야 함.

---

**문제 7.** 한 핀테크가 1년에 200개 신규 마이크로서비스 계정을 만든다. GitOps + Terraform 사용. 가장 적합한 자동화는?

A) Account Factory 콘솔 200번 클릭
B) AFT + Git Repo + CodePipeline
C) Lambda + CreateAccount API
D) CloudFormation StackSets

**정답: B**
해설: AFT의 GitOps 흐름이 적합. PR 머지 → 자동 계정 생성 + 베이스라인 적용. Capital One·HashiCorp 등 대형 조직 표준. C는 자체 구현이라 운영 부담 큼.

---

**문제 8.** Control Tower에서 OU를 만들 때 Organizations 콘솔에서 직접 만들면?

A) 정상 동작
B) Control Tower 인식 못함 → 가드레일 자동 부착 안 됨, "unregistered OU"로 표시
C) 즉시 에러
D) Account Factory 동작 안 함

**정답: B**
해설: Control Tower 인식 못 함. Control Tower 콘솔에서 OU 생성해야 "registered OU"로 등록되어 가드레일 자동 적용. 자주 나오는 함정.
