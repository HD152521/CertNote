# Day 2 - CloudTrail: 감사 로그는 왜 변조 불가능해야 하나

보안 사고가 터졌을 때 가장 먼저 던지는 질문은 "누가, 언제, 무엇을 했는가"다. 침입자가 IAM 사용자를 만들었는지, S3 버킷을 공개로 바꿨는지, 보안 그룹을 0.0.0.0/0으로 열었는지 — 이걸 정확히 재구성할 수 없으면 사고 대응은 추측의 영역으로 떨어진다. 그런데 더 무서운 시나리오가 있다. 침입자가 권한을 탈취한 뒤 자신이 한 행위의 로그를 지워버리는 것이다. 감사 로그가 행위 주체에 의해 수정·삭제될 수 있다면, 그 로그는 법정에서도 사후 분석에서도 증거 능력을 잃는다. 그래서 감사 로깅 시스템의 가장 중요한 설계 목표는 "기록한다"가 아니라 "기록을 아무도 — 심지어 root조차 — 사후에 바꿀 수 없게 한다"이다.

AWS의 **CloudTrail**(2013년 출시)은 이 문제를 정면으로 푸는 서비스다. 콘솔·CLI·SDK·심지어 AWS 서비스가 다른 서비스를 호출한 것까지, 계정 안에서 일어난 거의 모든 API 호출을 기록한다. 이 글은 CloudTrail의 기능을 나열하는 대신, "관리 이벤트와 데이터 이벤트가 왜 비용이 다른지", "로그 무결성 검증이 암호학적으로 어떻게 변조를 막는지", "CloudTrail이 Config·VPC Flow Logs와 무엇이 다른지"를 따라가며 SAA 보안·거버넌스 도메인이 묻는 본질을 짚는다.

## 관리 이벤트와 데이터 이벤트는 왜 다른 등급으로 갈라졌나

CloudTrail의 이벤트는 관리 이벤트(Management Events)와 데이터 이벤트(Data Events)로 나뉘고, 관리 이벤트는 90일 히스토리가 무료인데 데이터 이벤트는 별도 활성화·별도 과금이다. 이 비대칭은 단순한 과금 정책이 아니라 **볼륨의 차이가 만드는 근본적 trade-off**다.

관리 이벤트는 "제어 평면(control plane)" 작업이다 — IAM 사용자 생성, EC2 인스턴스 시작, 보안 그룹 수정, 버킷 정책 변경 같은 "리소스의 구성과 권한을 바꾸는" 행위다. 이런 작업은 빈도가 낮다. 잘 운영되는 계정에서 하루에 IAM 사용자를 수백 번 만들지는 않는다. 그래서 모두 기록해도 볼륨이 감당할 만하고, AWS는 이걸 기본으로 무료 제공한다.

데이터 이벤트는 "데이터 평면(data plane)" 작업이다 — S3 GetObject/PutObject, Lambda Invoke, DynamoDB 항목 읽기 같은 "리소스 안의 데이터에 접근하는" 행위다. 이건 빈도가 압도적으로 높다. 활발한 S3 버킷은 초당 수천 건의 GetObject가 일어나고, 인기 Lambda는 하루 수십억 번 호출된다. 이걸 전부 기록하면 로그 볼륨이 폭발하고 비용이 천문학적이 된다. 그래서 데이터 이벤트는 기본 비활성이고, 필요한 리소스(특정 버킷, 특정 prefix)만 골라 켜는 게 표준이다.

> 💡 **관련 이론**: 제어 평면(control plane)과 데이터 평면(data plane)의 구분은 네트워크·분산 시스템 설계의 핵심 개념이다. 라우터에서 제어 평면은 "라우팅 테이블을 어떻게 만들 것인가"(저빈도, 복잡)이고 데이터 평면은 "패킷을 실제로 전달"(고빈도, 단순)이다. AWS API도 같은 구조다 — 구성을 바꾸는 제어 평면은 드물고 감사가 중요하며, 데이터를 다루는 데이터 평면은 잦고 선택적 감사가 합리적이다. CloudTrail의 과금 구조는 이 평면 분리를 그대로 반영한다.

