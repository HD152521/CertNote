# Day 1 - 대기업 글로벌 ERP 마이그레이션 — 멀티 계정 거버넌스의 역사, 7R 마이그레이션의 해부학, 데이터 주권의 법적·기술적 뿌리

2017년, 거대 제조사 GE는 "9,000개의 워크로드를 클라우드로 옮긴다"는 야심찬 목표를 세웠지만 몇 년 뒤 상당수를 다시 온프레로 되돌렸다. 실패의 핵심 원인은 기술이 아니라 **거버넌스의 부재**였다 — 수백 개의 계정이 표준 없이 난립했고, 누가 어떤 리전에 무엇을 띄울 수 있는지에 대한 통제가 없었다. 반면 비슷한 시기 Capital One은 Organizations·SCP·표준화된 계정 팩토리를 먼저 깔고 마이그레이션을 시작해, 결국 자체 데이터센터를 전부 닫는 데 성공했다. 이 대비가 SAP-C02 Pro가 묻는 핵심을 압축한다 — **대규모 마이그레이션은 서버를 옮기는 작업이 아니라, 옮길 수 있는 통제된 착륙장(landing zone)을 먼저 짓는 작업**이다.

오늘의 시나리오는 온프레 SAP·Oracle 100TB+를 6개월 안에 미주·EU·APAC에 걸쳐 AWS로 옮기되, 다운타임을 최소화하고 EU 데이터는 EU 밖으로 못 나가게 하라는 것이다. SAA 수준이라면 "MGN으로 옮기면 된다"고 답하겠지만, Pro는 그 위에 **계정 구조·네트워크 토폴로지·데이터 주권·DR·7년 감사**가 한 덩어리로 맞물린 설계를 요구한다. 오늘은 멀티 계정 거버넌스가 왜 이런 모양이 됐는지, 7R 마이그레이션 전략이 어떤 의사결정 트리인지, 그리고 데이터 주권이 어떤 법에 뿌리를 두는지를 깊이 분해한다.

## 멀티 계정 거버넌스 — 왜 하나의 계정으로는 안 되는가

초기 AWS 사용자들은 모든 것을 단일 계정에 욱여넣었다. 그러나 조직이 커지면 이 구조가 무너진다. 단일 계정은 **폭발 반경(blast radius)**을 격리하지 못하고, 팀별 비용을 분리하기 어렵고, IAM 권한이 수백 개로 불어나며, 한 번의 침해가 전체를 노출시킨다. AWS는 이 문제에 2017년 **Organizations**, 2018년 **Control Tower**, 그리고 SCP(Service Control Policy)로 답했다.

멀티 계정의 본질은 **"계정을 격리의 단위로 쓴다"**는 것이다. 계정 경계는 AWS가 제공하는 가장 강력한 격리 경계다 — IAM 권한이 잘못 설정돼도 다른 계정의 리소스에는 닿지 못한다. 그래서 Prod·NonProd·Sandbox·Security·Logging을 별도 계정으로 쪼개고, 이를 OU(Organizational Unit)로 묶어 정책을 계층적으로 상속시킨다.

> 💡 **관련 이론**: 이 구조는 정보보안의 고전 원칙인 **최소 권한(Principle of Least Privilege)**과 **권한 분리(Separation of Duties)**를 인프라 계층에 구현한 것이다. NIST SP 800-53의 AC-5(직무 분리)·AC-6(최소 권한) 통제가 요구하는 바를 "계정 = 신뢰 경계"로 물리화한 셈이다. Security·Logging 계정을 워크로드 계정과 분리하는 이유가 바로 이것 — 워크로드 운영자가 자기 행위의 감사 로그를 지우지 못하게 해야 감사 무결성(audit integrity)이 성립한다. CloudTrail 로그를 별도 Log Archive 계정의 Object Lock S3에 보내는 설계는 SOX의 "기록은 생성자가 변경할 수 없어야 한다"는 요구의 직접 구현이다. 시험에서 "운영자가 로그를 못 지우게"가 보이면 별도 계정 + Object Lock이 정답 신호다.

