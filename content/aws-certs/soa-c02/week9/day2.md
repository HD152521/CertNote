# Day 2 - Secrets Manager, 살아있는 시스템의 비밀번호를 무중단으로 바꾸는 법

비밀번호를 바꾸는 건 쉽다. 콘솔에 들어가 새 비밀번호를 입력하고 저장하면 끝이다. 그런데 그 비밀번호를 쓰는 애플리케이션이 24시간 돌고 있다면 이야기가 완전히 달라진다. 비밀번호를 바꾸는 그 찰나에, 옛 비밀번호를 캐싱한 앱 서버 수십 대는 일제히 인증 실패를 토해낸다. "비밀번호 회전"이라는 단순해 보이는 운영 작업이 실제로는 분산 시스템에서 가장 까다로운 동시성 문제 중 하나인 이유다.

Secrets Manager의 존재 이유는 단지 "비밀을 안전하게 저장하는 금고"가 아니다. 그건 Parameter Store SecureString도 한다. Secrets Manager가 월 $0.40이라는, Parameter Store보다 훨씬 비싼 값을 받는 이유는 **살아있는 시스템의 비밀을 다운타임 없이 회전시키는 오케스트레이션**에 있다. 왜 회전이 4단계로 쪼개져 있는지, 두 사용자를 번갈아 쓰는 전략이 왜 무중단을 보장하는지, 멀티 리전 복제가 왜 읽기 전용인지 — 이 설계들의 이유를 따라가는 게 이 글이다.

## 비밀을 코드에서 떼어내는 일 — Secrets Manager가 푸는 진짜 문제

GitHub에 올라간 코드에서 AWS 키가 발견되는 사고는 지금도 매일 일어난다. GitGuardian의 연례 보고서는 공개 저장소에서 매년 수백만 건의 하드코딩된 비밀이 노출된다고 집계한다. 비밀번호, API 키, 토큰을 소스 코드나 설정 파일에 박아두는 관행이 사고의 근원이다. 한 번 커밋된 비밀은 git 히스토리에 영원히 남고, 저장소를 fork한 모든 사람의 디스크에 복제된다.

Secrets Manager는 비밀을 코드 밖으로 완전히 빼낸다. 애플리케이션은 비밀번호 대신 **비밀의 이름**(`prod/web/db-password`)만 알고, 런타임에 API로 실제 값을 가져온다. 코드에는 비밀이 없고, git에도 없고, 설정 파일에도 없다. 비밀은 KMS로 암호화돼 Secrets Manager에만 존재하며, IAM으로 누가 읽을 수 있는지 통제되고, CloudTrail로 누가 언제 읽었는지 감사된다.

여기까지는 Parameter Store SecureString도 똑같이 한다. 결정적 차이는 그다음이다 — **비밀은 정적이지 않다.** 보안 모범 사례는 비밀번호를 주기적으로 바꾸라고 한다(90일 회전이 흔한 컴플라이언스 요건이다). 정적 비밀 저장소는 "바꾸는 일"을 사람에게 떠넘기지만, Secrets Manager는 그 회전을 자동화한다. 이게 가격 차이의 핵심이고, "회전이 필요한가"가 두 서비스를 가르는 결정 기준이다.

> 💡 **관련 이론**: 비밀을 코드에서 분리하는 원칙은 2011년 정립된 Twelve-Factor App 방법론의 세 번째 요소 "Config in the environment"에서 명문화됐다. 핵심 주장은 "코드와 설정(특히 비밀)을 엄격히 분리하라, 같은 코드가 다른 환경(개발·스테이징·프로덕션)에서 다른 비밀로 동작해야 하기 때문"이다. 비밀을 환경 변수나 외부 저장소에 두면 같은 코드 이미지를 모든 환경에 배포할 수 있고, 비밀 노출 시 코드 재배포 없이 비밀만 교체할 수 있다. Secrets Manager는 이 원칙을 "환경 변수"보다 한 단계 더 안전하게 — 암호화·감사·자동 회전이 붙은 전용 서비스로 — 끌어올린 것이다.

## 회전이 4단계로 쪼개진 이유 — 원자적으로 바꿀 수 없는 비밀

