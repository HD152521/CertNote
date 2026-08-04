# Day 4 - 압축과 아카이브, 그리고 도움말: 파일을 묶고 줄이고, 스스로 배우는 법

## 📌 핵심 정리

- **묶기(아카이브)와 압축은 별개**다. `tar`가 묶고, `gzip`/`bzip2`/`xz`가 줄인다.
- `tar` 3패턴만 손에 익히면 된다 — `czf`(만들기) · `xzf`(풀기) · `tzf`(들여다보기). `f` 뒤엔 항상 파일명.
- 압축률·속도는 반비례: gzip(빠름) < bzip2 < xz(최고 압축, 가장 느림).
- `gzip file`은 **원본을 지운다**. 남기려면 `-k`. `zip`은 디렉터리에 `-r`이 필수다.
- 문서는 `man`(섹션 1=명령, 5=파일 형식), `info`(상세), `whatis`(정확한 이름), `apropos`(키워드 역검색).

## 아카이브의 표준: tar

수백 개 파일을 묶어 백업하거나, 용량을 줄여 전송하거나, 받은 압축 파일을 푸는 일은 끊임없이 생깁니다. 그 출발점이 `tar`입니다.

> 💡 **개념: 아카이브와 압축은 다르다**
> **아카이브(archive)**는 여러 파일과 디렉터리를 하나의 파일로 묶는 작업입니다. 묶기만 할 뿐 크기는 거의 줄지 않습니다. **압축(compression)**은 데이터의 중복 패턴을 제거해 파일 크기를 줄이는 작업입니다. `tar`는 아카이브 도구, `gzip`/`bzip2`/`xz`는 압축 도구입니다. 둘을 결합하면 "여러 파일을 묶어서 작게" 만들 수 있습니다.

- `tar`(tape archive)는 원래 테이프 백업을 위해 만들어진 도구지만, 오늘날에는 파일을 묶는 표준 도구로 쓰입니다.
- 옵션은 조합해서 사용하며, 시험에 가장 자주 나오는 부분입니다.

| 옵션 | 의미 |
|------|------|
| `c` | 새 아카이브 생성(create) |
| `x` | 아카이브 풀기(extract) |
| `t` | 아카이브 내용 보기(list) |
| `v` | 진행 과정 자세히 표시(verbose) |
| `f` | 아카이브 파일명 지정(file) — 거의 항상 필요 |
| `z` | gzip으로 압축/해제 |
| `j` | bzip2로 압축/해제 |
| `J` | xz로 압축/해제 |
| `C` | 지정한 디렉터리로 풀기 |

```bash
tar cvf archive.tar dir/        # dir를 archive.tar로 묶기 (압축 없음)
tar xvf archive.tar            # archive.tar 풀기
tar tvf archive.tar           # 풀지 않고 내용 목록만 보기
tar czvf archive.tar.gz dir/   # gzip 압축하며 묶기
tar xzvf archive.tar.gz        # gzip 압축 아카이브 풀기
tar cjvf archive.tar.bz2 dir/  # bzip2 압축하며 묶기
tar xjvf archive.tar.bz2       # bzip2 아카이브 풀기
tar cJvf archive.tar.xz dir/   # xz 압축하며 묶기
tar xvf archive.tar -C /tmp    # /tmp 디렉터리에 풀기
```

- `f` 옵션 뒤에는 반드시 아카이브 파일명이 와야 하므로, 보통 `cvf`, `xvf`처럼 `f`를 옵션 묶음의 맨 마지막에 둡니다.
- `tar czf backup.tar.gz`에서 `c`(생성), `z`(gzip), `f`(파일명) 세 글자만 봐도 "gzip 압축 백업을 만든다"는 뜻을 읽을 수 있어야 합니다.

