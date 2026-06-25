import { useState, useEffect } from "react";
import { api } from "./api";
import { IconDashboard, IconTasks, IconLogout } from "./icons";

const ROLE_META = {
  tester: { label: "Tester", color: "var(--role-tester)", bg: "var(--role-tester-bg)" },
  manager: { label: "Manager", color: "var(--role-manager)", bg: "var(--role-manager-bg)" },
  developer: { label: "Developer", color: "var(--role-developer)", bg: "var(--role-developer-bg)" },
};

const STATUS_META = {
  todo: { label: "Todo", color: "var(--status-todo)", bg: "var(--status-todo-bg)" },
  in_progress: { label: "In progress", color: "var(--status-progress)", bg: "var(--status-progress-bg)" },
  done: { label: "Done", color: "var(--status-done)", bg: "var(--status-done-bg)" },
};

const PRIORITY_META = {
  low: { label: "Low", color: "var(--priority-low)", bg: "var(--priority-low-bg)" },
  medium: { label: "Medium", color: "var(--priority-medium)", bg: "var(--priority-medium-bg)" },
  high: { label: "High", color: "var(--priority-high)", bg: "var(--priority-high-bg)" },
};

function Chip({ meta }) {
  return (
    <span className="chip" style={{ color: meta.color, background: meta.bg }}>
      <span className="chip-dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function initials(role) {
  return ROLE_META[role]?.label?.[0]?.toUpperCase() || "?";
}

// ---------- Auth screen ----------
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "tester" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const res = await api.login({ email: form.email, password: form.password });
        localStorage.setItem("token", res.token);
        localStorage.setItem("role", res.role);
        onLogin(res.role);
      } else {
        await api.register(form);
        setMode("login");
        setError("Registered successfully. Please log in.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand-mark">T</div>
        <h1 className="auth-title">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="auth-subtitle">
          {mode === "login" ? "Sign in to Task Management" : "Set up access to Task Management"}
        </p>

        {error && <div className="alert-banner info">{error}</div>}

        <form onSubmit={submit}>
          {mode === "register" && (
            <div style={{ marginBottom: 14 }}>
              <label className="field-label">Username</label>
              <input className="input" required value={form.username} onChange={update("username")} />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label className="field-label">Email</label>
            <input type="email" className="input" required value={form.email} onChange={update("email")} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="field-label">Password</label>
            <input type="password" className="input" required value={form.password} onChange={update("password")} />
          </div>

          {mode === "register" && (
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Role</label>
              <select className="select" value={form.role} onChange={update("role")}>
                <option value="tester">Tester</option>
                <option value="developer">Developer</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          )}

          <button className="btn btn-primary" style={{ width: "100%", padding: "9px 0" }} disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Register"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" ? "Need an account? " : "Already have an account? "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Register" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar({ role, onLogout }) {
  const meta = ROLE_META[role];
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">T</div>
        <div>
          <div className="sidebar-brand-text">Task Management</div>
          <div className="sidebar-brand-sub">Workspace</div>
        </div>
      </div>

      <div className="sidebar-eyebrow">Workspace</div>
      <nav className="sidebar-nav">
        <button className="sidebar-item active">
          <span className="sidebar-icon"><IconTasks /></span>
          Tasks
        </button>
        {(role === "manager" || role === "developer") && (
          <button className="sidebar-item" disabled style={{ opacity: 0.5, cursor: "default" }}>
            <span className="sidebar-icon"><IconDashboard /></span>
            Overview (below)
          </button>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar" style={{ background: meta.bg, color: meta.color }}>
            {initials(role)}
          </div>
          <div className="user-meta">
            <div className="user-role-label" style={{ color: meta.color }}>{meta.label}</div>
            <button className="user-logout" onClick={onLogout}>Sign out</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------- Dashboard / main content ----------
function Dashboard({ role, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status: "", priority: "" });
  const [newTask, setNewTask] = useState({ title: "", description: "", priority: "medium", due_date: "" });
  const [developerId, setDeveloperId] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "medium", due_date: "" });

  const loadTasks = async (activeFilters = filters) => {
    try {
      const res = await api.listTasks(activeFilters);
      setTasks(res.tasks);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadDashboard = async () => {
    if (role === "manager" || role === "developer") {
      try {
        const res = await api.dashboard();
        setSummary(res.summary);
      } catch (err) {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    loadTasks();
    loadDashboard();
  }, []);

  const applyFilters = (e) => {
    e.preventDefault();
    loadTasks(filters);
  };

  const clearFilters = () => {
    const cleared = { status: "", priority: "" };
    setFilters(cleared);
    loadTasks(cleared);
  };

  const submitNewTask = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = { ...newTask, due_date: newTask.due_date || null };
      await api.createTask(payload);
      setNewTask({ title: "", description: "", priority: "medium", due_date: "" });
      loadTasks();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssign = async (id) => {
    setError("");
    try {
      await api.assignTask(id, parseInt(developerId[id], 10));
      loadTasks();
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (id, status) => {
    setError("");
    try {
      await api.updateStatus(id, status);
      loadTasks();
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditForm({
      title: t.title,
      description: t.description || "",
      priority: t.priority,
      due_date: t.due_date || "",
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id) => {
    setError("");
    try {
      const payload = { ...editForm, due_date: editForm.due_date || null };
      await api.updateTask(id, payload);
      setEditingId(null);
      loadTasks();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    setError("");
    try {
      await api.deleteTask(id);
      loadTasks();
      loadDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const canModify = (t) => {
    if (role === "manager") return true;
    if (role === "tester") return t.status === "todo";
    return false;
  };

  const subtitleByRole = {
    tester: "Create tasks and track their progress through to completion",
    manager: "Oversee every task, assign developers, and monitor delivery",
    developer: "Work through the tasks assigned to you",
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">{subtitleByRole[role]}</p>
        </div>
      </div>

      {error && <div className="alert-banner">{error}</div>}

      {summary && (
        <div className="stat-row">
          {Object.entries(summary).map(([status, count]) => {
            const meta = STATUS_META[status];
            return (
              <div className="stat-card" key={status}>
                <div className="stat-value">{count}</div>
                <Chip meta={meta} />
              </div>
            );
          })}
        </div>
      )}

      {role === "tester" && (
        <div className="panel">
          <h2 className="panel-title">New task</h2>
          <form onSubmit={submitNewTask} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "2 1 200px" }}>
              <label className="field-label">Title</label>
              <input
                className="input"
                required
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              />
            </div>
            <div style={{ flex: "3 1 240px" }}>
              <label className="field-label">Description</label>
              <input
                className="input"
                placeholder="Optional"
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <label className="field-label">Priority</label>
              <select
                className="select"
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label className="field-label">Due date</label>
              <input
                type="date"
                className="input"
                value={newTask.due_date}
                onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
              />
            </div>
            <button className="btn btn-primary">Add task</button>
          </form>
        </div>
      )}

      <div className="panel">
        <h2 className="panel-title">Filter</h2>
        <form onSubmit={applyFilters} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 160px" }}>
            <label className="field-label">Status</label>
            <select
              className="select"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All statuses</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label className="field-label">Priority</label>
            <select
              className="select"
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            >
              <option value="">All priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <button className="btn btn-outline">Apply</button>
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear</button>
        </form>
      </div>

      <div className="panel">
        <h2 className="panel-title">
          {role === "tester" ? "Your tasks" : role === "developer" ? "Assigned to you" : "All tasks"}
        </h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Priority</th>
              <th>Due date</th>
              <th>Status</th>
              <th>Assigned to</th>
              {role === "manager" && <th>Assign developer</th>}
              {(role === "manager" || role === "developer") && <th>Update status</th>}
              {(role === "manager" || role === "tester") && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className="muted">#{t.id}</td>
                <td>
                  {editingId === t.id ? (
                    <input
                      className="input"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    />
                  ) : (
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                  )}
                </td>
                <td>
                  {editingId === t.id ? (
                    <select
                      className="select"
                      value={editForm.priority}
                      onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  ) : (
                    <Chip meta={PRIORITY_META[t.priority]} />
                  )}
                </td>
                <td>
                  {editingId === t.id ? (
                    <input
                      type="date"
                      className="input"
                      value={editForm.due_date || ""}
                      onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                    />
                  ) : (
                    t.due_date || <span className="muted">&mdash;</span>
                  )}
                </td>
                <td><Chip meta={STATUS_META[t.status]} /></td>
                <td>{t.assigned_to ?? <span className="muted">Unassigned</span>}</td>

                {role === "manager" && (
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        className="input"
                        style={{ width: 76 }}
                        placeholder="Dev ID"
                        value={developerId[t.id] || ""}
                        onChange={(e) => setDeveloperId({ ...developerId, [t.id]: e.target.value })}
                      />
                      <button className="btn btn-outline btn-sm" onClick={() => handleAssign(t.id)}>Assign</button>
                    </div>
                  </td>
                )}

                {(role === "manager" || role === "developer") && (
                  <td>
                    <select
                      className="select"
                      value={t.status}
                      onChange={(e) => handleStatusChange(t.id, e.target.value)}
                    >
                      {["todo", "in_progress", "done"].map((s) => (
                        <option key={s} value={s}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                  </td>
                )}

                {(role === "manager" || role === "tester") && (
                  <td>
                    {editingId === t.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(t.id)}>Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
                      </div>
                    ) : canModify(t) ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => startEdit(t)}>Edit</button>
                        <button className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(t.id)}>Delete</button>
                      </div>
                    ) : (
                      <span className="muted">&mdash;</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan="9">
                  <div className="empty-state">No tasks match the current filters.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Root app ----------
export default function App() {
  const [role, setRole] = useState(localStorage.getItem("role"));

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setRole(null);
  };

  if (!role) {
    return <AuthScreen onLogin={(r) => setRole(r)} />;
  }

  return (
    <div className="app-shell">
      <Sidebar role={role} onLogout={handleLogout} />
      <Dashboard role={role} onLogout={handleLogout} />
    </div>
  );
}
