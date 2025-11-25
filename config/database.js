require('dotenv').config();
const pg = require('pg'); // <--- TAMBAHAN 1: Load driver pg manual

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    dialect: "postgres",
    port: process.env.DB_PORT,
    dialectModule: pg // <--- Paksa dev pake pg
  },
  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    dialect: "postgres",
    dialectModule: pg // <--- Paksa test pake pg
  },
  production: {
    use_env_variable: "DATABASE_URL",
    dialect: "postgres",
    dialectModule: pg, // <--- TAMBAHAN 2: INI WAJIB BUAT VERCEL
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
};