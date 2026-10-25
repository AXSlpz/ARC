import { emptyIneDraft, type IneDraft, type IneFieldIssue } from "./ine-fields";
import { saveIneCapture } from "./ine-captures";
import { readInePair } from "./ine-vision";

/** Guarda las dos fotos y devuelve lo leído, aunque falten datos. */
export async function openIneReview(input: {
  frontJpeg: Buffer;
  backJpeg: Buffer;
  purpose: "register" | "match" | "profile";
  portalUserId?: number | null;
}): Promise<{ token: string; draft: IneDraft; issues: IneFieldIssue[]; warning?: string }> {
  const read = await readInePair(input.frontJpeg, input.backJpeg);
  const draft = "draft" in read ? read.draft : emptyIneDraft();
  const token = await saveIneCapture({
    frontJpeg: input.frontJpeg,
    backJpeg: input.backJpeg,
    fields: draft,
    purpose: input.purpose,
    portalUserId: input.portalUserId ?? null,
  });
  return {
    token,
    draft,
    issues: read.issues,
    ...("error" in read ? { warning: read.error } : {}),
  };
}
