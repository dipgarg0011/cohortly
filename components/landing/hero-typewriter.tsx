"use client";

import { useEffect, useState } from "react";

export type HeroExample = {
  ask: string;
  reply: string;
};

const DEFAULT_EXAMPLES: HeroExample[] = [
  {
    ask: "Anyone from ECE working at Qualcomm?",
    reply: "Rohan · Batch of 2021 — replied in 3 hours",
  },
  {
    ask: "Need a mock interview for Amazon SDE — anyone free this week?",
    reply: "Ananya · Batch of 2020 — replied in 47 minutes",
  },
  {
    ask: "Is the McKinsey summer analyst process worth the prep?",
    reply: "Kabir · Batch of 2019 — replied in 2 hours",
  },
];

type Phase = "typing" | "holding" | "revealing" | "showing" | "clearing";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function HeroTypewriter({
  examples = DEFAULT_EXAMPLES,
}: {
  examples?: HeroExample[];
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [phase, setPhase] = useState<Phase>("typing");

  const current = examples[index] ?? examples[0];

  useEffect(() => {
    if (reducedMotion) return;

    const example = examples[index] ?? examples[0];
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (typed.length < example.ask.length) {
        timer = setTimeout(() => {
          setTyped(example.ask.slice(0, typed.length + 1));
        }, 28 + (typed.endsWith(" ") ? 40 : 0));
      } else {
        timer = setTimeout(() => setPhase("holding"), 420);
      }
    } else if (phase === "holding") {
      timer = setTimeout(() => {
        setShowReply(true);
        setPhase("revealing");
      }, 280);
    } else if (phase === "revealing") {
      timer = setTimeout(() => setPhase("showing"), 80);
    } else if (phase === "showing") {
      timer = setTimeout(() => setPhase("clearing"), 3200);
    } else if (phase === "clearing") {
      timer = setTimeout(() => {
        setShowReply(false);
        setTyped("");
        setIndex((i) => (i + 1) % examples.length);
        setPhase("typing");
      }, 380);
    }

    return () => clearTimeout(timer);
  }, [phase, typed, index, examples, reducedMotion]);

  if (reducedMotion) {
    const staticExample = examples[0];
    return (
      <div
        className="mx-auto mt-8 w-full min-w-0 max-w-lg text-left"
        aria-live="polite"
      >
        <p className="font-[family-name:var(--font-display)] text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl">
          “{staticExample.ask}”
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--brand)] sm:text-[0.95rem]">
          {staticExample.reply}
        </p>
      </div>
    );
  }

  return (
    <div
      className="mx-auto mt-8 w-full min-w-0 max-w-lg text-left"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="min-h-[3.25rem] font-[family-name:var(--font-display)] text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:min-h-[3.5rem] sm:text-xl">
        <span className="text-slate-400" aria-hidden>
          “
        </span>
        {typed}
        <span
          className={`ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.12em] bg-[var(--brand)] align-baseline ${
            phase === "showing" || phase === "clearing"
              ? "opacity-0"
              : "animate-pulse"
          }`}
          aria-hidden
        />
        {typed.length === current.ask.length ? (
          <span className="text-slate-400" aria-hidden>
            ”
          </span>
        ) : null}
      </p>
      <p
        className={`mt-3 text-sm font-medium text-[var(--brand)] transition-all duration-300 sm:text-[0.95rem] ${
          showReply
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        {current.reply}
      </p>
    </div>
  );
}
