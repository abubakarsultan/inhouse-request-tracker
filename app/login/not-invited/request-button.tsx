'use client';
import { useState } from 'react';
import { requestInvitation } from './actions';
export default function RequestButton(){const [busy,setBusy]=useState(false),[message,setMessage]=useState('');return <div><button type="button" disabled={busy} onClick={async()=>{setBusy(true);const result=await requestInvitation();setMessage(result.message);setBusy(false);}} className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Sending…':'Request invitation'}</button>{message&&<p role="status" className="mt-3 text-sm text-[var(--muted)]">{message}</p>}</div>}
