# TestBench Comprehensive System Overview (Frontend & Backend)

This document provides an exhaustive, end-to-end breakdown of everything that the **Frontend** and **Backend** do in the TestBench automation platform.

---

## 1. System Architecture Overview

TestBench is an automated test orchestration, device mirroring, and execution monitoring platform designed for mobile and web automation testing.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FRONTEND (React 18 + Vite)                             │
│  ┌──────────────────┐  ┌───────────────────────┐  ┌──────────────────┐  ┌───────────┐  │
│  │   Landing Page   │  │   Dashboard/Workbench │  │ Workspace & Logs │  │ Settings  │  │
│  │ (Drag-Drop ZIP)  │  │ (Live Mirror+Control) │  │  (Reports & MP4) │  │(Diag/Host)│  │
│  └────────┬─────────┘  └───────────┬───────────┘  └─────────┬────────┘  └─────┬─────┘  │
│           │                        │                        │                 │        │
│           └────────────────────────┼────────────────────────┴─────────────────┘        │
│                                    │ HTTP REST / WebSocket Streams                     │
└────────────────────────────────────┼───────────────────────────────────────────────────┘
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 BACKEND (Python FastAPI + Uvicorn)                     │
│                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │    Project Scanner    │  │ Unified Device Manager│  │    Capture & Recording     │  │
│  │ (AST Parser, Manifest)│  │  (ADB Bridge, AVDs)   │  │ (scrcpy H.264, FFmpeg MP4) │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └─────────────┬──────────────┘  │
│              │                          │                            │                 │
│  ┌───────────┴───────────┐  ┌───────────┴───────────┐  ┌─────────────┴──────────────┐  │
│  │ Single-Worker Queue   │  │   Test Runner Engine  │  │    SQLite DB & Watcher     │  │
│  │ (FIFO Execution Mgr)  │  │(Appium, Maven, Pytest)│  │ (testbench.db, Logs, Rpts) │  │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Backend Capabilities & Service Architecture

The backend is built with **FastAPI**, **Uvicorn**, **asyncio**, **SQLite**, and an **ADB / scrcpy / FFmpeg** toolchain.

### 2.1. Centralized Configuration & Tool Discovery (`app/config.py`)
- **Workspace & Logs Path Resolution**:
  - Dynamically configures the active workspace (`TESTBENCH_WORKSPACE` env var or `<root>/workspace`).
  - Auto-creates `workspace/logs/` and `workspace/logs/recordings/`.
- **Automated Executable Discovery Hierarchy**:
  - **ADB**: `ADB_COMMAND` → `ANDROID_HOME`/`ANDROID_SDK_ROOT` → System `PATH` → Standard OS SDK paths (`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`, `/opt/homebrew/bin/adb`, etc.).
  - **Android Emulator**: `EMULATOR_COMMAND` → `ANDROID_HOME`/`ANDROID_SDK_ROOT` → System `PATH` → Inferred SDK path.
  - **Maven (`mvn` / `mvn.cmd`)**: `MAVEN_COMMAND` → System `PATH` → Project-embedded Maven (`apache-maven-3.9.16/bin/mvn`).
  - **Node.js & npx**: `NODE_COMMAND` / `NPX_COMMAND` → System `PATH`.
  - **Appium**: `APPIUM_COMMAND` → Standalone `appium` binary → `npx appium`.
  - **FFmpeg**: `FFMPEG_COMMAND` → Bundled `imageio-ffmpeg` binary → System `PATH`.
  - **scrcpy-server**: `SCRCPY_SERVER_PATH` → Bundled `app/assets/scrcpy-server.jar` asset → System install paths.
- **Diagnostics API**:
  - Evaluates availability, resolved filepaths, and errors for all dependencies without leaking secrets (`GET /api/system/diagnostics`).

---

