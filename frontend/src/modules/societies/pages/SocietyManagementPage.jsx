import { useCallback, useEffect, useState } from "react";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
import AppButton from "../../../components/common/AppButton";
import EmptyState from "../../../components/common/EmptyState";
import LoadingState from "../../../components/common/LoadingState";
import PageHeader from "../../../components/common/PageHeader";
import { useToast } from "../../../components/common/toastContext";
import { downloadTemplate } from "../../../services/societyImportApi";
import {
  listSocieties,
  updateSocietyStatus,
} from "../../../services/societyApi";
import AddSocietyModal from "../components/AddSocietyModal";
import ImportSocietiesModal from "../components/ImportSocietiesModal";
import SocietyCard from "../components/SocietyCard";
import SocietyFilters from "../components/SocietyFilters";
import SocietySummaryCards from "../components/SocietySummaryCards";
import SocietyTable from "../components/SocietyTable";
import {
  notifySocietiesUpdated,
  subscribeToSocietyUpdates,
} from "../../../utils/societyEvents";
const initial = {
  search: "",
  status: "",
  category: "",
  isActive: "",
  page: 1,
  limit: 20,
};
export default function SocietyManagementPage() {
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState({
    items: [],
    pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
  });
  const [counts, setCounts] = useState({ active: 0, inactive: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const { notify } = useToast();
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== ""),
      );
      const [result, active, inactive] = await Promise.all([
        listSocieties(params),
        listSocieties({ isActive: true, limit: 1 }),
        listSocieties({ isActive: false, limit: 1 }),
      ]);
      setData(result);
      setCounts({
        active: active.pagination.totalItems,
        inactive: inactive.pagination.totalItems,
      });
    } catch (e) {
      setError(e.readableMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => subscribeToSocietyUpdates(load), [load]);
  const status = async (s) => {
    try {
      await updateSocietyStatus(s._id, s.isActive ? "INACTIVE" : "ACTIVE");
      notify(`Society ${s.isActive ? "deactivated" : "activated"}`, "success");
      notifySocietiesUpdated();
    } catch (e) {
      notify(e.readableMessage, "error");
    }
  };
  const download = async () => {
    try {
      await downloadTemplate();
      notify("Template downloaded", "success");
    } catch (e) {
      notify(e.readableMessage, "error");
    }
  };
  return (
    <div className="page-stack">
      <PageHeader
        title="Society Management"
        subtitle="Manage societies, clubs, chapters and cells."
      />
      <SocietySummaryCards pagination={data.pagination} {...counts} />
      <div className="page-actions">
        <AppButton
          variant="outlinePrimary"
          onClick={() => {
            setEditing(null);
            setAddOpen(true);
          }}
        >
          <Plus size={18} />
          Add Society
        </AppButton>
        <AppButton variant="outlinePrimary" onClick={() => setImportOpen(true)}>
          <Upload size={18} />
          Upload Excel
        </AppButton>
        <AppButton variant="ghost" onClick={download}>
          <Download size={18} />
          Download Template
        </AppButton>
        <AppButton variant="ghost" onClick={load}>
          <RefreshCw size={18} />
          Refresh
        </AppButton>
      </div>
      <SocietyFilters filters={filters} onChange={setFilters} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <EmptyState
          title="Unable to load societies"
          message={error}
          actionLabel="Retry"
          onAction={load}
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="No societies found"
          message="Try adjusting the filters or add a Society."
          actionLabel="Add Society"
          onAction={() => setAddOpen(true)}
        />
      ) : (
        <>
          <div className="mobile-only society-list">
            {data.items.map((s) => (
              <SocietyCard
                key={s._id}
                society={s}
                onEdit={(item) => {
                  setEditing(item);
                  setAddOpen(true);
                }}
                onStatus={status}
              />
            ))}
          </div>
          <div className="desktop-only">
            <SocietyTable
              items={data.items}
              onEdit={(item) => {
                setEditing(item);
                setAddOpen(true);
              }}
              onStatus={status}
            />
          </div>
          <div className="pagination">
            <AppButton
              variant="ghost"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            >
              Previous
            </AppButton>
            <span>
              Page {data.pagination.page} of{" "}
              {Math.max(1, data.pagination.totalPages)}
            </span>
            <AppButton
              variant="ghost"
              disabled={filters.page >= data.pagination.totalPages}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              Next
            </AppButton>
          </div>
        </>
      )}
      <AddSocietyModal
        open={addOpen}
        society={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={notifySocietiesUpdated}
      />
      <ImportSocietiesModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImportCompleted={notifySocietiesUpdated}
      />
    </div>
  );
}
