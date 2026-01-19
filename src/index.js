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

    // POST /api/feedback
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

    // POST /api/summarize
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

        const summary =
          aiResponse?.response || "Summary unavailable";

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

    // GET /debug/feedback
    if (pathname === "/debug/feedback") {
      const { results } = await env.feedback_db
        .prepare("SELECT * FROM feedback")
        .run();

      return Response.json({
        rows: results,
        count: results.length,
      });
    }

    return new Response(
      "OK. Try POST /api/feedback, POST /api/summarize, or GET /debug/feedback",
      { status: 200 }
    );
  },
};
