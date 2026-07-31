# Day 5 - D-Day 마무리: 시험장 전략 · 키워드→서비스 번역 · 함정 총정리

12주의 마지막 날이다. 오늘은 새 지식이 아니라 *시험장에서 점수로 바꾸는 기술*을 정리한다. SCS-C03은 65문항·170분, 합격선은 750/1000(스케일드). 아는 것을 *제 시간에·함정을 피해* 답으로 옮기는 것이 마지막 관문이다.

## 시험장 운영 전략

- **시간 배분**: 65문항 / 170분 = 문항당 ~2.6분. 첫 패스에서 막히면 *flag for review*하고 넘어간다. 한 문제에 4분 이상 쓰지 말 것.
- **2-패스 방식**: 1패스에서 확실한 것만 답하고 나머지는 표시. 2패스에서 표시 문항을 집중. 시간 압박을 분산한다.
- **지문 먼저, 보기 나중**: 질문의 *마지막 문장*(실제 묻는 것)을 먼저 읽고 본문으로 돌아오면 노이즈가 줄어든다.
- **빈칸 금지**: 오답 감점이 없다. 모르면 소거 후 찍어도 표시해두고 넘어간다.
- **"MOST/BEST/LEAST" 강조어**: 작동하는 답이 여럿일 때 *정도*를 묻는다. 선호 위계(managed>self, automated>manual, prevent>detect>respond)로 가린다.

> 💡 **관련 이론**: Specialty는 "지식 시험"이 아니라 "판단 시험"이다. 두 보기가 모두 동작해도 AWS Well-Architected의 보안 기둥 원칙 — *최소 권한, 다계층 방어, 추적 가능성(traceability), 자동화된 보안, 전송·저장 데이터 보호* — 에 더 부합하는 쪽이 답이다. 막판 2지선다는 거의 항상 이 원칙 중 하나로 갈린다.

### 한정어 한 장 요약

문항 끝의 한 단어가 채점 기준이다. 어제 표의 압축본을 시험장 직전에 한 번 훑는다.

| 한정어 | 정답이 기우는 방향 | 대표 후보 |
|---|---|---|
| MOST cost-effective | 무료·기본 제공·호출 절감 | Gateway Endpoint, Parameter Store, S3 Bucket Keys |
| LEAST operational overhead | **관리형 > 자체 구현** | Secrets Manager 로테이션, 관리형 규칙, Control Tower |
| MOST secure | 더 좁은 권한·더 강한 불변성 | Object Lock Compliance, SSE-KMS, PrivateLink |
| FASTEST to implement | 기존 관리형 조합 | Control Tower, Conformance Pack |
| MINIMAL disruption | 비침습·단계적 | WAF count 모드 → block, 경고 후 강제 |
| without changing the application | 인프라 계층 해결 | 엣지·엔드포인트·에이전트 |
| automatically / immediately | 이벤트 기반 | EventBridge → Lambda/SSM |
| prevent | 행위 자체를 불가능하게 | SCP Deny, 능동 컨트롤 |
| all / future accounts | 조직 도구 | SCP·RCP, Firewall Manager, auto-enable |

## 키워드 → 서비스 번역 사전

지문의 표현을 서비스로 즉시 번역하는 반사 신경. 이게 속도의 핵심이다. 분야별로 나눠 둔다.

### ① 탐지·조사·집계

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---------------------------|---------------------|
| "행위 이상·악성 IP·데이터 유출 의심·채굴" | GuardDuty |
| "EBS 볼륨의 멀웨어" | GuardDuty Malware Protection |
| "컨테이너·노드의 프로세스 수준 행위" | GuardDuty Runtime Monitoring |
| "근본 원인·침해 범위·횡적 이동·시각적 조사" | Detective |
| "취약점·CVE·패치 누락·네트워크 도달성" | Inspector |
| "S3 PII·카드번호·민감 데이터 발견·분류" | Macie |
| "외부/교차계정에 노출된 정책 발견" | IAM Access Analyzer(외부 접근) |
| "쓰이지 않는 권한·역할 정리" | IAM Access Analyzer(미사용 액세스) |
| "finding 집약·CIS/PCI/FSBP 점수" | Security Hub |
| "원천 로그를 서드파티 SIEM으로" | Security Lake(OCSF) |
| "finding이 너무 많다·노이즈" | Security Hub automation rules + Insights |
| "여러 리전 finding을 한 화면에" | Security Hub 집계 리전 |
| "신규 계정도 자동으로 탐지 대상" | 위임 관리자 + auto-enable |