> 🔍 **더 깊이**: SCP는 **권한을 부여하지 않는다 — 오직 상한선(permission ceiling)을 정할 뿐이다.** 이것이 가장 흔한 오해다. SCP에서 `Allow`를 써도 사용자에게 권한이 생기지 않는다. 실제 권한은 IAM 정책이 부여하고, SCP는 그 위에 "여기까지만"이라는 천장을 씌운다. 즉 최종 유효 권한 = (IAM이 허용한 것) ∩ (SCP가 허용한 것)이다. `DenyRegions` SCP로 EU 외 리전을 막으면, 그 계정의 root 사용자조차 us-east-1에 리소스를 못 만든다 — root도 SCP 위에 있지 못하기 때문이다(관리 계정 자체는 예외). 시험에서 "root 사용자도 막아야 한다"가 보이면 IAM Policy(C)가 아니라 SCP(B)가 정답인 이유가 이것이다.

> ⚠️ **함정**: SCP는 **관리 계정(management account)에는 적용되지 않는다.** 그래서 보안 모범 사례는 관리 계정에서 워크로드를 절대 운영하지 않고, 오직 Organizations 관리에만 쓰는 것이다. 또 SCP는 서비스 연결 역할(service-linked role)과 일부 글로벌 서비스에 예외가 있다. "SCP로 모든 것을 막을 수 있다"고 외우면 함정에 빠진다 — SCP는 IAM 주체(principal)의 행위만 제한하지, 리소스 기반 정책으로 들어오는 크로스 계정 접근까지 다 막지는 못한다.

### Control Tower와 Landing Zone

Control Tower는 이 모든 것(Organizations·SCP·IAM Identity Center·CloudTrail·Config·Log Archive·Audit 계정)을 **버튼 하나로 표준 착륙장으로 구축**해주는 오케스트레이션 서비스다. 핵심은 **가드레일(guardrail)** — Control Tower가 제공하는 사전 정의된 통제로, 예방적(Preventive, SCP 기반)과 탐지적(Detective, Config 기반)으로 나뉜다. Account Factory로 새 계정을 표준 템플릿에서 찍어내면, 모든 신규 계정이 자동으로 같은 보안 베이스라인을 상속한다.

> 📚 **사례**: 2019년 **Capital One 데이터 유출**(약 1억 600만 명의 신용카드 신청 정보)은 잘못 설정된 WAF와 과도한 권한의 IAM 역할이 결합해 발생했다 — 한 침입자가 SSRF로 EC2의 인스턴스 메타데이터에서 자격증명을 탈취해 S3를 읽었다. 이 사건의 교훈 중 하나가 **계정·권한 격리와 IMDSv2의 중요성**이다. 만약 데이터가 별도의 강하게 격리된 계정에 있고 권한 경계(Permission Boundary)가 채워졌다면 폭발 반경이 줄었을 것이다. 이후 AWS는 IMDSv2(토큰 기반)를 기본값으로 밀고, SCP로 IMDSv1을 강제 차단하는 패턴이 모범 사례가 됐다. 시험에서 "탈취된 자격증명의 횡적 이동 차단"이 보이면 계정 격리 + Permission Boundary + SCP를 떠올린다.

## 7R 마이그레이션 전략 — 워크로드마다 다른 길

AWS가 정리한 마이그레이션 7R은 단순한 용어 모음이 아니라 **각 워크로드를 어떻게 처리할지 결정하는 의사결정 트리**다. 원래 Gartner가 5R(2010)을 제시했고, AWS가 여기에 Relocate와 Retire를 더해 7R로 확장했다.

| 전략 | 의미 | 노력 | 클라우드 이점 | 대표 도구 |
|------|------|------|--------------|-----------|
| **Retire** | 폐기 (안 쓰는 것) | 최소 | 비용 즉시 절감 | (인벤토리 분석) |
| **Retain** | 보류 (당장 안 옮김) | 0 | - | - |
| **Rehost** | 리프트&시프트 | 낮음 | 빠른 이전 | **MGN** |
| **Relocate** | 하이퍼바이저 통째 이전 | 낮음 | VMware 그대로 | **VMware Cloud on AWS** |
| **Repurchase** | SaaS로 교체 | 중간 | 운영 부담 제거 | (예: SAP→S/4HANA Cloud) |
| **Replatform** | 약간 수정 (lift-tinker-shift) | 중간 | 관리형 활용 | DMS (Oracle→RDS) |
| **Refactor** | 클라우드 네이티브 재설계 | 최대 | 최대 이점 | DMS+SCT (Oracle→Aurora) |

