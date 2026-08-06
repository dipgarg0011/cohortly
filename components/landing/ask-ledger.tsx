"use client";

import { useEffect, useRef, useState } from "react";

export type LedgerEntry = {
  ask: string;
  name: string;
  batchYear: number;
  department: string;
  answeredIn: string;
};

export const LEDGER_ENTRIES: LedgerEntry[] = [
  {
    ask: "Anyone who interned at Texas Instruments last summer — what did the interview loop look like?",
    name: "Meera",
    batchYear: 2021,
    department: "ECE",
    answeredIn: "answered in 2h",
  },
  {
    ask: "Looking for a resume review before applying to product roles at Flipkart.",
    name: "Arjun",
    batchYear: 2020,
    department: "CSE",
    answeredIn: "answered in 55m",
  },
  {
    ask: "Is Bain's case prep club worth joining in third year, or better to grind cases solo?",
    name: "Sara",
    batchYear: 2019,
    department: "Economics",
    answeredIn: "answered in 4h",
  },
  {
    ask: "Referral ask: open SWE new-grad at Adobe — happy to share portfolio first.",
    name: "Nikhil",
    batchYear: 2018,
    department: "IT",
    answeredIn: "answered in 1h",
  },
  {
    ask: "Heard there's a research assistant opening under Prof. Iyer — anyone apply recently?",
    name: "Priya",
    batchYear: 2022,
    department: "Mech",
    answeredIn: "answered in 6h",
  },
  {
    ask: "Mock interview for system design (mid-level) — free this weekend?",
    name: "Dev",
    batchYear: 2017,
    department: "CSE",
    answeredIn: "answered in 3h",
  },
  {
    ask: "Honest take: how intense is the Deloitte Analyst first year, really?",
    name: "Isha",
    batchYear: 2020,
    department: "Chemical",
    answeredIn: "answered in 5h",
  },
  {
    ask: "Campus hiring at Schneider Electric — what do they care about beyond CGPA?",
    name: "Rahul",
    batchYear: 2021,
    department: "EEE",
    answeredIn: "answered in 90m",
  },
  {
    ask: "Anyone transition from core Mech into UX research? Would love 20 minutes of advice.",
    name: "Aisha",
    batchYear: 2019,
    department: "Design",
    answeredIn: "answered in 8h",
  },
  {
    ask: "Shared opp: unpaid but strong ML lab internship this semester — DM if interested.",
    name: "Varun",
    batchYear: 2022,
    department: "CSE",
    answeredIn: "answered in 40m",
  },
];

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

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  return (
    <article className="grid min-w-0 grid-cols-1 gap-3 border-t border-teal-900/10 py-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:gap-8 sm:py-6">
      <p className="min-w-0 text-[0.95rem] leading-relaxed text-slate-800 sm:text-base">
        {entry.ask}
      </p>
      <div className="min-w-0 text-sm leading-relaxed text-[var(--muted)] sm:text-right">
        <p className="font-medium text-slate-700">
          {entry.name}
          <span className="font-normal text-[var(--muted)]">
            {" "}
            · {entry.department}
          </span>
        </p>
        <p className="mt-0.5">
          <span className="font-semibold text-[var(--brand)]">
            Batch of {entry.batchYear}
          </span>
          <span className="text-slate-400"> · </span>
          <span>{entry.answeredIn}</span>
        </p>
      </div>
    </article>
  );
}

export function AskLedger({
  entries = LEDGER_ENTRIES,
}: {
  entries?: LedgerEntry[];
}) {
  const reducedMotion = usePrefersReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (reducedMotion) return;

    const el = scrollerRef.current;
    if (!el) return;

    let frame = 0;
    let last = performance.now();
    const speed = 22; // px per second

    const tick = (now: number) => {
      const dt = Math.min(48, now - last) / 1000;
      last = now;

      if (!pausedRef.current) {
        const half = el.scrollHeight / 2;
        offsetRef.current += speed * dt;
        if (offsetRef.current >= half) {
          offsetRef.current -= half;
        }
        el.scrollTop = offsetRef.current;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, entries]);

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  if (reducedMotion) {
    return (
      <div className="mt-8">
        <div className="max-h-[28rem] overflow-y-auto rounded-none border-y border-teal-900/10">
          {entries.map((entry) => (
            <LedgerRow key={`${entry.ask}-${entry.name}`} entry={entry} />
          ))}
        </div>
        <p className="mt-4 text-center text-xs font-medium text-slate-400">
          Illustrative examples — not real member data.
        </p>
      </div>
    );
  }

  const loop = [...entries, ...entries];

  return (
    <div className="mt-8">
      <div
        ref={scrollerRef}
        tabIndex={0}
        className="max-h-[28rem] overflow-hidden rounded-none border-y border-teal-900/10 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={resume}
        aria-label="Illustrative asks and answers scrolling register"
      >
        <div>
          {loop.map((entry, i) => (
            <LedgerRow key={`${entry.ask}-${entry.name}-${i}`} entry={entry} />
          ))}
        </div>
      </div>
      <p className="mt-4 text-center text-xs font-medium text-slate-400">
        Illustrative examples — not real member data.
      </p>
    </div>
  );
}
