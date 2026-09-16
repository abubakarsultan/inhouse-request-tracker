import './globals.css';
import Sidebar from '@/components/sidebar';

export const metadata={title:'INHOUSE REQUEST | Rankviz',description:'Rankviz outreach operations system'};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body><Sidebar/><main className="min-h-screen bg-slate-50 p-6 lg:ml-64">{children}</main></body></html>
}
