# TestBench

TestBench is a lightweight test orchestration and device automation platform for automation engineers.

## Project Structure

```
testbench/
├── backend/          # Python FastAPI backend (Uvicorn, WebSockets, ADB Bridge, Watchdog)
├── frontend/         # React 18 + Vite 5 frontend (Tailwind CSS, Lucide React, Recharts)
├── workspace/        # Storage directory for uploaded user projects, logs & SQLite database
└── .env.example      # Sample environment configuration file
```

---

## Environment & Dependency Discovery

TestBench includes a centralized environment configuration and automated executable discovery layer ([`backend/app/config.py`](file:///backend/app/config.py)).

### Supported Environment Variables

| Variable | Description | Default / Fallback |
|---|---|---|
| `TESTBENCH_WORKSPACE` | Custom path to the workspace folder | `<repo_root>/workspace` |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Base directory of Android SDK | Auto-detected from standard OS locations |
| `ADB_COMMAND` | Path or command for `adb` | `ANDROID_HOME/platform-tools/adb` or system `PATH` |
| `EMULATOR_COMMAND` | Path or command for `emulator` | `ANDROID_HOME/emulator/emulator` or system `PATH` |
| `MAVEN_COMMAND` | Path or command for Maven (`mvn` / `mvn.cmd`) | System `PATH` or project-embedded Maven |
| `NODE_COMMAND` | Path or command for Node.js (`node`) | System `PATH` |
| `NPX_COMMAND` | Path or command for `npx` | System `PATH` |
| `APPIUM_COMMAND` | Path or command for Appium | Standalone `appium` in `PATH` or `npx appium` |
| `FFMPEG_COMMAND` | Path or command for FFmpeg | Bundled `imageio-ffmpeg` or system `PATH` |
| `SCRCPY_SERVER_PATH` | Path to `scrcpy-server.jar` | Bundled `backend/app/assets/scrcpy-server.jar` |

---

## Executable Discovery Priority

1. **ADB**: `ADB_COMMAND` > `ANDROID_HOME`/`ANDROID_SDK_ROOT` > System `PATH` > Standard OS SDK paths (`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`, etc.)
2. **Android Emulator**: `EMULATOR_COMMAND` > `ANDROID_HOME`/`ANDROID_SDK_ROOT` > System `PATH` > Standard OS SDK paths > Inferred from ADB path
3. **Maven**: `MAVEN_COMMAND` > System `PATH` (`mvn` / `mvn.cmd`) > Project-embedded Maven
4. **Node & npx**: `NODE_COMMAND` / `NPX_COMMAND` > System `PATH`
5. **Appium**: `APPIUM_COMMAND` > System `PATH` (`appium`) > `npx appium`
6. **FFmpeg**: `FFMPEG_COMMAND` > Bundled `imageio-ffmpeg` binary > System `PATH`
7. **scrcpy-server**: `SCRCPY_SERVER_PATH` > Bundled asset (`backend/app/assets/scrcpy-server.jar`)

---

## Diagnostics Endpoint

Query environment health and detected tools via API:

```http
GET /api/system/diagnostics
```

Example JSON Response:
```json
{
  "status": "healthy",
  "workspace": {
    "path": "C:\\Users\\...\\workspace",
    "exists": true,
    "is_directory": true
  },
  "dependencies": [
    { "name": "Python", "available": true, "path": "C:\\...\\python.exe" },
    { "name": "ADB", "available": true, "path": "C:\\...\\adb.exe" },
    { "name": "Android SDK", "available": true, "path": "C:\\...\\Android\\Sdk" },
    { "name": "Android Emulator", "available": true, "path": "C:\\...\\emulator.exe" },
    { "name": "Maven", "available": true, "path": "C:\\...\\bin\\mvn.cmd" },
    { "name": "npx", "available": true, "path": "C:\\Program Files\\nodejs\\npx.cmd" },
    { "name": "Appium", "available": true, "path": "npx appium" },
    { "name": "FFmpeg", "available": true, "path": "C:\\...\\ffmpeg.exe" },
    { "name": "scrcpy-server", "available": true, "path": "C:\\...\\scrcpy-server.jar" }
  ]
}
```

---

## Quick Start

### 1. Backend Setup (FastAPI)
```bash
cd backend
python -m venv .venv
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
Backend API will be running at `http://localhost:8000` (Interactive docs at `http://localhost:8000/docs`).

### 2. Frontend Setup (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Frontend application will be available at `http://localhost:5173`.

### 3. Run Backend Tests
```bash
python -m unittest discover -s backend/tests -v
```
