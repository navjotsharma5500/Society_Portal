const SocietyLeadership = require("./societyLeadership.model");
const { LEADERSHIP_STATUSES } = require("./societyLeadership.constants");

const create = (data) => SocietyLeadership.create(data);
const findById = (id) => SocietyLeadership.findById(id);

const findAll = async (filter, page, limit) => {
  const skip = (page - 1) * limit;
  const [items, totalItems] = await Promise.all([
    SocietyLeadership.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SocietyLeadership.countDocuments(filter),
  ]);
  return { items, totalItems };
};

const findActiveBySociety = (societyId, academicSession) => {
  const filter = {
    societyId,
    status: LEADERSHIP_STATUSES.ACTIVE,
    isOngoing: true,
    endDate: null,
  };
  if (academicSession) filter.academicSession = academicSession;
  return SocietyLeadership.find(filter).sort({ role: 1, name: 1 });
};

const findBySocietyAndRole = (societyId, role, academicSession) => {
  const filter = { societyId, role };
  if (academicSession) filter.academicSession = academicSession;
  return SocietyLeadership.find(filter).sort({ createdAt: -1 });
};

const findDuplicateAssignment = ({ societyId, role, email, academicSession, excludeId }) => {
  const filter = {
    societyId,
    role,
    email,
    academicSession,
    status: LEADERSHIP_STATUSES.ACTIVE,
    isOngoing: true,
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return SocietyLeadership.findOne(filter);
};

const updateById = (id, data) =>
  SocietyLeadership.findByIdAndUpdate(id, data, { new: true, runValidators: true });

const endAssignment = (id, endDate, reason) =>
  SocietyLeadership.findByIdAndUpdate(
    id,
    {
      $set: {
        endDate,
        isOngoing: false,
        status: LEADERSHIP_STATUSES.ENDED,
        "metadata.endReason": reason,
      },
    },
    { new: true, runValidators: true }
  );

const updateStatus = (id, status) =>
  SocietyLeadership.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });

module.exports = {
  create,
  findById,
  findAll,
  findActiveBySociety,
  findBySocietyAndRole,
  findDuplicateAssignment,
  updateById,
  endAssignment,
  updateStatus,
};
