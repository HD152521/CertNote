# Day 21 - S3: 객체 스토리지의 철학과 스토리지 클래스 설계

Amazon S3가 처음 출시된 2006년 3월 14일, 창업자 Werner Vogels는 "저장 용량 걱정을 영원히 없애겠다"고 말했다. 그 선언이 실제로 어떤 기술 결정으로 이어졌는지를 이해하면 S3의 독특한 설계 원칙이 보이기 시작한다. S3는 파일 시스템이 아니다. 계층 디렉토리도, inode도, 파일 잠금도 없다. 있는 것은 오직 키-값 쌍의 무한한 공간뿐이다. 이 단순한 모델이 왜 20년이 지난 지금도 살아남았는지, 그리고 DVA-C02 시험에서 S3 문제가 왜 이렇게 자주 나오는지를 이 글에서 파헤친다.

## S3는 왜 파일 시스템이 아닌가 — 설계 철학

1970년대 Ken Thompson이 Unix 파일 시스템을 설계할 때 목표는 단일 머신에서 여러 프로세스가 공유 자원에 접근하는 것이었다. 계층형 디렉토리, inode, 링크, 파일 잠금은 그 목표에 최적화된 구조다. 그러나 수십억 개의 객체를 수천 개의 서버에 분산 저장하는 문제에서 이 구조는 오히려 방해가 된다. 디렉토리 잠금은 병목이 되고, inode 테이블은 단일 장애점이 되며, 계층 탐색은 메타데이터 서버에 과부하를 준다.

S3의 해답은 **flat namespace**다. 버킷 이름과 키(key)만 있으면 어떤 객체든 O(1)에 가깝게 찾아낼 수 있다. `/documents/2026/report.pdf` 처럼 보이는 경로도 실제로는 슬래시가 포함된 단일 문자열 키일 뿐이다. 이 설계 덕분에 S3는 메타데이터 서버 없이 수십 페타바이트 규모로 수평 확장이 가능하다.

> 💡 **관련 이론**: S3의 flat namespace는 Amazon의 Dynamo 논문(2007, SOSP)에서 영감을 받은 consistent hashing 기반 분산 저장과 함께 동작한다. 객체 키를 해시해서 여러 스토리지 노드에 분산하고, 각 노드가 독립적으로 응답한다. 이 구조에서 "디렉토리 목록"은 특정 prefix로 시작하는 키를 순서대로 나열하는 것으로 시뮬레이션된다 — 그래서 수백만 객체가 있는 버킷에서 LIST 작업은 선형 시간이 걸리고 비용도 더 든다.

## 버킷의 글로벌 이름 공간이 주는 의미

`my-company-docs`라는 이름의 버킷을 만들었다면, 전 세계 어떤 AWS 계정도 같은 이름을 사용할 수 없다. 이 규칙은 처음엔 불편해 보이지만 두 가지 강력한 이점을 준다. 첫째, 버킷 이름만으로 전 세계 어디서든 `https://my-company-docs.s3.amazonaws.com`이라는 DNS 이름이 자동으로 결정된다. DNS 서버 설정이 따로 필요 없다. 둘째, 서로 다른 AWS 계정의 교차 계정 접근 정책에서 버킷 ARN(`arn:aws:s3:::my-company-docs`)이 전역적으로 유일하게 식별된다.

버킷 이름 규칙은 단순하지만 시험에서 자주 함정으로 나온다. 소문자, 숫자, 하이픈, 점만 허용(3~63자)이며, IP 주소 형식(`192.168.1.1`)은 금지다. 그리고 점(`.`)이 포함된 이름은 HTTPS에서 와일드카드 인증서(`*.s3.amazonaws.com`)와 매칭이 깨지기 때문에 실무에서는 점 없는 이름이 권장된다.

> 🔍 **더 깊이**: S3 URL에는 두 가지 형식이 공존한다. 가상 호스팅 스타일(`https://bucket.s3.region.amazonaws.com/key`)과 경로 스타일(`https://s3.region.amazonaws.com/bucket/key`)이다. AWS는 2019년에 경로 스타일을 deprecated 예고했으나 기존 고객 영향으로 아직 유지 중이다. 신규 코드는 가상 호스팅 스타일을 써야 한다. SDK는 기본적으로 가상 호스팅 스타일을 사용하므로 별도 설정이 필요 없다.

