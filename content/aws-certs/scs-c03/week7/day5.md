# Day 5 - Week 7 종합: 감사·구성 추적 시나리오 통합 복습

이번 주는 "사후에 진실을 재구성하는 능력" — 감사 추적(audit trail)을 다뤘다. 네 개의 기둥을 세웠다: **CloudTrail**(활동: 누가 무엇을 했나), **AWS Config**(구성: 리소스가 각 시점에 어떤 상태였나), **VPC Flow Logs·Resolver 쿼리 로그**(네트워크: 어떤 트래픽·DNS가 흘렀나), 그리고 **무결성·보존·중앙화**(이 증거를 신뢰할 수 있게 보관하는 법). 오늘은 이 조각들이 *하나의 침해 조사*에서 어떻게 맞물리는지를 시나리오로 엮는다.

## 다섯 기둥 한눈에 정리

| 도구 | 답하는 질문 | 기본 활성화 | 핵심 함정 |
|------|------------|-----------|----------|
| CloudTrail 관리 이벤트 | 누가 제어 평면 API를 호출했나 | 예(Event history 90일) | 장기 보존은 trail 필요 |
| CloudTrail 데이터 이벤트 | 누가 객체/함수에 접근했나 | **아니오** | selector 추가·비용 |
| CloudTrail Lake | 코드 없이 SQL로 조사 | 아니오 | 최대 10년, 별도 비용 모델 |
| AWS Config | 리소스 상태·이력·관계 | 아니오(리전별) | 리전마다 recorder |
| VPC Flow Logs | IP 트래픽 메타데이터 | 아니오 | payload 없음, NAT 뒤 pkt-srcaddr |
| Resolver 쿼리 로그 | VPC 내 DNS 조회 | 아니오 | Resolver 우회 시 누락 |

## 데이터 이벤트 vs 관리 이벤트: 끝까지 헷갈리지 말 것

가장 빈번한 시험 함정이다. 다음 표를 외워라:

| 작업 | 이벤트 종류 | 기본 기록? |
|------|-----------|-----------|
| `RunInstances`, `CreateBucket`, `AttachRolePolicy` | 관리(Management) | 예 |
| `ConsoleLogin`, `AssumeRole` | 관리 | 예 |
| S3 `GetObject`/`PutObject`/`DeleteObject` | 데이터(Data) | **아니오** |
| Lambda `Invoke` | 데이터 | **아니오** |
| DynamoDB `PutItem`/`GetItem` | 데이터 | **아니오** |

> ⚠️ **함정 재확인**: "누가 *버킷을 만들었나*"는 관리 이벤트(기본 기록). "누가 *버킷 안 객체를 다운로드했나*"는 데이터 이벤트(selector 필요). 이 한 문장으로 절반의 함정 문제를 풀 수 있다.

## 예방 vs 탐지 vs 대응: 통제 계층 매핑

Week 7 도구를 보안 통제 분류로 정리하면 답이 명확해진다:

- **예방(Preventive)**: SCP, IAM 정책, 보안 그룹/NACL, Object Lock, KMS 키 정책 — *애초에 막는다*.
- **탐지(Detective)**: CloudTrail, Config 규칙(평가), Flow Logs, Resolver 로그, GuardDuty — *일어난 일을 찾는다*.
- **대응(Responsive)**: Config 자동 교정(SSM Automation), EventBridge→Lambda, SNS 경보 — *되돌리거나 알린다*.

> 💡 **관련 이론**: 시험은 종종 "예방이냐 탐지냐"의 선택을 묻는다. 예: "퍼블릭 S3 버킷을 *막아라*"는 SCP/Block Public Access(예방)일 수도, Config 규칙+교정(탐지·대응)일 수도 있다. 핵심 단서는 *시점*이다 — "생성 자체를 거부"면 예방(SCP), "생성되면 되돌려라"면 탐지+대응(Config 교정). 둘은 배타적이지 않고 *계층으로 함께* 쓰는 것이 모범이다. 예방이 실패할 때를 대비해 탐지가, 탐지 후 자동 대응이 받친다.

