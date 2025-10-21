import React from "react"

export default function ModelBadge({
  modelId,
  device,
  loading,
}: {
  modelId: string
  device: string
  loading: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-xs rounded-lg bg-neutral-800 border border-neutral-700 px-2 py-1">
      <span className="font-mono">{loading ? "Loading…" : modelId}</span>
      <span className="opacity-60">|</span>
      <span>{device}</span>
    </div>
  )
}
