# Day 5 - Week 5 Review: Systems Manager Comprehensive Scenario

Week 5 covered the entire massive AWS Systems Manager operational platform. From Managed Instance registration conditions to command automation (Run Command), state management (State Manager), scheduled tasks (Maintenance Window), patch automation (Patch Manager), configuration centralization (Parameter Store), keyless access (Session Manager), and complex operational workflows (Automation Runbook). All these tools converge on one goal: **enable operators to escape from repetitive and risky manual work and focus on what matters.**

Today we review the entire Week 5 using real-world scenario formats from exams. Each question doesn't simply ask "what is this tool" but trains logical reasoning about "why this tool." SOA-C02 often has all four choices as SSM tools, making precise role distinction a pass/fail factor.

## One-Line Core Concept Summary

1. **Managed Instance 3 requirements**: SSM Agent running + IAM Role(`AmazonSSMManagedInstanceCore`) + network reachability
2. **Private VPC 3 required Endpoints**: ssm / ssmmessages / ec2messages (all Interface, HTTPS 443)
3. **Hybrid Activations**: On-premises/other clouds get `mi-xxx` ID same as EC2
4. **Run Command(one-time) / State Manager(persistent + drift correction) / Maintenance Window(scheduled + order guarantee)** — role division
5. **Patch Group tag name = exactly "Patch Group"** (with space, case-sensitive)
6. **AWS default baseline = Security/Critical only** — Important and above needs Custom Baseline
7. **Dev(0 days) → Stage(3 days) → Prod(14 days) gradual apply** = ApproveAfterDays difference
8. **Parameter Store SecureString = KMS encrypted** — auto-rotation handled by Secrets Manager
9. **Session Manager = SSH/RDP without keys, port 22 closed, IAM-based, auto-audit sessions**
10. **Automation Runbook = multi-step workflow** — Config Auto Remediation, EventBridge trigger

> 💡 **Related theory**: SSM is a precise implementation of the "control plane vs. data plane" separation architecture used in distributed systems. The SSM API layer (registering commands, querying status) is the control plane; the SSM Agent (actually executing commands, sending heartbeats) is the data plane. A control plane failure (an SSM service issue) does not affect Agent tasks that are already running. This is exactly the "control plane / data plane separation" that AWS CTO Werner Vogels returns to in every re:Invent keynote — and SSM is a real-world implementation of it.

## Comparison Table: Clarifying Confusing Concepts

**Command Execution Tools Comparison:**

| Characteristic | Run Command | State Manager | Maintenance Window |
|--------|-------------|---------------|---------------------|
| Execution | Manual trigger (one-time) | Schedule + auto on new instance | Auto at scheduled time |
| Drift Correction | No | Yes | No |
| Auto-include new instances | No | Yes (tag-based) | Tag-based |
| Multi-task order guarantee | No | No | Yes (Priority) |
| Immediate execution possible | Yes | Yes (start-associations-once) | Manual trigger possible |
| Primary scenario | Urgent batch commands | Maintain config standardization | Patch/backup/maintenance |

**Secret Management Tools Comparison:**

| Characteristic | Parameter Store Standard | Parameter Store Advanced | Secrets Manager |
|------|--------------------------|--------------------------|-----------------|
| Cost | Free | $0.05/parameter/month | $0.40/secret/month |
| Max value size | 4KB | 8KB | 64KB |
| Auto-rotation | No | No | Yes (RDS/Redshift/Lambda) |
| Cross-region replication | No | No | Yes |
| Parameter Policy (expiration/notification) | No | Yes | No |
| Version management | Yes | Yes | Yes |
| CFn/Lambda/EC2 integration | Yes | Yes | Yes |

**Access Method Comparison:**

