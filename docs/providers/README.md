# Provider adapters

The main process makes requests using user-supplied credentials. The renderer receives events, never credentials. Adapters support OpenAI Responses, OpenAI-compatible Chat Completions, Anthropic Messages, Gemini GenerateContent, and Azure OpenAI v1 Chat Completions. Presets describe compatible protocols, not live certification. Local fixture tests make no paid requests.

HTTPS is required except for literal loopback HTTP endpoints. Embedded URL credentials, query strings, fragments, and redirects are rejected. Base paths are preserved. Requests time out after three minutes; model discovery times out after fifteen seconds per page. Provider response bodies are never included in displayed errors. Streams are bounded to 64 MiB, individual buffered lines to 2 MiB, and discovery pages to 2 MiB with twenty-page maximum.

Tool arguments are assembled before a complete tool event is emitted. Native continuation items preserve reasoning and opaque signature data. Replay occurs only for matching protocols. Do not move signed history between providers. Azure requires a resource URL ending `/openai/v1` and a manually supplied deployment name; automatic deployment discovery is not provided. Optional API version is supported, but current v1 normally needs none.

Cloud provider capabilities vary by account and model. Generic compatibility does not promise image inputs, hosted tools, reasoning controls, structured output, or uniform context limits. Ollama and LM Studio local presets do not require API keys. Gemini AI Studio keys do not configure Vertex AI. Amazon Bedrock, Vertex AI, and identity-only Azure authentication require separate integrations and are outside this adapter scope.

Sources: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [Gemini generation](https://ai.google.dev/api/generate-content), [Azure v1](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle), [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility).