### ② 로깅·감사·모니터링

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---|---|
| "누가 어떤 API를 호출했나" | CloudTrail 관리 이벤트 |
| "어떤 객체가 다운로드·업로드됐나" | CloudTrail **데이터 이벤트**(별도 활성화) |
| "평소보다 호출량·오류율이 급증" | CloudTrail Insights |
| "모든 계정의 활동을 중앙에" | Organization trail |
| "로그가 변조되지 않았음을 증명" | log file validation(SHA-256 digest) |
| "지우거나 끄지 못하게" | SCP Deny + Log Archive 계정 + Object Lock |
| "그때 이 리소스가 어떤 상태였나" | Config 구성 항목 타임라인 |
| "설정 준수·드리프트 평가" | AWS Config 규칙 |
| "다계정·다리전 Config 데이터를 한곳에" | Config aggregator |
| "IP 흐름·허용/거부만" | VPC Flow Logs |
| "패킷 내용까지 봐야 한다" | Traffic Mirroring |
| "어떤 도메인을 질의했나" | Route 53 Resolver query log |
| "루트 로그인 시 즉시 알림" | CloudTrail → CloudWatch Logs 메트릭 필터 → 알람 → SNS |
| "대량 로그를 SQL로 조사" | Athena / CloudTrail Lake |

### ③ 네트워크·인프라

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---|---|
| "인터넷 경유 없이 S3/DynamoDB" + "비용 최소" | Gateway VPC Endpoint(무료) |
| "인터넷 경유 없이 그 외 서비스/내 SaaS" | Interface Endpoint(PrivateLink) |
| "이 VPC에서만 버킷 접근" | 버킷 정책 `aws:SourceVpce` / `aws:SourceVpc` |
| "특정 IP 대역 차단(서브넷)" | NACL deny |
| "인스턴스 단위 허용 목록" | Security Group |
| "인바운드는 열었는데 응답이 안 온다" | NACL 아웃바운드 임시 포트(1024–65535) |
| "진행 중인 연결을 즉시 끊어야" | NACL(SG는 stateful) |
| "L7 SQLi/XSS/rate limit/지역 차단" | WAF |
| "L3/4 DDoS 흡수·비용 보호·대응팀" | Shield Advanced |
| "VPC IPS·도메인 통제·중앙 검사" | Network Firewall(+TGW appliance mode) |
| "DNS 기반 멀웨어/exfiltration" | Route 53 Resolver DNS Firewall |
| "오리진에 직접 못 붙게" | CloudFront + OAC / 비밀 헤더 / prefix list |
| "다수 VPC 허브·전이 라우팅" | Transit Gateway(Peering은 전이 불가) |
| "온프레미스 전용 대역폭" | Direct Connect(+VPN 암호화) |
| "서드파티 어플라이언스를 인라인으로" | Gateway Load Balancer |

### ④ 자격 증명·액세스

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---|---|
| "조직 권한 상한·~를 못 하게" | SCP |
| "조직 리소스에 외부 접근 차단" | RCP |
| "위임받은 사람이 자기 권한을 못 넘게" | 권한 경계 |
| "서드파티 안전 위임·confused deputy" | AssumeRole + trust policy + External ID |
| "온프레미스 워크로드 IAM 역할" | IAM Roles Anywhere(X.509) |
| "다계정 SSO·SAML/OIDC 페더레이션" | IAM Identity Center |
| "CI/CD가 장기 키 없이" | OIDC 페더레이션 역할 |
| "앱 최종 사용자 인증" | Cognito(User Pool) / 임시 AWS 자격증명(Identity Pool) |
| "EC2/EKS/ECS/Lambda의 자격증명" | 인스턴스 프로파일 / IRSA·Pod Identity / 태스크 역할 / 실행 역할 |
| "SSRF로 메타데이터 탈취 방지" | IMDSv2 + hop limit |
| "DB 자격증명 자동 로테이션" | Secrets Manager |
| "설정값/시크릿(로테이션 불요·저비용)" | SSM Parameter Store(SecureString) |
| "즉시 무효화" | 액세스 키 `Inactive` / `aws:TokenIssueTime` Deny |

### ⑤ 데이터 보호·거버넌스

