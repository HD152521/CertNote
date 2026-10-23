# Day 2 - RDS의 보안·백업·모니터링: Capital One 사고가 남긴 교훈들

RDS를 처음 배울 땐 "암호화 체크박스 켜고, 백업 보존 7일로 두고, CloudWatch 알람 몇 개 걸면 끝"이라고 생각하기 쉽다. 그런데 production에서 사고가 나는 지점은 정확히 그 빈틈에 있다. 2019년 7월 Capital One의 1억 600만 건 개인정보 유출은 RDS 자체의 결함이 아니라 **메타데이터 인증·IAM 권한·S3 백업 노출**이라는 운영 면의 빈틈에서 시작됐다. 오늘 다룰 주제 — 암호화, IAM DB 인증, 백업, 모니터링 — 은 모두 그런 사고를 막기 위해 RDS가 진화시켜온 운영 기능들이다.

DVA-C02에서 이 주제는 시나리오 문제로 나온다. "비밀번호를 코드에 안 박고 싶다"고 하면 IAM 인증 또는 Secrets Manager, "5분 단위 복구가 필요하다"면 PITR, "쿼리가 느린 원인을 찾아야 한다"면 Performance Insights — 이런 1:1 매핑을 알아 두어야 한다.

## RDS 암호화: 왜 "생성 시"에만 켤 수 있을까

RDS의 저장 데이터 암호화는 AWS KMS(AWS Key Management Service)로 관리되는 키를 사용해 **AES-256-XTS**로 EBS 볼륨, 자동 백업, Read Replica, 스냅샷 전부를 암호화한다. 그런데 제약이 하나 있다. **이미 만들어진 RDS 인스턴스를 사후에 암호화로 바꿀 수 없다.** 콘솔에도 그 옵션이 없다. 우회 방법은 ① 스냅샷 생성 ② 스냅샷을 "암호화된 상태로 copy" ③ 그 암호화 스냅샷에서 새 인스턴스 복원 — 이렇게 세 단계를 거쳐야 한다.

이런 제약이 있는 이유는 EBS의 암호화 모델 때문이다. EBS 볼륨은 **생성 시점**에 KMS 데이터 키(Data Encryption Key, DEK)가 한 번 발급되고, 그 키로 모든 블록이 LUKS 비슷한 방식으로 암호화된다. 볼륨이 만들어진 뒤에 평문으로 흩어진 데이터를 다시 암호화해 주는 메커니즘은 없다. "라이브 마이그레이션 중에 한 블록씩 재암호화"하는 기능은 트랜잭션 일관성을 깨뜨리지 않고 구현하기가 매우 까다롭다. 그래서 AWS는 "스냅샷 단계에서 한 번 평문으로 추출되는 순간을 이용해 거기서 암호화 키를 새로 발급"하는 우회 경로만 제공한다. 비슷한 제약이 GCP Persistent Disk에도 있다(CMEK 변경은 새 디스크 생성 필요).

암호화를 켰을 때 KMS는 **envelope encryption** 패턴으로 동작한다. 마스터 키(CMK, Customer Master Key)는 KMS 내부 HSM(Hardware Security Module, AWS는 CloudHSM 기반 FIPS 140-2 Level 3 인증)을 떠나지 않는다. 데이터를 실제로 암호화하는 건 그 마스터 키로 한 번 더 암호화된 데이터 키다.

데이터 키는 EBS 볼륨 단위로 발급되고, 사용 시점에만 메모리에서 복호화돼 디스크 I/O에 쓰인다. 디스크 어디에도 평문 키가 남지 않는다.

```
[KMS CMK (HSM 내부)]
       |
       | GenerateDataKey
       v
[Data Key 평문 + Data Key 암호화본]
       |
       +---> 평문 키: EBS 드라이버 메모리 (휘발성, 디스크에 안 적힘)
       +---> 암호화본: EBS 볼륨 메타데이터에 저장
                  |
                  | (필요 시 KMS Decrypt 호출로 평문 복구)
                  v
            데이터 I/O 시 복호화
```

