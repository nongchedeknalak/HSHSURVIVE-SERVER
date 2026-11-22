const router = require('express').Router();
const authController = require('@controllers/auth.controller');
const shopController = require('@controllers/custom-shop.controller');
router.get('/shop/list', authController.verifySession, shopController.list);
router.post('/shop/buy', authController.verifySession, shopController.buyItem);
router.post('/shop/bundle/buy', authController.verifySession, shopController.buyBundle);
module.exports = router;
