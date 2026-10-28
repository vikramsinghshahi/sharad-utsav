// Stable rule-violation codes (SPEC §5). The UI maps each code to a friendly
// message; tests assert on codes, never on message text.
export const DOMAIN_ERROR_CODES = [
  // age (§5.1)
  "INVALID_DOB",
  "INFANT_MUST_NOT_HAVE_TICKET",
  "AGE_BAND_MISMATCH",
  "BOOKER_UNDER_18",
  // entry (§5.2)
  "ENTRY_REQUIRED",
  "INVALID_DAYS",
  "FAMILY_PASS_COMPOSITION",
  "DAY_NOT_ON_SALE",
  "PRODUCT_UNAVAILABLE",
  "EMPTY_BOOKING",
  "CHILD_UNACCOMPANIED",
  "GROUP_TOO_LARGE",
  "DUPLICATE_ID",
  "UNKNOWN_ATTENDEE",
  // extras (§5.3)
  "EXTRA_REQUIRES_ENTRY",
  "EXTRA_DAY_NOT_ALLOWED",
  "QUANTITY_OUT_OF_RANGE",
  "INVALID_QUANTITY",
  "EXTRA_AGE_NOT_ALLOWED",
  // stock (§5.4)
  "SOLD_OUT",
  "INSUFFICIENT_STOCK",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

// Where in the request the problem is, e.g. ["attendees", 2, "dateOfBirth"].
export type IssuePath = (string | number)[];

export interface DomainIssue {
  code: DomainErrorCode;
  path: IssuePath;
  // Values the UI can interpolate into its message (names, ages, dates).
  params?: Record<string, string | number>;
}

export function issue(
  code: DomainErrorCode,
  path: IssuePath = [],
  params?: Record<string, string | number>,
): DomainIssue {
  return params === undefined ? { code, path } : { code, path, params };
}
