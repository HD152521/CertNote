# Day 5 - Week 5 복습: Systems Manager 종합 시나리오

Week 5는 AWS Systems Manager라는 거대한 운영 플랫폼 전체를 훑었다. Managed Instance의 등록 조건에서 시작해, 명령 자동화(Run Command), 상태 관리(State Manager), 예약 작업(Maintenance Window), 패치 자동화(Patch Manager), 설정 중앙화(Parameter Store), 키 없는 접속(Session Manager), 그리고 복잡한 운영 워크플로(Automation Runbook)까지. 이 모든 도구들은 하나의 목표로 수렴한다: **운영자가 반복적이고 위험한 수동 작업에서 벗어나 중요한 것에 집중할 수 있게 하는 것.**

오늘은 실제 시험에서 나오는 시나리오 형식으로 Week 5 전체를 복습한다. 각 문제는 단순히 "어떤 도구인가"를 묻는 것이 아니라 "왜 이 도구인가"를 논리적으로 추론하는 훈련이다. SOA-C02는 선택지 네 개 모두가 SSM 도구인 경우가 많아, 정확한 역할 구분이 합격을 가른다.

## 핵심 개념 한 줄 요약

1. **Managed Instance 조건 3가지**: SSM Agent 실행 + IAM Role(`AmazonSSMManagedInstanceCore`) + 네트워크 도달
2. **사설 VPC 필수 3개 Endpoint**: ssm / ssmmessages / ec2messages (모두 Interface, HTTPS 443)
3. **Hybrid Activations**: 온프레미스·타 클라우드도 `mi-xxx` ID로 EC2와 동일하게
4. **Run Command(일회성) / State Manager(지속 + drift 교정) / Maintenance Window(스케줄 + 순서 보장)** — 세 도구의 역할 분담
5. **Patch Group 태그 이름 = 정확히 "Patch Group"** (공백 포함, 대소문자 구분)
6. **AWS 기본 베이스라인 = Security/Critical만** — Important 이상은 Custom Baseline
7. **Dev(0일) → Stage(3일) → Prod(14일) 점진 적용** = ApproveAfterDays 차이
8. **Parameter Store SecureString = KMS 암호화** — 자동 회전은 Secrets Manager가 담당
9. **Session Manager = SSH/RDP 키 없이, 포트 22 닫고, IAM 기반, 세션 자동 감사**
10. **Automation Runbook = 멀티 스텝 워크플로** — Config Auto Remediation, EventBridge 트리거

> 💡 **관련 이론**: SSM은 분산 시스템의 "Control Plane vs Data Plane" 분리 아키텍처를 정확히 구현한다. SSM API 계층(명령 등록, 상태 조회)이 Control Plane이고, SSM Agent(실제 명령 실행, heartbeat)가 Data Plane이다. Control Plane 장애(SSM 서비스 이슈)는 이미 진행 중인 Agent 작업에 영향을 주지 않는다. Werner Vogels(AWS CTO)가 re:Invent에서 반복하는 "control plane/data plane separation"의 실제 구현 사례다.

## 비교표: 헷갈리는 개념 정리

**명령 실행 도구 비교:**

| 특성 | Run Command | State Manager | Maintenance Window |
|------|-------------|---------------|---------------------|
| 실행 방식 | 수동 트리거 (일회성) | 스케줄 + 신규 인스턴스 자동 | 예약 시간에 자동 |
| Drift 교정 | X | O | X |
| 신규 인스턴스 자동 포함 | X | O (태그 기반) | 태그 기반 |
| 복수 Task 순서 보장 | X | X | O (Priority) |
| 즉시 실행 가능 | O | O (start-associations-once) | 수동 트리거 가능 |
| 주 사용 시나리오 | 긴급 일괄 명령 | 설정 표준화 유지 | 패치/백업/유지보수 |

**시크릿 관리 도구 비교:**

| 특성 | Parameter Store Standard | Parameter Store Advanced | Secrets Manager |
|------|--------------------------|--------------------------|-----------------|
| 비용 | 무료 | $0.05/파라미터/월 | $0.40/시크릿/월 |
| 최대 값 크기 | 4KB | 8KB | 64KB |
| 자동 회전 | X | X | O (RDS/Redshift/Lambda) |
| 크로스 리전 복제 | X | X | O |
| Parameter Policy (만료/알림) | X | O | X |
| 버전 관리 | O | O | O |
| CFn/Lambda/EC2 통합 | O | O | O |

