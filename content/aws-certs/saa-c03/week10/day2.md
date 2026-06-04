# Day 47 - 스토리지 비용은 왜 "단가"가 아니라 "접근 패턴"의 함수인가

스토리지 비용을 처음 최적화하려는 사람은 거의 항상 같은 실수를 한다 — S3 스토리지 클래스 가격표를 펼쳐놓고 GB당 단가가 가장 싼 Glacier Deep Archive를 고른다. 그리고 한 달 뒤 청구서를 보면 오히려 비용이 늘어 있다. 자주 꺼내 쓰는 데이터를 Deep Archive에 넣었더니 검색(retrieval) 비용과 최소 보관 기간 위약금이 저장 비용 절감을 압도해버린 것이다. 스토리지 비용의 본질은 **저장 단가 하나가 아니라 저장·요청·검색·전송이라는 여러 비용이 접근 패턴에 따라 다르게 합산되는 함수**라는 데 있다. "이 데이터를 얼마나 자주, 얼마나 빨리 꺼내야 하는가"를 모르면 어떤 클래스도 최적이 아니다.

S3는 2006년 단일 스토리지 클래스로 시작했지만, AWS는 데이터의 수명주기(lifecycle)가 균일하지 않다는 걸 일찍 깨달았다. 갓 업로드된 로그는 일주일간 뜨겁게 분석되다가, 한 달 뒤엔 가끔 조회되고, 일 년 뒤엔 규제 때문에 보관만 할 뿐 거의 꺼내지 않는다. 이 "온도 곡선(temperature curve)"에 맞춰 Standard → Standard-IA → Glacier → Deep Archive로 점점 싸고 느린 계층이 추가됐고, 2018년에는 접근 패턴을 모르거나 변덕스러운 데이터를 위해 **Intelligent-Tiering**이 나왔다. 이 글은 스토리지 클래스를 나열하는 대신, "최소 보관 기간이라는 함정이 왜 존재하는지", "Intelligent-Tiering이 어떻게 접근을 모니터링하는지", "Bucket Keys가 KMS 호출 비용을 어떻게 줄이는지"를 따라가며 SAA 비용 도메인의 스토리지 축을 짚는다.

## 최소 보관 기간이라는 함정은 왜 존재하나

S3 저비용 클래스에는 거의 모두 **최소 보관 기간(minimum storage duration)**이 붙어 있다 — Standard-IA와 One Zone-IA는 30일, Glacier Instant/Flexible은 90일, Deep Archive는 180일이다. 객체를 이 기간보다 일찍 삭제하거나 다른 클래스로 옮기면, 남은 기간만큼의 저장 비용을 위약금처럼 청구받는다. 예를 들어 Standard-IA에 넣은 객체를 10일 만에 지우면 나머지 20일치 저장료를 그대로 낸다.

이게 "악의적 함정"처럼 보이지만 실제로는 **저비용 클래스의 경제 구조가 만드는 필연**이다. IA·Glacier 계열은 저장 단가가 싼 대신 AWS가 더 느리고 밀도 높은(따라서 운영비가 분산되는) 미디어에 데이터를 옮겨 담는다. 데이터를 그 계층에 배치·관리하는 고정 비용이 발생하므로, AWS는 "최소한 이 기간은 둘 것"이라는 약속을 받아야 단가를 낮춰줄 수 있다. 즉 최소 보관 기간은 Savings Plans가 "약정의 대가로 할인"을 주는 것과 같은 논리다 — 데이터를 오래 둘 것을 약속하면 단가를 깎아준다.

> ⚠️ **함정**: "자주 변경되거나 30일 안에 삭제될 가능성이 있는 데이터를 비용 절감을 위해 Standard-IA로 옮기자"는 직관은 거의 항상 틀린다. 30일 최소 보관 + IA의 높은 검색 비용 때문에, 30일 안에 자주 접근·삭제되는 데이터는 오히려 Standard보다 비싸진다. IA는 "확실히 자주 안 쓰지만 가끔 꺼낼 수 있고, 최소 한 달 이상 둘" 데이터에만 맞는다. 접근 빈도가 불확실하면 IA가 아니라 Intelligent-Tiering이 정답이다.

