# Day 2 - Security Hub: 보안 표준(CIS/FSBP), 통합 점수, 핀딩 집계·정규화(ASFF), 자동 대응

탐지기를 여러 개 켜면 곧 새로운 문제가 생긴다 — GuardDuty는 GuardDuty 포맷으로, Inspector는 Inspector 포맷으로, Macie는 또 다른 포맷으로 경보를 쏟아내고, 거기에 IAM·S3·CloudTrail의 설정 점검 결과까지 더해지면 운영자는 "지금 우리 계정이 안전한가?"라는 단 하나의 질문에 답할 수 없게 된다. **AWS Security Hub**는 이 파편화를 해결하는 집계·정규화·점수화 평면이다. 보안 시험에서 Security Hub의 본질은 "탐지를 *하는* 도구"가 아니라 "여러 탐지기의 결과를 *모으고 표준화하고 우선순위화하는* 메타 도구"라는 점이다.

## Security Hub의 세 가지 일

Security Hub가 하는 일은 명확히 셋으로 나뉜다.

1. **보안 표준 점검(Security Standards)**: 계정·리소스 설정을 모범 기준(CIS, FSBP, PCI DSS, NIST 등)과 자동으로 대조해 합격/불합격 컨트롤을 만든다. 내부적으로 **AWS Config** 규칙을 사용한다.
2. **핀딩 집계·정규화(Aggregation)**: GuardDuty, Inspector, Macie, IAM Access Analyzer, Firewall Manager 등 통합 서비스와 서드파티의 핀딩을 **ASFF**라는 단일 포맷으로 받아 한곳에 모은다.
3. **자동 대응(Automation)**: 핀딩을 EventBridge로 흘려보내거나 Automation Rule로 자동 처리·억제한다.

> ⚠️ **함정**: "Security Hub가 위협을 탐지한다"는 표현은 부정확하다. 위협 *탐지*는 GuardDuty가, 취약점 *스캔*은 Inspector가, 민감데이터 *발견*은 Macie가 한다. Security Hub는 이들의 결과를 *집계*하고, 별도로 *설정 점검(컴플라이언스)*을 수행한다. 시험에서 "실시간 악성 행위 탐지"를 물으면 GuardDuty, "여러 보안 서비스 결과를 한 대시보드로"를 물으면 Security Hub다.

이 세 가지 중 오늘 무게를 싣는 곳은 **1번과 3번**이다. 2번(핀딩 집계와 ASFF 스키마의 해부, 다계정 탐지 베이스라인)은 week9에서 탐지 서비스들을 다 배운 뒤 한 그림으로 묶는다. 오늘의 질문은 다르다 — **"우리 계정의 구성이 기준에 맞는가"를 어떻게 지속적으로 측정하고, 그 측정값을 어떻게 조직 전체에 강제하며, 쏟아지는 컨트롤 핀딩을 어떻게 운영 가능한 크기로 유지하는가.**

```
[ 표준 점검 파이프라인: 구성이 점수가 되는 경로 ]

  리소스 변경                구성 기록              컨트롤 평가            집계·표현
 ┌──────────┐          ┌───────────────┐      ┌──────────────┐    ┌──────────────┐
 │ S3 버킷   │          │  AWS Config   │      │ Security Hub │    │ 컨트롤 핀딩   │
 │ IAM 정책  │──변경──▶ │  구성 레코더   │──▶  │ 표준 컨트롤   │──▶ │ (ASFF +      │
 │ SG/EC2   │          │ (리소스 스냅샷)│      │ = Config 규칙 │    │  Compliance) │
 └──────────┘          └───────────────┘      └──────────────┘    └──────┬───────┘
       ▲                       ▲                                          │
       │                       │                                          ▼
       │              **여기가 꺼져 있으면**                      ┌──────────────┐
       │              **아래 전부가 조용히 멈춘다**               │ 보안 점수(%)  │
       │                                                          │ 추세로 관리   │
  교정(remediation) ◀──────── EventBridge ──── 자동화 ◀───────────└──────────────┘
```

이 그림의 왼쪽 위에서 오른쪽 아래로 한 번 흐르고, 다시 왼쪽 아래로 되돌아오는 **닫힌 고리**라는 점이 중요하다. 태세 관리는 "측정 → 표시"로 끝나지 않는다. 측정값이 교정으로 되돌아오지 않으면 점수는 6개월 뒤에도 같은 자리에 있다.

> 📚 **사례**: 2017년 전후로 S3 버킷이 잘못 공개 설정되어 데이터가 노출된 사건이 여러 조직에서 반복적으로 보도됐다. 흥미로운 점은 이 사건들의 원인이 대부분 *취약점*이 아니라 **구성**이었다는 것이다 — 소프트웨어에 결함이 있었던 것이 아니라, 버킷 하나의 설정이 의도와 달랐다. AWS는 이후 계정 수준 퍼블릭 액세스 차단(Block Public Access)을 도입했고, 이후 새 버킷에 대해 퍼블릭 액세스 차단과 ACL 비활성화를 기본값으로 바꾸는 방향으로 이동했다. 이 흐름이 태세 관리라는 분야가 왜 존재하는지를 그대로 보여준다. **공격이 없어도 위험은 존재하고, 그 위험은 대개 "누군가 설정을 잘못했다"는 형태를 띤다.** 표준 컨트롤은 그 잘못된 설정을 사람이 발견하기 전에 기계가 먼저 세는 장치이며, 기본값의 변경은 애초에 잘못 설정할 수 없게 만드는 더 강한 장치다. 시험이 "예방적 통제와 탐지적 통제 중 무엇이 우선인가"를 물을 때의 답이 여기에 있다.

## 보안 표준: CIS vs FSBP

Security Hub가 제공하는 주요 표준 두 가지를 비교하면 차이가 선명하다.