비밀번호 회전을 한 번의 동작으로 생각하면 함정에 빠진다. "DB 비밀번호를 새것으로 바꾸고, Secrets Manager에도 새것을 저장한다." 이 두 작업이 동시에 일어날 수 없다는 게 문제다. DB를 먼저 바꾸면 Secrets Manager가 아직 옛 비밀을 들고 있어 앱이 인증 실패하고, Secrets Manager를 먼저 바꾸면 DB가 아직 옛 비밀이라 새 값으로 인증 실패한다. 분산된 두 시스템(비밀 저장소와 비밀 사용처) 사이에는 원자적 업데이트가 불가능하다.

Secrets Manager의 회전 Lambda가 4단계로 쪼개진 건 이 비원자성을 안전하게 다루기 위한 상태 기계(state machine)다. 각 단계는 별도 Lambda 호출로 실행되고, 버전 라벨(`AWSCURRENT`, `AWSPENDING`, `AWSPREVIOUS`)로 어느 단계까지 진행됐는지 추적한다.

```
1. createSecret  : 새 비밀번호를 생성해 AWSPENDING 라벨로 저장
                   (아직 DB에는 적용 안 함, 앱은 여전히 AWSCURRENT 사용)
2. setSecret     : AWSPENDING의 새 비밀번호를 실제 DB에 적용
                   (이제 DB는 새 비밀번호를 받음)
3. testSecret    : AWSPENDING 비밀번호로 DB 연결을 시도해 검증
                   (실패하면 여기서 중단 — AWSCURRENT는 그대로라 앱 무사)
4. finishSecret  : AWSCURRENT 라벨을 AWSPENDING이 가리키던 버전으로 이동
                   (옛 버전은 AWSPREVIOUS로 강등)
```

이 4단계 분리의 핵심은 **3번 검증이 실패하면 회전 전체가 안전하게 멈춘다**는 점이다. AWSCURRENT 라벨이 끝까지 옛 버전을 가리키고 있으므로, 회전이 중간에 깨져도 애플리케이션은 여전히 작동하는 옛 비밀을 받는다. 만약 회전이 "DB 바꾸고 → 저장소 바꾸기"의 두 단계뿐이었다면, DB는 바뀌었는데 저장소 업데이트가 실패하는 순간 시스템 전체가 인증 불능에 빠진다. 4단계 + 라벨 추적은 어느 지점에서 실패해도 일관된 상태로 수렴하도록 설계된, 일종의 트랜잭션 흉내다.

> 💡 **관련 이론**: 4단계 회전은 데이터베이스 트랜잭션의 2단계 커밋(Two-Phase Commit, 2PC)과 발상이 닮았다. 2PC는 "준비(prepare) 단계에서 모든 참여자가 커밋 가능함을 약속하고, 그 후에야 실제 커밋"하는 프로토콜로, 일부만 커밋되는 부분 실패를 막는다. Secrets Manager는 createSecret/setSecret/testSecret이 "준비" 역할을, finishSecret이 "커밋" 역할을 한다 — testSecret까지 통과해야 비로소 AWSCURRENT를 옮긴다. 진짜 2PC는 아니지만(분산 트랜잭션 코디네이터가 없으므로) "검증 후 커밋"이라는 핵심 안전성은 공유한다. AWSPENDING 라벨이 2PC의 "prepared but not committed" 상태에 해당한다.

> 🔍 **더 깊이**: RDS, Aurora, DocumentDB, Redshift는 AWS가 회전 Lambda를 기성품으로 제공한다 — 위 4단계가 각 DB 엔진에 맞게 구현돼 있어서 사용자가 코드를 한 줄도 짤 필요가 없다. 반면 자체 시스템(레거시 API, 서드파티 SaaS의 토큰 등)은 4단계 인터페이스를 구현한 Custom Rotation Lambda를 직접 작성해야 한다. AWS는 이 Lambda의 골격 템플릿(SAR, Serverless Application Repository)을 제공하므로, createSecret~finishSecret 함수 본문만 대상 시스템에 맞게 채우면 된다. 시험에서 "RDS 비밀번호 회전 Lambda를 직접 짜야 하나?"는 함정이다 — RDS는 AWS 제공, 자체 시스템만 직접 작성이다.

## Single User vs Alternating Users — 무중단의 진짜 비밀

