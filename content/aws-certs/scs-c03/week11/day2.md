# Day 2 - Control Tower와 랜딩 존: 가드레일(예방/탐지), 계정 팩토리, 규정 준수 베이스라인

Organizations와 SCP를 손으로 조립하면 OU 설계, 로그 계정, CloudTrail 조직 추적, Config 집계, SCP 세트, 신규 계정 부트스트랩을 전부 직접 코딩해야 한다. **AWS Control Tower**는 이 모든 것을 *모범 사례 기반의 랜딩 존(Landing Zone)*으로 자동 구성·운영해 주는 거버넌스 오케스트레이터다. 보안 시험에서 Control Tower는 "다계정 보안 베이스라인을 어떻게 일관되게 깔고 유지하느냐"의 답으로 등장하며, 핵심 개념은 **가드레일(컨트롤)**, **계정 팩토리**, **드리프트 탐지**다.

## 랜딩 존: 미리 짜인 멀티계정 토대

Control Tower를 켜면 자동으로 다음이 구성된다:

```
관리 계정 (Control Tower 오케스트레이션)
├── OU: Security
│   ├── 계정: Audit       (Security Hub/GuardDuty 집계, 교차계정 감사 역할)
│   └── 계정: Log Archive (조직 CloudTrail/Config 로그 불변 보관)
└── OU: Sandbox (또는 Workloads)
    └── 등록·신규 생성 계정들
```

- **조직 CloudTrail**: 모든 계정에 자동 적용, 로그는 Log Archive 계정의 S3로 집계.
- **AWS Config**: 모든 등록 계정·리전에서 활성화, 스냅샷은 Log Archive로.
- **중앙 집계**: Audit 계정에 교차계정 감사 역할(AWSControlTowerExecution 등)이 배치된다.
- **IAM Identity Center(구 SSO)**: 사용자·권한 집합(permission set)으로 다계정 로그인 일원화.

랜딩 존은 *버전*을 가진다. AWS가 베이스라인을 갱신하면 랜딩 존 업데이트로 모든 계정에 새 베이스라인을 재적용한다.

> 💡 **관련 이론**: 이것은 *Policy as a managed baseline*이며, 보안 공학의 *secure-by-default* 원칙의 조직 구현이다. 신규 계정이 "기본적으로 안전한 상태"로 태어나게 하면, 사람이 매번 보안 설정을 기억해서 적용하는 데서 오는 누락(human error)을 구조적으로 제거한다. CIS Controls의 "Secure Configuration"을 자동으로 강제하는 셈이다.

### 랜딩 존을 구성하는 실제 부품들

Control Tower가 "자동으로 깔아 준다"는 말 뒤에는 구체적인 리소스가 있다. 이것을 알아야 드리프트와 장애를 해석할 수 있다.

```
[ Control Tower가 실제로 만드는 것 ]

관리 계정
 ├─ AWS Organizations (없으면 새로 생성, 있으면 기존 조직 채택)
 ├─ Control Tower가 소유하는 SCP 세트 (aws-guardrails-* 이름)
 ├─ 조직 CloudTrail (다중 리전, 로그 파일 검증 ON)
 ├─ IAM Identity Center 인스턴스 + 기본 권한 집합
 │    (AWSAdministratorAccess / AWSReadOnlyAccess / AWSSecurityAuditors ...)
 └─ Service Catalog 포트폴리오 = 계정 팩토리 제품

각 등록 계정
 ├─ AWSControlTowerExecution 역할  ← 관리 계정에서 신뢰, 베이스라인 적용용
 ├─ AWSControlTowerAdmin / ConfigAggregator 역할
 ├─ AWS Config 레코더 + 딜리버리 채널 (거버넌스 리전 전부)
 └─ CloudTrail/Config 로그 → Log Archive 계정 S3

Log Archive 계정
 ├─ aws-controltower-logs-<acct>-<region> (조직 로그 집계)
 └─ aws-controltower-s3-access-logs-...   (버킷 액세스 로그)

Audit 계정
 ├─ AWSControlTowerBlueprintAccess / 교차계정 감사 역할
 └─ 알림용 SNS 주제 (aws-controltower-*)
```

