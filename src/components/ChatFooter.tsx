import { forwardRef, useEffect, useRef } from "react"
import { FiSend, FiSquare } from "react-icons/fi"

type Props = {
  ready: boolean
  streaming: boolean
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
}

const ChatFooter = forwardRef<HTMLTextAreaElement, Props>(function ChatFooter(
  { ready, streaming, value, onChange, onSend, onStop },
  forwardedRef
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // sync ref
  useEffect(() => {
    if (!forwardedRef) return
    if (typeof forwardedRef === "function") forwardedRef(textareaRef.current!)
    else forwardedRef.current = textareaRef.current
  }, [forwardedRef])

  // autosize up to 6 lines
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    const lineHeight = 20
    const padding = 8 * 2
    const maxHeight = lineHeight * 6 + padding
    const newHeight = Math.min(ta.scrollHeight, maxHeight)
    ta.style.height = `${newHeight}px`
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [value])

  return (
    <footer className="border-t border-white/10 bg-black/30 backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-4">
        {/* critical: items-end ensures baseline alignment */}
        <div className="flex items-end gap-2 py-2">
          <div className="flex-1 flex items-end">
            <textarea
              ref={textareaRef}
              rows={1}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700
                         px-3 py-2 text-sm leading-[20px]
                         focus:outline-none focus:ring-2 focus:ring-indigo-500
                         disabled:opacity-60 resize-none min-h-[36px] max-h-[140px]
                         overflow-y-hidden"
              style={{ boxSizing: "border-box" }}
              placeholder={ready ? "Type your message…" : "Select a model: Load → Use"}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
              disabled={!ready}
            />
          </div>

          {!streaming ? (
            <button
              className="h-[36px] min-w-[100px] px-4 rounded-lg
                         bg-indigo-600 hover:bg-indigo-500 border border-neutral-700
                         text-sm inline-flex items-center justify-center gap-2
                         disabled:bg-neutral-700 disabled:text-neutral-400"
              onClick={onSend}
              disabled={!ready || !value.trim()}
              title="Send"
            >
              <FiSend className="w-4 h-4" />
              <span>Send</span>
            </button>
          ) : (
            <button
              className="h-[36px] min-w-[100px] px-4 rounded-lg
                         bg-neutral-800 hover:bg-neutral-700 border border-neutral-700
                         text-sm inline-flex items-center justify-center gap-2"
              onClick={onStop}
              title="Stop generation"
            >
              <FiSquare className="w-4 h-4" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </div>
    </footer>
  )
})

export default ChatFooter
