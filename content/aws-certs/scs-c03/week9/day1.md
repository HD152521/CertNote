# Day 1 - Amazon GuardDuty: 위협 탐지 원리, 핀딩 유형, 위협 인텔, 멀티계정 위임 관리자

탐지(detection)는 예방(prevention)이 뚫렸음을 전제로 한다. 방화벽·IAM·암호화로 아무리 막아도 자격증명 탈취, 내부자, 제로데이는 통과한다. 그래서 보안 운영의 두 번째 기둥은 "이미 일어난(또는 일어나는 중인) 악성 활동을 *증거 기반으로* 알아채는 것"이다. Amazon GuardDuty는 이 탐지 계층의 1차 진입점으로, **에이전트 없이(agentless)** 계정 전역의 텔레메트리를 상시 분석해 위협을 핀딩(finding)으로 토해낸다.

GuardDuty의 본질은 "로그를 *수집하는* 서비스가 아니라, 로그를 *읽어 의미를 부여하는* 분석 엔진"이다. CloudTrail을 켜야 GuardDuty가 보는 것이 아니라, GuardDuty가 CloudTrail/VPC Flow/DNS 스트림을 *직접 구독*해서 분석한다. 사용자가 로그를 저장·전달하도록 구성할 필요가 없고, 활성화하는 순간 데이터 소스가 연결된다 — 이 "켜기만 하면 끝"이 시험의 단골 포인트다.

## 무엇을 분석하는가: 3대 기초 데이터 소스

GuardDuty가 추가 비용·구성 없이 항상 소비하는 세 가지 *기초(foundational)* 소스:

```
CloudTrail 관리 이벤트  → API 호출 행위 (누가 무엇을 했나)
CloudTrail S3 데이터 이벤트(옵션) → S3 객체 수준 접근
VPC Flow Logs           → 네트워크 흐름 (어디로 연결했나)
DNS 쿼리 로그           → 도메인 해석 (무엇을 찾았나)
```

중요한 미묘함: GuardDuty는 이 로그들을 **복제하지 않는다**. 계정에 VPC Flow Logs를 켜지 않았어도, GuardDuty는 내부적으로 흐름 데이터를 받아 분석한다(별도 저장 안 함). DNS 분석은 **VPC 기본 DNS resolver(Route 53 Resolver)**를 쓸 때만 가능하다 — 커스텀 DNS나 외부 resolver를 쓰면 GuardDuty의 DNS 기반 핀딩(예: DNS exfiltration)은 사각지대가 된다.

> 💡 **관련 이론**: 이는 *행위 기반 탐지(behavioral detection)*의 전형이다. 시그니처 매칭(알려진 악성 IP·해시)에만 의존하지 않고, 베이스라인 대비 *이상(anomaly)*을 통계·ML로 잡는다. GuardDuty는 계정별로 "정상" 프로파일(평소 호출하는 API, 평소 통신하는 지역·포트)을 학습해, 평소와 다른 행위를 위협 점수화한다. 이것이 NIST CSF의 "Detect" 기능 중 "Anomalies and Events(DE.AE)"에 대응한다.

## 보호 플랜(Protection Plans): 기초 위에 얹는 확장 탐지

기초 소스 외에, 추가 데이터 소스를 켜는 *보호 플랜*들이 있다. 각각 별도 과금되고 별도 핀딩 유형을 생성한다:

- **S3 Protection**: CloudTrail S3 데이터 이벤트 분석 → 의심스러운 S3 접근 패턴
- **EKS Protection**: EKS 감사 로그 분석 → 쿠버네티스 API 수준 위협
- **Runtime Monitoring**: 경량 에이전트(EKS/ECS/EC2)로 **호스트 내부** 행위(프로세스, 파일, 네트워크) 가시성 → 컨테이너·인스턴스 런타임 위협
- **Malware Protection (EBS)**: 의심 EC2의 EBS 볼륨 스냅샷을 떠 멀웨어 스캔(에이전트 불필요)
- **Malware Protection for S3**: 업로드 객체 스캔
- **RDS Protection**: Aurora 로그인 활동 분석 → DB 자격증명 공격
- **Lambda Protection**: Lambda 네트워크 활동 분석

> ⚠️ **함정**: "GuardDuty를 켰는데 호스트 내부 침해(악성 프로세스)를 못 본다"는 시나리오의 답은 보통 **Runtime Monitoring 활성화**다. 기초 GuardDuty는 네트워크/API 관점만 본다. 또 "EC2가 멀웨어에 감염된 것 같다 → 스캔하라"는 **Malware Protection(EBS)**이다.

## 핀딩(Finding)의 해부

