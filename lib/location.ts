/**
 * Dash Real-Time Location & Delivery Engine
 * Multi-provider geocoding & autocomplete (ArcGIS World Geocoder ZAF + Komoot Photon + Nominatim)
 * with instant local gazetteer + fuzzy Levenshtein typo correction.
 */

export type Coordinates = {
  lat: number
  lng: number
}

export type DeliveryLocation = {
  label: string
  suburb?: string
  city?: string
  address?: string
  coords: Coordinates
  isGps?: boolean
  isApproximate?: boolean
  accuracy?: number
}

/** Standard automatic delivery zone radius cutoff in km (like Sixty60 / Uber Eats / Mr D). Stores beyond this distance are never shown. */
export const SERVICE_DELIVERY_RADIUS_KM = 15

const storeGeocodeCache = new Map<string, Coordinates>()
const searchQueryCache = new Map<string, DeliveryLocation[]>()

/**
 * Comprehensive South African Gazetteer for 0ms instant type-ahead & fuzzy typo correction
 * Covers major suburbs, townships, CBDs, campuses, malls, and cities across South Africa.
 */
const SA_PLACES_INDEX: Array<{
  name: string
  city: string
  province: string
  aliases?: string[]
  coords: Coordinates
}> = [
  // Johannesburg Central & Surrounds
  { name: 'Doornfontein', city: 'Johannesburg', province: 'Gauteng', aliases: ['dfc', 'beit street', 'siemens street', 'staib street', 'johannesburg cbd'], coords: { lat: -26.1969, lng: 28.0583 } },
  { name: 'Braamfontein', city: 'Johannesburg', province: 'Gauteng', aliases: ['braam', 'jorissen street', 'de korte street', 'jan smuts', 'wits'], coords: { lat: -26.1912, lng: 28.0345 } },
  { name: 'Auckland Park', city: 'Johannesburg', province: 'Gauteng', aliases: ['apk', 'kingsway', 'bunting road', 'university road', 'uj'], coords: { lat: -26.1824, lng: 28.0069 } },
  { name: 'Bunting Road, Auckland Park', city: 'Johannesburg', province: 'Gauteng', aliases: ['brc', 'cottesloe', 'anzac'], coords: { lat: -26.1865, lng: 28.0145 } },
  { name: 'Melville', city: 'Johannesburg', province: 'Gauteng', aliases: ['7th street melville', 'main road melville', 'campus square'], coords: { lat: -26.1769, lng: 28.0082 } },
  { name: 'Newtown', city: 'Johannesburg', province: 'Gauteng', aliases: ['newtown junction', 'bree street', 'carr street', 'mary fitzgerald'], coords: { lat: -26.2019, lng: 28.0324 } },
  { name: 'Maboneng', city: 'Johannesburg', province: 'Gauteng', aliases: ['fox street', 'jeppestown', 'city and suburban', 'main street'], coords: { lat: -26.2041, lng: 28.0584 } },
  { name: 'Johannesburg CBD', city: 'Johannesburg', province: 'Gauteng', aliases: ['joburg cbd', 'jozi', 'commissioner street', 'pritchard street', 'gandhi square', 'marshalltown'], coords: { lat: -26.2041, lng: 28.0473 } },
  { name: 'Parktown', city: 'Johannesburg', province: 'Gauteng', aliases: ['empire road', 'oxford road', 'parktown north', 'killarney', 'houghton'], coords: { lat: -26.1783, lng: 28.0419 } },
  { name: 'Berea & Yeoville', city: 'Johannesburg', province: 'Gauteng', aliases: ['hillbrow', 'louis botha', 'observatory jhb', 'bellevue'], coords: { lat: -26.1852, lng: 28.0572 } },
  { name: 'Brixton', city: 'Johannesburg', province: 'Gauteng', aliases: ['high street brixton', 'mayfair', 'fordsburg', 'crosby', 'coronationville'], coords: { lat: -26.1945, lng: 28.0012 } },
  { name: 'Westdene', city: 'Johannesburg', province: 'Gauteng', aliases: ['sophiatown', 'triomf', 'newclare', 'greymont'], coords: { lat: -26.1768, lng: 27.9896 } },
  { name: 'Kensington & Bedfordview', city: 'Johannesburg', province: 'Gauteng', aliases: ['eastgate', 'bruma', 'malvern', 'cyrildeane'], coords: { lat: -26.1897, lng: 28.1128 } },
  { name: 'Turffontein & Rosettenville', city: 'Johannesburg', province: 'Gauteng', aliases: ['booysens', 'southgate', 'mondeor', 'ormonde', 'gold reef'], coords: { lat: -26.2452, lng: 28.0436 } },

  // Rosebank, Sandton, Randburg, Fourways, Midrand
  { name: 'Rosebank', city: 'Johannesburg', province: 'Gauteng', aliases: ['rosebank mall', 'the zone', 'craddock avenue', 'illovo', 'melrose arch', 'parkhurst', 'greenside'], coords: { lat: -26.1458, lng: 28.0416 } },
  { name: 'Sandton Central', city: 'Sandton', province: 'Gauteng', aliases: ['sandton city', 'rivonia road', 'maude street', 'morningside', 'benmore', 'atholl', 'hyde park'], coords: { lat: -26.1076, lng: 28.0567 } },
  { name: 'Bryanston', city: 'Sandton', province: 'Gauteng', aliases: ['william nicol', 'bryanston shopping centre', 'sloane street'], coords: { lat: -26.0581, lng: 28.0235 } },
  { name: 'Rivonia & Sunninghill', city: 'Sandton', province: 'Gauteng', aliases: ['rivonia boulevard', 'paulshof', 'woodmead', 'gallo manor'], coords: { lat: -26.0504, lng: 28.0616 } },
  { name: 'Fourways', city: 'Sandton', province: 'Gauteng', aliases: ['fourways mall', 'montecasino', 'lonehill', 'dainfern', 'douglasdale', 'broadacres', 'chartwell'], coords: { lat: -26.0176, lng: 28.0065 } },
  { name: 'Randburg', city: 'Johannesburg', province: 'Gauteng', aliases: ['ferndale', 'cresta', 'blairgowrie', 'linden', 'bordeaux', 'northcliff', 'randpark ridge', 'bromhof'], coords: { lat: -26.0936, lng: 28.0064 } },
  { name: 'Alexandra', city: 'Johannesburg', province: 'Gauteng', aliases: ['alex', 'marlboro', 'wynberg jhb', 'kew', 'lombardy east'], coords: { lat: -26.1031, lng: 28.0978 } },
  { name: 'Midrand', city: 'Midrand', province: 'Gauteng', aliases: ['waterfall city', 'mall of africa', 'halfway house', 'carlswald', 'kyalami', 'vorna valley', 'noordwyk', 'randjespark'], coords: { lat: -25.9992, lng: 28.1263 } },
  { name: 'Ivory Park & Tembisa', city: 'Midrand', province: 'Gauteng', aliases: ['thembisa', 'rabie ridge', 'ebony park', 'olifantsfontein', 'clayville'], coords: { lat: -25.9964, lng: 28.2268 } },

  // Soweto, Roodepoort, West Rand, Vaal
  { name: 'Soweto (Pimville & Klipspruit)', city: 'Soweto', province: 'Gauteng', aliases: ['swc', 'uj soweto', 'chris hani road', 'maponya mall', 'kliptown'], coords: { lat: -26.2585, lng: 27.9014 } },
  { name: 'Orlando, Soweto', city: 'Soweto', province: 'Gauteng', aliases: ['vilakazi street', 'orlando west', 'orlando east', 'orlando towers', 'meadowlands'], coords: { lat: -26.2389, lng: 27.9102 } },
  { name: 'Diepkloof, Soweto', city: 'Soweto', province: 'Gauteng', aliases: ['baragwanath', 'bara', 'diepkloof square', 'zone 6'], coords: { lat: -26.2508, lng: 27.9472 } },
  { name: 'Jabulani & Dobsonville, Soweto', city: 'Soweto', province: 'Gauteng', aliases: ['jabulani mall', 'zola', 'zondi', 'protea glen', 'protea south', 'chiawelo', 'dube', 'mofolo'], coords: { lat: -26.2485, lng: 27.854 } },
  { name: 'Lenasia & Eldorado Park', city: 'Johannesburg', province: 'Gauteng', aliases: ['trade route mall', 'ennerdale', 'orange farm', 'evaton'], coords: { lat: -26.3219, lng: 27.8294 } },
  { name: 'Roodepoort & Florida', city: 'Roodepoort', province: 'Gauteng', aliases: ['clearwater mall', 'weltevreden park', 'honeydew', 'ruimsig', 'monash', 'little falls', 'horison', 'witpoortjie'], coords: { lat: -26.1625, lng: 27.8725 } },
  { name: 'Cosmo City & Diepsloot', city: 'Johannesburg', province: 'Gauteng', aliases: ['zandspruit', 'lanseria', 'northgate', 'olivedale'], coords: { lat: -26.0195, lng: 27.9284 } },
  { name: 'Krugersdorp & Randfontein', city: 'West Rand', province: 'Gauteng', aliases: ['cradlestone', 'kagiso', 'mogale city', 'noordheuwel'], coords: { lat: -26.1011, lng: 27.7706 } },
  { name: 'Vanderbijlpark & Vereeniging', city: 'Vaal Triangle', province: 'Gauteng', aliases: ['vut', 'nwu vaal', 'three rivers', 'sebokeng', 'sharpeville', 'meyerton', 'sasolburg'], coords: { lat: -26.7069, lng: 27.8377 } },

  // East Rand / Ekurhuleni
  { name: 'Kempton Park', city: 'Ekurhuleni', province: 'Gauteng', aliases: ['or tambo', 'glengarry', 'glen marais', 'birchleigh', 'spartan', 'isando', 'rhodesfield'], coords: { lat: -26.1003, lng: 28.2301 } },
  { name: 'Boksburg', city: 'Ekurhuleni', province: 'Gauteng', aliases: ['east rand mall', 'bartlett', 'sunward park', 'vosloorus', 'reiger park'], coords: { lat: -26.2122, lng: 28.2536 } },
  { name: 'Benoni', city: 'Ekurhuleni', province: 'Gauteng', aliases: ['lakeside mall', 'northmead', 'farrarmere', 'rynfield', 'daveyton', 'etwatwa'], coords: { lat: -26.1885, lng: 28.3208 } },
  { name: 'Germiston & Edenvale', city: 'Ekurhuleni', province: 'Gauteng', aliases: ['greenstone', 'modderfontein', 'bedfordview', 'lambton', 'primrose', 'katlehong', 'thokoza'], coords: { lat: -26.2179, lng: 28.1672 } },
  { name: 'Alberton', city: 'Ekurhuleni', province: 'Gauteng', aliases: ['new redruth', 'meyersdal', 'brackenhurst', 'alberton city'], coords: { lat: -26.2679, lng: 28.1223 } },
  { name: 'Springs & Brakpan', city: 'Ekurhuleni', province: 'Gauteng', aliases: ['carnival city', 'kwatsaduza', 'tsakane', 'kwa-thema', 'duza', 'nigel'], coords: { lat: -26.2547, lng: 28.4428 } },

  // Pretoria / Tshwane
  { name: 'Hatfield', city: 'Pretoria', province: 'Gauteng', aliases: ['up', 'tuks', 'university of pretoria', 'burnett street', 'jan shoba', 'brooklyn', 'hillcrest pretoria'], coords: { lat: -25.7504, lng: 28.2384 } },
  { name: 'Pretoria Central & Sunnyside', city: 'Pretoria', province: 'Gauteng', aliases: ['arcadia', 'church square', 'union buildings', 'unisa', 'muckleneuk', 'pretoria west', 'tut pretoria'], coords: { lat: -25.7479, lng: 28.2293 } },
  { name: 'Menlyn & Lynnwood', city: 'Pretoria', province: 'Gauteng', aliases: ['menlyn maine', 'menlyn park', 'garsfontein', 'faerie glen', 'moreleta park', 'waterkloof', 'silver lakes'], coords: { lat: -25.7826, lng: 28.2752 } },
  { name: 'Centurion', city: 'Pretoria', province: 'Gauteng', aliases: ['centurion mall', 'irene', 'highveld', 'zwarkop', 'wierdapark', 'eldoraigne', 'rooihuiskraal', 'olatunde'], coords: { lat: -25.8603, lng: 28.1894 } },
  { name: 'Akasia, Wonderboom & Montana', city: 'Pretoria', province: 'Gauteng', aliases: ['kolonnade', 'sinoville', 'annlin', 'pretoria north', 'rosslyn'], coords: { lat: -25.6766, lng: 28.1767 } },
  { name: 'Soshanguve & Mabopane', city: 'Pretoria', province: 'Gauteng', aliases: ['tut soshanguve', 'ga-rankuwa', 'hammanskraal', 'temba'], coords: { lat: -25.5146, lng: 28.0968 } },
  { name: 'Mamelodi & Atteridgeville', city: 'Pretoria', province: 'Gauteng', aliases: ['mams mall', 'silverton', 'laudium', 'saulsville'], coords: { lat: -25.7209, lng: 28.3688 } },

  // Cape Town & Western Cape
  { name: 'Cape Town City Bowl', city: 'Cape Town', province: 'Western Cape', aliases: ['cpt', 'long street', 'bree street cpt', 'gardens', 'vredehoek', 'oranjezicht', 'tamboerskloof', 'foreshore', 'waterfront'], coords: { lat: -33.9249, lng: 18.4241 } },
  { name: 'Sea Point & Green Point', city: 'Cape Town', province: 'Western Cape', aliases: ['mouille point', 'clifton', 'camps bay', 'three anchor bay'], coords: { lat: -33.9169, lng: 18.3875 } },
  { name: 'Rondebosch & Observatory', city: 'Cape Town', province: 'Western Cape', aliases: ['uct', 'mowbray', 'newlands', 'claremont', 'kenilworth', 'woodstock', 'salt river', 'wynberg', 'plumstead'], coords: { lat: -33.9597, lng: 18.4702 } },
  { name: 'Bellville & Parow', city: 'Cape Town', province: 'Western Cape', aliases: ['uwc', 'cput', 'tygervalley', 'durbanville', 'brackenfell', 'kuils river', 'goodwood'], coords: { lat: -33.9006, lng: 18.6295 } },
  { name: 'Century City & Milnerton', city: 'Cape Town', province: 'Western Cape', aliases: ['canal walk', 'table view', 'bloubergstrand', 'parklands', 'sunningdale'], coords: { lat: -33.8926, lng: 18.5112 } },
  { name: 'Stellenbosch', city: 'Stellenbosch', province: 'Western Cape', aliases: ['maties', 'dorpsstraat', 'somerset west', 'strand', 'paarl', 'franschhoek'], coords: { lat: -33.9321, lng: 18.8602 } },
  { name: 'Khayelitsha & Mitchells Plain', city: 'Cape Town', province: 'Western Cape', aliases: ['gugulethu', 'nyanga', 'philippi', 'athlone', 'lansdowne', 'blue downs'], coords: { lat: -34.0389, lng: 18.6758 } },
  { name: 'George & Mossel Bay', city: 'Garden Route', province: 'Western Cape', aliases: ['knysna', 'plettenberg bay', 'oudtshoorn'], coords: { lat: -33.963, lng: 22.4617 } },

  // Durban & KwaZulu-Natal
  { name: 'Durban Central & Berea', city: 'Durban', province: 'KwaZulu-Natal', aliases: ['dbn', 'musgrave', 'morningside dbn', 'glenwood', 'ukzn howard', 'dut', 'umbilo', 'sydenham'], coords: { lat: -29.8587, lng: 31.0218 } },
  { name: 'Umhlanga', city: 'Durban', province: 'KwaZulu-Natal', aliases: ['gateway', 'umhlanga rocks', 'la lucia', 'durban north', 'mount edgecombe', 'cornubia', 'sibaya'], coords: { lat: -29.7256, lng: 31.0663 } },
  { name: 'Westville & Pinetown', city: 'Durban', province: 'KwaZulu-Natal', aliases: ['ukzn westville', 'pavilion', 'kloof', 'hillcrest kzn', 'new germany', 'queensburgh'], coords: { lat: -29.8295, lng: 30.9275 } },
  { name: 'Ballito', city: 'Dolphin Coast', province: 'KwaZulu-Natal', aliases: ['salt rock', 'tongaat', 'verulam', 'king shaka'], coords: { lat: -29.5389, lng: 31.2144 } },
  { name: 'Phoenix, KwaMashu & Inanda', city: 'Durban', province: 'KwaZulu-Natal', aliases: ['ntuzuma', 'avoca', 'newlands east', 'newlands west'], coords: { lat: -29.7042, lng: 31.0067 } },
  { name: 'Umlazi, Amanzimtoti & Chatsworth', city: 'Durban', province: 'KwaZulu-Natal', aliases: ['isipingo', 'bluff', 'wentworth', 'lamontville'], coords: { lat: -29.9675, lng: 30.8894 } },
  { name: 'Pietermaritzburg', city: 'Pietermaritzburg', province: 'KwaZulu-Natal', aliases: ['pmb', 'scottsville', 'hayfields', 'northdale', 'edale', 'hilton', 'howick'], coords: { lat: -29.6006, lng: 30.3794 } },
  { name: 'Richards Bay & Empangeni', city: 'uMhlathuze', province: 'KwaZulu-Natal', aliases: ['unizulu', 'kwadlangezwa', 'esikhawini', 'meerensee'], coords: { lat: -28.7807, lng: 32.0383 } },

  // Other Major SA Cities & University Towns
  { name: 'Bloemfontein', city: 'Bloemfontein', province: 'Free State', aliases: ['ufs', 'kovsies', 'cut', 'willows', 'universitas', 'westdene bfn', 'langenhoven park', 'mangaung', 'botshabelo', 'welkom'], coords: { lat: -29.1183, lng: 26.2249 } },
  { name: 'Gqeberha (Port Elizabeth)', city: 'Gqeberha', province: 'Eastern Cape', aliases: ['pe', 'summerstrand', 'nmu', 'humewood', 'walmer', 'newton park', 'greenacres', 'ibhayi', 'motherwell', 'uitenhage', 'kariega'], coords: { lat: -33.9608, lng: 25.6022 } },
  { name: 'East London & Mthatha', city: 'East London', province: 'Eastern Cape', aliases: ['vincent', 'beacon bay', 'quigney', 'gonubie', 'mdantsane', 'king williams town', 'alice', 'ufh', 'wsu', 'makhanda', 'grahamstown', 'rhodes'], coords: { lat: -32.9833, lng: 27.8667 } },
  { name: 'Polokwane & Mankweng', city: 'Polokwane', province: 'Limpopo', aliases: ['turfloop', 'ul', 'university of limpopo', 'bendor', 'fauna park', 'ivy park', 'seshego', 'tzaneen', 'mokopane', 'thohoyandou', 'univen'], coords: { lat: -23.9045, lng: 29.4689 } },
  { name: 'Mbombela (Nelspruit)', city: 'Mbombela', province: 'Mpumalanga', aliases: ['ump', 'white river', 'west acres', 'sonheuwel', 'kabokweni', 'kanamazane'], coords: { lat: -25.4753, lng: 30.9694 } },
  { name: 'eMalahleni (Witbank) & Secunda', city: 'Mpumalanga', province: 'Mpumalanga', aliases: ['middelburg', 'highveld mall', 'ermelo', 'standerton'], coords: { lat: -25.8728, lng: 29.2553 } },
  { name: 'Rustenburg', city: 'Rustenburg', province: 'North West', aliases: ['waterfall mall', 'geelhoutpark', 'tlhabane', 'phokeng', 'brits', 'hartbeespoort'], coords: { lat: -25.6676, lng: 27.2421 } },
  { name: 'Potchefstroom & Klerksdorp', city: 'Potchefstroom', province: 'North West', aliases: ['nwu', 'pukke', 'bult', 'ikageng', 'mahikeng', 'mmabatho'], coords: { lat: -26.7145, lng: 27.097 } },
  { name: 'Kimberley & Upington', city: 'Kimberley', province: 'Northern Cape', aliases: ['spu', 'sol plaatje', 'diamond pavilion', 'galeshewe'], coords: { lat: -28.7282, lng: 24.7499 } },
]

