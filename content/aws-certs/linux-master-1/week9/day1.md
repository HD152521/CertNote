# Day 1 - DNS와 BIND: 이름을 주소로 바꾸는 인터넷의 전화번호부

사람은 `www.example.com`을 기억하지만 컴퓨터는 `93.184.216.34` 같은 숫자로만 통신한다. 이 둘 사이를 이어 주는 번역 시스템이 **DNS(Domain Name System)**다. 웹 브라우저에 주소를 입력하는 순간, 보이지 않는 곳에서 수많은 DNS 서버가 협력해 이름을 IP로 바꾸고, 그 결과로 우리가 페이지를 받아 본다. 오늘은 DNS의 계층 구조와 질의 흐름, 그리고 그것을 떠받치는 핵심 레코드(A, AAAA, MX, CNAME, NS, PTR, SOA)를 정밀하게 익힌다. 후반에는 리눅스의 대표 DNS 서버인 **BIND**를 직접 설정한다. `named.conf`의 구조, zone 파일의 SOA 필드, 정방향·역방향 영역을 손으로 만들어 보면 실기 단답 문제가 한눈에 들어온다.

핵심 통찰 하나를 먼저 가져가자: **DNS는 거대한 분산 데이터베이스이며, 그 위임(delegation)의 사슬을 따라 질의가 흐른다.** 루트에서 시작해 TLD를 거쳐 권한 서버에 도달하는 이 흐름을 이해하면, BIND 설정 파일의 모든 줄이 "이 위임 사슬의 어느 칸을 채우는가"로 읽힌다.

## DNS의 계층 구조 — 점(.)으로 나뉜 트리

도메인 이름은 오른쪽에서 왼쪽으로 읽는 역(逆)트리 구조다. `www.example.com.`의 맨 끝에는 보이지 않는 점(`.`)이 있는데, 이것이 바로 **루트(root)**다.

```
.                          ← 루트 (전 세계 13개 루트 서버 그룹)
└── com.                   ← TLD (Top-Level Domain)
    └── example.com.       ← 2차 도메인 (등록·관리 단위)
        └── www.example.com.  ← 호스트(서브도메인)
```

| 계층 | 이름 | 담당 |
|------|------|------|
| 루트 | `.` | 루트 네임서버 (a~m.root-servers.net) |
| TLD | `com`, `net`, `org`, `kr` | 레지스트리 (com은 Verisign) |
| 2차 | `example.com` | 도메인 소유자(권한 네임서버) |
| 호스트 | `www`, `mail` | 개별 서비스 |

각 계층은 **자신의 바로 아래 계층만 위임**한다. 루트는 "com을 관리하는 서버가 누구인지"만 알려 주고, com TLD 서버는 "example.com을 관리하는 서버가 누구인지"만 알려 준다. 실제 IP는 맨 아래 권한 서버가 쥐고 있다.

> 💡 **개념**: FQDN(Fully Qualified Domain Name, 정규화된 도메인 이름)은 맨 끝의 루트 점까지 포함한 완전한 이름이다. `www.example.com.`처럼 끝에 점이 있으면 "여기서 더 붙일 게 없는 절대 경로"라는 뜻이다. zone 파일에서 이 끝점(trailing dot) 하나가 있고 없고가 의미를 완전히 바꾸므로, 반드시 의식하고 써야 한다.

## 재귀 질의 vs 반복 질의 — 누가 끝까지 책임지는가

DNS 질의에는 두 가지 방식이 있고, 이 구분이 시험 단골이다.

| 구분 | 재귀 질의(Recursive) | 반복 질의(Iterative) |
|------|---------------------|---------------------|
| 주체 | 클라이언트 → 로컬 DNS | 로컬 DNS → 상위 서버들 |
| 책임 | 받은 서버가 최종 답까지 책임 | "다음 서버 가 봐"라고 참조만 알려 줌 |
| 결과 | 완성된 IP를 돌려줌 | NS 위임 정보를 돌려줌 |

PC가 로컬 DNS(리졸버)에게 묻는 것은 **재귀 질의**다. "끝까지 알아서 답 가져와." 그러면 로컬 DNS가 루트 → TLD → 권한 서버 순으로 **반복 질의**를 던지며 사슬을 따라간다.

