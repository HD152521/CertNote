# Day 1 - 패키지 관리: RPM·YUM/DNF와 DEB·APT 두 계열을 한 손에

리눅스에서 소프트웨어를 설치한다는 것은 결국 **누군가가 미리 컴파일해 묶어 놓은 파일 꾸러미(패키지)를 시스템의 올바른 자리에 풀어 놓고, 그 사실을 데이터베이스에 기록하는 일**이다. 이 "기록"이 핵심이다. 패키지 관리자가 단순한 압축 해제 도구와 다른 이유는, 무엇이 어디에 설치됐고 어떤 버전인지, 무엇이 무엇에 의존하는지를 추적하기 때문이다. 그래서 같은 파일을 `tar`로 풀면 "설치"가 아니지만, `rpm -i`로 풀면 "설치"가 된다.

리눅스 배포판은 크게 두 계열로 갈린다. **Red Hat 계열**(RHEL·CentOS·Rocky·Fedora)은 `.rpm` 패키지와 `RPM`/`YUM`/`DNF` 도구를 쓰고, **Debian 계열**(Debian·Ubuntu·Mint)은 `.deb` 패키지와 `dpkg`/`APT` 도구를 쓴다. 리눅스마스터 1급 실기에서는 두 계열의 명령을 **나란히 비교하는 문제**가 끊임없이 나온다. `rpm -ivh`와 `dpkg -i`, `yum install`과 `apt install`을 짝지어 외우는 것이 오늘의 목표다.

핵심 통찰 하나: 각 계열에는 **저수준 도구**(rpm, dpkg)와 **고수준 도구**(yum/dnf, apt)가 있다. 저수준은 단일 패키지 파일을 직접 다루지만 의존성을 자동 해결하지 못하고, 고수준은 저장소(repository)에서 의존성까지 끌어와 자동으로 처리한다. 이 2단 구조를 이해하면 어떤 변형 문제도 풀린다.

## RPM — Red Hat 계열의 저수준 패키지 도구

`rpm`(Red Hat Package Manager)은 단일 `.rpm` 파일을 설치·삭제·조회하는 가장 기본 도구다. 패키지 파일 이름 자체가 정보를 담는다.

```bash
# httpd-2.4.6-97.el7.x86_64.rpm
#  └이름  └버전  └릴리스 └배포판 └아키텍처
```

설치·삭제·업그레이드는 대문자가 아닌 **소문자 단일 옵션 + 보조 옵션** 조합으로 한다.

```bash
rpm -ivh httpd-2.4.6-97.el7.x86_64.rpm   # 설치(install) + verbose + hash 진행막대
rpm -Uvh httpd-2.4.6-98.el7.x86_64.rpm   # 업그레이드(없으면 새로 설치)
rpm -Fvh httpd-2.4.6-98.el7.x86_64.rpm   # Freshen(이미 설치된 것만 갱신)
rpm -e httpd                              # 삭제(erase) — 파일명 아닌 패키지명
```

> 💡 **개념**: `-i`(install)와 `-U`(Upgrade)의 결정적 차이는 **기존 버전 처리**다. `-i`는 이미 설치돼 있으면 "already installed" 오류를 내며 멈추지만, `-U`는 기존 버전을 지우고 새 버전으로 교체한다. 게다가 `-U`는 설치된 적이 없어도 새로 설치한다. 그래서 실무에서는 `-Uvh`를 가장 많이 쓴다. `-F`(Freshen)는 한 발 더 나아가 **이미 설치된 패키지만** 갱신하고, 미설치 패키지는 건드리지 않는다.

조회(query)는 대문자 `-q`를 기반으로 한다. 여기가 시험 단골이다.

```bash
rpm -qa                # 설치된 모든 패키지 목록(all)
rpm -q httpd           # 특정 패키지 설치 여부 + 버전
rpm -qi httpd          # 상세 정보(information)
rpm -ql httpd          # 그 패키지가 설치한 파일 목록(list)
rpm -qf /usr/sbin/httpd  # 이 파일이 어느 패키지 소속인지(file)
rpm -qc httpd          # 설정 파일만(config)
rpm -V httpd           # 설치 후 변조 여부 검증(Verify)
```

