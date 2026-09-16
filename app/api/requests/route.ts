import { NextResponse } from 'next/server';
import { requestSchema } from '@/lib/validators';
export async function POST(req:Request){
 const body=await req.json();
 const parsed=requestSchema.safeParse(body);
 if(!parsed.success) return NextResponse.json({error:parsed.error.flatten()},{status:400});
 return NextResponse.json({success:true,data:parsed.data});
}
