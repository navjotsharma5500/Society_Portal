export const EMPTY_STUDENT_PORTAL_DATA = {
  claims: [],
  summary: {},
  requests: [],
  memberships: [],
  societies: [],
};

export function createStudentPortalDataRequestCache({
  load,
  ttlMs = 1000,
  now = Date.now,
}) {
  const inFlight = new Map();
  const settled = new Map();

  return {
    request(key, { force = false } = {}) {
      if (!key) return Promise.resolve(EMPTY_STUDENT_PORTAL_DATA);

      const pending = inFlight.get(key);
      if (pending) return pending;

      const cached = settled.get(key);
      if (!force && cached && now() - cached.createdAt < ttlMs)
        return Promise.resolve(cached.value);

      const promise = Promise.resolve()
        .then(() => load(key))
        .then((value) => {
          settled.set(key, { value, createdAt: now() });
          return value;
        })
        .finally(() => {
          if (inFlight.get(key) === promise) inFlight.delete(key);
        });
      inFlight.set(key, promise);
      return promise;
    },
    clear(key) {
      if (key) settled.delete(key);
      else settled.clear();
    },
  };
}
