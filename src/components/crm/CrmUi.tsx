"use client";

import { type KeyboardEvent, type ReactNode } from "react";
import {
  DetailPopup,
  detailBtnPress,
} from "@/components/residentes/DetailPopup";

export const fieldClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm";

export const compactFieldClass =
  "w-full min-w-0 rounded-lg border border-gray-200 bg-white px-1.5 py-2 text-right text-base tabular-nums text-gray-900 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:bg-gray-50 disabled:text-gray-500 sm:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export const primaryBtn = detailBtnPress(
  "rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm [@media(hover:hover)]:hover:from-violet-700 [@media(hover:hover)]:hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
);

export const secondaryBtn = detailBtnPress(
  "rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-medium text-violet-800 [@media(hover:hover)]:hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
);

export const dangerBtn = detailBtnPress(
  "rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 [@media(hover:hover)]:hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
);

export const tableHeadClass =
  "sticky top-0 z-10 bg-violet-50/95 backdrop-blur-sm px-4 py-3 font-medium text-violet-800 shadow-[inset_0_-1px_0_0_rgb(237,233,254)]";

export const tabBtnClass = (active: boolean) =>
  `rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
    active
      ? "-mb-px border border-violet-200 border-b-white bg-white text-violet-800"
      : "text-gray-500 [@media(hover:hover)]:hover:bg-violet-50/50 [@media(hover:hover)]:hover:text-violet-700"
  }`;

export function SectionHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="shrink-0 space-y-1 px-4 pb-3 pt-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-violet-900">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          ) : null}
        </div>
        {children ? (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-2 font-medium underline hover:no-underline"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function LoadingCard({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-400">
      {text}
    </div>
  );
}

export function EmptyCard({ text }: { text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-gray-400">
      <svg
        className="mb-3 h-12 w-12 text-violet-200"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      </svg>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

export function Badge({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function handleRowKey(
  event: KeyboardEvent<HTMLTableRowElement>,
  onOpen: () => void
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onOpen();
  }
}

export function clickableRowProps(onOpen: () => void, selected = false) {
  return {
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) =>
      handleRowKey(event, onOpen),
    className: selected
      ? "cursor-pointer border-b border-gray-50 bg-violet-100 ring-1 ring-inset ring-violet-300 focus:outline-none"
      : "cursor-pointer border-b border-gray-50 [@media(hover:hover)]:hover:bg-violet-50/30 focus:bg-violet-50 focus:outline-none",
  };
}

export function CrmModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
  size,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  size?: "md" | "lg" | "xl";
}) {
  if (!open) return null;

  const resolvedSize = size ?? (wide ? "lg" : "md");

  return (
    <DetailPopup
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size={resolvedSize}
      layer="form"
      footer={
        footer ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {footer}
          </div>
        ) : undefined
      }
    >
      {children}
    </DetailPopup>
  );
}

export function CrmSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <CrmModal open={open} title={title} onClose={onClose} footer={footer} size="md">
      {children}
    </CrmModal>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </span>
      {children}
    </label>
  );
}
