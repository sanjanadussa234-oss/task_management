from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from schemas import RegisterUser, LoginUser, TaskCreate, TaskUpdate, TaskAssign, TaskStatusUpdate
from database import init_db, get_db
from auth import hash_password, verify_password, create_token, get_current_user, require_role

VALID_STATUSES = {"todo", "in_progress", "done"}
VALID_PRIORITIES = {"low", "medium", "high"}
VALID_ROLES = {"tester", "manager", "developer"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Task Management System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # update to deployed frontend URL later
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== AUTH ====================

@app.post("/register")
def register(user: RegisterUser):
    if user.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {VALID_ROLES}")
    try:
        hashed_password = hash_password(user.password)
        with get_db() as cur:
            cur.execute(
                "INSERT INTO users (username, email, password, role) VALUES (%s, %s, %s, %s) RETURNING id",
                (user.username, user.email, hashed_password, user.role,)
            )
            user_id = cur.fetchone()[0]
        return {"message": "User registered successfully", "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/login")
def login(user: LoginUser):
    with get_db() as cur:
        cur.execute(
            "SELECT id, password, role FROM users WHERE email=%s", (user.email,)
        )
        res = cur.fetchone()

    if res is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id, db_password, role = res
    if not verify_password(user.password, db_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user_id, role)
    return {"message": "Login successful", **token, "role": role}


# ==================== TASKS ====================

@app.post("/tasks")
def create_task(task: TaskCreate, current_user: dict = Depends(require_role("tester"))):
    """Only testers can create a task."""
    if task.priority and task.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priority must be one of {VALID_PRIORITIES}")
    try:
        with get_db() as cur:
            cur.execute(
                """INSERT INTO tasks (title, description, priority, due_date, created_by)
                   VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                (task.title, task.description, task.priority, task.due_date, current_user["user_id"],)
            )
            task_id = cur.fetchone()[0]
        return {"message": "Task created successfully", "task_id": task_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/tasks")
def list_tasks(
    status: str | None = None,
    priority: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Testers see only tasks they created.
    Managers see all tasks.
    Developers see only tasks assigned to them.
    Optional query params ?status= and ?priority= filter results.
    """
    try:
        base_query = """SELECT id, title, description, priority, due_date, status,
                                created_by, assigned_to, created_at, updated_at
                         FROM tasks WHERE 1=1"""
        params = []

        if current_user["role"] == "manager":
            pass  # no extra filter, sees everything
        elif current_user["role"] == "developer":
            base_query += " AND assigned_to=%s"
            params.append(current_user["user_id"])
        else:  # tester
            base_query += " AND created_by=%s"
            params.append(current_user["user_id"])

        if status:
            if status not in VALID_STATUSES:
                raise HTTPException(status_code=400, detail=f"Status must be one of {VALID_STATUSES}")
            base_query += " AND status=%s"
            params.append(status)

        if priority:
            if priority not in VALID_PRIORITIES:
                raise HTTPException(status_code=400, detail=f"Priority must be one of {VALID_PRIORITIES}")
            base_query += " AND priority=%s"
            params.append(priority)

        base_query += " ORDER BY created_at DESC"

        with get_db() as cur:
            cur.execute(base_query, tuple(params))
            rows = cur.fetchall()

        tasks = [
            {
                "id": r[0], "title": r[1], "description": r[2], "priority": r[3],
                "due_date": r[4], "status": r[5], "created_by": r[6], "assigned_to": r[7],
                "created_at": r[8], "updated_at": r[9]
            }
            for r in rows
        ]
        return {"tasks": tasks}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/tasks/{task_id}")
def get_task(task_id: int, current_user: dict = Depends(get_current_user)):
    try:
        with get_db() as cur:
            cur.execute(
                """SELECT id, title, description, priority, due_date, status,
                          created_by, assigned_to, created_at, updated_at
                   FROM tasks WHERE id=%s""",
                (task_id,)
            )
            r = cur.fetchone()

        if r is None:
            raise HTTPException(status_code=404, detail="Task not found")

        if current_user["role"] == "tester" and r[6] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="You cannot view this task")
        if current_user["role"] == "developer" and r[7] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="You cannot view this task")

        return {
            "id": r[0], "title": r[1], "description": r[2], "priority": r[3],
            "due_date": r[4], "status": r[5], "created_by": r[6], "assigned_to": r[7],
            "created_at": r[8], "updated_at": r[9]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/tasks/{task_id}")
def update_task(task_id: int, task: TaskUpdate, current_user: dict = Depends(get_current_user)):
    """
    Tester: can edit only their own task, and only while status is 'todo'.
    Manager: can edit any task, any time.
    Developer: cannot edit task details (only status, via /tasks/{id}/status).
    """
    if task.priority and task.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priority must be one of {VALID_PRIORITIES}")

    try:
        with get_db() as cur:
            cur.execute("SELECT created_by, status FROM tasks WHERE id=%s", (task_id,))
            r = cur.fetchone()
            if r is None:
                raise HTTPException(status_code=404, detail="Task not found")
            created_by, status = r

            if current_user["role"] == "developer":
                raise HTTPException(status_code=403, detail="Developers cannot edit task details")

            if current_user["role"] == "tester":
                if created_by != current_user["user_id"]:
                    raise HTTPException(status_code=403, detail="You can only edit your own tasks")
                if status != "todo":
                    raise HTTPException(status_code=403, detail="You can only edit a task while it is still in 'todo'")

            fields, params = [], []
            for col in ("title", "description", "priority", "due_date"):
                val = getattr(task, col)
                if val is not None:
                    fields.append(f"{col}=%s")
                    params.append(val)

            if not fields:
                raise HTTPException(status_code=400, detail="No fields provided to update")

            fields.append("updated_at=NOW()")
            params.append(task_id)
            cur.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id=%s", tuple(params))

        return {"message": "Task updated successfully", "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, current_user: dict = Depends(get_current_user)):
    """
    Tester: can delete only their own task, and only while status is 'todo'.
    Manager: can delete any task, any time.
    Developer: cannot delete tasks.
    """
    try:
        with get_db() as cur:
            cur.execute("SELECT created_by, status FROM tasks WHERE id=%s", (task_id,))
            r = cur.fetchone()
            if r is None:
                raise HTTPException(status_code=404, detail="Task not found")
            created_by, status = r

            if current_user["role"] == "developer":
                raise HTTPException(status_code=403, detail="Developers cannot delete tasks")

            if current_user["role"] == "tester":
                if created_by != current_user["user_id"]:
                    raise HTTPException(status_code=403, detail="You can only delete your own tasks")
                if status != "todo":
                    raise HTTPException(status_code=403, detail="You can only delete a task while it is still in 'todo'")

            cur.execute("DELETE FROM tasks WHERE id=%s", (task_id,))

        return {"message": "Task deleted successfully", "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/tasks/{task_id}/assign")
def assign_task(task_id: int, assign: TaskAssign, current_user: dict = Depends(require_role("manager"))):
    """Only managers can assign (or reassign) a developer to a task."""
    try:
        with get_db() as cur:
            cur.execute("SELECT role FROM users WHERE id=%s", (assign.developer_id,))
            dev = cur.fetchone()
            if dev is None or dev[0] != "developer":
                raise HTTPException(status_code=400, detail="Invalid developer_id")

            cur.execute(
                "UPDATE tasks SET assigned_to=%s, updated_at=NOW() WHERE id=%s RETURNING id",
                (assign.developer_id, task_id,)
            )
            updated = cur.fetchone()

        if updated is None:
            raise HTTPException(status_code=404, detail="Task not found")

        return {"message": "Developer assigned successfully", "task_id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/tasks/{task_id}/status")
def update_status(task_id: int, status_update: TaskStatusUpdate, current_user: dict = Depends(require_role("manager", "developer"))):
    """Manager or the assigned developer can update task status."""
    if status_update.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of {VALID_STATUSES}")

    try:
        with get_db() as cur:
            cur.execute("SELECT assigned_to FROM tasks WHERE id=%s", (task_id,))
            r = cur.fetchone()
            if r is None:
                raise HTTPException(status_code=404, detail="Task not found")

            if current_user["role"] == "developer" and r[0] != current_user["user_id"]:
                raise HTTPException(status_code=403, detail="This task is not assigned to you")

            cur.execute(
                "UPDATE tasks SET status=%s, updated_at=NOW() WHERE id=%s",
                (status_update.status, task_id,)
            )

        return {"message": "Status updated successfully", "task_id": task_id, "status": status_update.status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== DASHBOARD ====================

@app.get("/dashboard")
def dashboard(current_user: dict = Depends(require_role("manager", "developer"))):
    """Summary counts of tasks by status, for monitoring progress."""
    try:
        with get_db() as cur:
            if current_user["role"] == "manager":
                cur.execute("SELECT status, COUNT(*) FROM tasks GROUP BY status")
            else:  # developer sees only their assigned tasks
                cur.execute(
                    "SELECT status, COUNT(*) FROM tasks WHERE assigned_to=%s GROUP BY status",
                    (current_user["user_id"],)
                )
            rows = cur.fetchall()

        summary = {status: 0 for status in VALID_STATUSES}
        for status, count in rows:
            summary[status] = count

        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))