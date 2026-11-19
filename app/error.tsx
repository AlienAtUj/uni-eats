'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Next.js App Router error boundary:', error)
  }, [error])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#F4F4F5] px-6 text-center font-sans text-[#09090B]">
      <div className="w-full max-w-sm rounded-md border border-zinc-200 bg-white p-6">
        <p className="text-[11px] font-black uppercase tracking-widest text-[#DC2626]">
          APPLICATION ERROR
        </p>
        <h2 className="mt-1 text-lg font-black text-[#09090B]">
          Unable to load this view
        </h2>
        <p className="mt-2 text-xs text-[#71717A]">
          {error?.message || 'An unexpected error interrupted loading.'}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full rounded-sm bg-[#287d46] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-[#216639]"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload()
            }}
            className="w-full rounded-sm border border-zinc-200 bg-[#F4F4F5] px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-[#09090B] hover:bg-zinc-200"
          >
            Reload App
          </button>
        </div>
      </div>
    </div>
  )
}
