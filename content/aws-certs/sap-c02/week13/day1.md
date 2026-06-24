# Day 1 - Well-Architected Framework 개요 — 6 기둥의 기원, WA Tool의 내부 동작, Lens의 설계 철학

새로운 아키텍트가 AWS 콘솔을 처음 열면 200개가 넘는 서비스 앞에서 마비된다. "RDS를 쓸까 Aurora를 쓸까, Multi-AZ를 켤까 말까, 이 IAM 정책이 충분히 안전한가"라는 수천 개의 결정이 쌓여 결국 하나의 아키텍처가 된다. 문제는 이 결정들이 대개 **암묵지(tacit knowledge)**로 남아, 다른 팀·다른 프로젝트로 전수되지 않는다는 점이다. Well-Architected Framework(이하 WA)는 AWS가 2012년부터 수만 건의 고객 아키텍처 리뷰를 진행하며 축적한 그 암묵지를 **6개의 기둥과 표준 질문지로 형식지(explicit knowledge)화**한 결과물이다.

SAP-C02 시험에서 WA는 단순 암기 대상이 아니라, 모든 시나리오 문제를 푸는 **사고의 프레임**이다. "운영 부담 최소"라는 단어가 보이면 Operational Excellence, "감사 추적"이면 Security, "RTO 5분"이면 Reliability로 즉답하는 매핑 능력이 Pro 합격의 절반이다. 오늘은 6 기둥이 왜 그렇게 묶였는지, WA Tool이 HRI를 어떻게 도출하는지, Lens가 어떤 설계 철학으로 도메인을 확장하는지를 깊이 있게 분해한다.

## 6 기둥의 기원 — 5개에서 6개로, 그리고 왜 이 분류인가

WA의 출발은 2015년 백서다. 당시는 5 기둥이었다: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization. 2021년 12월, AWS re:Invent에서 **Sustainability(지속 가능성)**가 6번째 기둥으로 추가됐다. 이 추가 시점은 우연이 아니다 — EU의 CSRD(기업 지속가능성 보고 지침)와 각국 탄소 규제가 본격화되며 클라우드 사용의 탄소 배출이 기업 ESG 보고의 의무 항목이 되던 시기였다.

기둥을 6개로 나눈 분류 자체가 시험의 핵심이다. 흔히 혼동하는 두 쌍을 먼저 못 박자. **Reliability vs Performance Efficiency** — Reliability는 "장애가 나도 버티고 복구하는가"(가용성·내결함성)이고, Performance는 "주어진 자원으로 얼마나 빠르고 효율적으로 처리하는가"(지연·처리량)다. Multi-AZ는 Reliability, 캐싱은 Performance다. **Cost vs Sustainability** — Cost는 "달러를 최소화"이고 Sustainability는 "탄소·전력을 최소화"다. 대개 같은 방향(유휴 자원 제거)이지만 항상 일치하지는 않는다.

> 💡 **관련 이론**: 이 6 기둥은 소프트웨어 공학의 **비기능 요구사항(NFR, Non-Functional Requirement)** 분류와 거의 일대일로 대응한다. ISO/IEC 25010(소프트웨어 품질 모델)은 신뢰성(Reliability), 성능 효율성(Performance Efficiency), 보안(Security), 유지보수성(Maintainability) 등 8개 품질 특성을 정의하는데, WA의 기둥 이름이 이 표준 용어를 그대로 차용했다. WA는 결국 "클라우드 아키텍처의 NFR을 어떻게 충족할 것인가"를 AWS 서비스 카탈로그에 매핑한 가이드다. ISO 25010을 알면 WA 기둥이 임의 분류가 아니라 수십 년 된 품질 공학 합의에 뿌리를 둔 것임을 알 수 있다.

