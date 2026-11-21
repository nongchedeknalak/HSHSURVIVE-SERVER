'use strict';

const catalogRepo = require('../repositories/catalog.repo');
const playerRepo = require('../repositories/player.repo');
const staticUtil = require('../utils/static');
const players = require('./player.service');
const config = require('../config');

const CURRENCY_BY_TYPE = config.store.currencyByType;
const CURRENCY_TYPE = config.store.currencyType;

class StoreError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isListed(product) {
  if (product.isActive === false || product.enabled === false) return false;
  const now = Date.now();
  if (product.startAt && new Date(product.startAt).getTime() > now) return false;
  if (product.endAt && new Date(product.endAt).getTime() < now) return false;
  return true;
}

function customProducts(bundles) {
  return (bundles || [])
    .filter((bundle) => isListed(bundle))
    .map((bundle) => ({
      _id: `custom_${bundle.shortCode}`,
      title: bundle.title || bundle.shortCode,
      description: bundle.description || '',
      shortCode: bundle.shortCode,
      steamProductId: null,
      imageURL: bundle.imageURL || '',
      tags: bundle.tags || ['bundle'],
      isActive: true,
      itemsInBundle: (bundle.items || []).map((item) => ({
        amount: item.amount,
        shortCode: item.shortCode,
      })),
      maxQuantityPerUser: bundle.limitPerUser ?? 1,
      priceTags: [{ currencyType: CURRENCY_TYPE[bundle.currency] || 1, price: Number(bundle.price) || 0 }],
      discountPriceTags: [],
      customShelf: bundle.shelf || 'direct_sale_store',
      createdAt: bundle.createdAt || new Date().toISOString(),
      updatedAt: bundle.updatedAt || new Date().toISOString(),
    }));
}

async function productListingResponse() {
  const base = await catalogRepo.products();
  const custom = customProducts(await catalogRepo.bundles());
  const ids = new Set(base.map((product) => product._id));
  const productListing = [...base, ...custom.filter((product) => !ids.has(product._id))]
    .filter((product) => isListed(product))
    .map(({ customShelf, ...product }) => product);

  return {
    status: 200,
    mime: 'application/json',
    data: {
      next: {},
      previous: {},
      totalDocument: productListing.length,
      productListing,
    },
  };
}

async function storeListResponse() {
  const stores = players.clone(await catalogRepo.stores());
  const custom = customProducts(await catalogRepo.bundles());

  for (const shelf of stores) {
    shelf.productListingOnShelfWithTitle = (shelf.productListingOnShelfWithTitle || []).filter(
      (product) => product.isActive === undefined || isListed(product)
    );
    const ids = Array.isArray(shelf.productListingOnShelf) ? [...shelf.productListingOnShelf] : [];

    for (const product of custom.filter((entry) => entry.customShelf === shelf.shortCode)) {
      const { customShelf, ...clean } = product;
      if (!ids.includes(clean._id)) ids.push(clean._id);
      if (!shelf.productListingOnShelfWithTitle.some((entry) => entry._id === clean._id)) {
        shelf.productListingOnShelfWithTitle.push(clean);
      }
    }
    shelf.productListingOnShelf = ids;
  }

  return {
    status: 200,
    mime: 'application/json',
    data: { next: {}, previous: {}, store: stores },
  };
}

async function itemsResponse() {
  const items = await catalogRepo.items();
  return {
    status: 200,
    mime: 'application/json',
    data: {
      next: {},
      previous: {},
      totalDocument: items.length,
      items,
    },
  };
}

async function findProduct(body, listing) {
  const id = body.productListingId || body.productId;
  if (id) {
    const found = listing.find((product) => product._id === id);
    if (found) return found;
  }
  if (body.shortCode) return listing.find((product) => product.shortCode === body.shortCode) || null;
  return null;
}

function purchaseResponse(player, product, currency, totalPrice, quantity, priceTagIndex, orderId) {
  const at = players.now();
  return {
    status: 200,
    data: {
      currentCurrency: {
        coin: player.coin || 0,
        amethyst: player.amethyst || 0,
        amulet: player.amulet || 0,
      },
      purchasing: {
        _id: orderId,
        orderId,
        userId: player.steamId,
        displayName: player.profile?.displayName || player.displayName || '',
        type_currency: currency,
        balance: player[currency] || 0,
        status: 0,
        purchasingToken: '',
        productListingId: product._id,
        redeemCode: null,
        purchasedBundleInfos: {
          title: product.title,
          descript: product.description,
          shortCode: product.shortCode,
          itemsInBundle: product.itemsInBundle,
          currency_type: product.priceTags?.[priceTagIndex]?.currencyType ?? CURRENCY_TYPE[currency],
          price: totalPrice,
          quantity,
        },
        selectedPriceTagIndex: priceTagIndex,
        platformSpecificInfo: { country: '', currency: '' },
        remark: 'from finalize purchasing',
        updatedAt: at,
        createdAt: at,
        completedAt: at,
      },
      purchasingLog: {
        _id: orderId,
        userId: player.steamId,
        status: 1,
        purchasingId: orderId,
        purchasingToken: '',
        productListingId: product._id,
        coin: player.coin || 0,
        amethyst: player.amethyst || 0,
        amulet: player.amulet || 0,
        remark: 'from finalize purchasing',
      },
    },
  };
}

