import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const mathAiApiPlugin = (): Plugin => ({
  name: "math-ai-api",
  configureServer(server) {
    server.middlewares.use("/api/solve", async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Use POST." }));
        return;
      }

      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        (req as typeof req & { body?: unknown }).body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

        const { default: handler } = await import("./api/solve");
        const response = {
          status(code: number) {
            res.statusCode = code;
            return response;
          },
          json(payload: unknown) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(payload));
          },
        };

        await handler(req as typeof req & { body?: unknown }, response);
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Erro inesperado." }));
      }
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [mathAiApiPlugin(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
