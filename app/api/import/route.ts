import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const required=['Website','Opportunity','Anchor','DR','Traffic','Status','Note'];
export async function POST(req:Request){
 const body=await req.formData();
 const file=body.get('file') as File;
 if(!file) return NextResponse.json({error:'File required'},{status:400});
 const buffer=Buffer.from(await file.arrayBuffer());
 const workbook=XLSX.read(buffer);
 const rows=XLSX.utils.sheet_to_json<any>(workbook.Sheets[workbook.SheetNames[0]]);
 const missing=required.filter(k=>!(k in (rows[0]||{})));
 if(missing.length) return NextResponse.json({error:`Missing columns: ${missing.join(', ')}`},{status:400});
 return NextResponse.json({rows:rows.length});
}
