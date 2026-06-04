# Day 4 - Parameter Store와 Secrets Manager: 시크릿 회전의 깊은 이야기

비밀번호 하나를 코드에 박아두는 일은 쉽다. `DB_PASSWORD = "supersecret"` 한 줄이면 동작한다. 그런데 그 한 줄이 Git 히스토리에 남고, 수십 명의 개발자가 클론하고, CI 로그에 찍히고, 백업 디스크에 복제되는 순간 그 비밀번호는 더 이상 비밀이 아니다. 게다가 비밀번호는 한 번 정하면 영원히 같다. 누군가 그것을 한 번이라도 봤다면, 그 사람이 회사를 떠난 뒤에도 그 비밀번호는 살아 있다. 시크릿 관리라는 분야 전체는 이 두 가지 문제 — "어디에 안전하게 저장할 것인가"와 "어떻게 주기적으로 바꿀 것인가" — 를 다루기 위해 존재한다.

오늘은 AWS의 두 시크릿 저장소 — Parameter Store와 Secrets Manager — 를 본다. 단순히 "둘 중 뭘 쓰나"가 아니라, 왜 시크릿을 회전(rotation)해야 하는지, 회전 중에 어떻게 다운타임 없이 비밀번호를 바꾸는지, AWSCURRENT/AWSPENDING이라는 라벨 두 개가 어떻게 원자적 교체를 보장하는지, 그리고 봉투 암호화(envelope encryption)라는 KMS의 근본 설계가 왜 Cross-Account 공유의 핵심이 되는지를 파고든다. DOP 시험에서 시크릿 관리는 거의 매 회 나오고, "zero-downtime 회전", "Cross-Account 시크릿", "비용 최적화 선택", "회전이 실패했다" 같은 시나리오는 단골이다.

## 왜 회전인가 — 시크릿의 생애주기와 노출 창

먼저 근본 질문. 비밀번호를 왜 주기적으로 바꿔야 하는가. 답은 **노출 창(window of exposure)을 줄이기 위해서**다. 어떤 비밀번호든 시간이 지나면 노출 위험이 누적된다. 개발자가 화면에 띄운 걸 누가 봤을 수도, 로그에 한 번 찍혔을 수도, 유출된 백업에 들어 있을 수도 있다. 비밀번호를 30일마다 바꾸면, 설령 오늘 유출되더라도 그 가치는 최대 30일 뒤 사라진다. 회전은 "유출이 일어나지 않게 막는" 게 아니라 "유출이 일어나도 피해 기간을 한정하는" 방어다.

이건 보안에서 **자격 증명의 생애주기 관리(credential lifecycle management)**라는 큰 주제의 일부다. NIST SP 800-63B(디지털 신원 가이드라인)는 흥미롭게도 사람이 외우는 비밀번호의 **강제 주기 변경은 오히려 권장하지 않는다**(사람은 주기 변경을 강요받으면 `Password1`, `Password2`처럼 약한 패턴으로 바꾸기 때문). 하지만 같은 문서가 **시스템·기계 자격 증명(machine credentials)은 주기 회전을 강하게 권장**한다. 기계는 약한 패턴을 만들지 않고, 무작위 64자 비밀번호를 매번 새로 생성하는 데 비용이 들지 않기 때문이다. Secrets Manager의 회전 대상은 정확히 이 기계 자격 증명이다. 사람이 외울 필요가 없으니 마음껏 길고 무작위하게, 그리고 자주 바꾼다.

> 💡 **관련 이론**: 회전의 효과는 정보 이론의 관점에서 "공격자가 확보한 정보의 시간적 가치 감소"로 설명된다. 암호학에서 같은 키로 너무 많은 데이터를 암호화하면 안 되는 것(키 재사용 한계)과 같은 직관이다. 키·자격 증명은 사용량과 시간에 비례해 노출 위험이 커지므로 주기적으로 교체한다. TLS의 세션 키가 매 연결마다 새로 협상되는 것, Kerberos 티켓이 짧은 수명을 갖는 것, AWS STS 임시 자격 증명이 기본 1시간인 것 모두 같은 원리 — **수명이 짧을수록 탈취당해도 쓸모가 없다**는 단기 자격 증명(short-lived credential) 철학이다.

