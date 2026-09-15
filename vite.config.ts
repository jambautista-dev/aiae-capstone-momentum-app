import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

type AzureConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
};

// The client sends content in the same shape App.tsx always used internally:
// a string, or an array of { type: "text", text } / { type: "image", source }
// blocks. Convert that to the OpenAI chat content shape Azure expects.
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function toOpenAiContent(content: unknown): unknown {
  if (typeof content === "string" || !Array.isArray(content)) return content;
  return (content as ContentBlock[]).map((b) =>
    b.type === "image"
      ? { type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }
      : { type: "text", text: b.text }
  );
}

async function forwardToAzureOpenAI(config: AzureConfig, content: unknown, maxTokens: number) {
  const url = `${config.endpoint.replace(/\/$/, "")}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": config.apiKey },
    body: JSON.stringify({
      messages: [{ role: "user", content: toOpenAiContent(content) }],
      max_tokens: maxTokens,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { status: response.status, body: JSON.stringify(data) };
  }
  // Reshape into the { content: [{ type: "text", text }] } envelope the
  // client already expects, so App.tsx needs no changes when the provider
  // behind this proxy changes.
  const text = data.choices?.[0]?.message?.content ?? "";
  return { status: 200, body: JSON.stringify({ content: [{ type: "text", text }] }) };
}

// Dev-only proxy: keeps the Azure OpenAI API key server-side (read from
// .env, never shipped to the browser) instead of the client calling the
// model endpoint directly with the key exposed in the JS bundle. Only runs
// under `vite dev` (via configureServer) — a production deployment has no
// Node server behind the static build, so this must be swapped for a Power
// Automate flow or AI Builder connector before shipping. See README "AI proxy".
function azureOpenAiDevProxyPlugin(config: AzureConfig): Plugin {
  return {
    name: "azure-openai-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/ai/complete", async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (!config.apiKey || !config.endpoint || !config.deployment) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error:
                "Azure OpenAI is not configured — set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT in .env",
            })
          );
          return;
        }
        try {
          const { content, maxTokens } = await readJsonBody(req);
          const { status, body } = await forwardToAzureOpenAI(config, content, maxTokens ?? 500);
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(body);
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      azureOpenAiDevProxyPlugin({
        endpoint: env.AZURE_OPENAI_ENDPOINT ?? "",
        apiKey: env.AZURE_OPENAI_API_KEY ?? "",
        deployment: env.AZURE_OPENAI_DEPLOYMENT ?? "",
        apiVersion: env.AZURE_OPENAI_API_VERSION || "2024-06-01",
      }),
    ],
  };
});
