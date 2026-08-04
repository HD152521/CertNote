# Day 4 - 장치 관리와 프린터: /dev·udev로 하드웨어 다루고 CUPS로 인쇄하기

## 📌 핵심 정리

- **"모든 것은 파일"** — 하드웨어는 `/dev` 아래 장치 파일로 표현된다. 장치 파일은 데이터를 담지 않고 **드라이버로 가는 문 손잡이**일 뿐이다.
- 첫 글자 **`b`=블록 장치**(디스크·USB, 블록 단위 임의 접근, **마운트 가능**), **`c`=문자 장치**(터미널·키보드, 바이트 순차, 마운트 불가).
- 크기 자리의 두 숫자는 **주 번호(어느 드라이버)·부 번호(그 드라이버의 몇 번째 장치)**.
- **udev**가 장치 착탈에 맞춰 장치 파일을 동적으로 만들고, `/etc/udev/rules.d/` 규칙으로 **지속적 이름·권한**을 부여한다.
- 인쇄는 **CUPS**(데몬 cupsd, IPP, 631 포트)가 담당하며 명령이 두 계열로 갈린다 — **System V(`lp`/`lpstat`/`cancel`, `-d`)** vs **BSD(`lpr`/`lpq`/`lprm`, `-P`)**. 소리는 **ALSA**(+PulseAudio), 스캔은 **SANE**이 같은 틀로 맡는다.

## /dev와 장치 파일 — 블록 vs 문자

- `/dev` 아래의 장치 파일은 `ls -l`로 보면 일반 파일과 다르다.
- 첫 글자가 **`b` 또는 `c`**이고, 파일 크기 자리에 **주 번호(major), 부 번호(minor)** 두 숫자가 온다.

```bash
ls -l /dev/sda /dev/tty0 /dev/null
# brw-rw---- 1 root disk 8, 0 ... /dev/sda     ← b: 블록 장치
# crw--w---- 1 root tty  4, 0 ... /dev/tty0    ← c: 문자 장치
```

| 종류 | 표시 | 접근 방식 | 예 |
|------|------|-----------|-----|
| **블록 장치** | `b` | 버퍼를 거쳐 **블록 단위** 임의 접근 | 디스크(sda), USB, CD |
| **문자 장치** | `c` | 버퍼 없이 **바이트 단위** 순차 접근 | 터미널(tty), 키보드, 마우스 |

| 번호 | 의미 |
|------|------|
| **주 번호(major)** | 어떤 **드라이버**가 처리하는지 |
| **부 번호(minor)** | 같은 드라이버 안에서 **몇 번째 장치**인지 |

> 💡 **개념**: 블록과 문자의 구분은 **데이터를 덩어리로 다루느냐, 흐름으로 다루느냐**다. 디스크는 4KB 같은 블록 단위로 임의의 위치를 읽고 쓸 수 있어 블록 장치(`b`)다 — 그래서 파일 시스템을 얹을 수 있다. 키보드·터미널은 한 글자씩 순차적으로 흘러들어오므로 문자 장치(`c`)다. 시험에서 "디스크는? 터미널은?"으로 b/c를 구분시키는 단답이 자주 나온다.

> 🔍 **더 깊이**: 주 번호가 같으면 같은 드라이버가 처리한다. 예컨대 `/dev/sda`(주 8, 부 0)와 `/dev/sda1`(주 8, 부 1)은 같은 SCSI/SATA 디스크 드라이버(주 8)가 다루는 디스크 전체와 첫 파티션이다. 부 번호가 파티션·장치 순번을 구별한다. 장치 파일을 수동으로 만드는 명령은 `mknod 이름 유형 주 부`이지만, 오늘날은 udev가 자동으로 처리한다.

