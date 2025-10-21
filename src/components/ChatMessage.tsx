import { FiLoader } from "react-icons/fi"

export default function ChatMessage({
  role,
  content,
  pending = false,
}: {
  role: "user" | "assistant"
  content: string
  pending?: boolean
}) {
  const isUser = role === "user"
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 border select-text
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
      </div>
    </div>
  )
}
