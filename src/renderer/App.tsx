import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Square,
  Plus,
  MessageSquare,
  SlidersHorizontal,
  Layers3,
  HelpCircle,
  PanelRight,
  ChevronDown,
  Sparkles,
  Folder,
  ShieldCheck,
  X,
  MoreHorizontal,
  Download,
  Upload,
  Trash2,
  Pencil,
  Check,
  Command,
  KeyRound,
  CircleAlert,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AppState,
  Conversation,
  ProviderProfile,
  Settings,
  ApprovalRequest,
} from "../shared/types";
import { PROVIDER_PRESETS } from "../providers/catalog";
import { SearchField, emptyRule, matchesRule } from "./Search";
import { copy } from "./copy";

type Page = "chats" | "providers" | "settings" | "help";
export function App() {
  const [state, setState] = useState<AppState | null>(null),
    [bootError, setBootError] = useState("");
  const [page, setPage] = useState<Page>("chats"),
    [activeId, setActiveId] = useState(""),
    [tabs, setTabs] = useState<string[]>([]);
  const [profileId, setProfileId] = useState(""),
    [text, setText] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [run, setRun] = useState<{
    id: string;
    conversationId: string;
    text: string;
    status: string;
    started: number;
  } | null>(null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null),
    [details, setDetails] = useState(false),
    [menu, setMenu] = useState(false);
  const [rule, setRule] = useState(emptyRule),
    [paletteRule, setPaletteRule] = useState(emptyRule),
    [palette, setPalette] = useState(false);
  const [confirm, setConfirm] = useState<{
      kind: "delete" | "rename";
      conversation: Conversation;
    } | null>(null),
    [title, setTitle] = useState("");
  const failedRuns = useRef(new Set<string>());
  const bottom = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const load = async () => {
    setBootError("");
    try {
      const next = await window.harness.bootstrap();
      setState(next);
      setProfileId((p) =>
        next.profiles.some((item) => item.id === p)
          ? p
          : next.profiles[0]?.id || "",
      );
    } catch (e) {
      setBootError(errorText(e));
    }
  };
  useEffect(() => {
    void load();
    return window.harness?.onRunEvent((event) => {
      if (event.type === "started")
        setRun({
          id: event.runId,
          conversationId: event.conversationId,
          text: "",
          status: "Generating",
          started: Date.now(),
        });
      if (event.type === "text")
        setRun((r) =>
          r?.id === event.runId ? { ...r, text: r.text + event.text } : r,
        );
      if (event.type === "status")
        setRun((r) =>
          r?.id === event.runId ? { ...r, status: event.message } : r,
        );
      if (event.type === "approval") setApproval(event.approval);
      if (event.type === "done") {
        setState(
          (s) =>
            s && {
              ...s,
              conversations: s.conversations.map((c) =>
                c.id === event.conversationId ? event.conversation : c,
              ),
            },
        );
        setRun(null);
        setApproval(null);
        if (!failedRuns.current.delete(event.runId))
          setNotice(
            event.cancelled
              ? "Generation stopped. Partial response saved."
              : "Response saved.",
          );
      }
      if (event.type === "error") {
        failedRuns.current.add(event.runId);
        setNotice(event.message);
        setRun(null);
        setApproval(null);
        void load();
      }
    });
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setMenu(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (state) {
      const theme =
        state.settings.theme === "system"
          ? matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : state.settings.theme;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.setProperty(
        "--user-font-size",
        `${state.settings.fontSize}px`,
      );
      document.documentElement.dataset.motion = state.settings.reducedMotion
        ? "reduce"
        : "normal";
      document.documentElement.lang =
        state.settings.language === "zh-HK" ? "zh-HK" : "en";
      const media = matchMedia("(prefers-color-scheme: dark)");
      const change = () => {
        if (state.settings.theme === "system")
          document.documentElement.dataset.theme = media.matches
            ? "dark"
            : "light";
      };
      media.addEventListener("change", change);
      return () => media.removeEventListener("change", change);
    }
  }, [state?.settings]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [run?.text, activeId]);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const openChat = (c: Conversation) => {
    setActiveId(c.id);
    setProfileId(c.profileId);
    setTabs((t) => (t.includes(c.id) ? t : [...t, c.id]));
    setPage("chats");
  };
  const create = async () => {
    if (!profileId) {
      setPage("providers");
      return;
    }
    await action(async () => {
      const c = await window.harness.createConversation(profileId);
      setState((s) => s && { ...s, conversations: [c, ...s.conversations] });
      openChat(c);
    });
  };
  const send = async () => {
    if (!text.trim() || run || busy || !profileId) return;
    await action(async () => {
      let id = activeId;
      if (!id) {
        const c = await window.harness.createConversation(profileId);
        setState((s) => s && { ...s, conversations: [c, ...s.conversations] });
        openChat(c);
        id = c.id;
      }
      const draft = text;
      await window.harness.send({ conversationId: id, profileId, text: draft });
      setText("");
      const next = await window.harness.bootstrap();
      setState(next);
    });
  };
  if (!state)
    return (
      <main className="boot">
        <div className="brand-mark">H</div>
        <h1>Harness</h1>
        <p>{bootError || "Opening your workspace…"}</p>
        {bootError && (
          <button className="primary" onClick={() => void load()}>
            Retry startup
          </button>
        )}
      </main>
    );
  const t = (key: Parameters<typeof copy>[1]) => copy(state.settings, key);
  const active = state.conversations.find((c) => c.id === activeId),
    selectedProfile = state.profiles.find((p) => p.id === profileId);
  const navigate = (p: Page) => {
    setPage(p);
    setPalette(false);
  };
  const saveSettings = (settings: Settings) =>
    action(async () => {
      const saved = await window.harness.saveSettings(settings);
      setState((s) => s && { ...s, settings: saved });
      setNotice("Settings saved.");
    });
  const commands = [
    {
      label: t("newChat"),
      action: () => {
        void create();
      },
    },
    ...(["chats", "providers", "settings", "help"] as Page[]).map((p) => ({
      label: t(p),
      action: () => navigate(p),
    })),
    {
      label: t("chooseWorkspace"),
      action: () => {
        void action(async () => {
          const workspace = await window.harness.selectWorkspace();
          if (workspace !== null) setState((s) => s && { ...s, workspace });
        });
      },
    },
    {
      label: "Focus composer",
      action: () => {
        navigate("chats");
        setTimeout(() => composer.current?.focus(), 0);
      },
    },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">H</div>
          <span>
            Harness<small>YOUR AI WORKSPACE</small>
          </span>
        </div>
        <button
          className="new-chat"
          disabled={busy || !!run}
          onClick={() => void create()}
        >
          <Plus size={19} />
          {t("newChat")}
          <kbd>+</kbd>
        </button>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "chats", icon: MessageSquare },
              { id: "providers", icon: Layers3 },
              { id: "settings", icon: SlidersHorizontal },
            ] as const
          ).map(({ id, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "nav-button selected" : "nav-button"}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {t(id)}
              {id === "chats" && (
                <span className="count">{state.conversations.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-label">RECENT CONVERSATIONS</div>
        <SearchField label={t("search")} rule={rule} onChange={setRule} />
        <div className="conversation-list">
          {state.conversations
            .filter((c) => matchesRule(c.title, rule))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map((c) => (
              <button
                className={`conversation-link ${activeId === c.id ? "current" : ""}`}
                key={c.id}
                onClick={() => openChat(c)}
              >
                <MessageSquare size={16} />
                <span>
                  {c.title}
                  <small>{new Date(c.updatedAt).toLocaleDateString()}</small>
                </span>
              </button>
            ))}
          {!state.conversations.length && (
            <p className="muted empty-list">{t("noChats")}</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className="workspace-card"
            disabled={busy || !!run}
            onClick={() =>
              void action(async () => {
                const workspace = await window.harness.selectWorkspace();
                if (workspace !== null)
                  setState((s) => s && { ...s, workspace });
              })
            }
          >
            <Folder size={19} />
            <span>
              {t("workspace")}
              <small title={state.workspace || ""}>
                {state.workspace?.split(/[\\/]/).pop() || t("noWorkspace")}
              </small>
            </span>
            <ChevronDown size={15} />
          </button>
          <button className="nav-button" onClick={() => navigate("help")}>
            <HelpCircle size={18} />
            {t("help")}
          </button>
          <div className="version">
            v{state.version} · Updated{" "}
            {(state as AppState & { builtAt?: string }).builtAt ||
              "unavailable"}
          </div>
        </div>
      </aside>
      <section className="main-shell">
        <header className="topbar">
          <div className="tabs" role="tablist" aria-label="Open conversations">
            {tabs.map((id) => {
              const c = state.conversations.find((c) => c.id === id);
              return (
                c && (
                  <div
                    className={`tab ${activeId === id && page === "chats" ? "active" : ""}`}
                    key={id}
                  >
                    <button
                      role="tab"
                      aria-selected={activeId === id && page === "chats"}
                      onClick={() => openChat(c)}
                    >
                      <MessageSquare size={15} />
                      <span>{c.title}</span>
                    </button>
                    <button
                      aria-label={`Close tab ${c.title}`}
                      onClick={() => {
                        setTabs((t) => t.filter((x) => x !== id));
                        if (activeId === id) setActiveId("");
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              );
            })}
            <button
              aria-label="New conversation"
              disabled={busy || !!run}
              onClick={() => void create()}
            >
              <Plus size={19} />
            </button>
          </div>
          <button
            aria-label="Open command palette"
            title="Command palette (Ctrl+Shift+F)"
            onClick={() => setPalette(true)}
          >
            <Command size={19} />
          </button>
          <button
            aria-label="Toggle conversation details"
            aria-pressed={details}
            onClick={() => setDetails(!details)}
          >
            <PanelRight size={20} />
          </button>
        </header>
        {notice && (
          <div className="notice" role="status">
            <CircleAlert size={17} />
            <span>{notice}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {page === "chats" ? (
          <div className="chat-layout">
            <div className="chat-column">
              <div className="chat-heading">
                <div>
                  <span className="eyebrow">CONVERSATION</span>
                  <h1>{active?.title || t("newChat")}</h1>
                </div>
                <div className="menu-anchor">
                  <button
                    aria-label="Conversation actions"
                    disabled={!active}
                    aria-expanded={menu}
                    onClick={() => setMenu(!menu)}
                  >
                    <MoreHorizontal size={22} />
                  </button>
                  {menu && active && (
                    <div className="action-menu">
                      <button
                        onClick={() => {
                          setConfirm({ kind: "rename", conversation: active });
                          setTitle(active.title);
                          setMenu(false);
                        }}
                      >
                        <Pencil size={16} />
                        {t("rename")}
                      </button>
                      <button
                        onClick={() =>
                          void action(async () => {
                            await window.harness.exportConversation(
                              active.id,
                              "markdown",
                            );
                            setMenu(false);
                          })
                        }
                      >
                        <Download size={16} />
                        Export Markdown
                      </button>
                      <button
                        onClick={() =>
                          void action(async () => {
                            await window.harness.exportConversation(
                              active.id,
                              "json",
                            );
                            setMenu(false);
                          })
                        }
                      >
                        <Download size={16} />
                        Export JSON
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setConfirm({ kind: "delete", conversation: active });
                          setMenu(false);
                        }}
                      >
                        <Trash2 size={16} />
                        {t("delete")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="messages" aria-live="polite">
                {!active?.messages.length && !run ? (
                  <div className="welcome">
                    <div className="welcome-symbol">
                      <Sparkles size={30} />
                    </div>
                    <span className="eyebrow">A CLEARER WAY TO CREATE</span>
                    <h2>
                      {t(
                        state.settings.englishFunnyLevel > 1
                          ? "welcome"
                          : "welcomeSerious",
                      )}
                    </h2>
                    <p>
                      {t(
                        state.settings.cantoneseFunnyLevel > 1
                          ? "intro"
                          : "introSerious",
                      )}
                    </p>
                    <div className="starters">
                      {[
                        {
                          title: "Write with clarity",
                          description:
                            "Turn a rough idea into a thoughtful draft",
                          prompt:
                            "Help me turn a rough idea into a clear draft. Ask me what I want to write.",
                        },
                        {
                          title: "Explore an idea",
                          description:
                            "Find a fresh angle or a useful next step",
                          prompt:
                            "Help me explore an idea. Ask me what I am thinking about.",
                        },
                        {
                          title: "Understand code",
                          description:
                            "Explain a pattern, review a snippet, untangle a bug",
                          prompt:
                            "Help me understand some code. Ask me to share a snippet.",
                        },
                        {
                          title: "Make a plan",
                          description: "Break a big task into manageable steps",
                          prompt:
                            "Help me make a practical plan. Ask me about my goal and constraints.",
                        },
                      ].map((s) => (
                        <button
                          key={s.title}
                          onClick={() => {
                            setText(s.prompt);
                            composer.current?.focus();
                          }}
                        >
                          <Sparkles size={18} />
                          <strong>{s.title}</strong>
                          <small>{s.description}</small>
                        </button>
                      ))}
                    </div>
                    <div className="privacy-line">
                      <ShieldCheck size={15} />
                      Conversations stay on this device. Prompts go to your
                      selected provider.
                    </div>
                  </div>
                ) : (
                  <div className="message-stack">
                    {active?.messages
                      .filter((m) => m.role !== "system")
                      .map((m) => (
                        <article className={`message ${m.role}`} key={m.id}>
                          <div className="avatar">
                            {m.role === "user" ? (
                              "Y"
                            ) : m.role === "tool" ? (
                              "T"
                            ) : (
                              <Sparkles size={16} />
                            )}
                          </div>
                          <div className="message-body">
                            <div className="message-meta">
                              <strong>
                                {m.role === "user"
                                  ? "You"
                                  : m.role === "tool"
                                    ? m.name || "Tool"
                                    : "Harness"}
                              </strong>
                              <time>
                                {new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </time>
                            </div>
                            <Markdown text={m.content} />
                            {m.toolCalls?.map((call) => (
                              <details className="tool-record" key={call.id}>
                                <summary>Tool request: {call.name}</summary>
                                <pre>{call.arguments}</pre>
                              </details>
                            ))}
                          </div>
                        </article>
                      ))}
                    {run?.conversationId === activeId && (
                      <article className="message assistant">
                        <div className="avatar">
                          <Sparkles size={16} />
                        </div>
                        <div className="message-body">
                          <div className="message-meta">
                            <strong>Harness</strong>
                            <span className="stream-status">{run.status}</span>
                          </div>
                          <Markdown text={run.text || "…"} />
                        </div>
                      </article>
                    )}
                    {approval && run?.conversationId === activeId && (
                      <div className="approval-card">
                        <ShieldCheck size={24} />
                        <div>
                          <h3>Permission required: {approval.tool}</h3>
                          <p>{approval.summary}</p>
                          <details open>
                            <summary>Review request</summary>
                            <pre>{approval.detail}</pre>
                          </details>
                          <div className="button-row">
                            <button
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await window.harness.approve(
                                    approval.id,
                                    false,
                                  );
                                  setApproval(null);
                                })
                              }
                            >
                              Deny request
                            </button>
                            <button
                              className="primary"
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await window.harness.approve(
                                    approval.id,
                                    true,
                                  );
                                  setApproval(null);
                                })
                              }
                            >
                              Review in native dialog
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={bottom} />
                  </div>
                )}
              </div>
              <div className="composer-area">
                <div className="composer">
                  <textarea
                    ref={composer}
                    value={text}
                    maxLength={100000}
                    disabled={busy || !!run}
                    aria-label="Message"
                    placeholder={t("prompt")}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className="composer-controls">
                    <label className="model-picker">
                      <Layers3 size={16} />
                      <select
                        aria-label={t("profile")}
                        value={profileId}
                        disabled={busy || !!run}
                        onChange={(e) => setProfileId(e.target.value)}
                      >
                        {!state.profiles.length && (
                          <option value="">{t("noProfile")}</option>
                        )}
                        {state.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {p.model || "Choose a model"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="composer-hint">
                      Enter to send · Shift+Enter for a new line
                    </span>
                    {run ? (
                      <button
                        className="send-button"
                        aria-label={t("stop")}
                        onClick={() =>
                          void action(async () => {
                            await window.harness.cancel(run.id);
                          })
                        }
                      >
                        <Square size={18} />
                      </button>
                    ) : (
                      <button
                        className="send-button"
                        aria-label={t("send")}
                        disabled={
                          busy || !text.trim() || !selectedProfile?.model
                        }
                        onClick={() => void send()}
                      >
                        <ArrowUp size={20} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="chat-footer">
                  <span>
                    <span className={`status-dot ${run ? "working" : ""}`} />
                    {run ? t("thinking") : t("ready")}
                  </span>
                  <span>
                    {active?.usage
                      ? `${active.usage.inputTokens + active.usage.outputTokens} tokens`
                      : "Usage unavailable"}
                    {run
                      ? ` · ${Math.floor((Date.now() - run.started) / 1000)}s elapsed`
                      : ""}
                  </span>
                </div>
                {selectedProfile && !selectedProfile.hasKey && (
                  <small className="key-note">
                    No stored API key for this profile. Local endpoints may work
                    without one.
                  </small>
                )}
              </div>
            </div>
            {details && (
              <aside className="details">
                <div className="section-heading">
                  <h3>{t("details")}</h3>
                  <button
                    aria-label="Close details"
                    onClick={() => setDetails(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <dl>
                  <dt>Provider</dt>
                  <dd>{selectedProfile?.name || "Not selected"}</dd>
                  <dt>Model</dt>
                  <dd>{selectedProfile?.model || "Not selected"}</dd>
                  <dt>Messages</dt>
                  <dd>{active?.messages.length || 0}</dd>
                  <dt>Workspace</dt>
                  <dd>{state.workspace || "Not selected"}</dd>
                  <dt>Tools</dt>
                  <dd>
                    {state.settings.toolsEnabled
                      ? "Enabled, approval required"
                      : "Disabled"}
                  </dd>
                </dl>
                <button
                  disabled={busy || !!run || !state.workspace}
                  onClick={() =>
                    void action(async () => {
                      await window.harness.clearWorkspace();
                      setState((s) => s && { ...s, workspace: null });
                    })
                  }
                >
                  Clear workspace
                </button>
                <div className="info-card">
                  <ShieldCheck size={20} />
                  <p>
                    Writes and commands pause for your review and native
                    confirmation. Read-only actions run after explicit tool
                    opt-in. Choose only a folder you intend to share with the
                    model.
                  </p>
                </div>
              </aside>
            )}
          </div>
        ) : page === "providers" ? (
          <Providers
            state={state}
            action={action}
            refresh={load}
            notify={setNotice}
          />
        ) : page === "settings" ? (
          <SettingsPage
            settings={state.settings}
            save={saveSettings}
            busy={busy}
          />
        ) : (
          <HelpPage
            importChat={() =>
              void action(async () => {
                const c = await window.harness.importConversation();
                if (c) {
                  await load();
                  openChat(c);
                }
              })
            }
          />
        )}
      </section>
      {palette && (
        <Modal title="Command palette" close={() => setPalette(false)}>
          <SearchField
            label="Find a command"
            rule={paletteRule}
            onChange={setPaletteRule}
          />
          <div className="palette-list">
            {commands
              .filter((c) => matchesRule(c.label, paletteRule))
              .map((c) => (
                <button
                  key={c.label}
                  onClick={() => {
                    setPalette(false);
                    c.action();
                  }}
                >
                  {c.label}
                  <ArrowUp size={16} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.kind === "rename"
              ? "Rename conversation"
              : "Delete conversation?"
          }
          close={() => setConfirm(null)}
        >
          {confirm.kind === "rename" ? (
            <label>
              Title
              <input
                autoFocus
                value={title}
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          ) : (
            <p>
              This permanently removes “{confirm.conversation.title}” from this
              device. Export it first if you want to keep a copy.
            </p>
          )}
          <div className="button-row">
            <button onClick={() => setConfirm(null)}>{t("cancel")}</button>
            <button
              className={confirm.kind === "delete" ? "danger" : "primary"}
              disabled={busy || (confirm.kind === "rename" && !title.trim())}
              onClick={() =>
                void action(async () => {
                  if (confirm.kind === "delete") {
                    await window.harness.deleteConversation(
                      confirm.conversation.id,
                    );
                    setTabs((ts) =>
                      ts.filter((id) => id !== confirm.conversation.id),
                    );
                    if (activeId === confirm.conversation.id) setActiveId("");
                  } else
                    await window.harness.renameConversation(
                      confirm.conversation.id,
                      title.trim(),
                    );
                  setConfirm(null);
                  await load();
                })
              }
            >
              {confirm.kind === "rename" ? t("save") : t("delete")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function errorText(e: unknown) {
  return e instanceof Error
    ? e.message
    : "The operation could not be completed.";
}
function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          img: () => (
            <span className="image-blocked">
              [Remote image blocked for privacy]
            </span>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => <pre tabIndex={0}>{children}</pre>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    const root = ref.current!;
    root.querySelector<HTMLElement>("input,button,select,textarea")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const all = [
          ...root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,textarea,[tabindex="0"]',
          ),
        ];
        if (!all.length) return;
        if (e.shiftKey && document.activeElement === all[0]) {
          e.preventDefault();
          all.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === all.at(-1)) {
          e.preventDefault();
          all[0].focus();
        }
      }
    };
    root.addEventListener("keydown", key);
    return () => {
      root.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Providers({
  state,
  action,
  refresh,
  notify,
}: {
  state: AppState;
  action: (fn: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [edit, setEdit] = useState<ProviderProfile | null>(null),
    [apiKey, setApiKey] = useState(""),
    [busy, setBusy] = useState(false),
    [models, setModels] = useState<string[]>([]),
    [remove, setRemove] = useState<ProviderProfile | null>(null);
  const localAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    await action(fn);
    setBusy(false);
  };
  const begin = (profile: ProviderProfile) => {
    setApiKey("");
    setModels([]);
    setEdit({ ...profile });
  };
  return (
    <div className="page-scroll">
      <div className="page-header">
        <div>
          <span className="eyebrow">CONNECTIONS</span>
          <h1>Bring your own intelligence.</h1>
          <p>One workspace. Your providers, your models, your keys.</p>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            begin({
              id: crypto.randomUUID(),
              name: "Custom provider",
              protocol: "openai-chat",
              baseUrl: "",
              model: "",
            })
          }
        >
          <Plus size={18} />
          Add provider
        </button>
      </div>
      <div className="provider-banner">
        <ShieldCheck size={25} />
        <div>
          <strong>
            {state.vaultAvailable
              ? "API keys protected by your operating system"
              : "Secure key storage unavailable"}
          </strong>
          <p>
            {state.vaultAvailable
              ? "Keys stay in the desktop process and are never exposed to the renderer."
              : "Key saving is unavailable. Use a keyless local endpoint or repair secure storage."}
          </p>
        </div>
      </div>
      <h2 className="small-heading">
        Your profiles <span className="count">{state.profiles.length}</span>
      </h2>
      <div className="profile-grid">
        {state.profiles.map((p) => (
          <article className="profile-card" key={p.id}>
            <div className="section-heading">
              <div className="provider-icon">
                <Layers3 size={22} />
              </div>
              <button
                aria-label={`Edit ${p.name}`}
                disabled={busy}
                onClick={() => begin(p)}
              >
                <Pencil size={18} />
              </button>
            </div>
            <h3>{p.name}</h3>
            <p>{p.model || "No model selected"}</p>
            <small>{p.protocol}</small>
            <div className="profile-key">
              <KeyRound size={14} />
              {p.hasKey ? "API key saved" : "No API key saved"}
            </div>
            <div className="button-row">
              <button
                disabled={busy}
                onClick={() =>
                  void localAction(async () => {
                    const results = await window.harness.listModels(p.id);
                    notify(
                      `${p.name}: model listing succeeded (${results.length} models). This does not verify chat generation.`,
                    );
                  })
                }
              >
                Test connection
              </button>
              <button
                aria-label={`Remove ${p.name}`}
                className="danger"
                disabled={busy}
                onClick={() => setRemove(p)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </article>
        ))}
        {!state.profiles.length && (
          <div className="empty-card">
            <Layers3 size={32} />
            <h3>No providers yet</h3>
            <p>
              Choose a preset below or add a compatible endpoint. Nothing is
              sent until you explicitly start an action.
            </p>
          </div>
        )}
      </div>
      <h2 className="small-heading">Start from a preset</h2>
      <div className="preset-grid">
        {PROVIDER_PRESETS.map((p) => (
          <button
            key={p.id}
            disabled={busy}
            onClick={() =>
              begin({
                id: crypto.randomUUID(),
                name: p.name,
                protocol: p.protocol,
                baseUrl: p.baseUrl,
                model: p.model,
                apiVersion: p.apiVersion,
              })
            }
          >
            <div className="preset-letter">{p.name.charAt(0)}</div>
            <div>
              <strong>{p.name}</strong>
              <small>{p.description}</small>
            </div>
            <Plus size={18} />
          </button>
        ))}
      </div>
      {edit && (
        <Modal
          title={
            state.profiles.some((p) => p.id === edit.id)
              ? "Edit provider profile"
              : "Add provider profile"
          }
          close={() => {
            if (!busy) {
              setEdit(null);
              setApiKey("");
            }
          }}
        >
          <div className="form-grid">
            <label>
              Profile name
              <input
                value={edit.name}
                maxLength={120}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label>
              Protocol
              <select
                value={edit.protocol}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    protocol: e.target.value as ProviderProfile["protocol"],
                  })
                }
              >
                <option value="openai-chat">OpenAI-compatible chat</option>
                <option value="openai-responses">OpenAI Responses</option>
                <option value="anthropic">Anthropic Messages</option>
                <option value="gemini">Google Gemini</option>
                <option value="azure-openai">Azure OpenAI</option>
              </select>
            </label>
            <label className="full">
              Base URL
              <input
                value={edit.baseUrl}
                maxLength={2000}
                placeholder="https://api.example.com/v1"
                onChange={(e) => setEdit({ ...edit, baseUrl: e.target.value })}
              />
            </label>
            <label className="full">
              Model / deployment
              <input
                list="provider-models"
                value={edit.model}
                maxLength={200}
                placeholder="Enter the exact model identifier"
                onChange={(e) => setEdit({ ...edit, model: e.target.value })}
              />
              <datalist id="provider-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            {edit.protocol === "azure-openai" && (
              <label className="full">
                API version
                <input
                  value={edit.apiVersion || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, apiVersion: e.target.value })
                  }
                />
              </label>
            )}
            <label className="full">
              API key{" "}
              {edit.hasKey && <small>(leave blank to retain saved key)</small>}
              <input
                type="password"
                value={apiKey}
                autoComplete="new-password"
                disabled={!state.vaultAvailable}
                placeholder={
                  state.vaultAvailable
                    ? "Enter a key, or leave blank for a local endpoint"
                    : "Secure storage unavailable"
                }
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
          </div>
          <p className="muted">
            Save first, then test model listing. A compatible protocol does not
            guarantee every provider feature. Your account may incur charges
            when you send messages.
          </p>
          <div className="button-row">
            {state.profiles.some((p) => p.id === edit.id) && (
              <button
                disabled={busy}
                onClick={() =>
                  void localAction(async () => {
                    setModels(await window.harness.listModels(edit.id));
                    notify(
                      "Model list received. Select or enter the model you want to use.",
                    );
                  })
                }
              >
                List models
              </button>
            )}
            {edit.hasKey && (
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void localAction(async () => {
                    await window.harness.clearKey(edit.id);
                    setEdit({ ...edit, hasKey: false });
                    await refresh();
                    notify("Saved API key removed.");
                  })
                }
              >
                Remove saved key
              </button>
            )}
            <button
              className="primary"
              disabled={busy || !edit.name.trim() || !edit.baseUrl.trim()}
              onClick={() =>
                void localAction(async () => {
                  await window.harness.saveProfile(edit, apiKey || undefined);
                  setApiKey("");
                  setEdit(null);
                  await refresh();
                  notify("Provider profile saved.");
                })
              }
            >
              <Check size={17} />
              Save profile
            </button>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal title="Remove provider?" close={() => setRemove(null)}>
          <p>
            Remove “{remove.name}” and its stored key? Existing conversations
            remain on this device.
          </p>
          <div className="button-row">
            <button onClick={() => setRemove(null)}>Cancel</button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void localAction(async () => {
                  await window.harness.removeProfile(remove.id);
                  setRemove(null);
                  await refresh();
                  notify("Provider removed.");
                })
              }
            >
              Remove provider
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function SettingsPage({
  settings,
  save,
  busy,
}: {
  settings: Settings;
  save: (value: Settings) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((s) => ({ ...s, [key]: value }));
  return (
    <div className="page-scroll">
      <div className="page-header">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>Settings</h1>
          <p>A comfortable workspace, on your terms.</p>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void save(draft)}
        >
          <Check size={18} />
          Save changes
        </button>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <h2>Appearance & language</h2>
          <p className="muted">Preferences are saved locally.</p>
          <label>
            Theme
            <select
              value={draft.theme}
              onChange={(e) =>
                change("theme", e.target.value as Settings["theme"])
              }
            >
              <option value="system">Follow system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Language / 語言
            <select
              value={draft.language}
              onChange={(e) =>
                change("language", e.target.value as Settings["language"])
              }
            >
              <option value="en">English</option>
              <option value="zh-HK">廣東話</option>
              <option value="bilingual">English + 廣東話</option>
            </select>
          </label>
          <label>
            Text size: {draft.fontSize}px
            <input
              type="range"
              min={12}
              max={24}
              value={draft.fontSize}
              onChange={(e) => change("fontSize", Number(e.target.value))}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.reducedMotion}
              onChange={(e) => change("reducedMotion", e.target.checked)}
            />
            Reduce motion
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.showEmojis}
              onChange={(e) => change("showEmojis", e.target.checked)}
            />
            Show decorative emojis in dialogs
          </label>
          <label>
            English playfulness: {draft.englishFunnyLevel}
            <input
              type="range"
              min={1}
              max={5}
              value={draft.englishFunnyLevel}
              onChange={(e) =>
                change("englishFunnyLevel", Number(e.target.value))
              }
            />
          </label>
          <label>
            廣東話趣味程度: {draft.cantoneseFunnyLevel}
            <input
              type="range"
              min={1}
              max={5}
              value={draft.cantoneseFunnyLevel}
              onChange={(e) =>
                change("cantoneseFunnyLevel", Number(e.target.value))
              }
            />
          </label>
          <small>
            1 is serious. Higher values enable the playful greeting.
            Comprehensive copy variation is still in development.
          </small>
        </section>
        <section className="settings-card">
          <h2>Model defaults</h2>
          <p className="muted">
            Providers may interpret or reject these values differently.
          </p>
          <label>
            Temperature: {draft.temperature.toFixed(1)}
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={draft.temperature}
              onChange={(e) => change("temperature", Number(e.target.value))}
            />
          </label>
          <label>
            Maximum output tokens
            <input
              type="number"
              min={1}
              max={65536}
              value={draft.maxTokens}
              onChange={(e) => change("maxTokens", Number(e.target.value))}
            />
          </label>
          <label>
            System prompt
            <textarea
              rows={7}
              maxLength={20000}
              value={draft.systemPrompt}
              placeholder="How should the assistant approach your requests?"
              onChange={(e) => change("systemPrompt", e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.toolsEnabled}
              onChange={(e) => change("toolsEnabled", e.target.checked)}
            />
            Enable approved workspace tools
          </label>
          <div className="info-card">
            <ShieldCheck size={20} />
            <p>
              Tools can inspect or modify your selected workspace. Writes and
              commands require approval in a native confirmation dialog.
              Read-only actions execute after tools are enabled. Keep this off
              when you do not need tools.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
function HelpPage({ importChat }: { importChat: () => void }) {
  return (
    <div className="page-scroll">
      <div className="page-header">
        <div>
          <span className="eyebrow">A GOOD PLACE TO START</span>
          <h1>Help & privacy</h1>
          <p>Clear boundaries. No mystery machinery.</p>
        </div>
        <button onClick={importChat}>
          <Upload size={18} />
          Import conversation
        </button>
      </div>
      <div className="help-grid">
        <section className="settings-card">
          <h2>Connect a provider</h2>
          <ol>
            <li>
              Open Providers and choose a preset, or create a compatible
              profile.
            </li>
            <li>
              Enter your endpoint, exact model name, and your own API key if
              required.
            </li>
            <li>
              Save the profile. Choose Test connection to request its model
              list.
            </li>
            <li>Select the profile in the composer and send a message.</li>
          </ol>
          <p>
            Model listing and chat generation are separate capabilities. Some
            endpoints do not support listing, tools, streaming, or usage
            reporting. No universal provider compatibility is claimed.
          </p>
        </section>
        <section className="settings-card">
          <h2>Your data & API keys</h2>
          <p>
            Conversation history and preferences stay on this device. Messages,
            system prompts and approved tool results are sent to your selected
            provider. That provider's privacy and retention terms apply.
          </p>
          <p>
            API keys are kept by the desktop process using operating-system
            secure storage. The renderer receives presence only. Keys do not
            enter conversation exports. If encryption is unavailable, saving a
            key is blocked.
          </p>
          <p>
            Remote Markdown images are blocked to prevent tracking requests. Raw
            HTML is not rendered. External links open in your browser.
          </p>
        </section>
        <section className="settings-card">
          <h2>Workspace tools</h2>
          <p>
            Choose a workspace folder and explicitly enable tools in Settings.
            Read the preview before approving. A denial returns to the model
            without performing that operation.
          </p>
          <p>
            Only the supported workspace actions are offered. Model output is
            untrusted and cannot grant itself permission. Review generated files
            and commands before using them.
          </p>
        </section>
        <section className="settings-card">
          <h2>Keyboard & portability</h2>
          <dl>
            <dt>Send</dt>
            <dd>Enter</dd>
            <dt>New line</dt>
            <dd>Shift+Enter</dd>
            <dt>Command palette</dt>
            <dd>Ctrl+Shift+F</dd>
            <dt>Close dialog</dt>
            <dd>Escape</dd>
          </dl>
          <p>
            Export the active conversation as JSON or Markdown from its actions
            menu. JSON import opens a native file picker. Delete is permanent,
            so export before removing a conversation.
          </p>
          <p>
            The desktop interface supports a minimum client width of 860px.
            Optional details close when space is limited. Full localization and
            the universal feature inventory are not yet complete.
          </p>
        </section>
      </div>
    </div>
  );
}
