"use client";

import { CornerRightUp } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea";

interface AIInputWithLoadingProps {
  id?: string;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  /** Real request state from the parent — no simulated timers. */
  loading?: boolean;
  onSubmit?: (value: string) => void | Promise<void>;
  className?: string;
}

export function AIInputWithLoading({
  id = "ai-input-with-loading",
  placeholder = "Ask about districts, rankings, drivers, clusters, budgets…",
  minHeight = 56,
  maxHeight = 200,
  loading = false,
  onSubmit,
  className,
}: AIInputWithLoadingProps) {
  const [inputValue, setInputValue] = useState("");

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  });

  const handleSubmit = async () => {
    const value = inputValue.trim();
    if (!value || loading) return;
    await onSubmit?.(value);
    setInputValue("");
    adjustHeight(true);
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative w-full rounded-3xl p-2 pl-5"
        style={{ background: "var(--g-color-base-selection)" }}
      >
        <Textarea
          id={id}
          placeholder={placeholder}
          className="w-full resize-none py-3 pr-12 text-sm leading-snug"
          style={{ minHeight }}
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          disabled={loading}
          aria-label="Message the analyst"
        />
        <button
          onClick={() => void handleSubmit()}
          className={cn(
            "absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full transition-opacity",
          )}
          style={
            loading || !inputValue.trim()
              ? { background: "var(--g-color-base-background)", color: "var(--rc-muted)" }
              : { background: "var(--g-color-base-brand)", color: "var(--g-color-private-brand-1000-solid)" }
          }
          type="button"
          disabled={loading || !inputValue.trim()}
          aria-label="Send message"
        >
          {loading ? (
            <span
              className="block h-4 w-4 animate-spin rounded-[4px]"
              style={{ background: "var(--g-color-text-brand)" }}
              aria-hidden="true"
            />
          ) : (
            <CornerRightUp
              className="h-4 w-4"
              aria-hidden="true"
            />
          )}
        </button>
      </div>
      <p className="h-4 pt-1 text-center text-xs rc-muted">
        {loading ? "Ask is thinking…" : "Grounded in live data"}
      </p>
    </div>
  );
}