### 2.2. Project Inspection, AST Scanning & Sanitization (`app/services/scanner.py`)
- **Safe ZIP Archive Extraction**:
  - Prevents directory traversal attacks (`../../` sanitization) during upload.
  - Generates unique collision-free project directory names (e.g., `project_1`, `project_2`).
- **Bloat Removal & Workspace Sanitization**:
  - Recursively removes `.git`, `.idea`, `.mvn`, `target`, `.DS_Store`, `node_modules`, `__pycache__` to keep workspaces lightweight.
- **Hierarchical Directory Tree Generation**:
  - Generates full nested directory structures for frontend visual rendering while ignoring build bloat.
- **Multi-Framework Static AST & Test Discovery**:
  - **Java (TestNG & JUnit 4 / JUnit 5 Jupiter)**: Regex/syntax parser discovers `@Test` annotated methods, method line numbers, class names, and execution targets (`ClassName#methodName`).
  - **Python (Pytest / Unittest)**: Python `ast` parser (with fallback regex parser) discovers `test_*` functions, `Test*` classes, and line numbers (`path::ClassName::test_name`).
  - **Playwright (TypeScript / JavaScript)**: Regex parser discovers `test('title', ...)` and `test.describe(...)` definitions.
  - **Node.js / npm**: Detects `package.json` test scripts.
- **Automation Manifest Support**:
  - Reads `automation.yaml` / `automation.yml` for custom execution commands, device requirements, and framework overrides.

---

### 2.3. Unified Device Management & ADB Engine (`app/services/device_manager.py` & `app/services/adb_bridge.py`)
- **Standardized Device Model (`UnifiedDevice`)**:
  - Supports both **Physical Android Devices** (USB / Wi-Fi) and **Android Studio Virtual Devices (AVDs)**.
  - Normalizes statuses: `available`, `busy`, `offline`, `starting`, `stopping`, `error`.
- **Asynchronous Device Locking & Reservations**:
  - Single-session reservation lock prevents multiple test executions from clashing on the same hardware.
- **AVD Lifecycle Control**:
  - Asynchronously launches emulators with `-no-boot-anim` flags and polls until `sys.boot_completed=1`.
  - Cleanly shuts down emulators via `emu kill` or ADB commands.
- **Remote Device Controls & Telemetry (`/api/device/control`, `/api/device/info`)**:
  - **Touch & Gestures**: Injects `input tap X Y`, `input swipe X1 Y1 X2 Y2 Duration`, drag, and scroll events.
  - **Keyevents**: Remote buttons for `BACK` (4), `HOME` (3), `APP_SWITCH`/Recents (187), `POWER` (26), `VOLUME_UP` (24), `VOLUME_DOWN` (25).
  - **Text Injection**: Types Unicode text into focused fields via ADB keyevents and Base64 broadcast intents.
  - **App Management**: Install/uninstall APKs, launch activities (`monkey -p ...`), force-stop packages, clear application data.
  - **Advanced Telemetry**: Extracts live battery level, charging state, screen resolution, density, orientation, Wi-Fi IP, CPU stats, and top foreground activity/package.
  - **Network Throttling**: Emulates `5G`, `4G` (LTE), `3G` (UMTS), `EDGE`, or `Full` network conditions.

---

### 2.4. Low-Latency Video Streaming & MP4 Recording (`app/services/capture_pipeline.py`)
- **Single-Capture Multiplexed Pipeline (`DeviceCapturePipeline`)**:
  - Deploys `scrcpy-server.jar` to `/data/local/tmp/scrcpy-server.jar` over ADB tunnel.
  - Reads raw **H.264 video NAL packets** directly from the TCP socket.
- **Zero-CPU MP4 Recording (`RecordingSink`)**:
  - Streams raw H.264 packets directly into FFmpeg `stdin` with `-c:v copy` (stream copy container muxing).
  - Produces zero CPU transcoding load on the host machine while generating web-ready MP4 recordings (`+faststart`).
