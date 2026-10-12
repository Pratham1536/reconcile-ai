
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Activity,
  Database,
  CircleDollarSign,
  CheckCircle,
  Search,
  XCircle,
  Clock
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
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [resolutionSaving, setResolutionSaving] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");


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
  
  
const submitResolution = async (decision) => {
  if (resolutionSaving || !selectedException) return;

  const exceptionId = selectedException.exception_id;

  try {
    setResolutionSaving(true);
    setResolutionMessage("");

    const response = await fetch(
      `${API}/exceptions/${exceptionId}/resolution`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision,
          reviewer_notes: reviewerNotes,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || "Could not save review decision"
      );
    }

    const saved = data.resolution;

    setExceptions((previous) =>
      previous.map((item) =>
        item.exception_id === exceptionId
          ? {
              ...item,
              latest_decision: saved.decision,
              reviewer_notes: saved.reviewer_notes,
              reviewed_at: saved.reviewed_at,
            }
          : item
      )
    );

    setSelectedException((previous) =>
      previous?.exception_id === exceptionId
        ? {
            ...previous,
            latest_decision: saved.decision,
            reviewer_notes: saved.reviewer_notes,
            reviewed_at: saved.reviewed_at,
          }
        : previous
    );

    setResolutionMessage(
      `Recommendation ${saved.decision} successfully.`
    );
    setReviewerNotes("");
  } catch (err) {
    setResolutionMessage(
      err.message || "Failed to save review decision"
    );
  } finally {
    setResolutionSaving(false);
  }
};





  
const openExceptions = exceptions.filter(
  (item) => item.status === "open"
);

const counts = openExceptions.reduce((result, item) => {
  result[item.exception_type] =
    (result[item.exception_type] || 0) + 1;
  return result;
}, {});

const openTotal = openExceptions.length;

const investigatingTotal = exceptions.filter(
  (item) => item.status === "investigating"
).length;

const resolvedTotal = exceptions.filter(
  (item) => item.status === "resolved"
).length;


const approvedTotal = exceptions.filter(
  (item) => item.latest_decision === "approved"
).length;

const rejectedTotal = exceptions.filter(
  (item) => item.latest_decision === "rejected"
).length;

const notReviewedTotal = exceptions.filter(
  (item) => !item.latest_decision
).length;



  

