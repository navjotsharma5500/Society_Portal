import apiClient from "../../../services/apiClient";
const data = (response) => response.data.data;
export const getOwnProfile = async () => data(await apiClient.get("/profile/me")).profile;
export const updateSocialLinks = async (payload) => data(await apiClient.patch("/profile/me", payload)).profile;
export const uploadProfilePhoto = async (file) => { const body = new FormData(); body.append("photo", file); return data(await apiClient.post("/profile/me/photo", body)); };
