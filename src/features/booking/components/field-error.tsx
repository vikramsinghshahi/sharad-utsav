// The message under a field; the field points at it with aria-describedby.
export function FieldError({ id, messages }: { id: string; messages: readonly string[] }) {
  if (messages.length === 0) return null;
  return (
    <div id={id} className="mt-1.5 space-y-0.5 text-sm text-error-text">
      {messages.map((message) => (
        <p key={message} className="flex gap-1.5">
          <span aria-hidden="true" className="text-error">
            ●
          </span>
          {message}
        </p>
      ))}
    </div>
  );
}

export const errorIdFor = (fieldId: string) => `${fieldId}-error`;
