import './globals.css';

export const metadata={
title:'Inhouse Request',
description:'Rankviz Internal Tool'
};

export default function RootLayout({children}:{children:React.ReactNode}){
return <html lang="en"><body>{children}</body></html>
}