**홈 리전(Home Region)과 거버넌스 리전**이라는 개념도 중요하다. Control Tower를 처음 설정한 리전이 홈 리전이며, 이후 변경할 수 없다. 그리고 어떤 리전을 "거버넌스 대상"으로 삼을지 선택하는데, 거버넌스 리전에서만 Config 레코더가 켜지고 탐지 컨트롤이 평가된다. 거버넌스 밖 리전은 **탐지의 사각지대**가 되므로, 여기에는 리전 거부(Region Deny) 컨트롤을 걸어 사용 자체를 막는 것이 정석이다. "리전을 늘리면 Config 비용이 늘어난다"는 이유로 거버넌스 리전을 줄여 놓고 그 리전을 차단하지 않으면, 공격자가 감시 없는 리전에서 조용히 리소스를 만든다.

> ⚠️ **함정**: Control Tower의 Region Deny 컨트롤은 `aws:RequestedRegion` 조건의 SCP로 구현되며, 글로벌 서비스와 Control Tower 자신이 쓰는 API는 예외 처리된다. 여기에 조직이 직접 만든 리전 잠금 SCP까지 중복으로 붙이면 예외 목록이 서로 어긋나 콘솔이 깨지는 사고가 흔하다. **리전 통제는 한 곳에서 관리한다**는 원칙을 세우고, Control Tower를 쓴다면 그 컨트롤을 정본으로 삼는 것이 안전하다.

## 가드레일(컨트롤): 예방 / 탐지 / 능동

Control Tower의 거버넌스는 **컨트롤(과거 명칭 가드레일)**로 표현된다. 세 종류가 있다.

**1) 예방적 컨트롤(Preventive)** — SCP로 구현. 위반 행위를 *애초에 막는다*. 결과는 즉시 차단(deny)이다.

```json
{
  "Sid": "GRDISALLOWS3UNENCRYPTED",
  "Effect": "Deny",
  "Action": "s3:PutObject",
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption": ["AES256", "aws:kms"]
    },
    "Null": { "s3:x-amz-server-side-encryption": "false" }
  }
}
```

**2) 탐지적 컨트롤(Detective)** — AWS Config 규칙으로 구현. 이미 만들어진 리소스가 규정을 어기는지 *지속 평가*하고 비준수(NON_COMPLIANT)로 표시한다. 차단하지 않고 *알린다*.

```yaml
# Config 규칙 예: EBS 볼륨 암호화 여부 탐지
ConfigRule:
  Source: AWS
  Identifier: ENCRYPTED_VOLUMES
  Scope: AWS::EC2::Volume
  # 비준수 시 Audit 계정 대시보드/Security Hub에 표시
```

**3) 능동적 컨트롤(Proactive)** — CloudFormation Hooks로 구현. 리소스가 *프로비저닝되기 전에* IaC 단계에서 규정을 검사해, 비준수 리소스가 배포 시도조차 못 하게 한다(예방과 탐지 사이의 "배포 게이트").

컨트롤은 **거버넌스 수준**으로 분류된다:
- **Mandatory(필수)**: Control Tower가 항상 적용, 해제 불가(예: CloudTrail 로그 무결성, Config 비활성화 금지).
- **Strongly recommended(강력 권장)**: AWS 모범 사례, 켜기 권장.
- **Elective(선택)**: 조직 필요에 따라 선택.

### 세 유형을 한 표로

시험은 "이 요구를 만족하는 컨트롤 유형은?"을 반복해서 묻는다. 판별의 축은 **차단이 일어나는 시점**이다.

