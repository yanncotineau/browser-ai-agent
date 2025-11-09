import { FiLoader, FiCopy, FiCheck } from "react-icons/fi"
import { useState } from "react"

export default function ChatMessage({
  role,
  content,
  pending = false,
  canCopy = false,
}: {
  role: "user" | "assistant"
  content: string
  pending?: boolean
  canCopy?: boolean
}) {
  const isUser = role === "user"
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 mb-2 border select-text
          ${isUser
            ? "bg-indigo-600 text-white border-indigo-500"
            : "bg-neutral-800 text-neutral-100 border-neutral-700"
          }`}
      >
        {pending ? (
          <div className="flex items-center gap-2 text-neutral-300">
            <FiLoader className="animate-spin" />
            <span className="text-sm opacity-80">Thinking…</span>
          </div>
        ) : (
          content
        )}

        {canCopy && !pending && (
          <button
            onClick={handleCopy}
            className="absolute -bottom-7 right-0 text-xs bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700 rounded-md px-2 py-1 inline-flex items-center gap-1"
          >
            {copied ? <FiCheck className="text-green-400" /> : <FiCopy />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        )}
      </div>
    </div>
  )
}
