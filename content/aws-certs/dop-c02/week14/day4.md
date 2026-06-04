# Day 4 - Audit Manager·Macie·Inspector: 증거 자동화·데이터 분류·취약점 스캔의 원리

보안 자동화 스택의 마지막 조각은 "사람이 가장 하기 싫어하는 세 가지 일"을 기계에 넘기는 것이다. 감사철마다 스크린샷과 로그를 긁어모으는 증거 수집, 페타바이트급 데이터 레이크 어딘가에 숨은 주민번호·카드번호를 찾는 데이터 분류, 매일 쏟아지는 CVE를 수천 개 워크로드와 대조하는 취약점 스캔. 이 셋은 각각 Audit Manager, Macie, Inspector가 맡는다. 콘솔에서 보면 이들은 "켜면 알아서 돌아가는 컴플라이언스·보안 도구"처럼 보이지만, 그 밑에는 지속적 컴플라이언스(continuous compliance)의 사상, 패턴 매칭과 머신러닝 기반 데이터 분류, CVE·CVSS라는 취약점 표준화의 역사, 그리고 최소 권한을 데이터로 증명하는 IAM 분석이 깔려 있다. 오늘은 이 세 도구가 내부에서 무엇을 어떻게 하는지, 그리고 IAM Access Analyzer·Firewall Manager·CloudTrail Lake가 어떻게 전체 보안 자동화 스택을 완성하는지를 판다.

DOP 시험에서 이 영역은 "감사 증거 자동화 + 민감 데이터 발견 + 취약점 관리 + 외부 노출 탐지"로, "SOC2 감사 증거를 상시 자동 수집하려면", "S3의 PII를 자동 발견하려면", "컨테이너 이미지의 의존성 CVE를 푸시 시 스캔하려면", "외부 계정에 노출된 리소스를 찾으려면" 같은 시나리오로 등장한다. 각 도구의 역할 경계를 구분하면 답이 보인다.

## 지속적 컴플라이언스 — 감사를 이벤트에서 상태로 바꾸다

전통적 컴플라이언스 감사는 **이벤트(event)**였다 — 분기나 연 단위로 감사인이 와서, 그 시점의 증거를 모아 평가하고 떠난다. 문제는 두 가지다. 첫째, 감사 사이 기간엔 실제 상태가 어떤지 아무도 모른다(point-in-time의 환상). 둘째, 증거 수집이 사람의 막노동이라 비싸고 오류가 많다 — 스크린샷을 찍고, 정책을 캡처하고, 로그를 내보내 스프레드시트에 붙인다.

**지속적 컴플라이언스(continuous compliance)**는 이를 **상태(state)**로 바꾼다 — 증거를 상시 자동 수집해, 언제든 "지금 우리는 SOC2를 만족하는가"에 데이터로 답한다. 이는 DevOps가 "릴리스를 이벤트에서 상시 흐름으로" 바꾼 것과 같은 사상의 컴플라이언스 버전이다. Audit Manager가 이 전환의 도구다.

> 💡 **관련 이론**: 지속적 컴플라이언스는 **GRC(Governance, Risk, Compliance)** 분야의 클라우드 네이티브화다. 전통 GRC 도구(Archer, ServiceNow GRC)는 컨트롤·증거·위험을 사람이 입력·관리했다. 클라우드에선 증거가 API로 노출되므로(Config·CloudTrail·Security Hub가 이미 상태를 알고 있음), 증거 수집을 자동화할 수 있다. 핵심 개념이 **컨트롤(control)과 증거(evidence)의 매핑**이다 — 규제 프레임워크(SOC2의 신뢰 서비스 기준, HIPAA의 보안 규칙)는 추상적 컨트롤("접근은 최소 권한이어야 한다")을 정의하고, 그 컨트롤이 충족됨을 보이는 구체적 증거(IAM 정책 스냅샷, 접근 로그)가 자동 수집되어 매핑된다. 이 매핑이 "추상적 규제 → 구체적 기술 증거"의 다리이며, Audit Manager의 Framework가 이 다리를 미리 깔아 둔다.

