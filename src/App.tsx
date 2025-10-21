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
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null)
  const [progress, setProgress] = useState<LoadProgress | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const {
    ready,
    loadingModel, // still used to disable some controls
    modelId,
    loadModel,
    generate,
    abort,
  } = useLLM()

  // Keep focus in the composer after loads / sends
  useEffect(() => {
    if (ready && !loadingModel) inputRef.current?.focus()
  }, [ready, loadingModel])

  const canSend = ready && !streaming

  async function handleLoad(id: string) {
    if (loadingModelId) return
    setLoadingModelId(id)
    setProgress({ modelId: id, loadedBytes: 0, totalBytes: 0, percent: 0 })
    try {
      await loadModel(id, undefined, (p) => setProgress(p))
      inputRef.current?.focus()
    } finally {
      setLoadingModelId(null)
      // when done, leave final progress value shown briefly; optional auto-clear:
      setTimeout(() => setProgress(null), 1200)
    }
  }

  async function onSend() {
    if (!input.trim() || !canSend) return

    const userMsg: Msg = { role: "user", content: input.trim() }
    const assistantMsg: Msg = { role: "assistant", content: "" }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput("")
    setStreaming(true)
    // DO NOT disable input during streaming; keep focus and let the user type
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
      // keep focus sticky
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

  const loadingPercent = useMemo(
    () => (progress && progress.modelId === loadingModelId ? progress.percent : null),
    [progress, loadingModelId]
  )
  const loadingBytesLabel = useMemo(() => {
    if (!progress || progress.modelId !== loadingModelId) return null
    const { loadedBytes, totalBytes } = progress
    return totalBytes
      ? `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)} (${Math.round(progress.percent)}%)`
      : `${formatBytes(loadedBytes)}`
  }, [progress, loadingModelId])

  return (
    <div className="h-screen w-full bg-neutral-900 text-neutral-100 select-none">
      {/* Top bar (compact, sticky; only its natural height) */}
      <header className="sticky top-0 z-10 bg-neutral-900/90 backdrop-blur border-b border-neutral-800">
        <div className="mx-auto max-w-5xl px-4">
          <div className="h-14 flex items-center justify-between">
            <ModelPicker
              models={CATALOG}
              currentModelId={modelId}
              ready={ready}
              loadingModelId={loadingModelId}
              loadingPercent={loadingPercent}
              loadingBytesLabel={loadingBytesLabel}
              onLoad={handleLoad}
            />
            <button
              className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-700"
              onClick={onNewChat}
              disabled={!ready || streaming}
              title="Start a new chat"
            >
              New chat
            </button>
          </div>
        </div>
      </header>

      {/* Chat area fills space between header and footer */}
      <main className="h-[calc(100vh-3.5rem-64px)] overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4 space-y-3 relative min-h-full">
          {/* Only block the chat when no model is selected */}
          {!ready && (
            <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm rounded-xl grid place-content-center border border-neutral-800">
              <div className="text-center">
                <p className="text-neutral-300">Select a model (top-left) to start</p>
              </div>
            </div>
          )}

          {/* Empty state: only when ready AND no user/assistant messages yet */}
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

      {/* Composer (footer) */}
      <footer className="border-t border-neutral-800 bg-neutral-900/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 select-text"
              placeholder={ready ? "Type your message…" : "Select a model to start"}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
              // Keep input enabled during streaming so focus stays; we only disable when not ready
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
            Runs fully in your browser. Streaming enabled.
          </div>
        </div>
      </footer>
    </div>
  )
}
