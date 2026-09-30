import { contextBridge, ipcRenderer } from "electron";
import type { HarnessAPI, RunEvent } from "../shared/types";
const invoke = (name: string, ...args: unknown[]) =>
  ipcRenderer.invoke(`harness:${name}`, ...args);
const api: HarnessAPI = {
  bootstrap: () => invoke("bootstrap"),
  saveProfile: (p, k) => invoke("saveProfile", p, k),
  removeProfile: (id) => invoke("removeProfile", id),
  clearKey: (id) => invoke("clearKey", id),
  listModels: (id) => invoke("listModels", id),
  createConversation: (id) => invoke("createConversation", id),
  renameConversation: (id, title) => invoke("renameConversation", id, title),
  deleteConversation: (id) => invoke("deleteConversation", id),
  saveSettings: (s) => invoke("saveSettings", s),
  send: (r) => invoke("send", r),
  cancel: (id) => invoke("cancel", id),
  approve: (id, allow) => invoke("approve", id, allow),
  selectWorkspace: () => invoke("selectWorkspace"),
  clearWorkspace: () => invoke("clearWorkspace"),
  exportConversation: (id, format) => invoke("exportConversation", id, format),
  importConversation: () => invoke("importConversation"),
  onRunEvent: (listener) => {
    const callback = (_event: unknown, event: RunEvent) => listener(event);
    ipcRenderer.on("harness:event", callback);
    return () => ipcRenderer.removeListener("harness:event", callback);
  },
};
contextBridge.exposeInMainWorld("harness", Object.freeze(api));
