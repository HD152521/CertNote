# Day 67 - 백업: AWS Backup·Cross-Region Copy — WORM의 법적 기원, Vault Lock의 불가역성, 멀티 계정 백업 거버넌스

1990년대 월스트리트의 한 증권사가 고객 이메일을 삭제했다는 의혹으로 SEC 조사를 받았다. 이 사건은 미국 증권 규제에 **"한 번 기록하면 누구도 지우거나 바꿀 수 없는 보관(WORM, Write Once Read Many)"**을 의무화하는 SEC Rule 17a-4(f)를 낳았다. 광디스크나 특수 테이프로만 충족되던 이 요구사항을, AWS는 **Backup Vault Lock의 Compliance 모드**라는 소프트웨어로 구현했다 — 활성화하면 AWS의 root 사용자조차 백업을 지울 수 없다.

SAP-C02 시험에서 백업은 단순한 "스냅샷 켜기"가 아니다. Pro의 관점은 **수십~수백 개 계정에 흩어진 리소스의 백업을 중앙에서 정책으로 강제하고, 규제가 요구하는 불가역성과 격리를 증명**하는 거버넌스 문제다. 오늘은 WORM의 법적 기원, Vault Lock의 두 모드가 가진 불가역성의 차이, 그리고 AWS Organizations를 통한 멀티 계정 백업 거버넌스를 도구 레벨까지 분해한다.

## AWS Backup — 흩어진 백업을 하나의 정책으로

AWS Backup 이전에는 서비스마다 백업 방식이 제각각이었다. EBS는 DLM(Data Lifecycle Manager) 스냅샷, RDS는 자동 백업 설정, DynamoDB는 별도 On-Demand 백업으로 각자 관리됐다. 계정이 수십 개로 늘면 "어느 리소스가 백업되고 있는가"를 아무도 한눈에 알 수 없었다. **AWS Backup은 이 파편화를 중앙 정책 엔진으로 통합**한다.

| 개념 | 역할 |
|------|------|
| **Backup Plan** | 일정(cron)·보존 기간·복사 규칙을 정의하는 정책 |
| **Backup Vault** | KMS로 암호화된 Recovery Point 저장소 |
| **Vault Lock** | WORM·삭제 금지를 강제(Governance / Compliance) |
| **Backup Policy** | Organizations 차원에서 모든 계정에 Plan을 배포 |
| **Recovery Point** | 실제 백업 산출물(스냅샷·이미지) |
| **Continuous Backup** | RDS·Aurora·S3의 시점 복구(PITR) 지원 |

지원 서비스는 폭넓다 — EBS·EC2(AMI)·RDS·Aurora·DynamoDB·EFS·FSx·S3·DocumentDB·Neptune·Storage Gateway·Redshift·Timestream·SAP HANA on EC2. **태그 기반 선택(tag-based resource selection)**으로 "Environment=prod 태그가 붙은 모든 리소스"를 한 Plan에 자동 포함시킬 수 있어, 새 리소스가 생겨도 태그만 맞으면 자동으로 백업 대상이 된다.

> 💡 **관련 이론**: AWS Backup의 설계는 **선언적 정책(declarative policy)** 패러다임이다. "이 리소스를 백업하라"는 명령형(imperative)이 아니라, "이 태그를 가진 모든 리소스는 매일 백업되고 35일 보존되며 다른 리전에 복사되어야 한다"는 원하는 상태(desired state)를 선언하면 시스템이 그 상태를 유지한다. Kubernetes의 desired-state reconciliation, Terraform의 선언적 IaC와 같은 사상이다. 이 방식의 강점은 **새로 추가되는 리소스가 자동으로 정책에 편입**된다는 점 — 명령형 백업은 리소스가 생길 때마다 누군가 백업을 켜줘야 하지만, 태그 기반 선언적 정책은 누락을 구조적으로 방지한다. 시험에서 "새 리소스도 자동으로 백업 정책에 포함"이 보이면 태그 기반 선택이 답이다.

