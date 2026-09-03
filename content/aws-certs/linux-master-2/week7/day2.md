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
해설: `dpkg`는 데비안 계열에서 `.deb` 패키지 파일 하나를 직접 설치하거나 삭제하는 저수준 도구입니다. 의존성은 해결하지 않으므로 자동 처리가 필요하면 고수준 도구인 `apt`를 사용합니다. `rpm`은 레드햇 계열의 저수준 도구입니다.

---

**문제 2.** 다음 중 `apt update` 명령이 수행하는 작업으로 알맞은 것은?

A) 저장소의 패키지 목록 정보를 갱신한다  
B) 설치된 모든 패키지를 최신 버전으로 올린다  
C) 사용하지 않는 패키지를 삭제한다  
D) 새로운 패키지를 설치한다  

**정답: A**  
해설: `apt update`는 저장소에서 어떤 패키지의 어떤 버전이 있는지에 대한 목록만 새로 받아옵니다. 실제로 패키지를 갱신하는 것은 `apt upgrade`이므로 보통 두 명령을 이어서 실행합니다.

---

**문제 3.** 다음 중 소스 코드를 컴파일해 설치할 때의 순서로 알맞은 것은?

A) make → ./configure → make install  
B) ./configure → make install → make  
C) ./configure → make → make install  
D) make install → make → ./configure  

**정답: C**  
해설: `./configure`가 시스템 환경을 검사해 Makefile을 만들고, `make`가 그 Makefile을 따라 컴파일하며, `make install`이 결과물을 시스템에 복사합니다. Makefile이 있어야 `make`를 실행할 수 있으므로 순서를 바꿀 수 없습니다.

---

**문제 4.** 다음 중 `tar` 명령에서 파일을 묶을 때 사용하는 옵션으로 알맞은 것은?

A) -x  
B) -c  
C) -t  
D) -f  

**정답: B**  
해설: `-c`는 create의 약자로 새로운 아카이브를 만듭니다. `-x`는 풀기, `-t`는 내용 목록 확인이며 `-f`는 대상 파일 이름을 지정하는 옵션이라 대부분의 경우 함께 사용합니다.

---

**문제 5.** 다음 중 `tar` 명령에서 bzip2 압축을 함께 사용할 때 지정하는 옵션으로 알맞은 것은?

A) -z  
B) -J  
C) -c  
D) -j  

**정답: D**  
해설: `-j`는 bzip2, 소문자 `-z`는 gzip, 대문자 `-J`는 xz 압축을 뜻합니다. `tar` 자체에는 압축 기능이 없으므로 이런 옵션으로 외부 압축 도구를 함께 호출합니다.
