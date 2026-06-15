import { AI_MODELS, DEFAULT_MATH_PROMPT, getAiModel, type AiModelId } from "../src/config/aiModels";

type SolveRequest = { image?: string; notes?: string; models?: AiModelId[] };
type SolveResult = { model: AiModelId; response: string; elapsedMs: number; error?: string; createdAt: string };

const asDataUrlParts = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Imagem inválida. Envie um arquivo de imagem em base64/data URL.");
  return { mimeType: match[1], base64: match[2] };
};

const buildPrompt = (notes?: string) => notes?.trim() ? `${DEFAULT_MATH_PROMPT}\n\nObservações do usuário:\n${notes.trim()}` : DEFAULT_MATH_PROMPT;

async function callOpenAiCompatible(modelId: AiModelId, image: string, prompt: string) {
  const config = getAiModel(modelId);
  if (!config) throw new Error("Modelo não configurado.");
  const apiKey = process.env[config.envKey];
  if (!apiKey) throw new Error(`Defina ${config.envKey} no .env para usar ${config.label}.`);
  if (!config.vision) throw new Error(`${config.label} está configurado como modelo sem visão neste MVP.`);

  const baseUrl = process.env[config.endpointEnvKey || ""] || (modelId === "gpt" ? "https://api.openai.com/v1" : modelId === "qwen" ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" : "https://api.moonshot.ai/v1");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: config.defaultModel,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] }],
      temperature: 0.2,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
  return payload?.choices?.[0]?.message?.content || "Sem conteúdo retornado.";
}

async function callClaude(image: string, prompt: string) {
  const config = getAiModel("claude")!;
  const apiKey = process.env[config.envKey];
  if (!apiKey) throw new Error(`Defina ${config.envKey} no .env para usar ${config.label}.`);
  const { mimeType, base64 } = asDataUrlParts(image);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: config.defaultModel, max_tokens: 1600, temperature: 0.2, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mimeType, data: base64 } }, { type: "text", text: prompt }] }] }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
  return payload?.content?.map((item: { text?: string }) => item.text).filter(Boolean).join("\n") || "Sem conteúdo retornado.";
}

async function callGemini(image: string, prompt: string) {
  const config = getAiModel("gemini")!;
  const apiKey = process.env[config.envKey];
  if (!apiKey) throw new Error(`Defina ${config.envKey} no .env para usar ${config.label}.`);
  const { mimeType, base64 } = asDataUrlParts(image);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.defaultModel}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }], generationConfig: { temperature: 0.2 } }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
  return payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text).filter(Boolean).join("\n") || "Sem conteúdo retornado.";
}

async function solveModel(model: AiModelId, image: string, prompt: string): Promise<SolveResult> {
  const startedAt = Date.now();
  try {
    const response = model === "claude" ? await callClaude(image, prompt) : model === "gemini" ? await callGemini(image, prompt) : await callOpenAiCompatible(model, image, prompt);
    return { model, response, elapsedMs: Date.now() - startedAt, createdAt: new Date().toISOString() };
  } catch (error) {
    return { model, response: "", error: error instanceof Error ? error.message : "Erro inesperado.", elapsedMs: Date.now() - startedAt, createdAt: new Date().toISOString() };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const body = req.body as SolveRequest;
  if (!body?.image) return res.status(400).json({ error: "Envie uma imagem." });
  const requestedModels = (body.models?.length ? body.models : ["gpt"]).filter((id) => AI_MODELS.some((model) => model.id === id));
  const prompt = buildPrompt(body.notes);
  const results = await Promise.all(requestedModels.map((model) => solveModel(model, body.image!, prompt)));
  return res.status(200).json({ results });
}
