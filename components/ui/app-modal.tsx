"use client";

import {
  useEffect,
  useId,
  useState,
  type ReactNode,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Wider sheet on desktop (default ~480px) */
  maxWidthClass?: string;
  labelledBy?: string;
  /** Show header close (X). Default true. */
  showClose?: boolean;
};

/**
 * Portal-based modal: full-screen overlay, body scroll lock, Esc + overlay close.
 * Mobile (<640px): bottom sheet. Desktop: centered panel.
 */
export function AppModal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = "sm:max-w-[480px]",
  labelledBy,
  showClose = true,
}: Props) {
  const autoTitleId = useId();
  const titleId = labelledBy ?? autoTitleId;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  function onOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onOverlayClick}
    >
      <div
        className={`app-modal-sheet flex max-h-[min(92dvh,42rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-teal-900/10 bg-white shadow-2xl shadow-slate-900/20 sm:rounded-2xl ${maxWidthClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden"
          aria-hidden
        />
        <div className="min-w-0 shrink-0 border-b border-slate-100 px-4 pb-3 pt-2 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 items-start gap-3">
            <h2
              id={titleId}
              className="min-w-0 flex-1 font-[family-name:var(--font-display)] text-lg font-bold text-slate-900 sm:text-xl"
            >
              {title}
            </h2>
            {showClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            ) : null}
          </div>
          {description ? (
            <div className="mt-1.5 min-w-0 text-sm text-slate-600">
              {description}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:pb-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
