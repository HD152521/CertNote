# Day 2 - 패키지 관리 (2): DEB·APT와 소스 설치

## 📌 핵심 정리

- 데비안 계열의 저수준 도구는 **`dpkg`**, 고수준 도구는 **`apt`** 다.
- **`apt update`는 목록 갱신, `apt upgrade`는 실제 업그레이드**다. 이름이 헷갈리지만 다른 일을 한다.
- 소스 설치는 **압축 해제 → `./configure` → `make` → `make install`** 네 단계다.
- **`tar`는 묶기만 하고 압축은 안 한다.** 압축은 **`-z`(gzip) · `-j`(bzip2) · `-J`(xz)** 옵션이 맡는다.
- 압축률은 대체로 **`xz` > `bzip2` > `gzip`**, 속도는 그 반대다.

## dpkg — 저수준 도구

```bash
dpkg -i 패키지.deb        # 설치
dpkg -r 패키지명          # 삭제 (설정 파일은 남김)
dpkg -P 패키지명          # 완전 삭제 (purge — 설정까지)
dpkg -l                   # 설치된 패키지 목록
dpkg -L 패키지명          # 그 패키지가 설치한 파일 목록
dpkg -S /경로/파일        # 이 파일이 어느 패키지 것인가
```

| 옵션 | 뜻 | rpm 의 대응 |
|------|-----|-----------|
| **`-i`** | 설치 | `-i` |
| **`-r`** | 삭제 (설정 유지) | `-e` |
| **`-P`** | **완전 삭제** | — |
| **`-l`** | 목록 | `-qa` |
| `-L` | 파일 목록 | `-ql` |
| `-S` | 파일의 소속 찾기 | `-qf` |

- **`-r`과 `-P`의 차이** — `-r`(remove)은 설정 파일을 남기고, `-P`(purge)는 설정까지 지운다.
- `dpkg`도 **의존성을 해결하지 않는다.** 저수준 도구의 공통 성질이다.
- `rpm`과 마찬가지로 **설치(`-i`)에는 `.deb` 파일을, 삭제·조회에는 패키지 이름을** 준다.

### `dpkg -l` 의 앞 두 글자

```text
$ dpkg -l | grep -E 'apache2-bin|vsftpd'
ii  apache2-bin    2.4.52-1ubuntu4    amd64    Apache HTTP Server (modules and other binary files)
rc  vsftpd         3.0.5-0ubuntu1     amd64    lightweight, efficient FTP server written for security
```

| 표시 | 뜻 |
|------|-----|
| **`ii`** | **정상 설치**된 상태 |
| **`rc`** | **삭제했지만 설정 파일이 남은** 상태 (removed, config-files) |
| 줄이 없음 | 설치된 적이 없거나 `-P`로 완전히 지웠다 |

- **`rc`가 바로 `-r`과 `-P`의 차이가 눈에 보이는 자리**다. `dpkg -r vsftpd` 뒤에는 `rc`로 남고, `dpkg -P vsftpd` 를 하면 목록에서 사라진다.
- 설정을 남기는 이유는 **다시 설치했을 때 예전 설정을 그대로 쓰기 위해서**다. 깨끗이 새로 시작하려면 purge 한다.

### 패키지 파일 이름 — RPM과 다른 점

```text
   apache2 _ 2.4.52-1ubuntu4 _ amd64 . deb
      │            │             │
      │            │             └── 아키텍처
      │            └──────────────── 버전-리비전
      └───────────────────────────── 패키지 이름
```

| 구분 | RPM | DEB |
|------|-----|-----|
| 구분 기호 | 하이픈과 점 (`이름-버전-릴리스.아키텍처`) | **밑줄** (`이름_버전_아키텍처`) |
| 64비트 인텔·AMD | `x86_64` | **`amd64`** |
| 아키텍처 무관 | `noarch` | **`all`** |

- 같은 프로그램이라도 **배포판마다 패키지 이름이 다를 수 있다.** 아파치 웹 서버는 레드햇 계열에서 `httpd`, 데비안 계열에서 **`apache2`** 다. 아래 `apt` 예시의 `httpd`는 어제와 견주기 쉽게 이름을 맞춘 것이고, 실제 우분투에서는 `apt install apache2` 로 설치한다.

### dpkg가 의존성에 막히면

| 방법 | 명령 |
|------|------|
| 설치하다 멈춘 것을 `apt`로 수습 | `apt install -f` (`--fix-broken`) — 모자란 의존 패키지를 받아 마무리한다 |
| 처음부터 `apt`로 파일을 설치 | `apt install ./패키지.deb` — 앞에 **`./`** 를 붙여 파일임을 알린다 |

