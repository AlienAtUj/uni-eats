import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export type UserRole = 'student' | 'merchant'

const ROLE_STORAGE_PREFIX = 'unieats-role:'

function roleStorageKey(uid: string) {
  return `${ROLE_STORAGE_PREFIX}${uid}`
}

export function normalizeUserRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') return null
  const role = value.trim().toLowerCase()
  if (role === 'student') return 'student'
  if (
    role === 'merchant' ||
    role === 'store-owner' ||
    role === 'store_owner' ||
    role === 'storeowner' ||
    role === 'store owner' ||
    role === 'owner'
  ) {
    return 'merchant'
  }
  return null
}

function cacheRole(uid: string, role: UserRole) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(roleStorageKey(uid), role)
  } catch {
    // Ignore storage failures (private browsing, etc.)
  }
}

function readCachedRole(uid: string): UserRole | null {
  if (typeof window === 'undefined') return null
  try {
    return normalizeUserRole(window.localStorage.getItem(roleStorageKey(uid)))
  } catch {
    return null
  }
}

export function dashboardPathForRole(role: UserRole | null | undefined) {
  return role === 'merchant' ? '/store-owner' : '/'
}

export async function fetchUserRole(uid: string): Promise<UserRole | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', uid))
    if (userDoc.exists()) {
      const role = normalizeUserRole(userDoc.data().role)
      if (role) {
        cacheRole(uid, role)
        return role
      }
    }
  } catch (error) {
    console.error('Error fetching user role:', error)
  }

  return readCachedRole(uid)
}

export type UserProfileInput = {
  name: string
  email: string
  role: UserRole
  [key: string]: unknown
}

// ✅ FIXED: explicit payload, no spreading of raw data, with debug logs
export async function saveUserProfile(uid: string, data: UserProfileInput) {
  // 1. Normalize and validate role
  const role = normalizeUserRole(data.role)
  if (!role) {
    throw new Error('Choose Student or Store Owner before creating your account.')
  }

  // 2. Build a clean payload – explicitly set role, do NOT spread data blindly
  const payload = {
    name: data.name,
    email: data.email,
    role: role,          // <-- forcefully set
    // add any other fields you need here, e.g., createdAt: new Date().toISOString()
  }

  // 3. Debug: log what we're about to write
  console.log('🔥 saveUserProfile payload:', payload)

  try {
    await setDoc(doc(db, 'users', uid), payload, { merge: true })
    console.log('✅ Profile saved successfully with role:', role)
  } catch (error) {
    console.error('❌ Firestore write error:', error)
    throw new Error(
      'Account was created, but we could not save your role. Check Firestore rules for the users collection, then try again.',
    )
  }

  // 4. Cache role locally
  cacheRole(uid, role)
}