import { EventList } from "@/features/events/event-list";
import { SITE } from "@/lib/site";

// Landing page: the site name, then whatever events exist (from the API).
export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="font-serif text-2xl font-semibold text-primary">{SITE.name}</h1>
      <p className="mt-1 text-white/80">{SITE.description}</p>
      <EventList />
    </main>
  );
}
