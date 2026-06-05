# Day 5 - Week 9 종합 복습: 이름·주소·시간·웹을 한 장으로

이번 주는 리눅스 **네트워크 서비스**의 5대 기둥을 세웠다. Day 1에서 이름을 주소로 바꾸는 DNS와 BIND를, Day 2에서 주소를 나눠 주는 DHCP와 시간을 맞추는 NTP/chrony를, Day 3에서 콘텐츠를 서비스하는 Apache를, Day 4에서 이벤트 기반 웹 서버 Nginx와 리버스 프록시를 다뤘다. 오늘은 이 다섯 조각을 하나의 그림으로 잇고, 각 서비스의 핵심 설정 파일과 지시어를 표 한 장으로 압축한 뒤, 실기 단골 함정을 복습하고 종합 문제로 점검한다.

핵심 통찰 하나만 가져가자: **모든 네트워크 서비스는 "설정 파일 어디에, 어떤 지시어로, 무엇을 선언하는가"로 환원된다.** DNS는 zone 파일에 레코드를, DHCP는 dhcpd.conf에 임대 풀을, NTP는 chrony.conf에 시간 소스를, 웹 서버는 httpd.conf/nginx.conf에 문서 루트와 가상 호스트를 선언한다. 이 매핑만 잡으면 어떤 변형 문제도 풀린다.

## 5대 서비스 한 표로 — 패키지·데몬·설정·포트

