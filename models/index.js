'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
// Kita tetap load config buat development lokal
const config = require(__dirname + '/../config/database.js')[env];
const db = {};

// 1. Load Driver PG Manual (Wajib buat Vercel)
const pg = require('pg');

let sequelize;

// 2. LOGIKA BARU: Cek langsung DATABASE_URL
// Kalau ada DATABASE_URL (artinya di Vercel/Production), langsung pakai!
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectModule: pg, // Paksa pakai pg
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Supaya gak error SSL di Neon
      }
    }
  });
} 
// Kalau gak ada (artinya di Laptop/Lokal), pakai config biasa
else if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], {
    ...config,
    dialectModule: pg
  });
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, {
    ...config,
    dialectModule: pg
  });
}

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;