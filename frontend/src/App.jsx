
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Activity,
  Database,
  CircleDollarSign,
  Search,
} from "lucide-react";
import "./App.css";

const API = "http://127.0.0.1:8000";

function App() {
  const [exceptions, setExceptions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedException, setSelectedException] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [investigation, setInvestigation] = useState(null);
  const [investigating, setInvestigating] = useState(false);
  const [investigationError, setInvestigationError] = useState("");

  const loadExceptions = useCallback(async () => {
    try {
      setError("");
      const response = await fetch(`${API}/exceptions`);
      if (!response.ok) throw new Error("Could not load exceptions");

      const data = await response.json();
      setExceptions(data.exceptions);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExceptions();
  }, [loadExceptions]);

  
async function runReconciliation() {
  try {
    setRunning(true);
    setError("");
    setSuccessMessage("");

    const response = await fetch(`${API}/reconcile`, {
      method: "POST",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Reconciliation failed. Please try again."
      );
    }

    // Refresh exceptions and dashboard metrics.
    await loadExceptions();

    setSuccessMessage(
      `Reconciliation completed! Checked ${
        data.result.transactions_checked
      } transactions and detected ${
        data.result.exceptions_created
      } exceptions.`
    );
  } catch (err) {
    setError(
      `Unable to run reconciliation: ${err.message}. Check that the backend is running.`
    );
  } finally {
    setRunning(false);
  }
}


  async function runInvestigation(exceptionId) {
    try {
      setInvestigating(true);
      setInvestigationError("");
      setInvestigation(null);

      const response = await fetch(
        `${API}/exceptions/${exceptionId}/investigate`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.detail || data.error || "Investigation failed."
        );
      }

      setInvestigation(data.investigation);
    } catch (err) {
      setInvestigationError(
        `${err.message} Check that the backend is running.`
      );
    } finally {
      setInvestigating(false);
    }
  }



  const counts = exceptions.reduce((result, item) => {

    result[item.exception_type] =
      (result[item.exception_type] || 0) + 1;
    return result;
  }, {});

  
const filteredExceptions = exceptions.filter((item) => {
  const matchesType =
    filter === "all" || item.exception_type === filter;

  const matchesStatus =
    statusFilter === "all" || item.status === statusFilter;

  const query = search.trim().toLowerCase();

  const matchesSearch = [
    item.invoice_number,
    item.transaction_reference,
    item.exception_type,
    item.root_cause,
    String(item.exception_id),
  ].some((value) =>
    (value || "").toLowerCase().includes(query)
  );

  return matchesType && matchesStatus && matchesSearch;
});


  const categories = [
    ["partial_payment", "Partial payment"],
    ["duplicate_candidate", "Duplicate candidate"],
    ["missing_payment", "Missing payment"],
    ["wrong_mapping", "Wrong mapping"],
    ["fee_discrepancy", "Fee discrepancy"],
  ];

  const formatAmount = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">R</div>
          <div>
            <strong>ReconcileAI</strong>
            <span>Finance operations</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <div className="nav-item active">
          <Activity size={18} /> Overview
        </div>
        <div className="nav-item">
          <Database size={18} /> Reconciliation
        </div>
        <div className="nav-item">
          <AlertTriangle size={18} /> Exceptions
        </div>

        <div className="sidebar-footer">
          <span className="online-dot" /> API workspace
          <small>Local development</small>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">FINANCE / OVERVIEW</span>
            <h1>Reconciliation dashboard</h1>
            <p>Monitor mismatches and investigate payment exceptions.</p>
          </div>

          <button
            className="primary-button"
            onClick={runReconciliation}
            disabled={running}
          >
            <RefreshCw
              size={16}
              className={running ? "spin" : ""}
            />
            {running ? "Reconciling..." : "Run reconciliation"}
          </button>
        </header>

        
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={loadExceptions}>Retry</button>
          </div>
        )}

        {successMessage && (
          <div className="success-banner" role="status">
            <span>✓ {successMessage}</span>
            <button
              onClick={() => setSuccessMessage("")}
              aria-label="Dismiss success message"
            >
              ×
            </button>
          </div>
        )}


        <section className="metrics-grid">
          <Metric
            label="Open exceptions"
            value={loading ? "—" : total.toLocaleString("en-IN")}
            note="Detected by reconciliation"
            icon={<AlertTriangle size={20} />}
          />
          <Metric
            label="Partial payments"
            value={loading ? "—" : counts.partial_payment || 0}
            note="Invoice amount exceeds payment"
            icon={<CircleDollarSign size={20} />}
          />
          <Metric
            label="Missing payments"
            value={loading ? "—" : counts.missing_payment || 0}
            note="No linked successful payment"
            icon={<Database size={20} />}
          />
          <Metric
            label="Other exceptions"
            value={
              loading
                ? "—"
                : total -
                  (counts.partial_payment || 0) -
                  (counts.missing_payment || 0)
            }
            note="Requires further review"
            icon={<Activity size={20} />}
          />
        </section>

        <section className="panel category-panel">
          <div className="panel-heading">
            <div>
              <h2>Exception breakdown</h2>
              <p>Cases grouped by current classification</p>
            </div>
            <span className="live-tag">
              <span className="online-dot" /> Live data
            </span>
          </div>

          <div className="category-list">
            {categories.map(([type, label]) => {
              const count = counts[type] || 0;
              const percentage = total
                ? (count / total) * 100
                : 0;

              return (
                <div className="category-row" key={type}>
                  <div className="category-info">
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Exception queue</h2>
              <p>Review individual reconciliation issues</p>
            </div>
            <span className="queue-count">{filteredExceptions.length} cases</span>
          </div>

          
<div className="toolbar">
  <div className="search-box">
    <Search size={17} />
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search invoice, ID, reference, or cause..."
    />
  </div>

  <select
    value={filter}
    onChange={(e) => setFilter(e.target.value)}
  >
    <option value="all">All exception types</option>
    {categories.map(([type, label]) => (
      <option key={type} value={type}>
        {label}
      </option>
    ))}
  </select>

  <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
  >
    <option value="all">All statuses</option>
    <option value="open">Open</option>
    <option value="investigating">Investigating</option>
    <option value="resolved">Resolved</option>
  </select>

  <button
    className="clear-filters-button"
    onClick={() => {
      setSearch("");
      setFilter("all");
      setStatusFilter("all");
    }}
  >
    Clear filters
  </button>
</div>


          {loading ? (
            <div className="empty-state">Loading exceptions...</div>
          ) : filteredExceptions.length === 0 ? (
            <div className="empty-state">
              <CheckCircle2 size={28} />
              <p>No exceptions match your search.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Transaction</th>
                    <th>Exception type</th>
                    <th>Difference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExceptions.slice(0, 50).map((item) => (
                    <tr
  key={item.exception_id}
  className="clickable-row"
  onClick={() => setSelectedException(item)}
  title="Click to view exception details"
>
                      <td>
                        <strong>{item.invoice_number || "—"}</strong>
                        <small>#{item.exception_id}</small>
                      </td>
                      <td>{item.transaction_reference || "—"}</td>
                      <td>
                        <span className="type-label">
                          {item.exception_type.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="amount">
                        {formatAmount(item.difference_amount)}
                      </td>
                      <td>
                        <span className="status-pill">
                          <span className="status-dot" />
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredExceptions.length > 50 && (
                <p className="table-note">
                  Showing 50 of {filteredExceptions.length} matching cases.
                </p>
              )}
            </div>
          )}
        </section>

        <footer className="page-footer">
          <span><span className="online-dot" /> Connected to ReconcileAI API</span>
          <span>Prototype · Synthetic financial data</span>
        </footer>
        
        {selectedException && (
          <div
            className="modal-overlay"
            onClick={() => setSelectedException(null)}
          >
            <section
              className="exception-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-heading">
                <div>
                  <span className="eyebrow">EXCEPTION DETAILS</span>
                  <h2>
                    {selectedException.invoice_number || "Unmapped invoice"}
                  </h2>
                  <p>Exception #{selectedException.exception_id}</p>
                </div>

                <button
                  className="close-button"
                  onClick={() => setSelectedException(null)}
                >
                  ×
                </button>
              </div>

              <div className="detail-grid">
                <div className="detail-card">
                  <span>Exception type</span>
                  <strong>{selectedException.exception_type.replaceAll("_", " ")}</strong>
                </div>

                <div className="detail-card">
                  <span>Status</span>
                  <strong>{selectedException.status}</strong>
                </div>

                <div className="detail-card">
                  <span>Invoice ID</span>
                  <strong>{selectedException.invoice_id ?? "—"}</strong>
                </div>

                <div className="detail-card">
                  <span>Transaction ID</span>
                  <strong>{selectedException.transaction_id ?? "No linked transaction"}</strong>
                </div>

                <div className="detail-card">
                  <span>Transaction reference</span>
                  <strong>{selectedException.transaction_reference || "—"}</strong>
                </div>

                <div className="detail-card">
                  <span>Amount difference</span>
                  <strong>
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                    }).format(Number(selectedException.difference_amount || 0))}
                  </strong>
                </div>
              </div>

              <div className="evidence-panel">
                <h3>Current explanation</h3>
                <p>
                  {selectedException.root_cause ||
                    "No explanation has been recorded yet."}
                </p>
              </div>

              
              {investigating && (
                <div className="ai-investigation-panel">
                  <p>Examining invoice, transaction, and settlement evidence...</p>
                </div>
              )}

              {investigationError && (
                <div className="ai-investigation-error" role="alert">
                  {investigationError}
                </div>
              )}

              {investigation && (
                <div className="ai-investigation-panel">
                  <h3>Investigation results</h3>

                  <div className="investigation-summary">
                    <span>Root cause</span>
                    <strong>{investigation.root_cause}</strong>
                  </div>

                  <div className="investigation-summary">
                    <span>Heuristic confidence</span>
                    <strong>
                      {Math.round(investigation.confidence * 100)}%
                    </strong>
                  </div>

                  <h4>Evidence collected</h4>
                  <ul>
                    {investigation.evidence.map((item, index) => (
                      <li key={`${item.source}-${index}`}>
                        <strong>{item.source.replaceAll("_", " ")}:</strong>{" "}
                        {item.detail}
                        {item.amount !== undefined &&
                          ` (₹${Number(item.amount).toLocaleString("en-IN")})`}
                      </li>
                    ))}
                  </ul>

                  <h4>Recommended resolution</h4>
                  <p>{investigation.recommended_resolution}</p>

                  {investigation.requires_human_approval && (
                    <div className="human-review-notice">
                      Human approval required. No financial action was executed.
                    </div>
                  )}
                </div>
              )}


              <div className="modal-footer">
                <span>
                  <span className="online-dot" /> Recorded in Supabase
                </span>
                
                <button
                  className="primary-button"
                  disabled={investigating}
                  onClick={() => runInvestigation(selectedException.exception_id)}
                >
                  {investigating ? "Investigating..." : "Investigate with AI"}
                </button>

              </div>
            </section>
          </div>
        )}

      </main>
    </div>
  );
}

function Metric({ label, value, note, icon }) {
  
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </article>
  );
}

export default App;
