import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAI();
    const { prompt, sceneId } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt fehlt!" }, { status: 400 });
    }

    const fullPrompt = `${prompt}. Style: child's crayon drawing on white paper, colorful thick crayon lines, simple cute shapes, hand-drawn by a 6 year old child, bright primary colors, paper texture background, no text, no words, playful and whimsical`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: fullPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: "Bild konnte nicht generiert werden" }, { status: 500 });
    }

    // Fetch the image and convert to base64 to avoid expiring URLs
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    return NextResponse.json({ imageUrl: dataUrl, sceneId });
  } catch (error: unknown) {
    console.error("Image generation error:", error);
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ error: `Fehler: ${message}` }, { status: 500 });
  }
}

export const maxDuration = 60;