| 축 | 예방(Preventive) | 탐지(Detective) | 능동(Proactive) |
|---|---|---|---|
| 구현 기술 | SCP | AWS Config 규칙 | CloudFormation Hooks |
| 개입 시점 | API 호출 순간 | 리소스 생성 **후** 지속 평가 | IaC 배포 **직전**(스택 프로비저닝 전) |
| 결과 | `AccessDenied`로 차단 | COMPLIANT / NON_COMPLIANT 표시 | 스택 배포 실패 |
| 기존 리소스 | 영향 없음(앞으로의 호출만) | 평가 대상 | 영향 없음 |
| 콘솔 수동 생성 | 막음 | 사후 탐지 | **막지 못함**(CFN 경로만) |
| 대표 예 | 리전 잠금, 루트 차단, 비암호화 PutObject 거부 | EBS 미암호화 볼륨 탐지, 0.0.0.0/0 SSH 탐지 | 미암호화 RDS를 정의한 템플릿 배포 거부 |
| 비용 | 없음 | Config 평가·기록 비용 | 없음 |

여기서 결정적인 구분은 마지막에서 두 번째 행이다. **능동 컨트롤은 CloudFormation 경로로 들어오는 배포만 검사한다.** 사용자가 콘솔이나 CLI로 직접 리소스를 만들면 능동 컨트롤은 아무것도 하지 못한다. "IaC 파이프라인에서 비준수 리소스를 조기에 걸러 개발자 피드백을 빠르게 하고 싶다"가 능동 컨트롤의 정확한 용도이고, "어떤 경로로 만들든 무조건 막아야 한다"면 답은 예방(SCP)이다. 이 둘을 바꿔 놓은 보기가 자주 나온다.

> 🔍 **더 깊이**: 세 유형은 경쟁 관계가 아니라 *비용과 커버리지의 트레이드오프*로 조합된다. SCP는 공짜이고 확실하지만 표현력이 제한적이다 — 조건 키가 지원되지 않는 액션은 아예 통제할 수 없고, "생성 후 변경된 상태"는 볼 수 없다. Config는 무엇이든 평가할 수 있지만 평가 건수만큼 비용이 들고 사후 대응이다. 능동 컨트롤은 개발 루프 초반에 피드백을 주어 가장 저렴하게 실수를 고치지만 우회 가능하다. 성숙한 조직은 *능동으로 빠르게 알리고, 예방으로 확실히 막고, 탐지로 남은 구멍을 메우는* 3중 배치를 쓴다. 이것이 보안 공학에서 말하는 shift-left와 defense-in-depth의 결합이다.

> 🎯 **시나리오**: 규제팀이 "모든 RDS 인스턴스는 반드시 저장 시 암호화되어야 하고, 위반은 배포 전에 개발자에게 알려야 하며, 콘솔로 우회 생성하는 것도 막아야 하고, 이미 존재하는 미암호화 인스턴스의 목록도 필요하다"고 요구했다. 어떤 컨트롤 조합인가. → 하나로 끝나지 않는다. ① **능동 컨트롤(CFN Hooks)** 로 IaC 배포 단계에서 미암호화 템플릿을 거부해 개발자에게 빠른 피드백을 준다. ② **예방 컨트롤(SCP)** 로 `rds:CreateDBInstance` 시 `rds:StorageEncrypted` 조건이 거짓이면 Deny해 콘솔·CLI 우회를 막는다. ③ **탐지 컨트롤(Config `rds-storage-encrypted`)** 로 기존 리소스를 평가해 비준수 목록을 만든다. 보기에서 하나만 고르게 유도하면 요구사항 중 어떤 항목이 남는지를 따져 답을 가른다.

## 컨트롤은 OU에 적용한다

핵심 운영 원칙: **컨트롤은 개별 계정이 아니라 OU 단위로 활성화**한다. 같은 보안 요구를 가진 계정을 OU로 묶고, 그 OU에 컨트롤 세트를 적용하면 신규 계정이 그 OU에 들어오는 순간 자동으로 동일 베이스라인을 받는다.

```
OU: Prod ── 예방(리전 잠금, 루트 차단) + 탐지(암호화·퍼블릭 액세스·MFA)
OU: NonProd ── 완화된 세트(샌드박스 리전 허용)
```

## 계정 팩토리(Account Factory): 표준화된 계정 발급

