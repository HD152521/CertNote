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

## 드리프트 탐지(Drift Detection)

랜딩 존은 *선언된 상태*를 갖는다. 누군가 콘솔에서 직접 OU를 옮기거나, SCP를 수정하거나, 계정을 OU 밖으로 빼면 실제 상태가 선언과 어긋난다 — 이를 **드리프트**라 한다. Control Tower는 드리프트를 탐지해 대시보드에 표시하고, 랜딩 존 재적용(repair/re-register)으로 선언 상태로 되돌린다.

흔한 드리프트 원인:
- Control Tower 밖에서 SCP를 수동 편집·삭제
- 관리되는 OU에서 계정을 수동 이동
- 필수 컨트롤이 제공하는 역할·정책을 수동 삭제

드리프트가 있으면 새 컨트롤 적용이나 계정 발급이 막힐 수 있으므로, **Control Tower가 관리하는 리소스는 콘솔에서 직접 손대지 않는다**는 규율이 시험의 핵심 메시지다.

## 규정 준수 베이스라인 매핑

Control Tower 컨트롤은 CIS AWS Foundations Benchmark, AWS Well-Architected 보안 기둥, PCI-DSS 등의 통제 항목에 매핑된다. 예:

- **CIS 1.x(IAM)**: 루트 MFA, 루트 액세스 키 금지, MFA 강제 → 탐지 컨트롤 + 예방 SCP.
- **CIS 2.x(로깅)**: CloudTrail 전 리전 활성화·로그 무결성·KMS 암호화 → 필수 컨트롤.
- **CIS 3.x(모니터링)**: 무권한 API·콘솔 로그인 실패 경보 → CloudWatch/Config.
- **CIS 4.x(네트워킹)**: 0.0.0.0/0 인바운드 SSH/RDP 금지 → 탐지 컨트롤.

Control Tower 단독으로 모든 증거를 수집·보고하지는 않으므로, 정식 감사 보고는 다음 날 다루는 **Audit Manager**와 결합한다.

## Control Tower vs 수동 Organizations

| 항목 | 수동 Organizations | Control Tower |
|---|---|---|
| OU·로그 계정 설계 | 직접 | 자동(권장 구조) |
| 조직 CloudTrail/Config | 직접 구성 | 자동 |
| 가드레일 | SCP/Config 직접 작성 | 큐레이션된 컨트롤 라이브러리 |
| 신규 계정 부트스트랩 | 스크립트 직접 | 계정 팩토리 |
| 드리프트 관리 | 직접 모니터 | 내장 드리프트 탐지 |

Control Tower는 일반적 모범 사례를 빠르게 까는 데 강하지만, 매우 특수한 조직 구조나 리전 제약이 있으면 수동 Organizations + IaC가 더 유연할 수 있다. 시험은 보통 "표준 멀티계정 베이스라인을 빠르고 일관되게" → Control Tower로 답을 유도한다.

## 함정 정리

- 컨트롤은 *계정*이 아니라 *OU*에 적용해야 신규 계정이 자동 상속한다.
- 예방=SCP(차단), 탐지=Config(평가/알림), 능동=CFN Hooks(배포 전 차단). 헷갈리지 말 것.
- Control Tower 관리 리소스를 콘솔에서 수동 변경하면 *드리프트* 발생 → 재적용 필요.
- 필수(Mandatory) 컨트롤은 해제 불가 — 이를 우회하려 하면 안 된다.
- Control Tower는 베이스라인을 깔지만, 정식 *감사 증거 수집*은 Audit Manager의 몫이다.

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
