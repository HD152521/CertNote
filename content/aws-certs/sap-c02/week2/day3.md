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

## 아키텍처 다이어그램: Landing Zone에서 로그와 신호가 흐르는 경로

Control Tower가 "1시간 만에 구축한다"는 것의 실체는 아래 배선이다. 이 그림을 머리에 넣어두면 시험에서 "어느 계정에 무엇이 있어야 하는가" 유형이 즉시 풀린다.

```
                     ┌──────────────────────────────┐
                     │   Management Account         │
                     │   - Organizations / SCP      │
                     │   - Control Tower 제어 평면   │
                     │   - IAM Identity Center       │
                     │   ※ 워크로드 배포 금지        │
                     └───────────┬──────────────────┘
                                 │ Org Trail / StackSets / SCP 부착
        ┌────────────────────────┼─────────────────────────┐
        │                        │                         │
┌───────▼────────┐      ┌────────▼─────────┐     ┌─────────▼──────────┐
│  Core OU        │      │  Custom OU:       │     │  Custom OU:        │
│                 │      │  Infrastructure   │     │  Workloads         │
│ ┌─────────────┐ │      │                   │     │  ┌──────────────┐  │
│ │Log Archive  │◄├──────┼── CloudTrail ─────┼─────┼──┤ Prod 계정 N  │  │
│ │ S3(Object   │ │      │   Config 스냅샷    │     │  └──────────────┘  │
│ │ Lock, WORM) │◄├──────┼───────────────────┼─────┼──┐               │
│ └─────────────┘ │      │                   │     │  │ ┌────────────┐│
│ ┌─────────────┐ │      │  Network 계정      │     │  └─┤NonProd 계정││
│ │Audit        │ │      │  (TGW·DNS·DX)     │     │    └────────────┘│
│ │ SecurityHub │◄├──────┼── 탐지 결과 집계 ──┼─────┼──────────────────┘
│ │ GuardDuty   │ │      │                   │     │
│ │ SNS 알림 허브│ │      └───────────────────┘     └────────────────────┘
│ └─────────────┘ │
└─────────────────┘

  ▼ 데이터의 방향성 (시험 포인트)
  로그·증적  → 항상 Log Archive 로 단방향 (WORM, 읽기만)
  탐지 결과  → 항상 Audit 로 집계 (Delegated Admin)
  정책·배포  → 항상 Management 에서 아래로 (SCP·StackSets)
  ※ 반대 방향은 존재하지 않는다. Log Archive가 다른 계정을 제어하지 않는다.
```

> 🔍 **더 깊이**: 이 구조가 **책임 분리(Separation of Duties)**를 인프라로 강제한다는 점이 핵심이다. 로그를 만드는 주체(워크로드 계정)와 로그를 보관하는 주체(Log Archive)와 로그를 보고 판단하는 주체(Audit)가 서로 다른 계정에 있다. 워크로드 계정이 침해돼도 그 계정의 자격증명으로는 Log Archive의 S3 객체를 지울 수 없다 — 계정 경계 + Object Lock의 이중 방어. 회계에서 "기표하는 사람과 승인하는 사람을 분리하라"는 원칙(SOX 404)을 클라우드 계정 구조로 옮긴 것이다.

> ⚠️ **함정**: Audit 계정을 "보안팀이 쓰는 만능 계정"으로 오해하면 안 된다. Audit 계정은 GuardDuty·Security Hub의 **Delegated Administrator** 역할과 알림 허브 역할만 한다. 보안팀이 실제 조사·포렌식을 하는 공간은 별도의 Security Tooling 계정으로 또 나누는 게 AWS SRA 권장이다. 시험에서 "포렌식 이미지를 어디에 둘까"는 Audit이 아니라 별도 격리 계정이 정답 방향이다.

## 트레이드오프 비교표: Landing Zone을 만드는 4가지 경로

"거버넌스를 자동화하라"는 같은 요구에도 네 가지 답이 있다. 어느 것이 정답인지는 **한정어**가 결정한다.

| 경로 | 구축 속도 | 운영 부담 | 커스터마이징 자유도 | 규제 대응 | 적합한 상황 |
|------|-----------|-----------|---------------------|-----------|--------------|
| **AWS Control Tower** | 가장 빠름(수 시간) | **가장 낮음** (AWS 관리형) | 낮음 (AFC·CfCT 필요) | 표준 규제 충분 | 대부분의 조직, 기본 선택 |
| **Control Tower + AFT/CfCT** | 빠름 | 낮음~중간 | 중간 | 표준 + 사내 표준 | IaC 파이프라인 보유 조직 |
| **Landing Zone Accelerator (LZA)** | 중간(구성 파일 작성 필요) | 중간 | **높음** (YAML 구성으로 전면 제어) | **강함** (공공·금융·GovCloud) | 엄격 규제·특수 파티션 |
| **직접 구축(Org+SCP+StackSets)** | 가장 느림(수개월) | **가장 높음** | 완전 자유 | 자체 책임 | CT 미지원 요건이 있을 때만 |