| 표준 | 성격 | 출처 |
|------|------|------|
| **CIS AWS Foundations Benchmark** | 외부 컨센서스 기반 핵심 베이스라인(루트 MFA, CloudTrail 다중리전, 위험 알람 등) | Center for Internet Security |
| **AWS Foundational Security Best Practices (FSBP)** | AWS가 직접 정의한 폭넓은 서비스별 모범 사례 | AWS |
| **PCI DSS** | 카드 데이터 환경 컴플라이언스 | PCI SSC |
| **NIST SP 800-53** | 미국 연방 보안 통제 | NIST |

- **CIS**는 "최소한 이건 지켜라" 수준의 좁고 핵심적인 베이스라인이다.
- **FSBP**는 EC2, S3, RDS, Lambda 등 서비스 전반에 걸친 *넓은* 점검이라 컨트롤 수가 훨씬 많다.

각 컨트롤은 AWS Config 규칙으로 평가되므로, **AWS Config가 활성화되어 있어야** 표준 컨트롤이 동작한다. 이게 핵심 의존성이다.

```bash
# Security Hub 활성화 (기본 표준 자동 활성화 비활성화하고 명시적으로 켤 수도 있음)
aws securityhub enable-security-hub --enable-default-standards

# 특정 표준 구독
aws securityhub batch-enable-standards \
  --standards-subscription-requests \
    StandardsArn=arn:aws:securityhub:ap-northeast-2::standards/aws-foundational-security-best-practices/v/1.0.0

# 지금 이 리전에서 고를 수 있는 표준 목록 확인
aws securityhub describe-standards \
  --query 'Standards[].{Name:Name,Arn:StandardsArn,Managed:EnabledByDefault}' --output table

# 구독 중인 표준과 상태
aws securityhub get-enabled-standards \
  --query 'StandardsSubscriptions[].{Arn:StandardsArn,Status:StandardsStatus}'
```

> 💡 **관련 이론**: Security Hub의 표준 점검은 "탐지적 통제(detective control)"이자 "지속적 컴플라이언스(continuous compliance)"의 구현이다. 전통적으로 컴플라이언스 감사는 분기·연 단위 스냅샷이었지만, Config 규칙 기반 점검은 리소스 변경마다 재평가하는 *연속 감사*다. 이는 NIST의 Continuous Monitoring(CM) 개념과 직결된다. 시험에서 "지속적으로 컴플라이언스 상태를 추적"하면 Config + Security Hub 표준이 정답 축이다.

### 어느 표준을 켤 것인가: 선택의 축

표준을 전부 켜면 컨트롤이 중복되고 핀딩이 몇 배로 늘어난다. 반대로 하나만 켜면 사각지대가 남는다. 실무의 선택 기준은 **"이 표준이 답하려는 질문이 무엇인가"**다.

| 표준 | 답하려는 질문 | 범위 | 켜는 시점 |
|------|--------------|------|-----------|
| **CIS AWS Foundations** | "최소한의 기본기를 지켰는가" | 좁고 깊다. 계정·IAM·로깅·모니터링·네트워크 기본 | **가장 먼저.** 신규 계정 베이스라인 |
| **FSBP** | "AWS가 권장하는 서비스별 모범을 따르는가" | 가장 넓다. 서비스 전반 | 기본기 다음. 상시 유지 대상 |
| **PCI DSS** | "카드 데이터 환경 요건을 만족하는가" | 결제 환경 한정 | 카드 데이터를 다루는 계정에만 |
| **NIST SP 800-53** | "연방 통제 체계에 매핑되는가" | 매우 넓고 문서 지향 | 정부·규제 계약이 요구할 때 |
| **AWS 리소스 태깅 표준** | "태그 규칙을 지키는가" | 태그 한정 | 태그 기반 거버넌스를 쓸 때 |

읽는 순서가 곧 도입 순서다. **CIS로 시작해 FSBP로 넓히고, 규제 요구가 있을 때만 PCI/NIST를 얹는다.** 이 순서를 뒤집어 NIST부터 켜면 수백 개의 FAILED 컨트롤이 한꺼번에 쏟아지고, 팀은 그것을 "우리는 완전히 실패했다"로 읽고 결국 대시보드를 보지 않게 된다. 태세 관리 도입에서 가장 흔한 실패가 **처음부터 너무 많이 켠 것**이다.

> ⚠️ **함정**: "규제를 준수해야 하니 PCI DSS 표준을 켜면 준수한 것"이라는 서술은 오답이다. Security Hub의 PCI/NIST 표준은 **PCI DSS나 NIST 통제 중 AWS 구성으로 자동 확인 가능한 부분만** 평가한다. 물리 보안·인적 통제·정책 문서·프로세스는 어떤 자동 컨트롤도 대신할 수 없다. 시험 지문이 "표준을 켜면 인증을 받는다"는 뉘앙스를 띠면 그 보기는 거의 항상 틀렸다 — 자동 컨트롤은 인증 **증거의 일부**이지 인증 자체가 아니다.

### Config 의존성: 조용히 무너지는 지점

"Config가 있어야 한다"는 문장은 시험에서 한 줄로 끝나지만, 실제로는 여러 겹의 조건이 있다.

- **구성 레코더가 켜져 있어야** 한다. 그리고 컨트롤이 대상으로 삼는 **리소스 유형이 기록 대상에 포함**되어야 한다. 비용을 아끼려고 특정 리소스 유형만 기록하도록 좁히면, 그 유형을 보는 컨트롤은 평가 자체가 이뤄지지 않는다.
- **리전마다 별도**다. Security Hub와 Config는 리전 서비스이므로, 켜지 않은 리전은 통째로 사각지대다.
- 평가되지 않은 컨트롤은 `NO_DATA` 상태가 되고 **점수 계산의 분모에서 빠진다.** 이 지점이 위험하다 — 평가가 멈춘 것이 점수를 *떨어뜨리지 않고*, 오히려 남은 컨트롤만으로 계산되어 **점수가 올라가 보일 수 있다.**

