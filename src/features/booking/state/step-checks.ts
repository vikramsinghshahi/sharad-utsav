import { z } from "zod";
import { messageFor } from "@/contracts/messages";
import { bookerSchema } from "@/contracts/requests";
import type { ProblemDetails } from "@/contracts/responses";
import { checkBookerAge, parseDateOfBirth } from "@/domain/age";
import type { IsoDate } from "@/domain/calendar";
import { fieldIds, fieldTargetFor, STEP_HEADING_ID } from "./field-targets";
import { ageInfo, dobProblem, findBookerAttendee } from "./selectors";
import { stockIssues } from "./stock-issues";
import { STEPS, type Action, type BookingState, type Step } from "./types";
import type { CatalogProduct } from "./selectors";
import { BAND_RANGE, RESPONSIBLE_AGE } from "../components/age-labels";

// Instant checks before "Next", so people hear about a problem on the screen
// where they can fix it. The server re-checks everything; these only guide.

export interface StepIssue {
  step: Step;
  fieldId: string;
  message: string;
  // The person it is about, so a card added after "Next" isn't flagged before it's filled in.
  clientId?: string;
  // News from the server (e.g. something sold out): shown without waiting for "Next".
  persistent?: boolean;
  // A one-click way to resolve it, made of ordinary reducer actions.
  fix?: { label: string; actions: Action[] };
}

const personLabel = (state: BookingState, index: number) => {
  const attendee = state.attendees[index];
  return attendee && attendee.firstName.trim() !== ""
    ? attendee.firstName.trim()
    : `Person ${index + 1}`;
};

function whoIssues(state: BookingState, today: IsoDate): StepIssue[] {
  if (state.attendees.length === 0) {
    return [
      {
        step: "who",
        fieldId: fieldIds.addPerson,
        message: "Add at least one person who is coming.",
      },
    ];
  }
  return state.attendees.flatMap((a, index) => {
    const issues: StepIssue[] = [];
    const who = personLabel(state, index);
    if (a.firstName.trim() === "") {
      issues.push({
        step: "who",
        fieldId: fieldIds.attendeeField(a.clientId, "firstName"),
        message: `Please enter a first name for Person ${index + 1}.`,
        clientId: a.clientId,
      });
    }
    if (a.lastName.trim() === "") {
      issues.push({
        step: "who",
        fieldId: fieldIds.attendeeField(a.clientId, "lastName"),
        message: `Please enter a last name for ${who}.`,
        clientId: a.clientId,
      });
    }
    const dob = dobProblem(a.dateOfBirth, today, who);
    if (dob) {
      issues.push({
        step: "who",
        fieldId: fieldIds.attendeeField(a.clientId, "dateOfBirth"),
        message: dob,
        clientId: a.clientId,
      });
    }
    return issues;
  });
}

function passesIssues(state: BookingState): StepIssue[] {
  const festival = state.festival;
  if (!festival) return [];
  const issues: StepIssue[] = [];
  let ticketed = 0;
  state.attendees.forEach((a, index) => {
    const info = ageInfo(a.dateOfBirth, festival.firstDay);
    if (!info || info.band === "infant") return;
    ticketed += 1;
    const who = personLabel(state, index);
    const fieldId = fieldIds.entry(a.clientId);
    if (a.entry.kind === "none") {
      issues.push({ step: "passes", fieldId, message: `Please choose a ticket for ${who}.` });
    } else if (a.entry.kind === "day_pass" && a.entry.dates.length === 0) {
      issues.push({ step: "passes", fieldId, message: `Please pick at least one day for ${who}.` });
    } else if (
      a.entry.kind === "family_pass" &&
      !state.familyGroups.some((g) => g.attendeeClientIds.includes(a.clientId))
    ) {
      issues.push({
        step: "passes",
        fieldId,
        message: `Add ${who} to a family pass below, or choose a different ticket.`,
      });
    }
  });
  if (state.attendees.length > 0 && ticketed === 0) {
    issues.push({
      step: "passes",
      fieldId: STEP_HEADING_ID,
      message: `Children ${BAND_RANGE.infant} come free with an adult aged ${RESPONSIBLE_AGE} or over. Please add the adult who is bringing them.`,
    });
  }
  state.familyGroups.forEach((g) => {
    if (g.attendeeClientIds.length === 0) {
      issues.push({
        step: "passes",
        fieldId: fieldIds.familyGroup(g.id),
        message: `Tick who the family pass is for, or remove it.`,
      });
    }
  });
  return issues;
}

