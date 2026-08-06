"use client";

import { ImagePlus, Send, Square, X } from "lucide-react";
import { useLayoutEffect } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { formatBytes } from "@/lib/chat-utils";
import type { ModelInfo, PendingImage } from "@/lib/types";

interface ChatComposerProps {
  value: string;
  pendingImages: PendingImage[];
  model?: ModelInfo;
  online: boolean;
  generating: boolean;
  initializing: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
}


export function ChatComposer({
  value,
  pendingImages,
  model,
  online,
  generating,
  initializing,
  textareaRef,
  fileInputRef,
  onChange,
  onAddImages,
  onRemoveImage,
  onSend,
  onStop,
}: ChatComposerProps) {
  const canSend = online && !initializing && Boolean(value.trim() || pendingImages.length);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(180, Math.max(50, textarea.scrollHeight))}px`;
  }, [textareaRef, value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend && !generating) onSend();
    }
  };

  return (
    <div className="composer-zone">
      <div className={`composer-card ${!online || initializing ? "disabled" : ""}`}>
        {pendingImages.length > 0 && (
          <div className="pending-images" aria-label="Images attached to this message">
            {pendingImages.map((image) => (
              <div key={image.id} className="pending-image">
                <img src={image.previewUrl} alt="" width={image.width} height={image.height} />
                <button type="button" onClick={() => onRemoveImage(image.id)} aria-label={`Remove ${image.name}`}><X size={14} /></button>
                <span>{formatBytes(image.size)}</span>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
            if (files.length) onAddImages(files);
          }}
          onKeyDown={onKeyDown}
          placeholder={initializing ? "Loading your local workspace…" : online ? "Message HelloAI…" : "Offline — drafts are saved locally"}
          aria-label="Message HelloAI"
          aria-describedby="composer-help composer-disclaimer"
          aria-keyshortcuts="Enter"
          rows={1}
          maxLength={30000}
          disabled={initializing}
        />

        <div className="composer-toolbar">
          <div>
            <button
              className="icon-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={initializing || !model?.vision || pendingImages.length >= 3}
              aria-label="Attach images"
              title={model?.vision ? "Attach image" : "Image input is not enabled for this model"}
            >
              <ImagePlus size={19} />
            </button>
            <span id="composer-help" className="composer-hint">
              {model?.vision ? "Images supported" : "Text model"} · Enter to send · Shift+Enter for a new line
            </span>
          </div>
          {generating ? (
            <button type="button" className="stop-button" onClick={onStop}><Square size={15} fill="currentColor" /> Stop</button>
          ) : (
            <button type="button" className="send-button" onClick={onSend} disabled={!canSend}><Send size={17} /> Send</button>
          )}
        </div>
      </div>

      <p id="composer-disclaimer" className="composer-disclaimer">
        AI can make mistakes. Chats are stored only on this device; requests are processed through the HomePilot gateway.
      </p>

      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(event) => {
          onAddImages(Array.from(event.target.files || []));
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
