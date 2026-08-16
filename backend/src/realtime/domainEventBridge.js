const domainEvents = require("../common/events/domainEvent.service");
const Assignment = require("../modules/userRoleAssignments/userRoleAssignment.model");
const publisher = require("./realtimePublisher");
const E = require("./realtimeEvents");
const map = (type) => {
  if (type.startsWith("SOCIETY_TEAM_")) return E.SOCIETY_TEAM_CHANGED;
  if (/^SOCIETY_(CREATED|UPDATED|STATUS_CHANGED|IMPORTED)$/.test(type)) return E.SOCIETY_UPDATED;
  if (type.startsWith("MEMBERSHIP_REQUEST_"))
    return type === "MEMBERSHIP_REQUEST_SUBMITTED"
      ? E.JOIN_REQUEST_CREATED
      : E.JOIN_REQUEST_UPDATED;
  if (type === "SOCIETY_MEMBERSHIP_CREATED") return E.MEMBERSHIP_CREATED;
  if (type.includes("MEMBERSHIP_ENDED")) return E.MEMBERSHIP_ENDED;
  if (type.startsWith("SOCIETY_MEMBERSHIP_")) return E.MEMBERSHIP_UPDATED;
  if (type.includes("CLAIM")) return E.CLAIM_VERIFICATION_UPDATED;
  if (["EVENT_SUBMITTED", "EVENT_RESUBMITTED"].includes(type))
    return E.EVENT_SUBMITTED;
  if (type.startsWith("EVENT_")) return E.EVENT_WORKFLOW_UPDATED;
  if (type.includes("PERMISSION") || type.includes("ROLE_ASSIGNMENT") || type === "ROLE_METADATA_UPDATED")
    return E.PERMISSIONS_UPDATED;
  if (type.includes("PROFILE") || type.startsWith("ONBOARDING_"))
    return E.PROFILE_UPDATED;
  if (type.startsWith("BUDGET_")) return E.BUDGET_UPDATED;
  if (type.startsWith("SOCIETY_LEADERSHIP_")) return E.PERMISSIONS_UPDATED;
  return null;
};
let unsubscribe;
const start = () => {
  if (unsubscribe) return;
  unsubscribe = domainEvents.subscribe("*", async (event) => {
    try {
      if (event.eventType === "AUTH_LOGOUT") return publisher.disconnectUser(event.userId, event.metadata?.sessionId);
      if (event.eventType === "AUTH_ALL_SESSIONS_REVOKED") return publisher.disconnectUser(event.userId);
      const eventName = map(event.eventType);
      if (!eventName) return;
      const metadata = event.metadata || {};
      let affectedByRole = [];
      if (event.eventType === "ROLE_PERMISSIONS_UPDATED" && metadata.roleId)
        affectedByRole = (
          await Assignment.find({
            roleId: metadata.roleId,
            status: "ACTIVE",
            isOngoing: true,
          }).distinct("userId")
        ).map(String);
      let affectedSocieties = [];
      if (event.eventType === "ROLE_METADATA_UPDATED" && metadata.roleId)
        affectedSocieties = (await Assignment.find({roleId:metadata.roleId,scopeType:"SOCIETY",status:"ACTIVE",isOngoing:true}).distinct("societyId")).filter(Boolean).map(String);
      if (/PROFILE/.test(event.eventType) && event.userId)
        affectedSocieties = (await Assignment.find({userId:event.userId,scopeType:"SOCIETY",status:"ACTIVE",isOngoing:true}).distinct("societyId")).filter(Boolean).map(String);
      if (event.eventType === "ROLE_ASSIGNMENT_UPDATED" && metadata.societyId) {
        const routing = require("../modules/verificationRouting/verificationRouting.service");
        await routing.reconcilePendingClaims({ societyIds: [metadata.societyId] });
      }
      const userIds = [
          event.userId,
          ...affectedByRole,
          ...(metadata.targetUserIds || []),
          metadata.assignedUserId,
          metadata.actorUserId,
        ].filter(Boolean),
        societyIds = [metadata.societyId,...affectedSocieties].filter(Boolean),
        payload = {
          sourceEvent: event.eventType,
          publicId: metadata.publicId,
          eventId: metadata.eventId,
          eventCode: metadata.eventCode,
          requestId: metadata.requestId,
          claimId: metadata.claimId,
          societyId: metadata.societyId,
          newStage: metadata.newStage || metadata.stage,
          version: metadata.version,
          changedAt: event.occurredAt,
        },
        shareWithSociety = /^(SOCIETY_|EVENT_|ROLE_ASSIGNMENT_)/.test(event.eventType);
      publisher.publish(eventName, {
        userIds,
        societyIds: shareWithSociety ? societyIds : [],
        roleTargets: eventName === E.BUDGET_UPDATED ? [{ roleCode: "SUPER_ADMIN" }] : [],
        payload,
      });
      if (/ROLE_ASSIGNMENT|ROLE_METADATA|SOCIETY_MEMBERSHIP|SOCIETY_LEADERSHIP|PROFILE/.test(event.eventType) && societyIds.length)
        publisher.publish(E.SOCIETY_TEAM_CHANGED, {
          userIds,
          societyIds,
          payload: { sourceEvent: event.eventType, societyId: metadata.societyId, changedAt: event.occurredAt },
        });
      if (
        /MEMBERSHIP|LEADERSHIP|ROLE_ASSIGNMENT|PERMISSION|CLAIM.*APPROVED/.test(
          event.eventType
        )
      )
        for (const userId of userIds) {
          await publisher.reconcileUser(userId);
          publisher.publish(E.AUTH_CONTEXT_CHANGED, {
            userIds: [userId],
            payload: { reason: event.eventType, changedAt: event.occurredAt },
          });
        }
      if (/REQUEST|CLAIM|EVENT/.test(event.eventType))
        publisher.publish(E.APPROVAL_QUEUE_CHANGED, {
          userIds: [
            ...(metadata.verificationTargetUserIds || []),
            ...(metadata.targetUserIds || []),
          ],
          payload: {
            reason: event.eventType,
            societyId: metadata.societyId,
            changedAt: event.occurredAt,
          },
        });
    } catch (error) {
      console.warn(`[realtime] domain bridge failed (${error.message})`);
    }
  });
};
module.exports = { start, map };