> 🔍 **더 깊이**: AWS Backup과 서비스 네이티브 백업은 공존한다. RDS는 AWS Backup 없이도 자체 자동 백업(최대 35일)과 PITR을 제공하고, EBS는 DLM으로 스냅샷을 관리할 수 있다. 그렇다면 언제 AWS Backup을 쓰는가? **여러 서비스를 가로지르는 중앙 정책·멀티 계정 거버넌스·Vault Lock WORM·Cross-Account Copy가 필요할 때**다. 단일 서비스·단일 계정이면 네이티브 백업으로 충분하지만, "Organization 전체에 일관된 백업 정책을 강제하고 컴플라이언스를 증명"해야 하면 AWS Backup이 정답이다. 시험은 이 경계를 자주 묻는다 — "수십 개 계정의 EBS·RDS·DDB를 통합 정책으로"가 보이면 AWS Backup이다.

## Vault Lock — 불가역성의 두 단계

백업이 존재해도 누군가(악의적 내부자·랜섬웨어·실수)가 지울 수 있다면 진정한 보호가 아니다. **Vault Lock**은 Vault에 보관된 백업을 정책으로 잠가 삭제·변경을 막는다. 두 모드의 차이가 시험의 핵심이다.

| 모드 | 잠금 후 변경 가능 여부 | 사용처 |
|------|----------------------|--------|
| **Governance** | IAM 권한(`backup:DeleteRecoveryPoint` 등 특정 권한)이 있으면 관리자가 해제·삭제 가능 | 내부 거버넌스·실수 방지 |
| **Compliance** | 잠금 확정 후 **AWS root를 포함한 누구도** 변경·삭제 불가, 보존 기간 만료까지 절대 불가역 | SEC·FINRA·HIPAA 등 규제 WORM |

핵심은 **Compliance 모드의 불가역성**이다. Compliance Lock에는 `changeable-for-days`라는 유예(cooling-off) 기간이 있어, 그 기간 동안은 설정을 조정·취소할 수 있지만 일단 유예가 지나 잠금이 확정되면 **그 누구도 — AWS 본사 root 사용자도, 지원팀도 — 백업을 지우거나 보존 기간을 줄일 수 없다**. 이 불가역성이 곧 규제 준수의 법적 증거가 된다.

> 💡 **관련 이론**: Vault Lock Compliance 모드의 "root조차 못 바꾸는" 설계는 보안 공학의 **불변성(immutability)**과 **권한 분리(separation of privilege)** 원칙의 극단적 적용이다. 일반적으로 root는 모든 것을 할 수 있는 최고 권한이지만, WORM 보장을 위해서는 **"가장 강한 권한도 막아야"** 한다 — 그렇지 않으면 root 계정이 탈취되거나 내부자가 악용할 경우 백업이 통째로 사라질 수 있기 때문이다. 이는 랜섬웨어 방어의 핵심이기도 하다: 랜섬웨어가 관리자 권한을 탈취해도 Compliance Lock된 백업은 손댈 수 없어, 몸값을 내지 않고 복구할 최후의 보루가 된다. 동일 철학이 S3 Object Lock Compliance 모드에도 적용된다.

> 📚 **사례**: 2021년 미국 최대 송유관 운영사 **Colonial Pipeline 랜섬웨어 사건**에서 회사는 결국 약 440만 달러의 몸값을 비트코인으로 지불했다(일부는 FBI가 추적·회수). 만약 모든 백업이 변경 불가능한 immutable storage에 격리돼 있었다면 몸값 없이 복구가 가능했을 것이다. 이 사건 이후 immutable backup(WORM)은 "있으면 좋은 것"에서 "랜섬웨어 시대의 필수"로 격상됐다. AWS Backup Vault Lock Compliance + Cross-Account Copy 조합이 바로 이 시나리오의 정답 아키텍처다 — 백업을 별도 계정(워크로드 계정이 탈취돼도 접근 불가)에 불가역으로 보관한다. 시험에서 "랜섬웨어 대비·내부자도 삭제 불가"가 보이면 Compliance Lock + Cross-Account가 시그널이다.