| Characteristic | SSH + Bastion | Session Manager | EC2 Instance Connect |
|------|---------------|-----------------|----------------------|
| Port 22 needed | Yes | No | Yes |
| SSH key management | Yes (key distribution) | No (IAM-based) | No (ephemeral key) |
| Auto session logging | Requires config | Yes (S3/CW Logs) | No |
| Private VPC access | VPN/DX needed | VPC Endpoint | VPC Endpoint |
| MFA enforcement | Difficult | Easy via IAM policy | No |
| Port forwarding | Yes (manual) | Yes (document support) | No |

> 🔍 **Going deeper**: Session Manager's IAM-based access control goes beyond "who is allowed to connect" and makes fine-grained policies possible: "to which instances, at what time, running which commands only." For example, adding `ssm:resourceTag/Environment=prod` as a condition on `ssm:startSession` allows sessions only on instances tagged prod. The `aws:MultiFactorAuthPresent: true` condition lets you enforce MFA. That kind of granular control is very hard to achieve with traditional SSH keys. Combined with IAM Identity Center (SSO), you can even drive access control from a central directory.

**Patch Manager Key Comparison:**

| Item | AWS Default Baseline | Custom Baseline |
|------|-------------------|-----------------|
| Applied classifications | Security only | Configurable |
| Approval period | Varies by OS (usually 7 days) | User-set |
| Compliance Level | Not configurable | CRITICAL/HIGH/MEDIUM choice |
| Deny patches | Not configurable | Explicit BLOCK possible |
| Multi-OS | Separate default per OS | Separate per OS needed |

> 💡 **Related theory**: Patch Manager's "Approval Rules → Maintenance Window → Compliance" pipeline is a structure that automatically satisfies the ISO 27001 A.12.6.1 requirement (technical vulnerability management). In an ISO 27001 certification audit you can submit the Patch Compliance report directly as evidence that the vulnerability-patching process is automated. Control 7 of CIS Controls v8 (vulnerability management) follows the same idea. AWS Audit Manager's ISO 27001 and NIST 800-53 frameworks automatically collect Patch Manager data as evidence.

## Collection of Common Patch Mistakes

Knowing repeated operational mistakes helps avoid exam trap questions.

| Mistake | Symptom | Correct Method |
|------|------|-------------|
| Create tag named `PatchGroup` | Patch group not recognized | `Patch Group` (with space) |
| Create Baseline but don't link to Patch Group | Default Baseline patches instead | `register-patch-baseline-for-patch-group` required |
| Use `NoReboot` instead of `RebootIfNeeded` | InstalledPendingRebootCount accumulates | Maintenance Window includes reboot |
| Mix up Scan vs Install | Compliance updates without actual patch | Install applies actual patch |
| Think default Baseline includes Important | Security audit findings | Default Baseline = Security/Critical only |
| Think `ApproveAfterDays=0` means instant apply | Understanding error | =0 means "approve immediately upon release" |

> ⚠️ **Pitfall**: `ApproveAfterDays=0` means "approved from the day the patch is released." So the next time Patch Manager runs, any patch that has already been released is applied immediately. If the Maintenance Window runs once a week, the patch lands up to 7 days after release. It does not mean "applied instantly in real time" — it means "on the next Maintenance Window run, apply every patch released on or after its release date."

## 📝 시나리오 연습 문제

**문제 1.** 운영팀이 사설 VPC(인터넷 게이트웨이 없음)에서 EC2 인스턴스를 SSM으로 관리하고 있다. 인스턴스에 `AmazonSSMManagedInstanceCore` IAM Role이 부착되어 있고 SSM Agent도 실행 중이지만, SSM 콘솔의 Fleet Manager에 인스턴스가 보이지 않는다. 원인은?

A) IAM Role에 `ssm:UpdateInstanceInformation` 같은 추가 권한이 빠져 Agent가 등록 핸드셰이크를 완료하지 못한다
B) SSM Agent가 stale 캐시 상태라 재시작 후 `amazon-ssm-agent` 서비스를 restart해야 Fleet Manager에 나타난다
C) VPC에 ssm, ssmmessages, ec2messages Interface Endpoint가 없거나 해당 Endpoint로의 443 포트가 보안 그룹에서 차단되어 있다
D) 인스턴스가 단일 AZ에만 있어 Managed Instance 등록에 필요한 cross-AZ heartbeat가 성립하지 않는다

