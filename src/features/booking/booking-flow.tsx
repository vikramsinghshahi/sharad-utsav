"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CatalogResponse } from "@/contracts/responses";
import { todayIn } from "@/domain/calendar";
import { useCatalog } from "./api/use-catalog";
import { useCheckout } from "./api/use-checkout";
import { useOnlineStatus } from "./api/use-online-status";
import { useQuote, type QuoteState } from "./api/use-quote";
import { ErrorSummary, type SummaryItem } from "./components/error-summary";
import { NoticeList } from "./components/notice-list";
import { OfflineBanner } from "./components/offline-banner";
import { Skeleton } from "./components/skeleton";
import { Stepper } from "./components/stepper";
import { StickySummary, type PrimaryAction } from "./components/sticky-summary";
import { STEP_HEADING_ID } from "./state/field-targets";
import { bookingReducer, initialBookingState } from "./state/reducer";
import { festivalInfo } from "./state/selectors";
import { issuesUpTo, localIssues, problemIssues, type StepIssue } from "./state/step-checks";
import { clearDraft, loadDraft, saveDraft, toPersisted } from "./state/storage";
import { toBookingDraft } from "./state/to-request";
import { STEP_TITLES, STEPS, type BookingState, type Step } from "./state/types";
import { ExtrasStep } from "./steps/extras-step";
import { PassesStep } from "./steps/passes-step";
import { PayStep } from "./steps/pay-step";
import { ReviewStep } from "./steps/review-step";
import type { StepProps } from "./steps/step-props";
import { WhoStep } from "./steps/who-step";
import { EventProvider } from "./components/event-context";

export function BookingFlow({ slug }: { slug: string }) {
  const { state: catalogState, reload } = useCatalog(slug);

  if (catalogState.status === "loading") return <FlowSkeleton />;
  if (catalogState.status === "not_found") {
    return (
      <Message title="We couldn't find that event">
        Please check the link, or go back to the{" "}
        <Link href="/" className="text-gold-ink underline">
          home page
        </Link>
        .
      </Message>
    );
  }
  if (catalogState.status === "error") {
    return (
      <Message title="We couldn't load tickets">
        {catalogState.network ? "You seem to be offline. " : "Something went wrong on our side. "}
        <button type="button" onClick={reload} className="text-gold-ink underline">
          Try again
        </button>
      </Message>
    );
  }
  return <Flow slug={slug} catalog={catalogState.catalog} reloadCatalog={reload} />;
}

interface FlowProps {
  slug: string;
  catalog: CatalogResponse;
  reloadCatalog: () => void;
}

