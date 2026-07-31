# Day 5 - Week 11 종합: 거버넌스 시나리오 통합 복습

이번 주는 *단일 계정 보안*에서 *조직 규모 거버넌스*로 시야를 넓혔다. SCP로 권한의 천장을 정의하고(Day 1), Control Tower로 안전한 베이스라인을 자동으로 깔고(Day 2), Audit Manager로 규정 준수를 증명하며(Day 3), Firewall Manager·태그·비용·자동화로 일상 운영을 닫힌 루프로 만들었다(Day 4). 마지막 날은 이 조각들이 *하나의 거버넌스 시스템*으로 맞물리는 방식을 통합 시나리오로 복습한다.

도메인 6(관리 및 보안 거버넌스)은 시험의 약 14%지만, 실제 체감 비중은 그보다 훨씬 크다. 다른 다섯 도메인의 문항 상당수가 **"이 통제를 조직 전체에 어떻게 강제·검증·유지할 것인가"** 형태로 끝나기 때문이다. 그래서 거버넌스는 별도 주제가 아니라 *다른 모든 답안의 마지막 문장*에 가깝다.

## 거버넌스 4계층 멘탈 모델

조직 보안 거버넌스는 네 개의 평면이 겹쳐 동작한다. 시험 문항은 거의 항상 "어느 평면의 도구가 답인가"를 가린다.

```
① 권한 경계 평면 (무엇을 할 수 있나의 천장)
     SCP / RCP — 권한 부여가 아니라 최대 경계
② 베이스라인 평면 (계정이 안전하게 태어나게)
     Control Tower — 랜딩 존, 컨트롤(예방/탐지/능동), 계정 팩토리
③ 증명 평면 (지키고 있음을 증거로 보임)
     Audit Manager ← Config / CloudTrail / Security Hub (증거 원천)
④ 운영 평면 (일상 강제·교정·대응)
     Firewall Manager / 태그·비용 거버넌스 / EventBridge 자동 교정
```

이 위에 **중앙 보안 계정 모델**(관리 계정=결제·조직, Audit=탐지·증거·대응, Log Archive=불변 로그)이 공통 토대로 깔린다. 모든 보안 서비스는 *위임 관리자*로 Audit 계정에서 운영한다. 계정과 OU로 그리면 이렇게 된다.

```
                         Root
                          │
            ┌─────────────┼──────────────┬───────────────┐
            ▼             ▼              ▼               ▼
      OU: Security   OU: Infrastructure  OU: Workloads   OU: Sandbox
      ├ Audit 계정    ├ Network 계정      ├ OU: Prod       └ 실험 계정
      │  · GuardDuty  └ Shared Services   │   ├ 계정 A       (강한 SCP,
      │  · SecurityHub                    │   └ 계정 B        비용 상한)
      │  · Config 집계                    └ OU: NonProd
      │  · Audit Manager                      └ 계정 C
      │  · Firewall Manager
      └ Log Archive 계정
         · 조직 CloudTrail 대상 S3(Object Lock)
         · Config 스냅샷 / VPC Flow Logs

   [ 관리 계정(Management) ] — OU 트리 밖에 있으며 SCP가 적용되지 않는다
        · Organizations / 결제 / 위임 관리자 "지정"만 수행
        · 워크로드를 절대 두지 않는다  ← 거버넌스의 1번 규칙

정책 흐름:  SCP/RCP  ── Root·OU에 붙어 아래로 상속
            Control Tower 컨트롤 ── OU 단위로 적용
            FMS 정책 ── IncludeMap의 OU에 배포
            증거·로그 ── 모든 계정 → Audit / Log Archive 로 단방향 수집
```

> 💡 **관련 이론**: 이 4계층은 보안 통제의 시간 축을 따른다 — *사전 예방(SCP/예방 컨트롤)* → *안전한 기본값(베이스라인)* → *지속 탐지/평가(Config·증명)* → *대응/교정(운영 평면)*. NIST CSF의 Identify·Protect·Detect·Respond 함수를 조직 규모로 매핑한 것이다. 한 계층이 뚫려도 다음 계층이 받쳐 주는 *심층 방어*다. 여기서 계층의 순서가 곧 *비용의 순서*이기도 하다 — 예방에서 막으면 비용이 0에 가깝고, 탐지 단계로 넘어가면 조사·대응 비용이 붙고, 증명 단계에서 발견되면 규제·계약상 비용이 붙는다. 거버넌스 설계가 "가능하면 왼쪽 계층에서 끝내라"를 원칙으로 삼는 이유다.

## 정책 평가 순서: 거버넌스의 심판 규칙

Specialty 시험에서 거버넌스 문항의 절반은 결국 "여러 정책이 겹쳤을 때 이 요청이 통과하는가"로 환원된다. 판정 규칙을 흔들림 없이 외워 두면 문항 유형이 바뀌어도 답이 흔들리지 않는다.

