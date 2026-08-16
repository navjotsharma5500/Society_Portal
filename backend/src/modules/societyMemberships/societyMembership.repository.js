const Model=require("./societyMembership.model");
const create=d=>Model.create(d),findById=id=>Model.findById(id),findActive=(userId,societyId)=>Model.findOne({userId,societyId,status:"ACTIVE",isOngoing:true});
const list=async(q,page,limit)=>{const [items,totalItems]=await Promise.all([Model.find(q).select("-metadata").populate("studentMasterId","name email rollNumber profilePictureUrl").populate("userId","displayName email profilePictureUrl").populate("societyId","name code").populate("roleId","name code rank").sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),Model.countDocuments(q)]);return{items,totalItems}};
const count=q=>Model.countDocuments(q);
module.exports={create,findById,findActive,list,count};