| 지문에 이런 표현이 나오면 | 떠올릴 서비스/패턴 |
|---|---|
| "키를 우리가 단독 소유·전용 HSM·FIPS L3" | CloudHSM / KMS custom key store |
| "외부 키 관리 시스템의 키로" | KMS 외부 키 스토어(XKS) |
| "키 사용 감사·정책 통제 암호화" | SSE-KMS + CloudTrail |
| "이중 계층 암호화" | DSSE-KMS |
| "키를 AWS에 두지 않는다" | SSE-C / 클라이언트 측 암호화 |
| "SSE-KMS인데 KMS 비용이 과하다" | S3 Bucket Keys |
| "특정 서비스 경유일 때만 키 사용" | `kms:ViaService` |
| "테넌트별 복호화 분리" | `kms:EncryptionContext` |
| "삭제·변조 불가·WORM·랜섬웨어 방지" | S3 Object Lock + MFA Delete + 버전관리 |
| "누구도(루트 포함) N년간 삭제 불가" | Object Lock **Compliance** |
| "실수 방지, 필요 시 예외" | Object Lock **Governance** |
| "백업이 지워지지 않게" | AWS Backup Vault Lock |
| "평문 HTTP 거부" | 버킷 정책 `aws:SecureTransport` Deny |
| "인증서 자동 갱신" | ACM(CloudFront는 us-east-1, imported는 갱신 안 됨) |
| "사내 신뢰 체인" | AWS Private CA |
| "이미 만든 EBS/RDS 암호화" | 스냅샷 → 암호화 복사 → 복원 |
| "앞으로 만들 볼륨은 자동 암호화" | 계정·리전 EBS 기본 암호화 |
| "조직 WAF/SG/Shield 중앙 강제" | Firewall Manager |
| "신규 계정에 가드레일 자동·landing zone" | Control Tower |
| "생성 전에 IaC에서 차단" | 능동 컨트롤(CloudFormation Hooks) |
| "규칙 묶음을 조직에 한 번에" | Conformance Pack |
| "감사자 제출용 증거·보고서" | Audit Manager |
| "승인된 제품만 셀프서비스" | Service Catalog |
| "리소스 교차 계정 공유" | RAM |
| "태그 표기 표준화" | Tag Policy |
| "무태그 생성 차단" | SCP (`aws:RequestTag` + Null) |
| "지출 급증이 침해 신호" | Cost Anomaly Detection / Budgets |
| "조직 밖으로 데이터가 못 나가게" | SCP(나가는 문) + RCP(들어오는 문) + `aws:PrincipalOrgID` |

## 헷갈리는 짝 대조표 모음

시험 실점의 대부분은 *모르는 것*이 아니라 *경계가 흐린 것*에서 나온다. 시험장 직전에 이 절만 다시 읽어도 된다.

### GuardDuty vs Inspector vs Macie vs Detective vs Access Analyzer vs Security Hub

| 서비스 | 답하는 질문 | 한 단어 |
|---|---|---|
| GuardDuty | "지금 위협 *행위*가 벌어지는가" | **위협** |
| Inspector | "악용 가능한 *취약점*이 남았는가" | **약점** |
| Macie | "어떤 *데이터*가 민감하고 어디 있는가" | **데이터** |
| Detective | "이 엔티티들이 어떻게 *연결*되는가" | **관계** |
| Access Analyzer | "무엇이 *외부에 열려* 있는가" | **노출** |
| Security Hub | "이 모두를 *한 형태*로 어떻게 보는가" | **집계** |

### SCP vs RCP vs 권한 경계 vs 리소스 정책 vs 세션 정책

| 정책 | 붙는 대상 | 권한 부여 | 대표 용도 |
|---|---|---|---|
| SCP | Root/OU/계정 | ✗ | 조직 천장 — 리전 잠금·보안 서비스 보호. **관리 계정 미적용** |
| RCP | Root/OU/계정 | ✗ | 리소스 측 조직 상한 — 외부 프린시펄 차단. **지원 서비스 제한적** |
| 권한 경계 | 개별 사용자·역할 | ✗ | **주체 하나**의 천장 — 위임자가 권한을 넘지 못하게 |
| 리소스 정책 | S3·KMS·SQS·Lambda 등 | **○** | 교차 계정 공유·서비스 프린시펄 허용 |
| 세션 정책 | AssumeRole 세션 | ✗ | 임시 자격증명의 일시적 축소 |

판별 한 줄: **범위가 계정·OU면 SCP, 주체 하나면 권한 경계, 리소스 쪽이면 리소스 정책·RCP.**

### KMS 키 정책 vs IAM 정책 vs Grant

| 축 | 키 정책 | IAM 정책 | Grant |
|---|---|---|---|
| 단독으로 충분 | **○** | ✗(키 정책의 위임이 전제) | ○(허용 범위 내) |
| 수명 | 영구 | 영구 | **임시·취소 가능** |
| 전형적 용도 | 키 소유 경계 | 사람·앱의 사용 권한 | 서비스가 사용자 대신 키 사용 |

**"AdministratorAccess인데 복호화가 안 된다"의 답은 대개 키 정책이다.**

### Object Lock Governance vs Compliance vs Legal Hold