> 🔍 **더 깊이**: S3 클래스 간에는 검색 모델도 다르다. **Glacier Instant Retrieval**은 Standard-IA처럼 밀리초 단위로 즉시 꺼내되 저장 단가가 더 싸다(분기에 한 번쯤 꺼내는 의료 영상·백업에 적합). **Glacier Flexible Retrieval**은 분~시간 단위 검색(Expedited 1-5분, Standard 3-5시간, Bulk 5-12시간)이고, **Deep Archive**는 12-48시간이 걸린다. 즉 "얼마나 싸게 저장하느냐"와 "얼마나 빨리 꺼내느냐"가 정반대로 움직이는 트레이드오프이고, 클래스 선택은 사실상 "이 데이터를 꺼낼 때 몇 시간을 기다릴 수 있는가"에 대한 답이다.

## Intelligent-Tiering은 어떻게 접근 패턴을 추적하나

접근 패턴을 모르거나 시간이 지나며 변하는 데이터 — 이게 가장 어려운 경우다. 너무 뜨거운 클래스에 두면 저장료가 낭비되고, 너무 차가운 클래스에 두면 검색료와 최소 보관 위약금에 물린다. **Intelligent-Tiering**은 이 결정을 사람이 아닌 S3가 객체별로 자동 수행하게 만든다.

작동 원리는 이렇다. Intelligent-Tiering에 올린 객체는 S3가 **마지막 접근 시각을 객체 단위로 추적**한다. 30일 연속 접근이 없으면 자동으로 Infrequent Access 계층으로, 90일 연속 미접근이면 Archive Instant Access 계층으로 내린다. 그러다 그 객체에 다시 접근이 일어나면 즉시 Frequent Access 계층으로 자동 승격된다. 핵심은 **검색 비용도, 최소 보관 위약금도 없다**는 것 — 계층 간 자동 이동에는 전환 비용이 붙지 않고, 대신 객체당 소액의 모니터링·오토메이션 수수료만 든다. 그래서 "접근 패턴을 모른다"는 불확실성 자체를 S3에 떠넘기고 작은 수수료로 사는 보험에 가깝다.

> 💡 **관련 이론**: 이건 운영체제의 페이지 캐시·LRU(Least Recently Used) 알고리즘과 같은 발상이다. OS가 "최근에 안 쓴 메모리 페이지를 디스크로 내리고, 다시 쓰면 끌어올리는" 것처럼, Intelligent-Tiering은 객체를 LRU 기준으로 자동으로 뜨거운/차가운 계층 사이에서 이동시킨다. CPU 캐시 계층(L1/L2/L3/RAM/디스크)이 데이터의 접근 빈도에 따라 자동 배치되는 메모리 계층 구조(memory hierarchy)를 스토리지에 그대로 옮긴 것이다. 빈번히 쓰는 건 빠르고 비싼 곳에, 안 쓰는 건 느리고 싼 곳에 — 컴퓨팅의 보편 원리다.

> ⚠️ **함정**: Intelligent-Tiering이 만능은 아니다. 객체당 모니터링 수수료가 들기 때문에, **수백만 개의 아주 작은 객체**(예: 128KB 미만 썸네일)에는 모니터링 비용이 저장 비용을 압도해 손해다. AWS는 이를 의식해 작은 객체는 자동 계층 이동 대상에서 제외하지만, "패턴을 안다면 명시적 Lifecycle 규칙이 더 싸다"는 경우는 여전히 존재한다. 접근 패턴이 **명확히 예측 가능**하면 Intelligent-Tiering의 수수료를 내느니 직접 Lifecycle 규칙을 거는 게 낫다.

## Lifecycle 규칙: 명시적 수명주기 자동화

접근 패턴이 예측 가능할 때는 **Lifecycle 정책**으로 직접 규칙을 건다. "업로드 후 30일이면 Standard-IA로, 90일이면 Glacier로, 365일이면 Deep Archive로, 7년 뒤 삭제"처럼 시간 기반 전환·만료를 자동화한다. 로그·백업처럼 "온도 곡선이 뻔한" 데이터에 가장 잘 맞는다.

