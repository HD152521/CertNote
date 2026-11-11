# 애드센스·서치 콘솔 실무 정리 (11-11 조사)

구글 공식 도움말 기준. 공식 근거가 없는 것은 **(비공식)** 으로 표시했다. 출처는 맨 아래.

## 우리 상황에 바로 걸리는 것

- **cert 만 따로 애드센스 사이트로 등록할 수 없다 (공식).** 2023년부터 사이트 목록에는 루트 도메인(`juganlab.com`)만 넣을 수 있고, 기존 사이트에 속한 하위 도메인은 목록에서 빠졌다. 그래서 심사도 루트 기준이다.
  - 승인되면 같은 게시자 코드를 쓰는 하위 도메인(cert)에도 광고가 나간다 (비공식, 커뮤니티 경험). 구글이 하위 도메인 ads.txt 도 크롤링한다는 공식 설명과는 맞는다. 게시자 ID 가 같으면 루트 ads.txt 에 `subdomain=` 줄은 필요 없다.
- **심사 전제: 사이트에 광고 코드가 있어야 하고, 크롤러가 robots.txt 에 막히면 안 된다.** 11-11 확인: 루트·cert 모두 `adsbygoogle.js?client=ca-pub-8773257530258678` 가 들어가 있고, 루트 robots.txt 는 `Allow: /`.
- **"가치가 별로 없는 콘텐츠"에는 공식 숫자 기준이 없다.** 공식 문구는 고유·독창적 콘텐츠, 직접 쓴 전문성·의견, 쓰기 쉬운 탐색 정도다. "글 20편", "글당 800단어" 같은 기준은 비공식 경험칙이다.
- **재신청 대기 기간도 공식으로 정해진 게 없다.** 고친 뒤 정책 센터(또는 사이트 페이지)에서 "검토 요청". 고친 것 없이 반복 신청하지 않는다.
- **루트를 cert 로 리다이렉트하는 안은 계속 기각.** 심사 봇이 리다이렉트를 따라가는지 공식 근거가 없고, "사이트 다운 또는 사용할 수 없음"으로 거절될 위험이 있다.

## 애드센스: 승인 뒤

- **PIN 인증 (공식):** 수익이 확인 기준액(보통 $10)에 닿으면 6자리 PIN 을 결제 주소로 우편 발송한다. 도착까지 2~3주, 발급일부터 4개월 안에 입력해야 하고, **3번 틀리면 광고가 멈춘다.** 결제 주소는 실제로 우편을 받는 주소여야 한다.
- **지급 기준:** 보통 $100 (비공식 자료, 나라마다 다를 수 있음). 세금 정보는 첫 로그인 때 요청받을 수 있다.
- **유럽 방문자 동의 (공식):** EEA·영국·스위스 방문자에게 맞춤 광고를 보여 주려면 구글 인증 CMP 가 필요하다(EEA·영국 2024-01-16, 스위스 2024-07-31부터). 없으면 그 방문자에게는 비맞춤·제한 광고만 나간다. `/en` 이 있으니 승인 뒤 "개인정보 보호 및 메시지"에서 구글 기본 CMP 를 켠다.
- **본인 광고 클릭 금지.** 무효 클릭으로 계정이 정지될 수 있다.

## 서치 콘솔

- **도메인 속성 하나로 (공식).** `juganlab.com` 을 도메인 속성으로 등록하면 루트·cert·www·http/https 가 한 곳에 모인다. 인증은 DNS TXT 레코드라 Namecheap 에 TXT 한 줄만 추가하면 되고, MX 를 건드리지 않아 메일 전달에 영향이 없다. 기존 cert URL 접두어 속성은 기록 보존용으로 둔다.
- **색인 생성 요청은 아껴 쓴다 (공식).** 개별 URL 제출에는 할당량이 있다(하루 10~20개 정도, 비공식). 같은 URL 을 반복 요청해도 빨라지지 않는다. 크롤링에는 며칠~몇 주. 중요한 변경이 1주 넘게 반영 안 됐을 때만 쓴다. 대량은 사이트맵으로.
- **색인 상태 해석 (공식):**

