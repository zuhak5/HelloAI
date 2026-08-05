"use client";

import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  Copy,
  Edit3,
  GitBranch,
  ImagePlus,
  Install,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Send,
  Settings,
  Square,
  Trash2,
  User,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttachmentImage } from "@/components/AttachmentImage";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { SettingsDialog } from "@/components/SettingsDialog";
import {
  clearAllData,
  cloneConversation,
  createConversation,
  deleteConversation,
  deleteMessagesAfter,
  exportLocalData,
  getAttachment,
  importLocalData,
  listConversations,
  listMessages,
  putAttachments,
  putConversation,
  putMessage,
  putMessages,
  searchConversations,
  subscribeToDatabaseChanges,
} from "@/lib/db";
import { blobToDataUrl, prepareImage } from "@/lib/images";
import { applyTheme, DEFAULT_PREFERENCES, loadPreferences, savePreferences } from "@/lib/preferences";
import { consumeGatewayStream } from "@/lib/stream";
import type {
  AttachmentRecord,
  BrowserChatMessage,
  ChatMessage,
  Conversation,
  ModelInfo,
  PendingImage,
  Preferences,
} from "@/lib/types";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "gpt-5.6-terra", name: "gpt-5.6-terra", vision: true, reasoning: true, available: true },
  { id: "gpt-5.5", name: "gpt-5.5", vision: true, reasoning: true, available: true },
  { id: "gpt-5.4", name: "gpt-5.4", vision: true, reasoning: true, available: true },
  { id: "gpt-5.4-mini", name: "gpt-5.4-mini", vision: true, reasoning: false, available: true },
];

function messageText(message: ChatMessage): string {
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function titleFromText(text: string, hasImage: boolean): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return hasImage ? "Image chat" : "New chat";
  return compact.length > 46 ? `${compact.slice(0, 43)}…` : compact;
}

function formatConversationDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function serializeHistory(history: ChatMessage[], systemPrompt: string): Promise<BrowserChatMessage[]> {
  const eligible = history
    .filter((message) => message.status !== "streaming" && (messageText(message).trim() || message.parts.some((part) => part.type === "image")))
    .slice(-40);
  const allowedImageIds = new Set<string>();
  for (const message of [...eligible].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type === "image" && allowedImageIds.size < 3) allowedImageIds.add(part.attachmentId);
    }
  }

  const serialized: BrowserChatMessage[] = [];
  if (systemPrompt.trim()) {
    serialized.push({ id: crypto.randomUUID(), role: "system", content: [{ type: "text", text: systemPrompt.trim() }] });
  }

  for (const message of eligible) {
    const content: BrowserChatMessage["content"] = [];
    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) content.push({ type: "text", text: part.text });
      if (part.type === "image") {
        if (!allowedImageIds.has(part.attachmentId)) {
          content.push({ type: "text", text: `[Earlier image omitted from this request: ${part.name}]` });
          continue;
        }
        const attachment = await getAttachment(part.attachmentId);
        if (attachment) {
          content.push({
            type: "image",
            mediaType: attachment.mediaType,
            dataUrl: await blobToDataUrl(attachment.blob),
            width: attachment.width,
            height: attachment.height,
          });
        }
      }
    }
    if (content.length) serialized.push({ id: message.id, role: message.role, content });
  }
  return serialized;
}

