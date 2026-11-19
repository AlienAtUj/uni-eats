export interface GeoCoordinates {
  lat: number
  lng: number
}

export type AppUserRole = 'customer' | 'merchant' | 'driver' | 'student'

export type DriverVerificationStatus = 'pending' | 'approved' | 'rejected'

export type VehicleType = 'motorbike' | 'scooter' | 'car' | 'bicycle'

export type CustomerOrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'

export type DeliveryStatus =
  | 'unassigned'
  | 'offered'
  | 'accepted'
  | 'en_route_to_pickup'
  | 'arrived_at_pickup'
  | 'picked_up'
  | 'en_route_to_dropoff'
  | 'delivered'
  | 'cancelled'

export const OFFER_TIMEOUT_SECONDS = 45
export const BASE_DELIVERY_FEE_CENTS = 1800
export const PER_KM_DELIVERY_RATE_CENTS = 350
export const MAX_DISPATCH_RADIUS_KM = 12

export interface DriverDocuments {
  licenseUrl?: string
  idDocumentUrl?: string
  vehicleRegUrl?: string
  uploadedAtIso?: string
}

export interface DriverTelemetry {
  lat: number
  lng: number
  accuracyMeters: number
  heading?: number | null
  speedMps?: number | null
  updatedAtIso: string
}

export interface DriverProfile {
  id: string
  uid: string
  name: string
  email: string
  phone: string
  vehicleType: VehicleType
  vehiclePlate: string
  photoUrl: string
  verificationStatus: DriverVerificationStatus
  verificationRejectionReason?: string
  documents: DriverDocuments
  isOnline: boolean
  lastLocation?: DriverTelemetry | null
  activeOrderId?: string | null
  ratingAverage: number
  ratingCount: number
  createdAtIso: string
  updatedAtIso: string
}

export interface OrderModifierEntry {
  label: string
  price: number
}

export interface OrderLineItem {
  id: string
  name: string
  price: number
  quantity: number
  modifiers?: OrderModifierEntry[]
}

export interface ProofOfDelivery {
  photoUrl: string
  otpCode?: string
  signatureDataUrl?: string
  capturedAtIso: string
  lat?: number
  lng?: number
}

export interface OrderCancellation {
  cancelledBy: 'driver' | 'customer' | 'merchant'
  actorId: string
  reason: string
  cancelledAtIso: string
}

export interface StateTransitionEntry {
  from: DeliveryStatus
  to: DeliveryStatus
  actorId: string
  timestampIso: string
}

export interface DispatchOrder {
  id: string
  orderId?: string
  customerId: string
  customerName: string
  customerPhone?: string
  merchantId: string
  merchantName: string
  items: OrderLineItem[]
  total: number
  totalCents: number
  status: CustomerOrderStatus
  deliveryStatus: DeliveryStatus
  driverId?: string | null
  driverName?: string | null
  driverPhone?: string | null
  driverVehiclePlate?: string | null
  offeredToDriverId?: string | null
  offerExpiresAtIso?: string | null
  declinedByDriverIds?: string[]
  pickupAddress: string
  pickupCoords: GeoCoordinates
  dropoffAddress: string
  dropoffCoords: GeoCoordinates
  distanceToPickupKm: number
  estimatedTripDistanceKm: number
  estimatedTripDurationMin: number
  deliveryFeeCents: number
  driverEarningsCents: number
  pickupTime?: string
  notes?: string
  proofOfDelivery?: ProofOfDelivery | null
  cancellation?: OrderCancellation | null
  stateHistory?: StateTransitionEntry[]
  createdAtIso: string
  updatedAtIso: string
}

export interface OrderEarningsBreakdown {
  orderId: string
  displayOrderId: string
  merchantName: string
  customerName: string
  deliveredAtIso: string
  tripDistanceKm: number
  orderTotalCents: number
  baseFeeCents: number
  distanceFeeCents: number
  driverEarningsCents: number
}

export interface EarningsSummary {
  todayCents: number
  thisWeekCents: number
  totalCents: number
  completedCount: number
  orders: OrderEarningsBreakdown[]
}

export interface DriverReview {
  id: string
  driverId: string
  orderId: string
  customerName: string
  rating: number
  comment: string
  createdAtIso: string
}