## 통합 시나리오 1: S3 데이터 유출 침해 조사

> **상황**: 보안팀이 민감 데이터가 외부로 유출됐다는 제보를 받았다. 조사하라.

조사 흐름과 각 도구의 역할:

1. **무엇이, 누구에 의해 접근됐나** → CloudTrail **데이터 이벤트**(S3 `GetObject`)에서 해당 객체에 접근한 `userIdentity.arn`, `sourceIPAddress`, MFA 여부 확인. (단, 사전에 data event selector가 켜져 있어야 증거가 존재한다.)
2. **그 자격증명은 어떻게 얻어졌나** → CloudTrail **관리 이벤트**에서 `AssumeRole`, `ConsoleLogin`, 비정상 권한 부여(`AttachRolePolicy`) 추적.
3. **버킷이 언제부터 노출됐나** → AWS **Config** 구성 타임라인에서 버킷 정책·Block Public Access 설정이 언제 바뀌었는지 확인.
4. **데이터가 실제로 어디로 나갔나** → VPC **Flow Logs**(egress 볼륨, `pkt-srcaddr`로 원본 인스턴스, 목적지 IP).
5. **어떤 도메인/C2와 통신했나** → **Resolver 쿼리 로그**에서 의심 도메인 조회 상관.
6. **이 증거를 신뢰할 수 있나** → 로그가 별도 계정 + Object Lock + 무결성 검증으로 보호됐는지 확인(변조 가능성 배제).

> 🎯 **시나리오 포인트**: 단일 도구로는 그림이 안 그려진다. CloudTrail(누가/어떻게) + Config(언제부터 노출) + Flow Logs(얼마나 나갔나) + Resolver(어디로)를 *교차*해야 타임라인이 완성된다. 이 상관 분석이 가능한 전제가 4일차의 *중앙 집계*다.

## 통합 시나리오 2: 보안 그룹 오구성 추적

> **상황**: 운영 중 갑자기 0.0.0.0/0:3389(RDP)이 열려 있다. 누가 언제 왜?

- **Config**: 보안 그룹의 구성 타임라인에서 정확히 *언제* 인바운드 규칙이 추가됐는지, 그 전후 CI 비교.
- **CloudTrail**: 같은 시각 `AuthorizeSecurityGroupIngress` 호출의 호출자·소스 IP·세션.
- **Config Rule**: `restricted-ssh`/`restricted-common-ports` 같은 관리형 규칙이 이 위반을 `NON_COMPLIANT`로 잡았어야 한다. 안 잡았다면 규칙 미배포.
- **자동 교정**: 향후 재발 시 SSM Automation으로 위험 규칙을 자동 회수하도록 conformance pack에 교정 연결.

> 💡 **관련 이론**: Config는 *상태와 시점*("3389이 열려 있었다, 14:02부터")을, CloudTrail은 *행위와 주체*("Alice의 역할이 14:02에 그 규칙을 추가했다")를 답한다. 이 둘의 결합이 감사의 본질 — *상태 변화*와 *그 원인 행위*를 잇는 것이다.

## 통합 시나리오 3: 변조 불가 중앙 감사 베이스라인 구축

> **상황**: 300개 계정 조직에 "어떤 관리자도 끌 수 없고, 루트조차 삭제 못 하며, 보안팀만 읽는" 감사 기반을 세워라.

