# Search Console 을 Claude 가 읽게 하는 방법 (사용자가 한 번만)

Claude 가 색인 현황(URL 검사, 검색 실적)을 직접 보기 위한 읽기 전용 연결이다. 키는 레포 밖에 두고 커밋하지 않는다.

1. https://console.cloud.google.com 에서 프로젝트를 하나 고른다(새로 만들어도 된다).
2. "API 및 서비스 → 라이브러리" 에서 **Google Search Console API** 를 사용 설정한다.
3. "IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기". 이름은 `certnote-gsc-reader` 정도. 역할은 주지 않아도 된다.
4. 만든 서비스 계정 → "키" 탭 → "키 추가 → 새 키 만들기 → JSON". 받은 파일을
   `C:\Users\yongsik\.secrets\certnote-gsc.json` 에 둔다(레포 안에 두지 않는다).
5. https://search.google.com/search-console 에서 `cert.juganlab.com` 속성 → 설정 → 사용자 및 권한 → 사용자 추가.
   이메일은 서비스 계정 주소(`...@<프로젝트>.iam.gserviceaccount.com`), 권한은 **제한됨**(읽기 전용). URL 검사가 권한 오류로 막히면 그때 **전체**로 올린다.
6. 끝나면 Claude 에게 "GSC 연결했어" 라고 알려 준다. 속성이 도메인 속성(`sc-domain:juganlab.com`)인지 URL 속성인지도 알려 주면 좋다.

Claude 가 하는 일: 사이트맵 URL 을 URL Inspection API 로 확인해(하루 2,000건 한도) 색인 안 된 이유별로 묶고, 검색 실적에서 노출은 되는데 클릭이 없는 페이지를 찾는다. 쓰기(사이트맵 제출 등)는 하지 않는다.
