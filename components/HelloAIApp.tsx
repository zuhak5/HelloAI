"use client";

import {
  AlertCircle,
  CheckCircle2,
  Info,
  ImagePlus,
  Install,
  Menu,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { ActionDialog } from "@/components/ActionDialog";
import { ChatComposer } from "@/components/ChatComposer";
import { ChatMessages } from "@/components/ChatMessages";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { PwaInstallDialog } from "@/components/PwaInstallDialog";
import { usePwa } from "@/components/PwaProvider";
import {
  clearAllData,
  cloneConversation,
  createConversation,
  deleteConversation,
  deleteMessagesAfter,
  exportLocalData,
  listConversations,
  listMessages,
  putAttachments,
  putConversation,
  putMessage,
  putMessages,
  searchConversations,
  subscribeToDatabaseChanges,
} from "@/lib/db";
import { importValidatedBackup } from "@/lib/backup";
import { serializeHistory } from "@/lib/chat-history";
import { formatBytes, messageText, titleFromText } from "@/lib/chat-utils";
import { prepareImage } from "@/lib/images";
import { applyTheme, DEFAULT_PREFERENCES, loadPreferences, savePreferences } from "@/lib/preferences";
import { consumeGatewayStream } from "@/lib/stream";
import type {
  AttachmentRecord,
  ChatMessage,
  Conversation,
  ModelInfo,
  PendingImage,
  Preferences,
} from "@/lib/types";


interface ModelsPayload {
  defaultModel?: string;
  enabled?: boolean;
  configured?: boolean;
  models?: ModelInfo[];
}

type ToastTone = "success" | "error" | "info";
interface ToastState {
  message: string;
  tone: ToastTone;
}

type ActionState =
  | { kind: "rename"; conversation: Conversation }
  | { kind: "delete"; conversation: Conversation }
  | { kind: "edit"; message: ChatMessage }
  | { kind: "regenerate"; message: ChatMessage }
  | { kind: "clear" }
  | null;

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "gpt-5.6-terra", name: "gpt-5.6-terra", vision: true, reasoning: true, available: true },
  { id: "gpt-5.5", name: "gpt-5.5", vision: true, reasoning: true, available: true },
  { id: "gpt-5.4", name: "gpt-5.4", vision: true, reasoning: true, available: true },
  { id: "gpt-5.4-mini", name: "gpt-5.4-mini", vision: true, reasoning: false, available: true },
];

function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


