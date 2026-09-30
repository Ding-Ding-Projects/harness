export type Protocol = 'openai-chat' | 'openai-responses' | 'anthropic' | 'gemini' | 'azure-openai';
export interface ProviderProfile {
  id: string; name: string; protocol: Protocol; baseUrl: string; model: string;
  apiVersion?: string; hasKey?: boolean;
}
export interface ProviderPreset extends Omit<ProviderProfile, 'id' | 'hasKey'> {
  id: string; description: string; requiresKey: boolean;
}
export interface ToolCall { id: string; name: string; arguments: string; }
export interface ProviderContinuation { protocol: Protocol; items: unknown[]; }
export interface ChatMessage {
  id: string; role: 'system' | 'user' | 'assistant' | 'tool'; content: string;
  createdAt: string; toolCalls?: ToolCall[]; toolCallId?: string; name?: string;
  continuation?: ProviderContinuation;
}
export interface Usage { inputTokens: number; outputTokens: number; }
export interface Conversation {
  id: string; title: string; profileId: string; messages: ChatMessage[];
  createdAt: string; updatedAt: string; usage?: Usage;
}
export interface Settings {
  theme: 'system' | 'light' | 'dark'; language: 'en' | 'zh-HK' | 'bilingual';
  systemPrompt: string; temperature: number; maxTokens: number;
  toolsEnabled: boolean; fontSize: number; reducedMotion: boolean;
  englishFunnyLevel: number; cantoneseFunnyLevel: number; showEmojis: boolean;
}
export interface AppState {
  profiles: ProviderProfile[]; conversations: Conversation[]; settings: Settings;
  workspace: string | null; vaultAvailable: boolean; version: string; builtAt?: string;
}
export interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown>; }
export interface ProviderRequest {
  profile: ProviderProfile; apiKey: string; messages: ChatMessage[];
  systemPrompt?: string; temperature?: number; maxTokens?: number;
  tools?: ToolDefinition[]; signal: AbortSignal;
}
export type ProviderEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; call: ToolCall }
  | { type: 'continuation'; continuation: ProviderContinuation }
  | { type: 'usage'; usage: Usage };
export interface ApprovalRequest {
  id: string; runId: string; tool: string; summary: string; detail: string;
}
export type RunEvent =
  | { type: 'started'; runId: string; conversationId: string }
  | { type: 'text'; runId: string; conversationId: string; text: string }
  | { type: 'status'; runId: string; conversationId: string; message: string }
  | { type: 'approval'; runId: string; conversationId: string; approval: ApprovalRequest }
  | { type: 'done'; runId: string; conversationId: string; conversation: Conversation; cancelled: boolean }
  | { type: 'error'; runId: string; conversationId: string; message: string };
export interface SendRequest { conversationId: string; profileId: string; text: string; }
export interface HarnessAPI {
  bootstrap(): Promise<AppState>;
  saveProfile(profile: ProviderProfile, apiKey?: string): Promise<ProviderProfile>;
  removeProfile(id: string): Promise<void>;
  clearKey(id: string): Promise<void>;
  listModels(id: string): Promise<string[]>;
  createConversation(profileId: string): Promise<Conversation>;
  renameConversation(id: string, title: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  saveSettings(settings: Settings): Promise<Settings>;
  send(request: SendRequest): Promise<{ runId: string }>;
  cancel(runId: string): Promise<void>;
  approve(id: string, allow: boolean): Promise<void>;
  selectWorkspace(): Promise<string | null>;
  clearWorkspace(): Promise<void>;
  exportConversation(id: string, format: 'json' | 'markdown'): Promise<boolean>;
  importConversation(): Promise<Conversation | null>;
  onRunEvent(listener: (event: RunEvent) => void): () => void;
}
declare global { interface Window { harness: HarnessAPI; } }
