import { useCallback, useRef, useState } from "react"
import { env, pipeline, TextStreamer } from "@huggingface/transformers"
import type { DeviceKind } from "../lib/models"

// Chat-format message used by the HF chat API
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type GenOpts = {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (e: unknown) => void
}

export function useLLM() {
  const [ready, setReady] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [device, setDevice] = useState<DeviceKind | "detecting…">("detecting…")
  const [modelId, setModelId] = useState<string>("")

  // The returned pipeline function (callable) + tokenizer live here.
  const generatorRef = useRef<any>(null)
  const abortRef = useRef<AbortController | null>(null)

  // keep logs quiet if supported (harmless otherwise)
  try { (env.backends as any)?.onnx && ((env.backends as any).onnx.logLevel = "error") } catch {}
  env.allowLocalModels = false

  const detectDevice = (): DeviceKind =>
    typeof navigator !== "undefined" &&
    ("gpu" in navigator || "ml" in navigator || "webgpu" in navigator)
      ? "webgpu"
      : "wasm"

  /**
   * Lazily load a chat generator using the official chat API:
   * const generator = await pipeline('text-generation', '<repo>', { device: 'webgpu' })
   */
  const loadModel = useCallback(
    async (id: string, preferred?: DeviceKind) => {
      if (generatorRef.current) return
      setLoadingModel(true)
      try {
        const dev: DeviceKind = preferred ?? detectDevice()
        setDevice(dev)
        setModelId(id)

        const generator: any = await pipeline("text-generation", id, {
          device: dev, // <- exact syntax the user asked for
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

  const unloadModel = useCallback(() => {
    abortRef.current?.abort()
    generatorRef.current = null
    setReady(false)
    setModelId("")
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /**
   * Generate using the chat messages array directly (no manual prompt).
   * Streams progressively via TextStreamer (handles different build callback names).
   */
  const generate = useCallback(
    async (history: ChatMessage[], opts: GenOpts) => {
      const generator = generatorRef.current
      if (!generator) throw new Error("Model not ready")

      // Cancel any prior run
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      let sawAnyDelta = false

      // Progressive streamer wired to your UI
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
      // different builds expose different callback names
      streamer.onText = emit
      streamer.onTextGenerated = emit
      streamer.callback_function = emit

      try {
        // Best-practice defaults for small in-browser instruct models:
        const output = await generator(history, {
          max_new_tokens: 256,
          // Deterministic by default to reduce rambling on tiny models:
          do_sample: false,
          // If you want creativity, flip to: do_sample: true, temperature: 0.7, top_p: 0.9
          streamer,
          signal: controller.signal,
          // No manual stop strings: let the chat template handle roles.
        })

        // Fallback: if streaming never fired, append final assistant message
        if (!sawAnyDelta) {
          // `output[0].generated_text.at(-1).content` per HF example
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
    unloadModel,
    generate,
    abort,
  }
}
