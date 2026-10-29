import { ExtraSection } from "../components/extra-section";
import { errorIdFor, FieldError } from "../components/field-error";
import { priceLabel } from "../components/price-label";
import { QuantityStepper } from "../components/quantity-stepper";
import { fieldIds } from "../state/field-targets";
import { attendeeExtraProducts, bookingExtraProducts } from "../state/selectors";
import type { StepProps } from "./step-props";
import { useEvent } from "../components/event-context";

const LOW_STOCK = 10;

// Step 3: optional extras. Everything here can be skipped.
export function ExtrasStep({ state, dispatch, catalog, errorsFor }: StepProps) {
  const { currency } = useEvent();
  const perPerson = attendeeExtraProducts(catalog);
  const perBooking = bookingExtraProducts(catalog);

  return (
    <div className="space-y-5">
      <p className="text-white/85">
        All optional. Each person can add extras on the days they&apos;re coming. Under-5s can have
        dinner on the days an adult from your group comes.
      </p>

      {perPerson.map((product) => (
        <ExtraSection
          key={product.id}
          product={product}
          state={state}
          dispatch={dispatch}
          errorsFor={errorsFor}
        />
      ))}

      {perBooking.map((product) => {
        const fieldId = fieldIds.bookingExtra(product.id);
        const errors = errorsFor(fieldId);
        const quantity = state.bookingExtras.find((e) => e.productId === product.id)?.quantity ?? 0;
        const max = Math.max(
          0,
          Math.min(product.rule.maxPerBooking ?? product.remaining, product.remaining),
        );
        const hintId = `${fieldId}-hint`;
        return (
          <section
            key={product.id}
            aria-labelledby={`${fieldId}-title`}
            className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`${fieldId}-title`} className="font-serif text-2xl font-semibold">
                {product.displayName}
              </h3>
              <p className="text-sm tabular-nums text-bright-gold">
                {priceLabel(product, currency)}
              </p>
            </div>
            <p id={hintId} className="mt-1 text-sm text-white/80">
              For the whole group, up to {product.rule.maxPerBooking ?? max} per booking.
              {product.soldOut
                ? " Sold out."
                : product.remaining <= LOW_STOCK
                  ? ` Only ${product.remaining} left.`
                  : ""}
            </p>
            <div className="mt-3">
              <QuantityStepper
                id={fieldId}
                label={product.displayName}
                value={quantity}
                max={max}
                describedBy={errors.length > 0 ? `${hintId} ${errorIdFor(fieldId)}` : hintId}
                onChange={(value) =>
                  dispatch({ type: "SET_EXTRA_QUANTITY", productId: product.id, quantity: value })
                }
              />
            </div>
            <FieldError id={errorIdFor(fieldId)} messages={errors} />
          </section>
        );
      })}
    </div>
  );
}