> 📚 **유래/사례**: 과거에는 `/dev`에 가능한 모든 장치 파일을 미리 정적으로 만들어 두었다 — 쓰지도 않을 수천 개의 파일이 항상 존재했다. 1990년대 말 수많은 USB·핫플러그 장치가 등장하면서 이 방식은 한계에 부딪혔다. 그래서 커널이 인식한 장치만 `/dev`에 동적으로 만드는 방식(devfs를 거쳐 현재의 udev)으로 진화했다. 지금 `/dev`를 보면 실제 존재하는 장치만 들어 있는 것이 그 결과다.

## udev — 동적 장치 관리

- `udev`(userspace /dev)는 **장치가 꽂히거나 빠질 때 `/dev` 아래 장치 파일을 자동으로 만들고 지우는** 사용자 공간 데몬이다.
- 흐름: 커널이 새 하드웨어를 감지 → 이벤트(uevent) 발송 → udev가 규칙에 따라 장치 파일 생성 + 이름·권한·심볼릭 링크 부여.

```bash
udevadm info /dev/sda          # 그 장치의 udev 속성 조회
udevadm monitor                # 장치 이벤트 실시간 관찰(USB 꽂아보기)
udevadm trigger                # 규칙 재적용
ls /etc/udev/rules.d/          # 사용자 정의 udev 규칙 파일들
```

> 💡 **개념**: udev의 강력함은 **규칙(rule)**에 있다. `/etc/udev/rules.d/*.rules`에 "이 USB(벤더ID·제품ID)가 꽂히면 항상 `/dev/myusb`라는 이름을 주고 권한을 0660으로" 같은 규칙을 쓸 수 있다. 그래서 같은 장치가 꽂는 순서에 상관없이 늘 같은 이름을 갖게 만들 수 있다(예: `/dev/sdb`/`/dev/sdc`가 매번 바뀌는 문제를 안정적 이름으로 해결). 이를 "지속적 장치 이름(persistent naming)"이라 한다.

> 🔍 **더 깊이**: udev는 핫플러그(hot-plug) 장치 관리의 핵심이다. USB를 꽂는 순간 커널→udev→장치 파일 생성→필요 모듈 적재(`modprobe`)→마운트 가능 상태까지 자동으로 이어진다. `udevadm monitor`를 켠 채 USB를 꽂으면 이 이벤트 흐름이 실시간으로 보인다. 데스크톱 환경에서 USB 메모리를 꽂으면 자동 마운트되는 것도 udev 이벤트에 연동된 동작이다.

## 마운트 가능한 장치

- 블록 장치(디스크·USB·CD)는 파일 시스템을 담을 수 있어 **마운트(mount)**할 수 있다.
- 마운트 = 그 장치의 파일 시스템을 디렉터리 트리의 특정 지점(**마운트 포인트**)에 연결하는 일.

```bash
lsblk                          # 블록 장치를 트리로 표시(추천)
blkid                          # 각 장치의 UUID·파일시스템 타입
mount /dev/sdb1 /mnt/usb       # 장치를 마운트 포인트에 연결
umount /mnt/usb                # 마운트 해제
df -h                          # 마운트된 파일시스템 사용량
```

| 명령 | 용도 |
|------|------|
| `lsblk` | 블록 장치 계층 구조 보기 |
| `blkid` | 장치 UUID·타입 확인 |
| `mount` / `umount` | 연결 / 해제 |
| `df` | 마운트된 파일시스템 용량 |

> 💡 **개념**: 문자 장치(터미널·키보드)는 **마운트할 수 없다.** 마운트는 파일 시스템을 가진 블록 장치에만 의미가 있다. `/etc/fstab`에 적으면 부팅 시 자동 마운트되며, 장치 이름(`/dev/sdb1`)이 부팅마다 바뀔 수 있어 UUID(`blkid`로 확인)로 지정하는 것이 안전하다. 이는 udev의 지속적 이름 부여와 같은 문제의식이다.

## 프린터와 CUPS