> 🔍 **더 깊이**: 기둥이 "5개에서 6개로" 늘어난 역사는 시험에 직접 출제된다. Sustainability가 2021년 추가라는 사실, 그리고 그 이전 5 기둥 시절 자료에는 없다는 점을 기억해야 한다. 또한 WA Tool 내부적으로 각 기둥은 약 8~10개의 "질문(question)"으로 구성되고, 각 질문은 여러 개의 "베스트 프랙티스 선택지"를 가진다. 워크로드가 어떤 베스트 프랙티스를 충족하지 못하면 그 질문에 **risk가 표시**되고, 위험도에 따라 HRI(High Risk Issue) 또는 MRI(Medium Risk Issue)로 분류된다. 즉 HRI는 사람이 주관적으로 매기는 게 아니라 "베스트 프랙티스 미충족"이라는 규칙 기반으로 자동 산출된다.

## 다른 클라우드의 동등 프레임워크 — AWS만의 발명이 아니다

WA가 클라우드 아키텍처 가버넌스의 사실상 표준이 되자 경쟁 클라우드도 동등한 프레임워크를 내놨다. 시험에는 직접 안 나오지만, 멀티 클라우드 환경을 설계하는 Pro 아키텍트라면 이 대응 관계를 알아야 한다.

| 프레임워크 | 제공사 | 기둥 수 | 특징 |
|-----------|--------|--------|------|
| **Well-Architected Framework** | AWS (2015) | 6 | 가장 먼저 시작, WA Tool로 자동화, Lens 생태계 가장 풍부 |
| **Azure Well-Architected Framework** | Microsoft | 5 | Cost·Security·Reliability·Performance·Operational Excellence (Sustainability 별도 가이드) |
| **Cloud Architecture Framework** | Google Cloud | 6 | System design·Operational excellence·Security·Reliability·Cost·Performance |
| **(전통) ITIL / COBIT** | 비클라우드 | - | 프로세스·거버넌스 중심, 아키텍처 의사결정은 약함 |

> 💡 **관련 이론**: AWS WA가 ITIL·COBIT 같은 전통 IT 거버넌스와 결정적으로 다른 점은 **추상화 수준**이다. ITIL은 "변경 관리 프로세스를 어떻게 운영하는가" 같은 조직·프로세스 레벨을 다루는 반면, WA는 "이 워크로드가 Multi-AZ인가, KMS로 암호화되는가" 같은 **구체적 아키텍처 결정**을 다룬다. 그래서 WA는 ITIL을 대체하는 게 아니라 보완한다 — 조직은 ITIL로 프로세스를 돌리고, 그 안에서 개별 워크로드는 WA로 점검한다. 시험에서 "거버넌스 프로세스"와 "아키텍처 리뷰"를 구분하는 문제가 나오면 이 차이를 떠올려야 한다.

## WA Tool의 내부 동작 — 워크로드, Milestone, Lens

WA Tool은 콘솔(또는 API)에서 무료로 제공되는 매니지드 서비스다. 동작 흐름을 정확히 알아야 시험의 "어떤 단계에서 무엇이 산출되나" 문제를 푼다.

```
[1] 워크로드 정의 (이름·환경·리전·소유자)
        ↓
[2] Lens 선택 (기본 AWS Lens + 도메인 Lens 0~N개)
        ↓
[3] 기둥별 질문 답변 (각 베스트 프랙티스 체크)
        ↓
[4] HRI(High Risk Issue) / MRI(Medium Risk Issue) 자동 도출
        ↓
[5] Improvement Plan 생성 (AWS 문서·솔루션 링크 포함)
        ↓
[6] Milestone 저장 (시점 스냅샷) → 개선 후 재평가 → 추이 비교
```

여기서 시험이 사랑하는 두 개념이 **Milestone**과 **Lens**다. **Milestone**은 특정 시점의 답변 상태를 통째로 동결한 스냅샷이다. 1차 리뷰에서 HRI가 23개였다가 분기 후 8개로 줄었다면, 두 Milestone을 비교해 개선 추이를 정량적으로 보여줄 수 있다. Git의 커밋·태그와 같은 발상이다 — 가변 상태(현재 답변)에 불변 스냅샷(Milestone)을 박아 시간축 비교를 가능하게 한다.

