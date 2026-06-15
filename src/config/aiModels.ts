export type AiModelId = "gpt" | "claude" | "gemini" | "deepseek" | "qwen" | "kimi";

export type AiModelConfig = {
  id: AiModelId;
  label: string;
  provider: string;
  envKey: string;
  endpointEnvKey?: string;
  defaultModel: string;
  vision: boolean;
};

export const DEFAULT_MATH_PROMPT = `Resolva a questão da imagem.
Explique passo a passo.
Não pule etapas.
Se houver alternativas, indique a alternativa correta.
No final, escreva:
Resposta final: ...`;

export const AI_MODELS: AiModelConfig[] = [
  { id: "gpt", label: "GPT", provider: "OpenAI", envKey: "OPENAI_API_KEY", defaultModel: "gpt-4o-mini", vision: true },
  { id: "claude", label: "Claude", provider: "Anthropic", envKey: "ANTHROPIC_API_KEY", defaultModel: "claude-3-5-sonnet-latest", vision: true },
  { id: "gemini", label: "Gemini", provider: "Google", envKey: "GEMINI_API_KEY", defaultModel: "gemini-1.5-flash", vision: true },
  { id: "deepseek", label: "DeepSeek", provider: "DeepSeek", envKey: "DEEPSEEK_API_KEY", defaultModel: "deepseek-chat", vision: false },
  { id: "qwen", label: "Qwen", provider: "Alibaba Cloud", envKey: "QWEN_API_KEY", endpointEnvKey: "QWEN_BASE_URL", defaultModel: "qwen-vl-plus", vision: true },
  { id: "kimi", label: "Kimi", provider: "Moonshot AI", envKey: "KIMI_API_KEY", endpointEnvKey: "KIMI_BASE_URL", defaultModel: "moonshot-v1-8k-vision-preview", vision: true },
];

export const getAiModel = (id: string) => AI_MODELS.find((model) => model.id === id);