- 리눅스의 표준 인쇄 시스템은 **CUPS**(Common Unix Printing System)다.
- 프린터를 **IPP**(Internet Printing Protocol)로 관리하며, 데몬은 **`cupsd`**.
- 웹 인터페이스(`http://localhost:631`)와 명령행 도구를 함께 제공한다.
- 인쇄 명령은 두 전통에서 온 **두 계열**이 공존한다.

| 작업 | System V 계열 | BSD 계열 |
|------|---------------|----------|
| 인쇄 | `lp 파일` | `lpr 파일` |
| 큐 상태 | `lpstat` | `lpq` |
| 작업 취소 | `cancel 작업ID` | `lprm 작업ID` |

```bash
lp report.pdf                  # 기본 프린터로 인쇄(System V)
lpr report.pdf                 # 기본 프린터로 인쇄(BSD)
lp -d laser report.pdf         # 'laser' 프린터 지정(-d)
lpr -P laser report.pdf        # 'laser' 프린터 지정(-P)
lpstat -p                      # 프린터 상태
lpstat -t                      # 전체 상태 요약
lpq                            # 인쇄 큐(대기 작업) 보기
cancel 123                     # 작업 123 취소(System V)
lprm 123                       # 작업 123 취소(BSD)
```

> 💡 **개념**: CUPS는 두 인쇄 전통을 모두 흡수했다. AT&T 유닉스(System V) 계열은 `lp`/`lpstat`/`cancel`, 버클리(BSD) 계열은 `lpr`/`lpq`/`lprm`을 썼다. 오늘날 두 계열 명령이 모두 CUPS로 전달돼 동작한다. 프린터 지정 옵션도 다르다 — System V는 `lp -d 프린터`, BSD는 `lpr -P 프린터`. `-d`(destination)와 `-P`(Printer)를 계열별로 외워야 한다.

> 🔍 **더 깊이**: `lpstat`은 인쇄 환경을 두루 보여준다. `lpstat -p`(프린터 상태), `lpstat -a`(작업 수락 여부), `lpstat -d`(기본 프린터), `lpstat -t`(전체 요약). 프린터 설정·추가·기본 프린터 지정은 `lpadmin`(관리자용)으로 하고, `lpadmin -d 프린터`로 기본 프린터를 정한다. CUPS 설정 파일은 `/etc/cups/cupsd.conf`와 `/etc/cups/printers.conf`다.

> ⚠️ **함정**: `lpstat`(상태 조회)와 `lpadmin`(설정 변경)을 혼동하면 안 된다. 또 작업 취소 명령이 계열에 따라 `cancel`(System V)과 `lprm`(BSD)로 다르다는 점이 시험 단골이다. 인쇄가 `lp`냐 `lpr`이냐, 큐 보기가 `lpstat`/`lpq`냐, 취소가 `cancel`/`lprm`이냐를 표로 묶어 외우면 헷갈리지 않는다.

```bash
# 직접 쳐보기 — 장치·프린터 관찰
ls -l /dev/sda /dev/null /dev/tty   # 첫 글자 b/c와 주·부 번호 비교
lsblk                                # 블록 장치 트리
blkid                                # UUID·타입
lpstat -t 2>/dev/null || echo "CUPS 미설치/미실행"
ls /etc/udev/rules.d/                # udev 규칙
```

> 📚 **유래/사례**: CUPS는 1999년 Michael Sweet가 개발했고 2007년 애플이 인수해 macOS의 인쇄 시스템으로도 쓴다. 그가 IPP를 표준으로 택한 덕에, 같은 명령과 프로토콜로 로컬 USB 프린터부터 네트워크 프린터까지 일관되게 다룰 수 있게 됐다. `lp`/`lpr` 두 계열을 모두 지원한 것도 기존 유닉스 사용자의 습관을 깨지 않으려는 배려였다 — 그래서 오늘날까지 두 명령군이 공존한다.

## 사운드 장치 — ALSA와 PulseAudio