- **Live Stream Fanout**:
  - Simultaneously pushes H.264 video frames over WebSockets (`/ws/emulator`) to browser WebCodecs decoders.
  - Supports MJPEG fallback streaming (`/api/stream/{device_id}`).
  - Multiplexes live viewing and background test recording without dual-ADB session lock conflicts.

---

### 2.5. Sequential Test Execution Manager & Runner (`app/services/execution_manager.py` & `app/services/runner.py`)
- **FIFO Execution Queue**:
  - Single background worker loop ensures exactly one test runs at a time per system/device.
  - Manages states: `QUEUED` → `STARTING` → `RUNNING` → `COMPLETED` / `FAILED` / `CANCELLED`.
- **Cancellation Handling**:
  - Cancelling a queued job transitions it to `CANCELLED` immediately.
  - Cancelling a running job sets `CANCEL_REQUESTED`, terminates/kills the active subprocess tree, stops recording, and cleanly releases device locks.
- **Dynamic Appium Server Lifecycle**:
  - Dynamically searches for free TCP ports (starting from 4723) and spawns dedicated Appium daemon instances per test.
- **Automatic APK Discovery & Pre-Install**:
  - Scans workspace for `.apk` binaries and automatically installs them onto target devices before test execution.
- **Execution Parameter Injection**:
  - Injects target device serial, Appium port, and URLs into environment variables and Maven/Gradle CLI flags (`-Dtest=...`, `-Ddevice_id=...`).
- **Real-Time Output Parsing & WebSockets**:
  - Streams live stdout/stderr to WebSocket subscribers (`/ws/execute/{project_name}`) and appends to persistent `.log` files.
  - Live regex stdout parsing extracts current screen, module, step description, and percentage progress.
- **Report Watching & Surefire Analytics (`app/services/watcher.py`, `app/services/analytics.py`)**:
  - Watches for generated Excel (`.xlsx`, `.xls`) test execution reports.
  - Parses Surefire XML reports (`TEST-*.xml`) for exact passed, failed, and skipped test counts.

---

### 2.6. SQLite Persistence Layer (`app/services/db.py`)
- **Database File**: `workspace/testbench.db`
- **Tables**:
  - `execution_jobs`: Contains `id`, `project`, `test`, `device_id`, `device_type`, `status`, `created_at`, `started_at`, `completed_at`, `duration`, `exit_code`, `result`, `log_file`, `report_file`, `recording_file`, `error`.
  - `execution_status`: Legacy status table maintained for backward compatibility.
- **Auto-Migration**: Automatically runs `PRAGMA table_info` and alters missing columns (e.g., `recording_file`) on startup.

---

## 3. Frontend Capabilities & UI Architecture

The frontend is built with **React 18**, **Vite 5**, **Tailwind CSS**, **Lucide React Icons**, and **Recharts**.

### 3.1. Global State Management (`src/context/ProjectContext.jsx`)
- **Authentication State**: Manages credentials (`callhealth@12` / `AKM12`) and `localStorage` session tokens.
- **Project State**: Current active project, project list, loading states, and test suites.
- **Test Selection State**: Single test selection, multi-test selection with checkboxes, `all` vs `selected` execution targets.
- **Device & Emulator State**: List of physical devices and emulators, selected active device, live boot states (`startingEmulator`).
- **Execution State (Single Source of Truth)**: Live execution ID, test status, progress percentage, current screen/module, running duration, fastest/slowest metrics.
- **Real-Time Polling**: Auto-refreshes device statuses, hardware telemetry, and active execution sessions every 2 seconds.

---

### 3.2. Pages & Views

#### 1. Landing Page (`src/pages/LandingPage.jsx`)
- **Drag-and-Drop Archive Upload**:
  - Accepts `.zip` project packages with animated drag-hover visual cues.
  - Real-time `XMLHttpRequest` upload progress bar.