Lifecycle에서 자주 놓치는 숨은 비용이 **미완료 멀티파트 업로드(incomplete multipart upload)**다. 큰 객체를 여러 조각으로 나눠 올리는 멀티파트 업로드가 중간에 실패하면, 이미 올라간 조각들이 버킷에 남아 저장료를 계속 먹는다. 사용자는 이 조각들을 콘솔에서 보지 못하므로(완성된 객체가 아니라서) "보이지 않는데 청구되는" 유령 비용이 된다. Lifecycle 규칙에 "N일 지난 미완료 멀티파트를 자동 정리"를 반드시 넣어야 한다 — 이건 거의 모든 프로덕션 버킷에 권장되는 위생 규칙이다.

> 🔍 **더 깊이**: Lifecycle은 버전 관리(versioning)와 결합하면 더 강력하다. 버저닝된 버킷에서는 객체를 "삭제"해도 실제로는 삭제 마커가 붙고 이전 버전이 보관돼 계속 과금된다. Lifecycle에 "noncurrent version을 30일 뒤 Glacier로, 90일 뒤 삭제" 규칙을 걸어야 구버전이 무한히 쌓이는 걸 막는다. 또 Lifecycle 전환 자체에도 요청당 소액 비용이 있으므로, 수백만 객체를 한꺼번에 전환하면 전환 요청 비용이 발생한다 — "전환이 항상 무료"가 아니라는 점을 기억해야 한다.

## Bucket Keys가 KMS 호출 비용을 줄이는 방식

S3 객체를 SSE-KMS로 암호화하면 보안은 강해지지만 숨은 비용이 생긴다. **KMS API 호출 비용**이다. 객체를 쓸 때마다(PUT) KMS에 데이터 키 생성을 요청하고, 읽을 때마다(GET) KMS에 복호화를 요청한다. 고볼륨 환경에서 초당 수천 개의 객체를 다루면 KMS 호출 횟수가 폭발하고, KMS는 호출당 과금이라 이 비용이 만만치 않아진다.

**S3 Bucket Keys**는 이 문제를 캐싱으로 푼다. 기존엔 객체마다 KMS를 호출했지만, Bucket Keys를 켜면 S3가 KMS에서 받은 키로 **버킷 레벨의 중간 키(bucket-level key)**를 만들어 잠깐 캐싱하고, 그 짧은 기간 동안 같은 버킷의 여러 객체를 추가 KMS 호출 없이 암복호화한다. 결과적으로 KMS API 호출 횟수가 최대 99%까지 줄어 비용이 급감한다. 보안 수준(객체별 고유 데이터 키)은 유지하면서 KMS 왕복 횟수만 줄이는, 순수한 비용 최적화다.

> 💡 **관련 이론**: 이건 봉투 암호화(envelope encryption)의 캐싱 최적화다. 봉투 암호화는 "마스터 키로 데이터 키를 암호화하고, 데이터 키로 실제 데이터를 암호화"하는 2단 구조인데, 매번 마스터 키(KMS)에 데이터 키를 요청하면 호출이 잦아진다. Bucket Keys는 그 중간에 버킷 레벨 키라는 한 단계를 더 끼워 KMS 왕복을 줄인다 — TLS 세션 재사용이나 데이터베이스 커넥션 풀링처럼 "비싼 핸드셰이크를 재사용으로 분할 상환"하는 보편적 패턴이다.

## 네트워크·블록·파일 스토리지 비용 정리

S3 외의 스토리지도 비용 최적화 포인트가 있다.

**EBS**는 gp2에서 **gp3로 통일**하는 게 거의 항상 이득이다. gp2는 용량에 비례해 IOPS가 결정되는 구조라 성능을 더 얻으려면 쓰지도 않을 용량을 늘려야 했지만, gp3는 용량과 IOPS·처리량을 독립적으로 설정한다 — 같은 성능을 더 싸게, 또는 같은 가격에 더 높은 기본 성능(3000 IOPS 기본 제공)을 준다. 여기에 미연결(unattached) EBS 볼륨과 오래된 스냅샷을 정리하고(Trusted Advisor가 식별), 장기 보관 스냅샷은 **EBS Snapshot Archive**로 옮겨 최대 75% 절감한다.

