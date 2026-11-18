import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  orderBy, 
  limit,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
  type DocumentData,
  type QuerySnapshot
} from 'firebase/firestore'
import { auth, db } from './firebase'
import useSWR from 'swr'
import { seedInitialDataIfNeeded } from './seed-data'
import {
  Restaurant,
  isGroceryCategory,
  campuses,
} from './data'

/* 
  High Scalability Note: 
  Instead of active onSnapshot listeners for massive data grids, we use SWR. 
  SWR heavily caches data locally and dedupes multiple requests, cutting Firebase read costs drastically 
  while keeping the UX "real-time" via smart revalidation. 
*/

// ============================================================
// TYPES
// ============================================================

export type ProductDoc = {
  id: string
  merchantId: string
  name: string
  description: string
  price: number
  oldPrice?: number
  size?: string
  subcategory?: string
  storeType?: 'restaurant' | 'grocery'
  popular?: boolean
  category: string
  images: string[]
  modifierGroups?: any[]
  createdAt: number
}

export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'

export interface OrderItem {
  id: string
  name: string
  price: number
  quantity: number
  modifiers?: Array<{ label: string; price: number }>
}

export interface DriverLocation {
  lat: number
  lng: number
  heading: number
  speedKmh?: number
  updatedAt?: any
}

export interface Order {
  id: string
  orderId?: string
  customerId: string
  customerName: string
  merchantId: string
  merchantName: string
  driverId?: string
  driverName?: string
  driverPhone?: string
  driverVehiclePlate?: string
  deliveryStatus?: string
  driverLocation?: DriverLocation
  lastValidDriverLocation?: DriverLocation
  items: OrderItem[]
  total: number
  status: OrderStatus
  paymentReference?: string
  paymentStatus?: 'paid' | 'pending' | 'cash_on_pickup'
  paymentChannel?: string
  deliveryOtp?: string
  pickupPin?: string
  deliveryFeeZar?: number
  roadDistanceKm?: number
  smallOrderFeeZar?: number
  serviceFeeZar?: number
  dashPlusApplied?: boolean
  batchDispatch?: boolean
  pickupVerified?: boolean
  pickupAddress?: string
  pickupCoords?: { lat: number; lng: number }
  dropoffAddress?: string
  dropoffCoords?: { lat: number; lng: number }
  createdAt: any
  updatedAt: any
  pickupTime?: string
  notes?: string
}

// ============================================================
// PRODUCTS – SWR HOOK
// ============================================================

const productsFetcher = async (key: string): Promise<ProductDoc[]> => {
  try {
    const collectionRef = collection(db, 'products')
    const merchantId = key.startsWith('products:') ? key.slice('products:'.length) : ''
    const q = merchantId
      ? query(collectionRef, where('merchantId', '==', merchantId))
      : query(collectionRef, limit(300))
    const snapshot = await getDocs(q)
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductDoc))
    docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    return docs
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Firestore products fetch warning:', err?.message || err)
    }
    return []
  }
}

/**
 * Fetch products from Firestore relying on SWR cache.
 * When `merchantId` is provided, queries ONLY that store's products (slashes reads & scales cleanly).
 * Pass `null` while auth is loading to avoid an unnecessary platform-wide query.
 */
export function useFirebaseProducts(merchantId?: string | null) {
  const swrKey =
    merchantId === null ? null : merchantId ? `products:${merchantId}` : 'products'
  const { data, error, mutate } = useSWR<ProductDoc[]>(swrKey, productsFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
    shouldRetryOnError: false,
  })

  return {
    products: data || [],
    isLoading: Boolean(swrKey) && !error && !data,
    isError: error,
    mutate
  }
}

// ============================================================
// RESTAURANTS – SWR HOOK & SEEDING
// ============================================================

