import type { Metadata } from "next";
import { ConfirmationView } from "@/features/booking/confirmation-view";

export const metadata: Metadata = {
  title: "Your booking — Sharad Utsav 2026",
  // The token in the URL is a secret: keep these pages out of search engines.
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function BookingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { token } = await searchParams;
  return <ConfirmationView id={id} token={typeof token === "string" ? token : ""} />;
}
