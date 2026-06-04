# Day 3 - 도메인 5·6 통합 복습: 통제 이론으로 보는 인시던트 자동화와 보안

마지막 두 도메인은 시스템이 위협받거나 무너질 때 **무엇을 하는가**를 다룬다. 도메인 5(인시던트 및 이벤트 대응, 14%)와 도메인 6(보안 및 컴플라이언스, 17%)는 합쳐 31%로, 셋째 날의 비중이 가장 크다. 그리고 이 둘은 보안 거버넌스의 **시간축 위에서 연속**된다 — 보안(도메인 6)이 "위협을 막고·탐지하는 평시의 자세"라면, 인시던트 대응(도메인 5)은 "탐지된 위협에 반응하는 유사시의 자동화"다. 탐지(GuardDuty)가 대응(EventBridge → Lambda)을 트리거하고, 대응이 다시 보안 상태를 복구한다. 시험은 이 둘을 거의 항상 한 흐름으로 묶어 묻는다 — "S3 버킷이 공개되면 자동으로 차단하라"는 문제는 탐지(Config)와 대응(SSM Remediation)이 한 사슬이다.

오늘의 복습은 보안 서비스 이름을 외우는 데서 멈추지 않고, **모든 보안 통제를 예방·탐지·대응의 세 범주(통제 이론)로 분류**하고, 자동 대응을 **이벤트 기반 아키텍처(EDA)의 제어 루프**로 이해하며, 멀티 계정 보안 거버넌스가 왜 "중앙 집계 + 위임"의 형태로 수렴하는지를 다시 판다.

## 통제의 세 범주 — 예방·탐지·대응이라는 보안의 기본 좌표계

보안 서비스가 수십 개라 외우기 벅차 보이지만, 모든 통제는 **세 범주** 중 하나에 속한다. 이 좌표계를 깔면 어떤 서비스든 제자리를 찾는다.

| 범주 | 목적 | 작동 시점 | AWS 대표 |
|------|------|------|------|
| **예방(Preventive)** | 나쁜 일이 일어나지 못하게 차단 | 사건 이전 | SCP, IAM, Permission Boundary, WAF, Shield |
| **탐지(Detective)** | 일어난 일을 발견·기록 | 사건 중·직후 | CloudTrail, Config, GuardDuty, Security Hub, Macie, Inspector |
| **대응(Responsive)** | 발견 후 자동/수동 조치 | 사건 이후 | EventBridge, Lambda, SSM Automation, Step Functions, Incident Manager |

> 💡 **관련 이론**: 이 분류는 보안 분야의 표준 프레임워크에 뿌리를 둔다. **NIST Cybersecurity Framework(CSF)**는 보안 기능을 Identify·Protect·Detect·Respond·Recover의 다섯으로 나누는데, 이는 AWS의 예방(Protect)·탐지(Detect)·대응(Respond/Recover)과 정확히 대응한다. 더 오래된 뿌리는 회계 감사의 **내부 통제(internal control)** 이론으로, 통제를 preventive·detective·corrective로 나눈 것이 1992년 **COSO 프레임워크**다. 핵심 통찰은 **"어떤 단일 범주도 충분하지 않다(defense in depth)"**이다. 예방만 믿으면 우회당했을 때 무방비고(예방은 100%가 아니다), 탐지만 있으면 발견해도 손이 늦으며, 대응만 있으면 막을 수 있던 것도 다 일어난 뒤다. 세 층을 겹치는 **심층 방어(defense in depth)** — 로마 군단의 다중 방벽, 성의 해자+성벽+내성 — 가 보안의 기본 자세다. 시험에서 한 시나리오에 "차단(SCP) + 탐지(GuardDuty) + 자동 수정(Config Remediation)"이 함께 나오는 이유가 이 심층 방어다.

> 🔍 **더 깊이**: 같은 위협도 어느 범주로 푸느냐에 따라 답이 갈린다. "개발자가 prod에서 특정 리전을 못 쓰게" → 예방(SCP Deny). "누군가 prod에서 그 리전을 썼는지 알고 싶다" → 탐지(Config Rule + CloudTrail). "썼으면 자동으로 되돌려라" → 대응(Config Auto-Remediation). 시험 문장의 동사가 단서다 — "prevent/block/enforce"는 예방, "detect/identify/find/audit"는 탐지, "automatically remediate/respond/notify"는 대응이다. 이 동사 매핑이 보안 문제 정답률을 크게 올린다.

