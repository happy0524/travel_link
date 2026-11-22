# 공개 배포의 API 사용 한도

## 비용 판단 기준

월 **70,000원**은 Render 인스턴스·디스크·초과 트래픽, Google·Mapbox, 세금·환율을 포함한 운영 예산입니다. 전체 예상액이 **50,000원**에 이르면 점검하고 중단 여부를 판단합니다. **20,000원**은 청구 집계 지연, 이미 진행 중인 요청, 환율·세금 변동에 대비한 여유입니다. 공개 사이트 전체의 결제를 강제하는 장치는 없습니다.

### 서버가 차단하는 호출

| Google 호출 | 월 시도 상한 | 표준 글로벌 무료량 | 첫 유료 구간 |
| --- | ---: | ---: | ---: |
| Time Zone. 좌표와 타임스탬프로 조회 | 10,000 | 10,000 | $5 / 1,000회 |
| Compute Routes Essentials. 도보·대중교통, 기본 경로와 대중교통 구간 정보 | 10,000 | 10,000 | $5 / 1,000회 |
| Compute Routes Pro. 자동차, `TRAFFIC_AWARE` 사용 | 5,000 | 5,000 | $10 / 1,000회 |
| Places Text Search Pro. 목적지·장소·연결 후보 | 500 | 5,000 | $32 / 1,000회 |
| Places Details Pro. 목적지 복원, 이름과 좌표 | 500 | 5,000 | $17 / 1,000회 |
| Places Details Enterprise. 장소 상세와 방문 장소 복원, 운영시간 | 500 | 1,000 | $20 / 1,000회 |
| Places Photos. 일반 상세 미디어 변환 | 500 | 1,000 | $7 / 1,000회 |

