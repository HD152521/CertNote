# Day 1 - 도메인 1·2 통합 복습: 위협 탐지·인시던트 대응 ↔ 로깅·모니터링

시험의 6개 도메인 중 가장 무겁게 출제되는 두 축이 도메인 1(위협 탐지·인시던트 대응, ~14%)과 도메인 2(보안 로깅·모니터링, ~18%)다. 둘은 시험에서 거의 항상 *한 흐름*으로 묻는다. "로그가 있어야 탐지하고, 탐지가 있어야 대응한다." 오늘은 이 파이프라인 — **수집(로그) → 분석·탐지(GuardDuty/Detective/Macie) → 집약(Security Hub) → 자동 대응(EventBridge→Lambda/SSM)** — 을 하나의 신경계로 묶어 복습한다.

## 로깅 계층: 무엇이 어디에 기록되는가

탐지의 원천은 로그다. 시험은 "이 증거를 보려면 어떤 로그를 켜야 하는가"를 끊임없이 묻는다.

| 무엇을 알고 싶은가 | 로그 소스 | 위치/특이점 |
|-------------------|-----------|-------------|
| 누가 어떤 API를 호출했나 | CloudTrail (관리 이벤트) | 기본 ON, 멱 90일 콘솔. 영구 보존은 S3 |
| S3 객체·Lambda 데이터 접근 | CloudTrail **데이터 이벤트** | 명시적 활성화·과금. 객체 GET/PUT 추적 |
| VPC 내 IP 흐름(허용/거부) | VPC Flow Logs | ENI/Subnet/VPC 단위. 페이로드 없음 |
| DNS 질의 내용 | Route 53 Resolver query log | 도메인 exfiltration 탐지 |
| HTTP 요청·차단 | WAF 로그 | `aws-waf-logs-` 접두사 필수 |
| OS·앱 내부 동작 | CloudWatch Logs (agent) | 인스턴스 내부 가시성 |
| 설정 변경 이력·준수 | AWS Config | 리소스 타임라인·규칙 평가 |

> 💡 **관련 이론**: CloudTrail은 *제어 평면(누가 무엇을 설정·호출)*을, VPC Flow Logs는 *데이터 평면(트래픽 흐름)*을, CloudWatch Logs는 *호스트 내부*를 본다. 이 셋은 겹치지 않고 보완한다. 시험에서 "EC2가 외부로 데이터를 빼냈는지" → Flow Logs(+DNS query log), "누가 보안 그룹을 열었는지" → CloudTrail, "프로세스가 무엇을 했는지" → CloudWatch agent. 소스를 혼동하면 오답이다.

핵심 함정: **CloudTrail 관리 이벤트는 S3 GetObject를 기록하지 않는다.** 객체 수준 접근은 *데이터 이벤트*를 따로 켜야 한다. organization trail로 다계정을 단일 S3 버킷에 모으고, log file validation(SHA-256 digest)으로 변조를 탐지하며, SSE-KMS로 암호화한다.

## 탐지 계층: 로그를 위협으로 번역

- **GuardDuty**: CloudTrail·VPC Flow Logs·DNS 로그(+EKS/S3/Malware/RDS/Lambda 보호)를 ML·위협 인텔로 분석해 *finding* 생성. **로그를 직접 켤 필요 없이** 내부적으로 소비한다 — 끄지 말 것.
- **Macie**: S3의 PII·민감 데이터를 자동 분류·발견. "S3에 신용카드 번호가 있는가" → Macie.
- **Detective**: GuardDuty finding의 *근본 원인·범위*를 그래프로 조사(behavior graph). "왜·얼마나 퍼졌나".
- **Inspector**: EC2/ECR/Lambda의 *취약점(CVE)·네트워크 노출* 스캔. 사람 개입 없이 지속 평가.
- **Access Analyzer**: 리소스 정책이 외부·교차 계정에 노출됐는지 분석.