4단계 회전에는 미묘한 위험이 하나 더 숨어 있다. **setSecret(DB에 새 비밀 적용)과 finishSecret(AWSCURRENT 이동) 사이의 틈**이다. setSecret으로 DB 비밀번호가 이미 새것으로 바뀌었는데, finishSecret이 아직 안 돌아서 AWSCURRENT는 여전히 옛 비밀을 가리키는 짧은 순간이 있다. 이 순간에 비밀을 새로 fetch하는 앱은 옛 비밀을 받아 인증 실패한다. Single User 전략은 이 틈을 완전히 없애지 못한다.

**Single User 전략**은 한 DB 계정의 비밀번호 하나를 그 자리에서 바꾼다. 단순하지만, 위 틈 동안 그리고 앱들이 캐시를 갱신하기 전까지 짧은 인증 실패가 발생할 수 있다. 대부분의 앱은 연결 재시도 로직이 있어 실무에선 큰 문제가 안 되지만, 엄격한 무중단이 요구되면 부족하다.

**Alternating Users 전략**은 이 문제를 우아하게 푼다. DB에 계정을 **두 개**(예: `app_user` / `app_user_clone`) 두고 번갈아 회전한다. 회전할 때 현재 사용 중이지 **않은** 계정의 비밀번호를 바꾸고, 검증이 끝나면 AWSCURRENT를 그 계정으로 옮긴다. 핵심은 **회전 대상 계정이 회전하는 동안 누구에게도 사용되지 않는다**는 것이다.

```
회전 전:  AWSCURRENT → app_user (앱들이 사용 중)
회전 중:  app_user_clone의 비밀번호를 새로 설정 (app_user는 건드리지 않음)
          → app_user_clone으로 연결 검증 (app_user 사용 앱은 무사)
회전 후:  AWSCURRENT → app_user_clone (이제 새 fetch는 clone 사용)
          → 다음 회전 때는 app_user를 갱신 (이번엔 clone이 사용 중)
```

옛 계정(`app_user`)의 비밀번호는 한동안 유효한 채로 남아 있어, 아직 캐시를 갱신하지 못한 앱들도 회전 직후 한동안 정상 작동한다. 그러다 자연스럽게 새 비밀로 넘어간다. **이게 진짜 무중단**이다 — 회전 순간에 어느 앱도 "막 무효화된 비밀"을 만나지 않는다. 대가는 DB 계정을 두 개 관리해야 한다는 운영 복잡도다.

> 📚 **사례**: 무중단 회전이 왜 어려운지는 비밀 회전이 일으킨 대형 장애들이 증언한다. 2020년 마이크로소프트 Teams는 인증에 쓰던 TLS 인증서가 만료되면서 전 세계적으로 몇 시간 다운됐다 — 비밀(인증서)의 라이프사이클 관리 실패였다. 인증서나 비밀번호는 "언젠가 반드시 바뀌어야 하는데, 바뀌는 순간이 가장 위험한" 자산이다. Alternating Users 패턴은 "옛 비밀과 새 비밀이 한동안 공존하는 유예 기간"을 둬서 이 전환의 위험을 흡수한다. 같은 발상이 인증서 회전에서도 쓰인다 — 새 인증서를 먼저 배포해 양쪽이 유효한 기간을 두고, 그 후에 옛 인증서를 폐기한다.

> ⚠️ **함정**: Alternating Users 전략을 쓰려면 회전 Lambda가 "마스터 자격증명"으로 DB에 접속해 다른 계정의 비밀번호를 바꿀 권한이 있어야 한다. 즉 회전 Lambda용 시크릿(`masterarn`)을 별도로 두고, 회전 대상 시크릿에 이 마스터 시크릿을 연결해야 한다. 이 마스터 연결을 빠뜨리면 회전 Lambda가 다른 계정 비밀번호를 못 바꿔 회전이 실패한다. Single User는 자기 비밀번호만 바꾸면 되므로 마스터가 필요 없다 — 이 차이가 두 전략의 설정 복잡도를 가른다.

## Lambda Extension 캐싱 — API를 두드리지 않으면서 회전을 반영하는 법

Secrets Manager의 청구서를 보면 API 호출($0.05/만 건)이 의외로 많이 나오는 경우가 있다. 원인은 보통 **매 요청마다 시크릿을 fetch하는 코드**다. Lambda 함수가 호출될 때마다 `get_secret_value`를 부르면, 초당 수천 번 호출되는 함수는 초당 수천 번 API를 두드린다. 비용도 문제지만 지연(latency)도 늘고, Secrets Manager API 한도(초당 호출 제한)에 부딪힐 수도 있다.