- **Instant Project Inspection Card**:
  - Displays detected language, framework badge (Appium, Selenium, Playwright, Pytest, Maven), confidence score, and test counts.
  - Displays sanitized bloat items list (`.git`, `node_modules`, `target`, etc. removed).
  - Interactive collapsible directory tree preview.
- **Interactive Modals**:
  - **Platform Tour Modal**: 4-step interactive guided tour of TestBench capabilities.
  - **Quick Start Documentation Modal**: Guides for configuring tests, folder structures, and `automation.yaml`.

#### 2. Main Dashboard & Workbench (`src/pages/Dashboard.jsx`)
- **Dynamic Execution Command Banner**:
  - Shows exact generated shell command (e.g. `mvn test -Dtest=LoginTest,SearchTest` or `npx playwright test`).
- **Device Selector Bar**:
  - Displays target device, hardware tags (Real vs Emulator), and 1-click refresh/boot buttons.
- **Responsive 3-Column / 12-Column Grid Layout**:
  - **Left Column**: Test Execution Logistics chart, Advanced Device Information panel, Execution Summary card.
  - **Right Column**: Interactive 2-way Emulator View & Remote Controls.
  - **Bottom Row**: Execution History, Log Inspector & MP4 Video Viewer.

#### 3. Workspace Manager (`src/pages/WorkspaceView.jsx`)
- **Workspace Directory File Browser**:
  - Lists all files, directories, and uploaded bundles inside `workspace/`.
  - Shows file sizes, directories, ready statuses, and relative file paths.
- **Direct File Upload**:
  - Allows uploading individual auxiliary test data files, configs, or project zips.

#### 4. Logs & Console Center (`src/pages/LogsView.jsx`)
- Full-screen side-by-side or stacked view of execution history and live device stream.
- Toggle button to show or hide the live emulator video feed.

#### 5. Platform Configuration & Diagnostics (`src/pages/Settings.jsx`)
- **Live Dependency Health Checks**:
  - Checks Python, ADB, Android SDK, Android Emulator, Maven, Node.js, npx, Appium, FFmpeg, scrcpy-server.
  - Status indicators (Detected vs Missing) and resolved filesystem paths.
- **Workspace Storage Details**:
  - Shows active workspace folder and Watchdog status.
- **Server Host Information**:
  - Backend version and live server health status.

#### 6. Authentication (`src/pages/LoginPage.jsx`)
- Secure login screen with credential validation, error feedback, and session persistence.

---

### 3.3. Key UI Components & Interactive Modules

#### 1. Interactive Device Mirror & Controller (`src/components/EmulatorView.jsx`)
- **Hardware-Accelerated Video Rendering**:
  - Uses browser **WebCodecs API (`VideoDecoder`)** to decode low-latency H.264 NAL frames directly onto an HTML5 `<canvas>` element.
  - Seamless fallback to Base64 JPEG frame rendering.
- **2-Way Touch & Gesture Engine**:
  - Translates pointer clicks, drags, swipes, scrolls, and long-presses directly into normalized device coordinates (`input tap`, `input swipe`).
- **Remote Hardware Action Bar**:
  - Navigation: **Back**, **Home**, **Recents / App Switcher**.
  - System controls: **Power**, **Volume Up**, **Volume Down**, **Screen Rotation** (0°, 90°, 180°, 270°), **Screen Lock / Unlock**.
  - **Quick Text Input Modal**: Type any text from keyboard and inject directly into device input fields.
  - **Screenshot & Recording Triggers**: Take on-demand device screenshots.
- **Telemetry Bar (`src/components/TelemetryBar.jsx`)**:
  - Displays live streaming FPS, streaming latency (ms), display resolution, and mode toggle (**View-Only** vs **Interactive Mode**).

