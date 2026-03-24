interface Props {
  error: string | null;
  onLogin: () => void;
}

export function LoginScreen({ error, onLogin }: Props) {
  return (
    <div className="center">
      <h1>Lokalit</h1>
      <p>Sign in to sync your Figma designs with Lokalit.</p>
      <button className="btn-primary" style={{ marginTop: 8 }} onClick={onLogin}>
        Sign in with NanoVibe SSO
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
