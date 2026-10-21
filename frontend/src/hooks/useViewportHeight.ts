import { useEffect, useState } from "react";

// Plain CSS 100dvh doesn't reliably shrink with the on-screen keyboard on Android Chrome —
// window.visualViewport does, so this measures that directly where available and falls back
// to window.innerHeight (effectively the same as 100dvh) everywhere else. Returns a live
// pixel height, re-measured on every visualViewport resize/scroll (the "scroll" event fires
// when the keyboard shifts the visible viewport's offset without changing its height, e.g.
// scrolling a focused input into view).
export function useViewportHeight(): number {
  const [height, setHeight] = useState<number>(() => window.visualViewport?.height ?? window.innerHeight);

  useEffect(() => {
    const vv = window.visualViewport;
    function measure() {
      setHeight(vv?.height ?? window.innerHeight);
    }
    measure();
    if (vv) {
      vv.addEventListener("resize", measure);
      vv.addEventListener("scroll", measure);
      return () => {
        vv.removeEventListener("resize", measure);
        vv.removeEventListener("scroll", measure);
      };
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return height;
}
