const fs = require('fs').promises;
const path = require('path');
const inventoryService = require('@services/inventory.service');
const { sendError, sendSuccess } = require('@utils/response.util');


const SHOP_FILE = path.join(__dirname, '../../data/static/store/custom/shop.json');
const VALID_CURRENCIES = ['coin', 'amethyst', 'amulet'];


async function loadShop() {
  const raw = await fs.readFile(SHOP_FILE, 'utf8');
  return JSON.parse(raw);
}


function validateQuantity(quantity) {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 999;
}


exports.list = async (req, res) => {
  try {
    const shop = await loadShop();
    const player = req.player;
    const currency = shop.data.currency || 'coin';
    return sendSuccess(res, {
      currency,
      balance: Number(player[currency] || 0),
      items: shop.data.items.filter(item => item.enabled !== false),
      bundles: shop.data.bundles.filter(bundle => bundle.enabled === true),
    });
  } catch (error) {
    console.error('Custom shop list error:', error);
    return sendError(res, 500, 'Could not load shop');
  }
};


exports.buyItem = async (req, res) => {
  try {
    const player = req.player;
    const { itemId, quantity = 1 } = req.body || {};
    if (!itemId || !validateQuantity(quantity)) return sendError(res, 400, 'itemId and valid quantity (1-999) are required');

    const shop = await loadShop();
    const listing = shop.data.items.find(item => item.itemId === itemId && item.enabled !== false);
    if (!listing) return sendError(res, 404, 'Item is not for sale');
    const currency = listing.currency || shop.data.currency || 'coin';
    if (!VALID_CURRENCIES.includes(currency)) return sendError(res, 400, 'Invalid shop currency');
    const price = Number(listing.price);
    if (!Number.isSafeInteger(price) || price < 0) return sendError(res, 400, 'Invalid item price');
    const total = price * quantity;
    if (!Number.isSafeInteger(total)) return sendError(res, 400, 'Invalid total price');

    const category = inventoryService.resolveInventoryCategory(itemId);
    if (category !== 'items' && quantity !== 1) return sendError(res, 400, 'Non-stackable items can only be purchased one at a time');
    if (category !== 'items' && inventoryService.playerOwnsItem(player, itemId)) {
      return sendError(res, 409, 'You already own this item');
    }
    if (Number(player[currency] || 0) < total) return sendError(res, 400, 'Not enough currency');

    player[currency] = Number(player[currency] || 0) - total;
    await inventoryService.addItemToInventory(player, itemId, quantity, { save: false });
    await player.save();
    return sendSuccess(res, { itemId, quantity, currency, totalPrice: total, balance: player[currency] });
  } catch (error) {
    console.error('Custom shop buy error:', error);
    return sendError(res, 500, 'Purchase failed');
  }
};


exports.buyBundle = async (req, res) => {
  try {
    const player = req.player;
    const bundleId = req.body?.bundleId;
    if (!bundleId) return sendError(res, 400, 'bundleId is required');

    const shop = await loadShop();
    const bundle = shop.data.bundles.find(entry => entry.id === bundleId && entry.enabled === true);
    if (!bundle) return sendError(res, 404, 'Bundle not found or disabled');
    if (!Array.isArray(bundle.items) || bundle.items.length === 0) return sendError(res, 400, 'Bundle has no items');

    const currency = bundle.currency || shop.data.currency || 'coin';
    if (!VALID_CURRENCIES.includes(currency)) return sendError(res, 400, 'Invalid bundle currency');
    const price = Number(bundle.price);
    if (!Number.isSafeInteger(price) || price < 0) return sendError(res, 400, 'Invalid bundle price');
    if (Number(player[currency] || 0) < price) return sendError(res, 400, 'Not enough currency');

    for (const entry of bundle.items) {
      if (!entry.itemId || !validateQuantity(entry.quantity ?? 1)) return sendError(res, 400, 'Invalid bundle item data');
      const category = inventoryService.resolveInventoryCategory(entry.itemId);
      if (category !== 'items' && (entry.quantity ?? 1) !== 1) return sendError(res, 400, 'Non-stackable bundle items must have quantity 1');
      if (category !== 'items' && inventoryService.playerOwnsItem(player, entry.itemId)) {
        return sendError(res, 409, `Bundle contains an item already owned: ${entry.itemId}`);
      }
    }

    player[currency] = Number(player[currency] || 0) - price;
    for (const entry of bundle.items) {
      await inventoryService.addItemToInventory(player, entry.itemId, entry.quantity ?? 1, { save: false });
    }
    await player.save();
    return sendSuccess(res, { bundleId, items: bundle.items, currency, totalPrice: price, balance: player[currency] });
  } catch (error) {
    console.error('Custom shop bundle purchase error:', error);
    return sendError(res, 500, 'Bundle purchase failed');
  }
};