> 🔍 **더 깊이**: 7R 선택은 **"비즈니스 가치 ÷ 노력"**의 최적화 문제다. Refactor는 클라우드의 이점(서버리스·관리형 DB·오토스케일)을 가장 크게 누리지만 가장 비싸고 위험하다. Rehost는 그 반대 — 빠르지만 온프레의 비효율을 그대로 가져온다. Pro 시험의 핵심 통찰은 **"6개월 데드라인" 같은 시간 제약이 있으면 우선 Rehost(MGN)로 옮긴 뒤, 클라우드 위에서 점진적으로 Replatform/Refactor한다**는 것이다. 이것이 "lift-and-shift then optimize" 패턴이다. 100TB Oracle을 처음부터 Aurora로 Refactor하려면 스키마 변환·앱 코드 수정·테스트에 수개월이 걸려 데드라인을 못 맞춘다. 그래서 시나리오에서 Oracle은 Rehost(RDS Oracle)로 빠르게 옮기고, 핵심 앱 DB만 골라 Refactor(Aurora PostgreSQL)하는 혼합 전략이 정답이 된다.

### MGN — 블록 레벨 복제의 마법

**AWS Application Migration Service(MGN)**는 온프레 서버에 에이전트를 설치하고 **블록 레벨로 디스크를 지속 복제**한다. 핵심은 **연속 복제(continuous replication)**다 — 소스가 살아 운영되는 동안 백그라운드로 데이터를 AWS의 staging 영역에 계속 동기화하다가, cutover 순간에만 짧게 멈추고 전환한다. 그래서 다운타임이 "마지막 델타 동기화 + 부팅" 시간으로 압축된다(보통 분 단위).

> 💡 **관련 이론**: MGN의 블록 레벨 연속 복제는 본질적으로 **비동기 복제 + CDP(Continuous Data Protection)**의 결합이다. 원리상 DR 서비스인 **AWS Elastic Disaster Recovery(DRS)**와 동일한 엔진(CloudEndure 기반)을 쓴다 — MGN은 "한 번 옮기고 끝"이고, DRS는 "계속 복제하며 대기"한다는 목적만 다를 뿐 기술은 형제다. 그래서 시험에서 "최소 다운타임 + OS 통째 이전"은 MGN, "지속 복제하며 DR 대기"는 DRS로 갈린다. DataSync(파일/객체)·DMS(DB 스키마/데이터)와 혼동하면 안 된다 — MGN은 **서버 전체(OS+앱+데이터)**를 옮긴다.

> ⚠️ **함정**: 100TB를 네트워크로 옮길 때 **대역폭이 곧 시간**이다. 10Gbps DX로 100TB를 전송해도 이론상 약 22시간(실효는 더 길다)이 걸린다. 초기 대량 데이터는 **Snowball Edge**로 물리 운송하고, 이후 델타만 MGN/DataSync로 온라인 동기화하는 하이브리드가 현실적이다. "단일 도구로 100TB를 6개월 안에"라고 단순화하면 대역폭 함정에 빠진다. 시험에서 "수십~수백 TB + 제한된 대역폭"이 보이면 Snow 패밀리 + 온라인 델타 조합을 의심하라.

## 데이터 주권 — SCP 한 줄 뒤의 법

시나리오의 "EU 데이터는 EU 밖으로 이동 불가"는 기술 요구가 아니라 **법적 요구**다. 그 뿌리는 2018년 발효된 **GDPR(General Data Protection Regulation, EU 일반 개인정보보호법)**이다. GDPR은 개인정보의 EU 역외 이전을 엄격히 제한하며, 위반 시 전 세계 매출의 최대 4% 또는 2천만 유로 중 큰 금액을 과징금으로 물릴 수 있다. 이 법적 위험을 기술 통제로 강제하는 것이 `aws:RequestedRegion`을 조건으로 한 **SCP DenyRegions**다.

