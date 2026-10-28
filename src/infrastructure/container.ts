import { createUseCases, type Dependencies, type UseCases } from "@/application";
import { getDb, type Db } from "./db/client";
import { simulatedPayments } from "./payments/simulated";
import { bookingRepository } from "./repositories/booking-repository";
import { catalogRepository } from "./repositories/catalog-repository";
import { idempotencyStore } from "./repositories/idempotency-store";
import { promoRepository } from "./repositories/promo-repository";
import { nodeSecrets } from "./security/secrets";
import { systemClock } from "./system-clock";

// Composition root: the one place that picks concrete adapters for each port.
export function createDependencies(db: Db, overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    clock: systemClock,
    catalogs: catalogRepository(db),
    promos: promoRepository(db),
    bookings: bookingRepository(db),
    payments: simulatedPayments,
    secrets: nodeSecrets,
    idempotency: idempotencyStore(db),
    ...overrides,
  };
}

let cached: UseCases | undefined;

export function getUseCases(): UseCases {
  cached ??= createUseCases(createDependencies(getDb()));
  return cached;
}
