export const SOCIETIES_UPDATED_EVENT = 'society-portal:societies-updated'

export const notifySocietiesUpdated = () => {
  window.dispatchEvent(new CustomEvent(SOCIETIES_UPDATED_EVENT))
}

export const subscribeToSocietyUpdates = (listener) => {
  window.addEventListener(SOCIETIES_UPDATED_EVENT, listener)
  return () => window.removeEventListener(SOCIETIES_UPDATED_EVENT, listener)
}
