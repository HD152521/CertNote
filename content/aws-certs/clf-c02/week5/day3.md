# Day 3 - 지원 플랜: 문제가 생겼을 때 AWS는 어떻게 돕는가

비용을 잘 보고 잘 막아도, 막상 서비스가 멈추거나 설계가 막히면 누군가의 도움이 필요하다. AWS는 고객마다 필요한 도움의 수준이 다르다는 걸 알고, **여러 단계의 지원 플랜(Support Plan)**을 제공한다. 오늘은 Basic부터 Enterprise까지 네 단계의 차이, 전담 지원 인력 TAM, 그리고 누구나 쓸 수 있는 자동 점검 도구 Trusted Advisor를 정리한다.

핵심 질문은 하나다: "이 조직은 얼마나 빠른 응답과 얼마나 깊은 도움이 필요한가?" 그 답이 적절한 플랜을 정한다.

## 네 가지 지원 플랜: Basic → Developer → Business → Enterprise

지원 플랜은 위로 갈수록 응답이 빠르고 도움이 깊어지며, 그만큼 비용도 올라간다.

- **Basic**: 모든 계정에 **무료**로 제공. 기술 지원 케이스는 안 되고, 계정·청구 문의와 문서·포럼·일부 Trusted Advisor 점검만 가능.
- **Developer**: 저렴한 유료 플랜. **이메일로 기술 문의** 가능(업무 시간 기준). 개발·테스트 단계에 적합.
- **Business**: **연중무휴 24/7** 기술 지원(전화·채팅·이메일), **전체 Trusted Advisor 점검** 제공. 운영 중인 프로덕션 워크로드에 적합.
- **Enterprise**: 최고 수준. 24/7 지원에 더해 **가장 빠른 응답(긴급 시 15분 목표)**, 전담 인력 **TAM**, 컨시어지 청구 지원 등을 제공. 대규모·미션 크리티컬 환경용.

| 플랜 | 비용 | 기술 지원 | 대표 특징 |
|------|------|-----------|-----------|
| Basic | 무료 | 없음(케이스 불가) | 문서·포럼·청구 문의, 제한된 Trusted Advisor |
| Developer | 유료(저) | 이메일(업무 시간) | 개발/테스트 단계 |
| Business | 유료(중) | 24/7 전화·채팅·이메일 | 전체 Trusted Advisor, 프로덕션용 |
| Enterprise | 유료(고) | 24/7 + 최단 응답 | TAM, 컨시어지, 미션 크리티컬 |

> 💡 **관련 이론**: "무료 기본 지원"=Basic, "이메일 기술 지원·개발 단계"=Developer, "24/7 지원·전체 Trusted Advisor·프로덕션"=Business, "TAM·가장 빠른 응답·미션 크리티컬"=Enterprise. 단서의 강도 순서대로 올라간다고 기억하면 쉽다.

## TAM(Technical Account Manager): 우리 전담 기술 자문

**TAM(Technical Account Manager)**은 **Enterprise Support에서 제공되는 전담 기술 자문 인력**이다. 고객의 환경을 지속적으로 파악하고, 아키텍처 검토·운영 모범 사례·비용 최적화·중요한 출시 대비 등을 옆에서 도와준다. 케이스가 생길 때만 응대하는 일반 지원과 달리, **고객을 꾸준히 따라붙는 사람**이라는 점이 핵심이다.

> 💡 **관련 이론**: "전담 기술 자문", "지속적으로 우리 환경을 봐주는 담당자"가 보이면 TAM이고, 이는 **Enterprise 플랜 전용**이다. Business 이하에는 TAM이 없다.

## AWS Trusted Advisor: 자동 점검 코치

**AWS Trusted Advisor**는 고객의 환경을 **자동으로 점검해 모범 사례 대비 개선점을 알려주는** 서비스다. 점검은 다섯 범주로 나뉜다.

1. **비용 최적화** — 안 쓰는 리소스, 저활용 인스턴스 등
2. **성능** — 처리량·구성 개선점
3. **보안** — 열린 보안 그룹, MFA 미설정, 노출된 액세스 키 등
4. **내결함성(Fault Tolerance)** — 백업·다중화 부족
5. **서비스 한도(Service Quotas)** — 한도 임박 경고

중요한 건 **플랜에 따라 점검 범위가 다르다**는 점이다. Basic/Developer는 **핵심 보안·서비스 한도 점검만** 제공되고, **전체 5범주 점검은 Business·Enterprise**에서 열린다.

> 💡 **관련 이론**: "환경을 자동 점검해 보안·비용·성능 개선 권고"가 보이면 Trusted Advisor다. "전체 점검을 받으려면" 어떤 플랜? → Business 이상. 누가 점검하느냐(사람 TAM)와 무엇이 점검하느냐(도구 Trusted Advisor)를 헷갈리지 말자.