/** Common abbreviation & typo dictionary for South African addresses */
const TYPO_REPLACEMENTS: Record<string, string> = {
  jhb: 'johannesburg',
  joburg: 'johannesburg',
  jozi: 'johannesburg',
  johanesburg: 'johannesburg',
  johanessburg: 'johannesburg',
  pta: 'pretoria',
  pitoria: 'pretoria',
  pretora: 'pretoria',
  cpt: 'cape town',
  capetown: 'cape town',
  dbn: 'durban',
  pmb: 'pietermaritzburg',
  pe: 'port elizabeth',
  bfn: 'bloemfontein',
  bloem: 'bloemfontein',
  potch: 'potchefstroom',
  stellies: 'stellenbosch',
  dornfontein: 'doornfontein',
  doornfontien: 'doornfontein',
  doornfotein: 'doornfontein',
  doornfontin: 'doornfontein',
  dfc: 'doornfontein',
  braam: 'braamfontein',
  bramfontein: 'braamfontein',
  braamfontien: 'braamfontein',
  braamfontin: 'braamfontein',
  aucklandpark: 'auckland park',
  ackland: 'auckland',
  aukland: 'auckland',
  apk: 'auckland park',
  brc: 'bunting road auckland park',
  sowto: 'soweto',
  sowetho: 'soweto',
  swc: 'soweto',
  sandtn: 'sandton',
  santdon: 'sandton',
  rosebnk: 'rosebank',
  rosbank: 'rosebank',
  midrnd: 'midrand',
  randbrg: 'randburg',
  roodeport: 'roodepoort',
  rodepoort: 'roodepoort',
  fourwys: 'fourways',
  brynston: 'bryanston',
  melvile: 'melville',
  mellville: 'melville',
  newtwn: 'newtown',
  maboneg: 'maboneng',
  centurn: 'centurion',
  centurian: 'centurion',
  hatfeld: 'hatfield',
  hatfeild: 'hatfield',
  menln: 'menlyn',
  sunyside: 'sunnyside',
  tembsa: 'tembisa',
  thembisa: 'tembisa',
  soshnguve: 'soshanguve',
  umhlnaga: 'umhlanga',
  uhmlanga: 'umhlanga',
  ballto: 'ballito',
  balito: 'ballito',
  khayeltsha: 'khayelitsha',
  kayelitsha: 'khayelitsha',
  stellenbsch: 'stellenbosch',
  stelenbosch: 'stellenbosch',
  polokwne: 'polokwane',
  rustenbrg: 'rustenburg',
  witbnk: 'witbank',
  nelspruit: 'mbombela',
}

