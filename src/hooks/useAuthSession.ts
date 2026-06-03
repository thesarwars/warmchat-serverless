import { useSyncExternalStore } from "react";

import { getStoredAuthSession, subscribeToAuthSession } from "../utils/authSession";

export function useAuthSession() {
  return useSyncExternalStore(
    subscribeToAuthSession,
    getStoredAuthSession,
    getStoredAuthSession,
  );
}