**접속 방식 비교:**

| 특성 | SSH + Bastion | Session Manager | EC2 Instance Connect |
|------|---------------|-----------------|----------------------|
| 포트 22 필요 | O | X | O |
| SSH 키 관리 | O (키 분배) | X (IAM 기반) | X (일시적 키) |
| 자동 세션 로깅 | 별도 구성 필요 | O (S3/CW Logs) | X |
| 사설 VPC 접속 | VPN/DX 필요 | VPC Endpoint | VPC Endpoint |
| MFA 강제 | 어려움 | IAM 정책으로 쉬움 | X |
| 포트 포워딩 | O (수동) | O (document 지원) | X |

> 🔍 **더 깊이**: Session Manager의 IAM 기반 접근 제어는 단순히 "누가 접속할 수 있는가"를 넘어 "어느 인스턴스에, 어느 시간에, 어떤 명령만" 허용하는 세밀한 정책이 가능하다. 예를 들어 `ssm:startSession` 조건에 `ssm:resourceTag/Environment=prod`를 추가하면 prod 태그 인스턴스에만 세션을 허용한다. `aws:MultiFactorAuthPresent: true` 조건으로 MFA 강제도 가능하다. 기존 SSH 키 방식으로는 이런 세밀한 제어가 매우 어렵다. IAM Identity Center(SSO)와 연계하면 중앙 디렉토리 기반 접근 제어까지 가능하다.

**Patch Manager 핵심 비교:**

| 항목 | AWS 기본 Baseline | 커스텀 Baseline |
|------|-------------------|-----------------|
| 적용 분류 | Security만 | 선택 가능 |
| 승인 기간 | OS마다 다름 (보통 7일) | 직접 설정 |
| Compliance Level | 설정 불가 | CRITICAL/HIGH/MEDIUM 선택 |
| 거부 패치 | 설정 불가 | 명시적 BLOCK 가능 |
| 멀티 OS | 각 OS별 별도 기본 Baseline | OS별 별도 생성 필요 |

> 💡 **관련 이론**: Patch Manager의 "Approval Rules → Maintenance Window → Compliance" 파이프라인은 ISO 27001 A.12.6.1(기술적 취약점 관리) 요건을 자동으로 충족하는 구조다. ISO 27001 인증 감사에서 "취약점 패치 프로세스 자동화 증빙"으로 Patch Compliance 보고서를 직접 제출할 수 있다. CIS Controls v8의 Control 7(취약점 관리)도 같은 맥락이다. AWS Audit Manager의 ISO 27001 및 NIST 800-53 프레임워크가 Patch Manager 데이터를 자동으로 증빙으로 수집한다.

## 패치 관련 실수 사례 모음

운영 현장에서 반복되는 실수들을 알아두면 시험 함정 문제를 쉽게 피한다.

| 실수 | 증상 | 올바른 방법 |
|------|------|-------------|
| `PatchGroup`으로 태그 생성 | 패치 그룹이 인식되지 않음 | `Patch Group` (공백 포함) |
| Baseline만 만들고 Patch Group 연결 안 함 | 기본 Baseline으로 패치됨 | `register-patch-baseline-for-patch-group` 필수 |
| `RebootIfNeeded` 모르고 `NoReboot` 사용 | InstalledPendingRebootCount 누적 | Maintenance Window에서 재부팅 포함 |
| Scan과 Install 혼동 | 실제 패치 없이 Compliance만 업데이트 | Install이 실제 적용 |
| 기본 Baseline이 Important 포함한다고 착각 | 보안 감사에서 지적 | 기본 Baseline = Security/Critical만 |
| ApproveAfterDays=0이 즉시 적용 의미하지 않음 | 이해 오류 | =0은 승인 즉시 (릴리즈 당일부터) |