/**
 * Computes Damerau-Levenshtein edit distance (supports character transpositions, insertions, deletions, substitutions)
 */
function editDistance(a: string, b: string): number {
  const s1 = a.toLowerCase()
  const s2 = b.toLowerCase()
  const len1 = s1.length
  const len2 = s2.length
  if (len1 === 0) return len2
  if (len2 === 0) return len1

  const dp: number[][] = Array.from({ length: len1 + 1 }, () =>
    new Array(len2 + 1).fill(0)
  )
  for (let i = 0; i <= len1; i++) dp[i][0] = i
  for (let j = 0; j <= len2; j++) dp[0][j] = j

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
      if (
        i > 1 &&
        j > 1 &&
        s1[i - 1] === s2[j - 2] &&
        s1[i - 2] === s2[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost)
      }
    }
  }
  return dp[len1][len2]
}

/** Build vocabulary of canonical South African place tokens for automatic spell-correction */
const CANONICAL_VOCAB: string[] = (() => {
  const set = new Set<string>()
  for (const p of SA_PLACES_INDEX) {
    for (const word of `${p.name} ${p.city} ${p.province}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (word.length >= 4) set.add(word)
    }
  }
  return Array.from(set)
})()

/**
 * Automatically fixes typos and expands abbreviations in a user's location search query.
 * e.g. "37 beit st dornfontien" -> "37 beit st doornfontein"
 */
export function correctLocationTypos(rawQuery: string): string {
  const tokens = rawQuery
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const corrected = tokens.map((token) => {
    const clean = token.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!clean) return token

    if (TYPO_REPLACEMENTS[clean]) {
      return TYPO_REPLACEMENTS[clean]
    }

    // Only fuzzy-correct alphabetic words >= 4 chars that aren't numbers
    if (clean.length < 4 || /^\d+$/.test(clean)) return token
    if (CANONICAL_VOCAB.includes(clean)) return token

    let bestMatch = token
    let bestDist = Infinity
    const maxAllowed = clean.length >= 7 ? 2 : 1

    for (const vocabWord of CANONICAL_VOCAB) {
      if (Math.abs(vocabWord.length - clean.length) > maxAllowed) continue
      // First letter or prefix similarity check for speed and accuracy
      if (vocabWord[0] !== clean[0] && vocabWord[1] !== clean[0]) continue
      const dist = editDistance(clean, vocabWord)
      if (dist <= maxAllowed && dist < bestDist) {
        bestDist = dist
        bestMatch = vocabWord
      }
    }
    return bestMatch
  })

  return corrected.join(' ')
}

/**
 * Instant 0ms synchronous fuzzy location search against the South African gazetteer.
 * Handles partial typing, abbreviations, and typos immediately while network APIs load.
 */
export function searchInstantLocations(rawQuery: string): DeliveryLocation[] {
  const q = rawQuery.trim().toLowerCase()
  if (q.length < 1) return []

  const correctedQ = correctLocationTypos(q).toLowerCase()
  const queryWords = correctedQ.split(/[\s,]+/).filter((w) => w.length >= 2)

  // Check if user typed a street number + road prefix before a suburb (e.g. "37 Beit St Doornfontein")
  const streetPrefixMatch = rawQuery.trim().match(/^(\d+\s+[a-zA-Z\s]{2,25}?)[,\s]+([a-zA-Z]{3,})$/)
  const customStreetPrefix = streetPrefixMatch ? streetPrefixMatch[1].trim() : ''

  const scored: Array<{ score: number; loc: DeliveryLocation }> = []

  for (const place of SA_PLACES_INDEX) {
    const nameLower = place.name.toLowerCase()
    const cityLower = place.city.toLowerCase()
    const aliasText = (place.aliases || []).join(' ').toLowerCase()
    const fullText = `${nameLower} ${cityLower} ${place.province.toLowerCase()} ${aliasText}`

    let score = 0

    // Exact or prefix match on place name
    if (nameLower === q || nameLower === correctedQ) {
      score += 120
    } else if (nameLower.startsWith(q) || nameLower.startsWith(correctedQ)) {
      score += 95
    } else if (fullText.includes(q) || fullText.includes(correctedQ)) {
      score += 75
    }

    // Token-level fuzzy matching (handles multi-word queries & typos)
    for (const qw of queryWords) {
      if (nameLower.startsWith(qw)) {
        score += 45
      } else if (nameLower.includes(qw) || aliasText.includes(qw)) {
        score += 35
      } else if (cityLower.includes(qw)) {
        score += 20
      } else if (qw.length >= 4) {
        // Fuzzy word distance check against place words
        const placeWords = `${nameLower} ${aliasText}`.split(/[^a-z0-9]+/)
        for (const pw of placeWords) {
          if (pw.length < 3) continue
          if (pw.startsWith(qw.slice(0, 3))) {
            const dist = editDistance(qw, pw.slice(0, qw.length + 1))
            if (dist <= 2) {
              score += 28 - dist * 8
              break
            }
          }
        }
      }
    }

    if (score >= 25) {
      const displayLabel = customStreetPrefix
        ? `${customStreetPrefix}, ${place.name}`
        : `${place.name}, ${place.city}`

      scored.push({
        score,
        loc: {
          label: displayLabel,
          suburb: place.name,
          city: place.city,
          address: `${displayLabel}, ${place.province}, South Africa`,
          coords: place.coords,
          isGps: false,
        },
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 6).map((s) => s.loc)
}

/**
 * Resolves coordinates for a store/merchant from its stored coords or location string.
 */
export function resolveStoreCoords(store: {
  coords?: Coordinates
  location?: string
  name?: string
}): Coordinates {
  if (
    store.coords &&
    typeof store.coords.lat === 'number' &&
    typeof store.coords.lng === 'number' &&
    Number.isFinite(store.coords.lat) &&
    Number.isFinite(store.coords.lng) &&
    store.coords.lat !== 0
  ) {
    return store.coords
  }

  const key = (store.location || '').trim().toLowerCase()
  if (key && storeGeocodeCache.has(key)) {
    return storeGeocodeCache.get(key)!
  }

  if (typeof window !== 'undefined' && key) {
    try {
      const cached = localStorage.getItem(`dash_geo_${key}`)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
          storeGeocodeCache.set(key, parsed)
          return parsed
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  const instant = searchInstantLocations(`${store.location || ''} ${store.name || ''}`)
  if (instant.length > 0) {
    return instant[0].coords
  }

  return { lat: -26.1969, lng: 28.0583 }
}

/**
 * Asynchronously geocodes a store's location text and caches the result.
 */
export async function geocodeStoreAddress(locationText: string): Promise<Coordinates | null> {
  const key = locationText.trim().toLowerCase()
  if (!key || key === 'campus center' || key === 'student centre' || key === 'near you') {
    return null
  }
  if (storeGeocodeCache.has(key)) {
    return storeGeocodeCache.get(key)!
  }

  try {
    const results = await searchAddresses(locationText)
    if (results.length > 0 && results[0].coords) {
      storeGeocodeCache.set(key, results[0].coords)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`dash_geo_${key}`, JSON.stringify(results[0].coords))
        } catch {
          // ignore
        }
      }
      return results[0].coords
    }
  } catch {
    // ignore network error
  }
  return null
}

/**
 * Calculates exact distance in kilometers between two GPS coordinates using the Haversine formula.
 */
export function calculateDistanceKm(
  from: Coordinates | undefined | null,
  to: Coordinates | undefined | null
): number {
  if (
    !from ||
    !to ||
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return Infinity
  }

  const R = 6371 // Earth's mean radius in km
  const dLat = ((to.lat - from.lat) * Math.PI) / 180
  const dLon = ((to.lng - from.lng) * Math.PI) / 180

  const lat1 = (from.lat * Math.PI) / 180
  const lat2 = (to.lat * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/** Formats a distance in km for display on store and product cards */
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return ''
  if (km < 1) {
    const meters = Math.max(100, Math.round((km * 1000) / 50) * 50)
    return `${meters} m`
  }
  return `${km.toFixed(1)} km`
}

/**
 * Computes real-time numerical delivery fee in ZAR based on exact distance in km.
 */
export function calculateDeliveryFeeAmount(km: number, isGrocery = false): number {
  if (!Number.isFinite(km)) return isGrocery ? 35 : 25
  if (isGrocery) {
    if (km <= 3) return 15
    if (km <= 6) return 20
    if (km <= 10) return 25
    if (km <= 15) return 30
    return 35
  }
  if (km <= 1.5) return 10
  const extraKm = km - 1.5
  const calculated = Math.round(10 + extraKm * 2.5)
  return Math.min(60, Math.max(10, calculated))
}

/** Computes dynamic delivery fee text based on real distance */
export function calculateDeliveryFee(km: number, isGrocery = false): string {
  const amount = calculateDeliveryFeeAmount(km, isGrocery)
  return `R${amount} delivery`
}

/** Computes dynamic estimated delivery time based on real distance */
export function calculateDeliveryTime(km: number, isGrocery = false): string {
  if (!Number.isFinite(km)) return '25-35 min'
  if (isGrocery) {
    if (km <= 3) return '20-30 min'
    if (km <= 7) return '30-45 min'
    if (km <= 12) return '40-55 min'
    return '50-65 min'
  }
  const prepMin = 10
  const driveMin = Math.max(5, Math.round(km * 2.2))
  const low = Math.round((prepMin + driveMin) / 5) * 5
  const high = low + 10
  return `${low}-${high} min`
}

/**
 * Provider 1: ArcGIS World Geocoding Service (South Africa - ZAF)
 * Ultra-fast commercial-grade geocoder with built-in spell-checking, street numbers, complexes, malls, and suburbs.
 */
async function searchArcGisZa(query: string, signal?: AbortSignal): Promise<DeliveryLocation[]> {
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(
    query
  )}&countryCode=ZAF&maxLocations=8&outFields=PlaceName,Place_addr,StAddr,Nbrhd,District,City,Subregion,Region&f=json`

  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data?.candidates)) return []

  return data.candidates
    .filter((c: any) => c?.location && Number.isFinite(c.location.y) && Number.isFinite(c.location.x))
    .map((c: any) => {
      const attr = c.attributes || {}
      const placeName = attr.PlaceName || ''
      const stAddr = attr.StAddr || ''
      const suburb = attr.Nbrhd || attr.District || ''
      const city = attr.City || attr.Subregion || ''
      const fullAddr = attr.Place_addr || c.address || ''

      let label = ''
      if (stAddr && suburb) {
        label = `${stAddr}, ${suburb}`
      } else if (placeName && suburb && placeName.toLowerCase() !== suburb.toLowerCase()) {
        label = `${placeName}, ${suburb}`
      } else if (placeName && city && placeName.toLowerCase() !== city.toLowerCase()) {
        label = `${placeName}, ${city}`
      } else if (suburb && city && suburb.toLowerCase() !== city.toLowerCase()) {
        label = `${suburb}, ${city}`
      } else {
        label = fullAddr.split(',').slice(0, 2).join(', ').trim() || placeName
      }

      return {
        label,
        suburb: suburb || city,
        city,
        address: fullAddr || label,
        coords: {
          lat: Number(c.location.y),
          lng: Number(c.location.x),
        },
        isGps: false,
      }
    })
}

/**
 * Provider 2: Photon by Komoot (OpenStreetMap Elasticsearch Autocomplete & Fuzzy Search)
 */
async function searchPhotonZa(query: string, signal?: AbortSignal): Promise<DeliveryLocation[]> {
  // Bounding box covering all of South Africa
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
    query
  )}&bbox=16.3,-35.0,33.0,-22.0&limit=8&lang=en`

  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data?.features)) return []

  return data.features
    .filter((f: any) => {
      const coords = f?.geometry?.coordinates
      const props = f?.properties || {}
      const isZa =
        !props.countrycode ||
        props.countrycode.toUpperCase() === 'ZA' ||
        (props.country || '').toLowerCase().includes('south africa')
      return isZa && Array.isArray(coords) && coords.length >= 2
    })
    .map((f: any) => {
      const [lng, lat] = f.geometry.coordinates
      const p = f.properties || {}
      const streetPart = [p.housenumber, p.street].filter(Boolean).join(' ').trim()
      const name = p.name || ''
      const suburb = p.district || p.suburb || p.locality || ''
      const city = p.city || p.town || p.county || ''
      const state = p.state || ''

      let label = ''
      if (streetPart && (suburb || city)) {
        label = `${streetPart}, ${suburb || city}`
      } else if (name && (suburb || city) && name.toLowerCase() !== (suburb || city).toLowerCase()) {
        label = `${name}, ${suburb || city}`
      } else if (name) {
        label = city ? `${name}, ${city}` : name
      } else if (suburb && city) {
        label = `${suburb}, ${city}`
      } else {
        label = streetPart || suburb || city || 'South Africa'
      }

      const fullParts = [name || streetPart, suburb, city, state, 'South Africa']
        .filter(Boolean)
        .filter((v, idx, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === idx)

      return {
        label,
        suburb: suburb || city,
        city,
        address: fullParts.join(', '),
        coords: { lat: Number(lat), lng: Number(lng) },
        isGps: false,
      }
    })
}

/**
 * Provider 3: OpenStreetMap Nominatim (South Africa)
 */
async function searchNominatimZa(query: string, signal?: AbortSignal): Promise<DeliveryLocation[]> {
  const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&countrycodes=za&limit=6&addressdetails=1`

  const res = await fetch(endpoint, {
    headers: { 'Accept-Language': 'en' },
    signal,
  })
  if (!res.ok) return []
  const results = await res.json()
  if (!Array.isArray(results)) return []

  return results.map((item: any) => {
    const addr = item.address || {}
    const houseNumber = addr.house_number || ''
    const road = addr.road || addr.street || addr.pedestrian || ''
    const suburb =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.residential ||
      addr.city_district ||
      addr.town ||
      addr.village ||
      ''
    const city = addr.city || addr.town || addr.municipality || addr.county || ''

    const streetPart = [houseNumber, road].filter(Boolean).join(' ').trim()
    let display = ''
    if (streetPart && suburb) {
      display = `${streetPart}, ${suburb}`
    } else if (streetPart && city) {
      display = `${streetPart}, ${city}`
    } else if (suburb && city && suburb !== city) {
      display = `${suburb}, ${city}`
    } else {
      display = item.display_name.split(',').slice(0, 2).join(', ').trim()
    }

    return {
      label: display,
      suburb: suburb || city,
      city,
      address: item.display_name,
      coords: {
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      },
      isGps: false,
    }
  })
}