## AWS Audit Manager — 증거를 컨트롤에 자동 매핑

Audit Manager는 사전 정의 **Framework**(SOC2, HIPAA, PCI DSS, GDPR, ISO 27001 등)를 제공한다. Framework는 규제의 컨트롤들을 담고, 각 컨트롤에 대해 **증거를 자동 수집**한다 — CloudTrail(API 활동), Config(리소스 상태), Security Hub(보안 Finding)에서 증거를 끌어와 컨트롤에 매핑한다. 사용자 정의 Framework도 만들 수 있고, 최종적으로 감사인에게 제출할 **Assessment Report**를 생성한다.

```bash
aws auditmanager create-assessment --name SOC2-2026 \
  --framework-id <framework-id> \
  --assessment-reports-destination destinationType=S3,destination=s3://audit-reports/ \
  --roles roleType=PROCESS_OWNER,roleArn=arn:aws:iam::...:role/AuditOwner \
  --scope '{"awsAccounts":[{"id":"PROD-ACCT"}]}'
```

> ⚠️ **함정**: Audit Manager와 Security Hub/Config의 역할을 혼동하면 안 된다. **Config/Security Hub는 "지금 컴플라이언트한가"를 평가·교정**하는 운영 도구이고, **Audit Manager는 "컴플라이언트함을 감사인에게 증명할 증거를 수집·정리"**하는 감사 준비 도구다. Config가 "S3가 암호화돼 있다"를 평가한다면, Audit Manager는 "S3가 암호화돼 있었다는 증거(Config 스냅샷·CloudTrail 로그)를 SOC2의 해당 컨트롤에 묶어 보고서로 만든다." 시험에서 "위반을 자동 수정"은 Config, "감사 증거를 자동 수집·보고서화"는 Audit Manager다.

## Amazon Macie — 데이터 분류의 패턴 매칭과 ML

Macie는 S3 객체에서 **민감 데이터(sensitive data)**를 자동 발견한다. 사전 정의 식별자(신용카드 번호, 미국 SSN, 여권 번호, 의료 정보 등)와 사용자 정의 식별자(정규식)로 데이터를 분류하고, 발견 시 Finding을 Security Hub로 보낸다.

핵심 메커니즘은 두 층이다. **결정론적 패턴 매칭**(정규식 + 검증 알고리즘)이 카드번호·SSN 같은 구조화된 식별자를 잡고, **머신러닝·문맥 분석**이 "이 텍스트 블록이 의료 기록처럼 보이는가" 같은 비구조적 판단을 한다.

> 🔍 **더 깊이**: 신용카드 번호 탐지가 단순 "16자리 숫자 찾기"가 아니라는 게 데이터 분류의 정교함을 보여준다. 카드번호는 **Luhn 알고리즘**(1954년 IBM의 한스 페터 룬이 고안한 체크섬, ISO/IEC 7812에 표준화)이라는 검증식을 만족해야 한다 — 마지막 자리가 체크 디지트로, 앞자리들로 계산한 값과 맞아야 유효한 카드번호다. Macie는 16자리 숫자 패턴을 찾은 뒤 Luhn 검증을 돌려 false positive(우연히 16자리인 무작위 숫자, 예: 주문번호)를 걸러낸다. SSN도 단순 9자리가 아니라 발급 규칙(특정 영역·그룹 번호 범위)을 검증한다. 이 "패턴 + 검증" 이중 구조가 데이터 분류의 정확도를 좌우한다 — 패턴만으로는 오탐이 폭발하기 때문이다. 이는 정규식 vs 구조화된 검증이라는 텍스트 처리의 고전적 트레이드오프다.

