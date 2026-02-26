"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

interface Scene {
  id: number;
  narration: string;
  imagePrompt: string;
  imageUrl?: string;
  duration: number; // seconds per scene
}

interface Story {
  title: string;
  scenes: Scene[];
}

type AppState = "input" | "generating" | "editing" | "previewing" | "exporting";

export default function Home() {
  const [idea, setIdea] = useState("");
  const [sceneCount, setSceneCount] = useState(5);
  const [story, setStory] = useState<Story | null>(null);
  const [appState, setAppState] = useState<AppState>("input");
  const [progress, setProgress] = useState("");
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editNarration, setEditNarration] = useState("");
  const [regenerateFeedback, setRegenFeedback] = useState("");
  const [regeneratingScene, setRegeneratingScene] = useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);

  // Preload images into cache
  const preloadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    if (imageCache.current.has(url)) {
      return Promise.resolve(imageCache.current.get(url)!);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        imageCache.current.set(url, img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }, []);

  // Draw scene on canvas
  const drawScene = useCallback(
    async (sceneIndex: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !story) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const scene = story.scenes[sceneIndex];
      if (!scene) return;

      // Paper background
      ctx.fillStyle = "#FFF8E7";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw lined paper effect
      ctx.strokeStyle = "#E8DCC8";
      ctx.lineWidth = 1;
      for (let y = 32; y < canvas.height - 80; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      if (scene.imageUrl) {
        try {
          const img = await preloadImage(scene.imageUrl);
          // Draw image centered with margin
          const margin = 40;
          const maxW = canvas.width - margin * 2;
          const maxH = canvas.height - 140;
          const scale = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (canvas.width - w) / 2;
          const y = margin;

          // Slight rotation for hand-drawn feel
          ctx.save();
          ctx.translate(x + w / 2, y + h / 2);
          ctx.rotate((Math.random() - 0.5) * 0.02);
          ctx.translate(-(x + w / 2), -(y + h / 2));

          // Paper shadow
          ctx.shadowColor = "rgba(0,0,0,0.15)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 4;
          ctx.shadowOffsetY = 4;
          ctx.drawImage(img, x, y, w, h);
          ctx.shadowColor = "transparent";

          // Tape effect on corners
          ctx.fillStyle = "rgba(255,235,180,0.7)";
          ctx.fillRect(x - 5, y - 5, 40, 20);
          ctx.fillRect(x + w - 35, y - 5, 40, 20);

          ctx.restore();
        } catch {
          // Placeholder
          ctx.fillStyle = "#eee";
          ctx.fillRect(40, 40, canvas.width - 80, canvas.height - 160);
          ctx.fillStyle = "#999";
          ctx.font = "24px Comic Neue, Comic Sans MS, cursive";
          ctx.textAlign = "center";
          ctx.fillText("Bild wird geladen...", canvas.width / 2, canvas.height / 2);
        }
      }

      // Narration bar at bottom
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - 80);
      ctx.lineTo(canvas.width, canvas.height - 80);
      ctx.stroke();

      // Narration text
      ctx.fillStyle = "#333";
      ctx.font = "bold 20px Comic Neue, Comic Sans MS, cursive";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Word wrap
      const words = scene.narration.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const test = line + word + " ";
        if (ctx.measureText(test).width > canvas.width - 60) {
          lines.push(line.trim());
          line = word + " ";
        } else {
          line = test;
        }
      }
      lines.push(line.trim());

      const lineHeight = 26;
      const startY = canvas.height - 80 + (80 - lines.length * lineHeight) / 2;
      lines.forEach((l, i) => {
        ctx.fillText(l, canvas.width / 2, startY + i * lineHeight + lineHeight / 2);
      });

      // Scene counter
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.font = "16px Comic Neue, Comic Sans MS, cursive";
      ctx.textAlign = "right";
      ctx.fillText(
        `${sceneIndex + 1} / ${story.scenes.length}`,
        canvas.width - 15,
        canvas.height - 85
      );
    },
    [story, preloadImage]
  );

  // Update canvas when current scene changes
  useEffect(() => {
    if (story && (appState === "editing" || appState === "previewing")) {
      drawScene(currentScene);
    }
  }, [currentScene, story, appState, drawScene]);

  // Play/pause logic
  useEffect(() => {
    if (isPlaying && story) {
      const sceneDuration = story.scenes[currentScene]?.duration || 3;
      playIntervalRef.current = setInterval(() => {
        setCurrentScene((prev) => {
          const next = prev + 1;
          if (next >= story.scenes.length) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, sceneDuration * 1000);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, story, currentScene]);

  // Generate story
  const generateStory = async () => {
    if (!idea.trim()) return;
    setError("");
    setAppState("generating");
    setProgress("Geschichte wird geschrieben...");

    try {
      const storyRes = await fetch("/api/generate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, sceneCount }),
      });

      if (!storyRes.ok) {
        const err = await storyRes.json();
        throw new Error(err.error || "Story-Generierung fehlgeschlagen");
      }

      const storyData = await storyRes.json();
      const scenes: Scene[] = storyData.scenes.map((s: Scene) => ({
        ...s,
        duration: 3,
      }));

      setStory({ title: storyData.title, scenes });
      setProgress("Bilder werden gemalt...");

      // Generate images in parallel (max 3 at once)
      const batchSize = 3;
      for (let i = 0; i < scenes.length; i += batchSize) {
        const batch = scenes.slice(i, i + batchSize);
        setProgress(
          `Bild ${i + 1}-${Math.min(i + batchSize, scenes.length)} von ${scenes.length} wird gemalt...`
        );

        const results = await Promise.allSettled(
          batch.map((scene) =>
            fetch("/api/generate-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: scene.imagePrompt,
                sceneId: scene.id,
              }),
            }).then((r) => r.json())
          )
        );

        results.forEach((result, idx) => {
          if (result.status === "fulfilled" && result.value.imageUrl) {
            scenes[i + idx].imageUrl = result.value.imageUrl;
          }
        });

        setStory({ title: storyData.title, scenes: [...scenes] });
      }

      setStory({ title: storyData.title, scenes });
      setCurrentScene(0);
      setAppState("editing");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
      setAppState("input");
    }
  };

  // Regenerate a single scene image
  const regenerateSceneImage = async (sceneIndex: number) => {
    if (!story) return;
    setRegeneratingScene(sceneIndex);

    try {
      const scene = story.scenes[sceneIndex];
      const res = await fetch("/api/regenerate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          narration: scene.narration,
          feedback: regenerateFeedback,
        }),
      });

      const data = await res.json();
      if (data.imageUrl) {
        const updatedScenes = [...story.scenes];
        updatedScenes[sceneIndex] = {
          ...updatedScenes[sceneIndex],
          imageUrl: data.imageUrl,
          imagePrompt: data.imagePrompt || updatedScenes[sceneIndex].imagePrompt,
        };
        setStory({ ...story, scenes: updatedScenes });
        imageCache.current.delete(scene.imageUrl || "");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Fehler";
      setError(`Bild-Regenerierung fehlgeschlagen: ${message}`);
    }
    setRegeneratingScene(null);
    setRegenFeedback("");
  };

  // Update scene narration
  const updateNarration = (sceneIndex: number, newNarration: string) => {
    if (!story) return;
    const updatedScenes = [...story.scenes];
    updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], narration: newNarration };
    setStory({ ...story, scenes: updatedScenes });
    setEditingScene(null);
  };

  // Update scene duration
  const updateDuration = (sceneIndex: number, duration: number) => {
    if (!story) return;
    const updatedScenes = [...story.scenes];
    updatedScenes[sceneIndex] = { ...updatedScenes[sceneIndex], duration };
    setStory({ ...story, scenes: updatedScenes });
  };

  // Move scene
  const moveScene = (from: number, to: number) => {
    if (!story || to < 0 || to >= story.scenes.length) return;
    const updatedScenes = [...story.scenes];
    const [moved] = updatedScenes.splice(from, 1);
    updatedScenes.splice(to, 0, moved);
    setStory({ ...story, scenes: updatedScenes });
    setCurrentScene(to);
  };

  // Delete scene
  const deleteScene = (index: number) => {
    if (!story || story.scenes.length <= 1) return;
    const updatedScenes = story.scenes.filter((_, i) => i !== index);
    setStory({ ...story, scenes: updatedScenes });
    if (currentScene >= updatedScenes.length) {
      setCurrentScene(updatedScenes.length - 1);
    }
  };

  // Load FFmpeg
  const loadFFmpeg = async () => {
    if (ffmpegRef.current && ffmpegLoaded) return ffmpegRef.current;
    setFfmpegLoading(true);
    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ffmpeg;
    setFfmpegLoaded(true);
    setFfmpegLoading(false);
    return ffmpeg;
  };

  // Export as MP4 video using FFmpeg.wasm
  const exportVideo = async () => {
    if (!story || !canvasRef.current) return;
    setAppState("exporting");
    setExportProgress(0);

    try {
      setProgress("FFmpeg wird geladen...");
      const ffmpeg = await loadFFmpeg();

      const canvas = canvasRef.current;
      const fps = 1; // 1 frame per second, we duplicate frames for duration
      let frameIndex = 0;

      // Generate frames: one JPEG per second of video
      for (let i = 0; i < story.scenes.length; i++) {
        setExportProgress(Math.round(((i + 1) / story.scenes.length) * 80));
        setProgress(`Szene ${i + 1}/${story.scenes.length} wird gerendert...`);
        setCurrentScene(i);
        await drawScene(i);

        // Wait a tick for canvas to render
        await new Promise((r) => setTimeout(r, 100));

        // Get frame as JPEG blob
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92)
        );
        const buffer = await blob.arrayBuffer();

        // Write the same frame multiple times for the scene duration
        const duration = story.scenes[i].duration || 3;
        for (let f = 0; f < duration; f++) {
          const filename = `frame${String(frameIndex).padStart(5, "0")}.jpg`;
          await ffmpeg.writeFile(filename, new Uint8Array(buffer));
          frameIndex++;
        }
      }

      setProgress("MP4 wird encodiert...");
      setExportProgress(85);

      // Encode to MP4 with H.264
      await ffmpeg.exec([
        "-framerate", String(fps),
        "-i", "frame%05d.jpg",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "23",
        "-movflags", "+faststart",
        "output.mp4",
      ]);

      setExportProgress(95);
      setProgress("Download wird vorbereitet...");

      const data = await ffmpeg.readFile("output.mp4");
      const mp4Blob = new Blob([new Uint8Array(data as Uint8Array)], { type: "video/mp4" });
      const url = URL.createObjectURL(mp4Blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${story.title.replace(/[^a-zA-Z0-9]/g, "_")}_paperdraw.mp4`;
      a.click();

      // Cleanup FFmpeg files
      for (let f = 0; f < frameIndex; f++) {
        const filename = `frame${String(f).padStart(5, "0")}.jpg`;
        try { await ffmpeg.deleteFile(filename); } catch { /* ignore */ }
      }
      try { await ffmpeg.deleteFile("output.mp4"); } catch { /* ignore */ }

      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setExportProgress(100);
      setProgress("");
      setAppState("editing");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export fehlgeschlagen";
      setError(`MP4-Export Fehler: ${message}`);
      setAppState("editing");
    }
  };

  // Share functionality
  const shareVideo = async () => {
    if (!canvasRef.current) return;
    try {
      const blob = await new Promise<Blob>((resolve) =>
        canvasRef.current!.toBlob((b) => resolve(b!), "image/png")
      );
      if (navigator.share) {
        await navigator.share({
          title: story?.title || "PaperDraw Video",
          text: `Schau dir mein PaperDraw Video an: "${story?.title}"`,
          files: [new File([blob], "paperdraw.png", { type: "image/png" })],
        });
      } else {
        // Fallback: copy current frame as image
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      }
    } catch {
      // User cancelled share
    }
  };

  // === RENDER ===

  // INPUT SCREEN
  if (appState === "input") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 paper-bg">
        <div className="max-w-2xl w-full">
          {/* Title */}
          <div className="text-center mb-10">
            <h1
              className="text-5xl font-bold mb-3"
              style={{ color: "var(--crayon-red)" }}
            >
              PaperDraw Video
            </h1>
            <p className="text-xl" style={{ color: "#666" }}>
              Verwandle deine Idee in ein lustiges Kinderzeichnungs-Video!
            </p>
          </div>

          {/* Decorative crayons */}
          <div className="flex justify-center gap-2 mb-8">
            {["#FF6B6B", "#4ECDC4", "#FFE66D", "#95E76E", "#C77DFF", "#FFB347"].map(
              (color) => (
                <div
                  key={color}
                  className="w-6 h-16 rounded-t-full"
                  style={{
                    backgroundColor: color,
                    border: "2px solid #333",
                    transform: `rotate(${(Math.random() - 0.5) * 10}deg)`,
                  }}
                />
              )
            )}
          </div>

          {/* Input area */}
          <div
            className="p-8 rounded-2xl mb-6"
            style={{
              background: "white",
              border: "3px solid #333",
              boxShadow: "6px 6px 0 #333",
            }}
          >
            <label className="block text-lg font-bold mb-3">
              Was soll dein Video zeigen?
            </label>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="z.B. Ein kleiner Hund der lernt zu fliegen und Freunde im Himmel findet..."
              className="w-full p-4 text-lg rounded-xl resize-none focus:outline-none"
              style={{
                border: "3px dashed #ccc",
                minHeight: "120px",
                background: "var(--paper-cream)",
              }}
              rows={4}
            />

            <div className="flex items-center gap-4 mt-4">
              <label className="font-bold">Anzahl Szenen:</label>
              <input
                type="range"
                min={3}
                max={8}
                value={sceneCount}
                onChange={(e) => setSceneCount(parseInt(e.target.value))}
                className="flex-1"
              />
              <span
                className="text-2xl font-bold w-10 text-center"
                style={{ color: "var(--crayon-purple)" }}
              >
                {sceneCount}
              </span>
            </div>
          </div>

          <button
            onClick={generateStory}
            disabled={!idea.trim()}
            className="crayon-btn w-full text-xl"
            style={{ background: "var(--crayon-yellow)", color: "#333" }}
          >
            Video erstellen!
          </button>

          {error && (
            <div
              className="mt-4 p-4 rounded-xl text-center"
              style={{
                background: "#FFE0E0",
                border: "2px solid var(--crayon-red)",
                color: "var(--crayon-red)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // GENERATING SCREEN
  if (appState === "generating") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 paper-bg">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-6" />
          <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--crayon-purple)" }}>
            Wird gezeichnet...
          </h2>
          <p className="text-xl mb-4">{progress}</p>

          {/* Show generated scenes as they come in */}
          {story && (
            <div className="flex flex-wrap justify-center gap-3 mt-6 max-w-4xl">
              {story.scenes.map((scene, i) => (
                <div
                  key={i}
                  className="w-24 h-24 rounded-lg overflow-hidden"
                  style={{
                    border: "3px solid #333",
                    background: scene.imageUrl ? "transparent" : "#eee",
                  }}
                >
                  {scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={`Szene ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">
                      ...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // EDITING / PREVIEW / EXPORT SCREEN
  return (
    <div className="min-h-screen p-4 paper-bg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--crayon-red)" }}>
            PaperDraw Video
          </h1>
          <h2 className="text-lg font-bold">{story?.title}</h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setStory(null);
              setAppState("input");
              setIdea("");
            }}
            className="crayon-btn text-sm"
            style={{ background: "#eee" }}
          >
            Neu
          </button>
          <button
            onClick={shareVideo}
            className="crayon-btn text-sm"
            style={{ background: "var(--crayon-blue)", color: "white" }}
          >
            Teilen
          </button>
          <button
            onClick={exportVideo}
            disabled={appState === "exporting"}
            className="crayon-btn text-sm"
            style={{ background: "var(--crayon-green)" }}
          >
            {appState === "exporting"
              ? `Exportiere MP4... ${exportProgress}%`
              : ffmpegLoading
                ? "FFmpeg laden..."
                : "Als MP4 exportieren"}
          </button>
        </div>
      </div>

      <div className="flex gap-6 max-w-7xl mx-auto" style={{ minHeight: "calc(100vh - 100px)" }}>
        {/* LEFT: Video Preview */}
        <div className="flex-1">
          <div className="video-container">
            <canvas
              ref={canvasRef}
              width={1080}
              height={1080}
              className="w-full"
              style={{ aspectRatio: "1/1" }}
            />
          </div>

          {/* Playback controls */}
          <div
            className="flex items-center justify-center gap-4 mt-4 p-4 rounded-xl"
            style={{ background: "white", border: "3px solid #333", boxShadow: "4px 4px 0 #333" }}
          >
            <button
              onClick={() => setCurrentScene(Math.max(0, currentScene - 1))}
              className="crayon-btn text-sm py-2 px-4"
              style={{ background: "var(--crayon-orange)" }}
              disabled={currentScene === 0}
            >
              &lt;&lt;
            </button>
            <button
              onClick={() => {
                if (isPlaying) {
                  setIsPlaying(false);
                } else {
                  if (currentScene >= (story?.scenes.length || 1) - 1) {
                    setCurrentScene(0);
                  }
                  setIsPlaying(true);
                }
              }}
              className="crayon-btn py-2 px-8"
              style={{
                background: isPlaying ? "var(--crayon-red)" : "var(--crayon-green)",
                color: isPlaying ? "white" : "#333",
              }}
            >
              {isPlaying ? "Stop" : "Play"}
            </button>
            <button
              onClick={() =>
                setCurrentScene(Math.min((story?.scenes.length || 1) - 1, currentScene + 1))
              }
              className="crayon-btn text-sm py-2 px-4"
              style={{ background: "var(--crayon-orange)" }}
              disabled={currentScene >= (story?.scenes.length || 1) - 1}
            >
              &gt;&gt;
            </button>
          </div>

          {/* Timeline */}
          <div className="flex gap-2 mt-4 overflow-x-auto p-2">
            {story?.scenes.map((scene, i) => (
              <button
                key={i}
                onClick={() => {
                  setCurrentScene(i);
                  setIsPlaying(false);
                }}
                className="flex-shrink-0 rounded-lg overflow-hidden transition-all"
                style={{
                  width: "80px",
                  height: "80px",
                  border:
                    i === currentScene
                      ? "3px solid var(--crayon-red)"
                      : "2px solid #ccc",
                  boxShadow: i === currentScene ? "3px 3px 0 var(--crayon-red)" : "none",
                  opacity: scene.imageUrl ? 1 : 0.5,
                }}
              >
                {scene.imageUrl ? (
                  <img
                    src={scene.imageUrl}
                    alt={`Szene ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100 text-sm">
                    {i + 1}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: Scene Editor Panel */}
        <div className="w-96 flex-shrink-0">
          <div
            className="p-5 rounded-2xl sticky top-4"
            style={{
              background: "white",
              border: "3px solid #333",
              boxShadow: "6px 6px 0 #333",
            }}
          >
            <h3 className="text-xl font-bold mb-4" style={{ color: "var(--crayon-purple)" }}>
              Szene {currentScene + 1} bearbeiten
            </h3>

            {story && story.scenes[currentScene] && (
              <>
                {/* Narration edit */}
                <div className="mb-4">
                  <label className="block font-bold mb-1 text-sm">Text / Erzaehlung:</label>
                  {editingScene === currentScene ? (
                    <div>
                      <textarea
                        value={editNarration}
                        onChange={(e) => setEditNarration(e.target.value)}
                        className="w-full p-3 rounded-lg text-sm"
                        style={{
                          border: "2px dashed var(--crayon-blue)",
                          background: "var(--paper-cream)",
                        }}
                        rows={3}
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => updateNarration(currentScene, editNarration)}
                          className="crayon-btn text-xs py-1 px-3"
                          style={{ background: "var(--crayon-green)" }}
                        >
                          Speichern
                        </button>
                        <button
                          onClick={() => setEditingScene(null)}
                          className="crayon-btn text-xs py-1 px-3"
                          style={{ background: "#eee" }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        setEditingScene(currentScene);
                        setEditNarration(story.scenes[currentScene].narration);
                      }}
                      className="p-3 rounded-lg cursor-pointer hover:bg-gray-50 text-sm"
                      style={{ border: "2px dashed #ccc", background: "var(--paper-cream)" }}
                    >
                      {story.scenes[currentScene].narration}
                      <span className="block text-xs mt-1" style={{ color: "#999" }}>
                        Klick zum Bearbeiten
                      </span>
                    </div>
                  )}
                </div>

                {/* Duration */}
                <div className="mb-4">
                  <label className="block font-bold mb-1 text-sm">
                    Dauer: {story.scenes[currentScene].duration}s
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={story.scenes[currentScene].duration}
                    onChange={(e) => updateDuration(currentScene, parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>

                {/* Regenerate image */}
                <div className="mb-4">
                  <label className="block font-bold mb-1 text-sm">Bild neu generieren:</label>
                  <textarea
                    value={regenerateFeedback}
                    onChange={(e) => setRegenFeedback(e.target.value)}
                    placeholder="Optional: Was soll anders sein? z.B. 'mehr Farben' oder 'mit einem Regenbogen'"
                    className="w-full p-2 rounded-lg text-sm mb-2"
                    style={{
                      border: "2px dashed #ccc",
                      background: "var(--paper-cream)",
                    }}
                    rows={2}
                  />
                  <button
                    onClick={() => regenerateSceneImage(currentScene)}
                    disabled={regeneratingScene !== null}
                    className="crayon-btn text-sm w-full py-2"
                    style={{ background: "var(--crayon-pink)" }}
                  >
                    {regeneratingScene === currentScene
                      ? "Wird neu gemalt..."
                      : "Bild neu malen"}
                  </button>
                </div>

                {/* Scene order controls */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => moveScene(currentScene, currentScene - 1)}
                    disabled={currentScene === 0}
                    className="crayon-btn text-xs py-1 px-3 flex-1"
                    style={{ background: "var(--crayon-orange)" }}
                  >
                    Nach oben
                  </button>
                  <button
                    onClick={() => moveScene(currentScene, currentScene + 1)}
                    disabled={currentScene >= story.scenes.length - 1}
                    className="crayon-btn text-xs py-1 px-3 flex-1"
                    style={{ background: "var(--crayon-orange)" }}
                  >
                    Nach unten
                  </button>
                </div>

                {/* Delete scene */}
                {story.scenes.length > 1 && (
                  <button
                    onClick={() => deleteScene(currentScene)}
                    className="crayon-btn text-xs py-1 w-full"
                    style={{ background: "#FFE0E0", color: "var(--crayon-red)" }}
                  >
                    Szene loeschen
                  </button>
                )}
              </>
            )}
          </div>

          {/* All scenes overview */}
          <div
            className="mt-4 p-4 rounded-2xl"
            style={{
              background: "white",
              border: "3px solid #333",
              boxShadow: "4px 4px 0 #333",
            }}
          >
            <h3 className="font-bold mb-3" style={{ color: "var(--crayon-blue)" }}>
              Alle Szenen
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {story?.scenes.map((scene, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setCurrentScene(i);
                    setIsPlaying(false);
                  }}
                  className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all"
                  style={{
                    background:
                      i === currentScene ? "var(--crayon-yellow)" : "var(--paper-cream)",
                    border: i === currentScene ? "2px solid #333" : "2px solid transparent",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded overflow-hidden flex-shrink-0"
                    style={{ border: "2px solid #333" }}
                  >
                    {scene.imageUrl ? (
                      <img
                        src={scene.imageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs">
                        {i + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold">Szene {i + 1}</p>
                    <p className="text-xs truncate" style={{ color: "#666" }}>
                      {scene.narration}
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: "#999" }}>
                    {scene.duration}s
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div
          className="fixed bottom-4 right-4 p-4 rounded-xl max-w-sm"
          style={{
            background: "#FFE0E0",
            border: "3px solid var(--crayon-red)",
            boxShadow: "4px 4px 0 var(--crayon-red)",
            zIndex: 1000,
          }}
        >
          <div className="flex justify-between items-start">
            <p className="text-sm" style={{ color: "var(--crayon-red)" }}>
              {error}
            </p>
            <button onClick={() => setError("")} className="ml-2 font-bold">
              X
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
