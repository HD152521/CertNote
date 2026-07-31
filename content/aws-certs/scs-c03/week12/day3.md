# Day 3 - 도메인 5·6 통합 복습: 데이터 보호 ↔ 관리·거버넌스

도메인 5(데이터 보호, ~18%)와 도메인 6(관리·거버넌스, ~14%)는 시험의 마지막 묶음이다. 관계는 이렇다 — **데이터 보호는 "데이터를 어떻게 암호화·격리·보존하는가"를, 거버넌스는 "그 통제를 다계정 규모로 어떻게 강제·검증·유지하는가"를** 다룬다. Specialty 답안은 *"한 계정에서 옳은 통제를, Organizations 전체에 자동으로 강제하라"*는 형태가 많다. 오늘은 KMS 중심의 데이터 보호와 Organizations 중심의 거버넌스를 하나의 통제 전파 모델로 묶는다.

## 데이터 보호: KMS가 모든 것의 중심

| 키 유형 | 키 자료 통제 | 로테이션 | 비용/용도 |
|---------|--------------|----------|-----------|
| AWS managed key | AWS | 자동(1년) | 무료, 서비스 기본 |
| Customer managed key(CMK) | 고객(정책·grant) | 선택 자동/수동 | 키 정책 제어 필요 시 |
| Imported key material | 고객 반입(BYOK) | 수동 재반입 | 키 출처 통제 필요 |
| CloudHSM-backed(custom key store) | 고객 HSM(FIPS 140-2 L3) | — | 규제·전용 HSM |

> 💡 **관련 이론**: KMS의 핵심은 *envelope encryption(봉투 암호화)*다. KMS의 마스터 키(KEK)가 데이터 키(DEK)를 암호화하고, 실제 대용량 데이터는 DEK로 로컬 암호화한다. `GenerateDataKey`가 평문 DEK(즉시 사용·메모리에서만)와 암호화된 DEK(데이터와 함께 저장)를 함께 반환한다. 덕분에 대용량을 KMS로 매번 보내지 않고도 키를 KMS가 통제한다. "왜 KMS가 대용량 파일을 직접 암호화하지 않나" → envelope encryption 때문.

### 키 정책 vs IAM vs Grant

KMS 접근은 **키 정책이 1차 권한 원천**이다(IAM과 다른 점). 핵심 규칙:
- 키 정책에 계정 root를 신뢰해야 IAM 정책으로 위임 가능(`"Enable IAM policies"`).
- **Grant**: 임시·세밀한 권한 위임(서비스가 사용자 대신 키 사용). 만료·취소 가능.
- 키 삭제는 즉시 불가 — *7~30일 대기*. 그 전엔 *disable*로 되돌릴 수 있게.

| 축 | 키 정책 | IAM 정책 | Grant |
|---|---|---|---|
| 붙는 곳 | 키 자체 | 주체(사용자·역할) | 키 + 수혜 프린시펄 |
| 단독으로 충분한가 | **○** (유일하게 단독 가능) | ✗ (키 정책의 위임이 전제) | ○ (허용된 범위 내) |
| 수명 | 영구 | 영구 | **임시·취소 가능** |
| 전형적 용도 | 키 소유·관리 경계 | 사람·앱에 사용 권한 | AWS 서비스가 사용자 대신 키를 쓸 때 |
| 시험에서 묻는 형태 | "AdministratorAccess인데 왜 복호화가 안 되나" | "누구에게 사용 권한을" | "일시적으로만·취소 가능하게" |

시험이 특히 좋아하는 조건 키가 둘 있다. **`kms:ViaService`** — 이 키를 특정 AWS 서비스를 *경유할 때만* 쓰게 제한(예: S3를 통해서만). **`kms:EncryptionContext`** — 암호화 시 붙인 컨텍스트가 일치할 때만 복호화 허용(테넌트·용도 분리). 둘 다 "키 사용을 더 좁혀라"는 요구의 답이다.

> ⚠️ **자주 틀리는 구분**: 
> - **S3 SSE-S3 vs SSE-KMS vs SSE-C vs DSSE-KMS**: S3-관리키 / KMS키(감사·정책) / 고객제공키 / 이중 KMS. 감사·접근 통제 필요 → SSE-KMS.
> - **CloudHSM vs KMS**: 전용 단일 테넌트 HSM(직접 운영, FIPS L3) vs 관리형 멀티테넌트. 규제·키 단독 소유 → CloudHSM/custom key store.
> - **전송 중 vs 저장 중**: TLS(in transit) vs SSE/KMS(at rest). 둘 다 필요.

### 헷갈리는 짝: S3 암호화 5종 대조

