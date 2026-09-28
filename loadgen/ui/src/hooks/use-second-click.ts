import { useState } from "react";

// Risky runs ask for a second click, inline, no modal.
export function useSecondClick(risky: boolean, onRun: () => void) {
  const [warned, setWarned] = useState(false);
  const click = () => {
    if (risky && !warned) return setWarned(true);
    setWarned(false);
    onRun();
  };
  return { warned, click };
}