> ⚠️ **함정**: "누가 이 S3 객체를 GetObject 했는지 추적하라"는 시나리오의 정답은 "CloudTrail Data Events 활성화"다. 기본 관리 이벤트만으로는 객체 수준 접근이 보이지 않는다. 더 헷갈리는 건 S3 Server Access Logs도 비슷한 정보를 주는데, 시험에서는 거의 항상 CloudTrail Data Events가 정답이다(IAM 주체 정보가 명확하고 다른 서비스와 통합되므로). S3 Access Logs는 best-effort 배달이라 누락 가능성이 있고 IAM 주체 추적이 약하다.

> 🔍 **더 깊이**: 글로벌 서비스 이벤트(IAM, STS, CloudFront, Route 53)는 특별 취급된다. 이 서비스들은 리전 개념이 없거나 us-east-1을 기준으로 동작하므로, CloudTrail은 이들의 이벤트를 us-east-1에 기록한다. 멀티 리전 Trail을 만들면 `--include-global-service-events`로 이걸 포함시키는데, 이걸 빼면 "IAM 사용자가 언제 만들어졌는지" 같은 핵심 보안 이벤트가 누락된다. 그래서 보안용 Trail은 항상 멀티 리전 + 글로벌 서비스 이벤트 포함으로 만든다.

## 로그 무결성 검증: 암호학으로 변조를 증명하는 법

CloudTrail의 가장 중요하면서도 자주 간과되는 기능이 **로그 파일 무결성 검증(Log File Integrity Validation)**이다. 단순히 "S3에 로그를 저장"하는 것을 넘어, "이 로그가 생성된 이후 단 한 글자도 바뀌지 않았음을 암호학적으로 증명"하는 메커니즘이다.

동작 원리는 이렇다. CloudTrail은 로그 파일을 S3에 저장할 때마다 각 파일의 **SHA-256 해시**를 계산한다. 그리고 매시간 이 해시들을 모은 **다이제스트 파일(digest file)**을 만들고, 그 다이제스트 파일을 AWS의 **개인키로 RSA 서명**한다. 다이제스트 파일은 또한 직전 다이제스트 파일의 해시를 포함한다 — 즉 다이제스트들이 **해시 체인(hash chain)**으로 연결된다. 이 구조에서 누군가 과거 로그 파일을 단 한 글자라도 바꾸면 그 파일의 SHA-256이 달라지고, 다이제스트에 기록된 해시와 불일치하므로 즉시 탐지된다. 다이제스트 자체를 바꾸려 해도 AWS 개인키로 서명되어 있어 위조할 수 없고, 다이제스트를 통째로 지우면 해시 체인이 끊겨 "여기 누락이 있다"가 드러난다.

> 💡 **관련 이론**: 이건 블록체인이 변조 불가능성을 확보하는 것과 정확히 같은 메커니즘이다 — 각 블록이 이전 블록의 해시를 포함해 체인을 이루면, 중간 어느 블록을 바꿔도 그 이후 모든 해시가 어긋나 변조가 드러난다. CloudTrail의 다이제스트 해시 체인은 "AWS가 운영하는 신뢰 기관(서명)"을 더한 단순화된 형태다. 블록체인이 탈중앙 합의로 신뢰를 만든다면, CloudTrail은 AWS의 RSA 서명으로 신뢰를 만든다. 핵심 아이디어(해시 체인 + 서명)는 동일하고, 이게 변조 방지 로그(tamper-evident log)의 표준 패턴이다.

무결성 검증만으로는 "변조를 탐지"할 뿐 "변조를 막지"는 못한다. 그래서 추가로 S3 측 보호를 겹친다. **S3 Object Lock(WORM, Write-Once-Read-Many)**을 켜면 보존 기간 동안 객체를 삭제·수정할 수 없게 강제한다 — root 권한으로도 못 지운다. **MFA Delete**를 켜면 객체 버전 삭제에 MFA를 요구한다. 로그를 별도 계정(Log Archive 계정)에 저장하고 그 계정의 권한을 극도로 제한하면, 운영 계정이 침해되어도 로그는 손댈 수 없다. 그리고 로그 자체를 **KMS로 암호화**해 기밀성까지 더한다. 이 다층 방어 — 탐지(무결성 검증) + 방지(Object Lock) + 격리(별도 계정) + 기밀성(KMS) — 가 감사 로그 보호의 표준 설계다.

