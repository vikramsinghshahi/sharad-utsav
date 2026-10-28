import {
  ADULT_PRICE_MIN_AGE,
  CHILD_MIN_AGE,
  RESPONSIBLE_ADULT_MIN_AGE,
  type AgeBand,
} from "@/domain/age";

// Age wording built from the domain's age rules, so changing a band boundary
// (e.g. children from 4) changes every label with it.
export const BAND_LABEL: Record<AgeBand, string> = {
  adult: "Adult",
  child: "Child",
  infant: `Under ${CHILD_MIN_AGE}`,
};

export const BAND_RANGE: Record<AgeBand, string> = {
  adult: `${ADULT_PRICE_MIN_AGE}+`,
  child: `${CHILD_MIN_AGE}–${ADULT_PRICE_MIN_AGE - 1}`,
  infant: `under ${CHILD_MIN_AGE}`,
};

export const RESPONSIBLE_AGE = `${RESPONSIBLE_ADULT_MIN_AGE}`;
