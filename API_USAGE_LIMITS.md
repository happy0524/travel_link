# 공개 시연용 지도 API 사용 한도

## 실제 호출과 과금 단위

아래는 표준 글로벌 종량제의 월 무료 구간입니다. Google은 결제 계정 아래 모든 프로젝트의 사용량을 합산하며, 미국 태평양 시간으로 매월 1일 자정에 무료 구간이 초기화됩니다. Mapbox는 계정의 월 청구 기간과 상품별 집계를 사용합니다. 기존에 사용한 양, 다른 앱, 다른 키, 특별 요금제는 각 콘솔에서 별도로 확인하세요. 이 표의 무료 구간과 배포의 남은 무료 사용량은 다를 수 있습니다.

| 실제 호출 | 위치 | 과금 단위 및 무료 구간 | 코드에서 적용하는 보호 |
| --- | --- | --- | --- |
| Google Time Zone | 서버 `GET /api/timezone` | 성공 요청, 10,000 | 최대 10,010번의 서버 시도 |
| Google Compute Routes Essentials, 도보·대중교통 | 서버 `POST /api/route` | 성공 요청, 10,000 | 최대 10,010번의 서버 시도 |
| Google Compute Routes Pro, `TRAFFIC_AWARE` 자동차 | 서버 `POST /api/route` | 성공 요청, 5,000 | 최대 5,010번의 서버 시도 |
| Google Maps JavaScript Dynamic Maps | 브라우저에서 지도 생성 | 지도 로드, 10,000 | 앱의 지도 생성 전 속도 검사 |
| Google Places Text Search Pro | 브라우저의 목적지·장소 검색, 후보 연결 | 검색 요청, 5,000. 이름과 위치 등을 요청함 | 앱 내 검색 전 속도 검사 |
| Google Places Place Details Pro | 브라우저에서 저장된 목적지 복원 | 상세 요청, 5,000. `displayName` 포함 | 앱 내 조회 전 속도 검사 |
| Google Places Place Details Enterprise | 브라우저에서 장소 선택·복원 | 상세 요청, 1,000. `regularOpeningHours` 포함. 요청당 가장 높은 SKU가 적용됨 | 앱 내 조회 전 속도 검사 |
| Google Places Place Details Photos | 브라우저에서 장소 상세 사진 URL 사용 | 사진 요청, 1,000 | `TRAVEL_LINK_GOOGLE_MEDIA=0`으로 앱의 사진 요청 비활성화 |
| Google Places UI Kit Query | 브라우저에서 기본 상세·후보 요소 표시 | 위젯 요청, 10,000. 고급 컴포넌트 SKU가 적용되는 요청은 Pro 5,000. 계정의 SKU 리포트로 실제 분류 확인 | 앱 내 위젯 생성 전 검사. `TRAVEL_LINK_GOOGLE_WIDGETS=0`으로 전체 비활성화 |
| Mapbox GL JS | 브라우저에서 지구본·지도 생성 | 지도 로드, 50,000. 최대 12시간 세션 후 새 로드가 집계될 수 있음 | 앱 내 지도 생성 전 검사 |
| Mapbox Search Box | 브라우저에서 `suggest`와 `retrieve` | 세션, 2,500. 요청과 세션은 일대일 대응하지 않으며 완료되지 않은 세션도 과금될 수 있음 | 앱 내 호출 전 검사 및 검색 디바운스, 세션 만료 처리 |
| Mapbox Directions | 브라우저에서 도보·운전 | 경로 요청, 100,000 | 앱 내 호출 전 검사 |

