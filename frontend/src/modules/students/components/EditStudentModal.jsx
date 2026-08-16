import {useEffect,useState} from 'react'
import {Button,Modal} from '../../../design-system'
import {updateStudent} from '../services/studentMasterApi'
import {cleanPayload,friendlyStudentError} from '../utils/studentFormatters'
import {studentFields,validateStudent} from '../utils/studentValidation'
import StudentForm from './StudentForm'

export default function EditStudentModal({student,open,onClose,onSaved,notify}){
  const[data,setData]=useState(student||{}),[errors,setErrors]=useState({}),[saving,setSaving]=useState(false)
  useEffect(()=>setData(student||{}),[student])
  const save=async()=>{
    const next=validateStudent(data,false)
    setErrors(next)
    if(Object.keys(next).length)return
    setSaving(true)
    try{
      const allowed=Object.fromEntries(studentFields.filter(key=>key!=='email').map(key=>[key,data[key]]))
      allowed.permanentAddress=data.permanentAddress
      allowed.cgpa=allowed.cgpa===''?undefined:Number(allowed.cgpa)
      const saved=await updateStudent(student._id,cleanPayload(allowed))
      notify('Student record updated.','success')
      onSaved(saved)
      onClose()
    }catch(error){notify(friendlyStudentError(error),'error')}
    finally{setSaving(false)}
  }
  return <Modal open={open} onClose={onClose} size="lg" title="Edit Student" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Save Changes</Button></>}><StudentForm editing data={data} onChange={setData} errors={errors}/></Modal>
}