당연한 해법은 캐싱이다. 한 번 가져온 비밀을 메모리에 두고 재사용하면 된다. 그런데 여기 회전과 충돌하는 함정이 있다 — **무한정 캐싱하면 회전된 새 비밀을 영영 못 받는다.** 비밀이 회전됐는데 앱은 옛 비밀을 캐시한 채로 계속 쓰다가 어느 순간 옛 비밀이 완전히 무효화되면 인증 실패한다. 캐싱과 회전 반영은 본질적으로 상충한다.

**AWS Parameters and Secrets Lambda Extension**이 이 상충을 TTL로 해소한다. Lambda Layer로 붙이는 이 확장은 별도 프로세스로 떠서, 함수 코드가 로컬 HTTP 엔드포인트(`localhost:2773`)로 시크릿을 요청하면 메모리 캐시에서 즉시 돌려준다. 캐시에는 TTL(기본 300초)이 있어, 그 시간이 지나면 다음 요청 때 백그라운드로 Secrets Manager에서 새로 가져온다. **캐싱으로 API 호출을 줄이면서도, TTL 주기로 회전된 비밀을 자동 반영**하는 것이다.

```
함수 코드 → localhost:2773 (Extension의 로컬 캐시)
              ├─ 캐시 신선함(TTL 내): 즉시 반환, API 호출 0
              └─ 캐시 만료(TTL 초과): Secrets Manager에서 새로 fetch → 캐시 갱신
```

TTL을 짧게 잡으면 회전 반영이 빠르지만 API 호출이 늘고, 길게 잡으면 반대다. 회전 주기(예: 30일)에 비하면 300초 TTL은 충분히 짧아서, 회전 후 최대 5분이면 모든 인스턴스가 새 비밀로 넘어간다. Alternating Users 전략의 유예 기간(옛 비밀이 한동안 유효)이 이 5분을 안전하게 덮어준다.

> 🔍 **더 깊이**: Lambda Extension은 Lambda 실행 환경의 lifecycle hook을 활용한다. 함수 인스턴스가 살아있는 동안(warm) Extension 프로세스도 함께 살아서 캐시를 유지하므로, 같은 인스턴스의 후속 호출은 모두 캐시 히트다. cold start 때만 Extension이 새로 뜨고 첫 fetch가 일어난다. 이 구조 덕분에 "함수당 캐시"가 아니라 "실행 환경당 캐시"가 되어 효율이 높다. EC2/ECS에서는 동일한 캐싱을 AWS Powertools 라이브러리나 자체 인메모리 캐시 + TTL로 구현한다 — 패턴은 같다.

## Cross-Region Replication이 읽기 전용인 이유 — 단일 진실 원천

Secrets Manager는 시크릿을 여러 리전에 복제할 수 있다. Primary 리전에서 시크릿을 만들고 `replicate-secret-to-regions`로 복제하면, 각 리전의 앱이 로컬에서 빠르게 시크릿을 읽는다. DR 시나리오에서 Primary 리전이 통째로 다운돼도 다른 리전의 replica로 서비스를 이어갈 수 있다. 그런데 **replica는 읽기 전용**이다 — replica에서 시크릿 값을 바꾸거나 회전시킬 수 없다. 왜 이런 제약을 뒀나?

이유는 **회전과 다중 쓰기 지점이 양립할 수 없기 때문**이다. 만약 모든 리전에서 시크릿을 독립적으로 회전시킬 수 있다면, 서울에서 비밀번호를 A로 바꾸고 동시에 도쿄에서 B로 바꾸는 충돌(write conflict)이 생긴다. 둘 중 어느 게 진짜 비밀번호인가? DB는 하나인데 비밀 저장소가 두 개의 다른 답을 들고 있으면 시스템이 깨진다. 분산 시스템에서 같은 데이터를 여러 곳에서 동시에 쓰면 일관성을 보장할 수 없다.

Secrets Manager는 이 문제를 **단일 진실 원천(Single Source of Truth)** 패턴으로 푼다. 쓰기와 회전은 오직 Primary에서만 일어나고, 변경은 단방향으로 replica에 전파된다. replica는 Primary의 충실한 사본일 뿐 독립적 판단을 하지 않는다. Primary에서 회전이 끝나면 새 값이 자동으로 모든 replica에 푸시된다. 이 단방향 구조 덕분에 "비밀번호의 정답"은 언제나 하나뿐이고, 충돌이 원천 차단된다.

