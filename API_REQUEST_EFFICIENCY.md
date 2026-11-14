# Google API 요청 효율 개선 · 검증 기록

검증일: 2026-11-14 (Asia/Seoul). 비교 기준 커밋: `625ce05`.
기존 HTML/CSS/ES modules, Node HTTP 서버, 데모 provider와 시간 계산 엔진을 유지했다.
새 런타임 의존성은 없다. 실제 Google API 호출 없이 검증했다.

## 원인과 기존 호출 흐름

| API | 기존 호출 시점 | 반복 요청의 원인 |
| --- | --- | --- |
| Text Search (New) | 검색 폼 제출 | 빈/짧은 검색어 및 동일 검색 재제출 방지 없음. 입력마다 호출되던 구조는 아님 |
| Place Details | Google 지도 POI 클릭 | 같은 ID라도 매번 새 Place와 fetchFields 사용 |
| Time Zone | 검색 결과 normalizePlace 및 지도 POI 상세 처리 | 선택하지 않은 결과까지 모두 조회, 같은 결과 재검색 시 다시 조회 |
| Routes | 추가·삭제·정렬·체류·대기·날짜·시간·교통수단 변경 | refresh마다 새 provider 생성, 모든 인접 구간 재요청, 앞선 계산 취소는 있지만 결과 재사용/진행 중 요청 공유 없음 |
| Maps JavaScript | Google 연결 버튼 | 최초 연결 시 로드. 카드/Node 선택이나 지도 이동이 로드를 반복하는 구조는 아니었음 |

카드/Node/Edge 선택, 패널 닫기, 지도 확대·이동, ResizeObserver는 기존에도
render 또는 overlay.draw만 호출했다. 이 동작들을 과다 요청의 원인으로 판단하지 않았다.
서버는 `/api/route`, `/api/timezone` 요청마다 바로 Google을 호출했고, 브라우저 취소를
Google 요청 취소에 연결하지 않았다. 대시보드의 175/110/35회 각각을 과거 동작에
정확히 배분할 로그는 없으므로 그 수치의 원인을 단정하지 않는다.

## 적용한 요청 규칙

`src/request-config.js`가 공통 설정 위치다.

| 설정 | 기본값 | 의미 |
| --- | --- | --- |
| searchDebounceMs | 350ms | 기존 검색 버튼/Enter 방식을 유지하고 반복 제출을 합침. 타이핑만으로 Google 요청하지 않음 |
| editDebounceMs | 250ms | 체류·대기·날짜·출발시간·교통수단의 연속 변경을 마지막 상태로 계산 |
| minSearchLength | 2자 | 공백 제거 후 최소 검색 길이 |
| routeCacheTtlMs | 5분 | 현재 일정의 구간 결과 재사용 상한 |
| timeZoneCacheTtlMs | 30분 | 현재 장소의 IANA 시간대 결과 재사용 상한 |
| placeCacheTtlMs | 5분 | 현재 장소 상세 작업 결과 재사용 상한 |
| searchCacheTtlMs | 1분 | 현재 검색 결과 재사용 상한 |
| maxCacheEntries | 128 | 각 메모리 pool의 완료 결과 최대 개수. LRU 방식으로 제거 |
| departureBucketMinutes | 1분 | 자동차/대중교통 출발 시각 키. UI의 1분 해상도와 같아 기본값에서는 시각 근사 없음 |
| instrumentation | false | 개발 계측 기본 비활성화 |

이 TTL은 Google이 허용한 보관 기간을 뜻하지 않는다. 아래 정책 범위를 함께 적용한다.
TTL이 끝나면 다음 데이터 작업에서 재조회하며 화면 선택/렌더만으로 재조회하지 않는다.
TTL을 0으로 하면 해당 pool의 완료 결과 메모이제이션을 끌 수 있다.

- 경로 키: 출발·도착 Place ID 및 좌표, 방향, 교통수단, IANA zone으로 변환한 실제
  출발 시각의 bucket, 언어/단위/TRAFFIC_AWARE 옵션. 날짜와 시간대 차이도 반영한다.
