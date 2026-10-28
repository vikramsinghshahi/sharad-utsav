import { MAX_ATTENDEES } from "@/domain/booking";
import { formatDay, formatDays } from "../format";
import { ageInfo, attendanceDates, bandAllows, firstNameOf, type AgeInfo } from "./selectors";
import type {
  Action,
  AttendeeDraft,
  BookerDraft,
  BookingState,
  CreateAttempt,
  EntryDraft,
  FestivalInfo,
  Notice,
  PayAttempt,
} from "./types";

export const EMPTY_BOOKER: BookerDraft = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dateOfBirth: "",
  isAttending: false,
};

export function initialBookingState(): BookingState {
  return {
    hydrated: false,
    step: "who",
    festival: null,
    attendees: [],
    familyGroups: [],
    attendeeExtras: [],
    bookingExtras: [],
    promoCode: "",
    booker: EMPTY_BOOKER,
    notices: [],
    noticeSeq: 0,
    createAttempt: null,
    payAttempt: null,
    hold: null,
    inFlight: null,
    error: null,
  };
}

// Actions that change what would be booked. Any of them makes an earlier
// create key (and any hold made from the old draft) stale.
const DRAFT_ACTIONS = new Set<Action["type"]>([
  "ADD_ATTENDEE",
  "REMOVE_ATTENDEE",
  "SET_NAME",
  "SET_DOB",
  "SET_ENTRY",
  "TOGGLE_DAY",
  "ADD_FAMILY_GROUP",
  "REMOVE_FAMILY_GROUP",
  "SET_FAMILY_GROUP_DATE",
  "SET_FAMILY_GROUP",
  "SPLIT_FAMILY_GROUP",
  "TOGGLE_EXTRA_DAY",
  "SET_EXTRA_QUANTITY",
  "SET_PROMO",
]);

export function bookingReducer(state: BookingState, action: Action): BookingState {
  const next = reduce(state, action);
  if (next === state) return next;
  if (DRAFT_ACTIONS.has(action.type)) return invalidateCheckout(next);
  if (action.type === "SET_BOOKER") return { ...next, createAttempt: null };
  return next;
}

