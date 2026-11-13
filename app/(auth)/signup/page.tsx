'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon } from '@/components/icons'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { saveUserProfile } from '@/lib/firebase-auth'
import { useRouter } from 'next/navigation'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg('')

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.')
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify your password.')
      setIsLoading(false)
      return
    }

    try {
      // 1. Create account in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const user = userCredential.user

      // 2. Set display name
      await updateProfile(user, { displayName: name.trim() }).catch(() => {})

      // 3. Save comprehensive customer profile in Firestore
      await saveUserProfile(user.uid, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        role: 'customer',
      })

      // 4. Redirect to main app
      router.replace('/')
    } catch (err: any) {
      console.error('Sign up error:', err)
      let msg = err.message || 'An error occurred during sign up.'
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please sign in.'
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.'
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.'
      }
      setErrorMsg(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background px-6 py-8">
      <header className="mb-6">
        <Link 
          href="/login" 
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-foreground transition-colors hover:bg-muted"
          aria-label="Back to login"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Create account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Join Dash to order meals & groceries delivered near you.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {errorMsg && (
          <div className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">Full Name</label>
          <input 
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="e.g. Sandile Nkosi"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">Email Address</label>
          <input 
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="sandile@example.com"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">
            Mobile Phone Number
          </label>
          <input 
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="e.g. 082 123 4567"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">Password</label>
          <input 
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="At least 6 characters"
            required
            minLength={6}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">Confirm Password</label>
          <input 
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="Re-enter your password"
            required
            minLength={6}
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs font-semibold text-destructive">Passwords do not match.</p>
          )}
        </div>

        <button 
          type="submit"
          disabled={isLoading}
          className="mt-3 flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="mt-auto pt-8 text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
