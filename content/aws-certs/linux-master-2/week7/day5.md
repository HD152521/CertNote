# Day 5 - Week 7 종합 복습: 패키지와 장치

## 📌 핵심 정리

- **RPM 계열은 레드햇·CentOS·페도라·SUSE**, **DEB 계열은 데비안·우분투·민트**다.
- **저수준(`rpm`·`dpkg`)은 의존성을 못 풀고, 고수준(`yum`·`apt`)은 푼다.**
- **`apt update`는 목록 갱신, `apt upgrade`가 실제 갱신**이다.
- **블록 장치는 `b`(디스크), 문자 장치는 `c`(키보드·프린터)** 다.
- 세 이름 — **CUPS**(프린터) · **ALSA**(사운드) · **SANE**(스캐너).

## 한 장 정리

```text
   패키지
     RPM 계열   레드햇 · CentOS · 페도라 · SUSE      .rpm
       저수준   rpm   -i 설치 · -U 업그레이드 · -e 삭제 · -q 질의
       고수준   yum → dnf     SUSE 는 zypper
       저장소   /etc/yum.repos.d/

     DEB 계열   데비안 · 우분투 · 민트                .deb
       저수준   dpkg  -i 설치 · -r 삭제 · -P 완전삭제 · -l 목록
       고수준   apt   update(목록) → upgrade(실제)
       저장소   /etc/apt/sources.list

     소스설치   tar 해제 → ./configure → make → make install
     묶기/압축  tar(-c 묶기 -x 풀기 -f 파일) + -z gzip · -j bzip2 · -J xz

   장치
     /dev       b 블록(디스크 · USB · CD)   c 문자(키보드 · 프린터 · 터미널)
                주 번호(드라이버) · 부 번호(몇 번째)
     이름       /dev/sda1   sd=SATA · a=첫 디스크 · 1=첫 파티션
     udev       장치 연결/제거 시 /dev 파일 자동 생성·삭제
     조회       lsblk · lsusb · lspci · lsmod · dmesg

   주변장치
     프린터  CUPS  Common Unix Printing System   631 포트 · cupsd.conf
             BSD  lpr · lpq · lprm
             SysV lp  · lpstat · cancel
     사운드  OSS → ALSA  Advanced Linux Sound Architecture   alsamixer
     스캐너  SANE  Scanner Access Now Easy       scanimage · xsane
```

## 헷갈리는 짝 대조

| 구분 | A | B | 가르는 기준 |
|------|---|---|-----------|
| RPM vs DEB | 레드햇·CentOS·**SUSE** | 데비안·**우분투**·민트 | 배포판 계보 |
| 저수준 vs 고수준 | `rpm`·`dpkg` | **`yum`·`apt`** | **의존성 해결 여부** |
| `rpm -i` vs `-U` | 설치만 | **없으면 설치까지** | 기존 버전 처리 |
| `dpkg -r` vs `-P` | 설정 **남김** | 설정까지 삭제 | purge 여부 |
| `apt update` vs `upgrade` | **목록만** | 실제 갱신 | 무엇이 바뀌나 |
| `yum` vs `zypper` | 레드햇 계열 | **SUSE** | 같은 RPM인데 도구가 다름 |
| `tar -c` vs `-x` | **묶기** | 풀기 | 방향 |
| `-z` vs `-j` vs `-J` | gzip | bzip2 | **xz(대문자)** |
| 블록 vs 문자 장치 | **`b`** 디스크 | **`c`** 키보드 | 임의 접근 가능한가 |
| 주 번호 vs 부 번호 | **드라이버** | 몇 번째 장치 | — |
| `sda` vs `sda1` | 디스크 **전체** | 1번 파티션 | 숫자 유무 |
| `lpr` vs `lpq` vs `lprm` | 출력 | 큐 확인 | **취소** |
| OSS vs ALSA | 옛 방식 | **현재 표준** | 세대 |
| CUPS vs SANE | **프린터** | 스캐너 | 대상 장치 |

## 자주 틀리는 지점

1. **우분투는 RPM 계열** → 아니다. **데비안 계열**이라 `.deb`을 쓴다.
2. **SUSE는 DEB 계열** → 아니다. **RPM 계열**인데 도구만 **`zypper`** 다.
3. **`rpm`이 의존성을 풀어 준다** → 못 푼다. **고수준 도구(`yum`)** 가 푼다.
4. **`apt update`가 패키지를 업그레이드한다** → **목록만** 갱신한다.
5. **`tar`가 압축까지 한다** → 묶기만 한다. 압축은 **`-z`·`-j`·`-J`** 가 붙어야 한다.
6. **`make install`을 먼저 한다** → 순서는 **`./configure` → `make` → `make install`** 이다.
7. **프린터가 블록 장치** → **문자 장치**다. 디스크 계열만 블록이다.
8. **`/dev/sda1`이 첫 번째 디스크 전체** → 전체는 **`/dev/sda`**, `sda1`은 **파티션**이다.
9. **CUPS가 스캐너** → 프린터다. 스캐너는 **SANE**.
10. **ALSA가 예전 것** → **OSS가 예전 것**이고 ALSA가 현재 표준이다.

