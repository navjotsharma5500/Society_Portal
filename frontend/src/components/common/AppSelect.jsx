export default function AppSelect({ label, id, children, ...props }) {
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} className="select" {...props}>{children}</select></div>
}
