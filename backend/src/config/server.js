require("dotenv").config();

const app = require("./app");
const connectDatabase = require("./config/database");

connectDatabase();

const PORT = process.env.PORT || 11000;

app.listen(PORT, () => {
  console.log("");
  console.log("=================================");
  console.log(" Society Portal Backend Running");
  console.log("=================================");
  console.log(`Port : ${PORT}`);
  console.log(`Environment : ${process.env.NODE_ENV}`);
  console.log("=================================");
});