```
[PC] --재귀--> [로컬 DNS]
                  |--반복--> [루트]   "com은 저쪽으로"
                  |--반복--> [com TLD] "example.com은 저쪽으로"
                  |--반복--> [권한서버] "www는 93.184.216.34"
[PC] <--최종답-- [로컬 DNS]
```

> 🔍 **더 깊이**: 로컬 DNS는 한 번 알아낸 답을 **캐시(cache)**에 보관한다. 보관 기간은 각 레코드의 **TTL(Time To Live, 초 단위)** 값이 정한다. TTL이 3600이면 한 시간 동안 다시 묻지 않고 캐시로 답한다. 그래서 도메인의 IP를 바꿔도 전 세계에 퍼지는 데 TTL만큼 시간이 걸린다. 이전 서버가 캐시에 잡아 둔 오래된 답(stale)을 우리는 "DNS 전파(propagation) 지연"이라 부른다.

## DNS 레코드 종류 — zone 파일을 채우는 부품들

zone 파일은 레코드(자원 레코드, Resource Record)의 모음이다. 실기에서 종류별 역할을 구분하는 단답이 자주 나온다.

| 레코드 | 이름 | 역할 | 예시 |
|--------|------|------|------|
| A | Address | 호스트명 → IPv4 | `www  A  93.184.216.34` |
| AAAA | quad-A | 호스트명 → IPv6 | `www  AAAA  2606:2800:220:1::` |
| CNAME | Canonical Name | 별칭 → 정식 이름 | `ftp  CNAME  www.example.com.` |
| MX | Mail eXchanger | 메일 서버 지정(우선순위 포함) | `@  MX 10 mail.example.com.` |
| NS | Name Server | 이 영역의 권한 네임서버 | `@  NS  ns1.example.com.` |
| PTR | Pointer | IP → 호스트명 (역방향) | `34  PTR  www.example.com.` |
| SOA | Start of Authority | 영역의 권한 시작·관리 정보 | (영역 맨 앞 1개) |
| TXT | Text | 임의 텍스트(SPF, 도메인 인증 등) | `@  TXT  "v=spf1 ..."` |

기억 고정 포인트:
- **A는 IPv4, AAAA는 IPv6.** 글자 수(A 1개 vs A 4개)가 비트 수 차이(32비트 vs 128비트)를 연상시킨다.
- **CNAME은 별칭.** `ftp`가 사실은 `www`라고 가리킨다. 단, CNAME이 가리키는 대상에는 또 다른 레코드를 둘 수 없고, 특히 도메인 최상위(`@`)에는 CNAME을 쓸 수 없다.
- **MX에는 우선순위 숫자**가 붙는다. 숫자가 **작을수록 우선**(먼저 시도). `MX 10`이 `MX 20`보다 먼저다.
- **PTR은 역방향 전용.** IP를 주고 이름을 받는다. 스팸 차단·로그 분석에 쓰인다.

> ⚠️ **함정**: CNAME 레코드의 대상에는 같은 이름의 다른 레코드(A, MX 등)를 함께 둘 수 없다. 또한 도메인 꼭대기(zone apex, `@`)에는 CNAME을 둘 수 없다 — 그 자리에는 반드시 SOA와 NS가 있어야 하기 때문이다. "메인 도메인 example.com을 CNAME으로"라는 보기는 틀린 함정이다.

## SOA 레코드 — 영역의 신분증과 갱신 규칙

모든 zone 파일은 정확히 하나의 SOA 레코드로 시작한다. SOA는 이 영역의 권한 서버와, 보조(secondary) 서버가 언제 갱신할지를 정한다. 다섯 개의 타이머 필드를 외우는 것이 실기 핵심이다.

```dns
$TTL 86400
@   IN  SOA  ns1.example.com. admin.example.com. (
            2026060501  ; Serial   (일련번호: 변경 시마다 증가)
            3600        ; Refresh  (보조가 변경 확인 주기, 초)
            900         ; Retry    (확인 실패 시 재시도 간격, 초)
            1209600     ; Expire   (주 서버 불통 시 보조가 데이터 폐기까지, 초)
            86400 )     ; Minimum  (음수 캐시 TTL, 초)
```