Envelope encryption에서는 마스터 키로 모든 데이터를 직접 암호화하면 키 사용 빈도가 크게 늘어 HSM 성능 병목이 생긴다(KMS는 region별로 초당 키 작업 한도가 있다 — 일반 키 5,500-30,000/초). 그래서 "마스터 키는 데이터 키만 보호하고, 실제 데이터는 데이터 키로 암호화"하는 2단계 구조가 표준이다. AWS S3, EBS, DynamoDB, Secrets Manager 모두 같은 모델을 쓴다.

전송 데이터 암호화(in-transit)는 별도 영역이다. RDS는 인스턴스마다 X.509 인증서를 가지고 있고(`rds-ca-2019`, `rds-ca-rsa2048-g1` 등 세대별로 발급), 클라이언트는 이 인증서를 검증하면서 TLS 1.2/1.3 연결을 맺는다. 강제로 SSL만 허용하려면 파라미터 그룹에서 `rds.force_ssl=1`(PostgreSQL) 또는 `require_secure_transport=ON`(MySQL 8)을 켜면 된다. CA 인증서는 주기적으로 회전되므로(2024년 `rds-ca-rsa2048-g1`로 전환), 애플리케이션의 트러스트 스토어 갱신을 놓치면 **CA 만료 당일에 connection이 대량으로 실패**한다.

"갑자기 SSL handshake 실패"가 나오는 시나리오에서는 CA 인증서 만료를 의심한다. 예를 들어 `rds-ca-2015` 인증서 만료(2020년 3월)를 앞두고 AWS가 사전 공지했지만, 모든 고객이 `rds-ca-2019`로 교체하지는 못했다.

## IAM DB Authentication: 비밀번호를 코드에서 지우는 길

전통적인 DB 인증은 user/password 쌍을 애플리케이션에 박는다. 그런데 이 비밀번호가 ① 코드 저장소에 커밋되거나 ② 환경변수에 노출되거나 ③ 로그에 찍히는 사고가 반복됐다. RDS IAM Authentication은 그 비밀번호를 아예 없애는 것이 목표다.

흐름은 이렇다. ① 애플리케이션이 IAM 역할(EC2 인스턴스 프로필, Lambda 실행 역할, EKS IRSA 등)을 통해 임시 자격증명을 얻는다 ② 그 자격증명으로 `rds:GenerateDBAuthToken` API를 호출해 **SigV4 서명된 토큰**을 만든다 ③ 그 토큰을 DB 패스워드 자리에 넣어 연결한다. 토큰의 유효 시간은 정확히 **15분**이고, 한 번 발급된 토큰은 그 시간 안에 여러 번 connection을 만들 수 있다.

IAM 토큰의 실체는 `aws rds generate-db-auth-token` CLI가 출력하는 **AWS Signature Version 4로 서명된 presigned URL의 query string**이다. URL 형식은 다음과 같다(개념).

```
mydb.xxxx.rds.amazonaws.com:3306/?Action=connect&DBUser=appuser&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Date=...&X-Amz-Expires=900&X-Amz-Signature=...
```

RDS 서버는 connection 시 이 토큰을 패스워드로 받아 ① 만료 시간이 지나지 않았는지 ② 시그니처가 유효한지 ③ 해당 IAM 주체가 `rds-db:connect` 권한을 가지는지를 검증한다. 토큰 자체에 인증 정보가 들어 있어서 RDS 서버는 KMS나 STS를 추가로 호출하지 않고 검증할 수 있다. 이것이 SigV4의 설계 이점이다(stateless, replay 위험은 15분 내로 한정).

시험에 나오는 IAM 인증의 제약은 다음과 같다.

- **지원 엔진**: MySQL 5.7+, MariaDB 10.4+, PostgreSQL 9.5+ — Oracle/SQL Server는 미지원
- **TLS 필수**: 토큰을 평문으로 보내면 안 되므로 SSL 연결 강제됨
- **초당 새 연결 한도**: MySQL 기준 ~200/초로 권장 (그 이상이면 STS·SigV4 시그니처 검증이 병목)
- **기존 DB 사용자 매핑 필요**: DB에 `CREATE USER 'appuser' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS'`로 사용자를 만들어두고, IAM 정책에서 `rds-db:connect` 리소스를 `arn:aws:rds-db:region:account:dbuser:cluster-id/appuser` 형태로 명시

