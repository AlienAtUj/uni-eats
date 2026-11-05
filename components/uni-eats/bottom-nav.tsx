'use client'

import { HomeIcon, SearchIcon, BagIcon, ReceiptIcon, UserIcon } from '@/components/icons'
import { useStore, type Screen } from './store'
import { cn } from '@/lib/utils'

const items: { key: string; label: string; screen: Screen; Icon: typeof HomeIcon }[] = [
  { key: 'home', label: 'Home', screen: 'home', Icon: HomeIcon },
  { key: 'cart', label: 'Cart', screen: 'cart', Icon: BagIcon },
  { key: 'orders', label: 'Orders', screen: 'tracking', Icon: ReceiptIcon },
  { key: 'profile', label: 'Account', screen: 'profile', Icon: UserIcon },
]

export function BottomNav() {
  const { screen, goToScreen, itemCount } = useStore()

  const activeKey =
    screen === 'cart' || screen === 'checkout'
      ? 'cart'
      : screen === 'tracking'
        ? 'orders'
        : screen === 'profile'
          ? 'profile'
          : 'home'

  return (
    <nav className="border-t border-border bg-card/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-6 pt-2">
        {items.map(({ key, label, screen: target, Icon }) => {
          const active = key === activeKey
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => goToScreen(target)}
                className={cn(
                  'relative flex w-full flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  {key === 'cart' && itemCount > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                      {itemCount}
                    </span>
                  )}
                </span>
                {key === 'cart' && itemCount > 0 ? `Cart (${itemCount})` : label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