- WALK는 실제 Google payload에 출발 시각이 없으므로 키에서도 제외한다.
- 기본 1분 bucket에서 자동차/대중교통은 1분 변경도 재조회한다. bucket을 늘리면
  같은 구간 내 시간 근사를 허용하는 것이므로 정확도와 교환 관계가 있다.
- 현재 일정의 인접 장소 쌍과 사용 중인 모드만 남기며, 이전 출발 시각 버전은 제거한다.
  새 인접 구간은 기본 대중교통이다. 유지된 방문 ID 쌍의 수단 선택은 기존 reconcile 규칙대로 보존한다.
- 대중교통 `no-route`가 확인된 경우만 자동차로 전환한다. 인증/네트워크 오류를
  no-route로 바꾸거나 가짜 live 이동시간으로 대체하지 않는다. 실패 결과는 재사용하지 않는다.
- Place ID로 장소를 식별한다. 검색은 목록에 필요한 ID/이름/주소/좌표만 요청한다.
  영업시간·사진·출처는 사용자가 정보 패널을 열 때 요청한다. 사진 URI도 그때 만든다.
- 검색 결과 전체의 시간대를 조회하지 않는다. 선택한 장소만 확인하며 실패/미확인 IANA zone은
  추가할 수 없다. 다른 시간대의 장소 추가도 기존대로 차단한다.
- 시간대 키는 ID와 소수점 8자리 좌표를 사용한다. 대략 1mm 미만 정밀도로 부동소수점
  잡음만 흡수하며, 인접 장소를 큰 격자 하나로 합치지 않는다. 기존 방문의 확인된 zone은 그대로 사용한다.
- Text Search에는 Autocomplete session token을 적용하지 않았다. 현재 앱은
  `Place.searchByText`이며, 공식 session token 문서는 Autocomplete와 종료 Details 흐름에 적용된다.
- 드래그 중에는 데이터 계산을 호출하지 않고 최종 drop에서만 계산한다.
  입력 상태와 loading 표시는 즉시 반영하고 네트워크 작업을 디바운스한다.

## 중복·취소·오래된 응답

`RequestPool`은 동일 키의 진행 중 작업 하나를 여러 구독자에게 공유한다. 한 구독자의
취소가 다른 구독자의 요청을 끊지 않으며, 마지막 구독자가 취소되면 내부 AbortController를
취소한다. 서버도 응답 연결 종료를 upstream Google fetch 취소에 연결한다.
서버는 동시 요청만 공유하고 완료된 Google 응답을 보관하지 않는다.

일정 generation을 편집 즉시 올리고 이전 계산을 취소한다. 취소를 무시하는 provider도
응답 직후 signal과 generation을 확인해 새 일정에 적용하지 않는다. 계산 도중에는
기존 결과를 새 Node 순서 아래 표시하지 않는다. loading/확정/경로 실패는 기존 UI에,
취소 및 오래된 응답 폐기는 개발 계측에 표시한다. 취소를 사용자 경로 실패로 표시하지 않는다.

순방향 도착·대기·체류·출발 계산은 기존 엔진을 사용한다. 영업시간 경고, 다음 날짜 표시,
미확정 경로 이후 도착시간 전파를 유지하며 유효한 경로 시간만 재사용한다.

## 개발 요청 모니터

기본 비활성화. `.env`에 `REQUEST_MONITOR=1`을 설정하고 기존 방법으로 서버를 시작하면
개발자 콘솔에서 `travelLinkRequests.report()`, `.snapshot()`, `.reset()`을 사용할 수 있다.
서버 측 실제 upstream 횟수는 `/api/debug/requests`에서 확인한다.
`NODE_ENV=production`에서는 모니터와 디버그 endpoint를 비활성화한다.

API별 `requested`, `cache-hit`, `shared`, `aborted`, `cancelled`, `stale-discarded`,
`confirmed`, `failed` 횟수와 최근 100개 이벤트를 제공한다. 이벤트에는 API 종류,
작업 사유, 장소/구간 식별자, 교통수단, cache hit/miss만 기록한다.
키, URL, 헤더, 요청/응답 원문, 검색어는 기록하지 않는다.
`requested`는 해당 계층에서 시작한 작업 수이며 청구 횟수의 보장은 아니다.
브라우저 취소 전에 이미 Google에 도달한 요청은 청구될 수 있다.

