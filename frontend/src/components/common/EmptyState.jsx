import { Inbox } from 'lucide-react'
import AppButton from './AppButton'
export default function EmptyState({ title = 'Nothing here yet', message, actionLabel, onAction }) { return <div className="empty card"><Inbox size={34}/><h3>{title}</h3>{message && <p className="muted">{message}</p>}{actionLabel && <AppButton onClick={onAction}>{actionLabel}</AppButton>}</div> }
