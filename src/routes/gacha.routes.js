const express = require('express');
const router = express.Router();
const authController = require('@controllers/auth.controller');
const gacha = require('@controllers/gacha.controller');

router.post('/api/open', authController.verifySession, gacha.OpenLootBox);

module.exports = router;
