const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const routing = require("../src/modules/verificationRouting/verificationRouting.service");

(async () => {
  try {
    await connectDatabase();
    const result = await routing.reconcilePendingClaims();
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
  } finally {
    await disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
