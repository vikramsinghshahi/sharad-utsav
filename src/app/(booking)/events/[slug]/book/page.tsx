import type { Metadata } from "next";
import { BookingFlow } from "@/features/booking/booking-flow";

export const metadata: Metadata = { title: "Book tickets — Sharad Utsav 2026" };

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingFlow slug={slug} />;
}
