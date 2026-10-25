import OpenAI from "openai";
import { draftIneFields, type IneDraft, type IneFieldIssue } from "./ine-fields";

const FRONT_PROMPT = `Esta imagen es el FRENTE de una credencial para votar del INE de México.
Extrae solo lo impreso. No inventes ni completes. Si no se lee, usa cadena vacía.
Ignora domicilio, sexo, número OCR y CIC.
El nombre son tres renglones: apellido paterno, apellido materno y nombres.
La fecha de nacimiento es DD/MM/AAAA.
La CURP y la clave de elector tienen 18 caracteres.
Junto a VIGENCIA hay un año de 4 dígitos.
Responde únicamente JSON con las llaves:
apellidoPaterno, apellidoMaterno, nombres, fechaNacimiento, curp, claveElector, anioVencimiento.`;

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readSide(
  client: OpenAI,
  model: string,
  jpeg: Buffer,
  prompt: string
): Promise<Record<string, unknown> | null> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });
  return extractJson(response.choices[0]?.message?.content?.trim() ?? "");
}

export async function readInePair(
  frontJpeg: Buffer,
  backJpeg: Buffer
): Promise<{ draft: IneDraft; issues: IneFieldIssue[] } | { error: string; issues: IneFieldIssue[] }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return {
      error: "No se puede leer la credencial en este momento. Intenta más tarde.",
      issues: [],
    };
  }
  const model =
    process.env.OPENROUTER_VISION_MODEL ??
    process.env.OPENROUTER_MODEL ??
    "openai/gpt-4o-mini";
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  if (backJpeg.length < 1) {
    return {
      error: "Falta la foto del reverso.",
      issues: [{ field: "reverso", side: "reverso" }],
    };
  }

  let front: Record<string, unknown> | null = null;
  try {
    front = await readSide(client, model, frontJpeg, FRONT_PROMPT);
  } catch (err) {
    console.error("[ine] vision failed", err instanceof Error ? err.name : "error");
    return {
      error: "No se pudo analizar la credencial. Repite las dos fotos con más luz.",
      issues: [],
    };
  }

  if (!front) {
    return {
      error: "No se leyeron los datos del frente. Centra la credencial en el marco y repite esa foto.",
      issues: [{ field: "frente", side: "frente" }],
    };
  }

  return draftIneFields(front);
}