#### 2. Execution History & Video / Log Modals (`src/components/ExecutionHistory.jsx`)
- **Job Status Badges**: Real-time animated status chips (`Queued`, `Running`, `Completed`, `Failed`, `Cancelled`).
- **Test Trigger Controls**: Run all tests, run selected tests, or stop/cancel running jobs.
- **Log Inspector Modal**:
  - Full-screen modal to view stdout logs with search filter, line numbers, copy-to-clipboard, and plain text download.
- **Recorded Test Video Modal**:
  - In-browser HTML5 MP4 video player to replay recorded test executions (`/api/recordings/{filename}`).

#### 3. Test Execution Logistics (`src/components/LogisticsView.jsx`)
- **Recharts Donut Chart**: Visualizes test execution distribution (Passed = Green, Failed = Red, Skipped = Amber).
- **Metric Cards**: Total executed tests, passed tests, and failed assertions with 3-second auto-polling.

#### 4. Advanced Device Information Panel (`src/components/DeviceInfoPanel.jsx`)
- Tabbed hardware breakdown:
  - **Device Specs**: Model, manufacturer, Android OS version, SDK API level, CPU ABI.
  - **Battery Info**: Battery percentage, health status, temperature, voltage, charging state.
  - **Network & Connectivity**: Connection type (USB/Wi-Fi), IP address, network speed throttle selector.
  - **Runtime Status**: Screen resolution, density, orientation, top foreground package/activity.

#### 5. Precision Execution Summary (`src/components/ExecutionSummaryCard.jsx`)
- Live ticking stopwatch during execution.
- Started timestamp, total elapsed duration, and fastest vs slowest test class metrics.

#### 6. Resizable Navigation Sidebar (`src/components/Sidebar.jsx`)
- Draggable custom-width sidebar (200px to 550px) saved in `localStorage`.
- Tree explorer of uploaded projects with framework identification badges.
- Checkbox multi-selection for test classes (Select All, Deselect All, Individual Selection).

#### 7. Global Top Header (`src/components/Header.jsx`)
- Global search input for filtering projects and logs.
- Dynamic animated **Download Excel Report** button (appears automatically when a report is generated).
- Active workspace status badge.
- Profile dropdown with user info and Logout trigger.

---

## 4. Backend API & WebSocket Reference

### 4.1. HTTP REST Endpoints

| Method | Endpoint | Description | Request Body / Parameters |
|---|---|---|---|
| `GET` | `/api/health` | Backend status, version & project count | None |
| `GET` | `/api/system/diagnostics` | Full dependency discovery report | None |
| `GET` | `/api/projects` | Lists all scanned workspace projects | None |
| `POST` | `/api/upload` | Uploads, sanitizes, and scans project `.zip` | Form Data (`file: UploadFile`) |
| `GET` | `/api/projects/{name}` | Details, framework & test list for project | `name: string` (Path) |
| `GET` | `/api/projects/{name}/tests` | Discovered test methods and classes | `name: string` (Path) |
| `GET` | `/api/projects/{name}/tree` | Directory tree hierarchy | `name: string` (Path) |
| `GET` | `/api/devices` | Unified physical devices & emulators list | None |
| `GET` | `/api/devices/{device_id}` | Detailed telemetry for single device | `device_id: string` (Path) |
| `POST` | `/api/emulator/start` | Boots Android Studio AVD emulator | `{ "avd_name": "string" }` |
| `POST` | `/api/emulator/stop` | Stops/kills running Android emulator | `{ "device_id": "string" }` |
| `POST` | `/api/emulator/control` | Controls emulator hardware/settings | `{ "action": "string", "device_id": "..." }` |
| `POST` | `/api/device/control` | Injects taps, swipes, keys, text | `{ "action": "tap\|swipe\|key\|text", ... }` |
| `GET` | `/api/device/info` | Live battery, network, resolution stats | `device_id?: string` (Query) |
| `POST` | `/api/network/throttle` | Throttles AVD network speed (5G/4G/3G) | `{ "speed": "full\|5g\|4g\|3g\|edge" }` |
| `POST` | `/api/executions` | Enqueues job into sequential worker queue | `{ "project": "...", "test": "...", "device_id": "..." }` |
| `GET` | `/api/executions` | Lists recent execution jobs | `project?: string, limit?: int` |
| `GET` | `/api/executions/{id}` | Retrieves execution status & recording file | `id: string` (Path) |
| `POST` | `/api/executions/{id}/cancel`| Cancels queued or running job safely | `id: string` (Path) |
| `GET` | `/api/execution/session` | Single source of truth session telemetry | `execution_id?: str, device_id?: str` |
| `GET` | `/api/execution/sessions`| Lists all active execution sessions | None |
| `GET` | `/api/status/{project_name}` | Latest status flag (Running, Idle, Failed) | `project_name: string` (Path) |
| `GET` | `/api/logs/{project_name}` | Lists `.log` files for project | `project_name: string` (Path) |
| `GET` | `/api/logs/{project}/{file}` | Reads content or downloads log file | `project, file` (Path), `download?: bool` |
| `GET` | `/api/recordings/{filename}` | Streams MP4 video recording with Range headers | `filename: string` (Path), `download?: bool`|
| `GET` | `/api/reports/{proj}/{file}` | Downloads generated Excel report file | `proj, file` (Path) |
| `GET` | `/api/analytics/{project_name}`| Parsed Surefire pass/fail/skip metrics | `project_name: string` (Path) |
| `GET` | `/api/workspace/files` | Lists root workspace folder contents | None |
| `POST` | `/api/workspace/upload` | Uploads individual file to workspace | Form Data (`file: UploadFile`) |

