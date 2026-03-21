import { useEffect, useMemo, useState } from "react";
import FlightTable from "../components/FlightTable";
import StatCard from "../components/StatCard";
import AdminUsersTable from "../components/AdminUsersTable";
import TurbulenceHeatmap from "../components/TurbulenceHeatmap";
import { useAuth } from "../context/AuthContext";
import {
  deleteAdminUser,
  getAdminUsers,
  getLiveDashboardData,
  getMockDashboardData,
  getTurbulenceAnalytics
} from "../services/api";

function AdminDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [users, setUsers] = useState([]);
  const [deletingEmail, setDeletingEmail] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [fleetLevelFilter, setFleetLevelFilter] = useState(-1);
  const [fleetQuery, setFleetQuery] = useState("");

  useEffect(() => {
    getLiveDashboardData()
      .then((payload) => {
        setData(payload);
        setStatusText("All-flight turbulence run completed.");
      })
      .catch(async () => {
        const payload = await getMockDashboardData();
        setData(payload);
        setStatusText("Live pipeline unavailable. Showing mock data.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function loadUsers() {
    if (!user?.email) {
      return;
    }
    setUsersError("");
    setUsersLoading(true);
    try {
      const payload = await getAdminUsers(user.email, { includeInactive: true, limit: 1200 });
      setUsers(payload.users || []);
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
        maxCells: 900,
        gridDeg: 5,
        sinceMinutes: 360
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
    loadAnalytics();
  }, [user?.email]);

  async function refresh(source) {
    setFetchError("");
    setStatusText("");
    setIsRefreshing(true);
    try {
      const payload = source === "live" ? await getLiveDashboardData() : await getMockDashboardData();
      setData(payload);
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

      if (query) {
        const haystack = `${flight.icao24 || ""} ${flight.callsign || ""}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [data, fleetLevelFilter, fleetQuery]);

  if (loading) {
    return <section className="panel">Loading admin dashboard...</section>;
  }

  return (
    <>
      <section className="panel">
        <h2>Admin Dashboard</h2>
        <p>System analytics, fleet-level monitoring, and pipeline trigger controls.</p>
        <div className="toolbar">
          <button className="action-btn" disabled={isRefreshing} onClick={() => refresh("live")}>
            {isRefreshing ? "Running..." : "Run All Flights Turbulence"}
          </button>
          <button className="action-btn muted" disabled={isRefreshing} onClick={() => refresh("mock")}>
            Use Mock Data
          </button>
        </div>
        {statusText ? <p className="status-line">{statusText}</p> : null}
        {fetchError ? <p className="error-line">{fetchError}</p> : null}
      </section>

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

      <section className="panel-grid">
        <article className="panel">
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

        <article className="panel">
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

      <section className="panel-grid full-row">
        <article className="panel">
          <h2>User Management</h2>
          <p className="meta-line">All signed-up accounts with roles. Deleting deactivates access.</p>
          <div className="toolbar">
            <button className="action-btn muted" disabled={usersLoading} onClick={loadUsers}>
              {usersLoading ? "Loading..." : "Refresh Users"}
            </button>
            {usersError ? <p className="error-line">{usersError}</p> : null}
          </div>
          {usersLoading ? <p className="meta-line">Loading users...</p> : null}
          {!usersLoading ? (
            <AdminUsersTable users={users} onDelete={handleDeleteUser} deletingEmail={deletingEmail} />
          ) : null}
        </article>

        <article className="panel">
          <h2>Turbulence Analytics</h2>
          <p className="meta-line">
            Heatmap built from the latest prediction per aircraft + latest known location (grid aggregated).
          </p>
          <div className="toolbar">
            <button className="action-btn muted" disabled={analyticsLoading} onClick={loadAnalytics}>
              {analyticsLoading ? "Loading..." : "Refresh Analytics"}
            </button>
            {analyticsError ? <p className="error-line">{analyticsError}</p> : null}
          </div>

          {analytics && analytics.cells?.length ? (
            <>
              <div className="analytics-sticky">
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
            <p className="meta-line">No analytics available yet. Run the pipeline, then refresh analytics.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Fleet Monitor</h2>
            <p className="meta-line">Filter by turbulence level (matches current or predicted).</p>
          </div>

          <div className="fleet-filters">
            <input
              className="input inline-input"
              value={fleetQuery}
              onChange={(event) => setFleetQuery(event.target.value)}
              placeholder="Search ICAO / callsign"
              aria-label="Search flights"
            />

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

        <FlightTable flights={filteredFlights} />
      </section>
    </>
  );
}

export default AdminDashboard;
