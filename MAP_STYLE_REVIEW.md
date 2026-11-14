# Green city diagram · 검토 기록

## 2026-11-15 · 절제된 인쇄/손그림 표현

기존 녹색 기본 지도와 경로 `#86BAEA`를 유지했다. 작업 시작 시 이미 있던 미커밋 변경을
보존했고, checkpoint 브랜치/태그를 수정하거나 commit/push하지 않았다. `.env`는 열지 않았다.

- `src/map-ink.js`: 구간/방문 ID의 고정 해시로 미세한 SVG 곡선과 노드 윤곽 생성.
  실제 route 좌표와 끝점은 유지하며 제어점 오프셋은 메인 0.45px, 보조 0.8px 이내다.
  실제 곡선 편차는 그보다 작다. 원본 polyline과 20px 투명 클릭 경로는 그대로 유지한다.
- `src/app.js`: 원본 casing/클릭 경로 위에 파란 메인 선과 opacity .16의 얇은 보조 잉크선을 겹친다.
  노드 윤곽은 약 ±0.45px의 변화를 주고 숫자와 선택 링을 유지한다.
- `src/map-style.js`: 반복 화살표 팔 길이를 고정 ID로 미세하게 달리하고 약한 곡선으로 그린다.
  기본 지도 스타일 배열은 변경하지 않았다.
- `src/styles.css`: 지도 영역에만 opacity .045의 정적 monochrome SVG grain과 짧은 섬유 표현을 적용한다.
  외부 이미지 요청·애니메이션·타일 읽기·지도 전체 필터는 없다. pointer-events는 none이며
  하단 92px, 오른쪽 64px는 비워 둔다. 패널/컨트롤은 질감 위에 표시된다.
  애니메이션이 없어 reduced-motion에서도 같은 정적 표현을 사용한다.
- `tests/map-ink.test.mjs`, `tests/map-style.test.mjs`, `tests/browser-map-style.mjs`:
  고정 seed, 끝점 유지, 퇴화 경로, 노드 윤곽, 질감 고정/클릭 통과,
  카드 선택과 zoom 복원 후 경로 재현, 두 Map ID 경로를 검증한다.

검증: Node 테스트 52개 통과. 기존 브라우저 및 요청 효율 시나리오의 기대값은 유지한다.
실제 Google 타일/키를 사용하지 않는 fixture 검증이며 실제 Google 고지 표시의 수동 확인은 여전히 남는다.
스케줄·캐시·취소·API provider 동작은 변경하지 않았다.

새 캡처: `test-results/ink-demo-desktop.png`, `ink-demo-mobile.png`,
`ink-live-fallback-desktop.png`, `ink-live-fallback-mobile.png`,
`ink-live-cloud-mock-desktop.png`, `ink-live-cloud-mock-mobile.png`.
Live 캡처는 실제 Google 타일이 아닌 테스트 지도 위 앱 오버레이다.

아래 내용은 최초 녹색 지도 구현 기록이다.

후속 색상 변경: 사용자 요청에 따라 경로·방향 화살표·범례 색상을 `#86BAEA`로 변경했다.
아래 흰색 경로 설명은 최초 구현 기록이며 현재 색상은 `src/styles.css`의 `--route`가 기준이다.

브랜치 `final/high-fidelity`, 기준 `75dfbe2`. 시작 시 working tree clean 확인.
checkpoint 브랜치, `.env`는 변경하지 않았다. `.env`는 읽지 않았으며 커밋/푸시도 하지 않았다.

## 색상과 표시 규칙

