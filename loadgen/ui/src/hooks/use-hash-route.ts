import { useSyncExternalStore } from "react";
import { routeFor } from "@/lib/projects";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

// The current route, read from location.hash; no router needed.
export const useHashRoute = () => routeFor(useSyncExternalStore(subscribe, () => window.location.hash));
