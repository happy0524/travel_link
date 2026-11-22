# Tree design 통합 · 2026-11-22

## 보존 및 이력 확인

작업 시작 시 브랜치는 `checkpoint/leaf-node`, HEAD는 `71c42ec`였다. 미커밋 변경을 포함한 src/tests/reference 및 루트 실행·설정·문서를 `test-results/backups/before-tree-integration.zip`으로 보존했고 추적 파일 패치는 `before-tree.patch`에 보존했다. 실제 `.env`는 백업/보고/소스에 복사하지 않았다. reset/브랜치 덮어쓰기는 하지 않았다.

프로젝트와 상위 디렉터리에서 적용할 AGENTS.md는 발견되지 않았다. PROJECT_SPEC.md, README.md, API_REQUEST_EFFICIENCY.md, MAP_STYLE_REVIEW.md, 브랜치 목록과 최근 커밋/reflog를 확인했다. `checkpoint/api-optimized`, `checkpoint/atlas`, `final/high-fidelity`, 기존 stash와 그 untracked 부모의 `map-adapters.js`를 비교했다. 이전 백업도 Mapbox 검색 입력을 막고 렌더링 전환만 제공하므로 이번 Search Box 연결은 **신규 연결**이며 과거 기능 복구로 주장하지 않는다. 일정 엔진/중복 판정/순서 변경/체류 시간과 기존 Google 요청 공유·취소 구조는 유지했다.

## 원인과 변경

- Mapbox 검색: 입력 disabled + oninput/submit early return + API 미연결이었다. `mapbox-search.js`에 suggest → retrieve, UUID 세션(180초/50회 이전 교체, retrieve 후 교체), 350ms debounce, 요청 취소/응답 세대 검사를 추가했다. 이름·주소·분류·좌표는 실제 응답만 사용한다.
- POI: 기존 스타일이 줌 14 이상/낮은 순위만 표시했고 클릭은 첫 피처가 이름 없는 경우 무시됐다. 줌 13부터 주요 POI, 15부터 추가 POI를 표시하고 이름 있는 피처를 선택한다. 읽기 전용 상세 차단을 제거하고 일정 추가·좌표 핀을 연결했다. 타일 POI는 없는 주소/영업/사진/평점을 만들지 않는다.
- 검색 결과 마커와 지도 이동, 일정 추가/선택/삭제/정렬/번호/실제 Directions 경로를 연결했다. Google/Mapbox 출처 데이터는 상대 지도에서 표시·길찾기에 재사용하지 않는다.
- 일정 시간대는 America/New_York로 고정하고 지도 중심과 분리했다. Intl 기반 현지 날짜 및 기존 wallToInstant를 사용한다. 지도 드래그로 저장한 bounds는 첫 로딩에서 복원하고 없으면 뉴욕을 사용한다. 검색 결과로의 자동 이동은 영구 저장하지 않는다.
- reference의 실제 파일 `Current — tree design.png`, `logo1.png`, `map2.jpg`를 확인했다. 지도 전체 배경, 갈색 툴바, 오른쪽 갈색 스크롤 패널, 크림 활자, 원본 잎 마스크, 불규칙 장식 가장자리/구분선을 구현했다. 가장자리는 pointer-events:none인 별도 배경이며 컨텐츠를 자르지 않는다. Coming Soon 폰트와 라이선스를 로컬에 포함했다. 작은 입력값과 한글은 시스템 글꼴로 가독성을 유지한다. 지도 이미지를 배경으로 쓰지 않았다.

주요 파일: `src/tree.css`, `index.html`, `src/app.js`, `src/mapbox-search.js`, `src/mapbox-renderer.js`, `src/mapbox-eucalyptus.js`, `server.mjs`, `public/assets/`.

## 실제 확인과 자동 검사

- 단위 검사 60개: 기존 엔진/Google API 경계·캐시 + Search Box 세션/좌표/오류 + 타일/검색 중복 식별 + 뉴욕 겨울/여름 UTC 변환.
- `node tests/run-browser.mjs`: 실제 키를 사용하지 않는 격리 서버의 새로운 tree UI 검사. 검색 세션, 상세·추가·중복·정렬·삭제, 타일 POI 추가, 날짜/시간, 결과 없음/403/429, 긴 이름/빈 일정, 320/390/1440/1920 너비를 검사한다. 구형 서울 UI 검사는 `LEGACY_UI=1`로 별도 실행하며 새 레이아웃의 합격 기준으로 쓰지 않는다.
- 실제 토큰: Times Square / Central Park suggest와 retrieve HTTP 200. 상세/이동/마커/일정 추가, 중복 방지, 순서 변경/삭제, 한국 시간대 브라우저에서 2027-07-04 일요일 및 13:15 유지. 결과 없음과 인증 실패는 실제 계정 장애를 유발하지 않고 응답 모의로 확인했다.
- 실제 지도 타일 POI 이름/상세/일정 추가/삭제, 지도 드래그, 저장 카메라 복원, 빈 일정 및 페이지 JS 오류 없음 확인. Directions는 기존 실제 API 연결을 유지한다.
- 시각 확인: `test-results/tree-desktop.png`, `tree-1440.png`, `tree-390.png`, `tree-320.png`, `tree-poi-click.png`를 시안과 비교했다. 테스트 스크립트·이미지·백업은 Git 제외 경로에 있다.
- 최종 `tree-final-desktop.png` / `tree-final-mobile.png` 렌더링에서는 실제 네트워크 HTTP 오류와 콘솔 오류가 각각 0개였고, 일정 패널 스크롤이 지도 중심을 이동시키지 않는 것을 확인했다.

이 프로젝트에는 별도의 빌드·타입 검사·린트 스크립트가 없다. Node 구문 검사, 단위 검사와 브라우저 검사를 사용한다.

## 제약과 설정

[공식 Search Box 문서](https://docs.mapbox.com/api/search/search-box/) 기준 미국·캐나다·유럽이 지원 지역이며 한국어는 지원 언어에 포함되지 않는다. 뉴욕에는 영어 검색을 사용한다. suggest/retrieve에는 같은 세션 UUID를 전달한다. 결과는 임시 사용만 가능하므로 검색 장소/일정 응답을 localStorage나 파일로 저장하지 않는다. 영구 일정 저장에는 별도의 데이터 보관 권한 확인이 필요하다. 현재 탭 메모리에서만 사용한다.

사용하는 환경변수는 기존 `MAPBOX_PUBLIC_TOKEN`이다. 실제 토큰으로 검색과 지도가 작동하여 추가 계정 설정은 필요하지 않았다. 향후 401/403이면 공개 토큰 및 허용 URL(로컬호스트 포함)을 확인하고, 429이면 요청 제한을 확인한다. 웹 토큰은 브라우저에 노출되는 값이다. Google 키 설정은 유지했다.

평점/리뷰/사진/운영시간은 이번 실제 Search Box 응답에서 제공되지 않았으므로 생성하지 않는다. 일정은 여행 계획의 뉴욕 시간대를 사용하며 검색 위치를 바꾸어도 시간대는 자동 변경되지 않는다. Mapbox 대중교통은 지원하지 않고 도보/자동차만 제공한다. DST 전환일의 존재하지 않는/중복 현지시각 입력에 대한 별도 선택 UI는 기존 엔진의 남은 범위다.