> 🔍 **더 깊이**: 회전과 대비되는 더 급진적인 접근이 "비밀번호 자체를 없애는 것"이다. RDS IAM 인증이 그 예다. 비밀번호 대신 IAM Role이 `rds-db:connect` 권한으로 15분짜리 인증 토큰을 그때그때 발급받아 접속한다. 저장할 비밀번호가 아예 없으니 회전할 것도 없고 유출될 것도 없다. 이것이 secret-less 아키텍처의 이상이다. 다만 한계가 있다 — 토큰 생성에 IAM 호출 오버헤드가 있어 초당 수천 연결을 새로 여는 대규모 워크로드에는 부담이고, 일부 엔진/도구가 토큰 방식을 지원하지 않는다. 그래서 현실에서는 "회전되는 비밀번호(Secrets Manager)"와 "비밀번호 없는 IAM 인증"이 워크로드 특성에 따라 공존한다. 시험에서 "비밀번호를 아예 저장하고 싶지 않다"가 나오면 IAM 인증이 답이고, "기존 비밀번호 방식을 유지하되 안전하게 회전"이면 Secrets Manager다.

## 두 저장소 — 같은 듯 다른 Parameter Store와 Secrets Manager

AWS에는 시크릿을 넣을 곳이 두 군데 있고, 이게 처음엔 헷갈린다. 둘 다 KMS로 암호화하고, 둘 다 IAM으로 접근을 통제하고, 둘 다 버전을 관리한다. 그런데 둘은 태생이 다르다. **Parameter Store는 원래 "구성(configuration) 저장소"로 출발했다.** DB 호스트명, 로그 레벨, 기능 플래그 같은 비밀이 아닌 설정값을 계층 경로에 넣어두는 용도였고, SecureString 타입으로 비밀도 담을 수 있게 확장됐다. **Secrets Manager는 처음부터 "비밀 전용"으로, 그 중심에 자동 회전이 있다.** 회전 엔진이 내장됐다는 게 두 서비스를 가르는 가장 큰 차이다.

| 항목 | Parameter Store Standard | Parameter Store Advanced | Secrets Manager |
|------|--------------------------|---------------------------|-----------------|
| 값 크기 한도 | 4KB | 8KB | 64KB |
| 항목당 월 비용 | 무료 | $0.05 | $0.40 |
| API 호출 비용 | 무료(throttle 있음) | $0.05 / 10,000 | $0.05 / 10,000 |
| **자동 회전** | ❌ | ❌ | ✅ (내장 엔진) |
| Resource Policy | ❌ | ✅ | ✅ |
| TTL/만료 정책 | ❌ | ✅ | ✅ |
| KMS 암호화 | SecureString만 | SecureString만 | 항상 |
| 버전 라벨 | 숫자 버전 | 숫자 버전 | AWSCURRENT/PENDING/PREVIOUS |
| Cross-Region 복제 | ❌ | ❌ | ✅ |
| 주 용도 | DB host, 플래그 | 큰 구성, TTL | DB 비번, API 키, 회전 |

핵심 판단 기준은 단순하다. **회전이 필요하면 Secrets Manager, 아니면 Parameter Store.** 그리고 비용이 10배 가까이 차이 난다($0.40 vs 무료). 그래서 실무 패턴은 "단순 설정 100개는 Parameter Store Standard에 무료로, 회전이 필요한 비밀번호 5개만 Secrets Manager에" 두는 혼합 구성이다. 모든 걸 Secrets Manager에 몰아넣으면 105개 × $0.40 = 월 $42가 나오지만, 혼합하면 5 × $0.40 = $2로 끝난다.

> ⚠️ **함정**: "비밀이니까 무조건 Secrets Manager"라는 생각이 가장 흔한 비용 함정이다. 회전하지 않는 정적 비밀(예: 서드파티 API 키 중 회전 정책이 없는 것)은 Parameter Store SecureString에 넣어도 KMS 암호화로 충분히 안전하고 무료다. 반대로 "비용 아끼려고 회전 비밀번호까지 Parameter Store에"도 함정이다 — Parameter Store에는 회전 엔진이 없어 회전 Lambda를 손수 만들고 스케줄링해야 하므로, 결국 Secrets Manager가 공짜로 주는 걸 비싸게 재구현하게 된다. 판단 축은 "비밀이냐 아니냐"가 아니라 "회전이 필요하냐 아니냐"다.

> 💡 **관련 이론**: 두 저장소의 구분은 소프트웨어 아키텍처의 **관심사 분리(separation of concerns)**와 12-Factor App의 "Config" 원칙이 만나는 지점이다. 12-Factor는 "코드와 설정을 분리하고, 설정은 환경에서 주입하라"고 말한다. 그런데 설정 중에서도 비밀(credential)은 일반 설정과 보안 요구가 근본적으로 다르다 — 암호화, 회전, 감사, 최소 권한. 그래서 성숙한 시스템은 "일반 설정 저장소(Parameter Store)"와 "비밀 저장소(Secrets Manager/Vault)"를 물리적으로 나눈다. HashiCorp Vault, Azure Key Vault, GCP Secret Manager가 모두 같은 분리를 구현한다.

