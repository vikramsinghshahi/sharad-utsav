import type { FamilyGroupInput } from "../booking";
import { isPassProduct, type PassProduct, type Product } from "../catalog";
import { issue, type IssuePath } from "../errors";
import { IssueCollector, type Result } from "../result";
import type { AttendeeCore } from "./attendees";
import { resolveProduct, validateDates, type EligibilityContext } from "./context";
import type { ValidatedFamilyGroup } from "./types";

const isFamilyPass = (p: Product): p is PassProduct =>
  isPassProduct(p) && p.rule.dayScope === "single_day" && p.rule.covers !== undefined;

// E4 + D3 + D20: each group is one pass for one day, 1..covers.adult adults and
// 0..covers.child children; a person is in at most one family pass per day.
export function validateFamilyGroups(
  groups: readonly FamilyGroupInput[],
  attendees: ReadonlyMap<string, AttendeeCore>,
  ctx: EligibilityContext,
): Result<ValidatedFamilyGroup[]> {
  const issues = new IssueCollector();
  const validated: ValidatedFamilyGroup[] = [];
  const seenGroupIds = new Set<string>();

  groups.forEach((group, index) => {
    const path: IssuePath = ["familyGroups", index];
    if (seenGroupIds.has(group.id)) {
      return issues.add(issue("DUPLICATE_ID", [...path, "id"], { id: group.id }));
    }
    seenGroupIds.add(group.id);

    const product = issues.take(
      resolveProduct(group.productId, ctx, [...path, "productId"], isFamilyPass),
    );
    const date = issues.take(validateDates([group.date], ctx, [...path, "date"]))?.[0];
    const members = issues.take(validateMembers(group, attendees, path));
    if (!product || !date || !members) return;

    const compositionIssue = checkComposition(product, members, path);
    if (compositionIssue) return issues.add(compositionIssue);

    validated.push({
      id: group.id,
      product,
      date,
      memberClientIds: members.map((m) => m.clientId),
    });
  });

  issues.add(...checkOnePassPerPersonPerDay(validated, attendees));
  issues.add(...checkEveryFamilyEntryIsGrouped(groups, attendees));
  return issues.finish(validated);
}

function validateMembers(
  group: FamilyGroupInput,
  attendees: ReadonlyMap<string, AttendeeCore>,
  path: IssuePath,
): Result<AttendeeCore[]> {
  const issues = new IssueCollector();
  const membersPath = [...path, "attendeeClientIds"];
  if (group.attendeeClientIds.length === 0) {
    issues.add(issue("FAMILY_PASS_COMPOSITION", membersPath, { reason: "empty" }));
  }

  const members: AttendeeCore[] = [];
  group.attendeeClientIds.forEach((clientId, i) => {
    const at = [...membersPath, i];
    const attendee = attendees.get(clientId);
    if (!attendee) return issues.add(issue("UNKNOWN_ATTENDEE", at, { clientId }));
    if (members.includes(attendee)) return issues.add(issue("DUPLICATE_ID", at, { clientId }));
    if (attendee.entry.kind !== "family_pass") {
      return issues.add(
        issue("FAMILY_PASS_COMPOSITION", at, { reason: "member_has_other_entry", clientId }),
      );
    }
    members.push(attendee);
  });
  return issues.finish(members);
}

function checkComposition(product: PassProduct, members: readonly AttendeeCore[], path: IssuePath) {
  const maxAdults = product.rule.covers?.adult ?? 0;
  const maxChildren = product.rule.covers?.child ?? 0;
  const adults = members.filter((m) => m.ageBand === "adult").length;
  const children = members.filter((m) => m.ageBand === "child").length;
  if (adults >= 1 && adults <= maxAdults && children <= maxChildren) return undefined;
  return issue("FAMILY_PASS_COMPOSITION", path, { adults, children, maxAdults, maxChildren });
}

function checkOnePassPerPersonPerDay(
  groups: readonly ValidatedFamilyGroup[],
  attendees: ReadonlyMap<string, AttendeeCore>,
) {
  const seen = new Set<string>();
  const issues = [];
  for (const group of groups) {
    for (const clientId of group.memberClientIds) {
      const key = `${clientId}|${group.date}`;
      if (seen.has(key)) {
        const index = attendees.get(clientId)?.index ?? -1;
        issues.push(
          issue("FAMILY_PASS_COMPOSITION", ["attendees", index, "entry"], {
            reason: "two_passes_same_day",
            date: group.date,
          }),
        );
      }
      seen.add(key);
    }
  }
  return issues;
}

// Counts membership from the raw groups, so one bad group doesn't also flag
// its valid members as ungrouped.
function checkEveryFamilyEntryIsGrouped(
  groups: readonly FamilyGroupInput[],
  attendees: ReadonlyMap<string, AttendeeCore>,
) {
  const grouped = new Set(groups.flatMap((g) => g.attendeeClientIds));
  return [...attendees.values()]
    .filter((a) => a.entry.kind === "family_pass" && !grouped.has(a.clientId))
    .map((a) =>
      issue("FAMILY_PASS_COMPOSITION", ["attendees", a.index, "entry"], { reason: "not_in_group" }),
    );
}