## apt — 고수준 도구

```bash
apt update                 # 패키지 목록 갱신 (설치는 안 한다!)
apt upgrade                # 설치된 패키지 업그레이드
apt install httpd          # 설치
apt remove httpd           # 삭제
apt purge httpd            # 설정까지 삭제
apt search 키워드          # 검색
apt show httpd             # 정보
apt list --installed       # 설치 목록
```

> ⚠️ **`update`와 `upgrade`를 반드시 구분한다.**
> **`apt update`** 는 저장소에서 **"어떤 패키지의 어떤 버전이 있는지" 목록만 새로 받아온다.** 실제로 무언가를 설치하거나 바꾸지 않는다.
> **`apt upgrade`** 가 그 목록을 보고 **실제로 업그레이드**한다.
> 그래서 항상 **`apt update && apt upgrade`** 순서로 쓴다.

| 명령 | 하는 일 |
|------|--------|
| **`apt update`** | **목록만 갱신** |
| **`apt upgrade`** | **실제 업그레이드** |
| `apt-get` | apt 의 예전 명령. 지금도 동작한다 |
| `aptitude` | 텍스트 화면을 갖춘 관리 도구 |

- 저장소 주소는 **`/etc/apt/sources.list`** 와 `/etc/apt/sources.list.d/` 에 있다.
- RPM 계열의 `/etc/yum.repos.d/` 와 같은 자리다.

### `apt update`가 따로 있는 이유

```text
   저장소 서버                          내 컴퓨터
   패키지 목록  ── apt update ───────►  목록 사본 (/var/lib/apt/lists/)
   패키지 파일  ── apt upgrade ──────►  실제 설치 · 갱신
                  apt install
```

- `apt`는 **내 컴퓨터에 받아 둔 목록 사본**을 보고 일한다. 사본이 낡으면 새 버전이 나온 줄 모르고, 이미 저장소에서 사라진 옛 파일을 받으려다 실패한다.
- 그래서 **설치 전에도 `apt update`를 먼저** 한다. 새로 설치한 우분투에서 `apt install`이 "패키지를 찾을 수 없다"고 하면 대개 목록을 한 번도 받지 않은 것이다.
- **`yum`에는 이 단계가 따로 없다.** `yum`은 목록이 낡았으면 실행할 때 알아서 새로 받으며, **`yum update`는 곧바로 실제 업그레이드**를 한다. 같은 `update`라는 단어가 두 계열에서 **다른 일**을 한다.

| 명령 | 목록 갱신 | 패키지 변경 |
|------|---------|-----------|
| `apt update` | **한다** | 안 한다 |
| `apt upgrade` | 안 한다 | **한다** |
| `yum check-update` | 필요하면 자동으로 | 안 한다 |
| `yum update` | 필요하면 자동으로 | **한다** |

### 나머지 apt 명령

| 명령 | 하는 일 |
|------|--------|
| `apt full-upgrade` (`apt-get dist-upgrade`) | 업그레이드하되, 필요하면 **기존 패키지를 지우는 것까지** 허용 |
| `apt autoremove` | 의존성 때문에 딸려 왔다가 **이제 쓸모없어진 패키지** 정리 |
| `apt clean` | 내려받은 `.deb` 캐시(`/var/cache/apt/archives`) 비우기 |
| `apt-cache search 키워드` | 검색 — `apt search`의 예전 형태 |
| `apt-cache show 패키지명` | 정보 — `apt show`의 예전 형태 |

- 예전에는 **설치는 `apt-get`, 검색은 `apt-cache`** 로 명령이 나뉘어 있었다. `apt`는 자주 쓰는 기능을 **한 명령으로 모은 것**이다.
- `apt remove`와 `apt purge`의 차이는 `dpkg -r`과 `-P`의 차이와 **똑같다** — 설정 파일을 남기느냐 지우느냐다.

### sources.list 한 줄 읽기

```text
   deb  http://archive.ubuntu.com/ubuntu  jammy  main restricted
    │                 │                     │         │
    │                 │                     │         └── 구성 요소(영역)
    │                 │                     └──────────── 배포판 버전의 코드명
    │                 └────────────────────────────────── 저장소 주소
    └──────────────────────────────────────────────────── deb = 바이너리, deb-src = 소스
```

