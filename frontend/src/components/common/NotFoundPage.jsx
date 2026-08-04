import { Link } from 'react-router-dom'
export default function NotFoundPage(){return <main className="main-content"><div className="empty card"><p className="muted">404</p><h1>Page not found</h1><p>The page you requested is not part of the TIET Society Portal.</p><Link className="button button-primary" to="/admin">Return to dashboard</Link></div></main>}