> ⚠️ **함정**: **"점수가 올랐다"가 반드시 좋은 소식은 아니다.** 실제로 개선해서 오를 수도 있지만, (1) Config 기록 범위가 좁아져 평가 대상이 줄었거나, (2) FAILED가 많던 컨트롤을 비활성화했거나, (3) 리소스가 삭제되어 평가 대상 자체가 사라졌을 수도 있다. 점수는 반드시 **평가된 컨트롤 수와 함께** 읽어야 한다. 시험이 이 함정을 내는 형태는 "보안 점수가 개선되었는데 실제 태세는 나빠졌다. 원인은?"이며, 답은 대개 평가 범위 축소나 컨트롤 비활성화다.

## 보안 점수(Security Score): 컨트롤을 한 숫자로

Security Hub는 활성화된 표준의 컨트롤 합격률을 **보안 점수(%)**로 환산한다. 점수 계산은 단순하다.

```
보안 점수 = (합격(PASSED) 컨트롤 수) / (합격 + 불합격(FAILED) 컨트롤 수) × 100
```

- 비활성/데이터 없음(`NOT_AVAILABLE`, `DISABLED`) 컨트롤은 분모에서 제외된다.
- 컨트롤마다 여러 리소스가 평가되며, 한 리소스라도 불합격이면 해당 컨트롤은 `FAILED`로 본다(컨트롤 상태는 리소스 핀딩의 집계).

이 점수는 "지금 얼마나 베이스라인을 지키고 있나"의 한눈 지표이며, 조직 단위로 집계할 수도 있다.

### 점수의 성질: 한 리소스가 전체를 끌어내린다

두 번째 규칙 — **한 리소스라도 불합격이면 컨트롤 전체가 FAILED** — 이 점수 운영의 성격을 결정한다.

```
컨트롤 "S3 버킷은 퍼블릭 액세스를 차단해야 한다"
  ├─ prod-uploads      PASSED
  ├─ prod-assets       PASSED
  ├─ ... (버킷 197개)   PASSED
  └─ legacy-demo-site  FAILED  ◀── 이 하나 때문에
                                    컨트롤 상태 = FAILED
                                    점수 기여 = 0
```

즉 점수는 **"몇 퍼센트의 리소스가 안전한가"가 아니라 "몇 퍼센트의 규칙을 완전히 지키는가"**를 말한다. 이 성질이 실무에 주는 함의가 둘이다.

- **점수는 잘 오르지 않는다.** 99%의 리소스를 고쳐도 하나가 남으면 그 컨트롤 점수는 0이다. 점수만 KPI로 잡으면 팀은 좌절한다.
- **점수 대신 봐야 할 것은 FAILED 리소스 수의 추세**다. 컨트롤 단위 점수는 경영 보고용이고, 실제 개선 관리는 리소스 단위 카운트로 한다.

```bash
# 지금 무엇이 몇 건 실패했는지 — 컨트롤별 FAILED 리소스 카운트
aws securityhub get-findings \
  --filters '{
    "ComplianceStatus": [{"Value":"FAILED","Comparison":"EQUALS"}],
    "RecordState":      [{"Value":"ACTIVE","Comparison":"EQUALS"}],
    "WorkflowStatus":   [{"Value":"NEW","Comparison":"EQUALS"},
                         {"Value":"NOTIFIED","Comparison":"EQUALS"}]
  }' \
  --query 'Findings[].Compliance.SecurityControlId' --output text \
  | tr '\t' '\n' | sort | uniq -c | sort -rn | head -20
```

이 결과를 읽는 법이 중요하다. 상위에 오는 컨트롤은 두 유형으로 갈린다.

- **한 컨트롤에 수백 건** → 대개 *조직 전체에 걸친 기본값 문제*다. 예를 들어 "EBS 볼륨 암호화"가 수백 건이면 개별 볼륨을 고칠 일이 아니라 **계정 수준 EBS 기본 암호화를 켜는 것**이 답이다. 개별 교정은 밑 빠진 독이고, 근본 해법은 기본값을 바꾸는 것이다.
- **여러 컨트롤에 걸쳐 같은 리소스가 반복** → 그 리소스 하나가 방치된 레거시일 가능성이 높다. 고치는 것보다 **없애는 것**이 빠른 경우가 많다.

> 🔍 **더 깊이**: 태세 관리 지표를 KPI로 쓸 때 흔한 실패가 **"점수 100%"를 목표로 삼는 것**이다. 100%는 두 가지 방법으로 달성된다 — 전부 고치거나, 안 고쳐지는 컨트롤을 끄거나. 후자가 훨씬 쉽기 때문에, 점수를 목표로 걸면 조직은 자연스럽게 후자로 흐른다(측정값을 목표로 삼으면 측정값이 지표로서 망가진다는 굿하트의 법칙 그대로다). 그래서 성숙한 운영은 점수와 함께 **비활성화한 컨트롤의 수와 사유**를 같은 화면에 놓는다. "무엇을 껐고 왜 껐는가"가 보이지 않는 100%는 아무 정보도 담고 있지 않다.

## 컨트롤 운영: 끄기·조정하기·통합하기

표준을 켠 다음 실제로 시간을 쓰게 되는 일은 **컨트롤을 우리 환경에 맞추는 것**이다. Security Hub는 세 가지 손잡이를 준다.

### (1) 컨트롤 비활성화 — 사유를 남기는 것이 핵심

우리 환경에 해당하지 않는 컨트롤(예: 쓰지 않는 서비스)은 끄는 것이 맞다. 끄면 점수 계산에서 빠지고 핀딩도 생성되지 않는다.

