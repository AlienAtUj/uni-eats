import { buildDashMarket } from './grocery-catalog'

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

const allAreaIds = campuses.map((c) => c.id)

export const defaultRestaurants: Restaurant[] = [
  {
    id: 'sml-restaurant-default',
    name: 'SML Restaurant',
    cuisine: 'Burgers, Kotas & Grill',
    image: '/food/featured-burger.jpg',
    rating: 5.0,
    reviews: 28,
    pickupTime: '10-15 min',
    deliveryFee: 'R15 delivery',
    distance: '0.6 km',
    priceLevel: 'R 59.95',
    location: 'Near You',
    open: true,
    campusIds: allAreaIds,
    storeType: 'restaurant',
    menu: [
      {
        id: 'sml-crumbed-chicken-burger',
        name: 'Crumbed chicken burger & fries',
        description: 'Crispy golden crumbed chicken breast with melted cheddar, fresh tomato, lettuce and seasoned fries.',
        price: 59.95,
        oldPrice: 69.95,
        size: 'Combo Meal',
        image: '/food/featured-burger.jpg',
        section: 'Burgers',
        subcategory: 'Chicken Burgers',
        popular: true,
      },
      {
        id: 'sml-double-cheese-burger',
        name: 'Double Smash Cheese Burger',
        description: 'Two flame-seared beef patties with double cheddar, pickles, caramelized onions and house burger sauce.',
        price: 74.95,
        size: 'Regular + Chips',
        image: '/food/burger.png',
        section: 'Burgers',
        subcategory: 'Beef Burgers',
        popular: true,
      },
      {
        id: 'sml-bbq-bacon-burger',
        name: 'Smoky BBQ Burger Box',
        description: 'Grilled patty topped with crispy macon, cheddar slice, smoky BBQ glaze and large golden fries.',
        price: 79.95,
        oldPrice: 89.95,
        size: 'Box Meal',
        image: '/food/featured-burger.jpg',
        section: 'Burgers',
        subcategory: 'Combos',
      },
      {
        id: 'sml-kota-deluxe',
        name: 'Full House Kota Deluxe',
        description: 'Freshly hollowed quarter loaf loaded with golden chips, Russian, cheese, egg, polony, and tangy atchar.',
        price: 54.95,
        oldPrice: 62.95,
        size: 'Quarter Loaf',
        image: '/food/burger.png',
        section: 'Kotas & Chips',
        subcategory: 'Full House Kotas',
        popular: true,
      },
      {
        id: 'sml-loaded-cheese-fries',
        name: 'Loaded Cheese & Saucy Chips',
        description: 'Large crispy potato chips smothered in melted cheddar sauce and smoky grill spices.',
        price: 39.95,
        size: 'Large Share',
        image: '/food/fries.png',
        section: 'Kotas & Chips',
        subcategory: 'Loaded Chips',
        popular: true,
      },
      {
        id: 'sml-beef-kota',
        name: 'Steak & Egg Dagwood Kota',
        description: 'Quarter loaf packed with tender Masala steak strips, fried egg, cheddar cheese, chips and sauce.',
        price: 64.95,
        size: 'Quarter Loaf',
        image: '/food/featured-burger.jpg',
        section: 'Kotas & Chips',
        subcategory: 'Full House Kotas',
      },
      {
        id: 'sml-flame-chicken',
        name: 'Flame-Grilled Quarter Chicken & Chips',
        description: 'Basted in peri-peri or lemon & herb, served with crispy regular fries and a freshly baked roll.',
        price: 69.95,
        oldPrice: 78.95,
        size: 'Quarter + Chips',
        image: '/food/fries.png',
        section: 'Chicken',
        subcategory: 'Flame-Grilled',
        popular: true,
      },
      {
        id: 'sml-peri-wings',
        name: '6 Crispy Peri-Peri Chicken Wings',
        description: 'Six juicy chicken wings tossed in tangy peri-peri glaze with dipping sauce.',
        price: 58.95,
        size: '6 Piece',
        image: '/food/featured-burger.jpg',
        section: 'Chicken',
        subcategory: 'Wings & Strips',
      },
      {
        id: 'sml-half-chicken-share',
        name: 'Half Chicken & Family Chips',
        description: 'Flame-grilled half chicken basted to perfection with large family fries and two rolls.',
        price: 119.95,
        size: 'Half Chicken',
        image: '/food/burger.png',
        section: 'Chicken',
        subcategory: 'Sharing',
      },
      {
        id: 'sml-woodfired-pizza',
        name: 'Wood-Fired Margherita & Basil Pizza',
        description: 'Hand-stretched sourdough base with San Marzano tomato sauce, fresh mozzarella and sweet basil.',
        price: 79.95,
        oldPrice: 89.95,
        size: 'Large 30cm',
        image: '/food/pizza.png',
        section: 'Pizza',
        subcategory: 'Classic Pizzas',
        popular: true,
      },
      {
        id: 'sml-bbq-chicken-pizza',
        name: 'BBQ Chicken & Peppadew Pizza',
        description: 'Roasted chicken strips, sweet piquanté peppers, red onion and stretchy mozzarella.',
        price: 94.95,
        size: 'Large 30cm',
        image: '/food/pizza.png',
        section: 'Pizza',
        subcategory: 'Meat Lovers',
      },
      {
        id: 'sml-salmon-poke-bowl',
        name: 'Fresh Avocado & Protein Harvest Bowl',
        description: 'Seasoned sushi rice topped with ripe avocado, edamame, pickled carrot, cucumber and sesame dressing.',
        price: 84.95,
        size: 'Regular Bowl',
        image: '/food/bowl.png',
        section: 'Bowls & Salads',
        subcategory: 'Rice & Poke Bowls',
        popular: true,
      },
      {
        id: 'sml-caesar-salad',
        name: 'Grilled Chicken Caesar Salad',
        description: 'Chargrilled chicken breast over crisp romaine lettuce, herb croutons, shaved parmesan and Caesar dressing.',
        price: 68.95,
        size: 'Regular Bowl',
        image: '/food/salad.png',
        section: 'Bowls & Salads',
        subcategory: 'Fresh Salads',
      },
      {
        id: 'sml-ramen-bowl',
        name: 'Rich Miso Noodle & Egg Bowl',
        description: 'Steaming broth with wheat noodles, soft-boiled egg, spring onion, nori and tender glazed slices.',
        price: 76.95,
        size: 'Large Bowl',
        image: '/food/ramen.png',
        section: 'Bowls & Salads',
        subcategory: 'Noodle Bowls',
      },
      {
        id: 'sml-grilled-tacos',
        name: '3 Chargrilled Steak Street Tacos',
        description: 'Three soft tortillas filled with flame-grilled steak, fresh salsa, coriander and lime crema.',
        price: 69.95,
        oldPrice: 79.95,
        size: '3 Tacos',
        image: '/food/tacos.png',
        section: 'Wraps & Drinks',
        subcategory: 'Wraps & Tacos',
        popular: true,
      },
      {
        id: 'sml-iced-latte-combo',
        name: 'Iced Caramel Latte & Butter Croissant',
        description: 'Double-shot iced espresso over cold milk paired with a flaky freshly baked French croissant.',
        price: 49.95,
        size: 'Combo',
        image: '/food/coffee.png',
        section: 'Wraps & Drinks',
        subcategory: 'Coffee & Bakery',
        popular: true,
      },
    ],
  },
  {
    id: 'campus-flame-kitchen',
    name: 'Campus Flame & Pizza',
    cuisine: 'Wood-Fired Pizza, Wings & Bowls',
    image: '/food/pizza.png',
    rating: 4.9,
    reviews: 46,
    pickupTime: '15-20 min',
    deliveryFee: 'R12 delivery',
    distance: '0.8 km',
    priceLevel: 'R 68.95',
    location: 'Near You',
    open: true,
    campusIds: allAreaIds,
    storeType: 'restaurant',
    menu: [
      {
        id: 'cfk-pepperoni-pizza',
        name: 'Double Pepperoni & Mozzarella Pizza',
        description: 'Crispy thin crust loaded with smoky pepperoni and bubbling mozzarella cheese.',
        price: 89.95,
        size: 'Large 30cm',
        image: '/food/pizza.png',
        section: 'Pizza',
        subcategory: 'Meat Lovers',
        popular: true,
      },
      {
        id: 'cfk-teriyaki-bowl',
        name: 'Teriyaki Glazed Rice Bowl',
        description: 'Steamed jasmine rice with teriyaki chicken, avocado, edamame and toasted sesame.',
        price: 74.95,
        size: 'Regular Bowl',
        image: '/food/bowl.png',
        section: 'Bowls & Salads',
        subcategory: 'Rice & Poke Bowls',
        popular: true,
      },
      {
        id: 'cfk-chicken-tacos',
        name: 'Crispy Chicken & Avocado Tacos',
        description: 'Soft tortillas with crunchy chicken strips, smashed avo, pico de gallo and chipotle mayo.',
        price: 64.95,
        size: '3 Tacos',
        image: '/food/tacos.png',
        section: 'Wraps & Drinks',
        subcategory: 'Wraps & Tacos',
      },
    ],
  },
]

