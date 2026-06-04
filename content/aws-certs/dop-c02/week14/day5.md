# Day 5 - Week 14 종합 복습: 보안 자동화 스택의 큰 그림과 실전 시나리오

Week 14는 한 문장으로 요약된다 — "탐지하고(Detect), 통합하고(Aggregate), 평가하고(Assess), 증명하고(Prove), 자동으로 대응한다(Respond)." GuardDuty가 위협을 탐지하고, Security Hub가 모든 Finding을 ASFF로 통합하며, Config가 리소스 컴플라이언스를 평가하고, Audit Manager·Macie·Inspector·Access Analyzer가 감사 증거·민감 데이터·취약점·외부 노출을 다루며, 이 모두가 EventBridge → SSM Automation/Lambda로 자동 대응에 연결된다. 오늘은 이 다섯 조각을 하나의 그림으로 다시 맞추고, 실전 시나리오 12개로 경계 케이스와 함정을 점검한다.

## 큰 그림 — 다섯 조각이 어떻게 맞물리는가

```
                    [데이터 평면 로그·리소스 상태]
                              │
   ┌──────────────┬──────────┼──────────────┬─────────────────┐
   ▼              ▼          ▼              ▼                 ▼
GuardDuty      Inspector   Macie      Access Analyzer       Config
(위협·행동)    (CVE 취약점) (민감데이터) (외부노출·미사용)   (리소스 컴플라이언스)
   │              │          │              │                 │
   └──────────────┴──────────┴──── ASFF ────┴─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Security Hub   │  ← 정규화·중복제거·우선순위·표준평가
                    │  (단일 진실출처)  │     FSBP/CIS/PCI/NIST
                    └─────────┬────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        Custom Action   Automation Rule   Findings-Imported
        (수동 HITL)     (필드갱신만)       → EventBridge
                                                 │
                              ┌──────────────────┴─────────┐
                              ▼                            ▼
                      SSM Automation Runbook          Lambda
                      (격리·스냅샷·교정)            (커스텀 수정)

  [감사]  Audit Manager → SOC2/HIPAA/PCI 증거 자동수집 → Assessment Report
  [거버넌스] Firewall Manager(중앙 WAF/Shield)  │  CloudTrail Lake(7년 SQL 조사)
  [멀티계정] Delegated Administrator  │  [멀티리전] Region/Config Aggregator
```

핵심 관통 원리는 셋이다. 첫째, **모든 신호가 ASFF로 정규화되어 Security Hub로 수렴**한다 — 도구마다 다른 출력을 하나의 언어로 통일하는 게 자동화의 전제다. 둘째, **자동 대응은 작업의 위험도·가역성에 따라 갈린다** — 안전·가역적이면 완전 자동(Imported→Lambda), 파괴적이면 사람 승인(Custom Action HITL). 셋째, **멀티 계정은 Delegated Administrator, 멀티 리전은 Aggregator라는 직교 축**으로 통합한다.

## 서비스별 역할 경계 — 헷갈리는 짝 정리

| 헷갈리는 짝 | 구분 |
|------------|------|
| **GuardDuty vs Inspector** | 위협·행동 탐지(런타임) vs CVE 취약점 스캔(자산) |
| **Config vs CloudTrail** | 리소스 상태·형상 vs API 호출·행위 감사 |
| **Config vs Audit Manager** | 지금 컴플라이언트한가 평가·교정 vs 증명할 증거 수집·보고서 |
| **Macie vs Inspector** | S3 민감 데이터(PII/PHI) vs 패키지 CVE 취약점 |
| **Custom Action vs Automation Rule** | 운영자 수동 트리거(HITL) vs Lambda 없는 자동 필드 갱신 |
| **Automation Rule vs Imported→Lambda** | Finding 필드만 갱신(리소스 수정 불가) vs 실제 리소스 수정 |
| **Delegated Administrator vs Aggregator** | 멀티 계정 통합 vs 멀티 리전 통합 |
| **Suppression Rule vs Trusted IP** | Finding 보존+숨김 vs Finding 생성 차단(사각지대 위험) |

