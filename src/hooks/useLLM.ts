import { useCallback, useRef, useState } from "react"
import { env, pipeline, TextStreamer } from "@huggingface/transformers"
import type { DeviceKind } from "../lib/models"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type GenOpts = {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (e: unknown) => void
}

export type LoadProgress = {
  modelId: string
  loadedBytes: number
  totalBytes: number
  percent: number // 0..100
}

/**
 * New capabilities:
 * - preloadModel(id): downloads & instantiates a generator, cached by id (can run concurrently).
 * - useModel(id): switch to an already preloaded model instantly (no re-download).
 * - generate(history): uses the *currently selected* generator.
 */
export function useLLM() {
  const [ready, setReady] = useState(false)
  const [modelId, setModelId] = useState<string>("")
  const [device, setDevice] = useState<DeviceKind | "detecting…">("detecting…")

  // Cache of loaded generators (id -> generator)
  const cacheRef = useRef<Map<string, any>>(new Map())
  // Currently active generator
  const activeRef = useRef<any>(null)
  // Track any running generation
  const abortRef = useRef<AbortController | null>(null)

  // quiet logs if supported
  try { (env.backends as any)?.onnx && ((env.backends as any).onnx.logLevel = "error") } catch {}
  env.allowLocalModels = false

  const detectDevice = (): DeviceKind =>
    typeof navigator !== "undefined" &&
    ("gpu" in navigator || "ml" in navigator || "webgpu" in navigator)
      ? "webgpu"
      : "wasm"

  /**
   * Preload (download + instantiate) a model into the cache.
   * - Does NOT affect the current active model.
   * - Can be called for multiple ids simultaneously.
   * - Emits aggregated progress via onProgress.
   */
  const preloadModel = useCallback(
    async (
      id: string,
      preferred?: DeviceKind,
      onProgress?: (p: LoadProgress) => void
    ) => {
      if (cacheRef.current.has(id)) return // already cached

      const dev: DeviceKind = preferred ?? detectDevice()
      if (device === "detecting…") setDevice(dev) // first time detection

      // Aggregate per-file progress
      const fileProgress = new Map<string, { loaded: number; total: number }>()
      const report = () => {
        if (!onProgress) return
        let loadedBytes = 0
        let totalBytes = 0
        for (const { loaded, total } of fileProgress.values()) {
          loadedBytes += loaded || 0
          totalBytes += total || 0
        }
        const percent = totalBytes > 0 ? Math.max(0, Math.min(100, (loadedBytes / totalBytes) * 100)) : 0
        onProgress({ modelId: id, loadedBytes, totalBytes, percent })
      }
      const progress_callback = (info: any) => {
        const key: string = info?.file || info?.url || info?.name || `part-${fileProgress.size}`
        const loaded = Number(info?.loaded ?? 0)
        const total = Number(info?.total ?? 0)
        fileProgress.set(key, { loaded, total })
        report()
      }

      const generator: any = await pipeline("text-generation", id, {
        device: dev,
        progress_callback,
      })

      cacheRef.current.set(id, generator)
    },
    [device]
  )

  /**
   * Switch to an already preloaded model.
   * Aborts any running generation, flips `ready` true.
   */
  const useModel = useCallback(async (id: string) => {
    const generator = cacheRef.current.get(id)
    if (!generator) throw new Error("Model not preloaded")
    // Stop any running gen
    abortRef.current?.abort()
    activeRef.current = generator
    setModelId(id)
    setReady(true)
  }, [])

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const generate = useCallback(
    async (history: ChatMessage[], opts: GenOpts) => {
      const generator = activeRef.current
      if (!generator) throw new Error("No model in use")

      // Cancel old gen if any
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      let sawAnyDelta = false

      const tokenizer = generator.tokenizer ?? (generator as any).tokenizer
      const streamer: any = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
      })
      const emit = (t: string) => {
        // if we aborted, ignore late chunks coming from the streamer
        if (controller.signal.aborted) return
        if (!t) return
        sawAnyDelta = true
        opts.onDelta(t)
      }
      streamer.onText = emit
      streamer.onTextGenerated = emit
      streamer.callback_function = emit

      try {
        const output = await generator(history, {
          max_new_tokens: 1024,
          do_sample: false,
          streamer,
          signal: controller.signal,
        })

        if (!sawAnyDelta) {
          const last = Array.isArray(output)
            ? output[0]?.generated_text?.at(-1)?.content
            : undefined
          if (typeof last === "string" && last.length) {
            opts.onDelta(last)
          }
        }

        if (!controller.signal.aborted) opts.onDone()
      } catch (e: any) {
        if (e?.name === "AbortError") return
        opts.onError(e)
      }
    },
    []
  )

  return {
    // state
    ready,
    modelId,
    device,
    // cache info helpers
    hasCached: (id: string) => cacheRef.current.has(id),
    cachedIds: () => Array.from(cacheRef.current.keys()),
    // controls
    preloadModel,
    useModel,
    generate,
    abort,
  }
}
