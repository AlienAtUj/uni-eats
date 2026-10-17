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
}

export type Restaurant = {
  id: string
  name: string
  cuisine: string
  image: string
  rating: number
  reviews: number
  pickupTime: string
  priceLevel: string
  location: string
  open: boolean
  campusIds: string[]
  menu: MenuItem[]
}

export const campuses: Campus[] = [
  { id: 'aucklandpark', name: 'Auckland Park Campus', short: 'APK', location: 'Auckland Park' },
  { id: 'doornfontein', name: 'Doornfontein Campus', short: 'DFC', location: 'Doornfontein' },
  { id: 'soweto', name: 'Soweto Campus', short: 'SWC', location: 'Soweto' },
  { id: 'buntingroad', name: 'Bunting Road Campus', short: 'BRC', location: 'Auckland Park' },
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

const proteinGroup: ModifierGroup = {
  id: 'protein',
  title: 'Choose your protein',
  required: true,
  type: 'single',
  options: [
    { id: 'grilled-chicken', label: 'Grilled Chicken', price: 0 },
    { id: 'crispy-tofu', label: 'Crispy Tofu', price: 0 },
    { id: 'steak', label: 'Seared Steak', price: 25.00 },
    { id: 'salmon', label: 'Salmon', price: 30.00 },
    { id: 'shisa-chicken', label: 'Shisa Nyama Chicken', price: 20.00 },
  ],
}

const extrasGroup: ModifierGroup = {
  id: 'extras',
  title: 'Add extras',
  required: false,
  type: 'multi',
  options: [
    { id: 'avocado', label: 'Avocado', price: 15.00 },
    { id: 'cheese', label: 'Extra Cheese', price: 10.00 },
    { id: 'egg', label: 'Fried Egg', price: 12.50 },
    { id: 'bacon', label: 'Bacon', price: 17.50 },
    { id: 'chakalaka', label: 'Chakalaka Relish', price: 8.00 },
  ],
}

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