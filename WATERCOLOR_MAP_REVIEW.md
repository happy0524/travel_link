# Watercolor City Map · 구현 및 검증

## Git 안전 확인

`final/high-fidelity`에서 작업했다. 시작 시 HEAD는 `71c42ec`이고 로컬/원격
`checkpoint/leaf-node`가 같은 커밋으로 Leaf/잉크 구현을 보존함을 확인했다.
기존 `.gitignore`, `design-references/README.md` 변경은 보존했다.
checkpoint 브랜치/태그/main을 변경하지 않았고 commit/push/stage도 하지 않았다.
`.env`는 읽거나 출력하거나 수정하지 않았다.

## 실제 레퍼런스 관찰

`design-references/map3-watercolor-city-reference.jpg`(750×1125)를 직접 열어 확인했다.
따뜻한 회백색 종이 위에 파란 물이 넓게 칠해져 있다. 물에는 미세한 입자와 밝고 어두운
농도 차이가 있고, 공원은 짙은 녹색과 연두가 섞인다. 검은 도로의 간선은 굵고 골목은
가늘며, 격자 교차점의 잉크 겹침과 불완전한 선이 인쇄물 느낌을 만든다.
거의 없는 라벨, 낮은 채도의 색면, 높은 명도의 종이와 어두운 도로의 대비가 핵심이다.
참고 이미지의 픽셀/부분/배경을 앱 자산으로 사용하지 않았다.

## 구현

`src/map-style.js`의 `watercolorMapStyles`를 Google embedded 스타일로 적용한다.

| 요소 | 색/규칙 |
| --- | --- |
| 육지 | `#E8E3DA` |
| 건물 | `#DED9CF`, 경계 `#68636A` |
| 물 | `#9BC9E8` |
| 공원 | `#57945B` |
| 보조 자연 지형 | `#86AD75` |
| 고속/주요 도로 | `#1D1C22`, weight 3.8 / 2.8 |
| 일반 도로 | `#34313A`, weight 1.4 |
| 작은 도로 | `#555059`, weight .7 |
| 라벨 | `#242129`, 종이색 외곽 |
| 여행 경로 | 기존 `#86BAEA` 유지, 종이색 casing으로 검은 도로·파란 물과 구분 |
| 방문 노드 | 기존 `#164F3B`, 손그림 윤곽과 숫자·선택 링 유지 |
| 종이 강조 | `#F2EEE6` |

도로 색만 바꾸는 대신 일반/골목/간선의 선 굵기를 명시적으로 구분했다.
라벨은 기본적으로 끄고 도시와 동네 이름만 복원한다. POI·교통·관광 명소·도로 라벨과
아이콘을 줄였다. Travel Link의 장소 이름·방문 순서·도착시간은 계속 보인다.
Google geometry는 읽거나 추출하거나 다시 그리지 않는다.

기존 정적 paper grain(.045)을 유지하고 별도의 저주파 monochrome wash(.035)를 겹친다.
wash는 수역을 추측하는 파란 얼룩이 아니라 중립적인 종이 농도다.
고정 SVG seed를 사용하는 data URI여서 외부 요청·애니메이션·타일 접근이 없다.
두 레이어 모두 pointer-events:none이며 오른쪽 64px와 하단 92px를 비워 고지/컨트롤을 보호한다.
패널과 버튼에는 질감이 적용되지 않는다. Google 지도 요소 자체에는 CSS filter를 걸지 않는다.

데모는 기존 geometry를 유지하고 종이색 건물·가는 잉크 윤곽·강한 간선으로 바꿨다.
`src/map-paint.js`는 데모 물/공원 도형에만 pigment 필터를 제공한다.
SourceGraphic 내부로 고정 노이즈를 clip하고 multiply해 색면 안의 농도를 변화시킨다.
원본 경계/좌표는 이동하지 않으며 Google 지도에는 이 필터를 적용하지 않는다.
여행 경로·화살표·노드의 결정적인 손그림 표현과 클릭 판정은 유지한다.

## Map ID가 설정된 경우

