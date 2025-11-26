// models/Subscription.js
module.exports = (sequelize, DataTypes) => {
  const Subscription = sequelize.define('Subscription', {
    endpoint: { 
      type: DataTypes.TEXT, 
      unique: true 
    },
    keys: {
      type: DataTypes.JSON
    }
  });
  return Subscription;
};