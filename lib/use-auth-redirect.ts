'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { dashboardPathForRole, fetchUserRole } from '@/lib/firebase-auth'

/** If a store owner is already signed in, send them to the owner dashboard. */
export function useRedirectLoggedInOwner() {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return
      const role = await fetchUserRole(user.uid)
      if (role === 'merchant') {
        router.replace(dashboardPathForRole(role))
      }
    })
    return unsubscribe
  }, [router])
}
