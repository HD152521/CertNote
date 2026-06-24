# Day 3 - Amazon Inspector: EC2/ECR/Lambda 취약점 스캔, CVE, 자동 평가

GuardDuty가 "지금 누군가 악성 행위를 한다"를 본다면, Amazon Inspector는 "악용당하기 *전*에, 어디가 약한가"를 본다. 즉 GuardDuty가 *위협(threat)* 탐지라면 Inspector는 *취약점(vulnerability)* 탐지다. 두 시점은 다르다 — 취약점은 잠재적 약점이고, 위협은 그 약점을 노리는(또는 다른 경로로 들어오는) 실제 활동이다. 보안 운영은 둘 다 필요하다: 약점을 줄이고(Inspector), 뚫리면 잡는다(GuardDuty).

Inspector(현행 Amazon Inspector, 흔히 "Inspector v2")의 본질은 "리소스를 **자동·지속적으로(continuous)** 스캔해 알려진 취약점(CVE)과 위험한 노출을 찾아내고, 환경 컨텍스트를 반영한 **우선순위 점수**를 매긴다"는 것이다. 과거 v1처럼 평가를 수동으로 돌리는 게 아니라, 활성화하면 새 리소스·새 CVE 공시에 맞춰 알아서 다시 스캔한다.

## 무엇을 스캔하는가: 세 가지 대상

```
Amazon Inspector 스캔 대상
  ├─ EC2 인스턴스        → OS 패키지 CVE + 네트워크 도달성(reachability)
  ├─ ECR 컨테이너 이미지 → 이미지 레이어의 OS/언어 패키지 CVE
  └─ Lambda 함수         → 함수 코드 + 의존성 패키지 CVE (+ 코드 취약점)
```

- **EC2**: 두 가지를 본다 — (1) 설치된 OS/애플리케이션 패키지의 **CVE**, (2) **네트워크 도달성 분석**(인터넷에서 이 포트에 닿을 수 있나). 도달 가능한 취약점은 더 위험하다.
- **ECR**: 푸시되는 컨테이너 이미지를 스캔. **on-push**(푸시 시 1회) + **continuous(지속 재스캔)** 옵션. 새 CVE가 공시되면 이미 푸시된 이미지를 다시 평가.
- **Lambda**: 함수의 의존성 패키지 취약점(standard scanning) + 선택적으로 코드 자체의 취약점(code scanning, 예: 하드코딩된 비밀·인젝션 패턴).

## 어떻게 스캔하는가: SSM 에이전트와 agentless

EC2 스캔에는 두 방식이 있다:
- **에이전트 기반**: **SSM Agent**(Systems Manager)를 통해 인스턴스 내부 패키지 인벤토리를 수집. SSM이 관리하는 인스턴스라면 추가 설치 없이 동작.
- **Agentless(에이전트리스)**: EBS 스냅샷을 떠서 분석(SSM 없는 인스턴스도 커버). Inspector가 하이브리드로 적절히 선택.

> ⚠️ **함정**: "EC2를 Inspector에 등록했는데 스캔이 안 된다"의 흔한 원인은 **SSM Agent 미설치/미관리 상태**다. 에이전트 기반 스캔은 인스턴스가 SSM으로 관리되어야 한다(SSM Agent 실행 + 적절한 인스턴스 프로파일 IAM 역할 + SSM 연결). 시험에서 "Inspector가 인스턴스를 스캔하지 못함 → SSM 관리 상태 확인"은 단골이다.

```
EC2 ── SSM Agent ── Systems Manager ── Inspector(패키지 인벤토리 수집·CVE 평가)
      또는
EC2 ── (SSM 없음) ── Inspector agentless(EBS 스냅샷 분석)
```

> 💡 **관련 이론**: 취약점 관리는 NIST의 *Identify(ID.RA, 위험 평가)* 기능에 속한다. 핵심은 "발견(discover) → 평가(assess) → 우선순위(prioritize) → 교정(remediate) → 검증(verify)"의 지속 루프다. 옛 Inspector는 *주기적 평가*였으나 현 Inspector는 *지속적*이다 — 이것이 중요한 이유는, 취약점 환경이 정적이지 않기 때문이다. 어제 깨끗하던 이미지가 오늘 새 CVE 공시로 취약해질 수 있다. continuous 스캔만이 "이미 배포된 자산의 새 위험"을 따라잡는다.

## CVE와 우선순위: Inspector score vs CVSS

Inspector는 발견된 취약점에 **CVE** 식별자와 **CVSS** 기본 점수를 붙인다. 그러나 단순 CVSS만으로 우선순위를 매기면 노이즈가 많다. Inspector는 환경 컨텍스트를 반영한 자체 **Inspector score**를 산출한다:

```
Inspector 우선순위 = CVSS 기본 점수
                   × 네트워크 도달성(인터넷에서 닿나?)
                   × 익스플로잇 가능성(알려진 exploit 존재?)
                   × ... 환경 컨텍스트
```

