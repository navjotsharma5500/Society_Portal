import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  googleClientId,
  isGoogleAuthConfigured,
} from "../../../config/environment";

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_INIT_KEY = "__societyPortalGoogleIdentityClientId";

const GoogleIdentityContext = createContext({
  clientId: "",
  configured: false,
  ready: false,
  renderButton: () => {},
  setCredentialHandler: () => {},
});

let scriptPromise;
const activeCredentialHandlerRef = { current: null };

const loadGoogleScript = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return scriptPromise;
};

const ensureGoogleIdentityInitialized = () => {
  if (!isGoogleAuthConfigured || !window.google?.accounts?.id) return false;
  if (window[GOOGLE_INIT_KEY] === googleClientId) return true;
  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: (response) => {
      const handler = activeCredentialHandlerRef.current;
      if (response?.credential) handler?.onCredential?.(response.credential);
      else handler?.onError?.("GOOGLE_AUTH_FAILED");
    },
  });
  window[GOOGLE_INIT_KEY] = googleClientId;
  return true;
};

export const useGoogleIdentity = () => useContext(GoogleIdentityContext);

export default function GoogleAuthProviderBoundary({ children }) {
  const [ready, setReady] = useState(!isGoogleAuthConfigured);

  useEffect(() => {
    let active = true;
    if (!isGoogleAuthConfigured) return undefined;
    setReady(false);
    loadGoogleScript()
      .then(() => {
        if (!active) return;
        if (ensureGoogleIdentityInitialized()) setReady(true);
        else setReady(false);
      })
      .catch(() => active && setReady(false));
    return () => {
      active = false;
    };
  }, []);

  const setCredentialHandler = useCallback((handler) => {
    activeCredentialHandlerRef.current = handler;
    return () => {
      if (activeCredentialHandlerRef.current === handler) {
        activeCredentialHandlerRef.current = null;
      }
    };
  }, []);

  const renderButton = useCallback((container, options, handler) => {
    if (!container || !ready || !window.google?.accounts?.id) return;
    container.innerHTML = "";
    window.google.accounts.id.renderButton(container, {
      ...options,
      click_listener: () => {
        activeCredentialHandlerRef.current = handler;
      },
    });
  }, [ready]);

  const value = useMemo(
    () => ({
      clientId: googleClientId,
      configured: isGoogleAuthConfigured,
      ready,
      renderButton,
      setCredentialHandler,
    }),
    [ready, renderButton, setCredentialHandler]
  );

  return (
    <GoogleIdentityContext.Provider value={value}>
      {children}
    </GoogleIdentityContext.Provider>
  );
}
