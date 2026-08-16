import {useState} from 'react'
import {TIET_LOGO_URL} from '../../config/brandAssets'
import './tiet-logo.css'
export default function TietLogo({size='medium',className=''}){const[failed,setFailed]=useState(false);const classes=`tiet-logo tiet-logo--${size} ${className}`.trim();return failed?<span className={`${classes} tiet-logo--fallback`} role="img" aria-label="Thapar Institute of Engineering and Technology">TIET</span>:<img className={classes} src={TIET_LOGO_URL} alt="Thapar Institute of Engineering and Technology logo" decoding="async" onError={()=>setFailed(true)}/>}