/**
 * Deduplicates and merges location results from multiple geocoding engines + instant fuzzy index.
 */
function deduplicateLocations(lists: DeliveryLocation[][]): DeliveryLocation[] {
  const seen = new Set<string>()
  const merged: DeliveryLocation[] = []

  for (const list of lists) {
    for (const item of list) {
      if (
        !item ||
        !item.label ||
        !item.coords ||
        !Number.isFinite(item.coords.lat) ||
        !Number.isFinite(item.coords.lng)
      ) {
        continue
      }
      const normLabel = item.label.toLowerCase().replace(/[^a-z0-9]/g, '')
      const coordKey = `${item.coords.lat.toFixed(2)},${item.coords.lng.toFixed(2)}`
      const key = `${normLabel}|${coordKey}`
      if (seen.has(key) || seen.has(normLabel)) continue
      seen.add(key)
      seen.add(normLabel)
      merged.push(item)
      if (merged.length >= 10) return merged
    }
  }
  return merged
}

/**
 * Provider 0: Google Maps Geocoding & Places Search (when API key is present)
 */
async function searchGoogleZa(query: string, signal?: AbortSignal): Promise<DeliveryLocation[]> {
  try {
    const res = await fetch(
      `/api/location?action=search&q=${encodeURIComponent(query)}`,
      { signal }
    )
    if (!res.ok) return []
    const data = await res.json()
    if (Array.isArray(data?.results)) {
      return data.results
    }
    return []
  } catch {
    return []
  }
}

