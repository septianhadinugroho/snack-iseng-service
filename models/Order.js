module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    customerName: DataTypes.STRING,
    date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
    paymentMethod: DataTypes.ENUM('QRIS', 'Cash'),
    paymentStatus: DataTypes.BOOLEAN,
    isReceived: { type: DataTypes.BOOLEAN, defaultValue: false },
    description: DataTypes.TEXT,
    totalItems: DataTypes.INTEGER,
    totalPrice: DataTypes.INTEGER,
  });

  Order.associate = (models) => {
    Order.hasMany(models.OrderItem, { as: 'items' });
    Order.belongsTo(models.User, { as: 'admin', foreignKey: 'UserId' }); 
  };
  return Order;
};