- 사운드 카드도 장치 파일로 표현된다. 다만 `/dev` 바로 아래가 아니라 **`/dev/snd/`** 디렉터리에 `pcmC0D0p`(카드0·장치0·재생), `controlC0`(제어) 같은 이름으로 모여 있다.
- 리눅스의 소리는 **2층 구조** — 커널의 **ALSA**가 하드웨어를 직접 다루고, 그 위의 **사운드 서버**가 여러 프로그램의 소리를 섞는다.

| 계층 | 구성 | 역할 |
|------|------|------|
| 커널 | **ALSA** 드라이버(`snd_*` 모듈) | 사운드 카드 제어, `/dev/snd/*` 장치 파일 제공 |
| 사용자 공간 도구 | alsa-lib, alsa-utils(`aplay`·`amixer`·`alsamixer`) | 재생·녹음·볼륨 조절 |
| 사운드 서버 | **PulseAudio** / PipeWire | 여러 앱의 소리 믹싱, 출력 장치 전환, 네트워크 전송 |

```bash
lsmod | grep snd            # 적재된 사운드 모듈(snd_hda_intel 등)
cat /proc/asound/cards      # 커널이 인식한 사운드 카드 목록
aplay -l                    # 재생(playback) 장치 목록
arecord -l                  # 녹음(capture) 장치 목록
aplay sample.wav            # WAV 파일 재생
arecord -d 5 test.wav       # 5초간 녹음
speaker-test -c 2           # 스피커 점검(2채널)
alsamixer                   # 텍스트 UI 믹서(화살표=볼륨, M=음소거)
amixer                      # 명령행 믹서(현재 설정 출력)
amixer set Master 50%       # 마스터 볼륨 50%
amixer set Master mute      # 음소거(해제는 unmute)
alsactl store               # 현재 믹서 설정 저장(복원은 alsactl restore)
```

| 명령 | 용도 |
|------|------|
| `aplay` / `arecord` | 재생 / 녹음 (`-l`로 장치 목록 조회) |
| `alsamixer` | **텍스트 UI**(대화형) 믹서 |
| `amixer` | **명령행**(비대화형) 믹서 — 스크립트용 |
| `alsactl` | 믹서 설정 저장(`store`)·복원(`restore`) |
| `speaker-test` | 스피커 출력 점검 |

> 💡 **개념**: **ALSA**(Advanced Linux Sound Architecture)는 커널 2.6부터 리눅스의 표준 사운드 시스템이다. 그 이전에는 **OSS**(Open Sound System)가 `/dev/dsp`(재생·녹음), `/dev/mixer`(볼륨) 장치 파일로 소리를 다뤘는데, 다중 채널·하드웨어 믹싱·MIDI 지원이 약해 ALSA로 대체됐다. "구형 OSS(`/dev/dsp`) → 현재 ALSA(`/dev/snd/`)"라는 세대 교체를 묻는 문제가 나온다.

> ⚠️ **함정**: **`alsamixer`와 `amixer`**를 혼동하면 안 된다. `alsamixer`는 ncurses 기반 **화면 UI**로 화살표 키를 눌러 조절하는 대화형 도구이고, `amixer`는 인자로 값을 주는 **명령행 도구**라 스크립트·원격 작업에 쓴다. 실기에서 "볼륨을 명령 한 줄로 50%로 맞춰라"면 답은 `amixer set Master 50%`다. 또 `aplay -l`(소문자, 하드웨어 장치 목록)과 `aplay -L`(대문자, PCM 이름 목록)도 구분한다.

> 🔍 **더 깊이**: **PulseAudio**는 ALSA 위에서 도는 **사용자 공간 사운드 서버**다. ALSA만으로는 한 장치를 한 프로그램이 점유하기 쉬운데, PulseAudio가 중간에서 여러 앱의 소리를 섞고 출력 장치를 실시간으로 바꿔 준다. 제어는 `pactl list short sinks`(출력 장치 목록), `pactl set-sink-volume @DEFAULT_SINK@ 50%`(볼륨), `pavucontrol`(GUI)로 한다. 최근 배포판은 PulseAudio 호환 계층을 갖춘 **PipeWire**로 넘어가는 추세다. 일반 사용자가 사운드 장치를 쓰려면 보통 `audio` 그룹에 속해야 하며, 그 권한을 부여하는 것이 앞서 본 udev 규칙이다.