> 💡 **관련 이론**: Macie가 푸는 문제는 **데이터 거버넌스**에서 말하는 "데이터를 알라(know your data)"다. GDPR(2018), CCPA(캘리포니아), HIPAA 같은 규제는 "개인정보가 어디 있는지 알고, 보호하고, 필요 시 삭제(잊힐 권리)할 수 있어야 한다"를 요구한다. 그런데 페타바이트급 데이터 레이크에서 PII/PHI가 어느 객체에 있는지는 사람이 알 수 없다 — 이것이 **다크 데이터(dark data)** 문제다. Macie는 자동 발견으로 이 어둠을 밝힌다. 핵심 패턴은 "데이터를 보호하기 전에 먼저 분류하라(classify before you protect)" — 무엇이 민감한지 모르면 적절히 보호할 수 없다. Macie의 Finding이 Security Hub로 가서 "퍼블릭 버킷에 SSN이 있다"를 Critical로 띄우는 흐름이 데이터 분류 → 위험 평가 → 대응의 사슬이다.

```bash
aws macie2 enable-macie
aws macie2 create-classification-job --job-type ONE_TIME \
  --name pii-scan-prod \
  --s3-job-definition '{"bucketDefinitions":[{"accountId":"111","buckets":["prod-data"]}]}'
```

> ⚠️ **함정**: Macie는 **객체당·스토리지 단위로 과금**되며 대규모 데이터 레이크에선 비쌀 수 있다. Discovery Job을 매번 전체 스캔으로 돌리면 비용이 폭증한다. 실무에선 ①자동 민감 데이터 발견(샘플링 기반 상시 모니터링, 저비용)과 ②전체 Discovery Job(정밀, 고비용)을 구분하고, 새/변경 객체만 점진 스캔하는 식으로 비용을 통제한다. 시험에서 "큰 데이터 레이크 PII 스캔"의 함정은 "비용 고려 없이 전체 스캔 반복"이다.

## Inspector v2 — CVE와 취약점 관리의 표준화

Inspector v2(2021년 재출시)는 EC2·ECR 컨테이너 이미지·Lambda를 통합 스캔해 **CVE(Common Vulnerabilities and Exposures)**를 찾는다.

| 대상 | 스캔하는 것 |
|------|------------|
| **EC2** | OS 패키지의 알려진 CVE (SSM Agent 통해) |
| **ECR 컨테이너 이미지** | OS 패키지 + 언어 의존성(npm·pip·gem 등) CVE |
| **Lambda** | 함수 코드와 의존성 CVE |

핵심은 **지속 모니터링**이다 — 한 번 스캔하고 끝이 아니라, 새 CVE가 공개되면 이미 스캔한 자산을 자동 재평가한다. "어제는 안전했던 이미지가 오늘 공개된 CVE로 취약해짐"을 자동으로 잡는다. Finding은 Security Hub로 통합된다.

> 🔍 **더 깊이**: **CVE와 CVSS의 역사**를 알면 취약점 관리의 구조가 보인다. **CVE**는 MITRE가 1999년 시작한 "알려진 취약점에 고유 식별자(CVE-2021-44228 같은)를 부여하는" 사전이다. 그전엔 같은 취약점을 벤더마다 다른 이름으로 불러 혼란스러웠다 — CVE가 "취약점의 공통 언어"를 만들었다. **CVSS**(Day 2에서 본)는 그 취약점의 심각도를 0~10으로 점수화한다. **NVD**(National Vulnerability Database, NIST 운영)는 CVE에 CVSS 점수·영향 분석을 붙인 미국 정부 DB다. Inspector는 이 생태계를 소비한다 — 자산의 패키지 인벤토리를 추출해 CVE 피드와 대조하고, NVD의 CVSS로 심각도를 매겨, ASFF로 Security Hub에 보낸다. 즉 Inspector의 가치는 "스캔 엔진"보다 "끊임없이 갱신되는 CVE 피드 × 내 자산 인벤토리의 상시 교차"에 있다.