**정답: C**
해설: 사설 VPC(인터넷 없음) + IAM Role 정상 + Agent 실행 중 → 남은 원인은 네트워크다. SSM Agent는 `ssm`, `ssmmessages`, `ec2messages` 세 엔드포인트에 HTTPS(443)로 통신한다. 사설 VPC에서는 VPC Interface Endpoint 3개가 없으면 이 통신이 불가능하다. 또한 Endpoint 보안 그룹이 인스턴스 서브넷에서의 443 인바운드를 허용해야 한다. 두 조건 중 하나라도 빠지면 `PingStatus=ConnectionLost`로 나타난다.

---

**문제 2.** 회사가 Auto Scaling Group을 사용해 웹 서버 용량을 유동적으로 조정한다. 새 EC2 인스턴스가 ASG로 시작될 때마다 자동으로 CloudWatch Agent 설정이 적용되어야 한다. 운영팀이 직접 개입할 필요가 없어야 한다. 가장 적합한 구성은?

A) ASG Launch Template의 User Data 스크립트에 CW Agent 설정 JSON을 하드코딩하고, AMI 갱신 시마다 스크립트를 다시 배포한다
B) ASG 인스턴스에 `MonitoringEnabled=true` 태그를 부여하고, State Manager Association을 같은 태그로 설정하여 `AmazonCloudWatch-ManageAgent` Document를 일일 스케줄로 실행한다
C) EventBridge로 EC2 `RunInstances`(또는 ASG launch) 이벤트를 감지해 Lambda가 Run Command로 `AmazonCloudWatch-ManageAgent`를 신규 인스턴스에 실행한다
D) Maintenance Window를 매 30분마다 실행하도록 설정해 태그 대상 인스턴스에 CW Agent 설정 Task를 주기적으로 적용한다

**정답: B**
해설: State Manager Association의 핵심 특성이 "새 Managed Instance가 태그와 일치하는 순간 즉시 실행된다"는 것이다. ASG로 새 인스턴스가 시작되면 Managed Instance로 등록되는 순간 Association이 자동 실행된다. User Data(A)는 AMI 변경 없이 CW Agent 설정을 업데이트하기 어렵고 drift 교정이 안 된다. Lambda(C)도 동작하지만 State Manager보다 복잡하고 drift 교정이 안 된다. Maintenance Window(D)는 스케줄 기반이라 신규 인스턴스가 다음 창 전까지 설정 없이 떠 있고, 30분 주기는 즉시성·drift 교정 측면에서 State Manager의 "태그 일치 즉시 실행 + 지속 강제"에 못 미친다.

---

**문제 3.** 회사의 패치 정책은 다음과 같다: "prod 환경의 Web 서버(Linux)에는 Security 분류의 Critical 패치만, 공개 후 14일이 지난 것만 적용한다. Patch Group 기반으로 관리한다." 이를 구현하기 위한 최소한의 구성 단계를 올바른 순서로 나열하면?

A) Maintenance Window 생성 → Patch Baseline 생성(Security/Critical, 14일) → EC2에 `Patch Group=prod-web` 태그 추가 (Window를 먼저 만들어 일정부터 고정)
B) EC2 태그(`Patch Group=prod-web`) 추가 → Patch Baseline 생성(Security/Critical, 14일) → Patch Baseline을 prod-web 그룹에 연결 → Maintenance Window에 Task 등록
C) Patch Baseline 생성(Security/Critical, 14일) → EC2에 `Patch Group=prod-web` 태그 추가 → Maintenance Window 생성 (Baseline-그룹 연결은 태그만으로 자동 적용)
D) AWS 기본 베이스라인(Security/Critical, 14일 승인)을 그대로 쓰고 Maintenance Window만 설정해 운영 부담을 최소화한다

