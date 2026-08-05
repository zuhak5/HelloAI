import type { AttachmentRecord, ChatMessage, Conversation } from "@/lib/types";

const DB_NAME = "helloai-local";
const DB_VERSION = 1;
const CONVERSATIONS = "conversations";
const MESSAGES = "messages";
const ATTACHMENTS = "attachments";
const CHANNEL_NAME = "helloai-sync-v1";

let databasePromise: Promise<IDBDatabase> | null = null;
let channel: BroadcastChannel | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted."));
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONVERSATIONS)) {
        const store = db.createObjectStore(CONVERSATIONS, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
        store.createIndex("archived", "archived");
      }
      if (!db.objectStoreNames.contains(MESSAGES)) {
        const store = db.createObjectStore(MESSAGES, { keyPath: "id" });
        store.createIndex("conversationId", "conversationId");
        store.createIndex("conversationCreated", ["conversationId", "createdAt"]);
      }
      if (!db.objectStoreNames.contains(ATTACHMENTS)) {
        const store = db.createObjectStore(ATTACHMENTS, { keyPath: "id" });
        store.createIndex("conversationId", "conversationId");
        store.createIndex("messageId", "messageId");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error("Could not open local storage."));
    request.onblocked = () => reject(new Error("Close other HelloAI tabs to upgrade local storage."));
  });
  return databasePromise;
}

function notify(type: string, id?: string) {
  if (typeof BroadcastChannel === "undefined") return;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type, id, at: Date.now() });
}

export function subscribeToDatabaseChanges(callback: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  const handler = () => callback();
  channel.addEventListener("message", handler);
  return () => channel?.removeEventListener("message", handler);
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await openDatabase();
  const items = await requestResult(db.transaction(CONVERSATIONS).objectStore(CONVERSATIONS).getAll()) as Conversation[];
  return items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await openDatabase();
  return requestResult(db.transaction(CONVERSATIONS).objectStore(CONVERSATIONS).get(id));
}

export async function putConversation(conversation: Conversation): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(CONVERSATIONS, "readwrite");
  transaction.objectStore(CONVERSATIONS).put(conversation);
  await transactionDone(transaction);
  notify("conversation", conversation.id);
}