| 방식 | 키 소유·보관 | 키 사용 감사 | 접근 통제 | 언제 고르나 |
|---|---|---|---|---|
| **SSE-S3** | AWS | 약함(키 단위 감사 없음) | 버킷 정책만 | 기본 암호화, 통제 요구 없음 |
| **SSE-KMS** | 고객(CMK) | **CloudTrail로 Decrypt/GenerateDataKey** | 키 정책 + IAM + Grant | ★대부분의 정답 — "감사·정책 통제" |
| **DSSE-KMS** | 고객(CMK) | 동일 | 동일 | **이중 계층 암호화**를 명시 요구할 때 |
| **SSE-C** | **고객이 매 요청에 전달** | AWS가 키를 보관하지 않음 | 키를 아는 자만 | 키를 AWS에 절대 두지 못할 때(운영 부담 큼) |
| **클라이언트 측(CSE)** | 고객(앱에서) | 앱 책임 | 앱 책임 | AWS가 평문을 절대 보면 안 될 때 |

여기에 비용 축이 하나 붙는다. **S3 Bucket Keys**는 SSE-KMS 사용 시 KMS 호출 횟수를 줄여 비용을 낮춘다 — "SSE-KMS를 쓰는데 KMS 요청 비용이 과하다"는 지문의 답이다.

한 줄 판별: **"누가 키를 쓰는지 감사·통제"가 나오면 SSE-KMS**, **"이중 암호화"가 명시되면 DSSE-KMS**, **"키를 AWS에 두지 않는다"면 SSE-C 또는 클라이언트 측**, **"전용 HSM·단독 소유·FIPS L3"면 CloudHSM 기반 custom key store**.

### 헷갈리는 짝: Object Lock Governance vs Compliance

이 구분은 거의 매 회차 나온다.

| 축 | Governance 모드 | Compliance 모드 | Legal Hold |
|---|---|---|---|
| 보존 기간 중 삭제·덮어쓰기 | 특별 권한(`s3:BypassGovernanceRetention`)으로 **가능** | **불가 — 루트 포함 누구도 못 함** | 기간 없이 무기한 잠금 |
| 기간 단축 | 특별 권한으로 가능 | **불가**(연장만 가능) | 해당 없음 |
| 전제 조건 | 버전 관리 | 버전 관리 | 버전 관리 |
| 언제 고르나 | 내부 정책·실수 방지, 예외를 남기고 싶을 때 | **규제상 "누구도 삭제 못 함"이 요구될 때** | 소송·조사로 특정 객체를 기간 없이 동결 |

지문이 **"관리자를 포함해 누구도", "규제 요건", "N년간 변경 불가"**라고 말하면 답은 Compliance다. **"실수로 지우는 것을 막되 필요 시 예외"**면 Governance다. 그리고 셋 다 **버전 관리가 전제**이며, Object Lock과 **MFA Delete는 다른 물건**이다(후자는 버전 삭제·버전 관리 중지에 MFA를 요구하는 별도 장치로, 루트가 CLI/API로만 설정한다).

백업 쪽에도 같은 개념이 있다 — **AWS Backup Vault Lock**은 백업에 대한 WORM을 제공한다. "백업이 랜섬웨어에 지워지지 않게"라는 요구의 답이다.

### 데이터 보호의 추가 도구

- **S3 Object Lock(WORM)** + MFA Delete + 버전 관리 → 변조·삭제 방지(랜섬웨어·규제).
- **버킷 정책 `aws:SecureTransport`** → TLS 강제(평문 HTTP 거부).
- **ACM** → 인증서 발급·자동 갱신(CloudFront는 us-east-1, ALB는 해당 리전). 사설 신뢰 체인은 **AWS Private CA**. *가져온(imported) 인증서는 자동 갱신되지 않는다.*
- **Macie** → S3 민감 데이터 발견(도메인 1과 연결).
- **RDS/EBS/EFS 암호화** → 생성 시 KMS 키 지정(나중에 켜기 어려움 → 스냅샷 재암호화).
- **S3 Replication(SRR/CRR)** → 버전 관리 전제. **다른 계정으로 복제**하면 원 계정이 뚫려도 사본이 남는다.

> ⚠️ **함정**: "이미 만들어진 리소스를 암호화하라"는 요구는 대부분 **재생성 경로**가 정답이다. 미암호화 EBS는 *스냅샷 → 암호화 복사 → 새 볼륨*, 미암호화 RDS는 *스냅샷 → 암호화 복사 → 복원*이다. "설정에서 암호화를 켠다"는 보기는 오답이다. 반대로 **계정·리전 단위 EBS 기본 암호화**를 켜면 이후 생성분은 자동으로 암호화된다 — 예방 통제 쪽 답이다.

### 데이터 보호 결정 트리