> ⚠️ **함정**: IAM 인증은 만능이 아니다. 짧은 토큰 만료 + 초당 새 연결 제한 때문에 **트래픽이 매우 높은 OLTP 워크로드에서는 SigV4 검증이 latency를 키울 수 있다**. 시험에서 "Lambda + RDS 비밀번호 회피"는 IAM 인증이 답일 때가 많지만, "초당 수천 connection을 만드는 트래픽" 시나리오에선 RDS Proxy + Secrets Manager 조합이 더 적절하다. 토큰 캐싱 + connection pooling을 같이 써야 안정적이다.

```python
# 토큰 캐싱 패턴 - 실무에서 자주 쓰임
import boto3, time, threading
from functools import lru_cache

class IamDbTokenManager:
    def __init__(self, host, port, user, region):
        self.host, self.port, self.user, self.region = host, port, user, region
        self.client = boto3.client('rds', region_name=region)
        self._token = None
        self._expires_at = 0
        self._lock = threading.Lock()

    def get_token(self):
        with self._lock:
            # 만료 60초 전에 재발급 (안전 마진)
            if self._token is None or time.time() >= self._expires_at - 60:
                self._token = self.client.generate_db_auth_token(
                    DBHostname=self.host, Port=self.port,
                    DBUsername=self.user, Region=self.region)
                self._expires_at = time.time() + 15 * 60
            return self._token
```

Secrets Manager와의 비교는 헷갈리기 쉽다. Secrets Manager는 **비밀번호 자체를 저장·회전**하는 도구이고, IAM 인증은 **비밀번호를 아예 없애는** 도구다. 두 접근에는 trade-off가 있다.

| 차원 | IAM DB Auth | Secrets Manager + 비밀번호 | RDS Proxy + Secrets Manager |
|------|-------------|---------------------------|------------------------------|
| 비밀번호 존재 | 없음 (IAM 토큰만) | 있음 (자동 회전) | 있음 (Proxy가 캐싱) |
| 토큰/비밀 갱신 | 15분 | 30일(기본) ~ 365일 | Proxy가 자동 |
| 새 연결 한도 | 200/초 권장 | 엔진 한도 그대로 | Proxy pool 한도 |
| 적합 시나리오 | 낮은 빈도 + 보안 강조 | 일반적 운영 | 고빈도 Lambda |

## 백업: 자동 백업의 동작과 PITR

RDS 자동 백업은 사실 **두 가지 다른 메커니즘이 합쳐진** 시스템이다. ① 매일 백업 윈도우 동안 찍히는 **storage volume snapshot**(EBS 스냅샷과 같은 메커니즘 — 첫 번째는 full, 이후는 incremental)과 ② **5분 단위로 S3에 푸시되는 transaction log**. 이 두 가지가 결합돼 Point-in-Time Recovery(PITR)가 가능해진다.

```
[t-7일 매일 03:00]   [t-1시간]    [현재]
   |full snapshot      |snap        |
   v                   v            v
   ███▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
       <-- binlog/WAL 5분 단위 S3 업로드 -->

복원 시: 가장 가까운 스냅샷 + 그 이후 WAL/binlog를 원하는 시점까지 replay
```

PITR은 "5분 단위"라고 하지만 실제로는 더 세밀하다. MySQL이면 binlog의 한 트랜잭션 단위까지, PostgreSQL이면 WAL의 LSN(Log Sequence Number) 단위까지 복원 가능하다. "5분 단위"는 S3로 업로드되는 주기일 뿐이고, RDS는 그 사이의 in-flight log도 가능한 만큼 보존한다. 단, 마지막 5분 안에 인스턴스가 catastrophic failure를 겪으면 그 사이 log는 손실될 수 있어 RPO는 실효 5분 정도로 보는 것이 안전하다. "RPO 5분 이내가 필요한 경우"에는 자동 백업 + PITR이 답이다.

자동 백업과 수동 스냅샷은 완전히 다른 객체다. 둘 다 결국 S3에 저장되어 헷갈리기 쉽지만, 차이는 **생명 주기 정책**에 있다.