> ⚠️ **함정**: Governance와 Compliance를 "둘 다 삭제 금지"로 뭉뚱그리면 틀린다. Governance 모드는 **적절한 IAM 권한을 가진 관리자가 잠금을 우회·해제**할 수 있다 — 실수로 인한 삭제는 막지만 악의적 관리자나 탈취된 권한은 막지 못한다. 진짜 규제 WORM(누구도 못 바꿈)은 Compliance 모드뿐이다. 시험에서 "규제 준수·root도 변경 불가·7년 보관"은 Compliance, "실수 방지·관리자는 예외적으로 해제 가능"은 Governance로 정확히 갈린다.

## Cross-Region·Cross-Account Copy — 격리가 핵심

백업이 같은 리전·같은 계정에 있으면 그 리전 장애나 계정 탈취 시 백업도 함께 사라진다. AWS Backup은 Backup Plan의 **Copy Action**으로 Recovery Point를 다른 리전·다른 계정의 Vault로 자동 복사한다.

- **Cross-Region Copy**: 리전 전체 장애 대비. 소스·대상 양쪽 KMS 키 권한 필요.
- **Cross-Account Copy**: 워크로드 계정과 분리된 전용 **백업 계정**에 보관. 워크로드 계정이 탈취돼도 백업은 안전.

> 🔍 **더 깊이**: Cross-Account Copy에서 가장 자주 막히는 지점이 **KMS 키 권한**이다. 백업은 Vault의 KMS 키로 암호화되는데, 대상 계정의 Vault가 쓰는 KMS 키 정책에 소스 계정이 복호화·복사할 권한을 명시적으로 부여해야 한다. 또 대상 Vault의 액세스 정책(resource-based policy)에도 소스 계정의 복사를 허용해야 한다. 이 권한 체인 중 하나라도 빠지면 복사가 조용히 실패한다. 시험에서 "Cross-Region/Account Copy가 실패한다"는 시나리오의 정답은 거의 항상 "KMS 키 정책 또는 Vault 액세스 정책에 권한 추가"다. 단순 IAM 사용자 권한이 아니라 **리소스 기반 정책(KMS 키 정책·Vault 정책)**이라는 점이 함정이다.

## 멀티 계정 거버넌스 — Organizations Backup Policy

수십~수백 개 계정에서 "모든 계정이 동일한 백업 표준을 따르게" 하려면 계정마다 수동 설정하는 것은 불가능하다. **AWS Organizations의 Backup Policy**가 이를 해결한다. 관리 계정(또는 위임 관리자)이 Backup Policy를 정의하고 OU(Organizational Unit)에 부착하면, 그 아래 모든 계정이 해당 백업 정책을 강제로 상속한다.

```
[Management Account / 위임 관리자]
        │ Backup Policy 정의·부착
        ▼
   [Root → OU: Production]
        ├── [App Account 1] EBS·RDS·DDB ──┐
        ├── [App Account 2] EBS·RDS·DDB ──┤ 각 계정 Backup Plan 자동 상속
        └── [App Account N] ...           │
                                          ▼ Cross-Account Copy
                          [Backup Account (격리)]
                                          │ Cross-Region Copy
                                          ▼
                          [DR Region Vault + Compliance Lock]
```

> 💡 **관련 이론**: Organizations Backup Policy는 **SCP(Service Control Policy)**와 같은 정책 상속(policy inheritance) 메커니즘 위에 서 있다. SCP가 "무엇을 할 수 없는가(권한 경계)"를 OU 계층으로 내려보낸다면, Backup Policy는 "무엇을 백업해야 하는가(운영 표준)"를 같은 계층으로 내려보낸다. 둘 다 상위 OU의 정책이 하위에 상속·결합되는 구조라, 멀티 계정 거버넌스의 **중앙 통제 + 분산 실행** 패턴을 따른다. Control Tower로 Landing Zone을 구성하면 이 백업 정책을 가드레일로 자동 배포할 수 있다. 시험에서 "수백 계정에 백업 표준을 일괄 강제"가 보이면 Organizations Backup Policy가 정답이다.

