# Day 5 - Week 9 종합 복습, 키워드가 답을 가리키는 법

한 주 동안 KMS의 키 격리부터 GuardDuty·Inspector·Macie·Security Hub의 탐지 분담까지 보안과 암호화의 전체 지형을 훑었다. 시험에서 이 영역의 문제는 거의 항상 **"시나리오 속 한두 개의 키워드가 정답을 가리키는"** 구조다. "리전을 넘어 복호화"라는 말이 나오면 Multi-Region Key고, "자동 회전"이 나오면 Secrets Manager고, "에이전트 없이 위협 탐지"가 나오면 GuardDuty다. 이 글은 그 키워드-정답 매핑을 한 번에 굳히는 복습이다.

복습의 핵심은 단순 암기가 아니라 **왜 그 답인지의 이유를 함께 쥐는 것**이다. KMS가 4KB만 처리하는 건 마스터 키를 대량 데이터에 노출시키지 않으려는 Envelope Encryption 강제 때문이고, Key Policy가 IAM보다 우선하는 건 키 하나가 뚫려도 전체가 노출되지 않게 하려는 폭발 반경 제한 때문이다. 이유를 알면 처음 보는 변형 문제도 풀린다. 아래 한 줄 요약과 비교표로 뼈대를 세우고, 시나리오 12문제로 살을 붙인다.

## Week 9 핵심 개념 한 줄 요약

1. **KMS 키 종류** — AWS Owned(무료, 보이지 않음) / AWS Managed(`aws/` 접두사, 강제 회전) / Customer Managed($1/월, 정책·회전 제어). 키 원본은 절대 다운로드 불가.
2. **Envelope Encryption** — KMS 4KB 한도 우회. GenerateDataKey로 DEK 받아 로컬 암호화, 암호화된 DEK만 데이터와 함께 저장. Plaintext DEK는 메모리에서만.
3. **Key Policy가 1순위** — IAM에 `kms:*`가 있어도 Key Policy가 위임하지 않으면 거부. 기본 정책의 `root` 위임 줄을 지우면 키가 잠긴다.
4. **키 회전** — 자동 회전은 backing key만 추가하고 Key ID는 불변. 손상 대응책이 아니라 사전 예방이다.
5. **키 삭제** — 7~30일 대기 강제. 영구 복호화 불가 위험. 먼저 disable로 리허설.
6. **Multi-Region Key** — Cross-Region 복호화의 유일한 길. Global Table·S3 CRR(SSE-KMS)에 필요.
7. **Encryption Context** — AAD로 작동. 암복호화 시 정확히 일치해야 함. 권한 맞는데 복호화 실패 시 1순위 의심.
8. **Secrets Manager vs Parameter Store** — 자동 회전 + Cross-Region은 Secrets Manager만. Parameter Store는 일반 설정·무료.
9. **IAM Access Analyzer** — Zone of Trust 외부 노출 자동 탐지 + CloudTrail 90일로 최소 권한 정책 생성.
10. **GuardDuty(행동/위협) + Inspector(소프트웨어/취약점) + Macie(데이터/민감정보) + Security Hub(통합/표준)** — 네 도구의 보는 층위가 다르다.
11. **CloudHSM** — 단독 HSM, FIPS 140-2 L3, AWS도 키 접근 불가. 규제가 강제할 때만.
12. **자동 대응 골격** — 보안 도구 → EventBridge → Lambda/SSM Automation. 폴링은 오답.

> 💡 **관련 이론**: 이 12개 개념을 관통하는 한 가지 사상은 **"심층 방어(Defense in Depth)"**다. 단일 통제에 의존하지 않고 여러 겹의 독립적 방어선을 쌓아, 한 겹이 뚫려도 다음 겹이 막는 군사 전략에서 온 개념이다. KMS의 Key Policy(IAM이 뚫려도 키는 별도 방어선), Envelope Encryption(마스터 키 노출 최소화), 삭제 대기 기간(실수에 브레이크), 네 탐지 도구의 층위 분담(행동·소프트웨어·데이터·구성을 각각 감시)이 모두 이 사상의 구현이다. 시험에서 "가장 안전한 구성"을 고르라는 문제는 대개 "겹을 하나 더 쌓는" 선택지가 정답이다.