## AWSCURRENT와 AWSPENDING — 원자적 교체의 비밀

Secrets Manager 회전의 핵심을 이해하려면 라벨(staging label) 세 개를 알아야 한다. `AWSCURRENT`, `AWSPENDING`, `AWSPREVIOUS`. 이 라벨들이 어떻게 "다운타임 없는 교체"를 가능하게 하는지가 회전의 진짜 알맹이다.

비밀번호를 바꾸는 일은 본질적으로 위험하다. 애플리케이션이 비밀번호를 읽어 DB에 접속하는 그 찰나에 비밀번호가 바뀌면, 옛 비밀번호로 접속을 시도하다 실패한다. 단순하게 "DB 비번을 바꾸고 → 저장소 값을 바꾼다" 순서로 하면, 두 작업 사이의 짧은 틈에 모든 연결이 깨진다. Secrets Manager는 이 문제를 **버전에 라벨을 붙이는 간접 참조(indirection)**로 푼다.

애플리케이션은 항상 `AWSCURRENT` 라벨이 가리키는 버전을 읽는다. 회전은 이렇게 진행된다.

```
회전 4단계 (RDS 회전 Lambda 표준 구현)
==================================================
1. createSecret  : 새 무작위 비밀번호를 만들고 AWSPENDING 라벨로 새 버전 저장
                   (이때 AWSCURRENT는 아직 옛 비밀번호 그대로)
2. setSecret     : DB에 접속해 실제 비밀번호를 AWSPENDING 값으로 변경
3. testSecret    : AWSPENDING 비밀번호로 DB 접속을 테스트 (검증)
4. finishSecret  : AWSPENDING 라벨을 AWSCURRENT로 이동 (원자적)
                   → 옛 버전은 자동으로 AWSPREVIOUS가 됨
```

4단계 `finishSecret`가 마법이다. 라벨을 옮기는 이 동작은 **원자적**이다. 애플리케이션이 `GetSecretValue`를 호출하면 라벨이 옮겨지기 전이면 옛 값, 옮겨진 후면 새 값을 받는다. 중간의 깨진 상태가 없다. 그리고 `AWSPREVIOUS`로 밀려난 옛 비밀번호는 한 회전 주기 동안 살아 있어서, 회전 직전에 비밀번호를 읽어 캐시한 연결이 잠깐 더 동작할 여지를 준다.

> 💡 **관련 이론**: 라벨을 통한 간접 참조는 컴퓨터 과학에서 너무나 익숙한 패턴이다. 데이터베이스의 MVCC(다중 버전 동시성 제어)에서 트랜잭션이 일관된 스냅샷을 보는 방식, Git의 브랜치 포인터(브랜치는 커밋을 가리키는 움직이는 라벨), 블루/그린 배포에서 라우터가 가리키는 환경을 한 번에 전환하는 방식 — 모두 "실제 객체는 그대로 두고 포인터만 원자적으로 옮긴다"는 같은 아이디어다. David Wheeler의 격언 "컴퓨터 과학의 모든 문제는 한 겹의 간접 참조로 풀 수 있다"가 정확히 여기 적용된다. AWSCURRENT는 비밀번호 위에 얹힌 한 겹의 간접 참조다.

## Single User vs Multi User — 회전 중의 빈틈을 없애는 법

위 4단계에는 미묘한 빈틈이 하나 있다. 2단계 `setSecret`에서 DB의 실제 비밀번호를 바꾸는 순간부터 4단계 `finishSecret`에서 라벨이 옮겨지기 전까지, **DB의 실제 비밀번호(새것)와 AWSCURRENT가 가리키는 값(옛것)이 잠깐 불일치**한다. 이 짧은 구간에 새 연결을 맺으려 옛 비밀번호로 시도하면 실패할 수 있다. Single User 회전은 이 빈틈을 감수한다. 회전 빈도가 낮고 연결 풀이 비밀번호를 길게 캐시하는 환경이면 실무적으로 거의 문제가 안 되지만, 이론적 빈틈은 존재한다.

**Multi User(Alternating Users) 회전**은 이 빈틈을 원천 제거한다. 발상은 단순하면서도 우아하다. DB에 동등한 권한의 사용자를 둘(`alpha`, `beta`) 만들어두고, 회전할 때마다 **현재 사용 중이지 않은 쪽의 비밀번호를 바꾼 뒤 그쪽으로 전환**한다.

