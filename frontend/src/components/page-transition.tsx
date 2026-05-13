"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayChildren, setDisplayChildren] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevPathname = useRef(pathname);

  const transition = useCallback(() => {
    if (!containerRef.current) {
      setDisplayChildren(children);
      return;
    }

    setIsTransitioning(true);

    // Short fade-out, then swap content and fade-in
    const timeout = setTimeout(() => {
      setDisplayChildren(children);
      setIsTransitioning(false);
    }, 120);

    return () => clearTimeout(timeout);
  }, [children]);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- trigger transition on route change
      transition();
    } else {
      setDisplayChildren(children);
    }
  }, [pathname, children, transition]);

  return (
    <div
      ref={containerRef}
      className={`transition-all duration-150 ease-out ${
        isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
      }`}
    >
      {displayChildren}
    </div>
  );
}
