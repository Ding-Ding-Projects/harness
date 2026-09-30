import type { ProviderPreset } from "../shared/types";
const preset = (
  id: string,
  name: string,
  baseUrl: string,
  protocol: ProviderPreset["protocol"] = "openai-chat",
  requiresKey = true,
): ProviderPreset => ({
  id,
  name,
  baseUrl,
  protocol,
  requiresKey,
  model: "",
  description:
    protocol === "openai-chat"
      ? "OpenAI-compatible endpoint; capabilities depend on the selected model. Locally fixture-tested protocol, not live provider certification."
      : "Native protocol adapter, locally fixture-tested. Live access and model capabilities depend on your account.",
});
export const PROVIDER_PRESETS: ProviderPreset[] = [
  preset("openai", "OpenAI", "https://api.openai.com/v1", "openai-responses"),
  preset("anthropic", "Anthropic", "https://api.anthropic.com/v1", "anthropic"),
  preset(
    "gemini",
    "Google Gemini",
    "https://generativelanguage.googleapis.com/v1beta",
    "gemini",
  ),
  preset(
    "azure",
    "Azure OpenAI",
    "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
    "azure-openai",
  ),
  preset("openrouter", "OpenRouter", "https://openrouter.ai/api/v1"),
  preset("groq", "Groq", "https://api.groq.com/openai/v1"),
  preset("together", "Together", "https://api.together.xyz/v1"),
  preset("fireworks", "Fireworks", "https://api.fireworks.ai/inference/v1"),
  preset("deepseek", "DeepSeek", "https://api.deepseek.com/v1"),
  preset("xai", "xAI", "https://api.x.ai/v1"),
  preset("mistral", "Mistral", "https://api.mistral.ai/v1"),
  preset("cerebras", "Cerebras", "https://api.cerebras.ai/v1"),
  preset("perplexity", "Perplexity", "https://api.perplexity.ai"),
  preset("huggingface", "Hugging Face", "https://router.huggingface.co/v1"),
  preset("ollama", "Ollama", "http://localhost:11434/v1", "openai-chat", false),
  preset(
    "lmstudio",
    "LM Studio",
    "http://localhost:1234/v1",
    "openai-chat",
    false,
  ),
  preset("custom", "Custom compatible endpoint", "https://example.com/v1"),
];