> ⚠️ **함정: f 옵션을 빠뜨리면 안 된다**
> `tar cv archive.tar dir/`처럼 `f`를 빠뜨리면, `tar`는 archive.tar를 아카이브 파일명이 아니라 **묶을 대상 파일**로 오해합니다. 그러면 출력을 테이프 장치로 보내려다 오류가 나거나 엉뚱하게 동작합니다. 거의 모든 경우 `f`는 필수이며, 그 바로 뒤에 파일명이 와야 한다는 점을 기억하세요.

> 🔍 **더 깊이: 현대 tar는 압축 형식을 자동 감지한다**
> GNU tar의 최신 버전은 `tar xf archive.tar.gz`처럼 `z`를 빼도 압축 형식을 자동으로 감지해 풀어줍니다. 풀 때는 `z`/`j`/`J`를 생략해도 되는 경우가 많습니다. 다만 **만들 때**는 어떤 압축을 쓸지 명시해야 하므로 `z`/`j`/`J`가 필요합니다. 시험에서는 명시적 옵션을 정확히 아는 것이 안전합니다.

## 단일 파일 압축: gzip, bzip2, xz

`tar`로 묶지 않고 개별 파일 하나만 압축할 때는 압축 도구를 직접 씁니다.

```bash
gzip file.txt           # file.txt → file.txt.gz (원본 삭제됨)
gzip -d file.txt.gz     # 압축 해제 (decompress)
gunzip file.txt.gz      # gzip -d와 동일
gzip -k file.txt        # 원본을 유지하며 압축(keep)
gzip -9 file.txt        # 최대 압축률(1=빠름, 9=최고압축)
gzip -l file.txt.gz     # 압축 정보(압축률 등) 표시

bzip2 file.txt          # file.txt → file.txt.bz2
bunzip2 file.txt.bz2    # bzip2 압축 해제
bzip2 -d file.txt.bz2   # 위와 동일

xz file.txt             # file.txt → file.txt.xz
unxz file.txt.xz        # xz 압축 해제
xz -d file.txt.xz       # 위와 동일
```

> ⚠️ **함정: gzip은 원본을 없앤다**
> `gzip file.txt`를 실행하면 `file.txt.gz`가 생기면서 **원본 `file.txt`는 사라집니다**. 압축 해제 시에도 마찬가지로 `.gz` 파일이 사라지고 원본이 복원됩니다. 원본을 함께 보존하려면 `-k`(keep) 옵션을 써야 합니다. 이를 모르고 압축했다가 원본을 잃는 사고가 흔합니다.

세 도구는 압축률과 속도가 다릅니다.

| 도구 | 확장자 | 압축률 | 속도 | 특징 |
|------|--------|--------|------|------|
| gzip | `.gz` | 보통 | 빠름 | 가장 널리 호환, DEFLATE 알고리즘 |
| bzip2 | `.bz2` | 높음 | 느림 | gzip보다 작게, 더 느리게 |
| xz | `.xz` | 매우 높음 | 가장 느림 | 최고 압축률, LZMA2 알고리즘 |

> 📚 **유래/사례: compress와 .Z의 역사**
> `gzip`(GNU zip)은 1992년 등장했는데, 그 이전에는 `compress` 명령이 표준이었습니다. `compress`는 파일을 `.Z` 확장자로 압축하며 `uncompress`로 풉니다. 그러나 압축에 쓰인 LZW 알고리즘에 특허 문제가 있어, 자유 소프트웨어 진영이 특허에서 자유로운 `gzip`을 만들었습니다. 오늘날 `.Z` 파일은 거의 사라졌지만 시험에는 여전히 등장합니다.

## 윈도우 호환 압축: zip

- `gzip`/`bzip2`/`xz`가 단일 파일만 다루는 것과 달리, `zip`은 **묶기와 압축을 한 번에** 처리합니다.
- 윈도우 환경과 호환되어 파일을 주고받을 때 자주 쓰입니다.

```bash
zip archive.zip file1 file2     # 여러 파일을 묶고 압축
zip -r archive.zip dir/         # 디렉터리를 재귀적으로 압축(recursive)
unzip archive.zip               # 압축 해제
unzip -l archive.zip            # 내용 목록만 보기(list)
unzip archive.zip -d /tmp       # /tmp에 풀기(destination)
zip -e secure.zip file.txt      # 암호를 걸어 압축(encrypt)
```

