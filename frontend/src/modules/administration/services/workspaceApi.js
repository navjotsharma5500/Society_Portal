import apiClient from "../../../services/apiClient";

const data = (response) => response.data.data;
export const listAllEvents = async (params = {}) => data(await apiClient.get("/events", { params }));
export const getWorkspaceEvent = async (id) => data(await apiClient.get(`/events/${id}`)).event;