| 필드 | 의미 |
|------|------|
| MNAME | 주 권한 네임서버 (`ns1.example.com.`) |
| RNAME | 관리자 이메일. `@`를 `.`으로 바꿔 표기 (`admin.example.com.` = admin@example.com) |
| Serial | 일련번호. **보조 서버는 이 숫자가 커졌을 때만 영역을 다시 받는다** |
| Refresh | 보조가 주 서버에 "바뀐 거 있나" 묻는 주기 |
| Retry | Refresh 실패 시 다시 묻기까지의 간격 |
| Expire | 주 서버가 계속 응답 없을 때 보조가 데이터를 버리기까지의 시간 |
| Minimum | 부정 응답(없는 이름)의 캐시 보관 시간 |

> 📚 **유래·사례**: Serial은 보통 날짜 기반 `YYYYMMDDnn` 형식을 쓴다(예: 2026060501 = 2026년 6월 5일 1번째 수정). 관리자가 zone을 고치고 **Serial 증가를 깜빡하면** 보조 서버가 변경을 영원히 모른 채 옛 데이터를 서비스한다. 실제 운영 사고의 단골 원인이며, 그래서 "수정했으면 Serial부터 올려라"가 DNS 관리자의 제1수칙이다.

## BIND 설치와 named.conf 구조

리눅스의 표준 DNS 서버는 **BIND(Berkeley Internet Name Domain)**이며, 데몬 이름은 `named`다.

```bash
# 설치 (RHEL/CentOS 계열)
yum install bind bind-utils

# 설정 파일 위치
/etc/named.conf          # 메인 설정 (전역 옵션 + zone 선언)
/var/named/              # zone 파일들이 놓이는 디렉터리

# 데몬 제어
systemctl start named
systemctl enable named

# 설정 문법 검사 (저장 전 필수!)
named-checkconf                    # named.conf 검사
named-checkzone example.com /var/named/example.com.zone  # zone 검사
```

`named.conf`는 전역 옵션 블록과 영역(zone) 선언으로 이루어진다.

```text
options {
    listen-on port 53 { any; };       # 수신 인터페이스
    directory "/var/named";           # zone 파일 기준 디렉터리
    allow-query { any; };             # 질의 허용 대상
    recursion yes;                    # 재귀 질의 허용 여부
};

zone "example.com" IN {
    type master;                      # master(주) 또는 slave(보조)
    file "example.com.zone";          # 정방향 zone 파일명
};

zone "1.168.192.in-addr.arpa" IN {    # 역방향 영역
    type master;
    file "192.168.1.rev";
};
```

| 지시어 | 역할 |
|--------|------|
| `directory` | zone 파일을 찾을 기준 경로(`/var/named`) |
| `allow-query` | 질의를 허용할 클라이언트 범위 |
| `recursion` | 재귀 질의 허용 여부. 공개 서버는 보통 `no` |
| `type master/slave` | 이 서버가 영역의 주인인지 사본인지 |
| `file` | 해당 영역의 zone 파일 이름 |

> ⚠️ **함정**: `type master`는 주 서버, `type slave`는 보조 서버다. slave 영역에는 `masters { 주서버IP; };`를 함께 적어 어디서 데이터를 받아올지 알려야 한다. master/slave를 뒤바꾸거나, recursion을 외부 공개 서버에서 `yes`로 두는 것(오픈 리졸버 = DDoS 증폭에 악용됨)이 함정 보기로 나온다.

## 정방향 zone 파일 — 이름에서 IP로

`/var/named/example.com.zone`:

```dns
$TTL 86400
@   IN  SOA  ns1.example.com. admin.example.com. (
            2026060501 3600 900 1209600 86400 )

        IN  NS      ns1.example.com.
        IN  MX  10  mail.example.com.

ns1     IN  A       192.168.1.10
www     IN  A       192.168.1.20
mail    IN  A       192.168.1.30
ftp     IN  CNAME   www.example.com.
```

