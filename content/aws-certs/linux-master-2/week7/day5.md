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

## 네 도구를 한 줄에 놓기

어제까지는 계열별로 따로 봤다. 시험은 **같은 일을 하는 네 명령을 한 보기에 섞어** 놓으므로 가로로 읽는 연습이 필요하다.

| 하는 일 | `rpm` | `yum` | `dpkg` | `apt` |
|--------|-------|-------|--------|-------|
| 설치 | `-i 파일.rpm` | `install 이름` | `-i 파일.deb` | `install 이름` |
| 삭제 | `-e 이름` | `remove 이름` | `-r 이름` | `remove 이름` |
| 설정까지 삭제 | — | — | `-P 이름` | `purge 이름` |
| 설치된 목록 | `-qa` | `list installed` | `-l` | `list --installed` |
| 패키지 정보 | `-qi 이름` | `info 이름` | `-s 이름` | `show 이름` |
| 설치한 파일 목록 | `-ql 이름` | — | `-L 이름` | — |
| 파일의 소속 | `-qf 파일` | `provides 파일` | `-S 파일` | — |
| 검색 | — | `search 키워드` | — | `search 키워드` |
| 전체 업그레이드 | — | `update` | — | `update` 뒤 `upgrade` |

- **세로로 보면 규칙이 있다.** 저수준 둘(`rpm`·`dpkg`)은 **하이픈 옵션**, 고수준 둘(`yum`·`apt`)은 **영어 단어**다. 저수준 설치에는 **파일**을, 나머지에는 **이름**을 준다.
- **가로로 보면 함정이 있다.** 삭제가 `rpm`은 **`-e`**, `dpkg`는 **`-r`** 이다. 목록이 `rpm`은 **`-qa`**, `dpkg`는 **`-l`** 이다.

### 같은 글자, 다른 뜻

| 글자 | 여기서는 | 저기서는 |
|------|---------|---------|
| **`-l`** | `dpkg -l` — 설치된 **패키지 목록** | `rpm -ql` — 패키지 안의 **파일 목록** |
| **`-L`** | `dpkg -L` — 패키지 안의 **파일 목록** | `scanimage -L` — **스캐너 목록** |
| **`-i`** | `rpm -i` · `dpkg -i` — **설치** | `rpm -qi` — **정보**(q 뒤에서는 info) |
| **`-P`** | `dpkg -P` — **완전 삭제** | `lpr -P` — **프린터 지정** |
| **`-r`** | `dpkg -r` — **삭제** | `tar -r` — 아카이브에 **추가** |
| **`-x`** | `tar -x` — **풀기** | `lpadmin -x` — **프린터 삭제** |
| **`-d`** | `lp -d` — 출력할 **프린터** | `lpadmin -d` — **기본 프린터** 지정, `gzip -d` — **압축 해제** |
| `update` | `apt update` — **목록만** | `yum update` — **실제 업그레이드** |

- 옵션 글자는 **명령마다 따로 정한 것**이라 서로 통하지 않는다. "어느 명령의 옵션인가"를 먼저 보고 뜻을 읽는다.

## 한 줄만 보고 판별하기

| 눈앞의 것 | 판별 | 근거 |
|----------|------|------|
| `vsftpd-3.0.2-29.el7.x86_64.rpm` | RPM 계열, 레드햇 7 계열용, 64비트 | 확장자 `.rpm`, `el7`, `x86_64` |
| `vsftpd_3.0.5-0ubuntu1_amd64.deb` | DEB 계열, 64비트 | 확장자 `.deb`, **밑줄** 구분, `amd64` |
| `backup.tar.bz2` | 풀 때 `tar -jxvf` | `.bz2`는 bzip2 → **`-j`** |
| `source.tar.xz` | 풀 때 `tar -Jxvf` | `.xz` → **대문자 `-J`** |
| `data.tgz` | 풀 때 `tar -zxvf` | `.tgz`는 `.tar.gz`의 줄임 |
| `brw-rw----. 1 root disk 8, 17 …` | **블록 장치**, 두 번째 디스크의 1번 파티션 | 맨 앞 `b`, 부 번호 16 + 1 |
| `crw-rw-rw-. 1 root root 1, 3 …` | **문자 장치** (`/dev/null`) | 맨 앞 `c` |
| `/dev/sdc2` | 세 번째 디스크의 2번 파티션 | `c` = 세 번째, `2` = 파티션 |
| `/dev/sr0` | 첫 번째 CD/DVD 드라이브 | `sr`, 번호는 0부터 |
| `ii  apache2 …` | 정상 설치된 패키지 | `dpkg -l`의 `ii` |
| `rc  vsftpd …` | 지웠지만 **설정이 남은** 패키지 | `dpkg -l`의 `rc` → `dpkg -P`로 마저 지운다 |
| `error: Failed dependencies:` | 저수준 도구로 설치하다 의존성에 막혔다 | `yum`·`apt`로 설치 |

## 상황에서 명령 고르기

