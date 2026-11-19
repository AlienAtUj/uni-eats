'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  fullScreenOnMobile = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  fullScreenOnMobile?: boolean
}) {
  const [viewportStyle, setViewportStyle] = useState<{ height: number; top: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const syncViewport = () => {
      if (!vv) return
      setViewportStyle({ height: vv.height, top: vv.offsetTop })
    }
    syncViewport()
    vv?.addEventListener('resize', syncViewport)
    vv?.addEventListener('scroll', syncViewport)

    return () => {
      window.removeEventListener('keydown', onKey)
      vv?.removeEventListener('resize', syncViewport)
      vv?.removeEventListener('scroll', syncViewport)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={
        fullScreenOnMobile
          ? 'fixed inset-x-0 top-0 z-50 flex flex-col justify-start sm:absolute sm:inset-0 sm:justify-end'
          : 'fixed inset-x-0 top-0 z-50 flex flex-col justify-end sm:absolute sm:inset-0'
      }
      style={
        viewportStyle
          ? { height: `${viewportStyle.height}px`, top: `${viewportStyle.top}px` }
          : { height: '100dvh' }
      }
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 animate-in fade-in"
      />
      <div
        className={
          fullScreenOnMobile
            ? 'relative flex h-full max-h-full flex-col bg-card shadow-2xl animate-in slide-in-from-bottom duration-200 sm:h-auto sm:max-h-[85%] sm:rounded-t-3xl'
            : 'relative flex max-h-[88%] flex-col rounded-t-3xl bg-card shadow-2xl animate-in slide-in-from-bottom duration-300'
        }
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
          <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-border p-4">{footer}</div>}
      </div>
    </div>
  )
}
