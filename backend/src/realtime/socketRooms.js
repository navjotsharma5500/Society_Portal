const Assignment = require("../modules/userRoleAssignments/userRoleAssignment.model");
const Membership = require("../modules/societyMemberships/societyMembership.model");

const userRoom = (id) => `user:${id}`;
const societyRoom = (id) => `society:${id}`;
const roleRoom = (code, societyId) => societyId ? `role:${code}:society:${societyId}` : `role:${code}`;
const eventRoom = (id) => `event:${id}`;

const resolveAuthorizedRooms = async (userId) => {
  const now = new Date(), activeWindow = { status: "ACTIVE", isOngoing: true, $and: [{$or:[{validFrom:null},{validFrom:{$exists:false}},{validFrom:{$lte:now}}]},{$or:[{validUntil:null},{validUntil:{$exists:false}},{validUntil:{$gt:now}}]}] };
  const [assignments,memberships]=await Promise.all([
    Assignment.find({userId,...activeWindow}).select("scopeType societyId roleId").populate("roleId","code status").lean(),
    Membership.find({userId,status:"ACTIVE",isOngoing:true,$or:[{endDate:null},{endDate:{$exists:false}},{endDate:{$gt:now}}]}).select("societyId").lean(),
  ]);
  const rooms=new Set([userRoom(userId)]),memberSocieties=new Set(memberships.map((item)=>String(item.societyId)));
  for(const societyId of memberSocieties)rooms.add(societyRoom(societyId));
  for(const assignment of assignments){if(assignment.roleId?.status!=="ACTIVE")continue;const societyId=assignment.societyId?String(assignment.societyId):null;if(assignment.scopeType==="SOCIETY"&&!memberSocieties.has(societyId))continue;if(societyId)rooms.add(societyRoom(societyId));rooms.add(roleRoom(assignment.roleId.code,societyId));}
  return rooms;
};

const reconcileSocketRooms = async (socket) => {
  const authorized=await resolveAuthorizedRooms(socket.data.userId);
  for(const room of socket.rooms)if(room!==socket.id&&!authorized.has(room))await socket.leave(room);
  for(const room of authorized)if(!socket.rooms.has(room))await socket.join(room);
  socket.data.authorizedRooms=[...authorized];return authorized;
};
module.exports={userRoom,societyRoom,roleRoom,eventRoom,resolveAuthorizedRooms,reconcileSocketRooms};