### 4.2. WebSocket Endpoints

| Protocol | Endpoint | Description |
|---|---|---|
| `WebSocket` | `/ws/emulator?device_id=...` | Streams low-latency H.264 / JPEG video frames directly from `scrcpy-server`. |
| `WebSocket` | `/ws/execute/{project_name}` | Real-time stdout/stderr execution log streaming. |
| `WebSocket` | `/ws/logs` | Real-time system log broadcasts. |

---

## 5. End-to-End Execution Lifecycle Trace

```
1. USER UPLOADS PROJECT (.zip)
   └─► POST /api/upload
       └─► Backend safely unzips into workspace/<project_name>
       └─► Removes bloat (.git, node_modules, target)
       └─► Scanner runs AST analysis -> returns framework, tests, directory tree
       └─► Frontend receives project and selects it in ProjectContext

2. USER SELECTS DEVICE & TESTS
   └─► User picks target device (Real device or AVD Emulator)
   └─► If emulator is offline, user clicks "Boot" -> POST /api/emulator/start
   └─► User checks 1 or more test classes in sidebar -> updates selectedTests

3. USER CLICKS "RUN TEST"
   └─► POST /api/executions -> returns execution_id, status='QUEUED'
   └─► Background Worker picks job from FIFO queue -> status='RUNNING'
   └─► Starts zero-CPU MP4 screen recording (FFmpeg -c:v copy)
   └─► Allocates dynamic Appium port & launches Appium server (if mobile)
   └─► Discovers & auto-installs project APK on target device
   └─► Spawns test subprocess (Maven/Pytest/Playwright) with injected parameters

4. LIVE MONITORING & INTERACTION
   └─► WebSocket /ws/emulator feeds live H.264 video to Canvas on Frontend
   └─► User can tap/swipe on live Canvas -> POST /api/device/control
   └─► Backend parses live stdout -> updates progress, current screen, telemetry
   └─► Frontend polls /api/status and /api/execution/session

5. COMPLETION & REPORTING
   └─► Test runner finishes -> Watchdog detects Excel/Surefire XML report
   └─► FFmpeg finalizes MP4 recording -> saved in workspace/logs/recordings/<id>.mp4
   └─► Device lock released for next queued job
   └─► Frontend displays Success/Failed status, Excel download button, and MP4 replay modal
```
