import Link from "next/link";
import { DiyaIcon } from "@/features/booking/components/diya-icon";

const BOOKING_PATH = "/events/sharad-utsav-2026/book";
const FESTIVAL_DAYS = [
  ["Tue", "10"],
  ["Wed", "11"],
  ["Thu", "12"],
  ["Fri", "13"],
  ["Sat", "14"],
] as const;

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
      <div className="flex items-center gap-2" aria-hidden="true">
        <DiyaIcon lit />
        <DiyaIcon lit />
        <DiyaIcon lit />
      </div>
      <p className="mt-6 text-sm font-medium tracking-[0.2em] text-bright-gold uppercase">
        Radha Krishna Temple · Allen, Texas
      </p>
      <h1 className="mt-3 font-serif text-5xl leading-[1.05] font-semibold sm:text-7xl">
        Sharad Utsav 2026
      </h1>
      <p className="mt-4 max-w-xl text-lg text-white/85">
        Five evenings of garba, dandiya and devotion, Tuesday 10 to Saturday 14 November. Book for
        the whole family in a few minutes — grandparents and little ones included.
      </p>

      <ol aria-label="Festival evenings" className="mt-8 grid max-w-md grid-cols-5 gap-2">
        {FESTIVAL_DAYS.map(([weekday, day]) => (
          <li
            key={day}
            className="flex flex-col items-center rounded-xl border border-bright-gold/50 py-2 leading-tight"
          >
            <span className="text-xs text-white/80">{weekday}</span>
            <span className="font-serif text-2xl font-semibold text-bright-gold lining-nums">
              {day}
            </span>
            <span className="text-xs text-white/80">Nov</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Link
          href={BOOKING_PATH}
          className="inline-flex min-h-12 items-center rounded-xl bg-primary px-6 py-3 text-lg font-semibold text-heading transition-colors hover:bg-bright-gold"
        >
          Book tickets
        </Link>
        <p className="text-sm text-white/75">Under-5s come free</p>
      </div>

      <dl className="mt-14 grid gap-6 border-t border-line pt-8 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-serif text-xl font-semibold text-white">Day passes</dt>
          <dd className="mt-1 text-white/80">From $8 for children and $15 for adults, per day.</dd>
        </div>
        <div>
          <dt className="font-serif text-xl font-semibold text-white">Family pass</dt>
          <dd className="mt-1 text-white/80">$40 a day for up to 2 adults and 2 children.</dd>
        </div>
        <div>
          <dt className="font-serif text-xl font-semibold text-white">Extras</dt>
          <dd className="mt-1 text-white/80">
            Dinner plates, the Garba workshop and dandiya sticks.
          </dd>
        </div>
      </dl>
    </main>
  );
}