## 헷갈리기 쉬운 비교표

### KMS vs CloudHSM

| 항목 | KMS | CloudHSM |
|---|---|---|
| HSM 점유 | 멀티테넌트(AWS 운영) | 단독(고객 임대) |
| FIPS 140-2 | 모듈 L3, 서비스 맥락 L2 | L3(단독) |
| 키 통제 | AWS 운영, 고객은 정책 제어 | 고객 100%, AWS도 접근 불가 |
| 비용 | $1/월/키 + API | 시간당 $1.45+ 상시 |
| 키 복구 | Support 한도 내 | 분실 시 영구 손실 |
| 사용 사례 | 대부분의 워크로드 | 규제가 단독 HSM 강제 시 |

### Parameter Store vs Secrets Manager

| 항목 | Parameter Store | Secrets Manager |
|---|---|---|
| 비용 | Standard 무료 / Advanced 저렴 | $0.40/시크릿/월 + API |
| 자동 회전 | ❌ | ✅ (RDS는 AWS 제공 Lambda) |
| Cross-Region 복제 | ❌ | ✅ |
| 최대 크기 | Standard 4KB / Advanced 8KB | 64KB |
| 사용 사례 | 일반 설정값·평문 파라미터 | DB 자격증명·회전 필요 시크릿 |

### 탐지 4종 도구

| 항목 | GuardDuty | Inspector v2 | Macie | Security Hub |
|---|---|---|---|---|
| 보는 층위 | 행동(위협) | 소프트웨어(취약점) | 데이터(민감정보) | 통합·표준 |
| 대상 | 계정 활동 전반 | EC2/ECR/Lambda | S3 객체 본문 | 모든 finding |
| 에이전트 | ❌(Runtime만 ✅) | SSM Agent | ❌ | ❌ |
| 데이터 소스 | Flow Logs/CloudTrail/DNS | OS 패키지/이미지/코드 | S3 객체 내용 | ASFF finding |
| 과금 기준 | 분석 이벤트량 | 스캔 리소스 수 | 스캔 데이터 바이트 | finding 수 |

> 🔍 **더 깊이**: 비교표를 외울 때 "왜 이 차이가 생기는가"를 붙이면 변형 문제에 강해진다. 예로 Secrets Manager만 자동 회전을 지원하는 건 그것이 회전을 위한 4단계 lifecycle(createSecret → setSecret → testSecret → finishSecret)을 Lambda로 오케스트레이션하도록 설계됐기 때문이고, Parameter Store는 단순 키-값 저장소라 그 오케스트레이션 개념 자체가 없다. Macie만 데이터 바이트로 과금하는 건 유일하게 객체 본문을 읽기 때문이고(나머지는 메타데이터만 봄), 그래서 대용량 스캔 비용 통제가 Macie 특유의 시험 포인트가 된다.

> ⚠️ **함정**: 비교표에서 가장 자주 틀리는 두 지점. 첫째, "DB 비밀번호를 무료로 자동 회전"은 모순 선택지다 — 자동 회전은 Secrets Manager($0.40/월)만 가능하므로 "무료(Parameter Store)"와 "자동 회전"이 한 선택지에 같이 있으면 오답이다. 둘째, "GuardDuty로 OS 취약점 스캔" 또는 "Inspector로 악성 도메인 통신 탐지"처럼 도구의 층위를 바꿔치기한 선택지. GuardDuty는 행동을, Inspector는 소프트웨어 약점을 본다 — 이 경계를 흐리는 선택지가 단골 오답이다.

## 시나리오 12문제

