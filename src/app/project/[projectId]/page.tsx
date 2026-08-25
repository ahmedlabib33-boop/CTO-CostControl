import Dashboard from "@/components/Dashboard";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <Dashboard initialProjectId={projectId} />;
}
