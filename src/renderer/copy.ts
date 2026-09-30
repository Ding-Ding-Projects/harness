import type { Settings } from "../shared/types";
const words = {
  chats: ["Conversations", "對話"],
  providers: ["Providers", "服務供應商"],
  settings: ["Settings", "設定"],
  help: ["Help & privacy", "說明與私隱"],
  newChat: ["New conversation", "新增對話"],
  send: ["Send message", "傳送訊息"],
  stop: ["Stop generation", "停止產生"],
  workspace: ["Workspace", "工作資料夾"],
  chooseWorkspace: ["Choose folder", "選擇資料夾"],
  noWorkspace: ["No folder selected", "未選擇資料夾"],
  welcome: ["A little room for big ideas.", "大想法，都有個好地方。"],
  welcomeSerious: ["Your AI workspace", "你的 AI 工作空間"],
  intro: [
    "Connect a provider, choose a model, and make something worth keeping.",
    "連接服務供應商，選好模型，再一齊做啲值得保留嘅嘢。",
  ],
  introSerious: [
    "Connect a provider and select a model to begin.",
    "連接服務供應商並選擇模型即可開始。",
  ],
  prompt: [
    "Ask anything, or give your next idea a little direction…",
    "問個問題，或者畀下一個想法一個方向…",
  ],
  ready: ["Ready when you are", "準備好就開始"],
  thinking: ["Working on your response", "正在處理回覆"],
  profile: ["Provider profile", "供應商設定檔"],
  details: ["Conversation details", "對話詳情"],
  save: ["Save changes", "儲存更改"],
  cancel: ["Cancel", "取消"],
  delete: ["Delete", "刪除"],
  rename: ["Rename", "重新命名"],
  search: ["Search conversations", "搜尋對話"],
  noChats: ["Your conversations will live here.", "你的對話會放喺呢度。"],
  noProfile: ["Add a provider to get started", "新增服務供應商即可開始"],
} as const;
export type CopyKey = keyof typeof words;
export function copy(settings: Settings, key: CopyKey): string {
  const pair = words[key];
  return settings.language === "en"
    ? pair[0]
    : settings.language === "zh-HK"
      ? pair[1]
      : `${pair[0]} · ${pair[1]}`;
}