> 🔍 **더 깊이**: 데이터 주권(data sovereignty)은 데이터 잔존성(data residency)보다 넓은 개념이다. Residency는 "데이터가 물리적으로 어디 저장되나"이고, Sovereignty는 "어느 나라의 법이 그 데이터를 지배하나"까지 포함한다. 미국 **CLOUD Act(2018)**는 미국 기업에게 데이터가 어느 나라에 있든 영장에 응하라고 요구할 수 있어, EU 입장에서는 "미국 클라우드에 EU 데이터를 두면 미국 법이 닿을 수 있다"는 우려가 생긴다. 이에 AWS는 **AWS European Sovereign Cloud**(2024 발표, 독일 운영, EU 인력·EU 법인 운영)로 답했다. 시험에서 "EU 데이터 + 미국 법 격리"의 강한 주권 요구가 보이면 단순 리전 제한을 넘어 Sovereign Cloud 개념이 등장할 수 있다.

| 개념 | 질문 | AWS 통제 |
|------|------|----------|
| **Data Residency** | 데이터가 어디 저장되나 | SCP DenyRegions, S3 리전 고정 |
| **Data Sovereignty** | 어느 법이 지배하나 | Sovereign Cloud, 별도 파티션 |
| **Data Localization** | 특정 국가 내 필수 보관 | 해당국 리전, GovCloud |

## 하이브리드 네트워크 — DX·TGW의 이중화 설계

온프레 SAP/Oracle과 AWS를 잇는 것은 **Direct Connect(DX)**다. DX는 전용 광케이블로 인터넷을 거치지 않아 일관된 낮은 지연과 높은 대역폭을 준다. 그러나 단일 DX 회선은 단일 장애점(SPOF)이다 — 그래서 Pro 설계는 항상 **DX 2회선(서로 다른 DX 로케이션) + VPN 백업**으로 이중화하고, BGP로 자동 페일오버한다.

> 💡 **관련 이론**: 이 이중화 설계의 라우팅 동작은 **BGP(Border Gateway Protocol, RFC 4271)**가 결정한다. 평소엔 DX 경로의 AS-PATH가 짧아 우선되고, DX가 죽으면 BGP가 VPN 경로로 수렴(convergence)한다. 더 빠른 장애 감지를 위해 **BFD(Bidirectional Forwarding Detection, RFC 5880)**를 켜면, BGP 기본 홀드타임(수십 초) 대신 1초 이내에 링크 단절을 감지해 페일오버를 가속한다. AWS DX는 BFD를 권장하며, 시험에서 "DX 장애 시 빠른 VPN 전환"이 보이면 BGP + BFD가 정답 메커니즘이다.

**Transit Gateway(TGW)**는 다수의 VPC와 온프레를 허브-스포크로 묶는 라우팅 허브다. 과거엔 VPC를 일일이 Peering(메시 구조, N² 복잡도)으로 연결했지만, TGW는 중앙 허브로 O(N) 복잡도로 단순화한다. 다중 리전은 **DX Gateway**로 여러 리전의 TGW를 하나의 DX에 연결하고, **TGW Peering**으로 리전 간 TGW를 잇는다.

> 🎯 **시나리오**: "글로벌 제조사가 미주·EU·APAC 3개 리전에 각각 여러 VPC를 두고, 온프레 데이터센터 2곳과 모두 연결하되 EU↔미주 간 직접 트래픽은 차단해야 한다. 어떤 설계인가?" — 답: **리전별 TGW + TGW Peering + TGW 라우트 테이블 분리**. 각 리전에 TGW를 두고 DX Gateway로 온프레를 연결한 뒤, TGW의 **여러 라우트 테이블을 써서 어떤 어태치먼트가 어디로 갈 수 있는지를 세분 제어**한다(EU 라우트 테이블에서 미주 어태치먼트로의 경로를 빼면 격리된다). 단일 라우트 테이블로는 이 격리가 안 된다. 시험에서 "TGW로 연결하되 일부 VPC 간 통신은 차단"이 보이면 다중 라우트 테이블 분리가 핵심이다.

