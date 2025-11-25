module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Product', {
    name: DataTypes.STRING, // Balado, BBQ, etc
    price: { type: DataTypes.INTEGER, defaultValue: 5000 }
  });
};