> 💡 **관련 이론**: Milestone은 함수형 프로그래밍의 **불변성(immutability)**과 **이벤트 소싱(event sourcing)** 사고와 같다. 현재 상태만 들고 있으면 "어떻게 여기까지 왔는가"를 알 수 없지만, 시점 스냅샷을 누적하면 변화의 궤적을 재구성할 수 있다. AWS Config의 configuration timeline, CloudFormation의 stack 버전도 같은 패턴이다. 시험에서 "WA 개선 추이를 추적·보고하려면?"이 보이면 Milestone이 정답 신호다.

> 🔍 **더 깊이**: WA Tool은 **Trusted Advisor**와 양방향으로 연동된다. Trusted Advisor는 비용·성능·보안·내결함성·서비스 한도 5개 카테고리를 **자동 체크**하는 도구이고, WA Tool은 그보다 광범위한 **질문 기반 정성 평가**다. 둘의 관계는 "자동 스캔(TA) vs 구조화된 인터뷰(WA)"로 이해하면 된다. 최신 WA Tool은 일부 질문에 Trusted Advisor 체크 결과를 자동으로 끌어와 답을 미리 채워준다(예: "S3 버킷이 퍼블릭인가"는 TA가 이미 알고 있다). 시험에서 "자동으로 비용·보안 위험을 체크"는 Trusted Advisor, "워크로드를 6 기둥으로 구조화 평가"는 WA Tool로 갈린다.

## Lens — 도메인 특화 확장의 설계 철학

기본 WA Lens는 모든 워크로드에 공통인 일반 베스트 프랙티스를 담는다. 하지만 서버리스 앱과 HPC 클러스터, SaaS 멀티테넌트 앱은 위험 지점이 전혀 다르다. **Lens**는 기본 Lens 위에 도메인 특화 질문을 얹는 플러그인이다.

| Lens | 대상 워크로드 | 특화 점검 영역 |
|------|--------------|----------------|
| **Serverless Lens** | Lambda·API Gateway·Step Functions | 콜드 스타트·동시성 한도·실행 시간·이벤트 소싱 |
| **SaaS Lens** | 멀티테넌트 SaaS | 테넌트 격리·티어별 과금·온보딩·노이지 네이버 |
| **ML Lens** | SageMaker·MLOps | 모델 거버넌스·데이터 드리프트·재학습 파이프라인 |
| **Data Analytics Lens** | Redshift·Athena·EMR·Lake | 데이터 레이크 거버넌스·쿼리 비용·스키마 진화 |
| **HPC Lens** | 시뮬레이션·렌더링 | 노드 간 통신·병렬 파일시스템·작업 스케줄러 |
| **FTR / Financial Services / Healthcare Lens** | 규제 산업 | 규제 준수·감사·데이터 주권 |

> 🎯 **시나리오**: "한 회사가 멀티테넌트 SaaS를 운영하는데, 한 테넌트의 과부하가 다른 테넌트 성능을 떨어뜨리는 '노이지 네이버' 문제와 테넌트 데이터 격리를 점검하고 싶다. 어떤 WA 평가를 적용하나?" — 답: **기본 WA Lens + SaaS Lens**. SaaS Lens는 테넌트 격리 모델(silo vs pool vs bridge), 티어별 throttling, 테넌트별 비용 귀속 같은 멀티테넌시 고유의 질문을 추가한다. 기본 Lens만으로는 이 위험이 드러나지 않는다. 시험에서 "멀티테넌트·테넌트 격리"가 보이면 SaaS Lens가 정답 신호다.

