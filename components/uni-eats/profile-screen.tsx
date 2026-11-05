'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  UserIcon,
  ReceiptIcon,
  StoreIcon,
  BagIcon,
  LogOutIcon,
} from '@/components/icons'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { dashboardPathForRole, fetchUserRole, saveUserProfile, type UserRole, type UserProfileInput } from '@/lib/firebase-auth'
import { type StoreType } from '@/lib/data'
import { geocodeStoreAddress, SERVICE_DELIVERY_RADIUS_KM } from '@/lib/location'
import { useStore } from './store'

export function ProfileScreen() {
  const { user, userRole, isAuthLoading, signOut, goHome, goToScreen } = useStore()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  
  if (isAuthLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (user) {
    return <UserProfileView user={user} userRole={userRole} onSignOut={signOut} onGoHome={goHome} onOrders={() => goToScreen('tracking')} />
  }

  return (
    <div className="flex min-h-full flex-col bg-background px-6 py-8">
      <header className="mb-8">
        <button 
          onClick={goHome}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
      </header>
      
      {mode === 'login' ? (
        <AuthLoginForm onSwitch={() => setMode('signup')} />
      ) : (
        <AuthSignupForm onSwitch={() => setMode('login')} />
      )}
    </div>
  )
}

function AuthLoginForm({ onSwitch }: { onSwitch: () => void }) {
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
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const role = await fetchUserRole(userCredential.user.uid)
      if (role === 'merchant') {
        router.replace(dashboardPathForRole(role))
        return
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid email or password.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="mb-10 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.5rem] bg-[oklch(0.22_0.04_150)] shadow-sm ring-1 ring-border/50">
          <Image 
            src="/dash-logo.jpg" 
            alt="Dash" 
            width={80} 
            height={80} 
            className="h-full w-full object-cover" 
          />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to your Dash account to continue.</p>
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
      <div className="mb-8 mt-auto pt-10 text-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <button onClick={onSwitch} className="font-bold text-primary hover:underline">
            Sign up
          </button>
        </p>
      </div>
    </>
  )
}

function AuthSignupForm({ onSwitch }: { onSwitch: () => void }) {
  const router = useRouter()
  const { reloadUserRole } = useStore()
  const [role, setRole] = useState<UserRole>('student')
  
  // Custom fields based on role
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [studentId, setStudentId] = useState('')
  
  const [storeName, setStoreName] = useState('')
  const [storeType, setStoreType] = useState<StoreType>('restaurant')
  const [storeLocation, setStoreLocation] = useState('')
  
  // Shared fields
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  
  // Passwords
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMsg('')
    
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please try again.')
      setIsLoading(false)
      return
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const uid = userCredential.user.uid

      if (role === 'student') {
        await saveUserProfile(uid, {
          email,
          role,
          phone,
          name: `${firstName} ${lastName}`.trim(),
          firstName,
          lastName,
          studentId,
        })
      } else {
        const cleanStoreName = storeName.trim()
        const cleanLoc = storeLocation.trim() || 'Johannesburg'
        const resolvedCoords = await geocodeStoreAddress(cleanLoc)

        const merchantProfile: UserProfileInput = {
          email,
          role,
          phone,
          name: cleanStoreName,
          storeName: cleanStoreName,
          storeType,
          storeLocation: cleanLoc,
          deliveryRadiusKm: SERVICE_DELIVERY_RADIUS_KM,
        }
        if (resolvedCoords) {
          merchantProfile.coords = resolvedCoords
        }

        await saveUserProfile(uid, merchantProfile)

        const restDocPayload: Record<string, any> = {
          id: uid,
          name: cleanStoreName,
          cuisine: storeType === 'grocery' ? 'Groceries & Essentials' : 'Meals & Takeaways',
          image: storeType === 'grocery' ? '/food/spaza-store.jpg' : '/food/featured-burger.jpg',
          rating: 5.0,
          reviews: 1,
          pickupTime: storeType === 'grocery' ? '20-30 min' : '15-25 min',
          priceLevel: 'R 45.00',
          location: cleanLoc,
          open: true,
          storeType,
          deliveryRadiusKm: SERVICE_DELIVERY_RADIUS_KM,
          menu: [],
        }
        if (resolvedCoords) {
          restDocPayload.coords = resolvedCoords
        }

        try {
          await setDoc(doc(db, 'restaurants', uid), restDocPayload, { merge: true })
        } catch (restErr) {
          console.warn('Could not initialize restaurant doc on signup:', restErr)
        }
      }

      await reloadUserRole()
      if (role === 'merchant') {
        router.replace(dashboardPathForRole(role))
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during sign up.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Create account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Join Dash to order meals & groceries near you, or sell to customers.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 mb-2">
          <button
            type="button"
            onClick={() => setRole('student')}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors ${
              role === 'student' ? 'border-primary bg-primary/5 text-primary' : 'bg-card text-muted-foreground'
            }`}
          >
            <UserIcon className="h-6 w-6" />
            <span className="text-sm font-bold">Student</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('merchant')}
            className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-colors ${
              role === 'merchant' ? 'border-primary bg-primary/5 text-primary' : 'bg-card text-muted-foreground'
            }`}
          >
            <StoreIcon className="h-6 w-6" />
            <span className="text-sm font-bold">Store Owner</span>
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            {errorMsg}
          </div>
        )}

        {role === 'student' ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-foreground">First Name</label>
                <input 
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
                  placeholder="Sandile"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-foreground">Last Name</label>
                <input 
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
                  placeholder="Nkosi"
                  required
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-foreground">ID / Account Number (Optional)</label>
              <input 
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
                placeholder="Optional ID number"
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-foreground">Business Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStoreType('restaurant')}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-colors ${
                    storeType === 'restaurant'
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                      : 'bg-card text-muted-foreground'
                  }`}
                >
                  <StoreIcon className="h-5 w-5" />
                  <span className="text-xs font-extrabold text-foreground">Restaurant Owner</span>
                  <span className="text-[11px] text-muted-foreground">Meals, Burgers & Kotas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStoreType('grocery')}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-colors ${
                    storeType === 'grocery'
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                      : 'bg-card text-muted-foreground'
                  }`}
                >
                  <BagIcon className="h-5 w-5" />
                  <span className="text-xs font-extrabold text-foreground">Shop / Grocery Owner</span>
                  <span className="text-[11px] text-muted-foreground">Groceries, Spaza & Butcher</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-foreground">
                {storeType === 'grocery' ? 'Shop / Supermarket Name' : 'Restaurant Name'}
              </label>
              <input 
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
                placeholder={storeType === 'grocery' ? 'e.g. Doornfontein Spaza & Fresh Mart' : 'e.g. SML Restaurant & Grill'}
                required
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-foreground">Store Street Address & Suburb</label>
              <input
                type="text"
                value={storeLocation}
                onChange={(e) => setStoreLocation(e.target.value)}
                className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
                placeholder="e.g. 37 Beit Street, Doornfontein, Johannesburg"
                required
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">Phone Number</label>
          <input 
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="082 123 4567"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-foreground">Email Address</label>
          <input 
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
            placeholder="sandilenkosi@email.com"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-foreground">Password</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-foreground">Confirm</label>
            <input 
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl border bg-card px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary shadow-sm placeholder:text-muted-foreground"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
        </div>
        
        <button 
          type="submit"
          disabled={isLoading}
          className="mt-4 flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70"
        >
          {isLoading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
      <div className="mb-8 mt-auto pt-8 text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <button onClick={onSwitch} className="font-bold text-primary hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </>
  )
}