## 시험에 그대로 나오는 값

| 값 | 무엇 |
|-----|------|
| **631** | CUPS 웹 관리 포트 (IPP 표준 포트) |
| **`/etc/cups/cupsd.conf`** | CUPS 주 설정 파일 |
| **`/etc/yum.repos.d/`** | YUM 저장소 설정 위치 |
| **`/etc/apt/sources.list`** | APT 저장소 설정 파일 |
| **`b` / `c`** | 블록 장치 / 문자 장치 표시 |
| **`/etc/udev/rules.d/`** | udev 규칙 파일 위치 |

| 줄임말 | 풀네임 |
|-------|-------|
| **CUPS** | Common Unix Printing System |
| **ALSA** | Advanced Linux Sound Architecture |
| **SANE** | Scanner Access Now Easy |
| **OSS** | Open Sound System |
| **IPP** | Internet Printing Protocol |

> 여기까지가 1차 시험 범위인 **리눅스 운영 및 관리**다. 다음 주부터는 2차 **리눅스 활용** — X 윈도, 인터넷 활용, 응용 분야로 들어간다.

## 📖 용어

- **의존성** : 어떤 패키지가 동작하기 위해 필요한 다른 패키지와의 관계.
- **저수준 / 고수준 도구** : 파일 하나를 다루는 도구 / 저장소를 이용해 의존성까지 처리하는 도구.
- **블록 장치 / 문자 장치** : 블록 단위로 임의 접근하는 장치 / 한 글자씩 순차 처리하는 장치.
- **udev** : 장치 연결·제거를 감지해 `/dev` 파일을 자동 관리하는 시스템.
- **CUPS / ALSA / SANE** : 프린터 / 사운드 / 스캐너를 담당하는 표준 시스템.
- **스풀** : 인쇄 대기열에 쌓인 작업.

## 📝 연습 문제

**문제 1.** 다음 중 데비안 계열 배포판에 해당하는 것으로 알맞은 것은?

A) CentOS  
B) 페도라  
C) SUSE  
D) 우분투  

**정답: D**  
해설: 우분투는 데비안을 기반으로 만들어진 배포판이므로 `.deb` 패키지와 `dpkg`, `apt`를 사용합니다. CentOS, 페도라, SUSE는 모두 `.rpm` 형식을 사용하는 RPM 계열이며 그중 SUSE만 고수준 도구로 `zypper`를 씁니다.

---

**문제 2.** 다음 중 `tar` 명령으로 gzip 압축된 아카이브를 해제하는 명령으로 알맞은 것은?

A) tar -zxvf file.tar.gz  
B) tar -zcvf file.tar.gz  
C) tar -jxvf file.tar.gz  
D) tar -xvf file.tar.gz  

**정답: A**  
해설: `-x`는 아카이브를 푸는 옵션이고 `-z`는 gzip 압축을 처리하는 옵션이므로 둘을 함께 써야 합니다. `-c`는 반대로 새 아카이브를 만드는 옵션이며 `-j`는 bzip2 압축에 사용합니다.

---

**문제 3.** 다음 중 설치된 RPM 패키지 전체 목록을 확인하는 명령으로 알맞은 것은?

A) rpm -ql  
B) rpm -qa  
C) rpm -qi  
D) rpm -qf  

**정답: B**  
해설: `-q`는 질의 옵션이며 `-a`(all)를 함께 쓰면 시스템에 설치된 모든 패키지 목록이 출력됩니다. `-ql`은 특정 패키지가 설치한 파일 목록, `-qi`는 패키지 정보, `-qf`는 지정한 파일이 속한 패키지를 찾습니다.

---

**문제 4.** 다음 중 `ls -l /dev/sda` 결과의 맨 앞 문자로 나타나는 것으로 알맞은 것은?

A) d  
B) c  
C) b  
D) l  

**정답: C**  
해설: `/dev/sda`는 하드디스크를 가리키는 블록 장치이므로 맨 앞에 `b`가 표시됩니다. 문자 장치는 `c`, 디렉터리는 `d`, 심볼릭 링크는 `l`로 표시됩니다.

---

**문제 5.** 다음 중 인쇄 대기 중인 작업을 취소하는 BSD 계열 명령으로 알맞은 것은?

A) lpq  
B) lpstat  
C) lpc  
D) lprm  

**정답: D**  
해설: `lprm`은 인쇄 대기열에 있는 작업을 취소하는 BSD 계열 명령이며 System V 계열의 `cancel`에 해당합니다. `lpq`는 대기열 확인, `lpstat`은 System V 계열의 상태 확인, `lpc`는 프린터 제어 명령입니다.

---

**문제 6.** 다음 중 리눅스에서 현재 표준으로 사용되는 사운드 시스템으로 알맞은 것은?

A) OSS  
B) SANE  
C) ALSA  
D) CUPS  

**정답: C**  
해설: ALSA는 커널 2.6부터 리눅스의 표준 사운드 시스템으로 자리 잡았으며 여러 프로그램의 동시 출력과 다중 사운드 카드를 지원합니다. OSS는 그 이전에 사용되던 방식이고, SANE은 스캐너, CUPS는 프린터를 담당합니다.