> 💡 **관련 이론**: 이 전체 스택은 NIST 사이버보안 프레임워크(CSF)의 5함수로 정리된다. **식별** Config·Macie·Access Analyzer / **보호** Firewall Manager·Conformance Pack·KMS / **탐지** GuardDuty·Inspector·Security Hub / **대응** EventBridge→SSM·Lambda / **복구** 스냅샷·백업·PITR. 시나리오에서 "어느 단계가 비어 있는가"를 CSF로 진단하면 무엇을 추가할지 빠르게 보인다. NIST CSF는 2014년 미국 행정명령(EO 13636)에 따라 중요 인프라 보호용으로 만들어졌고, 2024년 CSF 2.0에서 "거버넌스(Govern)" 함수가 추가되어 6함수가 됐다 — 거버넌스는 위 다섯을 관통하는 정책·역할·리스크 관리 층으로, AWS에선 Organizations·Control Tower·SCP가 이를 담당한다.

> 🔍 **더 깊이**: 이 스택을 관통하는 또 하나의 사상이 **심층 방어(defense in depth)**다. 단일 통제에 의존하지 않고 탐지·예방·대응을 여러 겹으로 쌓아, 한 겹이 뚫려도 다음 겹이 막는다 — 중세 성의 해자·성벽·내성 구조에서 따온 군사 개념(미 NSA가 정보보안에 도입)이다. Week 14의 도구들은 서로 다른 층을 채운다: Firewall Manager·Config(예방, 잘못된 설정 차단), GuardDuty·Inspector(탐지, 뚫린 뒤 감지), EventBridge→SSM(대응, 자동 격리), CloudTrail Lake(사후, 무슨 일이 있었나). 캐피털 원 사고(Day 1)가 보여준 건 한 겹(WAF 오설정)이 뚫렸을 때 다음 겹(자격 증명 탈취 탐지·자동 무력화)이 없으면 피해가 커진다는 것이다 — 심층 방어의 부재가 곧 단일 장애점이 된다.

## 🧠 실전 시나리오 12문항

**문제 1.** GuardDuty가 프로덕션 EC2에서 `Backdoor:EC2/C&CActivity.B!DNS`(Severity 8.7)를 탐지했다. 사람 개입 없이 ①포렌식 증거 보존 ②네트워크 격리 ③운영팀 알림을 자동화하되, 공격자가 무엇을 했는지 조사할 수 있어야 한다. 올바른 자동 대응 순서는?

A) 인스턴스를 즉시 종료해 C2 통신을 끊고 SNS로 운영팀에 알림 — 위협 확산을 최우선 차단

B) EventBridge(severity≥7 + type prefix 필터) → SSM Runbook: EBS 스냅샷(먼저) → 격리 SG로 교체(종료 아님) → incident-id 태그 → SNS 알림

C) Lambda로 인스턴스를 재부팅해 악성 프로세스를 종료한 뒤 스냅샷을 떠 증거를 보존하고 알림

D) Custom Action으로 운영자 수동 승인을 받은 뒤 스냅샷·격리를 실행해 오탐 피해를 방지

**정답: B**

해설: 포렌식 증거 보존을 위해 EBS 스냅샷을 가장 먼저 떠야 한다 — 종료·오염 후엔 메모리·디스크 상태가 사라진다. "격리"는 인스턴스 종료가 아니라 격리 SG(모든 아웃바운드 차단 + 포렌식 점프박스 인바운드만 허용)로 C2 통신만 끊고 조사자 접근은 남기는 것이다. 즉시 종료(A)·재부팅(C)은 증거 인멸이고, "사람 개입 없이"라 했으므로 수동 승인(D)은 요구에 어긋난다. EventBridge가 severity·type을 필터해 SSM Runbook을 호출하는 게 표준이다.

---

**문제 2.** 50개 계정 × 3개 리전 조직에서 모든 계정·리전의 보안 Finding을 Audit 계정 한 화면에서 보려 한다. 올바른 설정 조합은?

A) Delegated Administrator만 설정해 50개 계정을 Audit 계정으로 통합(리전은 대표 리전 하나만 사용)

B) Region Aggregator만 설정해 3개 리전을 한 리전으로 통합(계정은 멤버 초대로 개별 연결)

C) Delegated Administrator(50개 계정 통합) + Cross-Region Aggregation(3개 리전 통합)을 함께 설정

D) 각 계정·리전 콘솔을 일일이 확인하되 CloudWatch 대시보드로 Finding 수만 집계해 모니터링

**정답: C**

