# Travel Link

서울 샘플로 여행 장소를 연결하고 순서를 직접 편집하는 첫 번째 데모입니다. PROJECT_SPEC.md를 요구사항으로 사용했습니다.

## 실행

현재 컴퓨터: Windows / Git 2.39.1.windows.1. Node.js와 npm이 없어 공식 nodejs.org 배포본의 Node.js 24.21.0 LTS와 npm 11.19.0을 `.tools/node-v24.21.0-win-x64`에 설치했습니다. 시스템 PATH는 변경하지 않았습니다. Git 저장소는 초기화했으며 커밋은 만들지 않았습니다.

프로젝트 폴더에서 실행:

```powershell
.\.tools\node-v24.21.0-win-x64\node.exe --env-file-if-exists=.env server.mjs
```

또는 `.\start.ps1`. 실행 정책으로 ps1이 차단되면 위의 node.exe 직접 실행 명령을 사용하세요. URL은 **http://localhost:5173** (또는 http://127.0.0.1:5173)입니다. 서버는 이 컴퓨터의 루프백 주소에만 바인딩됩니다. 현재 백그라운드 서버 로그는 server.log / server-error.log입니다.

시스템 전역 설치를 원하거나 다른 컴퓨터에서는 [Node.js 공식 다운로드](https://nodejs.org/en/download)에서 Node.js 24 LTS Windows x64 MSI를 설치하고 npm 및 PATH 옵션을 유지한 뒤 터미널을 다시 여세요. `node --version`, `npm.cmd --version`, `git --version`으로 확인합니다. Node 22 이상 필요, 검증 버전은 24입니다.

전역 Node가 있는 환경:

```powershell
npm.cmd start
```

데모 실행에는 npm 패키지 설치가 필요하지 않습니다. Playwright는 브라우저 검증 전용 개발 의존성입니다.

## 사용 흐름

1. 시작할 때 경복궁 → 북촌 → 인사동 → 광장시장 샘플 일정이 표시됩니다.
2. 검색 또는 지도에서 장소를 선택하고 왼쪽 정보 패널의 **일정에 추가**를 누릅니다. 같은 장소는 제공자의 장소 ID 기준으로 한 번만 추가됩니다. 이미 추가한 장소는 **이미 추가됨 · 일정에서 보기** 버튼으로 기존 카드와 지도 노드를 선택합니다. 삭제 후에는 다시 추가할 수 있습니다.
3. 카드의 점 손잡이를 드래그하거나 ↑/↓ 버튼으로 순서를 변경합니다. 첫 카드도 자유롭게 이동·삭제할 수 있습니다.
4. 구간 또는 지도 화살표를 클릭해 대중교통·도보·자동차를 선택합니다.
5. 체류시간을 편집하고, 필요한 경우 **개장까지 대기**를 선택합니다. 날짜·출발시간 변경도 전체 일정에 반영됩니다.
6. 지도 +/−, 마우스 휠, 배경 드래그로 확대·축소·이동합니다. ⌖은 전체 샘플 영역으로 돌아갑니다.
7. 일정 패널 아래 **데모 검증 도구**로 대중교통 없음, 모든 경로 없음, 네트워크 오류를 시험할 수 있습니다.

첫 추가 방문의 체류시간은 0분, 이후는 60분입니다. 재정렬해도 체류시간은 보존됩니다. 연결된 방문 ID 쌍이 그대로인 구간의 교통 설정만 보존하며 새 구간은 대중교통으로 계산합니다.

## 편집 결과 확인

일정 요약은 **총 이동·총 체류·적용 대기·예상 종료**를 따로 표시합니다. 순서를 바꾸면 모든 구간 계산이 끝난 뒤 직전 계산된 순서 대비 이동시간의 단축/증가/변화 없음을 표시합니다. 종료시각 변화에는 체류·대기도 포함되며 이동시간 변화와 구분합니다.

비교는 12초간 유지하고, 다음 편집 시 새 결과로 교체합니다. 연속 정렬 중 취소된 계산은 기준이나 결과로 반영하지 않습니다. 체류·대기·날짜·교통수단 변경은 이전 비교를 지우므로 체류 축소를 이동 효율 개선으로 표시하지 않습니다. 기준 또는 결과에 미확정 경로가 있으면 **효율 비교 불가**로 표시합니다. 앞선 경로가 미확정인 방문에 대기가 설정되어 있으면 전체 적용 대기도 미확정입니다.

일반 카드 높이는 1440px 데스크톱 기준 약 177px에서 123px로 줄었습니다. 도착·출발·체류를 한 행에 배치하며 긴 이름은 최대 두 줄로 표시합니다. 경고·대기 선택지가 있을 때만 높이가 늘어납니다. 왼쪽 장소 정보 패널의 크기는 유지했습니다.

지도는 기본적으로 번호·장소명과 작은 출발 배지를 표시하고, 선택한 방문만 도착 날짜/시간 또는 시간 미확정 상태를 보여줍니다. SVG 데모와 Google 오버레이 모두 같은 표시 규칙을 사용하며 확대·축소해도 방문 번호의 화면 크기를 유지합니다.

## 데이터 구분

- **DEMO**: 서울 8개 샘플 장소. 좌표는 장소 대표 위치이며 도로·건물 배경은 단순 도식입니다. 직선 화살표와 거리 기반 시간은 시연용이고 실제 길찾기가 아닙니다. 운영시간도 기능 검증용 가상 주간 시간표입니다. 사진 대신 명시적인 장소 기호를 표시합니다.
- **GOOGLE / LIVE**: API 설정 후 상단 버튼으로 전환합니다. Google Maps JavaScript 세계 지도, Places 검색/정보/사진/주간 영업시간, Routes API 경로·이동시간을 요청합니다. 지도에는 응답으로 받은 polyline만 표시합니다. 실제 교통 세부 모드는 응답의 WALK, BUS, SUBWAY 등 값을 조합해 표시합니다.
- 실데이터 전환 시 샘플 일정은 비워집니다. 실데이터와 샘플 경로를 섞지 않습니다.
- API 자격증명이 없어 실제 Google 요청 성공, 사진 표시, 지역별 경로 품질은 **아직 검증하지 못했습니다**.

## Google API 설정

1. Google Cloud 프로젝트를 만들고 결제 계정을 연결합니다.
2. Maps JavaScript API, Places API (New), Routes API, Time Zone API를 활성화합니다.
3. 브라우저용 키: 애플리케이션 제한 **웹사이트/HTTP 리퍼러**, 허용 주소 `http://localhost:5173/*`, `http://127.0.0.1:5173/*`. API 제한은 Maps JavaScript API 및 Places API (New).
4. 서버용 키는 별도로 발급합니다. API 제한은 Routes API 및 Time Zone API. 서버의 외부 통신 IP로 애플리케이션 제한을 설정합니다. 로컬 개발은 공유기의 공인 송신 IP를 사용하며 IP 변경 시 제한을 갱신해야 합니다.
5. `Copy-Item .env.example .env` 후 두 값을 입력합니다.

```dotenv
GOOGLE_MAPS_BROWSER_KEY=your_browser_key
GOOGLE_MAPS_SERVER_KEY=your_server_key
PORT=5173
```

6. 서버를 재시작하고 브라우저를 새로고침한 다음 **Google 지도 연결**을 누릅니다. 처음 실행한 터미널 서버는 Ctrl+C로 종료할 수 있습니다. 현재 백그라운드 서버를 재시작하려면 Windows 작업 관리자에서 명령줄이 이 프로젝트의 server.mjs인 Node 프로세스를 확인하여 종료 후 위 명령을 실행하세요.

브라우저 키는 /api/config와 지도 로딩 URL에 노출되는 공개 키입니다. 환경변수는 브라우저 키를 비밀로 만들지 않습니다. 서버 키는 브라우저 응답에 포함하지 않습니다. .env, .tools, node_modules, 로그, 검증 스크린샷은 Git에서 제외합니다. 개발 서버는 정적 공개 파일을 명시적으로 제한하여 .env와 server.mjs를 제공하지 않습니다. [공식 키 제한 지침](https://developers.google.com/maps/api-security-best-practices)

## 지원 범위·과금·시간

2026-09-14 공식 문서 확인:

- [지역별 지원 표](https://developers.google.com/maps/coverage)에서 한국의 지도 타일은 지원으로 표시되지만 자동차 및 도보 길찾기는 미지원/낮은 가용성 기호입니다. 이 표에는 대중교통 지원 정보가 포함되지 않습니다. 지도 탐색 가능 여부만으로 경로 지원을 단정하지 않습니다. [Routes 별도 지원 정보](https://developers.google.com/maps/documentation/routes/coverage)도 확인하세요.
- [대중교통 요청](https://developers.google.com/maps/documentation/routes/transit-route)은 현재 기준 과거 7일~미래 100일 범위입니다. 범위를 벗어나면 경로 확인 메시지를 표시합니다. 운전은 과거 출발시각을 거절하고, 도보는 출발시각을 전달하지 않습니다.
- HTTP 성공 응답에서 경로가 없는 경우에만 대중교통 → 자동차를 시도합니다. 인증/할당량/네트워크/지원 요청 오류는 자동 전환하지 않습니다. 자동차도 없거나 요청이 실패하면 시간은 미확정이며 이후 일정도 미확정입니다.
- [공식 가격표](https://developers.google.com/maps/billing-and-pricing/pricing)는 SKU별 월 무료 한도와 사용량 구간을 적용합니다. 확인 시 Dynamic Maps는 월 10,000회 무료 한도 후 첫 구간 1,000회당 US$7, Compute Routes Essentials는 10,000회 후 US$5입니다. 실제 필드와 기능에 따라 Pro/Enterprise SKU가 적용될 수 있고 Places 사진·상세·검색 및 Time Zone 요청은 별도 과금 대상입니다. 무료 사용만 보장하지 않으며 결제 콘솔의 예산 알림과 API 할당량을 설정하세요.
- [Places 최신 데이터 API](https://developers.google.com/maps/documentation/javascript/reference/place)를 사용합니다. 사진이 있으면 저작자 정보를 함께 표시합니다.

샘플 시간대는 각 장소에 명시한 IANA **Asia/Seoul**입니다. 라이브 장소는 좌표를 서버의 Google Time Zone API로 조회해 IANA ID를 얻습니다. 현재 첫 방문의 zone을 일정 시간대로 사용하고, 다른 시간대이거나 확인되지 않은 장소는 추가를 차단합니다. 입력한 날짜/시간은 현지 wall-clock으로 보존하며 provider 경계에서 Intl을 사용해 RFC3339 UTC로 변환합니다. 서울은 DST가 없어 이 데모의 검증 범위에 적합합니다.

## 구조

- src/data.js: 샘플·기본 체류시간·교통수단
- src/engine.js: 순서, 일정, 영업 경고, 대기, 자동 전환 정책
- src/itinerary.js: 목적지 중복 판정, 시간 집계, 정렬 전후 비교 및 최신 응답 관리
- src/providers.js: 데모/실제 경로 공급자
- src/app.js: 화면 이벤트, SVG 샘플 지도 및 Google 오버레이
- src/styles.css: :root의 색상·서체·간격 토큰 및 컴포넌트 스타일
- server.mjs: 의존성 없는 Node HTTP 서버와 Routes/Time Zone 프록시

명세 순서대로 샘플 편집 흐름을 먼저 만들고 Google 연결 코드를 추가했습니다. 중립적인 회색·베이지와 보라색 선택 강조를 사용했습니다.

## 검증

이번 변경 검증 결과: **단위 테스트 22/22, Edge 브라우저 검증 26/26 통과**. 브라우저 검증에는 Google 모의 응답 2개 시나리오가 포함됩니다. 페이지 JavaScript 오류는 0개였습니다.

```powershell
.\.tools\node-v24.21.0-win-x64\node.exe --test tests/engine.test.mjs tests/itinerary.test.mjs
.\.tools\node-v24.21.0-win-x64\node.exe tests/browser.mjs
```

브라우저 테스트 재설치는 로컬 Node 폴더를 현재 PowerShell 세션 PATH에 추가한 뒤 `npm.cmd ci`로 합니다. 브라우저 테스트는 설치된 Microsoft Edge를 headless로 실행하며 서버가 실행 중이어야 합니다.

- Node 테스트: 기존 일정·영업·경로 정책에 더해 이동/체류/대기 분리 집계, 직전 순서 비교, 취소된 응답 무시, 실패한 경로의 비교 차단, 데모/Google 장소 ID 기반 중복 판정을 검증합니다.
- Edge 브라우저 검증: 기존 상호작용 회귀 검증과 함께 카드 높이/가독성, 정렬 전후 지표, 선택한 노드의 시간만 표시, 확대 수준별 번호 크기, 연속 중복 추가, 기존 카드로 이동, 삭제 후 재추가, 키보드 초점, 긴 이름을 확인합니다.
- tests/google-fixture.mjs는 Google 인터페이스와 HTTP 응답을 모의 처리합니다. 같은 Google Place ID의 이름 변경/반복 추가 차단, 같은 이름의 서로 다른 ID 허용, Google 모드 지표·비교·노드 표시를 확인합니다. 실제 Google 네트워크 검증을 대신하지 않습니다.
- JavaScript 페이지 오류 0개. 데스크톱 및 모바일 스크린샷: test-results/demo-desktop.png, test-results/demo-mobile.png, test-results/compact-desktop.png.
- Google 네트워크 연동은 자격증명 부재로 미검증.

## 남은 범위

일정은 현재 탭의 메모리에만 있으며 새로고침 시 샘플로 초기화됩니다. 저장/내보내기, 실제 공휴일 및 날짜별 운영시간 수집, DST 전환일의 모호하거나 존재하지 않는 현지 시각 처리, 라이브 요청 캐시/할당량 최적화는 후속 작업입니다. 영업 계산기는 날짜별 시간표를 받을 수 있지만 Google 어댑터는 정기 주간 시간표만 수집하므로 특정 날짜의 영업을 확정하지 않습니다. 데스크톱 편집 우선이며 휴대폰에서는 ↑/↓ 버튼 사용을 권장합니다. 로그인·예약·결제·자동 최적화는 명세상 범위 밖입니다.