예: 동일 CVSS 9.0이라도 (a) 인터넷에 노출된 포트에서 도달 가능하고 공개 exploit이 있는 취약점은 최우선, (b) 격리된 서브넷의 도달 불가 취약점은 후순위. 이 *컨텍스트 기반 우선순위*가 분석가에게 "무엇부터 패치할지"를 알려준다.

> 💡 **관련 이론**: 이는 *risk-based vulnerability management(위험 기반 취약점 관리)*다. 취약점 수천 개를 한꺼번에 패치할 수는 없으므로, "악용 가능성 × 노출 × 영향"으로 위험을 가중해 우선순위를 정한다. CVSS는 취약점 *자체*의 심각도이고, Inspector score는 *우리 환경에서의* 위험이다 — EPSS(Exploit Prediction Scoring System)·KEV(알려진 악용 취약점) 같은 외부 신호도 이런 가중에 쓰인다.

## 자동 평가와 통합

Inspector의 운영 가치는 *자동화*에서 나온다:

```
Inspector(지속 스캔)
   │  발견(Finding)
   ├─▶ Security Hub (자동 통합, ASFF 표준화)
   ├─▶ EventBridge ──▶ Lambda/SSM(자동 패치·티켓·격리)
   └─▶ Inspector 콘솔(대시보드, 위험 점수 정렬)
```

- 새 리소스(EC2 시작, ECR 푸시, Lambda 배포) → 자동 스캔.
- 새 CVE 공시 → 영향받는 기존 자산 자동 재평가.
- 발견 → Security Hub 자동 집계 + EventBridge로 대응 자동화(예: SSM Patch Manager로 패치 자동 적용, 또는 Jira 티켓 생성).

> ⚠️ **함정**: ECR 스캔에서 **on-push만** 켜두면, 푸시 *시점*에는 깨끗했지만 *이후* 공시된 CVE에 취약해진 이미지를 놓친다. "오래된 이미지의 새 취약점을 따라잡아라"의 답은 **continuous(enhanced) scanning** 활성화 + 보존 기간 설정이다.

## 멀티계정: 위임 관리자 일관성

Inspector도 **Organizations + 위임 관리자** 패턴을 따른다. GuardDuty/Detective/Security Hub와 **동일한 Security Tooling 계정**을 Inspector 위임 관리자로 정렬하는 것이 멀티계정 베이스라인의 권장 구성이다:

```
관리 계정 ──지정──▶ Inspector 위임 관리자(Security Tooling 계정)
                          ├─ 조직 전 계정 Inspector 활성화 + auto-enable
                          ├─ 계정별 스캔 대상(EC2/ECR/Lambda) 중앙 정책
                          └─ 모든 발견 중앙 집계
```

> 🔍 **더 깊이**: Inspector를 단독 취약점 스캐너로 보면 "또 하나의 보고서 생성기"가 된다. 핵심은 *교정 루프*에 연결하는 것이다 — Inspector 발견 → Security Hub 집계 → EventBridge → SSM Patch Manager(자동 패치) 또는 ECR 이미지 재빌드 파이프라인(CI/CD에서 취약 이미지 배포 차단). 특히 CI/CD에서 ECR 스캔 결과를 게이트로 삼으면(critical CVE 있으면 배포 실패) "취약점이 프로덕션에 도달하기 전에" 막는 shift-left가 된다.

## 자주 틀리는 구분

- **Inspector vs GuardDuty**: Inspector는 *취약점*(악용 가능한 약점, 사전 예방), GuardDuty는 *위협*(실제 악성 활동, 탐지). 시점·대상이 다르다.
- **Inspector vs Patch Manager(SSM)**: Inspector는 *발견*(무엇이 취약한가), Patch Manager는 *교정*(패치 적용). Inspector가 진단, Patch Manager가 처방. 둘을 EventBridge로 연결.
- **Inspector vs Config**: Config는 *구성 규정 준수*(설정이 정책에 맞나), Inspector는 *소프트웨어 취약점*(CVE). 다른 축.
- **Inspector v1 vs 현행**: v1은 에이전트·수동 평가·규칙 패키지, 현행은 SSM/agentless·지속 스캔·자동. 현행이 기본.

## 한 줄 요약 체크리스트

- [ ] EC2/ECR/Lambda 스캔을 필요에 맞게 켜고, EC2는 SSM 관리 상태(또는 agentless)를 확인했는가
- [ ] ECR은 continuous 스캔으로 사후 공시 CVE까지 따라잡는가
- [ ] Inspector score(컨텍스트 기반 우선순위)로 도달 가능·익스플로잇 취약점부터 처리하는가
- [ ] 발견을 Security Hub·EventBridge·SSM Patch Manager에 연결해 교정을 자동화했는가
- [ ] 조직 위임 관리자(Security Tooling 계정)를 다른 탐지 서비스와 정렬했는가

---

## 📝 연습 문제

