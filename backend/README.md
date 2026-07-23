# TestBench Backend Service

Python FastAPI backend for TestBench with `uvicorn`, `python-multipart`, `websockets`, and `watchdog`.

## Endpoints
- `GET /api/health` - Check service status and workspace info
- `GET /api/workspace/files` - List items in workspace directory
- `POST /api/workspace/upload` - Upload project files to workspace
- `WS /ws/logs` - WebSocket stream for real-time logs and process events

## Run Locally
```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
