import Dashboard from "@/components/Dashboard";
import type { ProjectView } from "@/components/ProjectWorkspace";

const VIEWS:ProjectView[]=["executive","forecast","ledger","audit"];

export default async function ProjectViewPage({params}:{params:Promise<{projectId:string;view:string}>}){
  const {projectId,view}=await params;
  const projectView=VIEWS.includes(view as ProjectView)?view as ProjectView:"executive";
  return <Dashboard initialProjectId={projectId} initialProjectView={projectView}/>;
}
