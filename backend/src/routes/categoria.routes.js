const express = require('express');
const categoriaController = require('../controllers/categoria.controller');
const authorizeModule = require('../middleware/authorizeModule');
const authorizeAction = require('../middleware/authorizeAction');

const router = express.Router();

router.get('/api/categorias', authorizeModule('Categorías'), authorizeAction('Categorías', 'ver'), categoriaController.getAllCategorias);
router.get('/api/categorias/:id', authorizeModule('Categorías'), authorizeAction('Categorías', 'detalle'), categoriaController.getCategoriaById);
router.post('/api/categorias', authorizeModule('Categorías'), authorizeAction('Categorías', 'crear'), categoriaController.createCategoria);
router.put('/api/categorias/:id', authorizeModule('Categorías'), authorizeAction('Categorías', 'editar'), categoriaController.updateCategoria);
router.delete('/api/categorias/:id', authorizeModule('Categorías'), authorizeAction('Categorías', 'eliminar'), categoriaController.deleteCategoria);

module.exports = router;
