# Day 5 - 시험이 끝까지 묻는 것은 "키워드를 서비스로 번역하는 속도"다

12주의 SAA-C03 여정 마지막 날이다. 이 글은 새 지식을 더하는 자리가 아니라, 흩어진 도메인들을 **시험장에서 작동하는 하나의 판단 체계**로 압축하는 자리다. SAA 시험의 본질은 단순하다 — 길고 복잡한 시나리오 지문을 읽고, 그 안에 숨은 **신호어(signal word)**를 잡아 정답 서비스로 번역하는 일이다. 130분에 65문항, 한 문제에 약 2분. 이 시간 압박 속에서 합격을 가르는 건 지식의 양이 아니라 "이 지문이 묻는 게 결국 어느 축인가"를 1초 안에 분류하는 속도다.

시험이 다루는 네 도메인은 비중이 다르다 — 보안 30%, 복원력 26%, 고성능 24%, 비용 20%. 하지만 실제 문제는 이 경계를 넘나든다. "글로벌 사용자에게 저지연으로 콘텐츠를 제공하면서 비용도 줄여라"는 한 문장에 고성능과 비용이 겹친다. 그래서 마지막 점검은 도메인별 암기가 아니라, **시나리오를 관통하는 신호어 사전**을 머릿속에 새기는 일이어야 한다. 이 글은 그 사전을 정리하고, 실전과 같은 모의고사로 번역 훈련을 마무리한다.

> 💡 **관련 이론**: SAA 시험의 채점에는 **scaled scoring**(척도 점수, 100~1000점, 합격선 720)과 함께 **채점되지 않는 unscored 문항**이 섞여 있다. AWS는 65문항 중 약 15문항을 미래 시험을 위한 **사전 테스트(pretest) 문항**으로 채점에서 제외한다 — 응시자는 어느 게 채점 대상인지 알 수 없다. 이 설계의 함의는 명확하다. **모르는 한두 문제에 시간을 쏟아 전체 페이스를 무너뜨리는 게 가장 큰 손해**다. 어차피 그 문제가 unscored일 수도 있고, scaled scoring이라 문제마다 난이도 보정이 들어가므로 "쉬운 문제를 확실히 다 맞히는 것"이 어려운 문제 몇 개를 붙드는 것보다 안전하다. 시간 관리가 곧 점수 관리다.

## 신호어 사전: 지문의 한 단어가 정답을 결정한다

SAA 문제의 90%는 특정 신호어에 정답 서비스가 1:1로 묶인다. 이 매핑을 자동화하면 2분이 아니라 30초에 푼다.

**성능·지연 신호어**부터 보자. "마이크로초(μs) 단위 DynamoDB 응답"이면 **DAX**(DynamoDB 전용 캐시), "밀리초 단위 일반 캐시"면 **ElastiCache**, "정적/동적 콘텐츠 글로벌 저지연 캐싱"이면 **CloudFront**, "TCP/UDP 비-HTTP 트래픽의 글로벌 가속·고정 IP"면 **Global Accelerator**다. CloudFront와 Global Accelerator를 가르는 결정적 신호어는 **프로토콜** — HTTP(S) 콘텐츠 캐싱은 CloudFront, 게임·VoIP 같은 UDP/TCP 가속은 Global Accelerator다.

**복원력·DR 신호어**는 복제 모드와 RTO/RPO로 갈린다. "단일 리전 내 자동 장애 조치"면 **Multi-AZ**, "글로벌 액티브-액티브 관계형"이면 **Aurora Global Database**, "글로벌 액티브-액티브 NoSQL"이면 **DynamoDB Global Tables**다. DR 4단계는 비용·복구속도의 스펙트럼 — Backup & Restore(가장 싸고 느림) → Pilot Light → Warm Standby → **Multi-Site Active-Active**(가장 비싸고 RTO/RPO ≈ 0)다. "RPO ≈ 0, RTO ≈ 0"이면 무조건 Active-Active다.

**보안·메시징·네트워크 신호어**도 정리된다. "SQL 주입·XSS 차단"이면 **WAF**, "EC2가 API 접근"이면 **IAM Role + IMDSv2**, "비밀 자동 회전"이면 **Secrets Manager**, "여러 컨슈머가 같은 스트림을 재생(replay)"이면 **Kinesis Data Streams**, "느슨한 결합 큐로 디커플링"이면 **SQS**, "팬아웃(한 메시지 여러 구독자)"이면 **SNS**, "50개 VPC + 온프레미스 라우팅 허브"면 **Transit Gateway**, "EKS Pod에 IAM 권한"이면 **IRSA**다.