신규 계정을 콘솔에서 손으로 만들면 베이스라인이 누락된다. **계정 팩토리**는 미리 정의한 *청사진(blueprint)*으로 계정을 발급한다 — 적절한 OU 배치, IAM Identity Center 사용자/권한 집합, 네트워크 베이스라인(VPC), 그리고 OU에 걸린 모든 컨트롤이 자동 상속된다.

```
요청(이름/이메일/OU/네트워크) 
   → 계정 팩토리(Service Catalog 제품) 
   → 신규 계정 + OU 배치 + 컨트롤 상속 + SSO 권한 + CloudTrail/Config 등록
```

대규모로는 **Account Factory for Terraform(AFT)** 또는 Customizations for Control Tower(CfCT)로 계정 발급을 코드화·파이프라인화한다. 발급 직후 커스텀 베이스라인(보안 도구 설치, 태그 강제, 추가 SCP)을 자동 적용하는 것이 모범이다.

> 💡 **관련 이론**: 계정 팩토리는 *Golden Path / Paved Road* 패턴이다. 플랫폼 엔지니어링에서 "표준화된 안전한 경로"를 제공하면 개발자가 그 경로를 벗어나 위험한 설정을 직접 만들 유인이 줄어든다. 보안을 "막는 장벽"이 아니라 "기본으로 깔린 안전한 길"로 바꾸는 접근이다.

## CLI로 이해 굳히기

Control Tower는 콘솔 중심 서비스로 알려져 있지만, 컨트롤 활성화와 랜딩 존 운영에는 API가 있고 시험도 개념 수준에서 이를 전제한다.

```bash
# 1) 랜딩 존 상태 확인
aws controltower list-landing-zones
aws controltower get-landing-zone --landing-zone-identifier <arn>

# 2) 특정 OU에 활성화된 컨트롤 목록
aws controltower list-enabled-controls \
  --target-identifier arn:aws:organizations::111122223333:ou/o-exam/ou-exam-prod

# 3) OU에 컨트롤 활성화 (계정이 아니라 OU가 대상이라는 점에 주목)
aws controltower enable-control \
  --control-identifier arn:aws:controltower:ap-northeast-2::control/AWS-GR_RESTRICTED_SSH \
  --target-identifier arn:aws:organizations::111122223333:ou/o-exam/ou-exam-prod

# 4) 비동기 작업 진행 상황
aws controltower get-control-operation --operation-identifier <op-id>

# 5) 랜딩 존 재적용(드리프트 복구)
aws controltower reset-landing-zone --landing-zone-identifier <arn>

# 6) Control Tower가 소유한 SCP 확인 (aws-guardrails-* 접두)
aws organizations list-policies --filter SERVICE_CONTROL_POLICY \
  --query "Policies[?starts_with(Name, 'aws-guardrails')].[Name,Id]" --output table

# 7) 계정 팩토리 제품을 Service Catalog로 프로비저닝 (AFT/파이프라인이 호출하는 경로)
aws servicecatalog provision-product \
  --product-name "AWS Control Tower Account Factory" \
  --provisioning-artifact-name "AWS Control Tower Account Factory" \
  --provisioned-product-name "acct-payments-prod" \
  --provisioning-parameters \
     Key=AccountName,Value=payments-prod \
     Key=AccountEmail,Value=aws-payments-prod@example.com \
     Key=ManagedOrganizationalUnit,Value=Workloads/Prod \
     Key=SSOUserEmail,Value=platform-team@example.com \
     Key=SSOUserFirstName,Value=Platform \
     Key=SSOUserLastName,Value=Team
```

3번을 눈여겨보자. `--target-identifier`가 **계정 ARN이 아니라 OU ARN**이다. Control Tower의 컨트롤 모델 자체가 OU 단위 부착을 전제로 설계돼 있다는 사실이 API 시그니처에 드러난다.

## 드리프트 탐지(Drift Detection)

랜딩 존은 *선언된 상태*를 갖는다. 누군가 콘솔에서 직접 OU를 옮기거나, SCP를 수정하거나, 계정을 OU 밖으로 빼면 실제 상태가 선언과 어긋난다 — 이를 **드리프트**라 한다. Control Tower는 드리프트를 탐지해 대시보드에 표시하고, 랜딩 존 재적용(repair/re-register)으로 선언 상태로 되돌린다.

