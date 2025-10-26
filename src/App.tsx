import { useEffect, useMemo, useRef, useState } from "react"
import ChatMessage from "./components/ChatMessage"
import ModelPicker from "./components/ModelPicker"
import { useLLM, type ChatMessage as Msg, type LoadProgress } from "./hooks/useLLM"
import { CATALOG } from "./lib/models"
import { FiSend, FiSquare, FiPlus } from "react-icons/fi"
import bgUrl from "./assets/bg.jpg"

const DEFAULT_SYSTEM = "You are a helpful assistant. Keep responses concise when possible."

function formatBytes(n: number) {
  if (!n || n < 0) return "0 B"
  const u = ["B","KB","MB","GB","TB"]
  const i = Math.floor(Math.log(n)/Math.log(1024))
  return `${(n/Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`
}

function CenterNotice({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center text-neutral-300">
        <p className="text-lg font-medium">{title}</p>
        {subtitle && <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

export default function App() {
  const [messages, setMessages] = useState<Msg[]>([{ role: "system", content: DEFAULT_SYSTEM }])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [progressMap, setProgressMap] = useState<Record<string, LoadProgress>>({})

  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { ready, modelId, device, preloadModel, useModel, hasCached, generate, abort } = useLLM()

  useEffect(() => { if (ready) inputRef.current?.focus() }, [ready])

  const canSend = ready && !streaming

  async function handleLoad(id: string) {
    if (loadingMap[id]) return
    setLoadingMap(m => ({ ...m, [id]: true }))
    setProgressMap(m => ({ ...m, [id]: { modelId: id, loadedBytes: 0, totalBytes: 0, percent: 0 } }))
    try {
      await preloadModel(id, undefined, (p) => setProgressMap(m => ({ ...m, [id]: p })))
    } finally {
      setLoadingMap(m => ({ ...m, [id]: false }))
      setTimeout(() => setProgressMap(m => { const { [id]: _, ...rest } = m; return rest }), 1200)
    }
  }

  async function handleUse(id: string) {
    if (!hasCached(id)) await handleLoad(id)
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

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    })

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
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }))
  }

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

  const deviceLabel = device === "detecting…" ? "detecting…" : (device || "").toString().toLowerCase()

  return (
    <div className="relative h-dvh min-h-dvh w-full text-neutral-100 overflow-hidden flex flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <img src={bgUrl} alt="" className="h-full w-full object-cover" />
        {/* subtle dark overlay for contrast */}
        <div className="absolute inset-0 bg-black/40" />
      </div>
      {/* HEADER (auto height) */}
      <header className="border-b border-white/10 bg-black/30 backdrop-blur-md">
        <div className="mx-auto w-full max-w-5xl px-4">
          <div className="py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
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
              <span className="text-xs text-neutral-400">Device: {deviceLabel}</span>
            </div>
            <button
              className="h-9 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm border border-neutral-700 inline-flex items-center gap-2"
              onClick={onNewChat}
              title="Start a new chat"
            >
              <FiPlus />
              <span>New chat</span>
            </button>
          </div>
        </div>
      </header>

      {/* CHAT (flex-1 takes ~90% of screen; only this scrolls) */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-3xl h-full px-4 py-4">
          {!ready ? (
            <CenterNotice title="Select a model to start" subtitle="Use the top-left picker: Load → Use" />
          ) : messages.filter(m => m.role !== "system").length === 0 ? (
            <CenterNotice title="Say hello to your in-browser model 👋" subtitle="Type below to begin." />
          ) : (
            <>
              <div className="space-y-3">
                {messages
                  .filter(m => m.role !== "system")
                  .map((m, i, arr) => {
                    const isLast = i === arr.length - 1
                    const pending = isLast && m.role === "assistant" && streaming && m.content.length === 0
                    return (
                      <div key={i} className="select-text">
                        <ChatMessage role={m.role as "user" | "assistant"} content={m.content} pending={pending} />
                      </div>
                    )
                  })}
              </div>
              <div ref={bottomRef} />
            </>
          )}
        </div>
      </main>

      {/* FOOTER (auto height) */}
      <footer className="border-t border-white/10 bg-black/30 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4">
          <div className="py-2 flex items-center gap-2">
            <input
              ref={inputRef}
              className="h-9 flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 select-text"
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
            {!streaming ? (
              <button
                className="h-9 min-w-[108px] px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-400 inline-flex items-center justify-center gap-2 text-sm"
                onClick={onSend}
                disabled={!ready || !input.trim()}
                title="Send"
              >
                <FiSend />
                <span>Send</span>
              </button>
            ) : (
              <button
                className="h-9 min-w-[108px] px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 inline-flex items-center justify-center gap-2 text-sm"
                onClick={abort}
                title="Stop generation"
              >
                <FiSquare />
                <span>Stop</span>
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