| 옵션 | 의미 | 자주 쓰는 형태 |
|------|------|----------------|
| `-i` | install | `rpm -ivh pkg.rpm` |
| `-U` | Upgrade(없으면 설치) | `rpm -Uvh pkg.rpm` |
| `-F` | Freshen(설치된 것만) | `rpm -Fvh pkg.rpm` |
| `-e` | erase(삭제) | `rpm -e pkg` |
| `-v -h` | verbose + 진행막대(#) | 설치 시 함께 |
| `-qa` | 전체 목록 | `rpm -qa \| grep ...` |
| `-ql` | 패키지의 파일 목록 | 어디에 깔렸나 |
| `-qf` | 파일→패키지 역추적 | `rpm -qf /경로` |

> 🔍 **더 깊이**: `rpm -qf`(file→package)와 `rpm -ql`(package→files)는 **정반대 방향의 조회**다. "이 파일은 누가 깔았지?"는 `-qf`, "이 패키지는 뭘 깔았지?"는 `-ql`. 시험에서 이 둘을 바꿔치기한 오답이 거의 항상 함께 나온다. `q`(query)가 빠지면 안 된다는 점도 함정이다 — `rpm -f`는 존재하지 않는 조합이다.

> ⚠️ **함정**: `rpm -ivh`로는 **의존성을 자동 해결하지 못한다**. A 패키지가 B를 요구하면 "Failed dependencies: B is needed" 오류를 내고 멈춘다. 강제로 무시하려면 `--nodeps`를 쓸 수 있지만 시스템이 깨질 수 있어 권장되지 않는다. 의존성 자동 해결이 바로 다음에 나오는 YUM/DNF의 존재 이유다.

```bash
# 직접 쳐보기 — rpm 조회 연습 (RHEL/CentOS 계열에서)
rpm -qa | wc -l                # 설치된 패키지 개수
rpm -qa | grep kernel          # 커널 관련 패키지
rpm -qi bash                   # bash 패키지 상세
rpm -ql coreutils | head       # coreutils가 깐 파일들
rpm -qf /bin/ls                # ls는 어느 패키지 소속?
```

## YUM / DNF — 의존성을 자동 해결하는 고수준 도구

`rpm`의 의존성 지옥(dependency hell)을 해결하기 위해 등장한 것이 **YUM**(Yellowdog Updater Modified)이고, 그 후속이 **DNF**(Dandified YUM)다. 둘은 명령 체계가 거의 같아 `yum`을 `dnf`로 바꿔도 대부분 동작한다. RHEL 8부터 기본은 DNF이며 `yum`은 dnf의 심볼릭 링크다.

핵심 차이는 **저장소(repository)에서 의존성까지 자동으로 끌어온다**는 점이다. `/etc/yum.repos.d/*.repo`에 정의된 저장소 URL에서 필요한 패키지를 모두 내려받아 한꺼번에 설치한다.

```bash
yum install httpd          # httpd + 필요한 모든 의존성 자동 설치
yum remove httpd           # 삭제(의존성 고려)
yum update                 # 모든 패키지 업데이트
yum update httpd           # 특정 패키지만 업데이트
yum search keyword         # 이름·설명에서 검색
yum info httpd             # 패키지 정보
yum list installed         # 설치된 패키지 목록
yum repolist               # 활성 저장소 목록
yum clean all              # 캐시 정리
yum groupinstall "Development Tools"   # 패키지 그룹 설치
```

| 작업 | RPM(저수준) | YUM/DNF(고수준) |
|------|-------------|------------------|
| 설치 | `rpm -ivh pkg.rpm` | `yum install pkg` |
| 삭제 | `rpm -e pkg` | `yum remove pkg` |
| 업그레이드 | `rpm -Uvh pkg.rpm` | `yum update pkg` |
| 의존성 | 수동(오류만 표시) | **자동 해결** |
| 패키지 출처 | 로컬 .rpm 파일 | 저장소(인터넷) |
| 검색 | 불가(설치된 것만) | `yum search` |

> 💡 **개념**: `rpm install`과 `yum install`의 입력이 다르다. `rpm`은 **로컬 .rpm 파일 경로**를 주지만, `yum`은 **패키지 이름**만 준다(`yum install httpd`, 파일명·경로 없음). yum이 저장소에서 알아서 찾아 받기 때문이다. 시험에서 "인터넷 저장소에서 의존성까지 자동 설치하는 명령"의 답은 항상 yum/dnf 쪽이다.

> 🔍 **더 깊이**: `yum repolist`는 현재 활성화된 저장소를 보여준다. 저장소는 `/etc/yum.repos.d/` 아래 `.repo` 파일로 정의되며, 각 파일에는 `[저장소ID]`, `baseurl=`, `enabled=1`, `gpgcheck=1` 같은 항목이 들어간다. `gpgcheck=1`이면 패키지의 GPG 서명을 검증해 변조·위조를 막는다. 사내망에서는 로컬 미러 저장소를 만들어 `baseurl=file:///경로`로 가리키기도 한다.

> ⚠️ **함정**: `yum remove`로 어떤 패키지를 지우면 **그것에 의존하던 다른 패키지도 함께 제거**될 수 있다. 무심코 핵심 라이브러리를 지우면 시스템이 마비된다. 삭제 전 yum이 보여주는 "Removing" 목록을 반드시 확인해야 한다. 또 `yum update`(전체)와 `yum update 패키지`(개별)를 혼동하면 안 된다.

```bash
# 직접 쳐보기 — yum/dnf
yum repolist                   # 어떤 저장소가 켜져 있나
yum list installed | head      # 설치 패키지 일부
yum info bash                  # bash 패키지 정보
yum search editor              # 'editor'가 들어간 패키지 검색
# dnf로도 동일하게 동작
dnf repolist
```

## DEB · dpkg — Debian 계열의 저수준 패키지 도구

Debian 계열의 패키지는 `.deb` 확장자를 갖고, 이를 직접 다루는 저수준 도구가 `dpkg`다. RPM의 `rpm`에 대응한다고 보면 된다. `.deb` 파일명도 정보를 담는다.

```bash
# nginx_1.18.0-6_amd64.deb
#  └이름  └버전     └아키텍처
```

```bash
dpkg -i nginx_1.18.0-6_amd64.deb   # 설치(install)
dpkg -r nginx                       # 삭제(remove) — 설정 파일은 남김
dpkg -P nginx                       # 완전 삭제(Purge) — 설정까지 제거
dpkg -l                             # 설치된 패키지 목록(list)
dpkg -l nginx                       # 특정 패키지 상태
dpkg -L nginx                       # 그 패키지가 설치한 파일 목록(List files)
dpkg -S /usr/sbin/nginx             # 이 파일이 어느 패키지 소속인지(Search)
dpkg -s nginx                       # 패키지 상태·정보(status)
```

| 작업 | RPM 명령 | dpkg 명령 |
|------|----------|-----------|
| 설치 | `rpm -ivh pkg.rpm` | `dpkg -i pkg.deb` |
| 삭제(설정 유지) | `rpm -e pkg` | `dpkg -r pkg` |
| 완전 삭제 | (해당 없음) | `dpkg -P pkg` |
| 전체 목록 | `rpm -qa` | `dpkg -l` |
| 패키지의 파일 | `rpm -ql pkg` | `dpkg -L pkg` |
| 파일→패키지 | `rpm -qf 파일` | `dpkg -S 파일` |

> 💡 **개념**: dpkg에서 `-r`(remove)과 `-P`(Purge)의 차이를 기억하자. `-r`은 프로그램 파일만 지우고 **설정 파일(/etc 아래)은 남긴다** — 나중에 재설치할 때 설정을 보존하기 위함이다. `-P`(Purge)는 설정 파일까지 완전히 제거한다. RPM에는 이 구분이 없다(`rpm -e`는 설정도 함께 제거).

> 🔍 **더 깊이**: 대소문자에 주의해야 한다. `dpkg -l`(소문자 L)은 **설치 목록**, `dpkg -L`(대문자 L)은 **특정 패키지가 깐 파일 목록**이다. `rpm`에서 `-ql`과 `-qa`가 갈리는 지점이 dpkg에서는 `-L`과 `-l`의 대소문자로 갈린다. 시험에서 이 대소문자를 바꾼 오답이 자주 출제된다.

> ⚠️ **함정**: `dpkg -i`도 `rpm -ivh`처럼 **의존성을 자동 해결하지 못한다**. 의존성이 빠지면 패키지가 "설치됐지만 설정 안 됨" 상태로 남는다. 이때 `apt-get install -f`(fix-broken)로 의존성을 메우거나, 처음부터 `apt`를 쓰는 것이 정석이다.

## APT — Debian 계열의 고수준 도구

`APT`(Advanced Package Tool)는 YUM/DNF에 대응하는 고수준 도구로, 저장소에서 의존성까지 자동으로 끌어온다. 과거 `apt-get`/`apt-cache`로 나뉘어 있던 것을 통합한 `apt` 명령이 현재 표준이다.

```bash
apt update                  # 저장소 패키지 목록 갱신(설치 아님!)
apt upgrade                 # 설치된 패키지 업그레이드
apt install nginx           # 설치(의존성 자동)
apt remove nginx            # 삭제(설정 유지)
apt purge nginx             # 완전 삭제(설정까지)
apt search keyword          # 검색
apt show nginx              # 패키지 정보
apt list --installed        # 설치 목록
apt autoremove              # 더 이상 필요 없는 의존성 정리
```

> 💡 **개념**: `apt update`와 `apt upgrade`를 혼동하면 안 된다. **`apt update`는 패키지를 설치·갱신하지 않는다.** 저장소에서 "어떤 패키지의 어떤 버전이 있는지" 목록(인덱스)만 갱신한다. 실제 업그레이드는 `apt upgrade`가 한다. 그래서 항상 `apt update && apt upgrade` 순서로 쓴다. YUM의 `yum update`는 이 두 단계를 한 번에 하는 점이 다르다.

| 작업 | YUM/DNF | APT |
|------|---------|-----|
| 저장소 목록 갱신 | (자동) | `apt update` |
| 업그레이드 | `yum update` | `apt upgrade` |
| 설치 | `yum install pkg` | `apt install pkg` |
| 삭제 | `yum remove pkg` | `apt remove pkg` |
| 검색 | `yum search` | `apt search` |
| 정보 | `yum info` | `apt show` |

> 🔍 **더 깊이**: APT의 저장소 정의는 `/etc/apt/sources.list`와 `/etc/apt/sources.list.d/*.list`에 들어 있고, 각 줄은 `deb URL 배포판 컴포넌트` 형식이다. `apt update`는 이 목록의 URL에서 인덱스(`Packages.gz`)를 받아 로컬 캐시(`/var/lib/apt/lists/`)에 저장한다. 그래서 update를 안 하면 apt는 옛 인덱스만 보고 "최신 버전 없음"이라 잘못 판단한다.

> 📚 **유래/사례**: RPM과 DEB는 1990년대 중반 거의 동시에 등장했다. 둘 다 초기엔 "의존성 지옥"으로 악명 높았다 — A를 깔려면 B가, B를 깔려면 C가 필요한데 사용자가 일일이 손으로 받아야 했다. Debian이 1998년 APT로 먼저 자동 의존성 해결을 선보였고, Red Hat 진영은 yum(2003년경 Fedora 채택)으로 따라잡았다. 오늘날 두 계열의 명령이 데칼코마니처럼 대응하는 것은 결국 같은 문제(의존성·저장소·검증)를 각자 풀어낸 결과다. 이 대응 구조를 표로 외워두면 시험의 절반은 자동으로 맞힌다.

## 마무리

오늘 배운 패키지 관리의 뼈대는 **2계층 × 2계열**이다. 저수준(rpm, dpkg)은 단일 파일을 직접 다루되 의존성을 자동 해결하지 못하고, 고수준(yum/dnf, apt)은 저장소에서 의존성까지 자동으로 처리한다. Red Hat 계열은 `.rpm`/rpm/yum, Debian 계열은 `.deb`/dpkg/apt. `rpm -ivh ↔ dpkg -i`, `yum install ↔ apt install`, `rpm -qa ↔ dpkg -l` 같은 대응을 외우면 어떤 비교 문제도 풀린다. 특히 `apt update`가 "설치가 아니라 목록 갱신"이라는 점, `rpm -qf`와 `-ql`의 방향, dpkg `-l`/`-L` 대소문자가 시험의 핵심 함정이다.

## 📝 연습 문제

**문제 1.** RPM 패키지를 설치하면서, 같은 패키지의 구버전이 이미 설치돼 있으면 교체하고 없으면 새로 설치하며 진행 막대를 표시하는 명령으로 가장 적절한 것은?

A) `rpm -ivh pkg.rpm`

