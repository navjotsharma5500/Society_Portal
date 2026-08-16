/* eslint-disable react/only-export-components */
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import "./design-system.css";

export function Button({
  variant = "primary",
  loading = false,
  icon: Icon,
  children,
  className = "",
  ...props
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={`ds-button ds-button--${variant} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="ds-spin" size={16} />
      ) : (
        Icon && <Icon size={16} />
      )}{" "}
      {children}
    </motion.button>
  );
}
export const IconButton = ({ label, children, ...props }) => (
  <Button
    variant="ghost"
    className="ds-icon-button"
    aria-label={label}
    {...props}
  >
    {children}
  </Button>
);
const Field = ({ label, helper, error, id, children }) => (
  <label className="ds-field" htmlFor={id}>
    <span className="ds-label">{label}</span>
    {children}
    {(error || helper) && (
      <span className={`ds-helper ${error ? "is-error" : ""}`}>
        {error || helper}
      </span>
    )}
  </label>
);
export function Input({ label, helper, error, ...props }) {
  const id = useId();
  return (
    <Field {...{ label, helper, error, id }}>
      <input id={id} className="ds-control" aria-invalid={!!error} {...props} />
    </Field>
  );
}
export function Textarea({ label, helper, error, ...props }) {
  const id = useId();
  return (
    <Field {...{ label, helper, error, id }}>
      <textarea id={id} className="ds-control ds-textarea" {...props} />
    </Field>
  );
}
export function Select({ label, helper, error, options = [], ...props }) {
  const id = useId();
  return (
    <Field {...{ label, helper, error, id }}>
      <span className="ds-select-wrap">
        <select id={id} className="ds-control" {...props}>
          {options.map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>
              {o.label ?? o}
            </option>
          ))}
        </select>
        <ChevronDown size={15} />
      </span>
    </Field>
  );
}
export const SearchBox = (props) => (
  <div className="ds-search">
    <Search size={16} />
    <input aria-label="Search" placeholder="Search…" {...props} />
    {props.value && (
      <button
        aria-label="Clear search"
        onClick={() => props.onChange?.({ target: { value: "" } })}
      >
        <X size={14} />
      </button>
    )}
  </div>
);
export function Checkbox({ label, ...props }) {
  return (
    <label className="ds-check">
      <input type="checkbox" {...props} />
      <span>
        <Check size={12} />
      </span>
      {label}
    </label>
  );
}
export function Radio({ label, ...props }) {
  return (
    <label className="ds-check ds-radio">
      <input type="radio" {...props} />
      <span />
      {label}
    </label>
  );
}
export function Switch({ label, ...props }) {
  return (
    <label className="ds-switch">
      <input type="checkbox" role="switch" {...props} />
      <span className="ds-switch-track">
        <i />
      </span>
      {label}
    </label>
  );
}
export const Badge = ({ tone = "neutral", children }) => (
  <span className={`ds-badge ds-badge--${tone}`}>{children}</span>
);
export const StatusChip = ({ status }) => (
  <Badge
    tone={
      {
        active: "success",
        approved: "success",
        pending: "warning",
        inactive: "neutral",
        rejected: "danger",
      }[status.toLowerCase()] || "info"
    }
  >
    <i className="ds-dot" />
    {status}
  </Badge>
);
export function Avatar({ name = "", src, size = "md" }) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return src&&!failed ? (
    <img className={`ds-avatar ds-avatar--${size}`} src={src} alt={name} onError={()=>setFailed(true)} />
  ) : (
    <span className={`ds-avatar ds-avatar--${size}`} aria-label={name}>
      {name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export const Tooltip = ({ content, children }) => (
  <span className="ds-tooltip" tabIndex={0}>
    {children}
    <span role="tooltip">{content}</span>
  </span>
);
export function Dropdown({ label = "Actions", items = [] }) {
  const [open, setOpen] = useState(false);
  const triggerRef=useRef(null),menuRef=useRef(null),[position,setPosition]=useState({top:0,left:0,minWidth:160});
  const close=()=>{setOpen(false);requestAnimationFrame(()=>triggerRef.current?.focus())};
  useLayoutEffect(()=>{if(!open)return;const place=()=>{const trigger=triggerRef.current,menu=menuRef.current;if(!trigger||!menu)return;const r=trigger.getBoundingClientRect(),height=menu.offsetHeight,width=Math.max(160,menu.offsetWidth),spaceBelow=window.innerHeight-r.bottom,top=spaceBelow>=height+8?r.bottom+6:Math.max(8,r.top-height-6),left=Math.min(window.innerWidth-width-8,Math.max(8,r.right-width));setPosition({top,left,minWidth:width})};place();const outside=e=>{if(!triggerRef.current?.contains(e.target)&&!menuRef.current?.contains(e.target))close()},key=e=>e.key==="Escape"&&close();document.addEventListener("pointerdown",outside);document.addEventListener("keydown",key);window.addEventListener("resize",place);window.addEventListener("scroll",place,true);return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",key);window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true)}},[open]);
  return (
    <div className="ds-dropdown">
      <Button ref={triggerRef} variant="outline" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
        <ChevronDown size={14} />
      </Button>
      {createPortal(<AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            className="ds-dropdown-menu"
            role="menu"
            style={position}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {items.map((x, i) => (
              <button
                key={i}
                onClick={() => {
                  x.onClick?.();
                  close();
                }}
              >
                {x.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>,document.body)}
    </div>
  );
}
export function Breadcrumb({ items = [] }) {
  return (
    <nav className="ds-breadcrumb" aria-label="Breadcrumb">
      {items.map((x, i) => (
        <span key={x.label}>
          {i > 0 && <ChevronRight size={13} />}{" "}
          {x.href ? (
            <a href={x.href}>{x.label}</a>
          ) : (
            <b aria-current="page">{x.label}</b>
          )}
        </span>
      ))}
    </nav>
  );
}
export const Card = ({
  title,
  description,
  actions,
  children,
  className = "",
}) => (
  <section className={`ds-card ${className}`}>
    {(title || actions) && (
      <header>
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {actions}
      </header>
    )}
    <div>{children}</div>
  </section>
);
export const StatCard = ({ label, value, change, icon: Icon }) => (
  <Card className="ds-stat">
    <span className="ds-stat-icon">{Icon && <Icon size={18} />}</span>
    <strong>{value}</strong>
    <span>{label}</span>
    {change && <small>{change}</small>}
  </Card>
);
export const PageContainer = ({ children }) => (
  <div className="ds-page-container">{children}</div>
);
export const PageHeader = ({
  title,
  description,
  eyebrow,
  actions,
  breadcrumb,
}) => (
  <div className="ds-page-header">
    {breadcrumb}
    <div>
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <aside>{actions}</aside>}
    </div>
  </div>
);
export const Spinner = ({ label = "Loading" }) => (
  <span className="ds-spinner" role="status">
    <LoaderCircle className="ds-spin" />
    <span className="ds-sr-only">{label}</span>
  </span>
);
export const Skeleton = ({ lines = 3 }) => (
  <div className="ds-skeleton" aria-label="Loading content">
    {Array.from({ length: lines }, (_, i) => (
      <i key={i} />
    ))}
  </div>
);
export const LoadingSpinner = Spinner;
export const SkeletonLoader = Skeleton;
export const EmptyState = ({
  icon: Icon = Info,
  title = "Nothing here yet",
  description,
  action,
}) => (
  <div className="ds-empty">
    <span>{<Icon size={22} />}</span>
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action}
  </div>
);
export function Pagination({ page = 1, totalPages = 1, onChange = () => {} }) {
  return (
    <nav className="ds-pagination" aria-label="Pagination">
      <IconButton
        label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
      </IconButton>
      <span>
        Page <b>{page}</b> of {totalPages}
      </span>
      <IconButton
        label="Next page"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={16} />
      </IconButton>
    </nav>
  );
}
export function Table({
  columns = [],
  rows = [],
  loading = false,
  emptyTitle = "No records found",
  selectable = false,
  selected = [],
  onSelectionChange = () => {},
  sort,
  onSort,
}) {
  const all = rows.length > 0 && rows.every((x) => selected.includes(x.id));
  const toggleAll = () => onSelectionChange(all ? [] : rows.map((x) => x.id));
  return (
    <div className="ds-table-shell">
      {loading ? (
        <Skeleton lines={5} />
      ) : rows.length ? (
        <div className="ds-table-scroll">
          <table className="ds-table">
            <thead>
              <tr>
                {selectable && (
                  <th>
                    <Checkbox
                      aria-label="Select all"
                      checked={all}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c.key}>
                    <button
                      disabled={!c.sortable}
                      onClick={() => onSort?.(c.key)}
                    >
                      {c.label}
                      {sort?.key === c.key
                        ? sort.direction === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {selectable && (
                    <td>
                      <Checkbox
                        aria-label={`Select ${row.id}`}
                        checked={selected.includes(row.id)}
                        onChange={() =>
                          onSelectionChange(
                            selected.includes(row.id)
                              ? selected.filter((x) => x !== row.id)
                              : [...selected, row.id]
                          )
                        }
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key}>
                      {c.render ? c.render(row[c.key], row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={emptyTitle}
          description="Try changing your search or filters."
        />
      )}
    </div>
  );
}
export function Modal({ open, onClose, size = "md", title, children, footer }) {
  useEffect(() => {
    const fn = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ds-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`ds-modal ds-modal--${size}`}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <header>
              <h3>{title}</h3>
              <IconButton label="Close" onClick={onClose}>
                <X size={17} />
              </IconButton>
            </header>
            <div className="ds-modal-body">{children}</div>
            {footer && <footer>{footer}</footer>}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
export const Drawer = ({ open, onClose, title, children }) => (
  <AnimatePresence>
    {open && (
      <div className="ds-overlay">
        <motion.aside
          className="ds-drawer"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
        >
          <header>
            <h3>{title}</h3>
            <IconButton label="Close" onClick={onClose}>
              <X />
            </IconButton>
          </header>
          {children}
        </motion.aside>
      </div>
    )}
  </AnimatePresence>
);
export const ConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  title = "Confirm action",
  description,
  confirmLabel = "Confirm",
  danger = false,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    size="sm"
    title={title}
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <p>{description}</p>
  </Modal>
);
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = (message, tone = "info") => {
    const id = Date.now();
    setToasts((x) => [...x, { id, message, tone }]);
    setTimeout(() => setToasts((x) => x.filter((t) => t.id !== id)), 3200);
  };
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="ds-toasts" aria-live="polite">
        {toasts.map((t) => (
          <motion.div
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            key={t.id}
            className={`ds-toast ds-toast--${t.tone}`}
          >
            {t.message}
          </motion.div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useDesignToast = () => useContext(ToastContext);
export const Toast = ({ message, tone = "info" }) => (
  <div className={`ds-toast ds-toast--${tone}`} role="status">
    {message}
  </div>
);
