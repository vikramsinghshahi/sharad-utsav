// Shared class lists so every button, input and card in the flow looks and behaves the same.

export const card = "rounded-2xl border border-line bg-surface p-4 sm:p-5";

// Dark heading text on gold: white on gold fails contrast (≈2.6:1).
export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-heading transition-colors hover:bg-bright-gold active:translate-y-px disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/70";

export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong px-4 py-2 font-medium text-white transition-colors hover:border-bright-gold hover:text-bright-gold disabled:cursor-not-allowed disabled:opacity-60";

export const quietButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-bright-gold underline-offset-4 hover:underline disabled:opacity-60";

export const input =
  "block min-h-11 w-full rounded-xl border border-line-strong bg-white/5 px-3 py-2 text-base text-white placeholder:text-white/60 transition-colors hover:border-white/60 focus:border-bright-gold aria-[invalid=true]:border-error";

export const label = "mb-1.5 block text-sm font-medium text-white/90";

export const sectionTitle = "font-serif text-2xl font-semibold text-white";
