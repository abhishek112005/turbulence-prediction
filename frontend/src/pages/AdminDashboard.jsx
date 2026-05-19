import { useEffect, useMemo, useState } from "react";
import FlightTable from "../components/FlightTable";
import StatCard from "../components/StatCard";
import AdminUsersTable from "../components/AdminUsersTable";
import TurbulenceHeatmap from "../components/TurbulenceHeatmap";
import IntervalSelector from "../components/IntervalSelector";
import FlightsPerCountry from "../components/FlightsPerCountry";
import { groupFlightsByCountry, countryFromIcao24 } from "../utils/icao24Country";
import { useAuth } from "../context/AuthContext";
import {
  assignPilotFlight,
  deleteAdminUser,
  getAdminUsers,
  getLiveDashboardData,
  getMockDashboardData,
  getPilotFlightAssignment,
  getTurbulenceAnalytics
} from "../services/api";

function AdminDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [liveModeEnabled, setLiveModeEnabled] = useState(false);
  const [data, setData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [users, setUsers] = useState([]);
  const [deletingEmail, setDeletingEmail] = useState("");
  const [assigningEmail, setAssigningEmail] = useState("");
  const [pilotAssignments, setPilotAssignments] = useState({});
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [fleetLevelFilter, setFleetLevelFilter] = useState(-1);
  const [fleetQuery, setFleetQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState(null);
  const [showIntervalSelector, setShowIntervalSelector] = useState(false);
  const [autoFetchInterval, setAutoFetchInterval] = useState(null);
  const [autoFetchActive, setAutoFetchActive] = useState(false);

  useEffect(() => {
    getMockDashboardData()
      .then((payload) => {
        setData(payload);
        setStatusText("Live pipeline is paused. Enable it only when you want to fetch fresh results.");
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-fetch ML model at selected interval
  useEffect(() => {
    if (!autoFetchActive || !liveModeEnabled || !autoFetchInterval) {
      return;
    }

    const intervalId = setInterval(() => {
      refresh("live");
    }, autoFetchInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoFetchActive, liveModeEnabled, autoFetchInterval]);

  async function loadUsers() {
    if (!user?.email) {
      return;
    }
    setUsersError("");
    setUsersLoading(true);
    try {
      const payload = await getAdminUsers(user.email, { includeInactive: true, limit: 1200 });
      const nextUsers = payload.users || [];
      setUsers(nextUsers);

      const pilotUsers = nextUsers.filter((item) => String(item.role || "").toLowerCase() === "pilot");
      const assignmentEntries = await Promise.all(
        pilotUsers.map(async (pilot) => {
          try {
            const assignmentPayload = await getPilotFlightAssignment(pilot.email);
            return [pilot.email, assignmentPayload.assignment || null];
          } catch {
            return [pilot.email, null];
          }
        })
      );
      setPilotAssignments(Object.fromEntries(assignmentEntries));
    } catch (error) {
      setUsersError(error.message || "Could not fetch users.");
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadAnalytics() {
    if (!user?.email) {
      return;
    }
    setAnalyticsError("");
    setAnalyticsLoading(true);
    try {
      const payload = await getTurbulenceAnalytics(user.email, {
        maxCells: 400,
        gridDeg: 5,
        sinceMinutes: 120
      });
      setAnalytics(payload);
    } catch (error) {
      setAnalyticsError(error.message || "Could not fetch turbulence analytics.");
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [user?.email]);

  async function refresh(source) {
    setFetchError("");
    setStatusText("");
    setIsRefreshing(true);
    try {
      if (source === "live" && !liveModeEnabled) {
        throw new Error("Enable live pipeline first, then run the fetch.");
      }
      const payload = source === "live" ? await getLiveDashboardData() : await getMockDashboardData();
      setData(payload);
      setCountryFilter(null);
      setStatusText(source === "live" ? "Live pipeline completed" : "Mock data loaded");
    } catch (error) {
      setFetchError(error.message || "Could not refresh dashboard data.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleDeleteUser(email) {
    if (!user?.email) {
      return;
    }
    const confirmed = window.confirm(`Delete (deactivate) user: ${email}?`);
    if (!confirmed) {
      return;
    }
    setUsersError("");
    setDeletingEmail(email);
    try {
      await deleteAdminUser(user.email, email);
      await loadUsers();
    } catch (error) {
      setUsersError(error.message || "Could not delete user.");
    } finally {
      setDeletingEmail("");
    }
  }

  async function handleAssignFlight(email, icao24) {
    if (!user?.email) {
      return;
    }

    const normalizedIcao = String(icao24 || "").trim().toUpperCase();
    if (!normalizedIcao || normalizedIcao.length < 6) {
      setUsersError("Enter a valid flight ICAO24 (minimum 6 characters).");
      return;
    }

    setUsersError("");
    setAssigningEmail(email);
    try {
      await assignPilotFlight(user.email, email, normalizedIcao);
      setUsersError("");
      // Reload users to refresh assignments
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadUsers();
    } catch (error) {
      setUsersError(error.message || "Could not assign flight to pilot.");
    } finally {
      setAssigningEmail("");
    }
  }

  const totalSplit = useMemo(() => {
    if (!data) {
      return 0;
    }
    return data.turbulenceSplit.reduce((acc, item) => acc + item.value, 0);
  }, [data]);

  const filteredFlights = useMemo(() => {
    const flights = data?.flights || [];
    const query = fleetQuery.trim().toLowerCase();

    return flights.filter((flight) => {
      if (fleetLevelFilter >= 0) {
        const current = Number(flight.currentLevel);
        const predicted = Number(flight.predictedLevel);
        if (current !== fleetLevelFilter && predicted !== fleetLevelFilter) {
          return false;
        }
      }

      if (countryFilter) {
        const fc = (
          flight.originCountry ||
          flight.origin_country ||
          countryFromIcao24(flight.icao24).name
        ).toLowerCase();
        if (fc !== countryFilter.toLowerCase()) return false;
      }

      if (query) {
        const haystack = `${flight.icao24 || ""} ${flight.callsign || ""} ${flight.originCountry || flight.origin_country || ""}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [data, fleetLevelFilter, fleetQuery, countryFilter]);

  const countryList = useMemo(() => groupFlightsByCountry(data?.flights || []), [data]);

  if (loading) {
    return <section className="panel">Loading admin dashboard...</section>;
  }

  return (
    <div className="ops-page ops-page--admin">
      <section className="ops-hero ops-hero--admin">
        <div className="ops-hero__copy">
          <p className="ops-hero__eyebrow">Admin Control</p>
          <h1>System oversight and fleet intelligence</h1>
          <p>
            Manage the live pipeline, coordinate pilot mappings, inspect prediction coverage, and present a cleaner operations story during demos.
          </p>
          <div className="admin-hero-chips">
            <span>Identity + access</span>
            <span>Pilot-aircraft mapping</span>
            <span>Live turbulence supervision</span>
          </div>
        </div>
        <div className="ops-hero__metrics">
          <div className="ops-metric-card">
            <span>Mode</span>
            <strong>{liveModeEnabled ? "Live pipeline" : "Mock-safe"}</strong>
          </div>
          <div className="ops-metric-card">
            <span>Users loaded</span>
            <strong>{users.length}</strong>
          </div>
          <div className="ops-metric-card">
            <span>Analytics</span>
            <strong>{analytics ? "Ready" : "On demand"}</strong>
          </div>
        </div>
      </section>

      <section className="panel admin-command-panel">
        <div className="admin-panel-intro">
          <p className="admin-panel-kicker">Pipeline Controls</p>
          <h2>Admin Dashboard</h2>
          <p>System analytics, fleet-level monitoring, and pipeline trigger controls.</p>
        </div>
        <div className="toolbar admin-command-toolbar">
          <button
            className={`action-btn ${liveModeEnabled ? "" : "muted"}`}
            onClick={async () => {
              if (liveModeEnabled) {
                setLiveModeEnabled(false);
                setAutoFetchActive(false);
                setStatusText("Live pipeline paused. Dashboard will keep the current results until you run it again.");
                setFetchError("");
                return;
              }

              setLiveModeEnabled(true);
              setFetchError("");
              setStatusText("Live pipeline enabled. Running a fresh fetch now...");
              setIsRefreshing(true);
              try {
                const payload = await getLiveDashboardData();
                setData(payload);
                setStatusText("Live pipeline enabled and refreshed.");
                if (analytics) {
                  loadAnalytics();
                }
              } catch (error) {
                setLiveModeEnabled(false);
                setFetchError(error.message || "Could not refresh dashboard data.");
                setStatusText("Live pipeline could not be enabled.");
              } finally {
                setIsRefreshing(false);
              }
            }}
          >
            {liveModeEnabled ? "Disable Live Pipeline" : "Enable Live Pipeline"}
          </button>
          <button
            className={`action-btn ${autoFetchActive ? "success" : ""}`}
            disabled={!liveModeEnabled}
            onClick={() => {
              if (autoFetchActive) {
                setAutoFetchActive(false);
                setStatusText("Auto-fetch disabled.");
              } else {
                setShowIntervalSelector(true);
              }
            }}
            title={liveModeEnabled ? "Setup auto-fetch ML model" : "Enable live pipeline first"}
          >
            {autoFetchActive ? `⚡ Auto-Fetch ON (${autoFetchInterval}s)` : "⚡ Auto-Fetch ML Model"}
          </button>
          <button
            className="action-btn"
            disabled={isRefreshing || !liveModeEnabled}
            onClick={() => refresh("live")}
            title={liveModeEnabled ? "Run live pipeline now" : "Enable live pipeline first"}
          >
            {isRefreshing ? "Running..." : liveModeEnabled ? "Run All Flights Turbulence" : "Enable Live Pipeline First"}
          </button>
          <button className="action-btn muted" disabled={isRefreshing} onClick={() => refresh("mock")}>
            Use Mock Data
          </button>
        </div>
        {statusText ? <p className="status-line">{statusText}</p> : null}
        {fetchError ? <p className="error-line">{fetchError}</p> : null}
      </section>

      {showIntervalSelector && (
        <IntervalSelector
          onClose={() => setShowIntervalSelector(false)}
          onSelect={(interval) => {
            setAutoFetchInterval(interval);
            setAutoFetchActive(true);
            setStatusText(`Auto-fetch enabled every ${interval}s. ML model will be fetched automatically.`);
          }}
        />
      )}

      <section className="stats-grid">
        <StatCard
          label="Rows in Latest Batch"
          value={data.summary.rowsInLastBatch.toLocaleString()}
          hint="planes_table"
        />
        <StatCard
          label="Active Aircraft"
          value={data.summary.activeAircraft.toLocaleString()}
          hint="latest by icao24"
        />
        <StatCard
          label="Predictions Stored"
          value={data.summary.predictionCount.toLocaleString()}
          hint="predictions table"
        />
        <StatCard
          label="Model Pair"
          value="Current + Future"
          hint={`${data.summary.modelName} / ${data.summary.futureModelName}`}
        />
      </section>

      <section className="panel admin-country-panel">
        <div className="admin-panel-intro">
          <p className="admin-panel-kicker">Geographic Distribution</p>
          <h2>Flights per Country</h2>
          <p className="meta-line">
            Origin country resolved from ICAO 24-bit address allocation.
            {data?.source === "mock" && " Showing representative demo data — run live pipeline for real distribution."}
          </p>
        </div>
        <FlightsPerCountry flights={data?.flights || []} />
      </section>

      <section className="panel-grid admin-top-grid">
        <article className="panel admin-analytics-summary">
          <p className="admin-panel-kicker">Signal Mix</p>
          <h2>System Analytics</h2>
          <div className="bars">
            {data.turbulenceSplit.map((item) => {
              const pct = totalSplit ? (item.value / totalSplit) * 100 : 0;
              return (
                <div key={item.level} className="bar-row">
                  <div className="bar-head">
                    <span>{item.level}</span>
                    <strong>{pct.toFixed(0)}%</strong>
                  </div>
                  <div className="track">
                    <div className="fill" style={{ width: `${pct}%`, background: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel admin-window-panel">
          <p className="admin-panel-kicker">Forecast Horizon</p>
          <h2>Prediction Windows</h2>
          <div className="risk-stack">
            {data.futureRisk.map((point) => (
              <div key={point.window} className="risk-item">
                <p>{point.window}</p>
                <p>{(point.severeRisk * 100).toFixed(0)}% severe chance</p>
                <p>{(point.confidence * 100).toFixed(0)}% confidence</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel-grid full-row admin-management-grid">
        <article className="panel admin-users-panel">
          <div className="admin-panel-intro">
            <p className="admin-panel-kicker">Identity Layer</p>
            <h2>User Management</h2>
            <p className="meta-line">All signed-up accounts with roles. Admin can also assign a flight ICAO24 directly to each pilot here.</p>
          </div>
          <div className="toolbar admin-inline-toolbar">
            <button className="action-btn muted" disabled={usersLoading} onClick={loadUsers}>
              {usersLoading ? "Loading..." : "Refresh Users"}
            </button>
            {usersError ? <p className="error-line">{usersError}</p> : null}
          </div>
          {usersLoading ? <p className="meta-line">Loading users...</p> : null}
          {!usersLoading ? (
            <div className="admin-users-surface">
              <AdminUsersTable
                users={users}
                onDelete={handleDeleteUser}
                deletingEmail={deletingEmail}
                onAssignFlight={handleAssignFlight}
                assigningEmail={assigningEmail}
                pilotAssignments={pilotAssignments}
              />
            </div>
          ) : null}
        </article>

        <article className="panel admin-heatmap-panel">
          <div className="admin-panel-intro">
            <p className="admin-panel-kicker">Geo Intelligence</p>
            <h2>Turbulence Analytics</h2>
            <p className="meta-line">
              Heatmap built from the latest prediction per aircraft + latest known location (grid aggregated).
            </p>
          </div>
          <div className="toolbar admin-inline-toolbar">
            <button className="action-btn muted" disabled={analyticsLoading} onClick={loadAnalytics}>
              {analyticsLoading ? "Loading..." : analytics ? "Refresh Analytics" : "Load Analytics"}
            </button>
            {analyticsError ? <p className="error-line">{analyticsError}</p> : null}
          </div>

          {analytics && analytics.cells?.length ? (
            <>
              <div className="analytics-sticky admin-heatmap-surface">
                <TurbulenceHeatmap cells={analytics.cells} gridDeg={analytics.gridDeg} />
              </div>
              <div className="table-wrap admin-analytics-table" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Continent</th>
                      <th>Cells</th>
                      <th>Avg level</th>
                      <th>Severe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(analytics.continentStats || []).map((item) => (
                      <tr key={item.continent}>
                        <td>{item.continent}</td>
                        <td className="mono">{item.count}</td>
                        <td className="mono">{item.avgLevel}</td>
                        <td className="mono">{Math.round((item.severePct || 0) * 100)}%</td>
                      </tr>
                    ))}
                    {!analytics.continentStats?.length ? (
                      <tr>
                        <td colSpan={4} className="meta-line">
                          No continent stats available.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : analyticsLoading ? (
            <p className="meta-line">Loading analytics...</p>
          ) : (
            <p className="meta-line">Analytics now loads on demand to keep the Admin dashboard fast. Click Load Analytics when you need the heatmap.</p>
          )}
        </article>
      </section>

      <section className="panel admin-fleet-panel">
        <div className="panel-head">
          <div>
            <p className="admin-panel-kicker">Live Fleet Layer</p>
            <h2>Fleet Monitor</h2>
            <p className="meta-line">Filter by turbulence level, country, or search by ICAO / callsign.</p>
          </div>

          <div className="fleet-filters admin-fleet-filters">
            <input
              className="input inline-input"
              value={fleetQuery}
              onChange={(event) => setFleetQuery(event.target.value)}
              placeholder="Search ICAO / callsign"
              aria-label="Search flights"
            />

            <select
              className="input inline-input fleet-country-select"
              value={countryFilter || ""}
              onChange={(e) => setCountryFilter(e.target.value || null)}
              aria-label="Filter by country"
            >
              <option value="">All Countries</option>
              {countryList.map(({ name, flag }) => (
                <option key={name} value={name}>{flag} {name}</option>
              ))}
            </select>

            <div className="filter-pills" role="group" aria-label="Turbulence filter">
              <button
                type="button"
                className={`filter-pill ${fleetLevelFilter < 0 ? "active" : ""}`}
                onClick={() => setFleetLevelFilter(-1)}
                aria-pressed={fleetLevelFilter < 0}
              >
                All
              </button>
              {[0, 1, 2, 3].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`filter-pill level-${level} ${fleetLevelFilter === level ? "active" : ""}`}
                  onClick={() => setFleetLevelFilter(level)}
                  aria-pressed={fleetLevelFilter === level}
                >
                  {["Calm", "Light", "Moderate", "Severe"][level]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="admin-flight-surface">
          <FlightTable flights={filteredFlights} />
        </div>
      </section>
    </div>
  );
}

export default AdminDashboard;
