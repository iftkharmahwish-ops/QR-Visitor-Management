from __future__ import annotations

from pathlib import Path

from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .models import CheckInRequest, CheckOutRequest, FaceAuthRequest, LoginRequest, VisitorRegistrationRequest
from .notifications import send_registration_email
from .services import (
    authenticate_user,
    build_dashboard,
    check_in_visitor,
    check_out_visitor,
    create_auth_token,
    detect_suspicious_patterns,
    face_authenticate,
    get_qr_file,
    get_visitor,
    list_visitors,
    register_visitor,
    verify_auth_token,
)
from .storage import ensure_storage


app = FastAPI(
    title="QR-Based Visitor Management Backend",
    version="1.0.0",
    description="Backend APIs for office visitor registration, QR generation, check-in scanning, and dashboard monitoring.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_storage()


class DashboardConnectionManager:
    def __init__(self) -> None:
        self.connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, payload: dict) -> None:
        disconnected: list[WebSocket] = []
        for websocket in self.connections:
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(websocket)


dashboard_manager = DashboardConnectionManager()


@app.on_event("startup")
def startup() -> None:
    ensure_storage()


def get_current_user(authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()
    user = verify_auth_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or missing authentication token.")
    return user


def require_role(required_roles: tuple[Literal["admin", "security"], ...]):
    def dependency(user=Depends(get_current_user)):
        if user.role not in required_roles:
            raise HTTPException(status_code=403, detail="You do not have permission for this action.")
        return user

    return dependency


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "qr-based-visitor-management-backend"}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict:
    user = authenticate_user(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token = create_auth_token(user)
    return {"token": token, "user": user}


@app.get("/api/auth/me")
def me(user=Depends(get_current_user)) -> dict:
    return user.model_dump()


@app.post("/api/visitors/register", status_code=201)
async def register(payload: VisitorRegistrationRequest, request: Request) -> dict:
    base_url = str(request.base_url).rstrip("/")
    record = register_visitor(payload, base_url)
    qr_file_path = Path(__file__).resolve().parent.parent / "generated_qr" / f"{record['visitor_id']}.png"
    email_status = send_registration_email(
        to_email=record["email"],
        visitor_name=record["full_name"],
        visitor_id=record["visitor_id"],
        purpose=record["purpose"],
        branch=record["branch"],
        visit_date=record["visit_date"],
        qr_code_url=record["qr_code_url"],
        qr_file_path=str(qr_file_path),
    )
    await dashboard_manager.broadcast(build_dashboard())
    return {**record, "email_notification": email_status}


@app.get("/api/visitors")
def visitors(user=Depends(require_role(("admin", "security")))) -> dict:
    return {"items": list_visitors()}


@app.get("/api/visitors/{visitor_id}")
def visitor_detail(visitor_id: str) -> dict:
    record = get_visitor(visitor_id)
    if not record:
        raise HTTPException(status_code=404, detail="Visitor not found.")
    return record


@app.get("/api/visitors/{visitor_id}/qr")
def visitor_qr(visitor_id: str) -> FileResponse:
    file_path = get_qr_file(visitor_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="QR code not found.")
    return FileResponse(path=file_path, media_type="image/png", filename=f"{visitor_id}.png")


@app.post("/api/security/checkin")
async def security_checkin(payload: CheckInRequest, user=Depends(require_role(("admin", "security")))) -> dict:
    record = check_in_visitor(payload.visitor_id, payload.gate_name)
    if not record:
        raise HTTPException(status_code=404, detail="Visitor not found.")
    await dashboard_manager.broadcast(build_dashboard())
    return {"message": "Visitor checked in successfully.", "visitor": record}


@app.post("/api/security/checkout")
async def security_checkout(payload: CheckOutRequest, user=Depends(require_role(("admin", "security")))) -> dict:
    record = check_out_visitor(payload.visitor_id)
    if not record:
        raise HTTPException(status_code=404, detail="Visitor not found.")
    await dashboard_manager.broadcast(build_dashboard())
    return {"message": "Visitor checked out successfully.", "visitor": record}


@app.get("/api/dashboard/live-stats")
def dashboard(user=Depends(require_role(("admin", "security")))) -> dict:
    return build_dashboard()


@app.post("/api/ai/face-auth")
def face_auth(payload: FaceAuthRequest) -> dict:
    return face_authenticate(payload.visitor_id, payload.live_face_token)


@app.get("/api/ai/suspicious-patterns")
def suspicious_patterns(user=Depends(require_role(("admin",)) )) -> dict:
    return {"alerts": detect_suspicious_patterns()}


@app.websocket("/ws/dashboard")
async def dashboard_socket(websocket: WebSocket, token: str = Query(default="")) -> None:
    user = verify_auth_token(token)
    if not user or user.role not in ("admin", "security"):
        await websocket.close(code=1008)
        return

    await dashboard_manager.connect(websocket)
    try:
        await websocket.send_json(build_dashboard())
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        dashboard_manager.disconnect(websocket)