```
[ 요청 하나가 ALLOW에 도달하기까지 ]

요청 = (Principal, Action, Resource, Condition Context)
   │
   ├─① 명시적 Deny ── 어느 정책 유형이든 Deny 하나면 ▶ DENY (즉시 종료)
   ├─② SCP ───────── 프린시펄 계정의 유효 SCP가 허용 안 하면 ▶ DENY
   ├─③ RCP ───────── 리소스 측 조직 상한이 허용 안 하면 ▶ DENY
   ├─④ 리소스 정책 ── 동일 계정 + 프린시펄 직접 지정 Allow면 통과 가능(예외 경로)
   ├─⑤ 권한 경계 ──── 경계가 허용 안 하면 ▶ DENY
   ├─⑥ 세션 정책 ──── 허용 안 하면 ▶ DENY
   └─⑦ 아이덴티티 정책 ── Allow 없으면 ▶ 암묵적 DENY
                              ▼
                            ALLOW

유효 권한 = (SCP ∩ RCP ∩ 권한경계 ∩ 세션정책) ∩ (IAM Allow ∪ 리소스정책 Allow) − (모든 Deny)
```

| 정책 유형 | 붙는 대상 | 권한 부여 | 권한 제한 | 관리 계정 적용 | 거버넌스에서의 자리 |
|---|---|---|---|---|---|
| **SCP** | Root / OU / 계정 | ✗ | ○ (프린시펄 상한) | **✗** | 리전 잠금·보안 서비스 보호·루트 차단 |
| **RCP** | Root / OU / 계정 | ✗ | ○ (리소스 접근 상한) | ✗ | 조직 밖으로의 데이터 노출 차단 |
| **아이덴티티 IAM** | 사용자·그룹·역할 | ○ | ○ | ○ | 실제 권한 부여의 본체 |
| **리소스 정책** | S3·KMS·SQS·Lambda 등 | ○ (교차계정) | ○ | ○ | 교차 계정 공유, 서비스 프린시펄 허용 |
| **권한 경계** | IAM 사용자·역할 | ✗ | ○ (개별 주체 상한) | ○ | 위임 관리자에게 안전하게 IAM 권한 위임 |
| **세션 정책** | AssumeRole 세션 | ✗ | ○ (일시적 상한) | ○ | 페더레이션·임시 자격증명 축소 |

이 표를 실제 판정으로 굴려 보는 것이 복습의 핵심이다. 아래 세 케이스는 시험이 변형을 만들어 내는 원형들이다.

**케이스 A — SCP Deny vs IAM AdministratorAccess.** 계정 관리자가 `AdministratorAccess`를 갖고 `eu-west-1`에서 EC2를 띄우려 한다. 상위 OU에 리전 잠금 SCP(`aws:RequestedRegion` 불일치 시 Deny)가 붙어 있다. → **DENY.** ①에서 끝난다. IAM Allow의 강도는 아무 의미가 없다. "관리자라서 통과한다"는 오답의 원형이다.

**케이스 B — 교차 계정 S3 접근.** 계정 A의 역할이 계정 B의 버킷을 읽는다. A의 IAM 정책은 `s3:GetObject` Allow, B의 버킷 정책도 A의 역할을 Allow. 그런데 B가 속한 OU에 RCP가 붙어 조직 외부 프린시펄을 차단하고 있다. A와 B가 같은 조직이라면? → **ALLOW.** RCP는 *조직 밖* 프린시펄을 막는 것이므로 같은 조직 내 접근은 통과한다. 반대로 A가 조직 밖 계정이면 양쪽 Allow가 다 있어도 RCP에서 막힌다. **교차 계정은 양쪽 Allow가 모두 필요하고, 조직 경계는 RCP가 별도로 심판한다.**

**케이스 C — 권한 경계와 SCP의 분담.** 개발자에게 IAM 역할 생성 권한을 주되, 그가 만든 역할이 관리자 권한을 갖지 못하게 하려 한다. → **권한 경계.** SCP는 IAM 주체를 골라 붙일 수 없으므로 "특정 주체 하나의 천장"에는 쓸 수 없다. 반대로 "이 계정 전체에서 아무도 us-east-1 밖을 못 쓰게"는 권한 경계로 할 수 없다(모든 주체에 일일이 붙여야 하고 신규 주체는 누락된다). **범위가 계정·OU면 SCP, 주체 하나면 권한 경계** — 이 한 줄이 판단 기준이다.

> ⚠️ **함정**: **SCP는 관리 계정의 프린시펄에 적용되지 않는다.** 그래서 "관리 계정에 워크로드를 두지 마라"는 권고는 취향이 아니라 *구조적 필연*이다. 관리 계정에서 도는 워크로드는 리전 잠금도, 태그 강제도, 보안 서비스 비활성화 차단도 전부 우회한다. 같은 맥락에서 **서비스 연결 역할(SLR)이 AWS 서비스 자격으로 수행하는 호출도 SCP 평가에서 빠진다.** 시험에서 "SCP를 붙였는데 특정 경로만 계속 통과한다"는 상황이 나오면 이 두 예외를 먼저 의심하라. 그리고 RCP는 출시 시점 기준 S3·STS·KMS·SQS·Secrets Manager 등 *일부 서비스만* 지원하므로 "RCP로 모든 서비스의 조직 경계를 강제한다"는 서술은 틀린 보기다.