## 위협 탐지의 분업 — GuardDuty·Inspector·Macie·Access Analyzer는 무엇을 다르게 보는가

탐지 서비스가 여럿인 이유는 각각 **다른 종류의 위협 신호**를 본다. 이 분업을 단서로 매핑하면 즉답이 나온다.

| 서비스 | 보는 것 | 신호원 | 대표 단서 |
|------|------|------|------|
| **GuardDuty** | 위협 행위(이상 행동) | CloudTrail·VPC Flow·DNS·EKS Audit·S3·RDS·Lambda | "비정상 API 호출·암호화폐 채굴·침해 징후" |
| **Inspector** | 소프트웨어 취약점(CVE) | EC2·ECR·Lambda 패키지/OS | "EC2/컨테이너 CVE 스캔·우선순위" |
| **Macie** | 민감 데이터(PII) | S3 객체 내용(ML 분류) | "S3에 PII/카드번호 있는지" |
| **IAM Access Analyzer** | 외부 노출·과잉 권한 | 리소스 정책·IAM 정책 분석 | "외부 공개 리소스·정책 검증" |
| **Detective** | 사건의 인과·범위 | GuardDuty/CloudTrail 그래프 분석 | "침해 사건의 근본 원인·연결" |

> 💡 **관련 이론**: GuardDuty와 Inspector의 차이는 **행위 기반(behavior-based) 탐지 vs 시그니처/취약점 기반(vulnerability-based) 탐지**라는 침입 탐지의 두 패러다임 차이다. GuardDuty는 **이상 탐지(anomaly detection)** — 정상 행동의 기준선을 ML로 학습하고 거기서 벗어난 행위(평소 안 쓰던 리전에서 대량 API 호출, 알려진 악성 IP와 통신)를 위협으로 본다. Inspector는 **알려진 취약점 매칭** — CVE 데이터베이스와 설치된 패키지를 대조해 "이 라이브러리에 알려진 구멍이 있다"를 찾는다. 비유하면 GuardDuty는 "수상한 행동을 감시하는 경비원"(누가 평소와 다르게 행동하나), Inspector는 "잠기지 않은 창문을 점검하는 안전 진단"(어디가 뚫려 있나)이다. 둘은 보완 관계 — Inspector가 막지 못한 취약점이 악용되는 순간을 GuardDuty가 행위로 잡는다. 시험에서 "CVE/패치"는 Inspector, "이상 행위/침해 징후"는 GuardDuty로 갈린다.

> ⚠️ **함정**: **GuardDuty(탐지)와 Security Hub(집계)를 혼동하면 안 된다.** GuardDuty는 위협을 **탐지해 Finding을 생성**하는 엔진이고, Security Hub는 GuardDuty·Inspector·Macie·Config 등 **여러 소스의 Finding을 한곳에 집계하고 보안 표준(CIS·PCI DSS·AWS Foundational)에 대조 점수를 매기는** 대시보드다. "위협을 탐지"는 GuardDuty, "모든 보안 발견을 통합 + 컴플라이언스 표준 점검"은 Security Hub다. 둘을 하나로 묶어 "GuardDuty가 컴플라이언스 점수를 매긴다"는 보기는 틀리다. 비슷하게 **Config Aggregator(구성·규칙 집계)와 Security Hub Region Aggregator(Finding 집계)**도 모으는 대상이 다르다 — Config는 리소스 구성과 규칙 준수, SH는 보안 Finding이다.

## 자동 대응 — 이벤트 기반 아키텍처의 제어 루프

도메인 5의 심장은 **EventBridge**다. 거의 모든 자동 대응이 "신호 → EventBridge Rule → 대상(Lambda/SSM/Step Functions) → 알림"의 형태를 띤다.

```
신호원 (GuardDuty Finding / Config Non-Compliant / CloudWatch Alarm / Health Event)
        │ 이벤트 발행
        ▼
EventBridge Rule (이벤트 패턴 필터)
        │ 매칭
        ▼
대상 선택
   ├─ Lambda            : 단순/즉시 조치(IAM 키 비활성화)
   ├─ SSM Automation    : 사전정의 Runbook(+ aws:approve 사람 승인)
   └─ Step Functions    : 다단계·재시도·감사가 필요한 워크플로
        │
        ▼
알림/추적 (SNS / Chatbot(Slack) / Incident Manager)
```

