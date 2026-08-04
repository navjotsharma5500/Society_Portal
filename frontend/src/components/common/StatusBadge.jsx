export default function StatusBadge({ status }) {
  const active = status === 'ACTIVE' || status === true
  return <span className={`badge badge-${active ? 'active' : 'inactive'}`}>{active ? 'Active' : 'Inactive'}</span>
}