> 📚 **사례**: AWS는 2018년 **FTR(Foundational Technical Review)**를 WA 기반으로 표준화했다. APN 파트너가 자사 SaaS 제품을 AWS Marketplace에 올리거나 Competency를 받으려면 WA Tool로 Serverless/SaaS Lens 리뷰를 통과해야 한다. 이는 WA가 단순 자가 점검 도구를 넘어 **파트너 생태계의 품질 게이트**로 제도화됐음을 보여준다. 실제로 많은 SaaS 스타트업이 FTR 과정에서 테넌트 격리 미흡·암호화 누락 같은 HRI를 발견해 출시 전 보완했다. 시험에는 직접 안 나오지만, WA가 "권고"가 아니라 "통과해야 하는 심사"로 쓰이는 맥락을 알면 그 무게를 이해할 수 있다.

> 🔍 **더 깊이**: AWS는 2022년 **Lens를 커스텀으로 만드는 기능(Custom Lens)**을 추가했다. 기업이 자사 내부 표준(예: "모든 DB는 사내 KMS 키로 암호화", "모든 ALB는 WAF 필수")을 JSON으로 정의해 Lens로 등록하면, WA Tool이 사내 표준 위반을 HRI로 도출한다. 이는 WA가 단순 AWS 가이드를 넘어 **조직 거버넌스 엔진**으로 확장됐음을 의미한다. 멀티 계정 Organization에서 Custom Lens를 표준화하면 모든 팀이 동일 기준으로 평가받는다. 시험에서 "AWS 기본 베스트 프랙티스 외에 사내 규정도 함께 점검"이 보이면 Custom Lens를 떠올린다.

## 설계 원칙의 공통 DNA — 6 기둥을 관통하는 5가지

각 기둥은 고유 원칙을 갖지만, 6 기둥 전체를 관통하는 공통 설계 철학이 있다. 시험은 이 공통 DNA를 "운영 부담 최소", "managed 우선" 같은 키워드로 끊임없이 변주한다.

1. **자동화 우선** — 사람 손이 닿는 모든 지점이 사고·비효율의 원천. IaC·CI/CD·Auto Scaling·자동 복구.
2. **장애 가정(Design for Failure)** — "장애는 일어난다"를 전제로 설계. Multi-AZ·재시도·서킷 브레이커.
3. **수평 확장** — 큰 서버 한 대(scale-up)보다 작은 서버 여러 대(scale-out). 단일 장애점 제거 + 탄력성.
4. **느슨한 결합(Loose Coupling)** — 큐·이벤트로 컴포넌트를 분리해 한 부분 장애가 전파되지 않게.
5. **Managed > Self-managed** — AWS가 운영하는 매니지드 서비스가 운영 부담·보안 패치·확장을 대신 처리.

> 🔍 **더 깊이**: 이 5가지 공통 DNA는 WA의 일반 설계 원칙(General Design Principles)과 맞닿는다. 그중 클라우드 고유의 것이 **"용량을 추측하지 말라(Stop guessing capacity)"**와 **"production 규모로 테스트하라"**다. 온프레미스는 피크에 맞춰 미리 사야 했지만(over-provisioning), 클라우드는 Auto Scaling으로 실시간 수요에 맞춰 늘리고 줄인다 — 추측이 측정으로 대체된다. 또 "production과 동일한 규모로 테스트"는 온프레미스에서 비용 때문에 불가능했지만, 클라우드는 테스트 후 즉시 반납하면 되므로 가능해졌다. 시험에서 "수요 예측 없이 자동 대응", "운영 사고를 production 전에 검증"이 보이면 이 원칙이 배경이다.

> ⚠️ **함정**: "Managed 서비스로 전환"은 시험에서 거의 항상 정답 방향이지만, **어느 기둥의 점수를 올리는가**를 정확히 물으면 헷갈린다. EC2를 Fargate로 바꾸면 운영 부담이 줄어 1순위는 **Operational Excellence**, 부수적으로 패치를 AWS가 하니 Security, idle 제거로 Cost·Sustainability도 개선된다. 시험이 "1순위 기둥"을 물으면 "운영 부담 최소 = Operational Excellence"를 먼저 잡되, "비용 절감"을 강조하면 Cost로 답이 이동할 수 있음을 구분해야 한다. 하나의 액션이 여러 기둥에 영향을 준다는 게 Pro 사고의 핵심이다.