여기서 `@`는 영역 이름(`example.com.`) 자체를 가리키는 약어다. 이름 칸이 비어 있으면 바로 위 줄의 이름을 이어받는다.

> 💡 **개념**: zone 파일에서 이름이 점으로 끝나지 않으면(`www`), BIND가 영역 이름을 자동으로 붙여 `www.example.com.`으로 해석한다(이를 origin 부착이라 한다). 반대로 `www.example.com.`처럼 점으로 끝내면 그대로 절대 이름이 된다. CNAME·NS·MX의 대상은 **반드시 끝점을 붙여 FQDN으로** 적는 것이 안전하다 — 끝점을 빠뜨리면 `mail.example.com.example.com.`처럼 영역이 두 번 붙는 전형적 사고가 난다.

## 역방향 zone 파일 — IP에서 이름으로 (PTR)

역방향 조회는 IP를 거꾸로 뒤집은 특수 도메인 `in-addr.arpa`를 사용한다. `192.168.1.0/24`의 역방향 영역은 `1.168.192.in-addr.arpa`다(IP 옥텟을 역순으로).

`/var/named/192.168.1.rev`:

```dns
$TTL 86400
@   IN  SOA  ns1.example.com. admin.example.com. (
            2026060501 3600 900 1209600 86400 )

        IN  NS  ns1.example.com.

10      IN  PTR ns1.example.com.
20      IN  PTR www.example.com.
30      IN  PTR mail.example.com.
```

`20`은 `20.1.168.192.in-addr.arpa`를 뜻하며, 이는 IP `192.168.1.20`에 대응한다. PTR 레코드의 대상(이름)은 항상 FQDN(끝점 포함)으로 적는다.

> 🔍 **더 깊이**: 역방향 조회는 메일 서버 신뢰성 검증에 핵심이다. 받는 메일 서버는 보내는 IP의 PTR이 정상적인 이름으로 풀리는지 확인하고, PTR이 없거나 엉뚱하면 스팸으로 처리한다. IPv4는 `in-addr.arpa`, IPv6는 `ip6.arpa`를 쓴다는 차이도 함께 기억하자.

## 직접 쳐보기 — DNS 조회 도구

설정을 마쳤다면 `dig`로 검증한다. `dig`는 BIND에 포함된 표준 진단 도구다.

```bash
# A 레코드 조회
dig www.example.com A

# MX 레코드 조회
dig example.com MX

# 특정 DNS 서버에게 직접 묻기
dig @192.168.1.10 www.example.com

# 역방향 조회 (-x)
dig -x 192.168.1.20

# 추적 모드: 루트부터 권한 서버까지 사슬을 보여 줌
dig +trace www.example.com

# 간단 조회
nslookup www.example.com
host www.example.com
```

`dig +trace`를 실행하면 앞에서 배운 반복 질의 흐름(루트 → TLD → 권한 서버)이 실제로 화면에 펼쳐진다. 이론과 실물을 잇는 가장 좋은 실습이다.

## 마무리

오늘 우리는 DNS를 "이름→주소 변환"이라는 한 줄 정의에서 출발해, 그것을 떠받치는 계층 구조와 질의 흐름, 그리고 zone 파일을 채우는 레코드들까지 내려왔다. 기억할 뼈대는 이렇다. **DNS는 루트에서 권한 서버로 이어지는 위임의 사슬이고, 각 레코드는 그 사슬의 특정 칸을 채운다.** A/AAAA는 정방향 주소, PTR은 역방향 이름, NS는 위임, MX는 메일, CNAME은 별칭, 그리고 SOA는 영역의 신분증이자 갱신 시계다. BIND에서는 `named.conf`가 어떤 영역을 어떤 파일로 서비스할지 선언하고, zone 파일이 실제 레코드를 담는다. 끝점(trailing dot)과 Serial 증가, 두 가지만 몸에 배도 DNS 설정 실수의 절반은 사라진다. 내일은 IP를 자동 분배하는 DHCP와 시간을 맞추는 NTP로, 네트워크 기반 서비스의 두 번째 기둥을 세운다.

## 📝 연습 문제

