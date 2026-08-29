import { NextResponse } from "next/server";

export const dynamic="force-dynamic";
export const revalidate=0;

function result(modifiedAt:string|null,sha:string|null,error?:string){
 return NextResponse.json({modified_at:modifiedAt,sha,...(error?{error}:{})},{headers:{"Cache-Control":"private, no-store, max-age=0"}});
}

export async function GET(){
 const owner=process.env.VERCEL_GIT_REPO_OWNER||"ahmedlabib33-boop";
 const repo=process.env.VERCEL_GIT_REPO_SLUG||"CTO-CostControl";
 const ref=process.env.VERCEL_GIT_COMMIT_SHA||process.env.VERCEL_GIT_COMMIT_REF||"main";
 const token=process.env.GITHUB_STATUS_TOKEN?.trim();
 const headers:Record<string,string>={Accept:"application/vnd.github+json","User-Agent":"CTO-CostControl-repo-time","X-GitHub-Api-Version":"2022-11-28"};
 if(token)headers.Authorization=`Bearer ${token}`;
 try{
  const response=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}`,{headers,cache:"no-store"});
  if(!response.ok)return result(null,null,`github_commit_${response.status}`);
  const payload=await response.json() as {sha?:unknown;commit?:{committer?:{date?:unknown};author?:{date?:unknown}}};
  const value=payload.commit?.committer?.date??payload.commit?.author?.date;
  return result(typeof value==="string"?value:null,typeof payload.sha==="string"?payload.sha:null);
 }catch{return result(null,null,"github_commit_unavailable")}
}