## 정리하며

Well-Architected Framework는 AWS가 수만 건의 아키텍처 리뷰에서 추출한 암묵지를 6 기둥·표준 질문지로 형식화한 거버넌스 엔진이다. 6 기둥(Operational Excellence·Security·Reliability·Performance Efficiency·Cost Optimization·Sustainability)은 ISO 25010 품질 모델에 뿌리를 두며, Sustainability는 2021년 추가됐다. WA Tool은 질문 답변 → HRI/MRI 자동 도출 → Improvement Plan → Milestone 스냅샷의 흐름으로 동작하고, Lens는 도메인(Serverless·SaaS·ML·HPC 등) 특화 질문을 얹는 플러그인이며 Custom Lens로 사내 표준까지 흡수한다.

SAP 시험 단골 매핑: (1) "워크로드를 6 기둥으로 구조화 평가" → **WA Tool**, (2) "자동으로 비용·보안·내결함성 체크" → **Trusted Advisor**, (3) "개선 추이를 시점별로 추적·보고" → **Milestone**, (4) "멀티테넌트 격리 점검" → **SaaS Lens**, (5) "AWS 기본 + 사내 규정 동시 점검" → **Custom Lens**, (6) "2021년 추가된 기둥" → **Sustainability**, (7) "managed 전환의 1순위 기둥" → 대개 **Operational Excellence**(단 강조점에 따라 이동). 다음 day는 Operational Excellence와 Security 두 기둥을 도구 레벨까지 파고든다.

---

## 📝 연습 문제

**문제 1.** 한 조직이 Lambda·API Gateway·Step Functions 기반 서버리스 애플리케이션을 운영하며, 콜드 스타트·동시성 한도·실행 시간 같은 서버리스 고유 위험을 WA Tool로 점검하려 한다. 가장 적합한 접근은?

A) 기본 AWS WA Lens만으로 평가한다

B) 기본 WA Lens에 Serverless Lens를 추가해 평가한다

C) Trusted Advisor의 자동 체크만 사용한다

D) Custom Lens를 직접 만들어 모든 질문을 새로 작성한다

**정답: B**
해설: Serverless Lens는 콜드 스타트·동시성·실행 시간·이벤트 소싱 등 서버리스 고유의 베스트 프랙티스 질문을 기본 Lens 위에 얹는다. A는 서버리스 고유 위험이 질문에 없어 누락된다. C(Trusted Advisor)는 자동 스캔일 뿐 구조화된 6 기둥 평가가 아니다. D는 AWS가 이미 제공하는 Serverless Lens를 두고 처음부터 다시 만드는 불필요한 작업으로, Custom Lens는 "AWS 표준에 없는 사내 규정"을 추가할 때 쓴다. 함정: 도메인 특화 점검은 해당 Lens를 추가하는 것이지 기본 Lens로 되는 게 아니다.

---

**문제 2.** 한 핀테크가 분기마다 WA Review를 수행하며, 각 리뷰 시점의 위험 상태를 동결해 개선 추이(HRI 23개 → 8개 → 3개)를 AWS Support와 공유하려 한다. WA Tool의 어떤 기능을 사용하나?

A) Lens

B) Milestone

C) Trusted Advisor

D) Custom Lens

**정답: B**
해설: Milestone은 특정 시점의 답변·위험 상태를 불변 스냅샷으로 저장해 시간축 비교를 가능하게 한다(Git 태그와 같은 발상). 두 Milestone을 비교하면 개선 추이를 정량적으로 보여줄 수 있다. A(Lens)는 도메인 특화 질문 확장이지 시점 추적이 아니다. C는 자동 체크 도구로 추이 동결 기능이 없다. D는 사내 표준을 질문으로 추가하는 기능이다. 함정: "추이 추적·시점 비교·보고"는 Milestone의 직답 키워드다.

---

**문제 3.** WA Tool에서 HRI(High Risk Issue)는 어떻게 도출되는가?

