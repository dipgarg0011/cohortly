"use client";

import { useEffect, useState } from "react";

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 480);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <a
      href="#top"
      className="fixed bottom-5 right-4 z-20 rounded-full border border-teal-900/10 bg-white/95 px-3.5 py-2 text-xs font-semibold text-[var(--brand)] shadow-md backdrop-blur transition hover:bg-teal-50 hover:text-[var(--brand-dark)] sm:bottom-6 sm:right-6 sm:text-sm"
    >
      Top
    </a>
  );
}
