from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


VisitorStatus = Literal["pre-approved", "checked-in", "checked-out"]
UserRole = Literal["admin", "security"]


class VisitorRegistrationRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=7, max_length=20)
    email: EmailStr
    company: str = Field(..., min_length=2, max_length=100)
    purpose: str = Field(..., min_length=3, max_length=120)
    employee_to_meet: str = Field(..., min_length=2, max_length=80)
    branch: str = Field(..., min_length=2, max_length=80)
    visit_date: str = Field(..., description="Expected format YYYY-MM-DD")
    face_image_url: Optional[str] = None


class VisitorRecord(VisitorRegistrationRequest):
    visitor_id: str
    qr_code_url: str
    qr_payload: str
    status: VisitorStatus
    created_at: datetime
    checked_in_at: Optional[datetime] = None
    checked_out_at: Optional[datetime] = None
    gate_name: Optional[str] = None
    risk_flags: list[str] = Field(default_factory=list)


class CheckInRequest(BaseModel):
    visitor_id: str
    gate_name: str = Field(..., min_length=2, max_length=60)


class CheckOutRequest(BaseModel):
    visitor_id: str


class FaceAuthRequest(BaseModel):
    visitor_id: str
    live_face_token: str = Field(..., min_length=4, max_length=200)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4, max_length=128)


class AuthenticatedUser(BaseModel):
    username: str
    role: UserRole


class ApiMessage(BaseModel):
    message: str