/**
 * Multi-engine, typo-tolerant real-time location search across all of South Africa.
 * Combines Google Places/Geocoding + ArcGIS World Geocoder + Photon Autocomplete + Nominatim + Local Fuzzy Gazetteer.
 */
export async function searchAddresses(
  rawQuery: string,
  signal?: AbortSignal
): Promise<DeliveryLocation[]> {
  const q = rawQuery.trim()
  if (q.length < 1) return []

  const cacheKey = q.toLowerCase()
  if (searchQueryCache.has(cacheKey)) {
    return searchQueryCache.get(cacheKey)!
  }

  // 1. Auto-correct typos (e.g. "dornfontien" -> "doornfontein", "sowto" -> "soweto")
  const correctedQuery = correctLocationTypos(q)
  const instantMatches = searchInstantLocations(q)

  if (q.length < 2) {
    return instantMatches
  }

  try {
    // 2. Query Google Maps (if key exists), ArcGIS (street addresses/malls/complexes), Photon, and Nominatim in parallel
    const queriesToRun: Promise<DeliveryLocation[]>[] = [
      searchGoogleZa(correctedQuery, signal),
      searchArcGisZa(correctedQuery, signal),
      searchPhotonZa(correctedQuery, signal),
      searchNominatimZa(correctedQuery, signal),
    ]

    // If typo correction changed the string, also query ArcGIS with the raw input in case it's a unique street name
    if (correctedQuery.toLowerCase() !== q.toLowerCase()) {
      queriesToRun.push(searchGoogleZa(q, signal))
      queriesToRun.push(searchArcGisZa(q, signal))
    }

    const settled = await Promise.allSettled(queriesToRun)
    const apiLists: DeliveryLocation[][] = settled.map((r) =>
      r.status === 'fulfilled' ? r.value : []
    )

    // Prioritize Google Places + ArcGIS street results, followed by local gazetteer and OSM
    const combined = deduplicateLocations([
      apiLists[0] || [],
      apiLists[1] || [],
      apiLists[2] || [],
      instantMatches,
      apiLists[3] || [],
      apiLists[4] || [],
      apiLists[5] || [],
    ])

    if (combined.length > 0) {
      searchQueryCache.set(cacheKey, combined)
    }
    return combined
  } catch (err) {
    return instantMatches
  }
}

