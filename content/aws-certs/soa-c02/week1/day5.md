# Day 5 - Week 1 복습 + 시나리오 10문제

📅 날짜: Week 1 (Day 5)
🎯 주제: AWS 기초·IAM·Organizations 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 Week 1 핵심 개념 한 줄 요약

1. **글로벌 인프라**: 리전(독립) → AZ(격리 DC 그룹) → 엣지 로케이션(CDN/DNS). 단일 AZ는 안티 패턴
2. **공동 책임 모델**: AWS = 인프라 보안, 고객 = 데이터·IAM·OS·네트워크 보안 (관리형일수록 AWS 책임 ↑)
3. **IAM 평가 로직**: Explicit Deny > Allow > Default Deny. 모든 정책 레이어 교집합 통과해야 허용
4. **EC2/Lambda는 IAM Role** — Access Key 박지 말 것. IMDSv2 강제
5. **STS AssumeRole**: 임시 자격증명. Cross-Account 3rd party는 ExternalId 필수
6. **Permission Boundary**: 사용자/역할이 부여할 수 있는 권한 상한 (IAM 위임 시 가드레일)
7. **Organizations**: 멀티 계정 통합. SCP = 권한 상한, Management Account엔 SCP 미적용
8. **Control Tower / Landing Zone**: Log Archive + Audit + Network + Workloads OU 표준 패턴
9. **AWS RAM**: 계정 간 VPC/Transit Gateway/License 공유
10. **Identity Center**: 멀티 계정 SSO. 계정마다 IAM User 만들지 말 것

---

## 🔍 헷갈리기 쉬운 비교표

| 항목 | SCP | Permission Boundary | Identity Policy | Session Policy |
|------|-----|---------------------|-----------------|----------------|
| 적용 대상 | OU/계정 | User/Role | User/Group/Role | AssumeRole 세션 |
| 권한 부여 | ❌ | ❌ | ✅ | ✅ (제한만) |
| 권한 상한 | ✅ | ✅ | ✅ | ✅ |
| 관리 계정 영향 | ❌ | ✅ | ✅ | ✅ |

| 항목 | IAM User | IAM Role |
|------|----------|----------|
| 유효 기간 | 영구 | 임시 (15분 ~ 12시간) |
| 자격 증명 | Access Key, 비밀번호 | 동적 발급 (STS) |
| 용도 | 사람 | AWS 서비스, Cross-Account, Federation |
| 회전 | 수동 | 자동 |

| 항목 | Organizations | Control Tower | Identity Center |
|------|---------------|---------------|-----------------|
| 역할 | 멀티 계정 통합 | 자동 Landing Zone 구성 | 멀티 계정 SSO |
| 단독 사용 | 가능 | Organizations 필요 | Organizations 권장 |
| 출력 | OU 트리, SCP | OU + 표준 계정 + 가드레일 | Permission Set + 사용자 매핑 |

---

## 📝 시나리오 10문제

**문제 1.** 한 회사가 99.99% SLA를 운영 한다. 연간 허용 다운타임은 약 52분이다. 이 회사가 단일 AZ에 RDS와 EC2를 배포하고 있다면 가장 우선 조치는?

A) 인스턴스 크기를 키운다
B) Multi-AZ로 RDS 변환 + EC2 Auto Scaling Group을 멀티 AZ로 확장
C) 다른 리전에 DR 사이트 구축
D) CloudWatch 알람만 추가

**정답: B**
해설: SLA 99.99%는 단일 AZ로 절대 불가. RDS Multi-AZ는 동기 복제 + 자동 페일오버 1~2분. EC2 ASG도 최소 2개 AZ에 분산해야 단일 AZ 장애 견딤.

---

**문제 2.** 한 IAM 사용자가 S3 객체 업로드를 시도하는데 거부된다. SCP는 `s3:PutObject` Allow, Identity Policy는 `s3:*` Allow, 버킷 정책은 명시적으로 해당 사용자에게 `s3:PutObject` Deny가 있다. 결과는?

A) 허용 — Identity Policy의 Allow가 우선
B) 거부 — Explicit Deny가 최우선
C) 허용 — SCP가 우선
D) 허용 — 버킷 정책은 권장만

**정답: B**
해설: 평가 로직의 핵심 — Explicit Deny가 항상 최우선. SCP, Identity Policy, 어떤 정책에서든 Deny가 있으면 차단.

---

**문제 3.** 한 회사가 외부 SaaS(예: DataDog)가 자기 CloudWatch 메트릭을 읽도록 허용하려 한다. 가장 안전한 통합 방법은?

A) IAM User에 Access Key 생성 후 SaaS에 제공
B) Cross-Account Role + ExternalId 사용. SaaS의 AWS Account ID를 Trust Policy Principal로
C) 루트 자격 증명 공유
D) 모든 IAM 정책을 공개

**정답: B**
해설: 3rd party 통합 표준 패턴. ExternalId는 Confused Deputy 공격 방어. Access Key는 회전 부담 + 유출 위험.

---

**문제 4.** 한 자동화 파이프라인이 GitHub Actions에서 AWS 리소스를 배포한다. 보안 모범 사례는?

A) GitHub Secrets에 IAM User Access Key 저장
B) GitHub OIDC Provider를 IAM에 등록 + AssumeRoleWithWebIdentity 사용
C) 루트 자격 증명을 GitHub에 저장
D) EC2 Instance Profile

