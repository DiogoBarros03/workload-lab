import { useEffect, useSyncExternalStore } from "react";
import { routeFor } from "@/lib/projects";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

// The current route, read from location.hash; no router needed.
export const useHashRoute = () => {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  // Hash routing keeps scroll; a new page starts at its top, instantly.
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [hash]);
  return routeFor(hash);
};