## DR과 감사 — 시나리오의 마지막 두 기둥

DR 요구는 RTO 2시간·RPO 5분이다. 다중 리전 SQL에서 RPO 5분(실제로는 1초 미만)을 EU 내에서 충족하는 정답은 **Aurora Global Database**다(eu-central-1 ↔ eu-west-1, storage-level 비동기 복제). DDB가 필요한 부분은 Global Tables로, 백업은 EU 리전 한정 Cross-Region Copy로 묶는다. 감사는 **CloudTrail Org Trail → Log Archive S3 + Object Lock 7년 WORM**이 핵심이다.

> 💡 **관련 이론**: "7년 변경 불가"는 SOX(Sarbanes-Oxley Act, 2002)와 SEC Rule 17a-4가 요구하는 **WORM(Write Once Read Many)** 보존의 직접 구현이다. S3 Object Lock의 **Compliance 모드**는 root 사용자조차 보존 기간 내 객체를 삭제·변경할 수 없게 만든다(Governance 모드는 특정 권한자가 우회 가능). SEC 17a-4는 명시적으로 WORM 저장을 요구했고, AWS는 Object Lock Compliance 모드가 이 규정을 충족함을 공식 문서화했다. 시험에서 "규제기관 요구·변경 절대 불가·7년"이 보이면 Object Lock **Compliance**(Governance 아님)가 정답이다.

## 정리하며

대규모 글로벌 마이그레이션은 **착륙장(Organizations·Control Tower·SCP) → 네트워크(DX 이중화·TGW·DX Gateway) → 마이그레이션(7R 의사결정·MGN·DMS+SCT) → 데이터 주권(SCP DenyRegions) → DR(Aurora Global) → 감사(Org Trail·Object Lock 7년)**가 한 덩어리로 맞물리는 설계다. 핵심 통찰은 (1) 계정은 가장 강한 격리 경계이고, (2) SCP는 권한을 주지 않고 천장만 씌우며 root도 막고, (3) 시간 제약이 있으면 Rehost 먼저 후 점진 최적화, (4) 데이터 주권은 GDPR/CLOUD Act라는 법에 뿌리를 둔다는 것이다.

SAP 시험 단골 매핑: (1) "EU 데이터 비EU 이동 차단·root도" → **SCP DenyRegions**, (2) "100여 대 서버 최소 다운타임" → **MGN(블록 레벨 연속 복제)**, (3) "Oracle→Aurora PostgreSQL" → **DMS + SCT(Refactor)**, (4) "7년 변경 불가 감사 로그" → **Object Lock Compliance**, (5) "다중 리전 SQL·RPO 분 단위" → **Aurora Global Database**, (6) "DX 장애 시 빠른 VPN 전환" → **DX 2회선 + VPN + BGP/BFD**, (7) "수십 TB + 제한 대역폭" → **Snowball + 온라인 델타**, (8) "TGW로 연결하되 일부 VPC 격리" → **다중 라우트 테이블**. 다음 day는 정반대 극단 — 3명짜리 스타트업이 비용 0에서 100배 확장을 노리는 서버리스 우선 설계를 파고든다.

---

## 📝 연습 문제

**문제 1.** 한 글로벌 기업이 EU 워크로드의 데이터를 EU 외부 리전으로 이동하지 못하게 강제하려 한다. 계정의 root 사용자조차 us-east-1에 리소스를 만들 수 없어야 한다. 가장 적합한 통제는?

A) 각 IAM 사용자에 리전 제한 IAM Policy 부여

B) SCP에 `aws:RequestedRegion` 조건의 DenyRegions 적용

C) Config Rule로 비EU 리전 리소스 탐지

D) VPC NACL로 비EU 트래픽 차단

**정답: B**