핀딩은 GuardDuty 탐지의 산출물이다. 핀딩 타입은 일관된 명명 규칙을 따른다:

```
ThreatPurpose:ResourceTypeAffected/ThreatFamilyName.DetectionMechanism!Artifact

예) UnauthorizedAccess:EC2/SSHBruteForce
    Backdoor:EC2/C&CActivity.B!DNS
    CryptoCurrency:EC2/BitcoinTool.B!DNS
    Recon:IAMUser/UserPermissions
    Exfiltration:S3/AnomalousBehavior
    Trojan:EC2/DNSDataExfiltration
    PenTest:IAMUser/KaliLinux
    Policy:S3/BucketBlockPublicAccessDisabled
```

- **ThreatPurpose**(위협 목적): Backdoor, Behavior, CryptoCurrency, Exfiltration, Impact, PenTest, Persistence, Policy, PrivilegeEscalation, Recon, Stealth, Trojan, UnauthorizedAccess 등 — 공격 *단계/의도*를 나타낸다.
- **ResourceTypeAffected**: EC2, IAMUser, S3, EKSCluster, RDS, Lambda 등.
- **DetectionMechanism**: `.B!DNS`처럼 어떻게 탐지했는지(DNS 기반, etc).

각 핀딩은 **severity(심각도)** 점수 0.1~8.0+를 가진다: Low(1.0–3.9), Medium(4.0–6.9), High(7.0–8.9). 시험에서는 점수 자체보다 *어떤 핀딩이 어떤 위협을 의미하는지*가 중요하다.

> 💡 **관련 이론**: ThreatPurpose 분류는 사실상 **MITRE ATT&CK** 전술(Tactics) 매핑이다 — Recon(정찰), PrivilegeEscalation(권한 상승), Persistence(지속성), Exfiltration(유출), Impact(영향) 등은 ATT&CK의 킬체인 단계와 대응한다. 핀딩을 ATT&CK 관점에서 읽으면 "공격이 어느 단계까지 왔는가"를 판단해 대응 우선순위를 정할 수 있다.

## 위협 인텔리전스: 알려진 악성 + 사용자 정의

GuardDuty는 AWS·서드파티(CrowdStrike, Proofpoint 등)가 큐레이션하는 위협 인텔 피드를 내장한다. 알려진 악성 IP·도메인과의 통신은 즉시 핀딩이 된다.

추가로 사용자가 직접 두 가지 리스트를 등록할 수 있다:
- **Trusted IP list(신뢰 IP)**: 이 IP들에서의 활동은 핀딩을 생성하지 않음(화이트리스트). 자사 사무실·VPN IP 등.
- **Threat IP list(위협 IP)**: 이 IP들과의 통신은 핀딩 생성(커스텀 블랙리스트). 자체 위협 인텔 통합.

```
GuardDuty 위협 평가
  ├─ AWS 큐레이션 인텔 (자동)
  ├─ Trusted IP list  → 매칭 시 핀딩 억제
  └─ Threat IP list   → 매칭 시 핀딩 생성
```

> ⚠️ **함정**: Trusted IP / Threat IP 리스트는 **위임 관리자(또는 개별 계정)** 수준에서 관리되며, 멤버 계정은 자체 리스트를 추가할 수 없다(조직 모드에서는 관리자가 중앙 관리). 또 GuardDuty는 *예방* 도구가 아니다 — Trusted IP에 넣어도 그 IP의 *접근을 허용*하는 게 아니라 *핀딩을 안 만드는* 것뿐이다. 접근 통제는 SG/NACL/WAF의 몫이다.

## 멀티계정: 위임 관리자(Delegated Administrator)

엔터프라이즈는 수십~수백 계정을 쓴다. GuardDuty를 계정마다 따로 켜고 따로 보는 것은 비현실적이다. **AWS Organizations + 위임 관리자** 패턴이 정답이다:

```
관리 계정(management) ──지정──▶ 위임 관리자 계정(보통 Security Tooling 계정)
                                      │
                                      ├─ 조직 전체 GuardDuty 활성화
                                      ├─ "Auto-enable for new accounts" 설정
                                      └─ 모든 멤버 핀딩을 중앙 집계·관리
```

- 관리 계정이 한 계정(권장: 별도 *Security Tooling* 계정)을 **GuardDuty 위임 관리자**로 지정.
- 위임 관리자는 조직 내 모든 계정에서 GuardDuty를 활성화하고, **자동 등록(auto-enable)**으로 신규 계정도 자동 포함.
- 멤버 계정의 핀딩은 위임 관리자 콘솔에 *집계*되어 단일 창에서 본다.

