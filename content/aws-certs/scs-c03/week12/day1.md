# Day 1 - 도메인 1·2 통합 복습: 위협 탐지·인시던트 대응 ↔ 로깅·모니터링

시험의 6개 도메인 중 가장 무겁게 출제되는 두 축이 도메인 1(위협 탐지·인시던트 대응, ~14%)과 도메인 2(보안 로깅·모니터링, ~18%)다. 둘은 시험에서 거의 항상 *한 흐름*으로 묻는다. "로그가 있어야 탐지하고, 탐지가 있어야 대응한다." 오늘은 이 파이프라인 — **수집(로그) → 분석·탐지(GuardDuty/Detective/Macie) → 집약(Security Hub) → 자동 대응(EventBridge→Lambda/SSM)** — 을 하나의 신경계로 묶어 복습한다.

복습 주차의 사용법을 먼저 정하자. 오늘 이후 다섯 날은 **새 개념을 배우는 자리가 아니다.** week1~11에서 각각 깊게 판 것을 *한 판단 체계*로 꿰는 자리다. 그래서 읽는 방식이 달라야 한다 — 설명을 다시 읽어 이해하는 게 아니라, **표를 덮고 스스로 복원할 수 있는지**를 확인하며 지나가야 한다. 복원되지 않는 칸이 나오면 그 칸만 원래 주차로 돌아가 다시 본다. 복습에서 시간을 잃는 가장 흔한 방식이 "아는 것을 다시 읽으며 안심하는 것"이다.

## 두 도메인이 시험에서 결합되는 방식

도메인 1과 2는 별개 문항으로 나오는 경우가 오히려 드물다. 전형적 결합 형태를 먼저 알아 두면 지문의 절반은 읽기 전에 예측된다.

| 결합 형태 | 지문의 모양 | 답이 놓이는 자리 |
|---|---|---|
| 증거 부재형 | "조사하려는데 필요한 기록이 없다" | *어떤 로그를 켰어야 했나* — 데이터 이벤트·Flow Logs·DNS 로그·Config |
| 탐지기 선택형 | "이것을 발견하려면" | GuardDuty / Inspector / Macie / Access Analyzer 중 하나 |
| 조사 심화형 | "범위·근본 원인을 알고 싶다" | Detective + CloudTrail(Athena/Lake) |
| 집계형 | "여러 계정·여러 도구의 결과를 한곳에서" | Security Hub 위임 관리자 + 집계 리전 |
| 자동 대응형 | "사람 개입 없이 즉시" | EventBridge → Lambda / SSM Automation |
| 순서형 | "가장 먼저 무엇을 하는가" | 가역성·증거 보존 우선 원칙 |
| 무결성형 | "로그를 지우거나 끄지 못하게" | 조직 trail + SCP Deny + Log Archive 계정 + Object Lock |

이 일곱 중 어느 형태인지 판별되면 후보 서비스가 서너 개로 줄어든다. 오늘의 목표는 이 판별을 반사적으로 만드는 것이다.

## 로깅 계층: 무엇이 어디에 기록되는가

탐지의 원천은 로그다. 시험은 "이 증거를 보려면 어떤 로그를 켜야 하는가"를 끊임없이 묻는다.

| 무엇을 알고 싶은가 | 로그 소스 | 위치/특이점 |
|-------------------|-----------|-------------|
| 누가 어떤 API를 호출했나 | CloudTrail (관리 이벤트) | 기본 ON, 콘솔 이벤트 히스토리는 최근 90일. 영구 보존은 S3 |
| S3 객체·Lambda 데이터 접근 | CloudTrail **데이터 이벤트** | 명시적 활성화·과금. 객체 GET/PUT 추적 |
| API 호출량·오류율의 이상 | CloudTrail **Insights 이벤트** | 별도 활성화·과금. 평소 대비 급증 탐지 |
| VPC 내 IP 흐름(허용/거부) | VPC Flow Logs | ENI/Subnet/VPC 단위. 페이로드 없음 |
| 패킷 내용 자체 | VPC Traffic Mirroring | Nitro 기반. 페이로드까지 복제 |
| DNS 질의 내용 | Route 53 Resolver query log | 도메인 exfiltration 탐지 |
| HTTP 요청·차단 | WAF 로그 | `aws-waf-logs-` 접두사 필수 |
| 누가 어떤 객체를 읽었나(저비용) | S3 서버 액세스 로그 | best-effort·지연. 감사 증거로는 데이터 이벤트가 우위 |
| OS·앱 내부 동작 | CloudWatch Logs (agent) | 인스턴스 내부 가시성 |
| 컨테이너·노드 런타임 행위 | GuardDuty Runtime Monitoring / EKS 감사 로그 | 프로세스·파일 수준 |
| 설정 변경 이력·준수 | AWS Config | 리소스 타임라인·규칙 평가 |
| 로드밸런서 요청 | ALB/NLB 액세스 로그 | S3 저장. 클라이언트 IP·응답 코드 |

