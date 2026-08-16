import apiClient from '../../../services/apiClient'
const unwrap=response=>response.data?.data??response.data
const filename=(headers,fallback)=>headers['content-disposition']?.match(/filename="?([^";]+)"?/i)?.[1]||fallback
const download=(response,fallback)=>{const url=URL.createObjectURL(response.data),link=document.createElement('a');link.href=url;link.download=filename(response.headers,fallback);document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
export const listStudents=params=>apiClient.get('/student-master',{params}).then(unwrap)
export const getStudent=id=>apiClient.get(`/student-master/${id}`).then(unwrap).then(x=>x.student)
export const createStudent=data=>apiClient.post('/student-master',data).then(unwrap)
export const updateStudent=(id,data)=>apiClient.patch(`/student-master/${id}`,data).then(unwrap).then(x=>x.student)
export const updateStudentLogin=(id,data)=>apiClient.patch(`/student-master/${id}/login-access`,data).then(unwrap).then(x=>x.student)
export const updateStudentStatus=(id,data)=>apiClient.patch(`/student-master/${id}/status`,data).then(unwrap).then(x=>x.student)
export const downloadStudentTemplate=()=>apiClient.get('/student-master/import/template',{responseType:'blob'}).then(r=>download(r,'TIET-Student-Master-Import-Template.xlsx'))
export const previewStudentImport=(file,academicSession)=>{const form=new FormData();form.append('file',file);if(academicSession)form.append('academicSession',academicSession);return apiClient.post('/student-master/import/preview',form).then(unwrap)}
export const getStudentImport=id=>apiClient.get(`/student-master/import/${id}`).then(unwrap)
export const confirmStudentImport=id=>apiClient.post(`/student-master/import/${id}/confirm`).then(unwrap)
export const exportStudents=params=>apiClient.get('/student-master/export',{params,responseType:'blob'}).then(r=>download(r,'TIET-Student-Master-Export.xlsx'))