> 💡 **관련 이론**: 이것이 **이벤트 기반 아키텍처(Event-Driven Architecture, EDA)**의 정수다. 핵심은 **생산자(이벤트 발행)와 소비자(대응)의 느슨한 결합(loose coupling)** — GuardDuty는 "누가 내 Finding을 처리하는지" 모르고 그냥 이벤트를 발행하며, EventBridge가 라우팅을 책임진다. 이는 도메인 4에서 본 관찰성의 제어 루프와 같은 **폐쇄 루프 제어(closed-loop control)**다 — 탐지(센서) → 판단(EventBridge 필터) → 작동(actuator) → 다시 상태 관측. 사이버네틱스(cybernetics)의 피드백 루프가 보안 운영으로 내려온 형태다. EventBridge가 SNS·Lambda 직접 호출보다 우월한 이유: (1) 풍부한 이벤트 패턴 필터링(내용 기반 라우팅), (2) 다중 대상 fan-out, (3) cross-account 이벤트 버스(한 계정의 보안 이벤트를 중앙 Audit 계정 버스로), (4) 재시도·DLQ·아카이브·리플레이. 시험에서 "자동 대응의 진입점"은 거의 항상 EventBridge다.

> 🔍 **더 깊이**: 대상 선택(Lambda vs SSM Automation vs Step Functions)이 Pro 단골이다. **Lambda**는 코드로 임의 조치를 하지만 15분 제한·상태 관리 부담이 있어 단순·즉시 조치에 맞다. **SSM Automation**은 사전 정의된 Runbook(수백 개 AWS 제공 + 커스텀)을 쓰고, 결정적으로 **`aws:approve` 단계로 사람 승인을 워크플로에 넣을 수 있다** — "자동 수정하되 위험한 조치는 사람이 승인" 요건의 정답이다. **Step Functions**는 다단계·분기·재시도·긴 실행·**감사 가능한 실행 이력**이 필요한 복잡한 Runbook에 맞다(Standard 워크플로는 1년까지, 각 단계가 기록돼 사후 감사 가능). 시험 매핑: "사람 승인 포함 Runbook" → SSM Automation aws:approve, "다단계·재시도·감사 추적 워크플로" → Step Functions Standard, "단순 즉시 조치" → Lambda.

> ⚠️ **함정**: 자동 대응에서 **무한 루프와 폭주(runaway automation)**를 막아야 한다. 예컨대 "비준수 리소스를 자동 삭제"하는 대응이 잘못된 규칙과 결합하면 정상 리소스를 대량 삭제할 수 있다. SQS DLQ 자동 re-drive도 실패 메시지를 무한 재처리하면 비용·부하가 폭발한다. 안전장치: (1) 대응에 **임계/카운트 제한**(재시도 N회 초과 시 사람 개입), (2) FIS Stop Condition처럼 CloudWatch Alarm 연동 차단, (3) 위험 조치는 SSM `aws:approve`로 사람 게이트. "자동화는 좋지만 통제 불능을 막아야 한다"는 균형이 Pro 시험의 성숙도 단서다.

> 📚 **사례**: 2019년 **Capital One 데이터 유출**(약 1억 600만 명의 미국·캐나다 고객 정보)은 탐지·대응의 교훈으로 자주 인용된다. 공격자는 잘못 구성된 WAF(SSRF 취약점)를 통해 EC2 인스턴스의 IMDS에서 IAM 자격을 탈취하고, 그 권한으로 S3 버킷의 대량 데이터를 빼냈다. 핵심 교훈 셋: (1) **예방**(WAF 구성·IMDSv2 강제·최소 권한)이 무너지면, (2) **탐지**(비정상 S3 대량 접근을 GuardDuty가, 과잉 권한을 Access Analyzer가)가 빨라야 하고, (3) **대응**(자격 즉시 무효화·접근 차단 자동화)이 자동이어야 피해가 줄었다. 이 사건 이후 IMDSv2(SSRF 방어)와 GuardDuty의 자격 탈취 탐지(`UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration`)가 강조됐다. DOP 시험이 "탈취된 IAM 자격 자동 무효화", "공개 S3 자동 차단"을 묻는 배경이 이런 실제 사고다.

## 멀티 계정 보안 거버넌스 — 왜 "위임 + 중앙 집계"로 수렴하는가