## 같은 조작으로 측정한 변경 전후

`tests/compare-requests.mjs`가 HEAD 소스를 `test-results/baseline`에 복사하고,
기존 코드와 수정 코드를 서로 다른 keyless 서버에서 같은 Google 모의 응답으로 실행한다.
아래 숫자는 provider/network boundary 호출 수이며 실제 Google 청구 금액을 의미하지 않는다.

| 재현 시나리오 | Routes 전 → 후 | 검색 전 → 후 | 별도 Details 전 → 후 | Time Zone 전 → 후 |
| --- | --- | --- | --- | --- |
| 준비: 같은 검색을 4번 제출해 4개 장소 순서대로 추가 | 6 → 3 | 4 → 1 | 0 → 4 | 16 → 4 |
| A: 4개 카드·Node 선택, 패널 열기/닫기, Edge 선택, 지도 pan/zoom, resize | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| B: 기존 3구간을 WALK로 설정 후 마지막 카드를 맨 앞으로 한 번 drop | 3 → 1 | 0 → 0 | 0 → 0 | 0 → 0 |
| C: 3구간을 TRANSIT로 설정 후 25ms 간격으로 출발시간 4회 변경 | 6 → 3 | 0 → 0 | 0 → 0 | 0 → 0 |
| D: 같은 장소 3회 검색·열람 후 추가, 기존 카드/Google POI 선택 및 중복 추가 3회 | 0 → 0 | 3 → 1 | 3 → 1 | 15 → 1 |

준비 단계의 기존 검색은 전체 결과에 영업시간·사진도 요청했다. 수정 후에는 선택한
4개 장소의 상세만 별도 요청하므로 검색+Details의 원시 합계가 4→5가 된다.
이는 목록 모든 장소의 고비용 필드/사진을 미리 읽지 않기 위한 변경이며 모든 상황에서
Places 호출 총수가 줄어든다고 주장하지 않는다. D의 기존 Details 3회는 Google POI 재선택이다.

B의 새 연결 D→A만 대중교통 조회하고 A→B, B→C의 도보 결과는 유지한다.
기존 구간이 TRANSIT/DRIVE이고 정렬로 출발 시각이 바뀌면 3개 모두 재조회할 수도 있다.
C는 마지막 상태에 필요한 3구간이며 앞선 편집 3번의 네트워크 작업은 시작하지 않는다.
같은 조작을 모두 WALK로 수행하면 시간 변경에 따른 추가 경로 호출은 0이다.
Map 객체는 Live 연결 시 한 번 생성되고 A~D 조작 자체로 추가 생성되지 않았다.

## 검증과 재실행

- Node 자동 테스트: 기존 22개 + provider/요청 테스트 20개 + 서버 경계 테스트 6개 = **48개 통과**.
- Edge headless 브라우저: 기존 단위 UI 흐름, Google Live fixture 흐름, A~D 요청 횟수 검증 통과.
- Live fixture에서 시간대 조회 실패/다른 시간대의 추가 차단과, 응답이 늦는 경로를 취소한 뒤
  최신 결과만 남기는 흐름도 통과했다. 취소된 요청은 경로 실패로 표시되지 않았다.
- 로컬 5173 서버를 기존 `.env` 시작 방식으로 재시작한 뒤 데모 4개 장소, Google 요청 0회,
  JavaScript 오류 0건, 모니터 비활성화 및 debug endpoint 404를 확인했다.
- 실제 Google 요청을 차단한 fixture를 사용한다. 테스트 서버는 `.env`를 읽지 않고
  키를 빈 값 또는 테스트 전용 문자열로 덮어쓴다. 기존 5173 서버를 테스트로 교체하지 않는다.
