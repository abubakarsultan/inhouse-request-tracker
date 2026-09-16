import './globals.css';
import Sidebar from '@/components/sidebar';

export const metadata={
 title:'Inhouse Request',
 description:'Rankviz Internal Tool'
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body><Sidebar/>{children}</body></html>
}
