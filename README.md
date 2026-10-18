# Changed Special — 브라우저 판

RPG Maker **VX(RGSS2)** 로 만든 게임을 **PC·모바일 브라우저에서 그대로 실행**하는 웹 포팅입니다.
게임 데이터(`Data/`, `Graphics/`, `Audio/`, `Fonts/`)와 **원본 Ruby 스크립트(`Data/Scripts.rvdata`)는 수정하지 않고** 그대로 읽어서 실행합니다.
Windows 전용 RGSS 엔진(`Game.exe`, `RGSS2*.dll`)은 쓰지 않고, 브라우저용 호환 런타임을 새로 구현했습니다.

## 실행

```sh
node tools/serve.mjs 8080      # 저장소 루트를 정적 서버로 제공
# → http://localhost:8080/
```

정적 호스팅이면 어디든 됩니다. **GitHub Pages**: Settings → Pages → 브랜치 선택(루트) → `https://<user>.github.io/<repo>/`.
첫 방문에 약 300MB 를 내려받고(서비스 워커가 캐시), 이후에는 **오프라인에서도** 실행됩니다.

| 조작 | PC | 모바일 |
|---|---|---|
| 이동 | 방향키 | 왼쪽 D패드 |
| 확인 | Z · Enter · Space | 확인 |
| 취소/메뉴 | X · Esc | 취소 |
| 대시 | Shift | 대시 |
| 대화 빨리감기 | Ctrl | 스킵 |

저장 데이터는 브라우저 IndexedDB(`changed-web-saves`)에 보관됩니다. 브라우저 데이터를 지우면 함께 사라집니다.

## 구조

```
index.html, sw.js          진입점 / 서비스 워커(오프라인)
web/rgss/*.rb              RGSS2 호환 런타임 (Ruby): Bitmap·Sprite·Viewport·Plane·Window·Tilemap·Graphics·Input·Audio, RPG::* 클래스
web/js/*.js                렌더러(Canvas2D)·오디오(WebAudio)·입력(키보드+터치)·부팅
web/ruby/ruby+stdlib.wasm  ruby.wasm (Ruby 4.0)  — 3.3/3.4 빌드는 블록 탈출(break/return)마다 메모리가 새서 쓸 수 없음
web/dist/main.js           번들 결과물 (tools/build.mjs 로 생성, 저장소에 포함)
web/audio/                 BGM/ME 를 wav → ogg 로 변환한 파일 (원본 wav 는 Audio/ 에 그대로 있음)
web/manifest.json          에셋 목록 (tools/gen_manifest.mjs 로 생성)
tools/                     빌드·테스트 도구
```

동작 방식: `ruby.wasm` 위에서 게임의 Ruby 스크립트가 그대로 돌아가고, 그래픽/사운드/입력 API 는 브라우저 쪽 구현으로 연결됩니다.
`Graphics.update` 는 `JS.await` 로 브라우저에 제어를 넘겨 프레임을 맞춥니다(60fps).

### 원본 스크립트 중 웹에서 달라지는 부분
- `Screen` (Fullscreen++, Win32 API 사용): 건너뜀 — 대신 브라우저 전체화면 버튼 사용
- `Save` 의 스크린샷 직렬화(`RtlMoveMemory` 로 비트맵 메모리 직접 접근): `Bitmap#_dump/_load` 를 동등한 구현으로 대체
- 그 외 스크립트는 변경 없이 로드됩니다.

## 개발

```sh
cd tools && npm install        # 최초 1회
node tools/build.mjs           # 번들 + wasm 복사 + RPG 클래스/매니페스트 재생성
node tools/convert_audio.sh    # wav → ogg (tools/convert_audio.sh, ffmpeg 필요)
```

테스트 도구 (헤드리스 Chromium, `playwright-core`):

```sh
node tools/shot.mjs out 100 --keys=Enter@40,Enter@46+2.2x20 --shots=60,90   # 키 입력 스크립트 + 스크린샷 + FPS
node tools/shot_mobile.mjs out landscape 90 --touch=C@30+2.2x30             # 터치 에뮬레이션
node tools/test_saves.mjs                                                   # 세이브 영속화
node tools/test_offline.mjs out.png                                         # 서비스 워커 오프라인
node tools/node_harness.mjs 30000 --soak=1                                  # 렌더링 없이 Ruby 로직만 무작위 입력으로 장시간 실행
```

URL 옵션: `?nosw`(서비스 워커 끔) `?prof`(프로파일/디버그) `?vorbisjs`(wasm Vorbis 디코더 강제) `?bmbudget=N`(비트맵 메모리 예산 MB).
