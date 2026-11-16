/**
 * Dash Hyper-Local Quick Commerce — Global Business & FinTech Engine (South Africa)
 * STRICTLY implements the exact math, rules, and guardrails. Zero hallucination.
 */

export type DashStoreType = 'food' | 'grocery'
export type DashPaymentMethod = 'ozow' | 'capitec_pay' | 'card'

export const DASH_SERVICE_FEE_ZAR = 4.99
export const DASH_SMALL_ORDER_FEE_ZAR = 10.0
export const DASH_PLUS_MONTHLY_FEE_ZAR = 49.0
export const DASH_SPONSORED_TOP3_MONTHLY_FEE_ZAR = 850.0
export const DASH_FOOD_FLOOR_ZAR = 90.0
export const DASH_GROCERY_FLOOR_ZAR = 150.0
export const DASH_EXTENDED_ZONE_MIN_BASKET_ZAR = 150.0
export const DASH_PLUS_MIN_BASKET_ZAR = 180.0
export const DASH_PLUS_MAX_DISTANCE_KM = 6.0

/** Exact Rand formatting: R[X.XX] */
export function formatZar(amount: number): string {
  return `R${amount.toFixed(2)}`
}

/** Fetch real road distance in km via /api/distance (NEVER Haversine) */
export async function fetchRoadDistanceKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<number> {
  const res = await fetch('/api/distance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination }),
  })
  if (!res.ok) {
    throw new Error('Unable to calculate road distance.')
  }
  const data = await res.json()
  if (typeof data?.roadDistanceKm !== 'number' || !Number.isFinite(data.roadDistanceKm)) {
    throw new Error('Invalid road distance returned by Distance Matrix API.')
  }
  return data.roadDistanceKm
}

/**
 * PART 1.1: Geofencing & Delivery Distance
 * - 0 - 8 km: Standard zone. Allowed.
 * - 8 - 10 km: Extended Zone. REQUIRES minimum basket of R150.
 * - > 10 km: Locked. Throw "Delivery unavailable at this distance (Max 10km)."
 */
export function validateDeliveryZone(
  roadDistanceKm: number,
  basketSubtotalZar: number
): { zone: 'standard' | 'extended' } {
  if (roadDistanceKm > 10) {
    throw new Error('Delivery unavailable at this distance (Max 10km).')
  }
  if (roadDistanceKm > 8) {
    if (basketSubtotalZar < DASH_EXTENDED_ZONE_MIN_BASKET_ZAR) {
      throw new Error('Extended zone requires a R150 minimum basket.')
    }
    return { zone: 'extended' }
  }
  return { zone: 'standard' }
}

/**
 * PART 1.2: Delivery Fee Matrix (Exact Rand Values)
 */
export function getDeliveryFeeByRoadDistance(roadDistanceKm: number): number {
  if (roadDistanceKm <= 1) return 16
  if (roadDistanceKm <= 2) return 18
  if (roadDistanceKm <= 3) return 21
  if (roadDistanceKm <= 4) return 23
  if (roadDistanceKm <= 5) return 26
  if (roadDistanceKm <= 6) return 29
  if (roadDistanceKm <= 7) return 32
  if (roadDistanceKm <= 8) return 35
  if (roadDistanceKm <= 9) return 39
  if (roadDistanceKm <= 10) return 43
  throw new Error('Delivery unavailable at this distance (Max 10km).')
}

/**
 * PART 2.1: Smart Cart Floors
 * - Food Floor: R90
 * - Grocery Floor: R150
 */
export function getSmallOrderFeeInfo(
  basketSubtotalZar: number,
  storeType: DashStoreType
): {
  floorZar: number
  isBelowFloor: boolean
  missingZar: number
  progressPercent: number
  smallOrderFeeZar: number
  message: string | null
} {
  const floorZar = storeType === 'grocery' ? DASH_GROCERY_FLOOR_ZAR : DASH_FOOD_FLOOR_ZAR
  const isBelowFloor = basketSubtotalZar < floorZar
  const missingZar = isBelowFloor ? Number((floorZar - basketSubtotalZar).toFixed(2)) : 0
  const progressPercent = Math.min(100, Math.max(0, Math.round((basketSubtotalZar / floorZar) * 100)))
  const smallOrderFeeZar = isBelowFloor ? DASH_SMALL_ORDER_FEE_ZAR : 0
  const message = isBelowFloor
    ? `Add ${formatZar(missingZar)} more to avoid the R10 small-order fee.`
    : null

  return {
    floorZar,
    isBelowFloor,
    missingZar,
    progressPercent,
    smallOrderFeeZar,
    message,
  }
}

/**
 * PART 1.3: Gateway Fees
 * - Capitec Pay / Ozow: 2.30%
 * - Cards: 3.34% + R1.15
 */
export function calculateGatewayFeeZar(
  totalChargedZar: number,
  paymentMethod: DashPaymentMethod
): number {
  if (paymentMethod === 'ozow' || paymentMethod === 'capitec_pay') {
    return Number((totalChargedZar * 0.023).toFixed(2))
  }
  return Number((totalChargedZar * 0.0334 + 1.15).toFixed(2))
}

/**
 * PART 1.3: Commission & Payouts (The Split-Ledger)
 * - Prepared Food: Merchant 85%, Dash 15%
 * - Groceries/Retail: Merchant 90%, Dash 10%
 * - Riders: 100% of delivery fee + 100% of tips (0% commission)
 */