```
"이 데이터를 어떻게 지키는가?"
   │
   ├─ 저장 중(at rest)
   │    ├─ 감사·정책 통제 필요? ──► SSE-KMS (CMK) + CloudTrail로 KMS API 감사
   │    ├─ 이중 계층 명시 요구? ──► DSSE-KMS
   │    ├─ 키를 AWS에 못 둠? ────► SSE-C / 클라이언트 측 암호화
   │    ├─ 전용 HSM·단독 소유? ──► CloudHSM 기반 custom key store
   │    └─ KMS 호출 비용 과다? ──► S3 Bucket Keys
   │
   ├─ 전송 중(in transit) ────────► TLS + 버킷 정책 aws:SecureTransport Deny
   │                                (ACM 인증서 — CloudFront는 us-east-1)
   │
   ├─ 삭제·변조 방지
   │    ├─ 누구도(루트 포함) ────► Object Lock **Compliance**
   │    ├─ 예외를 남기고 싶다 ───► Object Lock **Governance**
   │    ├─ 소송 동결 ────────────► Legal Hold
   │    ├─ 버전 삭제에 MFA ──────► MFA Delete
   │    └─ 백업 자체를 잠금 ─────► Backup Vault Lock
   │
   ├─ 어디에 민감 데이터가 있나 ──► Macie
   │
   └─ 조직 밖으로 못 나가게 ──────► SCP(나가는 문) + RCP(들어오는 문) + aws:PrincipalOrgID

> 🎯 **통합 시나리오 A**: "규제상 키 자료를 우리가 단독 소유·통제해야 하고, S3 데이터는 그 키로 암호화하며, 누가 키를 썼는지 감사해야 한다." 답: **CloudHSM 기반 KMS custom key store**(키 자료 단독 소유·FIPS L3) → 그 CMK로 **S3 SSE-KMS**(키 정책으로 접근 통제) → **CloudTrail**로 KMS API(`Decrypt`/`GenerateDataKey`) 호출 감사. 키 소유(CloudHSM) + 통제(키 정책) + 감사(CloudTrail) 삼위일체.

## 거버넌스: 통제를 조직 규모로 강제

| 도구 | 역할 |
|------|------|
| AWS Organizations | 다계정 구조·OU·통합 결제의 토대 |
| SCP | OU/계정 권한 상한 강제(guardrail) |
| Control Tower | landing zone·가드레일·계정 팩토리 자동화 |
| AWS Config | 설정 준수 평가·이력·자동 교정 |
| Conformance Pack | Config 규칙 묶음을 조직 배포 |
| Firewall Manager | WAF/SG/Shield 정책 중앙 강제 |
| Service Catalog | 승인된 인프라 제품만 셀프서비스 |
| RAM | 리소스 교차 계정 공유 |

> 💡 **관련 이론**: 거버넌스의 정신은 *"preventive(예방) + detective(탐지) + responsive(대응)"* 가드레일의 조합이다. **SCP = 예방**(아예 못 하게), **Config 규칙 = 탐지**(어긋나면 발견), **Config 자동 교정/EventBridge = 대응**(되돌림). Control Tower는 이 셋을 landing zone에 패키징한다. 시험에서 "조직 전체에 이 통제를 강제" → SCP(권한) 또는 Firewall Manager(네트워크/WAF) 또는 Config Conformance Pack(준수)을 고른다.

### 거버넌스 4계층 정신 모델

문항은 거의 항상 "어느 평면의 도구가 답인가"를 가린다.

```
① 권한 경계 평면 — 무엇을 할 수 있나의 천장
      SCP / RCP        (권한 부여가 아니라 최대 경계)
② 베이스라인 평면 — 계정이 안전하게 태어나게
      Control Tower    (랜딩 존 · 컨트롤 · 계정 팩토리)
③ 증명 평면 — 지키고 있음을 증거로 보임
      Audit Manager ← Config / CloudTrail / Security Hub (증거 원천)
④ 운영 평면 — 일상 강제·교정·대응
      Firewall Manager / 태그·비용 거버넌스 / EventBridge 자동 교정

토대: 관리 계정(결제·조직만) · Audit 계정(탐지·증거) · Log Archive 계정(불변 로그)
      모든 보안 서비스는 위임 관리자로 Audit 계정에서 운영
