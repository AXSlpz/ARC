"use client";

interface ModeToggleProps {
  conversationId: number;
  mode: "AI" | "HUMAN";
  onToggle: (newMode: "AI" | "HUMAN") => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onToggle, disabled }: ModeToggleProps) {
  const isAI = mode === "AI";

  return (
    <button
      onClick={() => !disabled && onToggle(isAI ? "HUMAN" : "AI")}
      disabled={disabled}
      className={`
        relative inline-flex h-8 w-16 items-center rounded-full transition-colors
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${isAI ? "bg-emerald-500" : "bg-amber-500"}
      `}
    >
      <span
        className={`
          inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform
          ${isAI ? "translate-x-1" : "translate-x-9"}
        `}
      />
      <span className="sr-only">{isAI ? "Modo IA" : "Modo Humano"}</span>
      <span
        className={`
          absolute text-[10px] font-bold text-white
          ${isAI ? "right-2" : "left-2"}
        `}
      >
        {isAI ? "IA" : "AT"}
      </span>
    </button>
  );
}
