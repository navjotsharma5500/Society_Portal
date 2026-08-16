import apiClient from "../../../services/apiClient";

const body = (response) => response.data.data;
export const listSocietyEvents = async (societyId, params = {}) =>
  body(await apiClient.get(`/events/society/${societyId}`, { params }));
export const getEvent = async (id) =>
  body(await apiClient.get(`/events/${id}`)).event;
export const createEvent = async (data) =>
  body(await apiClient.post("/events", data)).event;
export const updateEvent = async (id, data) =>
  body(await apiClient.patch(`/events/${id}`, data)).event;
export const submitEvent = async (id) =>
  body(await apiClient.post(`/events/${id}/submit`)).event;
export const getLiveEventRequestUsage = async (excludeEventId) => body(await apiClient.get("/events/live-request-usage", { params: { excludeEventId } }));
export const listAssignedEventReviews = async (params) =>
  body(await apiClient.get("/events/reviews/assigned-to-me", { params }));
export const eventReviewCounts = async (societyId) =>
  body(
    await apiClient.get("/events/reviews/assigned-counts", {
      params: { societyId },
    })
  ).counts;
export const getReviewEvent = async (id) =>
  body(await apiClient.get(`/events/reviews/event/${id}`)).event;
export const decideEventReview = async (id, decision, remarks, amendment) =>
  body(
    await apiClient.post(`/events/reviews/${id}/decision`, {
      decision,
      remarks,
      amendment,
    })
  );
export const amendEventReview = async (id, reason, proposal) =>
  body(
    await apiClient.post(`/events/reviews/${id}/amend`, { reason, proposal })
  );
export const saveEventBudgetReview = async (id, items) =>
  body(await apiClient.put(`/events/reviews/${id}/budget`, { items }));
