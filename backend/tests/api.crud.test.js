const bcrypt = require('bcryptjs');
const supertest = require('supertest');
const app = require('../src/app');
const pool = require('../src/config/database');

const makeUnique = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

let authToken = null;
let seededUsername = null;
let seededPassword = null;
let adminRoleId = null;
let nonAdminRoleId = null;
let nonAdminUser = null;
let nonAdminToken = null;

const request = (appInstance) => {
  const baseRequest = supertest(appInstance);

  return {
    get: (url) => {
      const req = baseRequest.get(url);
      if (authToken) {
        req.set('Authorization', `Bearer ${authToken}`);
      }
      return req;
    },
    post: (url) => {
      const req = baseRequest.post(url);
      if (authToken) {
        req.set('Authorization', `Bearer ${authToken}`);
      }
      return req;
    },
    put: (url) => {
      const req = baseRequest.put(url);
      if (authToken) {
        req.set('Authorization', `Bearer ${authToken}`);
      }
      return req;
    },
    delete: (url) => {
      const req = baseRequest.delete(url);
      if (authToken) {
        req.set('Authorization', `Bearer ${authToken}`);
      }
      return req;
    },
  };
};

const createRole = async (overrides = {}) => {
  const payload = {
    nombre: makeUnique('rol'),
    descripcion: 'descripcion de prueba',
    estado: 'activo',
    ...overrides,
  };

  const res = await request(app).post('/api/roles').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createCategoria = async (overrides = {}) => {
  const payload = {
    nombre: makeUnique('categoria'),
    descripcion: 'descripcion de prueba',
    estado: 'activo',
    ...overrides,
  };

  const res = await request(app).post('/api/categorias').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createProveedor = async (overrides = {}) => {
  const payload = {
    nombre: makeUnique('proveedor'),
    contacto: 'Contacto prueba',
    telefono: '123456789',
    email: `${makeUnique('proveedor')}@test.com`,
    direccion: 'Direccion prueba',
    documento_identidad: '123456789',
    estado: 'activo',
    ...overrides,
  };

  const res = await request(app).post('/api/proveedores').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createUsuario = async (roleId, overrides = {}) => {
  const payload = {
    rol_id: roleId,
    nombre: 'Usuario',
    apellido: 'Prueba',
    username: makeUnique('usuario'),
    email: `${makeUnique('usuario')}@test.com`,
    password: 'Password123!',
    estado: 'activo',
    ...overrides,
  };

  const res = await request(app).post('/api/usuarios').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createProducto = async (categoryId, overrides = {}) => {
  const payload = {
    categoria_id: categoryId,
    codigo_sku: makeUnique('sku'),
    nombre: makeUnique('producto'),
    descripcion: 'descripcion de prueba',
    estado: 'activo',
    unidad_medida: 'unidad',
    precio_venta_actual: 100.00,
    costo_promedio_actual: 80.00,
    ...overrides,
  };

  const res = await request(app).post('/api/productos').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createInventario = async (productId, overrides = {}) => {
  const payload = {
    producto_id: productId,
    stock_actual: 10,
    stock_minimo: 2,
    stock_seguridad: 1,
    stock_maximo: 50,
    estado_inventario: 'normal',
    ...overrides,
  };

  const res = await request(app).post('/api/inventarios').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createCompra = async (proveedorId, usuarioId, overrides = {}) => {
  const payload = {
    proveedor_id: proveedorId,
    usuario_id: usuarioId,
    numero_factura: makeUnique('factura'),
    fecha_compra: '2026-09-14',
    fecha_recepcion: '2026-09-15',
    subtotal: 100.00,
    total: 116.00,
    estado: 'pendiente',
    observaciones: 'compra de prueba',
    ...overrides,
  };

  const res = await request(app).post('/api/compras').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createVenta = async (usuarioId, overrides = {}) => {
  const payload = {
    usuario_id: usuarioId,
    numero_factura: makeUnique('venta'),
    fecha_venta: '2026-09-14',
    subtotal: 100.00,
    descuento: 0.00,
    total: 116.00,
    estado: 'pendiente',
    observaciones: 'venta de prueba',
    forma_pago: 'efectivo',
    ...overrides,
  };

  const res = await request(app).post('/api/ventas').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createDetalleCompra = async (compraId, productoId, overrides = {}) => {
  const payload = {
    compra_id: compraId,
    producto_id: productoId,
    cantidad: 2,
    costo_unitario: 50.00,
    subtotal: 100.00,
    total_linea: 116.00,
    observaciones: 'detalle compra prueba',
    ...overrides,
  };

  const res = await request(app).post('/api/detalle-compras').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createDetalleVenta = async (ventaId, productoId, overrides = {}) => {
  const payload = {
    venta_id: ventaId,
    producto_id: productoId,
    cantidad: 1,
    precio_unitario: 100.00,
    subtotal: 100.00,
    descuento: 0.00,
    total_linea: 116.00,
    ...overrides,
  };

  const res = await request(app).post('/api/detalle-ventas').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createMovimientoInventario = async (inventarioId, usuarioId, overrides = {}) => {
  const payload = {
    inventario_id: inventarioId,
    tipo_movimiento: 'entrada',
    cantidad: 5,
    motivo: 'Ingreso de prueba',
    usuario_id: usuarioId,
    estado: 'confirmado',
    observaciones: 'movimiento pruebas',
    ...overrides,
  };

  const res = await request(app).post('/api/movimientos-inventario').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

const createPrediccion = async (productoId, overrides = {}) => {
  const payload = {
    producto_id: productoId,
    periodo_inicio: '2026-09-01',
    periodo_fin: '2026-09-30',
    metodo_prediccion: 'promedio',
    valor_predicho: 42.50,
    intervalo_confianza: 10.00,
    estado: 'generada',
    observaciones: 'prediccion de prueba',
    ...overrides,
  };

  const res = await request(app).post('/api/predicciones').send(payload);
  expect(res.status).toBe(201);
  return res.body;
};

beforeAll(async () => {
  seededUsername = makeUnique('seed_user');
  seededPassword = 'Password123!';

  const adminRole = await pool.query(
    'SELECT id_rol FROM roles WHERE nombre = ? LIMIT 1',
    ['Administrador']
  );

  adminRoleId = adminRole[0][0]?.id_rol || null;

  if (!adminRoleId) {
    throw new Error('No se encontró el rol Administrador en la base de datos');
  }

  const passwordHash = await bcrypt.hash(seededPassword, 10);

  const [seedUserResult] = await pool.query(
    `INSERT INTO usuarios (
      rol_id,
      nombre,
      apellido,
      username,
      email,
      password_hash,
      estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      adminRoleId,
      'Seed',
      'User',
      seededUsername,
      `${seededUsername}@test.com`,
      passwordHash,
      'activo',
    ]
  );

  const loginRes = await supertest(app).post('/api/auth/login').send({
    username: seededUsername,
    password: seededPassword,
  });

  expect(loginRes.status).toBe(200);
  authToken = loginRes.body.token;

  const nonAdminRoleName = makeUnique('rol_no_admin');
  const [nonAdminRoleResult] = await pool.query(
    'INSERT INTO roles (nombre, descripcion, estado) VALUES (?, ?, ?)',
    [nonAdminRoleName, 'rol para pruebas de autorizacion', 'activo']
  );

  nonAdminRoleId = nonAdminRoleResult.insertId;

  const nonAdminUsername = makeUnique('usuario_no_admin');
  const nonAdminPassword = 'Password123!';
  const nonAdminPasswordHash = await bcrypt.hash(nonAdminPassword, 10);

  const [nonAdminInserted] = await pool.query(
    `INSERT INTO usuarios (
      rol_id,
      nombre,
      apellido,
      username,
      email,
      password_hash,
      estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      nonAdminRoleId,
      'NoAdmin',
      'User',
      nonAdminUsername,
      `${nonAdminUsername}@test.com`,
      nonAdminPasswordHash,
      'activo',
    ]
  );

  nonAdminUser = {
    id_usuario: nonAdminInserted.insertId,
    username: nonAdminUsername,
    password: nonAdminPassword,
  };

  const nonAdminLoginRes = await supertest(app).post('/api/auth/login').send({
    username: nonAdminUsername,
    password: nonAdminPassword,
  });

  expect(nonAdminLoginRes.status).toBe(200);
  nonAdminToken = nonAdminLoginRes.body.token;
});

describe('Authentication endpoints', () => {
  test('POST /api/auth/login returns token for valid credentials', async () => {
    const res = await supertest(app).post('/api/auth/login').send({
      username: seededUsername,
      password: seededPassword,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('id_usuario');
  });

  test('POST /api/auth/login rejects wrong password', async () => {
    const res = await supertest(app).post('/api/auth/login').send({
      username: seededUsername,
      password: 'wrong-password',
    });

    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login rejects unknown user', async () => {
    const res = await supertest(app).post('/api/auth/login').send({
      username: makeUnique('desconocido'),
      password: 'Password123!',
    });

    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me returns current user when token is valid', async () => {
    const res = await supertest(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id_usuario');
    expect(res.body.password_hash).toBeUndefined();
  });

  test('GET /api/auth/me rejects missing token', async () => {
    const res = await supertest(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me rejects invalid token', async () => {
    const res = await supertest(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  test('GET /api/usuarios rejects access without token', async () => {
    const res = await supertest(app).get('/api/usuarios');

    expect(res.status).toBe(401);
  });

  test('GET /api/usuarios returns list with valid token', async () => {
    const res = await request(app).get('/api/usuarios');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Administrador accede a /api/usuarios', async () => {
    const res = await supertest(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  test('Administrador accede a /api/roles', async () => {
    const res = await supertest(app)
      .get('/api/roles')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  test('Usuario con otro rol intenta acceder a /api/usuarios y recibe 403', async () => {
    const res = await supertest(app)
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${nonAdminToken}`);

    expect(res.status).toBe(403);
  });

  test('Usuario con otro rol intenta acceder a /api/roles y recibe 403', async () => {
    const res = await supertest(app)
      .get('/api/roles')
      .set('Authorization', `Bearer ${nonAdminToken}`);

    expect(res.status).toBe(403);
  });

  test('GET /api/usuarios sin token devuelve 401', async () => {
    const res = await supertest(app).get('/api/usuarios');

    expect(res.status).toBe(401);
  });

  test('GET /api/usuarios con token invalido devuelve 401', async () => {
    const res = await supertest(app)
      .get('/api/usuarios')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });
});

describe('Backend CRUD endpoints', () => {
  test('GET /api/roles returns list', async () => {
    const res = await request(app).get('/api/roles');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/roles creates a role', async () => {
    const role = await createRole();
    expect(role).toHaveProperty('id_rol');
    expect(role.nombre).toBeDefined();
  });

  test('GET /api/roles/:id returns a role', async () => {
    const role = await createRole();
    const res = await request(app).get(`/api/roles/${role.id_rol}`);
    expect(res.status).toBe(200);
    expect(res.body.id_rol).toBe(role.id_rol);
  });

  test('PUT /api/roles/:id updates a role', async () => {
    const role = await createRole();
    const res = await request(app)
      .put(`/api/roles/${role.id_rol}`)
      .send({ nombre: makeUnique('rol_actualizado'), estado: 'inactivo' });

    expect(res.status).toBe(200);
    expect(res.body.nombre).toBeDefined();
  });

  test('DELETE /api/roles/:id deletes a role', async () => {
    const role = await createRole();
    const res = await request(app).delete(`/api/roles/${role.id_rol}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/eliminado/i);
  });

  test('POST /api/roles rejects invalid estado enum', async () => {
    const res = await request(app).post('/api/roles').send({
      nombre: makeUnique('rol_invalido'),
      descripcion: 'x',
      estado: 'invalido',
    });

    expect(res.status).toBe(400);
  });

  test('GET /api/categorias returns list', async () => {
    const res = await request(app).get('/api/categorias');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/categorias creates a category', async () => {
    const category = await createCategoria();
    expect(category).toHaveProperty('id_categoria');
  });

  test('GET /api/categorias/:id returns a category', async () => {
    const category = await createCategoria();
    const res = await request(app).get(`/api/categorias/${category.id_categoria}`);
    expect(res.status).toBe(200);
    expect(res.body.id_categoria).toBe(category.id_categoria);
  });

  test('PUT /api/categorias/:id updates a category', async () => {
    const category = await createCategoria();
    const res = await request(app)
      .put(`/api/categorias/${category.id_categoria}`)
      .send({ nombre: makeUnique('categoria_actualizada'), estado: 'inactivo' });

    expect(res.status).toBe(200);
  });

  test('DELETE /api/categorias/:id deletes a category', async () => {
    const category = await createCategoria();
    const res = await request(app).delete(`/api/categorias/${category.id_categoria}`);
    expect(res.status).toBe(200);
  });

  test('POST /api/categorias rejects duplicate nombre', async () => {
    const category = await createCategoria();
    const res = await request(app).post('/api/categorias').send({
      nombre: category.nombre,
      descripcion: 'otra',
      estado: 'activo',
    });

    expect(res.status).toBe(409);
  });

  test('GET /api/proveedores returns list', async () => {
    const res = await request(app).get('/api/proveedores');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /api/proveedores creates a provider', async () => {
    const provider = await createProveedor();
    expect(provider).toHaveProperty('id_proveedor');
  });

  test('GET /api/proveedores/:id returns a provider', async () => {
    const provider = await createProveedor();
    const res = await request(app).get(`/api/proveedores/${provider.id_proveedor}`);
    expect(res.status).toBe(200);
    expect(res.body.id_proveedor).toBe(provider.id_proveedor);
  });

  test('PUT /api/proveedores/:id updates a provider', async () => {
    const provider = await createProveedor();
    const res = await request(app)
      .put(`/api/proveedores/${provider.id_proveedor}`)
      .send({ nombre: makeUnique('proveedor_actualizado'), estado: 'inactivo' });

    expect(res.status).toBe(200);
  });

  test('DELETE /api/proveedores/:id deletes a provider', async () => {
    const provider = await createProveedor();
    const res = await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/usuarios returns list', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const res = await request(app).get('/api/usuarios');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('POST /api/usuarios creates a user', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    expect(user).toHaveProperty('id_usuario');
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('GET /api/usuarios/:id returns a user', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const res = await request(app).get(`/api/usuarios/${user.id_usuario}`);
    expect(res.status).toBe(200);
    expect(res.body.id_usuario).toBe(user.id_usuario);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('PUT /api/usuarios/:id updates a user', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const res = await request(app)
      .put(`/api/usuarios/${user.id_usuario}`)
      .send({ nombre: 'Usuario Actualizado', estado: 'inactivo' });

    expect(res.status).toBe(200);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('DELETE /api/usuarios/:id deletes a user', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const res = await request(app).delete(`/api/usuarios/${user.id_usuario}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/productos returns list', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const res = await request(app).get('/api/productos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('POST /api/productos creates a product', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    expect(product).toHaveProperty('id_producto');
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('GET /api/productos/:id returns a product', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const res = await request(app).get(`/api/productos/${product.id_producto}`);
    expect(res.status).toBe(200);
    expect(res.body.id_producto).toBe(product.id_producto);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('PUT /api/productos/:id updates a product', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const res = await request(app)
      .put(`/api/productos/${product.id_producto}`)
      .send({ nombre: makeUnique('producto_actualizado'), estado: 'inactivo' });

    expect(res.status).toBe(200);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('DELETE /api/productos/:id deletes a product', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const res = await request(app).delete(`/api/productos/${product.id_producto}`);
    expect(res.status).toBe(200);
  });

  test('GET /api/inventarios returns list', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto);
    const res = await request(app).get('/api/inventarios');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/inventarios/${inventory.id_inventario}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('POST /api/inventarios creates an inventory', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto);
    expect(inventory).toHaveProperty('id_inventario');
    await request(app).delete(`/api/inventarios/${inventory.id_inventario}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('GET /api/inventarios/:id returns an inventory', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto);
    const res = await request(app).get(`/api/inventarios/${inventory.id_inventario}`);
    expect(res.status).toBe(200);
    expect(res.body.id_inventario).toBe(inventory.id_inventario);
    await request(app).delete(`/api/inventarios/${inventory.id_inventario}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('PUT /api/inventarios/:id updates an inventory', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto);
    const res = await request(app)
      .put(`/api/inventarios/${inventory.id_inventario}`)
      .send({ stock_actual: 20, stock_minimo: 3, estado_inventario: 'bajo' });

    expect(res.status).toBe(200);
    await request(app).delete(`/api/inventarios/${inventory.id_inventario}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('DELETE /api/inventarios/:id deletes an inventory', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto);
    const res = await request(app).delete(`/api/inventarios/${inventory.id_inventario}`);
    expect(res.status).toBe(200);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('POST /api/inventarios rejects invalid foreign key', async () => {
    const res = await request(app).post('/api/inventarios').send({
      producto_id: 999999,
      stock_actual: 0,
      stock_minimo: 0,
    });

    expect(res.status).toBe(400);
  });

  test('GET /api/compras returns list', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const purchase = await createCompra(provider.id_proveedor, user.id_usuario);
    const res = await request(app).get('/api/compras');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/compras/${purchase.id_compra}`);
    await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('POST /api/compras creates a purchase', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const purchase = await createCompra(provider.id_proveedor, user.id_usuario);
    expect(purchase).toHaveProperty('id_compra');
    await request(app).delete(`/api/compras/${purchase.id_compra}`);
    await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('purchase endpoints reject the parcial state', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const purchase = await createCompra(provider.id_proveedor, user.id_usuario);

    try {
      const createRes = await request(app).post('/api/compras').send({
        proveedor_id: provider.id_proveedor,
        usuario_id: user.id_usuario,
        fecha_compra: '2026-09-14',
        estado: 'parcial',
      });
      expect(createRes.status).toBe(400);

      const updateRes = await request(app)
        .put(`/api/compras/${purchase.id_compra}`)
        .send({ estado: 'parcial' });
      expect(updateRes.status).toBe(400);

      const transactionalRes = await request(app)
        .post('/api/compras/transaccional')
        .send({ estado: 'parcial' });
      expect(transactionalRes.status).toBe(400);
    } finally {
      await request(app).delete(`/api/compras/${purchase.id_compra}`);
      await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
      await request(app).delete(`/api/usuarios/${user.id_usuario}`);
      await request(app).delete(`/api/roles/${role.id_rol}`);
    }
  });

  test('POST /api/compras/transaccional creates a received purchase and updates inventory', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto, { stock_actual: 0, stock_minimo: 0, stock_maximo: 50 });

    let createdPurchaseId = null;

    try {
      const res = await request(app).post('/api/compras/transaccional').send({
        proveedor_id: provider.id_proveedor,
        usuario_id: user.id_usuario,
        numero_factura: makeUnique('compra_transaccional'),
        fecha_compra: '2026-09-14',
        fecha_recepcion: '2026-09-15',
        estado: 'recibida',
        observaciones: 'compra transaccional prueba',
        detalles: [
          {
            producto_id: product.id_producto,
            cantidad: 3,
            costo_unitario: 50.0,
            observaciones: 'detalle compra transaccional',
          },
        ],
      });

      createdPurchaseId = res.body.compra.id_compra;

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id_compra');
      expect(res.body.compra).toHaveProperty('id_compra');
      expect(res.body.compra.total).toBe('150.00');

      const [inventoryRows] = await pool.query(
        'SELECT stock_actual FROM inventarios WHERE id_inventario = ?',
        [inventory.id_inventario]
      );

      expect(inventoryRows[0].stock_actual).toBe(3);

      const [movementRows] = await pool.query(
        'SELECT tipo_movimiento, cantidad, compra_id, inventario_id FROM movimientos_inventario WHERE compra_id = ?',
        [createdPurchaseId]
      );

      expect(movementRows).toHaveLength(1);
      expect(movementRows[0].tipo_movimiento).toBe('entrada');
      expect(movementRows[0].cantidad).toBe(3);
    } finally {
      if (createdPurchaseId) {
        const [movementRows] = await pool.query(
          'SELECT id_movimiento FROM movimientos_inventario WHERE compra_id IS NOT NULL AND compra_id = ?',
          [createdPurchaseId]
        );

        for (const row of movementRows) {
          await pool.query('DELETE FROM movimientos_inventario WHERE id_movimiento = ?', [row.id_movimiento]);
        }

        await pool.query('DELETE FROM detalle_compras WHERE compra_id = ?', [createdPurchaseId]);
        await pool.query('DELETE FROM compras WHERE id_compra = ?', [createdPurchaseId]);
      }

      await pool.query('DELETE FROM inventarios WHERE id_inventario = ?', [inventory.id_inventario]);
      await pool.query('DELETE FROM productos WHERE id_producto = ?', [product.id_producto]);
      await pool.query('DELETE FROM categorias WHERE id_categoria = ?', [category.id_categoria]);
      await pool.query('DELETE FROM proveedores WHERE id_proveedor = ?', [provider.id_proveedor]);
      await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [user.id_usuario]);
      await pool.query('DELETE FROM roles WHERE id_rol = ?', [role.id_rol]);
    }
  });

  test('GET /api/compras/:id returns a purchase', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const purchase = await createCompra(provider.id_proveedor, user.id_usuario);
    const res = await request(app).get(`/api/compras/${purchase.id_compra}`);
    expect(res.status).toBe(200);
    expect(res.body.id_compra).toBe(purchase.id_compra);
    await request(app).delete(`/api/compras/${purchase.id_compra}`);
    await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('PUT /api/compras/:id updates a purchase', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const purchase = await createCompra(provider.id_proveedor, user.id_usuario);
    const res = await request(app)
      .put(`/api/compras/${purchase.id_compra}`)
      .send({ observaciones: 'actualizado' });

    expect(res.status).toBe(200);
    expect(res.body.observaciones).toBe('actualizado');
    await request(app).delete(`/api/compras/${purchase.id_compra}`);
    await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('PUT /api/compras/:id rejects state transitions', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const pendingPurchase = await createCompra(provider.id_proveedor, user.id_usuario);
    const receivedPurchase = await createCompra(provider.id_proveedor, user.id_usuario, { estado: 'recibida' });

    try {
      const pendingToReceived = await request(app)
        .put(`/api/compras/${pendingPurchase.id_compra}`)
        .send({ estado: 'recibida' });
      const pendingToAnnulled = await request(app)
        .put(`/api/compras/${pendingPurchase.id_compra}`)
        .send({ estado: 'anulada' });
      const receivedToPending = await request(app)
        .put(`/api/compras/${receivedPurchase.id_compra}`)
        .send({ estado: 'pendiente' });
      const receivedToAnnulled = await request(app)
        .put(`/api/compras/${receivedPurchase.id_compra}`)
        .send({ estado: 'anulada' });

      expect(pendingToReceived.status).toBe(400);
      expect(pendingToAnnulled.status).toBe(400);
      expect(receivedToPending.status).toBe(400);
      expect(receivedToAnnulled.status).toBe(400);
    } finally {
      await request(app).delete(`/api/compras/${pendingPurchase.id_compra}`);
      await request(app).delete(`/api/compras/${receivedPurchase.id_compra}`);
      await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
      await request(app).delete(`/api/usuarios/${user.id_usuario}`);
      await request(app).delete(`/api/roles/${role.id_rol}`);
    }
  });

  test('DELETE /api/compras/:id deletes a purchase', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const purchase = await createCompra(provider.id_proveedor, user.id_usuario);
    const res = await request(app).delete(`/api/compras/${purchase.id_compra}`);
    expect(res.status).toBe(200);
    await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('GET /api/ventas returns list', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const sale = await createVenta(user.id_usuario);
    const res = await request(app).get('/api/ventas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/ventas/${sale.id_venta}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('POST /api/ventas creates a sale', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const sale = await createVenta(user.id_usuario);
    expect(sale).toHaveProperty('id_venta');
    await request(app).delete(`/api/ventas/${sale.id_venta}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('POST /api/ventas/transaccional creates a paid sale and updates inventory', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto, { stock_actual: 5, stock_minimo: 0, stock_maximo: 50 });

    let createdVentaId = null;

    try {
      const res = await request(app).post('/api/ventas/transaccional').send({
        usuario_id: user.id_usuario,
        numero_factura: makeUnique('venta_transaccional'),
        fecha_venta: '2026-09-14',
        estado: 'pagada',
        observaciones: 'venta transaccional prueba',
        forma_pago: 'efectivo',
        detalles: [
          {
            producto_id: product.id_producto,
            cantidad: 2,
            precio_unitario: 100.0,
          },
        ],
      });

      createdVentaId = res.body.venta.id_venta;

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id_venta');
      expect(res.body.venta).toHaveProperty('id_venta');
      expect(res.body.venta.total).toBe('200.00');

      const [inventoryRows] = await pool.query(
        'SELECT stock_actual FROM inventarios WHERE id_inventario = ?',
        [inventory.id_inventario]
      );

      expect(inventoryRows[0].stock_actual).toBe(3);

      const [movementRows] = await pool.query(
        'SELECT tipo_movimiento, cantidad, venta_id, inventario_id FROM movimientos_inventario WHERE venta_id = ?',
        [createdVentaId]
      );

      expect(movementRows).toHaveLength(1);
      expect(movementRows[0].tipo_movimiento).toBe('salida');
      expect(movementRows[0].cantidad).toBe(2);
    } finally {
      if (createdVentaId) {
        const [movementRows] = await pool.query(
          'SELECT id_movimiento FROM movimientos_inventario WHERE venta_id IS NOT NULL AND venta_id = ?',
          [createdVentaId]
        );

        for (const row of movementRows) {
          await pool.query('DELETE FROM movimientos_inventario WHERE id_movimiento = ?', [row.id_movimiento]);
        }

        await pool.query('DELETE FROM detalle_ventas WHERE venta_id = ?', [createdVentaId]);
        await pool.query('DELETE FROM ventas WHERE id_venta = ?', [createdVentaId]);
      }

      await pool.query('DELETE FROM inventarios WHERE id_inventario = ?', [inventory.id_inventario]);
      await pool.query('DELETE FROM productos WHERE id_producto = ?', [product.id_producto]);
      await pool.query('DELETE FROM categorias WHERE id_categoria = ?', [category.id_categoria]);
      await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [user.id_usuario]);
      await pool.query('DELETE FROM roles WHERE id_rol = ?', [role.id_rol]);
    }
  });

  test('POST /api/compras/transaccional ignores usuario_id from body and uses authenticated user', async () => {
    const role = await createRole();
    const overrideUser = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto, { stock_actual: 0, stock_minimo: 0, stock_maximo: 50 });

    let createdPurchaseId = null;

    try {
      const res = await supertest(app)
        .post('/api/compras/transaccional')
        .set('Authorization', `Bearer ${nonAdminToken}`)
        .send({
          proveedor_id: provider.id_proveedor,
          usuario_id: overrideUser.id_usuario,
          numero_factura: makeUnique('compra_usuario_override'),
          fecha_compra: '2026-09-14',
          fecha_recepcion: '2026-09-15',
          estado: 'recibida',
          observaciones: 'compra con usuario_id en body',
          detalles: [
            {
              producto_id: product.id_producto,
              cantidad: 1,
              costo_unitario: 25.0,
              observaciones: 'detalle compra override',
            },
          ],
        });

      createdPurchaseId = res.body.compra.id_compra;

      expect(res.status).toBe(201);
      expect(res.body.compra.usuario_id).toBe(nonAdminUser.id_usuario);
      expect(res.body.compra.usuario_id).not.toBe(overrideUser.id_usuario);

      const [inventoryRows] = await pool.query(
        'SELECT stock_actual FROM inventarios WHERE id_inventario = ?',
        [inventory.id_inventario]
      );

      expect(inventoryRows[0].stock_actual).toBe(1);
    } finally {
      if (createdPurchaseId) {
        const [movementRows] = await pool.query(
          'SELECT id_movimiento FROM movimientos_inventario WHERE compra_id IS NOT NULL AND compra_id = ?',
          [createdPurchaseId]
        );

        for (const row of movementRows) {
          await pool.query('DELETE FROM movimientos_inventario WHERE id_movimiento = ?', [row.id_movimiento]);
        }

        await pool.query('DELETE FROM detalle_compras WHERE compra_id = ?', [createdPurchaseId]);
        await pool.query('DELETE FROM compras WHERE id_compra = ?', [createdPurchaseId]);
      }

      await pool.query('DELETE FROM inventarios WHERE id_inventario = ?', [inventory.id_inventario]);
      await pool.query('DELETE FROM productos WHERE id_producto = ?', [product.id_producto]);
      await pool.query('DELETE FROM categorias WHERE id_categoria = ?', [category.id_categoria]);
      await pool.query('DELETE FROM proveedores WHERE id_proveedor = ?', [provider.id_proveedor]);
      await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [overrideUser.id_usuario]);
      await pool.query('DELETE FROM roles WHERE id_rol = ?', [role.id_rol]);
    }
  });

  test('POST /api/ventas/transaccional rejects sale without sufficient stock', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto, { stock_actual: 1, stock_minimo: 0, stock_maximo: 50 });

    try {
      const res = await request(app).post('/api/ventas/transaccional').send({
        usuario_id: user.id_usuario,
        numero_factura: makeUnique('venta_sin_stock'),
        fecha_venta: '2026-09-14',
        estado: 'pagada',
        observaciones: 'venta sin stock',
        forma_pago: 'efectivo',
        detalles: [
          {
            producto_id: product.id_producto,
            cantidad: 2,
            precio_unitario: 100.0,
          },
        ],
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/stock/i);

      const [inventoryRows] = await pool.query(
        'SELECT stock_actual FROM inventarios WHERE id_inventario = ?',
        [inventory.id_inventario]
      );

      expect(inventoryRows[0].stock_actual).toBe(1);
    } finally {
      await pool.query('DELETE FROM inventarios WHERE id_inventario = ?', [inventory.id_inventario]);
      await pool.query('DELETE FROM productos WHERE id_producto = ?', [product.id_producto]);
      await pool.query('DELETE FROM categorias WHERE id_categoria = ?', [category.id_categoria]);
      await pool.query('DELETE FROM usuarios WHERE id_usuario = ?', [user.id_usuario]);
      await pool.query('DELETE FROM roles WHERE id_rol = ?', [role.id_rol]);
    }
  });

  test('GET /api/ventas/:id returns a sale', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const sale = await createVenta(user.id_usuario);
    const res = await request(app).get(`/api/ventas/${sale.id_venta}`);
    expect(res.status).toBe(200);
    expect(res.body.id_venta).toBe(sale.id_venta);
    await request(app).delete(`/api/ventas/${sale.id_venta}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('PUT /api/ventas/:id updates a sale', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const sale = await createVenta(user.id_usuario);
    const res = await request(app)
      .put(`/api/ventas/${sale.id_venta}`)
      .send({ estado: 'pagada', observaciones: 'actualizado' });

    expect(res.status).toBe(200);
    await request(app).delete(`/api/ventas/${sale.id_venta}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('DELETE /api/ventas/:id deletes a sale', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const sale = await createVenta(user.id_usuario);
    const res = await request(app).delete(`/api/ventas/${sale.id_venta}`);
    expect(res.status).toBe(200);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('GET /api/detalle-compras returns list', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const purchase = await createCompra(provider.id_proveedor, user.id_usuario);
    const detail = await createDetalleCompra(purchase.id_compra, product.id_producto);
    const res = await request(app).get('/api/detalle-compras');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/detalle-compras/${detail.id_detalle_compra}`);
    await request(app).delete(`/api/compras/${purchase.id_compra}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
    await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('POST /api/detalle-compras creates a purchase detail', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const provider = await createProveedor();
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const purchase = await createCompra(provider.id_proveedor, user.id_usuario);
    const detail = await createDetalleCompra(purchase.id_compra, product.id_producto);
    expect(detail).toHaveProperty('id_detalle_compra');
    await request(app).delete(`/api/detalle-compras/${detail.id_detalle_compra}`);
    await request(app).delete(`/api/compras/${purchase.id_compra}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
    await request(app).delete(`/api/proveedores/${provider.id_proveedor}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('GET /api/detalle-ventas returns list', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const sale = await createVenta(user.id_usuario);
    const detail = await createDetalleVenta(sale.id_venta, product.id_producto);
    const res = await request(app).get('/api/detalle-ventas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/detalle-ventas/${detail.id_detalle_venta}`);
    await request(app).delete(`/api/ventas/${sale.id_venta}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('POST /api/detalle-ventas creates a sale detail', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const sale = await createVenta(user.id_usuario);
    const detail = await createDetalleVenta(sale.id_venta, product.id_producto);
    expect(detail).toHaveProperty('id_detalle_venta');
    await request(app).delete(`/api/detalle-ventas/${detail.id_detalle_venta}`);
    await request(app).delete(`/api/ventas/${sale.id_venta}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('GET /api/movimientos-inventario returns list', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto);
    const movement = await createMovimientoInventario(inventory.id_inventario, user.id_usuario);
    const res = await request(app).get('/api/movimientos-inventario');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/movimientos-inventario/${movement.id_movimiento}`);
    await request(app).delete(`/api/inventarios/${inventory.id_inventario}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('POST /api/movimientos-inventario creates an inventory movement', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const inventory = await createInventario(product.id_producto);
    const movement = await createMovimientoInventario(inventory.id_inventario, user.id_usuario);
    expect(movement).toHaveProperty('id_movimiento');
    await request(app).delete(`/api/movimientos-inventario/${movement.id_movimiento}`);
    await request(app).delete(`/api/inventarios/${inventory.id_inventario}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });

  test('GET /api/predicciones returns list', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const prediction = await createPrediccion(product.id_producto);
    const res = await request(app).get('/api/predicciones');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    await request(app).delete(`/api/predicciones/${prediction.id_prediccion}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('POST /api/predicciones creates a prediction', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const prediction = await createPrediccion(product.id_producto);
    expect(prediction).toHaveProperty('id_prediccion');
    await request(app).delete(`/api/predicciones/${prediction.id_prediccion}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('GET /api/predicciones/:id returns a prediction', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const prediction = await createPrediccion(product.id_producto);
    const res = await request(app).get(`/api/predicciones/${prediction.id_prediccion}`);
    expect(res.status).toBe(200);
    expect(res.body.id_prediccion).toBe(prediction.id_prediccion);
    await request(app).delete(`/api/predicciones/${prediction.id_prediccion}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('PUT /api/predicciones/:id updates a prediction', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const prediction = await createPrediccion(product.id_producto);
    const res = await request(app)
      .put(`/api/predicciones/${prediction.id_prediccion}`)
      .send({ estado: 'aprobada', observaciones: 'actualizado' });

    expect(res.status).toBe(200);
    await request(app).delete(`/api/predicciones/${prediction.id_prediccion}`);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('DELETE /api/predicciones/:id deletes a prediction', async () => {
    const category = await createCategoria();
    const product = await createProducto(category.id_categoria);
    const prediction = await createPrediccion(product.id_producto);
    const res = await request(app).delete(`/api/predicciones/${prediction.id_prediccion}`);
    expect(res.status).toBe(200);
    await request(app).delete(`/api/productos/${product.id_producto}`);
  });

  test('DELETE /api/roles/:id returns clear 409 when role is in use by users', async () => {
    const role = await createRole();
    const user = await createUsuario(role.id_rol);
    const res = await request(app).delete(`/api/roles/${role.id_rol}`);

    expect(res.status).toBe(409);
    await request(app).delete(`/api/usuarios/${user.id_usuario}`);
  });
});
