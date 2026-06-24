# Day 2 - Amazon Detective: 핀딩 조사·근본원인, 동작 그래프, GuardDuty 연계

GuardDuty가 "무언가 잘못됐다"고 알려주면, 그 다음 질문은 항상 같다: **"정말 침해인가? 어디까지 번졌나? 어떻게 시작됐나?"** 이 *조사(investigation)* 단계가 Amazon Detective의 영역이다. GuardDuty가 *탐지(detect)*라면 Detective는 *조사(investigate)*다 — 핀딩 하나를 받아 그 주변의 행위 전체를 시각화하고, 근본 원인(root cause)과 영향 범위(blast radius)를 추적한다.

Detective의 핵심은 "흩어진 로그를 분석가가 손으로 짜맞추는 SQL 노가다를, 자동으로 구축된 **동작 그래프(behavior graph)**로 대체한다"는 것이다. 인시던트 조사에서 가장 비싼 자원은 분석가의 시간이다. Detective는 평소(수십 일치)의 데이터를 미리 그래프로 연결·집계해두어, 핀딩이 나온 순간 분석가가 "이 IAM 역할이 평소와 다르게 행동했나?", "이 IP는 언제부터 우리 환경과 통신했나?"를 클릭 몇 번으로 답하게 한다.

## 무엇을 먹고 무엇을 만드는가

Detective는 GuardDuty와 유사한 소스를 *조사 목적으로* 다시 수집·연결한다:

```
입력 소스
  ├─ VPC Flow Logs
  ├─ CloudTrail 관리 이벤트
  ├─ GuardDuty 핀딩
  ├─ EKS 감사 로그
  └─ (Detective가 내부적으로 정규화·연결)

출력
  └─ Behavior Graph(동작 그래프): 엔티티(Entity) + 관계(Relationship)
```

- **엔티티(Entity)**: IAM 사용자/역할, EC2 인스턴스, IP 주소, AWS 계정, 컨테이너, 유저 에이전트, S3 버킷 등 — 조사 대상이 되는 "노드".
- **관계(Relationship)**: "이 역할이 이 인스턴스에서 assume 됐다", "이 IP가 이 인스턴스와 통신했다" 같은 "엣지".

Detective는 이 그래프에 **시간축 + 베이스라인**을 입힌다. 즉 각 엔티티의 *평소 행동 프로파일*을 만들어두고, 핀딩 시점의 행동이 평소 대비 얼마나 벗어났는지를 보여준다.

> 💡 **관련 이론**: 이것이 보안 운영의 *triage(분류)*와 *root cause analysis*를 데이터로 푸는 방식이다. 전통적 SIEM은 분석가가 쿼리를 직접 작성해 상관관계를 찾지만, Detective는 *그래프 데이터 모델*로 엔티티 간 연결을 미리 구체화(materialize)해둔다. "이 자격증명이 처음 보는 지역에서 처음 보는 API를 호출했다" 같은 *최초 발생(first-time observation)*은 침해 조사의 핵심 신호인데, Detective는 이를 자동 하이라이트한다.

## 핀딩에서 조사로: 시각적 워크플로

조사는 보통 GuardDuty 핀딩 또는 Security Hub에서 시작해, "Investigate in Detective"로 점프한다:

```
GuardDuty 핀딩 (예: 비정상 API 호출)
   │  "Investigate in Detective"
   ▼
Detective: 해당 엔티티(IAM 역할) 프로파일 페이지
   ├─ API 호출량 시계열 (평소 vs 지금 — 급증?)
   ├─ 호출 위치(지역/IP) — 새 지역?
   ├─ 사용된 유저 에이전트 — 새 도구(예: 스크립트)?
   ├─ 연관 인스턴스·IP — 어디서 assume 됐나?
   └─ 시간 범위 슬라이더로 사건 전후 비교
```

분석가는 이 프로파일을 통해 "정상 운영의 우연한 급증"인지 "탈취된 자격증명의 악용"인지를 판단한다. 핵심 질문 패턴:
- **언제 처음 봤나** — 새 IP/지역/에이전트의 첫 등장 시점.
- **얼마나 벗어났나** — 호출량·실패율의 베이스라인 대비 편차.
- **어디까지 번졌나** — 한 엔티티에서 연결된 다른 엔티티(횡적 이동, lateral movement).

> ⚠️ **함정**: Detective는 *탐지*나 *차단*을 하지 않는다. 새 핀딩을 만들지 않고(그건 GuardDuty), 트래픽을 막지도 않는다(그건 WAF/SG). Detective는 *이미 있는* 핀딩·로그를 *조사·설명*하는 도구다. "위협을 자동 탐지하라"의 답은 GuardDuty이고, "핀딩의 근본 원인을 조사하라"의 답이 Detective다.

## GuardDuty와의 연계: 짝꿍 관계

Detective는 단독으로도 쓰지만, GuardDuty와 짝을 이룰 때 진가를 낸다:

