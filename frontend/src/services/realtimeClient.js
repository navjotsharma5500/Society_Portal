import {io} from "socket.io-client";
import {apiBaseUrl} from "../config/environment";
import {REALTIME_EVENTS} from "./realtimeEvents";

let socket,authenticated=false;const seen=new Map(),listeners=new Map();
const origin=()=>{if(!apiBaseUrl)return window.location.origin;try{return new URL(apiBaseUrl,window.location.origin).origin;}catch{return window.location.origin;}};
const dispatch=(eventName,payload)=>{const key=`${eventName}:${payload?.sourceEvent||""}:${payload?.publicId||payload?.eventId||payload?.requestId||payload?.claimId||""}:${payload?.changedAt||""}`;if(seen.has(key))return;seen.set(key,Date.now());if(seen.size>250){const cutoff=Date.now()-120000;for(const[item,time]of seen)if(time<cutoff)seen.delete(item);}window.dispatchEvent(new CustomEvent(`realtime:${eventName}`,{detail:payload}));window.dispatchEvent(new CustomEvent("realtime:invalidate",{detail:{eventName,payload}}));for(const listener of listeners.get(eventName)||[])listener(payload);};
const connect=()=>{if(!authenticated||socket?.connected)return socket;if(!socket){socket=io(origin(),{withCredentials:true,autoConnect:false,reconnection:true,reconnectionAttempts:8,reconnectionDelay:1000,reconnectionDelayMax:10000,timeout:10000});Object.values(REALTIME_EVENTS).forEach((eventName)=>socket.on(eventName,(payload)=>dispatch(eventName,payload)));if(import.meta.env.DEV){socket.on("connect",()=>console.info("[realtime] connected"));socket.on("disconnect",()=>console.info("[realtime] disconnected"));socket.on("connect_error",(error)=>console.info(`[realtime] unavailable: ${error.message}`));}}socket.connect();return socket;};
const setAuthenticated=(value)=>{authenticated=Boolean(value);if(authenticated)connect();else if(socket){socket.disconnect();socket=null;seen.clear();}};
const subscribe=(eventName,listener)=>{const group=listeners.get(eventName)||new Set();group.add(listener);listeners.set(eventName,group);return()=>{group.delete(listener);if(!group.size)listeners.delete(eventName);};};
export const realtimeClient={connect,setAuthenticated,subscribe,isConnected:()=>Boolean(socket?.connected)};