| 항목 | 자동 백업 | 수동 스냅샷 |
|------|-----------|-------------|
| 생성 주기 | 매일 백업 윈도우 | 수동/자동화(EventBridge) |
| 보존 기간 | 0-35일 (0=비활성) | 무제한 (단, 비용↑) |
| DB 인스턴스 삭제 시 | 함께 삭제(기본) — Final Snapshot 옵션으로 변환 가능 | 그대로 유지 |
| 스토리지 비용 | DB 스토리지 100%까지 무료, 초과분 GB-월 과금 | 처음부터 GB-월 과금 |
| 다른 리전 복사 | 직접 불가 (수동 스냅샷으로 복사 후 가능) | ✅ KMS 키 재암호화하며 복사 |
| 다른 계정 공유 | ❌ | ✅ (암호화된 경우 KMS 키 grant 필요) |
| PITR | ✅ | ❌ (특정 시점만) |

2017년 GitLab에서는 데이터베이스 운영자가 staging DB와 production DB를 헷갈려 `rm -rf` 명령을 production에 실행했다. 사고 직후 복구를 시도했지만 준비해 둔 백업 메커니즘 대부분이 제대로 작동하지 않았고(검증 부재), 마지막 남은 6시간 전 LVM 스냅샷으로 복원해야 했다. RDS 자동 백업 + PITR이라면 같은 사고에서도 사고 직전 시점(분 단위)으로 복원할 수 있었다. 교훈은 백업이 **존재 여부보다 복원 검증이 더 중요**하다는 것이다. AWS Backup의 cross-account backup vault 잠금(WORM)이 등장한 배경이기도 하다.

> ⚠️ **함정**: 자동 백업 보존 기간을 **0일로 설정하면 자동 백업이 비활성화**되고, 그 순간 PITR과 Read Replica 생성이 모두 막힌다. "왜 Read Replica가 안 만들어지나?" 시나리오의 원인이 된다. 또한 자동 백업이 활성화돼 있어도 **DB 인스턴스 종료 시 Final Snapshot을 안 만들고 삭제하면 모든 자동 백업이 사라진다** — 보존이 필요한 데이터는 반드시 수동 스냅샷으로 변환 또는 별도 보관.

AWS Backup과의 관계도 알아둬야 한다. AWS Backup은 RDS, EBS, DynamoDB, EFS 등을 한 정책으로 묶어 관리하는 메타 서비스다. 백업 vault에 **WORM(Vault Lock)**을 걸면 일정 기간 누구도 삭제 못 한다(랜섬웨어 대응). 시험에서 "랜섬웨어/내부자 위협으로부터 RDS 백업 보호" 시나리오는 AWS Backup Vault Lock이 답이다.

## 모니터링 3종 세트: CloudWatch, Enhanced Monitoring, Performance Insights

이 세 가지는 데이터 출처가 완전히 다르고, 그래서 답해 주는 질문도 다르다. 헷갈리기 쉬운 영역이다.

| 도구 | 데이터 출처 | 간격 | 답할 수 있는 질문 |
|------|-------------|------|-------------------|
| **CloudWatch** | EC2 하이퍼바이저 외부 (Nitro 카드) | 60초 기본 / 1초 detailed | "CPU·디스크·네트워크 사용률" |
| **Enhanced Monitoring** | RDS 인스턴스 OS 내부 (CloudWatch Logs Agent) | 1, 5, 10, 15, 30, 60초 | "어떤 OS 프로세스가 CPU를 먹나" |
| **Performance Insights** | DB 엔진 내부 (Aurora는 native, 다른 엔진은 어댑터) | 1초 (DBLoad) | "어떤 쿼리가 lock 대기 중인가" |

CloudWatch가 보는 메트릭은 하이퍼바이저 레벨에서 가상화 계층이 "이 인스턴스는 CPU를 N% 쓰고 있다"를 외부에서 관찰한 값이다. 그래서 **게스트 OS 내부의 정보(프로세스 단위 CPU, 메모리 상세 등)는 볼 수 없다**. Enhanced Monitoring은 RDS OS 안에 작은 에이전트를 띄워 `/proc/stat`, `/proc/meminfo`, `/proc/PID/status` 같은 파일을 1초 단위로 읽어 CloudWatch Logs로 푸시한다.

Performance Insights는 한 단계 더 들어가 DB 엔진 내부의 wait event sampling(MySQL의 performance_schema, PostgreSQL의 pg_stat_activity와 유사한 인터페이스)을 통해 "지금 이 순간 어떤 쿼리가 어떤 락을 기다리고 있는가"를 그래프로 보여준다.

