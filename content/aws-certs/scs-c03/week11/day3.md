# Day 3 - Audit Manager와 규정 준수: 증거 자동 수집, 프레임워크(CIS/PCI), Config와 연계

거버넌스를 깔았다면 다음 질문은 "그래서 우리가 규정을 지키고 있다는 것을 어떻게 *증명*하느냐"다. 감사는 본질적으로 *증거 수집·매핑·보고*의 반복 노동이다. **AWS Audit Manager**는 이 과정을 자동화한다 — 미리 정의된 규제 프레임워크의 통제 항목에 AWS 활동·구성 증거를 자동으로 매핑·수집해 감사 준비 보고서를 만든다. 보안 시험에서 Audit Manager는 "지속적 규정 준수 증거를 자동으로 모으는 도구"로 등장하며, Config·CloudTrail·Security Hub와의 *연계*가 핵심이다.

## Audit Manager의 핵심 개념

```
프레임워크(Framework)  ── 규제/표준의 통제 모음 (CIS, PCI-DSS, SOC2, HIPAA, GDPR ...)
  └ 통제(Control)      ── 개별 요구사항 (예: "루트 계정 MFA 활성화")
      └ 데이터 소스      ── 증거를 어디서 가져올지 (Config 규칙, CloudTrail, API 호출, 수동)
평가(Assessment)       ── 특정 프레임워크를 특정 계정/리전 범위에 적용한 실행 단위
  └ 증거(Evidence)     ── 자동/수동으로 수집된 준수 근거 (스냅샷·로그·설정·체크 결과)
평가 보고서             ── 증거를 묶어 감사자에게 제출 가능한 형태로 출력
```

핵심 가치는 **증거의 자동·지속 수집**이다. 감사 직전에 몰아서 스크린샷을 찍는 대신, Audit Manager가 평가 기간 내내 증거를 모아 둔다.

> 💡 **관련 이론**: 이것은 *Continuous Compliance / Compliance as Code*다. 전통적 감사는 시점(point-in-time) 표본 검사였지만, 클라우드에서는 구성·활동이 API로 관측 가능하므로 *지속적 통제 모니터링(Continuous Control Monitoring)*이 가능하다. NIST의 RMF(Risk Management Framework)에서 "지속적 모니터링" 단계를 자동 증거 파이프라인으로 구현하는 셈이다.

## 증거의 네 가지 출처

Audit Manager는 통제마다 어디서 증거를 가져올지 매핑한다. 출처는 크게 넷이다.

1. **AWS Config 규칙 평가 결과**: 리소스 구성의 준수/비준수. "EBS 암호화됨", "S3 퍼블릭 액세스 차단됨" 같은 *구성 증거*. → 탐지적 통제의 핵심 소스.
2. **AWS Security Hub 검사 결과**: CIS·FSBP 등 보안 표준 검사 결과를 증거로 흡수.
3. **AWS CloudTrail 이벤트**: "누가 언제 무엇을 했는가"의 *활동 증거*. 예: 루트 로그인, KMS 키 정책 변경, 보안 그룹 수정.
4. **AWS API 호출 결과(리소스 스냅샷)**: 특정 시점 리소스 상태를 API로 직접 조회한 스냅샷.

여기에 자동으로 못 얻는 항목(물리 보안, 정책 문서, 인적 절차)은 **수동 증거(manual evidence)**로 업로드한다. 실제 감사 준비는 "자동 증거 + 수동 증거"의 합이다.

## Config와의 연계: 증거 파이프라인의 토대

Audit Manager의 자동 구성 증거 대부분은 **Config 규칙 평가**에서 나온다. 따라서 다음 선행 조건이 충족돼야 한다:

```
Config 레코더 활성화(전 리전/계정) 
   → Config 규칙(관리형/커스텀) 평가 수행 
   → Audit Manager가 해당 규칙 결과를 통제에 매핑 
   → 평가 기간 내내 준수/비준수 증거 누적
```

Config가 꺼져 있거나 규칙이 없으면 Audit Manager는 그 통제에 대한 자동 구성 증거를 만들 수 없다 — 이것이 시험 함정이다. 즉 **Audit Manager는 Config·CloudTrail·Security Hub가 *먼저* 켜져 있어야 진가를 발휘**한다. Audit Manager는 데이터를 *생성*하는 게 아니라 기존 데이터를 통제 프레임워크 언어로 *번역·집계*한다.