**정답: B**
해설: 올바른 구성 순서다. (1) EC2에 태그 `Patch Group=prod-web` 추가 (공백 포함 정확한 이름), (2) Custom Patch Baseline 생성 (Security/Critical, ApproveAfterDays=14), (3) `register-patch-baseline-for-patch-group`으로 Baseline과 그룹 연결, (4) Maintenance Window 생성 후 Target과 Task(AWS-RunPatchBaseline) 등록. C는 태그만으로 Custom Baseline이 그룹에 자동 연결되지 않으므로(명시적 `register-patch-baseline-for-patch-group`이 없으면 AWS 기본 베이스라인으로 패치됨) 누락이 발생한다. AWS 기본 베이스라인(D)은 Security/Critical만이라는 분류는 맞지만 승인 대기 기간이 OS별 기본값(보통 7일)이라 14일 요구사항과 다르고 분류 커스터마이즈도 불가하다.

---

**문제 4.** 보안팀이 다음 요구사항을 제시했다. "모든 EC2 접속 세션을 감사 가능하게 보관해야 한다. 접속자의 모든 명령어가 로깅되어야 한다. 포트 22는 보안 그룹에서 허용하지 않는다." 운영팀이 개발자들의 접속 요구도 충족시키면서 이 요구사항을 구현할 수 있는 방법은?

A) AWS CloudShell에서 인스턴스로 간접 접속하고, CloudShell 세션 로그를 CloudWatch Logs로 보내 명령어를 감사한다
B) Session Manager를 활성화하고, Session Preferences에서 S3 버킷과 CloudWatch Logs 그룹을 설정한다. 개발자 IAM 정책에 `ssm:StartSession` 권한을 부여한다
C) 포트 22를 닫은 채 CloudTrail Data Event로 SSH 세션의 모든 명령어를 API 이벤트로 기록하고 S3에 보관한다
D) VPN + Bastion Host를 구성하고 Bastion에 auditd·script 로깅을 붙여 모든 세션 명령어를 S3로 전송한다

**정답: B**
해설: Session Manager가 모든 요구사항을 충족한다. 포트 22 없이 IAM 기반 접속, 세션 입출력 자동 로깅(S3/CloudWatch Logs), KMS 암호화 옵션. CloudTrail(C)은 AWS API 호출을 기록하지 SSH 명령어를 기록하지 않는다. Bastion(D)은 포트 22가 필요하고 세션 로깅을 별도로 구성해야 한다.

---

**문제 5.** 운영자가 실행 중인 Maintenance Window에서 패치 Task가 `Window Duration`을 초과할 것 같다. Cutoff가 1시간으로 설정되어 있다. 현재 Window 종료 30분 전이고, 새로운 Task 실행 요청이 왔다. 어떻게 되는가?

A) 새 Task가 즉시 실행된다. Cutoff는 권고일 뿐 종료 전이라면 새 Task 시작을 막지 않는다
B) 새 Task 실행이 거부된다. Window 종료 30분 전은 Cutoff 시간(종료 1시간 전)을 지났으므로 새 Task를 시작할 수 없다
C) 진행 중·대기 중 Task가 모두 즉시 중단되고, Cutoff를 넘긴 시점이라 Window가 강제 종료된다
D) Window가 Cutoff만큼(1시간) 자동 연장되어 새 Task와 기존 Task를 모두 완료시킨다

**정답: B**
해설: Cutoff=1시간이면 Window 종료 1시간 전부터 새 Task 시작이 차단된다. Window 종료 30분 전은 이미 Cutoff를 지난 시점이므로 새 Task 실행이 거부된다. 현재 진행 중인 Task들은 Cutoff와 무관하게 Window 종료 후에도 완료될 때까지 계속 실행된다. Cutoff의 목적은 "새 Task가 Window 끝에 시작되어 미완료 상태로 끊기는 것"을 방지하는 것이다.

