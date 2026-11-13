import type { Coordinates } from './location'

export type Campus = {
  id: string
  name: string
  short: string
  location: string
}

export type ModifierOption = {
  id: string
  label: string
  price: number
}

export type ModifierGroup = {
  id: string
  title: string
  required: boolean
  type: 'single' | 'multi'
  options: ModifierOption[]
}

export type MenuItem = {
  id: string
  name: string
  description: string
  price: number
  image: string
  section: string
  popular?: boolean
  modifiers?: ModifierGroup[]
  /** Grocery-only: pack size label, e.g. "700g" or "2L" */
  size?: string
  /** Grocery-only: original price when the item is on special */
  oldPrice?: number
  /** Grocery-only: sub-aisle inside a department, e.g. "Milk & Dairy" */
  subcategory?: string
}

export type StoreType = 'restaurant' | 'grocery'

export type Restaurant = {
  id: string
  name: string
  cuisine: string
  image: string
  rating: number
  reviews: number
  pickupTime: string
  deliveryFee?: string
  distance?: string
  priceLevel: string
  location: string
  open: boolean
  campusIds: string[]
  storeType?: StoreType
  coords?: Coordinates
  deliveryRadiusKm?: number
  menu: MenuItem[]
}

export const campuses: Campus[] = [
  { id: 'doornfontein', name: 'Doornfontein Campus', short: 'DFC', location: 'Doornfontein' },
  { id: 'aucklandpark', name: 'Auckland Park Campus', short: 'APK', location: 'Auckland Park' },
  { id: 'braamfontein', name: 'Braamfontein Central', short: 'BRM', location: 'Braamfontein' },
  { id: 'soweto', name: 'Soweto Campus', short: 'SWC', location: 'Soweto' },
  { id: 'buntingroad', name: 'Bunting Road Campus', short: 'BRC', location: 'Auckland Park' },
  { id: 'melville', name: 'Melville Hub', short: 'MLV', location: 'Melville' },
  { id: 'rosebank', name: 'Rosebank Central', short: 'RSB', location: 'Rosebank' },
  { id: 'sandton', name: 'Sandton City Area', short: 'SND', location: 'Sandton' },
  { id: 'newtown', name: 'Newtown Junction', short: 'NWT', location: 'Newtown' },
  { id: 'hatfield', name: 'Hatfield Hub', short: 'HTF', location: 'Pretoria' },
]

export const categories = [
  'All',
  'Burgers',
  'Kotas',
  'Chicken',
  'Pizza',
  'Shisa Nyama',
  'Vetkoek',
  'Bowls',
  'Wraps',
  'Breakfast',
  'Drinks',
  'Salads',
  'Desserts',
]

export const groceryCategories = [
  'All',
  'Bread & Milk',
  'Fresh Produce',
  'Butcher',
  'Snacks & Drinks',
  'Pantry & Essentials',
  'Household',
]

export const GROCERY_CATEGORY_KEYWORDS = [
  'bread & milk',
  'bread',
  'milk',
  'dairy',
  'fresh produce',
  'produce',
  'fruit',
  'vegetable',
  'butcher',
  'butchery',
  'meat',
  'spaza',
  'grocery',
  'groceries',
  'snacks & drinks',
  'snacks',
  'pantry',
  'supermarket',
  'household',
]

export function isGroceryCategory(text: string | undefined | null): boolean {
  if (!text) return false
  const lower = text.toLowerCase().trim()
  return GROCERY_CATEGORY_KEYWORDS.some((kw) => lower.includes(kw))
}

export const defaultRestaurants: Restaurant[] = []

export const defaultGroceryStores: Restaurant[] = []

export const restaurants: Restaurant[] = []

export const trendingMeals: {
  id: string
  name: string
  restaurant: string
  restaurantId: string
  price: number
  image: string
}[] = []

export function formatPrice(value: number) {
  return `R ${value.toFixed(2)}`
}