> ⚠️ **함정**: `ApproveAfterDays=0`은 "패치가 릴리즈된 당일부터 승인"을 의미한다. 즉 Patch Manager가 다음 번 패치를 실행할 때 그 패치가 이미 릴리즈됐다면 즉시 적용된다. Maintenance Window가 주 1회이면 최대 7일 후에 적용된다. "0일이면 실시간 즉시 적용"이 아니라 "다음 Maintenance Window 실행 시 릴리즈 당일 이후 패치 전부 적용"이다.

## 📝 시나리오 연습 문제

**문제 1.** 운영팀이 사설 VPC(인터넷 게이트웨이 없음)에서 EC2 인스턴스를 SSM으로 관리하고 있다. 인스턴스에 `AmazonSSMManagedInstanceCore` IAM Role이 부착되어 있고 SSM Agent도 실행 중이지만, SSM 콘솔의 Fleet Manager에 인스턴스가 보이지 않는다. 원인은?

A) IAM Role에 추가 권한이 필요하다
B) SSM Agent를 재시작해야 한다
C) VPC에 ssm, ssmmessages, ec2messages Interface Endpoint가 없거나 해당 Endpoint로의 443 포트가 보안 그룹에서 차단되어 있다
D) 인스턴스가 Multi-AZ에 배포되어야 한다

**정답: C**
해설: 사설 VPC(인터넷 없음) + IAM Role 정상 + Agent 실행 중 → 남은 원인은 네트워크다. SSM Agent는 `ssm`, `ssmmessages`, `ec2messages` 세 엔드포인트에 HTTPS(443)로 통신한다. 사설 VPC에서는 VPC Interface Endpoint 3개가 없으면 이 통신이 불가능하다. 또한 Endpoint 보안 그룹이 인스턴스 서브넷에서의 443 인바운드를 허용해야 한다. 두 조건 중 하나라도 빠지면 `PingStatus=ConnectionLost`로 나타난다.

---

**문제 2.** 회사가 Auto Scaling Group을 사용해 웹 서버 용량을 유동적으로 조정한다. 새 EC2 인스턴스가 ASG로 시작될 때마다 자동으로 CloudWatch Agent 설정이 적용되어야 한다. 운영팀이 직접 개입할 필요가 없어야 한다. 가장 적합한 구성은?

A) ASG Launch Configuration에 User Data 스크립트로 CW Agent 설정을 하드코딩한다
B) ASG 인스턴스에 `MonitoringEnabled=true` 태그를 부여하고, State Manager Association을 같은 태그로 설정하여 `AmazonCloudWatch-ManageAgent` Document를 일일 스케줄로 실행한다
C) EventBridge로 EC2 `RunInstances` 이벤트를 감지하고 Lambda로 Run Command를 실행한다
D) Maintenance Window를 매 30분마다 실행하도록 설정한다

**정답: B**
해설: State Manager Association의 핵심 특성이 "새 Managed Instance가 태그와 일치하는 순간 즉시 실행된다"는 것이다. ASG로 새 인스턴스가 시작되면 Managed Instance로 등록되는 순간 Association이 자동 실행된다. User Data(A)는 AMI 변경 없이 CW Agent 설정을 업데이트하기 어렵고 drift 교정이 안 된다. Lambda(C)도 동작하지만 State Manager보다 복잡하고 drift 교정이 안 된다.

---

**문제 3.** 회사의 패치 정책은 다음과 같다: "prod 환경의 Web 서버(Linux)에는 Security 분류의 Critical 패치만, 공개 후 14일이 지난 것만 적용한다. Patch Group 기반으로 관리한다." 이를 구현하기 위한 최소한의 구성 단계를 올바른 순서로 나열하면?

A) Maintenance Window 생성 → Patch Baseline 생성 → EC2 태그 추가
B) EC2 태그(`Patch Group=prod-web`) 추가 → Patch Baseline 생성(Security/Critical, 14일) → Patch Baseline을 prod-web 그룹에 연결 → Maintenance Window에 Task 등록
C) Patch Baseline 생성 → EC2 태그 추가 → Maintenance Window 생성
D) AWS 기본 베이스라인을 사용하고 Maintenance Window만 설정한다

