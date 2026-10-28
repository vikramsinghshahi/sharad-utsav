import { MAX_ATTENDEES, type BookingDraft } from "../booking";
import type { Catalog } from "../catalog";
import { issue } from "../errors";
import { fail, IssueCollector, type Result } from "../result";
import type { SaleClock } from "../sales-window";
import { validateAttendee, type AttendeeCore } from "./attendees";
import { resolveAttendance } from "./attendance";
import { eligibilityContext } from "./context";
import { validateExtras } from "./extras";
import { validateFamilyGroups } from "./family-groups";
import type { BookingWarning, ValidatedAttendee, ValidatedBooking } from "./types";

export { validateBooker, type ValidatedBooker } from "./booker";
export type * from "./types";

// Runs every group rule (SPEC §5.1–5.3) against the server's own catalog.
// Whatever sent the draft, an invalid booking can never reach pricing.
export function validateBooking(
  draft: BookingDraft,
  catalog: Catalog,
  clock: SaleClock,
): Result<ValidatedBooking> {
  // E9: abuse guard before doing any work.
  if (draft.attendees.length > MAX_ATTENDEES) {
    return fail(
      issue("GROUP_TOO_LARGE", ["attendees"], {
        max: MAX_ATTENDEES,
        count: draft.attendees.length,
      }),
    );
  }

  const ctx = eligibilityContext(catalog, clock);
  const issues = new IssueCollector();

  const cores: AttendeeCore[] = [];
  const seenClientIds = new Set<string>();
  draft.attendees.forEach((input, index) => {
    if (seenClientIds.has(input.clientId)) {
      return issues.add(issue("DUPLICATE_ID", ["attendees", index, "clientId"]));
    }
    seenClientIds.add(input.clientId);
    const core = issues.take(validateAttendee(input, index, ctx));
    if (core) cores.push(core);
  });

  const coresById = new Map(cores.map((core) => [core.clientId, core]));
  const familyGroups = issues.take(validateFamilyGroups(draft.familyGroups, coresById, ctx));
  // Attendance and extras depend on every entry being valid, so stop here if not.
  if (issues.hasIssues || !familyGroups) return issues.failure();

  const attendees = issues.take(resolveAttendance(cores, familyGroups, ctx));
  if (!attendees) return issues.failure();

  const attendeesById = new Map(attendees.map((a) => [a.clientId, a]));
  const extras = issues.take(validateExtras(draft.extras, attendeesById, ctx)) ?? [];

  return issues.finish({
    attendees,
    familyGroups,
    extras,
    warnings: findPossibleDuplicates(attendees),
  });
}

// D18: same name and date of birth is probably a typo, but twins exist, so only warn.
function findPossibleDuplicates(attendees: readonly ValidatedAttendee[]): BookingWarning[] {
  const firstIndexByKey = new Map<string, number>();
  const warnings: BookingWarning[] = [];
  for (const attendee of attendees) {
    const key = [attendee.firstName, attendee.lastName, attendee.dateOfBirth]
      .map((part) => part.trim().toLowerCase())
      .join("|");
    const firstIndex = firstIndexByKey.get(key);
    if (firstIndex === undefined) {
      firstIndexByKey.set(key, attendee.index);
    } else {
      warnings.push({
        code: "POSSIBLE_DUPLICATE_ATTENDEE",
        path: ["attendees", attendee.index],
        params: { duplicateOf: firstIndex },
      });
    }
  }
  return warnings;
}
