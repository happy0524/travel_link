# Travel Link

첫 화면에 Mapbox 지구본과 앙투안 선장의 편지가 표시됩니다. **Begin my journey**는 여행자 이름과 좋아하는 숫자 조합으로 간편 프로필을 엽니다. 이름은 앞뒤 공백과 대소문자 차이를 무시하고, 숫자의 앞자리 0은 유지합니다. 저장된 여행이 있으면 **Previous trips**가 먼저 열립니다. 새 여행은 목적지 현지 날짜와 오전 9시로 시작하며 플래너 헤더에서 변경할 수 있습니다.

기존 이메일 기반 사용자라면 현재 세션의 **Previous trips → Link your traveler profile**에서 새 조합을 등록할 수 있습니다. 로그아웃했다면 [이전 계정 열기](http://localhost:5173/#legacy-access)에서 기존 이메일과 비밀번호 또는 숫자로 먼저 인증합니다. 기존 여행은 같은 내부 사용자 ID에 남습니다.

목적지를 선택하면 실제 현지 시간대가 표시됩니다. 플래너에 처음 들어갈 때 확인 편지와 지구본 상승이 동시에 시작되고, 편지가 사라진 뒤 목적지로 이동합니다. 플래너에서 **My trips**를 누르면 현재 지도 위에서 목록이 열립니다. **Current trip**을 누르면 목록만 닫히고, 다른 여행을 선택하면 지도와 일정이 전환됩니다.

두 편지에는 프로젝트에 포함된 네이버 나눔바른펜을 사용합니다. 라이선스 원문은 `public/assets/nanum-barunpen-license.txt`에 있습니다. [네이버 글꼴 모음](https://hangeul.naver.com/font)

## 실행

Node.js 22.13 이상에서 `npm start`를 실행하고 http://localhost:5173 을 엽니다. Windows 로컬 배포본이 설치되어 있으면 다음 명령으로도 실행할 수 있습니다.

```powershell
.\.tools\node-v24.21.0-win-x64\node.exe --env-file-if-exists=.env server.mjs
```

`.env.example`을 `.env`로 복사해 다음 키를 설정한 뒤 서버를 재시작합니다.

| 설정 | 용도 |
| --- | --- |
| `MAPBOX_PUBLIC_TOKEN` | Mapbox 지도, Search Box, Directions용 공개 웹 토큰 |
| `GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript API, Places API (New), Places UI Kit용 웹 키 |
| `GOOGLE_MAPS_SERVER_KEY` | Google Routes API와 Time Zone API용 서버 키 |
| `GOOGLE_MAPS_MAP_ID` | 선택 사항. Google Cloud에서 게시한 스타일과 연결한 JavaScript 지도 ID |

Google Cloud 프로젝트에 결제를 연결하고 사용할 API를 활성화합니다. 브라우저 키의 HTTP 리퍼러 제한에는 앱을 실제로 여는 주소(예: `http://localhost:5173/*`)를 등록합니다. 서버 키는 서버의 외부 송신 IP와 Routes API 및 Time Zone API로 제한합니다. `.env`는 Git에서 제외되며 브라우저용 키와 Mapbox 공개 토큰은 브라우저 요청에 포함됩니다. 서버 키는 서버에서만 사용합니다. [Google API 키 제한](https://developers.google.com/maps/api-security-best-practices)

## 지도 스타일

공통 색상은 `src/map-palette.js`에서 관리합니다. Mapbox는 Classic Streets v12의 실제 레이어에 색상을 적용합니다. Google의 기본 설정은 Map ID 없이 Raster 지도에 내장 JSON 스타일을 적용합니다. Google의 상업 색상은 `poi.business`에 적용되며 공원은 `poi.park`로 따로 칠합니다. Google 내장 스타일에서 상업 용지와 개별 건물 면은 Mapbox와 같은 단위로 제어할 수 없습니다. [Google 내장 스타일 참조](https://developers.google.com/maps/documentation/javascript/style-reference)

Cloud 스타일이 필요한 경우 아래 명령의 JSON을 Google Maps Platform의 **Map Styles → Create style → JSON**에 붙여넣습니다. 뉴욕에서 육지·물·공원·상업 항목을 미리 본 뒤 스타일을 게시하고, **Map Management**에서 해당 스타일을 JavaScript Map ID와 연결합니다. 이 ID를 `GOOGLE_MAPS_MAP_ID`에 설정하고 서버를 재시작합니다. Map ID 사용 시 앱은 내장 스타일을 전달하지 않으므로 이후 팔레트 변경은 Cloud 스타일에도 게시해야 합니다. [JSON 가져오기 및 Map ID 연결](https://developers.google.com/maps/documentation/javascript/cloud-customization/map-styles)

```sh
node --input-type=module -e "import { greenMapStyles } from './src/map-style.js'; console.log(JSON.stringify(greenMapStyles))"
```

## 일정과 경로

프로필과 여행은 로컬 서버의 `.travel-link/travel.sqlite`에 저장됩니다. 프로필 조회에 사용하는 별도 서버 키 `.travel-link/profile.key`는 DB와 함께 백업하세요. 일정은 자동 저장되며 **Save trip**으로 대기 중인 저장을 즉시 실행할 수 있습니다. 여행 전환이나 로그아웃 전에 저장이 실패하면 현재 여행을 유지합니다. Google Place ID가 연결된 장소는 다시 조회하여 복원합니다. Mapbox 전용 장소는 **Link a Google place to save its location**으로 연결할 수 있습니다. 저장된 식별자가 없는 방문 항목은 **Find a replacement place**로 같은 순서와 체류 시간을 유지하며 다시 연결할 수 있습니다. 여행은 목적지의 Google 지도에서 열리고, 지도 제공사 메뉴에서 Mapbox로 전환할 수 있습니다. [Google 장소 ID 보관](https://developers.google.com/maps/documentation/places/web-service/place-id) · [Mapbox Search Box 보관 제한](https://docs.mapbox.com/api/search/search-box/#search-box-api-restrictions-and-limits)

장소 검색 결과나 지도 핀에서 장소 정보를 열고 일정에 추가합니다. 점 손잡이를 끌거나 위·아래 버튼을 눌러 순서를 변경합니다. 선택한 장소에서 체류시간을 수정할 수 있습니다. 테마가 적용된 날짜·출발 시각 팝오버는 키보드로 선택할 수 있으며 Escape로 닫으면 상단 버튼에 포커스가 돌아옵니다.

Mapbox는 도보와 자동차, Google은 도보·자동차·대중교통을 요청합니다. Mapbox에서 대중교통을 선택하면 일정과 구간을 유지한 채 Google 지도를 열고 실제 구간 출발 시각으로 경로를 요청합니다. 결과가 없거나 요청이 실패하면 해당 구간에서 다시 시도할 수 있습니다. 대중교통이 포함된 일정은 Google 지도에서 표시됩니다. Mapbox 출처 장소를 대중교통에 사용하려면 Google Maps 모드에서 해당 장소를 Google로 검색해 일정에 연결합니다. [Google Routes 정책](https://developers.google.com/maps/documentation/routes/policies) · [Mapbox Search Box 표시 조건](https://docs.mapbox.com/mapbox-search-js/api/core/search/)

대중교통 조회 범위는 현재 기준 과거 7일에서 미래 100일까지입니다. 구간 총 이동시간은 Google이 반환한 경로 전체 소요시간을 한 번만 사용합니다. 제공되는 경우 노선·정류장·환승·도보·요금과 운송기관을 표시합니다. [Google 대중교통 경로](https://developers.google.com/maps/documentation/routes/transit-route)

## 검증

`npm test`는 단위 검사와 서버 프록시 모의 검사를 실행합니다. `npm ci` 후 `npm run test:ui`를 실행하면 설치된 Microsoft Edge에서 API 키 없이 브라우저 회귀 검사를 실행합니다. 테스트용 모의 응답은 `tests/`에만 있습니다. API 자격증명과 로컬 검증 스크린샷은 Git에서 제외합니다.