> 📚 **사례**: 2021년 12월 공개된 **Log4Shell(CVE-2021-44228)**은 자바 로깅 라이브러리 Log4j의 원격 코드 실행 취약점으로, CVSS 10.0(최고점)을 받았다. 거의 모든 자바 애플리케이션이 Log4j를 직간접 의존했기에 "인터넷 역사상 가장 광범위한 취약점 중 하나"로 불렸다. 핵심 교훈은 **의존성의 가시성** 문제였다 — 많은 조직이 "우리 어느 서비스가 Log4j를 쓰는지" 즉답하지 못해 대응이 늦어졌다. 이것이 Inspector의 컨테이너/Lambda 의존성 스캔과 **SBOM(Software Bill of Materials, 소프트웨어 부품 명세서)**이 중요해진 배경이다. SBOM은 "이 빌드에 들어간 모든 컴포넌트의 목록"으로, Log4Shell 같은 사고 때 "어디에 취약 컴포넌트가 있나"를 즉시 답하게 한다. 교훈: 취약점 대응 속도는 "내가 무엇을 쓰는지 아는 정도"에 비례한다 — 자산·의존성 인벤토리가 보안의 전제다.

```bash
aws inspector2 enable --resource-types EC2 ECR LAMBDA
```

> 🔍 **더 깊이**: Log4Shell 이후 부상한 **SLSA(Supply-chain Levels for Software Artifacts, "살사"로 발음)**는 구글이 2021년 제안한 소프트웨어 공급망 무결성 프레임워크다. 빌드 출처(provenance)를 증명해 "이 아티팩트가 정말 신뢰된 소스에서, 변조 없이 빌드됐는가"를 보장한다(레벨 1~4). ECR은 이미지 서명(AWS Signer), 이미지 불변 태그(immutable tags), Inspector 향상 스캔(enhanced scanning)을 묶어 공급망 보안을 강화한다. DOP 맥락에선 "ECR 푸시 시 자동 CVE 스캔(Inspector enhanced scanning) + 서명 검증 + 불변 태그"가 컨테이너 공급망 보안의 표준 패턴이다.

## IAM Access Analyzer — 최소 권한을 데이터로 증명

IAM Access Analyzer는 네 가지 일을 한다.

| 기능 | 설명 |
|------|------|
| **External Access Findings** | 외부(다른 계정·공개)에 노출된 리소스(S3·IAM Role·KMS 등) 자동 발견 |
| **Unused Access Findings** | 일정 기간 안 쓴 IAM Role·권한·액세스 키 발견 (2023+) |
| **Policy Validation** | IAM 정책 작성 시 문법·보안 모범 사례 자동 검증 |
| **Policy Generation** | CloudTrail 활동 로그로 실제 사용된 권한만의 정책 자동 생성 |

> 🔍 **더 깊이**: External Access Findings의 내부 엔진이 흥미롭다. Access Analyzer는 **자동 추론(automated reasoning)** — 수학적 논리로 "이 정책이 외부 접근을 허용하는가"를 증명하는 — 을 쓴다. AWS의 **Zelkova**라는 엔진이 IAM 정책을 SMT(Satisfiability Modulo Theories) 솔버가 풀 수 있는 논리식으로 변환해, "이 정책 하에 외부 주체가 접근 가능한 경우가 존재하는가"를 형식 증명한다. 이는 "정책을 테스트로 때려보는" 경험적 방식이 아니라, 모든 가능한 요청을 수학적으로 추론해 답을 내는 **형식 검증(formal verification)**이다. 그래서 "운 나쁘게 놓친 케이스"가 없다 — 정책이 외부 접근을 허용하면 반드시 발견한다. 자동 추론은 AWS가 S3 Block Public Access, VPC Reachability Analyzer 등 여러 곳에 쓰는 핵심 기술이다(AWS의 "Provable Security" 이니셔티브).

