'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { dashboardPathForRole, fetchUserRole } from '@/lib/firebase-auth'

/** If a user is already signed in, send them to their role-specific dashboard so they don't see login again. */
export function useRedirectLoggedInOwner() {
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return
      const role = await fetchUserRole(user.uid)
      if (role === 'merchant') {
        router.replace(dashboardPathForRole(role))
      } else {
        router.replace('/')
      }
    })
    return unsubscribe
  }, [router])
}