| 축 | Governance | Compliance | Legal Hold |
|---|---|---|---|
| 보존 중 삭제 | 특별 권한으로 **가능** | **불가(루트 포함)** | 해제 전까지 불가 |
| 기간 | 지정, 단축 가능 | 지정, **단축 불가**(연장만) | 기간 없음 |
| 언제 | 내부 정책·실수 방지 | **규제 요건** | 소송·조사 동결 |

### SSE-S3 vs SSE-KMS vs DSSE-KMS vs SSE-C

| 축 | SSE-S3 | SSE-KMS | DSSE-KMS | SSE-C |
|---|---|---|---|---|
| 키 통제·감사 | 약함 | **키 정책 + CloudTrail** | 동일 | 고객 전담 |
| 암호화 계층 | 1 | 1 | **2(이중)** | 1 |
| 고르는 단서 | 기본 암호화 | "감사·통제" | "이중 계층" | "키를 AWS에 두지 않음" |

### Config vs CloudTrail vs VPC Flow Logs

| 축 | Config | CloudTrail | Flow Logs |
|---|---|---|---|
| 답하는 것 | "그때 **어떤 상태**였나" | "누가 **무엇을 호출**했나" | "어디로 **흘렀나**" |
| 단위 | 리소스 구성 항목 | API 이벤트 | ENI/서브넷/VPC 흐름 |
| 페이로드 | — | — | **없음**(메타만) |
| 조사에서의 역할 | 언제 변했는지 | 누가 했는지 | 어디로 나갔는지 |

### Shield vs WAF vs Network Firewall vs NACL/SG

| 위협·요구 | 정답 |
|---|---|
| L3/4 volumetric flood, DDoS 비용 보호 | **Shield Advanced** |
| L7 SQLi/XSS/봇/rate limit/지역 | **WAF** |
| VPC 내부·이그레스의 IPS·도메인·시그니처 | **Network Firewall**(라우팅 강제 필수) |
| 서브넷 단위 IP 블랙리스트 | **NACL deny** |
| 인스턴스 단위 허용 목록 | **Security Group** |

### 그 밖의 단골 쌍

- **Security Hub vs Security Lake**: finding(ASFF) 집계 vs 원천 로그(OCSF) 공급.
- **Conformance Pack vs Audit Manager**: 규칙 배포 vs 증거 포장. **Audit Manager는 증거를 생성하지 않는다.**
- **Tag Policy vs SCP**: 표기 표준화 vs **생성 차단**.
- **Control Tower vs StackSets**: 가드레일 프레임워크 vs 배포 도구.
- **Secrets Manager vs Parameter Store**: 자동 로테이션 vs 저비용 설정값.
- **Gateway vs Interface Endpoint**: S3·DynamoDB 무료 vs 그 외 유료.
- **Peering vs Transit Gateway**: 전이 불가 vs 허브·전이 가능.
- **격리 vs 종료**: 네트워크 차단(증거 보존) vs 증거 파괴.
- **automation rules vs EventBridge**: Security Hub 안에서 필드 변경 vs 밖으로 내보내 조치.

## 자주 틀리는 함정 총정리

마지막으로 가장 비싼 실수들을 한 번에 정리한다.

> ⚠️ **로깅·탐지 함정**:
> - CloudTrail 관리 이벤트는 **S3 객체·Lambda 데이터 접근을 기록하지 않음** → 데이터 이벤트 별도 활성화.
> - GuardDuty는 로그를 **내부 소비**하므로 Flow Logs/DNS 로그를 따로 켤 필요 없음 — 끄지 말 것.
> - GuardDuty=위협, Inspector=취약점, Macie=데이터, Detective=조사, Security Hub=집약. 혼동 금지.
> - VPC Flow Logs는 **페이로드를 안 봄**(허용/거부·메타만). 내용은 패킷 미러링·앱 로그.

> ⚠️ **IAM·거버넌스 함정**:
> - **SCP·Permission Boundary는 권한을 부여하지 않음** — 상한만 제한.
> - 평가 순서: **명시적 Deny가 최우선**, 그다음 SCP, Allow, Boundary, 암묵적 Deny.
> - **장기 액세스 키를 워크로드에 두지 말 것** → 역할(인스턴스 프로파일/IRSA/실행 역할).
> - 교차계정 위임에 **External ID**로 confused deputy 방지.
> - IAM 역할=직원·워크로드, **Cognito=앱 사용자**.

> ⚠️ **네트워크 함정**:
> - **NACL은 stateless** → 아웃바운드 임시 포트(1024-65535) 별도 허용.
> - SG는 **거부 규칙 없음**(화이트리스트만). IP 차단은 NACL deny.
> - VPC Endpoint 만들어도 **엔드포인트/IAM 정책이 허용해야** 통신.
> - Network Firewall은 **라우팅으로 트래픽을 강제 통과**시켜야 검사됨.
> - TGW로 stateful 검사 시 **appliance mode** 누락하면 비대칭 오작동.