**문제 1.** 호스트명을 IPv6 주소로 매핑하는 DNS 레코드는?

A) A
B) AAAA
C) CNAME
D) PTR

**정답: B**
해설: A는 IPv4(32비트), AAAA(quad-A)는 IPv6(128비트) 주소를 매핑한다. CNAME은 별칭, PTR은 IP→이름 역방향 레코드다.

---

**문제 2.** SOA 레코드에서 보조(slave) 서버가 영역 데이터를 다시 받아올지 판단하는 기준이 되는 필드는?

A) Refresh
B) Retry
C) Serial
D) Expire

**정답: C**
해설: 보조 서버는 주 서버의 Serial(일련번호)이 자신이 가진 값보다 커졌을 때만 영역을 다시 전송받는다. zone을 수정하고 Serial을 올리지 않으면 변경이 전파되지 않는다. Refresh는 확인 주기, Retry는 실패 시 재시도 간격, Expire는 데이터 폐기 한계다.

---

**문제 3.** PC가 로컬 DNS 서버에게 "끝까지 답을 알아내 달라"고 요청하는 질의 방식은?

A) 반복 질의
B) 재귀 질의
C) 권한 질의
D) 위임 질의

**정답: B**
해설: 클라이언트가 로컬 DNS에게 최종 답까지 책임지도록 요청하는 것이 재귀(Recursive) 질의다. 로컬 DNS가 루트·TLD·권한 서버를 차례로 묻는 것은 반복(Iterative) 질의다.

---

**문제 4.** 메일 서버를 지정하는 MX 레코드 `@ MX 10 mail.example.com.`과 `@ MX 20 backup.example.com.`이 있을 때, 메일이 먼저 시도되는 서버는?

A) backup.example.com (숫자가 큰 쪽 우선)
B) mail.example.com (숫자가 작은 쪽 우선)
C) 두 서버에 동시에 전송
D) 알파벳 순서로 mail 먼저

**정답: B**
해설: MX 레코드의 우선순위 숫자는 작을수록 우선이다. 따라서 10인 mail.example.com을 먼저 시도하고, 실패 시 20인 backup으로 넘어간다.

---

**문제 5.** BIND의 named.conf에서 이 서버가 영역의 원본을 보유한 주 서버임을 나타내는 설정은?

A) `type master;`
B) `type slave;`
C) `type forward;`
D) `type hint;`

**정답: A**
해설: `type master`는 영역의 원본 데이터를 가진 주 서버, `type slave`는 주 서버로부터 복제받는 보조 서버다. slave에는 `masters { IP; };`로 원본 위치를 함께 지정해야 한다.

---

**문제 6.** 192.168.1.20 IP에 대한 역방향(PTR) 영역의 이름으로 올바른 것은?

A) 192.168.1.in-addr.arpa
B) 1.168.192.in-addr.arpa
C) 20.1.168.192.in-addr.arpa
D) 192.168.1.20.ip6.arpa

**정답: B**
해설: IPv4 역방향 영역은 네트워크 옥텟을 역순으로 나열하고 `in-addr.arpa`를 붙인다. /24 네트워크 192.168.1.0의 영역명은 `1.168.192.in-addr.arpa`이며, 그 안의 호스트 20이 PTR 레코드 `20`으로 IP 192.168.1.20을 가리킨다. ip6.arpa는 IPv6용이다.

---

**문제 7.** zone 파일에서 `www  IN  A  192.168.1.20` 같이 이름을 점 없이 적었을 때 BIND가 자동으로 수행하는 처리는?

A) 무시하고 오류를 발생시킨다
B) 영역 이름(origin)을 뒤에 붙여 FQDN으로 해석한다
C) 루트 도메인으로 간주한다
D) 임의의 IP로 매핑한다

**정답: B**
해설: 이름이 끝점으로 끝나지 않으면 BIND는 origin(영역 이름)을 자동으로 부착한다. 따라서 `www`는 `www.example.com.`이 된다. 반대로 끝점을 붙이면 절대 이름으로 그대로 쓰인다. 이 끝점 처리가 zone 파일 작성의 핵심 함정이다.

---