50개 계정에 보안 도구를 일일이 켜고 Finding을 계정마다 확인하는 것은 불가능하다. AWS의 거의 모든 보안 서비스가 **Delegated Administrator(위임 관리자) + 중앙 집계** 패턴을 지원하는 이유다.

> 💡 **관련 이론**: 이 패턴은 도메인 1의 Tooling 계정 Hub-Spoke, 도메인 4의 CloudWatch OAM과 **같은 구조적 원형(archetype)** — **"권한은 중앙에 위임하되 데이터는 한곳에 모은다"**이다. Organizations의 관리(management) 계정은 보안 운영을 직접 하지 않고(공격 표적이 되면 안 되므로), 보안 운영을 전담하는 **Audit 계정에 위임**한다. 그러면 GuardDuty·Security Hub·Config·Macie·Inspector 모두 Audit 계정이 조직 전체의 위임 관리자가 되어, 각 멤버 계정에서 자동 활성화하고(Org **Auto-Enable**으로 신규 계정도 자동 포함) Finding을 Audit 계정에 집계한다. 이는 **최소 권한 원칙 + 관심사 분리**의 조직 적용 — 결제·조직 구조(management)와 보안 운영(audit)을 분리해, 한 계정의 침해가 둘 다를 잃게 하지 않는다. 시험에서 "신규 계정에도 GuardDuty/보안이 자동 적용"은 Delegated Admin + Auto-Enable이 정답이며, StackSets로 각 계정에 켜는 것보다 이 네이티브 Org 통합이 우월하다.

> 🔍 **더 깊이**: **로그의 중앙화도 같은 원리**로, 별도의 **Log Archive 계정**에 Organization Trail(CloudTrail)을 집중한다. 핵심은 이 로그를 **불변(immutable)**으로 만드는 것 — 침해 시 공격자가 흔적을 지우지 못하게 S3 Object Lock(WORM, Write Once Read Many)을 걸고, Log Archive 계정의 접근을 극도로 제한한다. 이는 컴플라이언스의 **무결성·부인 방지(non-repudiation)** 요건이다. CloudTrail Lake는 여기에 SQL 쿼리·장기 보존을 더해 감사·포렌식 분석을 돕는다. Audit 계정(보안 운영·실시간 대응)과 Log Archive 계정(불변 증거 보관)을 **분리**하는 것이 표준 — 운영 권한과 증거 보관 권한을 나눠 한쪽 침해가 증거까지 오염시키지 못하게 한다.

## 컴플라이언스 자동화 — 증거를 사람이 모으지 않는다

규제 산업(금융·의료)은 SOC 2·PCI DSS·HIPAA·ISO 27001 감사를 위해 방대한 증거를 모아야 한다. 이를 손으로 하면 분기마다 수주가 든다. **AWS Audit Manager**가 이 증거 수집을 자동화한다.

> 🔍 **더 깊이**: Audit Manager는 사전 정의된 **프레임워크**(AWS Foundational Security Best Practices, SOC 2, PCI DSS, HIPAA, GDPR, ISO 27001 등 — 각각 실제 규격의 통제 항목을 매핑)에 따라, CloudTrail 이벤트·Config 구성 스냅샷·Security Hub Finding을 **증거(evidence)로 자동 수집·정리**하고 Assessment Report(감사자 제출용 PDF)를 만든다. 핵심 전제: Audit Manager는 스스로 데이터를 만들지 않고 **다른 서비스의 출력을 증거로 엮는다** — 따라서 Config·CloudTrail·Security Hub가 활성화돼 있어야 한다(이게 함정 단골). 비교하자면 **Config는 "지금 구성이 규칙에 맞나"(실시간 준수), Audit Manager는 "그 준수의 증거를 감사용으로 축적"(증거 관리)**으로 시간 지평이 다르다. 시험에서 "SOC 2/HIPAA 감사 증거를 자동 수집·보고"는 Audit Manager, "리소스가 정책 준수인지 실시간 평가 + 자동 수정"은 Config Rule + Remediation이다.

> 📚 **사례**: 컴플라이언스 표준의 번호를 알아두면 단서가 보인다. **PCI DSS**(Payment Card Industry Data Security Standard)는 카드 데이터 보호 규격으로 "카드번호 저장·전송" 단서와 함께 나온다. **HIPAA**는 미국 의료정보 보호법(보호 대상 건강정보 PHI). **SOC 2**(System and Organization Controls 2)는 AICPA의 신뢰 서비스 기준(보안·가용성·기밀성 등). **ISO/IEC 27001**은 정보보안 경영시스템(ISMS) 국제 표준. **NIST SP 800-53**은 미국 연방 시스템의 보안 통제 카탈로그, **NIST CSF**는 앞서 본 5기능 프레임워크다. 시험은 보통 "어떤 규격이냐"보다 "그 규격 증거를 어떻게 자동 수집하느냐(Audit Manager)"를 묻지만, 규격명이 나오면 "수동 수집"류 보기는 오답이고 자동화가 정답이다.

