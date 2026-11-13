'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { StoreProvider, useStore } from './store'
import { HomeScreen } from './home-screen'
import { RestaurantScreen } from './restaurant-screen'
import { ShopCategoryScreen } from './shop-category-screen'
import { CartScreen } from './cart-screen'
import { CheckoutScreen } from './checkout-screen'
import { TrackingScreen } from './tracking-screen'
import { ProfileScreen } from './profile-screen'
import { BottomNav } from './bottom-nav'
import { dashboardPathForRole } from '@/lib/firebase-auth'

function AuthSessionGate() {
  const router = useRouter()
  const { user, userRole, isAuthLoading } = useStore()

  useEffect(() => {
    if (isAuthLoading) return

    // 1. Mandatory Session Protection: Users cannot browse without an active authenticated session
    if (!user) {
      router.replace('/login')
      return
    }

    // 2. Role-based isolation: Merchants are sent directly to their management console
    if (userRole === 'merchant') {
      router.replace(dashboardPathForRole(userRole))
    }
  }, [isAuthLoading, user, userRole, router])

  return null
}

function BrandedAuthSplash() {
  return (
    <div className="flex h-full min-h-[70vh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[oklch(0.22_0.04_150)] shadow-md ring-1 ring-border/50">
        <Image
          src="/dash-logo.jpg"
          alt="Dash"
          width={64}
          height={64}
          className="h-full w-full object-cover"
          priority
        />
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#287d46] border-t-transparent" />
        <span>Securing your session...</span>
      </div>
    </div>
  )
}

function Screens() {
  const { screen, user, userRole, isAuthLoading } = useStore()

  if (isAuthLoading || !user || userRole === 'merchant') {
    return <BrandedAuthSplash />
  }

  switch (screen) {
    case 'restaurant':
      return <RestaurantScreen />
    case 'shop-category':
      return <ShopCategoryScreen />
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
      <AuthSessionGate />
      <CustomerShell />
    </StoreProvider>
  )
}

function CustomerShell() {
  const { user, userRole, isAuthLoading } = useStore()
  const hideNav = isAuthLoading || !user || userRole === 'merchant'

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