> 💡 **관련 이론**: CloudTrail은 *제어 평면(누가 무엇을 설정·호출)*을, VPC Flow Logs는 *데이터 평면(트래픽 흐름)*을, CloudWatch Logs는 *호스트 내부*를 본다. 이 셋은 겹치지 않고 보완한다. 시험에서 "EC2가 외부로 데이터를 빼냈는지" → Flow Logs(+DNS query log), "누가 보안 그룹을 열었는지" → CloudTrail, "프로세스가 무엇을 했는지" → CloudWatch agent. 소스를 혼동하면 오답이다.

핵심 함정: **CloudTrail 관리 이벤트는 S3 GetObject를 기록하지 않는다.** 객체 수준 접근은 *데이터 이벤트*를 따로 켜야 한다. organization trail로 다계정을 단일 S3 버킷에 모으고, log file validation(SHA-256 digest)으로 변조를 탐지하며, SSE-KMS로 암호화한다.

### 로그 소스 선택 결정 트리

지문이 "이 사실을 알고 싶다"고 말할 때, 어느 축을 먼저 보는지가 속도를 만든다.

```
"무엇을 알고 싶은가?"
   │
   ├─ 누가 무엇을 "호출"했나 ─────────────► CloudTrail
   │     ├─ 리소스 설정·API 호출 ────────►   관리 이벤트 (기본 ON)
   │     ├─ S3 객체 / Lambda Invoke ────►   데이터 이벤트 (별도 ON·과금) ★함정
   │     └─ 평소와 다른 호출량·오류율 ──►   Insights 이벤트 (별도 ON)
   │
   ├─ 어떤 트래픽이 오갔나 ───────────────► 네트워크 로그
   │     ├─ IP·포트·허용/거부(메타) ────►   VPC Flow Logs  (페이로드 없음)
   │     ├─ 어떤 도메인을 물었나 ────────►   Route 53 Resolver query log
   │     ├─ 실제 패킷 내용 ──────────────►   Traffic Mirroring
   │     └─ HTTP 요청·차단 사유 ─────────►   WAF 로그
   │
   ├─ 리소스가 "어떤 상태"였나 ───────────► AWS Config (구성 항목 타임라인)
   │
   ├─ 호스트 안에서 무슨 일이 있었나 ─────► CloudWatch agent / GuardDuty Runtime Monitoring
   │
   └─ 데이터 자체가 민감한가 ─────────────► Macie
```

핵심 분업을 한 줄로: **CloudTrail = "누가 호출했나", Config = "그때 어떤 상태였나", Flow Logs = "어디로 흘렀나".** 조사는 대개 이 셋을 붙여서 한다 — Config로 *언제 변했는지*를 찾고, 그 시각을 축으로 CloudTrail에서 *누가 했는지*를 찾고, Flow Logs로 *그래서 어디로 나갔는지*를 확인한다.

### CloudTrail을 다루는 네 가지 축

week7에서 판 것을 시험 답안 형태로 압축하면 네 축이다.