> 📚 **사례**: 많은 보안 사고 대응에서 "공격자가 가장 먼저 한 일은 로깅을 끄거나 로그를 지운 것"이라는 패턴이 반복된다. 그래서 성숙한 조직은 CloudTrail에 EventBridge rule을 걸어 `StopLogging`, `DeleteTrail`, `UpdateTrail`, `PutEventSelectors` 같은 "감사를 무력화하는 API"가 호출되면 즉시 SecOps에 알림이 가게 한다. 로그를 끄는 행위 자체가 로그에 남고 즉시 경보를 울리는 구조라, 공격자가 흔적을 지우려는 시도가 오히려 탐지 신호가 된다.

## Organization Trail: 멀티 계정 감사를 한 번에

계정이 수십~수백 개로 늘어나는 멀티 계정 환경에서 "각 계정마다 Trail을 따로 만들고 따로 관리"하는 건 운영 악몽이다. 새 계정이 생길 때마다 Trail 설정을 잊으면 그 계정은 감사 사각지대가 된다. **Organization Trail**은 이 문제를 푼다. AWS Organizations의 관리 계정(또는 위임된 관리자 계정)에서 Trail을 한 번 만들면, 조직 내 모든 멤버 계정의 이벤트가 자동으로 포함되고, 나중에 새로 추가되는 계정도 자동으로 합류한다.

이 설계의 핵심은 **멤버 계정이 이 Trail을 끄거나 지울 수 없다**는 것이다. Organization Trail은 관리 계정 소유라 멤버 계정의 권한으로는 손댈 수 없다. 그래서 "각 팀이 자기 계정의 감사 로깅을 꺼버리는" 사고를 구조적으로 막는다. 로그는 보통 전용 **Log Archive 계정**의 S3 버킷에 중앙 집중되고, 그 버킷에 Object Lock과 Lifecycle 정책(오래된 로그를 Glacier Deep Archive로 이동)을 걸어 7년+ 컴플라이언스 보존을 비용 효율적으로 달성한다.

> 🔍 **더 깊이**: Organization Trail은 AWS의 "랜딩 존(Landing Zone)" 모범 사례의 핵심 구성 요소다. AWS Control Tower가 새 조직을 셋업하면 자동으로 Log Archive 계정과 Audit 계정을 만들고 Organization Trail을 거기에 연결한다. 이 "보안 OU(Organizational Unit)에 로그를 격리"하는 패턴은 책임 분리(separation of duties)의 클라우드 구현이다 — 워크로드를 운영하는 사람과 그 행위를 감사하는 로그에 접근하는 사람을 권한 경계로 분리한다.

## CloudTrail Lake: 감사 로그를 SQL로 묻다

전통적으로 CloudTrail 로그를 분석하려면 S3에 쌓인 JSON 파일을 Athena로 쿼리하거나 CloudWatch Logs Insights로 보는, 여러 단계의 설정이 필요했다. **CloudTrail Lake**(2022년 출시)는 이벤트를 전용 데이터 스토어에 적재해 바로 SQL로 쿼리할 수 있게 한다. 최대 7년(또는 그 이상) 보존하고, CloudTrail 이벤트뿐 아니라 AWS Config 구성 항목, 서드파티 소스까지 통합해 한곳에서 분석한다.

이건 "로그를 모으는 것"과 "로그를 분석 가능하게 만드는 것"이 별개의 문제라는 인식에서 나온다. S3에 JSON으로 쌓는 건 저장이지 분석이 아니다 — 분석하려면 스키마를 정의하고 쿼리 엔진을 붙여야 한다. CloudTrail Lake는 이 분석 계층을 내장해, "지난 3년간 이 IAM Role이 호출한 모든 Decrypt API를 리전별로 집계" 같은 포렌식 쿼리를 즉시 돌릴 수 있게 한다. 시험에서 "장기 보존 + SQL 쿼리"라는 키워드가 보이면 CloudTrail Lake가 정답 신호다.

