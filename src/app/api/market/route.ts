import { connection } from "next/server";
import { liveQuotes, upstoxDisplayAllowed } from "@/lib/providers/upstox";

/** Live market quotes for the ticker and home panel. Runs at request time; never prerendered or cached. */
export async function GET() {
  await connection();

  if (!upstoxDisplayAllowed()) {
    return Response.json({ enabled: false }, { status: 403 });
  }

  try {
    const quotes = await liveQuotes();
    return Response.json(
      { enabled: true, source: "Upstox", fetchedAt: new Date().toISOString(), quotes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[market] ", e);
    return Response.json({ enabled: true, error: "Live quotes are unavailable right now." }, { status: 502 });
  }
}
