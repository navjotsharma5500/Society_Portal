const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const AcademicSession = require("../src/modules/academicSessions/academicSession.model");

(async () => {
  try {
    await connectDatabase();
    const legacyClosed = await AcademicSession.countDocuments({ status: "CLOSED" });
    const currentResult = await AcademicSession.updateMany(
      { status: "CLOSED", isCurrent: true },
      { $set: { status: "ACTIVE" } }
    );
    const historicalResult = await AcademicSession.updateMany(
      { status: "CLOSED", isCurrent: { $ne: true } },
      { $set: { status: "DRAFT", isCurrent: false } }
    );
    console.log(JSON.stringify({
      legacyClosed,
      currentNormalized: currentResult.modifiedCount,
      historicalNormalized: historicalResult.modifiedCount,
      deleted: 0,
    }));
  } finally {
    await disconnectDatabase();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