async function purchase(player, body = {}) {
  console.log('[Store] purchase request:', {
    steamId: player.steamId,
    productListingId: body.productListingId || body.productId,
    shortCode: body.shortCode,
    quantity: body.quantity,
    selectedPriceTagIndex: body.selectedPriceTagIndex,
    keys: Object.keys(body),
  });

  const listing = (await productListingResponse()).data.productListing;
  const product = await findProduct(body, listing);
  if (!product) throw new StoreError(404, 'Product not found');

  const priceTags = product.priceTags || [];
  let index = Number(body.selectedPriceTagIndex ?? 0);
  if (!Number.isInteger(index) || index < 0 || index >= priceTags.length) index = 0;
  const tag = priceTags[index];
  if (!tag) throw new StoreError(400, 'Product has no price');

  const currency = CURRENCY_BY_TYPE[tag.currencyType];
  if (!currency) throw new StoreError(400, 'Real-money products are not supported');

  const maxQuantity = Math.min(config.store.maxQuantity, Number(product.maxQuantityPerUser) || config.store.maxQuantity);
  const quantity = Math.max(1, Math.min(maxQuantity, Number(body.quantity) || 1));
  const totalPrice = (Number(tag.price) || 0) * quantity;

  const purchaseCounts = player.purchaseCounts || {};
  const purchased = Number(purchaseCounts[product.shortCode] || 0);
  if (product.maxQuantityPerUser && purchased + quantity > Number(product.maxQuantityPerUser)) {
    throw new StoreError(400, 'Purchase limit reached');
  }

  // Atomic debit with balance guard — prevents overspending on concurrent clicks.
  const debited = await playerRepo.debit(player.steamId, currency, totalPrice);
  if (!debited) {
    console.warn(`[Store] purchase rejected (400): Not enough ${currency}`);
    throw new StoreError(400, `Not enough ${currency}`);
  }

  // Grant items on the freshly debited document.
  const updated = await playerRepo.find(player.steamId);
  let granted = 0;
  for (const item of product.itemsInBundle || []) {
    const code = item.shortCode;
    const amount = (Number(item.amount) || 1) * quantity;
    if (CURRENCY_TYPE[code]) {
      updated[code] = (Number(updated[code]) || 0) + amount;
    } else if (players.grantItem(updated, code, amount)) {
      granted += 1;
    }
  }

  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  updated.purchaseCounts = { ...purchaseCounts, [product.shortCode]: purchased + quantity };
  updated.purchaseLog = [
    ...(updated.purchaseLog || []),
    { orderId, shortCode: product.shortCode, productId: product._id, currency, price: totalPrice, quantity, at: players.now() },
  ].slice(-100);
  await players.save(updated);

  console.log(
    `[Store] ${player.steamId} bought ${quantity}x ${product.shortCode} ` +
      `for ${totalPrice} ${currency} | balance now=${updated[currency]} | granted=${granted}`
  );

  return purchaseResponse(updated, product, currency, totalPrice, quantity, index, orderId);
}

async function reloadBundles() {
  staticUtil.clear('custom/bundles.json');
  const file = staticUtil.read('custom/bundles.json');
  const count = await catalogRepo.saveBundles(file.bundles || []);
  return { bundles: count, products: customProducts(await catalogRepo.bundles()).length };
}

async function setBundles(bundles) {
  if (!Array.isArray(bundles)) throw new StoreError(400, 'bundles must be an array');
  const count = await catalogRepo.saveBundles(bundles);
  return { bundles: count, products: customProducts(await catalogRepo.bundles()).length };
}

function debugBalance(player) {
  return {
    steamId: player.steamId,
    coin: player.coin,
    amethyst: player.amethyst,
    amulet: player.amulet,
    purchaseCounts: player.purchaseCounts || {},
    purchaseLog: (player.purchaseLog || []).slice(-5),
  };
}

module.exports = {
  StoreError, isListed, customProducts, productListingResponse, storeListResponse,
  itemsResponse, purchase, reloadBundles, setBundles, debugBalance,
};