```
Alternating Users 회전
==================================================
현재 AWSCURRENT = alpha (앱이 alpha로 접속 중)
회전 발생:
  1. beta(현재 미사용)의 비밀번호를 새로 변경 + AWSPENDING에 beta 자격
  2. beta로 테스트 접속
  3. finishSecret → AWSCURRENT = beta
  → alpha는 여전히 옛 비밀번호로 유효 (건드리지 않음)
다음 회전:
  → 이번엔 alpha를 바꾸고 alpha로 전환
```

핵심은 **현재 트래픽이 쓰는 사용자(alpha)의 비밀번호를 절대 건드리지 않는다**는 것이다. 회전 내내 alpha로 접속 중인 모든 연결은 멀쩡하고, 새 연결이 점진적으로 beta로 옮겨간다. 진정한 zero-downtime이다. 대가는 DB에 사용자를 둘 운영하고 권한을 동기화해야 하는 약간의 복잡성이다.

| | Single User | Multi User (Alternating) |
|---|---|---|
| DB 사용자 수 | 1개 | 2개(alpha/beta) |
| 회전 중 빈틈 | 짧은 불일치 구간 존재 | 없음 (현재 사용자 미변경) |
| 설정 복잡도 | 낮음 | 높음(사용자 2개 권한 동기화) |
| 권장 상황 | 회전 드묾, 연결 캐시 | 고가용·고빈도 연결 |

AWS는 RDS PostgreSQL/MySQL/MariaDB, Redshift, DocumentDB용 회전 Lambda 표준 템플릿을 제공한다(`SecretsManagerRDSPostgreSQLRotationSingleUser`, `...MultiUser` 등). 직접 4단계를 구현할 필요 없이 이 템플릿을 붙이면 된다.

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/myapp-rds \
  --rotation-lambda-arn arn:aws:lambda:...:function:SecretsManagerRDSPostgreSQLRotationMultiUser \
  --rotation-rules AutomaticallyAfterDays=30
```

> 🎯 **시나리오**: "결제 서비스의 RDS 비밀번호를 30일마다 회전하되, 회전 순간에도 단 하나의 트랜잭션도 실패하면 안 된다. 피크 시 초당 수천 신규 연결이 열린다." — 답은 Multi User(Alternating) 회전이다. 고빈도로 새 연결이 열리는 환경에서는 Single User의 짧은 불일치 구간조차 수십 건의 연결 실패로 이어질 수 있다. Multi User는 현재 사용 중인 사용자의 비밀번호를 회전 내내 건드리지 않으므로 진행 중·신규 연결 모두 영향이 없다. Single User였다면 "회전 직후 일부 연결 실패" 증상이 나타난다.

> 📚 **사례**: 회전 자동화의 가장 흔한 실패는 회전 Lambda의 네트워크 단절이다. RDS가 Private 서브넷에 있는데 회전 Lambda를 VPC 밖(기본)에 두면, Lambda가 4단계 중 2단계 `setSecret`(DB 접속)에서 멈춘다. 그러면 AWSPENDING은 새 비밀번호로 만들어졌는데 DB는 옛 비밀번호 그대로, 라벨도 안 옮겨진 어정쩡한 상태로 회전이 실패한다. 이 상태에서 사람이 수동 개입해 AWSPENDING을 정리하지 않으면 다음 회전도 꼬인다. 교훈은 명확하다 — DB가 Private이면 회전 Lambda도 같은 VPC의 Private 서브넷에 두고, Secrets Manager 엔드포인트로 가는 경로(VPC 엔드포인트 또는 NAT)를 반드시 확보해야 한다.

## RDS 통합 — 비밀번호를 AWS에게 통째로 맡기기

회전 Lambda를 붙이는 것조차 번거롭다면, RDS가 자기 비밀번호를 알아서 관리하게 할 수 있다. `--manage-master-user-password` 플래그 하나면 된다.

```bash
aws rds create-db-instance \
  --db-instance-identifier prod-db \
  --engine postgres \
  --manage-master-user-password \
  --master-user-secret-kms-key-id alias/rds-secrets