| 상황 | 고를 것 | 헷갈리는 오답 |
|------|--------|-------------|
| `/usr/sbin/sshd`가 어느 패키지에서 왔는지 (레드햇) | `rpm -qf /usr/sbin/sshd` | `rpm -ql` — 방향이 반대다 |
| 같은 질문 (우분투) | `dpkg -S /usr/sbin/sshd` | `dpkg -L` — 방향이 반대다 |
| 내려받은 `.rpm` 파일을 **설치하기 전에** 안에 든 파일을 본다 | `rpm -qpl 파일.rpm` | `rpm -ql` — 설치된 것만 본다 |
| 이미 설치된 것만 최신으로, 없는 것은 설치하지 않는다 | `rpm -Fvh *.rpm` | `rpm -Uvh` — 없으면 설치까지 한다 |
| 우분투에서 패키지와 그 설정까지 지운다 | `apt purge` · `dpkg -P` | `apt remove` · `dpkg -r` |
| `.tar.gz` 안에 무엇이 들었는지만 본다 | `tar -ztvf` | `tar -zxvf` — 실제로 풀어 버린다 |
| USB를 꽂았는데 장치 이름을 모른다 | `dmesg`의 끝부분, `lsblk` | `lsusb` — 연결 여부만 알려 준다 |
| 랜 카드가 어떤 칩인지 본다 | `lspci` | `lsusb` — PCI 장치는 안 나온다 |
| System V 명령으로 프린터 `hp1`에 2부 출력 | `lp -d hp1 -n 2 파일` | `lpr -P hp1 -# 2 파일` — BSD 방식이다 |
| 인쇄 대기 중인 7번 작업을 BSD 명령으로 취소 | `lprm 7` | `lpq` — 보기만 한다 |
| 명령 한 줄로 음소거를 푼다 | `amixer set Master unmute` | `alsamixer` — 화면을 띄운다 |
| 스캐너가 SANE에 잡혔는지 본다 | `scanimage -L` | `lpstat -p` — 프린터용이다 |

## 데몬 · 설정 파일 · 포트 모아 보기

| 대상 | 데몬 | 설정 위치 | 포트 |
|------|------|---------|------|
| YUM | 없음 | `/etc/yum.conf`, `/etc/yum.repos.d/` | — |
| APT | 없음 | `/etc/apt/sources.list` | — |
| 장치 파일 관리 | `systemd-udevd` (udev) | `/etc/udev/rules.d/` | — |
| 인쇄 (CUPS) | `cupsd` | `/etc/cups/cupsd.conf` | **631** |
| 인쇄 (옛 LPD) | `lpd` | `/etc/printcap` | 515 |
| 사운드 (ALSA) | 없음 — 커널 드라이버 | `/etc/asound.conf` | — |
| 스캐너 (SANE) | `saned` (공유할 때만) | `/etc/sane.d/` | 6566 |

- 이 가운데 **값 그대로 외워야 하는 포트는 CUPS의 631**이다. 패키지 도구와 ALSA는 데몬이 아니라서 포트가 없다는 점도 함께 본다.

| 옛것 | 새것 | 무엇이 달라졌나 |
|------|------|--------------|
| `yum` | **`dnf`** | 같은 RPM 계열의 다음 세대. 명령 구조는 거의 같다 |
| `apt-get` · `apt-cache` | **`apt`** | 나뉘어 있던 명령을 하나로 |
| `devfs` · 미리 만들어 둔 장치 파일 | **`udev`** | 연결될 때 만들고 빠질 때 지운다 |
| `/dev/hda` (IDE) | **`/dev/sda`** | 디스크 이름 규칙 |
| LPD · LPRng | **CUPS** | IPP, 웹 관리 화면 |
| OSS | **ALSA** | 리눅스 전용 사운드 구조 |

## 한 번에 이어 보기 — 새 서버에 프린터 붙이기

이번 주의 세 주제가 실제로는 한 줄로 이어진다.

```text
   1  yum install cups              패키지 — 고수준 도구가 의존성까지 설치
   2  rpm -ql cups | grep conf      패키지 — 설정 파일이 어디 깔렸나 (/etc/cups/cupsd.conf)
   3  systemctl start cups          데몬 cupsd 시작
   4  (USB 프린터 연결)
   5  dmesg | tail                  장치 — 커널이 인식했나
   6  lsusb                         장치 — USB 목록에 보이나
   7  ls -l /dev/usb/lp0            장치 — udev 가 만든 문자 장치 파일 (맨 앞 c)
   8  http://localhost:631          주변장치 — 웹 화면에서 프린터 등록
   9  lpr -P printer1 test.txt      주변장치 — 출력
  10  lpq -P printer1               주변장치 — 대기열 확인
```

- **1~3은 소프트웨어 설치, 5~7은 장치 설정, 8~10은 주변장치 활용**이다. 출제기준의 "소프트웨어 설치"와 "장치 설정" 두 항목이 이렇게 맞물린다.

> 여기까지가 2차 시험의 첫 과목인 **리눅스 운영 및 관리**다. 다음 주부터는 2차의 둘째 과목 **리눅스 활용** — X 윈도, 인터넷 활용, 응용 분야로 들어간다.

## 📖 용어

- **의존성** : 어떤 패키지가 동작하기 위해 필요한 다른 패키지와의 관계.
- **저수준 / 고수준 도구** : 파일 하나를 다루는 도구 / 저장소를 이용해 의존성까지 처리하는 도구.
- **블록 장치 / 문자 장치** : 블록 단위로 임의 접근하는 장치 / 한 글자씩 순차 처리하는 장치.
- **udev** : 장치 연결·제거를 감지해 `/dev` 파일을 자동 관리하는 시스템.
- **CUPS / ALSA / SANE** : 프린터 / 사운드 / 스캐너를 담당하는 표준 시스템.
- **스풀** : 인쇄 대기열에 쌓인 작업.
- **저장소(repository)** : 고수준 도구가 패키지를 받아 오는 서버. `yum`은 `/etc/yum.repos.d/`, `apt`는 `/etc/apt/sources.list`에 주소를 둔다.
- **purge** : 패키지를 지우면서 설정 파일까지 없애는 것. `dpkg -P`, `apt purge`.

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