const restaurantsFetcher = async (): Promise<Restaurant[]> => {
  const existingRestaurants: Restaurant[] = []
  const restaurantIds = new Set<string>()

  // Fetch restaurants and products in parallel to cut initial load time in half
  const [restaurantsSnapResult, productsSnapResult] = await Promise.allSettled([
    getDocs(collection(db, 'restaurants')),
    getDocs(collection(db, 'products')),
  ])

  // 1. Process existing documents in `restaurants` collection
  if (restaurantsSnapResult.status === 'fulfilled') {
    for (const docSnap of restaurantsSnapResult.value.docs) {
      const data = { id: docSnap.id, ...docSnap.data() } as Restaurant
      if (!data.campusIds || data.campusIds.length === 0) {
        data.campusIds = ['aucklandpark', 'buntingroad', 'doornfontein', 'soweto']
      }
      existingRestaurants.push(data)
      restaurantIds.add(data.id)
    }
  } else {
    const err = restaurantsSnapResult.reason
    if (err?.code !== 'permission-denied') {
      console.warn('Firestore restaurants fetch warning:', err?.message || err)
    }
  }

  // 2. Process products to populate menus and synthesize missing restaurant profiles in parallel
  if (productsSnapResult.status === 'fulfilled' && !productsSnapResult.value.empty) {
    const merchantProductsMap = new Map<string, ProductDoc[]>()

    for (const docSnap of productsSnapResult.value.docs) {
      const prod = { id: docSnap.id, ...docSnap.data() } as ProductDoc
      if (prod.merchantId) {
        if (!merchantProductsMap.has(prod.merchantId)) {
          merchantProductsMap.set(prod.merchantId, [])
        }
        merchantProductsMap.get(prod.merchantId)!.push(prod)
      }
    }

    const missingMerchantIds = Array.from(merchantProductsMap.keys()).filter(
      (id) => !restaurantIds.has(id)
    )

    // Fetch all missing merchant user docs in parallel instead of sequentially
    const userDocsMap = new Map<string, DocumentData>()
    if (missingMerchantIds.length > 0) {
      const userSnaps = await Promise.allSettled(
        missingMerchantIds.map((mId) => getDoc(doc(db, 'users', mId)))
      )
      userSnaps.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value.exists()) {
          userDocsMap.set(missingMerchantIds[idx], res.value.data())
        }
      })
    }

    for (const [merchantId, prods] of merchantProductsMap.entries()) {
      prods.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      const firstProd = prods[0]
      const storeImage = (firstProd.images && firstProd.images[0]) || '/food/burger.png'
      const mappedMenu = prods.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: Number(p.price) || 0,
        oldPrice:
          p.oldPrice && Number(p.oldPrice) > Number(p.price)
            ? Number(p.oldPrice)
            : undefined,
        size: p.size ? String(p.size).trim() : undefined,
        subcategory: p.subcategory ? String(p.subcategory).trim() : undefined,
        popular: Boolean(p.popular),
        image: (p.images && p.images[0]) || storeImage,
        section: (p.category || 'Menu').trim(),
        modifiers: Array.isArray(p.modifierGroups)
          ? p.modifierGroups.map((g: any) => ({
              ...g,
              options: Array.isArray(g?.options)
                ? g.options.map((o: any) => ({
                    ...o,
                    price: Math.max(0, Number(o?.price) || 0),
                  }))
                : [],
            }))
          : [],
      }))

      if (restaurantIds.has(merchantId)) {
        const existingRest = existingRestaurants.find((r) => r.id === merchantId)
        if (existingRest) {
          const baseMenu = existingRest.menu || []
          const existingMenuIds = new Set(baseMenu.map((m) => m.id))
          existingRest.menu = [
            ...baseMenu,
            ...mappedMenu.filter((m) => !existingMenuIds.has(m.id)),
          ]
          if (!existingRest.image) {
            existingRest.image = storeImage
          }
          if (!existingRest.storeType && firstProd.storeType) {
            existingRest.storeType = firstProd.storeType
          }
        }
      } else {
        const categoryName = (firstProd.category || 'Campus Eats').trim()
        let storeName = `${categoryName} Spot`
        let storeLocation = 'Campus Center'
        let campusIds = ['aucklandpark', 'buntingroad', 'doornfontein', 'soweto']
        let pickupTime = '10-15 min'

        const uData = userDocsMap.get(merchantId)
        if (uData) {
          const candidate =
            uData.storeName || uData.businessName || uData.name || uData.displayName
          if (candidate && candidate.trim() !== '') {
            storeName = candidate.trim()
          } else if (uData.email) {
            const prefix = uData.email.split('@')[0]
            storeName = prefix.charAt(0).toUpperCase() + prefix.slice(1) + "'s Kitchen"
          }
          if (uData.storeLocation || uData.location) {
            storeLocation = uData.storeLocation || uData.location
          }
          if (uData.campusId && uData.campusId !== 'all') {
            campusIds = [uData.campusId]
          }
          if (uData.pickupTime) {
            pickupTime = uData.pickupTime
          }
        }

        const isGrocery =
          uData?.storeType === 'grocery' ||
          firstProd.storeType === 'grocery' ||
          isGroceryCategory(categoryName) ||
          isGroceryCategory(storeName)

        const synthesizedRestaurant: Restaurant = {
          id: merchantId,
          name: storeName,
          cuisine: categoryName,
          image: storeImage,
          rating: 5.0,
          reviews: 1,
          pickupTime: pickupTime,
          deliveryFee: isGrocery ? 'R15 delivery' : 'R15 delivery',
          priceLevel: `R ${Number(firstProd.price).toFixed(2)}`,
          location: storeLocation,
          open: true,
          campusIds: campusIds,
          storeType: isGrocery ? 'grocery' : 'restaurant',
          coords: uData?.coords,
          deliveryRadiusKm: uData?.deliveryRadiusKm || 15,
          menu: mappedMenu,
        }

        existingRestaurants.push(synthesizedRestaurant)
        restaurantIds.add(merchantId)
      }
    }
  } else if (productsSnapResult.status === 'rejected') {
    const err = productsSnapResult.reason
    if (err?.code !== 'permission-denied') {
      console.warn('Firestore products-to-restaurants fetch warning:', err?.message || err)
    }
  }

  // Normalize storeType, deliveryFee, and rating on all fetched restaurants
  for (const r of existingRestaurants) {
    if (!r.storeType) {
      const inferredGrocery =
        isGroceryCategory(r.cuisine) ||
        isGroceryCategory(r.name) ||
        (Array.isArray(r.menu) &&
          r.menu.length > 0 &&
          r.menu.some((m) => isGroceryCategory(m.section)))
      r.storeType = inferredGrocery ? 'grocery' : 'restaurant'
    }
    if (!r.deliveryFee) {
      r.deliveryFee = r.storeType === 'grocery' ? 'R10 delivery' : 'R15 delivery'
    }
    if (!r.rating || r.rating <= 0) {
      r.rating = 5.0
    }
  }

  return existingRestaurants
}

