jest.mock('../src/models/usuario.model', () => ({
  getUsuarioById: jest.fn(),
}));
jest.mock('../src/utils/jwt', () => ({
  verifyToken: jest.fn(),
}));
jest.mock('../src/controllers/demandaPrediccion.controller', () => ({
  getCatalog: jest.fn((req, res) => res.status(200).json({ ok: true })),
  getProductForecast: jest.fn((req, res) => res.status(200).json({ ok: true })),
}));

const express = require('express');
const supertest = require('supertest');
const usuarioModel = require('../src/models/usuario.model');
const { verifyToken } = require('../src/utils/jwt');
const authMiddleware = require('../src/middleware/authMiddleware');
const prediccionRoutes = require('../src/routes/prediccion.routes');
const demandaPrediccionController = require('../src/controllers/demandaPrediccion.controller');

const app = express();
app.use(authMiddleware);
app.use(prediccionRoutes);

describe('autenticación de rutas de predicción', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyToken.mockReturnValue({ id: '42' });
    usuarioModel.getUsuarioById.mockResolvedValue({
      id: '42',
      nombre_usuario: 'admin',
      nombre: 'Administrador',
      debe_cambiar_clave: 0,
    });
  });

  test('rechaza acceso al catálogo sin autenticación', async () => {
    const response = await supertest(app).get('/api/predicciones/demanda/catalogo');

    expect(response.status).toBe(401);
    expect(demandaPrediccionController.getCatalog).not.toHaveBeenCalled();
    expect(usuarioModel.getUsuarioById).not.toHaveBeenCalled();
  });

  test('permite a un usuario autenticado consultar el catálogo', async () => {
    const response = await supertest(app)
      .get('/api/predicciones/demanda/catalogo')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(verifyToken).toHaveBeenCalledWith('valid-token');
    expect(usuarioModel.getUsuarioById).toHaveBeenCalledWith('42');
    expect(demandaPrediccionController.getCatalog).toHaveBeenCalledTimes(1);
  });

  test('rechaza token inválido antes de ejecutar el controlador', async () => {
    verifyToken.mockImplementation(() => {
      throw Object.assign(new Error('invalid token'), { name: 'JsonWebTokenError' });
    });

    const response = await supertest(app)
      .get('/api/predicciones/demanda/productos/7?horizonte_dias=7')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(demandaPrediccionController.getProductForecast).not.toHaveBeenCalled();
  });

  test('ya no expone el CRUD heredado de predicciones', async () => {
    const response = await supertest(app)
      .get('/api/predicciones')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
    expect(response.text).not.toMatch(/minimarket_tesis|SQL|predicciones.*doesn't exist/i);
  });
});
