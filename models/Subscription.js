module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
    endpoint: { type: DataTypes.TEXT, unique: true },
    keys: DataTypes.JSON, // Menyimpan p256dh dan auth
  });
  return Subscription;
};