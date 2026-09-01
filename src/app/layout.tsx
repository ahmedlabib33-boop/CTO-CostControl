import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CTO Cost Intelligence Command Center",
  description: "Adaptive SAP cost-control intelligence with project isolation and automatic workbook detection.",
};

const deploymentPersistenceBoot = `window.__CTO_PAGE_DEPLOYMENT_SHA__=${JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || "")};try{var d=JSON.parse(localStorage.getItem("cto-deployment-in-progress-v1")||"null");if(d&&d.sha)document.documentElement.classList.add("deployment-in-progress")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:deploymentPersistenceBoot}}/></head><body>{children}</body></html>;
}