> 💡 **암기 팁**: **"기본은 Control Tower, 규제가 특수하면 LZA, IaC 흐름이면 AFT/CfCT, 직접 구축은 최후."** 시험에서 직접 구축이 정답인 경우는 거의 없다. "LEAST operational overhead"라는 한정어가 붙으면 Control Tower가 사실상 확정이다.

> 🔍 **더 깊이**: LZA(Landing Zone Accelerator on AWS)는 AWS Solutions로 제공되는 배포 가능한 구현체다. CloudFormation과 구성 파일(YAML) 기반이라 네트워크 토폴로지·중앙 로깅·보안 서비스 구성을 코드로 전면 선언할 수 있다. Control Tower가 "정해진 좋은 기본값"이라면 LZA는 "규제 요건에 맞춰 전부 명시하는 골격"이다. 둘은 배타적이지 않아서, Control Tower 위에 LZA를 얹어 추가 구성을 코드로 관리하는 조합도 실무에서 쓰인다. 시험 맥락에서 LZA는 GovCloud·공공·고규제 키워드와 함께 등장한다.

## 운영 중인 Org에 Control Tower를 얹는 순서

"이미 40개 계정이 돌아가고 있다. 여기에 Landing Zone을 도입하라." — Pro 시험에서 가장 자주 나오는 전환 시나리오다. 순서와 각 단계의 근거를 알아야 한다.

```
1단계  사전 점검 (Assessment)
   ├── Management 계정에 워크로드가 있는지 확인 → 있으면 먼저 이전
   ├── 각 계정의 기존 AWS Config recorder / delivery channel 조사
   ├── 기존 CloudTrail trail·S3 버킷·KMS 키 인벤토리 작성
   └── 근거: Control Tower가 만들려는 리소스와 기존 리소스가 충돌하면
             랜딩존 배포 자체가 실패한다. 충돌 지점을 먼저 정리해야 한다.

2단계  Landing Zone 배포 (기존 Org 위에)
   ├── 홈 리전 선택 (되돌리기 어려우므로 신중히)
   ├── Log Archive·Audit 계정은 신규 생성 (기존 계정 재사용은 지양)
   ├── 기존 OU·계정은 아직 등록하지 않은 상태로 남는다
   └── 근거: 코어 계정을 새로 만들어야 baseline이 깨끗하다.
             기존 계정을 코어로 쓰면 잔여 설정이 drift로 계속 잡힌다.

3단계  OU 등록 (Register OU)
   ├── 위험이 낮은 OU부터: Sandbox → Non-Prod → Prod 순
   ├── 등록 시 그 OU의 모든 계정에 가드레일이 일괄 부착된다
   └── 근거: 가드레일이 붙는 순간 기존 워크로드가 막힐 수 있다.
             폭발 반경이 작은 OU에서 먼저 부작용을 확인한다.

4단계  기존 계정 등록 (Enroll Account)
   ├── 대상 계정에 AWSControlTowerExecution 역할이 있어야 등록 가능
   ├── 기존 Config recorder가 있으면 사전 정리
   ├── 계정 단위로 하나씩, 등록 후 애플리케이션 헬스 체크
   └── 근거: 등록은 계정에 baseline(CloudTrail·Config·IAM Role)을
             밀어 넣는 작업이다. 일괄 처리하면 실패 원인 추적이 불가능해진다.

5단계  커스터마이징 계층 얹기
   ├── AFT 또는 CfCT를 연결해 사내 표준(VPC stub·태그·추가 IAM) 자동화
   ├── Account Factory Customization(AFC)으로 신규 계정 청사진 정의
   └── 근거: 표준화가 자동으로 강제되지 않으면 몇 달 안에 drift가 쌓인다.

6단계  운영 정착
   ├── Drift 알림 → 티켓 → 수정 PR 파이프라인 구성
   ├── 랜딩존 버전 업데이트 정례화 (분기 1회 등)
   └── 근거: Control Tower는 버전이 올라간다. 방치하면 신규 컨트롤을 못 받는다.
```

> ⚠️ **함정**: 2단계의 **홈 리전 선택**은 되돌리기가 매우 어렵다. Control Tower의 제어 평면·기본 로그 적재 지점이 홈 리전에 고정되기 때문이다. 데이터 주권 요건이 있는 조직이 임시로 us-east-1에 랜딩존을 만들었다가 ap-northeast-2로 옮기려면 사실상 랜딩존 재구축에 가깝다. 시험에서도 "홈 리전을 나중에 바꾼다"는 보기는 오답 방향으로 취급한다.

> 📚 **사례**: 기존 Org에 Control Tower를 도입하는 프로젝트에서 가장 흔한 지연 원인은 기술이 아니라 **기존 Config·CloudTrail 정리**다. 여러 팀이 각자 만든 trail과 Config recorder가 계정마다 다르게 남아 있어, 인벤토리를 만드는 데만 몇 주가 걸린다. 그래서 실무 팀은 1단계에서 `aws configservice describe-configuration-recorders`와 `aws cloudtrail describe-trails`를 전 계정에 StackSet이나 스크립트로 일괄 실행해 표를 먼저 만든다. "도입 전 인벤토리"가 전체 일정의 절반을 좌우한다.