> 🎯 **통합 시나리오 A**: "GuardDuty가 `UnauthorizedAccess:EC2/MaliciousIPCaller`를 올렸다. 이 인스턴스가 무엇을 했고 다른 자원으로 번졌는지 조사하고 싶다." 답: **Detective**로 finding을 pivot해 행위 그래프(연결된 IP·API·계정)를 보고, 원천 로그는 CloudTrail/Flow Logs로 교차 확인. GuardDuty는 *무엇이 일어났나*, Detective는 *왜·얼마나*를 답한다.

## 집약 계층: Security Hub

Security Hub는 GuardDuty·Inspector·Macie·Config 등 다수 소스의 finding을 **ASFF(AWS Security Finding Format)** 표준으로 정규화·집약한다. 보안 표준(CIS, AWS FSBP, PCI DSS, NIST)에 대한 자동 점검 점수를 준다. **다계정은 delegated administrator**로 위임 운영하고, Organizations와 통합해 신규 계정 자동 등록.

> ⚠️ **자주 틀리는 구분**: 
> - GuardDuty = *위협* 탐지(행위 이상). Inspector = *취약점*(CVE/패치). 혼동 금지.
> - Macie = S3 *데이터* 민감도. Access Analyzer = *정책* 노출. 
> - Security Hub = *집약·표준 점수*. Detective = *조사*. Config = *설정 준수·이력*.

## 대응 계층: EventBridge가 신경을 연결

탐지가 대응으로 이어지는 배선이 **EventBridge**다. GuardDuty/Security Hub finding, Config 비준수, CloudTrail 이벤트가 모두 EventBridge 이벤트로 흐른다. 룰이 매칭되면 대상으로 라우팅:

- **Lambda**: 즉시 자동 교정(보안 그룹 회수, 키 비활성화, 스냅샷).
- **SSM Automation runbook**: 표준화된 다단계 대응(인스턴스 격리·포렌식 캡처).
- **Step Functions**: 승인 게이트가 있는 복잡한 대응 워크플로.
- **SNS**: 사람에게 알림(SOC/온콜).

> 💡 **관련 이론**: 이것이 *event-driven security automation*이다. 시험의 "사람 개입 없이 자동으로(automatically, without manual intervention)" 키워드는 거의 항상 EventBridge → Lambda/SSM 패턴을 가리킨다. Config 자동 교정(remediation)도 같은 철학 — `AWS-PublishSNSNotification`이나 커스텀 SSM 문서로 비준수 리소스를 즉시 되돌린다.

### 인시던트 대응의 정석 절차

침해된 EC2 대응 순서(시험 단골):
1. **격리**: 포렌식 격리용 빈 보안 그룹으로 교체(종료 금지 — 휘발성 증거 보존).
2. **증거 보존**: EBS 스냅샷, 메모리 덤프, 인스턴스 메타데이터·태그.
3. **분리**: Auto Scaling 그룹에서 detach해 교체 방지.
4. **조사**: Detective로 범위 파악, 포렌식 계정으로 스냅샷 공유.
5. **복구·근절**: 깨끗한 AMI 재배포, 침해 자격증명 회수·로테이션.

키 침해 대응: IAM 키는 즉시 비활성화 후 삭제, KMS 키는 삭제 대신 *disable*(되돌릴 수 있게), 노출된 시크릿은 Secrets Manager 로테이션 트리거.

> 🎯 **통합 시나리오 B**: "Config 규칙 `s3-bucket-public-read-prohibited`가 비준수를 발견하면, 사람 개입 없이 즉시 퍼블릭 접근을 차단하라." 답: Config 규칙 + **자동 교정(SSM Automation)** 연결, 또는 EventBridge로 비준수 이벤트 → Lambda가 `PutPublicAccessBlock` 호출. 동시에 SNS로 보안팀 통보. 탐지(Config) → 라우팅(EventBridge) → 교정(SSM/Lambda) → 통보(SNS)의 완결 루프.

## 두 도메인을 잇는 한 줄 그림

