// Site-wide identity, set per deployment (NEXT_PUBLIC_* values are inlined at build
// time). Everything about a particular event comes from the API, not from here.
export const SITE = {
  name: process.env.NEXT_PUBLIC_SITE_NAME ?? "Festival tickets",
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ??
    "Book festival tickets for the whole family in a few minutes.",
} as const;
