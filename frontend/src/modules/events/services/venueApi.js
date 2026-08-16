import apiClient from "../../../services/apiClient";
export const listAvailableVenues = async () => (await apiClient.get("/infrastructure/venues/lookup")).data.data.items;
