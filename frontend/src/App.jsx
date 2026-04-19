import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Redirect, Route, Switch } from "react-router-dom";
import { QrReader } from "react-qr-reader";
import { QRCodeSVG } from "qrcode.react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock3,
  Cpu,
  Download,
  LayoutDashboard,
  Lock,
  LogOut,
  Search,
  QrCode,
  ScanLine,
  X,
  ShieldAlert,
  ShieldCheck,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { apiService } from "./api";
import { patternAlerts } from "./data";

const metricIcons = {
  users: <Users size={20} />,
  clock: <Clock3 size={20} />,
  activity: <Activity size={20} />,
  alert: <ShieldAlert size={20} />,
};

const initialVisitor = {
  fullName: "",
  phone: "",
  email: "",
  company: "",
  purpose: "",
  employee: "",
  branch: "",
  visitDate: new Date().toISOString().split("T")[0],
};

const initialLogin = {
  username: "",
  password: "",
};

function App() {
  const [visitor, setVisitor] = useState(initialVisitor);
  const [scanResult, setScanResult] = useState("");
  const [scanStatus, setScanStatus] = useState("Waiting for a QR scan at the security desk.");
  const [dashboardData, setDashboardData] = useState(null);
  const [visitors, setVisitors] = useState([]);
  const [registeredVisitor, setRegisteredVisitor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suspiciousAlerts, setSuspiciousAlerts] = useState([]);
  const [authUser, setAuthUser] = useState(() => {
    const saved = localStorage.getItem("auth_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [loginForm, setLoginForm] = useState(initialLogin);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [socketState, setSocketState] = useState("Offline");
  const [selectedVisitorId, setSelectedVisitorId] = useState("");
  const [selectedActiveVisitorId, setSelectedActiveVisitorId] = useState("");
  const socketRef = useRef(null);

  useEffect(() => {
    if (!authUser) return;
    loadProtectedData();
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      disconnectSocket();
      return;
    }

    if (authUser.role === "admin" || authUser.role === "security") {
      connectDashboardSocket();
    }

    return () => disconnectSocket();
  }, [authUser]);

  const loadProtectedData = async () => {
    await Promise.allSettled([loadDashboardData(), loadVisitors(), loadSuspiciousAlerts()]);
  };

  const connectDashboardSocket = () => {
    disconnectSocket();

    try {
      const socket = apiService.createDashboardSocket();
      socketRef.current = socket;
      setSocketState("Connecting");

      socket.onopen = () => {
        setSocketState("Live");
        socket.send("subscribe");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setDashboardData(data);
          setSocketState("Live");
        } catch (err) {
          console.error("Failed to parse websocket data", err);
        }
      };

      socket.onclose = () => {
        setSocketState("Disconnected");
      };

      socket.onerror = () => {
        setSocketState("Error");
      };
    } catch (err) {
      console.error("WebSocket connection failed", err);
      setSocketState("Error");
    }
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  const loadDashboardData = async () => {
    try {
      const data = await apiService.getDashboardData();
      setDashboardData(data);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setError("Failed to load dashboard data");
    }
  };

  const loadVisitors = async () => {
    try {
      const visitorsList = await apiService.getVisitors();
      setVisitors(visitorsList);
    } catch (err) {
      console.error("Failed to load visitors:", err);
    }
  };

  const loadSuspiciousAlerts = async () => {
    if (authUser?.role !== "admin") {
      setSuspiciousAlerts([]);
      return;
    }
    try {
      const response = await apiService.getSuspiciousPatterns();
      setSuspiciousAlerts(response.alerts || []);
    } catch (err) {
      console.error("Failed to load suspicious alerts:", err);
    }
  };

  const qrPayload = useMemo(
    () =>
      registeredVisitor
        ? registeredVisitor.qr_payload
        : JSON.stringify({
            message: "Please register a visitor first to generate a QR code",
          }),
    [registeredVisitor],
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setVisitor((current) => ({ ...current, [name]: value }));
  };

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((current) => ({ ...current, [name]: value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const response = await apiService.login(loginForm.username, loginForm.password);
      setAuthUser(response.user);
      setLoginForm(initialLogin);
    } catch (err) {
      setLoginError("Login failed. Try admin/admin123 or security/security123.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    apiService.logout();
    disconnectSocket();
    setAuthUser(null);
    setDashboardData(null);
    setVisitors([]);
    setSuspiciousAlerts([]);
    setRegisteredVisitor(null);
    setSocketState("Offline");
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await apiService.registerVisitor(visitor);
      setRegisteredVisitor(result);
      const emailMessage = result.email_notification?.message || "QR code generated.";
      setScanStatus(`Visitor registered successfully. ${emailMessage}`);
      await loadVisitors();
      await loadDashboardData();
      await loadSuspiciousAlerts();
    } catch (err) {
      setError(`Failed to register visitor: ${err.message}`);
      setScanStatus("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (result) => {
    if (!result?.text) return;

    try {
      const qrData = JSON.parse(result.text);
      setScanResult(result.text);

      if (qrData.visitorId) {
        await apiService.checkInVisitor(qrData.visitorId);
        setScanStatus(`Visitor ${qrData.visitorId} checked in successfully.`);
        await loadVisitors();
        await loadDashboardData();
      } else {
        setScanStatus("Invalid QR code format.");
      }
    } catch (err) {
      setScanStatus(`Failed to process QR code: ${err.message}`);
      console.error("QR scan error:", err);
    }
  };

  const handleManualCheckIn = async () => {
    if (!selectedVisitorId) {
      setScanStatus("Please select a pre-approved visitor first.");
      return;
    }

    try {
      await apiService.checkInVisitor(selectedVisitorId);
      setScanStatus(`Visitor ${selectedVisitorId} checked in successfully.`);
      setScanResult(`Manual check-in completed for ${selectedVisitorId}`);
      await loadVisitors();
      await loadDashboardData();
      await loadSuspiciousAlerts();
      setSelectedVisitorId("");
    } catch (err) {
      setScanStatus(`Manual check-in failed: ${err.message}`);
    }
  };

  const handleManualCheckOut = async (visitorId = selectedActiveVisitorId) => {
    if (!visitorId) {
      setScanStatus("Please select an active visitor first for check-out.");
      return;
    }

    try {
      await apiService.checkOutVisitor(visitorId);
      setScanStatus(`Visitor ${visitorId} checked out successfully.`);
      setScanResult(`Manual check-out completed for ${visitorId}`);
      await loadVisitors();
      await loadDashboardData();
      await loadSuspiciousAlerts();
      setSelectedActiveVisitorId("");
    } catch (err) {
      setScanStatus(`Manual check-out failed: ${err.message}`);
    }
  };

  const sharedProps = {
    authUser,
    dashboardData,
    error,
    handleChange,
    handleRegister,
    handleScan,
    loading,
    qrPayload,
    registeredVisitor,
    scanResult,
    scanStatus,
    socketState,
    suspiciousAlerts,
    visitor,
    visitors,
  };

  return (
    <div className="page-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="hero">
        <AppNavbar authUser={authUser} onLogout={handleLogout} />
      </header>

      <main className="content">
        <Switch>
          <Route exact path="/">
            <HomePage authUser={authUser} visitors={visitors} />
          </Route>
          <Route path="/login">
            {authUser ? (
              <Redirect to="/dashboard" />
            ) : (
              <LoginPage
                loginError={loginError}
                loginForm={loginForm}
                loginLoading={loginLoading}
                onChange={handleLoginChange}
                onSubmit={handleLogin}
              />
            )}
          </Route>
          <ProtectedRoute authUser={authUser} path="/modules">
            <ModulesPage {...sharedProps} />
          </ProtectedRoute>
          <ProtectedRoute authUser={authUser} path="/dashboard">
            <DashboardPage
              dashboardData={dashboardData}
              handleManualCheckOut={handleManualCheckOut}
              socketState={socketState}
              suspiciousAlerts={suspiciousAlerts}
              userRole={authUser?.role}
            />
          </ProtectedRoute>
          <ProtectedRoute authUser={authUser} path="/security-desk">
            <SecurityDeskPage
              handleScan={handleScan}
              handleManualCheckIn={handleManualCheckIn}
              handleManualCheckOut={handleManualCheckOut}
              qrPayload={qrPayload}
              scanResult={scanResult}
              scanStatus={scanStatus}
              selectedVisitorId={selectedVisitorId}
              selectedActiveVisitorId={selectedActiveVisitorId}
              setSelectedVisitorId={setSelectedVisitorId}
              setSelectedActiveVisitorId={setSelectedActiveVisitorId}
              visitors={visitors}
            />
          </ProtectedRoute>
          <Route path="/ai-insights">
            <AiInsightsPage />
          </Route>
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </main>
    </div>
  );
}

function ProtectedRoute({ authUser, children, ...props }) {
  return (
    <Route
      {...props}
      render={() => (authUser ? children : <Redirect to="/login" />)}
    />
  );
}

function AppNavbar({ authUser, onLogout }) {
  return (
    <nav className="topbar">
      <NavLink className="brand" exact to="/">
        <div className="brand-badge">
          <QrCode size={20} />
        </div>
        <div>
          <p>QR-Based Visitor Management</p>
          <span>Smart office entry experience</span>
        </div>
      </NavLink>

      <div className="topbar-links">
        <NavLink activeClassName="nav-active" exact to="/">
          Home
        </NavLink>
        <NavLink activeClassName="nav-active" to="/modules">
          Modules
        </NavLink>
        <NavLink activeClassName="nav-active" to="/dashboard">
          Dashboard
        </NavLink>
        <NavLink activeClassName="nav-active" to="/security-desk">
          Security Desk
        </NavLink>
        {!authUser ? (
          <NavLink activeClassName="nav-active" to="/login">
            Login
          </NavLink>
        ) : (
          <button className="nav-logout" onClick={onLogout} type="button">
            <LogOut size={16} />
            {authUser.username}
          </button>
        )}
      </div>
    </nav>
  );
}

function HomePage({ authUser, visitors }) {
  return (
    <>
      <section className="hero-grid hero-page">
        <div className="hero-copy">
          <div className="pill">
            <ShieldCheck size={16} />
            Replacing manual visitor registers with secure digital entry
          </div>

          <h1>Office visitor flow built for speed, safety, and smart tracking.</h1>
          <p>
            A final-year major project frontend for company HQs and branch offices,
            covering visitor registration, mobile QR pass generation, check-in scanning,
            and a real-time security dashboard.
          </p>

          <div className="hero-actions">
            <NavLink className="primary-btn" to={authUser ? "/modules" : "/login"}>
              {authUser ? "Open secured modules" : "Admin login"}
              <ArrowRight size={18} />
            </NavLink>
            <NavLink className="ghost-btn" to="/ai-insights">
              AI enhancements
            </NavLink>
          </div>

          <div className="hero-stats">
            <StatCard icon={<Users size={18} />} label="Visitors Stored" value={String(visitors.length)} />
            <StatCard icon={<ScanLine size={18} />} label="Live Dashboard" value={authUser ? "Connected" : "Locked"} />
            <StatCard icon={<BadgeCheck size={18} />} label="Access Control" value={authUser ? authUser.role : "Login"} />
          </div>
        </div>

        <div className="hero-panel">
          <div className="panel-card glass">
            <div className="card-header">
              <span>Secure Entry Monitor</span>
              <div className="live-dot">{authUser ? "Authenticated" : "Guest"}</div>
            </div>

            <div className="entry-steps">
              <Step icon={<Lock size={18} />} title="Admin login" text="Authorized staff open protected pages after secure sign-in." />
              <Step icon={<QrCode size={18} />} title="Generate mobile QR" text="Unique visitor pass is created instantly after registration." />
              <Step icon={<Activity size={18} />} title="Live dashboard feed" text="Dashboard updates flow in through a WebSocket connection." />
            </div>
          </div>
        </div>
      </section>

      <section className="section quick-links-grid">
        <NavLink className="feature-card surface feature-link" to={authUser ? "/modules" : "/login"}>
          <div className="feature-icon">
            <LayoutDashboard size={22} />
          </div>
          <h3>{authUser ? "Open Modules Page" : "Login to Modules"}</h3>
          <p>Access visitor registration and QR generation through protected project pages.</p>
        </NavLink>

        <NavLink className="feature-card surface feature-link" to={authUser ? "/dashboard" : "/login"}>
          <div className="feature-icon">
            <Activity size={22} />
          </div>
          <h3>{authUser ? "Open Dashboard Page" : "Login to Dashboard"}</h3>
          <p>View secured live stats, movement, and risk information with role-based access.</p>
        </NavLink>

        <NavLink className="feature-card surface feature-link" to={authUser ? "/security-desk" : "/login"}>
          <div className="feature-icon">
            <ShieldCheck size={22} />
          </div>
          <h3>{authUser ? "Open Security Desk Page" : "Login to Security Desk"}</h3>
          <p>Use the QR scanner and check-in panel only after authenticated staff login.</p>
        </NavLink>
      </section>
    </>
  );
}

function LoginPage({ loginError, loginForm, loginLoading, onChange, onSubmit }) {
  return (
    <section className="auth-shell">
      <div className="surface auth-card">
        <span className="eyebrow">Protected Access</span>
        <h2>Admin and security login</h2>
        <p>Use `admin / admin123` for admin access or `security / security123` for gate-side access.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <Input label="Username" name="username" value={loginForm.username} onChange={onChange} required />
          <Input label="Password" name="password" type="password" value={loginForm.password} onChange={onChange} required />

          <button className="primary-btn auth-submit" disabled={loginLoading} type="submit">
            {loginLoading ? "Signing in..." : "Sign in"}
            <Lock size={18} />
          </button>
        </form>

        {loginError ? <div className="error-message">{loginError}</div> : null}
      </div>
    </section>
  );
}

function ModulesPage({
  error,
  handleChange,
  handleRegister,
  loading,
  qrPayload,
  registeredVisitor,
  visitor,
  visitors,
}) {
  return (
    <>
      <PageIntro
        eyebrow="Project Modules"
        title="Registration, QR pass, and AI modules in one dedicated page"
        description="This page is for the reception workflow. It covers visitor registration, instant QR code generation, and presentation-ready AI enhancement ideas."
      />

      <section className="section">
        <div className="module-grid">
          <FeatureCard icon={<UserRoundPlus size={22} />} title="Visitor Registration" text="Collect visitor details, host employee, branch, purpose, and date in a clear digital registration form." />
          <FeatureCard icon={<QrCode size={22} />} title="QR Pass on Mobile" text="Generate a QR code instantly after registration so the visitor can show it on their phone at the office gate." />
          <FeatureCard icon={<ScanLine size={22} />} title="Check-In Scan" text="Security desk scans the QR code to confirm identity and allow approved entry without a physical register." />
          <FeatureCard icon={<LayoutDashboard size={22} />} title="Real-Time Dashboard" text="Track active visitors, waiting approvals, recent check-ins, and suspicious patterns in one live screen." />
        </div>
      </section>

      <section className="workspace-grid">
        <div className="form-card surface">
          <div className="card-title-row">
            <div>
              <span className="eyebrow">Reception Panel</span>
              <h3>Visitor registration form</h3>
            </div>
            <Clock3 size={20} />
          </div>

          <form onSubmit={handleRegister}>
            <div className="form-grid">
              <Input label="Full Name" name="fullName" value={visitor.fullName} onChange={handleChange} required />
              <Input label="Phone Number" name="phone" value={visitor.phone} onChange={handleChange} required />
              <Input label="Email Address" name="email" type="email" value={visitor.email} onChange={handleChange} required />
              <Input label="Company / Organization" name="company" value={visitor.company} onChange={handleChange} required />
              <Input label="Purpose of Visit" name="purpose" value={visitor.purpose} onChange={handleChange} required />
              <Input label="Employee to Meet" name="employee" value={visitor.employee} onChange={handleChange} required />
              <Input label="Branch / Office" name="branch" value={visitor.branch} onChange={handleChange} required />
              <Input label="Visit Date" name="visitDate" type="date" value={visitor.visitDate} onChange={handleChange} required />
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? "Registering..." : "Register Visitor"}
                <UserRoundPlus size={18} />
              </button>
            </div>

            {error && (
              <div className="error-message">
                <AlertTriangle size={16} />
                {error}
              </div>
            )}
          </form>
        </div>

        <div className="qr-card surface">
          <div className="card-title-row">
            <div>
              <span className="eyebrow">Visitor Mobile Pass</span>
              <h3>Generated QR entry pass</h3>
            </div>
            <BadgeCheck size={20} />
          </div>

          <div className="qr-panel">
            {registeredVisitor ? (
              <>
                <div className="qr-box">
                  <QRCodeSVG value={qrPayload} size={210} includeMargin />
                </div>

                <div className="pass-summary">
                  <div>
                    <strong>{registeredVisitor.full_name}</strong>
                    <span>{registeredVisitor.purpose}</span>
                  </div>
                  <div>
                    <strong>Host</strong>
                    <span>{registeredVisitor.employee_to_meet}</span>
                  </div>
                  <div>
                    <strong>Branch</strong>
                    <span>{registeredVisitor.branch}</span>
                  </div>
                  <div>
                    <strong>Visitor ID</strong>
                    <span>{registeredVisitor.visitor_id}</span>
                  </div>
                  <div>
                    <strong>Status</strong>
                    <span className={`status-pill ${registeredVisitor.status === "checked-in" ? "approved" : "pending"}`}>
                      {registeredVisitor.status.replace("-", " ").toUpperCase()}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="qr-placeholder">
                <QrCode size={48} />
                <p>Register a visitor to generate QR code</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <span className="eyebrow">Registered Visitors</span>
          <h2>Latest visitor records from the backend database</h2>
        </div>

        <div className="surface visitor-list-card">
          <div className="visitor-table">
            {visitors.length ? (
              visitors.slice(0, 6).map((entry) => (
                <div className="visitor-row" key={entry.visitor_id}>
                  <div>
                    <strong>{entry.full_name}</strong>
                    <p>{entry.purpose}</p>
                  </div>
                  <span>{entry.branch}</span>
                  <span className={`status-pill ${entry.status === "checked-in" ? "approved" : entry.status === "pre-approved" ? "pending" : "neutral"}`}>
                    {entry.status.replace("-", " ")}
                  </span>
                </div>
              ))
            ) : (
              <div className="visitor-row">
                <div>
                  <strong>No visitors yet</strong>
                  <p>Registrations will appear here after form submission.</p>
                </div>
                <span>--</span>
                <span className="status-pill neutral">empty</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <AiInsightsPage compact />
    </>
  );
}

function DashboardPage({ dashboardData, handleManualCheckOut, socketState, suspiciousAlerts, userRole }) {
  const [detailModal, setDetailModal] = useState(null);
  const allVisitors = dashboardData?.recent_visitors || [];
  const activeVisitors = dashboardData?.active_visitors || [];
  const preApprovedVisitors = allVisitors.filter((visitor) => visitor.status === "pre-approved");
  const todayVisitors = allVisitors.filter(
    (visitor) => visitor.visit_date === new Date().toISOString().split("T")[0],
  );
  const movementHistory = [...allVisitors].sort((left, right) => {
    const leftTime = new Date(left.checked_out_at || left.checked_in_at || left.created_at || 0).getTime();
    const rightTime = new Date(right.checked_out_at || right.checked_in_at || right.created_at || 0).getTime();
    return rightTime - leftTime;
  });

  const openModal = (title, description, rows, columns) => {
    setDetailModal({ title, description, rows, columns });
  };

  return (
    <>
      <PageIntro
        eyebrow="Operations Dashboard"
        title="Real-time overview for admin and reception teams"
        description="This separate dashboard page shows visitor totals, inside-premises status, recent movement, and live branch activity."
      />

      <div className="socket-status-row">
        <span className={`status-pill ${socketState === "Live" ? "approved" : "pending"}`}>WebSocket: {socketState}</span>
        <span className="status-pill neutral">Role: {userRole}</span>
      </div>

      <section className="section">
        <div className="metrics-grid">
          {dashboardData ? (
            <>
              <MetricCard
                clickable
                icon={metricIcons.users}
                label="Total Visitors"
                value={dashboardData.summary?.total_visitors || 0}
                caption="All time"
                onClick={() =>
                  openModal(
                    "Total Visitors",
                    "All registered visitors stored in the system.",
                    allVisitors,
                    visitorColumns,
                  )
                }
              />
              <MetricCard
                clickable
                icon={metricIcons.clock}
                label="Currently Inside"
                value={dashboardData.summary?.checked_in || 0}
                caption="Active visits"
                onClick={() =>
                  openModal(
                    "Currently Inside",
                    "Visitors who are checked in and currently inside the office premises.",
                    activeVisitors,
                    activeVisitorColumns,
                  )
                }
              />
              <MetricCard
                clickable
                icon={metricIcons.activity}
                label="Today's Registrations"
                value={dashboardData.summary?.today_registrations || 0}
                caption="New visitors"
                onClick={() =>
                  openModal(
                    "Today's Registrations",
                    "Visitors registered for today.",
                    todayVisitors,
                    visitorColumns,
                  )
                }
              />
              <MetricCard
                clickable
                icon={metricIcons.alert}
                label="Pre-Approved"
                value={dashboardData.summary?.pre_approved || 0}
                caption="Ready for check-in"
                onClick={() =>
                  openModal(
                    "Pre-Approved Visitors",
                    "Visitors who are registered and waiting for security desk check-in.",
                    preApprovedVisitors,
                    visitorColumns,
                  )
                }
              />
            </>
          ) : (
            <div className="loading surface">Loading dashboard data...</div>
          )}
        </div>
      </section>

      <section className="dashboard-grid">
        <div
          className="surface timeline-card card-button"
          onClick={() =>
            openModal(
              "Recent Check-Ins Timeline",
              "Recent visitor registrations and movement history.",
              movementHistory,
              timelineColumns,
            )
          }
        >
          <div className="card-title-row">
            <div>
              <span className="eyebrow">Recent Check-Ins</span>
              <h3>Visitor movement timeline</h3>
            </div>
            <Activity size={20} />
          </div>

          <div className="timeline-list">
            {dashboardData?.recent_visitors?.length ? (
              dashboardData.recent_visitors.map((visitor) => (
                <div className="timeline-item" key={visitor.visitor_id}>
                  <div className="timeline-dot" />
                  <div>
                    <strong>{visitor.full_name}</strong>
                    <p>Registered for {visitor.purpose}</p>
                  </div>
                  <span>{new Date(visitor.created_at).toLocaleTimeString()}</span>
                </div>
              ))
            ) : (
              <div className="timeline-item">
                <div className="timeline-dot" />
                <div>
                  <strong>No recent visitors</strong>
                  <p>New registrations will appear here</p>
                </div>
                <span>--:--</span>
              </div>
            )}
          </div>
        </div>

        <div
          className="surface live-card card-button"
          onClick={() =>
            openModal(
              "Inside Premises Active Visitors",
              "Visitors currently checked in and present inside office premises.",
              activeVisitors,
              activeVisitorColumns,
            )
          }
        >
          <div className="card-title-row">
            <div>
              <span className="eyebrow">Inside Premises</span>
              <h3>Currently active visitors</h3>
            </div>
            <Building2 size={20} />
          </div>

          <div className="visitor-table">
            {dashboardData?.active_visitors?.length ? (
              dashboardData.active_visitors.map((visitor) => (
                <div className="visitor-row" key={visitor.visitor_id}>
                  <div>
                    <strong>{visitor.full_name}</strong>
                    <p>Host: {visitor.employee_to_meet}</p>
                  </div>
                  <span>{visitor.branch}</span>
                  <div className="visitor-actions">
                    <span className="status-pill approved">Inside</span>
                    <button className="row-action-btn" onClick={() => handleManualCheckOut(visitor.visitor_id)} type="button">
                      Check Out
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="visitor-row">
                <div>
                  <strong>No active visitors</strong>
                  <p>Visitors will appear here when checked in</p>
                </div>
                <span>--</span>
                <span className="status-pill neutral">--</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {userRole === "admin" ? (
        <section className="section">
          <div className="section-heading">
            <span className="eyebrow">Risk Monitoring</span>
            <h2>Suspicious visit patterns detected by backend rules</h2>
          </div>

          <div className="surface alert-strip">
            {suspiciousAlerts.length ? (
              suspiciousAlerts.map((alert) => (
                <div className="alert-item" key={`${alert.type}-${alert.phone}`}>
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{alert.severity.toUpperCase()} - {alert.type}</strong>
                    <p>{alert.description}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="alert-item">
                <ShieldCheck size={18} />
                <div>
                  <strong>No suspicious patterns right now</strong>
                  <p>The backend monitoring rules have not detected repeat or cross-branch anomalies.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {detailModal ? (
        <DetailModal
          columns={detailModal.columns}
          description={detailModal.description}
          onClose={() => setDetailModal(null)}
          rows={detailModal.rows}
          title={detailModal.title}
        />
      ) : null}
    </>
  );
}

function SecurityDeskPage({
  handleManualCheckIn,
  handleManualCheckOut,
  handleScan,
  qrPayload,
  scanResult,
  scanStatus,
  selectedVisitorId,
  selectedActiveVisitorId,
  setSelectedVisitorId,
  setSelectedActiveVisitorId,
  visitors,
}) {
  const preApprovedVisitors = visitors.filter((visitor) => visitor.status === "pre-approved");
  const activeVisitors = visitors.filter((visitor) => visitor.status === "checked-in");

  return (
    <>
      <PageIntro
        eyebrow="Security Desk"
        title="Scan visitor QR code during check-in"
        description="This page is designed for the gate or security counter, where staff scan a visitor QR code and validate entry."
      />

      <section className="security-grid">
        <div className="surface scanner-card">
          <div className="card-title-row">
            <div>
              <span className="eyebrow">Check-In Scanner</span>
              <h3>Gate validation panel</h3>
            </div>
            <ScanLine size={20} />
          </div>

          <div className="scanner-frame">
            <QrReader
              constraints={{ facingMode: "environment" }}
              onResult={(result) => handleScan(result)}
              containerStyle={{ width: "100%" }}
              videoStyle={{ width: "100%", borderRadius: "24px" }}
            />
          </div>

          <div className="scan-status">
            <span className="status-pill approved">Scanner Ready</span>
            <p>{scanStatus}</p>
          </div>

          <div className="manual-checkin">
            <label className="input-group">
              <span>Manual Demo Check-In</span>
              <select value={selectedVisitorId} onChange={(event) => setSelectedVisitorId(event.target.value)}>
                <option value="">Select pre-approved visitor</option>
                {preApprovedVisitors.map((visitor) => (
                  <option key={visitor.visitor_id} value={visitor.visitor_id}>
                    {visitor.full_name} - {visitor.visitor_id}
                  </option>
                ))}
              </select>
            </label>

            <button className="primary-btn manual-checkin-btn" onClick={handleManualCheckIn} type="button">
              Check In Selected Visitor
              <ShieldCheck size={18} />
            </button>
          </div>

          <div className="manual-checkin">
            <label className="input-group">
              <span>Manual Demo Check-Out</span>
              <select value={selectedActiveVisitorId} onChange={(event) => setSelectedActiveVisitorId(event.target.value)}>
                <option value="">Select active visitor</option>
                {activeVisitors.map((visitor) => (
                  <option key={visitor.visitor_id} value={visitor.visitor_id}>
                    {visitor.full_name} - {visitor.visitor_id}
                  </option>
                ))}
              </select>
            </label>

            <button className="ghost-btn manual-checkin-btn" onClick={() => handleManualCheckOut()} type="button">
              Check Out Selected Visitor
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <div className="surface result-card">
          <div className="card-title-row">
            <div>
              <span className="eyebrow">Scan Output</span>
              <h3>Latest decoded result</h3>
            </div>
            <ShieldCheck size={20} />
          </div>

          <pre className="scan-output">{scanResult || qrPayload}</pre>
        </div>
      </section>
    </>
  );
}

function AiInsightsPage({ compact = false }) {
  return (
    <section className={`section ${compact ? "compact-section" : ""}`}>
      {!compact && (
        <PageIntro
          eyebrow="Optional AI Enhancements"
          title="Smart features you can mention in your major project presentation"
          description="These optional pages and ideas strengthen your final-year project report and viva presentation."
        />
      )}

      <div className="ai-grid">
        <div className="surface ai-card">
          <Cpu size={22} />
          <h3>Face Authentication</h3>
          <p>
            Match the visitor's live face capture with their registration image during
            check-in for stronger identity verification.
          </p>
        </div>

        <div className="surface ai-card">
          <AlertTriangle size={22} />
          <h3>Suspicious Visiting Pattern Detection</h3>
          <p>
            Detect unusual repeat visits, restricted-zone frequency, or abnormal time
            patterns and raise alerts to security staff.
          </p>
        </div>
      </div>

      <div className="surface alert-strip">
        {patternAlerts.map((alert) => (
          <div className="alert-item" key={alert.title}>
            <AlertTriangle size={18} />
            <div>
              <strong>{alert.title}</strong>
              <p>{alert.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PageIntro({ eyebrow, title, description }) {
  return (
    <section className="page-intro surface">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}

function FeatureCard({ icon, title, text }) {
  return (
    <div className="feature-card surface">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function MetricCard({ caption, clickable = false, icon, label, onClick, value }) {
  return (
    <div className={`metric-card surface ${clickable ? "card-button" : ""}`} onClick={onClick}>
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <h3>{value}</h3>
        <span>{caption}</span>
      </div>
    </div>
  );
}

function DetailModal({ columns, description, onClose, rows, title }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRow, setSelectedRow] = useState(null);

  const filteredRows = rows.filter((row) => {
    const haystack = Object.values(row || {})
      .join(" ")
      .toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  const exportCsv = () => {
    const header = columns.map((column) => column.label).join(",");
    const csvRows = filteredRows.map((row) =>
      columns
        .map((column) => {
          const value = column.render ? column.render(row) : row[column.key] || "--";
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(","),
    );

    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const htmlRows = filteredRows
      .map(
        (row) => `
          <tr>
            ${columns
              .map((column) => `<td>${column.render ? column.render(row) : row[column.key] || "--"}</td>`)
              .join("")}
          </tr>`,
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 10px; text-align: left; }
            th { background: #f4f4f4; }
          </style>
        </head>
        <body>
          <h2>${title}</h2>
          <p>${description}</p>
          <table>
            <thead>
              <tr>${columns.map((column) => `<th>${column.label}</th>`).join("")}</tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const exportVisitorProfilePrint = () => {
    if (!selectedRow) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const qrMarkup = selectedRow.qr_code_url
      ? `<div style="margin-top:16px"><h3>Visitor QR Code</h3><img src="${selectedRow.qr_code_url}" alt="Visitor QR Code" style="width:220px;height:220px;border:1px solid #ddd;padding:12px;border-radius:16px" /><p style="font-size:12px;color:#555">Use this QR for check-in and check-out scanning.</p></div>`
      : "";

    printWindow.document.write(`
      <html>
        <head>
          <title>${selectedRow.full_name || "Visitor"} Profile</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
            .field { border: 1px solid #ddd; border-radius: 10px; padding: 12px; }
            .field span { display:block; color:#666; font-size:12px; margin-bottom:6px; }
            .field strong { color:#111; }
          </style>
        </head>
        <body>
          <h1>${selectedRow.full_name || "Visitor Profile"}</h1>
          <p>Structured visitor profile for office entry, security scanning, and export.</p>
          <div class="grid">
            <div class="field"><span>Visitor ID</span><strong>${selectedRow.visitor_id || "--"}</strong></div>
            <div class="field"><span>Email</span><strong>${selectedRow.email || "--"}</strong></div>
            <div class="field"><span>Phone</span><strong>${selectedRow.phone || "--"}</strong></div>
            <div class="field"><span>Company</span><strong>${selectedRow.company || "--"}</strong></div>
            <div class="field"><span>Purpose</span><strong>${selectedRow.purpose || "--"}</strong></div>
            <div class="field"><span>Host Employee</span><strong>${selectedRow.employee_to_meet || "--"}</strong></div>
            <div class="field"><span>Branch</span><strong>${selectedRow.branch || "--"}</strong></div>
            <div class="field"><span>Visit Date</span><strong>${selectedRow.visit_date || "--"}</strong></div>
            <div class="field"><span>Status</span><strong>${selectedRow.status?.replace("-", " ") || "--"}</strong></div>
          </div>
          ${qrMarkup}
        </body>
      </html>
    `);
    printWindow.document.close();

    printWindow.print();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal-card surface" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="card-title-row">
          <div>
            <span className="eyebrow">Detailed View</span>
            <h3>{title}</h3>
            <p className="modal-description">{description}</p>
          </div>
          <button className="icon-close-btn" onClick={onClose} type="button" aria-label="Close popup">
            <X size={18} />
          </button>
        </div>

        <div className="modal-toolbar">
          <label className="modal-search">
            <Search size={16} />
            <input
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search visitor, purpose, branch, status..."
              type="text"
              value={searchTerm}
            />
          </label>

          <div className="modal-actions">
            <button className="row-action-btn" onClick={exportCsv} type="button">
              <Download size={16} />
              Export CSV
            </button>
            <button className="row-action-btn" onClick={exportPrint} type="button">
              <Download size={16} />
              Export PDF / Print
            </button>
          </div>
        </div>

        <div className="detail-table">
          <div className="detail-header">
            {columns.map((column) => (
              <strong key={column.key}>{column.label}</strong>
            ))}
          </div>

          {filteredRows.length ? (
            filteredRows.map((row, index) => (
              <button
                className="detail-row detail-row-button"
                key={row.visitor_id || `${row.full_name}-${index}`}
                onClick={() => setSelectedRow(row)}
                type="button"
              >
                {columns.map((column) => (
                  <span key={column.key}>{column.render ? column.render(row) : row[column.key] || "--"}</span>
                ))}
              </button>
            ))
          ) : (
            <div className="detail-empty">No records available for this section.</div>
          )}
        </div>

        {selectedRow ? (
          <div className="visitor-detail-card">
            <div className="card-title-row">
              <div>
                <span className="eyebrow">Visitor Profile</span>
                <h3>{selectedRow.full_name || "Visitor"}</h3>
                <p className="modal-description">Full visitor profile with QR code for easy export, printing, and security scanning.</p>
              </div>
              <div className="modal-actions">
                <button className="row-action-btn" onClick={exportVisitorProfilePrint} type="button">
                  <Download size={16} />
                  Export PDF / Print
                </button>
                <button className="row-action-btn" onClick={() => setSelectedRow(null)} type="button">
                  Close Detail
                </button>
              </div>
            </div>

            <div className="visitor-profile-layout">
              <div className="visitor-detail-grid">
                <DetailField label="Visitor ID" value={selectedRow.visitor_id} />
                <DetailField label="Email" value={selectedRow.email} />
                <DetailField label="Phone" value={selectedRow.phone} />
                <DetailField label="Company" value={selectedRow.company} />
                <DetailField label="Purpose" value={selectedRow.purpose} />
                <DetailField label="Host Employee" value={selectedRow.employee_to_meet} />
                <DetailField label="Branch" value={selectedRow.branch} />
                <DetailField label="Visit Date" value={selectedRow.visit_date} />
                <DetailField label="Status" value={selectedRow.status?.replace("-", " ")} />
                <DetailField label="Created At" value={selectedRow.created_at ? new Date(selectedRow.created_at).toLocaleString() : "--"} />
                <DetailField label="Checked In At" value={selectedRow.checked_in_at ? new Date(selectedRow.checked_in_at).toLocaleString() : "--"} />
                <DetailField label="Checked Out At" value={selectedRow.checked_out_at ? new Date(selectedRow.checked_out_at).toLocaleString() : "--"} />
              </div>

              <div className="visitor-qr-panel">
                <span className="eyebrow">Visitor QR</span>
                {selectedRow.qr_payload ? (
                  <>
                    <div className="visitor-qr-box">
                      <QRCodeSVG includeMargin size={220} value={selectedRow.qr_payload} />
                    </div>
                    <p className="qr-help-text">Use this QR code for quick check-in and check-out at the security desk.</p>
                  </>
                ) : (
                  <div className="detail-empty">QR code not available for this visitor.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value || "--"}</strong>
    </div>
  );
}

const visitorColumns = [
  { key: "full_name", label: "Visitor Name" },
  { key: "purpose", label: "Purpose" },
  { key: "branch", label: "Branch" },
  {
    key: "status",
    label: "Status",
    render: (row) => row.status?.replace("-", " ") || "--",
  },
  { key: "visitor_id", label: "Visitor ID" },
];

const activeVisitorColumns = [
  { key: "full_name", label: "Visitor Name" },
  { key: "employee_to_meet", label: "Host Employee" },
  { key: "branch", label: "Branch" },
  {
    key: "checked_in_at",
    label: "Checked In At",
    render: (row) => (row.checked_in_at ? new Date(row.checked_in_at).toLocaleString() : "--"),
  },
  { key: "visitor_id", label: "Visitor ID" },
];

const timelineColumns = [
    { key: "full_name", label: "Visitor Name" },
    { key: "purpose", label: "Purpose" },
    {
      key: "visit_date",
      label: "Visit Date",
      render: (row) => row.visit_date || "--",
    },
    {
      key: "checked_in_at",
      label: "Check In Time",
      render: (row) => (row.checked_in_at ? new Date(row.checked_in_at).toLocaleTimeString() : "--"),
    },
    {
      key: "checked_out_at",
      label: "Check Out Time",
      render: (row) => (row.checked_out_at ? new Date(row.checked_out_at).toLocaleTimeString() : "--"),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => row.status?.replace("-", " ") || "--",
    },
  ];

function StatCard({ icon, label, value }) {
  return (
    <div className="mini-stat glass">
      <div className="metric-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Step({ icon, title, text }) {
  return (
    <div className="step-row">
      <div className="feature-icon">{icon}</div>
      <div>
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <label className="input-group">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

export default App;