**정답: B**
해설: 올바른 구성 순서다. (1) EC2에 태그 `Patch Group=prod-web` 추가 (공백 포함 정확한 이름), (2) Custom Patch Baseline 생성 (Security/Critical, ApproveAfterDays=14), (3) `register-patch-baseline-for-patch-group`으로 Baseline과 그룹 연결, (4) Maintenance Window 생성 후 Target과 Task(AWS-RunPatchBaseline) 등록. AWS 기본 베이스라인(D)은 Important 패치도 포함하고 대기 기간이 7일이라 요구사항과 다르다.

---

**문제 4.** 보안팀이 다음 요구사항을 제시했다. "모든 EC2 접속 세션을 감사 가능하게 보관해야 한다. 접속자의 모든 명령어가 로깅되어야 한다. 포트 22는 보안 그룹에서 허용하지 않는다." 운영팀이 개발자들의 접속 요구도 충족시키면서 이 요구사항을 구현할 수 있는 방법은?

A) AWS CloudShell을 사용해 간접적으로 접속한다
B) Session Manager를 활성화하고, Session Preferences에서 S3 버킷과 CloudWatch Logs 그룹을 설정한다. 개발자 IAM 정책에 `ssm:StartSession` 권한을 부여한다
C) AWS CloudTrail로 모든 SSH 명령어를 기록한다
D) VPN + Bastion Host를 구성하고 Bastion에서 세션 로깅을 한다

**정답: B**
해설: Session Manager가 모든 요구사항을 충족한다. 포트 22 없이 IAM 기반 접속, 세션 입출력 자동 로깅(S3/CloudWatch Logs), KMS 암호화 옵션. CloudTrail(C)은 AWS API 호출을 기록하지 SSH 명령어를 기록하지 않는다. Bastion(D)은 포트 22가 필요하고 세션 로깅을 별도로 구성해야 한다.

---

**문제 5.** 운영자가 실행 중인 Maintenance Window에서 패치 Task가 `Window Duration`을 초과할 것 같다. Cutoff가 1시간으로 설정되어 있다. 현재 Window 종료 30분 전이고, 새로운 Task 실행 요청이 왔다. 어떻게 되는가?

A) 새 Task가 즉시 실행된다
B) 새 Task 실행이 거부된다. Window 종료 30분 전은 Cutoff 시간(종료 1시간 전)을 지났으므로 새 Task를 시작할 수 없다
C) 현재 실행 중인 모든 Task가 즉시 중단된다
D) Window가 자동으로 연장된다

**정답: B**
해설: Cutoff=1시간이면 Window 종료 1시간 전부터 새 Task 시작이 차단된다. Window 종료 30분 전은 이미 Cutoff를 지난 시점이므로 새 Task 실행이 거부된다. 현재 진행 중인 Task들은 Cutoff와 무관하게 Window 종료 후에도 완료될 때까지 계속 실행된다. Cutoff의 목적은 "새 Task가 Window 끝에 시작되어 미완료 상태로 끊기는 것"을 방지하는 것이다.

---

**문제 6.** Lambda 함수가 Production RDS에 접근하기 위해 비밀번호가 필요하다. 현재 Lambda 환경변수에 평문 비밀번호가 저장되어 있다. 보안팀이 개선을 요구했다. 90일마다 자동으로 비밀번호가 변경되어야 하고, Lambda 코드 변경 없이 새 비밀번호가 사용되어야 한다. 가장 적합한 솔루션은?

A) Parameter Store SecureString으로 마이그레이션하고 Lambda에서 직접 API 호출
B) Secrets Manager로 마이그레이션하고 RDS 자동 회전을 설정. Lambda SDK가 항상 최신 시크릿을 가져오도록 구현
C) KMS를 사용해 환경변수를 암호화한다
D) Lambda Layer에 암호화된 설정 파일을 포함한다

**정답: B**
해설: "90일 자동 회전 + Lambda 코드 변경 없이"가 핵심이다. Secrets Manager는 RDS와 통합된 자동 회전을 지원하며, 회전 시 Lambda(회전 함수)가 자동으로 새 비밀번호를 RDS에 설정하고 Secrets Manager를 업데이트한다. 이후 애플리케이션 Lambda는 `get_secret_value()` 호출로 항상 최신 값을 가져온다. Parameter Store(A)는 자동 회전이 없다. KMS 암호화(C)는 비밀번호 회전을 해결하지 않는다.