> 💡 **개념: zip은 왜 -r이 필요할까**
> `zip`은 기본적으로 지정한 파일만 처리하며, 디렉터리를 만나면 그 안의 내용까지 자동으로 포함하지 않습니다. 디렉터리 전체를 묶으려면 `-r`(recursive)을 명시해야 합니다. `tar`가 디렉터리를 자동으로 재귀 처리하는 것과 대조적입니다. 이 차이가 시험과 실무에서 모두 함정으로 작용합니다.

## 도움말 시스템: man

리눅스의 모든 명령을 외울 수는 없습니다. 그래서 시스템에 내장된 매뉴얼을 활용하는 능력이 핵심입니다.

```bash
man ls              # ls 명령의 매뉴얼 보기
man 5 passwd        # 5번 섹션의 passwd 문서 (파일 형식)
man -k network      # network 관련 매뉴얼 검색(apropos와 동일)
man -f ls           # ls의 간단한 설명(whatis와 동일)
```

- 매뉴얼 페이지 안에서는 `vi`처럼 키로 탐색합니다. `Space`로 다음 페이지, `b`로 이전 페이지, `/단어`로 검색, `q`로 종료.
- `man`은 내용을 **섹션(section)**으로 나눕니다. 같은 이름이 명령과 파일 형식 양쪽에 존재할 수 있기 때문입니다.

| 섹션 | 내용 |
|------|------|
| 1 | 일반 사용자 명령 |
| 2 | 시스템 호출 |
| 3 | 라이브러리 함수 |
| 4 | 특수 파일(장치) |
| 5 | 파일 형식과 설정 파일 |
| 6 | 게임 |
| 7 | 기타(매크로, 규약) |
| 8 | 시스템 관리 명령 |

> 🔍 **더 깊이: man 1 passwd vs man 5 passwd**
> `passwd`는 비밀번호를 바꾸는 명령(섹션 1)이기도 하고, 사용자 정보를 담은 파일 `/etc/passwd`의 형식(섹션 5)이기도 합니다. 그냥 `man passwd`를 입력하면 보통 낮은 섹션(1, 명령)이 먼저 나옵니다. 파일 형식을 보려면 `man 5 passwd`처럼 섹션을 명시해야 합니다. 이 섹션 개념은 시험 단골 주제입니다.

## info: 더 풍부한 문서

- `info`는 GNU 프로젝트의 문서 시스템으로, `man`보다 상세하고 하이퍼링크처럼 노드를 오가며 읽을 수 있습니다.
- `info` 안에서는 `n`(다음 노드), `p`(이전 노드), `u`(상위 노드), `Enter`(링크 따라가기), `q`(종료)로 탐색합니다.

```bash
info ls             # ls의 info 문서 보기
info coreutils      # coreutils 전체 문서
```

> 💡 **개념: man과 info의 관계**
> 대부분의 명령은 `man`과 `info` 양쪽에 문서를 두지만, GNU 도구들은 `info` 쪽이 더 자세한 경우가 많습니다. `man`이 빠른 참조용이라면 `info`는 튜토리얼에 가까운 상세 설명용입니다. 둘 중 어느 쪽을 봐야 할지 막막하면 일단 `man`으로 시작하고, 부족하면 `info`를 참고하면 됩니다.

## 빠른 검색: whatis와 apropos

명령 전체 매뉴얼이 아니라 한 줄 요약이나 키워드 검색이 필요할 때 쓰는 도구입니다.

```bash
whatis ls           # ls의 한 줄 설명 출력
whatis cp mv        # 여러 명령의 요약 한꺼번에
apropos copy        # "copy" 키워드를 포함하는 명령 검색
apropos -s 1 network  # 섹션 1에서 network 검색
```