export function calculateSplitLedger(params: {
  grossOrderValueZar: number
  storeType: DashStoreType
  deliveryFeeZar: number
  tipZar?: number
  totalChargedZar: number
  paymentMethod: DashPaymentMethod
}) {
  const commissionRate = params.storeType === 'grocery' ? 0.1 : 0.15
  const dashCommissionZar = Number((params.grossOrderValueZar * commissionRate).toFixed(2))
  const merchantNetPayoutZar = Number((params.grossOrderValueZar - dashCommissionZar).toFixed(2))
  const riderDeliveryFeeZar = Number(params.deliveryFeeZar.toFixed(2))
  const riderTipZar = Number((params.tipZar ?? 0).toFixed(2))
  const gatewayFeeZar = calculateGatewayFeeZar(params.totalChargedZar, params.paymentMethod)

  return {
    grossOrderValueZar: Number(params.grossOrderValueZar.toFixed(2)),
    commissionRate,
    dashCommissionZar,
    merchantNetPayoutZar,
    riderDeliveryFeeZar,
    riderTipZar,
    gatewayFeeZar,
  }
}

export interface DashCheckoutResult {
  zone: 'standard' | 'extended'
  roadDistanceKm: number
  basketSubtotalZar: number
  standardDeliveryFeeZar: number
  deliveryFeeZar: number
  dashPlusApplied: boolean
  smallOrderFeeZar: number
  smallOrderInfo: ReturnType<typeof getSmallOrderFeeInfo>
  serviceFeeZar: number
  tipZar: number
  totalChargedZar: number
  benchmarkTotalZar: number
  savingsZar: number
  savingsBadge: string
  paymentMethod: DashPaymentMethod
  gatewayFeeZar: number
  splitLedger: ReturnType<typeof calculateSplitLedger>
}

/**
 * PART 2.2 & 2.3: Complete Cart Checkout & Savings Receipt Calculation
 * Guardrail: Free delivery ONLY when hasDashPlus && basketSubtotalZar > 180 && roadDistanceKm < 6
 */
export function calculateDashCheckout(params: {
  basketSubtotalZar: number
  roadDistanceKm: number
  storeType: DashStoreType
  hasDashPlus: boolean
  paymentMethod: DashPaymentMethod
  tipZar?: number
}): DashCheckoutResult {
  const { basketSubtotalZar, roadDistanceKm, storeType, hasDashPlus, paymentMethod } = params
  const tipZar = Number((params.tipZar ?? 0).toFixed(2))

  // 1. Geofencing validation
  const { zone } = validateDeliveryZone(roadDistanceKm, basketSubtotalZar)

  // 2. Exact Delivery Fee Matrix
  const standardDeliveryFeeZar = getDeliveryFeeByRoadDistance(roadDistanceKm)

  // 3. Dash+ Guardrail: Free delivery ONLY if active AND order > R180 AND distance < 6 km
  const dashPlusApplied =
    hasDashPlus &&
    basketSubtotalZar > DASH_PLUS_MIN_BASKET_ZAR &&
    roadDistanceKm < DASH_PLUS_MAX_DISTANCE_KM

  const deliveryFeeZar = dashPlusApplied ? 0 : standardDeliveryFeeZar

  // 4. Smart Cart Floor
  const smallOrderInfo = getSmallOrderFeeInfo(basketSubtotalZar, storeType)
  const smallOrderFeeZar = smallOrderInfo.smallOrderFeeZar

  // 5. Flat Service Fee (R4.99)
  const serviceFeeZar = DASH_SERVICE_FEE_ZAR

  // 6. Total Charged
  const totalChargedZar = Number(
    (basketSubtotalZar + deliveryFeeZar + smallOrderFeeZar + serviceFeeZar + tipZar).toFixed(2)
  )

  // 7. Savings Receipt vs Uber Eats Benchmark (R200 basket -> R290 benchmark => 1.45x)
  const benchmarkTotalZar = Number((basketSubtotalZar * 1.45).toFixed(2))
  const savingsZar = Math.max(0, Number((benchmarkTotalZar - totalChargedZar).toFixed(2)))
  const savingsBadge = `You are saving ${formatZar(savingsZar)} compared to typical delivery apps.`

  // 8. Gateway Fee & Split-Ledger
  const gatewayFeeZar = calculateGatewayFeeZar(totalChargedZar, paymentMethod)
  const splitLedger = calculateSplitLedger({
    grossOrderValueZar: basketSubtotalZar,
    storeType,
    deliveryFeeZar: standardDeliveryFeeZar,
    tipZar,
    totalChargedZar,
    paymentMethod,
  })

  return {
    zone,
    roadDistanceKm,
    basketSubtotalZar,
    standardDeliveryFeeZar,
    deliveryFeeZar,
    dashPlusApplied,
    smallOrderFeeZar,
    smallOrderInfo,
    serviceFeeZar,
    tipZar,
    totalChargedZar,
    benchmarkTotalZar,
    savingsZar,
    savingsBadge,
    paymentMethod,
    gatewayFeeZar,
    splitLedger,
  }
}

/** PART 2.4: Generate 4-digit Delivery OTP */
export function generateDeliveryOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

/**
 * PART 3.1 & Guardrail: Enforce In-Store Price Promise
 * Throws validation error if merchant inputs a price higher than In-Store Price.
 */
export function validateInStorePrice(submittedPriceZar: number, inStorePriceZar: number): void {
  if (!Number.isFinite(submittedPriceZar) || submittedPriceZar <= 0) {
    throw new Error('Price must be greater than R0.00.')
  }
  if (!Number.isFinite(inStorePriceZar) || inStorePriceZar <= 0) {
    throw new Error('In-Store Price must be greater than R0.00.')
  }
  if (submittedPriceZar > inStorePriceZar) {
    throw new Error(
      `In-Store Price Promise violation: Submitted price (${formatZar(submittedPriceZar)}) cannot exceed physical in-store price (${formatZar(inStorePriceZar)}).`
    )
  }
}