```
[로그 소스]            [탐지/분석]         [집약]        [대응]
CloudTrail ─┐
Flow Logs  ─┼─► GuardDuty ─┐
DNS log    ─┘              ├─► Security Hub ─► EventBridge ─┬─► Lambda(교정)
S3         ───► Macie    ──┤   (ASFF 정규화)               ├─► SSM(runbook)
EC2/ECR    ───► Inspector ─┤                               ├─► SNS(알림)
설정변경    ───► Config   ──┘                               └─► Step Functions
                  └─► Detective(조사) ◄── finding pivot
```

> 🔍 **더 깊이**: 성숙한 SOC는 "탐지했는가"가 아니라 "탐지→대응 *시간(MTTR)*을 자동화로 얼마나 줄였는가"로 평가된다. 시험 답안이 "Lambda로 자동 교정 + SNS 알림"을 선호하는 이유다. 동시에 *증거 무결성*도 핵심 — CloudTrail log file validation, S3 Object Lock(WORM)·MFA Delete, KMS 키 비활성화(삭제 아님)는 모두 "조사 가능성·법적 증거력을 훼손하지 말라"는 같은 원칙의 표현이다.

## 한 줄 요약 체크리스트

- [ ] CloudTrail 관리+데이터 이벤트, organization trail, log file validation, SSE-KMS를 켰는가
- [ ] GuardDuty·Inspector·Macie·Config를 켜고 Security Hub로 집약(delegated admin)했는가
- [ ] "무엇이"=GuardDuty, "왜/범위"=Detective, "취약점"=Inspector, "데이터 민감도"=Macie를 구분하는가
- [ ] EventBridge로 finding을 Lambda/SSM 자동 교정에 라우팅했는가
- [ ] 침해 EC2 대응 순서(격리→증거보존→분리→조사→복구)를 외웠는가
- [ ] 자격증명·키 침해 시 비활성화·로테이션(삭제 신중) 절차를 아는가

---

## 📝 연습 문제

**문제 1.** 보안팀이 "어떤 IAM 사용자가 특정 S3 객체를 다운로드했는지"를 추적하려 한다. 기본 CloudTrail만 켜진 상태에서 이 정보가 보이지 않았다. 원인과 해결은?

A) VPC Flow Logs를 켜야 한다  
B) CloudTrail **데이터 이벤트**(S3 객체 수준)를 명시적으로 활성화해야 한다 — 관리 이벤트는 객체 GET/PUT을 기록하지 않는다  
C) GuardDuty를 켜면 자동으로 기록된다  
D) CloudWatch Logs agent를 설치해야 한다  

**정답: B**  
해설: CloudTrail 관리 이벤트는 제어 평면(API 설정·호출)을 기록하지만 S3 객체 수준의 GetObject/PutObject 같은 데이터 평면 접근은 기록하지 않는다. 객체 단위 추적은 별도 과금되는 데이터 이벤트를 명시적으로 켜야 한다. Flow Logs는 IP 흐름만 보고 객체를 식별하지 못하며, GuardDuty는 탐지 서비스로 감사 추적 원천이 아니고, CloudWatch agent는 OS 내부용이다.

---

**문제 2.** GuardDuty가 EC2 인스턴스의 악성 IP 통신 finding을 생성했다. 보안팀은 이 인스턴스가 다른 어떤 리소스·계정과 연결됐고 침해가 얼마나 퍼졌는지 시각적으로 조사하려 한다. 가장 적합한 서비스는?

A) Amazon Inspector  
B) Amazon Macie  
C) Amazon Detective  
D) AWS Config  

**정답: C**  
해설: Detective는 GuardDuty finding을 pivot해 behavior graph로 연결된 IP·API 호출·계정 관계를 시각화하며 근본 원인과 침해 범위를 조사하는 데 특화돼 있다. Inspector는 취약점(CVE) 스캔, Macie는 S3 민감 데이터 분류, Config는 설정 준수·변경 이력으로 모두 "범위 조사" 목적과 맞지 않는다.

---

**문제 3.** 요구사항: "Config 규칙이 퍼블릭 S3 버킷을 발견하면 사람 개입 없이 즉시 퍼블릭 접근을 차단하고 보안팀에 알림." 가장 적절한 구현은?

