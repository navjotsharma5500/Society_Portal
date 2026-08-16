const NEXT_ACTION_ROUTES=Object.freeze({PROFILE_ONBOARDING:'/student/onboarding',PROFILE_ONBOARDING_RESUME:'/student/onboarding',PROFILE_CHANGES_REQUESTED:'/student/onboarding',PROFILE_VERIFICATION_PENDING:'/student/verification',PROFILE_PARTIALLY_VERIFIED:'/student/verification',PROFILE_REJECTED:'/student/verification',DASHBOARD:'/student/dashboard',STUDENT_NO_ACTIVE_SOCIETY:'/student/dashboard',STAFF_DASHBOARD:'/portal',STAFF_NO_WORKSPACE:'/portal'})
export const resolveNextActionRoute=nextAction=>NEXT_ACTION_ROUTES[nextAction]||null
export {NEXT_ACTION_ROUTES}