const emailSchema = z.email();

function payIssues(state: BookingState, today: IsoDate): StepIssue[] {
  const { booker } = state;
  const issues: StepIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ step: "pay", fieldId: fieldIds.booker(field), message });

  if (booker.firstName.trim() === "") add("firstName", "Please enter your first name.");
  if (booker.lastName.trim() === "") add("lastName", "Please enter your last name.");
  if (!emailSchema.safeParse(booker.email.trim()).success) {
    add("email", "Please enter an email address like name@example.com.");
  }
  if (!bookerSchema.shape.phone.safeParse(booker.phone).success) {
    add("phone", "Please enter a phone number with at least 7 digits.");
  }
  const dob = dobProblem(booker.dateOfBirth, today);
  if (dob) {
    add("dateOfBirth", dob);
  } else {
    const parsed = parseDateOfBirth(booker.dateOfBirth, today);
    if (parsed.ok && !checkBookerAge(parsed.value, today).ok) {
      add("dateOfBirth", messageFor({ code: "BOOKER_UNDER_18" }));
    }
  }
  if (booker.isAttending && !findBookerAttendee(state)) {
    add(
      "isAttending",
      "You're not in the group yet. Add yourself as a person, or untick “I'm also attending”.",
    );
  }
  return issues;
}

// Everything that should stop "Next" on `step` (this step and the ones before it).
export function localIssues(state: BookingState, step: Step, today: IsoDate): StepIssue[] {
  const upTo = STEPS.indexOf(step);
  const checks: [Step, () => StepIssue[]][] = [
    ["who", () => whoIssues(state, today)],
    ["passes", () => passesIssues(state)],
    ["pay", () => payIssues(state, today)],
  ];
  return checks.filter(([s]) => STEPS.indexOf(s) <= upTo).flatMap(([, check]) => check());
}

// A problem+json body's details, placed on the fields they refer to. Stock conflicts
// carry no path, so they are worked out from the catalog (see stock-issues.ts).
export function problemIssues(
  state: BookingState,
  problem: ProblemDetails,
  catalog?: { products: CatalogProduct[] },
): StepIssue[] {
  if (problem.code === "SOLD_OUT" || problem.code === "INSUFFICIENT_STOCK") {
    const fallback = problem.detail ?? "Something in this booking has sold out.";
    return catalog
      ? stockIssues(state, catalog, problem)
      : [{ step: "review", fieldId: STEP_HEADING_ID, message: fallback, persistent: true }];
  }
  const details = problem.details ?? [];
  if (details.length === 0) {
    return [{ step: "review", fieldId: STEP_HEADING_ID, message: problem.detail ?? problem.title }];
  }
  // Server messages are already written for people (dates formatted, products named).
  return details.map((detail) => ({
    ...fieldTargetFor(state, detail.path),
    message: detail.message,
  }));
}

// What stops "Next" on `step`: only problems on this step or an earlier one. A problem
// on a later step never blocks the way to it, so nobody can be trapped (e.g. an extra
// that sold out can always be reached and removed).
export function issuesUpTo(issues: readonly StepIssue[], step: Step): StepIssue[] {
  const upTo = STEPS.indexOf(step);
  return issues.filter((i) => STEPS.indexOf(i.step) <= upTo);
}