/**
 * High-Precision True Client GPS Detection:
 * 1. Uses native browser `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy: true`.
 * 2. On mobile devices with GPS chip, this achieves 5m - 20m meter-level accuracy.
 * 3. Inspects `coords.accuracy`. If accuracy is coarse (> 300m, e.g. on desktop PCs without GPS),
 *    flags `isApproximate: true` so the UI can prompt the user to confirm or select their exact address.
 * 4. Reverse-geocodes via Google Maps Geocoding API + ArcGIS World Geocoder.
 */
export async function detectAccurateUserLocation(): Promise<DeliveryLocation | null> {
  if (typeof window === 'undefined' || !('geolocation' in navigator)) {
    return null
  }

  return new Promise((resolve) => {
    let resolved = false
    let bestFix: { lat: number; lng: number; accuracy: number } | null = null

    const finish = async (fix: { lat: number; lng: number; accuracy: number } | null) => {
      if (resolved) return
      resolved = true
      if (!fix) {
        resolve(null)
        return
      }

      try {
        const location = await reverseGeocodeCoords(fix.lat, fix.lng)
        location.accuracy = fix.accuracy
        location.isGps = true
        location.isApproximate = fix.accuracy > 300
        resolve(location)
      } catch {
        resolve({
          label: `${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}`,
          coords: { lat: fix.lat, lng: fix.lng },
          isGps: true,
          accuracy: fix.accuracy,
          isApproximate: fix.accuracy > 300,
        })
      }
    }

    // Safety timeout: 4.5 seconds maximum so the app never freezes
    const timeoutTimer = setTimeout(() => {
      finish(bestFix)
    }, 4500)

    try {
      // 1. Initial quick high-accuracy fix
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const acc = pos.coords.accuracy || 100
          bestFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: acc,
          }
          // If true hardware GPS accuracy (<= 50 meters), finish immediately!
          if (acc <= 50) {
            clearTimeout(timeoutTimer)
            finish(bestFix)
          }
        },
        () => {
          // If immediate fix errored, wait for watch or timeout
        },
        { enableHighAccuracy: true, timeout: 3500, maximumAge: 0 }
      )

      // 2. Watch position for refined GPS lock
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const acc = pos.coords.accuracy || 100
          if (!bestFix || acc < bestFix.accuracy) {
            bestFix = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: acc,
            }
          }
          if (acc <= 50) {
            clearTimeout(timeoutTimer)
            try {
              navigator.geolocation.clearWatch(watchId)
            } catch {}
            finish(bestFix)
          }
        },
        () => {
          // Ignore watch error; fallback to bestFix on timeout
        },
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
      )
    } catch {
      clearTimeout(timeoutTimer)
      finish(null)
    }
  })
}