**EFS**는 **Lifecycle Management**로 일정 기간 미접근 파일을 자동으로 Infrequent Access(IA)나 Archive 클래스로 내려 비용을 줄인다 — S3의 Intelligent-Tiering과 같은 발상의 파일 스토리지 버전이다. **FSx for Lustre**는 **Scratch vs Persistent** 선택이 핵심인데, Scratch는 복제·내구성 보장이 없는 대신 싸고 임시 계산용(HPC 중간 결과)에 맞고, Persistent는 비싸지만 데이터를 오래 보관한다.

> 📚 **사례**: 데이터 전송 비용은 스토리지 청구서에서 종종 가장 큰 "보이지 않는" 항목이다. 한 회사가 S3의 정적 자산을 전 세계 사용자에게 직접 서빙하다가 데이터 전송(DTO) 비용이 폭증한 사례는 흔하다. 해결책은 **CloudFront**를 앞에 두는 것 — CloudFront는 캐시 히트로 S3 원본 요청을 줄이고, S3→CloudFront 구간 전송이 무료이며, CloudFront→인터넷 단가가 S3 직접 전송보다 저렴한 경우가 많다. "스토리지 비용 최적화"가 단순히 클래스 선택이 아니라 전송 경로 설계까지 포함한다는 점이 핵심이다. VPC 내부에서 S3를 쓴다면 **S3 Gateway Endpoint**(무료)로 NAT Gateway 처리 비용을 우회하는 것도 같은 맥락이다.

## 가시화: Storage Lens와 Inventory

비용을 줄이려면 먼저 "무엇이 비용을 먹는지" 봐야 한다. **S3 Storage Lens**는 조직·계정·버킷 전반의 스토리지 사용을 대시보드로 가시화한다 — 기본 무료 대시보드는 사용량·증가 추세를 보여주고, 유료 고급 메트릭은 클래스별 분포·접근 패턴·비용 최적화 권장(예: "이 버킷에 미완료 멀티파트가 N TB 쌓여 있다")까지 낸다. **S3 Inventory**는 버킷의 모든 객체 목록과 메타데이터(크기·클래스·암호화·수정일)를 CSV/Parquet로 정기 생성해, 어떤 객체가 큰지·오래됐는지·잘못된 클래스에 있는지를 Athena로 분석하게 해준다.

> 🔍 **더 깊이**: **Requester Pays**는 비용 책임을 뒤집는 기능이다. 보통 데이터 전송·요청 비용은 버킷 소유자가 내지만, Requester Pays를 켜면 데이터를 다운로드하는 요청자가 그 비용을 부담한다. 공개 데이터셋(예: 게놈·위성 영상)을 배포하는 조직이 "데이터는 무료로 공개하되 다운로드 트래픽 비용은 사용자가 내라"고 할 때 쓴다. 비용 모델 설계가 단순 절감을 넘어 "누가 비용을 지느냐"의 거버넌스 결정이 되는 지점이다.

## 다른 클라우드와의 비교

| 구분 | AWS S3 | Azure Blob | GCP Cloud Storage |
|------|--------|------------|-------------------|
| 자동 계층화 | Intelligent-Tiering | (수명주기 규칙 위주) | **Autoclass**(자동 계층화) |
| 핫/쿨/콜드 | Standard / IA / Glacier / Deep Archive | Hot / Cool / Cold / Archive | Standard / Nearline / Coldline / Archive |
| 최소 보관 | 30/90/180일 | Cool 30일, Archive 180일 | Nearline 30 / Coldline 90 / Archive 365일 |
| 즉시 검색 아카이브 | Glacier Instant Retrieval | (Archive는 rehydrate 필요) | Archive(밀리초 접근 가능) |

