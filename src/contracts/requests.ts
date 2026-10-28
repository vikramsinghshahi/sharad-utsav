import { z } from "zod";
import type {
  AttendeeInput,
  BookerInput,
  BookingDraft,
  EntryInput,
  ExtraInput,
  FamilyGroupInput,
} from "@/domain/booking";

// Request shapes shared by the API and the UI (SPEC §7). These check *shape*
// only; every business rule is enforced by the domain. There are deliberately
// no price or total fields: anything like that a client sends is stripped.

const id = z.string().trim().min(1).max(64);
const name = z.string().trim().min(1).max(100);
// Dates stay strings here; the domain decides whether they are real festival days.
const dateString = z.string().max(32);
const dates = z.array(dateString).max(31);

const entrySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("day_pass"), productId: id, dates }),
  z.object({ kind: z.literal("all_days"), productId: id }),
  z.object({ kind: z.literal("family_pass") }),
]) satisfies z.ZodType<EntryInput>;

const attendeeSchema = z.object({
  clientId: id,
  firstName: name,
  lastName: name,
  dateOfBirth: dateString,
  entry: entrySchema,
}) satisfies z.ZodType<AttendeeInput>;

const familyGroupSchema = z.object({
  id,
  productId: id,
  date: dateString,
  attendeeClientIds: z.array(id).max(10),
}) satisfies z.ZodType<FamilyGroupInput>;

const extraSchema = z.union([
  z.object({ productId: id, quantity: z.number() }),
  z.object({ productId: id, attendeeClientId: id, dates }),
]) satisfies z.ZodType<ExtraInput>;

export const bookerSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.email().max(254),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ()-]{6,24}$/, "Enter a phone number with at least 7 digits"),
  dateOfBirth: dateString,
  isAttending: z.boolean(),
}) satisfies z.ZodType<BookerInput>;

// Generous array caps bound the payload size; the domain gives the friendly
// GROUP_TOO_LARGE error for 21+ people.
export const bookingDraftSchema = z.object({
  attendees: z.array(attendeeSchema).max(50),
  familyGroups: z.array(familyGroupSchema).max(50),
  extras: z.array(extraSchema).max(200),
  promoCode: z.string().max(40).optional(),
}) satisfies z.ZodType<BookingDraft>;

export const createBookingRequestSchema = bookingDraftSchema.extend({
  eventSlug: id,
  booker: bookerSchema,
});
export type CreateBookingRequest = z.infer<typeof createBookingRequestSchema>;

export const payRequestSchema = z.object({
  // Simulated provider only: lets the demo show a declined card.
  outcome: z.enum(["succeed", "decline"]),
});
export type PayRequest = z.infer<typeof payRequestSchema>;

export const idempotencyKeySchema = z.uuid();
