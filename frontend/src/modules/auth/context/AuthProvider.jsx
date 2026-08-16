import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./authContext";
import * as authApi from "../services/authApi";
import { realtimeClient } from "../../../services/realtimeClient";
import { REALTIME_EVENTS } from "../../../services/realtimeEvents";
const EMPTY = {
  user: null,
  student: null,
  onboarding: null,
  primaryDashboardRole: null,
  activeSocietyContexts: [],
  globalAssignments: [],
  societyAssignments: [],
  dashboardContexts: [],
  activeDashboardContext: null,
  permissions: [],
  uiCapabilities: null,
  membership: null,
};
const normalize = (data, previous = {}) => {
  const contexts =
      data?.dashboardContexts || data?.availableDashboardContexts || [],
    preferred =
      previous.activeDashboardContext &&
      contexts.find((x) => x.id === previous.activeDashboardContext.id),
    primaryId = data?.primaryDashboardRole?.assignmentId;
  return {
    ...EMPTY,
    user: data?.user || null,
    student: data?.student || null,
    onboarding: data?.onboarding || null,
    primaryDashboardRole: data?.primaryDashboardRole || null,
    activeSocietyContexts: data?.activeSocietyContexts || [],
    globalAssignments: data?.globalAssignments || [],
    societyAssignments: data?.societyAssignments || [],
    dashboardContexts: contexts,
    activeDashboardContext:
      preferred ||
      contexts.find((x) => String(x.assignmentId) === String(primaryId)) ||
      null,
    permissions: data?.effectivePermissions || data?.permissions || [],
    uiCapabilities: data?.globalUiCapabilities || data?.uiCapabilities || null,
    membership: data?.membership || null,
  };
};
export function AuthProvider({ children }) {
  const [state, setState] = useState(EMPTY),
    [authLoading, setAuthLoading] = useState(true),
    [contextLoading, setContextLoading] = useState(true),
    [accessDisabled, setAccessDisabled] = useState(false),
    version = useRef(0),
    signInFlight = useRef(null),
    authenticatedUserId = state.user?.id,
    clearAuth = useCallback(() => {
      version.current += 1;
      setState(EMPTY);
      setContextLoading(false);
    }, []),
    accept = useCallback((data, requestVersion) => {
      if (requestVersion !== undefined && requestVersion !== version.current)
        return data;
      setAccessDisabled(false);
      setState((current) => normalize(data, current));
      setAuthLoading(false);
      setContextLoading(false);
      if (data?.user?.accountType === "STUDENT" && import.meta.env.DEV)
        console.info({
          event: "STUDENT_CONTEXT_HYDRATED",
          contextCount: data.activeSocietyContexts?.length || 0,
          selectedSocietyId: data.activeSocietyContexts?.[0]?.societyId || null,
          source: "auth-me",
        });
      return data;
    }, []),
    loadCurrentUser = useCallback(async (options = {}) => {
      const requestVersion = ++version.current;
      setContextLoading(true);
      try {
        return accept(await authApi.getCurrentUser(options), requestVersion);
      } catch (error) {
        if (requestVersion !== version.current) return null;
        const code = error?.errorCode || error?.response?.data?.error?.code;
        if (
          [
            "LOGIN_ACCESS_DISABLED",
            "ACCOUNT_INACTIVE",
            "ACCOUNT_SUSPENDED",
            "STUDENT_RECORD_INACTIVE",
          ].includes(code)
        )
          setAccessDisabled(true);
        if (
          error?.response?.status === 401 ||
          error?.response?.status === 403
        ) {
          clearAuth();
          return null;
        }
        throw error;
      } finally {
        if (requestVersion === version.current) setContextLoading(false);
      }
    }, [accept, clearAuth]),
    refreshAuth = useCallback(async () => {
      await authApi.refreshSession();
      return loadCurrentUser();
    }, [loadCurrentUser]),
    runGoogleAuthentication = useCallback((operation) => {
      if (signInFlight.current) return signInFlight.current;
      const requestVersion = ++version.current;
      setContextLoading(true);
      const request = operation(requestVersion).finally(() => {
        if (signInFlight.current === request) signInFlight.current = null;
        if (version.current === requestVersion) setContextLoading(false);
      });
      signInFlight.current = request;
      return request;
    }, []),
    signUpWithGoogle = useCallback(
      (token) => runGoogleAuthentication(async (requestVersion) => {
        await authApi.signUpWithGoogle(token);
        return accept(await authApi.getCurrentUser({ fresh: true }), requestVersion);
      }),
      [accept, runGoogleAuthentication]
    ),
    signInWithGoogle = useCallback(
      (token) => runGoogleAuthentication(async (requestVersion) => {
        await authApi.signInWithGoogle(token);
        return accept(await authApi.getCurrentUser({ fresh: true }), requestVersion);
      }),
      [accept, runGoogleAuthentication]
    ),
    staffSignInWithGoogle = useCallback(
      (token) => runGoogleAuthentication(async (requestVersion) => accept(await authApi.staffSignInWithGoogle(token), requestVersion)),
      [accept, runGoogleAuthentication]
    ),
    setActiveDashboardContext = useCallback(
      (context) =>
        setState((current) => ({
          ...current,
          activeDashboardContext:
            current.dashboardContexts.find((x) => x.id === context?.id) || null,
        })),
      []
    ),
    logout = useCallback(async () => {
      try {
        await authApi.logoutSession();
      } finally {
        setAccessDisabled(false);
        clearAuth();
      }
    }, [clearAuth]);
  useEffect(() => {
    let active = true;
    const expired = () => {
      setAccessDisabled(false);
      clearAuth();
    };
    const disabled = () => {
      setAccessDisabled(true);
      clearAuth();
    };
    window.addEventListener("auth:session-expired", expired);
    window.addEventListener("auth:access-disabled", disabled);
    loadCurrentUser()
      .catch(() => clearAuth())
      .finally(() => active && setAuthLoading(false));
    return () => {
      active = false;
      window.removeEventListener("auth:session-expired", expired);
      window.removeEventListener("auth:access-disabled", disabled);
    };
  }, [loadCurrentUser, clearAuth]);
  useEffect(() => {
    realtimeClient.setAuthenticated(Boolean(authenticatedUserId));
    return () => realtimeClient.setAuthenticated(false);
  }, [authenticatedUserId]);
  useEffect(() => {
    let refreshPending = false;
    const refresh = () => {
      if (refreshPending) return;
      refreshPending = true;
      loadCurrentUser({ fresh: true }).catch(() => {}).finally(() => { refreshPending = false; });
    };
    const offContext = realtimeClient.subscribe(REALTIME_EVENTS.AUTH_CONTEXT_CHANGED, refresh);
    const offPermissions = realtimeClient.subscribe(REALTIME_EVENTS.PERMISSIONS_UPDATED, refresh);
    const offProfile = realtimeClient.subscribe(REALTIME_EVENTS.PROFILE_UPDATED, refresh);
    return () => { offContext(); offPermissions(); offProfile(); };
  }, [loadCurrentUser]);
  const value = useMemo(
    () => ({
      ...state,
      authLoading,
      authStatus: authLoading ? "INITIALIZING" : state.user ? "AUTHENTICATED" : "UNAUTHENTICATED",
      contextLoading,
      accessDisabled,
      isAuthenticated: Boolean(state.user),
      accountType: state.user?.accountType || null,
      isStudent: state.user?.accountType === "STUDENT",
      isStaff: Boolean(state.user && state.user.accountType !== "STUDENT"),
      signUpWithGoogle,
      signInWithGoogle,
      staffSignInWithGoogle,
      setActiveDashboardContext,
      loadCurrentUser,
      logout,
      refreshAuth,
      clearAuth,
    }),
    [
      state,
      authLoading,
      contextLoading,
      accessDisabled,
      signUpWithGoogle,
      signInWithGoogle,
      staffSignInWithGoogle,
      setActiveDashboardContext,
      loadCurrentUser,
      logout,
      refreshAuth,
      clearAuth,
    ]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