```bash
aws securityhub update-standards-control \
  --standards-control-arn "arn:aws:securityhub:ap-northeast-2:111122223333:control/aws-foundational-security-best-practices/v/1.0.0/Redshift.1" \
  --control-status DISABLED \
  --disabled-reason "이 계정은 Redshift를 사용하지 않음 (플랫폼팀 승인 2026-03, TICKET-4821)"
```

`--disabled-reason`은 선택 항목처럼 보이지만 **비활성화 시 필수**이며, 이것이 이 기능의 설계 의도를 드러낸다. 컨트롤을 끄는 행위는 *탐지 범위를 줄이는 결정*이므로 반드시 근거가 기록되어야 한다. 감사에서 "왜 이 컨트롤이 꺼져 있나"에 답하지 못하면 그 자체가 지적 사항이 된다.

### (2) 컨트롤 파라미터 조정 — 끄는 대신 맞추기

일부 컨트롤은 임계값을 우리 정책에 맞게 바꿀 수 있다. 예를 들어 "액세스 키 교체 주기"나 "로그 보존 기간" 같은 컨트롤의 기준일 수를 조직 정책에 맞춘다. **컨트롤을 끄기 전에 먼저 물어야 할 질문은 "정말 해당 없는가, 아니면 기준이 우리와 다를 뿐인가"**다. 후자라면 끄는 것이 아니라 조정하는 것이 옳다.

```bash
aws securityhub update-security-control \
  --security-control-id IAM.3 \
  --parameters '{"maxCredentialUsageAge":{"ValueType":"CUSTOM","Value":{"Integer":45}}}'
```

끄기와 조정하기의 차이는 감사 관점에서 결정적이다. **끈 컨트롤은 "우리는 이것을 보지 않는다"이고, 조정한 컨트롤은 "우리는 이것을 다른 기준으로 본다"**이다. 후자는 정책 문서로 방어할 수 있고, 전자는 방어할 근거가 훨씬 좁다.

### (3) 통합 컨트롤 핀딩(Consolidated control findings)

CIS와 FSBP를 동시에 켜면 같은 점검(예: "루트 계정에 MFA")이 두 표준 모두에 존재해 **핀딩이 두 배로 생긴다.** 통합 컨트롤 핀딩을 켜면 표준과 무관하게 **보안 컨트롤 ID 하나당 핀딩 하나**만 생성된다.

```bash
aws securityhub update-security-hub-configuration \
  --control-finding-generator SECURITY_CONTROL
```

| 축 | `STANDARD_CONTROL`(기본) | `SECURITY_CONTROL`(통합) |
|----|--------------------------|--------------------------|
| 핀딩 생성 단위 | 표준 × 컨트롤 | 보안 컨트롤 ID |
| 표준 3개 동시 활성 시 중복 | 최대 3배 | 없음 |
| 컨트롤 관리 | 표준별로 각각 켜고 끔 | **한 번 끄면 모든 표준에서 반영** |
| 핀딩 볼륨 | 많음 | 적음 |

> ⚠️ **함정**: 통합을 켜면 컨트롤 활성/비활성이 **표준 경계를 넘어 적용**된다. "PCI 표준에서는 켜고 CIS에서는 끄고 싶다"는 요구는 통합 모드에서 성립하지 않는다. 반대로 통합을 켜지 않은 채 표준 세 개를 켜면 같은 문제를 세 번 보게 되어 알림 피로가 곧바로 발생한다. **표준을 여럿 켠다면 통합도 함께 켜는 것이 사실상 기본 설정**이라고 기억하면 된다.

## 다계정 강제: Central Configuration

여기까지가 한 계정의 이야기다. 조직 규모에서는 "우리가 정한 표준·컨트롤 설정을 수백 개 계정에 어떻게 똑같이 적용하고, 워크로드 팀이 임의로 끄지 못하게 하는가"가 실제 문제가 된다. **중앙 구성(Central Configuration)**이 그 답이다.

```
[ 중앙 구성의 적용 흐름 ]

  관리 계정                위임 관리자(Security Tooling)          멤버 계정/OU
 ┌──────────┐            ┌───────────────────────────┐        ┌────────────┐
 │ 위임 지정 │──────────▶ │ 구성 정책(configuration    │        │ 표준 자동  │
 │           │            │   policy) 작성:            │──적용─▶│ 활성화     │
 └──────────┘            │  · 어떤 표준을 켤 것인가    │        │ 컨트롤 설정│
                          │  · 어떤 컨트롤을 끌 것인가  │        │ 잠김       │
                          │  · 파라미터 값             │        └────────────┘
                          └────────────┬──────────────┘              ▲
                                       │ 연결(association)            │
                                       └── 루트 / OU / 개별 계정 ─────┘
                                            (계층적 상속, 하위에서 재정의 가능)
```

```bash
# 1) (관리 계정) 위임 관리자 지정
aws securityhub enable-organization-admin-account --admin-account-id 999988887777

# 2) (위임 관리자) 중앙 구성 사용 선언
aws securityhub update-organization-configuration \
  --auto-enable \
  --organization-configuration '{"ConfigurationType":"CENTRAL"}'

# 3) 구성 정책 작성 — 무엇을 켜고 무엇을 끌지
aws securityhub create-configuration-policy \
  --name "baseline-prod" \
  --description "프로덕션 OU 표준 베이스라인" \
  --configuration-policy '{
    "SecurityHub": {
      "ServiceEnabled": true,
      "EnabledStandardIdentifiers": [
        "arn:aws:securityhub:ap-northeast-2::standards/aws-foundational-security-best-practices/v/1.0.0",
        "arn:aws:securityhub:ap-northeast-2::standards/cis-aws-foundations-benchmark/v/1.4.0"
      ],
      "SecurityControlsConfiguration": {
        "DisabledSecurityControlIdentifiers": ["Redshift.1"]
      }
    }
  }'

# 4) OU에 연결
aws securityhub start-configuration-policy-association \
  --configuration-policy-identifier <policy-arn> \
  --target '{"OrganizationalUnitId":"ou-abc1-22334455"}'
```