Performance Insights의 **DBLoad** 지표는 "특정 시점에 active session이 몇 개이고 어떤 wait event에 묶여 있는지"를 sampling으로 측정한 값이다. Oracle ASH(Active Session History)와 같은 계열이다. wait event 카테고리(CPU, IO, Lock, Network 등)별로 색을 나눈 stacked area chart가 PI 콘솔의 핵심 화면이다.

주요 CloudWatch 지표와 의미는 다음과 같다.

| 지표 | 임계값 가이드 | 의미 |
|------|--------------|------|
| `CPUUtilization` | > 80% 지속 | 인스턴스 클래스 업그레이드 검토 |
| `DatabaseConnections` | max_connections의 80% | connection 누수 또는 burst |
| `FreeStorageSpace` | < 10GB | 스토리지 부족 (Auto Scaling 활성화 권장) |
| `ReadLatency`/`WriteLatency` | > 20ms | 디스크 I/O 병목 또는 PIOPS 부족 |
| `ReplicaLag` (Read Replica) | > 30s | 비동기 복제 지연 — 분석 쿼리가 primary 부하 키움 |
| `BurstBalance` (gp2) | < 20% | I/O burst credit 고갈 직전 |
| `DiskQueueDepth` | > 32 | I/O 대기 큐 — 처리량 한계 |

gp2 스토리지에서는 `BurstBalance`가 100%에서 0%로 떨어지는 시점이 곧 latency spike다. gp3는 burst 개념이 없고 baseline 성능을 항상 보장하므로 신규 인스턴스에 gp3를 쓰면 이 문제가 사라진다. "갑자기 RDS가 느려졌다 + gp2 사용 중" 시나리오의 원인은 BurstBalance 고갈이다.

## 매개변수 그룹·옵션 그룹: 엔진 튜닝의 두 축

RDS는 OS 셸 접근이 막혀 있기 때문에 엔진 설정 변경은 모두 **파라미터 그룹**을 통해야 한다. `default.mysql8.0` 같은 기본 그룹은 수정 불가 — 반드시 custom group을 만들어 적용한다. 일부 파라미터(예: `innodb_buffer_pool_size`)는 **dynamic**으로 즉시 반영되고, 다른 일부(예: `binlog_format`)는 **static**이라 인스턴스 재시작이 필요하다. "파라미터를 바꿨는데 적용 안 됨" 시나리오의 답은 static 파라미터 + 재시작 누락이다.

옵션 그룹은 파라미터 그룹과 별개로, **엔진의 추가 기능을 활성화**한다. Oracle의 TDE(Transparent Data Encryption), SQL Server Audit, MySQL의 MEMCACHED 인터페이스 등이 옵션 그룹에서 토글된다.

| 구분 | DB Parameter Group | DB Option Group |
|------|--------------------|-----------------|
| 대상 | 엔진 설정값 (memory, query cache 등) | 엔진 추가 기능 (TDE, Audit, S3 통합 등) |
| 적용 | 모든 엔진 | Oracle, SQL Server, MySQL 등 일부 |
| 변경 영향 | dynamic은 즉시, static은 재시작 | 대부분 재시작 필요 |
| Aurora 전용 | DB Cluster Parameter Group 추가 존재 | 거의 사용 안 함 |

## 유지보수 윈도우와 마이너 버전 업그레이드

RDS는 **주 1회 30분짜리 유지보수 윈도우**를 갖는다. 이 시간에 마이너 패치, OS 보안 업데이트, 인증서 회전이 일어난다. 기본은 무작위 윈도우지만 운영팀이 트래픽 낮은 시간으로 지정 가능하다(예: `sun:18:00-sun:18:30` UTC).

Multi-AZ 인스턴스는 패치가 **standby부터 적용되고, 그 후 페일오버를 통해 primary 패치**가 진행되므로 다운타임이 페일오버 60-120초로 최소화된다. Single-AZ는 패치 시간만큼 다운된다. "패치 시 다운타임 최소화" 시나리오는 Multi-AZ가 답이다.