```

이 플래그를 켜면 RDS가 (1) Secrets Manager에 마스터 비밀번호 시크릿을 자동 생성하고, (2) 기본 7일마다 자동 회전하며, (3) 필요한 IAM Role과 회전 Lambda를 알아서 구성한다. 운영자는 비밀번호를 한 번도 보지 않고, 회전 Lambda를 만들지도 않는다. RDS와 Secrets Manager의 네이티브 통합이라 회전 빈틈도 RDS가 내부에서 관리한다. "관리형 데이터베이스의 비밀번호는 관리형으로 다루는" 가장 깔끔한 패턴이고, 시험에서 "RDS 마스터 비밀번호를 가장 적은 운영 부담으로 회전"이 나오면 이게 답이다.

## KMS와 봉투 암호화 — Cross-Account 공유의 토대

이제 가장 까다로운 주제, Cross-Account 시크릿 공유로 간다. 이걸 제대로 이해하려면 KMS의 근본 설계인 **봉투 암호화(envelope encryption)**를 먼저 알아야 한다.

KMS의 마스터 키(CMK)는 실은 데이터를 직접 암호화하지 않는다. 대신 이렇게 동작한다. 시크릿을 저장할 때 KMS가 일회용 **데이터 키(data key)**를 새로 만들어, 그 데이터 키로 시크릿을 암호화한다. 그다음 그 데이터 키 자체를 마스터 키로 암호화해서 암호화된 시크릿 옆에 붙여 저장한다. 시크릿(데이터)은 데이터 키라는 "봉투" 안에 들어 있고, 그 봉투를 다시 마스터 키로 봉인하는 구조라 봉투 암호화다.

```
봉투 암호화 (Envelope Encryption)
==================================================
저장:  시크릿 ──[데이터 키로 암호화]──> 암호문
       데이터 키 ──[마스터 키(CMK)로 암호화]──> 암호화된 데이터 키
       저장된 것 = 암호문 + 암호화된 데이터 키 (마스터 키는 KMS 안에만)

복호화: 암호화된 데이터 키 ──[KMS에 보내 마스터 키로 복호화]──> 평문 데이터 키
        평문 데이터 키 ──[로컬에서 암호문 복호화]──> 시크릿
```

이 설계가 왜 중요한가. 첫째, 대용량 데이터를 KMS로 직접 왕복시키지 않아 빠르고 싸다(KMS는 4KB까지만 직접 처리). 둘째, 마스터 키는 KMS 하드웨어 보안 모듈(HSM) 밖으로 절대 나오지 않는다. 셋째 — 그리고 이게 Cross-Account의 핵심 — **데이터를 복호화하려면 반드시 KMS에 가서 마스터 키로 데이터 키를 풀어야 한다.** 즉 "시크릿을 읽을 권한"과 "암호화 키를 쓸 권한"이 분리되어 있다.

> 💡 **관련 이론**: 봉투 암호화는 PGP/GPG의 하이브리드 암호화와 똑같은 발상이다. PGP도 대칭 세션 키로 메시지 본문을 암호화하고, 그 세션 키만 수신자의 공개키로 암호화해 함께 보낸다. 대칭 암호는 빠르지만 키 분배가 어렵고, 비대칭 암호는 키 분배가 쉽지만 느리다 — 둘의 장점만 취하는 게 하이브리드/봉투 암호화다. TLS 핸드셰이크도 같은 구조(비대칭으로 대칭 키를 교환한 뒤 대칭으로 통신). KMS는 이 고전적 패턴을 관리형 서비스로 만든 것이다.

이제 Cross-Account가 왜 두 겹의 권한을 요구하는지 자명해진다. A 계정의 시크릿을 B 계정이 읽으려면, B는 **(1) 시크릿을 가져올 권한**과 **(2) 그 시크릿을 암호화한 데이터 키를 풀 KMS 권한** 둘 다 있어야 한다. 그래서 설정이 세 군데다.

```json
// 소유 계정(A) — 시크릿의 Resource Policy: "B가 이 시크릿을 가져가도 된다"
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::CONSUMER-ACCT:role/AppRole"},
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "*"
}
```
```json
// 소유 계정(A) — KMS CMK Key Policy: "B가 이 키로 복호화해도 된다"
{
  "Sid": "AllowConsumer",
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::CONSUMER-ACCT:role/AppRole"},
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "*"
}
```
```json
// 소비자 계정(B) — IAM Policy: "내 Role이 A의 시크릿을 가져오고 복호화한다"
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue", "kms:Decrypt"],
  "Resource": ["arn:aws:secretsmanager:...:OWNER:secret:shared/api-key-*",
               "arn:aws:kms:...:OWNER:key/CMK-ID"]
}
```

> ⚠️ **함정**: Cross-Account 공유에서 압도적으로 많은 실패 원인은 **시크릿이 AWS 관리형 키(`alias/aws/secretsmanager`)로 암호화된 경우**다. 관리형 키는 Key Policy를 사용자가 수정할 수 없어서 다른 계정에 `kms:Decrypt`를 허용할 방법이 없다. 그래서 Resource Policy로 시크릿 접근은 허용되지만 복호화 단계에서 막혀 "AccessDenied (KMS)"가 난다. 해결은 단 하나 — 처음부터 **고객 관리형 키(CMK)로 시크릿을 암호화**해야 한다. 이미 관리형 키로 만들었다면 CMK로 재암호화하거나 시크릿을 새로 만들어야 한다. 시험에서 "Cross-Account인데 KMS 에러"가 나오면 십중팔구 이 관리형 키 문제다.

> 🔍 **더 깊이**: KMS 권한에는 Key Policy와 IAM Policy 외에 **Grant**라는 세 번째 메커니즘이 있다. Grant는 특정 주체에게 임시적·세밀한 키 사용 권한을 부여하는 것으로, Policy를 건드리지 않고 런타임에 권한을 줬다 회수할 수 있다. Secrets Manager가 회전 Lambda에 키 사용 권한을 줄 때 내부적으로 Grant를 쓰기도 한다. Key Policy는 "이 키를 누가 쓸 수 있는가"의 헌법, IAM Policy는 "내 주체가 어떤 키를 쓸 수 있는가"의 시민법, Grant는 "런타임에 잠깐 빌려주는" 임시 위임이라고 보면 된다. KMS 키는 Key Policy와 IAM Policy가 **둘 다 허용**해야 사용 가능하다는 게 가장 헷갈리는 지점이다 — 한쪽만으로는 안 된다.

## Cross-Region 복제와 캐싱 — 가용성과 비용의 마무리

시크릿이 한 리전에만 있으면 그 리전이 장애 나거나 멀티리전 앱이 다른 리전에서 시크릿을 읽어야 할 때 문제다. Secrets Manager는 시크릿을 다른 리전으로 복제한다.

```bash
aws secretsmanager replicate-secret-to-regions \
  --secret-id prod/myapp \
  --add-replica-regions Region=us-east-1,KmsKeyId=alias/secrets-use1