```bash
# 전제: Config 레코더와 규칙이 활성화되어 있어야 함
aws configservice put-configuration-recorder ...
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "encrypted-volumes",
  "Source": { "Owner": "AWS", "SourceIdentifier": "ENCRYPTED_VOLUMES" }
}'

# Audit Manager 평가 생성 (프레임워크를 범위에 적용)
aws auditmanager create-assessment \
  --name "PCI-DSS-Q2-2026" \
  --framework-id <PCI_FRAMEWORK_ID> \
  --scope '{ "awsAccounts": [{"id":"111122223333"}], "awsServices": [{"serviceName":"s3"},{"serviceName":"ec2"},{"serviceName":"kms"}] }' \
  --assessment-reports-destination '{ "destinationType":"S3","destination":"s3://audit-reports-bucket/pci/" }' \
  --roles '[{"roleType":"PROCESS_OWNER","roleArn":"arn:aws:iam::111122223333:role/AuditOwner"}]'
```

## 프레임워크: 표준 vs 커스텀

Audit Manager는 **사전 구축 프레임워크**를 다수 제공한다: CIS AWS Foundations Benchmark, PCI-DSS, SOC 2, HIPAA, GDPR, NIST 800-53, FedRAMP, AWS Well-Architected 등. 각 프레임워크는 통제 목록과 권장 데이터 소스 매핑을 이미 갖고 있다.

- **CIS AWS Foundations Benchmark**: IAM·로깅·모니터링·네트워킹의 인프라 위생 통제. AWS 환경에 가장 직접 매핑된다.
- **PCI-DSS**: 카드 데이터 보호. 암호화, 접근 통제, 로깅, 네트워크 분리 등. 다수가 Config 규칙으로 자동 증거화되지만, 일부(물리·정책)는 수동 증거 필요.

**커스텀 프레임워크**는 표준 통제를 조합하거나 자체 통제를 정의해 만든다. 내부 보안 정책이나 특정 계약 요건을 코드화할 때 쓴다. 표준 프레임워크의 통제를 복제·수정해 자사 환경에 맞춘다.

## 멀티계정 감사: 위임 관리자

Audit Manager도 Organizations와 통합해 **위임 관리자 계정**(통상 Audit 계정)에서 조직 전역 평가를 운영한다. 그러면 한 평가가 여러 계정의 증거를 집계한다.

```bash
# 관리 계정에서 Audit Manager 위임 관리자 등록
aws auditmanager register-account \
  --delegated-admin-account 222233334444
```

이로써 어제(중앙 보안 계정 모델)와 일관되게 — GuardDuty·Security Hub·Config·Audit Manager가 모두 동일한 Audit 계정에서 위임 운영되어 증거·탐지·보고가 한곳에 모인다.

> 💡 **관련 이론**: 증거를 단일 *권한 분리된* 계정에 집중하는 것은 *감사 추적의 무결성* 요구(증거를 평가 대상이 직접 조작하지 못하게) 때문이다. 평가 대상 계정과 증거 보관·평가 계정을 분리하면, 비준수를 감추기 위한 증거 변조 경로를 구조적으로 차단한다.

## 증거 보호와 보고

수집된 증거는 평가 설정 시 지정한 S3 버킷에 저장되며 KMS로 암호화한다. 증거 자체는 변경 불가에 가깝게 다뤄야 하므로 Log Archive 계정의 불변 패턴(Object Lock 등)과 결합하는 것이 좋다. 평가 보고서는 PDF/CSV로 출력해 감사자에게 제출한다.

## 다른 서비스와의 역할 구분 (혼동 방지)

| 서비스 | 역할 | "이 서비스가 답인 경우" |
|---|---|---|
| **Config** | 리소스 구성을 기록·평가(준수/비준수) | "구성이 규칙을 지키는지 *탐지/평가*" |
| **Security Hub** | 보안 표준 검사·findings 집계 | "보안 점수·통합 findings 대시보드" |
| **Audit Manager** | 규제 프레임워크에 증거 자동 매핑·*감사 보고서* | "감사자에게 제출할 *증거/보고서* 자동화" |
| **CloudTrail** | API 활동 로그(누가·언제·무엇) | "활동 추적·포렌식 원천 로그" |

시험은 이 구분을 집요하게 묻는다. "감사 준비를 위한 증거를 *자동 수집·보고*" → Audit Manager. "리소스가 규칙을 지키는지 *평가*" → Config. "보안 findings *집계·점수*" → Security Hub.

## 함정 정리

- Audit Manager는 증거를 *생성*하지 않는다 — Config·CloudTrail·Security Hub가 먼저 켜져 있어야 자동 증거가 모인다.
- 모든 통제가 자동화되지 않는다. 물리·정책·절차는 *수동 증거* 업로드가 필요하다.
- Config 비활성 상태면 구성 증거가 비어 평가가 불완전해진다.
- 조직 전역 감사는 *위임 관리자* 계정에서 운영해 증거를 집계·격리한다.
- "평가/탐지"는 Config, "증거/보고서"는 Audit Manager — 역할 혼동이 단골 오답.

