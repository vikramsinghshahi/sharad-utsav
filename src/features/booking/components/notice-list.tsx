import type { Notice } from "../state/types";

interface Props {
  notices: readonly Notice[];
  onDismiss: (id: string) => void;
}

// Explains what a cascade changed ("…so the adult day pass was removed"). Announced politely.
export function NoticeList({ notices, onDismiss }: Props) {
  return (
    <div aria-live="polite" className="space-y-2 empty:hidden">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`rise-in flex items-start gap-3 rounded-xl border p-3 text-sm ${
            notice.tone === "warning"
              ? "border-bright-gold/60 bg-bright-gold/10"
              : "border-line bg-surface"
          }`}
        >
          <span aria-hidden="true" className="mt-0.5 text-bright-gold">
            {notice.tone === "warning" ? "!" : "i"}
          </span>
          <p className="flex-1">{notice.text}</p>
          <button
            type="button"
            onClick={() => onDismiss(notice.id)}
            className="-m-1 rounded p-1 text-white/75 hover:text-white"
          >
            <span aria-hidden="true">✕</span>
            <span className="sr-only">Dismiss note</span>
          </button>
        </div>
      ))}
    </div>
  );
}
