import './globals.css';
import Sidebar from '@/components/layout/sidebar';

export default function RootLayout({children}:{children:React.ReactNode}){
return <html lang="en"><body><Sidebar/>{children}</body></html>
}
