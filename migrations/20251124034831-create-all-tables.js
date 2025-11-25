'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Tabel Users
    await queryInterface.createTable('Users', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      username: { type: Sequelize.STRING, unique: true },
      password: { type: Sequelize.STRING },
      role: { type: Sequelize.STRING, defaultValue: 'admin' },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    // 2. Tabel Products
    await queryInterface.createTable('Products', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { type: Sequelize.STRING },
      price: { type: Sequelize.INTEGER, defaultValue: 5000 },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    // 3. Tabel Orders (Ada UserId/Admin)
    await queryInterface.createTable('Orders', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      customerName: { type: Sequelize.STRING },
      date: { type: Sequelize.DATEONLY, defaultValue: Sequelize.NOW },
      paymentMethod: { type: Sequelize.ENUM('QRIS', 'Cash') },
      paymentStatus: { type: Sequelize.BOOLEAN }, 
      isReceived: { type: Sequelize.BOOLEAN, defaultValue: false },
      description: { type: Sequelize.TEXT },
      totalItems: { type: Sequelize.INTEGER },
      totalPrice: { type: Sequelize.INTEGER },
      UserId: { // Relasi ke Admin
        type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    // 4. Tabel OrderItems
    await queryInterface.createTable('OrderItems', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      quantity: { type: Sequelize.INTEGER },
      productName: { type: Sequelize.STRING },
      subtotal: { type: Sequelize.INTEGER },
      OrderId: {
        type: Sequelize.INTEGER,
        references: { model: 'Orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      ProductId: {
        type: Sequelize.INTEGER,
        references: { model: 'Products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    // 5. Tabel Expenses (STRUKTUR BARU - PARENT)
    await queryInterface.createTable('Expenses', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      date: { type: Sequelize.DATEONLY },
      totalCost: { type: Sequelize.INTEGER },
      yieldEstimate: { type: Sequelize.INTEGER },
      description: { type: Sequelize.TEXT },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    // 6. Tabel ExpenseItems (STRUKTUR BARU - CHILD)
    await queryInterface.createTable('ExpenseItems', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { type: Sequelize.STRING },
      quantity: { type: Sequelize.STRING }, // String: "1 kg", "1 liter"
      price: { type: Sequelize.INTEGER },
      ExpenseId: {
        type: Sequelize.INTEGER,
        references: { model: 'Expenses', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });

    // 7. Tabel HistoryLogs
    await queryInterface.createTable('HistoryLogs', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      action: { type: Sequelize.STRING },
      type: { type: Sequelize.STRING },
      createdAt: { allowNull: false, type: Sequelize.DATE },
      updatedAt: { allowNull: false, type: Sequelize.DATE }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('HistoryLogs');
    await queryInterface.dropTable('ExpenseItems');
    await queryInterface.dropTable('Expenses');
    await queryInterface.dropTable('OrderItems');
    await queryInterface.dropTable('Orders');
    await queryInterface.dropTable('Products');
    await queryInterface.dropTable('Users');
  }
};