> 🔍 **더 깊이**: 신호어 매핑이 작동하는 인지과학적 배경은 전문가의 **청킹(chunking)**과 **패턴 인식**이다. 1973년 체스 그랜드마스터를 연구한 Chase와 Simon은 전문가가 초보보다 기억력이 좋아서가 아니라, 흩어진 정보를 의미 있는 덩어리(청크)로 묶어 인식하기 때문에 빠르다는 걸 밝혔다 — 그랜드마스터는 체스판을 64칸이 아니라 몇 개의 "익숙한 패턴"으로 본다. SAA 고득점자도 똑같다. "프라이빗 서브넷의 EC2가 NAT를 거쳐 S3에 대량 접근하며 비용이 큼"이라는 긴 문장을 한 글자씩 읽지 않고 **"S3 Gateway Endpoint 패턴"**이라는 하나의 청크로 즉시 인식한다. 12주 학습의 진짜 목표가 지식 축적이 아니라 이 청킹 능력의 형성인 이유다. 그래서 마지막 점검은 새 내용 학습보다 신호어→서비스 매핑을 반복해 자동화하는 데 써야 한다.

> ⚠️ **함정**: 신호어가 비슷해 보이는 쌍을 시험은 일부러 붙여 놓는다. ① **CloudFront vs Global Accelerator** — 둘 다 "글로벌·저지연"이지만 HTTP 캐싱이냐(CloudFront) UDP/TCP 가속·고정 IP냐(GA)로 갈린다. ② **DAX vs ElastiCache** — 둘 다 캐시지만 DynamoDB 전용 마이크로초면 DAX, 범용 밀리초면 ElastiCache. ③ **Secrets Manager vs Parameter Store** — 둘 다 비밀 저장이지만 자동 회전이 필요하면 Secrets Manager. ④ **SQS vs Kinesis** — 둘 다 메시징이지만 "재생/다중 컨슈머/순서·샤딩"이면 Kinesis, "단순 디커플링·작업 큐"면 SQS. 지문에서 이 구별 신호어를 찾는 게 함정 회피의 핵심이다.

## 도메인을 가로지르는 메타 원리: 같은 질문이 모든 영역에서 반복된다

네 도메인은 표면적으로 다르지만, 그 밑에는 시험 전체를 관통하는 몇 개의 메타 원리가 흐른다. 이걸 잡으면 처음 보는 시나리오도 풀린다.

첫째, **공동 책임 모델(Shared Responsibility)**은 모든 도메인에 스며 있다 — "관리형 서비스일수록 AWS 책임이 크다"는 슬라이딩 규칙은 보안(패치 책임), 복원력(가용성 SLA), 비용(유휴 과금 0)에서 모두 같은 방식으로 작동한다. 둘째, **fail-safe defaults**(기본값은 거부·차단) — IAM의 암묵적 거부, S3 Block Public Access, NACL/SG의 화이트리스트가 모두 "기본은 막고 명시적으로 연다"는 한 원칙이다. 셋째, **느슨한 결합(loose coupling)** — SQS/SNS/EventBridge로 컴포넌트를 분리하는 건 복원력(한 부분 장애가 전파 안 됨)이자 확장성(독립 스케일링)이자 비용(필요할 때만 처리)의 동시 해법이다.

> 💡 **관련 이론**: 이 메타 원리들은 모두 **AWS Well-Architected Framework**의 여섯 기둥 — 운영 우수성·보안·신뢰성·성능 효율성·비용 최적화·지속 가능성 — 에서 파생된다. 이 프레임워크가 강조하는 핵심 설계 원칙들(장애를 가정하라, 자동화하라, 단일 실패점을 없애라, 탄력적으로 확장하라)은 시험 문제의 "정답이 왜 정답인가"의 근거가 된다. 예컨대 "단일 NAT Gateway가 한 AZ에만 있으면 그 AZ 장애 시 다른 AZ가 인터넷을 못 쓴다 → AZ마다 NAT를 둬라"는 신뢰성 기둥의 "단일 실패점 제거" 원칙의 직접 적용이다. SAA가 정의상 "솔루션 아키텍트" 자격이라, 개별 서비스 지식보다 이 아키텍처 원칙으로 트레이드오프를 판단하는 능력을 측정하도록 설계됐다. 모르는 문제를 만나면 "Well-Architected 원칙상 어느 보기가 가장 견고/효율적인가"로 되돌아가면 길이 보인다.