> ⚠️ **데이터 보호 함정**:
> - **CloudFront용 ACM 인증서는 us-east-1**에만 발급.
> - KMS는 **envelope encryption**(대용량을 직접 암호화하지 않음).
> - KMS 키 정책이 **root를 신뢰해야 IAM 정책 위임 가능**.
> - KMS 키 삭제는 **7~30일 대기** — 그 전엔 disable로 복구 가능.
> - at-rest(SSE/KMS)와 in-transit(TLS·`aws:SecureTransport`)은 **별개 통제** — 둘 다.
> - SSE-S3는 키 감사·정책 통제 약함 → 통제 필요 시 **SSE-KMS**.

> ⚠️ **인시던트 대응 함정**:
> - 침해 인스턴스를 즉시 **terminate**해 휘발성 증거 파괴.
> - **ASG·타깃 그룹에서 분리하지 않고** 격리 → 헬스체크 실패로 ASG가 종료.
> - 새 격리 SG의 **기본 아웃바운드 허용**을 제거하지 않아 유출이 계속됨.
> - 인스턴스만 격리하고 **STS 토큰을 폐기하지 않음**(밖에서 만료까지 유효).
> - 노출 키를 **추적 전에 삭제**해 `accessKeyId` 조회 축을 잃음.
> - **근절 없이 복구**해 백도어로 재침해.
> - **비가역 조치를 무인 자동화**에 넣어 오탐 한 번이 곧 장애.
> - SG만 교체하고 **established C2 세션**이 유지됨(NACL·ENI 보조 필요).
> - IAM 정책·SCP로 **루트를 제한하려 함**(관리 계정 프린시펄에 SCP 미적용).

> ⚠️ **거버넌스·증명 함정**:
> - **Audit Manager는 증거를 생성하지 않는다** — Config/CloudTrail/Security Hub 선행 필수.
> - **현재 COMPLIANT는 기간 증명이 아니다** — 이력엔 Config 구성 이력 + CloudTrail.
> - **로그·증거는 소급 생성 불가** — 요구가 오기 전에 켠 것만 증거가 된다.
> - **Tag Policy는 무태그 생성을 막지 못한다** — 차단은 SCP.
> - **Control Tower 관리 리소스 수동 변경 = 드리프트** → 랜딩 존 재적용.
> - **Firewall Manager는 Config가 전제**, `RemediationEnabled`가 꺼지면 보고만 한다.
> - **auto-enable·위임 관리자는 서비스마다 따로**.
> - **컨트롤은 OU에 적용** — 계정 개별 적용은 신규 계정 누락.
> - **리전 잠금 SCP에 글로벌 서비스·us-east-1 예외** 누락 시 콘솔·CloudFront·ACM 파손.
> - **서비스 연결 역할 호출은 SCP 평가에서 제외** — "특정 경로만 계속 통과"의 원인.

> 🎯 **막판 2지선다 결정 규칙**: 두 답이 모두 작동하면 — (1) 더 *관리형*인가? (2) 더 *자동화*인가? (3) 더 *최소 권한*인가? (4) 더 *우회 불가능*한가? (5) *예방 > 탐지 > 대응* 위계에서 더 앞인가? (6) *조직 전체 강제*가 가능한가? (7) *가역적*인가(자동 대응 문항일 때)? 이 중 더 많이 만족하는 쪽이 best.

### 결정 트리: 막판 2지선다를 가르는 순서

```
두 보기가 모두 "동작"한다
   │
   ├─① 한정어가 있는가?  ── 있으면 그 축이 채점 기준이다. 여기서 끝난다.
   │      MOST cost-effective → 무료·기본 제공 쪽
   │      LEAST operational overhead → 관리형 쪽
   │      MOST secure → 더 좁고 더 불변인 쪽
   │
   ├─② 제약 조건을 어기는 쪽이 있는가?
   │      "no internet" / "existing app" / "multi-account" / "regulatory"
   │      → 하나라도 어기면 그 보기는 즉시 탈락
   │
   ├─③ 요구 동사와 통제 계층이 맞는가?
   │      prevent → SCP·정책 Deny·능동 컨트롤
   │      detect  → Config·GuardDuty·Access Analyzer
   │      respond → EventBridge·Lambda·SSM
   │      (탐지 도구로 차단하겠다는 보기는 오답)
   │
   ├─④ 반쪽 조치인가?
   │      경로만 잠그고 권한은 그대로 / 봉쇄만 하고 추적·근절 없음
   │      → 조합을 갖춘 쪽이 best
   │
   ├─⑤ 극단적 서술인가?
   │      "모두 자동화" "모두 수동" "탐지를 끈다" "전 권한 회수"
   │      → 극단은 거의 항상 오답
   │
   └─⑥ 그래도 갈리면 ── 선호 위계
          managed > self-managed
          automated > manual
          prevent > detect > respond
          조직 강제 > 계정 개별
          가역 자동화 > 비가역 자동화
```

