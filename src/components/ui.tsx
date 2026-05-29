import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, eyebrow }: { title: string; description: string; eyebrow?: string }) {
  return (
    <div className="mb-8">
      {eyebrow ? <p className="mb-2 text-sm font-medium uppercase tracking-[0.35em] text-yellow-300">{eyebrow}</p> : null}
      <h2 className="text-3xl font-bold text-white sm:text-5xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-slate-300">{description}</p>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-3xl border border-cyan-200/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30", className)}>{children}</section>;
}

export function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-cyan-200">{detail}</p> : null}
    </Card>
  );
}

export function Badge({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "gold" | "green" | "red" | "slate" }) {
  const tones = {
    cyan: "bg-cyan-400/10 text-cyan-200 border-cyan-300/20",
    gold: "bg-yellow-300/10 text-yellow-200 border-yellow-300/20",
    green: "bg-emerald-400/10 text-emerald-200 border-emerald-300/20",
    red: "bg-rose-400/10 text-rose-200 border-rose-300/20",
    slate: "bg-slate-400/10 text-slate-200 border-slate-300/20",
  };
  return <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}
