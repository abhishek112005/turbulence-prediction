import { useMemo, useState } from "react";

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

function AdminUsersTable({ users, onDelete, deletingEmail }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

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
      <div className="toolbar">
        <input
          className="input inline-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email or role"
          aria-label="Search users"
        />
        <p className="meta-line">{filtered.length} users</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.email}>
                <td className="mono">{user.email}</td>
                <td>
                  <RoleBadge role={user.role} />
                </td>
                <td>
                  <StatusBadge isActive={user.is_active} />
                </td>
                <td className="mono">{user.created_at ? new Date(user.created_at).toLocaleString() : "—"}</td>
                <td>
                  <button
                    className="action-btn danger small"
                    onClick={() => onDelete(user.email)}
                    disabled={!user.is_active || deletingEmail === user.email}
                    title={!user.is_active ? "User already inactive" : "Deactivate user"}
                  >
                    {deletingEmail === user.email ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={5} className="meta-line">
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

