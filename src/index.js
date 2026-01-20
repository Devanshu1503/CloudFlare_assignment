/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

/**
 * Cloudflare Workers – Feedback Summarizer Prototype
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    /**
     * Root UI – simple HTML viewer
     */
    if (pathname === "/") {
      const { results } = await env.feedback_db
        .prepare(
          "SELECT content, summary, summarized, created_at FROM feedback ORDER BY created_at DESC LIMIT 10"
        )
        .run();

      const rows = results.length
        ? results
            .map(
              (r) => `
              <div style="margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid #ddd;">
                <div><strong>Feedback:</strong> ${r.content}</div>
                <div><strong>Summary:</strong> ${
                  r.summarized ? r.summary : "<em>Not summarized yet</em>"
                }</div>
              </div>
            `
            )
            .join("")
        : "<p>No feedback submitted yet.</p>";

      return new Response(
        `
        <html>
          <head>
            <title>Feedback Summarizer Prototype</title>
          </head>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2>Cloudflare Feedback Summarizer Prototype</h2>

            <p>
              This prototype collects user feedback, stores it in a D1 database,
              and uses Workers AI to generate short summaries.
            </p>

            <h3>Recent Feedback</h3>
            ${rows}

            <h3>How to Use</h3>
            <pre>
POST /api/feedback
POST /api/summarize
GET  /debug/feedback
            </pre>

            <p>
              This UI is  minimal and is meant to surface backend behavior. Thanks for visiting!
            </p>
          </body>
        </html>
        `,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    /**
     * POST /api/feedback
     */
    if (pathname === "/api/feedback" && request.method === "POST") {
      const body = await request.json();
      const { source, content } = body;

      if (!content) {
        return new Response(
          JSON.stringify({ error: "content is required" }),
          { status: 400 }
        );
      }

      const createdAt = new Date().toISOString();

      await env.feedback_db
        .prepare(
          "INSERT INTO feedback (source, content, created_at) VALUES (?, ?, ?)"
        )
        .bind(source || "unknown", content, createdAt)
        .run();

      return new Response(JSON.stringify({ success: true }), { status: 201 });
    }

    /**
     * POST /api/summarize
     */
    if (pathname === "/api/summarize" && request.method === "POST") {
      const { results } = await env.feedback_db
        .prepare(
          "SELECT id, content FROM feedback WHERE summarized = 0 LIMIT 5"
        )
        .run();

      let summarizedCount = 0;

      for (const row of results) {
        const aiResponse = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct",
          {
            prompt: `Summarize this user feedback in one concise sentence:\n\n${row.content}`,
          }
        );

        const summary = aiResponse?.response || "Summary unavailable";

        await env.feedback_db
          .prepare(
            "UPDATE feedback SET summary = ?, summarized = 1 WHERE id = ?"
          )
          .bind(summary, row.id)
          .run();

        summarizedCount++;
      }

      return new Response(
        JSON.stringify({ summarized: summarizedCount }),
        { status: 200 }
      );
    }

    /**
     * GET /debug/feedback
     */
    if (pathname === "/debug/feedback") {
      const { results } = await env.feedback_db
        .prepare("SELECT * FROM feedback")
        .run();

      return Response.json({
        rows: results,
        count: results.length,
      });
    }

    /**
     * Fallback
     */
    return new Response(
      "Not found. Visit / for UI or use API endpoints.",
      { status: 404 }
    );
  },
};
