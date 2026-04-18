"use client";

import { useRef, useState, useEffect } from "react";
import { Send, Lock, Reply, X } from "lucide-react";

interface Props {
  onSend: (content: string) => Promise<void> | void;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  /** If set, shows a read-only state with an "only admins can post" notice */
  lockedReason?: string;
  /** Optional typing-signal callback — invoked (debounced to once per 2s) while user types. */
  onTyping?: () => void;
  /** Active reply target. When present, shows a preview bar above the textarea. */
  replyTo?: { id: string; username: string; content: string } | null;
  onCancelReply?: () => void;
}

export function MessageInput({
  onSend,
  disabled = false,
  maxLength = 2000,
  placeholder = "Type a message…",
  lockedReason,
  onTyping,
  replyTo,
  onCancelReply,
}: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingThrottleRef = useRef<number>(0);

  const signalTyping = () => {
    if (!onTyping) return;
    const now = Date.now();
    if (now - typingThrottleRef.current < 2000) return;
    typingThrottleRef.current = now;
    onTyping();
  };

  // Auto-grow up to ~4 lines, then scroll.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 128)}px`;
  }, [value]);

  // Focus on mount and whenever the user chooses to reply to something.
  useEffect(() => { textareaRef.current?.focus(); }, []);
  useEffect(() => { if (replyTo) textareaRef.current?.focus(); }, [replyTo]);

  const send = async () => {
    const content = value.trim();
    if (!content || sending || disabled) return;
    setSending(true);
    try {
      await onSend(content);
      setValue("");
    } finally {
      setSending(false);
      // Re-focus so the user can keep typing without clicking back into the field.
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  if (lockedReason) {
    return (
      <div className="sticky bottom-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent pt-4 pb-3 px-3 sm:px-4">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
          <Lock className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-400">{lockedReason}</p>
        </div>
      </div>
    );
  }

  const charCount = value.length;
  const nearLimit = charCount > maxLength * 0.9;

  return (
    <div className="sticky bottom-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent pt-4 pb-3 px-3 sm:px-4">
      {replyTo && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-lg border border-accent/20 bg-accent/5">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="h-3.5 w-3.5 text-accent flex-shrink-0" />
            <span className="text-xs font-semibold text-accent flex-shrink-0">{replyTo.username}</span>
            <span className="text-xs text-[var(--text-muted)] truncate">{replyTo.content}</span>
          </div>
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              className="h-5 w-5 rounded flex items-center justify-center hover:bg-[var(--bg-input)] transition-colors flex-shrink-0"
              aria-label="Cancel reply"
            >
              <X className="h-3 w-3 text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value.slice(0, maxLength));
              if (e.target.value.length > 0) signalTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            rows={1}
            disabled={disabled || sending}
            className="w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-sm lg:text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors disabled:opacity-50"
            style={{ maxHeight: "128px" }}
          />
          {nearLimit && (
            <span
              className={`absolute bottom-1.5 right-3 text-[10px] tabular-nums font-mono ${
                charCount >= maxLength ? "text-red-400" : "text-amber-400"
              }`}
            >
              {charCount}/{maxLength}
            </span>
          )}
        </div>
        <button
          onClick={send}
          disabled={!value.trim() || sending || disabled}
          className="h-10 w-10 flex-shrink-0 rounded-xl bg-accent flex items-center justify-center transition-all hover:bg-accent/85 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </div>
    </div>
  );
}
