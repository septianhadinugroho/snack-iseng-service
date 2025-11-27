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

    const demoPassword = await bcrypt.hash('demo123', 10);
    await queryInterface.bulkInsert('Users', [
      { 
        username: 'demo', 
        password: demoPassword, 
        role: 'admin', 
        createdAt: new Date(), 
        updatedAt: new Date() 
      }
    ], {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Products', null, {});
    await queryInterface.bulkDelete('Users', null, {});
  }
};