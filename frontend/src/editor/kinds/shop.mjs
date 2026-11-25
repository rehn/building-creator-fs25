// Where a building shows in the game's shop and construction menu (kind.placeable's `shop`): the store category, and the construction menu's category and tab.
// The choices are combinations the base game's own placeables use (read from data/placeables: for example farmhouses | buildings | farmhouses, gardenSheds | decoration | uncategorized);
// the lists are in the SDK (sdk/xmlDoku/storeCategories.xml, constructionCategories.xml). The kinds that are simple buildings take the choice; the others (animal buildings, stations) keep their own.
export const SHOP_CATEGORIES = [
  ["auto", "As the type of building"],
  ["farmhouses", "Farmhouses (Buildings)"],
  ["sheds", "Sheds (Buildings)"],
  ["gardenSheds", "Garden sheds (Decoration)"],
  ["decoration", "Decoration"],
];
const SHOPS = {
  farmhouses: {category: "farmhouses", type: "placeable", brush: "buildings", tab: "farmhouses"},
  sheds: {category: "sheds", type: "placeable", brush: "buildings", tab: "sheds"},
  gardenSheds: {category: "gardenSheds", type: "placeable", brush: "decoration", tab: "uncategorized"},
  decoration: {category: "decoration", type: "placeable", brush: "decoration", tab: "decoration"},
};
/** The kinds whose shop place is a choice. */
export const SHOP_KINDS = ["house", "shed", "dealership"];
/** The shop place of a building: its choice (p.shopCategory), or `own` (the kind's) for "auto" and anything unknown. */
export const shopFor = (p, own) => SHOPS[p && p.shopCategory] || own;