const filteredExceptions = exceptions.filter((item) => {
  const matchesType =
    filter === "all" || item.exception_type === filter;

  const matchesStatus =
    statusFilter === "all" || item.status === statusFilter;

  const matchesReview =
    reviewFilter === "all" ||
    (reviewFilter === "not_reviewed"
      ? !item.latest_decision
      : item.latest_decision === reviewFilter);

  const query = search.trim().toLowerCase();

  const matchesSearch = [
    item.invoice_number,
    item.transaction_reference,
    item.exception_type,
    item.root_cause,
    String(item.exception_id),
  ].some((value) =>
    String(value || "").toLowerCase().includes(query)
  );

  return (
    matchesType &&
    matchesStatus &&
    matchesReview &&
    matchesSearch
  );
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
            value={loading ? "—" : openTotal.toLocaleString("en-IN")}
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
          <Metric
            label="Investigating"
            value={loading ? "—" : investigatingTotal}
            note="Currently under investigation"
            icon={<Activity size={20} />}
          />

          <Metric
            label="Resolved"
            value={loading ? "—" : resolvedTotal}
            note="Exceptions marked resolved"
            icon={<CheckCircle size={20} />}
          />
          
          <Metric
            label="Approved"
            value={loading ? "—" : approvedTotal}
            note="Recommendations approved"
            icon={<CheckCircle size={20} />}
          />
          <Metric
            label="Rejected"
            value={loading ? "—" : rejectedTotal}
            note="Recommendations rejected"
            icon={<XCircle size={20} />}
          />
          <Metric
            label="Not Reviewed"
            value={loading ? "—" : notReviewedTotal}
            note="Awaiting a human decision"
            icon={<Clock size={20} />}
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

  
<select
  value={reviewFilter}
  onChange={(e) => setReviewFilter(e.target.value)}
>
  <option value="all">All review decisions</option>
  <option value="approved">Approved</option>
  <option value="rejected">Rejected</option>
  <option value="not_reviewed">Not reviewed</option>
</select>


  <button
    className="clear-filters-button"
        onClick={() => {
          setSearch("");
          setFilter("all");
          setStatusFilter("all");
          setReviewFilter("all");
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
  
onClick={() => {
  setInvestigation(null);
  setInvestigationError("");
  setSelectedException(item);
}}

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
                   onClick={() => {
                    setSelectedException(null);
                    setInvestigation(null);
                    setInvestigationError("");
                  }}
                >
                  ×
                </button>
              </div>

              <div className="detail-grid">
                <div className="detail-card">
                  <span>Exception type</span>
                  <strong>
                    {selectedException.exception_type
                      .replaceAll("_", " ")
                      .replace(/\b\w/g, (char) => char.toUpperCase())}
                  </strong>
                </div>

                <div className="detail-card">
                  <span>Status</span>
                  <strong>
                    {selectedException.status
                      .replaceAll("_", " ")
                      .replace(/\b\w/g, (char) => char.toUpperCase())}
                  </strong>
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
                <div className="detail-card">
                  <span>Created at</span>
                  <strong>
                    {selectedException.created_at
                      ? new Date(selectedException.created_at).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </strong>
                </div>
              </div>

              
              {selectedException.latest_decision && (
                <div className="resolution-review-status">
                  <h3>Latest Review Decision</h3>

                  <p>
                    Decision:{" "}
                    <strong>
                      {selectedException.latest_decision
                        .charAt(0)
                        .toUpperCase() +
                        selectedException.latest_decision.slice(1)}
                    </strong>
                  </p>

                  <p>
                    Reviewer notes:{" "}
                    {selectedException.reviewer_notes || "No notes provided"}
                  </p>

                  <p>
                    Reviewed at:{" "}
                    {selectedException.reviewed_at
                      ? new Date(
                            selectedException.reviewed_at.endsWith("Z")
                              ? selectedException.reviewed_at
                              : selectedException.reviewed_at + "Z"
                          ).toLocaleString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: true,
                          })
                      : "—"}
                  </p>
                </div>
              )}


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
                  
                  {investigation && (
                    <div className="confidence-section">
                      <h4>
                        Investigation Confidence:{" "}
                        {Math.round(
                          Number(investigation.confidence ?? 0) * 100
                        )}%
                      </h4>

                      <p>
                        {investigation.confidence_reason ||
                          "No confidence explanation available."}
                      </p>
                    </div>
                  )}

                  
                    
                <div className="investigation-timeline">
                  <h4>Investigation Timeline</h4>

                  <div className="timeline-stage completed">
                    <span className="timeline-marker">✓</span>
                    <div>
                      <strong>Exception detected</strong>
                      <p>Reconciliation identified an exception for review.</p>
                    </div>
                  </div>

                  <div
                    className={`timeline-stage ${
                      investigation ? "completed" : "pending"
                    }`}
                  >
                    <span className="timeline-marker">
                      {investigation ? "✓" : "2"}
                    </span>
                    <div>
                      <strong>AI investigation</strong>
                      <p>
                        {investigation
                          ? "Investigation results are available."
                          : "Run Investigate with AI to collect evidence."}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`timeline-stage ${
                      investigation?.recommended_resolution
                        ? "completed"
                        : "pending"
                    }`}
                  >
                    <span className="timeline-marker">
                      {investigation?.recommended_resolution ? "✓" : "3"}
                    </span>
                    <div>
                      <strong>Resolution recommendation</strong>
                      <p>
                        {investigation?.recommended_resolution
                          ? "A recommended next step is available for review."
                          : "A recommendation will appear after investigation."}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`timeline-stage ${
                      selectedException?.latest_decision
                        ? "completed"
                        : "pending"
                    }`}
                  >
                    <span className="timeline-marker">
                      {selectedException?.latest_decision ? "✓" : "4"}
                    </span>
                    <div>
                      <strong>Human review decision</strong>
                      <p>
                        {selectedException?.latest_decision
                          ? `Decision recorded: ${selectedException.latest_decision}.`
                          : "Review the evidence and record an approval or rejection."}
                      </p>
                    </div>
                  </div>
                </div>



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

                  {investigation.evidence
                    .filter(
                      (item) =>
                        item.source === "customer_payment_history" &&
                        Array.isArray(item.payments) &&
                        item.payments.length > 0
                    )
                    .map((item) => (
                      <div className="payment-history-section" key={item.source}>
                        <h4>Customer Payment History</h4>

                        <div className="payment-history-summary">
                          <span>
                            Customer ID: <strong>{item.customer_id}</strong>
                          </span>
                          <span>
                            Transactions found: <strong>{item.transactions_found}</strong>
                          </span>
                          <span>
                            Linked to other invoices:{" "}
                            <strong>{item.linked_to_other_invoices}</strong>
                          </span>
                        </div>

                        <div className="payment-table-wrapper">
                          <table className="payment-history-table">
                            <thead>
                              <tr>
                                <th>Transaction ID</th>
                                <th>Reference</th>
                                <th>Amount</th>
                                <th>Linked Invoice</th>
                                <th>Date</th>
                              </tr>
                            </thead>

                            <tbody>
                              {item.payments.map((payment) => (
                                <tr key={payment.transaction_id}>
                                  <td>{payment.transaction_id}</td>
                                  <td>{payment.reference || "—"}</td>
                                  <td>
                                    {new Intl.NumberFormat("en-IN", {
                                      style: "currency",
                                      currency: "INR",
                                      maximumFractionDigits: 2,
                                    }).format(Number(payment.amount || 0))}
                                  </td>
                                  <td>{payment.linked_invoice_id ?? "—"}</td>
                                  <td>
                                    {payment.transaction_date
                                      ? new Date(
                                          payment.transaction_date
                                        ).toLocaleDateString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                          timeZone: "UTC",
                                        })
                                      : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <p className="payment-history-note">
                          These payments are linked to other invoices. Treat them as
                          investigation evidence only; do not automatically reassign them.
                        </p>
                      </div>
                    ))}


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

                <div className="resolution-review">
                  <h3>Review recommendation</h3>
                  <p>
                    Check the investigation evidence before recording your decision.
                  </p>

                  <textarea
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    placeholder="Enter reviewer notes (optional)"
                    rows={3}
                    disabled={resolutionSaving}
                  />

                  <div className="resolution-actions">
                    <button
                      type="button"
                      className="approve-button"
                      disabled={resolutionSaving || Boolean(selectedException.latest_decision)}
                      onClick={() => submitResolution("approved")}
                    >
                      {resolutionSaving ? "Saving..." : "Approve recommendation"}
                    </button>

                    <button
                      type="button"
                      className="reject-button"
                      disabled={resolutionSaving || Boolean(selectedException.latest_decision)}
                      onClick={() => submitResolution("rejected")}
                    >
                      {resolutionSaving ? "Saving..." : "Reject recommendation"}
                    </button>
                  </div>

                  {resolutionMessage && (
                    <p role="status">{resolutionMessage}</p>
                  )}
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