export async function createConversation(model: string): Promise<Conversation> {
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    pinned: false,
    archived: false,
    model,
    draft: "",
  };
  await putConversation(conversation);
  return conversation;
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const db = await openDatabase();
  const transaction = db.transaction(MESSAGES);
  const index = transaction.objectStore(MESSAGES).index("conversationCreated");
  const range = IDBKeyRange.bound([conversationId, ""], [conversationId, "\uffff"]);
  const items = await requestResult(index.getAll(range)) as ChatMessage[];
  return items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export async function putMessage(message: ChatMessage, touchConversation = true): Promise<void> {
  const [db, conversation] = await Promise.all([openDatabase(), touchConversation ? getConversation(message.conversationId) : Promise.resolve(undefined)]);
  const transaction = db.transaction([MESSAGES, CONVERSATIONS], "readwrite");
  transaction.objectStore(MESSAGES).put(message);
  if (conversation) transaction.objectStore(CONVERSATIONS).put({ ...conversation, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
  notify("message", message.conversationId);
}

export async function putMessages(messages: ChatMessage[]): Promise<void> {
  if (!messages.length) return;
  const [db, conversation] = await Promise.all([openDatabase(), getConversation(messages[0].conversationId)]);
  const transaction = db.transaction([MESSAGES, CONVERSATIONS], "readwrite");
  const messageStore = transaction.objectStore(MESSAGES);
  for (const message of messages) messageStore.put(message);
  if (conversation) transaction.objectStore(CONVERSATIONS).put({ ...conversation, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
  notify("messages", messages[0].conversationId);
}

export async function putAttachments(attachments: AttachmentRecord[]): Promise<void> {
  if (!attachments.length) return;
  const db = await openDatabase();
  const transaction = db.transaction(ATTACHMENTS, "readwrite");
  const store = transaction.objectStore(ATTACHMENTS);
  for (const attachment of attachments) store.put(attachment);
  await transactionDone(transaction);
  notify("attachments", attachments[0].conversationId);
}

export async function getAttachment(id: string): Promise<AttachmentRecord | undefined> {
  const db = await openDatabase();
  return requestResult(db.transaction(ATTACHMENTS).objectStore(ATTACHMENTS).get(id));
}

export async function listAttachmentsForConversation(conversationId: string): Promise<AttachmentRecord[]> {
  const db = await openDatabase();
  const index = db.transaction(ATTACHMENTS).objectStore(ATTACHMENTS).index("conversationId");
  return requestResult(index.getAll(conversationId));
}

export async function deleteMessagesAfter(conversationId: string, createdAt: string, includeBoundary = false): Promise<void> {
  const [db, messages, attachments, conversation] = await Promise.all([
    openDatabase(),
    listMessages(conversationId),
    listAttachmentsForConversation(conversationId),
    getConversation(conversationId),
  ]);
  const boundary = Date.parse(createdAt);
  const removedIds = new Set(messages.filter((message) => {
    const time = Date.parse(message.createdAt);
    return time > boundary || (includeBoundary && time === boundary);
  }).map((message) => message.id));
  const transaction = db.transaction([MESSAGES, ATTACHMENTS, CONVERSATIONS], "readwrite");
  for (const id of removedIds) transaction.objectStore(MESSAGES).delete(id);
  for (const attachment of attachments) if (removedIds.has(attachment.messageId)) transaction.objectStore(ATTACHMENTS).delete(attachment.id);
  if (conversation) transaction.objectStore(CONVERSATIONS).put({ ...conversation, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
  notify("messages", conversationId);
}

export async function deleteConversation(id: string): Promise<void> {
  const [db, messages, attachments] = await Promise.all([openDatabase(), listMessages(id), listAttachmentsForConversation(id)]);
  const transaction = db.transaction([CONVERSATIONS, MESSAGES, ATTACHMENTS], "readwrite");
  transaction.objectStore(CONVERSATIONS).delete(id);
  for (const message of messages) transaction.objectStore(MESSAGES).delete(message.id);
  for (const attachment of attachments) transaction.objectStore(ATTACHMENTS).delete(attachment.id);
  await transactionDone(transaction);
  notify("delete", id);
}

export async function clearAllData(): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction([CONVERSATIONS, MESSAGES, ATTACHMENTS], "readwrite");
  transaction.objectStore(CONVERSATIONS).clear();
  transaction.objectStore(MESSAGES).clear();
  transaction.objectStore(ATTACHMENTS).clear();
  await transactionDone(transaction);
  notify("clear");
}

export async function searchConversations(query: string): Promise<Set<string>> {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return new Set();
  const [conversations, db] = await Promise.all([listConversations(), openDatabase()]);
  const matches = new Set(
    conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(normalized)).map((conversation) => conversation.id),
  );
  const messages = await requestResult(db.transaction(MESSAGES).objectStore(MESSAGES).getAll()) as ChatMessage[];
  for (const message of messages) {
    if (message.parts.some((part) => part.type === "text" && part.text.toLocaleLowerCase().includes(normalized))) {
      matches.add(message.conversationId);
    }
  }
  return matches;
}

export async function cloneConversation(sourceId: string, throughMessageId: string): Promise<Conversation> {
  const [source, messages, attachments] = await Promise.all([
    getConversation(sourceId),
    listMessages(sourceId),
    listAttachmentsForConversation(sourceId),
  ]);
  if (!source) throw new Error("Conversation not found.");
  const boundary = messages.findIndex((message) => message.id === throughMessageId);
  if (boundary < 0) throw new Error("Message not found.");

  const now = new Date().toISOString();
  const clone: Conversation = {
    ...source,
    id: crypto.randomUUID(),
    title: `${source.title} (branch)`,
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    draft: "",
  };
  const idMap = new Map<string, string>();
  const clonedMessages = messages.slice(0, boundary + 1).map((message) => {
    const id = crypto.randomUUID();
    idMap.set(message.id, id);
    return { ...message, id, conversationId: clone.id, createdAt: new Date(Date.parse(message.createdAt) + 1).toISOString() };
  });
  const attachmentIdMap = new Map<string, string>();
  const clonedAttachments = attachments
    .filter((attachment) => idMap.has(attachment.messageId))
    .map((attachment) => {
      const id = crypto.randomUUID();
      attachmentIdMap.set(attachment.id, id);
      return {
        ...attachment,
        id,
        conversationId: clone.id,
        messageId: idMap.get(attachment.messageId)!,
        createdAt: now,
      };
    });
  for (const message of clonedMessages) {
    message.parts = message.parts.map((part) =>
      part.type === "image" && attachmentIdMap.has(part.attachmentId)
        ? { ...part, attachmentId: attachmentIdMap.get(part.attachmentId)! }
        : part,
    );
  }

  const db = await openDatabase();
  const transaction = db.transaction([CONVERSATIONS, MESSAGES, ATTACHMENTS], "readwrite");
  transaction.objectStore(CONVERSATIONS).put(clone);
  for (const message of clonedMessages) transaction.objectStore(MESSAGES).put(message);
  for (const attachment of clonedAttachments) transaction.objectStore(ATTACHMENTS).put(attachment);
  await transactionDone(transaction);
  notify("branch", clone.id);
  return clone;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read attachment."));
    reader.readAsDataURL(blob);
  });
}

export async function exportLocalData(): Promise<string> {
  const db = await openDatabase();
  const transaction = db.transaction([CONVERSATIONS, MESSAGES, ATTACHMENTS]);
  const [conversations, messages, attachments] = await Promise.all([
    requestResult(transaction.objectStore(CONVERSATIONS).getAll()) as Promise<Conversation[]>,
    requestResult(transaction.objectStore(MESSAGES).getAll()) as Promise<ChatMessage[]>,
    requestResult(transaction.objectStore(ATTACHMENTS).getAll()) as Promise<AttachmentRecord[]>,
  ]);
  const serializedAttachments = await Promise.all(
    attachments.map(async ({ blob, ...attachment }) => ({ ...attachment, dataUrl: await blobToDataUrl(blob) })),
  );
  return JSON.stringify({ format: "helloai-export", version: 1, exportedAt: new Date().toISOString(), conversations, messages, attachments: serializedAttachments }, null, 2);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid attachment data.");
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

export async function importLocalData(text: string): Promise<void> {
  const value = JSON.parse(text) as {
    format?: unknown;
    version?: unknown;
    conversations?: Conversation[];
    messages?: ChatMessage[];
    attachments?: Array<Omit<AttachmentRecord, "blob"> & { dataUrl: string }>;
  };
  if (value.format !== "helloai-export" || value.version !== 1) throw new Error("Unsupported HelloAI export file.");
  if (!Array.isArray(value.conversations) || !Array.isArray(value.messages) || !Array.isArray(value.attachments)) {
    throw new Error("The export file is incomplete.");
  }
  if (value.conversations.length > 5000 || value.messages.length > 100000 || value.attachments.length > 5000) {
    throw new Error("The export file is too large.");
  }
  const db = await openDatabase();
  const transaction = db.transaction([CONVERSATIONS, MESSAGES, ATTACHMENTS], "readwrite");
  for (const conversation of value.conversations) transaction.objectStore(CONVERSATIONS).put(conversation);
  for (const message of value.messages) transaction.objectStore(MESSAGES).put(message);
  for (const attachment of value.attachments) {
    const { dataUrl, ...metadata } = attachment;
    transaction.objectStore(ATTACHMENTS).put({ ...metadata, blob: dataUrlToBlob(dataUrl) });
  }
  await transactionDone(transaction);
  notify("import");
}