> 💡 **관련 이론**: 이는 AWS의 *멀티계정 보안 베이스라인* 모범사례다. 보안 도구(GuardDuty, Security Hub, Detective, Macie 등)는 워크로드 계정과 분리된 전용 *Security Tooling* 계정에 위임해, 워크로드 계정 관리자가 탐지를 끄거나 핀딩을 숨길 수 없게 한다(권한 분리). 위임 관리자 패턴은 관리 계정(루트 권한 집중)에 보안 운영 부담을 지우지 않으면서도 조직 전체 가시성을 준다.

> ⚠️ **함정**: 멤버 계정은 *자기 계정에서* GuardDuty를 비활성화할 수 없다(위임 관리자가 조직 모드로 강제 시). "신규 계정이 탐지 사각지대"라는 문제의 답은 **auto-enable 활성화**다. 또 위임 관리자 지정은 **관리 계정만** 할 수 있다.

## 핀딩이 나온 뒤: 자동화 연계

핀딩은 보는 것으로 끝나면 안 된다. GuardDuty는 핀딩을 **Amazon EventBridge**로 발행한다(거의 실시간). 이를 트리거로:

```
GuardDuty Finding ──▶ EventBridge Rule ──▶ Lambda(격리/스냅샷/태깅)
                                        ├─▶ SNS(알림)
                                        ├─▶ Step Functions(대응 워크플로)
                                        └─▶ Security Hub(집계, 자동 통합)
```

예: `UnauthorizedAccess:EC2/SSHBruteForce` 핀딩 → EventBridge → Lambda가 해당 EC2를 격리 SG로 이동 + 포렌식 스냅샷 + 티켓 생성. 신규 핀딩은 EventBridge에 즉시, 기존 핀딩의 후속 발생은 기본 6시간(설정 가능 15분~) 간격으로 집계 발행된다.

> 🔍 **더 깊이**: GuardDuty 핀딩의 가치는 *상관(correlation)*과 *대응(response)*으로 완성된다. 단일 핀딩은 노이즈일 수 있으나, Detective로 조사하고(Day 2), Security Hub로 다른 탐지 결과와 상관하고(Day 4), EventBridge로 자동 대응을 걸 때 운영 가치를 낸다. GuardDuty를 "알람 생성기"로만 보면 절반만 쓰는 것이다 — 탐지→조사→대응의 파이프라인 입구로 설계해야 한다.

## 자주 틀리는 구분

- **GuardDuty vs CloudTrail**: CloudTrail은 *로그를 기록*, GuardDuty는 *로그를 분석해 위협 판단*. CloudTrail이 원천, GuardDuty가 해석자.
- **GuardDuty vs Inspector**: GuardDuty는 *런타임 위협*(지금 일어나는 악성 활동), Inspector는 *취약점*(악용 가능한 약점). 탐지 시점이 다르다(Day 3).
- **GuardDuty vs Macie**: Macie는 S3의 *민감 데이터(PII) 분류*, GuardDuty는 위협 행위. 목적이 다르다.
- **GuardDuty vs WAF/SG**: GuardDuty는 탐지(detect)만, 차단(prevent)은 안 한다. 차단은 다른 통제와 자동화로.

## 한 줄 요약 체크리스트

- [ ] GuardDuty를 조직 위임 관리자(Security Tooling 계정)에서 켜고 auto-enable 했는가
- [ ] DNS 기반 탐지를 위해 VPC 기본 Route 53 Resolver를 쓰는가
- [ ] 호스트 내부 위협이 필요하면 Runtime Monitoring을, 멀웨어는 Malware Protection을 켰는가
- [ ] 핀딩을 EventBridge로 받아 알림·자동 대응에 연결했는가
- [ ] Trusted/Threat IP 리스트를 위협 인텔에 맞게 관리하는가

---

## 📝 연습 문제

**문제 1.** 보안팀이 50개 계정 조직에서 GuardDuty를 운영하려 한다. 신규로 생성되는 계정이 자동으로 탐지에 포함되고, 워크로드 계정 관리자가 GuardDuty를 끄지 못하게 하려면?

A) 관리 계정에서만 GuardDuty를 켜고 다른 계정은 수동 초대  
B) 별도 Security Tooling 계정을 GuardDuty 위임 관리자로 지정하고 조직 모드로 auto-enable을 켠다  
C) 각 계정 관리자에게 GuardDuty를 켜도록 이메일로 요청  
D) CloudTrail만 조직 추적으로 켜면 GuardDuty가 자동 활성화된다  

**정답: B**  
해설: 멀티계정 베이스라인의 정답은 전용 Security Tooling 계정을 위임 관리자로 지정하고 조직 모드 + auto-enable로 신규 계정까지 자동 포함하는 것이다. 조직 모드에서는 위임 관리자가 멤버 계정의 GuardDuty를 중앙 관리하므로 워크로드 관리자가 임의로 끌 수 없다. 수동 초대·이메일 요청은 누락·사각지대를 낳고, CloudTrail을 켠다고 GuardDuty가 자동으로 켜지지는 않는다.

