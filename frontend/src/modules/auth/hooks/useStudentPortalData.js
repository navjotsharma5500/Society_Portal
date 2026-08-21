import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOnboardingProgress,
  listActiveSocieties,
  listMyMembershipRequests,
  listMyMemberships,
} from "../../onboarding/services/onboardingApi";
import { useAuth } from "./useAuth";
import {
  createStudentPortalDataRequestCache,
  EMPTY_STUDENT_PORTAL_DATA,
} from "./studentPortalDataRequest";

const portalDataRequests = createStudentPortalDataRequestCache({
  load: async () => {
    const [progress, requests, memberships, societies] = await Promise.all([
      getOnboardingProgress(),
      listMyMembershipRequests(),
      listMyMemberships(),
      listActiveSocieties(),
    ]);
    return {
      claims: progress.claims || [],
      summary: progress.summary || {},
      requests: requests.items || [],
      memberships: memberships.items || [],
      societies: societies.items || societies.societies || [],
    };
  },
});

export function useStudentPortalData({ enabled = true } = {}) {
  const auth = useAuth();
  const userId = auth.user?.id;
  const authReady =
    enabled &&
    !auth.authLoading &&
    !auth.contextLoading &&
    Boolean(userId);
  const [data, setData] = useState(EMPTY_STUDENT_PORTAL_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  const run = useCallback(
    async (force = false) => {
      if (!authReady) {
        setLoading(false);
        return null;
      }
      const requestGeneration = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const result = await portalDataRequests.request(userId, { force });
        if (requestGeneration === generation.current) setData(result);
        return result;
      } catch (requestError) {
        if (requestGeneration === generation.current)
          setError(
            requestError.readableMessage ||
              "Unable to load Student portal data. Please try again."
          );
        return null;
      } finally {
        if (requestGeneration === generation.current) setLoading(false);
      }
    },
    [authReady, userId]
  );

  useEffect(() => {
    if (!authReady) {
      generation.current += 1;
      setData(EMPTY_STUDENT_PORTAL_DATA);
      setError("");
      setLoading(false);
      return undefined;
    }
    run();
    return () => {
      generation.current += 1;
    };
  }, [authReady, run]);

  const refresh = useCallback(() => run(true), [run]);
  return { ...data, loading, error, refresh };
}