## 📝 연습 문제

**문제 1.** 감사팀이 PCI-DSS 감사를 위해 분기마다 수작업으로 스크린샷과 설정을 모아 왔다. 이를 자동화하려 한다. 가장 적절한 서비스는?

A) AWS Config만 사용  
B) AWS Audit Manager로 PCI-DSS 프레임워크 평가를 만들고 Config·CloudTrail·Security Hub 증거를 자동 수집·보고  
C) CloudTrail만 사용  
D) GuardDuty  

**정답: B**  
해설: 규제 프레임워크의 통제에 증거를 자동 매핑·수집하고 감사 보고서까지 만드는 것은 Audit Manager의 핵심 용도다. PCI-DSS 사전 구축 프레임워크로 평가를 만들면 Config·CloudTrail·Security Hub의 데이터가 통제별 증거로 누적된다. Config·CloudTrail 단독은 증거 원천일 뿐 프레임워크 매핑·보고를 하지 않고, GuardDuty는 위협 탐지로 감사 보고와 무관하다.

---

**문제 2.** Audit Manager 평가를 만들었는데 다수 통제의 자동 구성 증거가 비어 있다. 가장 가능성 높은 원인은?

A) Audit Manager가 증거를 직접 생성하지 못해서  
B) AWS Config 레코더/규칙이 비활성 상태라 구성 증거의 원천이 없어서  
C) 프레임워크가 잘못 선택돼서  
D) S3 버킷이 암호화되어서  

**정답: B**  
해설: Audit Manager의 자동 구성 증거는 Config 규칙 평가 결과에서 나온다. Config가 꺼져 있거나 규칙이 없으면 매핑할 데이터가 없어 통제 증거가 비게 된다. Audit Manager는 데이터를 생성하지 않고 기존 데이터를 번역·집계하므로, 선행 서비스 활성화가 전제다. 프레임워크 선택 오류나 버킷 암호화는 이 증상의 일반적 원인이 아니다.

---

**문제 3.** 물리 데이터센터 보안과 직원 보안 교육 이수 같은 통제는 어떻게 Audit Manager 평가에 반영하는가?

A) Config 규칙으로 자동 수집  
B) 자동 수집이 불가하므로 수동 증거(manual evidence)로 문서를 업로드  
C) CloudTrail 이벤트로 수집  
D) 반영할 수 없다  

**정답: B**  
해설: AWS API로 관측 불가능한 물리 보안·인적 절차·정책 문서는 자동 증거로 모을 수 없으므로 수동 증거로 업로드한다. 실제 감사 준비는 자동 증거와 수동 증거의 합이다. Config·CloudTrail은 AWS 구성·활동만 다루므로 이 항목을 수집하지 못하고, 반영할 수 없다는 설명은 틀렸다.

---

**문제 4.** 조직 전역 다계정 감사 증거를 한곳에 집계하고 평가 대상이 증거를 조작하지 못하게 하려 한다. 가장 적절한 설계는?

A) 각 계정에서 개별 Audit Manager 평가를 따로 운영  
B) Audit Manager 위임 관리자를 Audit 계정으로 등록해 조직 전역 평가를 그 계정에서 운영하고 증거를 격리·집계  
C) 관리 계정에서 모든 평가를 운영  
D) 워크로드 계정마다 증거를 로컬 저장  

**정답: B**  
해설: 위임 관리자(통상 Audit 계정)에서 조직 전역 평가를 운영하면 증거를 한곳에 집계하면서 평가 대상 계정과 증거 보관·평가 계정을 분리해 증거 변조 경로를 차단한다. 이는 GuardDuty·Security Hub·Config 위임 모델과도 일관된다. 계정별 분산 운영은 집계·무결성을 잃고, 관리 계정 집중은 공격 표면을 키우며, 로컬 저장은 탈취 시 함께 조작·삭제될 위험이 있다.

---

**문제 5.** 다음 설명 중 서비스 역할 매칭이 옳은 것은?

A) "리소스 구성이 규칙을 지키는지 평가" → Audit Manager  
B) "감사자 제출용 증거를 프레임워크별로 자동 수집·보고" → Audit Manager  
C) "API 활동 로그를 누가·언제 남겼는지 기록" → Config  
D) "위협 행위를 탐지" → Audit Manager  

**정답: B**  
해설: 규제 프레임워크별 증거를 자동 수집해 감사 보고서를 만드는 것은 Audit Manager의 고유 역할이다. 리소스 구성 평가는 Config, API 활동 기록은 CloudTrail, 위협 탐지는 GuardDuty의 몫이므로 나머지는 서비스 매칭이 어긋난다. 시험은 이 네 서비스의 역할 경계를 자주 묻는다.

---