> 🎯 **시나리오**: "수백 개 계정에서 팀마다 Security Hub 설정이 제각각이고, 일부 팀은 불편한 컨트롤을 임의로 꺼 버린다. 조직 표준을 강제하되 특정 OU에는 예외를 두고 싶다"가 나오면 답은 **중앙 구성 + OU 계층 연결**이다. 여기서 오답 후보 세 가지를 구분하는 것이 시험 포인트다. (1) "각 계정에 스크립트로 설정을 배포한다" — 배포 시점에만 맞고 이후 변경을 막지 못한다. (2) "SCP로 `securityhub:UpdateStandardsControl`을 차단한다" — 예외를 표현할 수 없고, 정당한 조정까지 막는다. (3) "로컬 구성을 유지하고 감사만 한다" — 강제가 아니다. 중앙 구성만이 **상속 + 예외 + 지속 강제**를 동시에 만족한다.

> ⚠️ **함정**: 중앙 구성은 **위임 관리자의 홈 리전에서 관리**되며, 로컬 구성(각 계정이 스스로 설정)과 배타적이다. 중앙 구성을 켜는 순간 멤버 계정의 로컬 설정은 정책에 의해 덮인다. "중앙에서 배포했는데 멤버가 그대로 유지되지 않는다"는 문제는 대개 로컬 구성 모드로 남아 있거나 연결(association)이 해당 OU까지 내려오지 않은 경우다.

## ASFF: 모든 핀딩의 공통 언어

Security Hub의 가장 중요한 개념이 **ASFF(AWS Security Finding Format)**다. 출처가 GuardDuty든 Inspector든 서드파티든, 모든 핀딩은 이 JSON 스키마로 정규화되어 들어온다. 덕분에 운영자는 출처별 포맷을 외울 필요 없이 *하나의 필드 체계*로 검색·필터·라우팅할 수 있다.

