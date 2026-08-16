import {Button,Input,SearchBox,Select} from '../../../design-system'

const options=(label,values)=>[{value:'',label},...values.map(value=>({value,label:value.replaceAll('_',' ')}))]

export default function StudentFilters({filters,onChange}){
  const active=Object.entries(filters).filter(([key,value])=>!['page','limit','search'].includes(key)&&value!=='').length
  const clear=()=>onChange({search:'',course:'',branch:'',year:'',hostel:'',signupStatus:'',profileStatus:'',recordStatus:'',isLoginAllowed:''})
  return <section className="student-filters">
    <SearchBox value={filters.search} onChange={event=>onChange({search:event.target.value})} placeholder="Search name, email, contact or roll number"/>
    <Input label="Course" value={filters.course} onChange={event=>onChange({course:event.target.value})} placeholder="All courses"/>
    <Input label="Branch" value={filters.branch} onChange={event=>onChange({branch:event.target.value})} placeholder="All branches"/>
    <Select label="Year" value={filters.year} onChange={event=>onChange({year:event.target.value})} options={options('All years',['1','2','3','4','5'])}/>
    <Input label="Hostel" value={filters.hostel} onChange={event=>onChange({hostel:event.target.value})} placeholder="All hostels"/>
    <Select label="Signup" value={filters.signupStatus} onChange={event=>onChange({signupStatus:event.target.value})} options={options('All signup states',['NOT_STARTED','STARTED','COMPLETED'])}/>
    <Select label="Profile" value={filters.profileStatus} onChange={event=>onChange({profileStatus:event.target.value})} options={options('All profile states',['NOT_SUBMITTED','PENDING_VERIFICATION','APPROVED','CHANGES_REQUESTED','REJECTED'])}/>
    <Select label="Record" value={filters.recordStatus} onChange={event=>onChange({recordStatus:event.target.value})} options={options('All records',['ACTIVE','INACTIVE','ARCHIVED'])}/>
    <Select label="Login" value={filters.isLoginAllowed} onChange={event=>onChange({isLoginAllowed:event.target.value})} options={[{value:'',label:'All login states'},{value:'true',label:'Allowed'},{value:'false',label:'Disabled'}]}/>
    <Button variant="ghost" onClick={clear}>Clear {active?`(${active})`:''}</Button>
  </section>
}