---

**문제 6.** Lambda 함수가 Production RDS에 접근하기 위해 비밀번호가 필요하다. 현재 Lambda 환경변수에 평문 비밀번호가 저장되어 있다. 보안팀이 개선을 요구했다. 90일마다 자동으로 비밀번호가 변경되어야 하고, Lambda 코드 변경 없이 새 비밀번호가 사용되어야 한다. 가장 적합한 솔루션은?

A) Parameter Store SecureString(KMS 암호화)으로 마이그레이션하고, EventBridge 스케줄 + 회전 Lambda로 90일마다 값을 직접 갱신한 뒤 애플리케이션이 API로 조회
B) Secrets Manager로 마이그레이션하고 RDS 자동 회전을 설정. Lambda SDK가 항상 최신 시크릿을 가져오도록 구현
C) KMS Customer Managed Key로 Lambda 환경변수를 암호화하고, 키 회전을 켜서 90일마다 비밀번호가 갱신되게 한다
D) 암호화된 설정 파일을 Lambda Layer에 포함하고, 90일마다 새 Layer 버전을 배포해 비밀번호를 교체한다

**정답: B**
해설: "90일 자동 회전 + Lambda 코드 변경 없이"가 핵심이다. Secrets Manager는 RDS와 통합된 자동 회전을 지원하며, 회전 시 Lambda(회전 함수)가 자동으로 새 비밀번호를 RDS에 설정하고 Secrets Manager를 업데이트한다. 이후 애플리케이션 Lambda는 `get_secret_value()` 호출로 항상 최신 값을 가져온다. Parameter Store(A)는 네이티브 자동 회전이 없어 회전 Lambda를 직접 구축·유지해야 한다. KMS 암호화(C)에서 키 회전은 암호화 키만 교체할 뿐 RDS 비밀번호 값 자체를 바꾸지 않으므로 요구사항을 충족하지 못한다. D의 Layer 재배포는 코드(아티팩트) 재배포라 "코드 변경 없이" 조건에 어긋난다.

---

**문제 7.** 운영팀이 Config Rule을 통해 "공개 S3 버킷"을 감지하고, 감지 즉시 자동으로 버킷의 공개 접근을 차단하려 한다. 어떤 SSM 기능이 가장 적합한가?

A) Run Command — `AWS-RunShellScript`로 AWS CLI를 호출해 위반 버킷의 퍼블릭 액세스를 차단
B) State Manager — Association으로 S3 퍼블릭 차단 설정을 desired state로 지속 강제
C) Automation Runbook (Config Auto Remediation 대상)
D) Session Manager — 세션을 열어 운영자가 위반 버킷을 즉시 수동 차단

**정답: C**
해설: Config Auto Remediation은 비준수 리소스를 발견하면 SSM Automation Document를 실행한다. `AWS-DisableS3BucketPublicReadWrite` 같은 표준 Runbook이 제공된다. Run Command(A)는 EC2 인스턴스 대상이고 S3 버킷을 직접 제어하지 않는다. State Manager(B)는 EC2 설정 관리가 주 목적이다. Automation은 `executeAwsApi` action으로 모든 AWS API를 호출할 수 있어 S3, EC2, IAM 등 다양한 리소스를 제어할 수 있다.

---

**문제 8.** 개발팀이 "설치된 Node.js 버전을 14.x에서 18.x로 전환하는 과정에서, 현재 14.x를 사용하는 prod 서버 목록을 뽑아달라"고 요청했다. 어떤 SSM 기능으로 가장 효율적으로 답할 수 있는가?