## 시험 전날·당일 운영

지식은 이미 끝났다. 남은 변수는 컨디션과 절차다.

**전날에 하면 좋은 것** — 새 자료를 펼치지 않는다. 오늘 문서의 *대조표와 함정 목록만* 훑는다(새 지식은 불안만 늘린다). 시험 장소·시간·필요 신분증을 확인하고, 온라인 응시라면 시스템 점검과 책상 정리를 미리 끝낸다. 충분히 잔다 — 170분 집중력은 마지막 20문항에서 갈리고, 그 구간의 정확도는 수면에 직접 비례한다.

**당일 운영** — 시작 직후 30초를 써서 *체크포인트 숫자*를 머릿속에 다시 새긴다(33번에서 85분). 1패스는 확신 문항 위주로 빠르게, 표시 문항은 잠정 답을 반드시 채우고 넘긴다. 화면의 flag 기능과 남은 시간 표시를 초반에 확인해 두면 중반에 헤매지 않는다. 중간에 페이스가 무너졌다고 느끼면 *지문 읽는 순서*로 돌아간다 — 마지막 문장 → 제약 조건 → 보기.

> 🔍 **더 깊이**: 시험은 "이 서비스를 아는가"보다 "이 상황에서 *옳은 조합*을 고르는가"를 본다. 그래서 단일 정답 암기보다 *시나리오 분해 → 키워드 번역 → 함정 회피 → 선호 위계 적용*의 흐름이 점수를 만든다. 모르는 문제는 표시하고 넘기는 결단이 전체 점수를 지킨다. 한 문제의 완벽함보다 65문제의 페이스가 합격을 만든다. 12주간 쌓은 도메인별 정신 모델 — 탐지·대응 신경계(1·2), 경로×권한 이중통제(3·4), 암호화×거버넌스 전파(5·6) — 를 그대로 적용하면 된다. 그리고 하나 더: **긴장은 지문을 짧게 읽게 만든다.** 실전에서 아는 문제를 틀리는 가장 흔한 경로가 "제약 조건 한 줄을 건너뛴 것"이다. 속도를 내야 할 곳은 보기 소거이지 지문 독해가 아니다.

> 📚 **사례**: 이 자격증이 요구하는 판단이 실제로 어떤 사건들에서 유래했는지 한 줄씩만 되짚어 두면, 함정 목록이 암기가 아니라 이야기로 남는다. **Code Spaces(2014)** — 계정이 탈취된 상태에서 데이터와 *같은 계정에 있던 백업까지* 지워져 회사가 문을 닫았다. → 로그·백업은 **만든 주체가 지울 수 없는 계정**에. **Capital One(2019)** — SSRF로 인스턴스 메타데이터에 도달해 역할의 임시 자격증명을 얻어 데이터가 반출됐고, 인지는 외부 제보로 이뤄졌다. → **격리와 자격증명 회수는 별개**이고, IMDSv2·최소 권한은 대응이 아니라 준비 항목이며, 자체 탐지 루프가 없으면 인지 자체가 늦는다. **Equifax(2017)** — 패치 누락으로 진입이 이뤄졌고, 트래픽 검사 장비의 인증서가 만료된 채 방치돼 오랜 기간 탐지가 작동하지 않았다. → 통제는 "설치했다"가 아니라 **"지금 작동한다"**가 확인돼야 한다. **SolarWinds(2020)** — 신뢰된 공급망을 통해 침투했고 결국 한 보안 기업의 자체 이상 탐지로 드러났다. → 신뢰 경계는 내부에도 그어야 하고, 최종 방어선은 언제나 *스스로의 탐지*다. 시험 보기에서 "정기적으로 사람이 점검한다"가 오답인 이유, "별도 계정에 불변 보관한다"가 정답인 이유가 모두 이 네 문장 안에 있다.

## 마지막 체크리스트 (시험 직전)

- [ ] 6개 도메인의 핵심 서비스를 키워드로 즉시 번역할 수 있는가
- [ ] 함정 5종(데이터 이벤트, SCP 비부여, NACL 임시 포트, ACM us-east-1, KMS 대기)을 외웠는가
- [ ] GuardDuty/Inspector/Macie/Detective/Security Hub의 역할 구분이 명확한가
- [ ] IAM 평가 순서(Deny→SCP→Allow→Boundary)가 반사적으로 떠오르는가
- [ ] 2-패스 전략과 flag for review로 시간을 관리할 준비가 됐는가
- [ ] 막판 2지선다 결정 규칙(managed/automated/least-priv/prevent)을 기억하는가

