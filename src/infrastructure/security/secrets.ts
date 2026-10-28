import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Secrets } from "@/application/ports";

// No 0/O or 1/I, so codes can be read out loud at the door.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const nodeSecrets: Secrets = {
  newId: () => randomUUID(),

  newAccessToken() {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: sha256(token) };
  },

  // Constant-time comparison so response timing can't leak the stored hash.
  tokenMatches(token, storedHash) {
    const actual = Buffer.from(sha256(token), "hex");
    const expected = Buffer.from(storedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  },

  newConfirmationCode() {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return `SU-${code}`;
  },
};
