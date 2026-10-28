import type { Dispatch } from "react";
import type { CatalogResponse, QuoteResponse } from "@/contracts/responses";
import { formatDay } from "../format";
import {
  ageInfo,
  canSplitFamilyGroup,
  dayPassFor,
  firstNameOf,
  productById,
} from "../state/selectors";
import type { Action, BookingState } from "../state/types";
import { Money } from "./money";
import { secondaryButton } from "./styles";

interface Props {
  suggestion: QuoteResponse["suggestions"][number];
  catalog: CatalogResponse;
  state: BookingState;
  dispatch: Dispatch<Action>;
  // The card disappears once applied, so the caller moves focus somewhere sensible.
  onApplied: () => void;
}

// D3 / D4: the server spots a cheaper option; the customer decides with one click.
export function SuggestionCard({ suggestion, catalog, state, dispatch, onApplied }: Props) {
  if (suggestion.code === "SWITCH_TO_ALL_DAYS") {
    const attendee = state.attendees.find((a) => a.clientId === suggestion.attendeeClientId);
    const product = productById(catalog, suggestion.toProductId);
    if (!attendee || !product) return null;
    return (
      <Wrapper>
        <p>
          {firstNameOf(attendee)} has day passes for every day. The {product.displayName} covers all
          five days for less.
        </p>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            dispatch({
              type: "SET_ENTRY",
              clientId: attendee.clientId,
              entry: { kind: "all_days", productId: product.id },
            });
            onApplied();
          }}
        >
          <span>
            Save <Money cents={suggestion.savingsCents} /> with the {product.displayName}
          </span>
        </button>
      </Wrapper>
    );
  }

  const group = state.familyGroups.find((g) => g.id === suggestion.familyGroupId);
  if (!group) return null;
  const festival = state.festival;
  const passes = group.attendeeClientIds.flatMap((clientId) => {
    const attendee = state.attendees.find((a) => a.clientId === clientId);
    const band =
      attendee && festival ? ageInfo(attendee.dateOfBirth, festival.firstDay)?.band : undefined;
    const product = band && band !== "infant" ? dayPassFor(catalog, band) : undefined;
    return product ? [{ clientId, productId: product.id }] : [];
  });
  const canSplit =
    canSplitFamilyGroup(state, group.id) && passes.length === group.attendeeClientIds.length;

  return (
    <Wrapper>
      <p>
        For this group on {formatDay(group.date)}, separate day passes would cost{" "}
        <Money cents={suggestion.savingsCents} /> less than the family pass.
        {!canSplit && " Some of them have family passes on other days too, so change those first."}
      </p>
      {canSplit && (
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            dispatch({ type: "SPLIT_FAMILY_GROUP", id: group.id, passes });
            onApplied();
          }}
        >
          <span>
            Switch to day passes and save <Money cents={suggestion.savingsCents} />
          </span>
        </button>
      )}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rise-in flex flex-col gap-3 rounded-xl border border-bright-gold/60 bg-bright-gold/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  );
}
