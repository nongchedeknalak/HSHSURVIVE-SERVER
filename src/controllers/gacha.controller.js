const staticJson = require('@utils/static-json.util');
const inventoryService = require('@services/inventory.service');

const RARITY_WEIGHTS = { 1: 65, 2: 22, 3: 9, 4: 3, 5: 1 };
const LOOT_BOX_FILES = {
  Default_Gacha: 'static/pots/greedy.json',
  Bullet_Gacha: 'static/pots/bullet.json',
};

function selectRarity() {
  const total = Object.values(RARITY_WEIGHTS).reduce((sum, value) => sum + value, 0);
  let roll = Math.random() * total;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
    roll -= weight;
    if (roll < 0) return rarity;
  }
  return '1';
}

function chooseItem(items, rarity) {
  const pool = items.filter((item) => String(item.rarity) === String(rarity));
  const selectedPool = pool.length ? pool : items;
  return selectedPool[Math.floor(Math.random() * selectedPool.length)];
}


module.exports.OpenLootBox = async (req, res) => {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    const { loot_box_short_code, amount } = req.body || {};
    if (!LOOT_BOX_FILES[loot_box_short_code]) {
      return res.status(400).json({ status: 'error', message: 'Invalid loot box type' });
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return res.status(400).json({ status: 'error', message: 'amount must be an integer between 1 and 100' });
    }

    // Only Default_Gacha uses the Greedy Pot counter. Bullet pot keeps its own counter.
    const inventory = player.inventory || (player.inventory = {});
    const counterKey = loot_box_short_code === 'Default_Gacha' ? 'lootBoxAmount' : 'bulletAmount';
    const available = Number(inventory[counterKey] || 0);
    if (available < amount) {
      return res.status(400).json({ status: 'error', message: `Not enough pot charges (${available} available)` });
    }

    const bannerData = await staticJson.load(LOOT_BOX_FILES[loot_box_short_code]);
    const items = bannerData.data?.items || bannerData.items || [];
    if (!items.length) return res.status(500).json({ status: 'error', message: 'Pot has no items configured' });

    const drops = [];
    for (let i = 0; i < amount; i++) {
      const item = chooseItem(items, selectRarity());
      const isDuplicate = inventoryService.playerOwnsItem(player, item.short_code);
      const drop = {
        short_code: item.short_code,
        name: item.name || item.short_code,
        type: item.type,
        rarity: String(item.rarity || '1'),
        amount: Number(item.amount || 1),
        duplicate_exchange: item.duplicate_exchange || { enable: false, short_code: 'coin', amount: 0, type: 'currency' },
        is_dup: isDuplicate,
      };

      if (isDuplicate && drop.duplicate_exchange.enable) {
        const exchangeAmount = Math.max(0, Number(drop.duplicate_exchange.amount || 0));
        if (drop.duplicate_exchange.short_code === 'coin') player.coin = Number(player.coin || 0) + exchangeAmount;
        drop.exchange_received = { currency: drop.duplicate_exchange.short_code, amount: exchangeAmount };
      } else if (!isDuplicate) {
        await inventoryService.addItemToInventory(player, item.short_code, drop.amount, { save: false });
      }
      drops.push(drop);
    }

    inventory[counterKey] = available - amount;
    player.markModified('inventory');
    await player.save();


    return res.status(200).json({ status: 'success', data: {
      loot_box_type_str: loot_box_short_code,
      loot_box_amount: amount,
      remaining: inventory[counterKey],
      lootdrops: drops,
    }});
  } catch (error) {
    console.error('Error opening loot pot:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to open loot pot' });
  }
};
