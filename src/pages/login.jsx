import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage({ onSuccess, onCancel }) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      setSubmitting(true);
      await login(username.trim(), password);
      if (typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      setError(err?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        width: "100%",
        maxWidth: 360,
        display: "grid",
        gap: 12,
        padding: 20,
        border: "1px solid #ddd",
        borderRadius: 10,
        background: "#fff",
      }}
    >
      <h2 style={{ margin: 0 }}>Login</h2>

      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button type="submit" disabled={submitting}>
        {submitting ? "Logging in..." : "Login"}
      </button>

      {onCancel ? (
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      ) : null}

      {error ? <p style={{ color: "red", margin: 0 }}>{error}</p> : null}
    </form>
  );
}
