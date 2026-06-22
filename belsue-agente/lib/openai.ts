import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  // No lanzamos aquí para permitir el build; las llamadas fallarán
  // explícitamente si la clave no está configurada en runtime.
  console.warn("OPENAI_API_KEY no está configurada.");
}

export const openai = new OpenAI({ apiKey: apiKey ?? "" });

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const CHAT_MODEL = "gpt-4o";