## 컨트롤을 코드로 다루기: API와 CLI 실물

가드레일(현재 공식 명칭은 **컨트롤, Control**)은 콘솔 클릭이 아니라 API로 관리하는 게 표준이다. 컨트롤은 고유 식별자 ARN을 가진다.

```bash
# 특정 OU에 컨트롤 활성화
# targetIdentifier = OU의 ARN, controlIdentifier = 컨트롤의 ARN
aws controltower enable-control \
  --control-identifier \
    "arn:aws:controltower:ap-northeast-2::control/AWS-GR_RESTRICT_ROOT_USER" \
  --target-identifier \
    "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-abcd-11111111"

# 비동기 작업이므로 operationIdentifier로 상태 폴링
aws controltower get-control-operation \
  --operation-identifier 55555555-6666-7777-8888-999999999999

# 특정 OU에 현재 켜져 있는 컨트롤 전체 조회 (감사 증적으로 자주 쓰임)
aws controltower list-enabled-controls \
  --target-identifier \
    "arn:aws:organizations::111111111111:ou/o-exampleorgid/ou-abcd-11111111"

# 컨트롤 해제 (Mandatory 컨트롤은 해제 불가 — 에러 반환)
aws controltower disable-control \
  --control-identifier \
    "arn:aws:controltower:ap-northeast-2::control/AWS-GR_RESTRICT_ROOT_USER" \
  --target-identifier "arn:aws:organizations::111111111111:ou/..."
```

Detective 컨트롤이 실제로 무엇을 보는지는 그 백엔드인 Config Rule을 직접 보면 명확해진다. 아래는 "EBS 볼륨이 암호화되어 있는가"를 평가하는 관리형 규칙의 실물 정의다.

```json
{
  "ConfigRuleName": "encrypted-volumes-conformance",
  "Description": "연결된 EBS 볼륨이 암호화되어 있는지 평가한다",
  "Scope": {
    "ComplianceResourceTypes": ["AWS::EC2::Volume"]
  },
  "Source": {
    "Owner": "AWS",
    "SourceIdentifier": "ENCRYPTED_VOLUMES"
  },
  "InputParameters": "{}",
  "MaximumExecutionFrequency": "TwentyFour_Hours"
}
```

> 🔍 **더 깊이**: 위 JSON에서 `MaximumExecutionFrequency`가 Detective 가드레일의 **탐지 지연**을 결정한다. 구성 변경 트리거 방식(configuration change trigger)이면 리소스가 바뀌는 즉시 평가되지만, 주기 트리거(periodic)면 최대 그 주기만큼 늦게 탐지된다. 시험에서 "즉시 탐지해야 한다"는 요구가 있으면 주기 평가에만 의존하는 보기는 오답이고, EventBridge로 실시간 이벤트를 잡거나 Preventive(SCP)로 아예 막는 쪽이 정답 방향이다.

## 한정어가 바뀌면 답이 달라진다

"모든 계정에서 비암호화 EBS를 없애라"라는 하나의 요구에, 한정어만 바꿔 보자.

| 한정어 | 정답 방향 | 왜 |
|--------|-----------|-----|
| **LEAST operational overhead** | Control Tower의 관리형 컨트롤 활성화 | 규칙 작성·배포·업데이트를 AWS가 담당. 계정이 늘어도 추가 작업 0 |
| **MUST be blocked before deployment** | **Proactive** (CloudFormation Hook) | IaC 배포 파이프라인 단계에서 거부. 리소스가 아예 생성되지 않음 |
| **MUST be blocked at API call** | **Preventive** (SCP) | 콘솔·CLI·SDK 어느 경로든 API 시점에 차단 |
| **Identify existing non-compliant resources** | **Detective** (Config Rule + Aggregator) | 예방 정책은 기존 리소스를 보지 못한다 |
| **MOST cost-effective** | SCP 중심 + Config 규칙 최소화 | Config는 구성 항목 기록·규칙 평가 단위로 과금. SCP는 추가 과금 없음 |
| **MOST comprehensive / 감사 대응** | 3중(Proactive+Preventive+Detective) | 예방과 증적을 동시에 요구할 때는 한 축만으로 부족 |

> 💡 **암기 팁**: **"Before deploy = Proactive, At API = Preventive, After the fact = Detective."** 세 단어(before / at / after)만 지문에서 찾으면 가드레일 종류가 결정된다.

> ⚠️ **함정**: "MOST cost-effective"가 붙었는데 Detective 가드레일을 대량으로 켜는 보기를 고르면 틀린다. Control Tower 자체에는 별도 요금이 없지만, 그 아래에서 동작하는 **AWS Config**는 기록되는 구성 항목 수와 규칙 평가 수에 비례해 과금된다. 계정이 100개면 이 비용이 무시할 수 없다. 그래서 비용 한정어가 붙으면 "SCP로 막을 수 있는 것은 SCP로 막고, Config는 꼭 필요한 규칙만"이 정답 방향이다.

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
