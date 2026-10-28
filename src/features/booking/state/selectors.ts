import type { CatalogResponse } from "@/contracts/responses";
import {
  ageBand,
  ageOn,
  parseDateOfBirth,
  RESPONSIBLE_ADULT_MIN_AGE,
  type AgeBand,
} from "@/domain/age";
import { parseIsoDate, type IsoDate } from "@/domain/calendar";
import type { ExtraRule, PassRule } from "@/domain/catalog";
import type { AttendeeDraft, BookingState, FamilyGroupDraft, FestivalInfo } from "./types";

// Pure helpers shared by the reducer and the step screens. Products are always
// picked by their structured `rule`, never by code or display name.

export type CatalogProduct = CatalogResponse["products"][number];
export type PassProductView = CatalogProduct & { rule: PassRule };
export type ExtraProductView = CatalogProduct & { rule: ExtraRule };

const isPass = (p: CatalogProduct): p is PassProductView => p.rule.type === "pass";
const isExtra = (p: CatalogProduct): p is ExtraProductView => p.rule.type === "extra";

export type TicketBand = Exclude<AgeBand, "infant">;

export function dayPassFor(catalog: CatalogResponse, band: TicketBand) {
  return catalog.products
    .filter(isPass)
    .find((p) => p.rule.dayScope === "chosen_days" && p.rule.eligibleAgeBand === band);
}

export function allDaysPassFor(catalog: CatalogResponse, band: TicketBand) {
  return catalog.products
    .filter(isPass)
    .find((p) => p.rule.dayScope === "all_days" && p.rule.eligibleAgeBand === band);
}

export function familyPass(catalog: CatalogResponse) {
  return catalog.products
    .filter(isPass)
    .find((p) => p.rule.dayScope === "single_day" && p.rule.covers !== undefined);
}

// Dinner and Garba: chosen per person, per day.
export function attendeeExtraProducts(catalog: CatalogResponse) {
  return catalog.products.filter(isExtra).filter((p) => p.rule.scope !== "per_booking");
}

// Dandiya: a quantity for the whole booking.
export function bookingExtraProducts(catalog: CatalogResponse) {
  return catalog.products.filter(isExtra).filter((p) => p.rule.scope === "per_booking");
}

export function productById(catalog: CatalogResponse, id: string) {
  return catalog.products.find((p) => p.id === id);
}

export function festivalInfo(catalog: CatalogResponse): FestivalInfo {
  const passBands: FestivalInfo["passBands"] = {};
  const extraMinBands: FestivalInfo["extraMinBands"] = {};
  const familyCovers: FestivalInfo["familyCovers"] = {};
  for (const product of catalog.products) {
    if (isPass(product) && product.rule.covers) familyCovers[product.id] = product.rule.covers;
    if (isPass(product) && product.rule.eligibleAgeBand) {
      passBands[product.id] = product.rule.eligibleAgeBand;
    }
    if (isExtra(product) && product.rule.minAgeBand) {
      extraMinBands[product.id] = product.rule.minAgeBand;
    }
  }
  const days = catalog.days.map((d) => d.date);
  return { firstDay: days[0] ?? "", days, passBands, extraMinBands, familyCovers };
}

// ---------- ages ----------

export interface AgeInfo {
  age: number;
  band: AgeBand;
}

// Age on the first festival day (D1), or null while the DOB isn't a real date yet.
export function ageInfo(dateOfBirth: string, firstDay: string): AgeInfo | null {
  const dob = parseIsoDate(dateOfBirth.trim());
  const reference = parseIsoDate(firstDay);
  if (dob === null || reference === null || dob > reference) return null;
  const age = ageOn(dob, reference);
  return { age, band: ageBand(age) };
}

// Inline DOB check for the form, using the same domain rules the server uses (A6).
// `who` names the person in the message ("Person 2", "Aarav"); omit it for "you".
export function dobProblem(dateOfBirth: string, today: IsoDate, who?: string): string | null {
  const forWho = who ? ` for ${who}` : "";
  if (dateOfBirth.trim() === "") return `Please enter a date of birth${forWho}.`;
  const result = parseDateOfBirth(dateOfBirth, today);
  if (result.ok) return null;
  const reason = result.issues[0]?.params?.reason;
  if (reason === "future") return `${who ? `${who}'s` : "That"} date of birth is in the future.`;
  if (reason === "implausible") return `Please check the year of birth${forWho}.`;
  return `Please enter a real date of birth${forWho}.`;
}

const BAND_RANK: Record<AgeBand, number> = { infant: 0, child: 1, adult: 2 };

export function bandAllows(band: AgeBand, minBand: AgeBand | undefined): boolean {
  return minBand === undefined || BAND_RANK[band] >= BAND_RANK[minBand];
}

// ---------- attendance ----------