ASFF의 핵심 필드:

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/abc/finding/xyz",
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty",
  "GeneratorId": "guardduty",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:EC2-SSHBruteForce"],
  "Severity": { "Label": "HIGH", "Normalized": 70 },
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE",
  "Resources": [
    { "Type": "AwsEc2Instance", "Id": "arn:aws:ec2:...:instance/i-0123" }
  ],
  "Compliance": { "Status": "FAILED" },
  "ProductFields": { "aws/securityhub/CompanyName": "AWS" }
}
```

정규화에서 특히 중요한 두 축:

- **Severity.Normalized**: 0~100의 정규화 심각도. 출처마다 다른 심각도 표현을 한 척도로 통일한다. 라벨(`INFORMATIONAL`/`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`)과 매핑된다.
- **Workflow.Status**: 핀딩의 *처리 상태* — `NEW` → `NOTIFIED` → `RESOLVED` / `SUPPRESSED`. 운영자가 다루는 워크플로 상태다.
- **RecordState**: 핀딩의 *생존* 상태 — `ACTIVE` / `ARCHIVED`. 문제가 사라지면 ARCHIVED로 바뀐다.

> ⚠️ **함정**: `Workflow.Status`와 `RecordState`를 혼동하면 안 된다. `RecordState=ARCHIVED`는 "근본 문제가 해소되어 핀딩이 더 이상 유효하지 않음"(시스템이 판단), `Workflow.Status=RESOLVED`는 "운영자가 처리했다고 표시"(사람/자동화가 판단)다. 또 `SUPPRESSED`는 "보긴 했지만 의도적으로 무시"라 점수·알림에서 빠지지만 기록은 남는다.

(ASFF 각 필드의 해부와 커스텀 핀딩 주입, 그리고 여러 탐지 서비스를 한 그림으로 묶는 다계정 베이스라인은 week9에서 탐지 도구들을 모두 배운 뒤 다시 다룬다. 오늘 필요한 것은 **컨트롤 핀딩이 위협 핀딩과 다른 필드를 갖고, 다른 수명주기를 갖는다**는 사실 하나다.)

### 컨트롤 핀딩의 수명주기는 위협 핀딩과 다르다

같은 ASFF를 쓰지만 두 부류의 핀딩은 **사라지는 방식**이 정반대다. 이 차이를 모르면 운영이 어긋난다.

| 축 | 위협 핀딩(GuardDuty 등) | 컨트롤 핀딩(표준 점검) |
|----|------------------------|------------------------|
| 무엇을 말하나 | "사건이 일어났다" | "구성이 기준을 벗어났다" |
| 결정 필드 | `Types`, `Severity` | `Compliance.Status`, `SecurityControlId` |
| 언제 사라지나 | 활동이 멈추면 자동 아카이브 | **고칠 때까지 계속 FAILED로 재생성** |
| 처리 방식 | 조사 후 종결(RESOLVED) | 리소스를 고쳐야 PASSED로 전환 |
| RESOLVED로 표시하면 | 종결됨 | **다음 평가에서 다시 NEW로 돌아온다** |
| 적정 지표 | 사건 수·평균 대응 시간 | 준수율·FAILED 리소스 추세 |

다섯 번째 행이 실무에서 사고를 만든다. 컨트롤 핀딩을 "확인했으니 처리 완료"로 표시해도 **리소스가 그대로면 다음 Config 평가에서 같은 핀딩이 다시 살아난다.** 이것은 버그가 아니라 설계다 — 태세 핀딩은 *현재 상태의 반영*이지 *과거 사건의 기록*이 아니기 때문이다. 컨트롤 핀딩을 조용하게 만드는 방법은 셋뿐이다: **고치거나, 컨트롤을 끄거나, 억제(SUPPRESSED)하거나.** 그리고 뒤의 둘은 반드시 사유가 남아야 한다.

## 핀딩 집계와 통합(Integrations)

Security Hub에 핀딩을 *보내는* 통합과, Security Hub의 핀딩을 *받아가는* 통합이 있다.

- **수신 통합(→ Security Hub)**: GuardDuty, Inspector, Macie, IAM Access Analyzer, Firewall Manager, Config, Health, 그리고 다수의 서드파티(Palo Alto, Splunk 등). 켜면 자동으로 ASFF로 들어온다.
- **송신/응답 통합(Security Hub →)**: EventBridge(모든 핀딩이 자동으로 이벤트로 발행됨), 티켓팅(Jira/ServiceNow), SIEM.

다계정 환경에서는 **Organizations 통합**으로 위임 관리자(delegated administrator) 계정을 지정해 모든 멤버의 핀딩을 한곳으로 모으고, **Cross-Region Aggregation**으로 여러 리전의 핀딩을 단일 집계 리전으로 통합한다.

> 🎯 **시나리오**: "조직 전체(수백 개정·여러 리전)의 보안 상태를 단일 화면에서 보고 일관된 표준을 강제"라는 요구가 나오면, 정답 조합은 (1) Organizations에서 Security Hub 위임 관리자 지정 → (2) Central Configuration으로 표준·컨트롤을 멤버에 일괄 배포 → (3) Cross-Region Aggregation으로 한 리전에 집계 → (4) 각 멤버 계정의 Config 활성화 보장. 멤버마다 수동 설정이 아니라 *중앙 구성*이 핵심 키워드다.

## 자동 대응: Automation Rules와 EventBridge

Security Hub는 두 가지 자동화 경로를 제공한다.

1. **Security Hub Automation Rules**: Security Hub *내부*에서 핀딩이 들어올 때 조건(예: 특정 컨트롤 ID + 계정)에 맞으면 필드를 자동 갱신(심각도 상향/하향, Workflow.Status를 SUPPRESSED로 등). 외부 액션은 못 하지만 *노이즈 정리·우선순위 조정*에 강하다.
2. **EventBridge 기반 대응**: 모든 핀딩은 자동으로 EventBridge에 발행된다. EventBridge 규칙으로 특정 핀딩 패턴을 잡아 Lambda/Step Functions/SSM Automation을 실행해 *실제 교정*을 한다(예: 공개된 S3 버킷의 퍼블릭 액세스 차단).

```json
// EventBridge 규칙: CRITICAL GuardDuty 핀딩만 잡아 대응
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": { "Label": ["CRITICAL"] },
      "ProductArn": [{ "prefix": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty" }],
      "Workflow": { "Status": ["NEW"] }
    }
  }
}
```

> 💡 **관련 이론**: Security Hub + EventBridge + 자동 교정의 조합은 SOAR(Security Orchestration, Automation and Response)의 AWS 네이티브 구현이다. AWS는 이를 위한 사전 제작 솔루션 **Automated Security Response on AWS(ASR, 구 SHARR)**를 제공한다 — Security Hub 핀딩을 받아 SSM Automation 문서로 자동 교정하는 플레이북 모음이다. 시험에서 "Security Hub 핀딩에 대한 자동 교정 솔루션"을 물으면 EventBridge → SSM Automation 경로(또는 ASR)를 떠올려야 한다.

### Security Hub가 EventBridge로 보내는 세 종류의 이벤트

핀딩 라우팅을 정확히 쓰려면 `detail-type`이 셋이라는 것을 알아야 한다. 시험에서 "수동 검토 후 대응을 트리거"라는 요구가 나오면 세 번째가 답이다.

```json
// (1) 모든 핀딩이 자동 발행 — 자동 대응의 기본 경로
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Compliance":    { "Status": ["FAILED"] },
      "Severity":      { "Label": ["CRITICAL", "HIGH"] },
      "Workflow":      { "Status": ["NEW"] },
      "RecordState":   ["ACTIVE"],
      "ProductFields": { "aws/securityhub/ProductName": ["Security Hub"] }
    }
  }
}
```

```json
// (2) 분석가가 콘솔에서 명시적으로 실행하는 사용자 지정 작업
//     (create-action-target 으로 먼저 액션을 만들어야 한다)
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Custom Action"],
  "resources": ["arn:aws:securityhub:ap-northeast-2:111122223333:action/custom/CreateJiraTicket"]
}
```

```json
// (3) 인사이트 결과 — 주기적 상관 뷰의 산출물
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Insight Results"]
}
```

```bash
# 사용자 지정 작업 만들기 — 콘솔 버튼 하나가 EventBridge 이벤트가 된다
aws securityhub create-action-target \
  --name "Create Jira Ticket" \
  --description "선택한 핀딩으로 이슈를 생성" \
  --id CreateJiraTicket
```

> 🔍 **더 깊이**: 사용자 지정 작업(custom action)이 있는 이유는 **모든 대응이 자동화되어야 하는 것은 아니기 때문**이다. 자동 대응은 조건이 명확하고 조치가 가역적일 때만 안전하고, 그 밖의 상황에서는 *사람의 판단 + 기계의 실행*이 최선의 조합이다. 사용자 지정 작업은 정확히 그 지점을 메운다 — 분석가가 핀딩을 보고 판단한 뒤 버튼을 누르면, 그 이후의 실행(티켓 생성·격리·증거 수집)은 자동화가 맡는다. 시험에서 "자동 vs 수동"의 이분법으로 보이는 보기들 사이에 이 **반자동(human-in-the-loop)** 선택지가 정답인 경우가 있다.

### 억제의 세 층위: 어디서 줄일 것인가

컨트롤 핀딩은 리소스가 늘어날수록 선형으로 늘어난다. 노이즈를 줄여야 하는데, 줄이는 지점에 따라 잃는 것이 다르다. **어디서 자를지가 곧 무엇을 포기할지**를 결정한다.

```
 [ 생성 ]           [ 저장 ]              [ 라우팅 ]            [ 도달 ]