해설: SCP는 IAM 권한 위에 씌우는 권한 상한선(천장)으로, 해당 계정의 **root 사용자조차** 상한을 넘지 못하게 만든다(관리 계정 자체만 예외). `aws:RequestedRegion` 조건으로 EU 외 리전 API 호출을 Deny하면 누구도 그 리전에 리소스를 생성할 수 없다. A의 IAM Policy는 root에는 적용되지 않아 root가 우회할 수 있다. C의 Config는 탐지만 할 뿐 예방하지 못한다(사후). D의 NACL은 네트워크 트래픽 계층이라 리소스 생성 자체를 막지 못한다. 함정: "root도 막아야"가 보이면 IAM이 아니라 SCP다.

---

**문제 2.** 온프레 서버 약 100대를 다운타임을 최소화하며 AWS로 옮긴다. OS·앱·데이터를 통째로 이전해야 하고, cutover 전까지 소스는 계속 운영된다. 가장 적합한 도구는?

A) AWS DataSync

B) AWS DMS

C) AWS Application Migration Service(MGN)

D) AWS Snowball만 사용

**정답: C**

해설: MGN은 소스 서버에 에이전트를 설치해 **블록 레벨로 디스크를 연속 복제**하며, 소스가 운영되는 동안 백그라운드로 동기화하다 cutover 순간에만 짧게 멈춘다 — 다운타임이 "마지막 델타 + 부팅"으로 압축된다(분 단위). 서버 전체(OS+앱+데이터)를 옮긴다는 점이 핵심이다. A의 DataSync는 파일·객체 전송용이라 서버 전체를 옮기지 않는다. B의 DMS는 DB 스키마·데이터 마이그레이션용이다. D의 Snowball 단독은 대량 초기 데이터 운송에는 좋지만 연속 복제·최소 다운타임 cutover를 제공하지 않는다. 함정: "OS 통째 + 최소 다운타임"은 MGN, "지속 복제 후 DR 대기"는 DRS다.

---

**문제 3.** Oracle 데이터베이스를 운영 부담을 줄이고 라이선스 비용을 없애기 위해 Aurora PostgreSQL로 전환하려 한다. 스키마와 저장 프로시저의 변환도 필요하다. 가장 적합한 조합은?

A) MGN으로 DB 서버 리호스트

B) DMS + Schema Conversion Tool(SCT)

C) RDS Oracle로 Rehost 후 종료

D) Snowball로 덤프 운송

**정답: B**

해설: 이종 엔진 간 전환(Oracle→PostgreSQL)은 **Refactor/Replatform**이며, 스키마·저장 프로시저·함수의 SQL 방언 차이를 변환해야 한다. **SCT(Schema Conversion Tool)**가 스키마·코드를 자동 변환(불가능한 부분은 리포트)하고, **DMS**가 실제 데이터를 지속 복제하며 최소 다운타임 cutover를 지원한다. A는 OS를 옮길 뿐 엔진 전환이 아니다. C는 Oracle을 그대로 유지(라이선스 비용 잔존)해 목표에 반한다. D는 일회성 덤프라 지속 동기화·cutover가 없다. 함정: "이종 엔진 전환 + 스키마 변환"은 DMS+SCT의 직답이다.

---

**문제 4.** 금융 규제기관이 거래 감사 로그를 7년간 **누구도(관리자·root 포함) 변경·삭제할 수 없게** 보관하라고 요구한다. 가장 적합한 설정은?

A) S3 Versioning + 버킷 정책

B) S3 Object Lock **Compliance** 모드 7년 보존

C) S3 Object Lock **Governance** 모드 7년 보존

D) Glacier Deep Archive 7년

**정답: B**

해설: Object Lock **Compliance** 모드는 보존 기간 내 객체를 **root 사용자조차** 삭제·변경할 수 없게 강제해, SEC Rule 17a-4·SOX가 요구하는 WORM(Write Once Read Many)을 충족한다. C의 **Governance** 모드는 `s3:BypassGovernanceRetention` 권한을 가진 주체가 우회할 수 있어 "누구도 변경 불가" 요건에 미달한다 — 이 둘의 구분이 핵심 함정이다. A의 Versioning은 이전 버전을 남기지만 삭제 자체를 막지 못한다. D의 Glacier는 저렴한 보관이지만 그 자체로 변경 불가를 보장하지 않는다(Vault Lock 별도 필요). 함정: "규제·절대 변경 불가"는 Governance가 아니라 Compliance다.