> 💡 **관련 이론**: Policy Generation과 Unused Access는 **최소 권한 원칙(Principle of Least Privilege)**을 데이터로 구현한다. 최소 권한은 1975년 살처와 슈뢰더(Saltzer & Schroeder)의 고전 논문 *"The Protection of Information in Computer Systems"*가 정립한 8대 보안 설계 원칙 중 하나로, "주체는 작업에 꼭 필요한 권한만 가져야 한다"는 규율이다. 문제는 실무에서 "꼭 필요한 권한"을 사람이 알기 어렵다는 것 — 그래서 보통 넉넉히 주고(권한 비대, privilege creep) 줄이지 못한다. Access Analyzer는 이를 역전한다. Policy Generation은 CloudTrail에 기록된 **실제 사용 권한**만 추출해 정책을 만들고(관측 기반 최소 권한), Unused Access는 **안 쓰는 권한**을 찾아 회수를 유도한다. "추측이 아니라 관측으로 최소 권한을 달성"하는 것이다.

```bash
# 조직 단위 분석기
aws accessanalyzer create-analyzer --analyzer-name org-analyzer --type ORGANIZATION

# CloudTrail 기반 정책 생성 (실제 사용 권한만)
aws accessanalyzer start-policy-generation \
  --policy-generation-details principalArn=arn:aws:iam::...:role/Analyst,cloudTrailDetails={accessRole=...,trails=[...],startTime=...}
```

## Firewall Manager·CloudTrail Lake — 스택 완성

**Firewall Manager**는 멀티 계정 WAF·Shield·Network Firewall·보안 그룹 정책을 중앙에서 관리한다. Organizations와 통합해, 새 계정·새 리소스에 정책을 자동 적용한다 — "모든 ALB 앞에 이 WAF 룰을 강제"를 조직 전체에 한 번에 건다.

**CloudTrail Lake**는 CloudTrail 이벤트를 SQL로 질의 가능한 데이터 저장소로, 최대 7년 보존하고 멀티 계정·리전을 통합한다. 보안 사고 조사에서 "3년 전 이 자격 증명으로 무슨 API가 호출됐나"를 SQL로 답한다.

> 💡 **관련 이론**: 이 전체 스택을 NIST의 **사이버보안 프레임워크(CSF)** 5함수 — 식별(Identify)·보호(Protect)·탐지(Detect)·대응(Respond)·복구(Recover) — 에 매핑하면 그림이 완성된다. **식별**: Config(인벤토리)·Macie(데이터 분류)·Access Analyzer(노출/미사용). **보호**: Firewall Manager(WAF/SG)·Conformance Pack. **탐지**: GuardDuty(위협)·Inspector(취약점)·Security Hub(통합). **대응**: EventBridge→SSM/Lambda 자동 수정. **복구**: 스냅샷·백업. 각 AWS 서비스가 CSF의 어느 함수를 채우는지 알면, 시나리오에서 "어느 단계가 비어 있고 무엇으로 채울지"를 빠르게 판단할 수 있다.

```
종합 보안 자동화 스택 (NIST CSF 매핑)
==================================================
  Identify   ├─ Config(인벤토리) ├─ Macie(데이터) └─ Access Analyzer(노출·미사용)
  Protect    ├─ Firewall Manager ├─ Conformance Pack └─ KMS/암호화
  Detect     ├─ GuardDuty(위협) ├─ Inspector(취약점) └─ Security Hub(통합·ASFF)
  Respond    └─ EventBridge → SSM Automation / Lambda
  Recover    └─ 스냅샷 / 백업 / PITR
  Forensics  └─ CloudTrail Lake (7y, SQL)
```