> 🔍 **더 깊이**: 백업이 정책대로 실제로 실행되는지 검증하는 것이 **Backup Audit Manager**다. "모든 prod 리소스는 매일 백업 + 35일 보존 + Cross-Region 복사"라는 컨트롤(rule)을 정의하면, Audit Manager가 실제 백업 상태를 이 컨트롤과 대조해 **미준수 리소스(백업 누락·보존 부족·복사 누락)를 자동 식별**하고 리포트를 생성한다. 위반은 Security Hub로 통합해 중앙에서 알림받을 수 있다. 즉 "정책 정의(Backup Policy) → 실행(Backup Plan) → 검증(Audit Manager) → 알림(Security Hub)"의 폐루프가 완성된다. 시험에서 "백업이 정책대로 되고 있는지 자동 평가·미준수 식별"이 보이면 Backup Audit Manager가 직답이다.

## 서비스별 백업·복구 옵션의 차이

같은 "백업"이라도 서비스마다 시점 복구(PITR) 지원·보존 한계가 다르다. 시험은 이 숫자들을 직접 묻는다.

| 서비스 | 백업·복구 옵션 | 핵심 숫자 |
|--------|---------------|----------|
| **EBS** | Snapshot(DLM 또는 AWS Backup) | 증분 스냅샷 |
| **RDS** | 자동 백업 + Manual Snapshot + PITR | 자동 백업 최대 **35일** |
| **Aurora** | Continuous + Snapshot | PITR **1초 단위** |
| **DynamoDB** | On-Demand + PITR | PITR **최대 35일** |
| **S3** | Versioning + CRR + Object Lock | Object Lock = WORM |
| **EFS** | AWS Backup | - |

> ⚠️ **함정**: S3의 백업·보호는 다른 서비스와 결이 다르다. S3는 **Versioning(버전 관리)·CRR(Cross-Region Replication)·Object Lock(WORM)**이라는 자체 메커니즘이 먼저 있고, AWS Backup의 S3 지원은 비교적 최근에 추가됐다. "S3 객체를 WORM으로 보관"은 AWS Backup이 아니라 **S3 Object Lock Compliance 모드**가 직답이다. 또 "S3 데이터를 다른 리전에 비동기 복제"는 **CRR**이지 AWS Backup이 아니다. 시험에서 S3가 등장하면 먼저 S3 네이티브 기능(Versioning·CRR·Object Lock)을 떠올리고, 그 다음 AWS Backup을 고려해야 한다.

## 정리하며

AWS Backup은 서비스·계정에 파편화된 백업을 **태그 기반 선언적 정책**으로 중앙 통합하는 거버넌스 엔진이다. Vault Lock은 백업의 불가역성을 두 단계로 제공하며, Governance는 권한 있는 관리자가 해제 가능하지만 **Compliance는 root조차 변경 불가**한 진짜 WORM(SEC 17a-4·FINRA·HIPAA 대응)이다. Cross-Region/Account Copy로 백업을 격리하면 리전 장애·랜섬웨어·계정 탈취에도 살아남고, Organizations Backup Policy로 수백 계정에 표준을 강제하며 Backup Audit Manager로 준수를 검증한다.