## 11 nines 내구성의 비밀 — 분산 복제와 erasure coding

"99.999999999% 내구성"은 S3 마케팅의 핵심이다. 이 숫자가 구체적으로 무엇을 의미하는지 이해해야 시험 문제를 정확히 풀 수 있다. 내구성이란 데이터 손실 확률이다. 11 nines는 1년에 1,000만 개를 저장했을 때 평균 하나를 잃을까 말까 한 확률이다. 이 수준의 내구성은 어떻게 달성되는가?

S3 Standard는 데이터를 **최소 3개의 AZ에 걸쳐** 저장한다. 단순히 3벌 복사(replication)가 아니라, **erasure coding** 기법을 사용한다. 데이터를 k개의 조각으로 나눠 m개의 패리티 조각을 추가로 만들면, k+m개 중 임의의 m개가 손상되어도 k개로 원본 복구가 가능하다. S3는 Reed-Solomon 기반 erasure coding을 써서 스토리지 오버헤드를 최소화하면서 내구성을 극대화한다. 3벌 복사라면 300% 오버헤드지만, erasure coding은 50~67% 오버헤드로 더 높은 내구성을 달성한다.

> 💡 **관련 이론**: Reed-Solomon 코드는 1960년 Irving Reed와 Gustave Solomon이 발표한 오류 정정 코드다(IRE Trans. Inf. Theory, 1960). CD와 QR 코드에도 사용되는 이 기법이 클라우드 스토리지의 핵심 기술이 된 것은 구글 GFS(2003)와 Hadoop HDFS(2006)가 그 효율성을 입증했기 때문이다. AWS는 S3 내부 구현을 공개하지 않지만, 특허와 논문에서 erasure coding 기반임이 확인된다.

> 📚 **사례**: 2017년 미국 여배우 Lena Horne의 명예를 기리기 위한 스미소니언 박물관 프로젝트에서 연구팀은 S3에 수십 테라바이트의 디지털 아카이브를 저장했다. 5년 후 검증 시 데이터 무결성이 100% 유지됐다는 보고가 있다. 반면, 내부 RAID 스토리지로 관리하던 유사 프로젝트에서는 디스크 교체 실수로 데이터 일부가 손실됐다. S3의 11 nines가 실제로 "일 처리 안 해도 된다"가 아니라 "AWS가 알아서 처리한다"는 의미임을 보여주는 사례다.

## One Zone-IA는 왜 11 nines인가 — 가용성과 내구성의 차이

시험에서 가장 자주 혼동되는 개념이 **내구성(durability)** 과 **가용성(availability)** 의 차이다. S3 One Zone-IA는 내구성이 여전히 11 nines(99.999999999%)이지만, 가용성은 99.5%밖에 되지 않는다. 왜 그런가?

One Zone-IA는 단일 AZ에만 데이터를 저장한다. 그 AZ 안에서는 erasure coding으로 11 nines 내구성을 달성한다. 그러나 AZ 전체가 재난(화재, 홍수, 전력 차단)으로 완전히 오프라인이 되면 데이터에 접근할 수 없다 — 데이터 자체가 손상된 것은 아니지만 읽을 수가 없는 것이다. 이것이 가용성 99.5%의 의미다. 만약 AZ 장애가 스토리지 하드웨어 손실로 이어진다면 데이터 자체가 영구 손실될 수도 있다. 그래서 **재생성 가능한 데이터(이미지 썸네일, 변환된 데이터)**에만 One Zone-IA를 사용해야 한다.

> ⚠️ **함정**: One Zone-IA를 선택하는 문제에서 "AZ 장애 시 데이터 손실 가능성"이 있다는 점을 항상 기억하자. 시험에서 "재생성 가능한 데이터"라는 힌트가 있으면 One Zone-IA가 정답이고, "어떤 상황에서도 데이터 보존"이라는 힌트가 있으면 Standard 또는 Standard-IA가 정답이다.

