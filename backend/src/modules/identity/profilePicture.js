const validUrl=value=>typeof value==="string"&&/^https?:\/\/\S+$/i.test(value.trim());
const resolveProfilePicture=(user,student)=>[user?.profilePhotoUrl,student?.profilePictureUrl,user?.profilePictureUrl].find(validUrl)||null;
module.exports={validUrl,resolveProfilePicture};
