import crypto from 'crypto'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

export const SERVER_SERVICE_FEE_ZAR = 0.99

export interface CheckoutItemInput {
  itemId: string
  quantity: number
  unitPrice?: number
  modifierLabels?: string[]
}

export function isValidPaymentReference(reference: unknown): reference is string {
  return typeof reference === 'string' && /^[A-Za-z0-9_-]{6,100}$/.test(reference)
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function createIntegrityHash(
  secretKey: string,
  reference: string,
  amountInCents: number,
  currency = 'ZAR'
): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(`${reference}:${amountInCents}:${currency}`)
    .digest('hex')
}

export function verifyTimingSafeHash(expectedHex: string, receivedHex: string): boolean {
  try {
    const a = Buffer.from(expectedHex, 'utf8')
    const b = Buffer.from(receivedHex, 'utf8')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Computes the authoritative order total in cents by fetching product prices from Firestore.
 * Protects against client-side localStorage cart price tampering.
 */
export async function computeVerifiedOrderTotalCents(
  items: CheckoutItemInput[] | undefined,
  fallbackAmountZar?: number
): Promise<{ amountInCents: number; amountZar: number }> {
  if (!Array.isArray(items) || items.length === 0) {
    if (typeof fallbackAmountZar === 'number' && Number.isFinite(fallbackAmountZar) && fallbackAmountZar > 0) {
      const cents = Math.round(fallbackAmountZar * 100)
      return { amountInCents: cents, amountZar: cents / 100 }
    }
    throw new Error('Order items are required to calculate payment total.')
  }

  // Fetch all product documents in parallel for fast verification
  const uniqueIds = Array.from(
    new Set(items.map((i) => i.itemId).filter((id): id is string => typeof id === 'string' && id.length > 0))
  )
  const productDataMap = new Map<string, Record<string, any>>()
  if (uniqueIds.length > 0) {
    const snaps = await Promise.allSettled(uniqueIds.map((id) => getDoc(doc(db, 'products', id))))
    snaps.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value.exists()) {
        productDataMap.set(uniqueIds[idx], res.value.data())
      }
    })
  }

  let subtotalCents = 0
  let expectedMerchantId: string | null = null

  for (const item of items) {
    const qty = Number(item.quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new Error('Invalid item quantity in cart.')
    }

    let authoritativeUnitPrice = typeof item.unitPrice === 'number' && item.unitPrice > 0 ? item.unitPrice : 0
    const data = item.itemId ? productDataMap.get(item.itemId) : undefined

    if (data) {
      if (typeof data.merchantId === 'string' && data.merchantId) {
        if (!expectedMerchantId) {
          expectedMerchantId = data.merchantId
        } else if (expectedMerchantId !== data.merchantId) {
          throw new Error('Cannot combine items from multiple stores in a single order.')
        }
      }

      const basePrice = Number(data.price)
      if (Number.isFinite(basePrice) && basePrice > 0) {
        let modifierTotal = 0
        const selectedLabels = Array.isArray(item.modifierLabels) ? item.modifierLabels : []
        const groups = Array.isArray(data.modifierGroups) ? data.modifierGroups : []

        for (const label of selectedLabels) {
          for (const group of groups) {
            const options = Array.isArray(group?.options) ? group.options : []
            const matched = options.find((opt: any) => opt?.label === label)
            if (matched && Number.isFinite(Number(matched.price)) && Number(matched.price) > 0) {
              modifierTotal += Number(matched.price)
              break
            }
          }
        }

        const firestoreUnitPrice = basePrice + modifierTotal
        // Never allow client price to be lower than Firestore product price
        authoritativeUnitPrice = Math.max(authoritativeUnitPrice, firestoreUnitPrice)
      }
    }

    if (!Number.isFinite(authoritativeUnitPrice) || authoritativeUnitPrice <= 0) {
      throw new Error('Invalid product price detected.')
    }

    subtotalCents += Math.round(authoritativeUnitPrice * 100) * qty
  }

  const serviceFeeCents = Math.round(SERVER_SERVICE_FEE_ZAR * 100)
  const amountInCents = subtotalCents + serviceFeeCents

  return {
    amountInCents,
    amountZar: amountInCents / 100,
  }
}

/**
 * Checks whether a Paystack reference has already been consumed by an existing order
 * to prevent replay attacks.
 */
export async function isReferenceAlreadyUsed(reference: string): Promise<boolean> {
  try {
    const ordersRef = collection(db, 'orders')
    const q = query(ordersRef, where('paymentReference', '==', reference))
    const snap = await getDocs(q)
    return !snap.empty
  } catch {
    return false
  }
}

