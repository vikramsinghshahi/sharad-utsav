import { randomUUID } from "node:crypto";
import type { PaymentProvider } from "@/application/ports";

// Stand-in for a card processor (the brief allows a simulated payment). Stripe
// test mode would be another PaymentProvider with the same interface.
export const simulatedPayments: PaymentProvider = {
  name: "simulated",
  async charge({ simulate }) {
    return {
      status: simulate === "succeed" ? "succeeded" : "declined",
      providerRef: `sim_${randomUUID()}`,
    };
  },
};
