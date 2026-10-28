import { z } from "zod";
import { STEPS, type PersistedState } from "./types";

// The draft survives a refresh (sessionStorage). Storage can be full, disabled
// or hold an old shape, so every access is guarded and the data is re-validated.

const VERSION = 1;
const keyFor = (slug: string) => `sharad-utsav:booking:v${VERSION}:${slug}`;

const text = z.string().max(200);
const dates = z.array(text).max(31);

const entrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("day_pass"), productId: text, dates }),
  z.object({ kind: z.literal("all_days"), productId: text }),
  z.object({ kind: z.literal("family_pass") }),
]);

const persistedSchema = z.object({
  step: z.enum(STEPS),
  attendees: z
    .array(
      z.object({
        clientId: text,
        firstName: text,
        lastName: text,
        dateOfBirth: text,
        entry: entrySchema,
      }),
    )
    .max(50),
  familyGroups: z
    .array(z.object({ id: text, productId: text, date: text, attendeeClientIds: z.array(text) }))
    .max(50),
  attendeeExtras: z.array(z.object({ productId: text, attendeeClientId: text, dates })).max(200),
  bookingExtras: z.array(z.object({ productId: text, quantity: z.number().int().min(0) })).max(20),
  promoCode: text,
  booker: z.object({
    firstName: text,
    lastName: text,
    email: text,
    phone: text,
    dateOfBirth: text,
    isAttending: z.boolean(),
  }),
  createAttempt: z.object({ key: text, fingerprint: z.string() }).nullable(),
  payAttempt: z
    .object({
      key: text,
      outcome: z.enum(["succeed", "decline"]),
      awaitingRetry: z.boolean(),
    })
    .nullable(),
  hold: z
    .object({
      bookingId: text,
      accessToken: text,
      holdExpiresAt: text,
      totalCents: z.number().int().min(0),
      reviewedTotalCents: z.number().int().min(0).nullable(),
    })
    .nullable(),
}) satisfies z.ZodType<PersistedState>;

export function loadDraft(slug: string): PersistedState | null {
  try {
    const raw = window.sessionStorage.getItem(keyFor(slug));
    if (raw === null) return null;
    const parsed = persistedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveDraft(slug: string, state: PersistedState): void {
  try {
    window.sessionStorage.setItem(keyFor(slug), JSON.stringify(state));
  } catch {
    // Private mode or a full quota: the flow still works, it just won't survive a refresh.
  }
}

export function clearDraft(slug: string): void {
  try {
    window.sessionStorage.removeItem(keyFor(slug));
  } catch {
    // Nothing to do: see saveDraft.
  }
}

export function toPersisted(state: PersistedState): PersistedState {
  const {
    step,
    attendees,
    familyGroups,
    attendeeExtras,
    bookingExtras,
    promoCode,
    booker,
    createAttempt,
    payAttempt,
    hold,
  } = state;
  return {
    step,
    attendees,
    familyGroups,
    attendeeExtras,
    bookingExtras,
    promoCode,
    booker,
    createAttempt,
    payAttempt,
    hold,
  };
}