> 💡 **관련 이론**: CloudTrail Lake는 "schema-on-read" 분석 패러다임의 한 사례다. 전통적 데이터베이스는 데이터를 넣기 전에 스키마를 정의(schema-on-write)하지만, 데이터 레이크는 raw 데이터를 먼저 저장하고 쿼리 시점에 스키마를 적용한다. 이게 다양한 소스(CloudTrail, Config, 서드파티)를 미리 정규화하지 않고도 한곳에 모아 나중에 필요한 관점으로 쿼리할 수 있게 하는 핵심이다. Athena·BigQuery·Snowflake가 모두 이 계열이고, CloudTrail Lake는 감사 로그에 특화한 관리형 버전이다.

## CloudTrail vs Config vs VPC Flow Logs: 세 로그의 분업

SAA 시험에서 가장 자주 나오는 함정이 이 셋의 구분이다. 셋 다 "로그"이지만 답하는 질문이 완전히 다르다.

**CloudTrail**은 "**누가 무엇을 했는가**(API 호출 행위)"를 기록한다. "user-A가 14:32에 보안 그룹 sg-123에 0.0.0.0/0 인바운드 규칙을 추가했다"는 행위의 기록이다. 행위자(누가), 시점(언제), 동작(무엇을), 소스 IP까지 남는다.

**Config**는 "**리소스가 지금 어떤 상태이고 규칙을 준수하는가**(구성의 스냅샷과 평가)"를 기록한다. "sg-123은 현재 0.0.0.0/0 인바운드를 가지고 있고, 이건 '인터넷 개방 SG 금지' 규칙을 위반한다"는 상태와 평가다. 누가 바꿨는지는 Config가 아니라 CloudTrail이 답한다.

**VPC Flow Logs**는 "**어떤 트래픽이 흘렀는가**(패킷 메타데이터)"를 기록한다. "10.0.1.5에서 10.0.2.8의 443 포트로 1.2MB가 ACCEPT됐다"는 네트워크 흐름이다. API 행위도 구성 상태도 아닌, 실제 패킷의 출발지·목적지·포트·바이트·허용/거부다.

> ⚠️ **함정**: "누가 보안 그룹을 0.0.0.0/0으로 열었나" → CloudTrail(행위자). "지금 어떤 SG들이 0.0.0.0/0을 가지고 있나" → Config(상태/규칙). "그 열린 포트로 실제 어떤 IP가 접속을 시도했나" → VPC Flow Logs(트래픽). 한 사고 분석에서 세 로그를 다 쓴다 — CloudTrail로 "누가 열었나", Config로 "어떤 리소스가 노출됐나", Flow Logs로 "누가 그 틈으로 들어왔나"를 교차 확인한다. 시험은 질문의 동사("했다" vs "이다" vs "흘렀다")로 정답을 가른다.

> 📚 **사례**: 2019년 Capital One 사고 분석에서 이 세 로그의 상보성이 잘 드러난다. SSRF로 탈취된 자격 증명이 S3에서 데이터를 빼간 행위는 CloudTrail(데이터 이벤트가 켜져 있었다면)에 남고, 노출된 WAF·SG 구성은 Config로 추적되며, 비정상 데이터 유출 트래픽은 Flow Logs로 보인다. 사고 후 많은 조직이 "세 로그를 모두 중앙 보안 계정에 집중하고 GuardDuty로 상관 분석"하는 패턴을 표준화했다.

## 실시간 대응: CloudTrail에서 자동화로

CloudTrail은 기록만 하는 게 아니라 실시간 자동 대응의 트리거가 된다. 두 가지 주요 경로가 있다.

**CloudTrail → CloudWatch Logs → Subscription Filter → Lambda**: Trail을 CloudWatch Logs로 보내면, 특정 패턴(예: 루트 계정 로그인, MFA 없는 콘솔 로그인)을 Subscription Filter나 메트릭 필터로 잡아 즉시 Lambda를 호출하거나 알람을 울린다. "루트 계정으로 로그인하면 즉시 SecOps에 알림"이 대표적이다 — 루트 로그인은 정상 운영에서 거의 없어야 하므로 강한 경보 신호다.