컨트롤 평가 ──▶ Security Hub 핀딩 ──▶ EventBridge 규칙 ──▶ SNS/티켓/온콜
    │                   │                    │                   │
    ①                   ②                    ③                   │
컨트롤 비활성화     자동화 규칙 억제      패턴으로 필터링      등급별 채널 분리
    │                   │                    │
잃는 것:            잃는 것:              잃는 것:
평가 자체·점수      알림·점수 반영        해당 대응만
(사각지대 발생)     (핀딩·기록은 남음)    (핀딩·점수는 그대로)
```

| 층위 | 언제 쓰나 | 남는 것 | 위험 |
|------|----------|---------|------|
| ① 컨트롤 비활성화 | 해당 서비스를 아예 안 쓸 때 | 사유 기록만 | **평가 자체가 없어진다.** 나중에 그 서비스를 쓰기 시작하면 사각지대 |
| ② 자동화 규칙 억제 | 예외가 승인된 특정 리소스·계정 | 핀딩·감사 기록 | 억제 범위를 넓게 잡으면 조용한 사각지대 |
| ③ EventBridge 필터 | 대응만 안 하고 대시보드에는 남길 때 | 핀딩·점수·대시보드 | 가장 안전. 다만 사람이 대시보드를 봐야 함 |

**기본 원칙은 "가능한 한 오른쪽에서 자른다"**이다. 오른쪽에서 자를수록 잃는 것이 적고 되돌리기 쉽다. ①은 최후의 수단이며, 쓸 때는 반드시 사유와 재검토 시점을 남긴다.

> ⚠️ **함정**: "핀딩이 너무 많으니 표준을 끄자"는 보기는 시험에서 항상 오답이다. 같은 이유로 "노이즈가 심하니 Security Hub 통합을 비활성화한다"도 오답이다. 정답의 형태는 언제나 **핀딩은 다 받되 억제·라우팅으로 접는다**이며, 이때 억제한 것이 무엇인지 추적 가능해야 한다. 반대로 "모든 핀딩을 전부 온콜에 보낸다"도 오답인데, 이는 기술적으로는 안전해 보이지만 운영적으로는 **아무도 보지 않게 만들어 결과적으로 탐지를 끈 것과 같아지기** 때문이다.

## Custom Insights: 핀딩을 질문으로

Security Hub는 핀딩을 그룹화·필터링한 저장된 뷰인 **Insight**를 제공한다. 기본 제공 인사이트(예: "퍼블릭 접근 가능한 리소스", "가장 핀딩이 많은 리소스") 외에 ASFF 필드로 커스텀 인사이트를 만들 수 있다. 인사이트는 *grouping attribute*(예: 리소스 ID, 계정) 기준으로 핀딩을 모아 "어디에 위험이 집중됐나"를 드러낸다.

```bash
# "어느 계정이 CRITICAL FAILED를 가장 많이 갖고 있나" — 개선 대상 계정 우선순위
aws securityhub create-insight \
  --name "CRITICAL FAILED by account" \
  --group-by-attribute AwsAccountId \
  --filters '{
    "SeverityLabel":    [{"Value":"CRITICAL","Comparison":"EQUALS"}],
    "ComplianceStatus": [{"Value":"FAILED","Comparison":"EQUALS"}],
    "RecordState":      [{"Value":"ACTIVE","Comparison":"EQUALS"}]
  }'

# 조사 완료 건 일괄 종결 (위협 핀딩에 한함 — 컨트롤 핀딩은 리소스를 고쳐야 한다)
aws securityhub batch-update-findings \
  --finding-identifiers '[{"Id":"<finding-id>","ProductArn":"<product-arn>"}]' \
  --workflow Status=RESOLVED \
  --note 'Text=INC-2026-0412 조사 완료,UpdatedBy=soc-analyst'