SAP 시험 단골 매핑: (1) "여러 서비스·계정 통합 백업 정책" → **AWS Backup**, (2) "root도 변경 불가·규제 7년 보관" → **Vault Lock Compliance**, (3) "실수 방지·관리자는 해제 가능" → **Vault Lock Governance**, (4) "랜섬웨어·계정 탈취 대비 백업 격리" → **Cross-Account Copy + Compliance Lock**, (5) "수백 계정에 백업 표준 일괄 강제" → **Organizations Backup Policy**, (6) "백업 정책 준수 자동 평가·미준수 식별" → **Backup Audit Manager**, (7) "S3 객체 WORM" → **S3 Object Lock**, (8) "Cross-Account Copy 실패" → **KMS 키 정책·Vault 액세스 정책 권한**. 다음 day는 백업·복원을 넘어 복원력을 능동적으로 검증하는 도구(Resilience Hub·FIS·DRS)를 파고든다.

---

## 📝 연습 문제

**문제 1.** 한 금융사가 규제(SEC Rule 17a-4)에 따라 거래 백업을 7년간 **누구도 — AWS root 사용자조차 — 삭제·변경할 수 없게** 보관해야 한다. 가장 적합한 구성은?

A) Backup Vault Governance Lock

B) Backup Vault Compliance Lock

C) S3 Glacier Deep Archive

D) RDS 자동 백업 35일 + Manual Snapshot

**정답: B**

해설: Compliance 모드만이 유예 기간 종료 후 root를 포함한 누구도 백업을 삭제·변경할 수 없는 진짜 WORM을 보장하며, 이것이 SEC 17a-4·FINRA 4511 같은 규제 요구를 법적으로 충족한다. A(Governance)는 적절한 IAM 권한을 가진 관리자가 해제할 수 있어 "누구도 불가" 요건을 못 맞춘다. C(Glacier)는 저렴한 저장 계층일 뿐 변경 불가 정책 자체를 강제하지 않는다(Glacier에 Vault Lock을 별도로 걸 수는 있으나 보기의 의도는 저장소). D는 35일 한계와 변경 가능성 때문에 7년 불가역 요건에 부적합하다. 함정: "root도 불가·규제 준수"는 Compliance 모드의 직답이다.

---

**문제 2.** 한 기업이 200개 계정으로 구성된 Organization에서 모든 production 계정이 동일한 백업 정책(매일 백업·35일 보존·Cross-Region 복사)을 따르도록 일괄 강제하려 한다. 가장 효율적인 방법은?

A) 각 계정 관리자가 수동으로 Backup Plan을 생성한다

B) AWS Organizations Backup Policy를 정의해 Production OU에 부착한다

C) 계정마다 Lambda로 백업을 트리거한다

D) Trusted Advisor로 백업 누락을 점검한다

**정답: B**

해설: Organizations Backup Policy는 관리 계정(또는 위임 관리자)이 정책을 정의해 OU에 부착하면 그 아래 모든 계정이 백업 정책을 강제 상속하는 메커니즘으로, SCP와 같은 정책 상속 구조를 따른다. 200개 계정을 중앙에서 일괄 통제하므로 가장 효율적이다. A는 200번 수동 작업으로 누락·드리프트가 불가피하고, C는 백업 인프라를 손수 재구현하는 안티패턴이며, D는 점검 도구일 뿐 정책을 강제하지 못한다. 함정: "수백 계정에 표준 일괄 강제"는 Organizations Backup Policy의 직답이다.

---

**문제 3.** 한 회사가 워크로드 계정이 랜섬웨어로 탈취되더라도 백업만은 복구 가능하도록 보호하려 한다. 가장 견고한 아키텍처는?

A) 같은 계정의 다른 리전에 Cross-Region Copy만 한다

B) Backup을 별도 백업 계정으로 Cross-Account Copy하고 대상 Vault에 Compliance Lock을 적용한다

C) S3 Versioning을 켠다

D) Governance Lock을 적용한다

**정답: B**

