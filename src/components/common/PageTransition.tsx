import { useEffect, useRef, type ReactNode } from "react";
import type { Location } from "react-router-dom";
import { getAuthState } from "@/lib/authStore";
import { readPageState, writePageState } from "@/lib/pageStateCache";

/**
 * PageTransition — wraps route content.
 *
 * It deliberately does NOT re-key or animate the route container. Re-keying
 * unmounted and rebuilt the whole page on every section change, and the
 * container-level fade replayed on top of it — together they read as a full
 * browser refresh on every navigation. Navigation is now a plain swap; pages
 * keep their own local animations.
 */
const PageTransition = ({
  children,
  location,
}: {
  children: ReactNode;
  location?: Location;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current, path = location?.pathname;
    const owner = getAuthState().userId;
    if (!root || !path || location?.search || !owner) return;
    const scroller = root.querySelector<HTMLElement>(".ceyo-scroll, .gx-apps-scroll, .hub-home-scroll");
    if (!scroller) return;
    const cached = readPageState(owner, path);
    const frame = requestAnimationFrame(() => { if (cached?.scrollTop) scroller.scrollTop = cached.scrollTop; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => { if (getAuthState().userId === owner) writePageState(owner, path, { ...readPageState(owner, path), scrollTop: scroller.scrollTop }); };
    const onScroll = () => { clearTimeout(timer); timer = setTimeout(save, 200); };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); scroller.removeEventListener("scroll", onScroll); save(); };
  }, [location?.pathname, location?.search]);
  return <div ref={ref} className="min-h-dvh">{children}</div>;
};

export default PageTransition;
