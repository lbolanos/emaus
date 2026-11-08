import { ref } from 'vue'

export interface ResizableSplitOptions {
  /** localStorage key; the size is remembered per browser. */
  storageKey: string
  defaultSize: number
  min: number
  max: number
  /** Pixels per arrow key press. */
  step?: number
}

/**
 * Size in pixels of the first pane of a draggable split (WhatsApp inbox v1.4,
 * D24). Pointer drag on the handle, arrow keys (±step), Home/End for the
 * limits and double-click to restore the default. The value is kept in
 * localStorage; a storage that throws (private mode) falls back to the
 * default without breaking the view.
 */
export function useResizableSplit(options: ResizableSplitOptions) {
  const step = options.step ?? 20
  const clamp = (value: number) => Math.min(options.max, Math.max(options.min, Math.round(value)))

  function read(): number {
    try {
      const raw = localStorage.getItem(options.storageKey)
      const value = raw === null ? Number.NaN : Number(raw)
      return Number.isFinite(value) ? clamp(value) : options.defaultSize
    } catch {
      return options.defaultSize
    }
  }

  function persist(): void {
    try {
      localStorage.setItem(options.storageKey, String(size.value))
    } catch {
      // The size simply is not remembered.
    }
  }

  const size = ref(read())
  const dragging = ref(false)
  let startX = 0
  let startSize = 0

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    dragging.value = true
    startX = event.clientX
    startSize = size.value
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging.value) return
    size.value = clamp(startSize + event.clientX - startX)
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging.value) return
    dragging.value = false
    ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
    persist()
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') size.value = clamp(size.value - step)
    else if (event.key === 'ArrowRight') size.value = clamp(size.value + step)
    else if (event.key === 'Home') size.value = options.min
    else if (event.key === 'End') size.value = options.max
    else return
    event.preventDefault()
    persist()
  }

  function reset(): void {
    size.value = options.defaultSize
    persist()
  }

  return { size, dragging, onPointerDown, onPointerMove, onPointerUp, onKeydown, reset }
}
