# Voxsave — 자막/텍스트 → MP3

Microsoft Edge 신경망 TTS(edge-tts)로 **자막 파일(.srt/.vtt) 또는 일반 텍스트를 MP3 음성 파일로 저장**하는 Windows 데스크탑 앱입니다. API 키 불필요, 한국어 음질 우수.

- **프레임워크**: Tauri v2 (Rust + WebView2)
- **TTS 엔진**: edge-tts (Python 라이브러리, PyInstaller로 사이드카 동봉)
- **인스톨러**: NSIS (`*-setup.exe`, 약 12MB)

---

## 사용자(최종 배포 대상)용 — 받은 .exe만 실행하는 사람

### 시스템 요구사항
| 항목 | 요구사항 |
|---|---|
| OS | **Windows 10 (1803+) 또는 Windows 11** |
| WebView2 | Win11 기본 탑재. Win10 1803+ 포함. 없으면 설치 프로그램이 자동 다운로드(인터넷 필요) |
| 인터넷 | **MP3 생성 시 필요** (edge-tts가 Microsoft 서버를 호출). 미리듣기는 오프라인 가능 |
| Python / Node / Rust | **불필요** — 모두 빌드 전용입니다 |

### 설치 및 실행
1. `Voxsave_0.1.0_x64-setup.exe`를 더블클릭.
2. **SmartScreen 경고**가 뜨면 "추가 정보" → "실행"을 누르세요. (코드 서명 안 된 무료 앱이라 정상)
3. 설치 후 시작 메뉴에서 **Voxsave**를 실행.
4. 텍스트 입력 또는 자막(.srt/.vtt) 드래그 → 음성/속도/음높이 선택 → **MP3로 저장**.

미리듣기는 OS 음성을 쓰는 빠른 확인용입니다. 최종 MP3는 edge-tts 결과가 훨씬 좋습니다.

---

## 개발자용 — 직접 빌드하기

### 선행 도구
- Node 18+ / npm 9+
- Rust toolchain (`rustup`, MSVC 타깃) — `winget install Rustlang.Rustup`
- Visual Studio 2022 Build Tools (C++ workload, Win11 SDK)
- Python 3.10+ (사이드카 빌드 시에만)

### 1) 사이드카 빌드 (한 번만)
```powershell
cd sidecar
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\pyinstaller.exe --onefile --name edge-tts-sidecar sidecar.py
```
생성된 `sidecar/dist/edge-tts-sidecar.exe`를 **타깃 트리플 이름**으로 복사:
```powershell
Copy-Item sidecar\dist\edge-tts-sidecar.exe `
  src-tauri\binaries\edge-tts-sidecar-x86_64-pc-windows-msvc.exe
```
타깃 트리플은 `rustc -Vv`의 `host:` 값입니다 (대부분 `x86_64-pc-windows-msvc`).

사이드카 단독 테스트:
```powershell
.\src-tauri\binaries\edge-tts-sidecar-x86_64-pc-windows-msvc.exe `
  --text "안녕하세요" --voice ko-KR-SunHiNeural --out test.mp3
```

### 2) 앱 의존성 설치
```powershell
npm install
```

### 3) 개발 실행
```powershell
npm run tauri dev
```

### 4) 배포용 빌드
```powershell
npm run tauri build
```
결과물: `src-tauri/target/release/bundle/nsis/Voxsave_0.1.0_x64-setup.exe`

---

## 아키텍처

```
[웹 UI (HTML/JS, src/)]
  └─ invoke('synthesize', {text, voice, rate, pitch, out})
        │
        ▼
[Rust 백엔드 (src-tauri/src/lib.rs)]
  ├─ text → UTF-8 임시 .txt 저장
  ├─ shell sidecar 실행
  └─ 임시파일 삭제 후 결과 반환
        │
        ▼
[edge-tts 사이드카 (sidecar/sidecar.py → .exe)]
  └─ Microsoft Edge 신경망 TTS → MP3 직접 저장
```

미리듣기는 별도 경로(Web Speech API)로 OS 음성을 즉시 재생합니다(인터넷 없이).

---

## 사용 가능한 한국어 음성

| Voice | 설명 |
|---|---|
| `ko-KR-SunHiNeural` | 여성 (기본값) |
| `ko-KR-InJoonNeural` | 남성 |
| `ko-KR-HyunsuMultilingualNeural` | 남성, 다국어 |

추가 음성 목록은 다음으로 얻을 수 있습니다:
```powershell
.\src-tauri\binaries\edge-tts-sidecar-x86_64-pc-windows-msvc.exe --list
```

---

## 디렉토리 구조

```
Tool_Voxsave/
├─ src/                                  # 웹 프론트엔드
│  ├─ index.html
│  ├─ main.js
│  └─ styles.css
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs                         # 진입점, 콘솔창 숨김
│  │  └─ lib.rs                          # synthesize 커맨드
│  ├─ capabilities/default.json          # shell:allow-execute + dialog 권한
│  ├─ binaries/                          # PyInstaller 사이드카 (.exe)
│  ├─ tauri.conf.json                    # NSIS 타깃, externalBin 등록
│  └─ Cargo.toml
├─ sidecar/
│  ├─ sidecar.py                         # edge-tts 래퍼
│  ├─ requirements.txt
│  └─ test_parser.mjs                    # 자막 파서 단위 테스트
├─ package.json
└─ README.md
```

---

## 트러블슈팅

- **MP3 생성 실패: "사이드카 실행 실패"** — `src-tauri/binaries/edge-tts-sidecar-<트리플>.exe` 파일이 있는지, 트리플이 `rustc -Vv`의 `host`와 정확히 일치하는지 확인.
- **MP3 생성 실패: "edge-tts error: ..."** — 인터넷 연결 확인. 회사 방화벽이 `*.speech.platform.bing.com`을 막을 수 있습니다.
- **빌드 실패: linker `link.exe` not found** — Visual Studio 2022 Build Tools의 C++ workload가 설치되지 않았습니다.
- **SmartScreen이 차단** — 코드 서명을 추가하거나 사용자에게 "추가 정보 → 실행"을 안내.

---

## 라이선스

이 앱은 무료입니다. 후원/배포는 별도 홈페이지에서 안내합니다.