A) Run Command로 prod 태그 인스턴스 전체에 `node --version`을 일괄 실행하고, 출력에서 14.x를 grep해 서버 목록을 취합
B) SSM Inventory(`AWS:Application` 데이터)에서 Node.js 버전을 필터링
C) CloudTrail Lake에서 npm·yum install 관련 API 이벤트를 SQL로 검색해 Node.js 14.x 설치 이력을 가진 서버를 역추적
D) Amazon Inspector로 prod 인스턴스를 스캔해 Node.js 14.x 패키지가 탐지된 인스턴스 목록을 추출

**정답: B**
해설: SSM Inventory의 `AWS:Application` 유형은 각 인스턴스에 설치된 소프트웨어 이름과 버전을 주기적으로 수집한다. Resource Data Sync로 S3에 동기화한 후 Athena SQL로 "Node.js 14.x 설치된 prod 인스턴스 목록"을 즉시 쿼리할 수 있다. Run Command(A)도 동작하지만 실시간 일회성 조회이며 결과 취합이 번거롭다. Inventory는 설정 한 번으로 지속적으로 데이터를 수집하므로 이런 조회에 최적이다.

---

**문제 9.** 회사가 Hybrid Activations를 사용해 온프레미스 서버 50대를 SSM으로 관리하고 있다. 이 서버들에 매주 보안 패치를 적용하고 싶다. 어떤 Patch Manager 기능을 사용해야 하며, 온프레미스 서버의 SSM 식별자는 어떤 형식인가?

A) EC2와 같은 i-xxx 형식으로 등록되지만, 온프레미스 서버는 하이퍼바이저 메타데이터가 없어 Patch Manager는 사용 불가하고 Run Command만 된다
B) mi-xxx 형식, EC2와 동일하게 Patch Baseline + Maintenance Window 사용 가능
C) ARN 형식으로 식별되며, Patch Group 태그는 EC2 전용이라 온프레미스에는 Resource Group으로 별도 묶어야 한다
D) 등록된 IP 주소를 식별자로 사용하며, 온프레미스에는 Run Command만 지원되고 Patch Baseline 연결은 불가하다

**정답: B**
해설: Hybrid Activations로 등록된 온프레미스 서버는 `mi-xxxxxxxxxxxxxxxxx` 형식의 ID를 받는다. 이후 EC2와 완전히 동일하게 Patch Manager, Run Command, Session Manager, State Manager를 사용할 수 있다. Patch Group 태그도 동일하게 `Key=Patch Group,Value=onprem-prod`로 설정하고 베이스라인을 연결하면 된다. 50대는 Standard Tier(무료) 범위 내이므로 추가 비용 없이 사용 가능하다.

---

**문제 10.** Maintenance Window에서 패치 Task가 실패했다. Concurrency를 10%, Error Tolerance를 5%로 설정했는데 6%의 인스턴스에서 실패가 발생했다. 어떻게 되는가?

A) Error Tolerance 초과가 감지되면 이미 패치된 인스턴스를 포함해 전체에 자동 롤백이 시작된다
B) 실패한 인스턴스만 이전 패치 상태로 자동 롤백되고, 나머지 인스턴스는 계속 패치가 진행된다
C) Error Tolerance(5%)를 초과했으므로 나머지 인스턴스에 대한 Task 실행이 중단된다. 이미 성공한 인스턴스는 그대로 유지된다
D) 실패율이 임계값에 근접하면 Error Tolerance가 Concurrency(10%)까지 자동 확장되어 실행을 이어간다

**정답: C**
해설: Error Tolerance는 "이 비율 이상 실패하면 나머지 실행을 중단"하는 circuit breaker다. 6%가 실패하면 5% 임계값을 초과하여 나머지 인스턴스에 대한 Task 실행이 즉시 중단된다. 이미 성공적으로 패치된 인스턴스는 그대로 유지되고, 아직 패치되지 않은 인스턴스는 건너뛴다. 자동 롤백 기능은 없으며, 실패 원인을 파악한 후 재실행해야 한다.

---

