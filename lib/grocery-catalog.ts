import type { MenuItem, Restaurant } from './data'

/**
 * Dash Market – the main grocery catalogue that powers the Shop home page
 * and the department (category) pages, Checkers Sixty60 style.
 */

export const DASH_MARKET_ID = 'dash-market'

export type Department = {
  id: string
  title: string
  line1: string
  line2: string
  bg: string
  icon: string
  subcategories: string[]
}

export const DEPARTMENTS: Department[] = [
  {
    id: 'bread-milk',
    title: 'Bread & Milk',
    line1: 'Bread &',
    line2: 'Milk',
    bg: '#fbd6aa',
    icon: '/categories/bread-milk.svg',
    subcategories: ['Bread & Bakery', 'Milk & Dairy', 'Eggs'],
  },
  {
    id: 'fresh-produce',
    title: 'Fresh Produce',
    line1: 'Fresh',
    line2: 'Produce',
    bg: '#c3e4af',
    icon: '/categories/fresh-produce.svg',
    subcategories: ['Fruit', 'Vegetables'],
  },
  {
    id: 'butcher',
    title: 'Butcher',
    line1: 'Butcher',
    line2: '',
    bg: '#fbbbbb',
    icon: '/categories/butcher.svg',
    subcategories: ['Beef', 'Chicken', 'Pork & Wors'],
  },
  {
    id: 'snacks-drinks',
    title: 'Snacks & Drinks',
    line1: 'Snacks &',
    line2: 'Drinks',
    bg: '#fbe58f',
    icon: '/categories/snacks-drinks.svg',
    subcategories: ['Chips & Sweets', 'Cold Drinks', 'Water & Juice'],
  },
  {
    id: 'pantry',
    title: 'Pantry',
    line1: 'Pantry',
    line2: '',
    bg: '#d9ccf5',
    icon: '/categories/pantry.svg',
    subcategories: ['Staples', 'Cooking', 'Breakfast & Spreads', 'Tins'],
  },
  {
    id: 'household',
    title: 'Household',
    line1: 'Household',
    line2: '',
    bg: '#bfe1f6',
    icon: '/categories/household.svg',
    subcategories: ['Cleaning', 'Toiletries'],
  },
]

type P = {
  id: string
  name: string
  size: string
  price: number
  oldPrice?: number
  dept: string
  sub: string
  desc: string
  popular?: boolean
}

/** Products that already have a studio packshot in /public/products. */
const HAS_PHOTO = new Set([
  'white-bread',
  'brown-bread',
  'bread-rolls',
  'full-cream-milk',
  'low-fat-milk',
  'large-eggs',
  'cheddar-cheese',
  'yoghurt',
  'butter',
])

const RAW: P[] = []

export const DASH_MARKET_PRODUCTS: MenuItem[] = []

export function buildDashMarket(areaIds: string[]): Restaurant {
  return {
    id: DASH_MARKET_ID,
    name: 'Dash Market',
    cuisine: 'Groceries, Fresh Produce & Household',
    image: '/food/spaza-store.jpg',
    rating: 5.0,
    reviews: 0,
    pickupTime: '20-30 min',
    deliveryFee: 'R15 delivery',
    distance: '1.2 km',
    priceLevel: 'R 14.99',
    location: '',
    open: true,
    campusIds: areaIds,
    storeType: 'grocery',
    coords: { lat: -26.1900, lng: 28.0400 },
    deliveryRadiusKm: 15,
    menu: [],
  }
}

export function departmentForItem(item: MenuItem): Department | undefined {
  const sec = (item.section || '').toLowerCase()
  return DEPARTMENTS.find((d) => d.title.toLowerCase() === sec)
}

export function groceryMatchesDepartment(item: MenuItem, dept: Department): boolean {
  const sec = (item.section || '').toLowerCase().trim()
  const title = dept.title.toLowerCase().trim()
  if (sec === title) return true
  if (dept.id === 'pantry' && (sec.includes('pantry') || sec.includes('essential') || sec.includes('staple') || sec.includes('grocer'))) {
    return true
  }
  if (dept.id === 'bread-milk' && (sec.includes('bread') || sec.includes('milk') || sec.includes('dairy') || sec.includes('bakery') || sec.includes('egg'))) {
    return true
  }
  if (dept.id === 'fresh-produce' && (sec.includes('produce') || sec.includes('fruit') || sec.includes('veg'))) {
    return true
  }
  if (dept.id === 'butcher' && (sec.includes('butcher') || sec.includes('meat') || sec.includes('braai'))) {
    return true
  }
  if (dept.id === 'snacks-drinks' && (sec.includes('snack') || sec.includes('drink') || sec.includes('chip') || sec.includes('sweet') || sec.includes('water'))) {
    return true
  }
  if (dept.id === 'household' && (sec.includes('household') || sec.includes('clean') || sec.includes('toiletr'))) {
    return true
  }
  return false
}

/** Collects grocery items from in-range grocery stores in shortest-distance order. */
export function collectGroceries(stores: Restaurant[]): Array<{ item: MenuItem; store: Restaurant }> {
  const list: Array<{ item: MenuItem; store: Restaurant }> = []
  const seen = new Set<string>()
  for (const store of stores) {
    for (const item of store.menu || []) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      list.push({
        item: { ...item, image: item.image || store.image || '/food/spaza-store.jpg' },
        store,
      })
    }
  }
  return list
}
