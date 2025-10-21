import React, { useEffect, useRef, useState } from "react"
import type { ModelSpec } from "../lib/models"

type Props = {
  models: ModelSpec[]
  currentModelId: string
  ready: boolean
  // loading state is now per-model:
  loadingMap: Record<string, boolean>
  progressPercent: Record<string, number>
  progressLabel: Record<string, string>
  // helpers to know what’s already cached:
  isCached: (id: string) => boolean
  onLoad: (id: string) => Promise<void>   // preload only
  onUse: (id: string) => Promise<void>    // switch to cached model
}

export default function ModelPicker({
  models,
  currentModelId,
  ready,
  loadingMap,
  progressPercent,
  progressLabel,
  isCached,
  onLoad,
  onUse,
}: Props) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return
      const t = e.target as Node
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  const currentLabel =
    models.find(m => m.id === currentModelId)?.label ?? "No model selected"

  return (
    <div className="relative select-none">
      <button
        ref={buttonRef}
        className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 px-3 py-2 text-sm"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ready ? currentLabel : "Select a model"}
      >
        <span className="truncate max-w-[240px]">{currentLabel}</span>
        <svg className={`w-4 h-4 ${open ? "rotate-180" : ""} transition-transform opacity-70`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"/>
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 mt-2 w-[480px] max-w-[95vw] rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl overflow-hidden"
          role="menu"
        >
          <div className="max-h-[70vh] overflow-auto">
            {models.map(m => {
              const isCurrent = ready && m.id === currentModelId
              const isLoading = !!loadingMap[m.id]
              const cached = isCached(m.id)
              const pct = Math.max(0, Math.min(100, progressPercent[m.id] ?? 0))
              const label = progressLabel[m.id]

              return (
                <div key={m.id} className="flex items-start gap-3 justify-between p-3 hover:bg-neutral-800/60 select-none">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.label}</div>
                    <div className="text-xs text-neutral-400">
                      <span className="opacity-70">HF:</span> <code className="opacity-90">{m.id}</code>
                    </div>
                    <div className="text-xs text-neutral-400">
                      <span className="opacity-70">Size:</span> {m.approxSize}
                    </div>
                    {m.notes && (
                      <div className="text-xs text-neutral-500 mt-0.5">{m.notes}</div>
                    )}

                    {isLoading && (
                      <div className="mt-2">
                        <div className="h-2 rounded bg-neutral-800 overflow-hidden border border-neutral-700">
                          <div
                            className="h-full bg-indigo-600 transition-[width] duration-200"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-1">
                          {label ?? "Preparing download…"}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-neutral-600 bg-neutral-800">
                        In use
                      </span>
                    ) : cached ? (
                      <button
                        className="text-xs px-3 py-1.5 rounded-md bg-neutral-700 hover:bg-neutral-600"
                        onClick={async () => {
                          await onUse(m.id)
                          setOpen(false)
                        }}
                      >
                        Use
                      </button>
                    ) : (
                      <button
                        className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:text-neutral-400"
                        onClick={async () => {
                          if (isLoading) return
                          await onLoad(m.id) // preload only
                        }}
                        disabled={isLoading}
                      >
                        {isLoading ? "Loading…" : "Load"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