세 클라우드 모두 "온도 계층 + 자동 계층화 + 최소 보관 기간"이라는 동일한 구조로 수렴한다. 이는 우연이 아니라 **데이터 온도 곡선**이라는 물리적 현실이 클라우드 공급자와 무관하게 같은 설계를 강제하기 때문이다. AWS의 Glacier Instant Retrieval처럼 "싸게 저장하되 즉시 꺼낼 수 있는" 계층이 각 클라우드에 생긴 것도, "아카이브인데도 빨리 꺼내야 하는" 의료·미디어 수요가 공통적이어서다.

## CLI로 직접 만져보기

```bash
# Lifecycle 규칙: 30일→IA, 90일→Glacier, 미완료 멀티파트 7일 정리
aws s3api put-bucket-lifecycle-configuration --bucket my-saa-bucket-2026 \
  --lifecycle-configuration '{
    "Rules":[{
      "ID":"tiering-and-cleanup","Status":"Enabled","Filter":{"Prefix":""},
      "Transitions":[
        {"Days":30,"StorageClass":"STANDARD_IA"},
        {"Days":90,"StorageClass":"GLACIER"}],
      "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}
    }]
  }'

# Bucket Keys 활성화 (SSE-KMS 호출 비용 절감)
aws s3api put-bucket-encryption --bucket my-saa-bucket-2026 \
  --server-side-encryption-configuration '{
    "Rules":[{
      "ApplyServerSideEncryptionByDefault":{
        "SSEAlgorithm":"aws:kms","KMSMasterKeyID":"alias/s3-key"},
      "BucketKeyEnabled":true}]
  }'

# Intelligent-Tiering 구성 (Archive Access 계층 활성)
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket my-saa-bucket-2026 --id archive-config \
  --intelligent-tiering-configuration '{
    "Id":"archive-config","Status":"Enabled",
    "Tierings":[{"Days":90,"AccessTier":"ARCHIVE_ACCESS"},
                {"Days":180,"AccessTier":"DEEP_ARCHIVE_ACCESS"}]}'

# S3 Inventory: 객체 목록을 매일 Parquet로
aws s3api put-bucket-inventory-configuration \
  --bucket my-saa-bucket-2026 --id daily-inv \
  --inventory-configuration file://inventory.json

# 미연결 EBS 볼륨 찾기 (정리 후보)
aws ec2 describe-volumes \
  --filters Name=status,Values=available \
  --query 'Volumes[].{ID:VolumeId,Size:Size,Created:CreateTime}'
```

## 정리하며

스토리지 비용 최적화의 핵심은 "단가가 아니라 접근 패턴의 함수"라는 깨달음이다. ① S3 저비용 클래스의 **최소 보관 기간**(IA 30일 / Glacier 90일 / Deep Archive 180일)은 약정의 대가로 단가를 깎는 구조이고, 30일 안에 자주 접근·삭제될 데이터를 IA로 옮기면 오히려 비싸진다. ② 접근 패턴을 모르거나 변하면 **Intelligent-Tiering**으로 불확실성을 S3에 떠넘기고 소액 수수료로 LRU 자동 계층화를 산다 — 단, 아주 작은 객체엔 수수료가 역효과다. ③ 패턴이 명확하면 **Lifecycle 규칙**으로 직접 전환·만료를 자동화하고, 미완료 멀티파트와 구버전 정리를 반드시 넣는다. ④ **Bucket Keys**는 봉투 암호화에 버킷 레벨 키 캐싱을 끼워 KMS 호출을 99%까지 줄인다. ⑤ EBS는 gp3 통일, EFS·FSx는 IA·Scratch 같은 저비용 모드, 전송은 CloudFront·Gateway Endpoint로 줄이고, Storage Lens·Inventory로 가시화한다.

다음 글에서는 스토리지에서 빠져나오는 데이터 자체의 비용 — 인터넷·리전·AZ 간 데이터 전송이 왜 청구서의 숨은 30%를 차지하는지, 그리고 Gateway Endpoint·CloudFront·토폴로지 설계로 어떻게 줄이는지를 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 새 데이터 파이프라인의 출력을 S3에 저장하는데, 이 데이터가 얼마나 자주 접근될지 전혀 예측할 수 없고 시간이 지나며 패턴이 바뀔 수 있다. 운영 부담 없이 비용을 자동 최적화하려면?

