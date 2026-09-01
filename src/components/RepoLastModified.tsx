"use client";

import { useEffect, useState } from "react";

export default function RepoLastModified(){
 const [modified,setModified]=useState<string|null>(null);
 useEffect(()=>{let active=true;fetch("/api/repo-last-modified",{cache:"no-store"}).then(response=>response.ok?response.json():null).then(payload=>{if(active&&typeof payload?.modified_at==="string")setModified(payload.modified_at)}).catch(()=>{});return()=>{active=false}},[]);
 if(!modified)return null;
 const date=new Date(modified);if(Number.isNaN(date.getTime()))return null;
 const time=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",hour:"2-digit",minute:"2-digit",hour12:false}).format(date);
 const day=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",day:"2-digit",month:"2-digit",year:"numeric"}).format(date);
 return <span className="repoModified" title="Timestamp of the deployed GitHub commit">Last modified from repo {time} | {day}</span>;
}
