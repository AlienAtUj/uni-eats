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
    <nav className="border-t border-[#e8e8e8] bg-white">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-6 pt-2">
        {items.map(({ key, label, screen: target, Icon }) => {
          const active = key === activeKey
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => goToScreen(target)}
                className={cn(
                  'relative flex w-full flex-col items-center gap-1 rounded-xl py-2 text-xs transition-colors',
                  active ? 'font-bold text-[#287d46]' : 'font-semibold text-[#545454]',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span className="relative">
                  <Icon className="h-[26px] w-[26px]" />
                  {key === 'cart' && itemCount > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#e07a2e] px-1 text-[10px] font-bold text-white">
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
