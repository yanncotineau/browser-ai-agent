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
 * NOTE: We support:
 * - Switching models (replace current generator even if one is loaded).
 * - Per-file download progress aggregation (emits to onProgress).
 */
export function useLLM() {
  const [ready, setReady] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [device, setDevice] = useState<DeviceKind | "detecting…">("detecting…")
  const [modelId, setModelId] = useState<string>("")

  const generatorRef = useRef<any>(null)
  const abortRef = useRef<AbortController | null>(null)

  // keep logs quiet if supported
  try { (env.backends as any)?.onnx && ((env.backends as any).onnx.logLevel = "error") } catch {}
  env.allowLocalModels = false

  const detectDevice = (): DeviceKind =>
    typeof navigator !== "undefined" &&
    ("gpu" in navigator || "ml" in navigator || "webgpu" in navigator)
      ? "webgpu"
      : "wasm"

  /**
   * Load or switch to a model.
   * - Always replaces the current model if one exists.
   * - Reports aggregated download progress via onProgress (if provided).
   */
  const loadModel = useCallback(
    async (
      id: string,
      preferred?: DeviceKind,
      onProgress?: (p: LoadProgress) => void
    ) => {
      // If a model is already loaded or a gen is running, abort then replace.
      abortRef.current?.abort()
      generatorRef.current = null
      setReady(false)

      setLoadingModel(true)
      try {
        const dev: DeviceKind = preferred ?? detectDevice()
        setDevice(dev)
        setModelId(id)

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
          const percent =
            totalBytes > 0 ? Math.max(0, Math.min(100, (loadedBytes / totalBytes) * 100)) : 0
          onProgress({
            modelId: id,
            loadedBytes,
            totalBytes,
            percent,
          })
        }

        // Some builds emit different progress payload shapes; handle flexibly.
        const progress_callback = (info: any) => {
          // Expected shapes:
          // { file, progress, loaded, total } or { url, loaded, total }
          const key: string =
            info?.file || info?.url || info?.name || "unknown-" + fileProgress.size
          const loaded = Number(info?.loaded ?? 0)
          const total = Number(info?.total ?? 0)
          fileProgress.set(key, { loaded, total })
          report()
        }

        const generator: any = await pipeline("text-generation", id, {
          device: dev,
          progress_callback,
        })

        generatorRef.current = generator
        setReady(true)
      } catch (e) {
        setReady(false)
        throw e
      } finally {
        setLoadingModel(false)
      }
    },
    []
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const generate = useCallback(
    async (history: ChatMessage[], opts: GenOpts) => {
      const generator = generatorRef.current
      if (!generator) throw new Error("Model not ready")

      // Cancel any prior run
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
        if (!t) return
        sawAnyDelta = true
        opts.onDelta(t)
      }
      streamer.onText = emit
      streamer.onTextGenerated = emit
      streamer.callback_function = emit

      try {
        const output = await generator(history, {
          max_new_tokens: 256,
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
    loadingModel,
    modelId,
    device,
    // controls
    loadModel,
    generate,
    abort,
  }
}
