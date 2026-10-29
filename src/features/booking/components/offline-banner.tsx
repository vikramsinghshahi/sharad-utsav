interface Props {
  online: boolean;
  requestFailed: boolean;
  onRetry: () => void;
}

// Shown when the browser is offline or a request got no answer (SPEC §9.3).
export function OfflineBanner({ online, requestFailed, onRetry }: Props) {
  if (online && !requestFailed) return null;
  return (
    <div
      role="status"
      className="no-print sticky top-0 z-30 border-b border-bright-gold/50 bg-cream px-4 py-2.5 text-sm"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <p>
          {online
            ? "We couldn't reach the booking server. Your selections are safe on this device."
            : "You're offline. Your selections are saved on this device; prices will update when you're back."}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-gold-ink px-3 py-1.5 font-medium text-gold-ink hover:bg-bright-gold hover:text-heading"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
