// Structured JSON logs (one line per event) so Vercel's log search can filter by field.
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function serializeError(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
}

function write(level: Level, message: string, fields: Fields = {}): void {
  const { error, ...rest } = fields;
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...rest,
    ...(error === undefined ? {} : { error: serializeError(error) }),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};
