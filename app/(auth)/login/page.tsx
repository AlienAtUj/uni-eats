'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeftIcon } from '@/components/icons'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { dashboardPathForRole, fetchUserRole } from '@/lib/firebase-auth'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg('')
    
    try {
      // 1. Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      
      // 2. Read role to navigate correctly
      const role = await fetchUserRole(userCredential.user.uid)
      router.replace(dashboardPathForRole(role))
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid email or password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background px-6 py-8">
      <div className="mb-8 mt-2 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.5rem] bg-[oklch(0.22_0.04_150)] shadow-sm ring-1 ring-border/50">
          <Image 
            src="/dash-logo.jpg" 
            alt="Dash" 
            width={80} 
            height={80} 
            className="h-full w-full object-cover" 
          />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Welcome to Dash</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to browse stores, meals & order delivery.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        
        {errorMsg && (
          <div className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">Email Address</label>
          <input 
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="sandilenkosi@email.com"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-foreground">Password</label>
            <button type="button" className="text-xs font-bold text-primary hover:underline">
              Forgot password?
            </button>
          </div>
          <input 
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="••••••••"
            required
          />
        </div>

        <button 
          type="submit"
          disabled={isLoading}
          className="mt-4 flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {isLoading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="mt-auto pt-10 text-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-bold text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}