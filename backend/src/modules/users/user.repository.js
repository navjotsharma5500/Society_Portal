const User=require("./user.model");
const create=async(data,session)=>(await User.create([data],session?{session}:{}))[0];const findById=id=>User.findById(id);const findByEmail=email=>User.findOne({email});const findByStudentId=id=>User.findOne({studentMasterId:id});
const findAll=async(filter,page,limit)=>{const skip=(page-1)*limit;const[items,totalItems]=await Promise.all([User.find(filter).select("-googleSubject").sort({createdAt:-1}).skip(skip).limit(limit),User.countDocuments(filter)]);return{items,totalItems}};
const updateById=(id,data,session)=>User.findByIdAndUpdate(id,{$set:data},{returnDocument:"after",runValidators:true,...(session?{session}:{})}).select("-googleSubject");
module.exports={create,findById,findByEmail,findByStudentId,findAll,updateById};