**CloudTrail → EventBridge → 자동 대응**: CloudTrail 이벤트는 거의 실시간으로 EventBridge로 흘러가고, EventBridge rule이 특정 API 이벤트 패턴을 매칭해 Lambda/Step Functions/SNS 같은 대상으로 즉시 보낸다. "보안 그룹에 0.0.0.0/0이 추가되면 자동으로 그 규칙을 회수하는 Lambda 실행" 같은 자동 교정(auto-remediation)을 만든다.

> 🔍 **더 깊이**: CloudTrail의 이벤트 배달에는 약간의 지연이 있다 — 일반적으로 이벤트 발생 후 S3/CloudWatch Logs에 도달하기까지 평균 몇 분(최대 15분) 정도다. 그래서 "초 단위 실시간 차단"이 필요한 경우 CloudTrail만으로는 부족할 수 있고, 진짜 즉각 차단은 서비스 자체의 정책(SCP, 권한 경계)이나 GuardDuty의 위협 탐지와 결합한다. CloudTrail의 강점은 "초 단위 차단"이 아니라 "완전하고 변조 불가능한 사후 기록"이다 — 이 역할 구분이 시험에서 "실시간 차단" 키워드의 정답을 가른다.

## CLI로 직접 만져보기

```bash
# 멀티 리전 + 글로벌 서비스 이벤트 + Organization Trail 생성
aws cloudtrail create-trail --name org-trail \
  --s3-bucket-name org-trail-log-archive \
  --is-multi-region-trail \
  --include-global-service-events \
  --is-organization-trail \
  --kms-key-id alias/saa-app \
  --enable-log-file-validation

aws cloudtrail start-logging --name org-trail

# 특정 민감 버킷에만 데이터 이벤트 추가 (전체 켜면 비용 폭발)
aws cloudtrail put-event-selectors --trail-name org-trail \
  --event-selectors '[{
    "ReadWriteType":"All",
    "IncludeManagementEvents":true,
    "DataResources":[{
      "Type":"AWS::S3::Object",
      "Values":["arn:aws:s3:::sensitive-bucket/"]
    }]
  }]'

# 로그 파일 무결성 검증 (변조 여부를 암호학적으로 확인)
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111:trail/org-trail \
  --start-time 2026-05-01T00:00:00Z

# CloudTrail Lake 이벤트 데이터 스토어 생성 (7년 보존)
aws cloudtrail create-event-data-store \
  --name security-lake \
  --retention-period 2557 \
  --multi-region-enabled

# CloudTrail Lake SQL 쿼리 (특정 Role의 모든 Decrypt 호출)
aws cloudtrail start-query \
  --query-statement "SELECT eventTime, sourceIPAddress, requestParameters
    FROM event-data-store-id
    WHERE eventName = 'Decrypt'
      AND userIdentity.arn LIKE '%app-role%'
    ORDER BY eventTime DESC"
```

## 정리하며

CloudTrail은 "누가 무엇을 했는가"를 변조 불가능하게 기록하는 AWS 감사의 기반이고, SAA 보안·거버넌스 도메인의 단골이다. 핵심은 다섯 가지로 압축된다. ① 관리 이벤트(제어 평면, 저빈도)는 90일 무료, 데이터 이벤트(데이터 평면, 고빈도)는 별도 활성화·과금 — 볼륨 차이가 만든 구분이다. ② S3 객체 접근 추적은 Data Events를 켜야 보이고, 글로벌 서비스(IAM/STS) 이벤트는 us-east-1에 기록되므로 멀티 리전 + 글로벌 포함이 보안 Trail의 표준이다. ③ 로그 무결성 검증은 SHA-256 해시 체인 + RSA 서명으로 변조를 탐지하고, S3 Object Lock·별도 계정·KMS로 변조를 방지·격리한다. ④ Organization Trail은 멤버 계정이 끌 수 없는 멀티 계정 자동 감사를 만든다. ⑤ CloudTrail(누가 했나) vs Config(지금 상태) vs VPC Flow Logs(트래픽)는 답하는 질문이 다르고, 시험은 질문의 동사로 정답을 가른다.