정답 아키텍처(Week 7 전체의 종합):
1. 관리 계정에서 **organization trail**(멀티리전, 관리 이벤트 전체 + 필요한 데이터 이벤트) 생성 → 멤버 계정이 끌 수 없음.
2. 로그를 **별도 로깅 계정** S3 버킷으로 집계(버킷 정책: `aws:SourceOrgID` + `bucket-owner-full-control`).
3. 버킷에 **Object Lock Compliance**(보존 기간) + 버전 관리 + **SSE-KMS**(전용 CMK, 키 정책으로 복호화 주체 제한).
4. **로그 파일 무결성 검증** 활성화로 변조 증명.
5. **organization conformance pack**으로 Config 규칙(암호화·공개 차단 등) 일괄 배포 + 자동 교정.
6. **EventBridge**로 `StopLogging`/`DeleteTrail` 즉시 경보.

> 🔍 **더 깊이**: 이 베이스라인이 곧 AWS **Control Tower**의 Log Archive 계정 + 가드레일이 자동화하는 것이다. 시험에서 "다계정 감사·준수 기반을 *처음부터* 표준대로 세워라"면 Control Tower가, "기존 환경에 직접 구성하라"면 위의 수동 조립이 답이다. 어느 쪽이든 구성 요소(org trail, 로깅 계정, Object Lock, KMS, conformance pack)는 동일하다. Week 7에서 배운 모든 조각이 여기서 하나로 합쳐진다 — 이것이 "보안 로깅·모니터링"의 토대이며, 다음 주의 위협 탐지(GuardDuty, Security Hub, Detective)는 *이 토대 위에서* 자동 분석을 얹는 단계다.

## 마무리 체크리스트

- [ ] 관리 이벤트 vs 데이터 이벤트 구분(특히 S3 객체·Lambda invoke는 데이터)
- [ ] CloudTrail Lake = 코드 없는 SQL 조사, 최대 10년
- [ ] 무결성 검증 = SHA-256 해시 체인 + RSA 서명 digest(변조 *증명*)
- [ ] Config = 상태·이력·관계, 리전별 recorder, 커스텀 규칙은 Lambda/Guard
- [ ] Conformance Pack = 규칙+교정 묶음, organization 단위 배포
- [ ] 자동 교정 = SSM Automation, 루프·중단 위험 주의
- [ ] Flow Logs = 메타데이터(payload 없음), pkt-srcaddr로 NAT 뒤 추적
- [ ] Resolver 쿼리 로그 = DNS 가시성, 우회 주의, DNS Firewall로 차단
- [ ] Object Lock Compliance = 루트조차 삭제 불가(예방)
- [ ] 별도 로깅 계정 + KMS 분리 = 격리 + 암호학적 접근 통제

---

## 📝 연습 문제

**문제 1.** S3 데이터 유출 침해를 조사하는데, 어느 자격증명이 민감 객체를 다운로드했는지 CloudTrail에서 찾을 수 없다. 사전에 무엇이 누락됐기 때문인가?

A) 로그 파일 무결성 검증  
B) trail에 S3 객체 수준 데이터 이벤트 selector  
C) Config recorder  
D) Resolver 쿼리 로깅  

**정답: B**  
해설: S3 `GetObject`는 데이터 이벤트로 기본 기록되지 않으므로, 사전에 trail에 S3 데이터 이벤트 selector(또는 advanced event selector)가 켜져 있어야 다운로드 주체를 추적할 수 있다. 무결성 검증은 변조 증명용, Config는 구성 상태, Resolver 로그는 DNS로 객체 접근 주체 추적과 무관하다. 데이터 이벤트는 사후에 소급 기록되지 않으므로 사전 활성화가 핵심이다.

---

**문제 2.** "퍼블릭 S3 버킷의 *생성 자체를 거부*하라"와 "퍼블릭 버킷이 *생성되면 자동으로 되돌려라*"는 각각 어떤 통제 유형인가?

A) 둘 다 예방 통제  
B) 전자는 예방(SCP/Block Public Access), 후자는 탐지+대응(Config 규칙 + 자동 교정)  
C) 전자는 대응, 후자는 예방  
D) 둘 다 탐지 통제  