흔한 드리프트 원인:
- Control Tower 밖에서 SCP를 수동 편집·삭제
- 관리되는 OU에서 계정을 수동 이동
- 필수 컨트롤이 제공하는 역할·정책을 수동 삭제

드리프트가 있으면 새 컨트롤 적용이나 계정 발급이 막힐 수 있으므로, **Control Tower가 관리하는 리소스는 콘솔에서 직접 손대지 않는다**는 규율이 시험의 핵심 메시지다.

드리프트에는 성격이 다른 두 종류가 있고, 복구 방법도 다르다.

| 구분 | 랜딩 존 수준 드리프트 | 계정 수준 드리프트 |
|---|---|---|
| 예시 | 관리형 SCP 수동 편집·삭제, 핵심 OU 삭제, Log Archive 버킷 정책 변경 | 계정을 관리 OU 밖으로 이동, `AWSControlTowerExecution` 역할 삭제, 계정에서 Config 레코더 중지 |
| 영향 범위 | 조직 전체 — 신규 컨트롤 적용·계정 발급 모두 중단 | 해당 계정만 비준수·베이스라인 갱신 실패 |
| 복구 | 랜딩 존 재적용(Reset/Repair) | 계정 재등록(Re-register / Update account) |
| 예방 수단 | Control Tower 소유 리소스에 대한 변경 권한을 SCP로 제한 | 계정 이동·역할 삭제 액션을 SCP로 제한 |

> 🔍 **더 깊이**: 드리프트가 구조적으로 발생하는 이유는, Control Tower가 **선언적 상태 관리자**인데 그 밑의 Organizations·Config·CloudTrail은 **명령형 API로도 얼마든지 조작 가능한 서비스**이기 때문이다. 관리 평면이 하나가 아니라 둘(콘솔 직접 조작 vs Control Tower)이면 상태는 필연적으로 갈라진다. 그래서 성숙한 운영은 드리프트를 "사후에 고치는 것"이 아니라 **애초에 갈라질 수 없게** 만든다 — Control Tower가 만든 SCP·역할·버킷을 수정·삭제하는 액션 자체를 별도 SCP로 Deny하고, 예외는 특정 플랫폼 자동화 역할에만 준다. 즉 *거버넌스 도구 자신을 거버넌스로 보호*하는 재귀 구조다.

> ⚠️ **함정**: Control Tower가 이미 존재하는 조직을 채택할 때, 기존에 손으로 만든 SCP·CloudTrail·Config가 그대로 남아 충돌하는 경우가 많다. 특히 **계정마다 개별 CloudTrail이 이미 켜져 있으면 조직 CloudTrail과 중복되어 로그와 비용이 두 배**가 된다. 랜딩 존을 세운 뒤에는 기존 개별 추적을 정리하고, Config 레코더도 Control Tower가 관리하는 것 하나만 남겨야 한다. "Control Tower를 켜면 기존 설정이 자동으로 정리된다"는 서술은 틀리다.

## 규정 준수 베이스라인 매핑

Control Tower 컨트롤은 CIS AWS Foundations Benchmark, AWS Well-Architected 보안 기둥, PCI-DSS 등의 통제 항목에 매핑된다. 예:

- **CIS 1.x(IAM)**: 루트 MFA, 루트 액세스 키 금지, MFA 강제 → 탐지 컨트롤 + 예방 SCP.
- **CIS 2.x(로깅)**: CloudTrail 전 리전 활성화·로그 무결성·KMS 암호화 → 필수 컨트롤.
- **CIS 3.x(모니터링)**: 무권한 API·콘솔 로그인 실패 경보 → CloudWatch/Config.
- **CIS 4.x(네트워킹)**: 0.0.0.0/0 인바운드 SSH/RDP 금지 → 탐지 컨트롤.

Control Tower 단독으로 모든 증거를 수집·보고하지는 않으므로, 정식 감사 보고는 다음 날 다루는 **Audit Manager**와 결합한다.

