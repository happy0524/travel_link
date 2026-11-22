# Render 배포

공개 시연 전 [지도 API 사용 한도](API_USAGE_LIMITS.md)의 제공자 설정과 예산 기준을 확인하세요.

## 공개 링크 만들기

1. Render Dashboard에서 **New → Web Service**를 선택하고 GitHub의 `happy0524/travel_link` 저장소를 연결합니다. 브랜치는 `travel_link-v1.0`, 런타임은 **Node**, 인스턴스는 영구 디스크를 지원하는 유료 인스턴스 하나를 선택합니다.
2. Root Directory는 비워 두고, Build Command에 `npm ci --omit=dev`, Start Command에 `npm start`를 입력합니다. Node 24.21.0은 저장소의 `.node-version`에 지정되어 있습니다. Health Check Path를 `/`로 지정합니다.
3. **Advanced → Add Disk**에서 크기 **1 GB**, 마운트 경로 **`/var/data`**를 설정합니다. 아래 환경변수를 입력한 뒤 서비스를 생성합니다. 화면과 API는 같은 주소에서 제공됩니다.

| 환경변수 | 설정 |
| --- | --- |
| `NODE_ENV` | `production` |
| `TRAVEL_LINK_DATA_DIR` | `/var/data` |
| `GOOGLE_MAPS_BROWSER_KEY` | Maps JavaScript API, Places API (New), Places UI Kit에 사용하는 웹 키 |
| `GOOGLE_MAPS_SERVER_KEY` | Routes API와 Time Zone API에 사용하는 서버 키 |
| `GOOGLE_PLACES_SERVER_KEY` | Places API (New) 서버 키. 생략하려면 기존 서버 키에 Places API (New)를 함께 허용해야 함 |
| `MAPBOX_PUBLIC_TOKEN` | 지도·검색·경로에 사용하는 공개 웹 토큰 |
| `GOOGLE_MAPS_MAP_ID` | 기존 Cloud Map ID를 쓸 때만 설정 |
| `TRAVEL_LINK_PUBLIC_URL` | 기본 `onrender.com` 주소에서는 생략. 커스텀 도메인을 실제 접속 주소로 쓸 때만 HTTPS 주소 설정 |

Render가 `PORT`, `RENDER`, `RENDER_EXTERNAL_URL`을 자동 주입합니다. 앱은 Render에서 `0.0.0.0`에 바인딩하며, 지정된 HTTPS 출처의 쓰기 요청을 받습니다. 로그인과 로그아웃 쿠키에는 `Secure`, `HttpOnly`, `SameSite=Strict`가 적용됩니다. 로컬은 기존 실행 명령과 루프백 주소를 사용합니다.

4. Render가 표시하는 최종 HTTPS 주소를 Google 브라우저 키의 **Websites** 제한과 Mapbox 공개 토큰의 **Allowed URLs**에 등록합니다. Google 예시는 `https://YOUR-SERVICE.onrender.com/*`, Mapbox 예시는 `https://YOUR-SERVICE.onrender.com`입니다. 서버용 Google 키에 IP 제한이 있다면 Render 서비스 **Connect → Outbound**의 송신 IP 범위를 등록합니다. 서버 키의 API 제한은 Routes API와 Time Zone API를 사용합니다.
5. 공개 링크를 브라우저에서 열어 별도의 확인용 프로필로 로그인, 장소 검색, 실제 경로, 여행 저장·복원을 확인합니다. Render에서 서비스를 재시작한 뒤 같은 프로필로 다시 들어가 저장한 여행이 남아 있는지 확인합니다.

## 기존 계정과 여행 이전

공개 서비스를 새 데이터로 시작해도 됩니다. 기존 계정과 여행을 이어 쓰려면 공개 링크를 공유하기 전에 아래 절차를 진행합니다.

1. 로컬 앱에서 편집을 마치고 저장을 확인합니다. 프로젝트 루트에서 다음을 실행합니다. 백업 명령은 SQLite의 온라인 백업 기능으로 WAL에 반영된 커밋까지 복사합니다. 백업 폴더는 새 이름을 지정합니다.

   ```powershell
   New-Item -ItemType Directory -Force backups | Out-Null
   node --env-file-if-exists=.env scripts/backup-travel.mjs backups/render-v1
   ```

2. Render Dashboard에서 해당 서비스의 SSH 접속 명령을 확인합니다. Render 계정에 SSH 공개 키를 등록합니다. Render Shell에서 `umask 077; mkdir /var/data/import-v1`로 새 디렉터리를 만든 다음, 로컬에서 두 파일을 업로드합니다. 아래 SSH 계정과 호스트는 Dashboard에 표시된 값으로 바꿉니다.

   ```powershell
   scp -s backups/render-v1/travel.sqlite backups/render-v1/profile.key YOUR_SERVICE@ssh.YOUR_REGION.render.com:/var/data/import-v1/
   ```

   기존 간편 프로필을 쓰는 경우 DB와 같은 백업에서 나온 `profile.key`가 필요합니다. 간편 프로필을 생성한 적이 없어 백업에 키가 없다면 SQLite 파일만 업로드합니다. `.env`, 백업 폴더, 키 파일은 비공개로 관리합니다.

3. 파일 두 개가 모두 전송됐는지 확인한 뒤 `TRAVEL_LINK_DATA_DIR`를 `/var/data/import-v1`로 변경하고 Render에서 재배포합니다. 새 디렉터리로 전환하므로 기존 배포의 DB는 보존됩니다. 기존 프로필로 로그인하고 여행을 확인한 뒤 링크를 공유합니다. 이후 백업은 실제 서비스에 설정한 데이터 디렉터리를 사용합니다.

[Render Web Services](https://render.com/docs/web-services) · [영구 디스크 및 파일 전송](https://render.com/docs/disks) · [Render SSH](https://render.com/docs/ssh) · [Google 키 제한](https://developers.google.com/maps/api-security-best-practices) · [Mapbox 토큰 제한](https://docs.mapbox.com/accounts/guides/tokens/)
