import { withRls } from "@/lib/db";
import { errorResponse, requireSession, type Session } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Stage = "uploaded" | "transcribed" | "embedded" | "tagged" | "ready" | "failed";

type StageRow = {
  id: string;
  status: "processing" | "ready" | "failed";
  kind: string;
  body: string | null;
  title: string | null;
  blob_url: string | null;
  duration_ms: number | null;
  captured_at: Date;
  created_at: Date;
  transcript_text: string | null;
  chunk_count: number;
  tag_count: number;
};

async function readStage(
  captureId: string,
  session: Session,
): Promise<{
  stage: Stage;
  status: "processing" | "ready" | "failed";
  capture: StageRow | null;
}> {
  const row = await withRls(session.user_id, session.role, async (tx) => {
    const [r] = await tx<StageRow[]>`
      SELECT c.id, c.status, c.kind, c.body, c.title, c.blob_url,
             c.duration_ms, c.captured_at, c.created_at,
             t.text AS transcript_text,
             (SELECT COUNT(*)::int FROM transcript_chunks tc WHERE tc.capture_id = c.id) AS chunk_count,
             (SELECT COUNT(*)::int FROM capture_tags ct WHERE ct.capture_id = c.id)      AS tag_count
      FROM captures c
      LEFT JOIN transcripts t ON t.capture_id = c.id
      WHERE c.id = ${captureId}
    `;
    return r;
  });

  if (!row) return { stage: "failed", status: "failed", capture: null };
  if (row.status === "failed") {
    return { stage: "failed", status: "failed", capture: row };
  }
  if (row.status === "ready") {
    return { stage: "ready", status: "ready", capture: row };
  }
  if (row.tag_count > 0) return { stage: "tagged", status: row.status, capture: row };
  if (row.chunk_count > 0) return { stage: "embedded", status: row.status, capture: row };
  if (row.transcript_text) return { stage: "transcribed", status: row.status, capture: row };
  return { stage: "uploaded", status: row.status, capture: row };
}

/**
 * GET /api/capture/[id]/status
 *
 * Server-Sent Events. Emits one event per stage transition until
 * `ready` or `failed`. 60 s safety-net timeout.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };

        let lastStage: Stage | null = null;
        const start = Date.now();

        while (Date.now() - start < 60_000) {
          const { stage, status, capture } = await readStage(id, session);
          if (stage !== lastStage) {
            lastStage = stage;
            send("stage", { stage });
            if (stage === "transcribed" && capture?.transcript_text) {
              send("transcript", { text: capture.transcript_text });
            }
            if (stage === "tagged" || stage === "ready") {
              const tags = await withRls(
                session.user_id,
                session.role,
                (tx) => tx<{ kind: string; value: string }[]>`
                  SELECT kind, value FROM capture_tags WHERE capture_id = ${id}
                `,
              );
              send("tags", { tags });
            }
          }
          if (status === "ready") {
            // Augment the capture with a transcript_snippet so the
            // client can render it in the home row immediately.
            const augmented = capture
              ? {
                  ...capture,
                  transcript_snippet:
                    (capture.body ?? capture.transcript_text ?? "").slice(0, 240) ||
                    null,
                }
              : null;
            send("ready", { capture: augmented });
            controller.close();
            return;
          }
          if (status === "failed") {
            send("error", { message: "Pipeline failed" });
            controller.close();
            return;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        send("error", { message: "timeout" });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