> 🎯 **시나리오**: "핀테크 조직이 ①SOC2·PCI 감사 증거를 상시 자동 수집 ②데이터 레이크 S3의 카드번호·SSN을 자동 발견하되 비용 통제 ③ECR 푸시 시 npm/pip 의존성 CVE 자동 스캔 + 신규 CVE 시 자동 재평가 ④외부 계정에 노출된 S3·역할을 형식 증명으로 발견 ⑤과도하게 부여된 IAM 권한을 실제 사용 기반으로 축소 ⑥7년 보안 사고 조사 SQL을 구축하라." → ① Audit Manager Framework(SOC2·PCI) + Assessment Report, ② Macie 자동 발견(상시 샘플링)+신규/변경 객체만 Discovery Job(비용 통제), ③ Inspector v2 ECR enhanced scanning(지속 모니터링), ④ Access Analyzer External Findings(Zelkova 자동 추론), ⑤ Access Analyzer Policy Generation(CloudTrail 기반)+Unused Access, ⑥ CloudTrail Lake(7년·SQL). 모든 Finding은 ASFF로 Security Hub 통합, 위반은 EventBridge→SSM 자동 수정.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **지속적 컴플라이언스는 감사를 이벤트에서 상태로 바꾸는 GRC의 클라우드화**이고, Audit Manager가 규제 컨트롤에 증거(Config·CloudTrail·Security Hub)를 자동 매핑해 보고서화한다 — "지금 컴플라이언트한가"의 Config와 달리 "컴플라이언트함을 증명할 증거 수집"이 역할이다. 둘째, **Macie는 패턴 매칭(Luhn 검증 등)+ML로 다크 데이터의 PII/PHI를 분류**하며 "보호 전에 분류하라"의 데이터 거버넌스를 구현하되 비용 통제가 함정이다. 셋째, **Inspector v2는 CVE/CVSS/NVD 생태계를 소비**해 EC2·컨테이너·Lambda를 지속 스캔하고, Log4Shell 교훈에서 SBOM·SLSA 공급망 보안이 부상했다. 넷째, **Access Analyzer는 Zelkova 자동 추론(형식 검증)으로 외부 노출을, Policy Generation으로 관측 기반 최소 권한을** 구현하며, Firewall Manager(중앙 정책)·CloudTrail Lake(7년 SQL)와 함께 NIST CSF 5함수를 채운다.

다음 글에서는 Week 14 전체를 종합한 시나리오 문제로 실전 적용을 점검한다.

---

## 📝 연습 문제

**문제 1.** Config/Security Hub와 Audit Manager의 역할 차이로 가장 정확한 것은?

A) 셋 다 같은 일을 한다

B) Config/Security Hub는 "지금 컴플라이언트한가"를 평가·교정하는 운영 도구이고, Audit Manager는 "컴플라이언트함을 감사인에게 증명할 증거를 Config·CloudTrail·Security Hub에서 자동 수집·매핑·보고서화"하는 감사 준비 도구다

C) Audit Manager가 위반을 자동 수정한다

D) Config가 감사 보고서를 생성한다

**정답: B**

해설: Config/Security Hub는 리소스가 "지금 컴플라이언트한가"를 평가하고 위반을 교정하는 운영 도구다. Audit Manager는 그 위에서 "컴플라이언트함을 감사인에게 증명할 증거"(Config 스냅샷·CloudTrail 로그·Security Hub Finding)를 규제 Framework의 컨트롤에 자동 매핑하고 Assessment Report로 정리하는 감사 준비 도구다. "위반 자동 수정"은 Config(C 틀림), "감사 보고서 생성"은 Audit Manager(D 틀림)다. 셋의 역할은 다르다(A 틀림).

---

**문제 2.** Macie가 16자리 숫자를 모두 신용카드 번호로 오탐하지 않고 정확히 분류하는 핵심 메커니즘은?

A) 단순히 16자리 숫자 패턴만 찾는다

B) 16자리 패턴을 찾은 뒤 Luhn 알고리즘(ISO/IEC 7812 체크섬) 검증을 돌려 우연히 16자리인 무작위 숫자(주문번호 등)를 걸러낸다 — "패턴 + 검증" 이중 구조

C) 모든 숫자를 사람이 검토한다

D) 카드번호는 탐지하지 못한다

**정답: B**