**문제 1.** IAM 사용자에게 `kms:*` 권한이 있는데도 특정 KMS 키 사용이 `AccessDenied`로 거부된다. 가장 가능성 높은 원인은?

A) IAM 정책에 MFA 조건(`aws:MultiFactorAuthPresent`)이 걸려 있는데 세션에 MFA가 없어서 거부됨
B) Key Policy가 해당 계정/주체에게 사용을 위임하지 않음 — KMS는 Key Policy(resource-based)가 IAM보다 우선
C) 키가 다른 리전에 있어 엔드포인트 불일치로 키를 찾지 못함 — 리전 간 키는 호출이 자동 라우팅되지 않음
D) `kms:RequestAlias` 한도나 초당 API 호출 한도를 초과해 ThrottlingException으로 차단됨

**정답: B**

해설: KMS의 가장 큰 특이점이다. 모든 키에는 Key Policy가 필수이고, Key Policy가 명시적으로 허용하거나 IAM에 위임(`Principal: arn:aws:iam::account:root`)하지 않으면 IAM 권한이 아무리 넓어도 거부된다. 이는 키 하나가 뚫려도 폭발 반경을 제한하려는 설계다. 기본 Key Policy에 있는 root 위임 줄이 빠지면 IAM은 무력해진다.

---

**문제 2.** 1GB 로그 파일을 KMS로 직접 암호화하려다 4KB 한도 에러가 났다. 표준 해결책은?

A) 파일을 4KB 단위로 분할해 각 조각을 개별 Encrypt API로 호출하고 결과를 다시 이어붙임
B) Envelope Encryption — GenerateDataKey로 DEK를 받아 로컬에서 파일을 암호화하고, 암호화된 DEK를 데이터와 함께 저장
C) KMS 대신 CloudHSM 클러스터에 1GB를 직접 보내 단일 호출로 암호화하도록 위임
D) S3 버킷 정책에 SSE 강제 규칙을 추가해 4KB 한도를 우회하도록 설정

**정답: B**

해설: KMS의 4KB 제한은 의도된 설계다. 마스터 키로 대량 데이터를 직접 암호화하면 네트워크 병목, HSM 처리량 한계, 암호 분석 표면 확대가 생긴다. Envelope Encryption은 일회성 DEK로 큰 데이터를 로컬에서 빠르게 암호화하고, 짧은 DEK만 마스터 키로 봉인해 함께 저장한다. Plaintext DEK는 사용 직후 메모리에서 폐기해야 한다. S3 SSE-KMS, EBS, RDS 암호화가 모두 내부적으로 이 패턴을 쓴다.

---

**문제 3.** RDS MySQL의 마스터 비밀번호를 30일마다 자동 회전하되, 회전 Lambda를 직접 작성하지 않으려 한다. 가장 적합한 구성은?

A) Parameter Store SecureString에 저장하고 EventBridge 스케줄로 매월 Lambda가 비밀번호를 폴링·갱신
B) Secrets Manager + AWS 제공 RDS Rotation Lambda(블루프린트)로 자동 회전
C) 직접 작성한 Lambda를 cron으로 매월 띄워 RDS 비밀번호를 ALTER USER로 갱신
D) KMS 자동 키 회전(연 1회 backing key 교체)을 켜 비밀번호가 함께 바뀌도록 설정

**정답: B**

해설: Parameter Store는 자동 회전을 지원하지 않는다. Secrets Manager는 회전을 위한 4단계 lifecycle을 오케스트레이션하며, RDS·Redshift·DocumentDB 등에는 AWS가 제공하는 회전 Lambda 블루프린트가 있어 직접 코드를 작성할 필요가 없다. D의 KMS 키 회전은 암호화 키를 갈 뿐 비밀번호 자체를 바꾸지 않으므로 무관하다. "자동 회전 + Lambda 직접 작성 불필요" = Secrets Manager + AWS 제공 Lambda.