/** Reverse geocodes live GPS latitude/longitude into a street/suburb delivery address */
export async function reverseGeocodeCoords(lat: number, lng: number): Promise<DeliveryLocation> {
  // Query Google Maps Reverse Geocoding API + ArcGIS World Geocoder in parallel
  try {
    const googleUrl = `/api/location?action=reverse&lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
    // Note: ArcGIS reverseGeocode requires x=lng, y=lat
    const arcGisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&outSR=4326&f=json`
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`

    const [googleRes, arcRes, nomRes] = await Promise.allSettled([
      fetch(googleUrl),
      fetch(arcGisUrl),
      fetch(nominatimUrl, { headers: { 'Accept-Language': 'en' } }),
    ])

    // 1. Google Maps Reverse Geocode (if key is enabled)
    if (googleRes.status === 'fulfilled' && googleRes.value.ok) {
      try {
        const gData = await googleRes.value.json()
        if (gData?.location && gData.location.label) {
          return gData.location as DeliveryLocation
        }
      } catch {}
    }

    // 2. ArcGIS World Geocoder (South Africa - extremely accurate down to street & building numbers)
    if (arcRes.status === 'fulfilled' && arcRes.value.ok) {
      try {
        const arcData = await arcRes.value.json()
        const addr = arcData?.address
        if (addr) {
          const street = addr.Address || addr.StAddr || ''
          const suburb = addr.Neighborhood || addr.District || ''
          const city = addr.City || addr.Subregion || ''
          const matchAddr = addr.Match_addr || addr.LongLabel || addr.ShortLabel || ''

          let display = ''
          if (street && suburb) {
            display = `${street}, ${suburb}`
          } else if (street && city) {
            display = `${street}, ${city}`
          } else if (suburb && city && suburb.toLowerCase() !== city.toLowerCase()) {
            display = `${suburb}, ${city}`
          } else if (suburb) {
            display = suburb
          } else if (street) {
            display = street
          } else {
            display = matchAddr.split(',').slice(0, 2).join(', ').trim()
          }

          if (display) {
            return {
              label: display,
              suburb: suburb || city,
              city,
              address: matchAddr || display,
              coords: { lat, lng },
              isGps: true,
            }
          }
        }
      } catch {}
    }

    // 3. OpenStreetMap Nominatim
    if (nomRes.status === 'fulfilled' && nomRes.value.ok) {
      try {
        const data = await nomRes.value.json()
        const addr = data.address || {}
        const houseNumber = addr.house_number || ''
        const road = addr.road || addr.street || addr.pedestrian || ''
        const suburb =
          addr.suburb ||
          addr.neighbourhood ||
          addr.quarter ||
          addr.residential ||
          addr.city_district ||
          addr.town ||
          addr.village ||
          ''
        const city = addr.city || addr.town || addr.municipality || addr.county || ''

        const streetPart = [houseNumber, road].filter(Boolean).join(' ').trim()
        let display = ''
        if (streetPart && suburb) {
          display = `${streetPart}, ${suburb}`
        } else if (streetPart && city) {
          display = `${streetPart}, ${city}`
        } else if (suburb && city && suburb !== city) {
          display = `${suburb}, ${city}`
        } else if (suburb) {
          display = suburb
        } else if (city) {
          display = city
        } else {
          display =
            data.display_name?.split(',').slice(0, 2).join(', ').trim() ||
            `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        }

        return {
          label: display,
          suburb: suburb || city,
          city,
          address: data.display_name || display,
          coords: { lat, lng },
          isGps: true,
        }
      } catch {}
    }
  } catch (err) {
    console.warn('Reverse geocode notice:', err)
  }

  return {
    label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    coords: { lat, lng },
    isGps: true,
  }
}
