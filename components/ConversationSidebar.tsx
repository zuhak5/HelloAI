"use client";

import {
  Archive,
  ArchiveRestore,
  Bot,
  CheckCircle2,
  Download,
  Edit3,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  Pin,
  PinOff,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import { useModalDialog } from "@/lib/use-modal-dialog";
import type { Conversation } from "@/lib/types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  archiveView: boolean;
  search: string;
  searching: boolean;
  open: boolean;
  busy: boolean;
  pwaInstalled: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onNewChat: () => void;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onToggleArchiveView: () => void;
  onOpenSettings: () => void;
  onOpenInstall: () => void;
  onRename: (conversation: Conversation) => void;
  onTogglePin: (conversation: Conversation) => void;
  onToggleArchive: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
}

function formatConversationDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function closeMenu(button: HTMLButtonElement) {
  button.closest("details")?.removeAttribute("open");
}

export function ConversationSidebar({
  conversations,
  currentId,
  archiveView,
  search,
  searching,
  open,
  busy,
  pwaInstalled,
  searchInputRef,
  onClose,
  onNewChat,
  onSearch,
  onSelect,
  onToggleArchiveView,
  onOpenSettings,
  onOpenInstall,
  onRename,
  onTogglePin,
  onToggleArchive,
  onDelete,
}: ConversationSidebarProps) {
  const sidebarRef = useModalDialog<HTMLElement>(open, onClose, searchInputRef as RefObject<HTMLElement | null>);

  return (
    <>
      {open && <button type="button" className="sidebar-backdrop" aria-label="Close conversation sidebar" onClick={onClose} />}
      <aside
        ref={sidebarRef}
        className={`sidebar ${open ? "sidebar-open" : ""}`}
        aria-label="Conversation navigation"
        role={open ? "dialog" : "complementary"}
        aria-modal={open || undefined}
        tabIndex={open ? -1 : undefined}
      >
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><Bot size={22} /></div>
          <div><strong>HelloAI</strong><span>Private local workspace</span></div>
          <button type="button" className="icon-button mobile-only" aria-label="Close sidebar" onClick={onClose}><PanelLeftClose size={19} /></button>
        </div>

        <button type="button" className="new-chat-button" onClick={onNewChat} disabled={busy}><MessageSquarePlus size={18} /> New chat</button>

        <label className="search-box">
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search local chats"
            aria-label="Search conversations"
            aria-controls="conversation-list"
          />
          {searching && <span className="search-spinner" role="status"><span className="sr-only">Searching local conversations</span></span>}
          {search && !searching && <button type="button" onClick={() => onSearch("")} aria-label="Clear search"><X size={15} /></button>}
        </label>

        <nav id="conversation-list" className="conversation-list" aria-label={archiveView ? "Archived conversations" : "Conversations"}>
          {conversations.length === 0 && (
            <div className="sidebar-empty" role="status">
              {search ? "No local matches." : archiveView ? "No archived chats." : "Start a new conversation."}
            </div>
          )}
          {conversations.map((conversation) => (
            <div key={conversation.id} className={`conversation-item ${conversation.id === currentId ? "active" : ""}`}>
              <button
                type="button"
                className="conversation-select"
                onClick={() => onSelect(conversation.id)}
                disabled={busy}
                aria-current={conversation.id === currentId ? "page" : undefined}
              >
                <span>{conversation.pinned && <Pin size={12} fill="currentColor" aria-hidden="true" />}{conversation.title}</span>
                <small><time dateTime={conversation.updatedAt} aria-label={new Date(conversation.updatedAt).toLocaleString()}>{formatConversationDate(conversation.updatedAt)}</time></small>
              </button>
              <details className={`conversation-menu ${busy ? "disabled" : ""}`}>
                <summary
                  aria-label={`Actions for ${conversation.title}`}
                  aria-disabled={busy}
                  tabIndex={busy ? -1 : 0}
                  onClick={(event) => busy && event.preventDefault()}
                ><MoreHorizontal size={17} /></summary>
                <div className="menu-popover">
                  <button type="button" disabled={busy} onClick={(event) => { closeMenu(event.currentTarget); onRename(conversation); }}><Edit3 size={15} /> Rename</button>
                  <button type="button" disabled={busy} onClick={(event) => { closeMenu(event.currentTarget); onTogglePin(conversation); }}>
                    {conversation.pinned ? <PinOff size={15} /> : <Pin size={15} />}{conversation.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button type="button" disabled={busy} onClick={(event) => { closeMenu(event.currentTarget); onToggleArchive(conversation); }}>
                    {conversation.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{conversation.archived ? "Restore" : "Archive"}
                  </button>
                  <button type="button" className="menu-danger" disabled={busy} onClick={(event) => { closeMenu(event.currentTarget); onDelete(conversation); }}><Trash2 size={15} /> Delete</button>
                </div>
              </details>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className={archiveView ? "active" : ""} onClick={onToggleArchiveView} disabled={busy}>
            {archiveView ? <ArchiveRestore size={17} /> : <Archive size={17} />}{archiveView ? "Back to chats" : "Archived"}
          </button>
          <button type="button" onClick={onOpenInstall}>
            {pwaInstalled ? <CheckCircle2 size={17} /> : <Download size={17} />}{pwaInstalled ? "App installed" : "Install app"}
          </button>
          <button type="button" onClick={onOpenSettings}><Settings size={17} /> Settings</button>
          <a href="/privacy"><span>Privacy</span><small>Local-first</small></a>
        </div>
      </aside>
    </>
  );
}