## S3 스토리지 클래스 — 비용과 접근 패턴의 트레이드오프

스토리지 클래스의 선택은 단순히 "싼 것"을 고르는 게 아니라, **저장 비용 vs 검색 비용 vs 접근 지연 시간**의 세 축을 최적화하는 문제다.

| 스토리지 클래스 | AZ 수 | 가용성 | 최소 저장 기간 | 검색 시간 | 대표 사용 사례 |
|----------------|-------|--------|---------------|-----------|---------------|
| Standard | 3+ | 99.99% | 없음 | 즉시 | 자주 접근하는 웹 애플리케이션 데이터 |
| Intelligent-Tiering | 3+ | 99.9% | 없음 | 즉시~분 | 접근 패턴 불규칙한 데이터 |
| Standard-IA | 3+ | 99.9% | 30일/128KB | 즉시 | 월 1회 미만 접근, 빠른 복구 필요 |
| One Zone-IA | 1 | 99.5% | 30일/128KB | 즉시 | 재생성 가능한 데이터, 비용 최적화 |
| Glacier Instant Retrieval | 3+ | 99.9% | 90일/128KB | 즉시 | 분기 1회 접근, 즉시 복구 |
| Glacier Flexible Retrieval | 3+ | 99.99% | 90일/40KB | 1분~12시간 | 연 1~2회 접근, 복구 시간 허용 |
| Glacier Deep Archive | 3+ | 99.99% | 180일/40KB | 12~48시간 | 규제 아카이브, 7~10년 보존 |
| Express One Zone | 1 | — | 1시간 | <1ms | AI/ML 학습, HPC 임시 스토리지 |

최소 저장 기간은 중요한 시험 포인트다. Standard-IA에 데이터를 15일 저장 후 삭제해도 **30일치 요금이 청구**된다. 실제 삭제는 됐지만 AWS는 30일 최소 기간에 해당하는 저장 비용을 청구한다. Glacier Deep Archive의 최소 저장 기간은 180일이므로, 아카이브 데이터를 규정 보존 기간 없이 마구 집어넣으면 오히려 비용이 올라간다.

> 💡 **관련 이론**: 스토리지 클래스의 비용 구조는 경제학의 **tiered pricing** 이론과 같다. 접근 빈도가 낮을수록 저장 단가는 낮아지지만, 실제로 접근할 때의 복구 비용은 높아진다. Glacier Deep Archive의 저장 비용은 Standard의 1/23이지만, Bulk 검색 시 GB당 $0.0025가 추가된다. 자주 접근하는 데이터를 Glacier에 넣으면 총 비용이 오히려 높아질 수 있다.

## S3 Intelligent-Tiering — 머신러닝으로 자동 분류

Intelligent-Tiering은 2018년에 출시된 스토리지 클래스로, 객체의 접근 패턴을 S3가 자동으로 모니터링하여 최적 티어로 이동시킨다. 추가 검색 비용 없이 자동화된다는 것이 핵심이다.

Intelligent-Tiering의 내부 구조를 보면 5개 티어로 구성된다. **Frequent Access** 티어(Standard와 동일), **Infrequent Access** 티어(30일 미접근 시 자동 이동, Standard-IA와 동일), **Archive Instant Access** 티어(90일 미접근, Glacier Instant와 동일), **Archive Access** 티어(90~270일, 선택 활성화), **Deep Archive Access** 티어(180~730일, 선택 활성화). 주의할 점은 **객체당 월 $0.0025의 모니터링 비용**이 발생한다는 것이다. 128KB 미만의 작은 객체는 모니터링 비용이 저장 비용보다 더 많이 나올 수 있으므로 Intelligent-Tiering을 쓰면 안 된다.

> 🔍 **더 깊이**: S3 Intelligent-Tiering은 실제로 S3 내부의 ML 기반 접근 패턴 분석기가 각 객체의 마지막 접근 시간을 추적한다. 이 정보는 객체 메타데이터에 저장되며, Lambda 함수나 S3 API로는 직접 조회할 수 없다. 접근 패턴을 직접 분석하고 싶다면 **S3 Storage Class Analysis**를 사용해야 한다 — 이 도구는 Standard와 Standard-IA 간의 전환 시점을 추천해주고, Intelligent-Tiering이 적합한지도 알려준다.

