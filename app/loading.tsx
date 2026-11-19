export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#F4F4F5] px-6 font-sans text-[#09090B]">
      <span className="inline-block h-7 w-7 animate-spin rounded-full border-3 border-[#287d46] border-t-transparent" />
      <p className="text-xs font-bold uppercase tracking-widest text-[#71717A]">
        Loading Dash...
      </p>
    </div>
  )
}
