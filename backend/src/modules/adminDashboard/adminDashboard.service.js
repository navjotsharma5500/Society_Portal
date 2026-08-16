const Society = require("../societies/society.model");
const Leadership = require("../societyLeadership/societyLeadership.model");
const performance = require("../../common/performance/performance");

const summary = async (req) => {
  const startedAt = performance.now(), societyStartedAt = performance.now();
  const societyPromise = Society.aggregate([
    { $facet: {
      totals: [{ $group: { _id: "$isActive", count: { $sum: 1 } } }],
      recent: [{ $sort: { createdAt: -1 } }, { $limit: 5 }, { $project: { name: 1, code: 1, shortName: 1, category: 1, status: 1, isActive: 1, logoUrl: 1, createdAt: 1 } }],
    } },
  ]).then(([result]) => { performance.mark(req, "societyAggregateMs", societyStartedAt); return result || { totals: [], recent: [] }; });
  const leadershipStartedAt = performance.now();
  const leadershipPromise = Leadership.countDocuments({}).then((count) => { performance.mark(req, "leadershipCountMs", leadershipStartedAt); return count; });
  const [society, leadershipCount] = await Promise.all([societyPromise, leadershipPromise]);
  const counts = new Map(society.totals.map((row) => [String(row._id), row.count])), active = counts.get("true") || 0, inactive = counts.get("false") || 0;
  performance.mark(req, "serviceMs", startedAt);
  return { societyCount: active + inactive, activeSocietyCount: active, inactiveSocietyCount: inactive, leadershipCount, recentSocieties: society.recent };
};
module.exports = { summary };