## 도구 선택 결정 트리 (혼동 방지)

시험에서 가장 자주 헷갈리는 매칭을 정리한다.

| 요구사항 키워드 | 정답 도구 |
|---|---|
| "권한의 *최대 경계*", "리전/루트/서비스 *차단*" | **SCP** |
| "조직 *리소스*에 외부 접근 차단(상한)" | **RCP** |
| "다계정 *베이스라인을 빠르게* 깔고 일관 운영" | **Control Tower** |
| "리소스 생성 *전에* 비준수 차단(IaC 게이트)" | **능동 컨트롤(CFN Hooks)** |
| "이미 만든 리소스가 규칙을 지키는지 *평가*" | **Config (탐지 컨트롤)** |
| "CIS/PCI 규칙 세트를 다계정에 *한 번에 배포*" | **Conformance Pack** |
| "감사자 제출용 *증거 자동 수집·보고서*" | **Audit Manager** |
| "보안 *findings 집계·점수* 대시보드" | **Security Hub** |
| "여러 계정에 WAF/SG/NFW *일관 배포·자동 보호*" | **Firewall Manager** |
| "누가·언제·무엇을 했는지 *활동 로그*" | **CloudTrail** |
| "리소스 *구성 이력*(언제 무엇이 바뀌었나)" | **Config 구성 항목 타임라인** |
| "태그 키·값 *표기 표준화·보고*" | **Tag Policy** |
| "필수 태그 없으면 *생성 차단*" | **SCP (`aws:RequestTag` + Null)** |
| "비정상 *지출* 급증(침해 신호)" | **Cost Anomaly Detection / Budgets** |
| "신규 계정에서 보안 서비스 *자동 활성화*" | **위임 관리자 auto-enable** |

이 표에서 실수가 몰리는 세 쌍만 따로 새겨 두면 된다.

- **Conformance Pack vs Audit Manager**: 둘 다 CIS·PCI라는 이름을 단다. *규칙을 깔아 준수 상태를 만드는* 쪽이 Conformance Pack, *이미 만들어진 준수 상태를 증거로 포장하는* 쪽이 Audit Manager다.
- **Tag Policy vs SCP**: Tag Policy는 *태그가 붙을 때 표준을 지키는가*를 본다. *태그 없이 만드는 것*을 막지 못한다. 차단이면 언제나 SCP.
- **Config vs CloudTrail**: "지금 상태가 옳은가"는 Config, "그동안 무슨 일이 있었나"는 CloudTrail. 감사자는 대부분 둘 다 요구한다.

## 시험 도메인별 거버넌스 출제 지도

거버넌스는 도메인 6에만 있지 않다. 다른 도메인 문항이 "조직 규모로 확장하라"는 요구를 덧붙이는 순간 이번 주 도구가 정답 자리에 들어온다.

| 도메인 | 문항이 던지는 형태 | 거버넌스 쪽 정답 도구 |
|---|---|---|
| 도메인 1 — 위협 탐지·인시던트 대응 (~14%) | "모든 계정의 findings를 한곳에서 보고 자동 대응" | Security Hub 위임 관리자 + EventBridge → Lambda/SSM |
| 도메인 2 — 보안 로깅·모니터링 (~18%) | "멤버 계정 관리자가 로그를 끄거나 지우지 못하게" | 조직 CloudTrail + SCP Deny + Log Archive Object Lock |
| 도메인 3 — 인프라 보안 (~20%) | "수백 계정의 ALB·SG·DNS를 일관 보호, 신규도 자동" | **Firewall Manager** |
| 도메인 4 — IAM (~16%) | "권한의 상한을 조직 전체에 강제" / "위임자가 자기 권한을 못 넘게" | SCP / 권한 경계 |
| 도메인 5 — 데이터 보호 (~18%) | "스냅샷·S3 데이터가 조직 밖으로 나가지 못하게" | SCP·RCP + `aws:PrincipalOrgID` |
| 도메인 6 — 관리·보안 거버넌스 (~14%) | "베이스라인 자동화 / 감사 증거 / 준수 증명" | Control Tower · Config · Audit Manager |

읽는 요령이 하나 있다. 문항에 **"모든 계정", "조직 전체", "앞으로 만들어질", "신규 계정"** 같은 표현이 등장하면 계정 단위 도구(WAF 직접 연결, 개별 Config 규칙, 계정별 수동 활성화)는 대체로 오답이다. 이 표현들이 곧 "조직 도구를 쓰라"는 신호다.

## 통합 시나리오 1: 규제 대상 다계정 환경 구축

요구: 신규 핀테크가 30개 계정으로 출발, ap-northeast-2만 사용, PCI 감사 대비, 모든 계정 WAF 일관 적용, 보안 도구 자동 활성화.