export function HelloAIApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [composer, setComposer] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [search, setSearch] = useState("");
  const [searchMatches, setSearchMatches] = useState<Set<string> | null>(null);
  const [archiveView, setArchiveView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [storageText, setStorageText] = useState("Calculating…");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentConversation = conversations.find((conversation) => conversation.id === currentId);
  const currentModel = models.find((model) => model.id === (currentConversation?.model || preferences.model)) || models[0];

  const notify = useCallback((value: string) => {
    setToast(value);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshConversations = useCallback(async () => {
    const next = await listConversations();
    setConversations(next);
    return next;
  }, []);

  const refreshMessages = useCallback(async (conversationId: string | null) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setMessages(await listMessages(conversationId));
  }, []);

  const calculateStorage = useCallback(async () => {
    if (!navigator.storage?.estimate) {
      setStorageText("Storage estimate unavailable in this browser.");
      return;
    }
    const estimate = await navigator.storage.estimate();
    const persistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    setStorageText(`${formatBytes(estimate.usage || 0)} used of approximately ${formatBytes(estimate.quota || 0)}${persistent ? " · persistent storage granted" : ""}`);
  }, []);

  useEffect(() => {
    const saved = loadPreferences();
    setPreferences(saved);
    applyTheme(saved);
    setOnline(navigator.onLine);

    let active = true;
    Promise.all([listConversations(), fetch("/api/models", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null)])
      .then(async ([storedConversations, modelPayload]) => {
        if (!active) return;
        if (modelPayload?.models?.length) {
          setModels(modelPayload.models as ModelInfo[]);
          if (!modelPayload.models.some((model: ModelInfo) => model.id === saved.model)) {
            const next = { ...saved, model: modelPayload.defaultModel || modelPayload.models[0].id };
            setPreferences(next);
            savePreferences(next);
          }
        }
        let nextConversations = storedConversations;
        if (!nextConversations.length) nextConversations = [await createConversation(saved.model)];
        if (!active) return;
        setConversations(nextConversations);
        const selected = nextConversations.find((conversation) => !conversation.archived) || nextConversations[0];
        setCurrentId(selected?.id || null);
      })
      .catch(() => notify("Local storage could not be initialized."));

    navigator.storage?.persist?.().catch(() => undefined);
    calculateStorage().catch(() => undefined);

    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", installHandler);

    return () => {
      active = false;
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("beforeinstallprompt", installHandler);
    };
  }, [calculateStorage, notify]);

  useEffect(() => subscribeToDatabaseChanges(() => {
    refreshConversations().catch(() => undefined);
    refreshMessages(currentId).catch(() => undefined);
  }), [currentId, refreshConversations, refreshMessages]);

  useEffect(() => {
    refreshMessages(currentId).catch(() => notify("Could not load this conversation."));
    const conversation = conversations.find((item) => item.id === currentId);
    setComposer(conversation?.draft || "");
    setPendingImages((items) => {
      for (const item of items) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentConversation) return;
    const timer = setTimeout(() => {
      if (currentConversation.draft === composer) return;
      const updated = { ...currentConversation, draft: composer };
      setConversations((items) => items.map((item) => item.id === updated.id ? updated : item));
      putConversation(updated).catch(() => undefined);
    }, 450);
    return () => clearTimeout(timer);
  }, [composer, currentConversation]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchMatches(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchConversations(search).then((matches) => active && setSearchMatches(matches)).catch(() => undefined);
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);

  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.archived === archiveView && (!searchMatches || searchMatches.has(conversation.id))),
    [archiveView, conversations, searchMatches],
  );

  const updatePreferences = useCallback((value: Preferences) => {
    setPreferences(value);
    savePreferences(value);
    applyTheme(value);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setCurrentId(id);
    setSidebarOpen(false);
  }, []);

  const newChat = useCallback(async () => {
    const conversation = await createConversation(preferences.model);
    setConversations((items) => [conversation, ...items]);
    selectConversation(conversation.id);
  }, [preferences.model, selectConversation]);

  const updateConversation = useCallback(async (conversation: Conversation) => {
    await putConversation(conversation);
    setConversations((items) => items.map((item) => item.id === conversation.id ? conversation : item).sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
  }, []);

  const chooseModel = useCallback(async (model: string) => {
    updatePreferences({ ...preferences, model });
    if (currentConversation) await updateConversation({ ...currentConversation, model, updatedAt: new Date().toISOString() });
  }, [currentConversation, preferences, updateConversation, updatePreferences]);

  const addImages = useCallback(async (files: File[]) => {
    if (!currentModel?.vision) {
      notify("The selected model is not configured for image input.");
      return;
    }
    const availableSlots = 3 - pendingImages.length;
    if (availableSlots <= 0) {
      notify("A message may contain at most three images.");
      return;
    }
    for (const file of files.slice(0, availableSlots)) {
      try {
        const prepared = await prepareImage(file);
        setPendingImages((items) => [...items, prepared]);
      } catch (error) {
        notify(error instanceof Error ? error.message : "The image could not be processed.");
      }
    }
  }, [currentModel?.vision, notify, pendingImages.length]);

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((items) => {
      const removed = items.find((item) => item.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return items.filter((item) => item.id !== id);
    });
  }, []);

  const updateAssistantInState = useCallback((assistantId: string, update: Partial<ChatMessage>) => {
    setMessages((items) => items.map((message) => message.id === assistantId ? { ...message, ...update } : message));
  }, []);

  const generate = useCallback(async (conversation: Conversation, history: ChatMessage[], assistant: ChatMessage) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    let text = "";
    let metadata: Partial<ChatMessage> = {};
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const started = performance.now();

    const flush = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      const next = { ...assistant, parts: [{ type: "text" as const, text }], status: "streaming" as const, ...metadata };
      putMessage(next, false).catch(() => undefined);
    };

    try {
      const payloadMessages = await serializeHistory(history, preferences.systemPrompt);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId: conversation.id,
          requestId: assistant.requestId,
          model: conversation.model,
          messages: payloadMessages,
          maxOutputTokens: preferences.maxOutputTokens,
          ...(preferences.reasoning !== "off" && currentModel?.reasoning ? { reasoning: preferences.reasoning } : {}),
        }),
      });

      await consumeGatewayStream(response, {
        onText(delta) {
          text += delta;
          updateAssistantInState(assistant.id, { parts: [{ type: "text", text }] });
          if (!flushTimer) flushTimer = setTimeout(flush, 250);
        },
        onMeta(meta) {
          metadata = {
            ...metadata,
            model: meta.model,
            inputTokens: meta.inputTokens,
            outputTokens: meta.outputTokens,
          };
        },
      });
      if (!text.trim()) text = "The gateway completed the request without returning text.";
      const complete: ChatMessage = {
        ...assistant,
        parts: [{ type: "text", text }],
        status: "complete",
        latencyMs: Math.round(performance.now() - started),
        ...metadata,
      };
      if (flushTimer) clearTimeout(flushTimer);
      await putMessage(complete);
      updateAssistantInState(assistant.id, complete);
      await refreshConversations();
    } catch (error) {
      if (flushTimer) clearTimeout(flushTimer);
      const cancelled = controller.signal.aborted;
      const failed: ChatMessage = {
        ...assistant,
        parts: [{ type: "text", text }],
        status: cancelled ? "cancelled" : "error",
        error: cancelled ? "Generation stopped." : (error instanceof Error ? error.message : "Generation failed."),
        latencyMs: Math.round(performance.now() - started),
      };
      await putMessage(failed);
      updateAssistantInState(assistant.id, failed);
      if (!cancelled) notify(failed.error || "Generation failed.");
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  }, [currentModel?.reasoning, notify, preferences.maxOutputTokens, preferences.reasoning, preferences.systemPrompt, refreshConversations, updateAssistantInState]);

  const sendMessage = useCallback(async () => {
    if (generating) return;
    if (!online) {
      notify("You are offline. Local chats remain available, but AI generation requires a connection.");
      return;
    }
    const trimmed = composer.trim();
    if (!trimmed && !pendingImages.length) return;

    let conversation = currentConversation;
    if (!conversation) {
      conversation = await createConversation(preferences.model);
      setConversations((items) => [conversation!, ...items]);
      setCurrentId(conversation.id);
    }

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: userId,
      conversationId: conversation.id,
      role: "user",
      parts: [
        ...(trimmed ? [{ type: "text" as const, text: trimmed }] : []),
        ...pendingImages.map((image) => ({
          type: "image" as const,
          attachmentId: image.id,
          name: image.name,
          mediaType: image.mediaType,
          width: image.width,
          height: image.height,
        })),
      ],
      createdAt: now,
      status: "complete",
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: conversation.id,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
      createdAt: new Date(Date.now() + 1).toISOString(),
      status: "streaming",
      requestId: crypto.randomUUID(),
    };
    const attachments: AttachmentRecord[] = pendingImages.map((image) => ({
      id: image.id,
      conversationId: conversation!.id,
      messageId: userId,
      name: image.name,
      mediaType: image.mediaType,
      width: image.width,
      height: image.height,
      size: image.size,
      blob: image.blob,
      createdAt: now,
    }));

    const updatedConversation: Conversation = {
      ...conversation,
      title: conversation.title === "New chat" ? titleFromText(trimmed, pendingImages.length > 0) : conversation.title,
      draft: "",
      updatedAt: now,
    };
    await Promise.all([putAttachments(attachments), putMessages([userMessage, assistant])]);
    await putConversation(updatedConversation);
    setConversations((items) => items.map((item) => item.id === conversation!.id ? updatedConversation : item));
    const history = [...messages, userMessage];
    setMessages([...history, assistant]);
    setComposer("");
    setPendingImages((items) => {
      for (const item of items) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
    await generate(updatedConversation, history, assistant);
  }, [composer, currentConversation, generate, generating, messages, notify, online, pendingImages, preferences.model]);

  const stopGeneration = useCallback(() => abortRef.current?.abort(), []);

  const regenerate = useCallback(async (assistantMessage: ChatMessage) => {
    if (!currentConversation || generating) return;
    const index = messages.findIndex((message) => message.id === assistantMessage.id);
    const userIndex = [...messages.slice(0, index)].map((message) => message.role).lastIndexOf("user");
    if (userIndex < 0) return;
    const userMessage = messages[userIndex];
    await deleteMessagesAfter(currentConversation.id, userMessage.createdAt, false);
    const history = messages.slice(0, userIndex + 1);
    const nextAssistant: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: currentConversation.id,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
      createdAt: new Date(Date.now() + 1).toISOString(),
      status: "streaming",
      requestId: crypto.randomUUID(),
    };
    await putMessage(nextAssistant);
    setMessages([...history, nextAssistant]);
    await generate(currentConversation, history, nextAssistant);
  }, [currentConversation, generate, generating, messages]);

  const editUserMessage = useCallback(async (message: ChatMessage) => {
    if (!currentConversation || generating) return;
    const currentText = messageText(message);
    const revised = window.prompt("Edit this message. Later messages will be removed.", currentText);
    if (revised === null || !revised.trim()) return;
    const updated: ChatMessage = {
      ...message,
      parts: [{ type: "text", text: revised.trim() }, ...message.parts.filter((part) => part.type === "image")],
    };
    await putMessage(updated);
    await deleteMessagesAfter(currentConversation.id, message.createdAt, false);
    const index = messages.findIndex((item) => item.id === message.id);
    const history = [...messages.slice(0, index), updated];
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId: currentConversation.id,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
      createdAt: new Date(Date.now() + 1).toISOString(),
      status: "streaming",
      requestId: crypto.randomUUID(),
    };
    await putMessage(assistant);
    setMessages([...history, assistant]);
    await generate(currentConversation, history, assistant);
  }, [currentConversation, generate, generating, messages]);

  const branchFrom = useCallback(async (message: ChatMessage) => {
    if (!currentConversation) return;
    try {
      const branch = await cloneConversation(currentConversation.id, message.id);
      await refreshConversations();
      selectConversation(branch.id);
      notify("Conversation branch created.");
    } catch {
      notify("Could not create the conversation branch.");
    }
  }, [currentConversation, notify, refreshConversations, selectConversation]);

  const removeConversation = useCallback(async (conversation: Conversation) => {
    if (!window.confirm(`Delete “${conversation.title}” and all local messages?`)) return;
    await deleteConversation(conversation.id);
    const next = await refreshConversations();
    if (currentId === conversation.id) {
      const replacement = next.find((item) => !item.archived) || next[0];
      if (replacement) setCurrentId(replacement.id);
      else await newChat();
    }
  }, [currentId, newChat, refreshConversations]);

  const renameConversation = useCallback(async (conversation: Conversation) => {
    const title = window.prompt("Rename conversation", conversation.title)?.trim();
    if (title) await updateConversation({ ...conversation, title: title.slice(0, 100), updatedAt: new Date().toISOString() });
  }, [updateConversation]);

  const exportChats = useCallback(async () => {
    try {
      downloadText(`helloai-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportLocalData());
      notify("Local backup exported.");
    } catch {
      notify("Could not export local data.");
    }
  }, [notify]);

  const importChats = useCallback(async (file: File) => {
    try {
      await importLocalData(await file.text());
      const next = await refreshConversations();
      if (next[0]) setCurrentId(next[0].id);
      await calculateStorage();
      notify("Local backup imported.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not import local data.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }, [calculateStorage, notify, refreshConversations]);

  const clearData = useCallback(async () => {
    if (!window.confirm("Delete every local conversation, image, and draft from this browser? This cannot be undone.")) return;
    abortRef.current?.abort();
    await clearAllData();
    const conversation = await createConversation(preferences.model);
    setConversations([conversation]);
    setCurrentId(conversation.id);
    setMessages([]);
    setSettingsOpen(false);
    await calculateStorage();
    notify("Local HelloAI data cleared.");
  }, [calculateStorage, notify, preferences.model]);

  const resetSettings = useCallback(() => {
    updatePreferences(DEFAULT_PREFERENCES);
    notify("Settings reset to defaults.");
  }, [notify, updatePreferences]);

  const installApp = useCallback(async () => {
    if (!installPrompt) {
      notify("Use your browser menu and choose “Install app” or “Add to Home Screen.”");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }, [installPrompt, notify]);

  return (
    <main className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault();
      addImages(Array.from(event.dataTransfer.files)).catch(() => undefined);
    }}>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Bot size={22} /></div>
          <div><strong>HelloAI</strong><span>Private local workspace</span></div>
          <button className="icon-button mobile-only" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={19} /></button>
        </div>
        <button className="new-chat-button" onClick={newChat}><MessageSquarePlus size={18} /> New chat</button>
        <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search local chats" aria-label="Search conversations" />{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}</label>
        <div className="conversation-list" aria-label={archiveView ? "Archived conversations" : "Conversations"}>
          {visibleConversations.length === 0 && <div className="sidebar-empty">{search ? "No local matches." : archiveView ? "No archived chats." : "Start a new conversation."}</div>}
          {visibleConversations.map((conversation) => (
            <div key={conversation.id} className={`conversation-item ${conversation.id === currentId ? "active" : ""}`}>
              <button className="conversation-select" onClick={() => selectConversation(conversation.id)}>
                <span>{conversation.pinned && <Pin size={12} fill="currentColor" />}{conversation.title}</span>
                <small>{formatConversationDate(conversation.updatedAt)}</small>
              </button>
              <details className="conversation-menu">
                <summary aria-label={`Actions for ${conversation.title}`}><MoreHorizontal size={17} /></summary>
                <div className="menu-popover">
                  <button onClick={() => renameConversation(conversation)}><Edit3 size={15} /> Rename</button>
                  <button onClick={() => updateConversation({ ...conversation, pinned: !conversation.pinned, updatedAt: new Date().toISOString() })}>{conversation.pinned ? <PinOff size={15} /> : <Pin size={15} />}{conversation.pinned ? "Unpin" : "Pin"}</button>
                  <button onClick={() => updateConversation({ ...conversation, archived: !conversation.archived, updatedAt: new Date().toISOString() })}>{conversation.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{conversation.archived ? "Restore" : "Archive"}</button>
                  <button className="menu-danger" onClick={() => removeConversation(conversation)}><Trash2 size={15} /> Delete</button>
                </div>
              </details>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <button className={archiveView ? "active" : ""} onClick={() => setArchiveView((value) => !value)}>{archiveView ? <ArchiveRestore size={17} /> : <Archive size={17} />}{archiveView ? "Back to chats" : "Archived"}</button>
          <button onClick={() => setSettingsOpen(true)}><Settings size={17} /> Settings</button>
          <a href="/privacy"><span>Privacy</span><small>Local-first</small></a>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <button className="icon-button mobile-only" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <div className="header-title"><strong>{currentConversation?.title || "HelloAI"}</strong><span>{online ? "AI gateway available" : "Offline · local history only"}</span></div>
          <div className="header-actions">
            <label className="model-select"><span className="sr-only">Model</span><select value={currentConversation?.model || preferences.model} onChange={(event) => chooseModel(event.target.value)} disabled={generating}>{models.map((model) => <option key={model.id} value={model.id} disabled={!model.available}>{model.name}</option>)}</select></label>
            <span className={`connection-pill ${online ? "online" : "offline"}`}>{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? "Online" : "Offline"}</span>
            <button className="icon-button desktop-install" onClick={installApp} aria-label="Install HelloAI"><Install size={19} /></button>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings size={19} /></button>
          </div>
        </header>

        {!online && <div className="offline-banner"><WifiOff size={16} /> HelloAI is offline. You can read and manage local chats, but new AI requests are disabled.</div>}

        <div className="message-scroll">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="hero-mark"><Bot size={32} /></div>
              <h1>What can I help with?</h1>
              <p>Open and chat immediately. Conversations and images remain in this browser.</p>
              <div className="suggestion-grid">
                {["Explain a difficult idea simply", "Review and improve some code", "Plan a project step by step", "Analyze an image I upload"].map((suggestion) => (
                  <button key={suggestion} onClick={() => setComposer(suggestion)}>{suggestion}<Send size={15} /></button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages" role="log" aria-live="polite">
              {messages.map((message) => {
                const text = messageText(message);
                return (
                  <article key={message.id} className={`message-row ${message.role}`}>
                    <div className="message-avatar">{message.role === "assistant" ? <Bot size={18} /> : <User size={18} />}</div>
                    <div className="message-main">
                      <div className="message-heading"><strong>{message.role === "assistant" ? "HelloAI" : "You"}</strong><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                      <div className="message-content">
                        {message.parts.filter((part) => part.type === "image").map((part) => part.type === "image" ? <AttachmentImage key={part.attachmentId} attachmentId={part.attachmentId} alt={part.name} /> : null)}
                        {message.role === "assistant" ? <MarkdownMessage text={text} /> : <p className="user-text">{text}</p>}
                        {message.status === "streaming" && <span className="stream-cursor" aria-label="Generating" />}
                        {message.error && <div className={`message-error ${message.status === "cancelled" ? "cancelled" : ""}`}>{message.error}</div>}
                      </div>
                      {message.status !== "streaming" && (
                        <div className="message-actions">
                          <button onClick={() => navigator.clipboard.writeText(text).then(() => notify("Copied."))}><Copy size={14} /> Copy</button>
                          {message.role === "user" && <button onClick={() => editUserMessage(message)}><Edit3 size={14} /> Edit</button>}
                          {message.role === "assistant" && <button onClick={() => regenerate(message)}><RefreshCw size={14} /> Regenerate</button>}
                          <button onClick={() => branchFrom(message)}><GitBranch size={14} /> Branch</button>
                          {message.role === "assistant" && text && <button onClick={() => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }}><Volume2 size={14} /> Read</button>}
                          {message.model && <span className="message-meta">{message.model}{message.outputTokens ? ` · ${message.outputTokens} tokens` : ""}{message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ""}</span>}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="composer-zone">
          <div className={`composer-card ${!online ? "disabled" : ""}`}>
            {pendingImages.length > 0 && <div className="pending-images">{pendingImages.map((image) => <div key={image.id} className="pending-image"><img src={image.previewUrl} alt={image.name} /><button onClick={() => removePendingImage(image.id)} aria-label={`Remove ${image.name}`}><X size={14} /></button><span>{formatBytes(image.size)}</span></div>)}</div>}
            <textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
                if (files.length) addImages(files).catch(() => undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage().catch(() => undefined);
                }
              }}
              placeholder={online ? "Message HelloAI…" : "Offline — drafts are saved locally"}
              aria-label="Message HelloAI"
              rows={1}
              maxLength={30000}
            />
            <div className="composer-toolbar">
              <div>
                <button className="icon-button" onClick={() => fileInputRef.current?.click()} disabled={!currentModel?.vision || pendingImages.length >= 3} aria-label="Attach images" title={currentModel?.vision ? "Attach image" : "Image input is not enabled for this model"}><ImagePlus size={19} /></button>
                <span className="composer-hint">{currentModel?.vision ? "Images supported" : "Text model"} · Enter to send</span>
              </div>
              {generating ? <button className="stop-button" onClick={stopGeneration}><Square size={15} fill="currentColor" /> Stop</button> : <button className="send-button" onClick={() => sendMessage().catch(() => undefined)} disabled={!online || (!composer.trim() && !pendingImages.length)}><Send size={17} /> Send</button>}
            </div>
          </div>
          <p className="composer-disclaimer">AI can make mistakes. Chats are stored only on this device; requests are processed through the HomePilot gateway.</p>
        </div>
      </section>

      <input ref={fileInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => addImages(Array.from(event.target.files || [])).finally(() => { if (fileInputRef.current) fileInputRef.current.value = ""; })} />
      <input ref={importInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) importChats(file).catch(() => undefined); }} />

      <SettingsDialog
        open={settingsOpen}
        preferences={preferences}
        models={models}
        storageText={storageText}
        onChange={updatePreferences}
        onClose={() => setSettingsOpen(false)}
        onExport={exportChats}
        onImport={() => importInputRef.current?.click()}
        onClear={clearData}
        onReset={resetSettings}
      />
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </main>
  );
}