export function UserProfileView({ user, userRole, onSignOut, onGoHome, onOrders }: { user: any, userRole: UserRole | null, onSignOut: () => void, onGoHome: () => void, onOrders: () => void }) {
  const router = useRouter()
  const isMerchant = userRole === 'merchant'
  const initials = user.email ? user.email.slice(0, 2).toUpperCase() : 'UE'

  return (
    <div className="flex min-h-full flex-col bg-background p-5 pt-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Profile</h1>
        <button onClick={onGoHome} className="rounded-full bg-muted/50 p-2 text-muted-foreground hover:bg-muted transition-colors">
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col items-center mb-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary ring-4 ring-background shadow-lg mb-4">
          {initials}
        </div>
        <h2 className="text-xl font-bold text-foreground">{user.displayName || 'Dash User'}</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
          {isMerchant ? <StoreIcon className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
          {isMerchant ? 'Store Owner' : 'Student'}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {isMerchant && (
          <button 
            onClick={() => router.push('/store-owner')}
            className="flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-4 text-left font-semibold text-primary-foreground shadow-sm transition-transform active:scale-[0.98] hover:brightness-110"
          >
            <div className="rounded-full bg-white/20 p-2">
              <StoreIcon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <span className="block text-base">Store Dashboard</span>
              <span className="block text-xs font-medium text-primary-foreground/80">Manage products & orders</span>
            </div>
          </button>
        )}
        
        {!isMerchant && (
           <button 
             onClick={onOrders}
             className="flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-4 text-left font-semibold text-foreground shadow-sm transition-transform active:scale-[0.98] hover:bg-muted/50"
           >
             <div className="rounded-full bg-primary/10 p-2 text-primary">
               <ReceiptIcon className="h-5 w-5" />
             </div>
             <div className="flex-1">
               <span className="block text-base">My Orders</span>
               <span className="block text-xs font-medium text-muted-foreground">Track current and past orders</span>
             </div>
           </button>
        )}

        <button 
          onClick={onSignOut}
          className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-left font-semibold text-destructive shadow-sm transition-transform active:scale-[0.98] hover:bg-destructive/10"
        >
          <div className="rounded-full bg-destructive/10 p-2">
            <LogOutIcon className="h-5 w-5" />
          </div>
          <span className="block text-base">Sign out</span>
        </button>
      </div>
    </div>
  )
}
