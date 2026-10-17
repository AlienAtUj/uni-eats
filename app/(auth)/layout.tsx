import React from 'react'
import { RedirectLoggedInOwner } from '@/components/uni-eats/redirect-logged-in-owner'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-[oklch(0.16_0.03_150)] md:min-h-dvh md:py-8 lg:py-12">
      <RedirectLoggedInOwner />
      {/* Phone frame simulator for consistency with the main app preview. */}
      <div className="relative flex h-full min-h-dvh w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl md:min-h-[860px] md:h-[860px] md:rounded-[2.75rem] md:ring-8 md:ring-[oklch(0.12_0.02_150)]">
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  )
}