## D-Day 운영 체크리스트: 환경과 페이스가 점수를 지킨다

지식이 충분해도 시험 환경과 시간 관리에서 무너지면 떨어진다. 마지막 통제 대상은 컨디션과 페이스다.

**시험 전날**에는 신분증 2개(영문 표기 1개 포함, OnVUE 원격 응시 시 필수)를 준비하고, OnVUE를 쓰면 웹캠·마이크·인터넷·조용한 독립 공간을 사전 점검한다. 책상 위 모든 물건을 치워야 하고(원격 감독관이 360도 확인), 충분히 자는 게 마지막 한 문제를 더 푸는 것보다 중요하다.

**시험 중 전략**의 핵심은 **2분 룰**이다 — 한 문제에 2분을 넘기면 표시(flag)하고 넘어간 뒤 나중에 재방문한다. 모든 문항의 배점이 같으므로, 어려운 한 문제를 5분 붙드는 것보다 쉬운 다섯 문제를 확보하는 게 압도적으로 유리하다. 보기 두 개가 명백히 틀렸으면 제거해 50:50으로 좁히고, **확실한 새 정보가 없으면 처음 답을 바꾸지 않는다**(첫 직관이 통계적으로 더 맞는 경우가 많다). 그리고 "공동 책임"·"기본값"·"가장 비용 효율적인"·"운영 부담 최소" 같은 **수식어**를 놓치지 마라 — 같은 시나리오라도 이 수식어 하나가 정답을 바꾼다.

> 📚 **사례**: 많은 응시자가 SAA에서 떨어지는 패턴은 "지식 부족"이 아니라 **"시간 분배 실패"**다. 전형적 실패 시나리오는 이렇다 — 초반 10문제에서 어려운 시나리오 두세 개를 붙들고 각각 5~7분을 써 버려, 50문제쯤에서 시간이 20분밖에 안 남았음을 깨닫고 후반을 허겁지겁 찍는다. 이때 후반에 몰린 쉬운 문제까지 놓쳐 점수가 무너진다. 그래서 합격자들이 공통으로 권하는 전략이 **"1차 통과(65문항을 90분에 빠르게, 어려운 건 flag) → 2차 재방문(flag한 문제 30분) → 3차 점검(10분)"**의 3단 페이스다. unscored 문항이 섞여 있다는 점까지 고려하면, "막힌 문제에 집착하지 않기"는 단순 조언이 아니라 점수를 지키는 통계적 최적 전략이다.

## 최종 점검 한 줄 사전

| 신호어 | 정답 서비스 |
|--------|------------|
| 마이크로초 DynamoDB | DAX |
| 밀리초 범용 캐시 | ElastiCache |
| HTTP 글로벌 캐싱 | CloudFront |
| UDP/TCP 가속·고정 IP | Global Accelerator |
| 단일 리전 자동 장애조치 | Multi-AZ |
| 글로벌 액티브-액티브 NoSQL | DynamoDB Global Tables |
| RPO/RTO ≈ 0 | Multi-Site Active-Active |
| SQL 주입·XSS | WAF |
| EC2 → API 접근 | IAM Role + IMDSv2 |
| 비밀 자동 회전 | Secrets Manager |
| 재생 가능 다중 컨슈머 스트림 | Kinesis Data Streams |
| 팬아웃 알림 | SNS |
| 50 VPC + 온프레 허브 | Transit Gateway |
| EKS Pod IAM | IRSA |
| 프라이빗 EC2 → S3 비용 ↓ | S3 Gateway Endpoint |
| 패턴 모르는 S3 | Intelligent-Tiering |
| 예산 도달 자동 차단 | Budgets Actions |

---

## 📝 최종 모의고사 (시나리오 12문항)

**문제 1.** 한 글로벌 멀티플레이어 게임이 전 세계 플레이어에게 UDP 기반 실시간 통신을 제공한다. 지연을 최소화하고 클라이언트가 참조할 고정 진입 IP가 필요하다. 가장 적절한 서비스는?

A) CloudFront

B) Global Accelerator

C) Route 53 지연 기반 라우팅

D) NAT Gateway

**정답: B**