**정답: B**
해설: GitHub Actions는 OIDC 토큰을 발급할 수 있고, AWS에서 OIDC Provider로 등록 후 Role을 신뢰하게 하면 **Access Key 없이도** STS AssumeRoleWithWebIdentity로 임시 자격 증명 발급. 모범 사례.

---

**문제 5.** 회사가 새 OU "Sandbox"를 만들고 비용 통제를 위해 t3.micro 외 인스턴스 생성을 막고 싶다. 어떻게?

A) IAM 정책에 Deny 추가
B) SCP에 `Deny ec2:RunInstances` + Condition `ec2:InstanceType != t3.micro`를 Sandbox OU에 적용
C) Service Quotas로 제한
D) Budgets 알람만 설정

**정답: B**
해설: SCP는 OU 단위 가드레일. EC2 인스턴스 유형 제한은 시험 빈출 SCP 예시. IAM 정책은 사용자별이라 OU 전체 통제 어려움. Budgets는 사후 알림.

---

**문제 6.** Lambda 함수를 만들었는데 "User: arn:aws:iam::xxx:user/admin is not authorized to perform: iam:PassRole on resource: arn:aws:iam::xxx:role/lambda-exec-role" 에러가 발생한다. 해결책은?

A) Lambda 함수를 재배포
B) admin 사용자에게 `iam:PassRole` 권한을 `lambda-exec-role`에 대해 부여
C) Lambda Role을 삭제
D) AssumeRole 권한 추가

**정답: B**
해설: AWS 서비스에 IAM Role을 "넘기는" 행위는 `iam:PassRole` 권한 필요. Lambda·EC2·CFn·CodeBuild 생성 시 흔히 누락. Condition으로 `iam:PassedToService`를 제한하는 게 안전.

---

**문제 7.** Multi-Site Active/Active DR 전략을 채택한 회사. 다음 중 일치하지 않는 것은?

A) RTO 거의 0초
B) RPO 거의 0초 또는 매우 작음
C) 비용 가장 저렴
D) 글로벌 트래픽 라우팅에 Route 53 또는 Global Accelerator 필요

**정답: C**
해설: Multi-Site Active/Active는 가장 빠른 복구지만 가장 비싼 전략. 양쪽 사이트가 항상 운영되므로 인프라 비용 2배. 비용 효율을 원하면 Backup & Restore나 Pilot Light.

---

**문제 8.** 회사가 Control Tower로 Landing Zone을 구성했다. 모든 계정의 CloudTrail 로그를 한 곳에 자동 집계하려면?

A) 각 계정마다 별도 S3 버킷에 로그 저장
B) Management Account에서 Organization Trail 활성화 + Log Archive Account의 중앙 S3 버킷 지정
C) CloudWatch Logs로 통합
D) 수동 복사 스크립트

**정답: B**
해설: Landing Zone 표준. Organization Trail은 모든 계정(현재 + 미래)의 CloudTrail 이벤트를 자동 수집하고 중앙 S3로 전송. Log Archive Account는 변조 방지 + 권한 격리.

---

**문제 9.** 회사가 Identity Center를 도입한 후, 개발자에게 모든 계정의 ReadOnly + Prod 계정 PowerUser를 부여하려 한다. 가장 효율적인 방법은?

A) 각 계정마다 IAM User 생성
B) Identity Center에서 Permission Set 두 개(ReadOnly, PowerUser) 생성 + 개발자 그룹에 모든 계정 ReadOnly 할당, Prod 계정에 PowerUser 추가 할당
C) 모든 권한을 Identity Policy에 인라인
D) SCP로 강제

**정답: B**
해설: Identity Center 표준 사용법. Permission Set은 재사용 가능한 권한 템플릿. 그룹 단위로 계정/Permission Set 매핑을 늘려가는 게 운영 효율 최고.

---

**문제 10.** 한 회사가 SCP `Deny *` 정책을 Sandbox OU에 잘못 적용했다. 결과는?

A) 새 리소스만 차단됨
B) 기존 리소스는 동작하지만 신규 API 호출 모두 차단 — 사용자가 콘솔 로그인 후 어떤 작업도 못 함
C) Management Account에도 영향
D) 24시간 후 적용

**정답: B**
해설: SCP는 즉시 적용. `Deny *`는 콘솔 로그인 후 모든 API 차단 (S3 보기, EC2 보기조차 불가). Management Account는 SCP 미적용이라 영향 없음. 복구는 SCP 분리 또는 수정 필요. **운영 교훈**: SCP는 항상 staging OU에서 먼저 테스트.

---

## 🔮 다음 주 예고 (Week 2)

Week 2부터 CloudOps의 진짜 핵심인 **모니터링·로깅** 영역에 진입합니다.

- Day 1: CloudWatch Metrics - Namespace, Dimension, 표준/사용자 지정 메트릭
- Day 2: CloudWatch Logs - Log Group, Stream, Retention, Subscription Filter
- Day 3: Logs Insights - 쿼리 문법과 트러블슈팅 패턴
- Day 4: Metric Filter, Embedded Metric Format, Anomaly Detection
- Day 5: Week 2 복습 + 시나리오 10문제

> 💡 CloudWatch는 SOA-C02 시험에서 **단일 서비스 출제 비중 1위**. 다음 주는 진짜 중요합니다.