**정답: B**  
해설: 시점이 단서다. "생성 자체를 거부"는 행위가 일어나기 전에 막는 예방 통제(SCP, S3 Block Public Access)이고, "생성되면 되돌려라"는 일어난 위반을 탐지(Config 규칙)하고 자동 교정(SSM Automation)으로 되돌리는 탐지+대응이다. 둘은 배타적이지 않고 계층으로 함께 쓰는 것이 모범이다.

---

**문제 3.** 보안 그룹에 0.0.0.0/0:3389이 열린 *시점*과 그 변경을 *일으킨 API 호출자*를 각각 어떤 서비스로 확인하는가?

A) 시점은 CloudTrail, 호출자는 Config  
B) 시점은 AWS Config 구성 타임라인, 호출자는 CloudTrail의 `AuthorizeSecurityGroupIngress` 이벤트  
C) 둘 다 VPC Flow Logs  
D) 둘 다 Resolver 쿼리 로그  

**정답: B**  
해설: Config는 리소스의 구성 항목(CI) 타임라인으로 규칙이 *언제* 추가됐는지(상태 변화 시점)를 보여주고, CloudTrail은 같은 시각의 `AuthorizeSecurityGroupIngress` 호출에서 *누가/어디서* 변경했는지(행위·주체)를 보여준다. 상태 변화는 Config, 원인 행위는 CloudTrail이라는 역할 구분이 핵심이다. Flow Logs·Resolver는 트래픽/DNS로 구성 변경 추적과 무관하다.

---

**문제 4.** 300개 계정 조직에 "멤버 관리자가 끌 수 없고, 루트조차 보존 기간 내 삭제 불가하며, 보안팀만 읽는" 감사 로그 기반을 직접 구성하려 한다. 올바른 구성 요소 조합은?

A) 각 계정 개별 trail + 단일 KMS 키 공유  
B) organization trail(멀티리전) → 별도 로깅 계정 S3(Object Lock Compliance + SSE-KMS 키 정책 분리 + SourceOrgID 버킷 정책) + 무결성 검증  
C) Event history 90일 + 버전 관리  
D) CloudWatch Logs만 + Governance 모드 Object Lock  

**정답: B**  
해설: organization trail은 멤버 관리자가 끌 수 없게 하고, 별도 로깅 계정은 운영 침해와 격리하며, Object Lock Compliance는 루트조차 보존 기간 내 삭제 불가, SSE-KMS 키 정책 분리는 복호화 주체를 보안팀으로 제한, SourceOrgID 버킷 정책은 confused deputy를 막고, 무결성 검증은 변조를 증명한다. 개별 trail은 일관성·강제성 부족, Event history는 90일·내보내기 불가, Governance 모드는 권한자가 우회 가능해 "루트조차 불가" 요구를 못 채운다.

---

**문제 5.** 침해 조사에서 "감염된 EC2가 외부 C2 서버와 통신했고, 어떤 도메인을 통해 연결했는지" 완전한 그림을 그리려 한다. 어떤 로그들의 *상관 분석*이 필요한가?

A) CloudTrail 관리 이벤트만으로 충분하다  
B) VPC Flow Logs(egress 볼륨·목적지 IP·pkt-srcaddr)와 Route 53 Resolver 쿼리 로그(조회 도메인)를 시간으로 상관 분석  
C) Config 구성 타임라인만  
D) S3 데이터 이벤트만  

**정답: B**  
해설: Flow Logs는 어느 인스턴스가 어떤 IP로 얼마나 egress했는지(pkt-srcaddr로 NAT 뒤 원본 특정)를, Resolver 쿼리 로그는 그 인스턴스가 어떤 도메인을 조회해 그 IP를 받았는지를 보여준다. 둘을 시간 기준으로 상관하면 "IP만으로는 모호한 통신"에 도메인 맥락이 더해져 C2 통신의 전체 그림이 완성된다. CloudTrail·Config·S3 이벤트는 네트워크·DNS 차원의 통신 경로를 직접 드러내지 못한다.

---