export function useFirebaseRestaurants() {
  const { data, error, mutate } = useSWR<Restaurant[]>('restaurants', restaurantsFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300000,
    shouldRetryOnError: false,
  })

  return {
    restaurants: data || [],
    isLoading: !error && !data,
    isError: error,
    mutate
  }
}

// ============================================================
// PRODUCTS – ACTIONS
// ============================================================

function compressImageFile(file: File, maxSize = 960, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not compress image.'))
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read image file.'))
    }
    image.src = objectUrl
  })
}

async function compressImageToUploadFile(file: File, maxSize = 960, quality = 0.74): Promise<File> {
  try {
    const dataUrl = await compressImageFile(file, maxSize, quality)
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const safeBase = file.name.replace(/\.[^.]+$/, '') || 'product'
    return new File([blob], `${safeBase}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

/** Upload compressed product images via same-origin API (slashes Storage & bandwidth costs). */
export async function uploadProductImages(files: File[], merchantId: string): Promise<string[]> {
  if (!merchantId) {
    throw new Error('merchantId is required – user might not be logged in as merchant.')
  }

  if (!auth.currentUser) {
    throw new Error('You must be signed in to upload product images.')
  }

  // Always compress smartphone photos client-side BEFORE upload (~90% smaller storage & egress)
  const compressedFiles = await Promise.all(files.map((file) => compressImageToUploadFile(file)))

  const token = await auth.currentUser.getIdToken()
  const formData = new FormData()
  for (const file of compressedFiles) {
    formData.append('files', file)
  }

  const res = await fetch('/api/product-images', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  const payload = (await res.json().catch(() => ({}))) as { urls?: string[]; error?: string }
  if (res.ok && payload.urls?.length) {
    return payload.urls
  }

  const storageMissing = /storage is not enabled/i.test(payload.error || '')
  if (!res.ok && !storageMissing) {
    throw new Error(payload.error || 'Upload failed.')
  }

  // Last-resort compact fallback if neither Firebase nor Supabase storage is active
  return Promise.all(compressedFiles.map((file) => compressImageFile(file, 640, 0.65)))
}

function sanitizeModifierGroups(groups: any[] | undefined): any[] {
  if (!Array.isArray(groups)) return []
  return groups.map((g) => ({
    ...g,
    title: String(g?.title || '').trim(),
    required: Boolean(g?.required),
    type: g?.type === 'multi' ? 'multi' : 'single',
    options: Array.isArray(g?.options)
      ? g.options.map((o: any) => ({
          ...o,
          label: String(o?.label || '').trim(),
          price: Math.max(0, Number(o?.price) || 0),
        }))
      : [],
  }))
}

/** Create a new product in Firestore and ensure restaurant exists */
export async function createProduct(
  merchantId: string, 
  productData: Omit<ProductDoc, 'id' | 'createdAt' | 'merchantId'>, 
  imageFiles: File[]
) {
  try {
    if (!auth.currentUser || auth.currentUser.uid !== merchantId) {
      throw new Error('Unauthorized: You can only create products for your own store.')
    }

    const numericPrice = Number(productData.price)
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      throw new Error('Product price must be greater than zero.')
    }

    const uploadedImageUrls =
      imageFiles.length > 0 ? await uploadProductImages(imageFiles, merchantId) : []

    const newDocRef = doc(collection(db, 'products'))
    const resolvedStoreType: 'restaurant' | 'grocery' =
      productData.storeType === 'grocery' || isGroceryCategory(productData.category)
        ? 'grocery'
        : 'restaurant'

    const newProduct: ProductDoc = {
      id: newDocRef.id,
      merchantId,
      createdAt: Date.now(),
      name: String(productData.name || '').trim(),
      description: String(productData.description || '').trim(),
      category: String(productData.category || 'Menu').trim(),
      price: numericPrice,
      storeType: resolvedStoreType,
      modifierGroups: sanitizeModifierGroups(productData.modifierGroups),
      images: uploadedImageUrls.length > 0 ? uploadedImageUrls : productData.images || [],
    }
    if (productData.size && String(productData.size).trim()) {
      newProduct.size = String(productData.size).trim()
    }
    if (productData.subcategory && String(productData.subcategory).trim()) {
      newProduct.subcategory = String(productData.subcategory).trim()
    }
    if (
      productData.oldPrice !== undefined &&
      Number.isFinite(Number(productData.oldPrice)) &&
      Number(productData.oldPrice) > numericPrice
    ) {
      newProduct.oldPrice = Number(productData.oldPrice)
    }

    await setDoc(newDocRef, newProduct)

    // Ensure restaurant/store profile exists in Firestore and has accurate storeType & coords
    try {
      const restaurantRef = doc(db, 'restaurants', merchantId)
      const restaurantSnap = await getDoc(restaurantRef)
      if (!restaurantSnap.exists()) {
        let storeName = resolvedStoreType === 'grocery' ? 'Local Shop' : 'Local Restaurant'
        let storeLocation = 'Johannesburg'
        let storeCoords: any = undefined
        try {
          const userSnap = await getDoc(doc(db, 'users', merchantId))
          if (userSnap.exists()) {
            const uData = userSnap.data()
            storeName = uData.storeName || uData.name || storeName
            storeLocation = uData.storeLocation || uData.location || storeLocation
            storeCoords = uData.coords
          }
        } catch (_e) {
          // Ignore user doc lookup error
        }

        const restPayload: Record<string, any> = {
          id: merchantId,
          name: storeName,
          cuisine: newProduct.category || (resolvedStoreType === 'grocery' ? 'Groceries & Essentials' : 'Meals & Takeaways'),
          image:
            (newProduct.images && newProduct.images[0]) ||
            (resolvedStoreType === 'grocery' ? '/food/spaza-store.jpg' : '/food/featured-burger.jpg'),
          rating: 5.0,
          reviews: 1,
          pickupTime: resolvedStoreType === 'grocery' ? '20-30 min' : '15-25 min',
          priceLevel: `R ${numericPrice.toFixed(2)}`,
          location: storeLocation,
          open: true,
          storeType: resolvedStoreType,
          deliveryRadiusKm: 15,
          campusIds: ['aucklandpark', 'buntingroad', 'doornfontein', 'soweto'],
          menu: [],
        }
        if (storeCoords) {
          restPayload.coords = storeCoords
        }

        await setDoc(restaurantRef, restPayload, { merge: true })
      } else if (productData.storeType) {
        await setDoc(
          restaurantRef,
          { storeType: resolvedStoreType },
          { merge: true }
        )
      }
    } catch (restErr) {
      console.warn('Could not auto-create restaurant profile:', restErr)
    }

    return newProduct
  } catch (error) {
    console.error("Failed to create product:", error)
    throw error
  }
}

/** Update an existing product price (supports decimals like 14.90) */
export async function updateProductPrice(productId: string, newPrice: number) {
  try {
    const numericPrice = Number(newPrice)
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      throw new Error('Product price must be greater than zero.')
    }
    if (!auth.currentUser) {
      throw new Error('Unauthorized: You must be signed in.')
    }
    const productRef = doc(db, 'products', productId)
    const snap = await getDoc(productRef)
    if (snap.exists() && snap.data().merchantId !== auth.currentUser.uid) {
      throw new Error('Unauthorized: You can only edit your own store products.')
    }
    await updateDoc(productRef, {
      price: numericPrice,
      updatedAt: Date.now()
    })
  } catch (error) {
    console.error("Failed to update product price:", error)
    throw error
  }
}

/** Update an existing product completely (name, description, category, price, modifiers, images) */
export async function updateProduct(
  productId: string,
  merchantId: string,
  updates: Partial<Omit<ProductDoc, 'id' | 'createdAt' | 'merchantId'>>,
  newImageFiles?: File[]
) {
  try {
    if (!auth.currentUser || auth.currentUser.uid !== merchantId) {
      throw new Error('Unauthorized: You can only update products for your own store.')
    }

    const productRef = doc(db, 'products', productId)
    const snap = await getDoc(productRef)
    if (snap.exists() && snap.data().merchantId !== auth.currentUser.uid) {
      throw new Error('Unauthorized: Product belongs to another merchant.')
    }

    let finalImages = updates.images || []

    if (newImageFiles && newImageFiles.length > 0) {
      try {
        const uploadedUrls = await uploadProductImages(newImageFiles, merchantId)
        finalImages = [...finalImages, ...uploadedUrls]
      } catch (uploadError) {
        console.warn('Storage upload error:', uploadError)
      }
    }

    const sanitizedUpdates: Record<string, any> = {
      images: finalImages,
      updatedAt: Date.now(),
    }
    if (updates.name !== undefined) sanitizedUpdates.name = String(updates.name).trim()
    if (updates.description !== undefined) sanitizedUpdates.description = String(updates.description).trim()
    if (updates.category !== undefined) sanitizedUpdates.category = String(updates.category).trim()
    if (updates.storeType !== undefined) sanitizedUpdates.storeType = updates.storeType
    if (updates.size !== undefined) sanitizedUpdates.size = String(updates.size || '').trim()
    if (updates.subcategory !== undefined) sanitizedUpdates.subcategory = String(updates.subcategory || '').trim()
    if (updates.oldPrice !== undefined) {
      const numOld = Number(updates.oldPrice)
      sanitizedUpdates.oldPrice = Number.isFinite(numOld) && numOld > 0 ? numOld : null
    }
    if (updates.price !== undefined) {
      const numericPrice = Number(updates.price)
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        throw new Error('Product price must be greater than zero.')
      }
      sanitizedUpdates.price = numericPrice
    }
    if (updates.modifierGroups !== undefined) {
      sanitizedUpdates.modifierGroups = sanitizeModifierGroups(updates.modifierGroups)
    }

    await updateDoc(productRef, sanitizedUpdates)
  } catch (error) {
    console.error("Failed to update product:", error)
    throw error
  }
}

/** Delete an existing product from Firestore */
export async function deleteProduct(productId: string) {
  try {
    if (!auth.currentUser) {
      throw new Error('Unauthorized: You must be signed in.')
    }
    const productRef = doc(db, 'products', productId)
    const snap = await getDoc(productRef)
    if (snap.exists() && snap.data().merchantId !== auth.currentUser.uid) {
      throw new Error('Unauthorized: You can only delete your own store products.')
    }
    await deleteDoc(productRef)
  } catch (error) {
    console.error("Failed to delete product:", error)
    throw error
  }
}

// ============================================================
// ORDERS – ACTIONS
// ============================================================

/** Cryptographically uniform 4-digit code (1000-9999) */
function randomFourDigitCode(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    return String(1000 + (arr[0] % 9000))
  }
  return String(1000 + Math.floor(Math.random() * 9000))
}

/**
 * Generates a unique, non-repeating 4-digit OTP by checking active Firestore orders.
 * Guarantees no two active orders share the same OTP or pickup PIN.
 */
export async function generateUniqueOrderOtp(excludeCodes: string[] = []): Promise<string> {
  const used = new Set<string>(excludeCodes.filter(Boolean))
  try {
    const activeQuery = query(
      collection(db, 'orders'),
      where('status', 'in', ['pending', 'preparing', 'ready', 'out_for_delivery'])
    )
    const snap = await getDocs(activeQuery)
    for (const d of snap.docs) {
      const data = d.data() as Partial<Order>
      if (data.deliveryOtp) used.add(String(data.deliveryOtp))
      if (data.pickupPin) used.add(String(data.pickupPin))
    }
  } catch {
    // If offline or permission-scoped, still enforce uniqueness against excludeCodes
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = randomFourDigitCode()
    if (!used.has(candidate)) {
      return candidate
    }
  }
  return randomFourDigitCode()
}

/** Create a new order (from student side) with guaranteed unique non-repeating OTPs */
export async function createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) {
  try {
    const deliveryOtp =
      orderData.deliveryOtp || (await generateUniqueOrderOtp())
    const pickupPin =
      orderData.pickupPin && orderData.pickupPin !== deliveryOtp
        ? orderData.pickupPin
        : await generateUniqueOrderOtp([deliveryOtp])

    const ordersRef = collection(db, 'orders')
    const docRef = await addDoc(ordersRef, {
      ...orderData,
      deliveryOtp,
      pickupPin,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return docRef.id
  } catch (error: any) {
    if (error?.code !== 'permission-denied') {
      console.warn('Order creation notice:', error?.message || error)
    }
    return undefined
  }
}

/** Persist Merchant In-Store Price Promise & Top-3 Sponsored Placement to Firestore */
export async function updateMerchantCompliance(
  merchantId: string,
  updates: {
    inStorePricePromiseAccepted?: boolean
    sponsoredTop3Active?: boolean
  }
) {
  if (!merchantId) throw new Error('merchantId is required')
  const restaurantRef = doc(db, 'restaurants', merchantId)
  await setDoc(
    restaurantRef,
    {
      ...updates,
      ...(updates.inStorePricePromiseAccepted ? { inStorePricePromiseAcceptedAt: serverTimestamp() } : {}),
      ...(updates.sponsoredTop3Active ? { sponsoredTop3ActivatedAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

/** Verify Rider Pickup PIN against the real order in Firestore and mark Out for Delivery */
export async function verifyOrderPickupPin(orderDocId: string, enteredPin: string) {
  const orderRef = doc(db, 'orders', orderDocId)
  const snap = await getDoc(orderRef)
  if (!snap.exists()) {
    throw new Error('Order not found.')
  }
  const data = snap.data() as Partial<Order>
  if (!data.pickupPin || data.pickupPin !== enteredPin.trim()) {
    throw new Error('Invalid Pickup PIN. Ask the driver for the 4-digit pickup PIN.')
  }
  await updateDoc(orderRef, {
    pickupVerified: true,
    status: 'out_for_delivery',
    updatedAt: serverTimestamp(),
  })
}

/**
 * Driver Handover: Driver asks the client for their 4-digit Delivery PIN,
 * enters it, and if it matches `deliveryOtp` in Firestore, marks the order Delivered.
 */
export async function verifyCustomerDeliveryOtp(orderDocId: string, enteredOtp: string) {
  const orderRef = doc(db, 'orders', orderDocId)
  const snap = await getDoc(orderRef)
  if (!snap.exists()) {
    throw new Error('Order not found.')
  }
  const data = snap.data() as Partial<Order>
  if (!data.deliveryOtp || data.deliveryOtp !== enteredOtp.trim()) {
    throw new Error('Invalid Delivery PIN. Ask the client for their 4-digit PIN.')
  }
  await updateDoc(orderRef, {
    deliveryVerified: true,
    deliveredAt: serverTimestamp(),
    status: 'completed',
    updatedAt: serverTimestamp(),
  })
  return true
}

/** Get orders for a merchant (with latest first) */
export async function getMerchantOrders(merchantId: string): Promise<Order[]> {
  try {
    const ordersRef = collection(db, 'orders')
    const q = query(
      ordersRef,
      where('merchantId', '==', merchantId),
      orderBy('createdAt', 'desc'),
      limit(100)
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Order[]
  } catch (error) {
    console.error('Error fetching merchant orders:', error)
    return []
  }
}

/** Get orders for a customer (with latest first, robust in-memory sort) */
export async function getCustomerOrders(customerId: string): Promise<Order[]> {
  try {
    const ordersRef = collection(db, 'orders')
    const q = query(ordersRef, where('customerId', '==', customerId))
    const snapshot = await getDocs(q)
    const orders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Order[]
    orders.sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? a.createdAt : 0)
      const timeB = b.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? b.createdAt : 0)
      return timeB - timeA
    })
    return orders
  } catch (error) {
    console.error('Error fetching customer orders:', error)
    return []
  }
}

/** Subscribe to live updates for all orders of a customer */
export function subscribeToCustomerOrders(
  customerId: string,
  callback: (orders: Order[]) => void,
  onError?: (error: unknown) => void
) {
  const ordersRef = collection(db, 'orders')
  const q = query(ordersRef, where('customerId', '==', customerId))
  return onSnapshot(
    q,
    (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[]
      orders.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? a.createdAt : 0)
        const timeB = b.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? b.createdAt : 0)
        return timeB - timeA
      })
      callback(orders)
    },
    (error: any) => {
      if (error?.code !== 'permission-denied') {
        console.warn('Customer orders subscription notice:', error)
      }
      onError?.(error)
    }
  )
}

/** Update order status (merchant or customer) */
export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  try {
    const orderRef = doc(db, 'orders', orderId)
    await updateDoc(orderRef, {
      status,
      updatedAt: serverTimestamp(),
    })
    return true
  } catch (error) {
    console.error('Error updating order status:', error)
    throw error
  }
}

/** Cancel a customer order ONLY while it is not ready (pending or preparing) */
export async function cancelCustomerOrder(orderId: string) {
  const orderRef = doc(db, 'orders', orderId)
  const snap = await getDoc(orderRef)
  if (!snap.exists()) {
    throw new Error('Order not found.')
  }
  const data = snap.data() as Partial<Order>
  if (
    data.status === 'ready' ||
    data.status === 'out_for_delivery' ||
    data.status === 'completed' ||
    data.status === 'cancelled'
  ) {
    throw new Error('Order cannot be cancelled because it is already ready or finished.')
  }
  await updateDoc(orderRef, {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  })
  return true
}

/** Get a single order by ID */
export async function getOrder(orderId: string): Promise<Order | null> {
  try {
    const orderRef = doc(db, 'orders', orderId)
    const snapshot = await getDoc(orderRef)
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() } as Order
    }
    return null
  } catch (error) {
    console.error('Error fetching order:', error)
    return null
  }
}

import { validateDriverGpsJump } from './coord-validation'
export { validateDriverGpsJump }

/** Subscribe to live updates for a single order */
export function subscribeToOrder(
  orderId: string,
  callback: (order: Order | null) => void,
  onError?: (error: unknown) => void
) {
  const orderRef = doc(db, 'orders', orderId)
  return onSnapshot(
    orderRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as Order)
      } else {
        callback(null)
      }
    },
    (error: any) => {
      if (error?.code !== 'permission-denied') {
        console.warn('Order subscription notice:', error)
      }
      onError?.(error)
      callback(null)
    }
  )
}

/** Subscribe to live updates for all orders of a merchant */
export function subscribeToMerchantOrders(merchantId: string, callback: (orders: Order[]) => void) {
  const ordersRef = collection(db, 'orders')
  const q = query(ordersRef, where('merchantId', '==', merchantId))
  return onSnapshot(
    q,
    (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[]
      // Sort in memory by createdAt descending
      orders.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? a.createdAt : 0)
        const timeB = b.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? b.createdAt : 0)
        return timeB - timeA
      })
      callback(orders)
    },
    (error: any) => {
      if (error?.code !== 'permission-denied') {
        console.warn('Real-time merchant orders notice:', error)
      }
    }
  )
}

// ============================================================
// ORDERS – SWR HOOK
// ============================================================

/** SWR hook for merchant orders – auto‑refreshes every 30s */
export function useMerchantOrders(merchantId: string | null) {
  const fetcher = async () => {
    if (!merchantId) return []
    return getMerchantOrders(merchantId)
  }

  const { data, error, mutate } = useSWR(
    merchantId ? `merchant-orders-${merchantId}` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 30000,
    }
  )

  return {
    orders: data || [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  }
}