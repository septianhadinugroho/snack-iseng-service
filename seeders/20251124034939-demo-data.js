const bcrypt = require('bcryptjs');

module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. Insert Products
    await queryInterface.bulkInsert('Products', [
      { name: 'Balado', price: 5000, createdAt: new Date(), updatedAt: new Date() },
      { name: 'BBQ', price: 5000, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Jagung Bakar', price: 5000, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Keju', price: 5000, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Original', price: 5000, createdAt: new Date(), updatedAt: new Date() },
      { name: 'Pedas Bon Cabe', price: 5000, createdAt: new Date(), updatedAt: new Date() }
    ], {});

    // 2. Insert Admin User (Password: admin123)
    const password = await bcrypt.hash('admin123', 10);
    const users = [
      { username: 'asep', password, role: 'admin', createdAt: new Date(), updatedAt: new Date() },
      { username: 'remu', password, role: 'admin', createdAt: new Date(), updatedAt: new Date() },
      { username: 'ucup', password, role: 'admin', createdAt: new Date(), updatedAt: new Date() },
      { username: 'hasbi', password, role: 'admin', createdAt: new Date(), updatedAt: new Date() }
    ];
    await queryInterface.bulkInsert('Users', users, {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Products', null, {});
    await queryInterface.bulkDelete('Users', null, {});
  }
};