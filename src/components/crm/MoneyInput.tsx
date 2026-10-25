"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { fieldClass } from "./CrmUi";
import {
  appendMoneyDigit,
  backspaceMoney,
  composeMxnAmount,
  formatMxn,
  reconcileLiveMxn,
  splitMxnAmount,
} from "@/lib/money";

const compactMoneyClass =
  "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-1.5 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export function MoneyInput({
  id,
  value,
  onValueChange,
  onBlurCommit,
  disabled,
  currency = "MXN",
  compact = false,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number;
  onValueChange: (value: number) => void;
  onBlurCommit?: (value: number) => void;
  disabled?: boolean;
  currency?: string;
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [editingCents, setEditingCents] = useState(false);
  const [centsCount, setCentsCount] = useState(0);
  const [integer, setInteger] = useState("0");
  const [fraction, setFraction] = useState("00");

  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  const display = focused
    ? formatMxn(composeMxnAmount(integer, fraction), currency)
    : formatMxn(amount, currency);
  const baseClass = compact ? compactMoneyClass : (className ?? fieldClass);

  useLayoutEffect(() => {
    if (!focused) return;
    const input = inputRef.current;
    if (!input) return;
    const dot = display.lastIndexOf(".");
    if (dot < 0) return;
    if (editingCents) {
      const pos = Math.min(display.length, dot + 1 + Math.max(centsCount, 1));
      input.setSelectionRange(pos, pos);
      return;
    }
    input.setSelectionRange(dot, dot);
  }, [centsCount, display, editingCents, focused]);

  function commitParts(
    nextInteger: string,
    nextFraction: string,
    nextCentsCount = centsCount
  ) {
    setInteger(nextInteger);
    setFraction(nextFraction);
    setCentsCount(nextCentsCount);
    onValueChange(composeMxnAmount(nextInteger, nextFraction));
  }

  function isAllSelected() {
    const input = inputRef.current;
    if (!input) return false;
    return input.selectionStart === 0 && input.selectionEnd === input.value.length;
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`${baseClass} text-right tabular-nums`}
      value={display}
      onFocus={() => {
        const parts = splitMxnAmount(amount);
        setInteger(parts.integer);
        setFraction(parts.fraction);
        setEditingCents(false);
        setCentsCount(0);
        setFocused(true);
      }}
      onClick={() => {
        const input = inputRef.current;
        if (!input) return;
        const dot = display.lastIndexOf(".");
        const pos = input.selectionStart ?? 0;
        const nextEditing = dot >= 0 && pos > dot;
        setEditingCents(nextEditing);
        if (!nextEditing) setCentsCount(0);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        const key = event.key;
        if (
          key === "Tab" ||
          key === "Enter" ||
          key === "Escape" ||
          key === "ArrowLeft" ||
          key === "ArrowRight" ||
          key === "ArrowUp" ||
          key === "ArrowDown" ||
          key === "Home" ||
          key === "End"
        ) {
          if (key === "ArrowRight" || key === "End") setEditingCents(true);
          if (key === "ArrowLeft" || key === "Home") {
            setEditingCents(false);
            setCentsCount(0);
          }
          return;
        }

        if (key === "." || key === ",") {
          event.preventDefault();
          setEditingCents(true);
          setCentsCount(0);
          return;
        }

        if (key === "Backspace" || key === "Delete") {
          event.preventDefault();
          if (isAllSelected()) {
            commitParts("0", "00", 0);
            setEditingCents(false);
            return;
          }
          const next = backspaceMoney(integer, fraction, editingCents, centsCount);
          if (next.centsCount === 0) setEditingCents(false);
          commitParts(next.integer, next.fraction, next.centsCount);
          return;
        }

        if (/^\d$/.test(key)) {
          event.preventDefault();
          if (isAllSelected()) {
            commitParts(key, "00", 0);
            setEditingCents(false);
            return;
          }
          const next = appendMoneyDigit(
            integer,
            fraction,
            key,
            editingCents,
            centsCount
          );
          commitParts(next.integer, next.fraction, next.centsCount);
          return;
        }

        if (key.length === 1) event.preventDefault();
      }}
      onPaste={(event) => {
        event.preventDefault();
        const pasted = event.clipboardData.getData("text");
        const next = reconcileLiveMxn(integer, fraction, pasted, false);
        commitParts(next.integer, next.fraction, 0);
        setEditingCents(false);
      }}
      onChange={(event) => {
        if (event.target.value === display) return;
        const next = reconcileLiveMxn(
          integer,
          fraction,
          event.target.value,
          editingCents
        );
        commitParts(next.integer, next.fraction, editingCents ? 2 : 0);
      }}
      onBlur={() => {
        const next = composeMxnAmount(integer, fraction);
        onValueChange(next);
        onBlurCommit?.(next);
        setEditingCents(false);
        setCentsCount(0);
        setFocused(false);
      }}
    />
  );
}