function reduce(state: BookingState, action: Action): BookingState {
  switch (action.type) {
    case "RESTORE":
      return action.saved
        ? { ...state, ...action.saved, hydrated: true }
        : { ...state, hydrated: true };

    case "CATALOG_LOADED":
      return pruneExtras({ ...state, festival: action.festival });

    case "GO_TO_STEP":
      return { ...state, step: action.step, error: null };

    case "ADD_ATTENDEE": {
      if (state.attendees.length >= MAX_ATTENDEES) return state;
      const attendee: AttendeeDraft = {
        clientId: action.clientId,
        firstName: action.prefill?.firstName ?? "",
        lastName: action.prefill?.lastName ?? "",
        dateOfBirth: action.prefill?.dateOfBirth ?? "",
        entry: { kind: "none" },
      };
      const added = { ...state, attendees: [...state.attendees, attendee] };
      return action.prefill
        ? withNotice(
            added,
            "info",
            `Added ${firstNameOf(attendee)} to the group. Please choose a ticket for them.`,
          )
        : added;
    }

    case "REMOVE_ATTENDEE": {
      if (!findAttendee(state, action.clientId)) return state;
      const without = removeFromFamilyGroups(state, action.clientId);
      return pruneExtras({
        ...without,
        attendees: without.attendees.filter((a) => a.clientId !== action.clientId),
        attendeeExtras: without.attendeeExtras.filter(
          (e) => e.attendeeClientId !== action.clientId,
        ),
      });
    }

    case "SET_NAME":
      return updateAttendee(state, action.clientId, (a) => ({
        ...a,
        [action.field]: action.value,
      }));

    case "SET_DOB":
      return setDateOfBirth(state, action.clientId, action.dateOfBirth);

    case "SET_ENTRY": {
      const attendee = findAttendee(state, action.clientId);
      if (!attendee) return state;
      const base =
        attendee.entry.kind === "family_pass" && action.entry.kind !== "family_pass"
          ? removeFromFamilyGroups(state, action.clientId)
          : state;
      return pruneExtras(
        updateAttendee(base, action.clientId, (a) => ({ ...a, entry: action.entry })),
      );
    }

    case "TOGGLE_DAY": {
      const attendee = findAttendee(state, action.clientId);
      if (attendee?.entry.kind !== "day_pass") return state;
      const { dates } = attendee.entry;
      const nextDates = dates.includes(action.date)
        ? dates.filter((d) => d !== action.date)
        : [...dates, action.date].sort();
      const entry: EntryDraft = { ...attendee.entry, dates: nextDates };
      return pruneExtras(updateAttendee(state, action.clientId, (a) => ({ ...a, entry })));
    }

    case "ADD_FAMILY_GROUP":
      return {
        ...state,
        familyGroups: [
          ...state.familyGroups,
          { id: action.id, productId: action.productId, date: action.date, attendeeClientIds: [] },
        ],
      };

    case "REMOVE_FAMILY_GROUP":
      return pruneExtras({
        ...state,
        familyGroups: state.familyGroups.filter((g) => g.id !== action.id),
      });

    case "SET_FAMILY_GROUP_DATE":
      return pruneExtras({
        ...state,
        familyGroups: state.familyGroups.map((g) =>
          g.id === action.id ? { ...g, date: action.date } : g,
        ),
      });

    case "SET_FAMILY_GROUP":
      return setFamilyMember(state, action.id, action.clientId, action.member);

    case "SPLIT_FAMILY_GROUP": {
      const group = state.familyGroups.find((g) => g.id === action.id);
      if (!group) return state;
      let next: BookingState = {
        ...state,
        familyGroups: state.familyGroups.filter((g) => g.id !== action.id),
      };
      for (const pass of action.passes) {
        next = updateAttendee(next, pass.clientId, (a) => ({
          ...a,
          entry: { kind: "day_pass", productId: pass.productId, dates: [group.date] },
        }));
      }
      return pruneExtras(next);
    }

    case "TOGGLE_EXTRA_DAY": {
      const existing = state.attendeeExtras.find(
        (e) => e.productId === action.productId && e.attendeeClientId === action.clientId,
      );
      const rows = existing
        ? state.attendeeExtras.map((e) =>
            e === existing
              ? {
                  ...e,
                  dates: e.dates.includes(action.date)
                    ? e.dates.filter((d) => d !== action.date)
                    : [...e.dates, action.date].sort(),
                }
              : e,
          )
        : [
            ...state.attendeeExtras,
            {
              productId: action.productId,
              attendeeClientId: action.clientId,
              dates: [action.date],
            },
          ];
      return pruneExtras({ ...state, attendeeExtras: rows.filter((e) => e.dates.length > 0) });
    }

    case "SET_EXTRA_QUANTITY": {
      const quantity = Number.isFinite(action.quantity)
        ? Math.max(0, Math.floor(action.quantity))
        : 0;
      const others = state.bookingExtras.filter((e) => e.productId !== action.productId);
      return {
        ...state,
        bookingExtras:
          quantity > 0 ? [...others, { productId: action.productId, quantity }] : others,
      };
    }

    case "SET_PROMO": {
      const code = action.code.trim();
      return code === state.promoCode ? state : { ...state, promoCode: code };
    }

    case "SET_BOOKER":
      return { ...state, booker: { ...state.booker, ...action.patch } };

    case "DISMISS_NOTICE":
      return { ...state, notices: state.notices.filter((n) => n.id !== action.id) };

    case "CREATE_STARTED":
      return { ...state, inFlight: "create", createAttempt: action.attempt, error: null };

    case "CREATE_SUCCEEDED":
      return { ...state, inFlight: null, hold: action.hold, payAttempt: null, error: null };

    case "CREATE_FAILED":
      // Retry after a network failure reuses the key; after a definite answer it would only replay it.
      return {
        ...state,
        inFlight: null,
        error: action.error,
        createAttempt: action.definite ? null : state.createAttempt,
      };

    case "PAY_STARTED":
      return { ...state, inFlight: "pay", payAttempt: action.attempt, error: null };

    case "PAY_FAILED":
      return {
        ...state,
        inFlight: null,
        error: action.error,
        payAttempt:
          action.definite || !state.payAttempt
            ? null
            : { ...state.payAttempt, awaitingRetry: true },
      };

    case "HOLD_RELEASED":
      return {
        ...state,
        hold: null,
        createAttempt: null,
        payAttempt: null,
        inFlight: null,
        step: "review",
        error: { kind: "released" },
      };

    case "BOOKING_FINISHED":
      return { ...initialBookingState(), hydrated: true, festival: state.festival };
  }
}

