const authService = require('../services/auth.service');

async function login(req, res) {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({
        message: 'Se requiere username o email y password',
      });
    }

    const result = await authService.login({ username, email, password });

    return res.status(200).json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      message: error.message || 'Error durante el login',
    });
  }
}

async function getMe(req, res) {
  return res.status(200).json(req.user);
}

module.exports = {
  login,
  getMe,
};
