import {useCallback,useEffect,useState} from 'react'
import {getStudent} from '../services/studentMasterApi'
import {listUsers} from '../services/userManagementApi'
export function useStudentDetails(id){const[student,setStudent]=useState(null),[user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');const load=useCallback(async()=>{setLoading(true);setError('');try{const item=await getStudent(id);setStudent(item);const result=await listUsers({email:item.email,accountType:'STUDENT',page:1,limit:2});setUser(result.items?.length===1?result.items[0]:null)}catch{setError('Unable to load student details. Please try again.')}finally{setLoading(false)}},[id]);useEffect(()=>{load()},[load]);return{student,user,loading,error,reload:load,setStudent}}
