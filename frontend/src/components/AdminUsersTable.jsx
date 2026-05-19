import { useEffect, useMemo, useState } from "react";

function RoleBadge({ role }) {
  const normalized = String(role || "").toLowerCase();
  const className = `risk-badge role-badge role-${normalized || "unknown"}`;
  return <span className={className}>{normalized || "unknown"}</span>;
}

function StatusBadge({ isActive }) {
  const className = `risk-badge status-badge ${isActive ? "status-active" : "status-inactive"}`;
  return <span className={className}>{isActive ? "active" : "inactive"}</span>;
}

function sortUsers(users) {
  return [...(users || [])].sort((a, b) => {
    const roleA = String(a.role || "");
    const roleB = String(b.role || "");
    if (roleA !== roleB) {
      return roleA.localeCompare(roleB);
    }
    return String(a.email || "").localeCompare(String(b.email || ""));
  });
}

function AdminUsersTable({
  users,
  onDelete,
  deletingEmail,
  onAssignFlight,
  assigningEmail,
  pilotAssignments = {}
}) {
  const [query, setQuery] = useState("");
  const [draftAssignments, setDraftAssignments] = useState({});
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    const nextDrafts = {};
    Object.entries(pilotAssignments || {}).forEach(([email, assignment]) => {
      nextDrafts[email] = assignment?.icao24 || "";
    });
    setDraftAssignments(nextDrafts);
  }, [pilotAssignments]);

  const filtered = useMemo(() => {
    const sorted = sortUsers(users);
    if (!normalizedQuery) {
      return sorted;
    }
    return sorted.filter((user) => {
      const email = String(user.email || "").toLowerCase();
      const role = String(user.role || "").toLowerCase();
      return email.includes(normalizedQuery) || role.includes(normalizedQuery);
    });
  }, [users, normalizedQuery]);

  return (
    <>
      <div className="toolbar admin-users-toolbar">
        <input
          className="input inline-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email or role"
          aria-label="Search users"
        />
        <p className="meta-line">{filtered.length} users</p>
      </div>

      <div className="table-wrap admin-users-table-wrap">
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Assigned Flight</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const isPilot = String(user.role || "").toLowerCase() === "pilot";
              const currentAssignment = pilotAssignments[user.email]?.icao24 || "Not assigned";
              return (
                <tr key={user.email}>
                  <td className="mono admin-users-table__email">{user.email}</td>
                  <td>
                    <RoleBadge role={user.role} />
                  </td>
                  <td>
                    <StatusBadge isActive={user.is_active} />
                  </td>
                  <td className="mono admin-users-table__created">{user.created_at ? new Date(user.created_at).toLocaleString() : "-"}</td>
                  <td className="admin-users-table__assignment">
                    {isPilot ? (
                      <div className="admin-users-table__assignment-stack">
                        <input
                          className="input inline-input"
                          value={draftAssignments[user.email] || ""}
                          onChange={(event) =>
                            setDraftAssignments((prev) => ({
                              ...prev,
                              [user.email]: event.target.value.toUpperCase()
                            }))
                          }
                          placeholder="e.g., A0084F123"
                          disabled={!user.is_active || assigningEmail === user.email}
                          maxLength={10}
                        />
                        <button
                          className="action-btn small admin-users-table__assign-btn"
                          onClick={() => onAssignFlight(user.email, draftAssignments[user.email] || "")}
                          disabled={!user.is_active || assigningEmail === user.email}
                          title={!user.is_active ? "Pilot is inactive" : "Assign flight to this pilot"}
                        >
                          {assigningEmail === user.email ? "Assigning..." : "Assign Flight"}
                        </button>
                        <p className="meta-line">Current: {currentAssignment}</p>
                      </div>
                    ) : (
                      <span className="meta-line">Pilot only</span>
                    )}
                  </td>
                  <td className="admin-users-table__actions">
                    <div className="admin-users-table__actions-row">
                      <button
                        className="action-btn danger small"
                        onClick={() => onDelete(user.email)}
                        disabled={!user.is_active || deletingEmail === user.email}
                        title={!user.is_active ? "User already inactive" : "Deactivate user"}
                      >
                        {deletingEmail === user.email ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length ? (
              <tr>
                <td colSpan={6} className="meta-line">
                  No users match your search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default AdminUsersTable;
