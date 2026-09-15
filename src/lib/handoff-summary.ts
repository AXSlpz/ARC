import OpenAI from "openai";
import { getRecentHistory } from "./db";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

export async function generateHandoffSummary(
  conversationId: number
): Promise<string> {
  const history = getRecentHistory(conversationId, 15);
  if (history.length === 0) {
    return "Sin historial previo.";
  }

  const transcript = history
    .map((m) => {
      const who =
        m.role === "user" ? "Cliente" : m.role === "human" ? "Humano" : "IA";
      return `${who}: ${m.content}`;
    })
    .join("\n");

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Resume en español (máximo 5 líneas) la conversación para un asesor humano. Incluye: qué preguntó el cliente, qué respondió la IA, por qué se transfiere y datos útiles mencionados.",
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 300,
      temperature: 0.2,
    });

    return (
      response.choices[0]?.message?.content?.trim() ??
      "Resumen no disponible."
    );
  } catch {
    return `Último mensaje del cliente: ${
      [...history].reverse().find((m) => m.role === "user")?.content ??
      "—"
    }`;
  }
}