---

**문제 4.** Secrets Manager가 RDS 비밀번호를 회전하는 동안 실행 중인 애플리케이션이 인증 실패 없이 동작해야 한다. 이를 가능하게 하는 메커니즘은?

A) 회전 중 DB를 잠시 읽기 전용으로 전환
B) 4단계 회전(createSecret→setSecret→testSecret→finishSecret) 중 새 비밀번호를 먼저 만들어 DB에 설정·검증한 뒤에야 AWSCURRENT 레이블을 옮겨 무중단 전환
C) 애플리케이션을 회전 시각에 맞춰 재시작
D) 비밀번호를 두 개 동시에 사용

**정답: B**

해설: Secrets Manager의 무중단 회전은 staging label(AWSCURRENT/AWSPENDING)과 4단계 lifecycle로 구현된다. 새 비밀번호를 AWSPENDING으로 생성(createSecret)하고, DB에 실제 설정(setSecret)하고, 새 비밀번호로 연결이 되는지 검증(testSecret)한 뒤에야 AWSPENDING→AWSCURRENT로 레이블을 이동(finishSecret)한다. 검증이 끝난 다음에 현재 비밀번호가 교체되므로 애플리케이션은 항상 유효한 자격증명을 받는다. DB 정지나 앱 재시작은 불필요하다.

---

**문제 5.** 서울 리전에서 운영 중인 데이터를 도쿄 리전으로 S3 Cross-Region Replication하려는데, 원본 객체가 SSE-KMS로 암호화돼 있다. 도착지에서 복호화가 가능하려면?

A) 서울 리전의 일반 KMS 키를 도쿄에서 그대로 사용
B) Multi-Region Key — Primary(서울)와 replica(도쿄)가 같은 키 식별자·backing material을 공유해 양쪽에서 복호화 가능
C) 도쿄에 무관한 새 KMS 키를 만들고 복제 비활성화
D) CloudHSM 단독 클러스터로 전환

**정답: B**

해설: 일반 KMS 키는 리전 종속이라 서울 키로 암호화한 객체를 도쿄 키로 복호화할 수 없다(키 ARN에 리전이 박혀 있고 backing material이 그 리전 HSM에만 있음). Multi-Region Key는 이 격리의 유일한 예외로, Primary와 replica가 같은 키 식별자(`mrk-`)와 backing material을 공유해 Cross-Region 복호화를 가능하게 한다. Global DynamoDB Table, S3 CRR(SSE-KMS)이 대표 사용 사례다.

---

**문제 6.** 운영자가 KMS 키를 더 이상 안 쓴다고 판단해 삭제하려 한다. 데이터 영구 손실 위험을 최소화하는 절차는?

A) `schedule-key-deletion`으로 즉시 삭제 예약
B) 먼저 키를 disable해 며칠~몇 주 운영하며 CloudWatch로 복호화 시도가 없음을 확인한 뒤 삭제 예약
C) Key Policy에서 모든 권한 제거
D) 연결된 alias만 삭제

**정답: B**

해설: 키 삭제는 비가역적이고, 그 키로 암호화된 모든 데이터(백업 포함)가 영구 복호화 불가가 된다. KMS가 7~30일 대기를 강제하는 것도 이 위험 때문이다. 안전한 절차는 먼저 키를 disable(즉시 되돌릴 수 있음)해 운영하면서 복호화 시도를 모니터링하고, 일정 기간 문제가 없으면 그때 삭제를 예약하는 것이다. disable은 무료 리허설 역할을 하며, 대기 기간 중에는 `cancel-key-deletion`으로 되돌릴 수 있다.

---

**문제 7.** 권한·키 상태·리전이 모두 정상인데도 특정 암호문의 복호화가 계속 `InvalidCiphertext`로 실패한다. 권한 외에 1순위로 의심할 원인은?

