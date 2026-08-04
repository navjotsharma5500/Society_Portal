import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import AppButton from '../../../components/common/AppButton'
import AppInput from '../../../components/common/AppInput'
import { useToast } from '../../../components/common/toastContext'
import { createSociety, updateSociety } from '../../../services/societyApi'

const empty={name:'',code:'',shortName:'',category:'',email:'',description:'',academicSession:''}

export default function AddSocietyModal({open,onClose,onSaved,society}){
  const[form,setForm]=useState(empty)
  const[saving,setSaving]=useState(false)
  const{notify}=useToast()
  useEffect(()=>setForm(society?Object.fromEntries(Object.keys(empty).map(k=>[k,society[k]||''])):empty),[society,open])
  if(!open)return null
  const set=(e)=>setForm({...form,[e.target.name]:e.target.value})
  const submit=async(e)=>{
    e.preventDefault();setSaving(true)
    try{
      const saved=society?await updateSociety(society._id,form):await createSociety(form)
      notify(society?'Society updated successfully':`Society created successfully. Code: ${saved.code}`,'success')
      onSaved();onClose()
    }catch(err){notify(err.readableMessage,'error')}finally{setSaving(false)}
  }
  return <div className="modal-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><motion.div className="modal" role="dialog" aria-modal="true" aria-labelledby="society-modal-title" initial={{y:60,opacity:0}} animate={{y:0,opacity:1}}><div className="modal-header"><h2 id="society-modal-title">{society?'Edit':'Add'} Society</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X/></button></div><form className="form-grid" onSubmit={submit}><AppInput required id="name" name="name" label="Society Name" value={form.name} onChange={set}/><AppInput id="shortName" name="shortName" label="Short Name" value={form.shortName} onChange={set}/><AppInput required id="category" name="category" label="Category" value={form.category} onChange={set}/><AppInput type="email" id="email" name="email" label="Official Email" value={form.email} onChange={set}/><AppInput id="academicSession" name="academicSession" label="Academic Session" placeholder="2026-27" value={form.academicSession} onChange={set}/><details className="field-wide optional-code" open={Boolean(society)}><summary>Custom Society Code (Optional)</summary><AppInput id="code" name="code" label="Custom Society Code" value={form.code} onChange={set}/><p className="helper-text">Leave blank to generate automatically.</p></details><div className="field field-wide"><label htmlFor="description">Description</label><textarea className="textarea" id="description" name="description" value={form.description} onChange={set}/></div><div className="card-actions field-wide"><AppButton type="submit" disabled={saving}>{saving?'Saving…':'Save Society'}</AppButton><AppButton type="button" variant="ghost" onClick={onClose}>Cancel</AppButton></div></form></motion.div></div>
}