해설: 신용카드 번호는 Luhn 알고리즘(1954년 IBM, ISO/IEC 7812 표준)이라는 체크섬을 만족해야 한다 — 마지막 체크 디지트가 앞자리로 계산한 값과 맞아야 유효하다. Macie는 16자리 패턴을 찾은 뒤 Luhn 검증을 돌려 false positive를 걸러낸다. SSN도 발급 규칙을 검증한다. 이 "패턴 + 검증" 이중 구조가 데이터 분류 정확도를 좌우한다 — 패턴만으로는 오탐이 폭발한다. 단순 패턴(A)·수동 검토(C)·탐지 불가(D)는 틀리다.

---

**문제 3.** Inspector v2가 "어제는 안전했던 컨테이너 이미지를 오늘 취약하다고 자동 재평가"할 수 있는 이유는?

A) 매번 이미지를 다시 빌드해서

B) Inspector가 자산의 패키지 인벤토리를 끊임없이 갱신되는 CVE 피드(MITRE CVE·NVD의 CVSS)와 지속적으로 교차하므로, 새 CVE가 공개되면 이미 스캔한 자산을 자동 재평가한다

C) 사람이 매일 수동 스캔해서

D) 이미지가 시간이 지나면 손상돼서

**정답: B**

해설: Inspector의 가치는 일회성 스캔이 아니라 "끊임없이 갱신되는 CVE 피드 × 내 자산 인벤토리의 상시 교차"에 있다. CVE(MITRE의 취약점 식별자 사전, 1999~)와 NVD(NIST의 CVSS 점수 DB)는 매일 새 취약점이 등록되고, Inspector는 자산의 패키지 인벤토리를 이와 지속 대조한다. 그래서 새 CVE 공개 시 이미 스캔한 EC2·컨테이너·Lambda를 자동 재평가한다. 재빌드(A)·수동 스캔(C)·이미지 손상(D)은 메커니즘이 아니다.

---

**문제 4.** IAM Access Analyzer가 "이 정책이 외부 접근을 허용하는 경우가 존재하는가"를 운 나쁘게 놓치는 케이스 없이 보장하는 내부 기술은?

A) 정책을 무작위 요청으로 테스트해 본다

B) Zelkova 엔진의 자동 추론(automated reasoning) — IAM 정책을 SMT 솔버가 풀 논리식으로 변환해 모든 가능한 요청을 수학적으로 추론하는 형식 검증(formal verification)

C) 머신러닝으로 추측한다

D) 운영자가 수동 검토한다

**정답: B**

해설: Access Analyzer의 External Access Findings는 AWS의 Zelkova 엔진을 써 IAM 정책을 SMT(Satisfiability Modulo Theories) 솔버가 풀 수 있는 논리식으로 변환하고, "외부 주체가 접근 가능한 경우가 존재하는가"를 형식 증명한다. 이는 경험적 테스트가 아니라 모든 가능한 요청을 수학적으로 추론하는 형식 검증이라, 놓치는 케이스가 없다(AWS Provable Security). 무작위 테스트(A)·ML 추측(C)·수동 검토(D)는 완전성을 보장하지 못한다.

---

**문제 5.** 과도하게 부여된 IAM 권한을 "추측이 아니라 실제 사용 데이터 기반"으로 최소 권한까지 줄이려 한다. 올바른 도구 조합은?

A) 모든 권한을 일단 삭제하고 오류 나면 추가

B) Access Analyzer Policy Generation(CloudTrail 활동 로그로 실제 사용된 권한만의 정책 생성) + Unused Access Findings(안 쓰는 역할·권한·키 발견)

C) 모든 역할에 AdministratorAccess 부여

D) GuardDuty로 권한 분석

**정답: B**

해설: 최소 권한 원칙(Saltzer & Schroeder, 1975)의 실무 난제는 "꼭 필요한 권한"을 사람이 알기 어렵다는 것이다. Access Analyzer는 이를 관측으로 해결한다 — Policy Generation은 CloudTrail에 기록된 실제 사용 권한만 추출해 정책을 만들고(관측 기반 최소 권한), Unused Access Findings는 안 쓰는 권한을 찾아 회수를 유도한다. "추측이 아니라 관측으로 최소 권한 달성"이 핵심이다. 무작정 삭제(A)·과도 부여(C)는 안티패턴, GuardDuty(D)는 위협 탐지로 권한 분석 도구가 아니다.

