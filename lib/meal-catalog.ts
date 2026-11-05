import type { MenuItem, Restaurant } from './data'

/** Meal categories for the Eat (Meals) home page and meal category pages. */
export type MealCategory = {
  id: string
  title: string
  line1: string
  line2: string
  icon: string
  bg: string
  subcategories: string[]
  keywords: string[]
}

export const MEAL_CATEGORIES: MealCategory[] = [
  {
    id: 'meal-burgers',
    title: 'Burgers',
    line1: 'Burgers',
    line2: '',
    icon: '/categories/meal-burgers.svg',
    bg: '#fbd6aa',
    subcategories: ['Chicken Burgers', 'Beef Burgers', 'Combos'],
    keywords: ['burger', 'patty', 'sliders'],
  },
  {
    id: 'meal-kotas',
    title: 'Kotas & Chips',
    line1: 'Kotas &',
    line2: 'Chips',
    icon: '/categories/meal-kotas.svg',
    bg: '#fbe58f',
    subcategories: ['Full House Kotas', 'Loaded Chips', 'Vetkoek'],
    keywords: ['kota', 'chips', 'fries', 'vetkoek', 'russian'],
  },
  {
    id: 'meal-chicken',
    title: 'Chicken',
    line1: 'Chicken',
    line2: '',
    icon: '/categories/meal-chicken.svg',
    bg: '#fbbbbb',
    subcategories: ['Flame-Grilled', 'Wings & Strips', 'Sharing'],
    keywords: ['chicken', 'wings', 'quarter', 'peri-peri', 'strips'],
  },
  {
    id: 'meal-pizza',
    title: 'Pizza',
    line1: 'Pizza',
    line2: '',
    icon: '/categories/meal-pizza.svg',
    bg: '#f8c9a0',
    subcategories: ['Classic Pizzas', 'Meat Lovers', 'Vegetarian'],
    keywords: ['pizza', 'margherita', 'pepperoni'],
  },
  {
    id: 'meal-bowls',
    title: 'Bowls & Salads',
    line1: 'Bowls &',
    line2: 'Salads',
    icon: '/categories/meal-bowls.svg',
    bg: '#c3e4af',
    subcategories: ['Rice & Poke Bowls', 'Fresh Salads', 'Noodle Bowls'],
    keywords: ['bowl', 'salad', 'poke', 'ramen', 'noodle'],
  },
  {
    id: 'meal-wraps',
    title: 'Wraps & Drinks',
    line1: 'Wraps &',
    line2: 'Drinks',
    icon: '/categories/meal-wraps.svg',
    bg: '#d9ccf5',
    subcategories: ['Wraps & Tacos', 'Coffee & Bakery', 'Cold Drinks'],
    keywords: ['wrap', 'taco', 'coffee', 'latte', 'drink', 'croissant'],
  },
]

export type MealEntry = { item: MenuItem; store: Restaurant }

export function mealMatchesCategory(item: MenuItem, cat: MealCategory): boolean {
  const sec = (item.section || '').toLowerCase()
  if (sec === cat.title.toLowerCase()) return true
  const hay = `${sec} ${item.subcategory || ''} ${item.name}`.toLowerCase()
  return cat.keywords.some((kw) => hay.includes(kw))
}

/** Flattens every meal across the given restaurants into card entries with a resolved image. */
export function collectMeals(stores: Restaurant[]): MealEntry[] {
  const list: MealEntry[] = []
  const seen = new Set<string>()
  for (const store of stores) {
    for (const item of store.menu || []) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      list.push({
        item: { ...item, image: item.image || store.image || '/food/featured-burger.jpg' },
        store,
      })
    }
  }
  return list
}