해설: 멀티 계정과 멀티 리전은 직교하는 두 축이다. Delegated Administrator는 계정 차원 통합, Region Aggregator는 리전 차원 통합이다. 50개 계정 × 3개 리전이면 둘 다 필요하다 — 하나만 설정하면(A·B) 나머지 축은 통합되지 않는다. 수동 확인(D)은 비현실적이다. 이 직교성을 구분하는 게 핵심이다.

---

**문제 3.** FSBP 표준의 S3.1(퍼블릭 액세스 차단) 컨트롤이 FAILED인 버킷을 사람 없이 즉시 비공개로 교정하려 한다. 올바른 구현은?

A) Security Hub Automation Rule에 S3.1 FAILED 매칭 조건을 걸어 버킷을 비공개로 자동 수정

B) EventBridge(`Security Hub Findings - Imported`, GeneratorId prefix S3.1, Compliance FAILED) → Lambda가 Block Public Access 강제

C) Custom Action을 만들어 운영자가 콘솔에서 해당 Finding을 선택해 비공개 처리 트리거

D) Suppression Rule로 S3.1 FAILED Finding을 숨겨 노이즈를 줄이고 정기 리뷰에서 일괄 교정

**정답: B**

해설: 실제 리소스 수정은 EventBridge(`Findings - Imported`)로 Finding을 받아 Lambda/SSM이 처리해야 한다. Automation Rule(A)은 Finding의 필드만 갱신할 뿐 실제 리소스를 고치지 못한다 — 이게 핵심 함정이다. Custom Action(C)은 사람 트리거라 "사람 없이"에 어긋나고, Suppression(D)은 문제를 숨길 뿐 교정하지 않는다. "Lambda 없이 억제·라벨링"은 Automation Rule, "실제 리소스 수정"은 EventBridge+Lambda/SSM이다.

---

**문제 4.** PCI DSS·NIST 800-53 컴플라이언스 규칙 묶음을 조직 전체(OU)에 일괄 배포하고, 위반 시 자동 수정도 함께 걸려 한다. 올바른 도구는?

A) 각 계정에 PCI·NIST 대응 Config Rule을 하나씩 수동 생성하고 Remediation도 개별 연결

B) Conformance Pack(Config Rule + Remediation 묶음)을 내부 StackSets 흐름으로 OU 배포

C) Security Hub의 PCI/NIST Standards만 활성화해 컨트롤 평가를 조직 전체에 적용

D) Audit Manager의 PCI·NIST Framework를 배포해 컨트롤 평가와 위반 자동 수정을 수행

**정답: B**

해설: Conformance Pack은 여러 Config Rule과 Remediation을 YAML로 묶어 내부적으로 CloudFormation StackSets를 통해 OU 전체에 배포한다. 사전 정의 팩(PCI/NIST/HIPAA/FedRAMP)을 제공한다. 수동 생성(A)은 비현실적이고, Security Hub Standards(C)는 평가·통합 대시보드이지 Remediation 포함 묶음 배포 단위가 아니며, Audit Manager(D)는 감사 증거 수집으로 역할이 다르다.

---

**문제 5.** 자동 Remediation을 켰는데 같은 리소스가 끊임없이 수정-재위반(flapping)하며 API 스로틀과 비용 폭증이 발생한다. 원인 진단과 안전장치는?

A) 자동 교정이 동작 중인 정상 상태이므로 무시하고 스로틀 한도만 상향 요청해 비용을 수용

B) 외부 프로세스가 계속 리소스를 NON_COMPLIANT로 되돌림 + MaximumAutomaticAttempts 미설정이 원인 — MaximumAutomaticAttempts·RetryAttemptSeconds로 재시도 제한, 정당한 예외엔 제외 태그

C) 해당 Config Rule의 자동 Remediation을 끄고 위반 리소스를 수동으로 일괄 교정

D) flapping이 적은 다른 리전으로 워크로드를 옮겨 API 스로틀 압박을 분산

**정답: B**

해설: 어떤 외부 자동화가 계속 리소스를 위반 상태로 되돌리면 Config가 무한 수정을 시도해 flapping이 발생한다. MaximumAutomaticAttempts·RetryAttemptSeconds가 루프를 끊는 안전장치다. 정당한 리소스(의도된 퍼블릭 버킷 등)는 제외 태그를 두거나 파괴적 수정은 Automatic:false로 사람 승인을 끼운다. Config 비활성화(C)·리전 변경(D)은 근본 해결이 아니다.

