import type { Dispatch } from "react";
import type { CatalogResponse } from "@/contracts/responses";
import type { IsoDate } from "@/domain/calendar";
import type { QuoteState } from "../api/use-quote";
import type { Action, BookingState } from "../state/types";

// What every step screen receives from the flow.
export interface StepProps {
  state: BookingState;
  dispatch: Dispatch<Action>;
  catalog: CatalogResponse;
  quote: QuoteState;
  today: IsoDate;
  errorsFor: (fieldId: string) => readonly string[];
}