> 💡 **관련 이론**: 단일 쓰기 지점 + 다중 읽기 복제본 패턴은 분산 데이터베이스의 Primary-Replica(과거 Master-Slave) 복제 모델 그 자체다. RDS Read Replica, DynamoDB(쓰기는 한 곳, 읽기는 분산)도 같은 구조를 쓴다. 이 모델은 CAP 정리에서 일관성(Consistency)을 가용성보다 우선한 선택이다 — 쓰기를 한 곳으로 모아 충돌을 없애는 대신, Primary가 죽으면 새 Primary 승격(failover) 전까지 쓰기가 막힌다. Secrets Manager는 시크릿이 "자주 읽히지만 드물게 쓰이는(회전 주기 30~90일)" 특성이라 이 트레이드오프가 합리적이다. 읽기 가용성(replica)은 높이고, 쓰기 일관성은 단일 지점으로 보장한다.

> ⚠️ **함정**: Cross-Region 복제 시 각 replica 리전에서 시크릿을 복호화할 KMS 키가 필요하다. Primary의 KMS 키는 그 리전에만 있으므로, replica 리전에는 별도의 KMS 키(Multi-Region Key이거나 리전별 별도 키)를 지정해야 한다. `--add-replica-regions Region=us-east-1,KmsKeyId=alias/...`에서 KmsKeyId를 빠뜨리면 그 리전의 기본 `aws/secretsmanager` 키가 쓰이는데, Customer Managed Key로 암호화하려던 의도와 어긋날 수 있다. Cross-Region 시크릿은 항상 "각 리전의 복호화 키가 준비됐는가"를 함께 점검해야 한다.

## Cross-Account 공유 — 세 개의 정책이 모두 맞아야 하는 이유

다른 AWS 계정의 역할이 우리 계정의 시크릿을 읽게 하려면 정책 세 개가 동시에 맞아야 한다. Resource Policy(시크릿에 붙은 정책), Destination 계정의 IAM Policy, 그리고 시크릿을 암호화한 KMS 키의 Key Policy. 하나라도 빠지면 거부된다. 이게 번거로워 보이지만 각각이 다른 질문에 답한다.

Resource Policy는 "이 시크릿이 외부 계정 X를 허용하는가"에 답한다. 시크릿 소유자가 명시적으로 외부 접근을 열어주는 관문이다. Destination IAM Policy는 "X 계정 안에서 이 역할이 시크릿을 읽을 권한이 있는가"에 답한다 — 외부 계정 내부의 권한 통제다. KMS Key Policy는 "그 외부 역할이 시크릿을 복호화할 키를 쓸 수 있는가"에 답한다. 시크릿 값을 읽으려면 반드시 복호화해야 하므로, 시크릿 읽기 권한만으로는 부족하고 키 사용 권한이 추가로 필요하다.

이 세 겹은 **Defense in Depth(심층 방어)**의 구현이다. Cross-Account 접근은 가장 위험한 권한 부여 중 하나라(우리 계정 밖의 누군가가 우리 비밀을 읽는다), 한 곳의 실수가 즉시 노출로 이어지지 않도록 세 개의 독립적 관문을 둔다. 가장 흔한 함정이 **KMS Key Policy를 빠뜨리는 것**이다 — Resource Policy와 IAM은 맞췄는데 "AccessDenied"가 나면, 십중팔구 KMS 키가 외부 역할의 `kms:Decrypt`를 허용하지 않은 경우다. 시크릿은 KMS 암호화가 기본이므로 키 권한은 선택이 아니라 필수다.

> 🔍 **더 깊이**: 기본 `aws/secretsmanager` 관리형 키로 암호화된 시크릿은 사실 Cross-Account 공유가 불가능하다. AWS Managed Key는 Key Policy를 사용자가 수정할 수 없어서 외부 계정에 `kms:Decrypt`를 부여할 방법이 없기 때문이다. 따라서 Cross-Account로 공유할 시크릿은 처음부터 **Customer Managed Key**로 암호화해야 하고, 그 키의 Key Policy에 외부 역할의 복호화 권한을 명시해야 한다. 시험에서 "Cross-Account 시크릿 공유가 안 된다"는 시나리오의 숨은 원인이 종종 "AWS Managed Key로 암호화해서"다.