다음 글에서는 CloudTrail이 답하는 "누가 했나"의 짝이 되는 "지금 어떤 상태이고 규칙을 지키는가"를 답하는 도구 — AWS Config와, 운영 자동화의 중심 Systems Manager를 본다. Config가 구성의 desired state를 강제하고 Systems Manager가 그 교정을 실행하는, 거버넌스와 운영의 연결고리가 핵심이다.

---

## 📝 연습 문제

**문제 1.** 한 보안팀이 특정 민감 버킷에 누가 어떤 객체를 GetObject 했는지 추적하려 한다. CloudTrail 기본 설정으로는 이 정보가 보이지 않는다. 올바른 조치는?

A) 관리 이벤트만 활성화하면 자동으로 보인다
B) 해당 버킷에 대해 CloudTrail Data Events를 활성화한다
C) VPC Flow Logs를 켠다
D) Config Rule을 추가한다

**정답: B**

해설: S3 GetObject/PutObject 같은 객체 수준 접근은 데이터 평면 작업이라 기본 비활성인 Data Events를 켜야 기록된다. 비용 폭발을 막기 위해 전체가 아닌 특정 민감 버킷·prefix만 선택적으로 활성화하는 게 표준이다. A는 관리 이벤트로는 객체 접근이 안 보인다. C는 패킷 메타데이터일 뿐 객체 접근 행위가 아니고, D는 구성 상태 평가지 접근 행위 기록이 아니다.

---

**문제 2.** 한 조직이 컴플라이언스 감사에서 "지난 1년간 어떤 감사 로그도 변조되지 않았음을 증명하라"는 요구를 받았다. CloudTrail의 어떤 기능이 이를 직접 충족하는가?

A) KMS 암호화만으로 충분하다
B) 로그 파일 무결성 검증(SHA-256 해시 체인 + RSA 서명)
C) Data Events 활성화
D) CloudWatch Logs 전송

**정답: B**

해설: 로그 파일 무결성 검증은 각 로그 파일의 SHA-256 해시를 매시간 다이제스트로 모으고 AWS 개인키로 RSA 서명하며, 다이제스트들을 해시 체인으로 연결한다. 과거 로그를 한 글자라도 바꾸면 해시 불일치로 즉시 탐지되고, 다이제스트 위조는 서명으로 막힌다. KMS 암호화(A)는 기밀성이지 무결성 증명이 아니다. C·D는 무결성 증명과 무관하다.

---

**문제 3.** 수십 개 계정을 가진 조직이 "새로 추가되는 계정도 자동으로 감사되며, 어느 팀도 자기 계정의 Trail을 끌 수 없게" 하고 싶다. 가장 적합한 솔루션은?

A) 각 계정마다 개별 Trail을 만들고 SCP로 보호
B) Organizations 관리 계정에서 Organization Trail 생성
C) Config Aggregator
D) 계정마다 CloudTrail Lake

**정답: B**

해설: Organization Trail은 관리 계정에서 한 번 만들면 모든 멤버 계정이 자동 포함되고 신규 계정도 자동 합류하며, 관리 계정 소유라 멤버 계정 권한으로는 끄거나 지울 수 없다. 이게 멀티 계정 자동 감사의 표준이다. A는 운영 부담이 크고 누락 위험이 있으며, C는 구성 통합이지 API 감사가 아니고, D는 분석 스토어이지 멀티 계정 자동 수집 메커니즘이 아니다.

---

**문제 4.** 사고 분석 중 "지금 어떤 보안 그룹들이 0.0.0.0/0 인바운드를 가지고 있는지" 현재 상태와 규칙 준수 여부를 확인하려 한다. 가장 적합한 도구는?

A) CloudTrail
B) AWS Config
C) VPC Flow Logs
D) CloudTrail Lake

**정답: B**