- 줄을 고친 뒤에는 **`apt update`를 해야** 새 저장소의 목록이 들어온다.
- 최근 배포판은 같은 내용을 다른 형식의 파일(`/etc/apt/sources.list.d/` 아래 `.sources`)에 담기도 한다. 시험에서 묻는 위치는 **`/etc/apt/sources.list`** 다.

### 두 계열 대응표

| 하는 일 | **RPM 계열** | **DEB 계열** |
|--------|------------|------------|
| 저수준 설치 | `rpm -i` | `dpkg -i` |
| 저수준 삭제 | `rpm -e` | `dpkg -r` |
| 저수준 목록 | `rpm -qa` | `dpkg -l` |
| 고수준 설치 | `yum install` | `apt install` |
| 고수준 삭제 | `yum remove` | `apt remove` |
| 저장소 설정 | `/etc/yum.repos.d/` | `/etc/apt/sources.list` |

## 압축과 묶기

**묶는 것(archive)과 압축(compress)은 다른 일**이다.

| 명령 | 하는 일 | 확장자 |
|------|--------|-------|
| **`tar`** | **여러 파일을 하나로 묶기** | `.tar` |
| **`gzip`** / `gunzip` | 압축 / 해제 | **`.gz`** |
| **`bzip2`** / `bunzip2` | 압축 / 해제 | **`.bz2`** |
| **`xz`** / `unxz` | 압축 / 해제 | **`.xz`** |
| `compress` | 예전 방식 | `.Z` |

```text
   압축률   xz  >  bzip2  >  gzip
   속도     gzip  >  bzip2  >  xz
```

- **`tar` 자체는 압축하지 않는다.** 묶기만 한다. 그래서 `.tar.gz` 처럼 두 단계를 거친 이름이 흔하다.

### 압축 도구는 파일 하나만 다룬다

```text
$ ls
access.log  error.log
$ gzip access.log
$ ls
access.log.gz  error.log
$ gunzip access.log.gz
$ ls
access.log  error.log
```

- **`gzip`은 원본을 지우고 `.gz`로 바꿔 놓는다.** 원본과 압축본이 함께 남지 않는다. `bzip2`·`xz`도 같다.
- 세 도구 모두 **파일을 하나씩** 압축할 뿐 여러 파일을 한 덩어리로 만들지 못한다. 디렉터리를 통째로 압축하려면 **먼저 `tar`로 묶어야** 하는 이유다.

| 하는 일 | gzip | bzip2 | xz |
|--------|------|-------|-----|
| 압축 | `gzip 파일` | `bzip2 파일` | `xz 파일` |
| 해제 | `gunzip` · `gzip -d` | `bunzip2` · `bzip2 -d` | `unxz` · `xz -d` |
| 풀지 않고 내용 보기 | `zcat` | `bzcat` | `xzcat` |
| `tar` 옵션 | `-z` | `-j` | `-J` |
| 흔한 묶음 확장자 | `.tar.gz` · **`.tgz`** | `.tar.bz2` | `.tar.xz` |

- **해제는 셋 다 `-d`(decompress)** 로도 된다. `gunzip`은 `gzip -d`와 같은 일을 한다.
- **`zip`·`unzip`** 은 계열이 다르다. **묶기와 압축을 한 번에** 하며 윈도와 주고받을 때 쓴다(`.zip`).

### tar 옵션

```bash
tar -cvf 묶음.tar 폴더/        # 묶기 (create)
tar -xvf 묶음.tar              # 풀기 (extract)
tar -tvf 묶음.tar              # 목록만 보기 (list)
tar -zcvf 묶음.tar.gz 폴더/    # 묶고 gzip 압축
tar -zxvf 묶음.tar.gz          # gzip 해제하고 풀기
tar -jxvf 묶음.tar.bz2         # bzip2
tar -Jxvf 묶음.tar.xz          # xz
```

| 옵션 | 뜻 |
|------|-----|
| **`-c`** | **묶기** (create) |
| **`-x`** | **풀기** (extract) |
| `-t` | 내용 **목록만** (list) |
| **`-f`** | **파일 이름 지정** — 거의 항상 필요 |
| `-v` | 과정 표시 (verbose) |
| **`-z`** | **gzip** |
| **`-j`** | **bzip2** |
| **`-J`** | **xz** (대문자) |

> **`-c`(묶기)와 `-x`(풀기)** 를 바꾸면 원본이 덮어써질 수 있다. **`-z`는 소문자 gzip, `-j`는 bzip2, `-J`는 대문자 xz** 라는 짝도 그대로 나온다.

### 옵션 글자를 읽는 순서