설계:
1. **Control Tower**로 랜딩 존 구성 → Audit·Log Archive 계정, 조직 CloudTrail/Config 자동.
2. **SCP**: 리전 잠금(글로벌 서비스+us-east-1 예외), 루트 차단, 보안 서비스 비활성화 방지.
3. **계정 팩토리(AFT)**: 표준 OU 배치·태그·네트워크 베이스라인으로 계정 발급.
4. **위임 관리자(Audit 계정)**: GuardDuty·Security Hub·Config·Audit Manager·Firewall Manager 운영.
5. **Firewall Manager**: 공통 WAF 관리형 규칙을 전 계정 ALB/API GW에 자동 배포.
6. **Audit Manager**: PCI-DSS 프레임워크 평가 → Config/CloudTrail/Security Hub 증거 자동 수집, 수동 증거 보완.
7. **EventBridge+Lambda/SSM**: findings 자동 교정 루프.

여기서 PCI 특유의 판단이 하나 더 붙는다. **카드 데이터를 다루는 계정을 전용 OU로 분리**해 감사 범위(scope)를 좁히는 것이다. PCI 감사에서 가장 값싼 통제는 언제나 "범위를 줄이는 것"이고, 이 분리가 Audit Manager 평가 범위·SCP 강도·네트워크 경계를 동시에 좁혀 준다.

```bash
# ① 리전 잠금 SCP를 Root에 붙여 조직 전체의 천장을 세운다
aws organizations create-policy --name "RegionLock-Seoul" --type SERVICE_CONTROL_POLICY \
  --content file://region-lock.json
aws organizations attach-policy --policy-id p-regionlock --target-id r-exam

# ② 보안 서비스를 Audit 계정에 위임 (서비스마다 별도 등록)
aws organizations register-delegated-administrator \
  --account-id 222233334444 --service-principal guardduty.amazonaws.com
aws organizations register-delegated-administrator \
  --account-id 222233334444 --service-principal securityhub.amazonaws.com
aws organizations register-delegated-administrator \
  --account-id 222233334444 --service-principal auditmanager.amazonaws.com
aws fms associate-admin-account --admin-account 222233334444

# ③ 신규 계정 자동 등록을 켜 둔다(하나라도 빠지면 그 서비스만 조용히 꺼진 채 남는다)
aws guardduty update-organization-configuration \
  --detector-id <id> --auto-enable-organization-members ALL
aws securityhub update-organization-configuration --auto-enable --auto-enable-standards DEFAULT

# ④ PCI 범위 OU에만 강화 정책을 추가로 부착
aws organizations attach-policy --policy-id p-pci-hardening --target-id ou-xxxx-pci
```

```json
// PCI 범위 OU 강화 SCP — 암호화 강제 + 조직 밖 공유 차단 + 감사 로그 보호
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedEbsVolumeCreation",
      "Effect": "Deny",
      "Action": "ec2:CreateVolume",
      "Resource": "*",
      "Condition": { "Bool": { "ec2:Encrypted": "false" } }
    },
    {
      "Sid": "DenySnapshotSharingOutsideOrg",
      "Effect": "Deny",
      "Action": ["ec2:ModifySnapshotAttribute", "ec2:ModifyImageAttribute"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": { "aws:PrincipalOrgID": "o-exampleorgid" }
      }
    },
    {
      "Sid": "ProtectDetectionServices",
      "Effect": "Deny",
      "Action": [
        "cloudtrail:StopLogging", "cloudtrail:DeleteTrail",
        "guardduty:DeleteDetector", "guardduty:DisassociateFromMasterAccount",
        "config:StopConfigurationRecorder", "config:DeleteConfigurationRecorder",
        "securityhub:DisableSecurityHub"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalARN": "arn:aws:iam::*:role/OrgSecurityBreakGlassRole"
        }
      }
    }
  ]
}
```

세 Statement가 각각 Day 1~4의 주제를 대표한다 — 예방적 암호화 강제, 조직 경계 데이터 차단, 탐지 회피 방어. 마지막 Statement의 `ArnNotLike` 예외가 없으면 보안팀 자신도 유지보수를 못 하게 되므로, **예외 역할은 반드시 하나 남기되 그 역할의 사용을 CloudTrail로 감시**하는 것이 정석이다.

## 통합 시나리오 2: 탐지를 끄고 나쁜 짓을 막기

요구: 계정 관리자가 CloudTrail·GuardDuty·Config를 끄거나 로그를 지우지 못하게.

설계:
- **SCP**: `cloudtrail:StopLogging/DeleteTrail`, `guardduty:DeleteDetector`, `config:StopConfigurationRecorder`, `securityhub:DisableSecurityHub` 등을 Deny하되 보안 유지보수 역할만 `Condition`으로 예외.
- **조직 CloudTrail**: 관리 계정에서 활성화 → 멤버 계정 관리자는 읽기 전용, 끄거나 안 보임.
- **Log Archive**: S3 Object Lock + MFA Delete + 전용 KMS로 로그 불변화.
- **Control Tower 필수 컨트롤**: 로그 무결성·Config 비활성화 금지를 해제 불가로 강제.

이 조합이 "탐지 회피(defense evasion)" 공격을 다층으로 차단한다. 공격자 관점에서 각 층이 어떤 시도를 막는지 대응시켜 보면 왜 네 개가 다 필요한지 분명해진다.