```
멀티 계정 보안·인시던트 통합 (통제 3범주로 본 흐름)
==================================================
  [예방]  SCP/Permission Boundary/WAF  ── 사건 차단
  [탐지]  멤버 계정 ── Delegated Admin ──► Audit 계정
            GuardDuty·Inspector·Macie·Config·Security Hub
            (Org Auto-Enable: 신규 계정 자동 포함)
            로그 ──► Log Archive 계정(CloudTrail Org Trail, S3 Object Lock 불변)
  [대응]  Finding/Alarm ──► EventBridge(cross-account bus)
            ├─ Lambda(즉시: IAM 키 비활성화)
            ├─ SSM Automation(aws:approve 사람 승인)
            └─ Step Functions(다단계·감사) ──► Incident Manager/Chatbot
  [감사]  Audit Manager ── Config/CloudTrail/SH 증거 자동 수집 ──► Report PDF
```

> 🎯 **시나리오**: "규제 핀테크가 60개 계정을 운영한다. 요구사항: ① prod 계정에서 승인 안 된 리전 사용 차단 ② 모든 계정에 GuardDuty·Config 활성 + 신규 계정 자동 포함 ③ S3 버킷이 공개되면 자동 차단하되, 프로덕션 리소스 삭제 같은 위험 조치는 사람 승인 ④ 탈취된 IAM 자격을 자동 무효화 ⑤ SOC 2 증거를 자동 수집해 감사자에게 제출 ⑥ CloudTrail 로그를 공격자가 못 지우게." → ① **SCP Deny**(예방). ② **Delegated Admin + Auto-Enable**(탐지, Audit 계정). ③ **Config Rule + SSM Automation(aws:approve)**(대응 + 사람 게이트). ④ **GuardDuty Finding → EventBridge → Lambda**(IAM 키 비활성화). ⑤ **Audit Manager**(SOC 2 프레임워크). ⑥ **Log Archive 계정 + CloudTrail Org Trail + S3 Object Lock**(불변). 여섯 단서가 예방·탐지·대응·감사를 모두 가로지른다 — Capital One류 사고가 가르친 심층 방어의 종합판이다.

## 정리하며

오늘 도메인 5+6의 31%를 다섯 줄기로 묶었다. 첫째, **모든 통제는 예방·탐지·대응 세 범주**(NIST CSF·COSO 뿌리)로 분류되고 어느 하나로 충분치 않아 심층 방어가 필요하며, 문제의 동사(prevent/detect/respond)가 범주 단서다. 둘째, **탐지 서비스는 신호원이 다르다** — GuardDuty(이상 행위)·Inspector(CVE)·Macie(PII)·Access Analyzer(외부 노출)·Detective(인과)이고, GuardDuty(탐지)와 Security Hub(집계)는 역할이 다르다. 셋째, **자동 대응은 EventBridge 중심의 이벤트 기반 폐쇄 루프**이며 Lambda/SSM(aws:approve)/Step Functions를 요건별로 고르고, 폭주를 막는 안전장치가 성숙도 단서다. 넷째, **멀티 계정 보안은 Delegated Admin + Auto-Enable + 중앙 집계**로 수렴하고 Log Archive 계정의 불변 로그(S3 Object Lock)가 무결성을 보장한다. 다섯째, **Audit Manager가 컴플라이언스 증거를 자동 수집**하되 Config·CloudTrail·Security Hub 활성을 전제하며, Capital One·심층 방어가 그 정당성을 보여준다.

16주의 이론 학습이 여기서 마무리된다. 다음 글부터는 이 모든 도메인을 실전 모의고사로 통합 점검한다.

---

## 📝 연습 문제

**문제 1.** "개발자가 prod 계정에서 승인되지 않은 리전을 사용하지 못하게 사전 차단"하고, 별도로 "이미 그런 사용이 있었는지 감사"하며, 또 "발생 시 자동으로 되돌리고 싶다." 각각 어떤 통제 범주·서비스인가?

