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
import { Restaurant, restaurants as fallbackRestaurants } from './data'

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
  category: string
  images: string[]
  modifierGroups?: any[]
  createdAt: number
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

export interface OrderItem {
  id: string
  name: string
  price: number
  quantity: number
  modifiers?: Array<{ label: string; price: number }>
}

export interface Order {
  id: string
  orderId?: string
  customerId: string
  customerName: string
  merchantId: string
  merchantName: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  paymentReference?: string
  paymentStatus?: 'paid' | 'pending' | 'cash_on_pickup'
  paymentChannel?: string
  createdAt: any
  updatedAt: any
  pickupTime?: string
  notes?: string
}

// ============================================================
// PRODUCTS – SWR HOOK
// ============================================================

const fetcher = async (path: string): Promise<ProductDoc[]> => {
  try {
    const collectionRef = collection(db, path)
    const snapshot = await getDocs(collectionRef)
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductDoc))
    docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    return docs.slice(0, 100)
  } catch (err: any) {
    if (err?.code !== 'permission-denied') {
      console.warn('Firestore products fetch warning:', err?.message || err)
    }
    return []
  }
}

/** Fetch all products from Firestore efficiently relying on SWR cache */
export function useFirebaseProducts() {
  const { data, error, mutate } = useSWR<ProductDoc[]>('products', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    shouldRetryOnError: false,
  })

  return {
    products: data || [],
    isLoading: !error && !data,
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

        const synthesizedRestaurant: Restaurant = {
          id: merchantId,
          name: storeName,
          cuisine: categoryName,
          image: storeImage,
          rating: 0,
          reviews: 0,
          pickupTime: pickupTime,
          priceLevel: `R ${Number(firstProd.price).toFixed(2)}`,
          location: storeLocation,
          open: true,
          campusIds: campusIds,
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

  return existingRestaurants
}

export function useFirebaseRestaurants() {
  const { data, error, mutate } = useSWR<Restaurant[]>('restaurants', restaurantsFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 10000,
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

function compressImageFile(file: File, maxSize = 1200, quality = 0.72): Promise<string> {
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

/** Upload product images via same-origin API (avoids Firebase Storage browser CORS). */
export async function uploadProductImages(files: File[], merchantId: string): Promise<string[]> {
  if (!merchantId) {
    throw new Error('merchantId is required – user might not be logged in as merchant.')
  }

  if (!auth.currentUser) {
    throw new Error('You must be signed in to upload product images.')
  }

  const token = await auth.currentUser.getIdToken()
  const formData = new FormData()
  for (const file of files) {
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

  // Storage bucket does not exist yet — keep product creation working with compressed images.
  return Promise.all(files.map((file) => compressImageFile(file)))
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
    const newProduct: ProductDoc = {
      id: newDocRef.id,
      merchantId,
      createdAt: Date.now(),
      ...productData,
      name: String(productData.name || '').trim(),
      description: String(productData.description || '').trim(),
      category: String(productData.category || 'Menu').trim(),
      price: numericPrice,
      modifierGroups: sanitizeModifierGroups(productData.modifierGroups),
      images: uploadedImageUrls.length > 0 ? uploadedImageUrls : productData.images || [],
    }

    await setDoc(newDocRef, newProduct)

    // Ensure restaurant profile exists in Firestore for this merchant
    try {
      const restaurantRef = doc(db, 'restaurants', merchantId)
      const restaurantSnap = await getDoc(restaurantRef)
      if (!restaurantSnap.exists()) {
        // Fetch user name for store title
        let storeName = 'Campus Store'
        try {
          const userSnap = await getDoc(doc(db, 'users', merchantId))
          if (userSnap.exists()) storeName = userSnap.data().name || storeName
        } catch (_e) {
          // Ignore user doc lookup error
        }

        await setDoc(restaurantRef, {
          id: merchantId,
          name: storeName,
          cuisine: newProduct.category || 'Campus Food',
          image: (newProduct.images && newProduct.images[0]) || '/food/burger.png',
          rating: 5.0,
          reviews: 1,
          pickupTime: '10-15 min',
          priceLevel: `R ${numericPrice}`,
          location: 'Campus Center',
          open: true,
          campusIds: ['aucklandpark', 'buntingroad', 'doornfontein', 'soweto'],
          menu: [],
        }, { merge: true })
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
      ...updates,
      images: finalImages,
      updatedAt: Date.now(),
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

/** Create a new order (from student side) */
export async function createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) {
  try {
    const ordersRef = collection(db, 'orders')
    const docRef = await addDoc(ordersRef, {
      ...orderData,
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

/** Get orders for a merchant (with latest first) */
export async function getMerchantOrders(merchantId: string): Promise<Order[]> {
  try {
    const ordersRef = collection(db, 'orders')
    const q = query(
      ordersRef,
      where('merchantId', '==', merchantId),
      orderBy('createdAt', 'desc')
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
export function subscribeToCustomerOrders(customerId: string, callback: (orders: Order[]) => void) {
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

/** Subscribe to live updates for a single order */
export function subscribeToOrder(orderId: string, callback: (order: Order | null) => void) {
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