// ---------- idempotency keys (D17) ----------

// The key to send for this create body: the previous one if it was for the same body.
export function reusableCreateKey(attempt: CreateAttempt | null, fingerprint: string) {
  return attempt?.fingerprint === fingerprint ? attempt.key : null;
}

// The key to send for this pay attempt: reused only to retry after a network failure.
export function reusablePayKey(attempt: PayAttempt | null, outcome: PayAttempt["outcome"]) {
  return attempt?.awaitingRetry && attempt.outcome === outcome ? attempt.key : null;
}

// ---------- cascades ----------

function invalidateCheckout(state: BookingState): BookingState {
  const base = { ...state, createAttempt: null };
  if (!state.hold) return base;
  return withNotice(
    { ...base, hold: null, payAttempt: null, error: null },
    "info",
    "You changed the booking, so its held places were let go. Continue to payment again when you're ready.",
  );
}

function findAttendee(state: BookingState, clientId: string) {
  return state.attendees.find((a) => a.clientId === clientId);
}

function updateAttendee(
  state: BookingState,
  clientId: string,
  update: (attendee: AttendeeDraft) => AttendeeDraft,
): BookingState {
  if (!findAttendee(state, clientId)) return state;
  return {
    ...state,
    attendees: state.attendees.map((a) => (a.clientId === clientId ? update(a) : a)),
  };
}

function removeFromFamilyGroups(state: BookingState, clientId: string): BookingState {
  return {
    ...state,
    familyGroups: state.familyGroups.map((g) => ({
      ...g,
      attendeeClientIds: g.attendeeClientIds.filter((id) => id !== clientId),
    })),
  };
}

function setFamilyMember(
  state: BookingState,
  groupId: string,
  clientId: string,
  member: boolean,
): BookingState {
  const group = state.familyGroups.find((g) => g.id === groupId);
  const attendee = findAttendee(state, clientId);
  if (!group || !attendee) return state;
  if (group.attendeeClientIds.includes(clientId) === member) return state;

  let next: BookingState = {
    ...state,
    familyGroups: state.familyGroups.map((g) =>
      g.id !== groupId
        ? g
        : {
            ...g,
            attendeeClientIds: member
              ? [...g.attendeeClientIds, clientId]
              : g.attendeeClientIds.filter((id) => id !== clientId),
          },
    ),
  };

  // Ticking someone into a family pass makes it their ticket kind (one kind per person).
  if (member && attendee.entry.kind !== "family_pass") {
    next = updateAttendee(next, clientId, (a) => ({ ...a, entry: { kind: "family_pass" } }));
    if (attendee.entry.kind !== "none") {
      next = withNotice(
        next,
        "info",
        `${firstNameOf(attendee)}'s ${entryLabel(attendee.entry, state.festival)} was replaced by the family pass.`,
      );
    }
  }
  return pruneExtras(next);
}

