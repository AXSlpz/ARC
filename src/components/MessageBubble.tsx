"use client";

import type { ChatColors } from "@/lib/admin-settings-types";

interface MessageBubbleProps {
  role: "user" | "assistant" | "human";
  content: string;
  createdAt: number;
  colors: ChatColors;
  messageId?: number;
  mediaType?: string | null;
}

function contrastingText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1f2937" : "#ffffff";
}

export function MessageBubble({
  role,
  content,
  createdAt,
  colors,
  messageId,
  mediaType,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const time = new Date(createdAt * 1000).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const bg =
    role === "user"
      ? colors.user
      : role === "assistant"
        ? colors.assistant
        : colors.human;

  const textColor = contrastingText(bg);
  const mutedColor =
    textColor === "#ffffff" ? "rgba(255,255,255,0.7)" : "rgba(31,41,55,0.55)";

  const label = {
    user: null,
    assistant: "IA",
    human: "Humano",
  };

  const showImage = mediaType === "image" && messageId != null;

  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"} mb-3`}>
      <div
        className="max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm"
        style={{ backgroundColor: bg, color: textColor }}
      >
        {label[role] && (
          <span
            className="block text-[10px] font-semibold mb-0.5"
            style={{ opacity: 0.85 }}
          >
            {label[role]}
          </span>
        )}
        {showImage && (
          <a
            href={`/api/media/${messageId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block mb-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/media/${messageId}`}
              alt="Imagen del cliente"
              className="max-h-48 rounded-lg object-cover border border-black/10"
              loading="lazy"
            />
          </a>
        )}
        {content && (
          <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        )}
        <span className="block text-[10px] mt-1" style={{ color: mutedColor }}>
          {time}
        </span>
      </div>
    </div>
  );
}
