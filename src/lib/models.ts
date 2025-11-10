// Central catalog of small, browser-friendly ONNX chat models (<~2 GB).
export type DeviceKind = "webgpu" | "wasm"

export type ModelSpec = {
  label: string
  id: string
  approxSize: string
  notes?: string
  preferredDevice?: DeviceKind
}

export const CATALOG: ModelSpec[] = [
  {
    label: "Llama 3.2 1B Instruct (q4f16)",
    id: "onnx-community/Llama-3.2-1B-Instruct-q4f16",
    approxSize: "≈1.2 GB",
    preferredDevice: "webgpu",
  },
  {
    label: "LFM2-700M",
    id: "onnx-community/LFM2-700M-ONNX",
    approxSize: "≈1.2 GB",
    preferredDevice: "webgpu",
  },
  {
    label: "TinySwallow 1.5B Instruct (q4f16)",
    id: "onnx-community/TinySwallow-1.5B-Instruct-ONNX",
    approxSize: "≈1.2 GB",
    preferredDevice: "webgpu",
  },
  {
    label: "Falcon 3 1B Instruct (q4f16)",
    id: "onnx-community/Falcon3-1B-Instruct",
    approxSize: "≈1.3 GB",
    preferredDevice: "webgpu",
  },
  {
    label: "Gemma 3 270M Instruct (q4f16)",
    id: "onnx-community/gemma-3-270m-it-ONNX",
    approxSize: "≈0.43 GB",
    preferredDevice: "webgpu",
  },
]

export function getModelById(id: string) {
  return CATALOG.find((m) => m.id === id)
}