export const defaultGroceryStores: Restaurant[] = [
  buildDashMarket(allAreaIds),
  {
    id: 'doornfontein-spaza',
    name: 'Doornfontein Spaza',
    cuisine: 'Groceries & Essentials',
    image: '/food/spaza-store.jpg',
    rating: 4.9,
    reviews: 42,
    pickupTime: '10-15 min',
    deliveryFee: 'R10 delivery',
    distance: '0.4 km',
    priceLevel: 'R 18.99',
    location: 'Near You',
    open: true,
    campusIds: allAreaIds,
    storeType: 'grocery',
    menu: [
      {
        id: 'spaza-albany-bread',
        name: 'Albany Superior Sliced White Bread',
        size: '700g',
        description: 'Freshly baked everyday sliced white loaf.',
        price: 18.99,
        image: '/products/white-bread.jpg',
        section: 'Bread & Milk',
        popular: true,
      },
      {
        id: 'spaza-fresh-milk-2l',
        name: 'Full Cream Fresh Milk',
        size: '2L',
        description: 'Pasteurized full cream fresh cow milk 2 litre bottle.',
        price: 34.99,
        image: '/products/full-cream-milk.jpg',
        section: 'Bread & Milk',
        popular: true,
      },
      {
        id: 'spaza-eggs-18',
        name: 'Large Farm Eggs',
        size: '18 Pack',
        description: 'Grade 1 large free-range farm eggs tray.',
        price: 54.99,
        image: '/products/large-eggs.jpg',
        section: 'Bread & Milk',
      },
      {
        id: 'spaza-ace-maize-meal',
        name: 'Ace Super Maize Meal',
        size: '2.5kg',
        description: 'Enriched super white maize meal for staple pap.',
        price: 36.99,
        image: '/products/maize-meal.svg',
        section: 'Pantry & Essentials',
      },
      {
        id: 'spaza-dlite-oil',
        name: "D'Lite Pure Sunflower Oil",
        size: '2L',
        description: 'Cholesterol-free pure sunflower cooking oil.',
        price: 64.99,
        image: '/products/sunflower-oil.svg',
        section: 'Pantry & Essentials',
      },
      {
        id: 'spaza-black-cat',
        name: 'Black Cat Crunchy Peanut Butter',
        size: '400g',
        description: 'Protein-rich roasted peanut butter spread.',
        price: 39.99,
        image: '/products/peanut-butter.svg',
        section: 'Pantry & Essentials',
      },
      {
        id: 'spaza-koo-beans',
        name: 'Koo Baked Beans in Tomato Sauce',
        size: '410g',
        description: 'Classic South African baked beans in rich tomato sauce.',
        price: 16.99,
        image: '/products/baked-beans.svg',
        section: 'Pantry & Essentials',
      },
      {
        id: 'spaza-simba-chips',
        name: 'Simba Potato Chips Large',
        size: '120g',
        description: 'Crispy flavoured potato chips (Chutney / Mexican Chilli / Cheese & Onion).',
        price: 21.99,
        image: '/products/potato-chips.svg',
        section: 'Snacks & Drinks',
      },
      {
        id: 'spaza-valpre-water',
        name: 'Valpré Still Spring Water',
        size: '1.5L',
        description: 'Chilled natural still spring water.',
        price: 14.99,
        image: '/products/still-water.svg',
        section: 'Snacks & Drinks',
      },
    ],
  },
  {
    id: 'campus-butchery',
    name: 'Campus Butchery',
    cuisine: 'Butcher & Braai Cuts',
    image: '/food/butchery-store.jpg',
    rating: 4.9,
    reviews: 36,
    pickupTime: '15-20 min',
    deliveryFee: 'R15 delivery',
    distance: '0.7 km',
    priceLevel: 'R 69.95',
    location: 'Near You',
    open: true,
    campusIds: allAreaIds,
    storeType: 'grocery',
    menu: [
      {
        id: 'butcher-tbone-steak',
        name: 'Prime Aged T-Bone Steak',
        size: '500g',
        description: 'Thick-cut marbled beef T-bone steak, ideal for pan searing or braai.',
        price: 89.95,
        image: '/products/tbone-steak.svg',
        section: 'Butcher',
        popular: true,
      },
      {
        id: 'butcher-boerewors',
        name: 'Traditional Farm Boerewors',
        size: '500g',
        description: 'Spiced with roasted coriander and cloves, made from 90% prime beef & pork.',
        price: 69.95,
        image: '/products/boerewors.svg',
        section: 'Butcher',
        popular: true,
      },
      {
        id: 'butcher-ribeye',
        name: 'Lean Beef Mince',
        size: '500g',
        description: 'Freshly ground lean beef mince.',
        price: 59.95,
        image: '/products/beef-mince.svg',
        section: 'Butcher',
      },
      {
        id: 'butcher-pork-chops',
        name: 'Thick-Cut Pork Loin Chops',
        size: '4 Pack',
        description: 'Freshly sliced tender pork loin chops.',
        price: 74.95,
        image: '/products/pork-chops.svg',
        section: 'Butcher',
      },
      {
        id: 'butcher-chicken-pack',
        name: 'Free-Range Braai Chicken Pack',
        size: '1kg',
        description: 'Mixed chicken thighs and drumsticks ready for the grill.',
        price: 64.95,
        image: '/products/chicken-braai-pack.svg',
        section: 'Butcher',
      },
    ],
  },
  {
    id: 'green-market-produce',
    name: 'Fresh Green Grocer',
    cuisine: 'Fresh Produce & Fruit',
    image: '/food/salad.png',
    rating: 4.8,
    reviews: 19,
    pickupTime: '10-15 min',
    deliveryFee: 'R12 delivery',
    distance: '0.9 km',
    priceLevel: 'R 24.99',
    location: 'Near You',
    open: true,
    campusIds: allAreaIds,
    storeType: 'grocery',
    menu: [
      {
        id: 'produce-spinach-tomato',
        name: 'Fresh Spinach Bunch',
        size: 'Bunch',
        description: 'Crisp organic spinach bunch washed and ready to cook.',
        price: 18.99,
        image: '/products/spinach.svg',
        section: 'Fresh Produce',
        popular: true,
      },
      {
        id: 'produce-avocados',
        name: 'Ripe Hass Avocados',
        size: '4 Pack',
        description: 'Ready-to-eat creamy avocados.',
        price: 42.99,
        image: '/products/avocados.svg',
        section: 'Fresh Produce',
      },
      {
        id: 'produce-fruit-bag',
        name: 'Crisp Red Apples Pack',
        size: '1.5kg',
        description: 'Sweet and crunchy red apples pack.',
        price: 34.99,
        image: '/products/red-apples.svg',
        section: 'Fresh Produce',
      },
    ],
  },
]

export const restaurants: Restaurant[] = [
  ...defaultRestaurants,
  ...defaultGroceryStores,
]

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
