export default function AppButton({ variant, className = '', children, type = 'button', ...props }) {
  const resolvedVariant = variant ?? (type === 'submit' ? 'solidPrimary' : 'outlinePrimary')
  return <button type={type} className={`button button-${resolvedVariant} ${className}`} {...props}>{children}</button>
}
