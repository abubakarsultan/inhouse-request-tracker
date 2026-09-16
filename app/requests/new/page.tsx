'use client';
import {useState} from 'react';
export default function NewRequest(){
 const [saved,setSaved]=useState(false);
 return <form className="max-w-xl space-y-4" onSubmit={e=>{e.preventDefault();setSaved(true)}}><h1 className="text-2xl font-bold">Create Request</h1>{['Project ID','Target URL','Anchor','Approved Site Domain','Placement Page','Shared With'].map(x=><input key={x} placeholder={x} className="w-full rounded border p-3" required={['Project ID','Target URL','Anchor','Approved Site Domain'].includes(x)}/>)}<button className="rounded bg-black px-5 py-3 text-white">Create</button>{saved&&<p>Request saved.</p>}</form>
}