B) `rpm -Uvh pkg.rpm`

C) `rpm -Fvh pkg.rpm`

D) `rpm -qvh pkg.rpm`

**정답: B**

해설: `-U`(Upgrade)는 구버전이 있으면 교체하고 없으면 새로 설치하며, `-v -h`로 상세 출력과 해시 진행막대를 보여준다. A의 `-i`는 이미 설치돼 있으면 오류를 내고 멈춘다. C의 `-F`(Freshen)는 이미 설치된 패키지만 갱신하고 미설치 패키지는 설치하지 않는다. D의 `-q`는 조회 옵션이라 설치에 쓰지 않는다.

---

**문제 2.** 파일 `/usr/sbin/httpd`가 어느 RPM 패키지에 의해 설치되었는지 확인하는 명령은?

A) `rpm -ql /usr/sbin/httpd`

B) `rpm -qf /usr/sbin/httpd`

C) `rpm -qi /usr/sbin/httpd`

D) `rpm -qa /usr/sbin/httpd`

**정답: B**

해설: `-qf`(query file)는 특정 파일이 속한 패키지를 역추적한다. A의 `-ql`은 반대 방향으로, 패키지명을 주면 그 패키지가 설치한 파일 목록을 보여준다. C의 `-qi`는 패키지 정보, D의 `-qa`는 전체 패키지 목록 조회로 모두 파일 경로를 인자로 받지 않는다.

