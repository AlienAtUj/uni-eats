'use client'

import { useRedirectLoggedInOwner } from '@/lib/use-auth-redirect'

export function RedirectLoggedInOwner() {
  useRedirectLoggedInOwner()
  return null
}