## S3 Express One Zone — 2023년의 새로운 카테고리

2023년 re:Invent에서 발표된 Express One Zone은 기존 S3 클래스와 근본적으로 다르다. 일반 S3가 **General Purpose Bucket**을 사용하는 반면, Express One Zone은 **Directory Bucket**이라는 새로운 버킷 유형을 사용한다. 1밀리초 미만의 접근 지연은 AI/ML 학습 중 반복적으로 같은 데이터셋에 접근할 때 극적인 차이를 만든다. GPU가 데이터를 기다리는 시간을 줄이는 것이 학습 비용을 줄이는 핵심이기 때문이다.

단, 단일 AZ에만 저장되므로 영구 보존이 필요한 데이터에는 적합하지 않다. AI 학습용 임시 데이터, HPC 중간 결과물, 분석 중에만 필요한 스테이징 데이터가 주요 사용 사례다.

> 📚 **사례**: 2024년 한 Gen AI 스타트업이 Stable Diffusion 파인튜닝 파이프라인에서 이미지 데이터셋을 Standard S3에서 Express One Zone으로 이동했더니 GPU 대기 시간이 40% 줄었다고 발표했다. 학습 시간이 줄면서 EC2 GPU 인스턴스 비용이 그만큼 절감되어, Express One Zone의 높은 저장 단가에도 불구하고 전체 비용이 낮아졌다.

## 2020년 강력한 일관성 업데이트 — 역사적 맥락

2020년 12월 이전까지 S3는 새 객체에 대해서만 read-after-write 일관성을 보장하고, 기존 객체의 업데이트/삭제에는 eventual consistency만 보장했다. 즉, 객체를 덮어쓰거나 삭제한 직후 다른 요청이 이전 버전 데이터를 받을 수 있었다. 이 동작이 많은 개발자에게 버그처럼 보였지만, 사실 S3 설계의 트레이드오프였다 — eventual consistency가 초당 수십만 요청을 처리하는 분산 시스템의 성능을 가능하게 했다.

2020년 12월, AWS는 모든 S3 읽기/쓰기/삭제/목록 작업에 대해 **강력한 일관성(Strong Consistency)** 을 추가 비용 없이 제공하기 시작했다. 이 변경은 S3의 내부 메타데이터 계층을 재설계한 결과였으며, 성능 저하 없이 일관성을 달성했다는 점이 업계에서 큰 주목을 받았다.

> ⚠️ **함정**: 오래된 학습 자료나 시험 문제 은행에 "S3는 eventual consistency"라고 나오면 틀린 내용이다. 2020년 12월 이후 모든 S3 작업은 Strong Consistency다. 시험에서 이 변경점을 묻는 문제가 나오면 "2020년 이후로 Strong Consistency"가 정답이다.

## 비용 구조 전체 이해하기

S3 비용을 계산할 때 많은 개발자가 저장 비용만 보는 실수를 한다. 실제 비용은 4가지 구성 요소로 이루어진다.

```
S3 총 비용 = 저장 비용 + 요청 비용 + 데이터 전송 비용 + 관리 기능 비용

저장 비용: GB/월 기준, 스토리지 클래스별 차등
요청 비용: PUT이 GET보다 비쌈 (PUT ~$0.005/1000, GET ~$0.0004/1000)
데이터 전송:
  - IN(업로드): 무료
  - OUT to 인터넷: 첫 100GB/월 무료, 이후 GB당 $0.09
  - OUT to 같은 리전 AWS 서비스: 무료 (예: S3 → EC2 같은 리전)
  - OUT to 다른 리전: GB당 $0.02
관리 기능: S3 Inventory, Storage Class Analysis, Object Lambda, Replication
```

> 💡 **관련 이론**: S3의 비용 구조는 클라우드 경제학에서 "pay-per-use"의 전형적인 예다. 하지만 IA 클래스의 최소 저장 기간과 최소 객체 크기(128KB) 요건은 "숨겨진 비용"의 예다. 128KB 미만 객체를 Standard-IA에 저장하면 항상 128KB 기준으로 과금된다. 수백만 개의 작은 파일을 IA에 넣으면 실제 데이터보다 훨씬 많은 비용이 나올 수 있다.

