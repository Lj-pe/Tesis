const express = require('express');
const demandaPrediccionController = require('../controllers/demandaPrediccion.controller');

const router = express.Router();

router.get(
  '/api/predicciones/demanda/catalogo',
  demandaPrediccionController.getCatalog
);
router.get(
  '/api/predicciones/demanda/productos/:productId',
  demandaPrediccionController.getProductForecast
);

module.exports = router;
