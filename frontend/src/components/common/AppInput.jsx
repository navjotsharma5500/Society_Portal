export default function AppInput({ label, id, className = '', ...props }) {
  return <div className={`field ${className}`}><label htmlFor={id}>{label}</label><input id={id} className="input" {...props} /></div>
}