## 정리하며

12주를 한 문장으로 압축하면 이렇다. **"로그가 증거를 만들고, 탐지가 판단을 만들고, 경계와 권한이 피해를 제한하고, 암호화와 거버넌스가 그 상태를 유지시킨다."**

시험장에서 실제로 쓰는 것은 셋뿐이다.

1. **번역** — 지문의 표현을 서비스로 옮긴다. "변조 불가" → Object Lock, "인터넷 없이" → 엔드포인트, "즉시 무효화" → 키 비활성화·세션 폐기, "기존 소프트웨어 교체 불가" → 인프라 계층 해결, "최소 운영 부담" → 관리형.
2. **경계** — 헷갈리는 짝의 선을 긋는다. 위협/약점/데이터/관계/노출/집계, SCP/권한 경계/리소스 정책, Governance/Compliance, Config/CloudTrail/Flow Logs.
3. **위계** — 두 답이 모두 동작하면 한정어 → 제약 → 통제 계층 → 조합 → 선호 위계 순으로 가른다.

이 셋이 되면 나머지는 페이스의 문제다. 33번에서 85분, 1패스 150분, 표시 문항에 20분. 어떤 문항도 빈칸으로 두지 않는다.

마지막으로 하나만 더. **모르는 문항을 만나는 것은 실패의 신호가 아니라 정상 분포다.** 합격선은 만점이 아니고, 채점되지 않는 문항도 섞여 있다. 한 문항에 흔들려 다음 다섯 문항의 집중을 잃는 것이 실제 위험이다. 표시하고, 넘어가고, 돌아오면 된다.

12주 수고했다. 침착하게, 분해하고, 번역하고, 함정을 피하면 된다. 합격을 빈다.

---

## 📝 연습 문제

**문제 1.** 시험 중 한 문제에서 4분째 두 보기 사이에서 결정하지 못하고 있다. 가장 합리적인 행동은?

A) 정답이 나올 때까지 계속 붙든다  
B) flag for review로 표시하고 다음 문제로 넘어가, 2패스에서 다시 본다  
C) 빈칸으로 비워둔다  
D) 시험을 일찍 종료한다  

**정답: B**  
해설: 문항당 평균 약 2.6분이므로 한 문제에 과도한 시간을 쓰면 전체 페이스가 무너진다. flag for review로 표시하고 넘어가 2패스에서 집중하는 것이 표준 전략이다. 계속 붙들면 시간 손실이 크고, 오답 감점이 없으므로 빈칸은 손해이며, 조기 종료는 검토 기회를 버리는 것이다.

---

**문제 2.** 지문에 "사람의 개입 없이 자동으로(automatically, without manual intervention) 비준수 리소스를 교정"이라는 표현이 있다. 이 키워드가 가리키는 전형적 패턴은?

A) 매일 사람이 콘솔에서 점검  
B) Config/GuardDuty finding → EventBridge → Lambda 또는 SSM Automation 자동 교정  
C) IAM 정책 검토 회의  
D) Trusted Advisor 주간 리포트  

**정답: B**  
해설: "사람 개입 없이 자동 교정"은 거의 항상 이벤트 기반 자동화(Config/finding → EventBridge → Lambda/SSM Automation)를 가리킨다. 콘솔 수동 점검·검토 회의·주간 리포트는 모두 수동·사후적이어서 자동 교정 요건과 맞지 않는다. 키워드를 패턴으로 번역하는 반사가 속도를 만든다.

---

**문제 3.** "조직의 어떤 계정에서도 특정 작업을 *할 수 없게* 막아라"는 요구가 나왔다. 두 보기가 (A) Config 규칙으로 탐지, (B) SCP로 Deny일 때 best는?

A) Config 규칙 — 위반을 발견하므로  
B) SCP로 Deny — 예방 통제로 애초에 행위를 불가능하게 함(예방 > 탐지)  
C) 둘 다 동일하다  
D) IAM 정책을 계정마다 수동 부착  

**정답: B**  
해설: "할 수 없게 막아라"는 예방 통제 요구다. SCP Deny는 조직/OU 수준에서 행위를 애초에 불가능하게 하며, 보안 위계상 예방(prevent)이 탐지(detect)보다 앞선다. Config는 사후 탐지일 뿐이고, 수동 IAM 부착은 다계정 규모에서 드리프트가 발생한다. 막판 2지선다는 예방>탐지>대응 위계로 가린다.