| 축 | 무엇을 정하나 | 시험에서 묻는 형태 |
|---|---|---|
| **범위** | 단일 계정 trail vs **organization trail** | "모든 계정의 활동을 중앙에" → organization trail (신규 계정 자동 포함) |
| **깊이** | 관리 / 데이터 / Insights 이벤트 | "객체가 읽혔는지" → 데이터 이벤트 |
| **무결성** | log file validation(SHA-256 digest), SSE-KMS, S3 Object Lock, 별도 Log Archive 계정 | "변조 불가·삭제 불가" → 이 넷의 조합 |
| **질의** | S3+Athena / CloudWatch Logs 메트릭 필터 / **CloudTrail Lake** | "실시간 경보" → CloudWatch Logs 메트릭 필터+알람, "대량 SQL 조사" → Athena·Lake |

> 🔍 **더 깊이**: 이 네 축이 서로 독립이라는 점이 중요하다. organization trail을 켰다고 데이터 이벤트가 켜지는 게 아니고, S3에 저장한다고 무결성이 보장되는 게 아니며, 로그가 있다고 실시간 경보가 생기는 것도 아니다. 시험 보기는 정확히 이 독립성을 찌른다 — "조직 trail을 켰는데 객체 접근이 안 보인다"(깊이 누락), "로그는 있는데 관리자가 지웠다"(무결성 누락), "기록은 남았는데 아무도 몰랐다"(질의·경보 누락). *한 축을 켠 것으로 다른 축이 해결됐다고 말하는 보기*는 거의 항상 오답이다. 반대로 정답 보기는 대개 네 축 중 요구된 것들을 **동시에** 언급한다.

여기서 실시간성의 차이도 답을 가른다. **CloudTrail → S3 → Athena**는 조사용이지 경보용이 아니다(전달 지연이 있고 질의는 사람이 돌린다). 실시간 경보가 요구되면 **CloudTrail → CloudWatch Logs → 메트릭 필터 → 알람 → SNS** 경로이거나, 이벤트 기반이면 **EventBridge 규칙**이다. "루트 로그인이 발생하면 즉시 알림"류 요구는 이 경로를 묻는 것이다.

## 탐지 계층: 로그를 위협으로 번역

- **GuardDuty**: CloudTrail·VPC Flow Logs·DNS 로그(+EKS/S3/Malware/RDS/Lambda 보호)를 ML·위협 인텔로 분석해 *finding* 생성. **로그를 직접 켤 필요 없이** 내부적으로 소비한다 — 끄지 말 것.
- **Macie**: S3의 PII·민감 데이터를 자동 분류·발견. "S3에 신용카드 번호가 있는가" → Macie.
- **Detective**: GuardDuty finding의 *근본 원인·범위*를 그래프로 조사(behavior graph). "왜·얼마나 퍼졌나".
- **Inspector**: EC2/ECR/Lambda의 *취약점(CVE)·네트워크 노출* 스캔. 사람 개입 없이 지속 평가.
- **Access Analyzer**: 리소스 정책이 외부·교차 계정에 노출됐는지 분석.

> 🎯 **통합 시나리오 A**: "GuardDuty가 `UnauthorizedAccess:EC2/MaliciousIPCaller`를 올렸다. 이 인스턴스가 무엇을 했고 다른 자원으로 번졌는지 조사하고 싶다." 답: **Detective**로 finding을 pivot해 행위 그래프(연결된 IP·API·계정)를 보고, 원천 로그는 CloudTrail/Flow Logs로 교차 확인. GuardDuty는 *무엇이 일어났나*, Detective는 *왜·얼마나*를 답한다.

### 헷갈리는 짝: 탐지 서비스 6종 대조

이 표가 도메인 1의 절반이다. 각 서비스가 **답하는 질문**으로 외우면 보기에서 이름만 바꾼 오답에 흔들리지 않는다.