export function HelloAIApp() {
  const pwa = usePwa();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [composer, setComposer] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [search, setSearch] = useState("");
  const [searchMatches, setSearchMatches] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const [archiveView, setArchiveView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [action, setAction] = useState<ActionState>(null);
  const [online, setOnline] = useState(true);
  const [gatewayEnabled, setGatewayEnabled] = useState(true);
  const [gatewayConfigured, setGatewayConfigured] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [storageText, setStorageText] = useState("Calculating…");
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [generationAnnouncement, setGenerationAnnouncement] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atBottomRef = useRef(true);
  const dragDepthRef = useRef(0);
  const pendingImagesRef = useRef<PendingImage[]>([]);
  const discardGenerationRef = useRef(false);

  const currentConversation = conversations.find((conversation) => conversation.id === currentId);
  const selectedModelId = currentConversation?.model || preferences.model;
  const currentModel = models.find((model) => model.id === selectedModelId) || models[0];
  const generationAvailable = online && gatewayEnabled && gatewayConfigured && Boolean(currentModel?.available);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ message, tone });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), tone === "error" ? 5000 : 3400);
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

  const initialize = useCallback(async () => {
    setInitializing(true);
    setInitializationError(null);
    const saved = loadPreferences();
    setPreferences(saved);
    applyTheme(saved);
    setOnline(navigator.onLine);

    try {
      const [storedConversations, modelPayload] = await Promise.all([
        listConversations(),
        fetch("/api/models", { cache: "no-store" })
          .then(async (response) => response.ok ? await response.json() as ModelsPayload : null)
          .catch(() => null),
      ]);

      let resolvedPreferences = saved;
      if (modelPayload?.models?.length) {
        setModels(modelPayload.models);
        setGatewayEnabled(modelPayload.enabled !== false);
        setGatewayConfigured(modelPayload.configured !== false);
        if (!modelPayload.models.some((model) => model.id === saved.model && model.available)) {
          resolvedPreferences = {
            ...saved,
            model: modelPayload.defaultModel || modelPayload.models.find((model) => model.available)?.id || modelPayload.models[0].id,
          };
          setPreferences(resolvedPreferences);
          savePreferences(resolvedPreferences);
        }
      }

      let nextConversations = storedConversations;
      const query = new URLSearchParams(window.location.search);
      const shortcutNewChat = query.get("new") === "1";
      if (!nextConversations.length || shortcutNewChat) {
        const conversation = await createConversation(resolvedPreferences.model);
        nextConversations = [conversation, ...nextConversations];
      }
      if (shortcutNewChat) {
        query.delete("new");
        const suffix = query.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${suffix ? `?${suffix}` : ""}${window.location.hash}`);
      }

      setConversations(nextConversations);
      const selected = nextConversations.find((conversation) => !conversation.archived) || nextConversations[0];
      setCurrentId(selected?.id || null);
      if (selected) {
        setMessages(await listMessages(selected.id));
        setComposer(selected.draft || "");
      }
      navigator.storage?.persist?.().catch(() => undefined);
      calculateStorage().catch(() => undefined);
    } catch (error) {
      setInitializationError(error instanceof Error ? error.message : "Local storage could not be initialized.");
    } finally {
      setInitializing(false);
    }
  }, [calculateStorage]);

  useEffect(() => {
    initialize().catch(() => undefined);

    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);

    return () => {
      abortRef.current?.abort();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [initialize]);

  useEffect(() => subscribeToDatabaseChanges(() => {
    refreshConversations().catch(() => undefined);
    if (!generating) refreshMessages(currentId).catch(() => undefined);
  }), [currentId, generating, refreshConversations, refreshMessages]);

  useEffect(() => {
    if (initializing) return;
    refreshMessages(currentId).catch(() => notify("Could not load this conversation.", "error"));
    setComposer(currentConversation?.draft || "");
    setPendingImages((items) => {
      for (const item of items) URL.revokeObjectURL(item.previewUrl);
      return [];
    });
    atBottomRef.current = true;
    setShowJumpToLatest(false);
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => () => {
    for (const item of pendingImagesRef.current) URL.revokeObjectURL(item.previewUrl);
  }, []);

  useEffect(() => {
    if (!currentConversation || initializing) return;
    const timer = setTimeout(() => {
      if (currentConversation.draft === composer) return;
      const updated = { ...currentConversation, draft: composer };
      setConversations((items) => items.map((item) => item.id === updated.id ? updated : item));
      putConversation(updated).catch(() => notify("Draft could not be saved locally.", "error"));
    }, 450);
    return () => clearTimeout(timer);
  }, [composer, currentConversation, initializing, notify]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchMatches(null);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchConversations(search)
        .then((matches) => {
          if (active) setSearchMatches(matches);
        })
        .catch(() => notify("Local search failed.", "error"))
        .finally(() => active && setSearching(false));
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [notify, search]);

  useEffect(() => {
    if (preferences.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme(preferences);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [preferences]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "helloai.preferences.v1") return;
      const next = loadPreferences();
      setPreferences(next);
      applyTheme(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.archived === archiveView && (!searchMatches || searchMatches.has(conversation.id))),
    [archiveView, conversations, searchMatches],
  );

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messageScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    atBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  useEffect(() => {
    if (!atBottomRef.current) return;
    const frame = requestAnimationFrame(() => scrollToLatest(generating ? "auto" : "smooth"));
    return () => cancelAnimationFrame(frame);
  }, [generating, messages, scrollToLatest]);

  const handleMessageScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    atBottomRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom);
  }, []);

  const updatePreferences = useCallback((value: Preferences) => {
    setPreferences(value);
    savePreferences(value);
    applyTheme(value);
  }, []);

  const selectConversation = useCallback((id: string) => {
    if (generating) {
      notify("Stop the current response before switching conversations.", "info");
      return;
    }
    setCurrentId(id);
    setSidebarOpen(false);
  }, [generating, notify]);

  const newChat = useCallback(async () => {
    if (generating) {
      notify("Stop the current response before starting another chat.", "info");
      return;
    }
    try {
      const conversation = await createConversation(preferences.model);
      setConversations((items) => [conversation, ...items]);
      setCurrentId(conversation.id);
      setArchiveView(false);
      setSearch("");
      setSidebarOpen(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch {
      notify("A new local conversation could not be created.", "error");
    }
  }, [generating, notify, preferences.model]);

  const updateConversation = useCallback(async (conversation: Conversation) => {
    await putConversation(conversation);
    setConversations((items) => items
      .map((item) => item.id === conversation.id ? conversation : item)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
  }, []);

  const chooseModel = useCallback(async (model: string) => {
    const modelInfo = models.find((item) => item.id === model);
    if (!modelInfo?.available) {
      notify("That model is currently unavailable.", "error");
      return;
    }
    if (!modelInfo.vision && pendingImages.length) {
      for (const image of pendingImages) URL.revokeObjectURL(image.previewUrl);
      setPendingImages([]);
      notify(`${pendingImages.length} attached image${pendingImages.length === 1 ? " was" : "s were"} removed because ${modelInfo.name} is text-only.`, "info");
    }
    updatePreferences({ ...preferences, model });
    if (currentConversation) {
      try {
        await updateConversation({ ...currentConversation, model, updatedAt: new Date().toISOString() });
      } catch {
        notify("The model selection could not be saved.", "error");
      }
    }
  }, [currentConversation, models, notify, pendingImages, preferences, updateConversation, updatePreferences]);

  const addImages = useCallback(async (files: File[]) => {
    if (!currentModel?.vision) {
      notify("The selected model is not configured for image input.", "error");
      return;
    }
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) {
      notify("Drop or choose a JPEG, PNG, or WebP image.", "error");
      return;
    }
    const availableSlots = 3 - pendingImages.length;
    if (availableSlots <= 0) {
      notify("A message may contain at most three images.", "info");
      return;
    }
    if (imageFiles.length > availableSlots) notify(`Only ${availableSlots} more image${availableSlots === 1 ? "" : "s"} can be attached.`, "info");

    for (const file of imageFiles.slice(0, availableSlots)) {
      try {
        const prepared = await prepareImage(file);
        setPendingImages((items) => [...items, prepared]);
      } catch (error) {
        notify(error instanceof Error ? error.message : "The image could not be processed.", "error");
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
    discardGenerationRef.current = false;
    abortRef.current = controller;
    setGenerating(true);
    setGenerationAnnouncement("HelloAI is generating a response.");
    atBottomRef.current = true;
    let text = "";
    let metadata: Partial<ChatMessage> = {};
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const started = performance.now();
    const modelInfo = models.find((model) => model.id === conversation.model);

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
          ...(preferences.reasoning !== "off" && modelInfo?.reasoning ? { reasoning: preferences.reasoning } : {}),
        }),
      });

      await consumeGatewayStream(response, {
        onText(delta) {
          text += delta;
          updateAssistantInState(assistant.id, { parts: [{ type: "text", text }] });
          if (!flushTimer) flushTimer = setTimeout(flush, 250);
        },
        onMeta(meta) {
          metadata = { ...metadata, model: meta.model, inputTokens: meta.inputTokens, outputTokens: meta.outputTokens };
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
      setGenerationAnnouncement("HelloAI response complete.");
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
      if (!discardGenerationRef.current) {
        await putMessage(failed).catch(() => undefined);
        updateAssistantInState(assistant.id, failed);
      }
      setGenerationAnnouncement(cancelled ? "Generation stopped." : "HelloAI response failed.");
      if (!cancelled) notify(failed.error || "Generation failed.", "error");
    } finally {
      abortRef.current = null;
      discardGenerationRef.current = false;
      setGenerating(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [models, notify, preferences.maxOutputTokens, preferences.reasoning, preferences.systemPrompt, refreshConversations, updateAssistantInState]);

  const sendMessage = useCallback(async () => {
    if (generating || initializing) return;
    if (!online) {
      notify("You are offline. Local chats remain available, but AI generation requires a connection.", "info");
      return;
    }
    if (!gatewayConfigured) {
      notify("The AI gateway credentials are not configured yet.", "error");
      return;
    }
    if (!gatewayEnabled) {
      notify("Chat is temporarily paused by the gateway administrator.", "error");
      return;
    }
    if (!currentModel?.available) {
      notify("The selected model is unavailable. Choose another model.", "error");
      return;
    }
    if (pendingImages.length && !currentModel.vision) {
      notify("Remove image attachments or choose a model with image support before sending.", "error");
      return;
    }

    const trimmed = composer.trim();
    if (!trimmed && !pendingImages.length) return;

    try {
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
      atBottomRef.current = true;
      await generate(updatedConversation, history, assistant);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The message could not be saved or sent.", "error");
    }
  }, [composer, currentConversation, currentModel?.available, currentModel?.vision, gatewayConfigured, gatewayEnabled, generate, generating, initializing, messages, notify, online, pendingImages, preferences.model]);

  const stopGeneration = useCallback(() => abortRef.current?.abort(), []);

  const performRegenerate = useCallback(async (assistantMessage: ChatMessage) => {
    if (!currentConversation || generating) return;
    if (!generationAvailable) throw new Error("AI generation is no longer available. Your conversation was not changed.");
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
  }, [currentConversation, generate, generating, generationAvailable, messages]);

  const requestRegenerate = useCallback((message: ChatMessage) => {
    const index = messages.findIndex((item) => item.id === message.id);
    if (index >= 0 && index < messages.length - 1) setAction({ kind: "regenerate", message });
    else performRegenerate(message).catch(() => notify("The response could not be regenerated.", "error"));
  }, [messages, notify, performRegenerate]);

  const requestEdit = useCallback((message: ChatMessage) => {
    if (!generationAvailable) {
      notify("AI generation is not currently available.", "info");
      return;
    }
    setAction({ kind: "edit", message });
  }, [generationAvailable, notify]);

  const performEdit = useCallback(async (message: ChatMessage, revised: string) => {
    if (!currentConversation || generating) return;
    if (!generationAvailable) throw new Error("AI generation is no longer available. Your conversation was not changed.");
    const updated: ChatMessage = {
      ...message,
      parts: [{ type: "text", text: revised }, ...message.parts.filter((part) => part.type === "image")],
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
  }, [currentConversation, generate, generating, generationAvailable, messages]);

  const branchFrom = useCallback(async (message: ChatMessage) => {
    if (!currentConversation || generating) return;
    try {
      const branch = await cloneConversation(currentConversation.id, message.id);
      await refreshConversations();
      setCurrentId(branch.id);
      notify("Conversation branch created.", "success");
    } catch {
      notify("Could not create the conversation branch.", "error");
    }
  }, [currentConversation, generating, notify, refreshConversations]);

  const handleBranch = useCallback((message: ChatMessage) => {
    branchFrom(message).catch(() => undefined);
  }, [branchFrom]);

  const performDeleteConversation = useCallback(async (conversation: Conversation) => {
    await deleteConversation(conversation.id);
    const next = await refreshConversations();
    if (currentId === conversation.id) {
      const replacement = next.find((item) => item.archived === archiveView) || next.find((item) => !item.archived) || next[0];
      if (replacement) setCurrentId(replacement.id);
      else await newChat();
    }
    notify("Conversation deleted from this device.", "success");
  }, [archiveView, currentId, newChat, notify, refreshConversations]);

  const toggleArchive = useCallback(async (conversation: Conversation) => {
    if (generating) {
      notify("Stop the current response before archiving conversations.", "info");
      return;
    }
    const updated = { ...conversation, archived: !conversation.archived, updatedAt: new Date().toISOString() };
    try {
      await updateConversation(updated);
      if (currentId === conversation.id && updated.archived !== archiveView) {
        const replacement = conversations.find((item) => item.id !== conversation.id && item.archived === archiveView);
        if (replacement) setCurrentId(replacement.id);
        else if (!archiveView) await newChat();
        else {
          setCurrentId(null);
          setMessages([]);
        }
      }
      notify(updated.archived ? "Conversation archived." : "Conversation restored.", "success");
    } catch {
      notify("The conversation could not be updated.", "error");
    }
  }, [archiveView, conversations, currentId, generating, newChat, notify, updateConversation]);

  const toggleArchiveView = useCallback(() => {
    if (generating) {
      notify("Stop the current response before changing conversation views.", "info");
      return;
    }
    const nextView = !archiveView;
    setArchiveView(nextView);
    setSearch("");
    const replacement = conversations.find((conversation) => conversation.archived === nextView);
    if (replacement) setCurrentId(replacement.id);
    else if (nextView) {
      setCurrentId(null);
      setMessages([]);
    } else {
      newChat().catch(() => undefined);
    }
  }, [archiveView, conversations, generating, newChat, notify]);

  const exportChats = useCallback(async () => {
    try {
      downloadText(`helloai-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportLocalData());
      notify("Local backup exported.", "success");
    } catch {
      notify("Could not export local data.", "error");
    }
  }, [notify]);

  const importChats = useCallback(async (file: File) => {
    try {
      if (file.size > 50_000_000) throw new Error("The backup file must be smaller than 50 MB.");
      await importValidatedBackup(await file.text());
      const next = await refreshConversations();
      const selected = next.find((conversation) => !conversation.archived) || next[0];
      if (selected) setCurrentId(selected.id);
      await calculateStorage();
      notify("Local backup imported and merged with this device.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not import local data.", "error");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }, [calculateStorage, notify, refreshConversations]);

  const performClearData = useCallback(async () => {
    discardGenerationRef.current = true;
    abortRef.current?.abort();
    await clearAllData();
    const conversation = await createConversation(preferences.model);
    setConversations([conversation]);
    setCurrentId(conversation.id);
    setMessages([]);
    setComposer("");
    setSettingsOpen(false);
    await calculateStorage();
    notify("Local HelloAI data cleared.", "success");
  }, [calculateStorage, notify, preferences.model]);

  const resetSettings = useCallback(() => {
    updatePreferences(DEFAULT_PREFERENCES);
    notify("Settings reset to defaults.", "success");
  }, [notify, updatePreferences]);

  const copyMessage = useCallback(async (message: ChatMessage) => {
    const text = messageText(message);
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied to clipboard.", "success");
    } catch {
      notify("Clipboard access is unavailable. Select and copy the text manually.", "error");
    }
  }, [notify]);

  const readMessage = useCallback((message: ChatMessage) => {
    if (!("speechSynthesis" in window)) {
      notify("Text-to-speech is unavailable in this browser.", "error");
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(messageText(message)));
  }, [notify]);

  const handleActionConfirm = useCallback(async (value?: string) => {
    const currentAction = action;
    if (!currentAction) return;
    try {
      if (currentAction.kind === "edit" && value) {
        setAction(null);
        await performEdit(currentAction.message, value);
        return;
      }
      if (currentAction.kind === "regenerate") {
        setAction(null);
        await performRegenerate(currentAction.message);
        return;
      }
      if (currentAction.kind === "rename" && value) {
        await updateConversation({ ...currentAction.conversation, title: value.slice(0, 100), updatedAt: new Date().toISOString() });
        notify("Conversation renamed.", "success");
      } else if (currentAction.kind === "delete") {
        await performDeleteConversation(currentAction.conversation);
      } else if (currentAction.kind === "clear") {
        await performClearData();
      }
      setAction(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The action could not be completed.", "error");
    }
  }, [action, notify, performClearData, performDeleteConversation, performEdit, performRegenerate, updateConversation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSidebarOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSuggestion = useCallback((suggestion: string) => {
    setComposer(suggestion);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const reloadApp = useCallback(() => window.location.reload(), []);

  const connectionLabel = !online ? "Offline" : !gatewayConfigured ? "Setup required" : !gatewayEnabled ? "Paused" : "Ready";
  const toastIcon = toast?.tone === "success" ? <CheckCircle2 size={17} /> : toast?.tone === "error" ? <AlertCircle size={17} /> : <Info size={17} />;

  return (
    <main
      className={`app-shell ${dragActive ? "drag-active" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (currentModel?.vision && Array.from(event.dataTransfer.types).includes("Files")) setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragActive(false);
        addImages(Array.from(event.dataTransfer.files)).catch(() => undefined);
      }}
    >
      <a className="skip-link" href="#chat-workspace">Skip to chat</a>

      <ConversationSidebar
        conversations={visibleConversations}
        currentId={currentId}
        archiveView={archiveView}
        search={search}
        searching={searching}
        open={sidebarOpen}
        busy={generating || initializing}
        pwaInstalled={pwa.installed}
        searchInputRef={searchInputRef}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => newChat().catch(() => undefined)}
        onSearch={setSearch}
        onSelect={selectConversation}
        onToggleArchiveView={toggleArchiveView}
        onOpenSettings={() => { setSidebarOpen(false); setSettingsOpen(true); }}
        onOpenInstall={() => { setSidebarOpen(false); setInstallDialogOpen(true); }}
        onRename={(conversation) => setAction({ kind: "rename", conversation })}
        onTogglePin={(conversation) => updateConversation({ ...conversation, pinned: !conversation.pinned, updatedAt: new Date().toISOString() }).catch(() => notify("The conversation could not be updated.", "error"))}
        onToggleArchive={toggleArchive}
        onDelete={(conversation) => setAction({ kind: "delete", conversation })}
      />

      <section id="chat-workspace" className="workspace" aria-label="Chat workspace" inert={sidebarOpen || undefined} tabIndex={-1}>
        <header className="workspace-header">
          <button type="button" className="icon-button mobile-only" aria-label="Open conversation sidebar" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <div className="header-title">
            <h1>{currentConversation?.title || "HelloAI"}</h1>
            <span>{!online ? "Local history only" : !gatewayConfigured ? "Gateway setup required" : gatewayEnabled ? "AI gateway available" : "AI gateway paused"}</span>
          </div>
          <div className="header-actions">
            <label className="model-select">
              <span className="sr-only">Model</span>
              <select value={selectedModelId} onChange={(event) => chooseModel(event.target.value)} disabled={generating || initializing}>
                {models.map((model) => <option key={model.id} value={model.id} disabled={!model.available}>{model.name}{model.available ? "" : " (unavailable)"}</option>)}
              </select>
            </label>
            <span className={`connection-pill ${generationAvailable ? "online" : "offline"}`}>
              {generationAvailable ? <Wifi size={14} /> : <WifiOff size={14} />}{connectionLabel}
            </span>
            {!pwa.installed && <button type="button" className="icon-button install-action" onClick={() => setInstallDialogOpen(true)} aria-label="Install HelloAI" title="Install HelloAI"><Install size={19} /></button>}
            <button type="button" className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><Settings size={19} /></button>
          </div>
        </header>

        {!online && <div className="offline-banner" role="status"><WifiOff size={16} /> HelloAI is offline. You can read and manage local chats, but new AI requests are disabled.</div>}
        {online && !gatewayConfigured && <div className="offline-banner paused-banner" role="status"><WifiOff size={16} /> AI gateway credentials are not configured. Local conversations remain available.</div>}
        {online && gatewayConfigured && !gatewayEnabled && <div className="offline-banner paused-banner" role="status"><WifiOff size={16} /> AI generation is temporarily paused. Local conversations remain available.</div>}

        <ChatMessages
          messages={messages}
          initializing={initializing}
          initializationError={initializationError}
          generating={generating}
          generationAvailable={generationAvailable}
          visionAvailable={Boolean(currentModel?.vision)}
          scrollRef={messageScrollRef}
          onScroll={handleMessageScroll}
          onRetryInitialization={reloadApp}
          onSuggestion={handleSuggestion}
          onCopy={(message) => copyMessage(message).catch(() => undefined)}
          onEdit={requestEdit}
          onRegenerate={requestRegenerate}
          onBranch={handleBranch}
          onRead={readMessage}
        />

        {showJumpToLatest && messages.length > 0 && <button type="button" className="jump-latest" onClick={() => scrollToLatest()} aria-label="Jump to latest message">Jump to latest</button>}

        <ChatComposer
          value={composer}
          pendingImages={pendingImages}
          model={currentModel}
          online={generationAvailable}
          generating={generating}
          initializing={initializing}
          textareaRef={textareaRef}
          fileInputRef={fileInputRef}
          onChange={setComposer}
          onAddImages={(files) => addImages(files).catch(() => undefined)}
          onRemoveImage={removePendingImage}
          onSend={() => sendMessage().catch(() => undefined)}
          onStop={stopGeneration}
        />
      </section>

      {dragActive && (
        <div className="drop-overlay" role="status" aria-live="polite">
          <div><ImagePlus size={28} aria-hidden="true" /><strong>Drop images to attach</strong><span>JPEG, PNG, or WebP · up to three images</span></div>
        </div>
      )}

      <input ref={importInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) importChats(file).catch(() => undefined);
      }} />

      <SettingsDialog
        open={settingsOpen}
        preferences={preferences}
        models={models}
        storageText={storageText}
        pwaInstalled={pwa.installed}
        pwaRegistrationState={pwa.registrationState}
        onChange={updatePreferences}
        onClose={() => setSettingsOpen(false)}
        onOpenInstall={() => { setSettingsOpen(false); setInstallDialogOpen(true); }}
        onExport={exportChats}
        onImport={() => importInputRef.current?.click()}
        onClear={() => { setSettingsOpen(false); setAction({ kind: "clear" }); }}
        onReset={resetSettings}
      />

      <PwaInstallDialog
        open={installDialogOpen}
        onClose={() => setInstallDialogOpen(false)}
        onResult={notify}
      />

      <ActionDialog
        open={action?.kind === "rename"}
        title="Rename conversation"
        description="Choose a concise name that will be easy to find in local search."
        inputLabel="Conversation name"
        initialValue={action?.kind === "rename" ? action.conversation.title : ""}
        confirmLabel="Save name"
        maxLength={100}
        onClose={() => setAction(null)}
        onConfirm={handleActionConfirm}
      />
      <ActionDialog
        open={action?.kind === "edit"}
        title="Edit and resend message"
        description="This message will be replaced and every later message in this branch will be removed before HelloAI responds again."
        inputLabel="Message"
        initialValue={action?.kind === "edit" ? messageText(action.message) : ""}
        confirmLabel="Save and resend"
        maxLength={30000}
        multiline
        onClose={() => setAction(null)}
        onConfirm={handleActionConfirm}
      />
      <ActionDialog
        open={action?.kind === "delete"}
        title="Delete conversation?"
        description={action?.kind === "delete" ? `“${action.conversation.title}” and all of its locally stored messages and images will be permanently removed from this browser.` : ""}
        confirmLabel="Delete conversation"
        destructive
        onClose={() => setAction(null)}
        onConfirm={handleActionConfirm}
      />
      <ActionDialog
        open={action?.kind === "regenerate"}
        title="Regenerate from this point?"
        description="This response and every message after it will be removed before a new response is generated."
        confirmLabel="Regenerate response"
        destructive
        onClose={() => setAction(null)}
        onConfirm={handleActionConfirm}
      />
      <ActionDialog
        open={action?.kind === "clear"}
        title="Clear all local data?"
        description="Every conversation, message, image, and draft stored by HelloAI in this browser will be permanently deleted. Export a backup first if you may need this data later."
        confirmLabel="Clear local data"
        destructive
        onClose={() => setAction(null)}
        onConfirm={handleActionConfirm}
      />

      <div className="generation-status sr-only" role="status" aria-live="polite">
        {generationAnnouncement}
      </div>
      {pwa.updateAvailable && <div className="update-banner" role="status"><span>A new HelloAI version is ready.</span><button type="button" onClick={pwa.applyUpdate}>Reload to update</button></div>}
      {toast && <div className={`toast ${toast.tone}${pwa.updateAvailable ? " with-update" : ""}`} role={toast.tone === "error" ? "alert" : "status"}>{toastIcon}<span>{toast.message}</span><button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button></div>}
    </main>
  );
}
