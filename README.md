# TestBench

TestBench is a full-stack project environment for running, testing, and managing uploaded user projects.

## Project Structure

```
TestBench1/
├── backend/          # Python FastAPI application (Uvicorn, WebSockets, Watchdog, Multipart)
├── frontend/         # React + Vite frontend (Tailwind CSS, Lucide React, React Router)
└── workspace/        # Storage directory for uploaded user projects & execution
```

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
uvicorn app.main:app --reload --port 8000
```
Backend API will be running at `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`).

### 2. Frontend Setup (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Frontend application will be available at `http://localhost:5173`.