A) S3 Standard
B) S3 Standard-IA
C) S3 Intelligent-Tiering
D) S3 Glacier Deep Archive

**정답: C**

해설: 접근 패턴이 불확실하거나 시간에 따라 변할 때는 Intelligent-Tiering이 정답이다. S3가 객체별 마지막 접근 시각을 추적해 자동으로 계층을 올리고 내리며, 검색 비용·최소 보관 위약금이 없어 "잘못된 클래스 선택" 리스크를 제거한다. Standard(A)는 차가운 데이터에 저장료가 낭비되고, Standard-IA(B)는 자주 접근하면 검색료와 30일 최소 보관에 물리며, Deep Archive(D)는 가끔이라도 빨리 꺼내야 하면 12-48시간 검색 지연이 치명적이다.

---

**문제 2.** 한 팀이 비용을 줄이려고 30일 안에 자주 수정·삭제되는 임시 분석 데이터를 S3 Standard에서 Standard-IA로 옮겼더니 오히려 비용이 늘었다. 원인은?

A) IA는 저장 단가가 Standard보다 비싸다
B) IA의 30일 최소 보관 위약금과 높은 검색 비용이 저장 절감을 초과했다
C) IA는 가용성이 낮아 추가 비용이 든다
D) IA로 옮기면 자동으로 KMS 비용이 발생한다

**정답: B**

해설: Standard-IA는 30일 최소 보관 기간이 있어 그 전에 삭제·전환하면 남은 기간 저장료를 위약금으로 청구받고, 접근 시 GB당 검색 비용도 든다. 30일 안에 자주 접근·삭제되는 데이터는 이 두 비용이 저장 단가 절감을 압도해 Standard보다 비싸진다. A는 틀렸다 — IA 저장 단가는 Standard보다 싸다. C·D는 비용 증가의 실제 원인이 아니다. IA는 "확실히 자주 안 쓰고 한 달 이상 둘" 데이터에만 맞는다.

---

**문제 3.** 한 고볼륨 애플리케이션이 SSE-KMS로 암호화된 S3 버킷에 초당 수천 개의 객체를 쓰고 읽는다. KMS API 호출 비용이 급증했다. 보안 수준을 유지하면서 비용을 줄이는 가장 적합한 방법은?

A) SSE-S3로 암호화를 변경한다
B) S3 Bucket Keys를 활성화한다
C) 암호화를 비활성화한다
D) 객체를 더 큰 단위로 합친다

**정답: B**

해설: S3 Bucket Keys는 버킷 레벨 중간 키를 만들어 잠깐 캐싱하고 그 동안 여러 객체를 추가 KMS 호출 없이 암복호화해, KMS API 호출을 최대 99%까지 줄인다. 객체별 고유 데이터 키라는 보안 수준은 유지된다. SSE-S3(A)는 KMS의 키 관리·감사 기능을 잃어 보안 요건을 충족하지 못할 수 있고, C는 보안을 포기하므로 부적절하며, D는 KMS 호출 구조를 근본적으로 바꾸지 못한다.

---

**문제 4.** 한 운영자가 S3 버킷의 비용을 점검하다 콘솔에 보이지 않는데도 상당한 저장료가 청구되는 것을 발견했다. 가장 가능성 높은 원인과 해결책은?

A) 버전 관리가 꺼져 있다 — 켠다
B) 미완료 멀티파트 업로드 조각이 쌓여 있다 — Lifecycle로 자동 정리한다
C) 리전이 잘못됐다 — 리전을 바꾼다
D) Storage Lens가 켜져 있다 — 끈다

**정답: B**

해설: 큰 객체의 멀티파트 업로드가 중간에 실패하면 이미 올라간 조각들이 완성된 객체가 아니라서 콘솔에 보이지 않은 채 저장료를 계속 먹는다. Lifecycle 규칙에 "N일 지난 미완료 멀티파트 자동 정리(AbortIncompleteMultipartUpload)"를 넣는 것이 표준 위생 규칙이다. A는 오히려 버전이 쌓이면 비용이 늘고, C는 무관하며, D는 Storage Lens가 비용을 가시화하는 도구이지 비용 원인이 아니다.

---