A) AWS Solutions Architect가 수동으로 검토해 주관적으로 매긴다

B) 워크로드가 각 질문의 베스트 프랙티스를 충족하지 못하면 위험도에 따라 자동 분류된다

C) Trusted Advisor의 비용 체크 결과만으로 결정된다

D) 고객이 직접 위험도를 입력한다

**정답: B**
해설: WA Tool은 각 질문마다 여러 베스트 프랙티스 선택지를 두고, 워크로드가 충족하지 못한 항목의 위험도에 따라 HRI(높음) 또는 MRI(중간)로 **규칙 기반 자동 분류**한다. 사람의 주관(A·D)이 아니라 베스트 프랙티스 미충족이라는 객관 기준으로 산출된다. C는 Trusted Advisor와 혼동한 것으로, TA는 자동 스캔 도구이고 WA Tool은 질문 기반 평가다. 함정: HRI는 "주관적 판단"이 아니라 "베스트 프랙티스 미충족"의 결과다.

---

**문제 4.** 다음 중 2021년 re:Invent에서 Well-Architected Framework에 새로 추가된 6번째 기둥은?

A) Operational Excellence

B) Cost Optimization

C) Sustainability

D) Security

**정답: C**
해설: WA는 2015년 5 기둥(Ops·Security·Reliability·Performance·Cost)으로 출발했고, 2021년 Sustainability(지속 가능성)가 6번째로 추가됐다. EU CSRD 등 탄소 규제 본격화 시기와 맞물린다. A·B·D는 모두 최초 5 기둥에 포함된 기둥이다. 함정: "최근 추가된 기둥", "탄소·전력 효율"은 Sustainability를 가리킨다.

---

**문제 5.** 한 기업이 "모든 DB는 사내 전용 KMS 키로 암호화", "모든 외부 ALB는 WAF 필수" 같은 AWS 기본 베스트 프랙티스에 없는 **사내 보안 표준**도 WA Tool 평가에 포함하고 싶다. 가장 적합한 방법은?

A) Serverless Lens를 적용한다

B) Custom Lens를 정의해 사내 표준을 질문으로 등록한다

C) Trusted Advisor 사용자 정의 체크를 만든다

D) Milestone을 더 자주 기록한다

**정답: B**
해설: Custom Lens는 기업이 자사 표준을 JSON으로 정의해 WA Tool 평가 항목으로 등록하는 기능으로, AWS 기본 Lens가 다루지 않는 사내 규정 위반을 HRI로 도출한다. 멀티 계정 환경에서 Custom Lens를 표준화하면 모든 팀이 동일 기준으로 평가받는다. A는 서버리스 도메인 특화일 뿐 사내 표준과 무관하다. C(Trusted Advisor)는 사용자 정의 6 기둥 평가 기능이 없다. D는 시점 기록 빈도일 뿐이다. 함정: "AWS 기본 + 사내 규정 동시 점검"은 Custom Lens의 직답 신호다.

---

**문제 6.** Trusted Advisor와 WA Tool의 관계로 가장 정확한 설명은?

A) 둘은 동일한 도구이며 이름만 다르다

B) Trusted Advisor는 비용·성능·보안·내결함성·서비스 한도를 자동 스캔하고, WA Tool은 6 기둥 질문 기반의 구조화된 정성 평가다

C) WA Tool이 Trusted Advisor를 완전히 대체한다

D) Trusted Advisor만 멀티 계정을 지원한다

**정답: B**
해설: Trusted Advisor는 5개 카테고리를 자동 체크하는 스캐너이고, WA Tool은 광범위한 질문으로 워크로드를 6 기둥으로 구조화 평가하는 도구다. 둘은 상호 보완적이며, 최신 WA Tool은 일부 질문에 TA 결과를 자동으로 끌어와 답을 미리 채운다(A·C 오답). D는 사실과 무관하다. 함정: "자동 스캔 = Trusted Advisor", "질문 기반 구조화 평가 = WA Tool"로 갈린다.

---
