import { CircleCheck, LogIn, UsersRound } from "lucide-react";
import { StatCard } from "../../../design-system";
import { useToast } from "../../../components/common/toastContext";
import ExistingRecordsUpdate from "./ExistingRecordsUpdate";
export default function StudentSummaryCards({ pagination, items }) {
  const { notify } = useToast(), active = items.filter((item) => item.recordStatus === "ACTIVE").length, login = items.filter((item) => item.isLoginAllowed).length;
  return <><div className="student-header-actions"><b>Update Existing Records</b><ExistingRecordsUpdate type="student" notify={notify} onCompleted={() => window.location.reload()} /></div><div className="student-summary-grid"><StatCard icon={UsersRound} label="Total Students" value={pagination.totalItems} /><StatCard icon={CircleCheck} label="Active on this page" value={active} /><StatCard icon={LogIn} label="Login allowed on this page" value={login} /></div></>;
}
