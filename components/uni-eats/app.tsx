'use client'

import { StoreProvider, useStore } from './store'
import { HomeScreen } from './home-screen'
import { RestaurantScreen } from './restaurant-screen'
import { CartScreen } from './cart-screen'
import { CheckoutScreen } from './checkout-screen'
import { TrackingScreen } from './tracking-screen'
import { BottomNav } from './bottom-nav'

function Screens() {
  const { screen } = useStore()
  switch (screen) {
    case 'restaurant':
      return <RestaurantScreen />
    case 'cart':
      return <CartScreen />
    case 'checkout':
      return <CheckoutScreen />
    case 'tracking':
      return <TrackingScreen />
    default:
      return <HomeScreen />
  }
}

export function UniEatsApp() {
  return (
    <StoreProvider>
      <div className="flex h-dvh justify-center bg-[oklch(0.16_0.03_150)] md:h-auto md:min-h-dvh md:py-8">
        {/* Phone frame */}
        <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl md:h-[860px] md:rounded-[2.75rem] md:ring-8 md:ring-[oklch(0.12_0.02_150)]">
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <Screens />
          </main>
          <BottomNav />
        </div>
      </div>
    </StoreProvider>
  )
}
