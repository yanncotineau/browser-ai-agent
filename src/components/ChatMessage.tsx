import React from "react"

export default function ChatMessage({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user"
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 border
          ${isUser
            ? "bg-indigo-600 text-white border-indigo-500"
            : "bg-neutral-800 text-neutral-100 border-neutral-700"
          }`}
      >
        {content}
      </div>
    </div>
  )
}