```
GuardDuty (탐지)  ──핀딩──▶  Security Hub (집계)
     │                            │
     │  (둘 다 Detective 동작 그래프에 연결)
     ▼                            ▼
        Amazon Detective (조사)
        - GuardDuty 핀딩을 그래프 컨텍스트에 매핑
        - 핀딩 주변 행위 자동 수집·시각화
        - "이 핀딩이 다른 핀딩과 같은 자격증명/IP를 공유하나" 상관
```

- GuardDuty 핀딩이 Detective 그래프의 엔티티에 자동 연결되어, 핀딩 클릭 한 번으로 조사 컨텍스트로 진입.
- 여러 핀딩이 *같은 엔티티(IP, 역할)*를 공유하면 Detective가 이를 묶어 "캠페인" 수준으로 보게 함.
- **Finding groups**: Detective는 관련된 여러 핀딩·엔티티를 자동 그룹핑해 단일 조사 단위로 제시(개별 핀딩의 노이즈를 줄임).

> 💡 **관련 이론**: 이는 *alert fatigue(경보 피로)* 문제의 해법이다. 탐지 도구가 핀딩을 수백 개 쏟아내면 분석가는 마비된다. Detective의 finding group은 단일 공격 캠페인에서 파생된 다수 핀딩을 하나로 묶어 "조사할 단위"를 줄인다 — SOC 운영의 신호 대 잡음비를 높이는 핵심 메커니즘이다.

## 멀티계정 조사

Detective도 GuardDuty와 동일한 **Organizations + 위임 관리자** 모델을 쓴다. 권장 구성은 GuardDuty와 *같은* Security Tooling 계정을 Detective 위임 관리자로 지정하는 것이다:

```
관리 계정 ──지정──▶ Detective 위임 관리자(Security Tooling 계정)
                          │
                          └─ 조직 전 계정 데이터를 단일 동작 그래프로 통합
```

- 멤버 계정의 데이터가 *하나의* 동작 그래프에 모여, 계정 경계를 넘는 횡적 이동(예: 한 계정에서 탈취된 역할이 다른 계정 리소스에 접근)을 추적할 수 있다.
- GuardDuty·Security Hub·Detective의 위임 관리자를 동일 계정으로 정렬하면 조사 경험이 매끄럽다(데이터·권한 일관).

> ⚠️ **함정**: Detective를 켜면 즉시 풍부한 그래프가 생기는 게 아니다. 베이스라인을 형성하려면 **데이터 축적 기간(보통 2주 이상)**이 필요하다. "방금 Detective를 켰는데 과거 행위가 안 보인다"는 정상 — 활성화 *이후*부터 데이터를 쌓는다. 그래서 사고 *전에* 미리 켜두는 것이 모범이다.

## Detective Investigations(자동 조사)

최신 Detective는 IAM 사용자/역할에 대한 **자동 조사(Detective Investigations)**를 제공한다. 특정 자격증명을 지정하면, Detective가 MITRE ATT&CK 전술에 매핑해 의심 행위(권한 상승, 정찰 등)를 자동 분석하고 위험 요약을 생성한다. 분석가가 일일이 그래프를 파지 않아도 "이 역할이 위험한가"를 빠르게 판단할 단서를 준다.

> 🔍 **더 깊이**: 탐지-조사-대응 파이프라인에서 Detective의 위치를 정확히 잡는 것이 시험·실무 모두의 핵심이다. *탐지(GuardDuty)*는 "이상 신호"를, *집계(Security Hub)*는 "한 화면 모음"을, *조사(Detective)*는 "왜·어디까지·어떻게"를, *대응(EventBridge/Lambda/SSM)*은 "조치"를 담당한다. Detective를 "또 다른 탐지 도구"로 착각하면 시험에서 함정에 빠진다 — Detective는 핀딩을 *만들지 않고 설명한다*.

## 자주 틀리는 구분

- **Detective vs GuardDuty**: GuardDuty는 탐지(핀딩 생성), Detective는 조사(핀딩 설명·근본원인). Detective는 핀딩을 만들지 않는다.
- **Detective vs CloudTrail Lake/Athena**: Athena/CloudTrail Lake는 *수동 쿼리* 분석(SQL), Detective는 *미리 구축된 그래프*로 시각적 조사. Detective는 베이스라인·관계를 자동 제공.
- **Detective vs Security Hub**: Security Hub는 다수 도구의 핀딩을 *집계·표준화(ASFF)*, Detective는 *깊은 조사*. 집계 vs 심층.
- **Detective vs Inspector**: Inspector는 취약점(약점), Detective는 사건 조사(행위). 완전히 다른 축.

## 한 줄 요약 체크리스트

- [ ] 사고 *전에* Detective를 켜 베이스라인을 미리 축적했는가
- [ ] GuardDuty·Security Hub와 같은 Security Tooling 계정에 Detective 위임 관리자를 정렬했는가
- [ ] 핀딩에서 "Investigate in Detective"로 조사 컨텍스트에 진입하는 워크플로를 갖췄는가
- [ ] finding group으로 관련 핀딩을 묶어 경보 피로를 줄이는가
- [ ] Detective를 탐지/차단이 아닌 조사 도구로 정확히 포지셔닝했는가