```text
   tar  -z c v f  backup.tar.gz  /home/alice
         │ │ │ │        │             │
         │ │ │ │        │             └── 묶을 대상
         │ │ │ │        └──────────────── -f 가 받는 파일 이름
         │ │ │ └── f : 다음에 오는 것이 아카이브 파일 이름
         │ │ └──── v : 처리하는 파일을 화면에 표시
         │ └────── c : 동작 (c · x · t 중 하나만)
         └──────── z : 압축 방식 (z · j · J 중 하나)
```

- **동작은 `c`·`x`·`t` 중 정확히 하나**를 고른다. 여기에 압축 방식 하나와 `v`·`f`를 붙이는 구조다.
- **`f`는 맨 뒤에 둔다.** `f` 바로 다음 것이 파일 이름으로 해석되기 때문이다. `tar -cfv a.tar dir` 처럼 쓰면 `v`라는 이름의 아카이브를 만들려 든다.
- 하이픈 없이 `tar zxvf 파일` 로 써도 같은 뜻이다. 두 표기가 모두 보기에 나온다.

| 옵션 | 뜻 |
|------|-----|
| **`-C 디렉터리`** | **풀어 놓을 위치**를 지정 (대문자). 없으면 현재 디렉터리에 푼다 |
| `-p` | 원래의 **권한을 유지**하며 푼다 |
| `-r` | 이미 있는 아카이브에 파일 **추가** (압축된 아카이브에는 못 쓴다) |

```bash
tar -zxvf backup.tar.gz -C /tmp        # /tmp 아래에 푼다
tar -ztvf backup.tar.gz                # 풀지 않고 안에 무엇이 있는지만
```

- 최근의 GNU `tar`는 **풀 때** 압축 형식을 스스로 알아내기도 한다. 하지만 **묶을 때는 옵션을 주지 않으면 압축되지 않으며**, 시험에서는 **확장자에 맞는 옵션을 붙인 것**을 정답으로 고른다.
- `-t`로 **먼저 목록을 보는 습관**이 안전하다. 최상위 디렉터리 없이 묶인 아카이브를 풀면 파일 수백 개가 현재 디렉터리에 쏟아진다.

## 소스로 설치하기

패키지가 없거나 옵션을 직접 정해야 할 때는 소스를 컴파일한다.

```text
   1  tar -zxvf program-1.0.tar.gz     압축 해제
   2  cd program-1.0
   3  ./configure                      환경 검사 · Makefile 생성
   4  make                             컴파일
   5  make install                     설치 (보통 root 권한)
```

| 단계 | 하는 일 |
|------|--------|
| **`./configure`** | 시스템을 검사하고 **Makefile을 만든다** |
| **`make`** | Makefile을 보고 **컴파일** |
| **`make install`** | 만들어진 결과물을 **제자리에 복사** |
| `make clean` | 컴파일 중간 파일 정리 |

- `./configure --prefix=/opt/myapp` 처럼 **설치 위치를 지정**할 수 있다.
- 소스 설치는 **의존성도 직접 챙겨야 하고 삭제도 어렵다.** 되도록 패키지를 쓰는 것이 권장된다.
- `--prefix`를 주지 않으면 보통 **`/usr/local`** 아래에 설치된다. 패키지가 설치하는 `/usr`와 섞이지 않게 하려는 자리다.
- **`configure` 앞의 `./`** 는 "현재 디렉터리에 있는 것"이라는 뜻이다. 현재 디렉터리는 `PATH`에 없으므로 `configure`라고만 치면 찾지 못한다. 반면 `make`는 시스템에 설치된 명령이라 `./`가 붙지 않는다.

### 단계별로 막히는 자리

| 화면에 나온 말 | 어느 단계 | 원인 |
|-------------|---------|------|
| `configure: error: no acceptable C compiler found in $PATH` | `./configure` | **컴파일러(`gcc`)가 없다** |
| `configure: error: … not found` | `./configure` | 필요한 **라이브러리·헤더가 없다** — 의존성을 직접 채워야 한다 |
| `make: *** No targets specified and no makefile found.  Stop.` | `make` | **`./configure`를 건너뛰어 Makefile이 없다** |
| `Permission denied` | `make install` | 시스템 디렉터리에 쓰려면 **root 권한**이 필요하다 |

- 세 단계는 **앞 단계의 결과물을 다음 단계가 받아 쓰는** 사슬이다. `./configure`가 만든 **Makefile**을 `make`가 읽고, `make`가 만든 **실행 파일**을 `make install`이 복사한다. 순서를 바꿀 수 없는 이유다.
- **`./configure`와 `make`는 일반 사용자로**, **`make install`만 root로** 하는 것이 관례다.