> 📚 **사례**: 2017년은 "공개 S3 버킷의 해"로 불릴 만큼 잘못된 버킷 설정으로 인한 대규모 노출이 연이어 공개된 시기였다. 보안 업체 UpGuard는 통신사 협력사 NICE Systems가 관리하던 버킷에서 수백만 건의 고객 통화 기록이, 컨설팅 기업 Accenture의 버킷에서 내부 인증서·키·인증 자격증명이 인증 없이 접근 가능한 상태였음을 잇달아 보고했다. 공통점은 취약점 익스플로잇이 아니라 **한 사람의 설정 실수**였고, 그 실수를 잡아 줄 조직 차원의 기본값이 없었다는 점이다. AWS의 대응 방향이 정확히 이 강의의 주제와 같다 — 2018년 **S3 Block Public Access**를 계정·버킷 수준 스위치로 도입해 "기본적으로 막힌 상태"를 만들었고, 이후 새 버킷의 퍼블릭 액세스 차단과 기본 암호화가 기본값이 됐다. Control Tower의 필수·강력 권장 컨트롤 상당수가 바로 이런 "사람이 기억해야 했던 설정"을 조직 기본값으로 승격시킨 것이다.

## Control Tower vs 수동 Organizations vs LZA

| 항목 | 수동 Organizations + IaC | Control Tower | Landing Zone Accelerator |
|---|---|---|---|
| OU·로그 계정 설계 | 직접 설계·구현 | 자동(AWS 권장 구조 고정) | 설정 파일로 정의, 고도 커스터마이즈 |
| 조직 CloudTrail/Config | 직접 구성 | 자동 | 설정으로 정의 |
| 가드레일 | SCP/Config 직접 작성 | 큐레이션된 컨트롤 라이브러리 | 커스텀 SCP·Config·NFW까지 코드로 |
| 신규 계정 부트스트랩 | 스크립트 직접 | 계정 팩토리(+AFT) | 파이프라인 내장 |
| 드리프트 관리 | 직접 모니터 | 내장 드리프트 탐지 | 파이프라인 재적용 |
| 규제 특화 구성 | 전부 직접 | 제한적 | 정부·금융·헬스케어용 참조 구성 제공 |
| 도입 속도 | 느림 | 가장 빠름 | 중간(설정 학습 필요) |
| 적합한 상황 | 조직 구조가 매우 특수하거나 이미 성숙한 IaC 보유 | 표준 모범 사례를 빠르게 | 강한 규제 요건 + 깊은 커스터마이즈 동시 필요 |

Control Tower는 일반적 모범 사례를 빠르게 까는 데 강하지만, 매우 특수한 조직 구조나 리전 제약이 있으면 수동 Organizations + IaC가 더 유연할 수 있다. 시험은 보통 "표준 멀티계정 베이스라인을 빠르고 일관되게" → Control Tower로 답을 유도한다. 반대로 "관리 계정에 이미 복잡한 자체 조직 구조가 있고 Control Tower가 요구하는 OU 형태를 받아들일 수 없다"는 제약이 명시되면 수동 구성 + IaC 쪽으로 답이 기운다.

> 🎯 **시나리오**: 인수합병으로 세 개의 별도 AWS 조직(각각 관리 계정 보유)을 하나로 통합해야 한다. 각 조직에는 이미 계정별 CloudTrail과 서로 다른 SCP가 걸려 있다. 보안팀은 통합 후 단일 베이스라인·단일 로그 저장소를 원한다. 어떤 순서로 접근하는가. → ① 하나의 조직을 정본으로 정하고 나머지 계정을 **초대·이관**한다(계정은 조직을 옮길 수 있지만 조직 자체를 병합할 수는 없다). ② 이관 전에 기존 계정별 CloudTrail과 Config 레코더를 목록화한다 — 그대로 두면 조직 추적과 중복되어 비용과 로그가 이중화된다. ③ Control Tower 랜딩 존을 정본 조직에 세우고, 이관한 계정을 **등록(enroll)** 해 베이스라인을 적용한다. 등록 시 `AWSControlTowerExecution` 역할이 없으면 실패하므로 사전 배포가 필요하다. ④ 기존 SCP 중 Control Tower 컨트롤과 중복·충돌하는 것을 제거해 드리프트 유발원을 없앤다. "Control Tower를 켜면 알아서 통합된다"는 보기가 오답인 이유가 여기 있다.

