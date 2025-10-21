import React, { useEffect, useMemo, useRef, useState } from "react"
import ChatMessage from "./components/ChatMessage"
import ModelPicker from "./components/ModelPicker"
import { useLLM, type ChatMessage as Msg, type LoadProgress } from "./hooks/useLLM"
import { CATALOG } from "./lib/models"

const DEFAULT_SYSTEM = "You are a helpful assistant. Keep responses concise when possible."

function formatBytes(n: number) {
  if (!n || n < 0) return "0 B"
  const u = ["B","KB","MB","GB","TB"]
  const i = Math.floor(Math.log(n)/Math.log(1024))
  return `${(n/Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`
}

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "system", content: DEFAULT_SYSTEM },
  ])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)

  // Track multiple concurrent loads
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [progressMap, setProgressMap] = useState<Record<string, LoadProgress>>({})

  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const {
    ready,
    modelId,
    device,
    preloadModel,
    useModel,
    hasCached,
    generate,
    abort,
  } = useLLM()

  // Focus input when model is ready or after sends
  useEffect(() => {
    if (ready) inputRef.current?.focus()
  }, [ready])

  const canSend = ready && !streaming

  // PRELOAD (download) — can run multiple at once
  async function handleLoad(id: string) {
    if (loadingMap[id]) return
    setLoadingMap(m => ({ ...m, [id]: true }))
    setProgressMap(m => ({ ...m, [id]: { modelId: id, loadedBytes: 0, totalBytes: 0, percent: 0 } }))
    try {
      await preloadModel(id, undefined, (p) => {
        setProgressMap(m => ({ ...m, [id]: p }))
      })
    } finally {
      setLoadingMap(m => ({ ...m, [id]: false }))
      // keep progress visible a moment (optional)
      setTimeout(() => {
        setProgressMap(m => {
          const { [id]: _, ...rest } = m
          return rest
        })
      }, 1200)
    }
  }

  // USE (switch active generator)
  async function handleUse(id: string) {
    if (!hasCached(id)) {
      await handleLoad(id) // safety: if user clicks "Use" too early
    }
    await useModel(id)
    inputRef.current?.focus()
  }

  async function onSend() {
    if (!input.trim() || !canSend) return
    const userMsg: Msg = { role: "user", content: input.trim() }
    const assistantMsg: Msg = { role: "assistant", content: "" }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput("")
    setStreaming(true)
    inputRef.current?.focus()

    const updateAssistant = (delta: string) => {
      if (!delta) return
      setMessages(prev => {
        const out = [...prev]
        let idx = out.length - 1
        while (idx >= 0 && out[idx].role !== "assistant") idx--
        if (idx >= 0) out[idx] = { ...out[idx], content: out[idx].content + delta }
        return out
      })
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
      inputRef.current?.focus()
    }

    try {
      await generate([...messages, userMsg], {
        onDelta: updateAssistant,
        onDone: () => {
          setStreaming(false)
          inputRef.current?.focus()
          bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
        },
        onError: (e) => {
          setStreaming(false)
          setMessages(prev => {
            const out = [...prev]
            let idx = out.length - 1
            while (idx >= 0 && out[idx].role !== "assistant") idx--
            if (idx >= 0) out[idx] = { ...out[idx], content: `⛔ ${String(e)}` }
            return out
          })
          inputRef.current?.focus()
        },
      })
    } catch {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  function onNewChat() {
    if (streaming) abort()
    setMessages([{ role: "system", content: DEFAULT_SYSTEM }])
    setInput("")
    inputRef.current?.focus()
  }

  // Derive display maps for ModelPicker
  const progressPercent = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [id, p] of Object.entries(progressMap)) out[id] = p.percent
    return out
  }, [progressMap])

  const progressLabel = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [id, p] of Object.entries(progressMap)) {
      const { loadedBytes, totalBytes, percent } = p
      out[id] = totalBytes
        ? `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)} (${Math.round(percent)}%)`
        : `${formatBytes(loadedBytes)}`
    }
    return out
  }, [progressMap])

  return (
    <div className="h-screen w-full bg-neutral-900 text-neutral-100 select-none">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-neutral-900/90 backdrop-blur border-b border-neutral-800">
        <div className="mx-auto max-w-5xl px-4">
          <div className="h-14 flex items-center justify-between">
            <ModelPicker
              models={CATALOG}
              currentModelId={modelId}
              ready={ready}
              loadingMap={loadingMap}
              progressPercent={progressPercent}
              progressLabel={progressLabel}
              isCached={hasCached}
              onLoad={handleLoad}
              onUse={handleUse}
            />
            <button
              className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-700"
              onClick={onNewChat}
              disabled={!ready && !hasCached(modelId)}
              title="Start a new chat"
            >
              New chat
            </button>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <main className="h-[calc(100vh-3.5rem-64px)] overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4 space-y-3 relative min-h-full">
          {/* Blocker only when no model is actively in use */}
          {!ready && (
            <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm rounded-xl grid place-content-center border border-neutral-800">
              <div className="text-center">
                <p className="text-neutral-300">Select a model (top-left): Load → Use</p>
              </div>
            </div>
          )}

          {ready && messages.filter(m => m.role !== "system").length === 0 ? (
            <div className="h-[40vh] grid place-content-center text-center text-neutral-400">
              <p className="text-lg">Say hello to your in-browser model 👋</p>
              <p className="text-sm">Type below to begin.</p>
            </div>
          ) : (
            messages
              .filter(m => m.role !== "system")
              .map((m, i) => (
                <div key={i} className="select-text">
                  <ChatMessage role={m.role as "user" | "assistant"} content={m.content} />
                </div>
              ))
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Composer */}
      <footer className="border-t border-neutral-800 bg-neutral-900/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 select-text"
              placeholder={ready ? "Type your message…" : "Select a model: Load → Use"}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
              disabled={!ready}
            />
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-400"
              onClick={onSend}
              disabled={!ready || streaming || !input.trim()}
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
          <div className="text-xs text-neutral-500 mt-2 select-text">
            {device ? `Device: ${device}` : "Device: detecting…"}
          </div>
        </div>
      </footer>
    </div>
  )
}