- `whatis`는 "이 명령이 뭐 하는 거지?"라는 질문에 한 줄로 답합니다.
- `apropos`는 "파일 복사하는 명령이 뭐였지?"처럼 **기능으로 명령을 거꾸로 찾을 때** 씁니다. `apropos copy`를 실행하면 cp, dd 등 복사 관련 명령이 줄줄이 나옵니다.

> 📚 **유래/사례: whatis와 apropos의 데이터베이스**
> `whatis`와 `apropos`는 매뉴얼 페이지의 제목 줄만 모아둔 데이터베이스를 조회합니다. 이 데이터베이스는 `mandb`(또는 옛날엔 `makewhatis`) 명령으로 갱신됩니다. 새 소프트웨어를 설치했는데 `whatis`가 못 찾는다면, 데이터베이스가 아직 갱신되지 않았기 때문일 수 있습니다. `man -k`는 `apropos`와, `man -f`는 `whatis`와 완전히 같은 동작을 합니다.

> ⚠️ **함정: apropos와 whatis를 헷갈리지 말 것**
> `whatis ls`는 정확히 `ls`라는 이름의 명령 설명을 찾고, `apropos ls`는 설명에 "ls"가 들어간 모든 명령을 찾습니다. 즉 `whatis`는 정확한 이름 매칭, `apropos`는 키워드 검색입니다. "기능은 아는데 명령 이름을 모를 때는 apropos"라고 기억하면 헷갈리지 않습니다.

## 직접 쳐보기

다음 실습으로 압축과 도움말을 직접 다뤄보세요.

```bash
# 1. 실습용 파일과 디렉터리 만들기
mkdir -p ~/tartest/data
cd ~/tartest
echo "hello" > data/a.txt
echo "world" > data/b.txt

# 2. tar로 묶고 gzip 압축
tar czvf backup.tar.gz data/
ls -lh backup.tar.gz

# 3. 내용 확인 후 다른 곳에 풀기
tar tzvf backup.tar.gz
mkdir restore
tar xzvf backup.tar.gz -C restore/
ls -R restore/

# 4. 단일 파일 압축 (원본 보존)
gzip -k data/a.txt
ls data/

# 5. 도움말 활용
whatis tar
man -f gzip
apropos compress

# 6. 정리
cd ~
rm -rf ~/tartest
```

- `tar`의 옵션 조합은 손으로 여러 번 쳐봐야 익숙해집니다.
- `czf`로 만들고 `xzf`로 풀고 `tzf`로 들여다보는 세 가지 패턴을 반복하면 자연스럽게 외워집니다.

## 📖 용어

- **아카이브(archive)** : 여러 파일·디렉터리를 하나로 묶는 것. 크기는 거의 줄지 않는다.
- **압축(compression)** : 데이터의 중복 패턴을 제거해 파일 크기를 줄이는 것.
- **tar** : 파일을 묶는 표준 도구. 이름은 tape archive(테이프 백업)에서 왔다.
- **`f` 옵션** : tar에서 아카이브 파일명을 지정하는 옵션. 빠뜨리면 대상 파일로 오해한다.
- **gzip / bzip2 / xz** : 단일 파일 압축기 3종. 뒤로 갈수록 더 작아지지만 더 느리다.
- **`-k`(keep)** : 압축하면서 원본을 남기는 옵션. 기본 동작은 원본 삭제다.
- **zip / unzip** : 묶기와 압축을 한 번에 하는 윈도우 호환 도구. 디렉터리는 `-r`가 필수.
- **man 섹션** : 매뉴얼을 종류별로 나눈 번호. 1=명령, 5=파일 형식, 8=시스템 관리 명령.
- **info** : GNU의 문서 시스템. man보다 상세하고 노드를 오가며 읽는다.
- **whatis** : 명령 이름을 정확히 넣어 한 줄 설명을 받는 도구. `man -f`와 같다.
- **apropos** : 키워드로 명령을 거꾸로 찾는 도구. `man -k`와 같다.
- **mandb** : whatis/apropos가 조회하는 매뉴얼 요약 데이터베이스를 갱신하는 명령.