공식 근거 [Google 글로벌 가격표](https://developers.google.com/maps/billing-and-pricing/pricing) · [Google 종량제 집계](https://developers.google.com/maps/billing-and-pricing/pay-as-you-go) · [Routes SKU](https://developers.google.com/maps/billing-and-pricing/sku-details/routes) · [Places SKU](https://developers.google.com/maps/billing-and-pricing/sku-details/places) · [Mapbox 가격표](https://www.mapbox.com/pricing) · [Mapbox 지도 로드](https://docs.mapbox.com/mapbox-gl-js/guides/pricing/) · [Mapbox 검색 세션](https://docs.mapbox.com/api/search/search-box/)

## Render에서 설정할 값

서버 한도는 실제 공급자 호출 직전에 영구 디스크의 `api-usage.sqlite`에 원자적으로 예약합니다. 같은 대기 요청을 공유하면 한 번만 예약합니다. 전송을 시작했다면 실패·취소·응답 유실에도 예약을 반환하지 않습니다. 앱은 외부 API에 자동 재시도하지 않으며 수동 재시도는 새 호출로 계산합니다. 저장소 오류는 503, 월 한도·속도·동시 실행 제한은 429를 반환합니다. 기존 여행 DB에는 스키마 변경이 없습니다.

| 설정 | 기본값 및 용도 |
| --- | --- |
| `GOOGLE_TIME_ZONE_MONTHLY_LIMIT` | 10010 |
| `GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT` | 10010 |
| `GOOGLE_ROUTES_PRO_MONTHLY_LIMIT` | 5010 |
| `TRAVEL_LINK_API_TOTAL_PER_MINUTE` | 240, 전체 지도 API·브라우저 허가 요청 |
| `TRAVEL_LINK_API_IP_PER_MINUTE` | 120, 익명 포함 |
| `TRAVEL_LINK_API_USER_PER_MINUTE` | 90, 검증된 여행자 ID 기준 |
| `TRAVEL_LINK_API_CONCURRENCY` | 8, 실제 서버 외부 호출의 동시 실행 개수 |
| `TRAVEL_LINK_API_PAUSED` | `1`로 설정하면 서버 외부 호출과 앱의 신규 브라우저 허가를 중지하고 설정 API에서 공개 키 반환을 중단 |
| `TRAVEL_LINK_MAPBOX_ENABLED` | `0`으로 설정하면 앱의 신규 Mapbox 지도·검색·경로와 공개 토큰 반환을 중지 |
| `TRAVEL_LINK_GOOGLE_WIDGETS` | `0`으로 설정하면 Google 장소 상세 위젯과 후보 위젯을 중지 |
| `TRAVEL_LINK_GOOGLE_MEDIA` | `0`으로 설정하면 일반 Google 장소 사진, 위젯의 사진·요약 요청을 줄임 |

월 서버 한도는 기본값 이하로만 설정할 수 있으며 0은 차단입니다. 최초 배포 시 카운터는 그때부터 집계합니다. 당월에 이미 사용한 양과 타 앱에 남겨둘 양을 빼서 설정하세요. 예를 들어 Time Zone에서 이번 달 기존 1,200건과 타 앱에 남겨둘 500건이 있다면 첫 달에는 `10010 - 1200 - 500 = 8310` 이하로 설정합니다. 다음 달에 이전 사용량 공제가 필요 없다면 환경변수 값을 갱신합니다. 사용량 보고 지연이 있으므로 불확실한 양만큼 여유를 둡니다. 카운터는 고정 월 기준이며 속도 제한은 고정 분 기준의 프로세스 메모리입니다. 기존 100개 방문 한도, 일정·경로 본문 크기 제한, 검색 디바운스, 중복 진행 요청 합치기를 유지합니다. Render에서는 ingress가 마지막에 붙인 유효한 방문자 IP를 사용하며, 유효한 값이 없으면 공유 제한을 적용합니다. 별도 프록시나 직접 접근을 추가할 경우 ingress의 IP 규칙을 먼저 다시 검증하세요.

## 제공자 콘솔에서 해야 할 일

1. **Google Cloud Console → Google Maps Platform → Quotas**에서 Maps JavaScript API, Places API (New), Places UI Kit, Time Zone API, Routes API의 편집 가능한 항목을 확인하세요. 문서상 Maps JS는 프로젝트당 분당 30,000 지도 로드 및 IP당 300 로드, UI Kit Query는 프로젝트당 분당 6,000, Compute Routes는 분당 3,000, Time Zone은 분당 30,000의 기본 상한이 있습니다. Places (New)는 메서드별 프로젝트 할당량입니다. 시연에는 기본치보다 낮은 값을 설정하세요. 하루 한도가 제공되는 SKU라면 `floor((무료 + 10) / 31)`을 보수적으로 사용합니다. 10,010은 **322/일**, 5,010은 **161/일**, 1,010은 **32/일**입니다. 여러 SKU가 같은 할당량을 공유하면 가장 낮은 기준을 적용하거나 더 좁게 제한하세요. 분당 한도만 있다면 월 상한을 보장하지 못합니다. [Google 비용과 일일 할당량](https://developers.google.com/maps/billing-and-pricing/manage-costs) · [Maps JavaScript 및 UI Kit 할당량](https://developers.google.com/maps/documentation/javascript/usage-and-billing) · [Time Zone 할당량](https://developers.google.com/maps/documentation/timezone/usage-and-billing)
2. **Google Cloud → APIs & Services → Credentials**에서 브라우저 키는 공개 사이트 HTTPS 리퍼러와 쓰는 브라우저 API만 허용하세요. 별도의 서버 키는 Render **Connect → Outbound** IP 범위와 Time Zone API, Routes API로 제한합니다. API 제한은 SKU별 사용량 제한과 별개입니다. **Cloud Billing → Budgets & alerts**는 감시용입니다. 예산 알림을 생성하는 것만으로 호출이 차단되지는 않습니다. [Google 키 제한](https://developers.google.com/maps/api-security-best-practices) · [Render 송신 IP](https://render.com/docs/outbound-ip-addresses)
3. **Mapbox Account → Access tokens**에서 이 시연 전용 공개 토큰을 만들고 배포 주소를 **Allowed URLs**에 등록하세요. **Statistics**와 결제 내역에서 상품별 청구 위치를 확인하세요. 기본 Search Box 10 req/s 및 Directions 300 req/min는 월 상한이 아닙니다. 공개 문서에서 일반 계정의 SKU별 월 강제 차단 설정은 확인되지 않았습니다. 카드 없는 계정이 적용되는 경우에는 표준 요금제와 다른 상품별 하드 리밋을 계정 문서에서 확인하세요. [Mapbox 토큰](https://docs.mapbox.com/accounts/guides/tokens/) · [Mapbox 가입 유형](https://docs.mapbox.com/accounts/guides/signup/) · [Directions 제한](https://docs.mapbox.com/api/navigation/directions/)

브라우저 허가는 이 앱의 정상 사용에만 적용됩니다. 브라우저가 받은 키를 직접 사용하거나 이미 열려 있는 SDK가 내부적으로 타일·사진을 요청하면 서버는 그 사용량을 강제할 수 없습니다. 앱의 일시정지는 새 앱 호출을 막지만 이미 발행한 공개 키를 무효화하지 않습니다. 브라우저 과금 자체를 긴급 차단하려면 제공자 콘솔에서 시연 전용 키·토큰을 비활성화하거나 삭제하세요. 정확한 상한을 적용할 수 없는 기능은 시연 동안 Mapbox와 사진·위젯을 끄고, Google도 반드시 제한해야 한다면 녹화본으로 대체합니다. Render 인스턴스·디스크 기본료와 송신 트래픽은 지도 API 카운터 외 비용입니다. [Render 가격](https://render.com/pricing)

## 배포 전 백업과 되돌리기

- 이 변경은 계정·여행 DB를 수정하지 않습니다. Render Shell에서 현재 `TRAVEL_LINK_DATA_DIR`가 맞는지 확인한 뒤 새 백업 디렉터리에 `node scripts/backup-travel.mjs /var/data/backup-before-api-limits`를 실행하세요. SQLite 일관 스냅샷과 키를 함께 저장합니다. 이전에 만든 백업이 Git·HTTP에서 접근 가능한 위치에 있지 않은지 확인하세요.
- Render에서 롤백해야 한다면 이전 정상 배포 커밋으로 되돌리세요. 이전 코드에는 이 장치가 없으므로 필요하면 제공자 콘솔에서 키 사용을 먼저 제한합니다. 롤백 시 디스크와 `api-usage.sqlite`를 유지하면 다음 배포가 기존 카운터를 이어서 사용합니다. 카운터를 지우거나 오래된 여행 DB를 덮어쓰지 마세요. 실제 DB 복원이 필요한 경우에는 [배포 안내의 새 디렉터리 방식](DEPLOY_RENDER.md)을 사용하고 현재 월의 사용량도 별도로 보존하세요.
- 프로덕션 배포 후에는 Render에서 실제 방문자 IP 판별과 제한 응답을 소량으로 확인하세요. 낮은 한도로 테스트하는 작업은 비공개 환경과 모의 응답에서 수행하세요.
