import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const openai = getOpenAI();
    const { narration, feedback } = await req.json();

    // Generate a new image prompt based on feedback
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You create image generation prompts for children's crayon drawings. Given a scene narration and optional feedback, create a detailed image prompt.
Return ONLY the prompt text, nothing else. Always include: "children's crayon drawing on white paper, colorful, simple shapes, hand-drawn style, cute"`,
        },
        {
          role: "user",
          content: `Scene: "${narration}"${feedback ? `\nFeedback: "${feedback}"` : ""}`,
        },
      ],
      temperature: 0.9,
      max_tokens: 300,
    });

    const imagePrompt = response.choices[0]?.message?.content || "";

    // Generate the image
    const fullPrompt = `${imagePrompt}. Style: child's crayon drawing on white paper, colorful thick crayon lines, simple cute shapes, hand-drawn by a 6 year old child, bright primary colors, paper texture background, no text, no words`;

    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: fullPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
    });

    const imageUrl = imageResponse.data?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: "Bild konnte nicht generiert werden" }, { status: 500 });
    }

    const imgResp = await fetch(imageUrl);
    const imgBuffer = await imgResp.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    return NextResponse.json({ imageUrl: dataUrl, imagePrompt });
  } catch (error: unknown) {
    console.error("Regenerate error:", error);
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ error: `Fehler: ${message}` }, { status: 500 });
  }
}

export const maxDuration = 60;