## Parameter Store vs Secrets Manager — 비용으로 갈리는 선택

두 서비스는 기능이 겹쳐 보여 자주 혼동된다. 둘 다 값을 저장하고, 둘 다 KMS로 암호화하고, 둘 다 버전을 관리한다. 결정 기준은 단순하다 — **자동 회전과 Cross-Region 복제가 필요한가.** 필요하면 Secrets Manager, 아니면 Parameter Store가 훨씬 싸다.

| 항목 | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| 비용 | Standard 무료, Advanced $0.05/월 | $0.40/시크릿/월 + API |
| 값 크기 | Standard 4KB, Advanced 8KB | 64KB |
| 자동 회전 | 없음 (Lambda로 직접 구현 가능하나 미관리) | 내장 (RDS 등 AWS 제공 Lambda) |
| Cross-Region 복제 | 없음 | 내장 |
| 버전 관리 | 자동 정수 버전 | 라벨 기반(AWSCURRENT 등) |
| 계층 구조 | `/app/prod/db` 경로 트리 | 평면(이름에 `/` 가능하나 트리 아님) |
| 사용 사례 | 설정값, 단순 비밀, 파라미터 | DB 자격증명, 회전 필요한 비밀 |

흥미로운 점은 Parameter Store가 Secrets Manager 시크릿을 **참조**할 수 있다는 것이다. `/aws/reference/secretsmanager/my-secret` 경로로 Parameter Store API를 통해 Secrets Manager 시크릿을 읽을 수 있다. 그래서 코드가 Parameter Store API 하나로 통일된 인터페이스를 쓰면서, 회전이 필요한 비밀만 Secrets Manager에 두는 혼합 패턴이 가능하다. 실무에선 "설정값 대부분은 Parameter Store, DB 자격증명만 Secrets Manager"가 흔하다 — 비용을 최적화하면서 회전이 필요한 곳에만 비싼 서비스를 쓴다.

> 💡 **관련 이론**: "기능이 비슷한 두 서비스 중 어느 것을 쓸까"는 사실 비용 vs 운영 부담의 트레이드오프 문제다. Parameter Store에서 자동 회전을 직접 구현할 수도 있지만(EventBridge 스케줄 + Lambda), 그러면 위에서 본 4단계 상태 기계, 라벨 관리, 실패 롤백을 전부 직접 짜고 유지보수해야 한다. Secrets Manager의 $0.40은 "그 복잡한 회전 오케스트레이션을 AWS가 대신 관리해주는 값"이다. YAGNI(You Aren't Gonna Need It) 원칙대로, 회전이 정말 필요 없는 단순 설정값에 Secrets Manager를 쓰는 건 과잉이다 — 회전이라는 요구가 실제로 있을 때만 Secrets Manager를 꺼내는 게 비용 효율적이다.

## 정리하며

Secrets Manager의 모든 설계는 "살아있는 비밀을 안전하게 바꾼다"는 한 가지 어려운 문제로 수렴한다. 비밀을 코드에서 떼어내는 건 기본이고(그건 Parameter Store도 한다), 진짜 가치는 회전에 있다. 회전이 4단계로 쪼개진 건 비밀 저장소와 사용처를 원자적으로 바꿀 수 없어서 검증 후 커밋하는 상태 기계가 필요하기 때문이고, Alternating Users 전략은 옛 비밀과 새 비밀의 공존 기간으로 무중단을 보장하고, Cross-Region replica가 읽기 전용인 건 다중 쓰기 충돌을 원천 차단하기 위해서다.

운영자가 기억할 다섯 가지는 이렇다. ① Secrets Manager는 회전·Cross-Region이 필요할 때, 그 외엔 Parameter Store가 싸다. ② RDS·Aurora·DocumentDB·Redshift 회전 Lambda는 AWS 제공, 자체 시스템만 직접 작성. ③ 회전 4단계는 createSecret → setSecret → testSecret → finishSecret, 검증 실패 시 AWSCURRENT는 그대로라 앱 무사. ④ replica는 읽기 전용, 회전·쓰기는 Primary에서만. ⑤ Cross-Account는 Resource Policy + IAM + KMS Key Policy 세 개가 모두 맞아야 하고, AWS Managed Key로는 Cross-Account 공유 불가.

다음 글에선 권한 자체를 점검하는 도구로 넘어간다. 만들어둔 IAM 정책과 리소스 정책이 의도와 다르게 외부에 노출돼 있지는 않은지, 누가 안 쓰는 권한을 들고 있는지 — IAM Access Analyzer와 Trusted Advisor가 이걸 자동으로 잡아낸다.

---

## 📝 연습 문제

**문제 1.** Lambda 함수가 매 호출마다 `get_secret_value`를 불러 Secrets Manager API 비용과 지연이 급증했다. 회전된 비밀도 반영해야 한다. 최적 해법은?

A) 시크릿을 환경 변수에 박아 API 호출을 없앤다
B) AWS Parameters and Secrets Lambda Extension — 로컬 캐시 + TTL로 API 호출을 줄이면서 TTL 주기로 회전 자동 반영
C) 시크릿을 DynamoDB에 복사해두고 거기서 읽는다
D) Lambda 동시성을 1로 제한한다

