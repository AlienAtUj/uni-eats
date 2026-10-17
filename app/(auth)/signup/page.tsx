'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon } from '@/components/icons'
import { Store, User } from 'lucide-react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { dashboardPathForRole, saveUserProfile, type UserRole } from '@/lib/firebase-auth'
import { useRouter } from 'next/navigation'

export default function SignUpPage() {
  const router = useRouter()
  const [role, setRole] = useState<UserRole>('student')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg('')

    // 🔍 DEBUG: log the selected role before submission
    console.log('🔹 Selected role before submit:', role)

    try {
      // 1. Create standard Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)

      // 🔍 DEBUG: log role we are about to save
      console.log('🔹 User created, now saving profile with role:', role)

      // 2. Save role and profile details to Firestore `users` collection immediately
      await saveUserProfile(userCredential.user.uid, { name, email, role })

      // 🔍 DEBUG: log where we are redirecting
      console.log('🔹 Redirecting to:', dashboardPathForRole(role))

      router.replace(dashboardPathForRole(role))
    } catch (err: any) {
      console.error('🔹 Signup error:', err)   // <-- ADDED
      setErrorMsg(err.message || 'An error occurred during sign up.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background px-6 py-8">
      <header className="mb-8">
        <Link 
          href="/login" 
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Create account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Join UniEats and order food fast, or sell to students.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        
        {/* Role Selection */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          <button
            type="button"
            onClick={() => {
              console.log('Set role to student') // optional debug
              setRole('student')
            }}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors ${
              role === 'student' ? 'border-primary bg-primary/5 text-primary' : 'bg-card text-muted-foreground'
            }`}
          >
            <User className="h-6 w-6" />
            <span className="text-sm font-bold">Student</span>
          </button>
          
          <button
            type="button"
            onClick={() => {
              console.log('Set role to merchant') // optional debug
              setRole('merchant')
            }}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors ${
              role === 'merchant' ? 'border-primary bg-primary/5 text-primary' : 'bg-card text-muted-foreground'
            }`}
          >
            <Store className="h-6 w-6" />
            <span className="text-sm font-bold">Store Owner</span>
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {errorMsg}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">
            {role === 'student' ? 'Full Name' : 'Store Name'}
          </label>
          <input 
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
            placeholder={role === 'student' ? 'e.g. John Doe' : 'e.g. Campus Grill'}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">
            {role === 'student' ? 'Email Address' : 'Business Email'}
          </label>
          <input 
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
            placeholder={role === 'student' ? 'e.g. student@uj.ac.za' : 'contact@store.com'}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">Password</label>
          <input 
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm"
            placeholder="Create a strong password"
            required
            minLength={6}
          />
        </div>

        <button 
          type="submit"
          disabled={isLoading}
          className="mt-4 flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {isLoading ? 'Creating account...' : 'Sign up'}
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