```bash
# 1) 강제 즉시 패치 (다음 유지보수 윈도우를 기다리지 않음)
aws rds modify-db-instance \
  --db-instance-identifier mydb \
  --auto-minor-version-upgrade \
  --apply-immediately

# 2) 유지보수 윈도우 지정 (UTC)
aws rds modify-db-instance \
  --db-instance-identifier mydb \
  --preferred-maintenance-window sun:18:00-sun:18:30
```

가상의 사례로, 한 핀테크 스타트업이 Single-AZ로 운영하던 RDS PostgreSQL에 무작위 유지보수 윈도우를 그대로 둔 채 운영하다가 한국 시간 평일 오전 11시(UTC 02:00)에 마이너 패치가 자동 실행됐다. 약 4분간 DB가 다운돼 결제 트랜잭션 수천 건이 실패했다. 원인은 ① Multi-AZ 미적용 ② 유지보수 윈도우를 트래픽 낮은 시간으로 지정하지 않음이었다. 두 가지 모두 콘솔 토글로 해결되는 사항이다.

## Secrets Manager + RDS 비밀번호 회전: 어떻게 무중단인가

Secrets Manager는 RDS 비밀번호를 저장하고, AWS가 제공하는 회전 Lambda(또는 Secrets Manager 네이티브 회전, 2022년부터)로 주기적으로 새 비밀번호를 발급한다. 회전 시 무중단이 가능한 이유는 **두 단계 비밀(AWSPREVIOUS / AWSCURRENT / AWSPENDING)** 모델이다.

```
회전 시작 시점:
  AWSCURRENT = "기존 비번"   ←── 애플리케이션이 사용 중
  AWSPENDING = "새 비번 후보"

회전 진행:
  1. AWSPENDING으로 RDS 비밀번호 변경 시도 (DB도 동시 인식)
  2. 검증: AWSPENDING으로 DB connection 성공 확인
  3. 라벨 스왑: AWSPENDING → AWSCURRENT, 기존은 AWSPREVIOUS로 강등
  4. AWSPREVIOUS도 한동안 유효 (롤백 대비)

애플리케이션 측:
  - 매 요청마다 Secrets Manager에서 비밀 fetch (또는 캐시 + TTL)
  - 비번 변경 즉시 다음 connection에서 새 비번 사용
```

MySQL은 한 사용자에 동시에 두 비밀번호를 가질 수 있는 기능(`ALTER USER ... IDENTIFIED BY ... RETAIN CURRENT PASSWORD`)을 MySQL 8.0부터 제공하는데, Secrets Manager 회전은 이 기능을 활용한다. 두 비밀번호가 잠시 공존하는 동안 기존 connection은 끊기지 않고, 새 connection은 새 비밀번호로 접속한다. 이것이 "무중단 회전"의 기술적 근거다. RDS Proxy를 함께 쓰면 Proxy가 새 비밀번호를 자동으로 가져와 backend connection을 갱신하므로 애플리케이션 코드에서 비밀번호 fetch 로직조차 필요 없다.

## CloudWatch Logs 통합과 감사

RDS는 엔진 로그(Error, General, Slow Query, Audit)를 **CloudWatch Logs로 자동 전송 가능**하다. 단 기본은 비활성 — 콘솔에서 "Log exports" 체크박스로 켜야 한다. 활성화하면 로그 그룹 `/aws/rds/instance/<dbid>/<logtype>`에 실시간으로 푸시되고, CloudWatch Logs Insights로 SQL 비슷한 쿼리가 가능하다.

```sql
-- CloudWatch Logs Insights: 최근 1시간 slow query top 10
fields @timestamp, @message
| filter @logStream like /slowquery/
| parse @message /Query_time: (?<query_time>\d+\.\d+)/
| sort query_time desc
| limit 10
```

감사가 필요한 환경(HIPAA, PCI-DSS, SOC 2)에서는 Audit log + CloudTrail RDS 데이터 이벤트를 함께 활성화하고, KMS 암호화된 로그 그룹으로 푸시한다. "DB에 누가 무엇을 했는지 추적" 시나리오의 답은 Audit log → CloudWatch Logs → CloudWatch Logs Insights 흐름이다.

## 정리

RDS의 보안·운영은 두 가지 원칙으로 정리된다.