**정답: B**

해설: 매 호출 fetch는 비용·지연·API 한도 문제를 일으키지만, 무한 캐싱은 회전된 비밀을 영영 못 받는 상충이 있다. Lambda Extension은 별도 프로세스로 떠 로컬 엔드포인트(localhost:2773)에서 캐시된 시크릿을 즉시 반환하고, 기본 300초 TTL이 지나면 백그라운드로 새로 가져와 회전을 반영한다. 회전 주기(30~90일)에 비해 5분 TTL은 충분히 짧아 안전하다. A는 회전을 반영하지 못하고 비밀 노출 위험이 크다.

---

**문제 2.** 회전 Lambda의 4단계 중 testSecret이 실패했다. 애플리케이션에 어떤 영향이 있나?

A) AWSCURRENT가 이미 새 비밀로 바뀌어 앱이 인증 실패한다
B) AWSCURRENT는 finishSecret 전까지 옛 버전을 가리키므로 앱은 정상 작동하고 회전만 중단된다
C) 시크릿이 손상돼 복구 불가
D) 자동으로 Single User 전략으로 전환된다

**정답: B**

해설: 4단계 회전이 검증(testSecret)을 finishSecret 앞에 둔 이유가 정확히 이것이다. testSecret까지는 AWSCURRENT 라벨이 끝까지 옛(작동하는) 버전을 가리키므로, 검증이 실패해 회전이 중단돼도 애플리케이션은 여전히 유효한 옛 비밀을 받는다. 데이터베이스 2단계 커밋처럼 "검증을 통과해야 비로소 커밋(finishSecret)"하는 구조라, 어느 지점에서 실패해도 일관된 상태로 수렴한다. 새 비밀이 검증을 통과하지 못하면 옛 비밀 그대로 운영이 유지된다.

---

**문제 3.** 비밀번호 회전 순간에도 단 한 건의 인증 실패도 허용되지 않는 엄격한 무중단 요건이 있다. 어떤 회전 전략이 적합한가?

A) Single User — 단순해서 가장 안전
B) Alternating Users — DB 계정을 둘 두고 사용 중이 아닌 계정을 회전시켜, 옛 비밀과 새 비밀이 공존하는 유예 기간으로 무중단 보장
C) 회전을 끄고 수동으로만 바꾼다
D) Cross-Region Replication

**정답: B**

해설: Single User는 setSecret과 finishSecret 사이의 틈, 그리고 캐시 갱신 전까지 짧은 인증 실패가 날 수 있다. Alternating Users는 계정을 둘(app_user / app_user_clone) 두고 현재 사용 중이 아닌 계정을 회전시키므로, 회전 대상 계정이 회전 동안 누구에게도 안 쓰인다. 옛 계정의 비밀번호가 한동안 유효한 채 남아 캐시를 아직 갱신 못한 앱도 정상 작동한다 — 이 공존 유예 기간이 진짜 무중단을 만든다. 대가는 DB 계정 두 개 관리와 마스터 자격증명 설정이다.

---

**문제 4.** Cross-Region Replication으로 만든 replica 시크릿에서 비밀번호를 직접 회전시키려 하자 거부됐다. 이유는?

A) IAM 권한 부족
B) Replica는 읽기 전용 — 쓰기·회전은 Primary에서만 가능하며, 다중 쓰기 충돌을 막기 위한 단일 진실 원천 설계
C) KMS 키가 없어서
D) replica는 30일 후에야 쓰기 가능

**정답: B**

