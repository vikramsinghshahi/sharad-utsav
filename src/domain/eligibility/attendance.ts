import { RESPONSIBLE_ADULT_MIN_AGE } from "../age";
import type { IsoDate } from "../calendar";
import { issue, type DomainIssue } from "../errors";
import { IssueCollector, type Result } from "../result";
import type { AttendeeCore } from "./attendees";
import type { EligibilityContext } from "./context";
import type { ValidatedAttendee, ValidatedFamilyGroup } from "./types";

// Works out which days each person attends, then applies the group rules:
// E7 (at least one ticket), D5 (infants come with an 18+), E8/D6 (every day
// with an under-12 has an 18+ attending).
export function resolveAttendance(
  attendees: readonly AttendeeCore[],
  groups: readonly ValidatedFamilyGroup[],
  ctx: EligibilityContext,
): Result<ValidatedAttendee[]> {
  const allDates = ctx.catalog.days.map((d) => d.date);
  const ticketedDates = new Map(
    attendees.map((a) => [a.clientId, ticketDates(a, groups, allDates)] as const),
  );

  const ticketed = attendees.filter((a) => a.entry.kind !== "none");
  if (ticketed.length === 0) {
    return { ok: false, issues: [issue("EMPTY_BOOKING", ["attendees"])] };
  }

  const responsibleDates = unique(
    ticketed
      .filter((a) => a.age >= RESPONSIBLE_ADULT_MIN_AGE)
      .flatMap((a) => ticketedDates.get(a.clientId) ?? []),
  );

  const issues = new IssueCollector();
  const resolved = attendees.map((attendee): ValidatedAttendee => {
    if (attendee.ageBand === "infant") {
      if (responsibleDates.length === 0) issues.add(unaccompanied(attendee, [], allDates));
      return { ...attendee, attendanceDates: responsibleDates };
    }
    const dates = ticketedDates.get(attendee.clientId) ?? [];
    if (attendee.ageBand === "child") {
      const alone = dates.filter((date) => !responsibleDates.includes(date));
      if (alone.length > 0) issues.add(unaccompanied(attendee, alone, allDates));
    }
    return { ...attendee, attendanceDates: dates };
  });

  return issues.finish(resolved);
}

function ticketDates(
  attendee: AttendeeCore,
  groups: readonly ValidatedFamilyGroup[],
  allDates: readonly IsoDate[],
): IsoDate[] {
  switch (attendee.entry.kind) {
    case "none":
      return [];
    case "day_pass":
      return attendee.entry.dates;
    case "all_days":
      return [...allDates];
    case "family_pass":
      return unique(
        groups.filter((g) => g.memberClientIds.includes(attendee.clientId)).map((g) => g.date),
      );
  }
}

function unaccompanied(
  attendee: AttendeeCore,
  dates: readonly IsoDate[],
  allDates: readonly IsoDate[],
): DomainIssue {
  return issue("CHILD_UNACCOMPANIED", ["attendees", attendee.index], {
    firstName: attendee.firstName,
    dates: dates.join(", "),
    festivalDayCount: allDates.length,
  });
}

function unique(dates: readonly IsoDate[]): IsoDate[] {
  return [...new Set(dates)].sort();
}