## 스캐너 — SANE

- 스캐너는 **SANE**(Scanner Access Now Easy)이 표준을 맡는다. CUPS가 프린터에서 하는 역할을 스캐너에서 한다.
- 구조도 닮았다 — 모델별 드라이버인 **백엔드**와 사용자가 쓰는 **프론트엔드**로 나뉜다.

| 구성 | 설명 |
|------|------|
| **백엔드(backend)** | 스캐너 모델별 드라이버. 설정은 `/etc/sane.d/*.conf`, 활성 목록은 `dll.conf` |
| **프론트엔드(frontend)** | 사용자 도구. `scanimage`(명령행), `xsane`·`simple-scan`(GUI) |
| **saned** | 네트워크 스캐닝 데몬(스캐너를 다른 PC와 공유) |

```bash
sane-find-scanner            # USB/SCSI 버스를 훑어 스캐너 하드웨어 탐색
scanimage -L                 # SANE이 인식한(드라이버가 붙은) 스캐너 목록
scanimage > out.pnm          # 기본 설정으로 스캔해 파일로 저장
scanimage --format=tiff --resolution 300 > out.tiff   # 형식·해상도 지정
scanimage -d 'epson2:libusb:001:002' > out.pnm        # 장치 지정(-d)
ls /etc/sane.d/              # 백엔드 설정 파일들(dll.conf 포함)
```

> ⚠️ **함정**: **`sane-find-scanner`와 `scanimage -L`은 보는 층이 다르다.** 전자는 USB/SCSI **버스를 직접 훑어** 스캐너처럼 보이는 하드웨어를 찾으므로 드라이버가 없어도 나타난다. 후자는 **SANE 백엔드가 실제로 인식한** 장치만 보여준다. 그래서 "`sane-find-scanner`에는 보이는데 `scanimage -L`에는 안 나온다"면 원인은 케이블이 아니라 **백엔드 미지원 또는 `dll.conf`에서 비활성**이다. 이 진단 흐름이 실기 서술형 소재가 된다.

> 💡 **개념**: 프린터와 스캐너는 구조가 대칭이라 묶어서 외우면 좋다. 인쇄는 **CUPS**(데몬 `cupsd`, 명령 `lp`/`lpr`, 설정 `/etc/cups/`), 스캔은 **SANE**(데몬 `saned`, 명령 `scanimage`, 설정 `/etc/sane.d/`)이 담당한다. 둘 다 표준 인터페이스 뒤에 모델별 드라이버를 감춰, 사용자는 장치가 무엇이든 같은 명령을 쓴다. 스캐너 접근 권한은 배포판에 따라 `scanner` 그룹으로 관리되며 udev 규칙이 이를 부여한다.

- 패키지 이름은 배포판 계열마다 다르다.

```bash
dnf install alsa-utils sane-backends     # RHEL/CentOS/Rocky 계열
apt install alsa-utils sane-utils        # Debian/Ubuntu 계열
```

```bash
# 직접 쳐보기 — 사운드·스캐너 관찰 (안전: 조회 위주)
ls /dev/snd/ 2>/dev/null                # 사운드 장치 파일
cat /proc/asound/cards 2>/dev/null      # 인식된 사운드 카드
aplay -l 2>/dev/null || echo "ALSA 미설치"
amixer 2>/dev/null | head               # 현재 믹서 설정
scanimage -L 2>/dev/null || echo "SANE 미설치"
ls /etc/sane.d/ 2>/dev/null             # 백엔드 설정
```

## 📖 용어

