'use strict';

const express = require('express');
const router = express.Router();

const storeService = require('../services/store.service');
const catalogRepo = require('../repositories/catalog.repo');
const { requireGame } = require('../middlewares/auth');
const { ok } = require('../utils/response');
const { asyncHandler, read } = require('../utils/async');

read(router, '/productlisting/list', async (req, res) => {
  return res.status(200).json(await storeService.productListingResponse());
});

read(router, '/item/listall', async (req, res) => {
  return res.status(200).json(await storeService.itemsResponse());
});

read(router, '/store/list', async (req, res) => {
  return res.status(200).json(await storeService.storeListResponse());
});

read(router, '/store/productlisting/list/tag', async (req, res) => {
  const tags = Array.isArray(req.body?.tags) ? [...req.body.tags].sort() : [];
  const key = tags.join(',');
  const data = await catalogRepo.taglist(key);
  if (!data) {
    return res.status(404).json({
      error: 'No matching data found',
      message: `No data file found for tags: ${key}`,
    });
  }
  return res.status(200).json(data);
});

router.post('/store/purchase', requireGame, asyncHandler(async (req, res) => {
  const result = await storeService.purchase(req.player, req.body || {});
  return res.status(200).json(result);
}));

router.post('/store/admin/reload', requireGame, asyncHandler(async (req, res) => {
  return ok(res, await storeService.reloadBundles());
}));

router.post('/store/debug/balance', requireGame, asyncHandler(async (req, res) => {
  return ok(res, storeService.debugBalance(req.player));
}));

module.exports = router;