---

## 📝 연습 문제

**문제 1.** GuardDuty가 IAM 역할에 대한 비정상 API 호출 핀딩을 생성했다. 보안 분석가는 "이 자격증명이 언제부터 새 지역에서 활동했고, 어떤 리소스까지 접근했는지" 근본 원인과 영향 범위를 빠르게 파악하려 한다. 가장 적절한 도구는?

A) Amazon Inspector  
B) Amazon Detective  
C) AWS Config  
D) Amazon Macie  

**정답: B**  
해설: 핀딩의 근본 원인·영향 범위를 동작 그래프로 시각화해 "최초 발생 시점, 새 지역·IP, 연관 엔티티"를 추적하는 것은 Detective의 정확한 용도다. Inspector는 취약점 스캔, Config는 리소스 구성 이력, Macie는 S3 민감 데이터 분류로 모두 행위 기반 인시던트 조사와는 다른 목적이다.

---

**문제 2.** 팀이 침해 의심 후 Amazon Detective를 처음 활성화했는데, 사건 발생 이전의 풍부한 행위 데이터가 그래프에 보이지 않는다. 그 이유로 옳은 것은?

A) Detective가 잘못 구성되었다  
B) Detective는 활성화 이후부터 데이터를 축적하므로 베이스라인 형성에 시간이 필요하며, 사고 전 미리 켜두는 것이 모범이다  
C) Detective는 VPC Flow Logs만 분석하기 때문이다  
D) 위임 관리자를 지정하지 않았기 때문이다  

**정답: B**  
해설: Detective는 활성화 시점부터 데이터를 수집·연결하며 의미 있는 베이스라인을 만드는 데 보통 2주 이상이 걸린다. 따라서 사고가 터진 뒤 켜면 과거 컨텍스트가 부족하고, 사고 이전에 상시 켜두는 것이 정답이다. 구성 오류·소스 제한·위임 관리자 미지정 때문이 아니라 데이터 축적 특성 때문이다.

---

**문제 3.** Amazon Detective의 역할에 대한 설명으로 옳은 것은?

A) 자체적으로 새로운 위협 핀딩을 생성하고 악성 트래픽을 차단한다  
B) 기존 핀딩과 로그를 동작 그래프로 연결해 조사·근본원인 분석을 돕지만, 핀딩 생성이나 차단은 하지 않는다  
C) S3 버킷의 PII를 자동 분류한다  
D) EC2와 ECR의 CVE를 스캔한다  

**정답: B**  
해설: Detective는 조사 전용 도구로, GuardDuty가 만든 핀딩과 로그를 그래프로 묶어 "왜·어디까지·어떻게"를 분석한다. 핀딩 생성은 GuardDuty, 차단은 WAF/SG, PII 분류는 Macie, CVE 스캔은 Inspector의 역할이다. Detective를 탐지/차단 도구로 오인하는 것이 대표적 함정이다.

---

**문제 4.** SOC 분석가들이 GuardDuty 핀딩 폭증으로 경보 피로를 겪는다. Detective의 어떤 기능이 관련 핀딩·엔티티를 단일 조사 단위로 묶어 신호 대 잡음비를 높여 주는가?

A) Trusted IP list  
B) Finding groups  
C) Malware Protection  
D) Macie 분류  

**정답: B**  
해설: Detective의 finding groups는 같은 자격증명·IP 등 공통 엔티티를 공유하는 다수 핀딩을 하나의 조사 단위로 자동 그룹핑해 경보 피로를 줄인다. Trusted IP list는 GuardDuty의 핀딩 억제 설정이고, Malware Protection은 멀웨어 스캔, Macie는 데이터 분류로 핀딩 그룹핑과 무관하다.

---

**문제 5.** 한 계정에서 탈취된 IAM 역할이 다른 계정의 리소스에 접근한 횡적 이동(lateral movement)을, 계정 경계를 넘어 단일 화면에서 추적하려 한다. 가장 적절한 Detective 구성은?

A) 각 계정에서 Detective를 개별로 켜고 따로 조사  
B) Organizations 위임 관리자(Security Tooling 계정)로 모든 계정 데이터를 단일 동작 그래프에 통합  
C) Detective 대신 각 계정에서 CloudTrail을 Athena로 수동 쿼리  
D) GuardDuty만으로 충분하므로 Detective는 불필요  

**정답: B**  
해설: 계정 경계를 넘는 횡적 이동 추적은 모든 멤버 계정 데이터를 하나의 동작 그래프로 통합해야 가능하며, 이는 Organizations 위임 관리자 모델(GuardDuty·Security Hub와 동일 계정 정렬)로 달성한다. 계정별 개별 조사나 수동 Athena 쿼리는 통합 시야가 없어 비효율적이고, GuardDuty만으로는 깊은 조사·상관이 부족하다.

---