해설: **Global Accelerator**는 AWS 글로벌 네트워크 백본을 통해 트래픽을 엣지에서 가속하며, **UDP/TCP 같은 비-HTTP 트래픽**과 **고정 Anycast IP**를 제공해 게임·VoIP·IoT에 적합하다. A의 CloudFront는 HTTP(S) 콘텐츠 캐싱 전용이라 UDP 게임 트래픽에 맞지 않다. C의 Route 53 지연 라우팅은 DNS 레벨 분배일 뿐 패킷 경로를 가속하지 않고 고정 IP도 안 준다. D는 아웃바운드 인터넷 게이트웨이로 무관하다. 신호어 "UDP + 고정 IP + 글로벌 가속" = Global Accelerator.

---

**문제 2.** 한 전자상거래 앱이 DynamoDB를 사용하는데, 읽기 트래픽이 폭증하며 **마이크로초 단위**의 읽기 지연이 요구된다. 가장 적절한 방법은?

A) ElastiCache for Redis를 앞단에 배치

B) DynamoDB Accelerator(DAX)

C) 읽기 전용 복제본 추가

D) Aurora로 마이그레이션

**정답: B**

해설: **DAX(DynamoDB Accelerator)**는 DynamoDB 전용 인메모리 캐시로 **마이크로초 단위** 읽기 응답을 제공하며 애플리케이션 코드 변경이 거의 없다. A의 ElastiCache는 밀리초 단위 범용 캐시라 마이크로초 요구와 직접 매핑되지 않고 별도 캐시 로직이 필요하다. C의 읽기 복제본은 RDS/Aurora 개념이고, D는 NoSQL을 관계형으로 바꾸는 과잉 변경이다. "DynamoDB + 마이크로초" = DAX가 1:1 정답이다.

---

**문제 3.** 한 금융 회사가 두 리전에 걸쳐 **RPO ≈ 0, RTO ≈ 0**의 재해 복구를 요구한다. 어느 DR 전략인가?

A) Backup & Restore

B) Pilot Light

C) Warm Standby

D) Multi-Site Active-Active

**정답: D**

해설: DR 4단계는 비용·복구속도의 스펙트럼이다 — Backup & Restore(가장 싸고 느림) → Pilot Light → Warm Standby → **Multi-Site Active-Active**(가장 비싸지만 두 리전이 동시에 트래픽 처리, RPO/RTO ≈ 0). "RPO≈0, RTO≈0 / 무중단"이면 무조건 Active-Active다. A는 복구에 수 시간, B는 핵심만 켜 두고 확장, C는 축소판 상시 가동이라 모두 RTO가 0이 아니다. 비용을 감수하고 즉시 복구를 사는 게 Active-Active다.

---

**문제 4.** 한 애플리케이션이 클릭스트림 데이터를 수집하는데, **여러 독립 컨슈머**가 같은 데이터를 각자 다른 속도로 처리하고 **과거 데이터를 재생(replay)**할 수 있어야 한다. 적절한 서비스는?

A) Amazon SQS Standard

B) Amazon Kinesis Data Streams

C) Amazon SNS

D) Amazon MQ

**정답: B**

해설: **Kinesis Data Streams**는 데이터를 보존 기간 동안 저장해 **여러 컨슈머가 독립적으로, 그리고 과거 데이터를 재생(replay)**하며 읽을 수 있다 — 클릭스트림·로그·실시간 분석의 표준이다. A의 SQS는 메시지를 소비하면 삭제돼 재생과 다중 독립 컨슈머에 부적합하다(작업 큐 모델). C의 SNS는 팬아웃 푸시지만 저장·재생이 없고, D의 MQ는 기존 프로토콜(AMQP 등) 마이그레이션용이다. "재생 + 다중 컨슈머 + 스트림" = Kinesis가 핵심 신호다.

---

**문제 5.** 한 EC2 애플리케이션이 S3에 접근해야 한다. 보안 모범 사례와 함께 SSRF 공격으로 자격증명이 탈취되는 것을 막으려 한다. 올바른 구성은?

A) 액세스 키를 환경변수로 주입

B) IAM Role을 인스턴스에 부여하고 IMDSv2를 강제

C) S3 버킷을 public-read로 설정

D) 자격증명을 Secrets Manager에 저장 후 키로 조회

**정답: B**

해설: EC2가 API를 호출할 때는 키 하드코딩 대신 **IAM Role(인스턴스 프로파일)**로 임시 자격증명을 자동 제공받고, **IMDSv2를 강제**해 SSRF 공격이 메타데이터 자격증명을 탈취하는 경로를 막는다(2019년 Capital One 사고가 IMDSv1+SSRF 조합이었다). A는 키 노출 위험, C는 데이터 전체 노출, D는 여전히 별도 키 관리가 필요해 Role 방식보다 약하다. "EC2 → API = IAM Role + IMDSv2"는 보안 도메인 단골 정답이다.

