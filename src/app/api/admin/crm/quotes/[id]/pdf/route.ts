import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { crmFail, parsePositiveId, requireCrmRead } from "@/lib/crm/http";
import {
  generateQuotePdf,
  isSafeQuotePdfPath,
  quotePdfAbsolutePath,
  quotePdfFilename,
} from "@/lib/crm/quote-pdf";
import { getQuote, setQuotePdfPath } from "@/lib/crm/quotes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmRead("crm_quotes");
  if (isAuthError(auth)) return auth;
  try {
    const id = parsePositiveId((await params).id);
    const quote = getQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }

    let filePath =
      quote.pdf_path && isSafeQuotePdfPath(quote.pdf_path, quote.number)
        ? quote.pdf_path
        : quotePdfAbsolutePath(quote.number);

    try {
      const file = await readFile(filePath);
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${quotePdfFilename(quote.number)}"`,
        },
      });
    } catch {
      const generated = await generateQuotePdf(id);
      setQuotePdfPath(id, generated.path);
      const file = await readFile(generated.path);
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${generated.filename}"`,
        },
      });
    }
  } catch (err) {
    return crmFail(err);
  }
}