---

**문제 6.** Log4Shell(CVE-2021-44228, CVSS 10.0) 사고에서 많은 조직의 대응이 늦어진 근본 원인과, 이를 막기 위해 부상한 개념은?

A) 패치가 없어서 — 백신

B) "우리 어느 서비스가 Log4j를 쓰는지" 즉답하지 못한 의존성 가시성 부재 — SBOM(Software Bill of Materials)으로 빌드 컴포넌트 목록을 관리해 "어디에 취약 컴포넌트가 있나"를 즉시 답하고, SLSA로 공급망 무결성을 보장

C) 네트워크가 느려서 — CDN

D) 비밀번호가 약해서 — MFA

**정답: B**

해설: Log4Shell은 거의 모든 자바 앱이 Log4j를 직간접 의존했기에 광범위했고, 많은 조직이 "어느 서비스가 Log4j를 쓰는지" 즉답하지 못해 대응이 늦었다 — 의존성 가시성 부재가 근본 원인이다. 이것이 SBOM(빌드에 들어간 모든 컴포넌트 목록)과 SLSA(공급망 무결성 프레임워크, 구글 2021)가 중요해진 배경이다. Inspector의 컨테이너/Lambda 의존성 스캔이 이를 돕는다. "취약점 대응 속도는 내가 무엇을 쓰는지 아는 정도에 비례한다." 백신(A)·CDN(C)·MFA(D)는 무관하다.

---

**문제 7.** 종합 보안 자동화 스택을 NIST CSF(식별·보호·탐지·대응·복구)에 매핑할 때, "식별(Identify)" 함수를 채우는 서비스 조합으로 가장 적절한 것은?

A) EventBridge → SSM Automation

B) Config(리소스 인벤토리) + Macie(데이터 분류) + IAM Access Analyzer(외부 노출·미사용 권한)

C) 스냅샷 + 백업 + PITR

D) GuardDuty + Inspector

**정답: B**

해설: NIST CSF의 "식별(Identify)"은 자산·데이터·위험을 파악하는 함수다. Config(리소스 인벤토리·관계 그래프), Macie(데이터 분류·다크 데이터 발견), Access Analyzer(외부 노출·미사용 권한 식별)가 이를 채운다. EventBridge→SSM(A)은 "대응(Respond)", 스냅샷·백업·PITR(C)은 "복구(Recover)", GuardDuty·Inspector(D)는 "탐지(Detect)"에 해당한다. 각 서비스가 CSF의 어느 함수를 채우는지 알면 시나리오에서 빈 단계를 빠르게 진단할 수 있다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 지속적 컴플라이언스는 감사를 이벤트에서 상태로 바꾸는 GRC의 클라우드화이며, Audit Manager가 규제 컨트롤에 증거(Config·CloudTrail·Security Hub)를 자동 매핑·보고서화한다("증명할 증거 수집"이 역할). 둘째, Macie는 패턴 매칭(Luhn 등 검증)+ML로 다크 데이터의 PII/PHI를 분류하며 "보호 전에 분류하라"를 구현하되 객체당 과금이 비용 함정이다. 셋째, Inspector v2는 CVE/CVSS/NVD 생태계를 소비해 EC2·컨테이너·Lambda를 지속 스캔하고(신규 CVE 자동 재평가), Log4Shell 교훈에서 SBOM·SLSA 공급망 보안이 부상했다. 넷째, Access Analyzer는 Zelkova 자동 추론(형식 검증)으로 외부 노출을, Policy Generation으로 관측 기반 최소 권한(Saltzer & Schroeder)을 구현하고, Firewall Manager(중앙 정책)·CloudTrail Lake(7년 SQL)와 함께 NIST CSF 5함수를 완성한다.
