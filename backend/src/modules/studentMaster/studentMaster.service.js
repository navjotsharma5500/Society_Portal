const mongoose = require("mongoose");
const AppError = require("../../common/errors/AppError");
const repo = require("./studentMaster.repository");
const userRepo = require("../users/user.repository");
const { ACCOUNT_TYPES, USER_STATUSES } = require("../users/user.constants");
const { RECORD_STATUSES } = require("./studentMaster.constants");
const sessionService = require("../auth/session.service");
const domainEvents = require("../../common/events/domainEvent.service");
const User = require("../users/user.model");
const { resolveProfilePicture } = require("../identity/profilePicture");
const valid = (id) =>
  mongoose.Types.ObjectId.isValid(id) && /^[a-f\d]{24}$/i.test(String(id));
const supports = () => {
  const t = mongoose.connection.client?.topology?.description?.type || "";
  return t.startsWith("ReplicaSet") || t === "Sharded";
};
const atomic = async (fn) => {
  if (!supports()) return fn(null);
  const s = await mongoose.startSession();
  try {
    let r;
    await s.withTransaction(async () => {
      r = await fn(s);
    });
    return r;
  } finally {
    await s.endSession();
  }
};
const duplicate = async (data) => {
  const resolution = (await require("../identity/identityResolution.service").batchResolve([data]))[0];
  if (resolution.classification !== "VALID") { const error = new AppError("The user already exists in the portal.", 409, resolution.classification === "IDENTITY_CONFLICT" ? "IDENTITY_CONFLICT" : "USER_ALREADY_EXISTS"); error.reference = resolution.existing; throw error; }
  if (await repo.findByEmail(data.email))
    throw new AppError(
      "Student email already exists",
      409,
      "STUDENT_EMAIL_EXISTS"
    );
  if (data.rollNumber && (await repo.findByRollNumber(data.rollNumber)))
    throw new AppError(
      "Student roll number already exists",
      409,
      "STUDENT_ROLL_NUMBER_EXISTS"
    );
  if (await userRepo.findByEmail(data.email))
    throw new AppError("User email already exists", 409, "USER_EMAIL_EXISTS");
};
const createStudent = async (data, options = {}) => {
  const normalization = require("../identity/identityNormalization");
  data = { ...data, email: normalization.normalizeEmail(data.email), rollNumber: normalization.normalizeRollNumber(data.rollNumber) || undefined, contactNumber: String(data.contactNumber || "").trim(), normalizedContact: normalization.normalizeContact(data.contactNumber) || undefined };
  if (!options.prevalidated) await duplicate(data);
  try {
    return await atomic(async (session) => {
      const student = await repo.create(data, session);
      let user;
      try {
        user = await userRepo.create(
          {
            email: student.email,
            displayName: student.name,
            accountType: ACCOUNT_TYPES.STUDENT,
            status: USER_STATUSES.PENDING_ONBOARDING,
            studentMasterId: student._id,
            isLoginAllowed: student.isLoginAllowed,
            createdBy: data.createdBy,
          },
          session
        );
      } catch (e) {
        if (!session)
          await repo.updateById(student._id, {
            recordStatus: RECORD_STATUSES.INACTIVE,
            isLoginAllowed: false,
            "metadata.userCreationFailed": true,
          });
        throw e;
      }
      return { student, user };
    });
  } catch (e) {
    if (e?.code === 11000) {
      if (e.keyPattern?.rollNumber)
        throw new AppError(
          "Student roll number already exists",
          409,
          "STUDENT_ROLL_NUMBER_EXISTS"
        );
      throw new AppError("The user already exists in the portal.", 409, "USER_ALREADY_EXISTS");
    }
    throw e;
  }
};
const getStudent = async (id) => {
  if (!valid(id))
    throw new AppError("Invalid student ID", 400, "INVALID_STUDENT_ID");
  const s = await repo.findById(id);
  if (!s) throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
  return s;
};
const listStudents = async (f) => {
  const q = {};
  if (f.search) {
    const x = new RegExp(f.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    q.$or = [
      { name: x },
      { email: x },
      { contactNumber: x },
      { rollNumber: x },
    ];
  }
  for (const k of [
    "course",
    "branch",
    "year",
    "hostel",
    "signupStatus",
    "profileStatus",
    "recordStatus",
  ])
    if (f[k]) q[k] = f[k];
  if (typeof f.isLoginAllowed === "boolean")
    q.isLoginAllowed = f.isLoginAllowed;
  const { items, totalItems } = await repo.findAll(q, f.page, f.limit);
  const linkedUsers=await User.find({studentMasterId:{$in:items.map(item=>item._id)}}).select("studentMasterId profilePictureUrl profilePhotoUrl").lean(),byStudent=new Map(linkedUsers.map(user=>[String(user.studentMasterId),user]));
  const projected=items.map(item=>{const value=item.toObject?item.toObject():item,user=byStudent.get(String(value._id));return{...value,profilePictureUrl:resolveProfilePicture(user,value)};});
  return {
    items: projected,
    pagination: {
      page: f.page,
      limit: f.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / f.limit),
    },
  };
};
const listAllStudents = async (filters) => {
  const items = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await listStudents({ ...filters, page, limit: 100 });
    items.push(...result.items);
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);
  return items;
};
const updateStudent = async (id, data) => {
  const old = await getStudent(id);
  if (data.email && data.email !== old.email)
    throw new AppError(
      "Student email cannot be changed",
      400,
      "VALIDATION_ERROR"
    );
  if (
    data.rollNumber &&
    data.rollNumber !== old.rollNumber &&
    (await repo.findByRollNumber(data.rollNumber))
  )
    throw new AppError(
      "Student roll number already exists",
      409,
      "STUDENT_ROLL_NUMBER_EXISTS"
    );
  const student = await repo.updateById(id, data);
  if (data.profileStatus === "APPROVED" && old.profileStatus !== "APPROVED") {
    const user = await userRepo.findByStudentId(id);
    domainEvents.publish("PROFILE_APPROVED_LOGIN_AVAILABLE", { userId: user?._id, studentMasterId: id });
  }
  return student;
};
const updateLoginAccess = async (id, data) => {
  let linkedUser;
  const student = await atomic(async (session) => {
    const s = await getStudent(id);
    const student = await repo.updateById(
      s._id,
      {
        isLoginAllowed: data.isLoginAllowed,
        "metadata.loginAccessReason": data.reason,
      },
      session
    );
    linkedUser = await userRepo.findByStudentId(s._id);
    if (linkedUser)
      await userRepo.updateById(
        linkedUser._id,
        {
          isLoginAllowed: data.isLoginAllowed,
          "metadata.loginAccessReason": data.reason,
        },
        session
      );
    return student;
  });
  if (!data.isLoginAllowed && linkedUser) await sessionService.revokeAllForUser(linkedUser._id, "LOGIN_ACCESS_DISABLED");
  return student;
};
const updateRecordStatus = async (id, data) => {
  let linkedUser;
  const student = await atomic(async (session) => {
    const s = await getStudent(id);
    const disable = data.recordStatus !== RECORD_STATUSES.ACTIVE;
    const student = await repo.updateById(
      s._id,
      {
        recordStatus: data.recordStatus,
        "metadata.recordStatusReason": data.reason,
        ...(disable ? { isLoginAllowed: false } : {}),
      },
      session
    );
    linkedUser = await userRepo.findByStudentId(s._id);
    if (linkedUser && disable)
      await userRepo.updateById(
        linkedUser._id,
        {
          isLoginAllowed: false,
          status: USER_STATUSES.INACTIVE,
          "metadata.recordStatusReason": data.reason,
        },
        session
      );
    return student;
  });
  if (data.recordStatus !== RECORD_STATUSES.ACTIVE && linkedUser)
    await sessionService.revokeAllForUser(linkedUser._id, "STUDENT_RECORD_INACTIVE");
  return student;
};
module.exports = {
  createStudent,
  getStudent,
  listStudents,
  listAllStudents,
  updateStudent,
  updateLoginAccess,
  updateRecordStatus,
};