| 공격자의 시도 | 막는 층 | 막지 못했다면 |
|---|---|---|
| CloudTrail 로깅 중지 | SCP Deny | 이후 모든 활동이 기록되지 않음 |
| 멤버 계정에서 추적 삭제 | **조직 CloudTrail**(멤버는 소유자 아님) | 계정 단위 증거 소멸 |
| S3의 로그 객체 삭제·덮어쓰기 | Object Lock + MFA Delete | 이미 쌓인 증거까지 소급 소멸 |
| 로그 KMS 키 삭제·정책 변경 | 전용 KMS + 키 정책 + SCP | 로그가 남아도 복호화 불가 |
| Config 레코더 중지 | SCP + Control Tower 필수 컨트롤 | 구성 이력 단절 → 감사 증거 공백 |
| SCP 자체를 떼어냄 | 관리 계정 권한 분리 + CloudTrail 감시 | 천장 자체가 사라짐 |

마지막 행이 이 설계의 급소다. **SCP를 지킬 수 있는 것은 SCP가 아니라 관리 계정의 접근 통제**다. 관리 계정 루트에 하드웨어 MFA, 관리 계정 IAM 주체 최소화, `organizations:DetachPolicy`·`organizations:DeletePolicy` 호출에 대한 실시간 경보 — 이 세 가지가 없으면 아래 층이 아무리 두꺼워도 위에서 통째로 걷힌다.

> 📚 **사례**: 2014년 6월, 영국의 코드 호스팅·프로젝트 관리 업체 **Code Spaces**는 공격자가 자사 AWS 콘솔 제어판에 접근한 뒤 DDoS와 함께 금전을 요구하면서 사고가 시작됐다. 회사가 계정 통제권을 되찾으려 시도하자, 공격자는 미리 만들어 둔 백업 계정으로 **EBS 스냅샷, S3 버킷, AMI, 인스턴스 대부분을 삭제**했다. 데이터와 백업이 같은 통제 평면 안에 있었기 때문에 한 번의 계정 탈취가 곧 전사 소멸이 됐고, 회사는 며칠 만에 서비스를 종료했다. 이 사건이 멀티계정 거버넌스 교재의 출발점처럼 인용되는 이유는 명확하다 — **"백업과 로그는 그것을 만든 주체가 지울 수 없는 곳에 있어야 한다."** 오늘날의 답이 곧 Log Archive 계정 분리, Object Lock, 교차 계정 백업, 그리고 SCP로 삭제 액션 자체를 막는 구조다. 통제를 *같은 계정 안의 다른 권한*으로 두면 계정이 뚫리는 순간 함께 뚫리고, *다른 계정의 다른 권한*으로 두어야 비로소 경계가 생긴다.

## 통합 시나리오 3: 비용 급증이 곧 침해 신호

요구: 탈취된 키로 GPU 인스턴스를 대량 생성하는 채굴 공격 방어.

설계:
- **SCP**: 대형 GPU 인스턴스 타입·비허용 리전 생성 차단(피해 한계).
- **Cost Anomaly Detection / Budgets**: 지출 급증 즉시 경보.
- **GuardDuty**: 채굴 관련 발견 유형 탐지.
- **EventBridge 자동 대응**: 의심 키 비활성화 + 인스턴스 격리 + 알림.

비용·탐지·권한 경계가 한 위협에 대해 교차 작동하는 *심층 방어* 예시다. 시간 축으로 늘어놓으면 각 통제가 어느 순간에 값을 하는지 보인다.

```
t0  키 탈취              → (예방 불가, 이미 발생)
t0+  비허용 리전 생성 시도 → SCP Deny                 ★ 피해 0
t1   허용 리전에서 대형 인스턴스 시도 → 인스턴스 타입 SCP Deny  ★ 피해 0
t2   허용 타입으로 다수 생성 → GuardDuty 채굴 발견 유형   ▲ 탐지
t3   지출 급증           → Cost Anomaly Detection 경보  ▲ 탐지(백업 신호)
t4   자동 대응           → 키 비활성화 + 격리 SG 교체    ● 봉쇄
t5   사후                → CloudTrail로 범위 확정 · 장기 키 → Identity Center
```

이 그림의 교훈은 **예방(SCP)이 왼쪽에 있을수록 싸다**는 것이다. t2~t3의 탐지는 이미 비용과 노출이 발생한 뒤이며, 탐지만으로 방어를 설계하면 항상 사후 대응이 된다.

## 통합 시나리오 4: 조직 경계 밖으로의 데이터 이동 차단

요구: 탈취된 자격증명이나 내부자가 스냅샷·S3 데이터를 조직 외부 계정으로 빼내지 못하게. IAM Allow만 보면 정상적인 API 호출로 보이는 흐름이라 권한 축소만으로는 잡히지 않는다.

설계는 **양방향**이어야 한다. 나가는 문과 들어오는 문이 다르기 때문이다.

```
        [ 우리 조직 ]                        [ 외부 ]

  프린시펄 ──(스냅샷 공유·데이터 복사)──▶  외부 계정
      └── SCP + aws:PrincipalOrgID 로 차단   (나가는 문)

  우리 리소스 ◀──(버킷 정책 오설정으로 접근)── 외부 프린시펄
      └── RCP + aws:PrincipalOrgID 로 차단   (들어오는 문)
```

