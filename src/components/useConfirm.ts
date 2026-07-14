import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Two-step confirm for destructive controls. The first `trigger()` "arms" the
 * button (returns `armed: true` so the caller can show a danger / confirm
 * state); a second `trigger()` within `timeoutMs` runs the action. If no second
 * click arrives the button auto-disarms, so a single stray click can never
 * destroy anything — every deletion takes a deliberate second step.
 */
export function useConfirm(action: () => void, timeoutMs = 3000) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  // Drop any pending disarm timer when the component unmounts.
  useEffect(() => clear, []);

  const trigger = useCallback(() => {
    if (armed) {
      clear();
      setArmed(false);
      action();
    } else {
      clear();
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), timeoutMs);
    }
  }, [armed, action, timeoutMs]);

  const cancel = useCallback(() => {
    clear();
    setArmed(false);
  }, []);

  return { armed, trigger, cancel };
}
