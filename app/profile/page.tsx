'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { fetchUserRole, type UserRole } from '@/lib/firebase-auth'
import { UserProfileView } from '@/components/uni-eats/profile-screen'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace('/login')
        return
      }

      setUser(currentUser)
      setRole(await fetchUserRole(currentUser.uid))
      setIsLoading(false)
    })

    return unsubscribe
  }, [router])

  const handleSignOut = async () => {
    await signOut(auth)
    router.replace('/login')
  }

  const handleGoHome = () => {
    router.push(role === 'merchant' ? '/store-owner' : '/')
  }

  return (
    <div className="flex min-h-dvh justify-center bg-[oklch(0.16_0.03_150)] md:min-h-dvh md:py-8 lg:py-12">
      <div className="relative flex h-full min-h-dvh w-full max-w-md flex-col overflow-hidden bg-background shadow-2xl md:h-[860px] md:min-h-[860px] md:rounded-[2.75rem] md:ring-8 md:ring-[oklch(0.12_0.02_150)]">
        <main className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading || !user ? (
            <div className="flex h-full min-h-[50vh] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <UserProfileView
              user={user}
              userRole={role}
              onSignOut={handleSignOut}
              onGoHome={handleGoHome}
              onOrders={() => router.push('/')}
            />
          )}
        </main>
      </div>
    </div>
  )
}
