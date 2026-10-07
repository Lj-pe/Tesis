const express = require('express');
const reportesController = require('../controllers/reportes.controller');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get(
  '/api/reportes/datos',
  authMiddleware,
  authorizeModule('Reportes'),
  reportesController.getDatosReportes
);

module.exports = router;