A) 셋 다 GuardDuty

B) 차단=예방(SCP Deny), 감사=탐지(Config Rule + CloudTrail), 자동 복구=대응(Config Auto-Remediation/SSM)

C) 셋 다 Security Hub

D) 차단=Lambda, 감사=Lambda, 복구=Lambda

**정답: B**

해설: 통제는 예방·탐지·대응 세 범주로 나뉘며 문제의 동사가 단서다 — "차단/prevent"는 예방(SCP Deny가 OU/계정 리전 가드레일), "감사/detect"는 탐지(Config Rule이 비준수 평가, CloudTrail이 행위 기록), "자동 복구/remediate"는 대응(Config Auto-Remediation 또는 SSM Document)이다. 단일 서비스(A·C·D)로 세 범주를 다 푼다는 보기는 심층 방어 원리에 어긋난다.

---

**문제 2.** 한 시나리오에서 "EC2 인스턴스의 OS·패키지에 알려진 CVE가 있는지 스캔하고 우선순위를 매겨라"와 "평소와 다른 비정상 API 호출·암호화폐 채굴 등 침해 징후를 탐지하라"가 함께 요구된다. 각각의 서비스는?

A) 둘 다 GuardDuty

B) CVE 스캔=Amazon Inspector, 비정상 행위 탐지=Amazon GuardDuty

C) 둘 다 Inspector

D) CVE=Macie, 행위=Inspector

**정답: B**

해설: Inspector는 취약점 기반 탐지로 설치된 패키지·OS를 CVE 데이터베이스와 대조해 "어디가 뚫려 있나"를 찾고 우선순위를 매긴다. GuardDuty는 행위 기반 이상 탐지로 정상 기준선에서 벗어난 행위(비정상 API·악성 IP 통신·채굴)를 잡는다. 둘은 보완 관계지만 역할이 다르다. Macie(D)는 S3 PII 탐지로 무관하다.

---

**문제 3.** S3 버킷이 공개로 설정되면 자동으로 차단하되, "프로덕션 데이터가 든 버킷을 삭제·변경하는 위험한 조치는 반드시 사람이 승인"하도록 워크플로에 게이트를 넣고 싶다. 가장 적절한 구성은?

A) Lambda가 발견 즉시 무조건 모든 조치 실행

B) Config Rule이 비준수 탐지 → SSM Automation Runbook으로 자동 차단하되, 위험 단계에는 `aws:approve` 단계를 넣어 사람 승인 후 진행

C) GuardDuty가 직접 버킷을 수정

D) Macie로 차단

**정답: B**

해설: Config Rule이 공개 버킷을 비준수로 탐지하고 SSM Automation Runbook이 자동 수정을 수행하되, 위험한 조치(삭제·변경)에는 SSM의 `aws:approve` 단계로 사람 승인을 워크플로에 삽입한다 — "자동화 + 위험 조치 사람 게이트"의 표준이다. 무조건 즉시 실행(A)은 폭주 위험, GuardDuty(C)는 수정 액터가 아니라 탐지, Macie(D)는 PII 탐지로 무관하다.

---

**문제 4.** GuardDuty가 "EC2 인스턴스 자격 증명이 외부로 탈취됐다"는 Finding을 생성했을 때, 사람 개입 없이 즉시 해당 자격을 무효화하는 자동 대응을 구성하려 한다. 가장 적절한 진입점과 흐름은?

A) SNS가 직접 IAM을 수정

B) GuardDuty Finding → EventBridge Rule(이벤트 패턴 필터) → Lambda(해당 Role 세션 무효화/정책 격리) → SNS/Incident Manager 알림

C) Config Aggregator가 자격을 무효화

D) CloudTrail이 자동으로 차단

**정답: B**

해설: 자동 대응의 진입점은 EventBridge다 — GuardDuty Finding을 이벤트 패턴으로 필터해 Lambda를 트리거하고, Lambda가 탈취된 Role의 세션을 무효화하거나 격리 정책을 부착한 뒤 알림을 보낸다. 이는 탐지→판단→작동의 폐쇄 루프이며 Capital One류 자격 탈취 사고의 표준 대응이다. SNS(A)·Config Aggregator(C)·CloudTrail(D)은 조치 액터가 아니다.

---

**문제 5.** 60개 계정 전체에 GuardDuty와 Security Hub를 활성화하고, 앞으로 Organizations에 새로 들어오는 계정도 자동 포함되며, 모든 Finding을 단일 Audit 계정에 집계하려 한다. 가장 적절한 구성은?

