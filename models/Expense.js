module.exports = (sequelize, DataTypes) => {
  const Expense = sequelize.define('Expense', {
    date: DataTypes.DATEONLY,
    totalCost: DataTypes.INTEGER,
    yieldEstimate: DataTypes.INTEGER,
    description: DataTypes.TEXT
  });

  Expense.associate = (models) => {
    // Relasi: 1 Belanja punya Banyak Item
    // 'as: items' ini PENTING, harus sama dengan yang dipanggil di index.js
    Expense.hasMany(models.ExpenseItem, { as: 'items', onDelete: 'CASCADE' });
  };

  return Expense;
};