- **나가는 문(SCP)**: `ec2:ModifySnapshotAttribute`, `ec2:ModifyImageAttribute`, `ram:CreateResourceShare` 등을 조직 외부 대상일 때 Deny.
- **들어오는 문(RCP)**: S3·KMS·STS 등에 대해 `aws:PrincipalOrgID`가 우리 조직이 아니면 Deny. 버킷 정책을 개별 계정에서 잘못 열어도 조직 상한이 먼저 막는다.
- **탐지 보완**: IAM Access Analyzer의 외부 접근 분석기를 조직 영역(zone of trust = 조직)으로 만들어 "조직 밖에 노출된 리소스"를 지속 나열한다.
- **증명**: Audit Manager 평가에 이 통제를 통제 항목으로 매핑해 감사 증거로 남긴다.

> 🔍 **더 깊이**: SCP와 RCP를 "같은 걸 두 번 하는 것"으로 오해하기 쉽지만 방향이 반대다. SCP는 *프린시펄이 속한 계정*을 기준으로 평가되므로 **우리 사람이 밖으로 나가는 문**을 잠그고, RCP는 *리소스가 속한 계정*을 기준으로 평가되므로 **밖의 사람이 우리 리소스로 들어오는 문**을 잠근다. 그래서 둘 중 하나만 걸면 반대 방향이 열린 채 남는다. 실제 데이터 유출 사고의 상당수가 "권한은 최소화했는데 리소스 정책이 열려 있었다" 또는 "리소스는 잠갔는데 내부 프린시펄이 스냅샷을 공유했다"의 형태인 이유가 이것이다. 다만 RCP는 지원 서비스가 제한적이므로, **RCP가 닿지 않는 서비스는 SCP·리소스 정책·Access Analyzer 탐지로 메워야 한다** — "RCP를 켰으니 조직 경계는 끝났다"는 판단이 가장 위험하다.

> 🎯 **시나리오**: 인수한 회사의 AWS 계정 12개를 우리 조직에 초대해 편입시켰다. 편입 직후 우선순위대로 무엇을 하는가. → ① **격리 OU에 먼저 넣는다.** 기존 Prod OU에 바로 넣으면 우리 SCP가 그 계정의 기존 워크로드를 즉시 깨뜨릴 수 있다. 강한 Deny 없이 관측만 하는 임시 OU가 안전하다. ② **가시성 확보**: GuardDuty·Security Hub·Config를 그 계정들에 활성화해 위임 관리자로 집계하고, 조직 CloudTrail 범위에 넣는다. 무엇이 있는지 모르는 상태에서 SCP를 붙이는 것이 가장 흔한 사고다. ③ **자격증명 정리**: 장기 액세스 키·루트 사용자·외부 계정 신뢰 관계를 전수 조사한다. 인수 계정에서 가장 위험한 자산은 리소스가 아니라 *전 직원·전 협력사가 아직 들고 있는 자격증명*이다. ④ **경계 축소**: `aws:PrincipalOrgID` 기반 RCP와 스냅샷 공유 차단 SCP를 걸어 이전 소유 조직으로의 경로를 끊는다. ⑤ **점진적 강제**: 리전 잠금·태그 강제 SCP를 경고 → 예외 등록 → 강제의 순서로 단계 적용한다. 핵심 순서는 **격리 → 관측 → 자격증명 → 경계 → 강제**이며, 관측을 건너뛰고 강제부터 하는 것이 실무에서 가장 자주 나는 사고다.

## 빈출 함정 총정리

- **SCP는 권한을 부여하지 않는다** — IAM Allow와의 교집합에서 Deny를 뺀 것이 유효 권한.
- **SCP는 관리 계정 멤버에 적용 안 됨** — 관리 계정에 워크로드 금지.
- **서비스 연결 역할의 호출은 SCP 평가에서 빠진다** — "특정 경로만 계속 통과"의 원인.
- **명시적 Deny는 어디에 있든 최종** — FullAWSAccess도 AdministratorAccess도 이기지 못한다.
- **교차 계정은 양쪽 Allow가 모두 필요** — 동일 계정에서만 리소스 정책 단독 Allow가 성립.
- **범위가 계정·OU면 SCP, 주체 하나면 권한 경계** — 둘을 바꿔 답하게 만드는 보기가 단골.
- **RCP는 지원 서비스가 제한적** — "모든 서비스의 조직 경계를 강제한다"는 틀린 서술.
- **리전 잠금 SCP**에서 글로벌 서비스+us-east-1 예외 누락 시 콘솔·CloudFront·ACM 파손.
- **컨트롤은 OU에 적용** — 계정 개별 적용은 신규 계정 누락.
- **예방=SCP, 탐지=Config, 능동=CFN Hooks** — 차단 시점이 다르다.
- **Control Tower 관리 리소스 수동 변경 = 드리프트** — 재적용 필요.
- **Conformance Pack은 규칙 배포, Audit Manager는 증거 포장** — 이름이 같아도(CIS/PCI) 역할이 다르다.
- **Audit Manager는 증거를 생성하지 않음** — Config/CloudTrail/Security Hub 선행 활성화 필수.
- **현재 COMPLIANT는 기간 증명이 아니다** — 이력 증명엔 Config 구성 이력 + CloudTrail이 필요.
- **로그·증거는 소급 생성 불가** — 감사 요구가 오기 전에 켜 둔 것만 증거가 된다.
- **Firewall Manager는 Config 필요** + 위임 관리자에서 운영, `RemediationEnabled`가 꺼져 있으면 보고만 한다.
- **CloudFront 범위 WAF·Shield Advanced 정책은 us-east-1**에서 생성해야 한다.
- **Tag Policy는 무태그 생성을 막지 못한다** — 차단은 SCP의 몫.
- 보안 서비스는 **위임 관리자(Audit 계정)**에서, 관리 계정은 결제·조직만.
- **auto-enable은 서비스마다 따로** — 하나 빠지면 그 서비스만 신규 계정에서 꺼진 채 남는다.
- **백업·로그는 만든 주체가 지울 수 없는 계정에** — 같은 계정 안의 권한 분리는 계정 탈취에 무력하다.