A) 각 계정 관리자가 콘솔에서 수동 활성화

B) Audit 계정을 Delegated Administrator로 지정하고 Org Auto-Enable을 켜 신규 계정을 자동 포함, Security Hub Region Aggregator로 멀티 리전 Finding을 집계

C) StackSets로 매번 각 계정에 켠다

D) Lambda가 매일 신규 계정을 스캔해 활성화

**정답: B**

해설: AWS 보안 서비스의 멀티 계정 표준은 Audit 계정을 Delegated Administrator로 위임하고 Org Auto-Enable로 신규 계정을 자동 포함하는 것이다 — management 계정은 보안 운영을 직접 하지 않고 위임해 관심사를 분리한다. Finding 멀티 리전 집계는 Security Hub Region Aggregator다. 수동(A)·StackSets 반복(C)·Lambda 스캔(D)은 누락·운영 부담의 안티패턴이며 네이티브 Org 통합이 우월하다.

---

**문제 6.** 분기마다 SOC 2 감사를 위해 보안 통제의 증거를 모아야 하는데 수작업이 수주씩 걸린다. CloudTrail·Config·Security Hub는 이미 활성화돼 있다. 증거 수집·보고를 자동화하려면?

A) Athena로 매번 직접 쿼리

B) AWS Audit Manager의 SOC 2 프레임워크를 사용해 CloudTrail·Config·Security Hub 출력을 증거로 자동 수집하고 Assessment Report를 생성

C) Macie로 증거 수집

D) Config Aggregator로 보고서 생성

**정답: B**

해설: Audit Manager는 사전 정의된 프레임워크(SOC 2·PCI DSS·HIPAA 등)에 따라 CloudTrail·Config·Security Hub의 출력을 증거로 자동 수집·정리하고 감사자 제출용 Assessment Report를 만든다 — 단, 그 소스 서비스들이 활성화돼 있어야 한다(이미 충족). Config는 실시간 준수 평가이지 감사 증거 축적·보고가 아니다(D). Athena 수동 쿼리(A)·Macie(C)는 컴플라이언스 증거 자동화가 아니다.

---

**문제 7.** 침해 발생 시 공격자가 흔적을 지우지 못하도록 CloudTrail 로그의 무결성을 보장하려 한다. 가장 적절한 설계는?

A) 각 계정의 기본 CloudTrail에 로그를 그대로 둔다

B) 별도 Log Archive 계정에 Organization Trail로 로그를 집중하고, S3 Object Lock(WORM)을 걸어 불변으로 만들며 해당 계정 접근을 극도로 제한

C) CloudWatch Logs에만 보관

D) 로그를 매일 Lambda로 삭제·아카이브

**정답: B**

해설: 무결성·부인 방지를 위해 로그를 보안 운영(Audit)과 분리된 Log Archive 계정에 Organization Trail로 집중하고, S3 Object Lock(WORM)으로 불변화해 공격자(또는 운영자)도 지울 수 없게 한다 — 운영 권한과 증거 보관 권한을 분리하는 표준이다. 각 계정 기본 Trail(A)은 침해 계정에서 삭제 가능, CloudWatch Logs만(C)은 장기 불변 보관에 부적합, Lambda 삭제(D)는 증거를 없애는 안티패턴이다.

---

## 📌 오늘의 요약

1. 모든 통제는 예방·탐지·대응 세 범주(NIST CSF·COSO)이고 심층 방어가 필요하며, 문제의 동사가 범주 단서다.
2. 탐지 서비스는 신호원이 다르다 — GuardDuty(행위)·Inspector(CVE)·Macie(PII)·Access Analyzer(노출)·Detective(인과), GuardDuty(탐지)≠Security Hub(집계).
3. 자동 대응은 EventBridge 중심 폐쇄 루프이며 Lambda/SSM(aws:approve)/Step Functions를 요건별 선택, 폭주 방지가 성숙도 단서다.
4. 멀티 계정 보안은 Delegated Admin + Auto-Enable + 중앙 집계로 수렴, Log Archive 계정의 불변 로그(S3 Object Lock)가 무결성 보장.
5. Audit Manager가 컴플라이언스 증거를 자동 수집(Config/CloudTrail/SH 전제), Capital One 사고가 심층 방어의 정당성을 보여준다.