| 서비스 | 패키지 | 데몬 | 핵심 설정 파일 | 포트 |
|--------|--------|------|----------------|------|
| DNS | bind | named | /etc/named.conf, /var/named/*.zone | 53 (UDP/TCP) |
| DHCP | dhcp-server | dhcpd | /etc/dhcp/dhcpd.conf | 67/68 (UDP) |
| NTP | chrony | chronyd | /etc/chrony.conf | 123 (UDP) |
| Apache | httpd | httpd | /etc/httpd/conf/httpd.conf | 80/443 |
| Nginx | nginx | nginx | /etc/nginx/nginx.conf | 80/443 |

기억 고정 포인트:
- **포트 번호 즉답**: DNS 53, DHCP 67/68, NTP 123, HTTP 80, HTTPS 443.
- RHEL 계열에서 Apache의 패키지·데몬은 모두 `httpd`, DNS는 `named`(패키지는 bind).
- 설정 변경 후 검사 도구: `named-checkconf`(DNS), `httpd -t`(Apache), `nginx -t`(Nginx).

> 💡 **개념**: 모든 서비스는 "설치 → 설정 파일 수정 → 문법 검사 → 데몬 시작/재적용 → 상태 확인"의 같은 리듬을 탄다. 서비스마다 명령만 다를 뿐 흐름은 동일하다. 이 리듬을 몸에 익히면 처음 보는 서비스도 같은 방식으로 다룰 수 있다.

## DNS 복습 — 레코드와 zone 파일

| 레코드 | 역할 |
|--------|------|
| A / AAAA | 이름→IPv4 / 이름→IPv6 |
| CNAME | 별칭→정식 이름 |
| MX | 메일 서버(우선순위 숫자 작을수록 우선) |
| NS | 영역의 권한 네임서버 |
| PTR | IP→이름(역방향, in-addr.arpa) |
| SOA | 영역 권한 시작·갱신 시계(영역당 1개) |

SOA 5타이머 순서: **Serial(일련번호) → Refresh(확인 주기) → Retry(재시도) → Expire(폐기 한계) → Minimum(음수 캐시)**.

> ⚠️ **함정 복습**: zone 파일에서 이름이 점으로 끝나지 않으면 영역 이름(origin)이 자동 부착된다 — CNAME·NS·MX 대상은 끝점(FQDN)을 붙여야 안전하다. zone을 수정하면 **Serial을 반드시 증가**시켜야 보조 서버가 변경을 받는다. 도메인 꼭대기(@)에는 CNAME을 둘 수 없다.

## DHCP·NTP 복습 — 주소와 시간

DHCP 4단계는 **DORA**: Discover(탐색) → Offer(제안) → Request(수락) → Ack(확정). 첫 DISCOVER는 IP가 없어 브로드캐스트로 나가며, 라우터 너머는 **릴레이**가 필요하다.

| dhcpd.conf 지시어 | 역할 |
|-------------------|------|
| `range` | 동적 배분 IP 풀 |
| `option routers` | 기본 게이트웨이 |
| `option domain-name-servers` | DNS 서버 |
| `hardware ethernet` + `fixed-address` | MAC 기반 고정 IP 예약 |

NTP stratum은 **숫자가 작을수록 정확**(0=기준 시계, 1=1차 서버, 16=미동기). chrony는 `chrony.conf`의 `server`/`pool`로 소스를, `allow`로 클라이언트를 정하고, `chronyc sources`·`chronyc tracking`·`timedatectl`로 상태를 본다.

> ⚠️ **함정 복습**: DHCP 미동기 신호는 169.254.x.x(APIPA)다. NTP stratum 0은 미동기가 아니라 기준 시계 자체이며, 16이 미동기다. dhcpd.conf 고정 IP는 동적 `range` 밖에 두는 것이 안전하다.

## 웹 서버 복습 — Apache와 Nginx 대응표

| 개념 | Apache | Nginx |
|------|--------|-------|
| 수신 포트 | `Listen` | `listen` |
| 가상 호스트 이름 | `ServerName` | `server_name` |
| 문서 루트 | `DocumentRoot` | `root` |
| 기본 문서 | `DirectoryIndex` | `index` |
| 가상 호스트 블록 | `<VirtualHost>` | `server { }` |
| 경로별 처리 | `<Directory>`/`<Location>` | `location { }` |
| 문법 검사 | `httpd -t` | `nginx -t` |
| 디렉터리 분산 설정 | `.htaccess` 지원 | 미지원(중앙 집중) |

가상 호스트: **이름 기반**(Host 헤더로 구분, IP 1개로 다수 사이트) vs **IP 기반**(IP로 구분, 사이트마다 IP). HTTP/1.1의 Host 헤더 의무화로 이름 기반이 표준이 됐다.

> 🔍 **더 깊이**: Apache는 연결당 프로세스(prefork)로 안정적이나 메모리를 많이 쓰고, Nginx는 이벤트 기반 비동기로 동시 접속·정적 서빙에 강하다. 실무에서는 Nginx를 앞단(리버스 프록시·정적·TLS)에, Apache나 앱 서버를 뒤편에 두는 조합이 흔하다. 리버스 프록시는 `upstream`+`proxy_pass`로 구성하며, 정방향 프록시(클라이언트 대행)와 달리 서버 앞단에서 요청을 분배한다.

## 설정 검사·상태 확인 명령 총정리

```bash
# DNS
named-checkconf                         # named.conf 문법
named-checkzone example.com zonefile    # zone 문법
dig www.example.com / dig -x 1.2.3.4    # 정/역방향 조회

# DHCP
systemctl status dhcpd
cat /var/lib/dhcpd/dhcpd.leases         # 임대 현황

# NTP/chrony
chronyc sources                         # 시간 소스 목록
chronyc tracking                        # 동기화 정확도·stratum
timedatectl                             # 시간·타임존·NTP 동기 여부

# Apache
httpd -t                                # 문법 검사
httpd -S                                # 가상 호스트 목록
httpd -M                                # 적재 모듈

# Nginx
nginx -t                                # 문법 검사
nginx -s reload                         # 무중단 재적용
```

> 📚 **유래·사례**: 이번 주의 서비스들은 인터넷 인프라의 역사 그 자체다. DNS(1983)는 hosts 파일의 한계를 분산 시스템으로 풀었고, DHCP(1993)는 BOOTP를 확장해 IP 자동화를 완성했으며, NTP(1985)는 분산 시스템의 시계를 맞췄고, Apache(1995)는 웹을 대중화했으며, Nginx(2004)는 C10K 문제를 풀어 대규모 서비스를 가능케 했다. 오늘날 어떤 웹 요청도 이 다섯을 거치지 않고는 완성되지 않는다.

## 통합 시나리오 — 한 요청의 여정

사용자가 브라우저에 `www.example.com`을 친 뒤 페이지를 받기까지, 이번 주 서비스들이 어떻게 협력하는지 한 줄로 잇자.

```
1. (DHCP) PC가 부팅 시 IP·게이트웨이·DNS 서버를 임대받음 (DORA)
2. (DNS)  로컬 DNS가 www.example.com을 BIND 권한 서버에 물어 IP 획득
3. (NTP)  서버들은 chrony로 시계를 맞춰 인증서·로그 일관성 유지
4. (Nginx) 앞단 Nginx가 요청을 받아 정적 파일은 직접, 동적은 백엔드로 프록시
5. (Apache) 백엔드 Apache가 동적 콘텐츠를 생성해 응답
```

이 다섯 단계가 매끄럽게 맞물려야 사용자는 페이지 하나를 본다. 어느 한 칸이 끊기면(DHCP 실패=IP 없음, DNS 실패=이름 못 풂, NTP 어긋남=인증서 오류, 웹 서버 다운=503) 전체가 멈춘다. 네트워크 서비스를 "사슬"로 이해하는 것이 이번 주의 결론이다.

## 마무리

Week 9는 리눅스가 네트워크 위에서 실제로 제공하는 서비스들을 한 줄에 꿰었다. **이름(DNS), 주소(DHCP), 시간(NTP), 콘텐츠(Apache·Nginx)** — 이 네 가지가 인터넷 서비스의 토대다. 각 서비스는 고유한 설정 파일과 지시어를 갖지만, "설치→설정→검사→시작→확인"이라는 같은 리듬으로 다룬다. DNS는 레코드와 SOA·끝점, DHCP는 DORA와 range·릴레이, NTP는 stratum과 chronyc, 웹 서버는 문서 루트·가상 호스트·리버스 프록시가 핵심이다. 포트 번호(53·67/68·123·80·443)와 검사 명령(named-checkconf·httpd -t·nginx -t)은 즉답할 수 있어야 한다. 아래 종합 문제로 이번 주를 단단히 마무리하자.

## 📝 연습 문제

**문제 1.** DNS 서버 BIND의 데몬 이름과 사용 포트로 올바른 것은?

A) bind, 80번
B) named, 53번
C) dhcpd, 67번
D) httpd, 443번

**정답: B**
해설: BIND의 데몬 이름은 named, DNS 포트는 53번(UDP/TCP)이다. 패키지명은 bind지만 실행 데몬은 named다. 67은 DHCP, 80/443은 웹이다.

---

**문제 2.** SOA 레코드의 다섯 타이머 필드 순서로 올바른 것은?

A) Refresh → Serial → Retry → Minimum → Expire
B) Serial → Refresh → Retry → Expire → Minimum
C) Serial → Retry → Refresh → Minimum → Expire
D) Expire → Serial → Refresh → Retry → Minimum

**정답: B**
해설: SOA 필드 순서는 Serial(일련번호) → Refresh(확인 주기) → Retry(재시도) → Expire(폐기 한계) → Minimum(음수 캐시 TTL)이다. Serial이 가장 앞이며, 수정 시 이 값을 올려야 보조 서버가 갱신한다.

---

**문제 3.** DHCP의 IP 할당 4단계를 순서대로 나열한 것은?

A) Offer → Discover → Ack → Request
B) Discover → Offer → Request → Ack
C) Request → Offer → Discover → Ack
D) Discover → Request → Offer → Ack

**정답: B**
해설: DORA 순서 — Discover(탐색) → Offer(제안) → Request(수락) → Ack(확정)다. 첫 DISCOVER는 IP가 없어 브로드캐스트로 전송된다.

---

**문제 4.** NTP의 stratum에 대한 설명으로 옳은 것은?

A) stratum 0은 미동기 상태다
B) stratum 숫자가 클수록 기준 시계에 가깝다
C) stratum 1은 기준 시계에 직접 연결된 1차 서버다
D) stratum은 chrony에서만 쓰는 개념이다

**정답: C**
해설: stratum 0은 기준 시계 자체(GPS·원자시계), stratum 1은 거기 직접 연결된 1차 서버다. 숫자가 작을수록 정확하며, 16이 미동기를 뜻한다. stratum은 NTP 표준 개념이다.

---

**문제 5.** dhcpd.conf에서 특정 MAC 주소를 가진 장비에 항상 같은 IP를 할당할 때 사용하는 지시어 조합은?

A) `range` + `option routers`
B) `hardware ethernet` + `fixed-address`
C) `default-lease-time` + `max-lease-time`
D) `subnet` + `netmask`

**정답: B**
해설: `host` 블록 안에서 `hardware ethernet`으로 MAC을 식별하고 `fixed-address`로 고정 IP를 지정한다. `range`는 동적 풀, lease-time은 임대 기간, subnet/netmask는 네트워크 정의다.

---

**문제 6.** Apache의 DocumentRoot에 해당하는 Nginx 지시어는?

A) `listen`
B) `server_name`
C) `root`
D) `proxy_pass`

**정답: C**
해설: Nginx의 `root`가 문서 루트로 Apache의 DocumentRoot에 대응한다. `listen`=Listen(포트), `server_name`=ServerName(도메인), `proxy_pass`는 리버스 프록시 전달 지시어다.

---

**문제 7.** 하나의 IP 주소로 여러 도메인을 서비스하는 가상 호스트 방식과, Apache가 사이트를 구분하는 기준이 옳게 짝지어진 것은?

A) IP 기반 — Host 헤더
B) 이름 기반 — HTTP Host 헤더
C) 이름 기반 — 클라이언트 MAC
D) IP 기반 — 포트 번호

**정답: B**
해설: 이름 기반 가상 호스트는 IP 하나로 여러 도메인을 서비스하며, HTTP 요청의 Host 헤더로 사이트를 구분한다. HTTP/1.1의 Host 헤더 의무화로 가능해졌다. IP 기반은 IP로 구분하며 사이트마다 IP가 필요하다.

---

**문제 8.** Nginx에서 요청을 뒤편 백엔드 서버로 전달하고, 여러 백엔드에 부하를 분산하는 데 쓰는 지시어 조합은?

A) `root` + `index`
B) `upstream` + `proxy_pass`
C) `server_name` + `listen`
D) `gzip` + `sendfile`

**정답: B**
해설: `upstream`으로 백엔드 서버 그룹을 정의하고 `proxy_pass http://그룹명;`으로 요청을 전달한다. 이것이 리버스 프록시·부하 분산의 핵심 구성이다. root/index는 정적 서빙, gzip/sendfile은 성능 튜닝이다.

---

**문제 9.** 다음 중 각 서비스의 설정 문법 검사 명령이 잘못 짝지어진 것은?

A) DNS — `named-checkconf`
B) Apache — `httpd -t`
C) Nginx — `nginx -t`
D) DHCP — `chronyc sources`

**정답: D**
해설: `chronyc sources`는 NTP(chrony)의 시간 소스 상태 확인 명령이지 DHCP 검사가 아니다. DHCP는 `dhcpd -t`나 `systemctl status dhcpd`로 점검한다. 나머지는 올바르게 짝지어졌다.

---

**문제 10.** 클라이언트가 DHCP 서버를 찾지 못해 169.254.x.x 대역의 IP를 가졌다. 이 상태에 대한 올바른 설명은?

A) 정상적으로 DHCP에서 사설 IP를 받은 것이다
B) APIPA(링크 로컬) 주소로, DHCP 서버를 찾지 못했다는 신호다
C) 루프백 주소로, 네트워크가 정상이다
D) 공인 IP를 받은 것이다

**정답: B**
해설: 169.254.0.0/16은 APIPA(자동 사설 IP 할당, 링크 로컬) 대역으로, DHCP 응답을 받지 못했을 때 자동 할당된다. 즉 "DHCP 서버를 못 찾음"의 신호다. 127은 루프백, 사설 대역은 10/172.16-31/192.168이다.

---

**문제 11.** Nginx와 Apache의 차이로 옳지 않은 것은?

A) Nginx는 이벤트 기반 비동기로 다수 연결을 처리한다
B) Apache는 .htaccess로 디렉터리별 분산 설정을 지원한다
C) Nginx도 .htaccess를 기본 지원해 디렉터리별 설정이 가능하다
D) Apache는 전통적으로 연결당 프로세스/스레드를 사용한다

**정답: C**
해설: Nginx는 .htaccess를 지원하지 않으며 모든 설정을 중앙에서 관리한다(매 요청마다 디렉터리를 뒤지지 않아 더 빠름). 따라서 C가 틀린 설명이다. 나머지는 모두 옳다.

---

**문제 12.** 사용자가 웹 페이지를 요청할 때 이번 주 서비스들의 협력 순서로 가장 적절한 것은?

A) DNS로 IP를 받은 뒤 DHCP로 이름을 푼다
B) DHCP로 IP 획득 → DNS로 도메인을 IP로 변환 → 웹 서버가 응답
C) 웹 서버 응답 → DNS 조회 → DHCP 임대
D) NTP로 시간을 맞춘 뒤에만 DNS가 동작한다

**정답: B**
해설: PC는 먼저 DHCP로 IP·DNS 서버 정보를 임대받고(주소 확보), DNS로 도메인을 IP로 변환한 뒤(이름 해석), 그 IP의 웹 서버(Nginx/Apache)에 접속해 응답을 받는다. NTP는 서버 간 시계 일관성을 위한 보조 인프라로 DNS 동작의 전제 조건은 아니다.

---