```

이 순서는 *시간 축*이자 *비용 축*이다. 예방에서 막으면 비용이 0에 가깝고, 탐지 단계로 넘어가면 조사·대응 비용이 붙으며, 증명 단계에서 발견되면 규제·계약상 비용이 붙는다. 거버넌스 설계가 "가능하면 왼쪽 계층에서 끝내라"를 원칙으로 삼는 이유다.

Control Tower의 컨트롤도 이 축으로 나뉜다 — **예방(SCP)**, **탐지(Config 규칙)**, **능동(CloudFormation Hooks — 리소스가 만들어지기 *전에* IaC 단계에서 차단)**. "생성 전에 막아라"가 능동 컨트롤이고, "만들어진 것을 평가하라"가 탐지 컨트롤이다.

### SCP의 전형적 가드레일

- 루트 사용자 사용 거부, 특정 리전 외 거부, CloudTrail 비활성화 거부, 태그 없는 리소스 생성 거부, 특정 인스턴스 타입 외 거부, 미암호화 볼륨 생성 거부, 조직 밖으로의 스냅샷 공유 거부. SCP는 **권한 부여가 아니라 상한 제한**(Day 2 복습).

전형적 SCP 문장 세 개만 형태로 기억해 두면 대부분의 보기를 판별할 수 있다.

- **리전 잠금**: `aws:RequestedRegion`이 허용 목록 밖이면 Deny — 단, **글로벌 서비스와 us-east-1 예외**를 빼먹으면 콘솔·CloudFront·ACM·IAM이 깨진다.
- **탐지 회피 방어**: `cloudtrail:StopLogging`·`DeleteTrail`, `guardduty:DeleteDetector`, `config:StopConfigurationRecorder`, `securityhub:DisableSecurityHub`를 Deny — 단, **보안 유지보수 역할 하나는 `ArnNotLike` 조건으로 예외**를 남기고 그 역할의 사용을 CloudTrail로 감시한다.
- **조직 경계**: `ec2:ModifySnapshotAttribute`·`ModifyImageAttribute`·`ram:CreateResourceShare` 등을 `aws:PrincipalOrgID` 불일치 시 Deny.

### 나가는 문과 들어오는 문: SCP vs RCP

```
        [ 우리 조직 ]                        [ 외부 ]

  프린시펄 ──(스냅샷 공유·데이터 복사)──▶  외부 계정
      └── SCP + aws:PrincipalOrgID 로 차단   (나가는 문)

  우리 리소스 ◀──(리소스 정책 오설정으로 접근)── 외부 프린시펄
      └── RCP + aws:PrincipalOrgID 로 차단   (들어오는 문)
```

> 🔍 **더 깊이**: SCP와 RCP를 "같은 걸 두 번 하는 것"으로 오해하기 쉽지만 방향이 반대다. SCP는 *프린시펄이 속한 계정* 기준이라 **우리 사람이 밖으로 나가는 문**을 잠그고, RCP는 *리소스가 속한 계정* 기준이라 **밖의 사람이 우리 리소스로 들어오는 문**을 잠근다. 하나만 걸면 반대 방향이 열린 채 남는다. 실제 유출 사고의 상당수가 "권한은 최소화했는데 리소스 정책이 열려 있었다" 또는 "리소스는 잠갔는데 내부 프린시펄이 스냅샷을 공유했다"의 형태인 이유다. 다만 RCP는 지원 서비스가 제한적이므로, RCP가 닿지 않는 서비스는 SCP·리소스 정책·**IAM Access Analyzer 탐지**로 메워야 한다. "RCP를 켰으니 조직 경계는 끝났다"가 가장 위험한 판단이다.

### 헷갈리는 짝: 이름이 비슷한 거버넌스 도구들

| 요구 | 정답 도구 | 자주 섞이는 상대 |
|---|---|---|
| "권한의 최대 경계·리전/서비스 차단" | **SCP** | Config(탐지일 뿐) |
| "조직 리소스에 외부 접근 차단" | **RCP** | SCP(방향이 반대) |
| "다계정 베이스라인을 빠르게 깔기" | **Control Tower** | StackSets(배포 도구일 뿐) |
| "리소스 생성 *전에* IaC에서 차단" | **능동 컨트롤(CFN Hooks)** | Config(사후 평가) |
| "만들어진 리소스가 규칙을 지키는지" | **Config 규칙** | Security Hub 표준 |
| "CIS/PCI 규칙 세트를 다계정에 한 번에" | **Conformance Pack** | Audit Manager |
| "감사자 제출용 증거 자동 수집·보고서" | **Audit Manager** | Conformance Pack |
| "여러 계정 WAF/SG/NFW 일관 배포" | **Firewall Manager** | SCP |
| "승인된 인프라만 셀프서비스로" | **Service Catalog** | Control Tower |
| "리소스를 교차 계정 공유" | **RAM** | 리소스 정책 |
| "태그 키·값 표기 표준화" | **Tag Policy** | SCP |
| "태그 없으면 생성 차단" | **SCP** (`aws:RequestTag` + Null) | Tag Policy |
| "지출 급증(침해 신호) 조기 경보" | **Cost Anomaly Detection / Budgets** | GuardDuty |
| "여러 계정·리전의 Config 데이터를 한곳에" | **Config aggregator** | Security Hub |

실수가 몰리는 세 쌍만 따로 새긴다.

- **Conformance Pack vs Audit Manager**: 둘 다 CIS·PCI라는 이름을 단다. *규칙을 깔아 준수 상태를 만드는* 쪽이 Conformance Pack, *이미 만들어진 준수 상태를 증거로 포장하는* 쪽이 Audit Manager다. **Audit Manager는 증거를 생성하지 않는다** — Config·CloudTrail·Security Hub가 먼저 켜져 있어야 한다.
- **Tag Policy vs SCP**: Tag Policy는 *태그가 붙을 때 표준을 지키는가*를 본다. *태그 없이 만드는 것*을 막지 못한다. **차단이면 언제나 SCP.**
- **Config vs CloudTrail**: "지금·그때 상태가 옳은가"는 Config, "누가 그 변경을 호출했나"는 CloudTrail. 감사자는 대개 둘 다 요구한다.

> 🎯 **통합 시나리오 B**: "조직의 모든 계정에서 (1) S3 버킷이 암호화·TLS 강제되고, (2) 누구도 CloudTrail을 끄지 못하며, (3) 위반을 자동 발견·교정하라." 답: (1) **Config Conformance Pack**으로 `s3-bucket-server-side-encryption-enabled`·`s3-bucket-ssl-requests-only` 조직 배포 + 자동 교정, (2) **SCP**로 `cloudtrail:StopLogging`·`DeleteTrail` 거부(예방), (3) Config 비준수 → EventBridge → SSM/Lambda 자동 교정(대응). 예방(SCP)·탐지(Config)·대응(자동 교정)이 조직 전체에 전파.

## 두 도메인을 잇는 정신 모델

```
[데이터 보호: 한 계정에서 옳게]        [거버넌스: 조직 전체로 강제]
KMS(envelope, 키정책) ──┐
SSE-KMS / TLS 강제      ├──► 옳은 통제  ──► SCP(예방) ─────────┐
Object Lock(WORM)       │                  Config(탐지·교정) ──┼─► 모든 계정에
RDS/EBS 암호화          ┘                  Control Tower      │   자동 전파·유지
                                           Firewall Manager ──┘
