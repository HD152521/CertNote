# Day 5 - Week 11 종합: 거버넌스 시나리오 통합 복습

이번 주는 *단일 계정 보안*에서 *조직 규모 거버넌스*로 시야를 넓혔다. SCP로 권한의 천장을 정의하고(Day 1), Control Tower로 안전한 베이스라인을 자동으로 깔고(Day 2), Audit Manager로 규정 준수를 증명하며(Day 3), Firewall Manager·태그·비용·자동화로 일상 운영을 닫힌 루프로 만들었다(Day 4). 마지막 날은 이 조각들이 *하나의 거버넌스 시스템*으로 맞물리는 방식을 통합 시나리오로 복습한다.

## 거버넌스 4계층 멘탈 모델

조직 보안 거버넌스는 네 개의 평면이 겹쳐 동작한다. 시험 문제는 거의 항상 "어느 평면의 도구가 답인가"를 가린다.

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

이 위에 **중앙 보안 계정 모델**(관리 계정=결제·조직, Audit=탐지·증거·대응, Log Archive=불변 로그)이 공통 토대로 깔린다. 모든 보안 서비스는 *위임 관리자*로 Audit 계정에서 운영한다.

> 💡 **관련 이론**: 이 4계층은 보안 통제의 시간 축을 따른다 — *사전 예방(SCP/예방 컨트롤)* → *안전한 기본값(베이스라인)* → *지속 탐지/평가(Config·증명)* → *대응/교정(운영 평면)*. NIST CSF의 Identify·Protect·Detect·Respond 함수를 조직 규모로 매핑한 것이다. 한 계층이 뚫려도 다음 계층이 받쳐 주는 *심층 방어*다.

## 도구 선택 결정 트리 (혼동 방지)

시험에서 가장 자주 헷갈리는 매칭을 정리한다.

| 요구사항 키워드 | 정답 도구 |
|---|---|
| "권한의 *최대 경계*", "리전/루트/서비스 *차단*" | **SCP** |
| "조직 *리소스*에 외부 접근 차단(상한)" | **RCP** |
| "다계정 *베이스라인을 빠르게* 깔고 일관 운영" | **Control Tower** |
| "리소스 생성 *전에* 비준수 차단(IaC 게이트)" | **능동 컨트롤(CFN Hooks)** |
| "이미 만든 리소스가 규칙을 지키는지 *평가*" | **Config (탐지 컨트롤)** |
| "감사자 제출용 *증거 자동 수집·보고서*" | **Audit Manager** |
| "보안 *findings 집계·점수* 대시보드" | **Security Hub** |
| "여러 계정에 WAF/SG/NFW *일관 배포·자동 보호*" | **Firewall Manager** |
| "누가·언제·무엇을 했는지 *활동 로그*" | **CloudTrail** |
| "비정상 *지출* 급증(침해 신호)" | **Cost Anomaly Detection / Budgets** |

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

## 통합 시나리오 2: 탐지를 끄고 나쁜 짓을 막기

요구: 계정 관리자가 CloudTrail·GuardDuty·Config를 끄거나 로그를 지우지 못하게.

설계:
- **SCP**: `cloudtrail:StopLogging/DeleteTrail`, `guardduty:DeleteDetector`, `config:StopConfigurationRecorder`, `securityhub:DisableSecurityHub` 등을 Deny하되 보안 유지보수 역할만 `Condition`으로 예외.
- **조직 CloudTrail**: 관리 계정에서 활성화 → 멤버 계정 관리자는 읽기 전용, 끄거나 안 보임.
- **Log Archive**: S3 Object Lock + MFA Delete + 전용 KMS로 로그 불변화.
- **Control Tower 필수 컨트롤**: 로그 무결성·Config 비활성화 금지를 해제 불가로 강제.

이 조합이 "탐지 회피(defense evasion)" 공격을 다층으로 차단한다.

## 통합 시나리오 3: 비용 급증이 곧 침해 신호

요구: 탈취된 키로 GPU 인스턴스를 대량 생성하는 채굴 공격 방어.

설계:
- **SCP**: 대형 GPU 인스턴스 타입·비허용 리전 생성 차단(피해 한계).
- **Cost Anomaly Detection / Budgets**: 지출 급증 즉시 경보.
- **GuardDuty**: 채굴 관련 발견 유형 탐지.
- **EventBridge 자동 대응**: 의심 키 비활성화 + 인스턴스 격리 + 알림.

비용·탐지·권한 경계가 한 위협에 대해 교차 작동하는 *심층 방어* 예시다.

## 빈출 함정 총정리

- **SCP는 권한을 부여하지 않는다** — IAM Allow와의 교집합에서 Deny를 뺀 것이 유효 권한.
- **SCP는 관리 계정 멤버에 적용 안 됨** — 관리 계정에 워크로드 금지.
- **리전 잠금 SCP**에서 글로벌 서비스+us-east-1 예외 누락 시 콘솔·CloudFront·ACM 파손.
- **컨트롤은 OU에 적용** — 계정 개별 적용은 신규 계정 누락.
- **예방=SCP, 탐지=Config, 능동=CFN Hooks** — 차단 시점이 다르다.
- **Control Tower 관리 리소스 수동 변경 = 드리프트** — 재적용 필요.
- **Audit Manager는 증거를 생성하지 않음** — Config/CloudTrail/Security Hub 선행 활성화 필수.
- **Firewall Manager는 Config 필요** + 위임 관리자에서 운영.
- 보안 서비스는 **위임 관리자(Audit 계정)**에서, 관리 계정은 결제·조직만.

## 다른 주차와의 연결

- Week 4(WAF·Shield·Network Firewall)의 *단일 정책*을 이번 주 Firewall Manager가 *조직 전역*으로 확장.
- 로깅·탐지(CloudTrail·GuardDuty·Config·Security Hub)는 이번 주 *위임 관리자·증명 평면*으로 통합.
- IAM·권한 경계는 이번 주 SCP/RCP의 *조직 규모 천장*으로 확장된다.

거버넌스는 한 서비스가 아니라 *권한 경계·베이스라인·증명·운영* 네 평면을 중앙 보안 계정 위에 겹쳐 쌓고, 위임 관리자로 운영을 격리하며, 탐지→자동 교정의 닫힌 루프를 도는 시스템이다. 시험은 "이 요구는 어느 평면, 어느 도구인가"를 끊임없이 묻는다.

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