- **비밀(키, 비밀번호)을 사람·코드에서 떼어낸다** — KMS, IAM Auth, Secrets Manager.
- **사고는 일어난다고 가정하고 복원 가능성을 미리 검증한다** — 자동 백업, PITR, AWS Backup Vault Lock, 모니터링 3종 세트.

Capital One 사고의 교훈은 "RDS가 안전한가"가 아니라 "RDS 주변(메타데이터 엔드포인트, IAM 역할, S3 백업 권한)이 안전한가"를 물어야 한다는 것이다. 시험 시나리오도 이 사고의 패턴을 따른다. 비밀번호 노출, 백업 보호 부재, 모니터링 부재.

다음 글에서는 RDS 비용 최적화와 트러블슈팅 — Reserved Instance, Aurora Serverless v2, slow query 진단, connection storm 대응 — 으로 한 단계 더 들어간다.

---

## 📝 연습 문제

**문제 1.** 한 금융사가 운영 중인 비암호화 RDS MySQL을 다운타임 최소화하면서 KMS 암호화로 전환해야 한다. 올바른 절차는?

A) 콘솔에서 "Modify" → Encryption 토글을 켜고 즉시 적용
B) 스냅샷 생성 → 스냅샷을 암호화 옵션으로 copy → copy된 스냅샷에서 새 인스턴스 복원 → 애플리케이션 endpoint 전환
C) `aws rds modify-db-instance --storage-encrypted` 실행
D) Multi-AZ를 켜면 자동으로 암호화됨

**정답: B**

해설: RDS는 생성 시점에만 암호화 설정이 가능하므로, 비암호화 → 암호화 전환은 반드시 스냅샷 경로를 거쳐야 한다. ① 기존 인스턴스 스냅샷 생성 ② `copy-db-snapshot --kms-key-id` 옵션으로 암호화된 복사본 생성 ③ 복사본에서 `restore-db-instance-from-db-snapshot`로 신규 인스턴스 복원 ④ 애플리케이션 endpoint를 새 인스턴스로 전환(또는 Route 53 weighted routing으로 점진 전환). 다운타임은 endpoint 전환 시점에만 잠시 발생. A)C)는 RDS가 지원하지 않는 동작. D) Multi-AZ는 가용성 기능이지 암호화와 무관.

---

**문제 2.** Lambda 함수가 RDS MySQL에 접속할 때 비밀번호를 코드·환경변수에 두지 않으려 한다. 한 시간에 약 100건 호출되는 저빈도 워크로드다. 가장 적절한 인증 방식은?

A) Lambda 환경변수에 비밀번호 저장 (KMS 암호화)
B) AWS Secrets Manager에 저장 + Lambda가 fetch
C) RDS IAM Database Authentication
D) Parameter Store SecureString

**정답: C**

해설: ① 비밀번호 자체를 제거한다는 보안 목표 ② 저빈도(시간당 100건 = 초당 0.03)이므로 IAM 토큰 발급 부하 무시 가능. C가 가장 깔끔. B)도 가능한 답이지만 비밀번호가 여전히 존재하고 회전 정책이 필요. A)D)는 환경변수/SSM에 평문에 가깝게 노출되므로 "비밀번호 코드/환경에 두지 않기" 요구사항 미충족. 시험에서 "Lambda + RDS + 비밀번호 회피 + 낮은 빈도"는 IAM 인증, "고빈도 Lambda + connection 안정"은 RDS Proxy + Secrets Manager가 답.

---

**문제 3.** RDS 자동 백업과 수동 스냅샷에 대한 다음 설명 중 옳은 것은?

A) 자동 백업은 다른 리전으로 직접 복사 가능하다
B) 수동 스냅샷은 DB 인스턴스 삭제 후에도 유지된다
C) 자동 백업은 무제한 보존된다
D) 수동 스냅샷은 PITR이 가능하다

**정답: B**

해설: B 정확. 수동 스냅샷은 DB 인스턴스를 삭제해도 별도로 삭제 명령을 내릴 때까지 보존된다(과금 지속). A) 자동 백업은 다른 리전 복사 불가 — 수동 스냅샷으로 변환 후 copy 필요. C) 자동 백업은 최대 35일. D) PITR(Point-in-Time Recovery)은 자동 백업의 transaction log를 사용하므로 수동 스냅샷으로는 불가능, 특정 스냅샷 시점으로만 복원 가능.