## 한 장으로 정리

| 신호(키워드) | 답 |
|--------------|----|
| 무료, 기술 케이스 불가, 청구 문의만 | Basic |
| 이메일 기술 지원, 개발/테스트 단계 | Developer |
| 24/7 지원, 전체 Trusted Advisor, 프로덕션 | Business |
| TAM, 가장 빠른 응답, 미션 크리티컬 | Enterprise |
| 전담 기술 자문 인력 | TAM(Enterprise 전용) |
| 환경 자동 점검·모범 사례 권고 | Trusted Advisor |

## 정리하며

오늘의 한 문장: **필요한 응답 속도와 도움의 깊이가 곧 플랜의 등급이다.** 무료 Basic으로 시작해, 개발 단계면 Developer, 프로덕션을 24/7로 지키려면 Business, 전담 인력(TAM)과 최단 응답이 필요한 미션 크리티컬이면 Enterprise로 올라간다. 그리고 어느 플랜이든 Trusted Advisor가 환경을 자동 점검해 코치 역할을 하되, 전체 점검은 Business 이상에서 열린다.

다음 글에서는 여러 계정을 묶어 결제·관리하는 청구 구조와, 미리 비용을 가늠하는 도구들을 살펴본다.

---

## 📝 연습 문제

**문제 1.** 프로덕션 워크로드를 24/7로 운영하며, 전화·채팅 기술 지원과 전체 Trusted Advisor 점검이 필요하다. 단, 전담 TAM까지는 필요 없다. 가장 적합한 지원 플랜은?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**정답: C**  
해설: Business 플랜은 24/7 전화·채팅·이메일 기술 지원과 전체 Trusted Advisor 점검을 제공해 프로덕션 운영에 적합하다. Basic은 기술 케이스 불가, Developer는 이메일·업무 시간 한정이며, Enterprise는 TAM·최단 응답까지 포함해 요건을 초과(비용 과다)한다.

---

**문제 2.** 미션 크리티컬 환경을 운영하는 대기업이 전담 기술 자문 인력과 가장 빠른 긴급 응답을 원한다. 가장 적합한 지원 플랜은?

A) Developer  
B) Business  
C) Enterprise  
D) Basic  

**정답: C**  
해설: Enterprise 플랜은 전담 TAM, 긴급 시 가장 빠른 응답(15분 목표), 컨시어지 지원 등을 제공해 미션 크리티컬 환경에 적합하다. Basic·Developer는 24/7 지원조차 없고, Business는 24/7이지만 TAM이 제공되지 않는다.

---

**문제 3.** 추가 비용 없이 모든 계정에 기본 제공되며, 기술 지원 케이스는 열 수 없고 청구 문의와 문서·포럼만 이용할 수 있는 플랜은?

A) Basic  
B) Developer  
C) Business  
D) Enterprise  

**정답: A**  
해설: Basic은 모든 계정에 무료로 제공되지만 기술 지원 케이스는 불가하고 계정·청구 문의, 문서·포럼, 제한된 Trusted Advisor만 이용할 수 있다. Developer 이상은 모두 유료이며 기술 지원 케이스를 열 수 있다.

---

**문제 4.** Enterprise Support에서 제공되며 고객 환경을 지속적으로 파악해 아키텍처·운영·비용을 자문하는 전담 인력은?

A) Trusted Advisor  
B) Technical Account Manager(TAM)  
C) Solutions Architect 인증  
D) AWS Config  

**정답: B**  
해설: TAM은 Enterprise 플랜에서 제공되는 전담 기술 자문 인력으로 고객을 지속적으로 따라붙으며 모범 사례를 안내한다. Trusted Advisor는 자동 점검 도구(사람이 아님), Config는 설정 평가 서비스라 전담 자문 인력과 다르다.

---

**문제 5.** 환경을 자동으로 점검해 비용·성능·보안·내결함성·서비스 한도 다섯 범주의 개선점을 권고하는 서비스는? (단, 전체 점검은 Business 이상에서 제공)

A) AWS Budgets  
B) AWS Trusted Advisor  
C) AWS Cost Explorer  
D) Technical Account Manager  

**정답: B**  
해설: Trusted Advisor는 다섯 범주(비용·성능·보안·내결함성·서비스 한도)로 환경을 자동 점검해 모범 사례 대비 개선점을 권고하며, 전체 점검은 Business·Enterprise에서 열린다. Budgets는 예산 알림, Cost Explorer는 비용 분석, TAM은 사람 자문 인력이라 자동 점검 도구가 아니다.

---
