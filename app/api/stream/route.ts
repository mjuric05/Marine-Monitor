import { subscribe, lastSnapshot } from "@/lib/bus";
import type { Snapshot } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-Sent Events: gura svaki novi snapshot povezanim preglednicima.
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (snap: Snapshot) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(snap)}\n\n`));
        } catch {
          /* veza zatvorena */
        }
      };

      // Pošalji zadnje poznato stanje odmah po spajanju.
      const last = lastSnapshot();
      if (last) send(last);

      const unsubscribe = subscribe(send);

      // Periodični "keep-alive" komentar da veza ostane otvorena kroz proxy.
      const ka = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          /* veza zatvorena */
        }
      }, 15000);

      cleanup = () => {
        clearInterval(ka);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* već zatvoreno */
        }
      };

      // Zatvori kad preglednik prekine vezu.
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
