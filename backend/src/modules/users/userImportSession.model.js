const mongoose=require("mongoose");
const schema=new mongoose.Schema({status:{type:String,enum:["PREVIEWED","IMPORTED"],default:"PREVIEWED"},sourceFileName:String,rows:{type:[mongoose.Schema.Types.Mixed],default:[]},summary:mongoose.Schema.Types.Mixed,createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},expiresAt:{type:Date,required:true},importedAt:Date},{timestamps:true});
schema.index({expiresAt:1},{expireAfterSeconds:0});
module.exports=mongoose.model("UserImportSession",schema);