| 서비스 | 답하는 질문 | 입력 | 출력 | 대표 오답으로 쓰이는 자리 |
|---|---|---|---|---|
| **GuardDuty** | "지금 위협 *행위*가 벌어지는가" | CloudTrail·Flow Logs·DNS(내부 소비)+옵션 보호 | 위협 finding | 취약점 스캔 자리에 잘못 배치 |
| **Inspector** | "악용 가능한 *취약점*이 남아 있나" | EC2·ECR·Lambda | CVE·네트워크 도달성 | 침해 대응 도구인 척 |
| **Macie** | "어떤 *데이터*가 민감하고 어디 있나" | S3 객체 | 민감 데이터 분류 finding | 위협 탐지 자리에 잘못 배치 |
| **Detective** | "이 엔티티들이 어떻게 *연결*됐나" | CloudTrail·Flow Logs·GuardDuty finding | behavior graph | 집계 도구인 척 |
| **Access Analyzer** | "무엇이 *외부에 열려* 있나" | 리소스 정책 | 외부 접근·미사용 권한 finding | 데이터 분류 자리에 잘못 배치 |
| **Security Hub** | "이 모두를 *한 형태*로 어떻게 보나" | 위 전부 + 표준 검사 | ASFF 정규화·점수 | 조사·탐지 도구인 척 |

한 줄 암기: **위협은 GuardDuty, 약점은 Inspector, 데이터는 Macie, 노출은 Access Analyzer, 관계는 Detective, 집계는 Security Hub.**

여기에 자주 딸려 나오는 두 쌍을 더 붙인다.

- **Security Hub vs Security Lake**: 전자는 *판단 결과(finding)*를 **ASFF**로 모으고, 후자는 *원천 로그*를 **OCSF**로 모아 외부 분석 도구에 공급한다. "서드파티 SIEM에 원천 로그를 넘겨라" → Security Lake. "탐지 결과를 우선순위화·자동화하라" → Security Hub.
- **GuardDuty Malware Protection vs Inspector**: 전자는 EBS 볼륨을 스캔해 *악성 파일*을 찾고, 후자는 *패키지 취약점*을 찾는다. "멀웨어" 단어가 나오면 Inspector가 아니다.

## 집약 계층: Security Hub

Security Hub는 GuardDuty·Inspector·Macie·Config 등 다수 소스의 finding을 **ASFF(AWS Security Finding Format)** 표준으로 정규화·집약한다. 보안 표준(CIS, AWS FSBP, PCI DSS, NIST)에 대한 자동 점검 점수를 준다. **다계정은 delegated administrator**로 위임 운영하고, Organizations와 통합해 신규 계정 자동 등록.

ASFF에서 시험이 실제로 찌르는 필드는 셋뿐이다.

| 필드 | 의미 | 왜 묻는가 |
|---|---|---|
| `Severity.Normalized` | 0–100 정규화 점수. INFORMATIONAL 0 / LOW 1–39 / MEDIUM 40–69 / HIGH 70–89 / CRITICAL 90–100 | 출처가 달라도(GuardDuty 0.1–8.9, Inspector CVSS 0–10) 한 눈금에 놓여야 정렬·자동화 임계값을 걸 수 있다 |
| `Workflow.Status` | NEW → NOTIFIED → RESOLVED / SUPPRESSED. **사람의 처리 상태** | 노이즈를 접는 것은 SUPPRESSED |
| `RecordState` | ACTIVE / ARCHIVED. **finding 자체의 생존** | 제공자가 더 이상 유효하지 않다고 판단한 상태 |

> ⚠️ **함정**: `Workflow.Status`와 `RecordState`를 바꿔 쓰는 것이 단골이다. 분석가가 "처리 완료"로 표시하는 것은 `Workflow.Status = RESOLVED`, 노이즈를 접는 것은 `SUPPRESSED`이며, `RecordState = ARCHIVED`는 사람의 조작 대상이 아니다. 그리고 **automation rules(Security Hub 안에서 필드를 바꿈)**와 **EventBridge 규칙(밖으로 내보내 조치함)**도 다른 물건이다. "노이즈 정리"면 automation rules, "실제 대응"이면 EventBridge.

노이즈 문항의 정답 형태도 고정돼 있다. "하루 수천 건이라 아무것도 처리 못 한다"가 나오면 답은 **finding은 다 받되 우선순위로 접는다**(automation rules로 억제·상향 + Insights로 상위 위험 추출)이지, *탐지를 끄거나 통합을 해제하거나 Trusted IP list로 생성 자체를 막는* 것이 아니다. 후자들은 전부 사각지대를 만든다.

