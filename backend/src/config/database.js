const mongoose = require("mongoose");
const environment = require("./environment");

const connectDatabase = async () => {
  const connection = await mongoose.connect(environment.mongodbUri);

  console.log(
    `MongoDB connected to ${connection.connection.host}/${connection.connection.name}`
  );
};

const disconnectDatabase = async () => {
  await mongoose.disconnect();
};

module.exports = { connectDatabase, disconnectDatabase };