---

**문제 4.** 두 보기가 모두 작동한다: (A) EC2에서 cron으로 직접 키를 교체하는 스크립트, (B) Secrets Manager 자동 로테이션. SCS-C03에서 선호되는 답과 이유는?

A) 직접 스크립트 — 더 유연하므로  
B) Secrets Manager 자동 로테이션 — 관리형·자동화가 자체 구현보다 선호됨(managed > self-managed)  
C) 둘 다 같다  
D) 키 교체는 불필요하다  

**정답: B**  
해설: 두 방식 모두 동작해도 AWS는 관리형·자동화 솔루션을 자체 구현보다 선호한다(운영 부담·오류·감사 측면). Secrets Manager의 내장 로테이션이 best다. 직접 스크립트는 유지보수·실패 위험이 크고, 키 교체는 보안상 필요하다. managed>self-managed 선호 위계의 전형적 적용이다.

---

**문제 5.** 다음 함정 진술 중 *사실과 다른* 것은?

A) CloudTrail 관리 이벤트는 S3 객체 수준 접근을 기록하지 않는다  
B) SCP는 권한을 부여하지 않고 상한만 제한한다  
C) CloudFront용 ACM 인증서는 어느 리전에서나 발급해도 된다  
D) NACL은 stateless라 아웃바운드 임시 포트를 별도 허용해야 한다  

**정답: C**  
해설: CloudFront에 연결할 ACM 인증서는 반드시 us-east-1(N. Virginia)에서 발급해야 하므로 "어느 리전에서나"는 사실과 다르다. 나머지는 모두 사실인 빈출 함정이다: 데이터 이벤트 별도 활성화 필요, SCP는 권한 비부여(상한 제한), NACL stateless 임시 포트. *틀린* 진술을 고르는 문제이므로 정답은 ACM 리전 진술이다.

---

**문제 6.** "MOST cost-effective(가장 비용 효율적인) 방법으로 프라이빗 서브넷에서 S3에 접근"이라는 요구다. 강조어 "MOST cost-effective"가 가르는 답은?

A) NAT Gateway 경유(시간당·데이터 처리 과금)  
B) S3 Gateway VPC Endpoint(무료)  
C) Interface Endpoint(시간당·데이터 과금)  
D) 퍼블릭 IP 부여  

**정답: B**  
해설: S3는 Gateway Endpoint를 지원하며 이는 무료이므로 "가장 비용 효율적"이라는 강조어가 정답을 가른다. NAT Gateway와 Interface Endpoint는 모두 시간·데이터 과금이 있고, 퍼블릭 IP 부여는 프라이빗·보안 요건을 위반한다. 강조어(MOST cost-effective)는 동작하는 여러 답 중 비용 기준으로 best를 선택하게 한다.

---

**문제 7.** 시험 마인드셋으로 가장 부적절한 것은?

A) 질문의 마지막 문장(실제 묻는 것)을 먼저 파악한다  
B) 모르는 문제는 끝까지 붙들어 반드시 풀고 넘어간다  
C) 두 답이 모두 작동하면 선호 위계(managed/automated/least-priv/prevent)로 가린다  
D) 명백히 요구를 어기는 보기(키 하드코딩·퍼블릭화)는 즉시 소거한다  

**정답: B**  
해설: 모르는 문제를 끝까지 붙드는 것은 전체 페이스를 무너뜨리는 잘못된 전략으로, flag for review 후 넘어가는 것이 옳다. 나머지(마지막 문장 먼저, 선호 위계 적용, 명백한 오답 즉시 소거)는 모두 권장되는 시험 기술이다. 한 문제의 완벽함보다 65문제의 페이스가 합격을 만든다.

---

**문제 8.** "S3에 신용카드 번호가 저장돼 있는지 자동 발견"과 "EC2에 미패치 CVE가 있는지 평가"라는 두 요구를 각각 올바른 서비스에 연결한 것은?

A) 둘 다 GuardDuty  
B) 전자는 Macie(S3 민감 데이터 분류), 후자는 Inspector(취약점·CVE 평가)  
C) 전자는 Inspector, 후자는 Macie  
D) 둘 다 Config  

**정답: B**  
해설: S3 내 신용카드 번호 등 민감 데이터 발견·분류는 Macie의 전용 기능이고, EC2/ECR/Lambda의 CVE·취약점 평가는 Inspector의 역할이다. GuardDuty는 행위 위협 탐지, Config는 설정 준수 평가로 두 요구 모두에 부적합하다. 서비스 역할 구분(데이터=Macie, 취약점=Inspector)은 빈출 핵심이다.

---