- **장치 파일** : `/dev` 아래에서 하드웨어를 대신하는 파일. 데이터를 담지 않고 드라이버로 가는 통로 역할만 한다.
- **블록 장치(`b`)** : 블록 단위로 아무 위치나 읽고 쓸 수 있는 장치. 파일 시스템을 얹어 마운트할 수 있다(디스크·USB·CD).
- **문자 장치(`c`)** : 바이트가 순차로 흐르는 장치. 마운트 대상이 아니다(터미널·키보드·마우스).
- **주 번호 / 부 번호** : 어떤 드라이버가 처리하는지 / 그 드라이버 안에서 몇 번째 장치인지.
- **`mknod`** : 장치 파일을 수동으로 만드는 명령. 오늘날은 udev가 대신한다.
- **udev** : 장치 착탈 이벤트를 받아 `/dev` 장치 파일을 만들고 지우는 사용자 공간 데몬.
- **지속적 장치 이름(persistent naming)** : udev 규칙으로 특정 장치에 늘 같은 이름을 주는 것. `/dev/sdb`↔`/dev/sdc`가 뒤바뀌는 문제를 막는다.
- **CUPS / cupsd** : 리눅스 표준 인쇄 시스템과 그 데몬. IPP 기반이며 631 포트에 웹 UI를 띄운다.
- **System V vs BSD 인쇄 계열** : `lp`/`lpstat`/`cancel`(옵션 `-d`) vs `lpr`/`lpq`/`lprm`(옵션 `-P`). CUPS가 둘 다 받는다.
- **`lpadmin`** : 프린터를 추가·설정하고 기본 프린터를 정하는 관리자 명령. 조회용 `lpstat`과 헷갈리기 쉽다.
- **ALSA** : 커널의 표준 사운드 시스템. `/dev/snd/` 장치 파일을 제공하며 구형 OSS(`/dev/dsp`)를 대체했다.
- **`alsamixer` vs `amixer`** : 화살표로 조작하는 대화형 화면 믹서 / 인자로 값을 주는 명령행 믹서(스크립트용).
- **PulseAudio / PipeWire** : ALSA 위에서 여러 앱의 소리를 섞고 출력 장치를 바꿔 주는 사운드 서버.
- **SANE** : 스캐너 표준. 모델별 드라이버인 **백엔드**(`/etc/sane.d/`)와 사용자 도구인 **프론트엔드**(`scanimage`)로 나뉜다.
- **`sane-find-scanner` vs `scanimage -L`** : 버스를 훑어 하드웨어를 찾는 것 / 백엔드가 실제로 인식한 장치만 보여주는 것.

## 📝 연습 문제

**문제 1.** `ls -l /dev/sda`의 권한 첫 글자가 `b`인 것은 무엇을 의미하는가?

A) 백업 파일임을 의미한다

B) 블록 장치로, 블록 단위로 임의 접근하는 디스크류 장치임을 의미한다

C) 부팅 전용 파일임을 의미한다

D) 바이너리 실행 파일임을 의미한다

**정답: B**

해설: 장치 파일의 첫 글자 `b`는 블록 장치(block device)로, 버퍼를 거쳐 블록 단위로 임의 접근하는 디스크·USB·CD 같은 장치를 가리킨다. 문자 장치는 `c`로 표시된다. A·C·D는 `b`의 의미와 무관한 해석이다. 블록 장치만 파일 시스템을 얹어 마운트할 수 있다.

---

**문제 2.** 장치 파일에서 주 번호(major number)가 나타내는 것은?

A) 같은 드라이버 안에서 몇 번째 장치인지

B) 그 장치를 처리하는 드라이버의 종류

C) 장치 파일의 크기

D) 장치의 마운트 포인트

**정답: B**

해설: 주 번호는 그 장치를 처리하는 커널 드라이버를 식별한다. 같은 드라이버가 다루는 여러 장치는 같은 주 번호를 갖고, 그 안에서 부 번호(minor)가 몇 번째 장치인지를 구분한다(A는 부 번호). C·D는 장치 번호와 무관하다. 예: `/dev/sda`와 `/dev/sda1`은 주 번호가 같다.

