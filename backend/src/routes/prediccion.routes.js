const express = require('express');
const prediccionController = require('../controllers/prediccion.controller');
const authorizeModule = require('../middleware/authorizeModule');

const router = express.Router();

router.get('/api/predicciones', authorizeModule('Predicción'), prediccionController.getAllPredicciones);
router.get('/api/predicciones/:id', authorizeModule('Predicción'), prediccionController.getPrediccionById);
router.post('/api/predicciones', authorizeModule('Predicción'), prediccionController.createPrediccion);
router.put('/api/predicciones/:id', authorizeModule('Predicción'), prediccionController.updatePrediccion);
router.delete('/api/predicciones/:id', authorizeModule('Predicción'), prediccionController.deletePrediccion);

module.exports = router;