해설: 모든 리전에서 독립적으로 회전하면 서울에서 A, 도쿄에서 B로 바꾸는 쓰기 충돌이 생겨 "진짜 비밀번호"가 무엇인지 모호해진다. Secrets Manager는 쓰기·회전을 Primary 한 곳으로 모으고 변경을 단방향으로 replica에 전파하는 단일 진실 원천(Single Source of Truth) 패턴으로 이를 막는다. RDS Read Replica, DynamoDB와 같은 Primary-Replica 복제 모델이며, 시크릿이 자주 읽히고 드물게 쓰이는 특성상 합리적인 트레이드오프다.

---

**문제 5.** 다른 계정(222233334444)의 역할이 우리 계정의 Customer Managed Key로 암호화된 시크릿을 읽어야 한다. 어떤 설정이 모두 필요한가?

A) 시크릿 Resource Policy만
B) 시크릿 Resource Policy + Destination 계정의 IAM Policy + KMS Key Policy의 외부 역할 Decrypt 허용
C) Destination 계정 IAM Policy만
D) VPC Peering

**정답: B**

해설: Cross-Account 시크릿 읽기는 세 관문을 모두 통과해야 한다. Resource Policy("이 시크릿이 외부 계정을 허용하는가"), Destination IAM Policy("외부 계정 안에서 이 역할이 읽을 권한이 있는가"), KMS Key Policy("그 역할이 복호화 키를 쓸 수 있는가"). 시크릿은 KMS 암호화가 기본이라 복호화 권한이 필수다. 가장 흔한 실수가 KMS Key Policy 누락이다. 또 AWS Managed Key(`aws/secretsmanager`)는 Key Policy를 수정할 수 없어 Cross-Account 공유 자체가 불가능하므로, 처음부터 Customer Managed Key로 암호화해야 한다.

---

**문제 6.** 애플리케이션 설정값 200개와 DB 자격증명 5개를 관리한다. 비용을 최소화하면서 DB 자격증명만 자동 회전하려 한다. 최적 구성은?

A) 모두 Secrets Manager에 저장
B) 설정값 200개는 Parameter Store(대부분 무료), 회전이 필요한 DB 자격증명 5개만 Secrets Manager
C) 모두 Parameter Store에 저장하고 회전은 포기
D) 모두 환경 변수로 관리

**정답: B**

해설: Secrets Manager는 시크릿당 월 $0.40, Parameter Store Standard는 무료다. 자동 회전·Cross-Region이 필요할 때만 Secrets Manager를 쓰고 그 외는 Parameter Store를 쓰는 게 비용 효율적이다(설정값 200개를 Secrets Manager에 두면 월 $80). DB 자격증명 5개만 Secrets Manager에 두면 회전을 자동화하면서 비용은 월 $2 수준이다. Parameter Store는 `/aws/reference/secretsmanager/` 경로로 Secrets Manager 시크릿을 참조할 수도 있어 인터페이스를 통일하기도 좋다. YAGNI 원칙대로 회전이 실제로 필요한 곳에만 비싼 서비스를 쓴다.

---

**문제 7.** RDS MySQL의 마스터 비밀번호를 30일마다 자동 회전하려 한다. 회전 Lambda를 직접 작성해야 하나?

A) 그렇다, createSecret~finishSecret 4단계를 모두 직접 구현해야 한다
B) 아니다, RDS·Aurora·DocumentDB·Redshift는 AWS가 회전 Lambda를 기성품으로 제공하므로 `rotate-secret`에 그 Lambda ARN과 주기만 지정하면 된다
C) RDS는 자동 회전을 지원하지 않는다
D) Parameter Store로만 가능하다

**정답: B**

해설: AWS는 RDS/Aurora/DocumentDB/Redshift용 회전 Lambda를 기성품으로 제공한다(Single User, Alternating Users 두 전략 모두). 4단계 상태 기계가 각 DB 엔진에 맞게 이미 구현돼 있어 사용자가 코드를 짤 필요가 없다 — `rotate-secret`에 해당 Lambda ARN과 `AutomaticallyAfterDays=30`만 지정하면 된다. 직접 작성이 필요한 경우는 레거시 API나 서드파티 SaaS 토큰처럼 AWS가 기성 Lambda를 제공하지 않는 자체 시스템뿐이며, 이때도 AWS가 골격 템플릿을 제공한다.

---