---

**문제 7.** 운영팀이 Config Rule을 통해 "공개 S3 버킷"을 감지하고, 감지 즉시 자동으로 버킷의 공개 접근을 차단하려 한다. 어떤 SSM 기능이 가장 적합한가?

A) Run Command
B) State Manager
C) Automation Runbook (Config Auto Remediation 대상)
D) Session Manager

**정답: C**
해설: Config Auto Remediation은 비준수 리소스를 발견하면 SSM Automation Document를 실행한다. `AWS-DisableS3BucketPublicReadWrite` 같은 표준 Runbook이 제공된다. Run Command(A)는 EC2 인스턴스 대상이고 S3 버킷을 직접 제어하지 않는다. State Manager(B)는 EC2 설정 관리가 주 목적이다. Automation은 `executeAwsApi` action으로 모든 AWS API를 호출할 수 있어 S3, EC2, IAM 등 다양한 리소스를 제어할 수 있다.

---

**문제 8.** 개발팀이 "설치된 Node.js 버전을 14.x에서 18.x로 전환하는 과정에서, 현재 14.x를 사용하는 prod 서버 목록을 뽑아달라"고 요청했다. 어떤 SSM 기능으로 가장 효율적으로 답할 수 있는가?

A) Run Command로 각 인스턴스에 `node --version`을 실행하고 결과를 수동 취합
B) SSM Inventory(`AWS:Application` 데이터)에서 Node.js 버전을 필터링
C) CloudTrail에서 npm install 이벤트를 검색
D) Amazon Inspector로 취약점 스캔

**정답: B**
해설: SSM Inventory의 `AWS:Application` 유형은 각 인스턴스에 설치된 소프트웨어 이름과 버전을 주기적으로 수집한다. Resource Data Sync로 S3에 동기화한 후 Athena SQL로 "Node.js 14.x 설치된 prod 인스턴스 목록"을 즉시 쿼리할 수 있다. Run Command(A)도 동작하지만 실시간 일회성 조회이며 결과 취합이 번거롭다. Inventory는 설정 한 번으로 지속적으로 데이터를 수집하므로 이런 조회에 최적이다.

---

**문제 9.** 회사가 Hybrid Activations를 사용해 온프레미스 서버 50대를 SSM으로 관리하고 있다. 이 서버들에 매주 보안 패치를 적용하고 싶다. 어떤 Patch Manager 기능을 사용해야 하며, 온프레미스 서버의 SSM 식별자는 어떤 형식인가?

A) EC2 Instance ID(i-xxx) 형식, Patch Manager 사용 불가
B) mi-xxx 형식, EC2와 동일하게 Patch Baseline + Maintenance Window 사용 가능
C) ARN 형식, Patch Group 태그는 EC2 전용
D) IP 주소 형식, Run Command만 사용 가능

**정답: B**
해설: Hybrid Activations로 등록된 온프레미스 서버는 `mi-xxxxxxxxxxxxxxxxx` 형식의 ID를 받는다. 이후 EC2와 완전히 동일하게 Patch Manager, Run Command, Session Manager, State Manager를 사용할 수 있다. Patch Group 태그도 동일하게 `Key=Patch Group,Value=onprem-prod`로 설정하고 베이스라인을 연결하면 된다. 50대는 Standard Tier(무료) 범위 내이므로 추가 비용 없이 사용 가능하다.

---

**문제 10.** Maintenance Window에서 패치 Task가 실패했다. Concurrency를 10%, Error Tolerance를 5%로 설정했는데 6%의 인스턴스에서 실패가 발생했다. 어떻게 되는가?

A) 모든 인스턴스에 롤백이 시작된다
B) 실패한 인스턴스만 롤백된다
C) Error Tolerance(5%)를 초과했으므로 나머지 인스턴스에 대한 Task 실행이 중단된다. 이미 성공한 인스턴스는 그대로 유지된다
D) 자동으로 Error Tolerance가 확장된다

