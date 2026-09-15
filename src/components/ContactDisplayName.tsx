import {
  getContactDisplayNameParts,
  type ContactDisplayInput,
} from "@/lib/contact-display";

interface ContactDisplayNameProps {
  input: ContactDisplayInput;
  primaryClassName?: string;
  representativeClassName?: string;
}

export function ContactDisplayName({
  input,
  primaryClassName = "text-emerald-700",
  representativeClassName = "text-slate-500",
}: ContactDisplayNameProps) {
  const parts = getContactDisplayNameParts(input);

  if (parts.kind === "representative") {
    return (
      <>
        <span className={primaryClassName}>{parts.senderName}</span>
        <span className={representativeClassName}>
          {" "}
          en Repr. de {parts.ownerName}
        </span>
      </>
    );
  }

  return <span className={primaryClassName}>{parts.label}</span>;
}
