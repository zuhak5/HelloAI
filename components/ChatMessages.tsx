"use client";

import { Bot, Copy, Edit3, GitBranch, RefreshCw, Send, User, Volume2 } from "lucide-react";
import { memo } from "react";
import type { RefObject, UIEvent } from "react";
import { AttachmentImage } from "@/components/AttachmentImage";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { messageText } from "@/lib/chat-utils";
import type { ChatMessage } from "@/lib/types";

interface ChatMessagesProps {
  messages: ChatMessage[];
  initializing: boolean;
  initializationError: string | null;
  generating: boolean;
  generationAvailable: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  onRetryInitialization: () => void;
  onSuggestion: (value: string) => void;
  onCopy: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onRegenerate: (message: ChatMessage) => void;
  onBranch: (message: ChatMessage) => void;
  onRead: (message: ChatMessage) => void;
}

interface MessageItemProps {
  message: ChatMessage;
  generating: boolean;
  generationAvailable: boolean;
  speechAvailable: boolean;
  onCopy: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onRegenerate: (message: ChatMessage) => void;
  onBranch: (message: ChatMessage) => void;
  onRead: (message: ChatMessage) => void;
}

function MessageSkeleton() {
  return (
    <div className="messages loading-messages" aria-label="Loading local conversations" role="status">
      {[0, 1, 2].map((item) => (
        <div className="message-row skeleton-row" key={item} aria-hidden="true">
          <span className="skeleton skeleton-avatar" />
          <div className="skeleton-copy">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading your local workspace…</span>
    </div>
  );
}

const MessageItem = memo(function MessageItem({
  message,
  generating,
  generationAvailable,
  speechAvailable,
  onCopy,
  onEdit,
  onRegenerate,
  onBranch,
  onRead,
}: MessageItemProps) {
  const text = messageText(message);
  const isAssistant = message.role === "assistant";

  return (
    <li className={`message-row ${message.role}`}>
      <div className="message-avatar" aria-hidden="true">{isAssistant ? <Bot size={18} /> : <User size={18} />}</div>
      <article className="message-main" aria-label={`${isAssistant ? "HelloAI" : "Your"} message`}>
        <div className="message-heading">
          <strong>{isAssistant ? "HelloAI" : "You"}</strong>
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
        <div className="message-content">
          {message.parts.filter((part) => part.type === "image").map((part) => part.type === "image" ? (
            <AttachmentImage key={part.attachmentId} attachmentId={part.attachmentId} alt={part.name} />
          ) : null)}
          {isAssistant ? <MarkdownMessage text={text} /> : <p className="user-text">{text}</p>}
          {message.status === "streaming" && <span className="stream-cursor" aria-hidden="true" />}
          {message.error && <div className={`message-error ${message.status === "cancelled" ? "cancelled" : ""}`} role={message.status === "error" ? "alert" : "status"}>{message.error}</div>}
        </div>

        {message.status !== "streaming" && (
          <div className="message-actions" aria-label="Message actions">
            <button onClick={() => onCopy(message)} aria-label={`Copy ${isAssistant ? "assistant" : "your"} message`}><Copy size={14} /> Copy</button>
            {!isAssistant && <button onClick={() => onEdit(message)} disabled={generating || !generationAvailable}><Edit3 size={14} /> Edit</button>}
            {isAssistant && <button onClick={() => onRegenerate(message)} disabled={generating || !generationAvailable}><RefreshCw size={14} /> Regenerate</button>}
            <button onClick={() => onBranch(message)} disabled={generating}><GitBranch size={14} /> Branch</button>
            {isAssistant && text && speechAvailable && <button onClick={() => onRead(message)}><Volume2 size={14} /> Read</button>}
            {message.model && (
              <span className="message-meta">
                {message.model}{message.outputTokens ? ` · ${message.outputTokens} tokens` : ""}{message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ""}
              </span>
            )}
          </div>
        )}
      </article>
    </li>
  );
});

export function ChatMessages({
  messages,
  initializing,
  initializationError,
  generating,
  generationAvailable,
  scrollRef,
  onScroll,
  onRetryInitialization,
  onSuggestion,
  onCopy,
  onEdit,
  onRegenerate,
  onBranch,
  onRead,
}: ChatMessagesProps) {
  const speechAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

  return (
    <div ref={scrollRef} className="message-scroll" onScroll={onScroll}>
      {initializing ? (
        <MessageSkeleton />
      ) : initializationError ? (
        <div className="empty-state error-state" role="alert">
          <div className="hero-mark"><Bot size={32} /></div>
          <h1>Local workspace unavailable</h1>
          <p>{initializationError}</p>
          <button className="primary-button" onClick={onRetryInitialization}>Reload HelloAI</button>
        </div>
      ) : messages.length === 0 ? (
        <div className="empty-state">
          <div className="hero-mark" aria-hidden="true"><Bot size={32} /></div>
          <h1>What can I help with?</h1>
          <p>Open and chat immediately. Conversations and images remain in this browser.</p>
          <div className="suggestion-grid" aria-label="Suggested prompts">
            {["Explain a difficult idea simply", "Review and improve some code", "Plan a project step by step", "Analyze an image I upload"].map((suggestion) => (
              <button key={suggestion} onClick={() => onSuggestion(suggestion)}>{suggestion}<Send size={15} aria-hidden="true" /></button>
            ))}
          </div>
        </div>
      ) : (
        <ol className="messages" role="log" aria-live="off" aria-relevant="additions text">
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              generating={generating}
              generationAvailable={generationAvailable}
              speechAvailable={speechAvailable}
              onCopy={onCopy}
              onEdit={onEdit}
              onRegenerate={onRegenerate}
              onBranch={onBranch}
              onRead={onRead}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