```

복제본은 원본이 회전되면 따라서 갱신되고, 각 리전의 KMS 키로 다시 암호화된다. DR 시나리오나 글로벌 앱에서 리전별 로컬 읽기를 가능하게 한다.

마지막으로 비용·성능 마무리. Lambda가 호출될 때마다 `GetSecretValue`를 SDK로 부르면 API 호출 비용과 throttle 위험이 쌓인다. **AWS Parameters and Secrets Lambda Extension**이 이걸 푼다. Extension을 레이어로 붙이면 함수 인스턴스 안에서 로컬 캐시 프록시(`localhost:2773`)가 떠서, 첫 호출만 실제 API를 치고 이후는 캐시에서 준다.

```bash
# Lambda 안에서: 첫 호출은 캐시, 이후 TTL 동안 로컬에서 응답
curl "http://localhost:2773/secretsmanager/get?secretId=prod/db"
```

같은 함수 인스턴스가 재사용되는 동안(warm) 시크릿을 메모리 캐시에서 읽어 API 호출과 비용을 크게 줄인다. 다만 이건 호출 빈도·비용을 줄이는 것이지 cold start를 줄이는 게 아니다 — 오히려 Extension 레이어 자체가 cold start에 약간의 초기화 시간을 더한다.

> 📚 **사례**: 한 팀이 초당 수천 번 호출되는 Lambda에서 매번 `GetSecretValue`를 직접 호출했다가 Secrets Manager의 API throttle(계정·리전당 초당 호출 한도)에 걸려 함수가 간헐적으로 `ThrottlingException`으로 실패한 사례가 흔하다. 시크릿 값은 30일에 한 번 바뀌는데 초당 수천 번 읽는 건 명백한 낭비다. Lambda Extension(또는 SDK 캐싱 라이브러리)으로 TTL 기반 캐시를 두면 실제 API 호출이 함수 인스턴스당 TTL마다 한 번으로 줄어 throttle이 사라지고 비용도 급감한다. "시크릿은 자주 읽지만 거의 안 바뀐다"는 특성을 캐시로 활용하는 게 정석이다.

## 정리하며

오늘 본 그림은 네 가지다. 첫째, **회전은 노출 창을 줄이는 방어**이고 기계 자격 증명에 특히 적합하다 — 더 급진적으로는 비밀번호 자체를 없애는 IAM 인증도 있다. 둘째, **AWSCURRENT/PENDING/PREVIOUS 라벨의 간접 참조**가 원자적·무중단 교체를 만들고, Multi User(Alternating) 회전은 현재 사용자를 건드리지 않아 진짜 zero-downtime을 달성한다. 셋째, **봉투 암호화** 때문에 시크릿 복호화는 항상 KMS를 거치고, 그래서 Cross-Account는 시크릿 권한 + KMS 권한 두 겹을 요구하며 관리형 키로는 불가능하다(CMK 필수). 넷째, **혼합 저장(Parameter Store 무료 + Secrets Manager 회전)**과 **Lambda Extension 캐싱**이 비용·성능을 마무리한다.

다음 글에서는 Week 9 전체를 시나리오로 묶어 복습한다. SSM·State Manager·AppConfig·시크릿 회전이 실제 운영 상황에서 어떻게 한 그림으로 맞물리는지를 본다.

---

## 📝 연습 문제

**문제 1.** 결제 서비스 RDS 비밀번호를 30일마다 회전하되, 피크 시 초당 수천 신규 연결이 열리는 환경에서 단 한 건의 연결 실패도 없어야 한다. 가장 적절한 것은?

A) Single User Rotation Lambda

B) Multi User(Alternating Users) Rotation Lambda

C) Parameter Store SecureString에 수동 회전

D) 비밀번호를 매일 수동으로 변경

**정답: B**

해설: Single User 회전은 setSecret과 finishSecret 사이에 DB 실제 비밀번호와 AWSCURRENT가 잠깐 불일치하는 구간이 있어, 고빈도 신규 연결 환경에서는 일부 연결이 옛 비밀번호로 시도하다 실패할 수 있다. Multi User는 현재 사용 중인 사용자(alpha)의 비밀번호를 회전 내내 건드리지 않고 미사용 사용자(beta)를 바꾼 뒤 그쪽으로 전환하므로 진행 중·신규 연결 모두 영향이 없다. 진정한 zero-downtime의 표준이다.

---

**문제 2.** A 계정의 Secrets Manager 시크릿을 B 계정 애플리케이션이 읽으려 한다. Resource Policy와 B의 IAM 권한을 모두 설정했는데도 "AccessDenied"가 KMS 단계에서 발생한다. 가장 가능성 높은 원인은?

A) VPC Peering이 없다

B) 시크릿이 AWS 관리형 키(alias/aws/secretsmanager)로 암호화되어 Key Policy를 수정할 수 없다

C) 리전이 다르다

D) B 계정의 IAM에 secretsmanager:GetSecretValue가 없다

**정답: B**

해설: 봉투 암호화 때문에 시크릿을 복호화하려면 그것을 암호화한 KMS 키에 대한 kms:Decrypt 권한이 필요하다. AWS 관리형 키는 Key Policy를 사용자가 수정할 수 없어 다른 계정에 복호화 권한을 줄 방법이 없다. 따라서 시크릿 접근(Resource Policy)은 통과해도 복호화 단계에서 막힌다. 해결은 고객 관리형 키(CMK)로 시크릿을 암호화하는 것뿐이다. VPC Peering(A)은 시크릿 접근과 무관하다.

---

**문제 3.** RDS 마스터 비밀번호를 가장 적은 운영 부담으로 자동 회전하려 한다. 회전 Lambda를 직접 만들거나 관리하고 싶지 않다. 무엇을 쓰는가?

A) 회전 Lambda를 직접 작성

B) RDS `--manage-master-user-password` 활성화

C) Parameter Store에 비밀번호 저장 후 cron 회전

D) IAM 인증으로 전환

**정답: B**

해설: --manage-master-user-password는 RDS가 Secrets Manager에 마스터 비밀번호 시크릿을 자동 생성하고, 기본 7일마다 자동 회전하며, 필요한 IAM Role과 회전 로직을 모두 알아서 구성하는 네이티브 통합이다. 운영자가 회전 Lambda를 만들 필요가 없다. IAM 인증(D)도 좋은 방향이지만 "비밀번호 회전"이 아니라 "비밀번호 제거"라 문제의 요구(회전)와 다르다.

---

**문제 4.** 단순 설정값 100개와 회전이 필요한 비밀번호 5개가 있다. 비용을 최소화하는 구성은?

A) 모두 Secrets Manager (월 약 $42)

B) 설정 100개는 Parameter Store Standard(무료) + 비밀번호 5개는 Secrets Manager($2/월)

C) 모두 Parameter Store Advanced

D) 모두 S3 객체에 암호화 저장

**정답: B**

해설: 판단 축은 "비밀이냐"가 아니라 "회전이 필요하냐"다. 회전이 필요 없는 설정값은 Parameter Store Standard에 무료로 두고, 회전이 필요한 비밀번호만 Secrets Manager($0.40/개)에 둔다. 모두 Secrets Manager면 105 × $0.40 ≈ $42, 혼합이면 5 × $0.40 = $2로 끝난다. Parameter Store Advanced(C)는 항목당 $0.05라 100개면 $5로 불필요한 비용이다.

---

**문제 5.** Secrets Manager 회전 중 AWSPENDING 라벨로 새 비밀번호를 만들고 DB에 적용했지만, finishSecret 단계 전에 무엇이 보장되는가?

A) 애플리케이션은 이미 새 비밀번호를 읽는다

B) AWSCURRENT는 여전히 옛 비밀번호를 가리키며, 라벨이 원자적으로 옮겨지기 전까지 앱은 옛 값을 읽는다

C) DB 접속이 모두 끊긴다

D) 시크릿이 삭제된다

**정답: B**

해설: 애플리케이션은 항상 AWSCURRENT 라벨이 가리키는 버전을 읽는다. 회전 중 AWSPENDING에 새 비밀번호가 만들어지고 DB에도 적용됐더라도, finishSecret이 AWSCURRENT 라벨을 새 버전으로 옮기기 전까지 AWSCURRENT는 옛 버전을 가리킨다. 이 라벨 이동이 원자적이라 중간의 깨진 상태가 없고, 옛 버전은 이동 후 AWSPREVIOUS가 되어 캐시된 연결의 유예를 준다.

---

**문제 6.** RDS가 Private 서브넷에 있는데 회전 Lambda를 VPC 밖(기본)에 두었다. 어떤 증상이 나타나는가?

A) 정상 동작한다

B) 회전이 setSecret(DB 접속) 단계에서 실패하고 AWSPENDING이 정리되지 않은 채 남는다

C) 시크릿이 자동 삭제된다

D) Cross-Region 복제가 멈춘다

**정답: B**

해설: 회전 Lambda의 setSecret 단계는 실제로 DB에 접속해 비밀번호를 바꾼다. Lambda가 VPC 밖에 있으면 Private 서브넷의 RDS에 네트워크로 닿지 못해 이 단계에서 멈춘다. AWSPENDING에 새 비밀번호는 만들어졌지만 DB는 옛 비밀번호, 라벨도 미이동인 어정쩡한 상태로 회전이 실패한다. 해결은 회전 Lambda를 같은 VPC의 Private 서브넷에 두고 Secrets Manager 엔드포인트 경로(VPC 엔드포인트/NAT)를 확보하는 것이다.

---

**문제 7.** 초당 수천 번 호출되는 Lambda가 매번 GetSecretValue를 직접 호출해 ThrottlingException이 간헐 발생한다. 시크릿은 30일에 한 번만 바뀐다. 가장 적절한 해결은?

A) Secrets Manager 한도 증설 요청만

B) AWS Parameters and Secrets Lambda Extension으로 TTL 기반 로컬 캐시(localhost:2773) 사용

C) 시크릿을 환경 변수에 평문 저장

D) DynamoDB에 비밀번호 복사

**정답: B**

해설: 시크릿은 거의 안 바뀌는데 초당 수천 번 읽는 건 낭비다. Lambda Extension을 붙이면 함수 인스턴스 안에 캐시 프록시가 떠서 첫 호출만 실제 API를 치고 TTL 동안 로컬 캐시에서 응답한다. 실제 API 호출이 인스턴스당 TTL마다 한 번으로 줄어 throttle이 사라지고 비용도 급감한다. 환경 변수 평문 저장(C)은 보안 위반이고, DynamoDB 복사(D)는 또 다른 시크릿 사본을 만드는 안티패턴이다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, 회전은 노출 창을 줄이는 방어이며 기계 자격 증명에 적합하고, 더 급진적으로는 비밀번호를 없애는 RDS IAM 인증도 있다. 둘째, AWSCURRENT/AWSPENDING/AWSPREVIOUS 라벨의 간접 참조가 원자적·무중단 교체를 만들며, Multi User(Alternating) 회전은 현재 사용자를 건드리지 않아 진짜 zero-downtime을 달성한다. 셋째, 봉투 암호화 때문에 시크릿 복호화는 항상 KMS를 거치므로 Cross-Account는 시크릿 권한 + KMS 권한 두 겹을 요구하고 관리형 키로는 불가능하다(CMK 필수, Key Policy + IAM Policy 양쪽 허용). 넷째, Parameter Store(무료) + Secrets Manager(회전) 혼합과 Lambda Extension 캐싱으로 비용·성능을 마무리한다.