---

**문제 2.** EC2 인스턴스 안에서 실행 중인 악성 프로세스와 파일 변경을 GuardDuty로 탐지하고 싶다. 기초 GuardDuty만으로는 보이지 않았다. 무엇을 해야 하는가?

A) VPC Flow Logs를 별도로 S3에 저장한다  
B) GuardDuty Runtime Monitoring을 활성화한다  
C) CloudTrail 데이터 이벤트를 켠다  
D) Inspector를 활성화한다  

**정답: B**  
해설: 기초 GuardDuty는 네트워크 흐름·DNS·API 관점만 분석하므로 호스트 *내부*의 프로세스·파일 행위는 보지 못한다. 호스트 런타임 가시성은 경량 에이전트를 배포하는 Runtime Monitoring이 제공한다. Flow Logs 저장은 GuardDuty 동작과 무관하고, CloudTrail 데이터 이벤트는 API/S3 관점이며, Inspector는 런타임 위협이 아닌 취약점 스캔 도구다.

---

**문제 3.** GuardDuty가 DNS 기반 데이터 유출(DNS exfiltration) 핀딩을 전혀 생성하지 않는다. 조사 결과 해당 VPC는 커스텀 외부 DNS resolver를 사용한다. 원인은?

A) GuardDuty는 DNS를 분석하지 않는다  
B) DNS 기반 탐지는 VPC 기본 Route 53 Resolver를 사용할 때만 동작하므로, 외부 resolver 사용 시 사각지대가 된다  
C) DNS exfiltration 핀딩은 유료 플랜에만 있다  
D) Trusted IP 리스트에 모든 IP가 등록되어 있다  

**정답: B**  
해설: GuardDuty의 DNS 쿼리 분석은 VPC 기본 DNS(Route 53 Resolver)를 통과하는 질의에만 적용된다. 커스텀/외부 DNS resolver를 사용하면 GuardDuty가 DNS 질의를 볼 수 없어 DNS 기반 핀딩이 누락된다. GuardDuty는 기초 소스로 DNS를 분석하므로 A는 틀리고, DNS exfiltration은 기초 핀딩이며, 모든 IP를 신뢰 목록에 넣는 비정상 구성은 시나리오와 무관하다.

---

**문제 4.** `CryptoCurrency:EC2/BitcoinTool.B!DNS` 핀딩이 발생했다. 이 핀딩이 알려주는 것과 가장 적절한 1차 대응은?

A) EC2가 비트코인 채굴/통신 활동을 보이며, EventBridge로 해당 인스턴스 격리·스냅샷 자동화를 트리거한다  
B) 단순 정보성 핀딩이므로 무시한다  
C) S3 버킷이 공개되었다는 의미다  
D) IAM 사용자의 권한이 과도하다는 의미다  

**정답: A**  
해설: 핀딩 명명 규칙상 ThreatPurpose가 CryptoCurrency, 대상이 EC2, DNS 기반 탐지(`.B!DNS`)이므로 인스턴스가 암호화폐 채굴/관련 도메인과 통신 중임을 뜻한다 — 흔히 침해의 강한 신호다. 적절한 대응은 핀딩을 EventBridge로 받아 인스턴스 격리·포렌식 스냅샷·티켓팅을 자동화하는 것이다. 무시는 위험하고, S3 공개나 IAM 과다 권한은 다른 핀딩 유형(Policy:S3, Recon:IAMUser 등)이다.

---

**문제 5.** GuardDuty의 Trusted IP list에 대한 설명으로 옳은 것은?

A) 등록된 IP로부터의 접근을 네트워크 수준에서 허용(allow)한다  
B) 등록된 IP의 활동에 대해 GuardDuty가 핀딩을 생성하지 않도록 억제하지만, 접근 자체를 허용하는 통제는 아니다  
C) 등록된 IP와의 통신을 무조건 차단한다  
D) 멤버 계정마다 자유롭게 추가할 수 있다  

**정답: B**  
해설: Trusted IP list는 해당 IP의 활동에 대한 핀딩 생성을 억제하는 탐지 측 설정일 뿐, 접근 허용/차단 같은 네트워크 예방 통제가 아니다. 접근 통제는 SG/NACL/WAF의 역할이다. 통신을 차단하는 것은 Threat IP list의 핀딩 생성과도 다른 개념이며, 조직 모드에서 이 리스트는 위임 관리자가 중앙 관리하므로 멤버가 임의 추가하지 못한다.

---