## 📝 연습 문제

**문제 1.** 디렉터리 `data`를 gzip으로 압축하며 아카이브로 묶는 올바른 명령은?

A) `tar xzvf data.tar.gz data/`
B) `tar czvf data.tar.gz data/`
C) `tar tzvf data.tar.gz data/`
D) `tar cjvf data.tar.gz data/`

**정답: B**
해설: `c`는 생성, `z`는 gzip 압축, `v`는 자세히, `f`는 파일명 지정입니다. A의 `x`는 풀기, C의 `t`는 목록 보기이며, D의 `j`는 bzip2 압축이라 `.gz` 확장자와 맞지 않습니다.

---

**문제 2.** `gzip file.txt`를 실행했을 때 원본 `file.txt`는 어떻게 되는가?

A) 그대로 유지되고 file.txt.gz가 추가로 생성된다
B) 삭제되고 file.txt.gz만 남는다
C) file.txt.bz2로 바뀐다
D) 변화 없이 화면에만 압축 결과가 출력된다

**정답: B**
해설: `gzip`은 기본적으로 원본을 삭제하고 압축 파일만 남깁니다. 원본을 유지하려면 `-k`(keep) 옵션이 필요합니다. C는 bzip2의 확장자이고, D는 잘못된 설명입니다.

---

**문제 3.** 압축률이 가장 높은(파일을 가장 작게 만드는) 도구는?

A) gzip
B) bzip2
C) xz
D) compress

**정답: C**
해설: `xz`는 LZMA2 알고리즘으로 세 도구 중 압축률이 가장 높습니다(대신 가장 느림). 압축률 순서는 대체로 xz > bzip2 > gzip > compress입니다.

---

**문제 4.** 디렉터리 전체를 `zip`으로 압축하려고 한다. 올바른 명령은?

A) `zip archive.zip dir/`
B) `zip -r archive.zip dir/`
C) `zip -d archive.zip dir/`
D) `zip -l archive.zip dir/`

**정답: B**
해설: `zip`은 디렉터리를 자동으로 재귀 처리하지 않으므로 `-r`(recursive)을 명시해야 내부 파일까지 포함됩니다. A는 디렉터리 내용을 빠뜨리고, `-d`는 항목 삭제, `-l`은 목록 보기와 관련된 옵션입니다.

---

**문제 5.** `/etc/passwd` 파일의 **형식**에 대한 매뉴얼을 보려면?

A) `man passwd`
B) `man 1 passwd`
C) `man 5 passwd`
D) `man 8 passwd`

**정답: C**
해설: 파일 형식과 설정 파일은 매뉴얼 섹션 5에 있으므로 `man 5 passwd`로 봐야 합니다. 섹션을 지정하지 않은 A나 섹션 1을 지정한 B는 비밀번호 변경 명령(passwd)의 문서를 보여줍니다. 섹션 8은 시스템 관리 명령입니다.

---

**문제 6.** "파일을 복사하는 명령 이름을 모를 때" 기능 키워드로 관련 명령을 찾는 도구는?

A) `whatis copy`
B) `apropos copy`
C) `man copy`
D) `which copy`

**정답: B**
해설: `apropos`는 매뉴얼 설명에 키워드가 포함된 모든 명령을 검색하므로, 기능으로 명령을 거꾸로 찾을 때 적합합니다. `whatis`는 정확한 이름 매칭, `man`은 특정 명령의 매뉴얼, `which`는 실행 파일 경로 찾기입니다.

---

**문제 7.** `tar` 명령에서 거의 항상 필요하며, 바로 뒤에 아카이브 파일명이 와야 하는 옵션은?

A) `v`
B) `c`
C) `z`
D) `f`

**정답: D**
해설: `f`(file)는 아카이브 파일명을 지정하는 옵션으로, 거의 모든 경우 필요하며 바로 뒤에 파일명이 와야 합니다. `v`는 진행 표시, `c`는 생성, `z`는 gzip 압축입니다.

---