| 구분 | **패키지 설치** | **소스 설치** |
|------|--------------|-------------|
| 걸리는 시간 | 짧다 — 이미 컴파일되어 있다 | 길다 — 내 컴퓨터에서 컴파일한다 |
| 의존성 | 고수준 도구가 자동 해결 | **직접** 해결 |
| 삭제 | `rpm -e` · `apt remove` 한 줄 | 어렵다 — 설치된 파일을 추적하는 데이터베이스가 없다 |
| 목록에 보이나 | `rpm -qa` · `dpkg -l`에 보인다 | **보이지 않는다** |
| 고를 이유 | 대부분의 경우 | 패키지가 없거나, **최신 버전·특정 컴파일 옵션**이 필요할 때 |

> 내일은 장치 파일과 `/dev` 디렉터리를 다룬다.

## 📖 용어

- **`dpkg`** : 데비안 계열의 저수준 패키지 도구. 의존성을 해결하지 않는다.
- **`apt`** : 데비안 계열의 고수준 도구. 저장소를 이용해 의존성까지 처리한다.
- **`apt update`** : 저장소의 패키지 목록만 새로 받아오는 명령.
- **`apt upgrade`** : 실제로 패키지를 최신 버전으로 갱신하는 명령.
- **`tar`** : 여러 파일을 하나로 묶는 명령. 자체 압축 기능은 없다.
- **`gzip` / `bzip2` / `xz`** : 압축 도구. 확장자는 각각 `.gz`, `.bz2`, `.xz`다.
- **`./configure`** : 소스 설치에서 시스템을 검사하고 Makefile을 생성하는 단계.
- **`make install`** : 컴파일 결과물을 시스템에 설치하는 단계.

## 📝 연습 문제

**문제 1.** 다음 중 `.deb` 패키지를 다루는 저수준 관리 도구로 알맞은 것은?

A) rpm  
B) yum  
C) zypper  
D) dpkg  

**정답: D**  
해설: `dpkg`는 데비안 계열에서 `.deb` 패키지 파일 하나를 직접 설치하거나 삭제하는 저수준 도구이다. 의존성은 해결하지 않으므로 자동 처리가 필요하면 고수준 도구인 `apt`를 사용한다. `rpm`은 레드햇 계열의 저수준 도구이다.

---

**문제 2.** 다음 중 `apt update` 명령이 수행하는 작업으로 알맞은 것은?

A) 저장소의 패키지 목록 정보를 갱신한다  
B) 설치된 모든 패키지를 최신 버전으로 올린다  
C) 사용하지 않는 패키지를 삭제한다  
D) 새로운 패키지를 설치한다  

**정답: A**  
해설: `apt update`는 저장소에서 어떤 패키지의 어떤 버전이 있는지에 대한 목록만 새로 받아온다. 실제로 패키지를 갱신하는 것은 `apt upgrade`이므로 보통 두 명령을 이어서 실행한다.

---

**문제 3.** 다음 중 소스 코드를 컴파일해 설치할 때의 순서로 알맞은 것은?

A) make → ./configure → make install  
B) ./configure → make install → make  
C) ./configure → make → make install  
D) make install → make → ./configure  

**정답: C**  
해설: `./configure`가 시스템 환경을 검사해 Makefile을 만들고, `make`가 그 Makefile을 따라 컴파일하며, `make install`이 결과물을 시스템에 복사한다. Makefile이 있어야 `make`를 실행할 수 있으므로 순서를 바꿀 수 없다.

---

**문제 4.** 다음 중 `tar` 명령에서 파일을 묶을 때 사용하는 옵션으로 알맞은 것은?

A) -x  
B) -c  
C) -t  
D) -f  

**정답: B**  
해설: `-c`는 create의 약자로 새로운 아카이브를 만든다. `-x`는 풀기, `-t`는 내용 목록 확인이며 `-f`는 대상 파일 이름을 지정하는 옵션이라 대부분의 경우 함께 사용한다.

---

**문제 5.** 다음 중 `tar` 명령에서 bzip2 압축을 함께 사용할 때 지정하는 옵션으로 알맞은 것은?

A) -z  
B) -J  
C) -c  
D) -j  

**정답: D**  
해설: `-j`는 bzip2, 소문자 `-z`는 gzip, 대문자 `-J`는 xz 압축을 뜻한다. `tar` 자체에는 압축 기능이 없으므로 이런 옵션으로 외부 압축 도구를 함께 호출한다.