**문제 1.** 보안팀이 EC2 인스턴스를 Amazon Inspector에 등록했지만 일부 인스턴스가 스캔되지 않는다. 에이전트 기반 스캔을 사용 중일 때 가장 먼저 확인할 것은?

A) 인스턴스의 보안 그룹이 모든 포트를 열고 있는지  
B) 인스턴스가 SSM Agent 실행 + 적절한 IAM 인스턴스 프로파일로 Systems Manager 관리 상태인지  
C) 인스턴스에 퍼블릭 IP가 있는지  
D) 인스턴스가 us-east-1에 있는지  

**정답: B**  
해설: Inspector의 EC2 에이전트 기반 스캔은 인스턴스가 SSM으로 관리되어야 패키지 인벤토리를 수집할 수 있다. 따라서 SSM Agent 실행 여부와 SSM 권한을 가진 인스턴스 프로파일, SSM 연결 상태를 먼저 점검한다(또는 agentless 스캔으로 대체). 보안 그룹 개방·퍼블릭 IP·특정 리전은 스캔 가능 여부의 핵심 조건이 아니다.

---

**문제 2.** ECR에 저장된 컨테이너 이미지가 푸시 당시에는 취약점이 없었으나, 이후 새로 공시된 CVE에 취약해졌다. 이를 자동으로 따라잡으려면?

A) ECR 스캔을 on-push(1회)만 활성화한다  
B) ECR continuous(지속) 스캔을 활성화해 새 CVE 공시 시 기존 이미지를 자동 재평가한다  
C) 이미지를 매번 수동으로 다시 푸시한다  
D) GuardDuty Malware Protection을 켠다  

**정답: B**  
해설: on-push 스캔은 푸시 시점만 평가하므로 사후 공시 CVE를 놓친다. continuous 스캔은 새 CVE가 나올 때 이미 푸시된 이미지를 자동 재평가해 사후 취약점을 따라잡는다. 수동 재푸시는 비현실적이고, GuardDuty Malware Protection은 멀웨어 스캔이지 CVE 취약점 관리가 아니다.

---

**문제 3.** 동일하게 CVSS 9.0인 두 취약점 중 하나만 우선 패치하라는 요구가 있다. Amazon Inspector가 우선순위를 더 높게 매기는 쪽은?

A) 격리된 프라이빗 서브넷에 있어 인터넷에서 도달 불가능한 취약점  
B) 인터넷에서 도달 가능한 포트에 노출되고 공개 익스플로잇이 존재하는 취약점  
C) 두 취약점의 우선순위는 항상 동일하다  
D) 최근에 발견된 취약점이 무조건 우선이다  

**정답: B**  
해설: Inspector score는 CVSS 기본 점수에 네트워크 도달성과 익스플로잇 가능성 등 환경 컨텍스트를 곱해 위험을 가중한다. 같은 CVSS라도 인터넷 도달 가능 + 공개 exploit이 있는 취약점이 실제 위험이 훨씬 크므로 우선순위가 높다. 도달 불가능한 취약점은 후순위이고, 단순 발견 시점만으로 우선순위가 정해지지 않는다.

---

**문제 4.** Inspector 취약점 발견을 받아 영향받는 EC2 인스턴스에 자동으로 패치를 적용하는 교정 파이프라인을 구성하려 한다. 가장 적절한 연계는?

A) Inspector 발견 → EventBridge → SSM Patch Manager로 자동 패치 적용  
B) Inspector가 직접 인스턴스를 패치한다  
C) Inspector 발견 → Macie → 자동 패치  
D) Inspector → Detective → 자동 패치  

**정답: A**  
해설: Inspector는 발견(진단)만 하고 교정은 다른 서비스가 한다. 발견을 EventBridge로 받아 SSM Patch Manager(또는 Lambda)로 자동 패치를 적용하는 것이 정석적인 교정 자동화 파이프라인이다. Inspector가 직접 패치하지 않으며, Macie는 데이터 분류, Detective는 조사 도구로 패치 교정과 무관하다.

---

**문제 5.** Amazon Inspector와 GuardDuty의 역할 차이를 가장 정확히 설명한 것은?

A) 둘 다 동일하게 실시간 악성 트래픽을 차단한다  
B) Inspector는 악용 가능한 취약점(CVE 등)을 사전에 발견하고, GuardDuty는 실제 악성 활동(위협)을 탐지한다  
C) Inspector는 위협을, GuardDuty는 취약점을 다룬다  
D) Inspector는 S3 PII를 분류하고 GuardDuty는 CVE를 스캔한다  

**정답: B**  
해설: Inspector는 EC2/ECR/Lambda의 취약점(약점)을 사전에 찾아 우선순위화하고, GuardDuty는 자격증명 오남용·악성 통신 등 실제 위협 활동을 탐지한다 — 예방(약점 축소)과 탐지(공격 포착)의 보완 관계다. C는 역할이 뒤바뀌었고, 둘 다 트래픽을 차단하지 않으며, PII 분류는 Macie의 몫이다.

---
