import { useEffect, useMemo, useState } from "react";
import FlightTable from "../components/FlightTable";
import StatCard from "../components/StatCard";
import { getLiveDashboardData, getMockDashboardData } from "../services/api";

function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [statusText, setStatusText] = useState("");

  useEffect(() => {
    getMockDashboardData()
      .then((payload) => setData(payload))
      .finally(() => setLoading(false));
  }, []);

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

  const totalSplit = useMemo(() => {
    if (!data) {
      return 0;
    }
    return data.turbulenceSplit.reduce((acc, item) => acc + item.value, 0);
  }, [data]);

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
            {isRefreshing ? "Running..." : "Trigger Live Pipeline"}
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

      <section className="panel">
        <h2>Fleet Monitor</h2>
        <FlightTable flights={data.flights} />
      </section>
    </>
  );
}

export default AdminDashboard;