감사: CloudTrail(KMS API) + Config(설정 이력)
```

> 🔍 **더 깊이**: 데이터 보호와 거버넌스의 진짜 시험 포인트는 *drift(이탈)*다. 한 번 올바르게 암호화·잠금해도 누군가 끄거나 새 계정이 빈 상태로 생기면 통제가 무너진다. 그래서 성숙한 설계는 "설정"이 아니라 "지속 강제"다 — Control Tower가 신규 계정에 가드레일을 자동 적용하고, Config가 drift를 끊임없이 평가하며, SCP가 애초에 위반을 불가능하게 만든다. "한 번 설정"하는 답보다 "조직 차원에서 자동·지속 강제"하는 답이 Specialty의 best다. 반대로 Control Tower가 관리하는 리소스를 콘솔에서 직접 손대면 *그 자체가 드리프트*가 되어 후속 컨트롤 적용이 막힌다 — 이때 답은 "랜딩 존 재적용 + 수동 변경 금지 규율"이다.

### 탐지 회피를 막는 다층 구조

"관리자가 로그를 끄거나 지우지 못하게"는 거의 매 회차 나오는 요구다. 공격자의 시도별로 어느 층이 막는지를 대응시키면 왜 네 겹이 다 필요한지 분명해진다.

| 공격자의 시도 | 막는 층 | 막지 못했다면 |
|---|---|---|
| CloudTrail 로깅 중지 | SCP Deny | 이후 모든 활동이 기록되지 않음 |
| 멤버 계정에서 추적 삭제 | **조직 CloudTrail**(멤버는 소유자 아님) | 계정 단위 증거 소멸 |
| S3의 로그 객체 삭제·덮어쓰기 | **Object Lock + MFA Delete** | 이미 쌓인 증거까지 소급 소멸 |
| 로그 KMS 키 삭제·정책 변경 | 전용 KMS + 키 정책 + SCP | 로그가 남아도 복호화 불가 |
| Config 레코더 중지 | SCP + Control Tower 필수 컨트롤 | 구성 이력 단절 → 감사 증거 공백 |
| SCP 자체를 떼어냄 | **관리 계정 접근 통제 + CloudTrail 감시** | 천장 자체가 사라짐 |

마지막 행이 급소다. **SCP를 지킬 수 있는 것은 SCP가 아니라 관리 계정의 접근 통제**다. 관리 계정 루트에 하드웨어 MFA, 관리 계정 IAM 주체 최소화, `organizations:DetachPolicy`·`DeletePolicy` 호출에 대한 실시간 경보 — 이 셋이 없으면 아래 층이 아무리 두꺼워도 위에서 통째로 걷힌다.

## 도메인 5·6 키워드 → 서비스 번역표

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---|---|
| "키 사용 감사·정책 통제가 필요한 암호화" | SSE-KMS(CMK) + CloudTrail |
| "이중 계층 암호화" | DSSE-KMS |
| "키를 AWS에 보관하지 않는다" | SSE-C / 클라이언트 측 암호화 |
| "전용 HSM·단독 소유·FIPS 140-2 L3" | CloudHSM / KMS custom key store |
| "외부 키 관리 시스템의 키로" | KMS 외부 키 스토어(XKS) |
| "SSE-KMS인데 KMS 비용이 과하다" | S3 Bucket Keys |
| "여러 리전에서 같은 키로" | KMS 다중 리전 키 |
| "특정 서비스를 경유할 때만 키 사용" | `kms:ViaService` 조건 |
| "테넌트·용도별로 복호화를 분리" | `kms:EncryptionContext` 조건 |
| "누구도(루트 포함) N년간 삭제 불가" | S3 Object Lock **Compliance** |
| "실수 방지, 필요 시 예외 허용" | S3 Object Lock **Governance** |
| "소송·조사로 무기한 동결" | Legal Hold |
| "버전 삭제에 추가 인증" | MFA Delete |
| "백업이 지워지지 않게" | AWS Backup Vault Lock |
| "평문 HTTP 거부·TLS 강제" | 버킷 정책 `aws:SecureTransport` Deny |
| "인증서 자동 갱신" | ACM (CloudFront는 us-east-1, imported는 자동 갱신 안 됨) |
| "사내 신뢰 체인 인증서" | AWS Private CA |
| "이미 만든 EBS/RDS를 암호화" | 스냅샷 → 암호화 복사 → 복원/새 볼륨 |
| "앞으로 만들 볼륨은 자동 암호화" | 계정·리전 EBS 기본 암호화 |
| "원 계정이 뚫려도 사본이 남게" | 다른 계정으로 S3 복제 / 교차 계정 백업 |
| "조직 전체에서 못 하게(예방)" | SCP |
| "조직 리소스에 외부 접근 차단" | RCP |
| "신규 계정에 가드레일 자동·랜딩 존" | Control Tower (+ Account Factory) |
| "생성 전에 IaC에서 차단" | 능동 컨트롤(CloudFormation Hooks) |
| "규칙 묶음을 조직에 한 번에 배포" | Conformance Pack |
| "감사자 제출 증거·프레임워크 보고서" | Audit Manager |
| "여러 계정 WAF/SG/NFW 일관 강제" | Firewall Manager |
| "승인된 제품만 셀프서비스" | Service Catalog |
| "리소스 교차 계정 공유" | RAM |
| "태그 키·값 표기 표준화" | Tag Policy |
| "필수 태그 없으면 생성 차단" | SCP (`aws:RequestTag` + Null) |
| "지출 급증이 침해 신호" | Cost Anomaly Detection / Budgets |
| "다계정 Config 데이터 한곳에" | Config aggregator |

## 도메인 5·6 함정 총정리

> ⚠️ **데이터 보호 함정**:
> - **CloudFront용 ACM 인증서는 us-east-1**에만. ALB용은 해당 리전.
> - **가져온 인증서는 자동 갱신되지 않는다.**
> - KMS는 **envelope encryption** — 대용량을 직접 암호화하지 않는다.
> - **키 정책이 root를 신뢰해야** IAM 정책 위임이 성립한다.
> - **키 삭제는 7~30일 대기** — 그 전엔 취소·disable로 복구 가능.
> - at-rest(SSE/KMS)와 in-transit(TLS·`aws:SecureTransport`)은 **별개 통제** — 둘 다.
> - SSE-S3는 키 감사·정책 통제가 약함 → 통제 요구 시 **SSE-KMS**.
> - **이미 만든 EBS/RDS는 설정으로 암호화되지 않는다** — 스냅샷 재암호화 경로.
> - Object Lock·MFA Delete·복제는 **버전 관리가 전제**.
> - **Compliance 모드는 되돌릴 수 없다** — 기간 단축 불가, 연장만 가능.
> - AWS 관리형 키로 암호화된 스냅샷은 **다른 계정에 그대로 공유되지 않는다**(고객 관리형 키로 재암호화 필요).

> ⚠️ **거버넌스 함정**:
> - **SCP는 권한을 부여하지 않는다** — 상한만 제한.
> - **SCP는 관리 계정 프린시펄에 미적용** → 관리 계정에 워크로드 금지.
> - **서비스 연결 역할의 호출은 SCP 평가에서 빠진다.**
> - **RCP는 지원 서비스가 제한적** — "모든 서비스의 조직 경계를 강제"는 틀린 서술.
> - 리전 잠금 SCP에서 **글로벌 서비스·us-east-1 예외 누락** 시 콘솔·CloudFront·ACM 파손.
> - **컨트롤은 OU에 적용** — 계정 개별 적용은 신규 계정 누락.
> - **Control Tower 관리 리소스를 콘솔에서 수정 = 드리프트** → 랜딩 존 재적용.
> - **Audit Manager는 증거를 생성하지 않는다** — Config/CloudTrail/Security Hub 선행 필수.
> - **현재 COMPLIANT는 기간 증명이 아니다** — 이력 증명엔 Config 구성 이력 + CloudTrail.
> - **로그·증거는 소급 생성 불가** — 감사 요구 전에 켜 둔 것만 증거가 된다.
> - **Firewall Manager는 Config가 필요**하고, `RemediationEnabled`가 꺼져 있으면 보고만 한다.
> - **Tag Policy는 무태그 생성을 막지 못한다** — 차단은 SCP의 몫.
> - **auto-enable은 서비스마다 따로** — 하나 빠지면 그 서비스만 신규 계정에서 꺼진 채 남는다.

> 📚 **사례**: 2014년 6월, 영국의 코드 호스팅 업체 **Code Spaces**는 공격자가 자사 AWS 콘솔 제어판에 접근한 뒤 금전을 요구하면서 사고가 시작됐다. 회사가 계정 통제권을 되찾으려 시도하자 공격자는 미리 만들어 둔 백업 계정으로 **EBS 스냅샷·S3 버킷·AMI·인스턴스 대부분을 삭제**했고, 데이터와 백업이 같은 통제 평면 안에 있었기 때문에 한 번의 계정 탈취가 곧 전사 소멸이 됐다. 회사는 며칠 만에 문을 닫았다. 이 사건이 멀티계정 거버넌스 교재의 출발점처럼 인용되는 이유는 한 문장으로 요약된다 — **"백업과 로그는 그것을 만든 주체가 지울 수 없는 곳에 있어야 한다."** 오늘날의 답이 곧 Log Archive 계정 분리, Object Lock/Vault Lock, 교차 계정 백업, 그리고 SCP로 삭제 액션 자체를 막는 구조다. 통제를 *같은 계정 안의 다른 권한*으로 두면 계정이 뚫리는 순간 함께 뚫리고, *다른 계정의 다른 권한*으로 두어야 비로소 경계가 생긴다.

## 정리하며

도메인 5와 6을 한 문장으로 줄이면 **"한 계정에서 옳게 잠그고, 조직 전체가 그 상태에서 벗어날 수 없게 만든다"**이다.

거버넌스의 본질을 한 번 더 짚어 두자. 거버넌스는 *"좋은 상태를 만드는 일"*이 아니라 *"좋은 상태에서 벗어날 수 없게 만드는 일"*이다. 보안 설정을 옳게 하는 것은 한 사람이 하루면 하지만, 수백 계정이 수년 뒤에도 그 상태를 유지하게 만드는 것은 구조로만 가능하다. SCP는 벗어남을 금지하고, Control Tower는 벗어난 상태로 태어나지 못하게 하며, Config·Audit Manager는 벗어남을 발견·증명하고, Firewall Manager와 자동 교정은 벗어난 것을 되돌린다.

그래서 보기 중 **"사람이 절차를 지킨다", "정기적으로 점검한다", "각 계정 관리자가 설정한다"**는 형태는 거의 항상 오답이다. 반대로 지문에 **"모든 계정", "조직 전체", "앞으로 만들어질", "신규 계정"**이 보이면 계정 단위 도구는 버리고 조직 도구를 먼저 떠올려야 한다. 이 한 줄이 도메인 6 문항의 상당수를 자동으로 처리한다.

## 한 줄 요약 체크리스트

- [ ] envelope encryption(KMS가 DEK를, DEK가 데이터를)의 원리를 설명할 수 있는가
- [ ] KMS 키 정책이 1차 권한 원천이고 Grant로 임시 위임함을 아는가
- [ ] SSE-S3/SSE-KMS/SSE-C/DSSE, CloudHSM vs KMS, custom key store를 구분하는가
- [ ] S3 Object Lock(WORM)·MFA Delete·`aws:SecureTransport`로 변조/평문을 막는가
- [ ] SCP=예방, Config=탐지·교정, Control Tower=landing zone 가드레일을 구분하는가
- [ ] Conformance Pack·Firewall Manager로 조직 전체에 통제를 강제하는가
- [ ] CloudTrail로 KMS API 사용을 감사하는가(키 삭제는 disable 후 대기)

---

## 📝 연습 문제

**문제 1.** 규제 요건상 키 자료를 조직이 단독 소유·통제하고(전용 FIPS 140-2 L3 HSM), 그 키로 S3를 암호화하며, 키 사용 내역을 감사해야 한다. 가장 적절한 조합은?

A) SSE-S3 + 기본 키 + Macie  
B) CloudHSM 기반 KMS custom key store의 CMK + S3 SSE-KMS + CloudTrail로 KMS API 감사  
C) SSE-C(고객 제공 키)만 사용  
D) AWS managed key + 자동 로테이션  

**정답: B**  
해설: 전용 단일 테넌트 FIPS 140-2 L3 HSM에서 키 자료를 단독 소유하려면 CloudHSM 기반 KMS custom key store를 쓰고, 그 CMK로 S3 SSE-KMS 암호화를 적용하며, CloudTrail로 Decrypt/GenerateDataKey 호출을 감사한다. SSE-S3는 AWS가 키를 관리해 단독 소유가 아니고, SSE-C는 키 전달·감사 통제가 약하며, AWS managed key는 키 정책 통제·전용 HSM 요건을 못 채운다.

---

**문제 2.** KMS가 대용량 S3 객체를 직접 암호화하지 않고 데이터 키를 발급하는 방식의 이름과 이유는?

A) 대칭 키 회전 — 비용 절감  
B) envelope encryption — KMS가 데이터 키(DEK)를 마스터 키로 암호화하고, 실제 데이터는 평문 DEK로 로컬 암호화해 대용량을 KMS에 보내지 않으면서도 키를 KMS가 통제  
C) client-side hashing — 무결성 확보  
D) TLS 터널링 — 전송 보호  

**정답: B**  
해설: KMS는 envelope encryption을 사용한다. GenerateDataKey가 평문 DEK와 암호화된 DEK를 반환하면, 데이터는 로컬에서 평문 DEK로 암호화하고 암호화된 DEK를 함께 저장한다. 마스터 키는 KMS를 떠나지 않으므로 대용량 전송 없이 키 통제가 가능하다. 나머지는 KMS 데이터 암호화 메커니즘과 무관하다.

---

**문제 3.** 조직의 모든 계정에서 누구도 CloudTrail을 끄지 못하게 하려 한다. 가장 효과적인 예방 통제는?

A) Config 규칙으로 사후 탐지만 한다  
B) SCP로 `cloudtrail:StopLogging`·`cloudtrail:DeleteTrail`을 Deny해 애초에 불가능하게 한다  
C) IAM 사용자마다 정책을 수동으로 붙인다  
D) GuardDuty로 모니터링한다  

**정답: B**  
해설: "애초에 못 하게" 하는 예방 통제는 SCP로 해당 API를 조직/OU 수준에서 Deny하는 것이다. Config 규칙·GuardDuty는 사후 탐지일 뿐 행위를 막지 못하고, IAM 정책 수동 부착은 다계정 규모에서 누락·드리프트가 생긴다. SCP의 명시적 Deny는 어떤 IAM Allow보다 우선해 조직 전체에 일관 강제된다.

---

**문제 4.** S3 버킷의 평문 HTTP 접근을 거부하고 TLS만 허용하려 한다. 올바른 방법은?

A) 버킷을 퍼블릭으로 설정  
B) 버킷 정책에 `aws:SecureTransport`가 false면 Deny하는 조건을 추가  
C) NACL로 80 포트를 차단  
D) SSE-KMS만 켜면 자동으로 TLS가 강제된다  

**정답: B**  
해설: 전송 중 암호화(TLS) 강제는 버킷 정책에서 `aws:SecureTransport` 조건이 false인 요청을 Deny하는 것이 표준이다. 퍼블릭 설정은 정반대이고, NACL 80 차단은 S3 엔드포인트 트래픽에 적용되지 않으며, SSE-KMS는 저장 중 암호화로 전송 중 보호(TLS)와 별개다. at-rest와 in-transit은 분리된 통제다.

---

**문제 5.** 신규로 추가되는 계정들에도 표준 가드레일(로깅·암호화·리전 제한)이 자동 적용되는 landing zone을 빠르게 구축하려 한다. 가장 적절한 서비스는?

A) 계정마다 수동으로 Config·SCP를 설정  
B) AWS Control Tower — landing zone·가드레일·계정 팩토리로 신규 계정에 통제를 자동 적용  
C) CloudFormation StackSets만 사용  
D) IAM Identity Center만 사용  

**정답: B**  
해설: Control Tower는 다계정 landing zone과 예방·탐지 가드레일, 계정 팩토리(Account Factory)를 제공해 신규 계정에 표준 통제를 자동 적용한다. 수동 설정은 드리프트·누락이 발생하고, StackSets는 배포 도구일 뿐 가드레일 프레임워크가 아니며, Identity Center는 접근 관리로 거버넌스 landing zone 전체를 대체하지 못한다.

---

**문제 6.** 실수로 KMS CMK 삭제를 요청했다가 그 키로 암호화된 데이터가 남아 있음을 알았다. 데이터 손실을 막는 올바른 조치는?

A) 즉시 새 키를 만들어 같은 ID로 교체한다  
B) 키 삭제는 7~30일 대기 기간이 있으므로, 그 기간 내에 삭제를 취소(cancel)하거나 disable로 되돌린다  
C) 데이터를 복구할 수 없으므로 포기한다  
D) IAM 정책을 수정한다  

**정답: B**  
해설: KMS 키 삭제는 즉시 일어나지 않고 7~30일의 대기 기간을 거치며, 그 안에 삭제를 취소하거나 키를 disable 상태로 두면 데이터 손실을 막을 수 있다. 키 ID는 재사용·복제할 수 없고, 대기 기간이 있으므로 즉시 포기할 필요가 없으며, IAM 정책 수정은 삭제 스케줄과 무관하다. 이 대기 기간이 실수 방지 장치다.

---
