module.exports = (sequelize, DataTypes) => {
  return sequelize.define('HistoryLog', {
    action: DataTypes.STRING, // "Pesanan Baru: 50 Balado"
    type: DataTypes.STRING // "ORDER", "EXPENSE"
  });
};