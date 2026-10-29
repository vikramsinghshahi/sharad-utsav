// Shared class lists so every button, input and card in the flow looks and behaves the same.

export const card = "rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5";

// Dark heading text on gold: white on gold fails contrast (≈2.6:1).
export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-heading transition-colors hover:bg-bright-gold active:translate-y-px disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/70";

export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong px-4 py-2 font-medium text-ink transition-colors hover:border-gold-ink hover:text-gold-ink disabled:cursor-not-allowed disabled:opacity-60";

export const quietButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-gold-ink underline-offset-4 hover:underline disabled:opacity-60";

export const input =
  "block min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink/70 transition-colors hover:border-ink/60 focus:border-gold-ink aria-[invalid=true]:border-error";

export const label = "mb-1.5 block text-sm font-medium text-ink/90";

export const sectionTitle = "font-serif text-2xl font-semibold text-ink";