## 함정 정리

- 컨트롤은 *계정*이 아니라 *OU*에 적용해야 신규 계정이 자동 상속한다.
- 예방=SCP(차단), 탐지=Config(평가/알림), 능동=CFN Hooks(배포 전 차단). 헷갈리지 말 것.
- Control Tower 관리 리소스를 콘솔에서 수동 변경하면 *드리프트* 발생 → 재적용 필요.
- 필수(Mandatory) 컨트롤은 해제 불가 — 이를 우회하려 하면 안 된다.
- Control Tower는 베이스라인을 깔지만, 정식 *감사 증거 수집*은 Audit Manager의 몫이다.
- 능동 컨트롤은 *CloudFormation 경로만* 검사한다 — 콘솔·CLI 직접 생성은 막지 못한다.
- 거버넌스 리전 밖은 *Config 평가가 없는 사각지대*다. 쓰지 않을 리전은 Region Deny로 잠근다.
- 홈 리전은 설정 후 변경할 수 없다. 초기 선택이 곧 장기 제약이다.
- 기존 조직을 채택하면 *기존 CloudTrail·Config가 자동 정리되지 않는다* — 중복 로그·중복 비용을 직접 정리해야 한다.
- Control Tower가 만든 SCP·역할·버킷을 손대는 것이 드리프트의 최다 원인이다.

## 한 줄 요약 체크리스트

- [ ] 컨트롤을 계정이 아니라 **OU**에 걸어 신규 계정이 자동 상속하게 했는가
- [ ] 예방(SCP)·탐지(Config)·능동(CFN Hooks)의 개입 시점 차이를 설명할 수 있는가
- [ ] 거버넌스 리전을 정하고, 그 밖의 리전은 Region Deny로 차단했는가
- [ ] 홈 리전 선택이 규제·레이턴시·서비스 가용성 요건과 맞는가(변경 불가)
- [ ] 조직 채택 시 기존 계정별 CloudTrail·Config 중복을 정리했는가
- [ ] Control Tower 소유 리소스(aws-guardrails-*, AWSControlTowerExecution 등) 변경을 SCP로 막았는가
- [ ] 계정 발급을 AFT/CfCT로 코드화하고 발급 후 커스텀 베이스라인을 자동 적용하는가
- [ ] 드리프트 알림을 사람이 받는 경로(SNS/Security Hub)가 실제로 열려 있는가
- [ ] 필수 컨트롤을 우회하려는 시도 대신, 요구를 만족하는 다른 설계를 찾았는가
- [ ] 베이스라인 위에 Audit Manager를 얹어 증거·보고까지 연결했는가

## 📝 연습 문제

**문제 1.** 새로 등록된 워크로드 계정에 회사 보안 베이스라인이 자동 적용되도록 하려 한다. Control Tower에서 가장 적절한 방법은?

A) 각 신규 계정에 컨트롤을 개별 활성화한다  
B) 같은 요구를 가진 계정을 OU로 묶고 그 OU에 컨트롤 세트를 적용해, 계정이 OU에 들어오면 자동 상속되게 한다  
C) 신규 계정마다 SCP를 손으로 붙인다  
D) 관리 계정에만 컨트롤을 적용한다  

**정답: B**  
해설: Control Tower 컨트롤은 OU 단위로 활성화하는 것이 핵심 원칙이다. OU에 컨트롤을 걸면 그 OU에 배치되는 모든 계정(신규 포함)이 베이스라인을 자동 상속하므로 누락이 없다. 계정별 개별 활성화·수동 SCP는 확장성과 일관성이 떨어지고, 관리 계정에만 적용하면 워크로드 계정이 보호되지 않는다.

---