---

**문제 6.** 한 회사가 RDS PostgreSQL의 마스터 비밀번호를 **자동으로 주기적 교체**하고 싶다. 적절한 서비스는?

A) Systems Manager Parameter Store

B) AWS Secrets Manager

C) AWS KMS

D) IAM 데이터베이스 인증

**정답: B**

해설: **Secrets Manager**는 비밀 저장과 함께 **Lambda 기반 자동 회전(rotation)**을 내장해 RDS·Redshift·DocumentDB 비밀번호를 주기적으로 자동 교체한다. A의 Parameter Store는 SecureString 저장은 되지만 자동 회전 기능이 없다(더 단순·저렴). C의 KMS는 암호화 키 관리지 비밀 회전이 아니고, D의 IAM DB 인증은 토큰 기반 접근이지 비밀번호 회전 메커니즘이 아니다. "자동 회전" 신호어가 나오면 Secrets Manager로 직행한다.

---

**문제 7.** 한 스타트업이 데이터를 S3에 저장하는데 **접근 패턴을 예측할 수 없고**, 수동으로 클래스를 관리할 인력도 없다. 비용을 자동으로 최적화하려면?

A) S3 Standard

B) S3 Intelligent-Tiering

C) S3 Glacier Deep Archive

D) S3 One Zone-IA

**정답: B**

해설: **S3 Intelligent-Tiering**은 객체별 접근 패턴을 모니터링해 **자동으로 적합한 계층으로 이동**시켜, 패턴을 모르거나 관리 인력이 없을 때 비용을 자동 최적화한다(소액의 모니터링 요금만 부담). A는 자주 안 보는 데이터에 과한 비용, C는 거의 안 꺼내는 장기 보관용(검색 지연 큼), D는 재생성 가능한 데이터의 단일 AZ 저장용이라 "패턴 모름"과 맞지 않다. "접근 패턴 모름 = Intelligent-Tiering"이 압도적 단골이다.

---

**문제 8.** 한 회사가 50개 이상의 VPC와 온프레미스 데이터센터를 **중앙 허브에서 라우팅**으로 연결하려 한다. VPC Peering의 N² 복잡도를 피하고 싶다. 적절한 서비스는?

A) VPC Peering 메시

B) AWS Transit Gateway

C) Internet Gateway

D) VPN만 사용

**정답: B**

해설: **Transit Gateway**는 다수의 VPC와 온프레미스 연결을 **단일 허브에서 라우팅**하는 클라우드 라우터로, VPC Peering의 N×(N-1)/2 풀메시 복잡도를 허브-스포크로 단순화한다. A의 Peering 메시는 50개 VPC면 1000개 이상의 연결이 필요해 관리 불가능하고, C는 인터넷 게이트웨이로 내부 라우팅과 무관하며, D의 VPN만으로는 VPC 간 라우팅 허브가 안 된다. "다수 VPC + 온프레 + 중앙 허브 라우팅" = Transit Gateway.

---

**문제 9.** 한 팀이 EKS 클러스터의 **특정 Pod**에만 S3 접근 IAM 권한을 부여해, 노드 전체가 아닌 Pod 단위 최소 권한을 적용하려 한다. 적절한 방법은?

A) EC2 노드의 Instance Profile에 권한 부여

B) IRSA(IAM Roles for Service Accounts)

C) Pod에 액세스 키 주입

D) KMS Grant 사용

**정답: B**

해설: **IRSA(IAM Roles for Service Accounts)**는 쿠버네티스 ServiceAccount를 IAM Role과 연동해 **Pod 단위로 최소 권한** IAM을 부여한다(OIDC 페더레이션 기반). A의 Instance Profile은 노드의 모든 Pod가 같은 권한을 공유하게 돼 최소 권한 위반이고, C는 키 하드코딩으로 보안 안티패턴이며, D의 KMS Grant는 암호화 키 위임이지 Pod IAM이 아니다. "EKS Pod 단위 IAM" = IRSA가 정답이다.

---

**문제 10.** 한 글로벌 SaaS가 정적 웹 콘텐츠를 전 세계에 저지연으로 제공하면서, 원본 S3 버킷은 **직접 public 노출 없이** CloudFront를 통해서만 접근되게 하려 한다. 올바른 구성은?

