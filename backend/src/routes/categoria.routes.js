const express = require('express');
const categoriaController = require('../controllers/categoria.controller');

const router = express.Router();

router.get('/api/categorias', categoriaController.getAllCategorias);
router.get('/api/categorias/:id', categoriaController.getCategoriaById);
router.post('/api/categorias', categoriaController.createCategoria);
router.put('/api/categorias/:id', categoriaController.updateCategoria);
router.delete('/api/categorias/:id', categoriaController.deleteCategoria);

module.exports = router;
