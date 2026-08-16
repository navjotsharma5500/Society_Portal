export default function AuthStatusMessage({message,tone='error'}){if(!message)return null;return <div className={`auth-status auth-status--${tone}`} role="status" aria-live="polite">{message}</div>}