**문제 11.** Parameter Store의 파라미터 `/myapp/prod/db/password`가 90일 동안 변경되지 않았을 때 자동 알림을 보내고, 이 파라미터가 2027년 1월 1일에 자동으로 삭제되도록 설정하려 한다. 어떤 구성이 필요한가?

A) EventBridge 스케줄로 Lambda를 매일 실행해 파라미터 LastModifiedDate를 검사하고, 90일 초과 시 SNS 알림 + 2027-01-01에 `delete-parameter` 호출
B) Parameter Store Advanced + NoChangeNotification Policy(90일) + Expiration Policy(2027-01-01)
C) Parameter Store Standard에 두고 CloudWatch Events(EventBridge) 규칙으로 변경 미발생·만료를 감지해 알림·삭제를 자동화
D) Secrets Manager로 옮겨 90일 Rotation을 설정하고, 만료일에 시크릿을 삭제하는 lifecycle 정책을 추가한다

**정답: B**
해설: Parameter Policies는 Parameter Store Advanced Tier 전용이다. `NoChangeNotification`은 지정 기간 동안 값이 변경되지 않으면 EventBridge를 통해 알림 이벤트를 발생시킨다. `Expiration`은 지정 날짜에 파라미터를 자동으로 삭제한다. 두 Policy를 하나의 파라미터에 동시에 적용할 수 있다. Standard Tier(C)는 Policy를 지원하지 않는다.

---

**문제 12.** 다음 중 Session Manager가 기존 SSH/Bastion 방식보다 우수한 이유로 올바르지 않은 것은?

A) 포트 22를 열지 않아도 되고, 인바운드 SG 규칙 없이 아웃바운드 443만으로 접속해 공격 표면을 줄인다
B) IAM 기반 접근 제어로 태그·MFA·시간 조건까지 거는 세밀한 권한 부여가 가능하다
C) 모든 세션 입출력이 자동으로 S3/CloudWatch Logs에 기록되어 감사 추적을 별도 구성 없이 확보한다
D) SSH 키보다 더 강력한 암호화 알고리즘을 사용한다

**정답: D**
해설: SSH는 이미 강력한 암호화(RSA 4096, ED25519 등)를 사용한다. Session Manager가 SSH보다 "더 강력한 암호화"를 사용한다는 주장은 올바르지 않다. Session Manager는 AWS KMS 기반 암호화를 사용하지만 이것이 SSH 암호화보다 더 강력하다는 의미는 아니다. Session Manager의 진짜 장점은 A(포트 불필요), B(IAM 세밀한 제어), C(자동 감사 로깅), 그리고 SSH 키 분배 부담 제거, MFA 강제 용이성이다.

---

> 📚 **사례**: 2023년, 중견 물류 기업 E사가 SSM 전면 도입 1년 후 운영 지표를 공개했다. 패치 관련 보안 사고 0건, 운영자의 주간 수작업 시간 65% 감소, 새 서버 온보딩 시간 8시간→15분, 컴플라이언스 감사 준비 기간 3주→2일. 이 숫자들이 SSM이 제공하는 "운영 자동화의 가치"를 가장 잘 보여준다. SOA-C02 시험이 SSM 비중을 높게 가져가는 이유다.

## Week 6 Preview

Week 6 focuses on **IaC Operations**, centered on CloudFormation.

- Day 1: CloudFormation Fundamentals — Template structure, Stack lifecycle, cfn-signal
- Day 2: Change Set, Drift Detection, Rollback Trigger — safe CFn operation patterns
- Day 3: Nested Stack, Cross-Stack Reference, StackSets — large-scale multi-account IaC
- Day 4: Service Catalog, AppConfig, AppRegistry — self-service provisioning
- Day 5: Week 6 Review + 10 scenario questions

CloudFormation is the core of SOA-C02's "deployment, provisioning, automation" domain. Drift Detection, Change Set, StackSets appear frequently. If Week 5's SSM Automation is "instance-level automation," CloudFormation is "infrastructure-level automation." Combined, they form complete operational automation stack.
