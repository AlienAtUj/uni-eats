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
  'Bowls',
  'Burgers',
  'Ramen',
  'Pizza',
  'Tacos',
  'Coffee',
  'Salads',
  'Shisa Nyama',
  'Vetkoek',
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

export const restaurants: Restaurant[] = [
  {
    id: 'green-bowl',
    name: 'The Green Bowl',
    cuisine: 'Healthy Bowls',
    image: '/food/bowl.png',
    rating: 4.8,
    reviews: 1240,
    pickupTime: '10-15 min',
    priceLevel: 'R 80-150',
    location: 'Auckland Park',
    open: true,
    campusIds: ['aucklandpark', 'buntingroad'],
    menu: [
      {
        id: 'poke-bowl',
        name: 'Signature Poke Bowl',
        description: 'Sushi rice, salmon, avocado, edamame, sesame dressing.',
        price: 125.00,
        image: '/food/bowl.png',
        section: 'Signature Bowls',
        popular: true,
        modifiers: [proteinGroup, extrasGroup],
      },
      {
        id: 'caesar',
        name: 'Grilled Chicken Caesar',
        description: 'Crisp romaine, parmesan, herbed croutons, caesar dressing.',
        price: 100.00,
        image: '/food/salad.png',
        section: 'Salads',
        modifiers: [extrasGroup],
      },
      {
        id: 'harvest',
        name: 'Harvest Grain Bowl',
        description: 'Quinoa, roasted veg, chickpeas, tahini drizzle.',
        price: 112.50,
        image: '/food/bowl.png',
        section: 'Signature Bowls',
        modifiers: [proteinGroup, extrasGroup],
      },
    ],
  },
  {
    id: 'campus-grill',
    name: 'Campus Grill',
    cuisine: 'Burgers & Fries',
    image: '/food/burger.png',
    rating: 4.7,
    reviews: 2130,
    pickupTime: '12-18 min',
    priceLevel: 'R 60-120',
    location: 'Doornfontein',
    open: true,
    campusIds: ['doornfontein', 'aucklandpark'],
    menu: [
      {
        id: 'classic-burger',
        name: 'Classic Chicken Burger',
        description: 'Grilled chicken, lettuce, tomato, melted cheese, brioche bun.',
        price: 97.50,
        image: '/food/burger.png',
        section: 'Burgers',
        popular: true,
        modifiers: [extrasGroup],
      },
      {
        id: 'loaded-fries',
        name: 'Loaded Cheese Fries',
        description: 'Crispy fries, melted cheese, fresh herbs.',
        price: 55.00,
        image: '/food/fries.png',
        section: 'Sides',
        modifiers: [extrasGroup],
      },
    ],
  },
  {
    id: 'noodle-house',
    name: 'Noodle House',
    cuisine: 'Ramen & Asian',
    image: '/food/ramen.png',
    rating: 4.9,
    reviews: 980,
    pickupTime: '15-20 min',
    priceLevel: 'R 70-140',
    location: 'Soweto',
    open: true,
    campusIds: ['soweto', 'doornfontein'],
    menu: [
      {
        id: 'tonkotsu',
        name: 'Tonkotsu Ramen',
        description: 'Rich pork broth, soft egg, chashu, scallions, nori.',
        price: 130.00,
        image: '/food/ramen.png',
        section: 'Ramen',
        popular: true,
        modifiers: [proteinGroup, extrasGroup],
      },
    ],
  },
  {
    id: 'pizza-corner',
    name: 'Pizza Corner',
    cuisine: 'Wood-Fired Pizza',
    image: '/food/pizza.png',
    rating: 4.6,
    reviews: 1560,
    pickupTime: '18-25 min',
    priceLevel: 'R 65-135',
    location: 'Auckland Park',
    open: false,
    campusIds: ['aucklandpark'],
    menu: [
      {
        id: 'margherita',
        name: 'Margherita',
        description: 'San Marzano tomato, fresh mozzarella, basil.',
        price: 110.00,
        image: '/food/pizza.png',
        section: 'Pizza',
        popular: true,
        modifiers: [extrasGroup],
      },
    ],
  },
  {
    id: 'taco-stand',
    name: 'Taco Stand',
    cuisine: 'Mexican Street Food',
    image: '/food/tacos.png',
    rating: 4.8,
    reviews: 870,
    pickupTime: '8-12 min',
    priceLevel: 'R 40-80',
    location: 'Doornfontein',
    open: true,
    campusIds: ['doornfontein', 'soweto'],
    menu: [
      {
        id: 'steak-tacos',
        name: 'Street Steak Tacos',
        description: 'Three tacos, grilled steak, onion, cilantro, lime.',
        price: 85.00,
        image: '/food/tacos.png',
        section: 'Tacos',
        popular: true,
        modifiers: [extrasGroup],
      },
    ],
  },
  {
    id: 'brew-bites',
    name: 'Brew & Bites',
    cuisine: 'Coffee & Pastries',
    image: '/food/coffee.png',
    rating: 4.7,
    reviews: 2310,
    pickupTime: '5-10 min',
    priceLevel: 'R 25-60',
    location: 'Bunting Road',
    open: true,
    campusIds: ['buntingroad', 'aucklandpark', 'soweto'],
    menu: [
      {
        id: 'iced-latte',
        name: 'Iced Latte & Croissant',
        description: 'House espresso over ice with a buttery croissant.',
        price: 67.50,
        image: '/food/coffee.png',
        section: 'Coffee',
        popular: true,
      },
    ],
  },
  {
    id: 'shisa-nyama-spot',
    name: 'Shisa Nyama Spot',
    cuisine: 'Traditional Braai',
    image: '/food/braai.png',
    rating: 4.9,
    reviews: 1540,
    pickupTime: '20-30 min',
    priceLevel: 'R 70-180',
    location: 'Soweto',
    open: true,
    campusIds: ['soweto'],
    menu: [
      {
        id: 'shisa-platter',
        name: 'Shisa Nyama Platter',
        description: 'Grilled beef, chicken, boerewors, pap, and chakalaka.',
        price: 160.00,
        image: '/food/braai.png',
        section: 'Shisa Nyama',
        popular: true,
        modifiers: [extrasGroup],
      },
      {
        id: 'vetkoek-mince',
        name: 'Vetkoek with Mince',
        description: 'Golden fried dough filled with spicy beef mince.',
        price: 45.00,
        image: '/food/vetkoek.png',
        section: 'Vetkoek',
        popular: true,
      },
    ],
  },
]

export const trendingMeals: {
  id: string
  name: string
  restaurant: string
  restaurantId: string
  price: number
  image: string
}[] = [
  { id: 'poke-bowl', name: 'Signature Poke Bowl', restaurant: 'The Green Bowl', restaurantId: 'green-bowl', price: 125.00, image: '/food/bowl.png' },
  { id: 'tonkotsu', name: 'Tonkotsu Ramen', restaurant: 'Noodle House', restaurantId: 'noodle-house', price: 130.00, image: '/food/ramen.png' },
  { id: 'classic-burger', name: 'Classic Chicken Burger', restaurant: 'Campus Grill', restaurantId: 'campus-grill', price: 97.50, image: '/food/burger.png' },
  { id: 'steak-tacos', name: 'Street Steak Tacos', restaurant: 'Taco Stand', restaurantId: 'taco-stand', price: 85.00, image: '/food/tacos.png' },
  { id: 'shisa-platter', name: 'Shisa Nyama Platter', restaurant: 'Shisa Nyama Spot', restaurantId: 'shisa-nyama-spot', price: 160.00, image: '/food/braai.png' },
]

export function formatPrice(value: number) {
  return `R ${value.toFixed(2)}`
}