> ⚠️ **자주 틀리는 구분**: 
> - GuardDuty = *위협* 탐지(행위 이상). Inspector = *취약점*(CVE/패치). 혼동 금지.
> - Macie = S3 *데이터* 민감도. Access Analyzer = *정책* 노출. 
> - Security Hub = *집약·표준 점수*. Detective = *조사*. Config = *설정 준수·이력*.

### 다계정 탐지 베이스라인: 빠지면 조용히 안 보이는 것들

멀티계정 문항의 정답은 거의 고정된 형태다 — **모든 탐지 서비스의 위임 관리자를 동일한 Security Tooling(Audit) 계정으로 정렬하고, auto-enable로 신규 계정을 자동 포함하며, 집계 리전으로 멀티리전을 모으고, 로그는 별도 Log Archive 계정에 불변 보관한다.** 문항은 이 중 하나를 빼고 "왜 안 보이는가"를 묻는다.

| 빠진 것 | 생기는 사각지대 | 지문에 나타나는 증상 |
|---|---|---|
| 통합(integration) 미활성화 | 그 탐지기의 finding | "GuardDuty엔 뜨는데 Security Hub엔 없다" |
| 집계 리전(aggregation Region) 미지정 | 다른 리전 전체 | "critical을 뒤늦게 알았다" |
| auto-enable 미설정 | 신규 계정 전체 | "새 팀 계정이 탐지 밖에 있었다" |
| 위임 관리자 분산 | 조사 컨텍스트 단절 | "finding은 A계정, 그래프는 B계정" |
| 로그를 탐지 계정에 보관 | 권한 분리 실패 | 침해 시 증거 훼손 가능 |
| 미사용 리전 미커버 | 그 리전의 모든 활동 | 안 쓰는 리전에서의 채굴·정찰 |

> 💡 **관련 이론**: 이것이 AWS *Security Reference Architecture(SRA)*의 뼈대다. 보안 도구를 워크로드와 분리된 전용 계정에 위임하면 *권한 분리*가 성립한다 — 워크로드 팀이 자기 탐지를 끄거나 finding을 지울 수 없고, 로그는 침해자가 닿지 못하는 별도 계정에 남는다. 관리(management) 계정에는 운영 부담을 지우지 않는 것도 같은 원칙이다(루트 권한이 집중된 계정을 가장 보호해야 하므로). **위임 관리자 지정은 서비스마다 따로 해야 한다** — 한 번에 전부 위임되지 않는다는 점이 자주 나온다.

## 대응 계층: EventBridge가 신경을 연결

탐지가 대응으로 이어지는 배선이 **EventBridge**다. GuardDuty/Security Hub finding, Config 비준수, CloudTrail 이벤트가 모두 EventBridge 이벤트로 흐른다. 룰이 매칭되면 대상으로 라우팅:

- **Lambda**: 즉시 자동 교정(보안 그룹 회수, 키 비활성화, 스냅샷).
- **SSM Automation runbook**: 표준화된 다단계 대응(인스턴스 격리·포렌식 캡처).
- **Step Functions**: 승인 게이트가 있는 복잡한 대응 워크플로.
- **SNS**: 사람에게 알림(SOC/온콜).

> 💡 **관련 이론**: 이것이 *event-driven security automation*이다. 시험의 "사람 개입 없이 자동으로(automatically, without manual intervention)" 키워드는 거의 항상 EventBridge → Lambda/SSM 패턴을 가리킨다. Config 자동 교정(remediation)도 같은 철학 — `AWS-PublishSNSNotification`이나 커스텀 SSM 문서로 비준수 리소스를 즉시 되돌린다.

### 인시던트 대응의 정석 절차