A) 키 회전이 진행 중이라 일시적으로 막힘
B) 암호화 시 사용한 Encryption Context와 복호화 시 제시한 context가 일치하지 않음
C) Multi-Region Key가 아니라서
D) DEK가 만료됨

**정답: B**

해설: Encryption Context는 암호화 시 함께 전달하는 키-값 쌍으로 추가 인증 데이터(AAD)로 작동한다. 복호화 시 정확히 같은 context를 제시해야만 성공하고, 한 글자라도 다르면 권한이 완벽해도 거부된다. S3 SSE-KMS는 객체 ARN을 context로 자동 사용해 암호문을 다른 위치로 옮겨 복호화하려는 시도를 막는다. 키 회전(A)은 backing key 식별자가 데이터에 기록돼 자동으로 옛 키를 찾으므로 복호화를 막지 않는다.

---

**문제 8.** EC2 인스턴스가 알려진 C&C 서버 도메인과 통신하는 정황을 에이전트 설치 없이 자동 탐지하려 한다. 어떤 도구이며 그 근거는?

A) Inspector — OS 취약점을 스캔하므로
B) GuardDuty — VPC Flow Logs·CloudTrail·DNS Logs를 분석해 Threat Intel 기반으로 `Backdoor:EC2/C&CActivity.B!DNS` finding을 자동 발행
C) Macie — S3 데이터를 스캔하므로
D) Config — 구성 변경을 추적하므로

**정답: B**

해설: GuardDuty는 에이전트 없이 AWS 내부 메타데이터 스트림(Flow Logs/CloudTrail/DNS)을 분석한다. C&C 서버 통신은 DNS Logs를 Threat Intelligence DB와 대조해 잡는 대표적 finding이다. Inspector는 소프트웨어 취약점(행동이 아닌 약점)을, Macie는 데이터 내용을 보는 도구라 층위가 다르다. 단 인스턴스가 외부 DNS를 쓰면 Route 53 Resolver를 안 거쳐 사각지대가 생기므로 DNS Firewall로 보완한다.

---

**문제 9.** Inspector v2를 ECR에 켜둔 지 한 달째다. 지난주 깨끗하게 스캔된 이미지에서 오늘 Critical finding이 떴고, 그 사이 이미지는 변경되지 않았다. 올바른 해석은?

A) 이미지가 변조됐다는 신호다
B) 새 CVE가 NVD에 공개되어 Inspector v2의 지속 스캔이 기존 이미지를 자동 재평가했다 — 정상 동작
C) Inspector 버그이므로 finding을 무시한다
D) 이미지를 다시 푸시해야 finding이 사라진다

**정답: B**

해설: Inspector v2는 한 번 스캔으로 끝나지 않고 새 CVE가 공개되면 기존 EC2·ECR·Lambda를 자동 재평가하는 지속 스캔이다. 이미지가 그대로여도 새로 알려진 취약점 때문에 finding이 뜰 수 있고, 이는 의도된 동작이다. Log4Shell(CVE-2021-44228) 사태 때 이 지속 스캔이 취약 버전을 자동 목록화해 가치를 증명했다. 변조 신호(A)도, 버그(C)도 아니다.

---

**문제 10.** 80TB 규모 S3 데이터 레이크에서 신용카드·SSN 노출 위험 버킷을 찾되 스캔 비용을 통제해야 한다. 가장 적절한 접근은?

A) Macie로 80TB 전체를 한 번에 정밀 스캔
B) Macie 자동 민감 데이터 발견(표본 추출)으로 위험 버킷 지도를 저비용으로 그린 뒤, 고위험 버킷만 정밀 분류 작업 실행
C) GuardDuty로 S3 버킷 스캔
D) Inspector로 S3 객체 스캔

**정답: B**