## CLI로 직접 확인하기

```bash
# 버킷 생성 (서울 리전)
aws s3api create-bucket \
  --bucket my-unique-bucket-12345 \
  --region ap-northeast-2 \
  --create-bucket-configuration LocationConstraint=ap-northeast-2

# 객체 업로드 시 스토리지 클래스 지정
aws s3 cp archive.zip s3://my-bucket/archives/ \
  --storage-class GLACIER

# 객체 메타데이터 확인 (스토리지 클래스 포함)
aws s3api head-object \
  --bucket my-bucket \
  --key archive.zip

# 특정 prefix의 객체 목록
aws s3 ls s3://my-bucket/documents/ --recursive

# 스토리지 클래스 변경 (실제로는 복사 + 삭제)
aws s3 cp s3://my-bucket/old-file.txt s3://my-bucket/old-file.txt \
  --storage-class STANDARD_IA
```

S3의 "스토리지 클래스 변경"은 실제로 같은 키로 복사하는 작업이다. 이 점이 중요한 이유는 복사 작업이 API 요청 비용을 발생시키기 때문이다. 수백만 객체의 클래스를 변경하려면 수동 복사 대신 **S3 Lifecycle Policy**나 **S3 Batch Operations**를 사용해야 한다.

오늘 살펴본 S3의 철학 — flat namespace, 분산 복제, 스토리지 클래스의 비용 트레이드오프 — 은 DVA-C02의 S3 관련 문제 전반에 깔려 있는 기반 지식이다. 다음 day에서는 이 기반 위에서 버전 관리와 수명 주기 정책이 어떻게 데이터 관리를 자동화하는지 살펴본다.

## 📝 연습 문제

**문제 1.** 다음 S3 버킷 이름 중 유효한 것은?

A) MyCompanyBucket
B) my.company.bucket
C) my-company-bucket-2026
D) 192.168.1.1-backup

**정답: C**
해설: S3 버킷 이름은 소문자, 숫자, 하이픈만 허용한다(점도 기술적으로는 허용되나 HTTPS 인증서 문제로 비권장). A는 대문자 포함이라 무효, D는 IP 주소 형식이라 무효다. B의 점 포함 이름은 기술적으로 유효하지만, 와일드카드 SSL 인증서(`*.s3.amazonaws.com`)와 매칭이 깨져 HTTPS 접속에 문제가 생긴다. C가 가장 모범적인 이름이다.

---

**문제 2.** 분기마다 한 번 접근하지만 접근 시 즉시 데이터가 필요한 규정 준수 로그를 저장하려 한다. 가장 비용 효율적인 스토리지 클래스는?

A) S3 Standard
B) S3 Standard-IA
C) S3 Glacier Instant Retrieval
D) S3 Glacier Flexible Retrieval

**정답: C**
해설: Glacier Instant Retrieval은 분기별(90일 이상 간격) 접근 패턴에 최적화되어 있으며, 밀리초 수준의 즉시 검색을 지원한다. Standard는 자주 접근하는 데이터용으로 분기 접근에는 과비용이고, Standard-IA는 30일 최소 보관에 즉시 검색을 지원하지만 Glacier IR보다 저장 비용이 높다. Glacier Flexible은 즉시 검색이 불가능하고 복구에 1~12시간이 필요하므로 "즉시 필요"라는 요건에 맞지 않다.

---

**문제 3.** 2024년에 S3 Standard-IA에 10MB 파일을 업로드했다가 20일 후 삭제했다. 청구되는 저장 비용은?

A) 20일치 비용
B) 30일치 비용 (최소 저장 기간)
C) 10일치 추가 비용
D) 비용 없음 (삭제했으므로)

**정답: B**
해설: S3 Standard-IA는 최소 저장 기간이 30일이다. 20일 만에 삭제해도 AWS는 남은 10일치 저장 비용을 청구한다. 이 규칙은 Glacier Instant Retrieval(90일), Glacier Flexible Retrieval(90일), Glacier Deep Archive(180일)에도 동일하게 적용된다. 최소 객체 크기(128KB) 요건도 있어서 작은 파일은 128KB 기준으로 과금된다.