표의 수치는 상품별 구성 상한입니다. 첫 서버 SKU가 상한에 도달하면 파일럿의 전체 사용이 중단되므로 모두 사용할 수 있는 총량을 뜻하지 않습니다. 같은 요청을 공유하면 실제 외부 시도에 한 번만 예약합니다. 외부 호출 전 영구 디스크의 `api-usage.sqlite`에 원자적으로 기록합니다. 실패·취소·응답 유실은 보수적으로 집계합니다. 상한에 이르는 마지막 예약 이후부터 신규 요청을 막고, 모델에서 비용 초과가 예상되면 그 요청부터 막습니다. 계정·여행 DB 스키마는 그대로입니다. [Google 글로벌 가격표](https://developers.google.com/maps/billing-and-pricing/pricing) · [Google 종량제 집계](https://developers.google.com/maps/billing-and-pricing/pay-as-you-go) · [Routes SKU](https://developers.google.com/maps/billing-and-pricing/sku-details/routes) · [Places 필드](https://developers.google.com/maps/documentation/places/web-service/data-fields)

같은 결제 계정의 기존·공유 사용량은 확인되지 않았습니다. 기본 무료 배정은 Time Zone·Routes Essentials·Pro에 **500 / 500 / 250회**, Places에 SKU별 **500회**로 설정한 보수적 운영값입니다. 실제 잔여 무료량을 뜻하지 않습니다. Google Billing에서 SKU별 남은 양을 확인하고 이 앱에 줄 양만 설정하세요. 잔여량을 확인할 수 없으면 무료 배정을 더 낮추거나 0으로 설정하세요. 이전 배포의 사용량은 새 카운터에 자동으로 들어오지 않습니다. 기본 기타 비용 예약값에서는 무료 배정 초과 예상 호출이 전체 중단을 발생시킵니다. 세금과 결제 수수료를 포함한 원/USD 단가를 사용하세요.

| Render 환경변수 | 기본값 및 적용 |
| --- | --- |
| `GOOGLE_TIME_ZONE_MONTHLY_LIMIT` / `GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT` / `GOOGLE_ROUTES_PRO_MONTHLY_LIMIT` | 10000 / 10000 / 5000. 더 낮게 설정 가능. 0이면 차단 |
| `GOOGLE_TIME_ZONE_FREE_ALLOCATION` / `GOOGLE_ROUTES_ESSENTIALS_FREE_ALLOCATION` / `GOOGLE_ROUTES_PRO_FREE_ALLOCATION` | 500 / 500 / 250. 기존·공유 사용량을 빼서 확인한 앱 몫을 설정 |
| `GOOGLE_PLACES_{SEARCH,RESTORE,DETAILS,PHOTO}_MONTHLY_LIMIT` 및 `GOOGLE_PLACES_{SEARCH,RESTORE,DETAILS,PHOTO}_FREE_ALLOCATION` | 항목별 500. 실제 잔여 무료량을 확인해 조정 |
| `GOOGLE_PLACES_SERVER_KEY` | 서버 전용 Places API (New) 키. 미설정 시 `GOOGLE_MAPS_SERVER_KEY` 사용 |
| `TRAVEL_LINK_OTHER_COST_RESERVE_KRW` | 50000. 기본값은 새로 유료가 될 것으로 추정하는 서버 호출을 막음. 관측한 기타 비용의 추정치를 넣어도 전체 청구 한도가 되지는 않음 |
| `TRAVEL_LINK_USD_KRW_ALL_IN` | 2000. 세금·환율을 반영할 원/USD 계획 단가 |
| `TRAVEL_LINK_BROWSER_MONTHLY_PERMITS` | 1000. 정상 앱 브라우저 호출 허가의 영구 월 한도 |
| `TRAVEL_LINK_API_TOTAL_PER_MINUTE` / `TRAVEL_LINK_API_IP_PER_MINUTE` / `TRAVEL_LINK_API_USER_PER_MINUTE` | 240 / 120 / 90. 로그인 전에도 IP와 전체 한도 적용 |
| `TRAVEL_LINK_API_CONCURRENCY` | 8. 실제 서버 외부 호출의 동시 실행 수 |
| `TRAVEL_LINK_API_PAUSED` | `1`이면 새 서버 호출과 앱의 브라우저 호출 허가 중지 |

유료 초과를 피하려면 확인한 무료 배정 이하로 각 월 한도도 낮추세요. 금액 모델은 새 서버 유료 시도의 운영 보조 수단입니다. 분당 한도는 프로세스 메모리, 월 한도는 재시작·재배포에도 유지되는 SQLite입니다. Render에서는 ingress가 마지막에 붙인 유효한 방문자 IP를 사용하며 유효값이 없으면 공유 한도를 적용합니다. Origin 검사와 기존 인증·접근 제어를 유지합니다.

### 남아 있는 브라우저 직접 호출과 Render

| 기능 | 실제 과금 기준 |
| --- | --- |
| Google 지도 | Dynamic Maps 지도 로드 |
| Google UI Kit | 후보·상세 위젯 로드와 위젯 내부 미디어. 일반 Places와 별도 집계 |
| Mapbox 지도·검색·경로 | GL JS 지도 로드, Search Box 검색 세션, Directions 경로 요청 |
| Render | 인스턴스·디스크 기본료, 워크스페이스 요금과 초과 송신량 등 |

브라우저 허가는 이 앱에서 시작하는 새 호출에 한해 적용합니다. 피처별 실제 청구 단위와 일대일 대응하지 않으며, 직접 키 사용이나 이미 열린 SDK의 내부 요청을 막을 수 없습니다. Render 공개 페이지·정적 파일의 트래픽도 앱의 API 카운터로 차단할 수 없습니다. 예를 들어 공개 가격표의 Starter와 1GB 디스크는 합계 $7.25/월입니다. 초과 트래픽 20GB를 더하면 $10.25이며, 2,000원/USD를 가정하면 20,500원입니다. 요금제와 포함량은 운영 대시보드에서 확인하세요. [Google Places SKU](https://developers.google.com/maps/billing-and-pricing/sku-details/places) · [Mapbox 가격](https://www.mapbox.com/pricing) · [Render 가격](https://render.com/pricing) · [Render 송신 트래픽](https://render.com/docs/outbound-bandwidth)

이번 PR은 공개 링크와 기존 UI를 유지합니다. 일반 Places는 서버에서 고정된 필드로 조회합니다. 로그인 전 목적지 검색은 첫 화면에서 자동 발급한 서명된 같은 사이트 쿠키와 별도 IP·분당 한도에 묶습니다. 익명 방문자에게 제공하는 기능이므로 이 쿠키는 봇 차단이나 사용자 신원 인증을 의미하지 않습니다. 나머지 Places 호출에는 기존 여행자 세션이 필요합니다. 사진은 읽기 화면에 표시할 때만 서버에서 Place Photos 미디어를 조회하고, 받은 Google 이미지 주소로 이동합니다. 기존 Google 및 사진 저자 연결을 표시하며 제공자 응답은 영속 캐싱하지 않습니다. 연결 후보는 서버에서 비교하고 브라우저에는 UI Kit가 사용할 후보 ID만 보냅니다. 일반 Google Places 좌표·라벨을 Mapbox에 올리도록 바꾸지 않았습니다. [Places REST 정책](https://developers.google.com/maps/documentation/places/web-service/policies) · [Places Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos) · [UI Kit 약관](https://cloud.google.com/maps-platform/terms/maps-service-terms)

## 콘솔 설정 우선순위

1. **병합 전** Google Cloud에서 Places API (New)를 활성화한 서버용 키를 만들고 Render **Connect → Outbound** 주소로 제한합니다. `GOOGLE_PLACES_SERVER_KEY`에 등록하거나 기존 서버 키에 Places API (New)를 추가합니다. 기존 브라우저 키 권한과 공개 URL은 유지합니다. Render Shell에서 여행 DB와 `profile.key`를 백업하고 SKU별 잔여량을 확인합니다.
2. **병합·배포 후** 기존 브라우저 키로 우선 목적지 검색, 지도 전환, 연결 후보, 사진·상세, 저장·복원 흐름을 확인합니다. 다음으로 테스트용 브라우저 키에서 Places API (New)를 제외하고 Maps JavaScript API 및 콘솔에 표시되는 Places UI Kit 권한만 허용해 지도·위젯이 실제로 열리는지, 일반 Places SDK 호출이 거부되는지 확인합니다. 검증 후 Render 브라우저 키를 교체하고 기존 공개 키의 일반 Places 권한도 제거합니다. 충돌이 있다면 현재 위젯을 유지하고 직접 호출 위험이 남는다는 점을 기록합니다. 현재 프로젝트의 `SearchTextRequest per day`는 편집할 수 없었습니다. 다른 할당량은 항목별로 확인하고 **Billing → Budgets & alerts**로 감시합니다. [Google 키 제한](https://developers.google.com/maps/api-security-best-practices) · [UI Kit 설치](https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started)
3. **Mapbox → Access tokens**에서 전용 공개 토큰의 **Allowed URLs**를 배포 주소로 제한하고, **Statistics → Usage notifications**에서 사용량 이메일을 설정합니다. Mapbox는 사용자 지정 월 지출 상한을 제공하지 않습니다. **Render → Billing / 서비스 → Metrics → Outbound bandwidth**에서 송신량을 감시합니다. 알림은 자동 차단과 별개입니다. [Mapbox 사용량과 결제](https://docs.mapbox.com/accounts/guides/invoices/) · [Render Metrics](https://render.com/docs/service-metrics)

## 긴급 중단과 되돌리기

- 서버의 월 SKU 한도나 비용 모델이 도달하면 영구 디스크의 `api-usage.sqlite`에 전역 중단을 기록합니다. 새 방문자는 작은 안내 화면을 받고, API는 503을 반환합니다. 열려 있는 화면은 표시 중 약 20초마다 상태를 확인하거나 제한 응답을 받았을 때 지도와 입력을 닫습니다. 이미 열린 제공자 SDK의 모든 외부 네트워크 요청을 회수할 수는 없습니다. 월 경계·재시작·로그인으로 중단이 해제되지 않습니다. 브라우저 허가 자체의 1,000건 한도는 앱의 추가 보호 수단이며 실제 과금 한도로 사용하지 않습니다.
- Render Shell에서 `node scripts/service-state.mjs status`로 확인하고, 필요 시 `pause`로 중단합니다. 잔여량과 설정을 확인한 뒤 `node scripts/service-state.mjs resume`로 명시적으로 재개합니다. 이 명령은 계정·여행과 카운터를 초기화하지 않습니다. 같은 월 한도가 이미 찼다면 해당 호출에서 다시 중단되므로, 새 월 또는 검증한 새 설정에서만 재개하세요. 환경변수로 일시정지했다면 그 값도 별도로 해제합니다.

- Render의 `TRAVEL_LINK_API_PAUSED=1`은 설정 적용 후 신규 서버 호출과 앱의 브라우저 허가를 막고 설정 API의 공개 키 반환을 중단합니다. 이미 내보낸 키까지 차단하려면 **Google Cloud → APIs & Services → Credentials**에서 전용 키의 API 권한을 제거하거나 키를 삭제합니다. **Mapbox → Access tokens**에서 전용 토큰을 삭제하고 기본 토큰을 사용했다면 교체합니다. 이 조치는 이후 요청에 적용되며 이미 발생한 비용은 남습니다.
- 배포 전 Render Shell에서 `node scripts/backup-travel.mjs /var/data/backup-before-api-limits`로 여행 DB와 `profile.key`를 함께 백업합니다. 백업과 키는 Git과 HTTP에서 제외합니다. 롤백이 필요하면 이전 배포로 돌아가되 디스크의 `api-usage.sqlite`는 유지하세요. 이전 코드에서는 이 차단 장치가 적용되지 않으므로 필요한 경우 제공자에서 먼저 사용을 제한합니다.