해설: Macie는 유일하게 객체 본문을 읽기 때문에 스캔 데이터 바이트로 과금한다 — 80TB 전체 정밀 스캔은 비용 폭탄이다. 자동 민감 데이터 발견은 객체를 지능적으로 표본 추출해 "어느 버킷이 위험한지" 지도를 저비용으로 만든다. 그 뒤 고위험 버킷만 정밀 classification job을 돌리면 비용을 통제하면서 위험을 잡는다. Macie의 탐지 정확도는 Luhn 알고리즘 같은 체크섬으로 거짓 양성을 줄이는 데서 온다. GuardDuty·Inspector는 S3 본문 민감 데이터를 보지 않는다.

---

**문제 11.** 회사가 모든 멤버 계정의 GuardDuty·Inspector·Macie·Access Analyzer·서드파티 finding을 한 화면에서 동일 형식으로 보고, 동시에 CIS·PCI-DSS 표준 충족 여부를 자동 채점하려 한다. 어떤 서비스이며 전제 조건은?

A) CloudWatch Dashboard
B) Security Hub — ASFF로 finding을 정규화 통합하고 보안 표준을 자동 평가. 표준 평가는 Config Rule 기반이라 AWS Config 활성화가 전제
C) Audit Manager
D) Config 단독

**정답: B**

해설: Security Hub는 스스로 탐지하지 않고 여러 도구의 finding을 ASFF(AWS Security Finding Format) 표준 스키마로 정규화해 한 화면에 모은다. 동시에 FSBP·CIS·PCI-DSS·NIST 800-53을 Config Rule 기반으로 자동 채점하므로, 표준 점검이 채워지려면 Config가 활성화돼 있어야 한다. Organizations 통합 시 Delegated Administrator(보통 Audit 계정)로 모든 계정을, Cross-Region Aggregation으로 여러 리전을 한 곳에 모은다.

---

**문제 12.** GuardDuty가 severity 8.2의 침해 의심 인스턴스를 탐지했다. 사람 개입 없이 즉시 격리 SG로 교체하는 자동 대응을 구성하려 한다. AWS 권장 표준 흐름은?

A) Lambda가 1분마다 GuardDuty를 폴링해 finding 확인
B) GuardDuty Finding → EventBridge Rule(severity 7.0 이상 필터) → SSM Automation Runbook `AWS-IsolateEC2InstanceFromGuardDutyFinding`(또는 Lambda)이 격리 SG로 교체
C) Config Rule이 인스턴스를 자동 종료
D) Inspector가 인스턴스를 자동 패치

**정답: B**

해설: AWS 보안 자동 대응의 표준 골격은 "보안 도구 → EventBridge → SSM Automation/Lambda"다. GuardDuty는 finding을 EventBridge로 발행하고, severity(0.1~8.9 척도, 7.0 이상이 High)로 필터링한 규칙이 SSM Automation Runbook을 트리거해 인스턴스 SG를 격리 SG로 교체한다. AWS는 이 용도의 표준 Runbook을 제공한다. 폴링(A)은 실시간성이 떨어지고 AWS의 권장 이벤트 구동 패턴이 아니다. Config Rule 종료(C)·Inspector 패치(D)는 이 시나리오의 도구가 아니다.

---

## 🔮 다음 주 예고 (Week 10)

Week 10은 **백업·DR 운영** — Snapshot, AWS Backup, Multi-AZ, Cross-Region이다.

- Day 1: EBS Snapshot, AMI, DLM(Data Lifecycle Manager)
- Day 2: AWS Backup — Plan, Vault, Cross-Region/Cross-Account
- Day 3: RDS Multi-AZ vs Read Replica, Aurora Global DB
- Day 4: S3 복제(CRR/SRR), Storage Gateway, Elastic Disaster Recovery
- Day 5: Week 10 복습 + 시나리오 10문제

> 💡 안정성·BCP(16%) 도메인의 핵심이다. RTO/RPO 시나리오가 빈출하며, "복구 목표 시간 vs 복구 목표 시점"의 트레이드오프가 단골 출제 포인트다.