**문제 5.** 한 회사가 EBS 볼륨을 gp2에서 gp3로 전환하려 한다. 기대할 수 있는 효과로 가장 정확한 것은?

A) 비용은 같지만 내구성이 향상된다
B) 용량과 IOPS·처리량을 독립 설정할 수 있어 같은 성능을 더 싸게(또는 같은 가격에 더 높은 기본 성능) 얻는다
C) gp3는 gp2보다 항상 비싸지만 지연이 낮다
D) gp3는 마그네틱 스토리지라 비용이 급감한다

**정답: B**

해설: gp2는 용량에 비례해 IOPS가 결정돼 성능을 더 얻으려면 불필요한 용량을 늘려야 했지만, gp3는 용량·IOPS·처리량을 독립적으로 설정하고 3000 IOPS를 기본 제공한다. 따라서 같은 성능을 더 싸게, 또는 같은 가격에 더 높은 기본 성능을 얻어 거의 항상 이득이다. A·C는 비용 관계를 잘못 설명했고, D는 gp3가 SSD 기반이지 마그네틱이 아니므로 틀렸다.

---

**문제 6.** 한 의료 기관이 영상 데이터를 분기에 한 번 정도만 꺼내지만, 꺼낼 때는 밀리초 단위로 즉시 접근해야 한다. 장기 저장 비용은 낮추되 즉시 검색이 가능해야 할 때 가장 적합한 클래스는?

A) S3 Standard
B) S3 Glacier Instant Retrieval
C) S3 Glacier Flexible Retrieval
D) S3 Glacier Deep Archive

**정답: B**

해설: Glacier Instant Retrieval은 Standard-IA보다 싼 저장 단가를 제공하면서도 밀리초 단위 즉시 접근이 가능해, "거의 안 꺼내지만 꺼낼 땐 빨라야 하는" 의료 영상·백업에 정확히 맞는다. Standard(A)는 즉시 접근되지만 저장료가 비싸 분기 접근에는 낭비이고, Flexible Retrieval(C)은 분~시간, Deep Archive(D)는 12-48시간이 걸려 "즉시 접근" 요건을 충족하지 못한다.

---

**문제 7.** 한 조직이 여러 계정·버킷에 걸친 S3 사용을 한눈에 보고, 어떤 버킷에 미완료 멀티파트나 잘못된 클래스의 객체가 많은지 권장까지 받고 싶다. 가장 적합한 도구는?

A) S3 Inventory만 사용
B) S3 Storage Lens (고급 메트릭)
C) CloudWatch Alarm
D) Trusted Advisor 단독

**정답: B**

해설: S3 Storage Lens는 조직·계정·버킷 전반의 스토리지를 대시보드로 가시화하고, 고급 메트릭은 클래스 분포·접근 패턴·비용 최적화 권장(미완료 멀티파트 누적 등)까지 제공한다. S3 Inventory(A)는 객체 목록을 내주지만 조직 단위 권장 대시보드는 아니다(Athena로 직접 분석해야 함). CloudWatch Alarm(C)은 메트릭 임계 알림이고, Trusted Advisor(D)는 S3 전용 심층 분석 도구가 아니다.

---

## 📌 핵심 요약

스토리지 비용은 저장·요청·검색·전송이 접근 패턴에 따라 합산되는 함수이지 단가 하나가 아니다. S3 저비용 클래스의 최소 보관 기간(IA 30/Glacier 90/Deep Archive 180일)은 약정형 할인 구조라, 30일 안에 자주 접근·삭제될 데이터를 IA로 옮기면 역효과다. 패턴이 불확실하면 Intelligent-Tiering으로 LRU 자동 계층화를 사고, 명확하면 Lifecycle로 직접 자동화하되 미완료 멀티파트·구버전 정리를 넣는다. Bucket Keys는 KMS 호출을 99%까지 줄이고, EBS는 gp3 통일, 전송은 CloudFront·Gateway Endpoint로 줄이며, Storage Lens·Inventory로 가시화한다. 시험은 "이 데이터를 얼마나 자주, 얼마나 빨리 꺼내는가"를 클래스에 매핑하는 능력을 묻는다.
