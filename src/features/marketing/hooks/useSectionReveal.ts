import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Reveal-on-scroll for a container. Elements inside it carrying `[data-reveal]`
 * gain `data-revealed="true"` once the container scrolls into view, driving the
 * CSS transition defined in index.css. Honours prefers-reduced-motion (reveals
 * immediately, no transform). Uses a single IntersectionObserver per container
 * and disconnects after firing to keep scroll cost near zero.
 */
export function useSectionReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const targets = node.matches("[data-reveal]")
      ? [node, ...Array.from(node.querySelectorAll<HTMLElement>("[data-reveal]"))]
      : Array.from(node.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (targets.length === 0) return;

    if (reduced || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.setAttribute("data-revealed", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "true");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [reduced]);

  return ref;
}