- `tests/run-browser.mjs`는 임의 포트의 별도 서버를 만들고 끝날 때 종료한다.
- 현재 실제 Google 키의 인증·과금·지역별 경로 품질·사진 다운로드 성공은 재검증하지 않았다.
  브라우저 Places SDK는 요청 abort를 제공하지 않으므로 결과를 무시한다. 서버 fetch는 실제로 취소한다.

```powershell
.\.tools\node-v24.21.0-win-x64\node.exe --test tests/*.test.mjs
.\.tools\node-v24.21.0-win-x64\node.exe tests/run-browser.mjs
.\.tools\node-v24.21.0-win-x64\node.exe tests/compare-requests.mjs
```

Node가 PATH에 있으면 `npm test`, `npm run test:ui`도 사용할 수 있다.
원시 비교 결과는 `test-results/request-comparison.json`에 생성한다.

## Google 데이터 정책과 남은 범위

2026-11-14 확인한 공식 문서:

- [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms):
  Routes 19.3 / Places 14.3의 30일 예외는 좌표에 대한 예외다.
- [Routes 정책](https://developers.google.com/maps/documentation/routes/policies),
  [Places 정책](https://developers.google.com/maps/documentation/places/web-service/policies):
  Place ID는 보관 예외이며 임의의 duration/polyline/이름/영업시간/사진 전체에 대한
  30일 캐시 허용을 뜻하지 않는다.
- [Time Zone 정책](https://developers.google.com/maps/documentation/timezone/policies):
  시간대 데이터의 일반적인 장기 캐시 예외를 확인하지 못했다.
- [Text Search JS](https://developers.google.com/maps/documentation/javascript/place-search),
  [Autocomplete session tokens](https://developers.google.com/maps/documentation/places/web-service/place-session-tokens):
  현재 Text Search에 autocomplete token을 붙여 청구 절감을 가정하지 않는다.

메모리 사용만으로 Google 캐시 제한의 예외가 생긴다고 해석하지 않는다. 구현은 현재
표시/처리 중인 검색 결과·선택 장소·일정의 작업 데이터만 재사용하며, 제거된 항목이나
과거 출발 시각의 조회 이력을 축적하지 않는다. 서버 완료 응답 캐시, localStorage,
IndexedDB, 파일/DB 저장, 서비스 워커 Google 캐시는 추가하지 않았다. 현재 작업 상태도
저장 권한을 보장하는 법적 판단은 아니며, 별도 장기/공유 캐시를 도입하려면 해당 계약의
허용을 확인해야 한다. 모든 재사용을 끄려면 각 TTL을 0으로 설정할 수 있다.
Google 지도 attribution을 유지하고 장소/사진의 제공자·저자 출처도 함께 표시한다.

남은 개선 후보는 실제 개발 모니터로 관찰한 검색 패턴에 따른 Autocomplete 전환,
사용자가 사진을 원할 때만 여는 별도 버튼, 계약상 허용된 경우에 한한 더 넓은 캐시다.
현재의 제출 검색 UX와 사진 패널을 바꾸지 않기 위해 이번 작업에는 포함하지 않았다.

## 변경 파일

- `src/request-config.js`: 설정 모음.
- `src/requests.js`: 요청 계측, 진행 중 공유/취소, bounded TTL/LRU 작업 결과, debounce.
- `src/efficient-providers.js`: 경로 identity, 현재 구간 재사용, Places/시간대 provider, 지도 로더.
- `src/app.js`, `src/engine.js`: 데이터 계산과 렌더 분리 유지, provider 수명, 편집 debounce, stale 방지.
- `server.mjs`: upstream 공유, 연결 취소, 개발 모니터, 기존 키/정적파일 보호 유지.
- `.env.example`, `package.json`, `README.md`, 이 문서: 설정/테스트/사용 안내.
- `tests/requests.test.mjs`, `server.test.mjs`, `server-fixture.mjs`, `browser-efficiency.mjs`,
  `compare-requests.mjs`, `run-browser.mjs`: 요청 횟수와 서버/브라우저 검증.
- 기존 `tests/browser.mjs`, `browser-changes.mjs`, `google-fixture.mjs`: 별도 테스트 서버 지원,
  개선된 호출 횟수 기대값, 네트워크를 차단한 Google fixture.
