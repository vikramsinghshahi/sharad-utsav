import { z } from "zod";

// <5 | 5–11 | 12+ (SPEC §5.1)
export const AGE_BANDS = ["infant", "child", "adult"] as const;
export const ageBandSchema = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof ageBandSchema>;