## 다른 주차와의 연결

- Week 4(WAF·Shield·Network Firewall)의 *단일 정책*을 이번 주 Firewall Manager가 *조직 전역*으로 확장.
- 로깅·탐지(CloudTrail·GuardDuty·Config·Security Hub)는 이번 주 *위임 관리자·증명 평면*으로 통합.
- IAM·권한 경계는 이번 주 SCP/RCP의 *조직 규모 천장*으로 확장된다.
- 데이터 보호(KMS·S3 암호화)는 SCP의 *암호화 강제*와 RCP의 *조직 경계*로 조직 규모 통제가 된다.
- Week 12의 도메인별 총정리는 이번 주 4계층 모델을 각 도메인 문항 유형에 되짚는 형태로 이어진다.

## 정리하며

거버넌스는 한 서비스가 아니라 *권한 경계·베이스라인·증명·운영* 네 평면을 중앙 보안 계정 위에 겹쳐 쌓고, 위임 관리자로 운영을 격리하며, 탐지→자동 교정의 닫힌 루프를 도는 시스템이다. 시험은 "이 요구는 어느 평면, 어느 도구인가"를 끊임없이 묻는다.

한 문장으로 압축하면 이렇다. **거버넌스는 "좋은 상태를 만드는 일"이 아니라 "좋은 상태에서 벗어날 수 없게 만드는 일"이다.** 보안 설정을 옳게 하는 것은 한 사람이 하루면 하지만, 500개 계정이 3년 뒤에도 그 상태를 유지하게 만드는 것은 구조로만 가능하다. SCP는 벗어남을 금지하고, Control Tower는 벗어난 상태로 태어나지 못하게 하며, Config·Audit Manager는 벗어남을 발견·증명하고, Firewall Manager와 자동 교정은 벗어난 것을 되돌린다. 시험 보기가 "사람이 절차를 지킨다"거나 "정기적으로 점검한다"는 형태면 거의 항상 오답인 이유가 여기에 있다.

마지막 점검 목록으로 이번 주를 닫는다.

- [ ] 관리 계정에 워크로드가 없고, 보안 서비스는 전부 **위임 관리자(Audit 계정)** 에서 운영되는가
- [ ] 유효 권한을 `(SCP ∩ RCP ∩ 권한경계) ∩ (IAM ∪ 리소스정책) − Deny`로 계산할 수 있는가
- [ ] "계정·OU 범위면 SCP, 주체 하나면 권한 경계"를 즉시 판단할 수 있는가
- [ ] 리전 잠금 SCP에 글로벌 서비스와 `us-east-1` 예외가 정확히 들어갔는가
- [ ] 보안 서비스 비활성화·로그 삭제를 SCP로 막고, 예외 역할 사용을 감시하는가
- [ ] 로그·백업이 **만든 주체가 지울 수 없는 별도 계정**에 Object Lock으로 보관되는가
- [ ] 조직 경계를 **나가는 문(SCP)과 들어오는 문(RCP)** 양쪽으로 잠갔는가
- [ ] Conformance Pack(규칙 배포)과 Audit Manager(증거 포장)를 구분해 도구를 골랐는가
- [ ] Firewall Manager 전제(Organizations·FMS 관리자·Config·필요 시 RAM)가 모두 충족됐는가
- [ ] 신규 계정에서 GuardDuty·Security Hub·Config가 **각각** auto-enable로 켜지는가
- [ ] 자동 대응이 가역적 조치만 자동화하고, 비가역적 조치는 승인 게이트를 거치는가
- [ ] 보기에 "모든 계정 / 앞으로 만들어질"이 보이면 조직 도구를 먼저 떠올리는가

## 📝 연습 문제

**문제 1.** 신규 핀테크가 PCI 대상 다계정 환경을 빠르게 세우고 안전한 베이스라인(로그 계정, 조직 CloudTrail/Config, 표준 OU)을 자동으로 갖추려 한다. 출발점으로 가장 적절한 것은?

