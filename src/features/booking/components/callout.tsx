import type { ReactNode } from "react";

type Tone = "info" | "warning" | "error" | "success";

const TONES: Record<Tone, string> = {
  info: "border-line bg-surface",
  warning: "border-bright-gold/60 bg-bright-gold/10",
  error: "border-error bg-error/10",
  success: "border-success bg-success/10",
};

// A bordered message block for hints, warnings and results.
export function Callout({
  tone = "info",
  children,
  role,
}: {
  tone?: Tone;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className={`rounded-xl border p-3 text-sm ${TONES[tone]}`}>
      {children}
    </div>
  );
}