---

**문제 4.** S3의 내구성과 가용성에 대한 올바른 설명은?

A) S3 Standard의 내구성은 99.99%이고 가용성은 99.999999999%이다
B) One Zone-IA의 내구성이 낮은 이유는 단일 AZ에 저장하기 때문이다
C) S3 Standard의 내구성은 99.999999999%이고 One Zone-IA도 동일한 내구성이다
D) Glacier의 내구성은 S3 Standard보다 낮다

**정답: C**
해설: 모든 S3 스토리지 클래스의 내구성은 99.999999999%(11 nines)로 동일하다. 내구성은 데이터 손실 확률을 뜻하는데, One Zone-IA는 단일 AZ 내에서 erasure coding으로 11 nines를 달성한다. 다만 AZ 전체가 물리적으로 파괴되는 극단적 재난 시에는 데이터 손실 위험이 있다. One Zone-IA가 낮은 것은 내구성이 아니라 **가용성**(99.5%)이다. B가 절반은 맞지만 "내구성이 낮다"는 표현은 정확하지 않다.

---

**문제 5.** 다음 중 S3 Intelligent-Tiering을 사용하면 안 되는 상황은?

A) 접근 패턴이 불규칙한 수십만 개의 대용량 이미지 파일
B) 수백만 개의 소형 로그 파일(평균 크기 50KB)
C) 3개월에 한 번 분석하는 대용량 데이터셋
D) 접근 패턴을 예측하기 어려운 사용자 업로드 파일

**정답: B**
해설: S3 Intelligent-Tiering은 객체당 월 $0.0025의 모니터링 비용이 발생한다. 50KB 파일의 한 달 저장 비용은 약 $0.0000115(Standard 기준)인데, 모니터링 비용 $0.0025가 저장 비용의 200배 이상이다. AWS 자체도 공식 문서에서 128KB 미만의 객체는 Intelligent-Tiering에 부적합하다고 명시한다. 나머지 선택지는 모두 Intelligent-Tiering의 이상적인 사용 사례다.

---

**문제 6.** S3에서 PUT 요청으로 업로드 가능한 단일 객체의 최대 크기와, 그 이상을 업로드하려면 사용해야 하는 방법은?

A) 최대 1GB, S3 Transfer Acceleration 사용
B) 최대 5GB, Multipart Upload 사용
C) 최대 5TB, 제한 없음
D) 최대 100MB, Multipart Upload 사용

**정답: B**
해설: 단일 PUT 요청으로는 최대 5GB까지 업로드할 수 있다. 5GB를 초과하는 객체는 Multipart Upload를 사용해야 하며(최대 5TB), 100MB 이상 객체에 대해서도 Multipart Upload를 권장한다. Multipart는 실패 시 해당 파트만 재전송하면 되고, 병렬 처리로 속도도 향상된다. Transfer Acceleration은 전 세계 어디서나 빠른 업로드를 제공하는 기능이지, 크기 제한과는 무관하다.

---

**문제 7.** S3 Express One Zone에 대한 올바른 설명은?

A) 여러 AZ에 데이터를 분산 저장하여 11 nines 내구성을 보장한다
B) 일반 S3 버킷과 동일한 API로 사용할 수 있다
C) Directory Bucket 유형을 사용하며 1ms 미만의 지연 시간을 제공한다
D) 모든 리전에서 사용 가능하다

**정답: C**
해설: S3 Express One Zone은 일반 General Purpose Bucket이 아닌 Directory Bucket이라는 새로운 유형을 사용한다. 단일 AZ에만 데이터를 저장하므로 AZ 장애 시 데이터 접근이 불가능하고, 2023년 기준 제한된 리전에서만 제공된다. 1ms 미만의 접근 지연은 Standard의 수십~수백ms보다 약 10배 빠르다. AI/ML 학습, HPC 워크로드처럼 반복적 데이터 접근이 필요한 경우에 최적화되어 있다.

---
