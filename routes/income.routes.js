const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/income.controller');

router.post('/', incomeController.createIncome);

module.exports = router;