A) S3 정적 웹 호스팅을 public으로 열기

B) CloudFront + OAC(Origin Access Control) + S3 Block Public Access

C) ALB + EC2로 정적 파일 서빙

D) Lambda 함수 URL로 직접 서빙

**정답: B**

해설: **CloudFront + OAC(Origin Access Control)** 구성은 S3 버킷을 **Block Public Access로 비공개 유지**한 채, CloudFront만 OAC로 서명된 요청을 통해 오리진에 접근하게 한다 — 글로벌 저지연(엣지 캐싱) + 원본 비노출을 동시에 만족한다. A는 버킷을 직접 public으로 열어 노출 위험이 크고, C는 정적 콘텐츠에 과한 인프라이며, D는 글로벌 캐싱 이점이 없다. "글로벌 캐싱 + S3 원본 비공개" = CloudFront + OAC가 현재 표준(과거 OAI의 후속)이다.

---

**문제 11.** 한 회사가 비용을 줄이려고 **24/7로 꾸준히 도는 EC2 워크로드**(특정 패밀리 고정)에 최대 할인을 적용하려 한다. 환불은 필요 없다. 적절한 약정은?

A) On-Demand

B) EC2 Instance Savings Plan

C) Spot Instance

D) Compute Optimizer

**정답: B**

해설: **EC2 Instance Savings Plan**은 특정 인스턴스 패밀리·리전에 약정하는 대신 **가장 높은 할인율(최대 72%)**을 제공해, 패밀리가 고정된 24/7 워크로드에 최적이다. 더 유연한 Compute SP는 할인율이 낮으므로 "특정 패밀리 최대 할인"엔 EC2 SP가 맞다. A는 가장 비싸고, C는 중단 가능 워크로드용(24/7 안정 운영엔 부적합), D는 할인 약정이 아니라 right-sizing 권고 도구다. "특정 패밀리 고정 + 최대 할인" = EC2 SP.

---

**문제 12.** 한 운영팀이 **다수의 마이크로서비스를 느슨하게 결합**하고, 한 서비스가 다운돼도 메시지가 유실되지 않으며, 트래픽 급증 시 버퍼 역할을 하길 원한다. 적절한 서비스는?

A) Amazon SQS

B) 직접 HTTP 호출(동기)

C) Amazon Kinesis Data Streams

D) AWS Step Functions

**정답: A**

해설: **SQS(Simple Queue Service)**는 컴포넌트 사이에 메시지 큐를 두어 **느슨한 결합(decoupling)**을 제공한다 — 컨슈머가 다운돼도 메시지는 큐에 남아 유실되지 않고, 트래픽 급증 시 큐가 **버퍼(완충)** 역할을 해 다운스트림을 보호한다. B의 동기 호출은 한 서비스 장애가 즉시 전파되고 버퍼가 없다. C의 Kinesis는 스트리밍·재생용으로 단순 작업 큐엔 과하고, D의 Step Functions는 워크플로 오케스트레이션이지 메시지 버퍼가 아니다. "디커플링 + 메시지 유실 방지 + 버퍼" = SQS가 핵심 신호다.

---

## 📌 시험 직전 메시지

12주를 돌아 여기까지 왔다. 시험장에서 기억할 것은 단 네 가지다.

첫째, **시나리오 신호어를 서비스로 번역**하는 것이 SAA의 본질이다 — "마이크로초→DAX", "UDP 가속→Global Accelerator", "자동 회전→Secrets Manager"처럼 청크로 인식하라. 둘째, **2분 룰**을 지켜라 — 막힌 문제는 표시하고 넘긴 뒤 재방문한다. 모든 문제의 배점이 같고 unscored 문항이 섞여 있으니, 쉬운 문제를 확보하는 게 어려운 문제에 집착하는 것보다 통계적으로 유리하다. 셋째, **수식어**("가장 비용 효율적", "운영 부담 최소", "기본값", "공동 책임")가 정답을 바꾼다 — 놓치지 마라. 넷째, **확신 없으면 첫 답을 바꾸지 마라**.

네 도메인을 "보안→IAM/KMS/WAF", "복원력→Multi-AZ + DR 4단계", "고성능→CDN/Cache/적합 서비스", "비용→SP/Spot/Intelligent-Tiering"의 4축으로 잡으면 80%가 풀린다. 나머지는 Well-Architected 원칙(단일 실패점 제거·자동화·탄력성)으로 되돌아가 판단하라.

**Fighting!! 합격을 응원합니다.**
