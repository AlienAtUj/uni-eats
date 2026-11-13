import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export type UserRole = 'customer' | 'merchant' | 'student'

const ROLE_STORAGE_PREFIX = 'dash-role:'

function roleStorageKey(uid: string) {
  return `${ROLE_STORAGE_PREFIX}${uid}`
}

export function normalizeUserRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') return 'customer'
  const role = value.trim().toLowerCase()
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
  return 'customer'
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
  role?: UserRole
  phone?: string
  deliveryAddress?: string
  unitOrComplex?: string
  suburb?: string
  city?: string
  postalCode?: string
  deliveryNotes?: string
  firstName?: string
  lastName?: string
  [key: string]: unknown
}

export async function saveUserProfile(uid: string, data: UserProfileInput) {
  // 1. Normalize role (defaults to 'customer' for Dash users)
  const role = normalizeUserRole(data.role || 'customer') || 'customer'

  // 2. Build a clean payload – explicitly set role and all user profile fields
  const payload: Record<string, unknown> = {
    name: String(data.name || '').trim(),
    email: String(data.email || '').trim(),
    role: role,
    updatedAt: Date.now(),
  }

  if (typeof data.phone === 'string' && data.phone.trim()) {
    payload.phone = data.phone.trim()
  }
  if (typeof data.deliveryAddress === 'string' && data.deliveryAddress.trim()) {
    payload.deliveryAddress = data.deliveryAddress.trim()
  }
  if (typeof data.unitOrComplex === 'string' && data.unitOrComplex.trim()) {
    payload.unitOrComplex = data.unitOrComplex.trim()
  }
  if (typeof data.suburb === 'string' && data.suburb.trim()) {
    payload.suburb = data.suburb.trim()
  }
  if (typeof data.city === 'string' && data.city.trim()) {
    payload.city = data.city.trim()
  }
  if (typeof data.postalCode === 'string' && data.postalCode.trim()) {
    payload.postalCode = data.postalCode.trim()
  }
  if (typeof data.deliveryNotes === 'string' && data.deliveryNotes.trim()) {
    payload.deliveryNotes = data.deliveryNotes.trim()
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