A) 수동으로 Organizations·CloudTrail·Config를 하나씩 구성  
B) AWS Control Tower로 랜딩 존을 구성해 Audit·Log Archive 계정과 조직 CloudTrail/Config, 컨트롤 베이스라인을 자동으로 깐다  
C) 단일 계정에 모든 워크로드를 모은다  
D) GuardDuty만 켠다  

**정답: B**  
해설: 표준 멀티계정 보안 베이스라인을 빠르고 일관되게 까는 출발점은 Control Tower 랜딩 존이다. Audit·Log Archive 계정, 조직 CloudTrail/Config, 컨트롤이 자동 구성된다. 수동 구성은 느리고 누락 위험이 크며, 단일 계정 통합은 격리·blast radius 원칙에 반하고, GuardDuty 단독은 탐지 한 조각일 뿐 베이스라인 전체가 아니다.

---

**문제 2.** "계정 관리자가 CloudTrail 로깅을 중지하거나 GuardDuty 탐지기를 삭제하지 못하게" 하려 한다. 가장 직접적인 통제는?

A) IAM 정책으로 관리자에게 권한을 더 준다  
B) SCP로 cloudtrail:StopLogging·guardduty:DeleteDetector 등을 Deny하되 보안 유지보수 역할만 Condition으로 예외  
C) Security Hub 점수를 높인다  
D) Audit Manager 보고서를 만든다  

**정답: B**  
해설: 보안 서비스 비활성화·로그 삭제를 막는 직접 통제는 SCP의 명시적 Deny다. 유지보수 자동화를 위해 특정 보안 역할만 Condition으로 예외하면 운영성과 강제력을 동시에 확보한다. IAM으로 권한을 더 주는 것은 반대 방향이고, Security Hub 점수·Audit Manager 보고서는 탐지·증명 도구일 뿐 행위를 차단하지 않는다.

---

**문제 3.** 다음 요구-도구 매칭 중 옳지 않은 것은?

A) "여러 계정 ALB에 WAF 일관 배포·신규 자동 보호" → Firewall Manager  
B) "감사자 제출용 증거를 프레임워크별 자동 수집·보고" → Audit Manager  
C) "리소스가 규칙을 지키는지 지속 평가" → AWS Config  
D) "권한의 최대 경계 정의·리전 차단" → Security Hub  

**정답: D**  
해설: 권한의 최대 경계 정의와 리전 차단은 SCP(Organizations)의 역할이지 Security Hub가 아니다. Security Hub는 보안 findings 집계·점수 도구다. 나머지 매칭은 정확하다: 조직 전역 방화벽 배포는 Firewall Manager, 증거 수집·보고는 Audit Manager, 구성 평가는 Config다. 따라서 잘못된 매칭은 권한 경계를 Security Hub에 귀속시킨 것이다.

---

**문제 4.** Control Tower로 운영 중인 조직에서 한 운영자가 콘솔로 SCP를 직접 수정했다. 이후 새 컨트롤 적용이 막힌다. 무슨 일이 일어났고 어떻게 대응하는가?

A) 정상이며 그대로 둔다  
B) 드리프트가 발생했다 — 랜딩 존을 재적용해 선언 상태로 복구하고, Control Tower 관리 리소스를 콘솔에서 직접 수정하지 않는 규율을 지킨다  
C) 모든 컨트롤을 영구 비활성화한다  
D) 조직을 삭제하고 다시 만든다  

**정답: B**  
해설: Control Tower가 관리하는 SCP를 콘솔에서 직접 수정하면 선언 상태와 실제 상태가 어긋나는 드리프트가 발생해 후속 작업이 막힌다. 올바른 대응은 랜딩 존 재적용으로 선언 상태를 복구하고, 관리 리소스를 수동으로 손대지 않는 운영 규율을 세우는 것이다. 방치·전체 비활성화·조직 재생성은 모두 과하거나 위험하다.

---

**문제 5.** 한 계정에서 평소의 수십 배 GPU 인스턴스 비용이 급증했다. 여러 계층이 함께 작동해야 한다면 가장 적절한 심층 방어 조합은?

A) 인스턴스를 더 늘려 대응  
B) SCP로 대형 GPU 타입 생성 차단(피해 한계) + Cost Anomaly Detection/Budgets로 조기 탐지 + GuardDuty 채굴 탐지 + EventBridge로 키 비활성화·격리 자동 대응  
C) 비용은 보안과 무관하므로 무시  
D) 루트 키를 새로 발급해 계속 사용  

**정답: B**  
해설: 비용 급증, 특히 GPU 인스턴스 급증은 탈취 자격증명에 의한 채굴 침해의 신호일 수 있다. SCP로 피해 한계를 두고, Cost Anomaly Detection·Budgets로 조기 탐지하며, GuardDuty로 채굴을 탐지하고, EventBridge 자동 대응으로 키 비활성화·격리까지 묶는 것이 권한 경계·비용·탐지·대응을 가로지르는 심층 방어다. 확장·무시·루트 키 재사용은 위험을 키우거나 침해를 방치한다.

---