---

**문제 5.** 글로벌 제조사가 미주·EU·APAC 리전의 다수 VPC를 TGW로 연결하되, EU VPC와 미주 VPC 간 직접 통신은 차단해야 한다. 가장 적합한 접근은?

A) 모든 VPC를 단일 TGW 라우트 테이블에 연결

B) TGW에 여러 라우트 테이블을 만들고 어태치먼트별로 경로를 분리

C) VPC Peering을 전부 메시로 구성

D) 각 VPC에 NACL로 상대 CIDR 차단

**정답: B**

해설: TGW는 **여러 라우트 테이블**을 지원하며, 각 VPC 어태치먼트를 어떤 라우트 테이블에 연결하느냐로 통신 범위를 세분 제어한다. EU 어태치먼트의 라우트 테이블에서 미주 VPC 경로를 빼면 EU↔미주 직접 통신이 라우팅 단계에서 차단된다 — 중앙 집중·확장 가능한 격리다. A의 단일 라우트 테이블은 모든 어태치먼트가 서로 보이게 되어 격리가 안 된다. C의 메시 Peering은 N² 복잡도로 관리가 폭발하고 TGW의 이점을 버린다. D의 NACL은 운영 부담이 크고 수십 개 VPC에 일관 적용이 어렵다. 함정: "TGW 연결 + 일부 격리"는 다중 라우트 테이블이다.

---

**문제 6.** 온프레와 AWS를 Direct Connect로 연결하되, DX 회선 장애 시 1초 이내에 백업 VPN으로 자동 전환되어야 한다. 가장 적합한 구성은?

A) 단일 DX + 수동 페일오버

B) DX 2회선 + VPN 백업 + BGP에 BFD 활성화

C) VPN만 2개 구성

D) Internet Gateway 경유 라우팅

**정답: B**

해설: 고가용 하이브리드는 서로 다른 DX 로케이션의 **DX 2회선 + VPN 백업**으로 이중화하고, **BGP**로 동적 라우팅을 구성한다. 평소엔 AS-PATH가 짧은 DX가 우선되고 장애 시 VPN으로 수렴한다. 기본 BGP 홀드타임(수십 초) 대신 **BFD(RFC 5880)**를 켜면 1초 이내에 링크 단절을 감지해 페일오버를 가속한다. A는 SPOF이고 수동 전환은 느리다. C는 DX의 일관된 저지연·고대역폭을 포기한다. D는 전용 회선이 아니라 일관된 성능·보안을 보장하지 못한다. 함정: "1초 이내 빠른 전환"은 BGP + BFD다.

---

**문제 7.** 6개월 데드라인으로 온프레 Oracle 100TB를 옮겨야 한다. 핵심 분석 DB만 Aurora로 재설계하고 나머지는 빠르게 옮긴 뒤 클라우드에서 점진 최적화하려 한다. 가장 적합한 전략 조합은?

A) 모든 DB를 처음부터 Aurora로 Refactor

B) 나머지는 RDS Oracle로 Rehost, 핵심 분석 DB만 DMS+SCT로 Refactor

C) 전부 Snowball로 운송 후 EC2에 수동 복원

D) 전부 Retain (보류)

**정답: B**

해설: 시간 제약이 있으면 Pro의 정석은 **"우선 빠르게 옮기고(Rehost) 클라우드 위에서 점진 최적화(Replatform/Refactor)"**다. 100TB 전체를 처음부터 Aurora로 Refactor하면 스키마 변환·앱 수정·테스트에 수개월이 걸려 데드라인을 못 맞춘다. 따라서 대부분은 RDS Oracle로 Rehost해 빠르게 이전하고, 비즈니스 가치가 높은 핵심 분석 DB만 골라 DMS+SCT로 Refactor하는 혼합이 최적이다. A는 데드라인 리스크가 크다. C는 수동 복원이라 비효율·고위험이다. D는 마이그레이션을 안 하는 것이다. 함정: "데드라인 + 점진 최적화"는 Rehost 먼저, 선택적 Refactor다.

---

