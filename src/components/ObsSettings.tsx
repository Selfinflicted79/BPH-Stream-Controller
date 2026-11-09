interface Props {
  host: string;
  port: number;
  password: string;
  autoConnect: boolean;
  connected: boolean;
  waiting?: boolean;
  lastError: string | null;
  busy: boolean;
  onChange: (patch: {
    host?: string;
    port?: number;
    password?: string;
    autoConnect?: boolean;
  }) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}

export function ObsSettings({
  host,
  port,
  password,
  autoConnect,
  connected,
  waiting = false,
  lastError,
  busy,
  onChange,
  onConnect,
  onDisconnect,
  onRefresh,
}: Props) {
  const pillLabel = connected ? "LINKED" : waiting ? "SCANNING" : "STANDBY";
  return (
    <section
      className={`slim-rack slim-rack--obs ${connected ? "slim-rack--hot" : ""} ${
        waiting && !connected ? "slim-rack--scan" : ""
      }`}
    >
      <div className="slim-rack__id">
        <p className="slim-rack__eyebrow slim-rack__eyebrow--magenta">OBS LINK</p>
        <h2 className="slim-rack__title">WebSocket Bridge</h2>
      </div>

      <div className="slim-rack__fields">
        <input
          className="slim-field"
          aria-label="OBS host"
          value={host}
          placeholder="Host"
          spellCheck={false}
          onChange={(e) => onChange({ host: e.target.value })}
        />
        <input
          className="slim-field slim-field--port"
          aria-label="OBS port"
          type="number"
          value={port}
          placeholder="Port"
          onChange={(e) => onChange({ port: Number(e.target.value) || 4455 })}
        />
        <input
          className="slim-field"
          aria-label="OBS password"
          type="password"
          value={password}
          placeholder="Password"
          onChange={(e) => onChange({ password: e.target.value })}
        />
        <label className="slim-check" title="Scan for OBS on launch">
          <input
            type="checkbox"
            checked={autoConnect}
            onChange={(e) => onChange({ autoConnect: e.target.checked })}
          />
          Auto
        </label>
        {!connected ? (
          <button type="button" className="slim-icon slim-icon--go" disabled={busy} onClick={onConnect}>
            {busy ? "…" : "Link"}
          </button>
        ) : (
          <>
            <button type="button" className="slim-icon" disabled={busy} onClick={onRefresh} title="Refresh scenes & sources">
              ↻
            </button>
            <button type="button" className="slim-icon" disabled={busy} onClick={onDisconnect} title="Disconnect">
              ✕
            </button>
          </>
        )}
      </div>

      <div className={`slim-pill ${connected ? "on" : waiting ? "scan" : "off"}`}>
        <span className={`status-dot ${connected ? "on" : waiting ? "scan" : "off"}`} />
        {pillLabel}
        {connected ? <span aria-hidden>✓</span> : null}
      </div>

      {lastError && !waiting ? <p className="slim-rack__error">{lastError}</p> : null}
      {waiting && !connected ? (
        <p className="slim-rack__hint slim-rack__hint--full">Waiting for OBS — open it anytime.</p>
      ) : null}
    </section>
  );
}
