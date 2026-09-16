const express = require('express');
const prediccionController = require('../controllers/prediccion.controller');

const router = express.Router();

router.get('/api/predicciones', prediccionController.getAllPredicciones);
router.get('/api/predicciones/:id', prediccionController.getPrediccionById);
router.post('/api/predicciones', prediccionController.createPrediccion);
router.put('/api/predicciones/:id', prediccionController.updatePrediccion);
router.delete('/api/predicciones/:id', prediccionController.deletePrediccion);

module.exports = router;