| 요소 | 적용 |
| --- | --- |
| 일반 지형 | `#C8D4CB` |
| 일반·지역 도로 | `#6F8F7D` |
| 간선·고속 도로 | `#164F3B` |
| 물 | `#B6C8C1` |
| 공원 | `#4D775F` |
| 건물/인공 지형 | fill `#B4C2B8`, stroke `#789282` (Google geometry 제공 범위) |
| 행정 경계 | `#789282` |
| 라벨 | text `#143B2C`, stroke `#C8D4CB` |
| 노드 | `#164F3B`, 흰 순서 숫자, 링 `#DDE9E1` |
| 선택 노드 | 중심 유지, 반지름 17→21, 링 `#F4F1E8`, 두께 2→5 |
| 경로 | 흰색 `#FFFFFF` 5px 실선, 선택 시 7px |
| 경로 casing | `#164F3B` 8px/선택 11px, opacity .55/.8 |
| 방향 | 약 95 화면 px 간격의 흰 chevron, 녹색 외곽선 |

기본 지도 아이콘(도로 방패 포함), POI 라벨, 대중교통 라벨, 지역 도로 라벨,
지적 라벨과 수면 라벨을 숨긴다. 관광 명소 텍스트는 복원하고 도시·구·동·주요 도로명은 남긴다.
번호가 텍스트로 제공되는 경우 이름과 구분해 숨기는 기능은 Google JSON 스타일이 제공하지 않는다.
roadmap만 사용한다. SVG 순서: casing → 흰 경로 → 화살표 → 구간 라벨 → 노드 → 선택 노드.
선택은 색상 외에도 크기·링·두께로 구분한다. keyboard focus와 기존 hit target은 유지한다.
데모 geometry와 상호작용을 유지하며 같은 팔레트를 적용했다. 카드 높이와 정보 패널 크기는 늘리지 않았다.

## Cloud Map Style 활성화

1. Google Cloud Console에서 기존 Maps 프로젝트를 선택한다.
2. **Google Maps Platform → Map Styles → Create style**에서 기본 지도로 새 스타일을 만든다.
3. 위 표대로 geometry/label을 편집한다. Business POI/Transit 아이콘과 라벨을 숨기고,
   도시·구·동·관광 명소·주요 도로 텍스트는 남긴다. 여러 zoom에서 확인한 뒤 저장하고 **Publish**한다.
4. **Google Maps Platform → Map Management → Create map ID**에서 플랫폼 **JavaScript**로
   Map ID를 생성한다. Raster/Vector는 프로젝트 요구에 맞게 선택한다.
5. Map Style의 **Associated map IDs**에서 생성한 Map ID를 연결하고 저장한다. Published 상태를 확인한다.
6. 사용자가 로컬 `.env`에 `GOOGLE_MAPS_MAP_ID=발급받은_ID`를 직접 설정한다. 기존 API 키는 유지한다.
7. 기존 서버를 종료하고 `.\start.ps1` 또는 기존 Node 시작 명령으로 재시작한다.
   브라우저 새로고침 후 Google 지도 연결을 누른다.
8. 실제 지도에서 도로·라벨과 Google 로고/저작권/약관 링크를 확인한다.
   기본 스타일로 돌아가려면 Map ID 값을 비우고 재시작한다.

Map ID가 없으면 `styles: greenMapStyles`를 사용한다. 설정되면 `mapId`만 전달하며
embedded `styles`는 전달하지 않는다. 색상은 연결된 Cloud 스타일로 결정되므로
Map ID만 생성하고 녹색 스타일을 게시/연결하지 않으면 녹색이 보장되지 않는다.
Cloud와 embedded JSON은 다른 스타일 시스템이므로 배열을 새 Cloud JSON 스키마에
그대로 붙여 넣을 수 있다고 가정하지 않고 표를 기준으로 편집한다. 게시 전파에는 시간이 걸릴 수 있다.

