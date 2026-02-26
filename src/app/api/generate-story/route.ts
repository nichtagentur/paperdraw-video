import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { idea, sceneCount = 5 } = await req.json();

    if (!idea || typeof idea !== "string") {
      return NextResponse.json({ error: "Bitte gib eine Idee ein!" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a creative children's storyboard artist. Given an idea, create a short visual story broken into ${sceneCount} scenes. Each scene should be vivid, colorful, and suitable for a childish paper drawing style animation.

Return ONLY valid JSON in this exact format:
{
  "title": "Story Title",
  "scenes": [
    {
      "id": 1,
      "narration": "Short narration text for this scene (1-2 sentences, fun and playful)",
      "imagePrompt": "Detailed image generation prompt for a childish colorful paper/crayon drawing style. Include: specific objects, characters, colors, setting. Always specify: 'children's crayon drawing on white paper, colorful, simple shapes, hand-drawn style, cute'"
    }
  ]
}

Make the story fun, playful, and visually interesting. Each scene should flow naturally into the next. Keep narrations short and engaging.`,
        },
        {
          role: "user",
          content: `Create a ${sceneCount}-scene visual story for this idea: "${idea}"`,
        },
      ],
      temperature: 0.9,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Story-Generierung fehlgeschlagen" }, { status: 500 });
    }

    const story = JSON.parse(jsonMatch[0]);
    return NextResponse.json(story);
  } catch (error: unknown) {
    console.error("Story generation error:", error);
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ error: `Fehler: ${message}` }, { status: 500 });
  }
}