function ticketDates(
  attendee: AttendeeDraft,
  groups: readonly FamilyGroupDraft[],
  festival: FestivalInfo,
): string[] {
  switch (attendee.entry.kind) {
    case "none":
      return [];
    case "day_pass":
      return [...attendee.entry.dates].sort();
    case "all_days":
      return [...festival.days];
    case "family_pass":
      return unique(
        groups.filter((g) => g.attendeeClientIds.includes(attendee.clientId)).map((g) => g.date),
      );
  }
}

// Days an 18+ ticket holder in the booking attends: the days under-5s can come (D5).
export function responsibleAdultDates(
  state: Pick<BookingState, "attendees" | "familyGroups">,
  festival: FestivalInfo,
): string[] {
  return unique(
    state.attendees
      .filter(
        (a) => (ageInfo(a.dateOfBirth, festival.firstDay)?.age ?? 0) >= RESPONSIBLE_ADULT_MIN_AGE,
      )
      .flatMap((a) => ticketDates(a, state.familyGroups, festival)),
  );
}

// Which days a person is at the festival. Infants come on the days a responsible adult does.
export function attendanceDates(
  state: Pick<BookingState, "attendees" | "familyGroups">,
  clientId: string,
  festival: FestivalInfo,
): string[] {
  const attendee = state.attendees.find((a) => a.clientId === clientId);
  if (!attendee) return [];
  const info = ageInfo(attendee.dateOfBirth, festival.firstDay);
  if (info?.band === "infant") return responsibleAdultDates(state, festival);
  return ticketDates(attendee, state.familyGroups, festival);
}

export function attendeeName(attendee: Pick<AttendeeDraft, "firstName" | "lastName">): string {
  const name = `${attendee.firstName.trim()} ${attendee.lastName.trim()}`.trim();
  return name === "" ? "This person" : name;
}

export function firstNameOf(attendee: Pick<AttendeeDraft, "firstName">): string {
  return attendee.firstName.trim() === "" ? "This person" : attendee.firstName.trim();
}

// D7: does the booker already appear in the group (same name and date of birth)?
export function findBookerAttendee(state: Pick<BookingState, "attendees" | "booker">) {
  const norm = (v: string) => v.trim().toLowerCase();
  const { booker } = state;
  return state.attendees.find(
    (a) =>
      norm(a.firstName) === norm(booker.firstName) &&
      norm(a.lastName) === norm(booker.lastName) &&
      a.dateOfBirth === booker.dateOfBirth,
  );
}

// Units of an extra already chosen in this draft (for "N places left" hints only).
export function selectedExtraUnits(state: Pick<BookingState, "attendeeExtras">, productId: string) {
  return state.attendeeExtras
    .filter((e) => e.productId === productId)
    .reduce((sum, e) => sum + e.dates.length, 0);
}

export function familyGroupsFor(state: Pick<BookingState, "familyGroups">, clientId: string) {
  return state.familyGroups.filter((g) => g.attendeeClientIds.includes(clientId));
}

// D3 "use separate day passes" can switch a group only if nobody in it has a
// family pass on another day (a person holds one kind of ticket).
export function canSplitFamilyGroup(state: Pick<BookingState, "familyGroups">, groupId: string) {
  const group = state.familyGroups.find((g) => g.id === groupId);
  if (!group || group.attendeeClientIds.length === 0) return false;
  return group.attendeeClientIds.every((id) => familyGroupsFor(state, id).length === 1);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

// After a 409 stock conflict: which chosen products the fresh catalog can no longer
// cover, and how many units the draft asks for. Only used to say what ran out.
export function shortProducts(
  state: Pick<BookingState, "attendees" | "familyGroups" | "attendeeExtras" | "bookingExtras">,
  catalog: Pick<CatalogResponse, "products">,
): { product: CatalogProduct; wanted: number }[] {
  const units = new Map<string, number>();
  const add = (id: string, n: number) => units.set(id, (units.get(id) ?? 0) + n);
  for (const a of state.attendees) {
    if (a.entry.kind === "day_pass") add(a.entry.productId, a.entry.dates.length);
    if (a.entry.kind === "all_days") add(a.entry.productId, 1);
  }
  for (const g of state.familyGroups) add(g.productId, 1);
  for (const e of state.attendeeExtras) add(e.productId, e.dates.length);
  for (const e of state.bookingExtras) add(e.productId, e.quantity);
  return catalog.products.flatMap((product) => {
    const wanted = units.get(product.id) ?? 0;
    return wanted > 0 && (product.soldOut || product.remaining < wanted)
      ? [{ product, wanted }]
      : [];
  });
}

// Whether `clientId` (of `band`) fits in `group` without breaking its composition (D3).
export function familyGroupHasRoom(
  state: Pick<BookingState, "attendees">,
  group: FamilyGroupDraft,
  band: TicketBand,
  festival: FestivalInfo,
): boolean {
  const covers = festival.familyCovers[group.productId];
  if (!covers) return false;
  const taken = group.attendeeClientIds.filter((id) => {
    const member = state.attendees.find((a) => a.clientId === id);
    return member && ageInfo(member.dateOfBirth, festival.firstDay)?.band === band;
  }).length;
  return taken < (band === "adult" ? covers.adult : covers.child);
}