공식 문서: [Cloud styling](https://developers.google.com/maps/documentation/javascript/cloud-customization),
[생성·게시·연결](https://developers.google.com/maps/documentation/javascript/cloud-customization/map-styles),
[Map IDs](https://developers.google.com/maps/documentation/javascript/map-ids/mapid-over).

## 검증 및 요청 수

- Node 테스트 **50개 통과**(기존 48개 + map 옵션/화살표 2개).
- 기존 전체 브라우저 및 효율 테스트 통과. 스타일 검증 JavaScript/console error 0건.
- Map ID 없는 fallback과 `test-map-id` 두 경로를 fixture로 검사했다. 두 옵션은 동시에 전달되지 않는다.
- zoom 13/14/15에서 흰 실선·반복 화살표·녹색 노드·요청 불변 확인.
- 1440×1200 데스크톱, 390×844 모바일 스크린샷 생성 및 육안 검토.
- Live 범례를 바닥에서 56px, 컨트롤을 112px 올리고 모바일 알림도 위로 옮겼다.
  fixture의 하단 22px 고지 영역과 범례가 겹치지 않음을 검사했다.
- 실제 Google SDK/타일/Cloud 스타일 게시 결과는 호출하지 않았다. Live 스크린샷은
  **빈 테스트 지도 위 앱 오버레이**이며 실제 Google 타일 이미지가 아니다.
  DEMO 스크린샷은 실제 SVG 지도다. 실제 Google 로고·저작권 노출은 수동 확인이 남는다.
- `.env`가 ignore되며 tracked 목록에 없는 것을 확인했다. 키 파일의 내용은 읽지 않았다.

동일 Google fixture로 체크포인트와 수정본을 비교한 횟수:

| 시나리오 | Routes 전→후 | 검색 전→후 | Details 전→후 | Time Zone 전→후 |
| --- | --- | --- | --- | --- |
| 4개 장소 추가 | 3→3 | 1→1 | 4→4 | 4→4 |
| A: 카드/Node/Edge/패널/pan/zoom/resize | 0→0 | 0→0 | 0→0 | 0→0 |
| B: 도보 구간 유지 reorder | 1→1 | 0→0 | 0→0 | 0→0 |
| C: 출발시간 연속 4번 편집 | 3→3 | 0→0 | 0→0 | 0→0 |
| D: 같은 장소 반복 검색·열람·선택 | 0→0 | 1→1 | 1→1 | 1→1 |

원시 결과 `test-results/request-comparison.json`, 기준 `75dfbe2`.
실행: `node --test tests/*.test.mjs`, `node tests/run-browser.mjs`, `node tests/compare-requests.mjs`.
이 PC에서는 `.tools/node-v24.21.0-win-x64/node.exe` 사용. 별도 keyless 서버와 모의 응답만 사용했다.

## 스크린샷

- `test-results/green-demo-desktop.png`, `test-results/green-demo-mobile.png`
- `test-results/green-live-fallback-desktop.png`, `test-results/green-live-fallback-mobile.png`
- `test-results/green-live-cloud-mock-desktop.png`, `test-results/green-live-cloud-mock-mobile.png`

## 파일과 제한

- `src/map-style.js`: embedded 스타일, cloud/fallback 옵션 분기, 화면 간격 화살표.
- `src/app.js`: 지도 옵션 연결, 경로/노드 표현과 SVG 순서, 데모 팔레트.
- `src/styles.css`: 녹색 강조, 흰 경로/casing/화살표, 고지 영역 여백, 모바일 범례.
- `server.mjs`, `.env.example`: 선택 Map ID 전달과 빈 placeholder.
- `tests/google-fixture.mjs`: Map 옵션 수집, 서울 좌표 경로, zoom/크기 반영, 고지 공간 fixture.
- `tests/map-style.test.mjs`, `tests/browser-map-style.mjs`: 스타일·옵션·zoom·반응형 검증.
- `tests/browser.mjs`, `tests/browser-changes.mjs`: 새 검증 연결과 기존 색상 기대값 변경.
- `tests/compare-requests.mjs`: 체크포인트의 src 모듈 전체 복사로 전후 검증 지원.
- `README.md`, 이 문서: 사용 안내와 결과.

Google이 제공한 geometry의 색상과 표시만 제어한다. 손그림 왜곡, 임의 필지 모양,
임의 폰트/라벨 위치, 모든 건물의 동일한 세밀도를 재현할 수 없다.
지도 데이터·zoom·렌더러에 따라 건물과 라벨이 다르다.
캐시·취소·스케줄링·요청 provider 로직은 변경하지 않았다.
