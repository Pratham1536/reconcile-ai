import { useEffect, useState } from "react";

function App() {
  const [backendStatus, setBackendStatus] = useState("Checking...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/health")
      .then((response) => response.json())
      .then((data) => {
        setBackendStatus(data.status);
      })
      .catch((error) => {
        console.error(error);
        setBackendStatus("Backend Offline");
      });
  }, []);

  return (
    <div>
      <h1>ReconcileAI</h1>

      <p>Agentic Exception Resolution Platform</p>

      <hr />

      <h2>System Status</h2>

      <p>Frontend: ✅ Running</p>

      <p>
        Backend:{" "}
        {backendStatus === "healthy"
          ? "🟢 Connected"
          : "⏳ " + backendStatus}
      </p>

      <p>Database: ⏳ Not Connected Yet</p>

      <p>AI Agent: ⏳ Coming Soon</p>
    </div>
  );
}

export default App;