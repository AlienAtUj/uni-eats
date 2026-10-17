'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { StoreProvider, useStore } from './store'
import { HomeScreen } from './home-screen'
import { RestaurantScreen } from './restaurant-screen'
import { CartScreen } from './cart-screen'
import { CheckoutScreen } from './checkout-screen'
import { TrackingScreen } from './tracking-screen'
import { ProfileScreen } from './profile-screen'
import { BottomNav } from './bottom-nav'
import { dashboardPathForRole } from '@/lib/firebase-auth'

function MerchantRedirect() {
  const router = useRouter()
  const { userRole, isAuthLoading } = useStore()

  useEffect(() => {
    if (!isAuthLoading && userRole === 'merchant') {
      router.replace(dashboardPathForRole(userRole))
    }
  }, [isAuthLoading, userRole, router])

  return null
}

function Screens() {
  const { screen, userRole, isAuthLoading } = useStore()

  if (isAuthLoading || userRole === 'merchant') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }
  switch (screen) {
    case 'restaurant':
      return <RestaurantScreen />
    case 'cart':
      return <CartScreen />
    case 'checkout':
      return <CheckoutScreen />
    case 'tracking':
      return <TrackingScreen />
    case 'profile':
      return <ProfileScreen />
    default:
      return <HomeScreen />
  }
}

export function UniEatsApp() {
  return (
    <StoreProvider>
      <MerchantRedirect />
      <StudentShell />
    </StoreProvider>
  )
}

function StudentShell() {
  const { userRole, isAuthLoading } = useStore()
  const hideNav = isAuthLoading || userRole === 'merchant'

  return (
    <div className="flex h-dvh justify-center bg-[oklch(0.16_0.03_150)] md:h-auto md:min-h-dvh md:py-8">
      {/* Phone frame */}
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl md:h-[860px] md:rounded-[2.75rem] md:ring-8 md:ring-[oklch(0.12_0.02_150)]">
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Screens />
        </main>
        {!hideNav && <BottomNav />}
      </div>
    </div>
  )
}
