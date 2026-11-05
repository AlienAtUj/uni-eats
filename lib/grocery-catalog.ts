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

const RAW: P[] = [
  // Bread & Milk
  { id: 'white-bread', name: 'Sliced White Bread', size: '700g', price: 18.99, dept: 'Bread & Milk', sub: 'Bread & Bakery', desc: 'Soft, freshly baked everyday sliced white loaf.', popular: true },
  { id: 'brown-bread', name: 'Sliced Brown Bread', size: '700g', price: 17.49, dept: 'Bread & Milk', sub: 'Bread & Bakery', desc: 'Wholesome sliced brown loaf, baked daily.' },
  { id: 'bread-rolls', name: 'Soft White Rolls', size: '6 Pack', price: 16.99, dept: 'Bread & Milk', sub: 'Bread & Bakery', desc: 'Fluffy white rolls – perfect for boerie rolls.' },
  { id: 'full-cream-milk', name: 'Full Cream Fresh Milk', size: '2L', price: 34.99, oldPrice: 38.99, dept: 'Bread & Milk', sub: 'Milk & Dairy', desc: 'Pasteurised full cream fresh milk.', popular: true },
  { id: 'low-fat-milk', name: 'Low Fat Fresh Milk', size: '1L', price: 19.99, dept: 'Bread & Milk', sub: 'Milk & Dairy', desc: 'Pasteurised 2% low fat fresh milk.' },
  { id: 'cheddar-cheese', name: 'Mature Cheddar Cheese', size: '400g', price: 69.99, oldPrice: 79.99, dept: 'Bread & Milk', sub: 'Milk & Dairy', desc: 'Rich, mature cheddar cheese block.' },
  { id: 'yoghurt', name: 'Double Cream Plain Yoghurt', size: '1kg', price: 42.99, dept: 'Bread & Milk', sub: 'Milk & Dairy', desc: 'Thick and creamy plain yoghurt.' },
  { id: 'butter', name: 'Salted Butter', size: '500g', price: 64.99, dept: 'Bread & Milk', sub: 'Milk & Dairy', desc: 'Creamy salted farm butter.' },
  { id: 'large-eggs', name: 'Large Free Range Eggs', size: '18 Pack', price: 54.99, dept: 'Bread & Milk', sub: 'Eggs', desc: 'Grade 1 large free range eggs.', popular: true },

  // Fresh Produce
  { id: 'bananas', name: 'Bananas', size: 'per kg', price: 24.99, dept: 'Fresh Produce', sub: 'Fruit', desc: 'Sweet, ripe bananas.', popular: true },
  { id: 'red-apples', name: 'Red Apples', size: '1.5kg', price: 34.99, dept: 'Fresh Produce', sub: 'Fruit', desc: 'Crisp and juicy red apples.' },
  { id: 'avocados', name: 'Ripe & Ready Avocados', size: '4 Pack', price: 42.99, dept: 'Fresh Produce', sub: 'Fruit', desc: 'Creamy Hass avocados, ready to eat.' },
  { id: 'tomatoes', name: 'Ripe Tomatoes', size: '1kg', price: 22.99, oldPrice: 27.99, dept: 'Fresh Produce', sub: 'Vegetables', desc: 'Juicy red tomatoes.', popular: true },
  { id: 'potatoes', name: 'Potatoes', size: '2kg', price: 39.99, dept: 'Fresh Produce', sub: 'Vegetables', desc: 'All-rounder potatoes for chips, mash or roast.' },
  { id: 'onions', name: 'Brown Onions', size: '1kg', price: 19.99, dept: 'Fresh Produce', sub: 'Vegetables', desc: 'Everyday brown onions.' },
  { id: 'spinach', name: 'Fresh Spinach', size: 'Bunch', price: 14.99, dept: 'Fresh Produce', sub: 'Vegetables', desc: 'Crisp, fresh spinach bunch.' },
  { id: 'carrots', name: 'Carrots', size: '1kg', price: 16.99, dept: 'Fresh Produce', sub: 'Vegetables', desc: 'Sweet, crunchy carrots.' },

  // Butcher
  { id: 'tbone-steak', name: 'Prime Aged T-Bone Steak', size: '500g', price: 89.95, dept: 'Butcher', sub: 'Beef', desc: 'Thick-cut marbled T-bone, ideal for the braai.', popular: true },
  { id: 'beef-mince', name: 'Lean Beef Mince', size: '500g', price: 59.95, dept: 'Butcher', sub: 'Beef', desc: 'Freshly minced lean beef.' },
  { id: 'chicken-braai-pack', name: 'Chicken Braai Pack', size: '1kg', price: 64.95, dept: 'Butcher', sub: 'Chicken', desc: 'Thighs and drumsticks ready for the grill.' },
  { id: 'chicken-fillets', name: 'Chicken Breast Fillets', size: '1kg', price: 89.99, dept: 'Butcher', sub: 'Chicken', desc: 'Skinless, boneless chicken breast fillets.' },
  { id: 'boerewors', name: 'Traditional Boerewors', size: '500g', price: 69.95, oldPrice: 79.95, dept: 'Butcher', sub: 'Pork & Wors', desc: 'Spiced with roasted coriander and cloves.', popular: true },
  { id: 'pork-chops', name: 'Pork Loin Chops', size: '4 Pack', price: 74.95, dept: 'Butcher', sub: 'Pork & Wors', desc: 'Tender, thick-cut pork loin chops.' },

  // Snacks & Drinks
  { id: 'potato-chips', name: 'Salted Potato Chips', size: '120g', price: 21.99, dept: 'Snacks & Drinks', sub: 'Chips & Sweets', desc: 'Crispy, lightly salted potato chips.', popular: true },
  { id: 'chocolate-bar', name: 'Milk Chocolate Slab', size: '80g', price: 19.99, dept: 'Snacks & Drinks', sub: 'Chips & Sweets', desc: 'Smooth and creamy milk chocolate.' },
  { id: 'cola', name: 'Cola Soft Drink', size: '2L', price: 24.99, oldPrice: 29.99, dept: 'Snacks & Drinks', sub: 'Cold Drinks', desc: 'Ice-cold classic cola.', popular: true },
  { id: 'energy-drink', name: 'Energy Drink', size: '500ml', price: 17.99, dept: 'Snacks & Drinks', sub: 'Cold Drinks', desc: 'For those long study nights.' },
  { id: 'still-water', name: 'Still Spring Water', size: '1.5L', price: 14.99, dept: 'Snacks & Drinks', sub: 'Water & Juice', desc: 'Natural still spring water.' },
  { id: 'orange-juice', name: '100% Orange Juice', size: '1L', price: 27.99, dept: 'Snacks & Drinks', sub: 'Water & Juice', desc: 'No added sugar orange juice.' },

  // Pantry
  { id: 'maize-meal', name: 'Super Maize Meal', size: '2.5kg', price: 36.99, dept: 'Pantry', sub: 'Staples', desc: 'Enriched super white maize meal for pap.', popular: true },
  { id: 'white-rice', name: 'Long Grain White Rice', size: '2kg', price: 42.99, dept: 'Pantry', sub: 'Staples', desc: 'Fluffy long grain rice.' },
  { id: 'spaghetti', name: 'Spaghetti', size: '500g', price: 19.99, dept: 'Pantry', sub: 'Staples', desc: 'Durum wheat spaghetti.' },
  { id: 'sugar', name: 'White Sugar', size: '2.5kg', price: 52.99, dept: 'Pantry', sub: 'Staples', desc: 'Fine white sugar.' },
  { id: 'sunflower-oil', name: 'Sunflower Cooking Oil', size: '2L', price: 64.99, oldPrice: 72.99, dept: 'Pantry', sub: 'Cooking', desc: 'Pure sunflower cooking oil.', popular: true },
  { id: 'peanut-butter', name: 'Crunchy Peanut Butter', size: '400g', price: 39.99, dept: 'Pantry', sub: 'Breakfast & Spreads', desc: 'Roasted crunchy peanut butter.' },
  { id: 'tea-bags', name: 'Rooibos Tea Bags', size: '100 Pack', price: 44.99, dept: 'Pantry', sub: 'Breakfast & Spreads', desc: 'Proudly South African rooibos.' },
  { id: 'baked-beans', name: 'Baked Beans in Tomato Sauce', size: '410g', price: 16.99, dept: 'Pantry', sub: 'Tins', desc: 'Classic baked beans in rich tomato sauce.' },

  // Household
  { id: 'dishwashing-liquid', name: 'Dishwashing Liquid', size: '750ml', price: 29.99, dept: 'Household', sub: 'Cleaning', desc: 'Grease-cutting dishwashing liquid.' },
  { id: 'laundry-powder', name: 'Laundry Washing Powder', size: '2kg', price: 89.99, dept: 'Household', sub: 'Cleaning', desc: 'Hand & machine washing powder.' },
  { id: 'toilet-paper', name: '2-Ply Toilet Paper', size: '9 Pack', price: 69.99, oldPrice: 79.99, dept: 'Household', sub: 'Toiletries', desc: 'Soft 2-ply toilet rolls.', popular: true },
  { id: 'bath-soap', name: 'Bath Soap Bars', size: '4 Pack', price: 34.99, dept: 'Household', sub: 'Toiletries', desc: 'Gentle moisturising bath soap.' },
]

export const DASH_MARKET_PRODUCTS: MenuItem[] = RAW.map((p) => ({
  id: `dm-${p.id}`,
  name: p.name,
  description: p.desc,
  price: p.price,
  oldPrice: p.oldPrice,
  size: p.size,
  image: HAS_PHOTO.has(p.id) ? `/products/${p.id}.jpg` : `/products/${p.id}.svg`,
  section: p.dept,
  subcategory: p.sub,
  popular: p.popular,
}))

export function buildDashMarket(areaIds: string[]): Restaurant {
  return {
    id: DASH_MARKET_ID,
    name: 'Dash Market',
    cuisine: 'Groceries, Fresh Produce & Household',
    image: '/food/spaza-store.jpg',
    rating: 4.9,
    reviews: 128,
    pickupTime: '30-60 min',
    deliveryFee: 'R15 delivery',
    distance: '1.2 km',
    priceLevel: 'R 14.99',
    location: 'Near You',
    open: true,
    campusIds: areaIds,
    storeType: 'grocery',
    coords: { lat: -26.1900, lng: 28.0400 },
    deliveryRadiusKm: 15,
    menu: DASH_MARKET_PRODUCTS,
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
