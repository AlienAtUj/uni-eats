'use client'

import { useEffect, type ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 animate-in fade-in"
      />
      <div className="relative flex max-h-[85%] flex-col rounded-t-3xl bg-card shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-border" />
          <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
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
