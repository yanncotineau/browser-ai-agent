import React, { useRef, useState } from "react"
import ChatMessage from "./components/ChatMessage"
import ModelBadge from "./components/ModelBadge"
import { useLLM, type ChatMessage as Msg } from "./hooks/useLLM"
import { CATALOG, type ModelSpec } from "./lib/models"

const DEFAULT_SYSTEM = "You are a helpful assistant. Keep responses concise when possible."

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "system", content: DEFAULT_SYSTEM },
  ])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string>(CATALOG[0].id)

  const bottomRef = useRef<HTMLDivElement>(null)

  const {
    ready,
    loadingModel,
    modelId,
    device,
    loadModel,
    unloadModel,
    generate,
    abort,
  } = useLLM()

  // ---- Model picker (lazy load) ----
  if (!ready) {
    const meta: ModelSpec = CATALOG.find((m) => m.id === selectedModelId) ?? CATALOG[0]
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100">
        <div className="w-full max-w-lg p-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 backdrop-blur">
          <h1 className="text-xl font-semibold mb-2">Browser AI Agent Starter</h1>
          <p className="text-sm text-neutral-400 mb-4">Load an in-browser model to start chatting.</p>

          <label className="block text-sm mb-1">Model</label>
          <select
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 mb-3"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
          >
            {CATALOG.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          <div className="text-xs text-neutral-400 mb-3 space-y-1">
            <div><span className="opacity-70">HF repo:</span> <code>{meta.id}</code></div>
            <div><span className="opacity-70">Approx size:</span> {meta.approxSize} <span className="opacity-60">(first load cached locally)</span></div>
            {meta.notes && <div><span className="opacity-70">Notes:</span> {meta.notes}</div>}
          </div>

          <button
            className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700"
            disabled={loadingModel}
            onClick={() => loadModel(meta.id, meta.preferredDevice)}
          >
            {loadingModel ? "Loading model…" : "Load model"}
          </button>

          <p className="text-xs text-neutral-500 mt-3">
            Tip: WebGPU is faster if available; we’ll fall back to WASM otherwise.
          </p>
        </div>
      </div>
    )
  }

  // ---- Chat screen ----
  const canSend = !loadingModel && !streaming

  async function onSend() {
    if (!input.trim() || !canSend) return

    const userMsg: Msg = { role: "user", content: input.trim() }
    const assistantMsg: Msg = { role: "assistant", content: "" }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput("")
    setStreaming(true)

    // Progressive append to the last assistant bubble
    const updateAssistant = (delta: string) => {
      if (!delta) return
      setMessages((prev) => {
        const out = [...prev]
        let idx = out.length - 1
        while (idx >= 0 && out[idx].role !== "assistant") idx--
        if (idx >= 0) out[idx] = { ...out[idx], content: out[idx].content + delta }
        return out
      })
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    try {
      await generate([...messages, userMsg], {
        onDelta: updateAssistant,
        onDone: () => {
          setStreaming(false)
          bottomRef.current?.scrollIntoView({ behavior: "smooth" })
        },
        onError: (e) => {
          setStreaming(false)
          setMessages((prev) => {
            const out = [...prev]
            let idx = out.length - 1
            while (idx >= 0 && out[idx].role !== "assistant") idx--
            if (idx >= 0) out[idx] = { ...out[idx], content: `⛔ ${String(e)}` }
            return out
          })
        },
      })
    } catch {
      setStreaming(false)
    }
  }

  function onReset() {
    if (streaming) abort()
    setMessages([{ role: "system", content: DEFAULT_SYSTEM }])
    setInput("")
  }

  return (
    <div className="h-full grid grid-rows-[auto,1fr,auto] max-w-3xl mx-auto">
      {/* Header */}
      <header className="p-4 sticky top-0 z-10 bg-neutral-900/80 backdrop-blur border-b border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Browser AI Agent Starter</h1>
            <p className="text-sm text-neutral-400">In-browser chat via @huggingface/transformers</p>
          </div>
          <div className="flex items-center gap-2">
            <ModelBadge modelId={modelId} device={String(device)} loading={loadingModel} />
            <button
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-700"
              onClick={onReset}
              disabled={loadingModel}
              title="Clear conversation"
            >
              Reset
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-700"
              onClick={unloadModel}
              disabled={loadingModel || streaming}
              title="Unload model from memory"
            >
              Unload
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="overflow-y-auto p-4 space-y-3">
        {messages.filter((m) => m.role !== "system").length === 0 ? (
          <div className="h-full grid place-content-center text-center text-neutral-400">
            <p className="text-lg">Start chatting with your fully in-browser model 👇</p>
            <p className="text-sm">WebGPU if available. WASM fallback. No server calls.</p>
          </div>
        ) : (
          messages
            .filter((m) => m.role !== "system")
            .map((m, i) => (
              <ChatMessage key={i} role={m.role as "user" | "assistant"} content={m.content} />
            ))
        )}
        <div ref={bottomRef} />
      </main>

      {/* Composer */}
      <footer className="border-t border-neutral-800 p-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Type your message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            disabled={!canSend}
          />
          <button
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-400"
            onClick={onSend}
            disabled={!canSend}
          >
            {streaming ? "Generating…" : "Send"}
          </button>
          {streaming && (
            <button
              className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
              onClick={abort}
            >
              Stop
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
