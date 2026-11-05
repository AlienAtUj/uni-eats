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

export async function saveUserProfile(uid: string, data: UserProfileInput) {
  // 1. Normalize and validate role
  const role = normalizeUserRole(data.role)
  if (!role) {
    throw new Error('Choose Student or Store Owner before creating your account.')
  }

  // 2. Build a clean payload – explicitly set role and validated profile fields
  const payload: Record<string, unknown> = {
    name: String(data.name || '').trim(),
    email: String(data.email || '').trim(),
    role: role,
  }

  if (typeof data.phone === 'string' && data.phone.trim()) {
    payload.phone = data.phone.trim()
  }
  if (typeof data.campusId === 'string' && data.campusId.trim()) {
    payload.campusId = data.campusId.trim()
  }
  if (typeof data.storeName === 'string' && data.storeName.trim()) {
    payload.storeName = data.storeName.trim()
  }
  if (typeof data.firstName === 'string' && data.firstName.trim()) {
    payload.firstName = data.firstName.trim()
  }
  if (typeof data.lastName === 'string' && data.lastName.trim()) {
    payload.lastName = data.lastName.trim()
  }
  if (typeof data.studentId === 'string' && data.studentId.trim()) {
    payload.studentId = data.studentId.trim()
  }
  if (data.storeType === 'grocery' || data.storeType === 'restaurant') {
    payload.storeType = data.storeType
  }
  if (typeof data.storeLocation === 'string' && data.storeLocation.trim()) {
    payload.storeLocation = data.storeLocation.trim()
  }
  if (data.coords && typeof data.coords === 'object') {
    payload.coords = data.coords
  }
  if (typeof data.deliveryRadiusKm === 'number') {
    payload.deliveryRadiusKm = data.deliveryRadiusKm
  }

  try {
    await setDoc(doc(db, 'users', uid), payload, { merge: true })
  } catch (error) {
    console.error('Firestore write error:', error)
    throw new Error(
      'Account was created, but we could not save your role. Check Firestore rules for the users collection, then try again.',
    )
  }

  // 3. Cache role locally
  cacheRole(uid, role)
}