---

**문제 6.** ECR에 컨테이너 이미지를 푸시할 때 OS 패키지뿐 아니라 npm/pip 의존성의 CVE까지 자동 스캔하고, 새 CVE가 공개되면 이미 푸시된 이미지를 자동 재평가하려 한다. 올바른 선택은?

A) Macie Discovery Job으로 ECR 이미지 레이어를 스캔해 의존성 취약점과 민감 데이터를 함께 탐지

B) Inspector v2 ECR Enhanced Scanning — OS+언어 의존성 CVE 스캔 + 신규 CVE 시 지속 재평가, Finding은 Security Hub 통합

C) GuardDuty Malware Protection으로 이미지 내 악성코드와 패키지 CVE를 런타임에 탐지

D) Config Rule로 ECR 리포지토리의 스캔 설정 준수 여부를 평가하고 미스캔 이미지를 탐지

**정답: B**

해설: Inspector v2는 ECR 컨테이너 이미지를 OS 패키지 + 언어 의존성(npm·pip·gem) CVE까지 스캔하고, 지속 모니터링으로 새 CVE 공개 시 이미 스캔한 이미지를 자동 재평가한다. Log4Shell 같은 사고에서 의존성 가시성이 핵심임을 보여준다. Macie(A)는 S3 민감 데이터, GuardDuty Malware Protection(C)은 EBS 멀웨어 스캔, Config(D)는 리소스 컴플라이언스로 CVE 스캔이 아니다.

---

**문제 7.** S3 데이터 레이크(수백 TB)에서 카드번호·SSN을 자동 발견하되 비용을 통제하려 한다. 올바른 접근은?

A) 매일 전체 버킷을 정밀 Discovery Job으로 풀스캔해 누락 없이 카드번호·SSN을 탐지

B) Macie 자동 민감 데이터 발견(샘플링 기반 상시 모니터링, 저비용) + 신규/변경 객체만 점진 Discovery Job, Luhn 검증으로 오탐 감소

C) 모든 객체를 EC2로 다운로드해 자체 정규식 스크립트로 카드번호·SSN을 수동 검사

D) Macie 대신 S3 인벤토리 + Athena 정규식 쿼리로 민감 데이터를 저비용으로 직접 탐지

**정답: B**

해설: Macie는 객체당·스토리지 단위로 과금되므로 대규모 레이크에서 매일 풀스캔(A)은 비용이 폭증한다. 자동 민감 데이터 발견(샘플링 상시 모니터링, 저비용)과 정밀 Discovery Job(고비용)을 구분하고, 새/변경 객체만 점진 스캔하는 게 실무 패턴이다. Luhn 검증으로 카드번호 오탐을 줄인다. 수동 검사(C)는 비현실적, 비활성화(D)는 컴플라이언스 사각지대다.

---

**문제 8.** 외부 계정·공개에 노출된 S3 버킷·IAM Role을 "놓치는 케이스 없이" 발견하고, CloudTrail 활동 기반으로 과도한 IAM 권한을 최소 권한까지 줄이려 한다. 올바른 조합은?

A) GuardDuty의 외부 접근 관련 Finding으로 노출을 탐지하고 IAM Access Advisor로 권한을 축소

B) IAM Access Analyzer — External Access Findings(Zelkova 자동 추론·형식 검증으로 외부 노출 발견) + Policy Generation(CloudTrail 기반 실사용 권한 정책 생성) + Unused Access

C) Config Rule(s3-bucket-public-read-prohibited 등)로 외부 노출을 평가하고 권한은 수동 검토로 축소

D) Macie로 외부 공유된 버킷의 민감 데이터를 탐지하고 IAM 권한 보고서로 과도 권한을 식별

**정답: B**

해설: Access Analyzer의 External Access Findings는 Zelkova 엔진의 자동 추론(SMT 솔버 기반 형식 검증)으로 모든 가능한 요청을 수학적으로 추론해 외부 노출을 놓침 없이 발견한다(AWS Provable Security). Policy Generation은 CloudTrail 실사용 권한만으로 정책을 만들고(관측 기반 최소 권한), Unused Access는 안 쓰는 권한을 찾는다. GuardDuty(A)는 위협 탐지, Macie(D)는 데이터 분류로 외부 노출·권한 분석이 아니다.