| 상태 | 뜻 | 우리 대응 |
| --- | --- | --- |
| 크롤링됨 - 현재 색인 미생성 | 읽었지만 넣지 않음. "흔하고 꼭 문제는 아니다" | 중요한 페이지만 품질·내부 링크 보강 (PR #55) |
| 발견됨 - 현재 색인 미생성 | 서버 부하를 우려해 크롤링을 미룸, 마지막 크롤링 날짜가 비어 있음 | 크롤링 낭비 줄이기 (PR #50, `?_rsc=` 차단) |
| URL 이 noindex 로 표시됨 | 일부러 막음 | `/en` 2주차 이후는 의도한 것 |
| 사용자가 선택한 표준이 없는 중복 페이지 | 구글이 다른 페이지를 표준으로 고름. 오류 아님 | 잘못 골랐을 때만 canonical 지정 |
| 적절한 표준 태그가 포함된 대체 페이지 | 할 일 없음 | — |
| 리디렉션이 포함된 페이지 | 넘어가는 주소는 색인 안 됨 | 옛 `/aws-certs/` (308) 는 정상 |

- **"수정사항 확인"은 보통 2주쯤 걸린다.** 끝나기 전에 다시 누르지 않는다. 확인을 안 눌러도 재크롤링하면 숫자는 갱신된다.
- **사이트맵 (공식):** `priority`·`changefreq` 는 구글이 무시한다. `lastmod` 는 꾸준히 정확할 때만 쓰고, 저작권 연도 같은 변경은 수정으로 치지 않는다. 한 파일에 5만 개 URL 또는 50MB 까지, 넘으면 사이트맵 색인 파일.
- **IndexNow 는 빙·네이버용.** 구글은 IndexNow 를 쓰지 않는다. 구글에는 사이트맵과 내부 링크로 알린다.

## 순서 (11-11 기준)

1. [x] juganlab-hub PR #1 머지 → 루트 배포 (`/about`·`/log`·`/robots.txt`·`/sitemap.xml` 200, 사이트맵 15개 URL 전부 200)
2. [ ] GSC 에 `juganlab.com` 도메인 속성 추가(Namecheap TXT) → 사이트맵 `https://juganlab.com/sitemap.xml` 제출 → 루트 `/`·`/log`·`/about` 색인 요청
3. [ ] 1~2주 뒤 GSC 에서 루트 글 페이지가 크롤링된 것 확인 → 애드센스 "검토 요청"
4. [ ] 승인 뒤: PIN 우편 대기·입력, 구글 CMP 켜기

## 출처

- AdSense 사이트 관리 변경(하위 도메인): https://support.google.com/adsense/answer/12170421
- AdSense ads.txt FAQ(하위 도메인): https://support.google.com/adsense/answer/9785052
- AdSense 자격 요건: https://support.google.com/adsense/answer/9724
- AdSense 사이트 준비 팁: https://support.google.com/adsense/answer/7299563
- AdSense PIN 인증: https://support.google.com/adsense/answer/1709858
- AdSense 지급 기준: https://support.google.com/adsense/answer/1709871
- AdSense 사이트 문제 해결: https://support.google.com/adsense/answer/113061
- 유럽 동의 관리(CMP) 요건: https://support.google.com/admanager/answer/13554116
- 서치 콘솔 페이지 색인 보고서: https://support.google.com/webmasters/answer/7440203
- 서치 콘솔 속성 종류: https://support.google.com/webmasters/answer/34592
- 재크롤링 요청: https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- 사이트맵 작성: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- URL 검사 API 한도: https://developers.google.com/webmaster-tools/limits
- 비공식: https://www.webmasterworld.com/google_adsense/5120321.htm , https://www.monetizemore.com/adsense-payment-threshold-explained/
