from typing import Optional
from datetime import date
from pydantic import BaseModel, EmailStr


# ---------- Auth Schemas ----------
class RegisterUser(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: Optional[str] = "tester"  # 'tester', 'manager', or 'developer'


class LoginUser(BaseModel):
    email: EmailStr
    password: str


# ---------- Task Schemas ----------
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"  # low / medium / high
    due_date: Optional[date] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None


class TaskAssign(BaseModel):
    developer_id: int


class TaskStatusUpdate(BaseModel):
    status: str  # todo / in_progress / done