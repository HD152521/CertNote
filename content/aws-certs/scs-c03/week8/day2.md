# Day 2 - Security Hub: 보안 표준(CIS/FSBP), 통합 점수, 핀딩 집계·정규화(ASFF), 자동 대응

탐지기를 여러 개 켜면 곧 새로운 문제가 생긴다 — GuardDuty는 GuardDuty 포맷으로, Inspector는 Inspector 포맷으로, Macie는 또 다른 포맷으로 경보를 쏟아내고, 거기에 IAM·S3·CloudTrail의 설정 점검 결과까지 더해지면 운영자는 "지금 우리 계정이 안전한가?"라는 단 하나의 질문에 답할 수 없게 된다. **AWS Security Hub**는 이 파편화를 해결하는 집계·정규화·점수화 평면이다. 보안 시험에서 Security Hub의 본질은 "탐지를 *하는* 도구"가 아니라 "여러 탐지기의 결과를 *모으고 표준화하고 우선순위화하는* 메타 도구"라는 점이다.

## Security Hub의 세 가지 일

Security Hub가 하는 일은 명확히 셋으로 나뉜다.

1. **보안 표준 점검(Security Standards)**: 계정·리소스 설정을 모범 기준(CIS, FSBP, PCI DSS, NIST 등)과 자동으로 대조해 합격/불합격 컨트롤을 만든다. 내부적으로 **AWS Config** 규칙을 사용한다.
2. **핀딩 집계·정규화(Aggregation)**: GuardDuty, Inspector, Macie, IAM Access Analyzer, Firewall Manager 등 통합 서비스와 서드파티의 핀딩을 **ASFF**라는 단일 포맷으로 받아 한곳에 모은다.
3. **자동 대응(Automation)**: 핀딩을 EventBridge로 흘려보내거나 Automation Rule로 자동 처리·억제한다.

> ⚠️ **함정**: "Security Hub가 위협을 탐지한다"는 표현은 부정확하다. 위협 *탐지*는 GuardDuty가, 취약점 *스캔*은 Inspector가, 민감데이터 *발견*은 Macie가 한다. Security Hub는 이들의 결과를 *집계*하고, 별도로 *설정 점검(컴플라이언스)*을 수행한다. 시험에서 "실시간 악성 행위 탐지"를 물으면 GuardDuty, "여러 보안 서비스 결과를 한 대시보드로"를 물으면 Security Hub다.

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
```

> 💡 **관련 이론**: Security Hub의 표준 점검은 "탐지적 통제(detective control)"이자 "지속적 컴플라이언스(continuous compliance)"의 구현이다. 전통적으로 컴플라이언스 감사는 분기·연 단위 스냅샷이었지만, Config 규칙 기반 점검은 리소스 변경마다 재평가하는 *연속 감사*다. 이는 NIST의 Continuous Monitoring(CM) 개념과 직결된다. 시험에서 "지속적으로 컴플라이언스 상태를 추적"하면 Config + Security Hub 표준이 정답 축이다.

## 보안 점수(Security Score): 컨트롤을 한 숫자로

Security Hub는 활성화된 표준의 컨트롤 합격률을 **보안 점수(%)**로 환산한다. 점수 계산은 단순하다.

```
보안 점수 = (합격(PASSED) 컨트롤 수) / (합격 + 불합격(FAILED) 컨트롤 수) × 100
```

- 비활성/데이터 없음(`NOT_AVAILABLE`, `DISABLED`) 컨트롤은 분모에서 제외된다.
- 컨트롤마다 여러 리소스가 평가되며, 한 리소스라도 불합격이면 해당 컨트롤은 `FAILED`로 본다(컨트롤 상태는 리소스 핀딩의 집계).

이 점수는 "지금 얼마나 베이스라인을 지키고 있나"의 한눈 지표이며, 조직 단위로 집계할 수도 있다.

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

## Custom Insights: 핀딩을 질문으로

Security Hub는 핀딩을 그룹화·필터링한 저장된 뷰인 **Insight**를 제공한다. 기본 제공 인사이트(예: "퍼블릭 접근 가능한 리소스", "가장 핀딩이 많은 리소스") 외에 ASFF 필드로 커스텀 인사이트를 만들 수 있다. 인사이트는 *grouping attribute*(예: 리소스 ID, 계정) 기준으로 핀딩을 모아 "어디에 위험이 집중됐나"를 드러낸다.

## 정리: Security Hub의 위치

CloudWatch가 단일 신호의 임계 탐지라면, Security Hub는 *여러 신호의 집계·정규화·점수화*다. 핵심 개념을 다시 묶으면: 표준(CIS/FSBP, Config 기반) → 점수(합격률) → 핀딩 정규화(ASFF) → 자동화(Automation Rules 내부 정리 + EventBridge 외부 교정). 이 흐름은 Day 4의 EventBridge 보안 자동화로 직접 연결된다.

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