---

**문제 3.** RPM과 비교했을 때 YUM/DNF의 가장 핵심적인 장점은?

A) 패키지를 더 빠르게 압축 해제한다

B) 저장소에서 필요한 의존성까지 자동으로 내려받아 설치한다

C) 설치된 파일을 메모리에 상주시킨다

D) 패키지 파일의 확장자를 변환해 준다

**정답: B**

해설: YUM/DNF의 존재 이유는 의존성 자동 해결이다. 저장소(`/etc/yum.repos.d/`)에 정의된 URL에서 필요한 모든 의존 패키지를 함께 받아 설치하므로 "의존성 지옥"을 피한다. rpm은 의존성이 빠지면 오류만 내고 멈춘다. A·C·D는 패키지 관리자의 기능과 무관한 설명이다.

---

**문제 4.** Debian 계열에서 `dpkg -r`와 `dpkg -P`의 차이로 옳은 것은?

A) `-r`은 설정 파일까지 모두 지우고, `-P`는 프로그램만 지운다

B) `-r`은 프로그램만 지우고 설정 파일은 남기며, `-P`(Purge)는 설정 파일까지 완전히 제거한다

C) 둘 다 동일하게 패키지를 완전히 삭제한다

D) `-r`은 설치 명령이고 `-P`는 삭제 명령이다