**정답: C**
해설: Error Tolerance는 "이 비율 이상 실패하면 나머지 실행을 중단"하는 circuit breaker다. 6%가 실패하면 5% 임계값을 초과하여 나머지 인스턴스에 대한 Task 실행이 즉시 중단된다. 이미 성공적으로 패치된 인스턴스는 그대로 유지되고, 아직 패치되지 않은 인스턴스는 건너뛴다. 자동 롤백 기능은 없으며, 실패 원인을 파악한 후 재실행해야 한다.

---

**문제 11.** Parameter Store의 파라미터 `/myapp/prod/db/password`가 90일 동안 변경되지 않았을 때 자동 알림을 보내고, 이 파라미터가 2027년 1월 1일에 자동으로 삭제되도록 설정하려 한다. 어떤 구성이 필요한가?

A) Lambda를 매일 실행해 LastModifiedDate를 확인한다
B) Parameter Store Advanced + NoChangeNotification Policy(90일) + Expiration Policy(2027-01-01)
C) Parameter Store Standard + CloudWatch Events
D) Secrets Manager의 Rotation 기능 활용

**정답: B**
해설: Parameter Policies는 Parameter Store Advanced Tier 전용이다. `NoChangeNotification`은 지정 기간 동안 값이 변경되지 않으면 EventBridge를 통해 알림 이벤트를 발생시킨다. `Expiration`은 지정 날짜에 파라미터를 자동으로 삭제한다. 두 Policy를 하나의 파라미터에 동시에 적용할 수 있다. Standard Tier(C)는 Policy를 지원하지 않는다.

---

**문제 12.** 다음 중 Session Manager가 기존 SSH/Bastion 방식보다 우수한 이유로 올바르지 않은 것은?

A) 포트 22를 열지 않아도 된다
B) IAM 기반 접근 제어로 세밀한 권한 부여가 가능하다
C) 모든 세션이 자동으로 S3/CloudWatch Logs에 기록된다
D) SSH 키보다 더 강력한 암호화 알고리즘을 사용한다

**정답: D**
해설: SSH는 이미 강력한 암호화(RSA 4096, ED25519 등)를 사용한다. Session Manager가 SSH보다 "더 강력한 암호화"를 사용한다는 주장은 올바르지 않다. Session Manager는 AWS KMS 기반 암호화를 사용하지만 이것이 SSH 암호화보다 더 강력하다는 의미는 아니다. Session Manager의 진짜 장점은 A(포트 불필요), B(IAM 세밀한 제어), C(자동 감사 로깅), 그리고 SSH 키 분배 부담 제거, MFA 강제 용이성이다.

---

> 📚 **사례**: 2023년, 중견 물류 기업 E사가 SSM 전면 도입 1년 후 운영 지표를 공개했다. 패치 관련 보안 사고 0건, 운영자의 주간 수작업 시간 65% 감소, 새 서버 온보딩 시간 8시간→15분, 컴플라이언스 감사 준비 기간 3주→2일. 이 숫자들이 SSM이 제공하는 "운영 자동화의 가치"를 가장 잘 보여준다. SOA-C02 시험이 SSM 비중을 높게 가져가는 이유다.

## Week 6 예고

Week 6는 **IaC 운영**의 핵심인 CloudFormation을 중심으로 다룬다.

- Day 1: CloudFormation 기초 — Template 구조, Stack 라이프사이클, cfn-signal
- Day 2: Change Set, Drift Detection, Rollback Trigger — 안전한 CFn 운영 패턴
- Day 3: Nested Stack, Cross-Stack Reference, StackSets — 대규모 멀티 계정 IaC
- Day 4: Service Catalog, AppConfig, AppRegistry — 자가 서비스 프로비저닝
- Day 5: Week 6 복습 + 시나리오 10문제

CloudFormation은 SOA-C02에서 "배포·프로비저닝·자동화" 도메인의 핵심이다. Drift Detection, Change Set, StackSets가 특히 시험에 자주 출제된다. Week 5의 SSM Automation이 "인스턴스 수준 자동화"라면, CloudFormation은 "인프라 수준 자동화"다. 두 계층이 합쳐져 완전한 운영 자동화 스택이 완성된다.
