# 공개 배포의 API 사용 한도

## 비용 판단 기준

월 **70,000원**은 Render 인스턴스·디스크·초과 트래픽, Google·Mapbox, 세금·환율을 포함한 운영 예산입니다. 전체 예상액이 **50,000원**에 이르면 점검하고 중단 여부를 판단합니다. **20,000원**은 청구 집계 지연, 이미 진행 중인 요청, 환율·세금 변동에 대비한 여유입니다. 공개 사이트 전체의 결제를 강제하는 장치는 없습니다.

### 서버가 차단하는 호출

| Google 호출 | 월 시도 상한 | 표준 글로벌 무료량 | 첫 유료 구간 |
| --- | ---: | ---: | ---: |
| Time Zone. 좌표와 타임스탬프로 조회 | 10,000 | 10,000 | $5 / 1,000회 |
| Compute Routes Essentials. 도보·대중교통, 기본 경로와 대중교통 구간 정보 | 10,000 | 10,000 | $5 / 1,000회 |
| Compute Routes Pro. 자동차, `TRAFFIC_AWARE` 사용 | 5,000 | 5,000 | $10 / 1,000회 |

세 SKU 합계 최대 **25,000번의 서버 시도**입니다. 무료량에 횟수를 일괄 추가하는 규칙은 없습니다. 같은 키로 진행 중인 요청을 공유하면 실제 외부 시도에 한 번만 예약합니다. 외부 호출 전 영구 디스크의 `api-usage.sqlite`에 원자적으로 기록합니다. 실패·취소·응답 유실은 보수적으로 집계합니다. 월 상한 또는 비용 모델 제한 시 429, 저장소 오류 시 503을 반환하고 Google을 호출하지 않습니다. Google 월 경계는 미국 태평양 시간 1일 자정입니다. 계정·여행 DB 스키마는 그대로입니다. [Google 글로벌 가격표](https://developers.google.com/maps/billing-and-pricing/pricing) · [Google 종량제 집계](https://developers.google.com/maps/billing-and-pricing/pay-as-you-go) · [Routes SKU](https://developers.google.com/maps/billing-and-pricing/sku-details/routes)

기본 설정의 추정 서버 변동비는 세 SKU의 무료 배정량을 이 앱이 모두 쓸 수 있을 때 **0원**입니다. 같은 결제 계정의 기존·공유 사용량은 확인되지 않았습니다. Google Billing에서 SKU별 남은 양을 확인하고 이 앱에 줄 양만 설정하세요. 이전 배포의 사용량은 새 카운터에 자동으로 들어오지 않습니다. 예를 들어 무료 배정이 **9,900 / 9,900 / 4,900**회이고 기본 상한까지 허용하면 이론상 초과 비용은 **$2**입니다. 2,000원/USD를 적용하면 4,000원이며, 기타 비용 추정치가 46,000원을 넘으면 서버 모델이 그보다 먼저 유료 예상 호출을 차단합니다. 계획 환율은 가정이며 계정의 세금·수수료를 포함해 정해야 합니다.

| Render 환경변수 | 기본값 및 적용 |
| --- | --- |
| `GOOGLE_TIME_ZONE_MONTHLY_LIMIT` / `GOOGLE_ROUTES_ESSENTIALS_MONTHLY_LIMIT` / `GOOGLE_ROUTES_PRO_MONTHLY_LIMIT` | 10000 / 10000 / 5000. 더 낮게 설정 가능. 0이면 차단 |
| `GOOGLE_TIME_ZONE_FREE_ALLOCATION` / `GOOGLE_ROUTES_ESSENTIALS_FREE_ALLOCATION` / `GOOGLE_ROUTES_PRO_FREE_ALLOCATION` | 10000 / 10000 / 5000. 기존·공유 사용량을 빼서 확인한 앱 몫으로 낮춤 |
| `TRAVEL_LINK_OTHER_COST_RESERVE_KRW` | 50000. 기본값은 새로 유료가 될 것으로 추정하는 서버 호출을 막음. 관측한 기타 비용의 추정치를 넣어도 전체 청구 한도가 되지는 않음 |
| `TRAVEL_LINK_USD_KRW_ALL_IN` | 2000. 세금·환율을 반영할 원/USD 계획 단가 |
| `TRAVEL_LINK_BROWSER_MONTHLY_PERMITS` | 1000. 정상 앱 브라우저 호출 허가의 영구 월 한도 |
| `TRAVEL_LINK_API_TOTAL_PER_MINUTE` / `TRAVEL_LINK_API_IP_PER_MINUTE` / `TRAVEL_LINK_API_USER_PER_MINUTE` | 240 / 120 / 90. 로그인 전에도 IP와 전체 한도 적용 |
| `TRAVEL_LINK_API_CONCURRENCY` | 8. 실제 서버 외부 호출의 동시 실행 수 |
| `TRAVEL_LINK_API_PAUSED` | `1`이면 새 서버 호출과 앱의 브라우저 호출 허가 중지 |

유료 초과를 피하려면 확인한 무료 배정 이하로 각 월 한도도 낮추세요. 금액 모델은 새 서버 유료 시도의 운영 보조 수단입니다. 분당 한도는 프로세스 메모리, 월 한도는 재시작·재배포에도 유지되는 SQLite입니다. Render에서는 ingress가 마지막에 붙인 유효한 방문자 IP를 사용하며 유효값이 없으면 공유 한도를 적용합니다. Origin 검사와 기존 인증·접근 제어를 유지합니다.

### 브라우저 직접 호출과 Render

| 기능 | 실제 과금 기준 |
| --- | --- |
| Google 지도 | Dynamic Maps 지도 로드 |
| Google 목적지·장소·연결 후보 검색 | Text Search Pro. 이름·주소·좌표 등 |
| Google 상세·복원 | 목적지 복원은 Place Details Pro. 운영시간을 요청하는 상세는 Enterprise |
| Google 사진과 UI Kit | 일반 사진은 Place Details Photos 미디어 요청. UI Kit 후보·상세는 위젯 요청으로 별도 집계 |
| Mapbox 지도·검색·경로 | GL JS 지도 로드, Search Box 검색 세션, Directions 경로 요청 |
| Render | 인스턴스·디스크 기본료, 워크스페이스 요금과 초과 송신량 등 |

브라우저 허가는 이 앱에서 시작하는 새 호출에 한해 적용합니다. 피처별 실제 청구 단위와 일대일 대응하지 않으며, 직접 키 사용이나 이미 열린 SDK의 내부 요청을 막을 수 없습니다. Render 공개 페이지·정적 파일의 트래픽도 앱의 API 카운터로 차단할 수 없습니다. 예를 들어 공개 가격표의 Starter와 1GB 디스크는 합계 $7.25/월입니다. 초과 트래픽 20GB를 더하면 $10.25이며, 2,000원/USD를 가정하면 20,500원입니다. 요금제와 포함량은 운영 대시보드에서 확인하세요. [Google Places SKU](https://developers.google.com/maps/billing-and-pricing/sku-details/places) · [Mapbox 가격](https://www.mapbox.com/pricing) · [Render 가격](https://render.com/pricing) · [Render 송신 트래픽](https://render.com/docs/outbound-bandwidth)

이번 PR은 공개 링크, 첫 편지, 지도 전환, 사진·UI Kit, 일정 저장·복원을 유지합니다. 진행 중인 동일 검색과 이미 열린 같은 상세의 중복 호출을 막고, 경로 재시도 시 선택 구간만 다시 조회하도록 해당 구간의 캐시를 무효화합니다. 닫았다 다시 연 공식 위젯은 새로 로드될 수 있습니다. 새 콘텐츠 캐시·사전 수집은 추가하지 않습니다. Places REST 전환, 브라우저 권한 재구성, 공개 접근 변경은 후속 검토 사항입니다.

## 콘솔 설정 우선순위

1. **Google Cloud → Google Maps Platform → Quotas / Credentials**에서 브라우저 키는 공개 사이트 HTTPS 리퍼러와 필요한 API로, 별도 서버 키는 Render **Connect → Outbound** 주소와 Time Zone·Routes로 제한합니다. 현재 프로젝트에서 `SearchTextRequest per day`는 편집할 수 없었습니다. 다른 한도는 항목별로 확인하고, 편집 가능한 일일 항목은 이 앱의 무료 배정량을 남은 일수로 나눠 낮춥니다. **Billing → Budgets & alerts**에서 해당 프로젝트의 실제·예측 비용 알림을 설정합니다. [Google 키 제한](https://developers.google.com/maps/api-security-best-practices) · [할당량과 알림](https://developers.google.com/maps/billing-and-pricing/manage-costs)
2. **Mapbox → Access tokens**에서 전용 공개 토큰의 **Allowed URLs**를 배포 주소로 제한하고, **Statistics → Usage notifications**에서 사용량 이메일을 설정합니다. Mapbox는 사용자 지정 월 지출 상한을 제공하지 않습니다. [Mapbox 사용량 알림과 결제](https://docs.mapbox.com/accounts/guides/invoices/) · [토큰 관리](https://docs.mapbox.com/accounts/guides/tokens/)
3. **Render → Billing / 서비스 → Metrics → Outbound bandwidth**에서 포함량과 추세를 확인합니다. 송신 경보가 필요한 경우 Metrics 내보내기에서 해당 지표를 확인한 뒤 모니터에서 알림을 설정합니다. 빌드 지출 한도는 송신 트래픽 상한을 뜻하지 않습니다. 모든 제공자의 알림은 자동 차단과 별개입니다. [Render Metrics](https://render.com/docs/service-metrics) · [Render 비용 FAQ](https://render.com/docs/faq)

## 긴급 중단과 되돌리기

- Render의 `TRAVEL_LINK_API_PAUSED=1`은 설정 적용 후 신규 서버 호출과 앱의 브라우저 허가를 막고 설정 API의 공개 키 반환을 중단합니다. 이미 내보낸 키까지 차단하려면 **Google Cloud → APIs & Services → Credentials**에서 전용 키의 API 권한을 제거하거나 키를 삭제합니다. **Mapbox → Access tokens**에서 전용 토큰을 삭제하고 기본 토큰을 사용했다면 교체합니다. 이 조치는 이후 요청에 적용되며 이미 발생한 비용은 남습니다.
- 배포 전 Render Shell에서 `node scripts/backup-travel.mjs /var/data/backup-before-api-limits`로 여행 DB와 `profile.key`를 함께 백업합니다. 백업과 키는 Git과 HTTP에서 제외합니다. 롤백이 필요하면 이전 배포로 돌아가되 디스크의 `api-usage.sqlite`는 유지하세요. 이전 코드에서는 이 차단 장치가 적용되지 않으므로 필요한 경우 제공자에서 먼저 사용을 제한합니다.