**정답: B**

해설: `dpkg -r`(remove)은 프로그램 파일만 제거하고 `/etc` 아래 설정 파일은 보존해 재설치 시 설정을 살린다. `dpkg -P`(Purge)는 설정 파일까지 완전히 지운다. A는 둘을 뒤바꿨고, C는 둘의 차이를 무시했으며, D는 `-r`을 설치로 잘못 본 오답이다(`-i`가 설치).

---

**문제 5.** `apt update` 명령의 역할로 가장 정확한 것은?

A) 설치된 모든 패키지를 최신 버전으로 업그레이드한다

B) 저장소의 패키지 목록(인덱스)을 갱신할 뿐, 실제 패키지를 설치·업그레이드하지는 않는다

C) 더 이상 필요 없는 의존성 패키지를 자동으로 제거한다

D) 손상된 의존성을 자동으로 복구한다

**정답: B**

해설: `apt update`는 저장소에서 "어떤 패키지의 어떤 버전이 있는지" 인덱스만 받아 로컬 캐시(`/var/lib/apt/lists/`)를 갱신한다. 실제 업그레이드는 `apt upgrade`가 한다. A는 `apt upgrade`, C는 `apt autoremove`, D는 `apt-get install -f`의 역할이다.

---

**문제 6.** Red Hat 계열의 `rpm -qa`에 대응하는 Debian 계열의 명령은?

A) `dpkg -L`

B) `dpkg -l`

C) `dpkg -S`

D) `dpkg -i`

**정답: B**

해설: `rpm -qa`는 설치된 전체 패키지 목록을 보여주며, Debian 계열에서는 소문자 `dpkg -l`이 같은 역할을 한다. A의 대문자 `dpkg -L`은 특정 패키지가 설치한 파일 목록, C의 `-S`는 파일→패키지 역추적, D의 `-i`는 설치 명령이다. `-l`과 `-L`의 대소문자 구분이 핵심이다.

---

**문제 7.** 다음 중 고수준 패키지 도구(저장소 기반·의존성 자동 해결)끼리 올바르게 짝지어진 것은?

A) rpm 과 dpkg

B) yum 과 apt

C) rpm 과 apt

D) dpkg 과 dnf

**정답: B**

해설: 고수준 도구는 저장소에서 의존성까지 자동으로 끌어오는 yum/dnf(Red Hat)와 apt(Debian)다. rpm과 dpkg는 단일 패키지 파일을 직접 다루는 저수준 도구다. 따라서 A는 둘 다 저수준, C·D는 저수준과 고수준을 섞어 잘못 짝지은 오답이다.

---