Map ID가 없으면 새 atlas embedded 스타일이 바로 적용된다.
Map ID가 있으면 기존처럼 **mapId만** 전달한다. embedded 스타일과 섞지 않는다.
따라서 연결된 Cloud 스타일이 Leaf 스타일이면 Google Console에서도 갱신해야 한다.
실제 환경 설정을 읽지 않았으므로 현재 사용자의 Map ID 유무를 단정하지 않는다.

1. Google Cloud Console → Google Maps Platform → Map Styles → Create style.
2. JSON import에서 `docs/watercolor-map-style.json`을 가져와 변환된 스타일을 확인한다.
3. zoom별 물/녹지 색, 도로 굵기와 라벨을 확인하고 Save → Publish한다.
4. Associated map IDs에서 기존 JavaScript Map ID에 연결한다.
5. 지도 새로고침 후 실제 Google 타일과 로고/법적 고지가 보이는지 확인한다.

배열은 embedded JSON 형식이다. Cloud 에디터에서 import/변환해 사용하며,
Cloud 스키마와 동일하다고 가정하지 않는다. 설정 파일에는 키/실제 Map ID가 없다.

공식 근거:
[JSON style reference](https://developers.google.com/maps/documentation/javascript/style-reference),
[Cloud 스타일 생성·게시·연결](https://developers.google.com/maps/documentation/javascript/cloud-customization/map-styles).

## 검증과 한계

Node 테스트 53개, 기존 전체 브라우저 테스트와 API 효율 검증이 모두 통과했다.
fallback/모의 Map ID 경로, zoom 13/14/15, desktop/mobile, 질감의 고정성과 클릭 통과,
경로 색, 노드 선택, 기존 스케줄 및 취소 동작을 검증했다. JavaScript/console 오류는 0건이었다.
스크린샷은 `test-results/atlas-demo-{desktop,mobile}.png`,
`atlas-live-fallback-{desktop,mobile}.png`, `atlas-live-cloud-mock-{desktop,mobile}.png`에 생성한다.
Live 이미지는 실제 Google 타일이 아닌 테스트 지도 위 앱 오버레이다.

Leaf 체크포인트 `71c42ec`와 같은 fixture 시나리오를 비교한 결과:

| 시나리오 | Routes 전→후 | 검색 전→후 | Details 전→후 | Time Zone 전→후 |
| --- | --- | --- | --- | --- |
| 4개 장소 추가 | 3→3 | 1→1 | 4→4 | 4→4 |
| A: UI·지도 이동 | 0→0 | 0→0 | 0→0 | 0→0 |
| B: 도보 구간 유지 정렬 | 1→1 | 0→0 | 0→0 | 0→0 |
| C: 연속 시간 편집 | 3→3 | 0→0 | 0→0 | 0→0 |
| D: 동일 장소 반복 사용 | 0→0 | 1→1 | 1→1 | 1→1 |

원시 결과는 `test-results/request-comparison.json`이다. 참고 이미지는 앱 소스에 연결하지
않았으며 Git ignore 상태를 확인했다. 스크린샷은 생성 후 직접 열어 데스크톱/모바일을 검토했다.

Google JSON 스타일은 수역/공원 내부의 수채화 안료 농도나 도로의 불규칙한 잉크를
직접 제어하지 못한다. 지도 전체 필터나 가짜 지형으로 이를 흉내 내지 않았다.
실제 Live에서는 Google 색면·도로 위계와 중립 종이 질감, 앱의 손그림 오버레이로 근사한다.
데모에서는 소유한 SVG 도형 내부에 추가적인 pigment 효과를 낸다.
Google의 도로 굵기/건물 표시/라벨은 zoom·지역·렌더러마다 차이가 있다.
실제 API quota를 쓰지 않으므로 실제 타일·Cloud 게시 결과·Google attribution은 수동 확인이 남는다.

변경 범위: `src/map-style.js`, `src/map-paint.js`, `src/app.js`의 데모 스타일,
`src/styles.css`, 스타일 검증 테스트, `docs/watercolor-map-style.json`, README와 이 문서.
API provider, 서버 API, 캐시, debounce, 일정 계산은 수정하지 않았다.