```

인사이트의 실제 값어치는 대시보드가 아니라 **그룹화 축의 선택**에 있다. 같은 핀딩 더미를 `AwsAccountId`로 묶으면 "어느 팀을 도와야 하나"가 보이고, `ResourceId`로 묶으면 "어느 리소스를 없애야 하나"가 보이며, `SecurityControlId`로 묶으면 "어느 기본값을 바꿔야 하나"가 보인다. **세 축은 각각 다른 조직적 행동을 유발한다** — 태세 개선이 정체될 때는 대개 축을 잘못 고른 것이다.

## 정리하며

CloudWatch가 단일 신호의 임계 탐지라면, Security Hub는 *여러 신호의 집계·정규화·점수화*다. 흐름으로 묶으면: **표준(CIS/FSBP, Config 기반) → 컨트롤 평가 → 점수·FAILED 추세 → 컨트롤 조정(끄기·맞추기·통합) → 중앙 구성으로 조직 강제 → 억제·라우팅으로 노이즈 관리 → EventBridge로 대응**.

오늘 내용에서 시험이 반복해 찌르는 지점은 네 곳이다.

1. **Config 없이는 표준이 없다.** 그리고 Config 기록 범위가 좁으면 평가가 조용히 사라지며, 그때 점수는 *올라가 보인다.*
2. **점수는 컨트롤 단위, 개선은 리소스 단위.** 한 리소스가 컨트롤 전체를 FAILED로 만든다.
3. **컨트롤 핀딩은 고쳐야 사라진다.** RESOLVED 표시는 다음 평가에서 되살아난다.
4. **조직 강제는 스크립트나 SCP가 아니라 중앙 구성.** 상속과 예외를 동시에 표현할 수 있는 유일한 수단이다.

그리고 이 모든 것 위에 놓이는 판단이 하나 있다. **태세 관리의 목표는 점수가 아니라 기본값의 개선**이다. 같은 컨트롤이 수백 건 실패하고 있다면 그것은 수백 개의 실수가 아니라 하나의 잘못된 기본값이며, 개별 교정이 아니라 계정 수준 설정·서비스 제어 정책·IaC 템플릿을 고쳐야 다시 늘어나지 않는다. 탐지가 아무리 정교해도 **생성 속도가 교정 속도보다 빠르면 태세는 나빠진다** — 이것이 CSPM 운영의 유일한 산수다.

## 한 줄 요약 체크리스트

- [ ] 각 리전·각 계정에서 AWS Config 레코더가 켜져 있고 필요한 리소스 유형을 기록하는가
- [ ] CIS로 시작해 FSBP로 넓혔는가(처음부터 전 표준을 켜지 않았는가)
- [ ] 통합 컨트롤 핀딩(`SECURITY_CONTROL`)으로 표준 간 중복을 제거했는가
- [ ] 끈 컨트롤마다 `--disabled-reason`에 사유·승인·재검토 시점을 남겼는가
- [ ] 끄기 전에 "파라미터 조정으로 해결되는가"를 먼저 확인했는가
- [ ] 중앙 구성 + OU 연결로 조직 표준을 강제하고 예외를 명시적으로 표현했는가
- [ ] 점수와 함께 **평가된 컨트롤 수·비활성 컨트롤 수**를 같이 보고 있는가
- [ ] 노이즈는 가능한 한 오른쪽(라우팅)에서 자르고, 컨트롤 비활성화는 최후 수단으로 두었는가
- [ ] 같은 컨트롤의 대량 실패를 개별 교정이 아니라 **기본값 변경**으로 처리했는가

---

## 📝 연습 문제

**문제 1.** Security Hub의 보안 표준(CIS, FSBP) 컨트롤이 평가되려면 반드시 활성화되어 있어야 하는 선행 서비스는?

A) Amazon Macie  
B) AWS Config  
C) Amazon Inspector  
D) AWS Shield Advanced  

**정답: B**  
해설: Security Hub의 표준 컨트롤은 내부적으로 AWS Config 규칙으로 리소스 설정을 평가하므로 Config가 활성화되어 있어야 한다. Macie는 민감데이터 발견, Inspector는 취약점 스캔, Shield는 DDoS 방어로 표준 컨트롤 평가의 선행 조건이 아니다.

---

**문제 2.** GuardDuty, Inspector, Macie의 서로 다른 핀딩 포맷을 단일 체계로 다루기 위해 Security Hub가 사용하는 정규화 포맷은?

A) CloudTrail 이벤트 스키마  
B) ASFF(AWS Security Finding Format)  
C) VPC Flow Logs 포맷  
D) OCSF 원본 포맷만 그대로 보관  

**정답: B**  
해설: Security Hub는 모든 통합 소스의 핀딩을 ASFF라는 단일 JSON 스키마로 정규화해 출처와 무관하게 같은 필드(Severity.Normalized, Workflow.Status 등)로 검색·라우팅할 수 있게 한다. CloudTrail/VPC Flow 포맷은 다른 데이터이고, OCSF는 Security Lake의 포맷이다.

---

**문제 3.** 운영자가 특정 핀딩을 검토한 뒤 "의도적으로 무시하되 기록은 남기고 보안 점수·알림에서 제외"하려 한다. ASFF에서 설정할 값은?

A) RecordState를 ARCHIVED로  
B) Workflow.Status를 SUPPRESSED로  
C) Severity.Normalized를 0으로  
D) Compliance.Status를 PASSED로  

**정답: B**  
해설: Workflow.Status를 SUPPRESSED로 두면 운영자가 의도적으로 무시했음을 표시하며 알림·점수 집계에서 빠지지만 기록은 남는다. RecordState=ARCHIVED는 시스템이 근본 문제 해소를 판단해 바꾸는 값이고, 심각도나 Compliance를 임의 조작하는 것은 의미를 왜곡한다.

---

**문제 4.** 수백 개의 멤버 계정과 여러 리전에 걸쳐 Security Hub 표준을 일관되게 적용하고 모든 핀딩을 단일 화면에서 보려 한다. 가장 적절한 접근은?

A) 각 계정·리전에서 개별적으로 Security Hub를 수동 설정  
B) Organizations에서 위임 관리자를 지정하고 Central Configuration으로 표준을 배포한 뒤 Cross-Region Aggregation으로 한 리전에 집계  
C) 모든 핀딩을 이메일로 전달하도록 SNS만 구성  
D) GuardDuty만 켜면 자동으로 통합된다  

**정답: B**  
해설: 다계정·다리전 일관 운영의 정답은 Organizations 위임 관리자 + Central Configuration(표준/컨트롤 일괄 배포) + Cross-Region Aggregation(단일 집계 리전)이다. 계정별 수동 설정은 확장성이 없고, SNS만으로는 표준 강제·집계가 안 되며, GuardDuty는 탐지기일 뿐 표준 점검·집계를 대신하지 않는다.

---

**문제 5.** Security Hub의 CRITICAL 핀딩이 들어올 때 자동으로 실제 교정(예: 노출된 보안 그룹 규칙 회수)을 수행하려 한다. 표준 아키텍처는?

A) Security Hub Automation Rule로 보안 그룹을 직접 수정  
B) 핀딩이 EventBridge에 자동 발행되므로, EventBridge 규칙으로 패턴을 매칭해 SSM Automation/Lambda로 교정  
C) Config 규칙이 자동으로 교정한다  
D) Macie가 교정한다  

**정답: B**  
해설: 모든 Security Hub 핀딩은 EventBridge로 자동 발행되므로, EventBridge 규칙으로 CRITICAL 패턴을 잡아 SSM Automation 문서나 Lambda로 실제 교정을 실행하는 것이 표준 패턴(AWS의 ASR 솔루션도 이 경로)이다. Automation Rule은 핀딩 필드 갱신·억제만 할 뿐 외부 리소스를 직접 바꾸지 못하고, Config 자동 교정은 Config 규칙 차원이며, Macie는 데이터 발견 도구다.

---