A) Config 규칙 점수만 매일 검토한다  
B) Config 규칙 + 자동 교정(SSM Automation)으로 즉시 PublicAccessBlock 적용 + EventBridge→SNS로 알림  
C) IAM 정책으로 모든 사용자의 S3 권한 제거  
D) GuardDuty에 버킷을 등록한다  

**정답: B**  
해설: "사람 개입 없이 즉시" 교정은 Config 규칙에 SSM Automation 자동 교정을 연결(또는 EventBridge로 비준수 이벤트를 Lambda에 라우팅)해 PublicAccessBlock을 적용하고, SNS로 통보하는 event-driven 패턴이 정답이다. 점수만 검토하면 자동이 아니고, 전체 권한 제거는 과도하며, GuardDuty는 버킷 등록 방식으로 동작하지 않는다.

---

**문제 4.** 침해가 의심되는 EC2 인스턴스를 다룰 때, 휘발성 증거를 보존하면서 격리하는 올바른 첫 조치는?

A) 인스턴스를 즉시 종료(terminate)한다  
B) 인바운드·아웃바운드가 없는 포렌식 격리용 보안 그룹으로 교체하고, Auto Scaling에서 detach하며, EBS 스냅샷을 뜬다  
C) 보안 그룹을 모두 허용으로 바꿔 트래픽을 관찰한다  
D) 인스턴스 IAM 역할만 삭제한다  

**정답: B**  
해설: 인시던트 대응 정석은 종료가 아니라 격리다. 모든 트래픽을 차단하는 격리 보안 그룹으로 교체해 추가 피해를 막되 메모리 등 휘발성 증거를 보존하고, Auto Scaling에서 detach해 교체를 방지하며, EBS 스냅샷으로 증거를 캡처한다. 종료는 증거를 파괴하고, 전체 허용은 피해를 키우며, 역할만 삭제하는 것은 네트워크 격리가 아니다.

---

**문제 5.** 다음 중 탐지 서비스와 그 주 용도의 연결이 잘못된 것은?

A) GuardDuty — CloudTrail/Flow Logs/DNS 기반 위협(행위 이상) 탐지  
B) Inspector — EC2/ECR/Lambda의 취약점(CVE)·네트워크 노출 평가  
C) Macie — S3 내 PII·민감 데이터 자동 분류·발견  
D) Security Hub — GuardDuty finding의 근본 원인을 그래프로 조사  

**정답: D**  
해설: 근본 원인을 behavior graph로 조사하는 것은 Detective의 역할이다. Security Hub는 여러 소스의 finding을 ASFF로 정규화·집약하고 보안 표준(CIS/FSBP/PCI) 점수를 제공하는 집약 서비스다. 나머지 연결(GuardDuty=위협 탐지, Inspector=취약점, Macie=S3 데이터 민감도)은 모두 정확하다.

---

**문제 6.** 다계정 환경에서 모든 계정의 CloudTrail 로그를 변조 불가능하게 중앙 보관하려 한다. 가장 적절한 조합은?

A) 각 계정이 개별 trail을 로컬에 보관  
B) Organization trail로 단일 중앙 S3 버킷에 집약 + log file validation(digest) + SSE-KMS + S3 Object Lock(WORM)/MFA Delete  
C) CloudWatch Logs에만 저장하고 30일 후 삭제  
D) GuardDuty에 로그를 직접 업로드  

**정답: B**  
해설: organization trail이 모든 멤버 계정 이벤트를 중앙 S3 버킷으로 자동 집약하고, log file validation의 SHA-256 digest로 변조를 탐지하며, SSE-KMS 암호화와 S3 Object Lock(WORM)/MFA Delete로 삭제·변조를 방지한다. 개별 로컬 보관은 중앙화·무결성이 약하고, 단기 CloudWatch 보관은 영구 증거가 아니며, GuardDuty는 로그를 내부 소비할 뿐 업로드 대상이 아니다.

---