**문제 2.** "S3 객체를 암호화 없이 업로드하는 행위 자체를 차단"하려 한다. 어떤 유형의 컨트롤이며 어떻게 구현되는가?

A) 탐지적 컨트롤 — Config 규칙  
B) 예방적 컨트롤 — SCP로 비암호화 PutObject를 Deny  
C) 능동적 컨트롤 — CloudWatch 경보  
D) 필수 컨트롤 — GuardDuty  

**정답: B**  
해설: "행위 자체를 막는다"는 것은 예방적 컨트롤이며 SCP로 구현된다. 비암호화 헤더 조건의 PutObject를 Deny하면 시도 단계에서 차단된다. 탐지적 컨트롤(Config)은 이미 생성된 리소스를 평가·표시할 뿐 차단하지 않고, CloudWatch 경보는 알림이며, GuardDuty는 위협 탐지 서비스로 이 용도가 아니다.

---

**문제 3.** 운영자가 콘솔에서 Control Tower가 관리하는 OU 밖으로 계정을 옮겼다. 이후 새 컨트롤 적용이 실패한다. 원인과 올바른 대응은?

A) 정상 동작이며 무시한다  
B) 드리프트가 발생한 것 — 랜딩 존/계정을 재적용(re-register/repair)해 선언 상태로 되돌리고, 관리 리소스를 콘솔에서 직접 변경하지 않는다  
C) 컨트롤을 모두 비활성화한다  
D) 관리 계정을 재생성한다  

**정답: B**  
해설: Control Tower가 관리하는 리소스를 콘솔에서 직접 변경하면 선언 상태와 실제 상태가 어긋나는 드리프트가 발생하고, 이는 새 컨트롤 적용·계정 발급을 막을 수 있다. 올바른 대응은 재적용으로 선언 상태를 복구하고, 이후 관리 리소스를 수동으로 손대지 않는 운영 규율을 지키는 것이다. 무시·전체 비활성화·관리 계정 재생성은 모두 부적절하다.

---

**문제 4.** 50개 계정을 코드 기반 파이프라인으로 일관되게 발급하면서 발급 직후 커스텀 보안 베이스라인까지 자동 적용하려 한다. 가장 적절한 접근은?

A) 콘솔에서 계정을 하나씩 생성  
B) Account Factory for Terraform(AFT) 또는 Customizations for Control Tower로 계정 발급을 코드화하고 발급 후 커스터마이징을 파이프라인으로 자동 적용  
C) 루트 사용자로 각 계정에 로그인해 설정  
D) 단일 계정에 모든 워크로드를 통합  

**정답: B**  
해설: 대규모 표준화 발급은 AFT나 CfCT로 계정 팩토리를 코드화하고, 발급 직후 보안 도구 설치·태그·추가 SCP 같은 커스텀 베이스라인을 파이프라인으로 자동 적용하는 것이 모범(Paved Road)이다. 콘솔 수작업과 루트 로그인은 누락·위험이 크고, 단일 계정 통합은 blast radius와 격리 원칙에 어긋난다.

---

**문제 5.** 다음 중 Control Tower의 "필수(Mandatory) 컨트롤"에 대한 설명으로 옳은 것은?

A) 운영자가 언제든 끌 수 있는 선택 항목이다  
B) Control Tower가 항상 적용하며 해제할 수 없고, 로그 무결성·Config 비활성화 금지 등 베이스라인 보호의 핵심이다  
C) PCI 인증을 자동으로 발급해 준다  
D) 워크로드 계정에만 적용되고 보안 계정에는 적용되지 않는다  

**정답: B**  
해설: 필수 컨트롤은 Control Tower가 항상 적용하고 해제할 수 없는 베이스라인 보호로, CloudTrail 로그 무결성·Config 레코더 비활성화 금지 등이 포함된다. 끌 수 있는 것은 선택(Elective)·강력 권장(Strongly recommended) 컨트롤이다. 컨트롤은 인증 발급 도구가 아니며(증거 수집은 Audit Manager), 보안 계정에도 베이스라인이 적용된다.

---
