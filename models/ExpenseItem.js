module.exports = (sequelize, DataTypes) => {
  const ExpenseItem = sequelize.define('ExpenseItem', {
    name: DataTypes.STRING,
    quantity: DataTypes.STRING,
    price: DataTypes.INTEGER,
    ExpenseId: DataTypes.INTEGER // Foreign Key
  });

  ExpenseItem.associate = (models) => {
    // Relasi balik ke Parent
    ExpenseItem.belongsTo(models.Expense);
  };

  return ExpenseItem;
};