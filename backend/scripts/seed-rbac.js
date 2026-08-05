const { connectDatabase, disconnectDatabase } = require("../src/config/database");
const { seedRolePermissionEngine } = require("../src/modules/authorization/rolePermissionEngineSeed.service");
(async () => { try { await connectDatabase(); const summary = await seedRolePermissionEngine(); console.log("RBAC seed complete", JSON.stringify(summary, null, 2)); await disconnectDatabase(); process.exit(0); } catch (error) { console.error("RBAC seed failed", error); try { await disconnectDatabase(); } catch (_) {} process.exit(1); } })();