해설: "지금 어떤 상태이고 규칙을 준수하는가"는 Config의 영역이다. Config는 리소스의 현재 구성 스냅샷을 기록하고 Rule로 평가한다. CloudTrail(A)은 "누가 그 규칙을 추가했는가"라는 행위를 답하고, Flow Logs(C)는 트래픽 흐름이며, CloudTrail Lake(D)는 API 이벤트의 SQL 분석이다. 질문의 동사가 "이다(상태)"이므로 Config다.

---

**문제 5.** 한 팀이 7년치 CloudTrail 이벤트를 보존하면서 "지난 3년간 특정 IAM Role이 호출한 모든 Decrypt API를 리전별로 집계"하는 포렌식 쿼리를 SQL로 즉시 돌리고 싶다. 가장 적합한 솔루션은?

A) S3에 로그를 쌓고 매번 Athena 테이블을 수동 정의
B) CloudTrail Lake 이벤트 데이터 스토어
C) CloudWatch Logs Insights
D) Glacier Vault에 보관

**정답: B**

해설: CloudTrail Lake는 이벤트를 전용 데이터 스토어에 적재해 최대 7년+ 보존하고 바로 SQL로 쿼리할 수 있게 한다. "장기 보존 + 즉시 SQL 쿼리"라는 요구에 정확히 맞는다. A는 동작하지만 스키마 정의·파티션 관리 등 설정 부담이 크고, C는 보존·통합 측면에서 장기 포렌식에 부적합하며, D는 보관 전용으로 쿼리할 수 없다.

---

**문제 6.** 보안팀이 "공격자가 흔적을 지우려는 시도"를 탐지하고 싶다. CloudTrail 자체를 무력화하는 API 호출이 발생하면 즉시 알림이 가도록 하려면?

A) Config Rule로만 점검
B) CloudTrail → EventBridge rule(StopLogging/DeleteTrail/PutEventSelectors 등) → SNS/Lambda
C) S3 Access Logs 분석
D) 매일 수동으로 Trail 상태 확인

**정답: B**

해설: StopLogging·DeleteTrail·UpdateTrail·PutEventSelectors 같은 "감사를 무력화하는 API"도 CloudTrail에 기록되고 EventBridge로 거의 실시간 전달된다. EventBridge rule로 이 이벤트 패턴을 매칭해 SNS/Lambda로 즉시 경보를 보내면, 로그를 끄려는 시도 자체가 탐지 신호가 된다. A·C는 행위 기반 즉시 알림이 아니고, D는 자동화가 아니라 수동이라 늦다.

---

**문제 7.** 한 사고에서 침입자가 탈취한 자격 증명으로 S3 데이터를 유출했다. 다음 세 질문에 각각 어떤 로그가 답하는가? (가) 누가 그 객체를 다운로드했나 (나) 노출된 버킷의 현재 공개 설정 (다) 유출 트래픽의 출발지·목적지 IP

A) (가)Config (나)CloudTrail (다)Flow Logs
B) (가)CloudTrail Data Events (나)Config (다)VPC Flow Logs
C) 모두 CloudTrail
D) (가)Flow Logs (나)Config (다)CloudTrail

**정답: B**

해설: (가) 객체 다운로드라는 API 행위는 CloudTrail Data Events, (나) 버킷의 현재 공개 설정과 규칙 준수는 Config, (다) 실제 패킷의 출발지·목적지·포트는 VPC Flow Logs가 답한다. 세 로그는 답하는 질문이 다르며 사고 분석에서 상보적으로 함께 쓰인다. 질문의 동사("다운로드했다/설정이다/흘렀다")로 도구를 가른다.

---

해설 보강: CloudTrail은 SAA 보안·거버넌스 도메인의 핵심이고, 시험은 "관리 vs 데이터 이벤트", "무결성 검증의 변조 방지", "Organization Trail의 멀티 계정 자동 감사", 그리고 무엇보다 "CloudTrail vs Config vs Flow Logs의 분업"을 반복해서 묻는다. 세 로그가 답하는 질문(누가 했나 / 지금 상태 / 트래픽)을 동사로 구분하는 훈련이 가장 점수가 잘 나오는 지점이다.