---

**문제 4.** 운영 중인 RDS PostgreSQL에서 특정 쿼리가 갑자기 느려졌고, "어떤 wait event 때문인지" 확인해야 한다. 가장 적합한 도구는?

A) CloudWatch CPUUtilization 그래프
B) Enhanced Monitoring의 프로세스 목록
C) Performance Insights
D) VPC Flow Logs

**정답: C**

해설: "쿼리가 어떤 wait event에 묶여 있는가"는 DB 엔진 내부의 정보로, Performance Insights가 정확히 이 질문을 답하기 위해 설계됐다. PI의 DBLoad 차트는 active session들을 wait event(CPU, IO:DataFileRead, Lock:tuple 등)별로 stacked area로 보여준다. A) CloudWatch는 인스턴스 수준 메트릭(CPU, IOPS)만 보여주고 어떤 쿼리 때문인지 모름. B) Enhanced Monitoring은 OS 프로세스 단위이고 DB 내부 wait event는 안 보여줌. D) Flow Logs는 네트워크 트래픽만.

---

**문제 5.** RDS MySQL에서 `binlog_format`을 `ROW`에서 `STATEMENT`로 변경하려 한다. 파라미터 그룹에서 값을 수정했는데 즉시 반영되지 않는다. 원인과 해결책은?

A) IAM 권한 부족 — `rds:ModifyDBParameterGroup` 추가
B) `binlog_format`은 static 파라미터 — DB 인스턴스 재시작 필요
C) Multi-AZ 인스턴스만 가능 — Single-AZ로는 변경 불가
D) Aurora에서만 가능

**정답: B**

해설: RDS 파라미터는 **dynamic**(즉시 반영)과 **static**(인스턴스 재시작 필요) 두 가지가 있다. `binlog_format`은 static이므로 파라미터 그룹 변경 후 `aws rds reboot-db-instance` 실행이 필요하다. 콘솔의 "Pending reboot" 표시가 이 상황을 알려준다. A)는 권한 문제가 아니라 엔진 동작 특성. C)D)는 무관.

---

**문제 6.** 한 회사가 RDS 자동 백업과 수동 스냅샷을 모두 가지고 있는 인스턴스를 삭제하려 한다. 삭제 후에도 보존되는 것은?

A) 자동 백업만
B) 수동 스냅샷만
C) 둘 다
D) 둘 다 사라짐

**정답: B**

해설: DB 인스턴스 삭제 시 ① 자동 백업은 함께 삭제(단, 삭제 시 "Final snapshot" 옵션으로 마지막 시점 수동 스냅샷 생성 가능) ② 수동 스냅샷은 그대로 유지. "삭제 직전 데이터를 영구 보존"하려면 반드시 Final snapshot을 만들거나 사전에 수동 스냅샷 생성. 자동 백업의 retain 옵션을 활성화하면(2021년 기능) 인스턴스 삭제 후에도 자동 백업이 잠시 보존되지만, 기본 동작은 함께 삭제.

---

**문제 7.** 한 의료 SaaS가 RDS에 PII(개인식별정보)를 저장하고 HIPAA 감사 요건상 "누가 어떤 쿼리를 실행했는지" 1년간 보관해야 한다. 가장 적절한 구성은?

A) Performance Insights를 활성화한다
B) Audit log를 활성화하고 CloudWatch Logs로 export → KMS 암호화된 로그 그룹에 1년 보존 설정
C) Enhanced Monitoring을 활성화한다
D) RDS Proxy 로그를 사용한다

**정답: B**

해설: 감사 요건은 DB 엔진 audit log가 정답이다. MySQL은 `MARIADB_AUDIT_PLUGIN` 옵션 그룹, PostgreSQL은 `pgaudit` extension으로 활성화. CloudWatch Logs로 export하면 KMS 암호화, IAM 기반 접근 제어, 보존 정책(1년 등) 모두 표준 기능으로 적용 가능. A) Performance Insights는 성능 분석 도구이지 감사 도구 아님. C) Enhanced Monitoring은 OS 메트릭 only. D) RDS Proxy 로그는 connection 메타데이터만 있고 쿼리 본문 audit은 아님.