침해된 EC2 대응 순서(시험 단골):
1. **분리**: Auto Scaling 그룹·타깃 그룹에서 detach(격리하면 헬스체크 실패로 ASG가 스스로 종료해 증거가 사라진다).
2. **증거 보존**: EBS 스냅샷, 메모리 덤프, 인스턴스 메타데이터·태그.
3. **격리**: 포렌식 격리용 보안 그룹으로 교체(종료 금지 — 휘발성 증거 보존). **새 SG의 기본 아웃바운드 허용 규칙을 제거해야** 진짜 격리다.
4. **자격증명 회수**: 인스턴스 프로파일 분리 + 역할에 `aws:TokenIssueTime` Deny로 기존 세션 폐기. *네트워크 격리와 별개로 반드시 한다* — 유출된 STS 토큰은 인스턴스 밖에서 만료까지 산다.
5. **조사**: Detective로 범위 파악, CloudTrail/Athena로 전수 추적, 포렌식 계정으로 스냅샷 공유.
6. **복구·근절**: 백도어 제거 후 깨끗한 AMI 재배포. 근절 없이 복구하면 재침해된다.

키 침해 대응: IAM 액세스 키는 **먼저 비활성화**(`Inactive`) 후 추적·회전을 마치고 삭제 — 추적 전에 삭제하면 `accessKeyId` 조회 축을 잃는다. KMS 키는 삭제 대신 *disable*(되돌릴 수 있게), 노출된 시크릿은 Secrets Manager 로테이션 트리거. 루트 침해는 IAM 정책·SCP로 제한할 수 없으므로(관리 계정 프린시펄에는 SCP 미적용) 복구 채널(이메일·전화) 통제 확인이 먼저다.

### "무엇을 먼저 하는가" 결정 축

순서를 묻는 문항은 같은 조치 목록을 주고 **배열만 바꿔** 보기를 만든다. 근거를 알면 변형에 흔들리지 않는다.

```
"가장 먼저 무엇을 하는가?" 문항이 나오면 — 이 순서로 축을 본다
   │
   ├─① 이 조치가 증거를 파괴하는가?  ── 예 ─► 뒤로 민다 (terminate·delete·재배포)
   │
   ├─② 이 조치가 되돌릴 수 있는가?   ── 예 ─► 앞으로 당긴다 (격리 SG·키 비활성화·스냅샷)
   │
   ├─③ 확산의 "원인"인가 "결과"인가? ── 원인 먼저 (원 자격증명 > 공격자가 만든 사용자)
   │                                           (로깅 복구 > 눈에 띄는 인스턴스)
   │
   └─④ 자동화해도 되는가?            ── 가역이면 자동, 비가역이면 승인 게이트
```

이 네 축을 관통하는 문장: **증거를 없애는 조치는 뒤로, 가역적 조치는 앞으로, 원인은 결과보다 먼저, 비가역은 사람을 한 번 거친다.**

특히 시험이 좋아하는 상황별 첫 조치 몇 가지를 압축한다.

| 상황 | 가장 먼저 | 근거 |
|---|---|---|
| EC2 침해, ASG 소속 | ASG·타깃 그룹에서 분리 | 격리 → 헬스체크 실패 → ASG가 종료 → 증거 소멸 |
| 역할 토큰 유출 정황 | 세션 폐기 + 프로파일 분리 | 토큰은 인스턴스 밖에서 만료까지 유효 |
| 액세스 키 공개 노출 | 비활성화(삭제 아님) | 가용성보다 유출 차단 우선, 비활성화는 가역 |
| 진행 중 C2가 안 끊김 | NACL·ENI로 보조 차단 | SG는 stateful이라 established 연결이 남는다 |
| CloudTrail 중지 탐지 | 로깅 복구 + 아카이브 무결성 확인 | 꺼진 동안의 행위는 영원히 알 수 없다 |
| 버킷 정책이 외부에 열림 | 정책 Statement 제거·퍼블릭 차단 재적용 | 버킷 삭제·객체 이동은 증거와 서비스를 함께 깬다 |
| 다계정에 같은 위험 의심 | Security Hub로 조직 전역 점검 | 계정 순회는 반드시 누락된다 |

> ⚠️ **함정**: 자동 대응 설계 문항의 오답은 대개 **비가역 조치를 무인 자동화에 넣은 보기**다. 격리 SG 이동·태깅·스냅샷·세션 폐기는 오탐이어도 되돌릴 수 있지만, **인스턴스 종료·볼륨 삭제·역할 삭제**는 되돌릴 수 없고 포렌식 증거까지 파괴한다. 비가역 조치는 Step Functions의 승인 단계(`aws:approve`)나 티켓을 경유시켜 사람을 한 번 거치게 한다. *가역성이 다른 모든 판단 축을 압도한다.*

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