function Flow({ slug, catalog, reloadCatalog }: FlowProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(bookingReducer, undefined, initialBookingState);
  // Which step's problems are on show (set when "Next" finds some). UI-only.
  // Plus who was in the group at that moment: a card added afterwards stays calm until
  // its own "Next".
  const [shown, setShown] = useState<{ step: Step; clientIds: string[] } | null>(null);
  const setErrorsShownFor = (step: Step | null) =>
    setShown(step === null ? null : { step, clientIds: state.attendees.map((a) => a.clientId) });
  // Bumped when "Next" is blocked, so the error summary takes focus again. UI-only.
  const [focusRequest, setFocusRequest] = useState(0);
  const online = useOnlineStatus();
  const today = todayIn(catalog.event.timezone, new Date());

  // Restore the draft after a refresh, then keep saving it.
  useEffect(() => {
    dispatch({ type: "RESTORE", saved: loadDraft(slug) });
  }, [slug]);
  useEffect(() => {
    if (state.hydrated) saveDraft(slug, toPersisted(state));
  }, [slug, state]);

  useEffect(() => {
    dispatch({ type: "CATALOG_LOADED", festival: festivalInfo(catalog) });
  }, [catalog]);

  const draft = useMemo(
    () => (state.hydrated && state.attendees.length > 0 ? toBookingDraft(state) : null),
    [state],
  );
  const { state: quote, retry: retryQuote } = useQuote(slug, draft);

  // Back online: refresh prices and stock straight away.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) retryQuote();
    wasOnline.current = online;
  }, [online, retryQuote]);

  const onConfirmed = useCallback(
    (bookingId: string, accessToken: string) => {
      router.push(`/bookings/${bookingId}?token=${encodeURIComponent(accessToken)}`);
      clearDraft(slug);
      dispatch({ type: "BOOKING_FINISHED" });
    },
    [router, slug],
  );
  const onHoldExpired = useCallback(() => dispatch({ type: "HOLD_RELEASED" }), []);

  const checkout = useCheckout({
    slug,
    state,
    dispatch,
    reviewedTotalCents: quote.status === "ready" ? quote.quote.totalCents : null,
    onConfirmed,
    onCatalogChanged: reloadCatalog,
  });

  // ---------- problems ----------

  const serverIssues = useMemo((): StepIssue[] => {
    const fromCreate =
      state.error?.kind === "problem" && (state.error.details ?? []).length > 0
        ? problemIssues(state, {
            type: "",
            title: state.error.title,
            status: 422,
            code: "",
            details: state.error.details,
          })
        : [];
    const fromQuote =
      quote.status === "invalid" ? problemIssues(state, quote.problem, catalog) : [];
    return [...fromCreate, ...fromQuote];
  }, [state, quote, catalog]);

  // A quote that hit a stock conflict means our catalog is out of date: refresh it once
  // per conflicting draft, so the message can name what ran out.
  const stockConflictKey =
    quote.status === "invalid" &&
    (quote.problem.code === "SOLD_OUT" || quote.problem.code === "INSUFFICIENT_STOCK")
      ? quote.key
      : null;
  const reloadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (stockConflictKey === null || reloadedFor.current === stockConflictKey) return;
    reloadedFor.current = stockConflictKey;
    reloadCatalog();
  }, [stockConflictKey, reloadCatalog]);

  // The friendlier local message wins when both sides flag the same field.
  const blockingIssues = (step: Step) => {
    const local = localIssues(state, step, today);
    const flagged = new Set(local.map((i) => i.fieldId));
    const server = issuesUpTo(serverIssues, step).filter((i) => !flagged.has(i.fieldId));
    return dedupe([...local, ...server]);
  };

  // Server news (something sold out) shows on its own step and after, without a "Next".
  const persistent = issuesUpTo(
    serverIssues.filter((i) => i.persistent),
    state.step,
  );
  const visibleIssues: StepIssue[] = dedupe(
    shown?.step === state.step
      ? [
          ...persistent,
          ...blockingIssues(state.step).filter(
            (i) => i.clientId === undefined || shown.clientIds.includes(i.clientId),
          ),
        ]
      : state.step === "review" || (state.step === "pay" && state.error?.kind === "problem")
        ? issuesUpTo(serverIssues, state.step)
        : persistent,
  );

  const errorsFor = (fieldId: string) =>
    visibleIssues.filter((i) => i.fieldId === fieldId).map((i) => i.message);

  // ---------- navigation & focus ----------

  const pendingFocus = useRef<string | null>(null);
  const previousStep = useRef<Step | null>(null);
  useEffect(() => {
    if (!state.hydrated) return;
    if (previousStep.current !== null && previousStep.current !== state.step) {
      const target = pendingFocus.current ?? STEP_HEADING_ID;
      pendingFocus.current = null;
      window.scrollTo({ top: 0 });
      document.getElementById(target)?.focus();
    }
    previousStep.current = state.step;
  }, [state.step, state.hydrated]);

  const goTo = (step: Step) => {
    setErrorsShownFor(null);
    dispatch({ type: "GO_TO_STEP", step });
  };

  const goToIssue = (item: SummaryItem) => {
    const issue = visibleIssues.find((i) => i.fieldId === item.fieldId);
    if (!issue || issue.step === state.step) return false;
    pendingFocus.current = issue.fieldId;
    setErrorsShownFor(issue.step);
    dispatch({ type: "GO_TO_STEP", step: issue.step });
    return true;
  };

  const next = () => {
    const step = state.step;
    if (blockingIssues(step).length > 0) {
      setErrorsShownFor(step);
      setFocusRequest((n) => n + 1);
      return;
    }
    if (step === "pay") {
      setErrorsShownFor(null);
      void checkout.continueToPayment();
      return;
    }
    const following = STEPS[STEPS.indexOf(step) + 1];
    if (following) goTo(following);
  };

  const action = primaryAction(state, quote, next);

  const stepProps: StepProps = { state, dispatch, catalog, quote, today, errorsFor };
  const stepIndex = STEPS.indexOf(state.step);

  return (
    <EventProvider value={catalog.event}>
      <OfflineBanner
        online={online}
        requestFailed={quote.status === "error" && quote.network}
        onRetry={() => {
          retryQuote();
          reloadCatalog();
        }}
      />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-36 sm:px-6 lg:pb-16">
        <header className="no-print mb-6 flex flex-wrap items-end justify-between gap-2">
          <div>
            <Link
              href="/"
              className="font-serif text-2xl font-semibold text-gold-ink hover:text-gold-ink"
            >
              {catalog.event.name}
            </Link>
            {catalog.event.venue && <p className="text-sm text-ink/75">{catalog.event.venue}</p>}
          </div>
        </header>

        <Stepper current={state.step} furthest={state.furthestStep} onGo={goTo} />

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,720px)_minmax(300px,1fr)] lg:items-start">
          <main className="min-w-0 space-y-5">
            <div>
              <p className="text-sm text-gold-ink lg:hidden">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <h2
                id={STEP_HEADING_ID}
                tabIndex={-1}
                className="font-serif text-[2rem] leading-tight font-semibold focus-visible:outline-none sm:text-4xl"
              >
                {STEP_TITLES[state.step]}
              </h2>
            </div>

            {!state.hydrated ? (
              <Skeleton className="h-40 w-full rounded-2xl" />
            ) : (
              <>
                <ErrorSummary
                  focusRequest={focusRequest}
                  fallbackFocusId={STEP_HEADING_ID}
                  items={visibleIssues.map((i) => ({
                    fieldId: i.fieldId,
                    message: i.message,
                    ...(i.fix
                      ? {
                          fixLabel: i.fix.label,
                          onFix: () => i.fix?.actions.forEach((a) => dispatch(a)),
                        }
                      : {}),
                  }))}
                  onSelect={goToIssue}
                />
                <NoticeList
                  notices={state.notices}
                  onDismiss={(id) => dispatch({ type: "DISMISS_NOTICE", id })}
                />
                {state.step === "who" && <WhoStep {...stepProps} />}
                {state.step === "passes" && <PassesStep {...stepProps} />}
                {state.step === "extras" && <ExtrasStep {...stepProps} />}
                {state.step === "review" && <ReviewStep {...stepProps} />}
                {state.step === "pay" && (
                  <PayStep
                    {...stepProps}
                    onPay={(outcome) => void checkout.pay(outcome)}
                    onHoldExpired={onHoldExpired}
                    onAddBookerAsAttendee={() => {
                      dispatch({
                        type: "ADD_ATTENDEE",
                        clientId: crypto.randomUUID(),
                        prefill: {
                          firstName: state.booker.firstName,
                          lastName: state.booker.lastName,
                          dateOfBirth: state.booker.dateOfBirth,
                        },
                      });
                      goTo("passes");
                    }}
                  />
                )}
                {stepIndex > 0 && !state.hold && (
                  <button
                    type="button"
                    onClick={() => goTo(STEPS[stepIndex - 1] ?? "who")}
                    className="no-print text-sm text-ink/80 underline-offset-4 hover:text-gold-ink hover:underline"
                  >
                    ← Back to {STEP_TITLES[STEPS[stepIndex - 1] ?? "who"]}
                  </button>
                )}
              </>
            )}
          </main>

          <StickySummary
            quote={
              state.hold?.quote
                ? { status: "ready", quote: state.hold.quote, key: state.hold.bookingId }
                : quote
            }
            catalog={catalog}
            state={state}
            action={state.hydrated ? action : null}
            onRetryQuote={retryQuote}
            totalsOnly={state.step === "review"}
          />
        </div>
      </div>
    </EventProvider>
  );
}

