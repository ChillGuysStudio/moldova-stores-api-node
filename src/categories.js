function normalizeCategoryKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const CATEGORY_DEFINITIONS = [
  {
    id: "phones",
    name: "Phones",
    aliases: ["phone", "phones", "smartphone", "smartphones", "telefoane", "telefon"],
    stores: {
      smart: { facetName: "metaf_electronice", facetValue: "Smartphone" },
      bomba: { id: 686094 },
      maximum: { path: "/ro/telefoane-si-gadgeturi/telefoane-si-comunicatii/smartphoneuri/" },
      xstore: { path: "/apple/iphone" },
      enter: { id: 96 },
      darwin: { id: 423 },
      ultra: { id: 131 }
    }
  },
  {
    id: "laptops",
    name: "Laptops",
    aliases: ["laptop", "laptops", "notebook", "notebooks", "laptopuri"],
    stores: {
      smart: { facetName: "metaf_electronice", facetValue: "Laptopuri" },
      bomba: { id: 634579 },
      maximum: { path: "/ro/tehnica-computerizata/laptopuri-si-computere/laptopuri/" },
      xstore: { path: "/laptopuri" },
      enter: { id: 21 },
      darwin: { id: 560 },
      ultra: { id: 232 }
    }
  },
  {
    id: "tablets",
    name: "Tablets",
    aliases: ["tablet", "tablets", "tablete", "ipad"],
    stores: {
      smart: { facetName: "metaf_electronice", facetValue: "Tablete" },
      bomba: { id: 679656 },
      maximum: { path: "/ro/tehnica-computerizata/tablete-pc/tablete-pc/" },
      xstore: { path: "/tablete" },
      enter: { id: 19 },
      darwin: { id: 568 },
      ultra: { id: 246 }
    }
  },
  {
    id: "tvs",
    name: "TVs",
    aliases: ["tv", "tvs", "tv_uri", "televizor", "televizoare", "television", "televisions"],
    stores: {
      smart: { facetName: "metaf_electronice", facetValue: "Televizoare" },
      bomba: { id: 679641 },
      maximum: { path: "/ro/televizoare/televizoare/televizoare/" },
      xstore: { path: "/televizoare" },
      enter: { id: 24 },
      darwin: { id: 562 },
      ultra: { id: 134 }
    }
  },
  {
    id: "headphones",
    name: "Headphones",
    aliases: ["headphones", "headset", "casti", "căști", "earbuds", "airpods"],
    stores: {
      smart: { facetName: "metaf_electronice", facetValue: "Casti" },
      bomba: { id: 636098 },
      maximum: { path: "/ro/telefoane-si-gadgeturi/sisteme-audio-portabile/casti-wireless/" },
      xstore: { path: "/audio/casti" },
      enter: { id: 348 },
      darwin: { id: 625 },
      ultra: { id: 93 }
    }
  },
  {
    id: "smartwatches",
    name: "Smartwatches",
    aliases: ["smartwatch", "smartwatches", "smart_watch", "smart_watches", "watch", "ceas", "ceasuri", "ceasuri_inteligente"],
    stores: {
      smart: { facetName: "metaf_electronice", facetValue: "Smart Watch" },
      bomba: { id: 679657 },
      maximum: { path: "/ro/telefoane-si-gadgeturi/telefoane-si-comunicatii/ceasuri-inteligente/" },
      xstore: { path: "/gadgeturi/ceasuri-inteligente" },
      enter: { id: 128 },
      darwin: { id: 486 },
      ultra: { id: 105 }
    }
  },
  {
    id: "refrigerators",
    name: "Refrigerators",
    aliases: ["refrigerator", "refrigerators", "fridge", "fridges", "frigider", "frigidere"],
    stores: {
      smart: { facetName: "metaf_electrocasnice_si_climatizare", facetValue: "Frigidere" },
      bomba: { id: 348593 },
      maximum: { path: "/ro/electrocasnice-mari/frigidere/" },
      enter: { id: 263 },
      darwin: { id: 688 },
      ultra: { id: 249 }
    }
  },
  {
    id: "washing_machines",
    name: "Washing machines",
    aliases: [
      "washing_machine",
      "washing_machines",
      "washer",
      "washers",
      "masini_de_spalat",
      "masina_de_spalat",
      "masini_de_spalat_rufe",
      "masina_de_spalat_rufe"
    ],
    stores: {
      smart: { facetName: "metaf_electrocasnice_si_climatizare", facetValue: "Masini de spalat rufe" },
      bomba: { id: 634121 },
      maximum: { path: "/ro/electrocasnice-mari/masini-de-spalat-si-uscat-rufe/" },
      enter: { id: 367 },
      darwin: { id: 680 },
      ultra: { id: 146 }
    }
  },
  {
    id: "dishwashers",
    name: "Dishwashers",
    aliases: ["dishwasher", "dishwashers", "masini_de_spalat_vase", "masina_de_spalat_vase"],
    stores: {
      smart: { facetName: "metaf_electrocasnice_si_climatizare", facetValue: "Masini de spalat vase" },
      bomba: { id: 348602 },
      maximum: { path: "/ro/electrocasnice-mari/masini-de-spalat-vase/" },
      enter: { id: 264 },
      darwin: { id: 681 },
      ultra: { id: 242 }
    }
  },
  {
    id: "vacuums",
    name: "Vacuums",
    aliases: ["vacuum", "vacuums", "aspirator", "aspiratoare"],
    stores: {
      smart: { facetName: "metaf_electrocasnice_si_climatizare", facetValue: "Aspiratoare" },
      bomba: { id: 634110 },
      maximum: { path: "/ro/electrocasnice-mari/aspiratoare/" },
      enter: { id: 32 },
      darwin: { id: 672 },
      ultra: { id: 115 }
    }
  }
];

const CATEGORIES_BY_ID = new Map(CATEGORY_DEFINITIONS.map((category) => [category.id, category]));
const CATEGORY_ALIASES = new Map();
for (const category of CATEGORY_DEFINITIONS) {
  CATEGORY_ALIASES.set(normalizeCategoryKey(category.id), category.id);
  for (const alias of category.aliases) {
    CATEGORY_ALIASES.set(normalizeCategoryKey(alias), category.id);
  }
}

export function listCategories() {
  return CATEGORY_DEFINITIONS.map((category) => ({
    id: category.id,
    name: category.name,
    aliases: [...category.aliases],
    stores: Object.keys(category.stores)
  }));
}

export function resolveCategory(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const categoryId = CATEGORY_ALIASES.get(normalizeCategoryKey(value));
  if (!categoryId) {
    throw new Error(`Unsupported category: ${value}`);
  }
  return CATEGORIES_BY_ID.get(categoryId);
}

export function categoryForStore(category, store) {
  if (!category) {
    return null;
  }
  const storeCategory = category.stores[store];
  if (!storeCategory) {
    throw new Error(`Category ${category.id} is not supported for store ${store}`);
  }
  return storeCategory;
}