> 🔍 **더 깊이**: 성숙한 SOC는 "탐지했는가"가 아니라 "탐지→대응 *시간(MTTR)*을 자동화로 얼마나 줄였는가"로 평가된다. 시험 답안이 "Lambda로 자동 교정 + SNS 알림"을 선호하는 이유다. 동시에 *증거 무결성*도 핵심 — CloudTrail log file validation, S3 Object Lock(WORM)·MFA Delete, KMS 키 비활성화(삭제 아님)는 모두 "조사 가능성·법적 증거력을 훼손하지 말라"는 같은 원칙의 표현이다. 그리고 MTTR은 단일 숫자가 아니라 *탐지→분류→봉쇄→조사→복구*의 합이다. 지표가 "MTTD는 줄었는데 MTTR은 그대로"라고 말하면 병목은 자동화의 부재가 아니라 **어느 구간에서 시간이 흐르는지 측정하지 않은 것**이다.

## 도메인 1·2 키워드 → 서비스 번역표

지문 표현을 서비스로 즉시 옮기는 반사. 이 두 도메인만 따로 모은다(전 도메인 통합본은 day5).

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---|---|
| "악성 IP와 통신", "행위 이상", "채굴", "정찰" | GuardDuty |
| "EBS 볼륨의 멀웨어" | GuardDuty Malware Protection |
| "컨테이너·노드의 프로세스 수준 행위" | GuardDuty Runtime Monitoring |
| "CVE", "미패치", "네트워크 도달 가능성" | Inspector |
| "S3에 개인정보·카드번호가 있는지" | Macie |
| "근본 원인", "침해 범위", "횡적 이동", "시각적 조사" | Detective |
| "외부·교차 계정에 노출된 정책", "쓰이지 않는 권한" | IAM Access Analyzer |
| "여러 도구의 결과를 한 형태로", "CIS/PCI/FSBP 점수" | Security Hub |
| "원천 로그를 서드파티 SIEM에" | Security Lake (OCSF) |
| "누가 어떤 API를 호출했는지" | CloudTrail 관리 이벤트 |
| "어떤 객체가 다운로드됐는지" | CloudTrail **데이터 이벤트** |
| "평소보다 호출량·오류가 급증" | CloudTrail Insights |
| "그때 이 리소스가 어떤 상태였는지" | Config 구성 항목 타임라인 |
| "IP 흐름·허용/거부만" | VPC Flow Logs |
| "패킷 내용까지" | Traffic Mirroring |
| "어떤 도메인을 질의했는지", "DNS 기반 유출" | Route 53 Resolver query log |
| "루트 로그인 시 즉시 알림" | CloudTrail → CloudWatch Logs 메트릭 필터 → 알람 → SNS |
| "대량 로그를 SQL로 조사" | Athena / CloudTrail Lake |
| "사람 개입 없이 자동 교정" | EventBridge → Lambda / SSM Automation |
| "승인 단계가 필요한 다단계 대응" | Step Functions (`aws:approve`) |
| "표준화된 다단계 대응 절차" | SSM Automation 런북 |
| "로그를 끄거나 지우지 못하게" | 조직 trail + SCP Deny + Log Archive 계정 + Object Lock |
| "신규 계정도 자동으로 탐지 대상" | 위임 관리자 + auto-enable |
| "여러 리전 finding을 한 화면에" | Security Hub 집계 리전 |
| "노이즈가 너무 많다" | Security Hub automation rules(억제·상향) + Insights |

## 도메인 1·2 함정 총정리