function primaryAction(
  state: BookingState,
  quote: QuoteState,
  next: () => void,
): PrimaryAction | null {
  const following = STEPS[STEPS.indexOf(state.step) + 1];
  const checking = quote.status === "loading" && state.step !== "who";
  if (state.step === "pay") {
    // The payment panel holds the Pay and decline buttons; a second Pay here would only confuse.
    if (state.hold) return null;
    // A $0 booking confirms straight away (D10): there is no payment to continue to.
    const free = quote.status === "ready" && quote.quote.totalCents === 0;
    const creating = state.inFlight === "create";
    return {
      label: free
        ? creating
          ? "Confirming…"
          : "Confirm booking"
        : creating
          ? "Holding your places…"
          : "Continue to payment",
      onClick: next,
      busy: state.inFlight === "create",
      disabled: checking,
    };
  }
  return {
    label: checking ? "Checking prices…" : `Next: ${following ? STEP_TITLES[following] : ""}`,
    onClick: next,
    disabled: checking,
  };
}

function dedupe(issues: StepIssue[]): StepIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.fieldId}|${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function FlowSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl px-4 pt-6 sm:px-6"
      aria-busy="true"
      aria-label="Loading tickets"
    >
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-64" />
      <Skeleton className="mt-8 h-3 w-full" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,720px)_minmax(300px,1fr)]">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <Skeleton className="hidden h-72 rounded-2xl lg:block" />
      </div>
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-4">
      <h1 className="font-serif text-4xl font-semibold">{title}</h1>
      <p className="mt-3 text-ink/85">{children}</p>
    </main>
  );
}