function setDateOfBirth(state: BookingState, clientId: string, dateOfBirth: string): BookingState {
  const attendee = findAttendee(state, clientId);
  if (!attendee) return state;
  const updated = updateAttendee(state, clientId, (a) => ({ ...a, dateOfBirth }));
  const festival = state.festival;
  if (!festival) return updated;

  const after = ageInfo(dateOfBirth, festival.firstDay);
  if (!after || entryFitsBand(attendee.entry, after, festival)) return pruneExtras(updated);

  // The age band changed and the ticket no longer fits: clear it and say why (SPEC §9.2).
  const cleared = removeFromFamilyGroups(
    updateAttendee(updated, clientId, (a) => ({ ...a, entry: { kind: "none" } })),
    clientId,
  );
  const who = firstNameOf(attendee);
  const on = formatDay(festival.firstDay);
  const ticket = entryLabel(attendee.entry, festival);
  const text =
    after.band === "infant"
      ? `${who} is ${after.age} on ${on}. Under-5s come free, so the ${ticket} was removed.`
      : `${who} is ${after.age} on ${on}, so the ${ticket} was removed. Please choose a ${after.band} ticket.`;
  return pruneExtras(withNotice(cleared, "warning", text));
}

function entryFitsBand(entry: EntryDraft, info: AgeInfo, festival: FestivalInfo): boolean {
  switch (entry.kind) {
    case "none":
      return true;
    case "family_pass":
      return info.band !== "infant";
    case "day_pass":
    case "all_days":
      return festival.passBands[entry.productId] === info.band;
  }
}

function entryLabel(entry: EntryDraft, festival: FestivalInfo | null): string {
  if (entry.kind === "family_pass") return "family pass place";
  if (entry.kind === "none") return "ticket";
  const band = festival?.passBands[entry.productId];
  const kind = entry.kind === "all_days" ? "all-day pass" : "day pass";
  return band ? `${band} ${kind}` : kind;
}

// Extras only exist on days their person attends and for ages they suit
// (X1, D12, D14). Anything else is removed, with a note saying so.
function pruneExtras(state: BookingState): BookingState {
  const festival = state.festival;
  // While someone's date of birth is half-typed, attendance isn't knowable yet: wait.
  if (!festival || state.attendees.some((a) => !ageInfo(a.dateOfBirth, festival.firstDay))) {
    return state;
  }

  const removed = new Map<string, Set<string>>();
  const rows = state.attendeeExtras.flatMap((row) => {
    const attendee = findAttendee(state, row.attendeeClientId);
    if (!attendee) return [];
    const info = ageInfo(attendee.dateOfBirth, festival.firstDay);
    const ageOk = info !== null && bandAllows(info.band, festival.extraMinBands[row.productId]);
    const attending = attendanceDates(state, attendee.clientId, festival);
    const keep = row.dates.filter((d) => ageOk && attending.includes(d));
    const dropped = row.dates.filter((d) => !keep.includes(d));
    if (dropped.length > 0) {
      const set = removed.get(attendee.clientId) ?? new Set<string>();
      dropped.forEach((d) => set.add(d));
      removed.set(attendee.clientId, set);
    }
    return keep.length > 0 ? [{ ...row, dates: keep }] : [];
  });
  if (removed.size === 0) return state;

  let next: BookingState = { ...state, attendeeExtras: rows };
  for (const [clientId, dates] of removed) {
    const attendee = findAttendee(state, clientId);
    if (!attendee) continue;
    const days = formatDays([...dates].sort());
    next = withNotice(
      next,
      "info",
      `${firstNameOf(attendee)}'s extras on ${days} were removed, as they're no longer coming then.`,
    );
  }
  return next;
}

function withNotice(state: BookingState, tone: Notice["tone"], text: string): BookingState {
  const seq = state.noticeSeq + 1;
  // Keep the list short: the newest few are what matter.
  const notices = [...state.notices, { id: `notice-${seq}`, tone, text }].slice(-4);
  return { ...state, notices, noticeSeq: seq };
}