---

**문제 9.** SOC2·PCI 감사철마다 사람이 스크린샷·로그를 모으는 작업을 없애고, 증거를 상시 자동 수집해 감사인에게 보고서로 제출하려 한다. 올바른 도구는?

A) Config Aggregator로 멀티 계정 컴플라이언스 상태를 통합 조회해 감사 증거로 제출

B) Audit Manager — SOC2/PCI Framework가 규제 컨트롤에 증거(CloudTrail·Config·Security Hub)를 자동 매핑·수집하고 Assessment Report 생성

C) Security Hub Insights로 컨트롤별 Finding을 그룹화해 컴플라이언스 현황을 보고서화

D) CloudTrail Lake에 감사 기간 활동을 SQL로 조회해 증거를 추출하고 감사인에게 제출

**정답: B**

해설: Audit Manager는 사전 정의 Framework(SOC2·PCI·HIPAA·ISO 27001 등)의 컨트롤에 증거(CloudTrail API 활동·Config 리소스 상태·Security Hub Finding)를 자동 매핑·수집하고, 감사인에게 제출할 Assessment Report를 생성한다 — 지속적 컴플라이언스로 감사를 이벤트에서 상태로 바꾼다. Config Aggregator(A)는 컴플라이언스 통합 조회, Insights(C)는 저장된 쿼리, CloudTrail Lake(D)는 SQL 조사로 감사 증거 수집·보고서가 주 역할이 아니다.

---

**문제 10.** false positive를 줄이고 싶지만, 그 IP/패턴이 나중에 실제로 침해됐을 때를 대비해 사후 조사용 기록은 남기고자 한다. GuardDuty에서 올바른 선택은?

A) 해당 IP를 Trusted IP List에 추가해 그 IP에 대한 Finding 생성 자체를 차단해 노이즈 제거

B) Suppression Rule로 Finding은 생성·보존하되 콘솔/알림에서만 숨김

C) 해당 탐지 유형이 false positive가 잦으므로 GuardDuty의 그 탐지 항목을 비활성화

D) 해당 IP를 Threat IP List에 추가해 명시적 추적 대상으로 두고 Finding을 별도 관리

**정답: B**

해설: Trusted IP List(A)는 해당 IP의 Finding 생성 자체를 막아, 그 IP가 침해돼도 GuardDuty가 침묵하는 사각지대가 된다. Suppression Rule(B)은 Finding을 생성·보존하되 콘솔/알림에서만 숨기므로 사후 조사 데이터가 남는다. "false positive는 줄이되 감사 기록은 보존"이면 Suppression이 맞다. Threat IP List(D)는 오히려 적극 탐지용 악성 IP 목록이라 반대다.

---

**문제 11.** Security Hub에서 운영자가 콘솔에서 특정 Finding을 선택해 직접 대응을 트리거하려 한다(프로덕션 영향이 큰 파괴적 작업이라 사람 판단 필요). 올바른 구성과 발행되는 이벤트 타입은?

A) Automation Rule을 만들어 조건 매칭 시 `Findings - Imported` 흐름으로 SSM/Lambda 자동 트리거

B) Custom Action 생성 → 운영자 선택 트리거 → `Security Hub Findings - Custom Action` 이벤트 → EventBridge → SSM/Lambda

C) Conformance Pack의 Remediation을 연결해 해당 Finding 유형을 운영자 판단 후 일괄 수정

D) Insight로 Finding을 그룹화하고 임계 초과 시 자동으로 대응 워크플로를 실행

**정답: B**

해설: Custom Action은 운영자가 콘솔에서 Finding을 선택해 수동 트리거하는 human-in-the-loop 방식으로, 트리거 시 `Security Hub Findings - Custom Action` 이벤트가 EventBridge로 발행되어 SSM/Lambda를 호출한다. 파괴적·비가역적 작업에 사람 승인을 끼우는 데 적합하다. `Findings - Imported`(A의 이벤트)는 사람을 거치지 않는 모든 신규 Finding 자동 흐름용이다. Conformance Pack(C)·Insight(D)는 트리거 메커니즘이 아니다.

---

**문제 12.** 한 핀테크 조직의 종합 요구: ①멀티 계정 전체에 위협 탐지 자동 적용(신규 계정 포함) ②모든 Finding을 한 화면 통합 ③S3 PII 발견 ④컨테이너 CVE 스캔 ⑤외부 노출 탐지 ⑥7년 보안 사고 SQL 조사 ⑦멀티 계정 WAF 중앙 관리. 각 요구를 올바른 서비스에 매핑한 것은?

