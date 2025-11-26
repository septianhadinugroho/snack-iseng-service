require('dotenv').config();
const pg = require('pg');

module.exports = {
  development: {
    // Ganti pengambilan manual dengan variable ini
    use_env_variable: 'DATABASE_URL', 
    dialect: "postgres",
    dialectModule: pg,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Neon membutuhkan SSL
      }
    }
  },
  test: {
    use_env_variable: 'DATABASE_URL',
    dialect: "postgres",
    dialectModule: pg,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  },
  production: {
    use_env_variable: "DATABASE_URL",
    dialect: "postgres",
    dialectModule: pg,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
};