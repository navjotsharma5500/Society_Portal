import apiClient from "../../../services/apiClient";
export const getSuperAdminSummary = () => apiClient.get("/admin/dashboard/summary").then((response) => response.data.data);