A) ①GuardDuty Org Delegated Admin+auto-enable ②Security Hub(ASFF 통합) ③Macie ④Inspector v2 ⑤Access Analyzer ⑥CloudTrail Lake ⑦Firewall Manager

B) 모두 GuardDuty로 처리

C) 모두 Security Hub로 처리

D) ①Config ②Macie ③GuardDuty ④Audit Manager ⑤Inspector ⑥Config ⑦Inspector

**정답: A**

해설: 각 요구의 역할 경계를 정확히 매핑해야 한다. ①멀티 계정 위협 탐지+신규 자동 적용 = GuardDuty Organizations Delegated Administrator + auto-enable, ②모든 Finding 통합 = Security Hub(ASFF), ③S3 PII = Macie, ④컨테이너 CVE = Inspector v2, ⑤외부 노출 = IAM Access Analyzer, ⑥7년 SQL 조사 = CloudTrail Lake, ⑦멀티 계정 WAF = Firewall Manager. 모두 한 서비스로 처리(B·C)하거나 역할을 뒤섞은 매핑(D)은 틀리다. 이것이 Week 14 전체의 역할 경계를 묻는 종합 문제다.

---

## 📌 Week 14 마무리 — 시험 직전 체크포인트

1. **탐지**: GuardDuty(에이전트리스, 데이터 평면 로그, 시그니처+이상 탐지, Severity=심각성×신뢰도) / Inspector v2(CVE·CVSS·NVD, EC2·컨테이너·Lambda, 지속 재평가)
2. **통합**: Security Hub(ASFF 정규화·Normalized 0~100, FSBP/CIS/PCI/NIST 표준, Config 의존) — 멀티 계정=Delegated Admin, 멀티 리전=Region Aggregator
3. **평가·교정**: Config(폐루프 제어, CI=상태 스냅샷, Rule 3종 Managed/Lambda/Guard DSL, Conformance Pack=StackSets, Remediation=SSM Automation, flapping은 MaxAttempts로 차단)
4. **증거·데이터·권한**: Audit Manager(증거 자동 수집·증명) / Macie(PII 분류, Luhn 검증, 비용 통제) / Access Analyzer(Zelkova 형식 검증 외부 노출, 관측 기반 최소 권한)
5. **자동화 3갈래**: Custom Action(수동 HITL) / Automation Rule(필드 갱신만) / Imported→Lambda·SSM(실제 리소스 수정)
6. **거버넌스**: Firewall Manager(중앙 WAF/Shield) / CloudTrail Lake(7년 SQL) / NIST CSF 5함수로 스택 진단

> 💪 Week 14 완료! 핵심은 "역할 경계를 정확히 구분하고, 작업의 위험도·가역성에 따라 자동화 수준을 고르는 것"이다.

> 🎯 **시나리오 (종합 진단 연습)**: 한 SaaS 기업이 "보안 도구는 다 켰는데 사고가 났다"고 한다. 조사해 보니 GuardDuty·Security Hub·Config가 모두 활성이고 Finding도 쌓이는데, 아무런 자동 대응이 없어 운영자가 수천 개 알림에 묻혀 진짜 Critical을 놓쳤다. CSF로 진단하면 **탐지(Detect)는 충분하나 대응(Respond)이 비어 있다**. 처방: ① Security Hub Automation Rule로 저위험 Finding을 자동 억제해 노이즈를 줄이고(알람 피로·기저율 오류 완화), ② Critical+특정 타입은 EventBridge→SSM Runbook으로 완전 자동 격리, ③ 파괴적 작업은 Custom Action으로 HITL, ④ Macie로 어느 버킷에 PII가 있는지 먼저 식별(Identify)해 우선순위를 정한다. "도구를 켜는 것"과 "탐지를 대응으로 잇는 것"은 다른 일이며, 후자가 빠지면 탐지는 소음일 뿐이다.

## 🔜 Week 15 예고

**종합 시나리오 - 엔터프라이즈 케이스**: Week 1~14의 CI/CD·IaC·모니터링·보안을 하나의 엔터프라이즈 사례로 엮어 실전 적용을 점검한다.
