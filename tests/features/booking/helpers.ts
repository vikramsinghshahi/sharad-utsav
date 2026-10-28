import { bookingReducer, initialBookingState } from "@/features/booking/state/reducer";
import type { Action, BookingState, FestivalInfo } from "@/features/booking/state/types";

// Product ids are opaque to the reducer; what matters is the band each pass is for.
export const IDS = {
  dayAdult: "p-day-adult",
  dayChild: "p-day-child",
  allDaysChild: "p-all-child",
  family: "p-family",
  dinner: "p-dinner",
  garba: "p-garba",
  dandiya: "p-dandiya",
};

export const FESTIVAL: FestivalInfo = {
  firstDay: "2026-11-10",
  days: ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"],
  passBands: { [IDS.dayAdult]: "adult", [IDS.dayChild]: "child", [IDS.allDaysChild]: "child" },
  extraMinBands: { [IDS.garba]: "child" },
  familyCovers: { [IDS.family]: { adult: 2, child: 2 } },
};

export const DOB = { adult40: "1986-05-01", child7: "2019-03-15", toddler2: "2024-01-20" };

export function run(actions: Action[], from?: BookingState): BookingState {
  const start = from ?? bookingReducer(initialBookingState(), { type: "RESTORE", saved: null });
  return actions.reduce(bookingReducer, start);
}

export function person(clientId: string, firstName: string, dateOfBirth: string): Action[] {
  return [
    { type: "ADD_ATTENDEE", clientId },
    { type: "SET_NAME", clientId, field: "firstName", value: firstName },
    { type: "SET_NAME", clientId, field: "lastName", value: "Sharma" },
    { type: "SET_DOB", clientId, dateOfBirth },
  ];
}

export const loaded: Action = { type: "CATALOG_LOADED", festival: FESTIVAL };