해설: 랜섬웨어가 워크로드 계정의 관리자 권한을 탈취해도, 백업이 **별도 계정(Cross-Account)**에 있고 그 Vault가 **Compliance Lock(root도 삭제 불가)**이면 공격자가 백업에 손댈 수 없어 몸값 없이 복구할 수 있다. A는 같은 계정이라 계정이 탈취되면 다른 리전 백업도 함께 노출된다. C(Versioning)는 객체 덮어쓰기 보호일 뿐 계정 탈취 시 삭제를 막지 못한다. D(Governance)는 권한 있는(탈취된) 관리자가 해제할 수 있어 부족하다. 함정: "계정 탈취·랜섬웨어 대비"는 Cross-Account + Compliance Lock의 조합 신호다.

---

**문제 4.** 한 팀이 AWS Backup의 Cross-Account Copy를 설정했으나 복사가 계속 실패한다. 가장 가능성 높은 원인과 해법은?

A) IAM 사용자에게 AdministratorAccess를 부여한다

B) 대상 계정 Vault의 KMS 키 정책과 Vault 액세스 정책에 소스 계정 권한을 추가한다

C) Backup Plan의 cron 일정을 변경한다

D) 소스 리전을 us-east-1로 바꾼다

**정답: B**

해설: Cross-Account Copy는 백업이 대상 Vault의 KMS 키로 암호화되므로, 대상 계정의 KMS 키 정책에 소스 계정의 복호화·복사 권한을, 대상 Vault의 액세스(리소스 기반) 정책에 소스 계정의 복사 허용을 명시해야 한다. 이 리소스 기반 정책 체인 중 하나라도 빠지면 복사가 조용히 실패한다. A는 IAM 사용자 권한일 뿐 리소스 기반 정책 문제를 해결하지 못하고, C·D는 무관하다. 함정: Cross-Account Copy 실패는 "IAM 권한"이 아니라 "KMS 키 정책·Vault 액세스 정책(리소스 기반)" 문제다.

---

**문제 5.** 한 조직이 "모든 prod 리소스가 매일 백업되고 35일 보존되며 Cross-Region 복사되는지" 자동으로 검증하고 미준수 리소스를 식별하려 한다. 가장 적합한 도구는?

A) Trusted Advisor

B) Backup Audit Manager

C) AWS Config 수동 규칙

D) CloudTrail

**정답: B**

해설: Backup Audit Manager는 "매일 백업 + 35일 보존 + Cross-Region 복사" 같은 컨트롤을 정의하면 실제 백업 상태를 이 컨트롤과 대조해 미준수 리소스를 자동 식별하고 리포트를 생성하며, Security Hub로 알림을 통합할 수 있다. A(Trusted Advisor)는 백업 정책 준수 평가 기능이 없고, C(Config)는 일반 구성 평가 도구로 백업 전용 컨트롤을 직접 제공하지 않으며, D(CloudTrail)는 API 감사 로그일 뿐이다. 함정: "백업 정책 준수 자동 평가·미준수 식별"은 Backup Audit Manager의 직답이다.

---

**문제 6.** 한 회사가 새로 생성되는 모든 EBS·RDS 리소스가 사람의 개입 없이 자동으로 백업 정책에 포함되기를 원한다. 가장 적합한 접근은?

A) 리소스가 생길 때마다 관리자가 수동으로 Backup Plan에 추가한다

B) Backup Plan에서 태그 기반 리소스 선택(예: Environment=prod)을 사용한다

C) 각 서비스의 네이티브 백업을 개별 설정한다

D) CloudFormation으로 매번 백업을 명시한다

**정답: B**

해설: AWS Backup의 태그 기반 리소스 선택은 "Environment=prod 태그를 가진 모든 리소스"를 Plan에 자동 편입하는 선언적 정책이다. 새 리소스가 생겨도 태그만 맞으면 자동으로 백업 대상이 되어, 명령형 백업의 고질적 문제인 "누락"을 구조적으로 방지한다(Kubernetes·Terraform과 같은 desired-state 사상). A는 매번 수동 작업으로 누락 위험이 크고, C·D는 리소스마다 손수 설정해야 해 자동 편입이 안 된다. 함정: "새 리소스도 자동으로 백업 정책에 포함"은 태그 기반 선택의 직답이다.

---
