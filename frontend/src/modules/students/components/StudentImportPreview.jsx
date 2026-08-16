import { useState } from "react";
import { Badge, Button, Table } from "../../../design-system";
const filters = ["ALL", "VALID", "EXISTING", "DUPLICATE_IN_FILE", "IDENTITY_CONFLICT", "INVALID"];
const matches = (row, filter) => filter === "ALL" || row.classification === filter;
export default function StudentImportPreview({ preview }) {
  const [filter, setFilter] = useState("ALL"), rows = preview.rows.filter((row) => matches(row, filter));
  const columns = [
    { key: "rowNumber", label: "Row" }, { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "contactNumber", label: "Contact" }, { key: "rollNumber", label: "Roll" },
    { key: "classification", label: "Classification", render: (value) => <Badge tone={value === "VALID" ? "success" : value === "EXISTING" ? "info" : "warning"}>{value}</Badge> },
    { key: "issues", label: "Reasons", render: (_, row) => [...(row.warnings || []), ...(row.errors || [])].join(", ") || "None" },
  ];
  return <div className="student-import-preview"><div className="import-filter-row">{filters.map((item) => <Button key={item} variant={filter === item ? "secondary" : "ghost"} onClick={() => setFilter(item)}>{item.replaceAll("_", " ")}</Button>)}</div><div className="desktop-only"><Table columns={columns} rows={rows.map((row) => ({ ...row, id: String(row.rowNumber) }))} /></div><div className="mobile-only import-mobile-list">{rows.map((row) => <article key={row.rowNumber}><div><b>Row {row.rowNumber} · {row.name || "Unnamed"}</b><Badge tone={row.classification === "VALID" ? "success" : "warning"}>{row.classification}</Badge></div><p>{row.email || "No email"} · {row.rollNumber || "No roll number"}</p><small>{[...(row.warnings || []), ...(row.errors || [])].join(", ") || "No issues"}</small></article>)}</div></div>;
}
