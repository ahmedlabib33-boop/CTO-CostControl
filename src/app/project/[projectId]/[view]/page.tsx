import Dashboard from "@/components/Dashboard";
import { normalizeProjectView } from "@/lib/projectViews";

export default async function ProjectViewPage({params}:{params:Promise<{projectId:string;view:string}>}){
  const {projectId,view}=await params;
  const projectView=normalizeProjectView(view);
  return <Dashboard initialProjectId={projectId} initialProjectView={projectView}/>;
}