---

**문제 3.** `udev`의 핵심 역할로 가장 적절한 것은?

A) 커널을 컴파일한다

B) 장치가 착탈될 때 `/dev`의 장치 파일을 동적으로 생성·제거하고 규칙에 따라 이름·권한을 부여한다

C) 인쇄 작업을 큐에 넣는다

D) 패키지 의존성을 해결한다

**정답: B**

해설: udev는 커널의 장치 이벤트를 받아 `/dev` 아래 장치 파일을 동적으로 만들고 지우며, `/etc/udev/rules.d/`의 규칙으로 이름·권한·심볼릭 링크를 부여한다(지속적 장치 이름). A는 make, C는 CUPS, D는 yum/apt의 역할로 모두 udev와 무관하다.

---

**문제 4.** System V 계열 인쇄 명령으로 파일을 'laser' 프린터에 출력하는 올바른 명령은?

A) `lpr -P laser file.pdf`

B) `lp -d laser file.pdf`

C) `lpstat -d laser file.pdf`

D) `lprm -P laser file.pdf`

**정답: B**

해설: System V 계열은 `lp`로 인쇄하며 프린터 지정 옵션은 `-d`(destination)다. A는 BSD 계열(`lpr -P`) 방식이고, C의 `lpstat`은 상태 조회 명령, D의 `lprm`은 작업 취소 명령이라 인쇄에 쓰지 않는다. System V는 `lp -d`, BSD는 `lpr -P`로 구분한다.

---

**문제 5.** 인쇄 큐(대기 중인 인쇄 작업)를 확인하는 명령으로 올바르게 짝지어진 것은?

A) System V: `lpq` / BSD: `lpstat`

B) System V: `lpstat` / BSD: `lpq`

C) System V: `lpadmin` / BSD: `lprm`

D) System V: `cancel` / BSD: `lpr`

**정답: B**

해설: 큐 상태 확인은 System V 계열이 `lpstat`, BSD 계열이 `lpq`다. A는 두 계열을 뒤바꿨다. C의 `lpadmin`은 프린터 관리, `lprm`은 작업 취소이고, D의 `cancel`은 취소, `lpr`은 인쇄라 모두 큐 조회와 다르다.

---

**문제 6.** 다음 중 마운트(mount)할 수 있는 장치로 가장 적절한 것은?

A) 터미널 장치 `/dev/tty0` (문자 장치)

B) USB 저장 장치 `/dev/sdb1` (블록 장치)

C) 키보드 입력 장치 (문자 장치)

D) 마우스 장치 (문자 장치)

**정답: B**

해설: 마운트는 파일 시스템을 가진 블록 장치에만 의미가 있으므로, 블록 장치인 USB 저장 장치(`/dev/sdb1`)를 마운트할 수 있다. A·C·D는 모두 문자 장치로, 바이트 흐름을 다룰 뿐 파일 시스템을 담지 않아 마운트 대상이 아니다.

---

**문제 7.** 리눅스 표준 인쇄 시스템인 CUPS에 대한 설명으로 옳은 것은?

A) System V 계열 명령만 지원하고 BSD 계열 명령은 지원하지 않는다

B) IPP 기반으로 동작하며 `lp`·`lpr` 두 계열 명령을 모두 지원하고 데몬은 cupsd이다

C) 블록 장치를 마운트하는 도구다

D) 커널 모듈을 적재하는 시스템이다

**정답: B**

해설: CUPS(Common Unix Printing System)는 IPP를 기반으로 하며, System V(`lp`)와 BSD(`lpr`) 두 계열 명령을 모두 받아들이고 데몬은 `cupsd`, 웹 UI는 631 포트로 제공한다. A는 한 계열만 지원한다는 점이 틀렸고, C·D는 인쇄와 무관한 다른 기능이다.

---