> ⚠️ **로깅 함정**:
> - CloudTrail 관리 이벤트는 **S3 객체·Lambda 호출을 기록하지 않음** → 데이터 이벤트 별도 활성화.
> - 콘솔 이벤트 히스토리는 최근 90일뿐 — **영구 증거는 S3 trail**.
> - VPC Flow Logs는 **페이로드를 보지 않는다**(메타·허용/거부만).
> - 로그·증거는 **소급 생성 불가** — 요구가 오기 전에 켜 둔 것만 증거가 된다.
> - 로그를 탐지 계정에 두면 권한 분리가 깨진다 → **별도 Log Archive 계정**.
> - S3 서버 액세스 로그는 best-effort·지연이 있어 **감사 증거로는 데이터 이벤트가 우위**.

> ⚠️ **탐지 함정**:
> - GuardDuty는 로그를 **내부 소비**하므로 Flow Logs·DNS 로그를 따로 켤 필요 없음 — 대신 *끄면 안 된다*.
> - 통합(integration)을 켜지 않으면 finding이 **Security Hub에 오지 않는다**.
> - 집계 리전 없이는 **다른 리전이 통째로 사각지대**.
> - auto-enable을 서비스마다 따로 켜지 않으면 그 서비스만 신규 계정에서 조용히 꺼져 있다.
> - `Workflow.Status`(사람의 처리)와 `RecordState`(finding 생존)를 바꿔 쓰지 말 것.
> - automation rules는 **유입 시점**에 적용된다 — 과거 finding을 소급 변경하지 않는다.

> ⚠️ **대응 함정**:
> - 즉시 terminate → 휘발성 증거 파괴.
> - ASG에서 분리하지 않고 격리 → 헬스체크 실패로 ASG가 종료.
> - 새 격리 SG의 **기본 아웃바운드 허용**을 제거하지 않아 유출이 계속됨.
> - 인스턴스만 격리하고 **STS 토큰을 폐기하지 않음**.
> - 노출 키를 **추적 전에 삭제**해 조사 축을 잃음.
> - 근절 없이 복구해 백도어로 재침해.
> - 비가역 조치를 무인 자동화에 넣어 오탐 한 번이 곧 장애.

> 📚 **사례**: 대형 클라우드 침해 사후 보고서에는 같은 문장이 반복된다 — "관련 신호는 이미 로그에 있었다." **Capital One(2019)**은 SSRF로 인스턴스 메타데이터에 도달해 역할의 임시 자격증명을 얻은 뒤 데이터가 반출됐고, 사실 인지는 *외부 제보*로 이뤄졌다. **SolarWinds(2020)** 공급망 공격도 결국 한 보안 기업이 자사 환경의 이상을 발견하면서 드러났다. 두 사건의 공통 교훈은 도구의 부재가 아니라 **신호가 사람과 자동화에 닿는 경로의 부재**다. 탐지기가 finding을 만들어도 정규화되지 않아 우선순위를 못 매기고, 여러 콘솔에 흩어져 상관되지 않으며, 자동으로 대응 큐에 들어가지 않으면 — 실질적으로 탐지하지 않은 것과 같다. Capital One 사례는 또 하나를 말한다: **인스턴스 격리와 자격증명 회수는 별개**이며, IMDSv2·hop limit은 *대응*이 아니라 *준비* 항목이다.

## 정리하며

오늘의 두 도메인을 한 문장으로 줄이면 이렇다. **"로그가 증거를 만들고, 탐지기가 증거를 판단으로 바꾸고, ASFF가 판단을 공통어로 만들고, EventBridge가 공통어를 행동으로 옮긴다."**

시험이 이 파이프라인에서 반복해 찌르는 지점은 네 곳이다. ① **깊이** — 관리 이벤트만으로는 객체 접근이 안 보인다. ② **무결성** — 로그가 있어도 지울 수 있으면 증거가 아니다. ③ **집계** — 탐지기는 여럿이어도 집계와 자동화 표면은 하나여야 한다. ④ **가역성** — 자동화가 강력해질수록 오탐의 피해도 커지므로, 무인 자동화에는 되돌릴 수 있는 조치만 넣는다.

그리고 이 네 지점은 전부 "켰다/껐다"의 문제가 아니라 *조합*의 문제다. 그래서 보기 중 **하나만 언급한 답**은 대개 오답이고, **요구된 축을 동시에 만족시키는 답**이 best다. 이 감각이 도메인 1·2 문항의 절반을 자동으로 처리해 준다.

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
